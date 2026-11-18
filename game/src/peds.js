// peds.js — pedestrians on the sidewalks. They walk the road grid,
// flee from gunshots and crashes, fall down when punched or shot, and
// get up again. Harbor guards chase the player during mission 4.

import { rand, pick, clamp, angleLerp, dist2D, forwardOf } from './utils.js';
import { createPersonMesh } from './models.js';
import { LAYOUT } from './city.js';

const SHIRTS = [0xc94f4f, 0x4f7ac9, 0x4fc96e, 0xc9a44f, 0x8a5fc9, 0x4fc9c2, 0xd0d0d0, 0x8a6a4f];
const PANTS = [0x2a2d34, 0x3a4a5a, 0x5a4a3a, 0x222222, 0x4a3a5a];
const SKINS = [0xc98e6b, 0x8a5a3a, 0xe8b89a, 0x6e4530, 0xd9a077];
const HAIRS = [0x1c1c22, 0x4a2e1a, 0x8a8a8a, 0x2e1a0a, 0x6e4a1a];

export class PedManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.spawnInitial();
  }

  makePed(x, z, kind = 'civilian') {
    const mesh = kind === 'guard'
      ? createPersonMesh(0x2a2a2e, 0x1c1c20, pick(this.rng, SKINS), 0x111111)
      : createPersonMesh(pick(this.rng, SHIRTS), pick(this.rng, PANTS), pick(this.rng, SKINS), pick(this.rng, HAIRS));
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = {
      mesh,
      x,
      z,
      heading: rand(this.rng, 0, Math.PI * 2),
      speed: kind === 'guard' ? 0 : rand(this.rng, 1.2, 1.8),
      state: 'walk',
      kind,
      target: null,
      downTimer: 0,
      fleeTimer: 0,
      fleeFrom: null,
      attackTimer: 0,
      walkPhase: rand(this.rng, 0, Math.PI * 2),
      road: null,
      roadCoord: 0,
      dir: 1,
    };
    if (kind === 'civilian') this.assignRoad(ped);
    this.peds.push(ped);
    return ped;
  }

  spawnInitial() {
    for (let i = 0; i < 18; i += 1) {
      const p = this.city.randomRoadPoint(this.rng);
      const onAve = this.rng() < 0.5;
      const x = onAve ? p.x + 6.5 : p.x;
      const z = onAve ? p.z : p.z + 6.5;
      this.makePed(x, z);
    }
  }

  assignRoad(ped) {
    const onAve = this.rng() < 0.5;
    ped.road = onAve ? 'ave' : 'street';
    ped.roadCoord = onAve ? pick(this.rng, LAYOUT.avenues) : pick(this.rng, LAYOUT.streets);
    ped.dir = this.rng() < 0.5 ? 1 : -1;
    ped.target = this.nextSidewalkPoint(ped);
  }

  nextSidewalkPoint(ped) {
    const coords = ped.road === 'ave' ? LAYOUT.streets : LAYOUT.avenues;
    const along = ped.road === 'ave' ? ped.z : ped.x;
    let next = null;
    for (const c of coords) {
      if (ped.dir > 0 && c > along + 1) {
        next = c;
        break;
      }
      if (ped.dir < 0 && c < along - 1) next = c;
    }
    if (next === null) {
      ped.dir *= -1;
      return this.nextSidewalkPoint(ped);
    }
    const side = 6.5;
    if (ped.road === 'ave') return { x: ped.roadCoord + side, z: next };
    return { x: next, z: ped.roadCoord + side };
  }

  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk' || ped.kind !== 'civilian') continue;
      if (dist2D(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
        ped.fleeFrom = { x, z };
      }
    }
  }

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = 10;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  spawnGuard(x, z) {
    return this.makePed(x, z, 'guard');
  }

  removeGuards() {
    for (const ped of this.peds) {
      if (ped.kind === 'guard') {
        this.scene.remove(ped.mesh);
        ped.removed = true;
      }
    }
    this.peds = this.peds.filter((p) => !p.removed);
  }

  nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const ped of this.peds) {
      if (ped.state === 'down' || ped.kind !== 'civilian') continue;
      const d = dist2D(ped.x, ped.z, x, z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  positions() {
    return this.peds.map((p) => ({ x: p.x, z: p.z, state: p.state }));
  }

  update(dt, player, onGuardHit) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.fleeTimer = 4;
          ped.fleeFrom = { x: player.x, z: player.z };
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          if (ped.kind === 'civilian') this.assignRoad(ped);
        }
        continue;
      }
      if (ped.kind === 'guard') {
        // Guards chase the player and punch on contact.
        const d = dist2D(ped.x, ped.z, player.x, player.z);
        ped.attackTimer -= dt;
        if (d < 22) {
          const targetHeading = Math.atan2(player.x - ped.x, player.z - ped.z);
          ped.heading = angleLerp(ped.heading, targetHeading, Math.min(1, dt * 6));
          if (d > 1.6) {
            const fwd = forwardOf(ped.heading);
            ped.x += fwd.x * 4.2 * dt;
            ped.z += fwd.z * 4.2 * dt;
            ped.walkPhase += dt * 10;
          } else if (ped.attackTimer <= 0) {
            ped.attackTimer = 1.2;
            if (onGuardHit) onGuardHit(ped);
          }
        }
        const pos = { x: ped.x, z: ped.z };
        this.city.collide(pos, 0.5);
        ped.x = pos.x;
        ped.z = pos.z;
        ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
        ped.mesh.rotation.y = ped.heading;
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = Math.atan2(ped.x - ped.fleeFrom.x, ped.z - ped.fleeFrom.z);
        ped.heading = angleLerp(ped.heading, away, Math.min(1, dt * 5));
        const fwd = forwardOf(ped.heading);
        ped.x += fwd.x * 4 * dt;
        ped.z += fwd.z * 4 * dt;
        ped.walkPhase += dt * 11;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          this.assignRoad(ped);
        }
      } else {
        if (!ped.target) ped.target = this.nextSidewalkPoint(ped);
        const d = dist2D(ped.x, ped.z, ped.target.x, ped.target.z);
        if (d < 1.5) {
          if (this.rng() < 0.4) {
            this.assignRoad(ped);
          } else {
            ped.target = this.nextSidewalkPoint(ped);
          }
        } else {
          const targetHeading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
          ped.heading = angleLerp(ped.heading, targetHeading, Math.min(1, dt * 4));
          const fwd = forwardOf(ped.heading);
          ped.x += fwd.x * ped.speed * dt;
          ped.z += fwd.z * ped.speed * dt;
          ped.walkPhase += dt * 8;
        }
      }
      const pos = { x: ped.x, z: ped.z };
      this.city.collide(pos, 0.5);
      ped.x = pos.x;
      ped.z = pos.z;
      ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }
}
