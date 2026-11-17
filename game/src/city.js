// Port Solmar: the city itself. Road grid, buildings, harbor, beach,
// ocean, palms, lamps, neon signs. Builds once; exposes colliders and
// road helpers for the gameplay systems.
import * as THREE from 'three';
import { ROADS, ROAD_HALF, WORLD_HALF, BUILDING_COLORS, NEON_SIGNS } from './config.js';
import { randRange, randInt, randPick } from './rng.js';
import { makeBuildingTexture, makeRoadTexture, makeSignTexture, makeSkyTexture, makeParkingTexture } from './textures.js';
import { buildPalm, buildLamp, buildContainer, buildCrane, buildBarrel, buildBench, buildCrate } from './models.js';

const BLOCK_EDGES = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];

function isHarborBlock(x0, z0) {
  return x0 >= 120 && z0 >= -80 && z0 < 80;
}
function isBeachBlock(z0) {
  return z0 >= 160;
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._buildSky();
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildHarbor();
    this._buildBeach();
    this._buildLamps();
    this._buildSpecials();
  }

  addCollider(x0, z0, x1, z1) {
    this.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  // Push a circle out of every collider it overlaps. Returns the
  // corrected position plus whether a hit happened.
  collideCircle(x, z, r) {
    let hit = false;
    for (let iter = 0; iter < 2; iter += 1) {
      for (const c of this.colliders) {
        const cx = Math.max(c.x0, Math.min(x, c.x1));
        const cz = Math.max(c.z0, Math.min(z, c.z1));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the smallest penetration.
            const pushL = x - c.x0 + r;
            const pushR = c.x1 - x + r;
            const pushT = z - c.z0 + r;
            const pushB = c.z1 - z + r;
            const m = Math.min(pushL, pushR, pushT, pushB);
            if (m === pushL) x = c.x0 - r;
            else if (m === pushR) x = c.x1 + r;
            else if (m === pushT) z = c.z0 - r;
            else z = c.z1 + r;
          }
        }
      }
    }
    return { x, z, hit };
  }

  pointBlocked(x, z, r = 0.6) {
    for (const c of this.colliders) {
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    return false;
  }

  // Nearest point on the road grid to (x, z).
  nearestRoadPoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const r of ROADS) {
      const dX = Math.abs(x - r);
      if (dX < bestD) { bestD = dX; best = { x: r, z }; }
      const dZ = Math.abs(z - r);
      if (dZ < bestD) { bestD = dZ; best = { x, z: r }; }
    }
    return best;
  }

  _buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 16, 12),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
    );
    this.group.add(sky);
    // Low sun disc for the late-afternoon look.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(22, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
    );
    sun.position.set(-180, 120, -320);
    sun.lookAt(0, 0, 0);
    this.group.add(sun);
  }

  _buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0xa8895a }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(416, 416),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0.01;
    this.group.add(slab);
    // Beach sand along the south edge.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(430, 40),
      new THREE.MeshLambertMaterial({ color: 0xe8d5a0 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.015, 188);
    this.group.add(sand);
    // Ocean: south and east.
    const oceanMat = new THREE.MeshLambertMaterial({ color: 0x2e7fa8 });
    const oceanS = new THREE.Mesh(new THREE.PlaneGeometry(560, 220), oceanMat);
    oceanS.rotation.x = -Math.PI / 2;
    oceanS.position.set(0, -0.05, 318);
    this.group.add(oceanS);
    const oceanE = new THREE.Mesh(new THREE.PlaneGeometry(220, 560), oceanMat);
    oceanE.rotation.x = -Math.PI / 2;
    oceanE.position.set(318, -0.05, 0);
    this.group.add(oceanE);
  }

  _buildRoads() {
    const tex = makeRoadTexture();
    const len = 416;
    const roadMat = new THREE.MeshLambertMaterial({ map: tex });
    for (const r of ROADS) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), roadMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(r, 0.02, 0);
      this.group.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), roadMat);
      h.rotation.x = -Math.PI / 2;
      h.rotation.z = Math.PI / 2;
      h.position.set(0, 0.025, r);
      this.group.add(h);
    }
  }

  _facadeTextures() {
    if (this._facades) return this._facades;
    const rng = this.rng;
    this._facades = [];
    for (let i = 0; i < 4; i += 1) {
      this._facades.push(makeBuildingTexture(
        randPick(rng, BUILDING_COLORS), randInt(rng, 4, 8), randInt(rng, 4, 6), rng,
      ));
    }
    this._facadeCache = new Map();
    return this._facades;
  }

  // Facade texture tiled horizontally so windows stay ~1.2 m wide on
  // wide buildings instead of stretching into giant squares. Cached by
  // (facade, repeat) so the GPU only uploads a handful of variants.
  _facadeFor(width) {
    const facades = this._facadeTextures();
    const fi = Math.floor(this.rng() * facades.length);
    const rx = Math.max(1, Math.round(width / 12));
    const key = `${fi}:${rx}`;
    if (!this._facadeCache.has(key)) {
      const tex = facades[fi].clone();
      tex.needsUpdate = true;
      tex.repeat.set(rx, 1);
      this._facadeCache.set(key, tex);
    }
    return this._facadeCache.get(key);
  }

  _addBuilding(cx, cz, w, d, h, sign = null) {
    const tex = this._facadeFor(w);
    const side = new THREE.MeshLambertMaterial({ map: tex });
    const roof = new THREE.MeshLambertMaterial({ color: 0x6b6259 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
    mesh.position.set(cx, h / 2, cz);
    this.group.add(mesh);
    // Roof slab + parapet lip.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5),
      new THREE.MeshLambertMaterial({ color: 0x7a7268 }),
    );
    slab.position.set(cx, h + 0.2, cz);
    this.group.add(slab);
    if (this.rng() < 0.35) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10),
        new THREE.MeshLambertMaterial({ color: 0x8a8f94 }),
      );
      tank.position.set(cx + w * 0.25, h + 1.3, cz - d * 0.2);
      this.group.add(tank);
    }
    this.addCollider(cx - w / 2 - 0.3, cz - d / 2 - 0.3, cx + w / 2 + 0.3, cz + d / 2 + 0.3);
    if (sign) {
      const texSign = makeSignTexture(sign.text, sign.color);
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 1.6),
        new THREE.MeshBasicMaterial({ map: texSign }),
      );
      plate.position.set(cx, Math.min(h * 0.62, 9), cz + d / 2 + 0.12);
      this.group.add(plate);
    }
    return mesh;
  }

  _buildBlocks() {
    const rng = this.rng;
    let signIndex = 0;
    for (let ix = 0; ix < BLOCK_EDGES.length - 1; ix += 1) {
      for (let iz = 0; iz < BLOCK_EDGES.length - 1; iz += 1) {
        const x0 = BLOCK_EDGES[ix];
        const x1 = BLOCK_EDGES[ix + 1];
        const z0 = BLOCK_EDGES[iz];
        const z1 = BLOCK_EDGES[iz + 1];
        if (isHarborBlock(x0, z0) || isBeachBlock(z0)) continue;
        // Parking lot block: paved lot, no buildings.
        if (x0 === -40 && z0 === 80) {
          const lot = new THREE.Mesh(
            new THREE.PlaneGeometry(36, 36),
            new THREE.MeshLambertMaterial({ map: makeParkingTexture() }),
          );
          lot.rotation.x = -Math.PI / 2;
          lot.position.set(-20, 0.015, 100);
          this.group.add(lot);
          continue;
        }
        // Plaza block: palms, benches, planter.
        if (x0 === 0 && z0 === 0) {
          const plaza = new THREE.Mesh(
            new THREE.PlaneGeometry(36, 36),
            new THREE.MeshLambertMaterial({ color: 0xb8ad9a }),
          );
          plaza.rotation.x = -Math.PI / 2;
          plaza.position.set(20, 0.015, 20);
          this.group.add(plaza);
          for (const [px, pz] of [[6, 6], [34, 6], [6, 34], [34, 34]]) {
            const palm = buildPalm(randRange(rng, 0.85, 1.1));
            palm.position.set(px, 0, pz);
            palm.rotation.y = rng() * Math.PI * 2;
            this.group.add(palm);
          }
          for (const [bx, bz, ry] of [[20, 8, 0], [20, 32, Math.PI], [8, 20, Math.PI / 2], [32, 20, -Math.PI / 2]]) {
            const bench = buildBench();
            bench.position.set(bx, 0, bz);
            bench.rotation.y = ry;
            this.group.add(bench);
          }
          const planter = new THREE.Mesh(
            new THREE.CylinderGeometry(2.6, 2.8, 0.9, 12),
            new THREE.MeshLambertMaterial({ color: 0x8a7a5a }),
          );
          planter.position.set(20, 0.45, 20);
          this.group.add(planter);
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(1.8, 10, 8),
            new THREE.MeshLambertMaterial({ color: 0x3f8f5a }),
          );
          bush.position.set(20, 1.6, 20);
          this.group.add(bush);
          this.addCollider(17, 17, 23, 23);
          continue;
        }
        // Special blocks get their own buildings in _buildSpecials.
        if ((x0 === 40 && z0 === -80) || (x0 === -40 && z0 === 120) || (x0 === 0 && z0 === -80)) continue;

        const ix0 = x0 + 6;
        const ix1 = x1 - 6;
        const iz0 = z0 + 6;
        const iz1 = z1 - 6;
        const bw = ix1 - ix0;
        const bd = iz1 - iz0;
        const downtown = Math.abs((x0 + x1) / 2) < 80 && Math.abs((z0 + z1) / 2) < 80;
        const count = rng() < 0.55 ? 1 : 2;
        for (let b = 0; b < count; b += 1) {
          let w;
          let d;
          let cx;
          let cz;
          if (count === 1) {
            w = randRange(rng, bw * 0.55, bw * 0.85);
            d = randRange(rng, bd * 0.55, bd * 0.85);
            cx = (ix0 + ix1) / 2 + randRange(rng, -2, 2);
            cz = (iz0 + iz1) / 2 + randRange(rng, -2, 2);
          } else if (b === 0) {
            w = randRange(rng, bw * 0.4, bw * 0.48);
            d = randRange(rng, bd * 0.5, bd * 0.8);
            cx = ix0 + w / 2 + 1;
            cz = (iz0 + iz1) / 2;
          } else {
            w = randRange(rng, bw * 0.4, bw * 0.48);
            d = randRange(rng, bd * 0.5, bd * 0.8);
            cx = ix1 - w / 2 - 1;
            cz = (iz0 + iz1) / 2;
          }
          const h = randRange(rng, 8, 20) + (downtown ? randRange(rng, 0, 12) : 0);
          let sign = null;
          if (signIndex < NEON_SIGNS.length && rng() < 0.3) {
            sign = NEON_SIGNS[signIndex];
            signIndex += 1;
          }
          this._addBuilding(cx, cz, w, d, h, sign);
        }
        // A palm or two in the leftover corner of some blocks.
        if (rng() < 0.3) {
          const palm = buildPalm(randRange(rng, 0.8, 1.05));
          palm.position.set(randRange(rng, ix0 + 2, ix1 - 2), 0, randRange(rng, iz0 + 2, iz1 - 2));
          palm.rotation.y = rng() * Math.PI * 2;
          this.group.add(palm);
        }
      }
    }
  }

  _buildHarbor() {
    const rng = this.rng;
    // Concrete dock slab.
    const dock = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 130),
      new THREE.MeshLambertMaterial({ color: 0x8a8378 }),
    );
    dock.rotation.x = -Math.PI / 2;
    dock.position.set(171, 0.03, 0);
    this.group.add(dock);
    // Container stacks.
    const contColors = [0xc23b2e, 0x2e6fc2, 0x3f8f5a, 0xd8a13c, 0x7a4fa3];
    const spots = [[148, -44], [148, -30], [160, -52], [192, 28], [192, 44], [150, 52], [196, -52]];
    for (const [x, z] of spots) {
      const c1 = buildContainer(randPick(rng, contColors));
      c1.position.set(x, 0, z);
      c1.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      this.group.add(c1);
      this.addCollider(x - 3.2, z - 1.5, x + 3.2, z + 1.5);
      if (rng() < 0.5) {
        const c2 = buildContainer(randPick(rng, contColors));
        c2.position.set(x, 2.6, z);
        c2.rotation.y = c1.rotation.y;
        this.group.add(c2);
      }
    }
    // Crane over the dock.
    const crane = buildCrane();
    crane.position.set(194, 0, -32);
    crane.rotation.y = Math.PI / 2;
    this.group.add(crane);
    this.addCollider(192, -34, 196, -30);
    // Barrels and decorative crates (away from the mission crate spots).
    for (const [x, z] of [[146, 20], [147, 22], [188, -8], [190, 14]]) {
      const b = buildBarrel(randPick(rng, [0x7a6a4a, 0x4a6a7a, 0x7a4a4a]));
      b.position.set(x, 0, z);
      this.group.add(b);
    }
    for (const [x, z] of [[150, -8], [186, 20], [162, 30]]) {
      const crate = buildCrate(1.4);
      crate.position.set(x, 0, z);
      crate.rotation.y = rng() * Math.PI;
      this.group.add(crate);
      this.addCollider(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
    }
    // Dock edge bollards along the water.
    for (let z = -56; z <= 56; z += 16) {
      const bol = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: 0x2b2b2b }),
      );
      bol.position.set(203, 0.4, z);
      this.group.add(bol);
    }
    // Extra dock clutter around the mission crates so the harbor reads
    // busy up close: barrels, pallets, painted loading stripes, a
    // dock-office shack. All kept 3 m+ from the mission crate spots.
    for (const [x, z] of [[160, -6], [176, 10], [186, -10], [164, 14]]) {
      const b = buildBarrel(randPick(rng, [0x7a6a4a, 0x4a6a7a, 0x7a4a4a]));
      b.position.set(x, 0, z);
      this.group.add(b);
    }
    for (const [x, z, ry] of [[168, -8, 0.3], [178, 2, -0.2], [186, 8, 0.5]]) {
      const pallet = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.16, 1.3),
        new THREE.MeshLambertMaterial({ color: 0x9a7a4a }),
      );
      pallet.position.set(x, 0.1, z);
      pallet.rotation.y = ry;
      this.group.add(pallet);
    }
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd8b93c });
    for (const [x, z, ry] of [[166, -14, 0], [170, 12, 0.4], [180, -12, -0.3]]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.5), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = ry;
      stripe.position.set(x, 0.045, z);
      this.group.add(stripe);
    }
    // Dock-office shack with a slanted roof.
    const shack = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.8, 3),
      new THREE.MeshLambertMaterial({ color: 0xa89068 }),
    );
    walls.position.y = 1.4;
    const roofM = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.15, 3.5),
      new THREE.MeshLambertMaterial({ color: 0x7a5a3a }),
    );
    roofM.position.y = 3;
    roofM.rotation.z = 0.12;
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x2c3a44 }),
    );
    win.position.set(0.6, 1.7, 1.52);
    shack.add(walls, roofM, win);
    shack.position.set(148, 0, -18);
    shack.rotation.y = 0.3;
    this.group.add(shack);
    this.addCollider(145.8, -20.2, 150.2, -15.8);
  }

  _buildBeach() {
    const rng = this.rng;
    // Palm row along the beach.
    for (let x = -196; x <= 196; x += 20) {
      if (rng() < 0.25) continue;
      const palm = buildPalm(randRange(rng, 0.9, 1.25));
      palm.position.set(x + randRange(rng, -3, 3), 0, randRange(rng, 172, 198));
      palm.rotation.y = rng() * Math.PI * 2;
      this.group.add(palm);
    }
    // Palm-lined boulevard along road z=160.
    for (let x = -180; x <= 180; x += 24) {
      const palm = buildPalm(randRange(rng, 0.85, 1.1));
      palm.position.set(x, 0, 154.5);
      palm.rotation.y = rng() * Math.PI * 2;
      this.group.add(palm);
    }
    // A couple of beach umbrellas (cone on a pole) for colour.
    for (const [x, z, col] of [[-60, 186, 0xff2e88], [40, 190, 0x2eff8f], [120, 184, 0x3cc8ff]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xe8e3d5 }));
      pole.position.set(x, 1.2, z);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(1.8, 0.7, 8),
        new THREE.MeshLambertMaterial({ color: col }),
      );
      top.position.set(x, 2.6, z);
      this.group.add(pole, top);
    }
  }

  _buildLamps() {
    const lampRoads = [-80, 0, 80];
    // Street lamps, MID-BLOCK (t offset 30 from the road grid): a lamp
    // at an intersection sits on the crossing road's centerline and a
    // chase camera driving up that road ends up staring straight down
    // its pole. Mid-block lamps keep every road's sight line clear.
    for (const r of lampRoads) {
      for (let t = -170; t <= 150; t += 40) {
        const lampV = buildLamp();
        lampV.position.set(r + 5.2, 0, t);
        lampV.rotation.y = -Math.PI / 2;
        this.group.add(lampV);
        const lampH = buildLamp();
        lampH.position.set(t, 0, r + 5.2);
        lampH.rotation.y = Math.PI;
        this.group.add(lampH);
      }
    }
  }

  _buildSpecials() {
    // Sol's garage: low wide building with a big door facing road z=-40.
    const garage = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(16, 5.5, 12),
      new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
    );
    shell.position.set(60, 2.75, -52);
    garage.add(shell);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(9, 3.6, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
    );
    door.position.set(60, 1.8, -45.9);
    garage.add(door);
    const signTex = makeSignTexture("SOL'S GARAGE", '#ff7a3c');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.8),
      new THREE.MeshBasicMaterial({ map: signTex }),
    );
    sign.position.set(60, 4.6, -45.85);
    garage.add(sign);
    this.group.add(garage);
    this.addCollider(51.7, -58.3, 68.3, -45.7);

    // Hospital: white block with a red-cross sign.
    const hosp = new THREE.Mesh(
      new THREE.BoxGeometry(18, 12, 14),
      new THREE.MeshLambertMaterial({ color: 0xeef0ea }),
    );
    hosp.position.set(-20, 6, 140);
    this.group.add(hosp);
    const hSign = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.8),
      new THREE.MeshBasicMaterial({ map: makeSignTexture('HOSPITAL', '#ff2a22') }),
    );
    hSign.position.set(-20, 9.5, 147.1);
    this.group.add(hSign);
    this.addCollider(-29.3, 132.7, -10.7, 147.3);

    // Police station: blue-grey block.
    const station = new THREE.Mesh(
      new THREE.BoxGeometry(16, 9, 12),
      new THREE.MeshLambertMaterial({ color: 0x8fa3b8 }),
    );
    station.position.set(20, 4.5, -60);
    this.group.add(station);
    const pSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.6),
      new THREE.MeshBasicMaterial({ map: makeSignTexture('POLICE', '#3cc8ff') }),
    );
    pSign.position.set(20, 7, -53.9);
    this.group.add(pSign);
    this.addCollider(11.7, -66.3, 28.3, -53.7);
  }
}

export { WORLD_HALF };
