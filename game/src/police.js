// police.js — police pursuit: cruisers navigate the road grid toward
// the player (Manhattan path between intersections, then a direct
// chase), and on-foot cops run the player down and try to bust them.

import * as THREE from 'three';
import { rand, pick, clamp, angleLerp, dist2D, forwardOf } from './utils.js';
import { createCarMesh, createLightBar, createPersonMesh, CAR_TYPES } from './models.js';
import { LAYOUT } from './city.js';

function nearestIntersection(x, z) {
  let ax = LAYOUT.avenues[0];
  for (const a of LAYOUT.avenues) if (Math.abs(a - x) < Math.abs(ax - x)) ax = a;
  let sz = LAYOUT.streets[0];
  for (const s of LAYOUT.streets) if (Math.abs(s - z) < Math.abs(sz - z)) sz = s;
  return { x: ax, z: sz };
}

export class PoliceManager {
  constructor(scene, city, rng, cars) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = cars; // shared car list
    this.cruisers = [];
    this.cops = [];
    this.flashTimer = 0;
  }

  wantCount(wanted) {
    return Math.min(wanted, 3);
  }

  spawnCruiser(player) {
    const mesh = createCarMesh('police', 0x14181f);
    const lightBar = createLightBar();
    mesh.add(lightBar);
    this.scene.add(mesh);
    // Spawn on a road 35-45 m from the player.
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      const p = this.city.randomRoadPoint(this.rng);
      const d = dist2D(p.x, p.z, player.x, player.z);
      if (d > 35 && d < 50) {
        x = p.x;
        z = p.z;
        break;
      }
      x = p.x;
      z = p.z;
    }
    const car = {
      id: `police-${Date.now()}-${Math.floor(this.rng() * 1000)}`,
      type: 'police',
      mesh,
      lightBar,
      x,
      z,
      heading: rand(this.rng, 0, Math.PI * 2),
      speed: 0,
      driver: 'police',
      police: true,
      path: [],
      pathIdx: 0,
      repathTimer: 0,
      stallTimer: 0,
      reverseTimer: 0,
      color: 0x14181f,
    };
    this.cruisers.push(car);
    this.cars.push(car);
    return car;
  }

  spawnCop(player) {
    const mesh = createPersonMesh(0x1a2a4a, 0x1a1a22, pick(this.rng, [0xc98e6b, 0x8a5a3a, 0xe8b89a]), 0x111111);
    this.scene.add(mesh);
    const a = rand(this.rng, 0, Math.PI * 2);
    const d = rand(this.rng, 25, 35);
    const cop = {
      mesh,
      x: player.x + Math.sin(a) * d,
      z: player.z + Math.cos(a) * d,
      heading: 0,
      bustTimer: 0,
      walkPhase: 0,
      kind: 'cop',
      state: 'active',
      hp: 68,
      downTimer: 0,
    };
    const pos = { x: cop.x, z: cop.z };
    this.city.collide(pos, 0.5);
    cop.x = pos.x;
    cop.z = pos.z;
    this.cops.push(cop);
    return cop;
  }

  removeCruiser(car) {
    this.scene.remove(car.mesh);
    this.cruisers = this.cruisers.filter((c) => c !== car);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  removeCops() {
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cops = [];
  }

  computePath(car, player) {
    const to = nearestIntersection(player.x, player.z);
    const path = [];
    // Route along the road the cruiser is already on, so the first leg
    // never points away from the player (a wrong-direction first waypoint
    // used to make cruisers drive off before turning around).
    let ax = LAYOUT.avenues[0];
    for (const a of LAYOUT.avenues) if (Math.abs(a - car.x) < Math.abs(ax - car.x)) ax = a;
    let sz = LAYOUT.streets[0];
    for (const s of LAYOUT.streets) if (Math.abs(s - car.z) < Math.abs(sz - car.z)) sz = s;
    if (Math.abs(ax - car.x) <= Math.abs(sz - car.z)) {
      path.push({ x: ax, z: to.z }); // along the avenue, then turn
    } else {
      path.push({ x: to.x, z: sz }); // along the street, then turn
    }
    path.push({ x: to.x, z: to.z });
    path.push({ x: player.x, z: player.z });
    car.path = path;
    car.pathIdx = 0;
  }

  update(dt, player, wanted, onBust, onRam) {
    this.flashTimer += dt;
    const flashRed = Math.floor(this.flashTimer / 0.4) % 2 === 0;
    // Keep the cruiser count matched to the wanted level.
    const want = this.wantCount(wanted);
    while (this.cruisers.length < want) this.spawnCruiser(player);
    while (this.cruisers.length > want) this.removeCruiser(this.cruisers[this.cruisers.length - 1]);
    // On-foot cops at wanted 2+.
    const wantCops = wanted >= 2 ? Math.min(wanted - 1, 2) : 0;
    while (this.cops.length < wantCops) this.spawnCop(player);
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.mesh);
    }
    for (const car of this.cruisers) {
      car.lightBar.material.color.setHex(flashRed ? 0xff2222 : 0x2266ff);
      car.repathTimer -= dt;
      if (car.repathTimer <= 0 || car.pathIdx >= car.path.length) {
        this.computePath(car, player);
        car.repathTimer = 2;
      }
      const distToPlayer = dist2D(car.x, car.z, player.x, player.z);
      let target;
      if (distToPlayer < 14) {
        // Direct chase: ram the player.
        target = { x: player.x, z: player.z };
      } else {
        target = car.path[Math.min(car.pathIdx, car.path.length - 1)];
        if (dist2D(car.x, car.z, target.x, target.z) < 4) {
          car.pathIdx += 1;
          target = car.path[Math.min(car.pathIdx, car.path.length - 1)];
        }
      }
      const targetHeading = Math.atan2(target.x - car.x, target.z - car.z);
      const spec = CAR_TYPES.police;
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        car.speed = -6;
        car.heading += 1.6 * dt;
      } else {
        car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 2.5));
        let wantSpeed = distToPlayer < 6 ? 12 : spec.maxSpeed;
        // Do not floor it while still pointing the wrong way: a fresh
        // spawn with a random heading would otherwise drive off first.
        const err = Math.abs(((targetHeading - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (err > 1.0) wantSpeed = Math.min(wantSpeed, 5);
        car.speed += clamp(wantSpeed - car.speed, -18 * dt, 11 * dt);
      }
      const fwd = forwardOf(car.heading);
      const px = car.x;
      const pz = car.z;
      car.x += fwd.x * car.speed * dt;
      car.z += fwd.z * car.speed * dt;
      this.city.collide(car, 1.5);
      // Stall detection: barely moving while trying to drive.
      const moved = dist2D(px, pz, car.x, car.z);
      if (Math.abs(car.speed) > 4 && moved < Math.abs(car.speed) * dt * 0.25) {
        car.stallTimer += dt;
        if (car.stallTimer > 1.1) {
          car.stallTimer = 0;
          car.reverseTimer = 0.9;
          this.computePath(car, player);
        }
      } else {
        car.stallTimer = 0;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Ram: touching the player hurts and shoves.
      if (distToPlayer < 2.6 && onRam) onRam(car, Math.abs(car.speed));
    }
    // On-foot cops: run at the player, bust when adjacent to a slow player.
    for (const cop of this.cops) {
      const d = dist2D(cop.x, cop.z, player.x, player.z);
      const targetHeading = Math.atan2(player.x - cop.x, player.z - cop.z);
      cop.heading = angleLerp(cop.heading, targetHeading, Math.min(1, dt * 6));
      if (d > 2.2) {
        const fwd = forwardOf(cop.heading);
        cop.x += fwd.x * 5 * dt;
        cop.z += fwd.z * 5 * dt;
        cop.walkPhase += dt * 10;
        cop.bustTimer = 0;
      } else {
        // Adjacent: bust only if the player is slow and on foot.
        if (!player.inCar && Math.abs(player.speed) < 1.5) {
          cop.bustTimer += dt;
          if (cop.bustTimer > 3.5 && onBust) onBust();
        } else {
          cop.bustTimer = 0;
        }
      }
      const pos = { x: cop.x, z: cop.z };
      this.city.collide(pos, 0.5);
      cop.x = pos.x;
      cop.z = pos.z;
      cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.walkPhase)) * 0.05, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
  }

  positions() {
    return this.cruisers.map((c) => ({ x: c.x, z: c.z }));
  }

  nearestDistance(player) {
    let best = Infinity;
    for (const car of this.cruisers) {
      best = Math.min(best, dist2D(car.x, car.z, player.x, player.z));
    }
    return best === Infinity ? null : best;
  }

  count() {
    return this.cruisers.length;
  }
}
