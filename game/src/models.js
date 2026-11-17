// Procedural code-only models: every mesh is built from three.js
// primitives in this file. No mesh files, no downloaded assets.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { makeFaceTexture, makeCrateTexture } from './textures.js';

const geoCache = new Map();
function box(w, h, d) {
  const key = `b${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}
function cyl(rt, rb, h, seg = 10) {
  const key = `c${rt},${rb},${h},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key);
}
function cone(r, h, seg = 6) {
  const key = `k${r},${h},${seg}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, seg));
  return geoCache.get(key);
}

const MAT = {
  tire: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  hub: new THREE.MeshLambertMaterial({ color: 0xb8bcc0 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1d2f3a }),
  chrome: new THREE.MeshLambertMaterial({ color: 0xd8dce0 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  taillight: new THREE.MeshBasicMaterial({ color: 0xff2a22 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
  frond: new THREE.MeshLambertMaterial({ color: 0x2e7d46, side: THREE.DoubleSide }),
  pole: new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  lampHead: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
};

export function makeBlobShadow(radius, opacity = 0.32) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

function makeWheel(radius, width) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(cyl(radius, radius, width, 12), MAT.tire);
  tire.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(cyl(radius * 0.55, radius * 0.55, width + 0.02, 8), MAT.hub);
  hub.rotation.z = Math.PI / 2;
  g.add(tire, hub);
  g.userData.spin = tire;
  return g;
}

// A car, front facing +Z. userData: { wheels: [steer FL, steer FR, RL, RR],
// steerL, steerR (pivot groups), lightBar? }.
export function buildCarMesh(type, color) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const low = type === 'sports';
  const bodyH = low ? 0.55 : 0.72;
  const bodyY = low ? 0.52 : 0.6;
  const L = spec.length;
  const W = spec.width;

  const body = new THREE.Mesh(box(W, bodyH, L), paint);
  body.position.y = bodyY;
  g.add(body);
  // Cabin: glass box set back from the nose.
  const cabLen = type === 'pickup' ? L * 0.34 : L * 0.48;
  const cabZ = type === 'pickup' ? L * 0.28 : -L * 0.06;
  const cab = new THREE.Mesh(box(W * 0.88, 0.55, cabLen), MAT.glass);
  cab.position.set(0, bodyY + bodyH / 2 + 0.26, cabZ);
  g.add(cab);
  const roof = new THREE.Mesh(box(W * 0.9, 0.08, cabLen + 0.1), paint);
  roof.position.set(0, bodyY + bodyH / 2 + 0.56, cabZ);
  g.add(roof);
  if (type === 'pickup') {
    // Open bed: low walls around the rear half.
    const bedZ = -L * 0.28;
    const wallH = 0.35;
    const wallY = bodyY + bodyH / 2 + wallH / 2;
    const mkWall = (w, d, x, z) => {
      const m = new THREE.Mesh(box(w, wallH, d), paint);
      m.position.set(x, wallY, z);
      g.add(m);
    };
    mkWall(0.08, L * 0.42, -W / 2 + 0.04, bedZ);
    mkWall(0.08, L * 0.42, W / 2 - 0.04, bedZ);
    mkWall(W, 0.08, 0, bedZ - L * 0.21);
  }
  if (type === 'sports') {
    // Rear spoiler on two struts.
    const wing = new THREE.Mesh(box(W * 0.94, 0.07, 0.5), paint);
    wing.position.set(0, bodyY + bodyH / 2 + 0.42, -L / 2 + 0.3);
    g.add(wing);
    for (const sx of [-0.6, 0.6]) {
      const strut = new THREE.Mesh(box(0.08, 0.4, 0.08), MAT.pole);
      strut.position.set(sx, bodyY + bodyH / 2 + 0.2, -L / 2 + 0.3);
      g.add(strut);
    }
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(box(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe93c }));
    sign.position.set(0, bodyY + bodyH / 2 + 0.68, cabZ);
    g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(box(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.28;
    const blue = new THREE.Mesh(box(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, bodyY + bodyH / 2 + 0.66, cabZ);
    g.add(bar);
    g.userData.lightBar = bar;
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  // Lights: two headlights, two taillights, bumpers.
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(box(0.42, 0.16, 0.06), MAT.headlight);
    hl.position.set(sx * (W / 2 - 0.32), bodyY + 0.08, L / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(box(0.42, 0.14, 0.06), MAT.taillight);
    tl.position.set(sx * (W / 2 - 0.32), bodyY + 0.08, -L / 2 - 0.02);
    g.add(tl);
  }
  const bumpF = new THREE.Mesh(box(W + 0.04, 0.18, 0.12), MAT.chrome);
  bumpF.position.set(0, bodyY - bodyH / 2 + 0.1, L / 2 + 0.04);
  const bumpR = bumpF.clone();
  bumpR.position.z = -L / 2 - 0.04;
  g.add(bumpF, bumpR);

  // Wheels: front pair on steer pivots, rear pair fixed.
  const wr = low ? 0.38 : 0.34;
  const wz = L * 0.32;
  const wx = W / 2 - 0.12;
  const wheels = [];
  const mkAxle = (z, steer) => {
    const pair = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wx, wr, z);
      const wheel = makeWheel(wr, 0.26);
      pivot.add(wheel);
      g.add(pivot);
      pair.push({ pivot, wheel, spin: wheel.userData.spin });
    }
    return pair;
  };
  const front = mkAxle(wz, true);
  const rear = mkAxle(-wz, false);
  wheels.push(...front, ...rear);
  g.userData.wheels = wheels;
  g.userData.steerL = front[0].pivot;
  g.userData.steerR = front[1].pivot;

  const shadow = makeBlobShadow(1, 0.3);
  shadow.scale.set(1.4, 2.6, 1);
  g.add(shadow);
  return g;
}

// Blocky character, ~1.8 m tall, facing +Z. userData: legL/legR/armL/armR
// (pivot groups), body (torso mesh, for squash), head.
export function buildCharacterMesh({ shirt, pants, skin, hair, hat = null }) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });

  const mkLimb = (mat, w, len, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(box(w, len, w + 0.04), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  g.userData.legL = mkLimb(pantsMat, 0.22, 0.82, -0.14, 0.84);
  g.userData.legR = mkLimb(pantsMat, 0.22, 0.82, 0.14, 0.84);
  g.userData.armL = mkLimb(shirtMat, 0.18, 0.68, -0.4, 1.42);
  g.userData.armR = mkLimb(shirtMat, 0.18, 0.68, 0.4, 1.42);

  const torso = new THREE.Mesh(box(0.62, 0.62, 0.36), shirtMat);
  torso.position.y = 1.16;
  g.add(torso);
  g.userData.body = torso;

  // Head with a canvas face on the front (+Z) side.
  const faceTex = makeFaceTexture(skin, hair);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
  const headMats = [skinMat, skinMat, hairMat, skinMat, faceMat, hairMat];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), headMats);
  head.position.y = 1.68;
  g.add(head);
  g.userData.head = head;

  if (hat === 'cap') {
    const cap = new THREE.Mesh(box(0.44, 0.1, 0.44), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
    cap.position.y = 1.92;
    const brim = new THREE.Mesh(box(0.4, 0.05, 0.24), cap.material);
    brim.position.set(0, 1.88, 0.3);
    g.add(cap, brim);
  } else if (hat === 'police') {
    const cap = new THREE.Mesh(box(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x1d2a44 }));
    cap.position.y = 1.92;
    const brim = new THREE.Mesh(box(0.4, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0x0d1526 }));
    brim.position.set(0, 1.87, 0.3);
    g.add(cap, brim);
  }

  const shadow = makeBlobShadow(0.55, 0.28);
  g.add(shadow);
  return g;
}

export function buildPalm(scale = 1) {
  const g = new THREE.Group();
  // Two trunk segments with a slight lean (reads as a curve at distance,
  // half the draw calls of a three-segment trunk).
  for (let i = 0; i < 2; i += 1) {
    const seg = new THREE.Mesh(cyl(0.13 - i * 0.02, 0.18 - i * 0.02, 2.8, 7), MAT.trunk);
    seg.position.set(i * 0.16, 1.4 + i * 2.7, 0);
    seg.rotation.z = 0.06 * (i + 1);
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(0.35, 5.5, 0);
  for (let i = 0; i < 6; i += 1) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(cone(0.42, 2.6, 5), MAT.frond);
    frond.geometry = frond.geometry.clone();
    frond.geometry.translate(0, 1.3, 0);
    frond.scale.set(1, 1, 0.22);
    pivot.add(frond);
    pivot.rotation.x = 1.05 + (i % 3) * 0.12;
    crown.add(pivot);
  }
  g.add(crown);
  const shadow = makeBlobShadow(1.1, 0.25);
  g.add(shadow);
  g.scale.setScalar(scale);
  return g;
}

export function buildLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(cyl(0.07, 0.09, 5.6, 8), MAT.pole);
  pole.position.y = 2.8;
  g.add(pole);
  const arm = new THREE.Mesh(box(0.1, 0.1, 1.5), MAT.pole);
  arm.position.set(0, 5.5, 0.7);
  g.add(arm);
  const head = new THREE.Mesh(box(0.3, 0.14, 0.6), MAT.lampHead);
  head.position.set(0, 5.42, 1.4);
  g.add(head);
  return g;
}

const crateTex = makeCrateTexture();
export function buildCrate(size = 1.2) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: crateTex });
  const m = new THREE.Mesh(box(size, size, size), mat);
  m.position.y = size / 2;
  g.add(m);
  const shadow = makeBlobShadow(size * 0.75, 0.25);
  g.add(shadow);
  return g;
}

export function buildContainer(color, length = 6) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(box(length, 2.6, 2.5), mat);
  body.position.y = 1.3;
  g.add(body);
  // Ribs along the side.
  for (let i = 0; i < 5; i += 1) {
    const rib = new THREE.Mesh(box(0.12, 2.5, 2.56), new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.82) }));
    rib.position.set(-length / 2 + 0.6 + i * (length - 1.2) / 4, 1.3, 0);
    g.add(rib);
  }
  const shadow = makeBlobShadow(1, 0.25);
  shadow.scale.set(length / 2, 1.6, 1);
  g.add(shadow);
  return g;
}

export function buildCrane() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshLambertMaterial({ color: 0xd8a13c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
  const tower = new THREE.Mesh(box(1.6, 17, 1.6), yellow);
  tower.position.y = 8.5;
  g.add(tower);
  const cab = new THREE.Mesh(box(2.4, 2, 2.4), dark);
  cab.position.y = 17.5;
  g.add(cab);
  const arm = new THREE.Mesh(box(15, 0.9, 0.9), yellow);
  arm.position.set(5.5, 18.6, 0);
  g.add(arm);
  const counter = new THREE.Mesh(box(4, 0.9, 0.9), yellow);
  counter.position.set(-3.5, 18.6, 0);
  g.add(counter);
  const cable = new THREE.Mesh(cyl(0.03, 0.03, 7, 4), dark);
  cable.position.set(11.5, 15, 0);
  g.add(cable);
  const hook = new THREE.Mesh(box(0.7, 0.9, 0.7), dark);
  hook.position.set(11.5, 11.2, 0);
  g.add(hook);
  const shadow = makeBlobShadow(2.2, 0.25);
  g.add(shadow);
  return g;
}

export function buildBarrel(color = 0x7a6a4a) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(cyl(0.42, 0.42, 1.0, 10), new THREE.MeshLambertMaterial({ color }));
  m.position.y = 0.5;
  g.add(m);
  return g;
}

export function buildBench() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const seat = new THREE.Mesh(box(1.8, 0.1, 0.5), wood);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(box(1.8, 0.5, 0.08), wood);
  back.position.set(0, 0.85, -0.22);
  g.add(seat, back);
  for (const sx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(box(0.08, 0.45, 0.45), MAT.pole);
    leg.position.set(sx, 0.22, 0);
    g.add(leg);
  }
  return g;
}

// Mission marker: a vertical light beam + a ground ring. Pulsed in update.
export function buildBeacon(color = 0xffd23c) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    cyl(0.45, 0.6, 26, 10, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 13;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.14, 8, 28),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(beam, ring);
  g.userData.beam = beam;
  g.userData.ring = ring;
  return g;
}

// Floating pickup box (ammo: green; health: red cross plate).
export function buildPickup(kind) {
  const g = new THREE.Group();
  const color = kind === 'ammo' ? 0x2eff8f : 0xff5a5a;
  const m = new THREE.Mesh(box(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
  m.position.y = 1.0;
  g.add(m);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.07, 8, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  g.userData.spin = m;
  return g;
}
