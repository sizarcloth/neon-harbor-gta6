// Cars: arcade physics for the player car, waypoint AI for traffic, BFS chase for police.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { buildCar } from './models.js';
import { clamp, angleLerp } from './random.js';
import { resolveCollisions } from './city.js';

const WHEEL_R = 0.36;

export class Car {
  constructor(scene, type, x, z, heading, colorOverride) {
    this.scene = scene;
    this.type = type;
    this.def = CAR_TYPES[type];
    this.mesh = buildCar(type, colorOverride);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.mode = 'parked'; // parked | traffic | police | player
    this.alive = true;
    this.edge = null; // traffic: {from, to, dist, len}
    this.edgeSpeed = 0;
    this.path = null; // police: node indices
    this.pathI = 0;
    this.repathT = 0;
    this.stopped = false;
    // Wheel pivots so the wheels spin around their axle.
    this.wheelPivots = [];
    for (const w of this.mesh.userData.wheels) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.position);
      w.position.set(0, 0, 0);
      pivot.add(w);
      this.mesh.add(pivot);
      this.wheelPivots.push(pivot);
    }
  }

  get pos() { return { x: this.x, z: this.z }; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  setTransform() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const p of this.wheelPivots) p.rotation.x += (this.speed * 0.016) / WHEEL_R;
  }

  // Player driving: arcade model, W accelerate, S brake/reverse, A/D steer, Space handbrake.
  drive(dt, move, handbrake) {
    const d = this.def;
    const fwd = move.z; // 1 = W, -1 = S
    if (fwd > 0) this.speed += d.accel * dt;
    else if (fwd < 0) this.speed -= (this.speed > 0.5 ? d.brake : d.accel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = clamp(this.speed, -d.maxSpeed * 0.45, d.maxSpeed);
    const steerInput = move.x; // 1 = D (right)
    const steer = steerInput * d.steer * clamp(Math.abs(this.speed) / 8, 0, 1) * (handbrake ? 1.5 : 1);
    this.heading += steer * dt * Math.sign(this.speed);
    const f = this.forward();
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
  }

  // Traffic: follow the road graph edge by edge, right-side lane offset, brake for the player.
  trafficStep(dt, world) {
    const g = world.city.graph;
    if (!this.edge) {
      const a = g.nearestNode(this.x, this.z);
      const nb = g.adj[a];
      const b = nb[Math.floor(Math.random() * nb.length)];
      this.edge = { from: a, to: b, dist: 0, len: 40 };
      this.edgeSpeed = 8 + Math.random() * 4;
    }
    const A = g.nodes[this.edge.from], B = g.nodes[this.edge.to];
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    // Brake if something is ahead: the player or another car.
    let targetSpeed = this.edgeSpeed;
    const aheadX = this.x + ux * 9, aheadZ = this.z + uz * 9;
    const px = world.player.x, pz = world.player.z;
    if ((px - aheadX) ** 2 + (pz - aheadZ) ** 2 < 36) targetSpeed = 0;
    for (const c of world.cars) {
      if (c === this || c.mode !== 'traffic') continue;
      if ((c.x - aheadX) ** 2 + (c.z - aheadZ) ** 2 < 25) { targetSpeed = 0; break; }
    }
    this.speed += clamp(targetSpeed - this.speed, -14 * dt, 8 * dt);
    this.edge.dist += Math.max(0, this.speed) * dt;
    // Lane offset: right side of travel.
    const ox = -uz * 2.2, oz = ux * 2.2;
    this.x = A.x + ux * this.edge.dist + ox;
    this.z = A.z + uz * this.edge.dist + oz;
    this.heading = Math.atan2(ux, uz);
    if (this.edge.dist >= len) {
      const arrived = this.edge.to;
      const options = g.adj[arrived].filter((n) => n !== this.edge.from);
      const next = options.length ? options[Math.floor(Math.random() * options.length)] : this.edge.from;
      this.edge = { from: arrived, to: next, dist: 0, len: 40 };
    }
    this.setTransform();
  }

  // Police: BFS path along roads to the player's nearest node, then ram.
  // The path restarts from the node the car is already driving to, never from
  // the node behind it: repathing mid-edge used to U-turn the car forever.
  policeStep(dt, world) {
    const g = world.city.graph;
    const targetNode = g.nearestNode(world.player.x, world.player.z);
    if (!this.path || this.path[this.path.length - 1] !== targetNode) {
      const from = this.path ? this.path[Math.min(this.pathI, this.path.length - 1)] : g.nearestNode(this.x, this.z);
      this.path = g.bfsPath(from, targetNode);
      this.pathI = 0;
    }
    const node = g.nodes[this.path[Math.min(this.pathI, this.path.length - 1)]];
    const dx = node.x - this.x, dz = node.z - this.z;
    const dist = Math.hypot(dx, dz);
    const fwd0 = this.forward();
    const behind = dx * fwd0.x + dz * fwd0.z < 0;
    if ((dist < 6 || behind) && this.pathI < this.path.length - 1) this.pathI += 1;
    // Close in: if the player is near, steer straight at them.
    const pd = Math.hypot(world.player.x - this.x, world.player.z - this.z);
    let tx, tz;
    if (pd < 14) { tx = world.player.x; tz = world.player.z; }
    else { tx = node.x; tz = node.z; }
    const want = Math.atan2(tx - this.x, tz - this.z);
    this.heading = angleLerp(this.heading, want, clamp(3.2 * dt, 0, 1));
    this.speed += clamp(this.def.maxSpeed - this.speed, -20 * dt, 10 * dt);
    const f = this.forward();
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
    resolveCollisions(world.city.colliders, this, 1.6);
    this.setTransform();
  }

  collideWithOthers(dt, world) {
    // Ellipse check in this car's frame: cars are 4.4 m long, 1.9 m wide, so
    // two cars passing in adjacent lanes (4.4 m apart) never collide, while a
    // car directly ahead or behind does. A plain circle radius made every
    // oncoming car sideswipe the player.
    for (const c of world.cars) {
      if (c === this || !c.alive) continue;
      const dx = c.x - this.x, dz = c.z - this.z;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const lon = dx * fx + dz * fz;
      const lat = dx * -fz + dz * fx;
      if (Math.abs(lat) > 1.9 || Math.abs(lon) > 4.3) continue;
      const d = Math.hypot(dx, dz) || 0.001;
      const nx = dx / d, nz = dz / d;
      if (c.mode === 'parked') {
        // A parked car is a static obstacle: push this car out, bleed speed.
        const push = 4.3 - Math.abs(lon);
        this.x -= nx * push; this.z -= nz * push;
        this.speed *= 0.4;
        if (this.mode === 'player') world.onCarBump(Math.abs(this.speed));
      } else {
        const push = (4.3 - Math.abs(lon)) / 2;
        this.x -= nx * push; this.z -= nz * push;
        c.x += nx * push; c.z += nz * push;
        const s = this.speed; this.speed = c.speed * 0.5; c.speed = s * 0.5;
        if (this.mode === 'player' || c.mode === 'player') world.onCarBump(Math.abs(s));
      }
    }
  }

  remove() {
    this.alive = false;
    this.scene.remove(this.mesh);
  }
}
