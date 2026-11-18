// Canvas-generated textures: ground map, building windows, neon signs. No image files.
import * as THREE from 'three';
import { ROADS, WORLD } from './config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// One 1024x1024 ground texture for the whole city: roads with lane dashes,
// sidewalks, block tones, beach sand south, harbor concrete east, ocean edge.
export function makeGroundTexture() {
  const [c, g] = canvas(1024, 1024);
  const S = 1024 / (WORLD.half * 2); // px per metre
  const X = (x) => (x + WORLD.half) * S;
  const Z = (z) => (z + WORLD.half) * S;
  g.fillStyle = '#8a7f72'; g.fillRect(0, 0, 1024, 1024); // block base
  // Beach sand (south, z > 168) and harbor concrete (east, x > 160).
  g.fillStyle = '#e8c98f'; g.fillRect(0, Z(168), 1024, 1024 - Z(168));
  g.fillStyle = '#7d7468'; g.fillRect(X(160), 0, 1024 - X(160), 1024);
  // Ocean sliver at the far south-east corner is drawn by the sea plane itself.
  // Sidewalks: pale strips along every road.
  g.fillStyle = '#9a938a';
  for (const r of ROADS) {
    g.fillRect(X(r) - 7.5 * S, 0, 15 * S, 1024);
    g.fillRect(0, Z(r) - 7.5 * S, 1024, 15 * S);
  }
  // Asphalt roads.
  g.fillStyle = '#33363e';
  for (const r of ROADS) {
    g.fillRect(X(r) - 4.5 * S, 0, 9 * S, 1024);
    g.fillRect(0, Z(r) - 4.5 * S, 1024, 9 * S);
  }
  // Centre dashes, warm white.
  g.fillStyle = '#d8cfae';
  for (const r of ROADS) {
    for (let d = -196; d < 196; d += 8) {
      g.fillRect(X(r) - 0.3 * S, Z(d), 0.6 * S, 3 * S);
      g.fillRect(X(d), Z(r) - 0.3 * S, 3 * S, 0.6 * S);
    }
  }
  // Crosswalk stripes at the centre intersection.
  g.fillStyle = '#cfc7ae';
  for (let i = -3; i <= 3; i += 1) {
    g.fillRect(X(-7 + i * 2), Z(-5.4), 1.1 * S, 2 * S);
    g.fillRect(X(-7 + i * 2), Z(3.4), 1.1 * S, 2 * S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Building facade: warm concrete + a grid of windows, some lit amber.
export function makeFacadeTexture(rng, base, litRatio) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10);
  for (let y = 18; y < 240; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffcf7a' : '#2a3348';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Neon sign: glowing text on a dark plate, used as an emissive plane.
export function makeSignTexture(text, color) {
  const [c, g] = canvas(256, 96);
  g.fillStyle = '#0c1020'; g.fillRect(0, 0, 256, 96);
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 128, 50);
  g.shadowBlur = 0;
  g.strokeStyle = color; g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
