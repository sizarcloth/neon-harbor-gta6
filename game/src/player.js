// player.js — Rae Voss on foot and behind the wheel, plus the
// third-person follow camera. Movement is relative to the camera yaw;
// W always moves away from the camera.

import * as THREE from 'three';
import { clamp, damp, angleLerp, dist2D, forwardOf, pushOutOfBox } from './utils.js';
import { createPersonMesh, CAR_TYPES } from './models.js';

const WALK_SPEED = 4.0;
const SPRINT_SPEED = 6.8;
const GRAVITY = -22;

export class Player {
  constructor(scene, city) {
    this.city = city;
    this.mesh = createPersonMesh(0x1f6f6b, 0x2a2d34, 0xc98e6b, 0x1c1c22);
    scene.add(this.mesh);
    this.x = 0;
    this.y = 0;
    this.z = 8;
    this.vy = 0;
    this.heading = 0;
    this.camYaw = 0;
    this.speed = 0;
    this.inCar = false;
    this.car = null;
    this.walkPhase = 0;
    this.camPos = new THREE.Vector3(0, 4, -6);
    this.camTarget = new THREE.Vector3(0, 1, 8);
    this.onGround = true;
  }

  place(x, z) {
    if (this.inCar) this.exitCar();
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.syncMesh();
  }

  setHeading(h) {
    this.heading = h;
    this.camYaw = h;
  }

  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
  }

  enterCar(car) {
    this.inCar = true;
    this.car = car;
    car.driver = 'player';
    this.mesh.visible = false;
    this.x = car.x;
    this.z = car.z;
    this.heading = car.heading;
    this.camYaw = car.heading;
  }

  exitCar() {
    if (!this.inCar || !this.car) return;
    const car = this.car;
    car.driver = null;
    car.speed = 0;
    // Step out on the side with clear ground.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    let placed = false;
    for (const s of [1, -1]) {
      const px = car.x + side.x * 2.2 * s;
      const pz = car.z + side.z * 2.2 * s;
      const probe = { x: px, z: pz };
      this.city.collide(probe, 0.5);
      if (Math.abs(probe.x - px) < 0.01 && Math.abs(probe.z - pz) < 0.01) {
        this.x = px;
        this.z = pz;
        placed = true;
        break;
      }
    }
    if (!placed) {
      this.x = car.x - Math.sin(car.heading) * 3;
      this.z = car.z - Math.cos(car.heading) * 3;
    }
    this.y = 0;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.syncMesh();
  }

  // Drive the car the player sits in. Returns impact speed on a crash, else 0.
  driveCar(dt, input, cars) {
    const car = this.car;
    const spec = CAR_TYPES[car.type];
    if (input.forward) {
      car.speed += spec.accel * dt;
    } else if (input.back) {
      car.speed -= (car.speed > 0.5 ? 22 : spec.accel * 0.7) * dt;
    } else {
      car.speed -= car.speed * 0.5 * dt;
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    if (input.handbrake) {
      car.speed -= car.speed * 2.5 * dt;
    }
    car.speed = clamp(car.speed, -spec.maxReverse, spec.maxSpeed);
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const spdFactor = clamp(Math.abs(car.speed) / 8, 0.25, 1);
    car.heading += steerInput * spec.steer * spdFactor * dt * (car.speed >= 0 ? 1 : -1) * (input.handbrake ? 1.4 : 1);
    const fwd = forwardOf(car.heading);
    const nx = car.x + fwd.x * car.speed * dt;
    const nz = car.z + fwd.z * car.speed * dt;
    const before = { x: car.x, z: car.z };
    car.x = nx;
    car.z = nz;
    this.city.collide(car, 1.5);
    let impact = 0;
    if (Math.abs(car.x - nx) > 0.001 || Math.abs(car.z - nz) > 0.001) {
      impact = Math.abs(car.speed);
      car.speed *= 0.35;
    }
    // Car-to-car collision: push apart, both lose speed.
    for (const other of cars) {
      if (other === car) continue;
      const d = dist2D(car.x, car.z, other.x, other.z);
      if (d < 2.6 && d > 0.001) {
        const push = (2.6 - d) / 2;
        const ux = (car.x - other.x) / d;
        const uz = (car.z - other.z) / d;
        car.x += ux * push;
        car.z += uz * push;
        other.x -= ux * push;
        other.z -= uz * push;
        const rel = Math.abs(car.speed - (other.speed || 0));
        if (rel > 6) impact = Math.max(impact, rel * 0.7);
        car.speed *= 0.7;
        if (other.speed !== undefined) other.speed *= 0.7;
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    this.x = car.x;
    this.z = car.z;
    this.speed = car.speed;
    return impact;
  }

  walk(dt, input) {
    const fwd = forwardOf(this.camYaw);
    const right = { x: fwd.z, z: -fwd.x };
    let mx = 0;
    let mz = 0;
    if (input.forward) {
      mx += fwd.x;
      mz += fwd.z;
    }
    if (input.back) {
      mx -= fwd.x;
      mz -= fwd.z;
    }
    if (input.left) {
      mx -= right.x;
      mz -= right.z;
    }
    if (input.right) {
      mx += right.x;
      mz += right.z;
    }
    const len = Math.hypot(mx, mz);
    const sprinting = input.sprint && len > 0;
    const spd = sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (len > 0.001) {
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
      this.x += mx * spd * dt;
      this.z += mz * spd * dt;
      this.walkPhase += dt * (sprinting ? 11 : 8);
      this.speed = spd;
    } else {
      this.speed = 0;
    }
    // Jump + gravity.
    if (input.jump && this.onGround) {
      this.vy = 7.5;
      this.onGround = false;
    }
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
    }
    const pos = { x: this.x, z: this.z };
    this.city.collide(pos, 0.5);
    this.x = pos.x;
    this.z = pos.z;
    // Walk bob + squash on landing is handled by juice; here just bob.
    const bob = len > 0.001 ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    this.mesh.position.set(this.x, this.y + bob, this.z);
    this.mesh.rotation.y = this.heading;
    // Lean slightly into the run.
    this.mesh.rotation.x = len > 0.001 ? 0.06 : 0;
  }

  update(dt, input, cars, onCrash) {
    if (this.inCar && this.car) {
      const impact = this.driveCar(dt, input, cars);
      if (impact > 8 && onCrash) onCrash(impact);
    } else {
      this.walk(dt, input);
    }
  }

  // Third-person camera: behind the player/car, smoothed, with juice shake.
  updateCamera(camera, dt, juice, time, override) {
    let target;
    let dist;
    let height;
    if (override) {
      camera.position.copy(override.pos);
      camera.lookAt(override.look);
      return;
    }
    if (this.inCar && this.car) {
      target = new THREE.Vector3(this.car.x, 1.2, this.car.z);
      dist = 9.5;
      height = 4.2;
    } else {
      target = new THREE.Vector3(this.x, 1.4, this.z);
      dist = 7;
      height = 3.2;
    }
    const fwd = forwardOf(this.camYaw);
    const desired = new THREE.Vector3(
      target.x - fwd.x * dist,
      target.y + height,
      target.z - fwd.z * dist
    );
    const k = 1 - Math.exp(-10 * dt);
    this.camPos.lerp(desired, k);
    this.camTarget.lerp(target, k);
    const sh = juice ? juice.shakeOffset(time) : { x: 0, y: 0, rot: 0 };
    camera.position.set(this.camPos.x + sh.x, this.camPos.y + sh.y, this.camPos.z);
    camera.lookAt(this.camTarget);
    camera.rotation.z += sh.rot;
  }

  snapCamera() {
    const fwd = forwardOf(this.camYaw);
    const dist = this.inCar ? 9.5 : 7;
    const height = this.inCar ? 4.2 : 3.2;
    this.camPos.set(this.x - fwd.x * dist, 1.4 + height, this.z - fwd.z * dist);
    this.camTarget.set(this.x, 1.4, this.z);
  }
}
