// People on foot: sidewalk pedestrians (wander + flee), harbor guards
// (mission 4), and foot cops (chase + bust). All blocky characters with
// a walk-cycle swing; "down" characters lie flat, then get back up.
import { ROADS, PED_COUNT, SKIN_TONES, SHIRT_COLORS, GUARD_SPOTS } from './config.js';
import { randRange, randInt, randPick } from './rng.js';
import { buildCharacterMesh } from './models.js';

function makeWalker(scene, opts) {
  const mesh = buildCharacterMesh(opts);
  scene.add(mesh);
  return {
    mesh, x: 0, z: 0, heading: 0, speed: 0,
    state: 'walk', timer: 0, walkPhase: Math.random() * 6,
    downAmount: 0, punchCooldown: 0, bustTimer: 0, health: 2,
  };
}

export function animateWalker(w, dt) {
  const u = w.mesh.userData;
  const moving = w.speed > 0.2 && w.state !== 'down';
  if (moving) w.walkPhase += dt * w.speed * 2.4;
  const swing = moving ? Math.sin(w.walkPhase) * 0.55 : 0;
  u.legL.rotation.x += (swing - u.legL.rotation.x) * Math.min(1, dt * 12);
  u.legR.rotation.x += (-swing - u.legR.rotation.x) * Math.min(1, dt * 12);
  u.armL.rotation.x += (-swing * 0.8 - u.armL.rotation.x) * Math.min(1, dt * 12);
  u.armR.rotation.x += (swing * 0.8 - u.armR.rotation.x) * Math.min(1, dt * 12);
  // Lie flat when down, stand back up when recovered.
  const target = w.state === 'down' ? 1 : 0;
  w.downAmount += (target - w.downAmount) * Math.min(1, dt * 6);
  w.mesh.rotation.x = -w.downAmount * Math.PI * 0.5;
  w.mesh.position.set(w.x, w.downAmount * 0.35, w.z);
  w.mesh.rotation.y = w.heading;
  // Landing squash is applied to the torso scale by the caller via bodyScale.
  const s = w.bodyScale || 1;
  u.body.scale.set(2 - s, s, 2 - s);
}

function steerToward(w, tx, tz, dt, speed, turnRate = 6) {
  const dx = tx - w.x;
  const dz = tz - w.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return dist;
  const desired = Math.atan2(dx, dz);
  let diff = desired - w.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  w.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
  w.speed = speed;
  w.x += Math.sin(w.heading) * speed * dt;
  w.z += Math.cos(w.heading) * speed * dt;
  return dist;
}

export class PedSystem {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.peds = [];
    this.guards = [];
    this.cops = [];
    this.onBusted = null;
    this.onPlayerDamage = null;
    for (let i = 0; i < PED_COUNT; i += 1) this._spawnPed();
  }

  _spawnPed() {
    const rng = this.rng;
    const road = randPick(rng, ROADS);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const side = rng() < 0.5 ? -5 : 5;
    const along = randRange(rng, -170, 170);
    const w = makeWalker(this.scene, {
      shirt: randPick(rng, SHIRT_COLORS),
      pants: randPick(rng, [0x2b3a4a, 0x4a3a2b, 0x333333, 0x5a6a7a]),
      skin: randPick(rng, SKIN_TONES),
      hair: randPick(rng, [0x1a1a1a, 0x4a2e12, 0x8a6a3a, 0x6a6a6a]),
    });
    w.x = axis === 'x' ? along : road + side;
    w.z = axis === 'x' ? road + side : along;
    w.axis = axis;
    w.road = road;
    w.side = side;
    w.dir = rng() < 0.5 ? 1 : -1;
    w.heading = axis === 'x' ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI);
    w.walkSpeed = randRange(rng, 1.0, 1.5);
    w.mesh.position.set(w.x, 0, w.z);
    w.mesh.rotation.y = w.heading;
    this.peds.push(w);
    return w;
  }

  _pedTarget(w) {
    // Next intersection along the sidewalk, then maybe turn.
    if (w.axis === 'x') {
      const ahead = ROADS.filter((r) => (w.dir > 0 ? r > w.x + 2 : r < w.x - 2));
      if (!ahead.length) return null;
      const nx = w.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
      return { x: nx, z: w.road + w.side };
    }
    const ahead = ROADS.filter((r) => (w.dir > 0 ? r > w.z + 2 : r < w.z - 2));
    if (!ahead.length) return null;
    const nz = w.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
    return { x: w.road + w.side, z: nz };
  }

  _updatePed(w, dt) {
    if (w.state === 'down') {
      w.timer -= dt;
      w.speed = 0;
      if (w.timer <= 0) { w.state = 'walk'; w.health = 2; }
      animateWalker(w, dt);
      return;
    }
    if (w.state === 'flee') {
      w.timer -= dt;
      w.speed = 4;
      w.x += Math.sin(w.heading) * 4 * dt;
      w.z += Math.cos(w.heading) * 4 * dt;
      const res = this.city.collideCircle(w.x, w.z, 0.5);
      w.x = res.x;
      w.z = res.z;
      if (w.timer <= 0) {
        w.state = 'walk';
        // Re-anchor to the nearest sidewalk line.
        w.axis = 'x';
        w.road = ROADS.reduce((a, b) => (Math.abs(b - w.z) < Math.abs(a - w.z) ? b : a));
        w.side = w.z >= w.road ? 5 : -5;
        w.dir = Math.random() < 0.5 ? 1 : -1;
      }
      animateWalker(w, dt);
      return;
    }
    const target = this._pedTarget(w);
    if (!target) {
      w.dir *= -1;
      animateWalker(w, dt);
      return;
    }
    const dist = steerToward(w, target.x, target.z, dt, w.walkSpeed, 8);
    const res = this.city.collideCircle(w.x, w.z, 0.5);
    w.x = res.x;
    w.z = res.z;
    if (dist < 2.5) {
      const roll = this.rng();
      if (roll < 0.2) {
        // Turn onto the crossing sidewalk: the new road line is the
        // intersection the ped just reached (its x when walking along
        // x, its z when walking along z).
        const cross = w.axis === 'x' ? w.x : w.z;
        w.axis = w.axis === 'x' ? 'z' : 'x';
        w.road = ROADS.reduce((a, b) => (Math.abs(b - cross) < Math.abs(a - cross) ? b : a));
        w.side = this.rng() < 0.5 ? -5 : 5;
        w.dir = this.rng() < 0.5 ? 1 : -1;
      } else if (roll < 0.3) {
        w.dir *= -1;
      }
    }
    animateWalker(w, dt);
  }

  // Loud events (shots, punches, crashes) scare nearby peds.
  scare(x, z, radius = 15) {
    for (const w of this.peds) {
      if (w.state !== 'walk') continue;
      const dx = w.x - x;
      const dz = w.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.01) {
        w.state = 'flee';
        w.timer = 3;
        w.heading = Math.atan2(dx / d, dz / d);
      }
    }
  }

  nearestPed(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const w of this.peds) {
      if (w.state === 'down') continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  positions() {
    return this.peds.map((w) => ({ x: w.x, z: w.z, state: w.state }));
  }

  knockDown(w, seconds = 8) {
    if (!w || w.state === 'down') return false;
    w.state = 'down';
    w.timer = seconds;
    w.speed = 0;
    return true;
  }

  spawnGuards() {
    if (this.guards.length) return;
    const rng = this.rng;
    for (const [x, z] of GUARD_SPOTS) {
      const w = makeWalker(this.scene, {
        shirt: 0x3a3a3a, pants: 0x222222,
        skin: randPick(rng, SKIN_TONES), hair: 0x1a1a1a,
      });
      w.x = x;
      w.z = z;
      w.heading = rng() * Math.PI * 2;
      w.health = 2;
      w.isGuard = true;
      w.mesh.position.set(x, 0, z);
      this.guards.push(w);
    }
  }

  _updateGuard(w, dt, player) {
    if (w.state === 'down') {
      w.timer -= dt;
      w.speed = 0;
      if (w.timer <= 0) { w.state = 'walk'; w.health = 2; }
      animateWalker(w, dt);
      return;
    }
    const d = Math.hypot(player.x - w.x, player.z - w.z);
    const active = !player.inCar && d < 30;
    if (!active) {
      w.speed = 0;
      w.heading += Math.sin(performance.now() / 3000 + w.x) * 0.002;
      animateWalker(w, dt);
      return;
    }
    if (d > 2.2) {
      steerToward(w, player.x, player.z, dt, 4.6, 7);
      const res = this.city.collideCircle(w.x, w.z, 0.5);
      w.x = res.x;
      w.z = res.z;
    } else {
      w.speed = 0;
      w.punchCooldown -= dt;
      if (w.punchCooldown <= 0) {
        w.punchCooldown = 1;
        if (this.onPlayerDamage) this.onPlayerDamage(5, w.x, w.z);
      }
    }
    animateWalker(w, dt);
  }

  spawnCop(x, z) {
    const w = makeWalker(this.scene, {
      shirt: 0x1d2a44, pants: 0x1d2a44,
      skin: randPick(this.rng, SKIN_TONES), hair: 0x1a1a1a, hat: 'police',
    });
    w.x = x;
    w.z = z;
    w.health = 2;
    w.isCop = true;
    w.mesh.position.set(x, 0, z);
    this.cops.push(w);
    return w;
  }

  _updateCop(w, dt, player, wanted) {
    if (w.state === 'down') {
      w.timer -= dt;
      w.speed = 0;
      if (w.timer <= 0) { w.state = 'walk'; w.health = 2; }
      animateWalker(w, dt);
      return;
    }
    if (wanted < 2) {
      // Heat is off: cops jog away and leave.
      const away = Math.atan2(w.x - player.x, w.z - player.z);
      w.heading = away;
      w.speed = 3;
      w.x += Math.sin(away) * 3 * dt;
      w.z += Math.cos(away) * 3 * dt;
      animateWalker(w, dt);
      return;
    }
    const d = Math.hypot(player.x - w.x, player.z - w.z);
    if (d > 2.5) {
      steerToward(w, player.x, player.z, dt, 5.6, 7);
      const res = this.city.collideCircle(w.x, w.z, 0.5);
      w.x = res.x;
      w.z = res.z;
      w.bustTimer = 0;
    } else {
      w.speed = 0;
      if (!player.inCar) {
        w.bustTimer += dt;
        if (w.bustTimer >= 2.5 && this.onBusted) this.onBusted();
      } else {
        w.bustTimer = 0;
      }
    }
    animateWalker(w, dt);
  }

  removeCop(w) {
    this.scene.remove(w.mesh);
    this.cops = this.cops.filter((c) => c !== w);
  }

  update(dt, player, wanted, missionIndex) {
    for (const w of this.peds) this._updatePed(w, dt);
    if (missionIndex === 3) {
      for (const w of this.guards) this._updateGuard(w, dt, player);
    } else {
      for (const w of this.guards) { w.speed = 0; animateWalker(w, dt); }
    }
    for (const w of [...this.cops]) {
      this._updateCop(w, dt, player, wanted);
      // Cops who ran far away while the heat is off leave the scene.
      if (wanted < 2 && Math.hypot(w.x - player.x, w.z - player.z) > 60) this.removeCop(w);
    }
  }
}
