import type { ScheduledEvent } from '../audio/engine';

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0,1); }`;

// Every preset is a feedback pass: sample the previous frame (warped/zoomed/etc), decay it,
// and add fresh energy from FFT bands + recent note events. They share this header.
const HEAD = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D prev;
uniform float t, bass, mid, high, beat;
uniform vec2 res;
uniform vec4 ev[8]; // x,y = position, z = age(0..1), w = hue
#define PI 3.14159265
vec3 hsv(float h,float s,float v){ vec3 c=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.); return v*mix(vec3(1),c,s);}
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;

// The original: kaleidoscope fold over a rotating, zooming feedback buffer.
const KALEIDO = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float seg = 6.0;
  float a = atan(c.y,c.x); float r = length(c);
  a = mod(a, 2.*PI/seg); a = abs(a - PI/seg);
  vec2 k = vec2(cos(a),sin(a))*r;
  float zoom = 0.985 - bass*0.03;
  float rot = 0.004 + mid*0.02 + beat*0.02;
  mat2 R = mat2(cos(rot),-sin(rot),sin(rot),cos(rot));
  vec2 fc = R*(c*zoom) + 0.006*vec2(sin(t*0.7+c.y*6.), cos(t*0.9+c.x*6.))*(0.5+high);
  vec3 p = texture(prev, fc/asp+0.5).rgb;
  p *= 0.93 - 0.02*length(p);
  p = mix(p, p.brg, 0.015);
  vec3 add = vec3(0);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = k - (ev[i].xy-0.5)*asp;
    float ring = abs(length(d) - ev[i].z*0.9);
    float g = exp(-ring*ring*600.0) * (1.0-ev[i].z) * 1.4;
    float dot = exp(-dot(d,d)*120.0)*(1.0-ev[i].z)*0.6;
    add += hsv(ev[i].w, 0.85, 1.0) * (g+dot);
  }
  float glow = exp(-r*r*14.0) * max(bass-0.35,0.0)*1.2;
  add += hsv(fract(t*0.03), 0.7, 1.0)*glow;
  float s = sin(k.x*24.+t*2.)*sin(k.y*24.-t*1.3);
  add += hsv(fract(t*0.05+0.5),0.8,1.)*smoothstep(0.9,1.,s)*max(high-0.15,0.0)*0.8;
  o = vec4(p+add, 1.0);
}`;

// Washed-out, melting metaballs that slowly forget themselves. Grainy, anxious, faintly analogue.
const AMOEBA = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec2 warp = 0.004*vec2(sin(t*0.5+uv.y*9.), cos(t*0.4+uv.x*7.))*(1.+mid*3.);
  vec2 fc = c*0.995 + warp + vec2(0., 0.0015);
  vec3 p = texture(prev, fc/asp+0.5).rgb * 0.955;
  p = mix(p, vec3(dot(p,vec3(.33))), 0.02);
  float field = 0.;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp;
    float rad = 0.05 + 0.15*ev[i].z;
    field += rad*rad/max(dot(d,d),1e-4)*(1.-ev[i].z);
  }
  float blob = smoothstep(0.9,1.3,field);
  float edge = smoothstep(0.7,0.9,field)-blob;
  vec3 col = mix(vec3(0.15,0.35,0.3), vec3(0.85,0.9,0.75), blob);
  vec3 add = col*blob*0.1 + vec3(1.0,0.5,0.2)*edge*0.25;
  float n = hash(floor(uv*res/2.)+floor(t*24.));
  add += (n-0.5)*0.04*(0.3+high);
  add += vec3(0.1,0.2,0.25)*exp(-dot(c,c)*3.)*bass*0.5;
  o = vec4(max(p+add,0.),1.);
}`;

// Rust and black. Everything spirals down and out; grids throb; sparks are jagged; static bites.
const TRAILS = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float rot = -0.02 - beat*0.05;
  mat2 R = mat2(cos(rot),-sin(rot),sin(rot),cos(rot));
  vec2 fc = R*c*1.01 + vec2(0., -0.004);
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.9;
  p = pow(p, vec3(1.05));
  vec3 add = vec3(0);
  vec2 g = abs(fract(c*8.+t*0.3)-0.5);
  float line = smoothstep(0.47,0.5,max(g.x,g.y));
  add += vec3(0.6,0.15,0.05)*line*(0.2+bass*1.5);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp;
    float a = atan(d.y,d.x);
    float spike = pow(abs(sin(a*7.+ev[i].w*20.)),12.);
    float m = exp(-length(d)*12./(0.2+spike))*(1.-ev[i].z);
    add += vec3(1.,0.35,0.1)*m*1.5;
  }
  float n = hash(vec2(floor(uv.y*res.y/3.), floor(t*60.)));
  add += vec3(n)*step(0.96,n)*high*0.8;
  add -= vec3(0.02)*dot(c,c);
  o = vec4(max(p+add,0.),1.);
}`;

// Sweaty 1988 warehouse: checkerboard floor rushing past, acid squiggle, rainbow rings, strobe on the kick.
const HAUS = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec2 fc = c*1.02;
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.8;
  p = mix(p, p.gbr, 0.03);
  vec3 add = vec3(0);
  if(c.y < -0.05){
    float z = 0.15/(-c.y);
    vec2 f = vec2(c.x*z, z + t*2.0);
    float chk = mod(floor(f.x*2.)+floor(f.y*2.),2.);
    add += mix(vec3(0.9,0.1,0.6),vec3(0.1,0.9,0.9),chk)*0.1*exp(-z*0.15)*(0.5+bass);
  }
  float sq = abs(c.y - 0.15*sin(c.x*12.+t*6.)*(0.3+mid*2.));
  add += hsv(fract(t*0.3),1.,1.)*exp(-sq*sq*2000.)*0.3;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp;
    float ring = abs(length(d) - ev[i].z*0.5);
    add += hsv(ev[i].w+ev[i].z,0.9,1.)*exp(-ring*ring*3000.)*(1.-ev[i].z)*1.5;
  }
  add += vec3(beat*0.06);
  o = vec4(p+add,1.);
}`;

// Red, white and black. A triangular tunnel of bands marching outward, one bold ring per hit.
const ARMY = HEAD + `
float triDist(vec2 c, float ang){
  float d = -1e9;
  for(int i=0;i<3;i++){ float a = ang + float(i)*2.*PI/3.; d = max(d, dot(c, vec2(cos(a),sin(a)))); }
  return d;
}
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float zoom = 0.975 - bass*0.02;
  float rot = 0.002 + beat*0.01;
  mat2 R = mat2(cos(rot),-sin(rot),sin(rot),cos(rot));
  vec2 fc = R*c*zoom;
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.84;
  vec3 red = vec3(0.85,0.05,0.05), white = vec3(0.95,0.92,0.88);
  float ang = PI/2. + t*0.05;
  float d = triDist(c, ang);
  float band = fract(log(d+0.02)*2.5 - t*0.6);
  float bandCol = step(0.5, band);
  vec3 add = mix(red, white, bandCol) * 0.006 * (0.3+bass);
  float edge = smoothstep(0.02,0.0,abs(band-0.5)) + smoothstep(0.02,0.0,min(band,1.-band));
  add += mix(white, red, bandCol) * edge * (0.05 + bass*0.3);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    float ring = abs(d - ev[i].z*0.6);
    vec3 col = mod(float(i),2.)<1. ? red : white;
    add += col * exp(-ring*ring*4000.) * (1.-ev[i].z) * 1.6;
  }
  add += white * exp(-d*d*200.) * beat * 0.4;
  o = vec4(p+add,1.);
}`;

// Sun-bleached desert haze: sepia horizon breathing with the bass, wind-blown grit, heat shimmer on each hit.
const DUSK = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec2 shimmer = 0.003*vec2(sin(uv.y*40.+t*3.), 0.)*(0.5+mid);
  vec2 fc = c + shimmer + vec2(0.0025 + high*0.004, 0.);
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.92;
  p = mix(p, vec3(dot(p,vec3(0.3,0.5,0.2)))*vec3(1.1,0.9,0.7), 0.05);
  vec3 sand = vec3(0.85,0.6,0.35), sky = vec3(0.35,0.2,0.25), sun = vec3(1.0,0.8,0.5);
  float horizon = -0.15;
  float sunG = exp(-pow((c.y-horizon)*4.,2.)) * exp(-c.x*c.x*1.5);
  vec3 add = sun * sunG * (0.03 + bass*0.08);
  add += mix(sand, sky, smoothstep(horizon-0.1, horizon+0.4, c.y)) * 0.006;
  float g = hash(floor(vec2(uv.x*res.x/3. - t*90., uv.y*res.y/3.)) + floor(t*20.));
  add += sand * step(0.985 - high*0.02, g) * 0.35;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp; d.y *= 4.;
    float ring = abs(length(d) - ev[i].z*0.7);
    add += mix(sand, sun, ev[i].w) * exp(-ring*ring*900.) * (1.-ev[i].z) * 0.5;
  }
  o = vec4(p+add,1.);
}`;

// Freefall: the sky rushes upward, clouds streak past, canopies bloom on each hit and drift down.
const PARACHUTE = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec2 fc = c*0.995 + vec2(0.002*sin(t*0.8+c.y*3.), 0.012 + bass*0.01);
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.93;
  vec3 skyTop = vec3(0.1,0.25,0.6), skyBot = vec3(0.5,0.7,0.9);
  vec3 add = mix(skyBot, skyTop, uv.y) * 0.03;
  float cl = 0.;
  for(float k=1.; k<4.; k++){ vec2 q = vec2(uv.x*res.x/res.y*k, uv.y*k + t*0.4*k); cl += (hash(floor(q*6.))-0.5)/k; }
  add += vec3(0.9,0.95,1.) * smoothstep(0.15,0.4,cl) * 0.02;
  float streak = hash(vec2(floor(uv.x*res.x/2.), floor(t*30.)));
  add += vec3(1.) * step(0.995 - high*0.01, streak) * 0.5;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp; e.y += 0.15 - ev[i].z*0.4;
    vec2 d = c - e;
    float rad = 0.06 + 0.06*ev[i].z;
    float canopy = step(0., d.y) * smoothstep(rad, rad-0.01, length(d)) ;
    float rib = 0.5+0.5*sin(atan(d.y,d.x)*14.);
    float lines = step(abs(d.x*0.5 + (d.y+rad)*0.), 0.002) * step(-rad*2.5, d.y) * step(d.y, 0.);
    add += hsv(ev[i].w, 0.7, 1.0) * (canopy*(0.6+0.4*rib) + lines*0.4) * (1.-ev[i].z*ev[i].z) * 0.5;
  }
  o = vec4(p+add,1.);
}`;

// Starfield warp with a chunky neon LED spectrum across the middle. Gold, blue, magenta.
const STELLA = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float zoom = 0.97 - bass*0.02;
  vec2 fc = c*zoom;
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.8;
  vec3 gold = vec3(1.0,0.75,0.2), blue = vec3(0.2,0.5,1.0), mag = vec3(1.0,0.2,0.7);
  vec3 add = vec3(0);
  vec2 sq = floor(c*60. + 0.5);
  float star = step(0.995, hash(sq + floor(t*0.1)));
  add += mix(gold, blue, hash(sq)) * star * 0.6;
  float cell = 20.;
  float col = floor(uv.x*cell);
  float band = col/cell;
  float level = band < 0.33 ? bass : band < 0.66 ? mid : high;
  level = level*1.4 + 0.15*sin(col*1.7 + t*3.);
  float row = floor((uv.y-0.35)*30.);
  float lit = step(row, level*9.) * step(0., row);
  vec2 g = fract(vec2(uv.x*cell, (uv.y-0.35)*30.));
  float pad = step(0.15,g.x)*step(g.x,0.85)*step(0.15,g.y)*step(g.y,0.85);
  vec3 ledCol = row > 6. ? mag : row > 3. ? gold : blue;
  add += ledCol * lit * pad * 0.3;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp;
    float ring = abs(length(d) - ev[i].z*0.8);
    add += mix(gold, mag, ev[i].w) * exp(-ring*ring*3000.) * (1.-ev[i].z) * 0.4;
  }
  add += gold * exp(-dot(c,c)*6.) * beat * 0.3;
  o = vec4(p+add,1.);
}`;

// Melting, sliced feedback with a slow spiral sigil and a lurking grin. Acid green and rust.
const GRIN = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float row = floor(uv.y*40.);
  float slice = (hash(vec2(row, floor(t*6.)))-0.5) * step(0.85, hash(vec2(row, floor(t*6.)+7.))) * 0.08 * (0.3+high);
  vec2 warp = 0.01*vec2(sin(c.y*15.+t), cos(c.x*13.-t*1.3))*(0.3+mid);
  vec2 fc = c*0.992 + warp + vec2(slice, 0.);
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.92;
  p = mix(p, p.gbr, 0.02);
  vec3 acid = vec3(0.6,1.0,0.2), rust = vec3(0.9,0.4,0.1);
  vec3 add = vec3(0);
  float r = length(c), a = atan(c.y,c.x);
  float spiral = fract(log(r+0.01)*3. - a/(2.*PI) - t*0.2);
  add += acid * smoothstep(0.05,0.0,abs(spiral-0.5)) * exp(-r*1.5) * (0.05+bass*0.3);
  vec2 m = c*vec2(1.,1.3);
  float mouth = smoothstep(0.02,0.0,abs(m.y + 0.1 - 0.25*m.x*m.x + 0.12)) * step(abs(m.x),0.35);
  vec2 el = abs(c) - vec2(0.18,-0.08);
  float eyes = smoothstep(0.03,0.0,length(vec2(abs(c.x)-0.18, c.y-0.08))-0.03);
  add += rust * (mouth+eyes) * max(bass-0.3,0.)*1.5;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 d = c - (ev[i].xy-0.5)*asp;
    vec2 q = abs(d);
    float box = smoothstep(0.01,0.0,max(q.x,q.y)-0.05*(1.-ev[i].z));
    add += mix(acid, rust, ev[i].w) * box * (1.-ev[i].z) * 0.8;
  }
  o = vec4(max(p+add,0.),1.);
}`;

// Black. Thin white lines meeting in an X. Nothing wasted; intersections glow briefly on each hit.
const XY = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec3 p = texture(prev, uv).rgb*0.9;
  p = vec3(dot(p,vec3(0.333)));
  vec3 add = vec3(0);
  float w = 0.0015 + bass*0.002;
  float d1 = abs(c.y - c.x), d2 = abs(c.y + c.x);
  float x = smoothstep(w+0.002, w, d1*0.707) + smoothstep(w+0.002, w, d2*0.707);
  add += vec3(1.) * x * (0.12 + mid*0.2);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp;
    float along = dot(c, normalize(vec2(1., mod(float(i),2.)<1. ? 1. : -1.)));
    float target = dot(e, normalize(vec2(1., mod(float(i),2.)<1. ? 1. : -1.)));
    float onLine = mod(float(i),2.)<1. ? d1*0.707 : d2*0.707;
    float g = exp(-pow((along-target)*8.,2.)) * smoothstep(0.02,0.0,onLine);
    add += vec3(1.) * g * (1.-ev[i].z) * 1.2;
    float dot_ = exp(-dot(c-e,c-e)*3000.)*(1.-ev[i].z);
    add += vec3(1.) * dot_ * 0.6;
  }
  add += vec3(1.) * exp(-dot(c,c)*400.) * beat * 0.5;
  o = vec4(p+add,1.);
}`;

// Synthwave sunset: a striped sun over a scrolling neon grid, violet and orange, stars up top.
const EIGHTY = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  vec3 p = texture(prev, uv).rgb*0.8;
  vec3 violet = vec3(0.6,0.2,1.0), orange = vec3(1.0,0.45,0.1), pink = vec3(1.0,0.2,0.6);
  vec3 add = vec3(0);
  float horizon = -0.05;
  if(c.y > horizon){
    float sr = length(vec2(c.x, (c.y-horizon-0.18)*1.));
    float sun = smoothstep(0.22,0.21,sr);
    float stripes = step(0.5, fract((c.y-horizon)*30. - t*0.5)) * step(c.y-horizon, 0.18);
    add += mix(orange, pink, (c.y-horizon)/0.4) * sun * (1.-stripes*0.8) * 0.25 * (0.7+bass*0.5);
    vec2 sq = floor(c*80.);
    add += vec3(0.8,0.7,1.) * step(0.995, hash(sq)) * (0.5+0.5*sin(t*3.+hash(sq+1.)*10.)) * 0.3;
    add += mix(vec3(0.15,0.02,0.2), vec3(0.), (c.y-horizon)*2.) * 0.05;
  } else {
    float z = 0.12/(horizon-c.y+0.001);
    float gx = abs(fract(c.x*z*1.5+0.5)-0.5), gz = abs(fract(z + t*2.5 + bass*2.)-0.5);
    float line = smoothstep(0.03,0.0,gx*0.5/ (0.5+z*0.1)) + smoothstep(0.06,0.0,gz);
    add += violet * min(line,1.) * 0.25 * exp(-z*0.06) * (0.6+mid);
  }
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp;
    float d = abs(c.y - horizon - 0.02) ;
    float beam = smoothstep(0.015,0.0,abs(c.x-e.x)) * step(horizon, c.y) * step(c.y, horizon+0.5*(1.-ev[i].z));
    add += mix(orange, violet, ev[i].w) * beam * (1.-ev[i].z) * 0.8;
  }
  o = vec4(p+add,1.);
}`;

// Typographic collage energy: stark blocks flickering in black and white, red slamming in on the kick.
const OVERWORLD = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float jump = step(0.9, hash(vec2(floor(t*8.), 1.))) * (hash(vec2(floor(t*8.), 2.))-0.5)*0.1;
  vec3 p = texture(prev, uv + vec2(jump, 0.)).rgb*0.82;
  p = vec3(dot(p, vec3(0.333)))*vec3(1.,0.95,0.9) * step(0.05, dot(p,vec3(0.333)));
  vec3 add = vec3(0);
  vec2 cell = floor(uv*vec2(12.,6.));
  float on = step(0.93 - mid*0.15, hash(cell + floor(t*10.)));
  vec2 g = fract(uv*vec2(12.,6.));
  float pad = step(0.08,g.x)*step(g.x,0.92)*step(0.1,g.y)*step(g.y,0.9);
  add += vec3(1.) * on * pad * 0.5;
  float bar = step(0.985 - high*0.02, hash(vec2(floor(uv.y*60.), floor(t*20.))));
  add += vec3(1.) * bar * 0.4;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp;
    vec2 q = abs(c-e) - vec2(0.25*(1.-ev[i].z), 0.03);
    float rect = step(max(q.x,q.y), 0.);
    add += vec3(1.) * rect * (1.-ev[i].z) * 0.7;
  }
  vec2 rq = abs(c) - vec2(0.5, 0.08);
  add += vec3(1.,0.05,0.05) * step(max(rq.x,rq.y),0.) * beat * 1.5;
  o = vec4(p+add,1.);
}`;

// Hearts bursting on every hit, flames licking upward through the feedback. Pink, orange, gold.
const HEARTS = HEAD + `
float heart(vec2 q){ q.y -= 0.03; float a = atan(q.x,q.y)/PI; float r = length(q); float h = abs(a); float d = (13.0*h - 22.0*h*h + 10.0*h*h*h)/(6.0-5.0*h); return r - d*0.1; }
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  vec2 c = (uv-0.5)*asp;
  float n = hash(floor(vec2(uv.x*res.x/4., uv.y*res.y/4. - t*60.)));
  vec2 fc = c + vec2((n-0.5)*0.006, 0.008 + bass*0.006);
  vec3 p = texture(prev, fc/asp+0.5).rgb*0.9;
  p = mix(p, p*vec3(1.05,0.9,0.7), 0.15);
  vec3 pink = vec3(1.0,0.3,0.6), orange = vec3(1.0,0.5,0.1), gold = vec3(1.0,0.9,0.4);
  vec3 add = vec3(0);
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp;
    float sc = 0.6 + ev[i].z*2.5;
    float d = heart((c-e)*sc/ (0.6));
    float fill = smoothstep(0.02,0.0,d) ;
    float edge = smoothstep(0.03,0.0,abs(d));
    add += mix(pink, orange, ev[i].w) * (fill*0.5 + edge*0.8) * (1.-ev[i].z) * 0.9;
  }
  float flame = smoothstep(0.3,0.0,uv.y) * (0.5+0.5*sin(uv.x*30.+t*5.)) * hash(floor(vec2(uv.x*60., t*15.)));
  add += mix(orange, gold, uv.y*3.) * flame * (0.05+bass*0.3);
  add += gold * exp(-dot(c,c)*8.) * beat * 0.2;
  o = vec4(p+add,1.);
}`;

// Bitcrushed, torn, corrupted. Low-res feedback quantised to few colours, screen tears, harsh magenta/cyan.
const CACKLES = HEAD + `
void main(){
  vec2 asp = vec2(res.x/res.y,1.);
  float px = 120.;
  vec2 grid = vec2(px*res.x/res.y, px);
  vec2 q = (floor(uv*grid)+0.5)/grid;
  vec2 c = (q-0.5)*asp;
  float band = floor(q.y*24.);
  float tear = step(0.8, hash(vec2(band, floor(t*12.)))) * (hash(vec2(band, floor(t*12.)+3.))-0.5) * 0.15 * (0.4+high);
  vec3 p = texture(prev, q + vec2(tear, -0.004)).rgb*0.86;
  p = floor(p*4.+0.5)/4.;
  vec3 mag = vec3(1.0,0.1,0.8), cyan = vec3(0.1,0.9,1.0), white = vec3(1.);
  vec3 add = vec3(0);
  float noise = hash(floor(q*grid) + floor(t*30.));
  add += mix(mag, cyan, step(0.5, hash(floor(q*grid)+1.))) * step(0.965 - mid*0.05, noise) * 0.45;
  add += white * step(0.998, noise) * 0.8;
  for(int i=0;i<8;i++){
    if(ev[i].z<=0.0) continue;
    vec2 e = (ev[i].xy-0.5)*asp;
    vec2 d = abs(c-e);
    float box = step(max(d.x,d.y), 0.12*(1.-ev[i].z)+0.02) * step(0.08*(1.-ev[i].z), max(d.x,d.y));
    add += mix(mag, cyan, ev[i].w) * box * (1.-ev[i].z) * 1.2;
  }
  float scan = step(0.5, fract(q.y*px*0.5));
  add *= 0.7 + 0.3*scan;
  add += white * step(0.6, bass) * step(0.95, hash(vec2(floor(t*40.)))) * 0.3;
  o = vec4(p+add,1.);
}`;

export const PRESETS: { name: string; fs: string }[] = [
  { name: 'Kaleidoscope', fs: KALEIDO },
  { name: 'Kid Amoeba', fs: AMOEBA },
  { name: 'Nine Inch Trails', fs: TRAILS },
  { name: 'Acid Haus', fs: HAUS },
  { name: 'Seven Notion Army', fs: ARMY },
  { name: 'Kerala Dusk', fs: DUSK },
  { name: 'The Parachute Pending', fs: PARACHUTE },
  { name: 'Interstella 5556', fs: STELLA },
  { name: 'Aphex Grin', fs: GRIN },
  { name: 'The XY', fs: XY },
  { name: 'French 80', fs: EIGHTY },
  { name: 'Overworld', fs: OVERWORLD },
  { name: 'Hearts on Wire', fs: HEARTS },
  { name: 'Crystal Cackles', fs: CACKLES },
];

const BLIT = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D tex;
void main(){ vec3 c = texture(tex,uv).rgb; c = c/(1.0+c); o = vec4(pow(c,vec3(0.9)),1.); }`;

interface Ev { x: number; y: number; t0: number; hue: number }

export class Viz {
  gl: WebGL2RenderingContext;
  private progs: (WebGLProgram | null)[] = PRESETS.map(() => null);
  private blit: WebGLProgram;
  preset = 0;
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
    this.blit = link(gl, VS, BLIT);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    // All programs use attrib location 0 for `p` (single attribute), so one pointer setup serves them all.
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = [gl.createTexture()!, gl.createTexture()!];
    this.fbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
    this.fft = new Uint8Array(analyser.frequencyBinCount);
    this.resize();
  }

  get presetName() { return PRESETS[this.preset].name; }
  setPreset(i: number) {
    this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    const gl = this.gl; gl.clearColor(0, 0, 0, 1);
    for (const f of this.fbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  nextPreset() { this.setPreset(this.preset + 1); }
  /** Presets compile lazily on first use. */
  private program(): WebGLProgram {
    return (this.progs[this.preset] ??= link(this.gl, VS, PRESETS[this.preset].fs));
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
    const prog = this.program();
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    const u = (n: string) => gl.getUniformLocation(prog, n);
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
  const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}
