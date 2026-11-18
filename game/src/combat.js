// Combat: punch, pistol, pickups, damage, particles. Juice: hit-stop, burst, tracer.
import * as THREE from 'three';
import { AMMO_SPOTS, HEALTH_SPOTS } from './config.js';
import { buildPickup } from './models.js';

export class Particles {
  constructor(scene, max = 220) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i += 1) this.pos[i * 3 + 1] = -10;
  }
  burst(x, y, z, color, count = 14, speed = 5) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      const n = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[n * 3] = Math.cos(a) * Math.cos(b) * s;
      this.vel[n * 3 + 1] = Math.abs(Math.sin(b)) * s + 2;
      this.vel[n * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.col[n * 3] = c.r; this.col[n * 3 + 1] = c.g; this.col[n * 3 + 2] = c.b;
      this.life[n] = 0.5 + Math.random() * 0.3;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -10; continue; }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 12 * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Pickups {
  constructor(scene) {
    this.items = [];
    for (const s of AMMO_SPOTS) this.items.push(this.make(scene, 'ammo', s.x, s.z));
    for (const s of HEALTH_SPOTS) this.items.push(this.make(scene, 'health', s.x, s.z));
  }
  make(scene, kind, x, z) {
    const mesh = buildPickup(kind);
    mesh.position.set(x, 0.6, z);
    scene.add(mesh);
    return { kind, x, z, mesh, taken: false, respawnT: 0 };
  }
  update(dt, world) {
    const px = world.player.x, pz = world.player.z;
    for (const it of this.items) {
      if (it.taken) {
        it.respawnT -= dt;
        if (it.respawnT <= 0) { it.taken = false; it.mesh.visible = true; }
        continue;
      }
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.position.y = 0.6 + Math.sin(world.time * 2 + it.x) * 0.12;
      if (world.state !== 'playing') continue;
      if ((px - it.x) ** 2 + (pz - it.z) ** 2 < 2.6) {
        it.taken = true;
        it.mesh.visible = false;
        it.respawnT = 30;
        if (it.kind === 'ammo') { world.ammo += 12; world.audio.play('pickup'); world.hud.toast('Picked up 12 pistol rounds'); }
        else { world.player.health = Math.min(100, world.player.health + 40); world.audio.play('chime'); world.hud.toast('Health restored'); }
      }
    }
  }
}

// Targets the player can hit: peds, foot cops, guards.
function hittables(world) {
  const out = [];
  for (const p of world.peds) if (p.state !== 'down') out.push({ x: p.x, z: p.z, y: 1.2, ref: p, kind: 'ped' });
  for (const c of world.footCops) if (c.alive) out.push({ x: c.x, z: c.z, y: 1.2, ref: c, kind: 'cop' });
  for (const g of world.guards) if (g.state !== 'down') out.push({ x: g.x, z: g.z, y: 1.2, ref: g, kind: 'guard' });
  return out;
}

export function punch(world) {
  if (world.state !== 'playing' || world.inCar) return;
  const px = world.player.x, pz = world.player.z;
  const fx = Math.sin(world.player.heading), fz = Math.cos(world.player.heading);
  let best = null, bestD = Infinity;
  for (const t of hittables(world)) {
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > 2.6 || d >= bestD) continue;
    if ((dx * fx + dz * fz) / d < 0.5) continue; // must be roughly in front
    best = t; bestD = d;
  }
  world.audio.play('punch');
  world.hitStop(0.04);
  world.addTrauma(0.12);
  if (!best) return;
  const downed = best.ref.damage(60);
  world.particles.burst(best.x, 1.2, best.z, 0xffd34a, 12, 4);
  world.commitCrime(1);
  for (const p of world.peds) if (p !== best.ref && p.state !== 'down') {
    if ((p.x - px) ** 2 + (p.z - pz) ** 2 < 18 * 18) p.fleeFrom(px, pz);
  }
  if (downed && best.kind === 'guard') world.hud.toast('Guard down');
  else if (downed) world.hud.toast('Pedestrian down. The cops noticed.');
}

export function shoot(world) {
  if (world.state !== 'playing' || world.inCar || !world.pistol) return;
  if (world.ammo <= 0) { world.audio.play('click'); world.hud.toast('Out of ammo. Find a green pickup.'); return; }
  world.ammo -= 1;
  world.audio.play('shot');
  world.addTrauma(0.1);
  const cam = world.camera;
  const origin = new THREE.Vector3();
  cam.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  let best = null, bestT = 70;
  for (const t of hittables(world)) {
    const dx = t.x - origin.x, dy = t.y - origin.y, dz = t.z - origin.z;
    const tt = dx * dir.x + dy * dir.y + dz * dir.z;
    if (tt < 1 || tt > bestT) continue;
    const cx = origin.x + dir.x * tt, cy = origin.y + dir.y * tt, cz = origin.z + dir.z * tt;
    const miss = Math.hypot(t.x - cx, t.y - cy, t.z - cz);
    if (miss < 1.3) { best = t; bestT = tt; }
  }
  const end = origin.clone().addScaledVector(dir, best ? bestT : 60);
  world.showTracer(origin, end);
  if (best) {
    const downed = best.ref.damage(45);
    world.particles.burst(best.x, best.y, best.z, 0xff5a3c, 14, 5);
    if (downed && best.kind === 'ped') world.hud.toast('Pedestrian down. The cops noticed.');
    if (downed && best.kind === 'cop') world.hud.toast('Cop down. That will bring heat.');
    if (downed && best.kind === 'guard') world.hud.toast('Guard down');
  } else {
    world.particles.burst(end.x, end.y, end.z, 0xffd34a, 6, 3);
  }
  world.commitCrime(2);
  for (const p of world.peds) {
    if (p.state !== 'down' && (p.x - world.player.x) ** 2 + (p.z - world.player.z) ** 2 < 22 * 22) p.fleeFrom(world.player.x, world.player.z);
  }
}

export function damagePlayer(world, amount, source) {
  if (world.state !== 'playing' || world.player.health <= 0) return;
  world.player.health -= amount;
  world.addTrauma(0.35);
  world.hud.flash();
  if (world.player.health <= 0) world.die(source);
}
