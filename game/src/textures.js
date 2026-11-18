// textures.js — all textures are drawn on canvas in code (no image files).
// Ground map, building windows, neon signs. Fully offline.

import * as THREE from 'three';

// Building facade: dark wall + a grid of windows, some lit warm.
export function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3440';
  g.fillRect(0, 0, 256, 256);
  let i = 0;
  for (let y = 8; y < 248; y += 32) {
    for (let x = 8; x < 248; x += 32) {
      i += 1;
      // Deterministic pseudo-random: lit windows follow a fixed pattern.
      const lit = (i * 37 + 11) % 5 < 2;
      g.fillStyle = lit ? '#ffd27a' : '#1b2432';
      g.fillRect(x, y, 20, 20);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x, y, 20, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One big ground texture for the whole city: roads, lane markings,
// crosswalks, sidewalks, beach, harbor concrete, parking lots, plaza.
// layout: { minX, maxX, minZ, maxZ, avenues[], streets[], roadW,
//           beachX, harborX, lots[], plaza }.
export function makeGroundTexture(layout) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const spanX = layout.maxX - layout.minX;
  const spanZ = layout.maxZ - layout.minZ;
  const scale = S / Math.max(spanX, spanZ);
  const ox = (S - spanX * scale) / 2;
  const oz = (S - spanZ * scale) / 2;
  const X = (wx) => ox + (wx - layout.minX) * scale;
  const Z = (wz) => oz + (wz - layout.minZ) * scale;
  const W = (w) => w * scale;

  // Base: sidewalk concrete.
  g.fillStyle = '#8d8578';
  g.fillRect(0, 0, S, S);
  // Blocks: slightly darker slabs between roads.
  g.fillStyle = '#7e7668';
  const xs = [-105, ...layout.avenues.map((a) => a - layout.roadW / 2), 205];
  const zs = [-105, ...layout.streets.map((s) => s - layout.roadW / 2), 145];
  // Beach sand on the east edge.
  g.fillStyle = '#e3cd9a';
  g.fillRect(X(layout.beachX), 0, S - X(layout.beachX), S);
  // Harbor concrete.
  g.fillStyle = '#96907f';
  g.fillRect(X(layout.harborX), Z(-40), X(layout.beachX) - X(layout.harborX), Z(60) - Z(-40));
  // Plaza: warm stone.
  if (layout.plaza) {
    g.fillStyle = '#a89a80';
    g.fillRect(X(layout.plaza.x0), Z(layout.plaza.z0), W(layout.plaza.x1 - layout.plaza.x0), W(layout.plaza.z1 - layout.plaza.z0));
  }
  // Parking lots: asphalt with bay lines.
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, 0.25 * scale);
  for (const lot of layout.lots || []) {
    g.fillStyle = '#4a4d52';
    g.fillRect(X(lot.x0), Z(lot.z0), W(lot.x1 - lot.x0), W(lot.z1 - lot.z0));
    g.beginPath();
    for (let x = lot.x0 + 3; x < lot.x1; x += 3) {
      g.moveTo(X(x), Z(lot.z0 + 1));
      g.lineTo(X(x), Z(lot.z0 + 6));
      g.moveTo(X(x), Z(lot.z1 - 1));
      g.lineTo(X(x), Z(lot.z1 - 6));
    }
    g.stroke();
  }
  // Roads: asphalt.
  const hw = layout.roadW / 2;
  g.fillStyle = '#3b3f45';
  for (const a of layout.avenues) g.fillRect(X(a - hw), 0, W(layout.roadW), S);
  for (const s of layout.streets) g.fillRect(0, Z(s - hw), S, W(layout.roadW));
  // Lane markings: dashed yellow center lines.
  g.strokeStyle = '#d8b93c';
  g.lineWidth = Math.max(1, 0.18 * scale);
  g.setLineDash([W(3), W(3)]);
  g.beginPath();
  for (const a of layout.avenues) {
    g.moveTo(X(a), 0);
    g.lineTo(X(a), S);
  }
  for (const s of layout.streets) {
    g.moveTo(0, Z(s));
    g.lineTo(S, Z(s));
  }
  g.stroke();
  g.setLineDash([]);
  // Crosswalks at every intersection: white stripes.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const a of layout.avenues) {
    for (const s of layout.streets) {
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(X(a - hw + 0.6 + k * 1.6), Z(s - hw - 1.2), W(0.8), W(1.2));
        g.fillRect(X(a - hw + 0.6 + k * 1.6), Z(s + hw), W(0.8), W(1.2));
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Neon sign: glowing text on a dark panel.
export function makeSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.fillStyle = color;
  g.fillText(text, 256, 68);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.85;
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
