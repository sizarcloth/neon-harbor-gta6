// Seeded RNG (mulberry32) so the city, traffic and peds are deterministic
// for a given ?seed= value. The playtest uses seed=1.
export function makeRng(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function randPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  let h = 2166136261;
  const s = String(value);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
