// city.js — Port Solmar: road grid, buildings, palms, lamps, signs,
// harbor, beach, ocean, sky. One ground texture carries every road
// marking; repeated props use InstancedMesh (few draw calls).

import * as THREE from 'three';
import { rand, randInt, pick, clamp } from './utils.js';
import { makeWindowTexture, makeGroundTexture, makeSignTexture } from './textures.js';

export const LAYOUT = {
  avenues: [-80, -40, 0, 40, 80, 120, 160],
  streets: [-80, -40, 0, 40, 80, 120],
  roadW: 10,
  minX: -105,
  maxX: 205,
  minZ: -105,
  maxZ: 145,
  beachX: 190,
  harborX: 150,
  lots: [
    { x0: -33, z0: 45, x1: -7, z1: 74 },
    { x0: -33, z0: 85, x1: -7, z1: 115 },
  ],
  plaza: { x0: 8, z0: 8, x1: 32, z1: 32 },
};

const FACADE_COLORS = [0xd8c9a3, 0xc9b8a0, 0xb8a88e, 0x9fb4c0, 0xc09a8a, 0xa8b89a, 0xd0d0c8, 0xbfae90];
const CONTAINER_COLORS = [0xa83a2e, 0x2e6fa8, 0x3a7d44, 0xc07a28, 0x7a5a8a, 0x8a8a8a];

function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];
    this.buildGround();
    this.buildSky();
    this.buildOcean();
    this.buildBuildings();
    this.buildPalms();
    this.buildLamps();
    this.buildSigns();
    this.buildHarbor();
  }

  buildGround() {
    const tex = makeGroundTexture(LAYOUT);
    const geo = new THREE.PlaneGeometry(310, 310);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.set(50, 0, 20);
    this.scene.add(ground);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(420, 16, 12);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x6fa8d8);
    const horizon = new THREE.Color(0xffb37a);
    const bottom = new THREE.Color(0xf2c89b);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) / 420;
      if (y > 0.12) c.copy(horizon).lerp(top, clamp((y - 0.12) / 0.6, 0, 1));
      else c.copy(bottom).lerp(horizon, clamp((y + 0.2) / 0.32, 0, 1));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(geo, mat);
    this.scene.add(sky);
  }

  buildOcean() {
    const geo = new THREE.PlaneGeometry(150, 320);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e6f8e, roughness: 0.25, metalness: 0.1 });
    const ocean = new THREE.Mesh(geo, mat);
    ocean.position.set(280, -0.05, 20);
    this.scene.add(ocean);
  }

  buildBuildings() {
    const rng = this.rng;
    const hw = LAYOUT.roadW / 2;
    const xs = [LAYOUT.minX, ...LAYOUT.avenues.map((a) => a - hw), LAYOUT.maxX];
    const xe = [...LAYOUT.avenues.map((a) => a + hw), LAYOUT.maxX];
    const zs = [LAYOUT.minZ, ...LAYOUT.streets.map((s) => s - hw), LAYOUT.maxZ];
    const ze = [...LAYOUT.streets.map((s) => s + hw), LAYOUT.maxZ];
    const specs = [];
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < zs.length - 1; j += 1) {
        const block = { x0: xs[i], x1: xe[i + 1] || xe[i], z0: zs[j], z1: ze[j + 1] || ze[j] };
        // Fix edges: block spans from the end of one road to the start of the next.
        block.x0 = i === 0 ? LAYOUT.minX : LAYOUT.avenues[i - 1] + hw;
        block.x1 = i >= LAYOUT.avenues.length ? LAYOUT.maxX : LAYOUT.avenues[i] - hw;
        block.z0 = j === 0 ? LAYOUT.minZ : LAYOUT.streets[j - 1] + hw;
        block.z1 = j >= LAYOUT.streets.length ? LAYOUT.maxZ : LAYOUT.streets[j] - hw;
        if (block.x1 - block.x0 < 8 || block.z1 - block.z0 < 8) continue;
        if (block.x0 >= LAYOUT.harborX) continue;
        if (overlaps(block, LAYOUT.plaza)) continue;
        if (LAYOUT.lots.some((lot) => overlaps(block, lot))) continue;
        const cx = (block.x0 + block.x1) / 2;
        const cz = (block.z0 + block.z1) / 2;
        const downtown = Math.hypot(cx - 20, cz - 20) < 70;
        const count = randInt(rng, 1, 2);
        for (let k = 0; k < count; k += 1) {
          const w = count === 1
            ? rand(rng, 9, Math.min(18, block.x1 - block.x0 - 4))
            : rand(rng, 8, Math.min(11, (block.x1 - block.x0) / 2 - 4));
          const d = rand(rng, 9, Math.min(18, block.z1 - block.z0 - 4));
          const h = downtown ? rand(rng, 12, 30) : rand(rng, 8, 16);
          const x = count === 1 ? cx : cx + (k === 0 ? -1 : 1) * (block.x1 - block.x0) / 4;
          const z = count === 1 ? cz : cz + (k === 0 ? -1 : 1) * (block.z1 - block.z0) / 4;
          const bx0 = clamp(x - w / 2, block.x0 + 1, block.x1 - w - 1);
          const bz0 = clamp(z - d / 2, block.z0 + 1, block.z1 - d - 1);
          specs.push({ x: bx0 + w / 2, z: bz0 + d / 2, w, d, h, color: pick(rng, FACADE_COLORS) });
          this.colliders.push({ x0: bx0, x1: bx0 + w, z0: bz0, z1: bz0 + d });
        }
      }
    }
    // Warehouses in the harbor (low, wide).
    for (const [x, z, w, d] of [[168, -32, 22, 12], [172, 34, 20, 12], [160, 52, 16, 10]]) {
      specs.push({ x, z, w, d, h: 7, color: 0x9a938a });
      this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    }
    const winTex = makeWindowTexture();
    winTex.repeat.set(2, 2);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.85, metalness: 0.05 });
    const inst = new THREE.InstancedMesh(boxGeo, mat, specs.length);
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    roofGeo.translate(0, 0.5, 0);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, specs.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    specs.forEach((b, i) => {
      m.compose(v.set(b.x, 0, b.z), q, s.set(b.w, b.h, b.d));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(b.color));
      m.compose(v.set(b.x, b.h, b.z), q, s.set(b.w + 0.5, 0.6, b.d + 0.5));
      roofs.setMatrixAt(i, m);
      roofs.setColorAt(i, col.set(0x4a4440));
    });
    this.scene.add(inst);
    this.scene.add(roofs);
  }

  buildPalms() {
    const rng = this.rng;
    const spots = [];
    for (let z = -95; z <= 135; z += 13) {
      spots.push([155, z]);
      spots.push([166, z + 6]);
    }
    for (let z = -90; z <= 130; z += 16) spots.push([193, z]);
    for (const [x, z] of [[12, 12], [28, 12], [12, 28], [28, 28], [-30, 50], [-10, 70], [45, -75], [-75, 45]]) {
      spots.push([x, z]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 6.5, 6);
    trunkGeo.translate(0, 3.25, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crownGeo = new THREE.SphereGeometry(1.9, 7, 5);
    crownGeo.scale(1, 0.45, 1);
    crownGeo.translate(0, 6.6, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const sc = rand(rng, 0.85, 1.25);
      e.set(rand(rng, -0.07, 0.07), rand(rng, 0, Math.PI * 2), rand(rng, -0.07, 0.07));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, col.setHex(pick(rng, [0x2e7d32, 0x357a38, 0x2a6e2e])));
    });
    this.scene.add(trunks);
    this.scene.add(crowns);
  }

  buildLamps() {
    const spots = [];
    for (const a of LAYOUT.avenues) {
      for (const s of LAYOUT.streets) {
        spots.push([a + 6.5, s + 6.5, -1, -1]);
        spots.push([a - 6.5, s - 6.5, 1, 1]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.5, 6);
    poleGeo.translate(0, 2.75, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const headGeo = new THREE.SphereGeometry(0.24, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, ox, oz], i) => {
      m.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m);
      const len = Math.hypot(ox, oz) || 1;
      m.makeTranslation(x + (ox / len) * 1.3, 5.5, z + (oz / len) * 1.3);
      heads.setMatrixAt(i, m);
    });
    this.scene.add(poles);
    this.scene.add(heads);
  }

  buildSigns() {
    const defs = [
      { text: 'HOTEL SOLMAR', color: '#ffd23c', x: 84, z: -36, ry: -Math.PI / 2 },
      { text: 'GARAGE', color: '#ff8a3c', x: 62, z: 44, ry: Math.PI },
      { text: 'HOSPITAL', color: '#7ae0a8', x: -44, z: -38, ry: Math.PI / 2 },
      { text: 'BAR', color: '#ff5e7a', x: 38, z: 12, ry: -Math.PI / 2 },
      { text: 'TACOS', color: '#ffd23c', x: -38, z: 82, ry: Math.PI / 2 },
      { text: 'CINEMA', color: '#7ac8ff', x: 118, z: -2, ry: -Math.PI / 2 },
      { text: 'NEON', color: '#ff5ee1', x: 2, z: 78, ry: Math.PI },
      { text: 'PIZZA', color: '#ff8a3c', x: 78, z: 118, ry: 0 },
    ];
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 3.6, 6);
    poleGeo.translate(0, 1.8, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.4 });
    for (const def of defs) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(def.x, 0, def.z);
      this.scene.add(pole);
      const tex = makeSignTexture(def.text, def.color);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 1.15),
        new THREE.MeshBasicMaterial({ map: tex, transparent: false })
      );
      plane.position.set(def.x + Math.sin(def.ry) * 0.4, 3.7, def.z + Math.cos(def.ry) * 0.4);
      plane.rotation.y = def.ry;
      this.scene.add(plane);
    }
  }

  buildHarbor() {
    const rng = this.rng;
    const spots = [];
    for (let i = 0; i < 14; i += 1) {
      const x = rand(rng, 152, 186);
      const z = rand(rng, -30, 45);
      const stack = rng() < 0.3 ? 2 : 1;
      spots.push([x, z, stack, rng() < 0.5 ? 0 : Math.PI / 2]);
    }
    const geo = new THREE.BoxGeometry(6, 2.6, 2.6);
    geo.translate(0, 1.3, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.3 });
    let total = 0;
    for (const [, , stack] of spots) total += stack;
    const inst = new THREE.InstancedMesh(geo, mat, total);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    let idx = 0;
    for (const [x, z, stack, ry] of spots) {
      for (let lvl = 0; lvl < stack; lvl += 1) {
        e.set(0, ry, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(x, lvl * 2.6, z), q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(idx, m);
        inst.setColorAt(idx, col.setHex(pick(rng, CONTAINER_COLORS)));
        idx += 1;
      }
      // Containers are colliders (ground level only).
      const w = ry === 0 ? 6 : 2.6;
      const d = ry === 0 ? 2.6 : 6;
      this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    }
    this.scene.add(inst);
  }

  // Nearest point on the road network to (x, z).
  nearestRoadPoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const a of LAYOUT.avenues) {
      const d = Math.abs(x - a);
      if (d < bestD) {
        bestD = d;
        best = { x: a, z };
      }
    }
    for (const s of LAYOUT.streets) {
      const d = Math.abs(z - s);
      if (d < bestD) {
        bestD = d;
        best = { x, z: s };
      }
    }
    return best;
  }

  // A random point on a random road.
  randomRoadPoint(rng) {
    if (rng() < 0.5) {
      return { x: pick(rng, LAYOUT.avenues), z: rand(rng, LAYOUT.minZ + 5, LAYOUT.maxZ - 5) };
    }
    return { x: rand(rng, LAYOUT.minX + 5, 185), z: pick(rng, LAYOUT.streets) };
  }

  // Resolve circle vs building colliders + world bounds. Mutates pos.
  collide(pos, radius) {
    for (const box of this.colliders) {
      const fixed = pushOut(pos.x, pos.z, radius, box);
      if (fixed) {
        pos.x = fixed.x;
        pos.z = fixed.z;
      }
    }
    pos.x = clamp(pos.x, LAYOUT.minX + 1, LAYOUT.maxX - 1);
    pos.z = clamp(pos.z, LAYOUT.minZ + 1, LAYOUT.maxZ - 1);
  }
}

import { pushOutOfBox as pushOut } from './utils.js';
