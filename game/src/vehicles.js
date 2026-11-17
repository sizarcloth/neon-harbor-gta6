// Cars: arcade driving physics, traffic waypoint AI, parked cars.
// Heading convention everywhere: forward = (sin h, cos h) in (x, z).
import * as THREE from 'three';
import { CAR_TYPES, CAR_RADIUS, TRAFFIC_COUNT, ROADS, WORLD_HALF } from './config.js';
import { randRange, randInt, randPick } from './rng.js';
import { buildCarMesh } from './models.js';

export class Car {
  constructor(scene, { type, color, x, z, heading, parked = false, traffic = false, police = false, target = false }) {
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.parked = parked;
    this.traffic = traffic;
    this.police = police;
    this.target = target;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.mesh = buildCarMesh(type, color);
    this.scene = scene;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Player driving: W/S throttle, A/D steering, Space handbrake.
  // cruise (set by ?shot= staging) holds a speed with no input.
  drivePlayer(dt, input) {
    const s = this.spec;
    const cruising = this.cruise != null;
    const fwd = input.isDown('KeyW') || cruising ? 1 : 0;
    const back = input.isDown('KeyS') ? 1 : 0;
    const left = input.isDown('KeyA') ? 1 : 0;
    const right = input.isDown('KeyD') ? 1 : 0;
    const brake = input.isDown('Space') ? 1 : 0;

    const steerTarget = (left - right) * 0.55;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    if (fwd) this.speed += s.accel * dt;
    if (back) {
      this.speed -= this.speed > 0.5 ? s.accel * 1.6 * dt : s.accel * 0.55 * dt;
    }
    if (brake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
      this.steer *= 1.35;
    }
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.25 * dt;
    if (!fwd && !back) this.speed -= this.speed * 0.6 * dt;
    this.speed = Math.max(-9, Math.min(s.top, this.speed));
    if (cruising) this.speed = Math.min(this.speed, this.cruise);
    if (Math.abs(this.speed) < 0.05 && !fwd && !back) this.speed = 0;

    const turnRate = this.steer * s.steer * Math.min(1, Math.abs(this.speed) / 6) * 1.9;
    this.heading += turnRate * Math.sign(this.speed || 1) * dt;
    const f = this.forward;
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
  }

  // AI steering toward a point at a target speed. Returns distance.
  driveToward(dt, tx, tz, targetSpeed, maxTurn = 2.4) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diff));
    this.heading += turn;
    this.steer = Math.max(-0.55, Math.min(0.55, diff * 0.8));
    const slowForTurn = Math.abs(diff) > 0.7 ? 0.45 : 1;
    const want = targetSpeed * slowForTurn;
    if (this.speed < want) this.speed += this.spec.accel * 0.8 * dt;
    else this.speed -= this.spec.accel * 1.2 * dt;
    this.speed = Math.max(0, Math.min(this.spec.top, this.speed));
    const f = this.forward;
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
    return dist;
  }

  // Building + world-bounds collision. Returns impact speed on a hit.
  collide(city) {
    const before = this.speed;
    const res = city.collideCircle(this.x, this.z, CAR_RADIUS - 0.3);
    let impact = 0;
    if (res.hit) {
      this.x = res.x;
      this.z = res.z;
      impact = Math.abs(before);
      this.speed *= 0.35;
    }
    const m = WORLD_HALF - 3;
    if (this.x < -m || this.x > m || this.z < -m || this.z > m) {
      this.x = Math.max(-m, Math.min(m, this.x));
      this.z = Math.max(-m, Math.min(m, this.z));
      impact = Math.max(impact, Math.abs(before));
      this.speed *= 0.35;
    }
    return impact;
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    if (wheels) {
      const spin = (this.speed / 0.35) * 0.016;
      for (const w of wheels) w.spin.rotation.x += spin;
      this.mesh.userData.steerL.rotation.y = this.steer;
      this.mesh.userData.steerR.rotation.y = this.steer;
    }
    if (this.police && this.mesh.userData.lightBar) {
      const t = performance.now() / 280;
      const on = Math.sin(t) > 0;
      this.mesh.userData.lightRed.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.mesh.userData.lightBlue.material.color.setHex(on ? 0x113366 : 0x2266ff);
    }
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

// Directions on the road grid: 0=+X, 1=-X, 2=+Z, 3=-Z.
const DIRS = [
  { axis: 'x', dir: 1 }, { axis: 'x', dir: -1 },
  { axis: 'z', dir: 1 }, { axis: 'z', dir: -1 },
];
function opposite(d) {
  return d ^ 1;
}
function leftOf(d) {
  // Facing +X, left is -Z (dir 3); facing -X, left is +Z (2);
  // facing +Z, left is +X (0); facing -Z, left is -X (1).
  return [3, 2, 0, 1][d];
}
function rightOf(d) {
  return [2, 3, 1, 0][d];
}

export class TrafficSystem {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) this._spawn();
  }

  _laneOffset(dir) {
    // Right-hand traffic: lane sits on the driver's right side.
    return dir === 0 ? 1.8 : dir === 1 ? -1.8 : dir === 2 ? -1.8 : 1.8;
  }

  _spawn() {
    const rng = this.rng;
    const dir = randInt(rng, 0, 3);
    const road = randPick(rng, ROADS);
    const along = randRange(rng, -150, 150);
    const lane = this._laneOffset(dir);
    const d = DIRS[dir];
    const x = d.axis === 'x' ? along : road + lane;
    const z = d.axis === 'x' ? road + lane : along;
    const type = randPick(rng, ['sedan', 'sedan', 'taxi', 'pickup']);
    const car = new Car(this.scene, {
      type, color: randPick(rng, [0xc23b2e, 0x2e6fc2, 0xe8e3d5, 0x2b2b2b, 0x3f8f5a, 0x9fb4c0]),
      x, z, heading: Math.atan2(d.axis === 'x' ? d.dir : 0, d.axis === 'z' ? d.dir : 0),
      traffic: true,
    });
    car.driver = 'traffic';
    const entry = {
      car, dir, road,
      speed: randRange(rng, 7, 9.5),
      target: this._nextTarget(x, z, dir, road),
    };
    this.cars.push(entry);
    return entry;
  }

  _nextTarget(x, z, dir, road) {
    const d = DIRS[dir];
    // Next intersection along the current road in the direction of travel.
    if (d.axis === 'x') {
      const ahead = ROADS.filter((r) => (d.dir > 0 ? r > x + 2 : r < x - 2));
      const nx = d.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
      return { x: nx, z: road + this._laneOffset(dir) };
    }
    const ahead = ROADS.filter((r) => (d.dir > 0 ? r > z + 2 : r < z - 2));
    const nz = d.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
    return { x: road + this._laneOffset(dir), z: nz };
  }

  _decide(entry) {
    const rng = this.rng;
    const { car } = entry;
    const ix = ROADS.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    const iz = ROADS.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a));
    const options = [];
    // Straight keeps the same direction if the road continues.
    const straight = entry.dir;
    const sd = DIRS[straight];
    const straightOk = sd.axis === 'x'
      ? (sd.dir > 0 ? ix < 160 : ix > -160)
      : (sd.dir > 0 ? iz < 160 : iz > -160);
    if (straightOk) options.push({ dir: straight, weight: 0.55 });
    const l = leftOf(entry.dir);
    const ld = DIRS[l];
    const leftOk = ld.axis === 'x'
      ? (ld.dir > 0 ? ix < 160 : ix > -160)
      : (ld.dir > 0 ? iz < 160 : iz > -160);
    if (leftOk) options.push({ dir: l, weight: 0.225 });
    const r = rightOf(entry.dir);
    const rd = DIRS[r];
    const rightOk = rd.axis === 'x'
      ? (rd.dir > 0 ? ix < 160 : ix > -160)
      : (rd.dir > 0 ? iz < 160 : iz > -160);
    if (rightOk) options.push({ dir: r, weight: 0.225 });
    if (!options.length) options.push({ dir: opposite(entry.dir), weight: 1 });
    let pick = rng();
    let chosen = options[options.length - 1].dir;
    for (const o of options) {
      if (pick < o.weight) { chosen = o.dir; break; }
      pick -= o.weight;
    }
    entry.dir = chosen;
    const cd = DIRS[chosen];
    entry.road = cd.axis === 'x' ? iz : ix;
    entry.target = this._nextTarget(car.x, car.z, chosen, entry.road);
  }

  // Is something stopped in front of this car? (player car or traffic)
  _blocked(entry, others) {
    const { car } = entry;
    const f = car.forward;
    for (const o of others) {
      if (o === car) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      if (ahead < 0 || ahead > 9) continue;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (side < 2.2) return true;
    }
    return false;
  }

  update(dt, allCars) {
    for (const entry of this.cars) {
      const { car } = entry;
      const dist = Math.hypot(entry.target.x - car.x, entry.target.z - car.z);
      if (dist < 4) this._decide(entry);
      const blocked = this._blocked(entry, allCars);
      const want = blocked ? 0 : entry.speed;
      car.driveToward(dt, entry.target.x, entry.target.z, want, 2.2);
      car.syncMesh();
    }
  }

  positions() {
    return this.cars.map((e) => ({ x: e.car.x, z: e.car.z }));
  }
}
