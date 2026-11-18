// Procedural models, code only: cars, people, palms, buildings, crates, pickups.
// Proportions per game-procedural-models: sedan 4.5 m long, wheelbase 60%, wheels 15%.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';

const GEO = {
  carBody: new THREE.BoxGeometry(1.9, 0.55, 4.4),
  carBodyLow: new THREE.BoxGeometry(1.9, 0.42, 4.5),
  carCabin: new THREE.BoxGeometry(1.7, 0.5, 2.1),
  carCabinSport: new THREE.BoxGeometry(1.65, 0.42, 1.7),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12),
  lightBar: new THREE.BoxGeometry(1.0, 0.12, 0.3),
  stripF: new THREE.BoxGeometry(1.7, 0.12, 0.06),
  stripB: new THREE.BoxGeometry(1.7, 0.12, 0.06),
  spoiler: new THREE.BoxGeometry(1.7, 0.08, 0.35),
  taxiSign: new THREE.BoxGeometry(0.7, 0.18, 0.4),
  bedWall: new THREE.BoxGeometry(1.9, 0.35, 0.12),
  torso: new THREE.BoxGeometry(0.56, 0.68, 0.32),
  head: new THREE.BoxGeometry(0.34, 0.34, 0.34),
  leg: new THREE.BoxGeometry(0.22, 0.78, 0.24),
  arm: new THREE.BoxGeometry(0.16, 0.6, 0.18),
  cap: new THREE.BoxGeometry(0.4, 0.1, 0.4),
  crate: new THREE.BoxGeometry(1.4, 1.4, 1.4),
  pickupBox: new THREE.BoxGeometry(0.7, 0.7, 0.7),
  shadow: new THREE.CircleGeometry(1, 20),
  palmTrunk: new THREE.CylinderGeometry(0.14, 0.22, 6, 7),
  palmLeaf: new THREE.ConeGeometry(0.4, 2.4, 5),
  lampPole: new THREE.CylinderGeometry(0.07, 0.09, 5.5, 6),
  lampHead: new THREE.SphereGeometry(0.22, 8, 6),
};
const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x1a2836, roughness: 0.15, metalness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  headlight: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.6 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 1.2 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 }),
  copBlue: new THREE.MeshStandardMaterial({ color: 0x1c2f57, roughness: 0.7 }),
  guardGreen: new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.7 }),
  crateWood: new THREE.MeshStandardMaterial({ color: 0x8a6b3d, roughness: 0.9 }),
  ammoGreen: new THREE.MeshStandardMaterial({ color: 0x2ee66b, emissive: 0x1a8a3c, emissiveIntensity: 0.9 }),
  healthWhite: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xcc3333, emissiveIntensity: 0.7 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f9e4f, roughness: 0.85, side: THREE.DoubleSide }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 }),
  lampGlow: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc860, emissiveIntensity: 1.4 }),
};
const carPaint = {};
function paint(color) {
  if (!carPaint[color]) carPaint[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
  return carPaint[color];
}
const clothMats = {};
function cloth(color) {
  if (!clothMats[color]) clothMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  return clothMats[color];
}

export function blobShadow(scale = 1) {
  const m = new THREE.Mesh(GEO.shadow, MAT.shadow);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(scale);
  m.position.y = 0.02;
  return m;
}

// Car: body + cabin + 4 wheels + light strips. Forward is +Z when heading is 0.
export function buildCar(type, colorOverride) {
  const def = CAR_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = paint(colorOverride ?? def.body);
  const body = new THREE.Mesh(type === 'sports' ? GEO.carBodyLow : GEO.carBody, bodyMat);
  body.position.y = type === 'sports' ? 0.48 : 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(type === 'sports' ? GEO.carCabinSport : GEO.carCabin, MAT.glass);
  cabin.position.set(0, type === 'sports' ? 0.92 : 1.05, type === 'pickup' ? 0.9 : -0.2);
  g.add(cabin);
  if (type === 'pickup') {
    const wall = new THREE.Mesh(GEO.bedWall, bodyMat);
    wall.position.set(0, 0.95, -1.6);
    g.add(wall);
  }
  if (type === 'sports') {
    const sp = new THREE.Mesh(GEO.spoiler, bodyMat);
    sp.position.set(0, 0.85, -2.1);
    g.add(sp);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(GEO.taxiSign, new THREE.MeshStandardMaterial({ color: 0xffc21c, emissive: 0xffb020, emissiveIntensity: 0.8 }));
    sign.position.set(0, 1.38, -0.2);
    g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(GEO.lightBar, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2244, emissiveIntensity: 1.8 }));
    bar.position.set(0, 1.36, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(GEO.lightBar, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x2244ff, emissiveIntensity: 1.8 }));
    bar2.position.set(0, 1.36, -0.2);
    bar2.scale.set(0.5, 1, 1);
    bar2.position.x = 0.26;
    g.add(bar2);
  }
  const stripF = new THREE.Mesh(GEO.stripF, MAT.headlight);
  stripF.position.set(0, 0.62, 2.21);
  g.add(stripF);
  const stripB = new THREE.Mesh(GEO.stripB, MAT.tail);
  stripB.position.set(0, 0.62, -2.21);
  g.add(stripB);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.45], [0.88, 1.45], [-0.88, -1.45], [0.88, -1.45]]) {
    const w = new THREE.Mesh(GEO.wheel, MAT.tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const shadow = blobShadow(2.4);
  g.add(shadow);
  g.userData.wheels = wheels;
  return g;
}

// Blocky person: torso, head, legs, arms. Legs/arms swing while walking.
export function buildPerson(shirtColor, pantsColor, opts = {}) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(GEO.torso, cloth(shirtColor));
  torso.position.y = 1.14;
  g.add(torso);
  const head = new THREE.Mesh(GEO.head, MAT.skin);
  head.position.y = 1.66;
  g.add(head);
  const legL = new THREE.Mesh(GEO.leg, cloth(pantsColor));
  legL.position.set(-0.14, 0.39, 0);
  const legR = new THREE.Mesh(GEO.leg, cloth(pantsColor));
  legR.position.set(0.14, 0.39, 0);
  g.add(legL, legR);
  const armL = new THREE.Mesh(GEO.arm, cloth(shirtColor));
  armL.position.set(-0.38, 1.2, 0);
  const armR = new THREE.Mesh(GEO.arm, cloth(shirtColor));
  armR.position.set(0.38, 1.2, 0);
  g.add(armL, armR);
  if (opts.cop) {
    const cap = new THREE.Mesh(GEO.cap, MAT.copBlue);
    cap.position.y = 1.88;
    g.add(cap);
    torso.material = MAT.copBlue;
  }
  if (opts.guard) {
    torso.material = MAT.guardGreen;
    const cap = new THREE.Mesh(GEO.cap, MAT.guardGreen);
    cap.position.y = 1.88;
    g.add(cap);
  }
  const shadow = blobShadow(0.9);
  g.add(shadow);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export function buildCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(GEO.crate, MAT.crateWood);
  box.position.y = 0.7;
  g.add(box);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.1, 1.46), new THREE.MeshStandardMaterial({ color: 0x5a4526, roughness: 0.9 }));
  edge.position.y = 1.42;
  g.add(edge);
  return g;
}

export function buildPickup(kind) {
  const m = new THREE.Mesh(GEO.pickupBox, kind === 'ammo' ? MAT.ammoGreen : MAT.healthWhite);
  m.position.y = 0.6;
  return m;
}

export function buildPalmInstances(positions) {
  // One InstancedMesh for trunks, one for leaves (6 per palm). Two draw calls total.
  const trunks = new THREE.InstancedMesh(GEO.palmTrunk, MAT.trunk, positions.length);
  const leaves = new THREE.InstancedMesh(GEO.palmLeaf, MAT.leaf, positions.length * 6);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  positions.forEach((p, i) => {
    const tilt = 0.12;
    e.set(tilt * Math.cos(p.a), p.a, tilt * Math.sin(p.a));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, 3, p.z), q, s);
    trunks.setMatrixAt(i, m);
    for (let l = 0; l < 6; l += 1) {
      const ang = (l / 6) * Math.PI * 2 + p.a;
      e.set(Math.PI / 2 - 0.55, ang, 0, 'YXZ');
      q.setFromEuler(e);
      const lx = p.x + Math.sin(ang) * 0.9;
      const lz = p.z + Math.cos(ang) * 0.9;
      m.compose(new THREE.Vector3(lx, 6.1, lz), q, new THREE.Vector3(1, 1, 0.35));
      leaves.setMatrixAt(i * 6 + l, m);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  return [trunks, leaves];
}

export function buildLampInstances(positions) {
  const poles = new THREE.InstancedMesh(GEO.lampPole, MAT.lamp, positions.length);
  const heads = new THREE.InstancedMesh(GEO.lampHead, MAT.lampGlow, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    m.makeTranslation(p.x, 2.75, p.z);
    poles.setMatrixAt(i, m);
    m.makeTranslation(p.x, 5.6, p.z);
    heads.setMatrixAt(i, m);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  return [poles, heads];
}
