// combat.js — punch, pistol hitscan, and ammo/health pickups.
// People go down when hit; cops and guards take two shots.

import * as THREE from 'three';
import { dist2D } from './utils.js';

const PUNCH_RANGE = 2.5;
const PUNCH_ARC = 0.9; // radians either side of the facing
const SHOT_RANGE = 60;
const SHOT_ARC = 0.09;

export class Combat {
  constructor() {
    this.punchCooldown = 0;
  }

  update(dt) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
  }

  // Punch the nearest person in front of the player. Returns the hit or null.
  punch(player, targets) {
    if (this.punchCooldown > 0) return null;
    this.punchCooldown = 0.4;
    let best = null;
    let bestD = Infinity;
    for (const t of targets) {
      if (t.state === 'down') continue;
      const d = dist2D(player.x, player.z, t.x, t.z);
      if (d > PUNCH_RANGE) continue;
      const ang = Math.atan2(t.x - player.x, t.z - player.z);
      let diff = ang - player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > PUNCH_ARC) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  // Hitscan along the camera forward. Returns { target, point } or { point }.
  shoot(player, camYaw, targets) {
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let best = null;
    let bestD = Infinity;
    for (const t of targets) {
      if (t.state === 'down') continue;
      const dx = t.x - player.x;
      const dz = t.z - player.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > SHOT_RANGE || d < 0.5) continue;
      const along = (dx * fx + dz * fz) / d;
      if (along < Math.cos(SHOT_ARC)) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      return { target: best, point: { x: best.x, y: 1.2, z: best.z } };
    }
    return { point: { x: player.x + fx * 30, y: 1.2, z: player.z + fz * 30 } };
  }
}

const AMMO_SPOTS = [[-6, 20], [44, -20], [84, 20], [124, -60], [-44, 100], [164, -40]];
const HEALTH_SPOTS = [[6, -20], [44, 100], [-84, 20], [124, 60]];

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    const ammoGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const ammoMat = new THREE.MeshBasicMaterial({ color: 0x7ae05a });
    const healthGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const healthMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, z] of AMMO_SPOTS) {
      const mesh = new THREE.Mesh(ammoGeo, ammoMat);
      mesh.position.set(x, 0.8, z);
      scene.add(mesh);
      this.pickups.push({ mesh, x, z, kind: 'ammo', taken: false, phase: Math.random() * 6 });
    }
    for (const [x, z] of HEALTH_SPOTS) {
      const mesh = new THREE.Mesh(healthGeo, healthMat);
      mesh.position.set(x, 0.8, z);
      scene.add(mesh);
      this.pickups.push({ mesh, x, z, kind: 'health', taken: false, phase: Math.random() * 6 });
    }
  }

  update(dt, time, player, onPickup) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y = time * 1.5 + p.phase;
      p.mesh.position.y = 0.8 + Math.sin(time * 2 + p.phase) * 0.15;
      if (dist2D(player.x, player.z, p.x, p.z) < 1.6) {
        p.taken = true;
        p.mesh.visible = false;
        if (onPickup) onPickup(p.kind);
      }
    }
  }
}
