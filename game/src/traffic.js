// traffic.js — cars driving the road grid. Each car follows a road to
// the next intersection, then turns or continues. Cars brake for the
// car ahead. The player can steal a traffic car (E) — it leaves the
// traffic system the moment the player takes it.

import { rand, pick, clamp, angleLerp, dist2D, forwardOf } from './utils.js';
import { createCarMesh, CAR_TYPES } from './models.js';
import { LAYOUT } from './city.js';

const TRAFFIC_COLORS = [0x8a2f2f, 0x2f4a8a, 0x3a6e4a, 0x8a8a8a, 0x5a5a6e, 0xa88a3a, 0x4a7a8a, 0x7a4a6e];

export class TrafficManager {
  constructor(scene, city, rng, cars) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = cars; // shared car list (game owns it)
    this.traffic = [];
    this.spawnInitial();
  }

  spawnInitial() {
    for (let i = 0; i < 12; i += 1) {
      const type = pick(this.rng, ['sedan', 'sedan', 'taxi', 'pickup', 'sedan', 'sport']);
      const color = type === 'taxi' ? 0xe8b93c : pick(this.rng, TRAFFIC_COLORS);
      const mesh = createCarMesh(type, color);
      this.scene.add(mesh);
      const onAve = this.rng() < 0.5;
      const road = onAve ? pick(this.rng, LAYOUT.avenues) : pick(this.rng, LAYOUT.streets);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const along = onAve
        ? rand(this.rng, LAYOUT.minZ + 10, LAYOUT.maxZ - 10)
        : rand(this.rng, LAYOUT.minX + 10, 180);
      const car = {
        id: `traffic-${i}`,
        type,
        mesh,
        x: onAve ? road : along,
        z: onAve ? along : road,
        heading: onAve ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        speed: rand(this.rng, 8, 11),
        cruise: rand(this.rng, 8, 11),
        driver: null,
        traffic: true,
        road: onAve ? 'ave' : 'street',
        roadCoord: road,
        dir,
        color,
      };
      this.setNextWaypoint(car);
      this.traffic.push(car);
      this.cars.push(car);
    }
  }

  // The next intersection along this car's road, with a right-lane offset.
  setNextWaypoint(car) {
    const coords = car.road === 'ave' ? LAYOUT.streets : LAYOUT.avenues;
    const along = car.road === 'ave' ? car.z : car.x;
    let next = null;
    for (const c of coords) {
      if (car.dir > 0 && c > along + 1) {
        next = c;
        break;
      }
      if (car.dir < 0 && c < along - 1) next = c;
    }
    if (next === null) {
      // End of the road: turn around.
      car.dir *= -1;
      this.setNextWaypoint(car);
      return;
    }
    const lane = 2.5;
    if (car.road === 'ave') {
      car.waypoint = { x: car.roadCoord + (car.dir > 0 ? lane : -lane), z: next };
    } else {
      car.waypoint = { x: next, z: car.roadCoord + (car.dir > 0 ? -lane : lane) };
    }
  }

  atIntersection(car) {
    // Pick a new direction: straight (55%), turn (35%), U-turn (10%).
    const r = this.rng();
    const onAve = car.road === 'ave';
    if (r < 0.55) {
      this.setNextWaypoint(car);
      return;
    }
    if (r < 0.9) {
      // Turn onto the cross road.
      const cross = onAve ? LAYOUT.streets : LAYOUT.avenues;
      const along = onAve ? car.z : car.x;
      let nearest = cross[0];
      for (const c of cross) if (Math.abs(c - along) < Math.abs(nearest - along)) nearest = c;
      car.road = onAve ? 'street' : 'ave';
      car.roadCoord = nearest;
      car.dir = this.rng() < 0.5 ? 1 : -1;
      if (onAve) car.z = nearest;
      else car.x = nearest;
      this.setNextWaypoint(car);
      return;
    }
    car.dir *= -1;
    this.setNextWaypoint(car);
  }

  update(dt, playerCar) {
    for (const car of this.traffic) {
      if (car.driver === 'player') continue;
      if (!car.waypoint) this.setNextWaypoint(car);
      const wp = car.waypoint;
      const d = dist2D(car.x, car.z, wp.x, wp.z);
      if (d < 3) {
        this.atIntersection(car);
        continue;
      }
      const targetHeading = Math.atan2(wp.x - car.x, wp.z - car.z);
      car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 3));
      // Brake for the car ahead (player or traffic).
      let want = car.cruise;
      const fwd = forwardOf(car.heading);
      for (const other of this.cars) {
        if (other === car || other.driver === 'player' && other === playerCar) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = ox * fwd.x + oz * fwd.z;
        const side = Math.abs(ox * fwd.z - oz * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.5) {
          want = 0;
          break;
        }
      }
      if (playerCar && playerCar !== car) {
        const ox = playerCar.x - car.x;
        const oz = playerCar.z - car.z;
        const ahead = ox * fwd.x + oz * fwd.z;
        const side = Math.abs(ox * fwd.z - oz * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.5) want = 0;
      }
      car.speed += clamp(want - car.speed, -14 * dt, 5 * dt);
      car.x += fwd.x * car.speed * dt;
      car.z += fwd.z * car.speed * dt;
      this.city.collide(car, 1.4);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  positions() {
    return this.traffic
      .filter((c) => c.driver !== 'player')
      .map((c) => ({ x: c.x, z: c.z }));
  }
}
