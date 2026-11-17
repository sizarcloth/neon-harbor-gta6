// Canvas-generated textures: no image files, everything drawn in code so
// the game stays fully offline. Each texture is built once and shared.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  if ('SRGBColorSpace' in THREE) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hexCss(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

// Building facade: base colour, a grid of windows (some lit warm), a
// darker ground floor band. `floors` rows, `cols` columns of windows.
export function makeBuildingTexture(baseColor, floors, cols, rng) {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = hexCss(baseColor);
  ctx.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so flat walls read less flat.
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const ww = 128 / cols;
  const wh = 232 / floors;
  for (let r = 0; r < floors; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * ww + ww * 0.22;
      const y = 8 + r * wh + wh * 0.18;
      const w = ww * 0.56;
      const h = wh * 0.58;
      const lit = rng() < 0.28;
      ctx.fillStyle = lit ? '#ffd88a' : '#2c3a44';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, w, 2);
    }
  }
  // Ground floor band with a door + shopfront.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 236, 128, 20);
  ctx.fillStyle = '#ffd88a';
  ctx.fillRect(14, 238, 26, 16);
  ctx.fillStyle = '#2c3a44';
  ctx.fillRect(96, 238, 18, 16);
  return toTexture(c);
}

// Road surface: dark asphalt with a dashed amber centre line and pale
// edge lines. The texture runs along the road's length (V axis).
export function makeRoadTexture() {
  const [c, ctx] = canvas(64, 256);
  ctx.fillStyle = '#33383d';
  ctx.fillRect(0, 0, 64, 256);
  // Asphalt speckle.
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  }
  ctx.fillStyle = '#e8e3d5';
  ctx.fillRect(2, 0, 2, 256);
  ctx.fillRect(60, 0, 2, 256);
  ctx.fillStyle = '#e8b53c';
  for (let y = 0; y < 256; y += 32) ctx.fillRect(30, y, 4, 18);
  return toTexture(c, 1, 8);
}

// Neon sign: glowing text on a dark plate.
export function makeSignTexture(text, color) {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#14101c';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.font = 'bold 34px Impact, "Arial Narrow Bold", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Impact, "Arial Narrow Bold", sans-serif';
  ctx.globalAlpha = 0.35;
  ctx.fillText(text, 128, 34);
  return toTexture(c);
}

// Simple blocky face for a character's head (front face only).
export function makeFaceTexture(skin, hair) {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = hexCss(skin);
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = hexCss(hair);
  ctx.fillRect(0, 0, 64, 14);
  ctx.fillRect(0, 0, 8, 26);
  ctx.fillRect(56, 0, 8, 26);
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(16, 28, 7, 9);
  ctx.fillRect(41, 28, 7, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(26, 48, 12, 3);
  return toTexture(c);
}

// Warm late-afternoon sky gradient for the sky dome.
export function makeSkyTexture() {
  const [c, ctx] = canvas(16, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7fb2d9');
  grad.addColorStop(0.45, '#ffd9a0');
  grad.addColorStop(0.75, '#ffab6b');
  grad.addColorStop(1, '#ff8a5c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  return toTexture(c);
}

// Parking lot surface with painted bay lines.
export function makeParkingTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#e8e3d5';
  for (let x = 16; x < 256; x += 32) ctx.fillRect(x, 20, 3, 60);
  for (let x = 16; x < 256; x += 32) ctx.fillRect(x, 176, 3, 60);
  return toTexture(c);
}

// Wooden crate side.
export function makeCrateTexture() {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#a87c4a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#7a5a30';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 60, 60);
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(62, 62);
  ctx.moveTo(62, 2);
  ctx.lineTo(2, 62);
  ctx.stroke();
  return toTexture(c);
}
