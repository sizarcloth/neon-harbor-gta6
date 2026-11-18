// models.js — procedural code-only 3D models (three.js primitives).
// Cars, people, palms, lamps, crates: built from boxes, cylinders and
// spheres, merged into single meshes with vertex colors (1 draw call
// per car/person). No mesh files, no downloaded assets.

import * as THREE from 'three';

export const vertexMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.6,
  metalness: 0.2,
});

export const CAR_TYPES = {
  sedan: { length: 4.5, width: 1.9, accel: 9, maxSpeed: 24, maxReverse: 8, steer: 1.9 },
  taxi: { length: 4.5, width: 1.9, accel: 8, maxSpeed: 21, maxReverse: 8, steer: 1.9 },
  sport: { length: 4.6, width: 1.95, accel: 12, maxSpeed: 32, maxReverse: 9, steer: 2.1 },
  pickup: { length: 4.9, width: 2.0, accel: 7, maxSpeed: 19, maxReverse: 7, steer: 1.7 },
  police: { length: 4.5, width: 1.9, accel: 11, maxSpeed: 27, maxReverse: 8, steer: 2.0 },
};

function xform(x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  return m;
}

// Merge colored parts into one BufferGeometry (positions + normals +
// per-vertex colors). Parts: { geometry, matrix, color }.
function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const col = new THREE.Color();
  for (const part of parts) {
    const geo = part.geometry.toNonIndexed();
    geo.applyMatrix4(part.matrix);
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    col.set(part.color);
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      colors.push(col.r, col.g, col.b);
    }
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

function cyl(rt, rb, h, seg = 10) {
  return new THREE.CylinderGeometry(rt, rb, h, seg);
}

const carGeoCache = new Map();

function buildCarGeometry(type, colorHex) {
  const parts = [];
  const glass = 0x18222e;
  const dark = 0x1a1a1a;
  const isSport = type === 'sport';
  const isPickup = type === 'pickup';
  const bodyH = isSport ? 0.55 : 0.65;
  const bodyY = isSport ? 0.6 : 0.68;
  const wheelR = isSport ? 0.38 : 0.34;
  const len = CAR_TYPES[type].length;
  const wid = CAR_TYPES[type].width;
  // Body.
  parts.push({ geometry: box(wid, bodyH, len), matrix: xform(0, bodyY, 0), color: colorHex });
  // Cabin (glass) + roof plate in body color.
  if (isPickup) {
    parts.push({ geometry: box(1.7, 0.6, 1.6), matrix: xform(0, 1.22, 0.95), color: glass });
    parts.push({ geometry: box(1.74, 0.08, 1.5), matrix: xform(0, 1.54, 0.95), color: colorHex });
    // Open bed: floor + three walls.
    parts.push({ geometry: box(1.8, 0.1, 2.0), matrix: xform(0, 0.98, -1.3), color: dark });
    parts.push({ geometry: box(0.08, 0.42, 2.0), matrix: xform(-0.88, 1.2, -1.3), color: colorHex });
    parts.push({ geometry: box(0.08, 0.42, 2.0), matrix: xform(0.88, 1.2, -1.3), color: colorHex });
    parts.push({ geometry: box(1.8, 0.42, 0.08), matrix: xform(0, 1.2, -2.28), color: colorHex });
  } else {
    const cabZ = isSport ? -0.45 : -0.25;
    const cabL = isSport ? 1.8 : 2.1;
    const cabY = isSport ? 1.12 : 1.22;
    parts.push({ geometry: box(1.66, 0.55, cabL), matrix: xform(0, cabY, cabZ), color: glass });
    parts.push({ geometry: box(1.7, 0.08, cabL - 0.1), matrix: xform(0, cabY + 0.3, cabZ), color: colorHex });
  }
  // Wheels + hubcaps.
  const wx = wid / 2 - 0.1;
  const wz = len / 2 - 1.0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geometry: cyl(wheelR, wheelR, 0.24), matrix: xform(sx * wx, wheelR, sz * wz, 0, 0, Math.PI / 2), color: dark });
      parts.push({ geometry: cyl(wheelR * 0.5, wheelR * 0.5, 0.26), matrix: xform(sx * wx, wheelR, sz * wz, 0, 0, Math.PI / 2), color: 0x9aa0a6 });
    }
  }
  // Headlights, taillights, bumpers, grille.
  for (const sx of [-1, 1]) {
    parts.push({ geometry: box(0.32, 0.14, 0.06), matrix: xform(sx * 0.62, 0.72, len / 2 + 0.01), color: 0xfff2b0 });
    parts.push({ geometry: box(0.32, 0.14, 0.06), matrix: xform(sx * 0.62, 0.72, -len / 2 - 0.01), color: 0xd23b2e });
  }
  parts.push({ geometry: box(wid + 0.02, 0.18, 0.12), matrix: xform(0, 0.42, len / 2), color: dark });
  parts.push({ geometry: box(wid + 0.02, 0.18, 0.12), matrix: xform(0, 0.42, -len / 2), color: dark });
  parts.push({ geometry: box(0.9, 0.18, 0.05), matrix: xform(0, 0.66, len / 2 + 0.02), color: dark });
  if (type === 'taxi') {
    parts.push({ geometry: box(0.55, 0.18, 0.32), matrix: xform(0, 1.62, -0.25), color: 0xffd23c });
  }
  if (isSport) {
    parts.push({ geometry: box(1.7, 0.06, 0.42), matrix: xform(0, 1.08, -len / 2 + 0.2), color: dark });
    parts.push({ geometry: box(0.08, 0.28, 0.08), matrix: xform(-0.7, 0.92, -len / 2 + 0.2), color: dark });
    parts.push({ geometry: box(0.08, 0.28, 0.08), matrix: xform(0.7, 0.92, -len / 2 + 0.2), color: dark });
  }
  if (type === 'police') {
    // White doors on the black body.
    for (const sx of [-1, 1]) {
      parts.push({ geometry: box(0.04, 0.42, 1.5), matrix: xform(sx * (wid / 2 + 0.01), 0.7, -0.2), color: 0xf2f2f2 });
    }
  }
  return mergeParts(parts);
}

export function createCarMesh(type, colorHex) {
  const key = `${type}:${colorHex}`;
  let geo = carGeoCache.get(key);
  if (!geo) {
    geo = buildCarGeometry(type, colorHex);
    carGeoCache.set(key, geo);
  }
  return new THREE.Mesh(geo, vertexMat);
}

// Police light bar: separate mesh so it can flash red/blue.
export function createLightBar() {
  const geo = new THREE.BoxGeometry(1.1, 0.16, 0.34);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1.58;
  return mesh;
}

const personGeoCache = new Map();

function buildPersonGeometry(shirt, pants, skin, hair) {
  const parts = [];
  const shoe = 0x222222;
  for (const sx of [-1, 1]) {
    parts.push({ geometry: box(0.17, 0.78, 0.22), matrix: xform(sx * 0.11, 0.39, 0), color: pants });
    parts.push({ geometry: box(0.18, 0.1, 0.3), matrix: xform(sx * 0.11, 0.05, 0.03), color: shoe });
    parts.push({ geometry: box(0.14, 0.58, 0.18), matrix: xform(sx * 0.34, 1.09, 0), color: shirt });
    parts.push({ geometry: box(0.13, 0.12, 0.15), matrix: xform(sx * 0.34, 0.76, 0), color: skin });
  }
  parts.push({ geometry: box(0.52, 0.62, 0.3), matrix: xform(0, 1.09, 0), color: shirt });
  parts.push({ geometry: box(0.3, 0.3, 0.3), matrix: xform(0, 1.62, 0), color: skin });
  parts.push({ geometry: box(0.32, 0.12, 0.32), matrix: xform(0, 1.8, 0), color: hair });
  for (const sx of [-1, 1]) {
    parts.push({ geometry: box(0.05, 0.05, 0.02), matrix: xform(sx * 0.07, 1.64, 0.16), color: 0x111111 });
  }
  return mergeParts(parts);
}

export function createPersonMesh(shirt, pants, skin, hair) {
  const key = `${shirt}:${pants}:${skin}:${hair}`;
  let geo = personGeoCache.get(key);
  if (!geo) {
    geo = buildPersonGeometry(shirt, pants, skin, hair);
    personGeoCache.set(key, geo);
  }
  return new THREE.Mesh(geo, vertexMat);
}

// Cheap blob shadows: one InstancedMesh of dark circles, updated per frame.
export class BlobShadows {
  constructor(scene, max = 48) {
    this.max = max;
    const geo = new THREE.CircleGeometry(1, 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i += 1) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
    this.tmp = new THREE.Matrix4();
  }

  set(i, x, z, r) {
    if (i >= this.max) return;
    this.tmp.makeScale(r, 1, r);
    this.tmp.setPosition(x, 0.03, z);
    this.mesh.setMatrixAt(i, this.tmp);
  }

  hide(i) {
    if (i >= this.max) return;
    this.tmp.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, this.tmp);
  }

  update() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
