import type { ScheduledEvent } from '../audio/engine';

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0,1); }`;

// Feedback pass: sample previous frame warped/rotated/zoomed, add fresh energy from
// FFT bands + recent note events, run through a kaleidoscope fold.
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D prev;
uniform float t, bass, mid, high, beat;
uniform vec2 res;
uniform vec4 ev[8]; // x,y = position, z = age(0..1), w = hue
#define PI 3.14159265
vec3 hsv(float h,float s,float v){ vec3 c=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.); return v*mix(vec3(1),c,s);}
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  // kaleidoscope fold
  float seg = 6.0;
  float a = atan(c.y,c.x); float r = length(c);
  a = mod(a, 2.*PI/seg); a = abs(a - PI/seg);
  vec2 k = vec2(cos(a),sin(a))*r;
  // feedback sample: zoom + rotate + wobble
  float zoom = 0.985 - bass*0.03;
  float rot = 0.004 + mid*0.02 + beat*0.02;
  mat2 R = mat2(cos(rot),-sin(rot),sin(rot),cos(rot));
  vec2 fc = R*(c*zoom) + 0.006*vec2(sin(t*0.7+c.y*6.), cos(t*0.9+c.x*6.))*(0.5+high);
  vec3 p = texture(prev, fc/asp+0.5).rgb;
  p *= 0.93 - 0.02*length(p); // decay, harder on bright areas so it never blows out
  p = mix(p, p.brg, 0.015); // slow hue drift
  // fresh energy from events
  vec3 add = vec3(0);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = k - (ev[i].xy-0.5)*asp;
    float ring = abs(length(d) - ev[i].z*0.9);
    float g = exp(-ring*ring*600.0) * (1.0-ev[i].z) * 1.4;
    float dot = exp(-dot(d,d)*120.0)*(1.0-ev[i].z)*0.6;
    add += hsv(ev[i].w, 0.85, 1.0) * (g+dot);
  }
  // FFT-driven ambient glow in the centre
  float glow = exp(-r*r*14.0) * max(bass-0.35,0.0)*1.2;
  add += hsv(fract(t*0.03), 0.7, 1.0)*glow;
  // domain-warped noise strands on high band
  float s = sin(k.x*24.+t*2.)*sin(k.y*24.-t*1.3);
  add += hsv(fract(t*0.05+0.5),0.8,1.)*smoothstep(0.9,1.,s)*max(high-0.15,0.0)*0.8;
  o = vec4(p+add, 1.0);
}`;

const BLIT = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D tex;
void main(){ vec3 c = texture(tex,uv).rgb; c = c/(1.0+c); o = vec4(pow(c,vec3(0.9)),1.); }`;

interface Ev { x: number; y: number; t0: number; hue: number }

export class Viz {
  gl: WebGL2RenderingContext;
  private prog: WebGLProgram; private blit: WebGLProgram;
  private fbo: [WebGLFramebuffer, WebGLFramebuffer]; private tex: [WebGLTexture, WebGLTexture];
  private cur = 0; private w = 0; private h = 0;
  private events: Ev[] = [];
  private fft: Uint8Array<ArrayBuffer>;
  frames = 0;
  private float: boolean;
  bands = { bass: 0, mid: 0, high: 0 };
  private beat = 0;

  constructor(public canvas: HTMLCanvasElement, private analyser: AnalyserNode) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    this.prog = link(gl, VS, FS); this.blit = link(gl, VS, BLIT);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    for (const p of [this.prog, this.blit]) { const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    this.tex = [gl.createTexture()!, gl.createTexture()!];
    this.fbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    this.fft = new Uint8Array(analyser.frequencyBinCount);
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 1.5);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (w === this.w && h === this.h) return;
    this.w = this.canvas.width = w; this.h = this.canvas.height = h;
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
      if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex[i], 0);
    }
  }

  /** Feed a sequencer event in: each track gets its own angle around the centre. */
  pulse(e: ScheduledEvent, trackCount: number, now: number) {
    const ang = (e.track / trackCount) * Math.PI * 2 + now * 0.2;
    const rad = 0.12 + ((e.midi % 24) / 24) * 0.25;
    this.events.push({ x: 0.5 + Math.cos(ang) * rad, y: 0.5 + Math.sin(ang) * rad, t0: now, hue: hueOf(e.color) });
    if (this.events.length > 8) this.events.shift();
    if (e.track === 0) this.beat = 1;
  }

  render(now: number) {
    this.resize();
    const gl = this.gl;
    this.analyser.getByteFrequencyData(this.fft);
    const avg = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += this.fft[i]; return s / (b - a) / 255; };
    this.bands = { bass: avg(1, 8), mid: avg(8, 60), high: avg(60, 300) };
    this.beat *= 0.9;

    const next = 1 - this.cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[next]);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    const u = (n: string) => gl.getUniformLocation(this.prog, n);
    gl.uniform1i(u('prev'), 0);
    gl.uniform1f(u('t'), now); gl.uniform2f(u('res'), this.w, this.h);
    gl.uniform1f(u('bass'), this.bands.bass); gl.uniform1f(u('mid'), this.bands.mid); gl.uniform1f(u('high'), this.bands.high);
    gl.uniform1f(u('beat'), this.beat);
    const evs = new Float32Array(32);
    this.events = this.events.filter((e) => now - e.t0 < 1.2);
    this.events.forEach((e, i) => { evs.set([e.x, e.y, (now - e.t0) / 1.2, e.hue], i * 4); });
    gl.uniform4fv(u('ev[0]'), evs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[next]);
    gl.uniform1i(gl.getUniformLocation(this.blit, 'tex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = next;
    this.frames++;
  }
}

function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h / 6;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader'); return o; };
  const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}
