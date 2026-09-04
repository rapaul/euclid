/** Bjorklund's algorithm: distribute `hits` as evenly as possible over `steps`. */
export function euclid(hits: number, steps: number, rotate = 0): boolean[] {
  if (steps <= 0) return [];
  hits = Math.max(0, Math.min(hits, steps));
  if (hits === 0) return new Array(steps).fill(false);
  if (hits === steps) return new Array(steps).fill(true);

  let a: boolean[][] = Array.from({ length: hits }, () => [true]);
  let b: boolean[][] = Array.from({ length: steps - hits }, () => [false]);
  while (b.length > 1) {
    const n = Math.min(a.length, b.length);
    const next: boolean[][] = [];
    for (let i = 0; i < n; i++) next.push(a[i].concat(b[i]));
    const rest = a.length > n ? a.slice(n) : b.slice(n);
    a = next;
    b = rest;
  }
  const flat = a.concat(b).flat();
  const r = ((rotate % steps) + steps) % steps;
  return flat.slice(r).concat(flat.slice(0, r));
}
