// utils.js — small shared helpers: seeded RNG, math, angles.
// No imports. Every game module can use these without cycles.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(rng, a, b) {
  return a + rng() * (b - a);
}

export function randInt(rng, a, b) {
  return Math.floor(rand(rng, a, b + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Exponential smoothing: frame-rate independent approach.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// Shortest-arc angle interpolation (radians).
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2D(x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  return Math.sqrt(dx * dx + dz * dz);
}

// Forward vector for a heading: heading 0 faces +Z, -PI/2 faces -X.
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function headingTo(x0, z0, x1, z1) {
  return Math.atan2(x1 - x0, z1 - z0);
}

// Push a circle (x, z, radius) out of an axis-aligned box.
// Returns true when a correction was applied.
export function pushOutOfBox(px, pz, r, box) {
  const cx = clamp(px, box.x0, box.x1);
  const cz = clamp(pz, box.z0, box.z1);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    return { x: px + dx * push, z: pz + dz * push };
  }
  // Center is inside the box: push out along the smallest penetration.
  const left = px - box.x0;
  const right = box.x1 - px;
  const top = pz - box.z0;
  const bottom = box.z1 - pz;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: box.x0 - r, z: pz };
  if (m === right) return { x: box.x1 + r, z: pz };
  if (m === top) return { x: px, z: box.z0 - r };
  return { x: px, z: box.z1 + r };
}
