// People: pedestrians (wander, flee), foot cops (chase, bust), harbor guards (shoot).
import { buildPerson } from './models.js';
import { range, pick, clamp, dist2 } from './random.js';
import { ROADS } from './config.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x50b06a, 0xe8a34a, 0x9b59b6, 0xdddddd, 0x2ecc71, 0xe67e22];
const PANTS = [0x2c3e50, 0x5a4a3a, 0x333333, 0x4a5a7d, 0x6b5a4a];

// A random sidewalk point: alongside a road, 6.5 m off its centre line.
export function sidewalkPoint(rng) {
  const horizontal = rng() < 0.5;
  const road = pick(rng, ROADS);
  const along = range(rng, -160, 160);
  const off = (rng() < 0.5 ? -6.5 : 6.5);
  return horizontal ? { x: along, z: road + off } : { x: road + off, z: along };
}

export class Ped {
  constructor(scene, x, z, rng) {
    this.mesh = buildPerson(pick(rng, SHIRTS), pick(rng, PANTS));
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.state = 'walk'; // walk | flee | down
    this.hp = 50;
    this.speed = range(rng, 1.0, 1.6);
    this.target = sidewalkPoint(rng);
    this.walkPhase = rng() * 6;
    this.downT = 0;
    this.fleeT = 0;
    this.alive = true;
    this.rng = rng;
  }
  get pos() { return { x: this.x, z: this.z, state: this.state }; }

  fleeFrom(x, z) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeT = 3;
    const dx = this.x - x, dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.x + (dx / d) * 26, z: this.z + (dz / d) * 26 };
  }
  damage(amount) {
    if (this.state === 'down') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'down';
      this.downT = 20;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.35;
      return true;
    }
    return false;
  }
  update(dt) {
    if (this.state === 'down') {
      this.downT -= dt;
      if (this.downT <= 0) {
        this.state = 'walk';
        this.hp = 50;
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.target = sidewalkPoint(this.rng);
      }
      return;
    }
    const speed = this.state === 'flee' ? 3.6 : this.speed;
    if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) { this.state = 'walk'; this.target = sidewalkPoint(this.rng); }
    }
    const dx = this.target.x - this.x, dz = this.target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      this.target = sidewalkPoint(this.rng);
      return;
    }
    this.heading = Math.atan2(dx, dz);
    this.x += (dx / d) * speed * dt;
    this.z += (dz / d) * speed * dt;
    this.x = clamp(this.x, -192, 192);
    this.z = clamp(this.z, -192, 192);
    this.walkPhase += dt * speed * 4;
    const swing = Math.sin(this.walkPhase) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
  remove(scene) { scene.remove(this.mesh); this.alive = false; }
}

export class FootCop {
  constructor(scene, x, z) {
    this.mesh = buildPerson(0x1c2f57, 0x1c2f57, { cop: true });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 6.5;
    this.bustT = 0;
    this.walkPhase = 0;
    this.alive = true;
  }
  update(dt, world) {
    const px = world.player.x, pz = world.player.z;
    const d = Math.hypot(px - this.x, pz - this.z);
    if (world.inCar || world.state !== 'playing') {
      // Fall behind when the player drives off; despawn far away.
      if (d > 70) { this.alive = false; world.scene.remove(this.mesh); }
      return;
    }
    this.heading = Math.atan2(px - this.x, pz - this.z);
    if (d > 2.2) {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.bustT = 0;
    } else {
      this.bustT += dt;
      if (this.bustT > 1.5) world.bust();
    }
    this.walkPhase += dt * this.speed * 4;
    const swing = Math.sin(this.walkPhase) * 0.55;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class Guard {
  constructor(scene, x, z) {
    this.mesh = buildPerson(0x2f4a2a, 0x2f4a2a, { guard: true });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.homeX = x; this.homeZ = z;
    this.heading = 0;
    this.hp = 100;
    this.shootT = 1;
    this.patrolT = 0;
    this.state = 'patrol'; // patrol | down
    this.downT = 0;
    this.alive = true;
    this.walkPhase = 0;
  }
  damage(amount) {
    if (this.state === 'down') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'down';
      this.downT = 25;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.35;
      return true;
    }
    return false;
  }
  update(dt, world) {
    if (this.state === 'down') {
      this.downT -= dt;
      if (this.downT <= 0) {
        this.state = 'patrol';
        this.hp = 100;
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
      }
      return;
    }
    const px = world.player.x, pz = world.player.z;
    const d = Math.hypot(px - this.x, pz - this.z);
    // Shoot when the player is close and the heist is on (or the player is at the harbor).
    const hostile = world.state === 'playing' && d < 26 && (world.missions.missionIndex === 3 || d < 12);
    if (hostile) {
      this.heading = Math.atan2(px - this.x, pz - this.z);
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = 0.9;
        world.guardShot(this);
      }
    } else {
      // Patrol a small loop around the post.
      this.patrolT += dt;
      const a = this.patrolT * 0.5;
      const tx = this.homeX + Math.sin(a) * 5;
      const tz = this.homeZ + Math.cos(a) * 5;
      const dx = tx - this.x, dz = tz - this.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.4) {
        this.heading = Math.atan2(dx, dz);
        this.x += (dx / dd) * 1.4 * dt;
        this.z += (dz / dd) * 1.4 * dt;
        this.walkPhase += dt * 5;
        const swing = Math.sin(this.walkPhase) * 0.5;
        const u = this.mesh.userData;
        u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export function nearestPed(peds, x, z) {
  let best = null, bestD = Infinity;
  for (const p of peds) {
    if (p.state === 'down') continue;
    const d = dist2(p.x, p.z, x, z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
