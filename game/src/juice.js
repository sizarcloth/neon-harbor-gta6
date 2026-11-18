// juice.js — game feel: trauma-based screen shake, hit-stop, pooled
// particles, damage flash. Juice is presentation only: it never changes
// hitboxes or game logic, and never hides the HUD.

import * as THREE from 'three';
import { clamp } from './utils.js';

const MAX_PARTICLES = 200;

export class Juice {
  constructor(scene) {
    this.scene = scene;
    this.trauma = 0;
    this.freeze = 0;
    this.flashEl = document.getElementById('flash');
    this.flashLife = 0;
    // Pooled particles: one THREE.Points, additive so faded particles
    // (color near black) vanish.
    this.pCount = MAX_PARTICLES;
    this.pPos = new Float32Array(this.pCount * 3);
    this.pCol = new Float32Array(this.pCount * 3);
    this.pVel = new Float32Array(this.pCount * 3);
    this.pLife = new Float32Array(this.pCount);
    this.pMax = new Float32Array(this.pCount);
    this.pBase = new Float32Array(this.pCount * 3);
    for (let i = 0; i < this.pCount; i += 1) {
      this.pPos[i * 3 + 1] = -999;
      this.pLife[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.nextSlot = 0;
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  hitStop(ms) {
    this.freeze = Math.max(this.freeze, ms / 1000);
  }

  // Returns the sim time available after consuming frozen time.
  scaleDt(dt) {
    if (this.freeze <= 0) return dt;
    const used = Math.min(this.freeze, dt);
    this.freeze -= used;
    return dt - used;
  }

  // Camera shake offset for this frame (world units + radians).
  shakeOffset(t) {
    const s = this.trauma * this.trauma;
    if (s < 0.001) return { x: 0, y: 0, rot: 0 };
    const n1 = Math.sin(t * 47.3) * 0.5 + Math.sin(t * 31.7) * 0.5;
    const n2 = Math.cos(t * 39.1) * 0.5 + Math.sin(t * 27.9) * 0.5;
    return { x: n1 * s * 0.45, y: n2 * s * 0.35, rot: n1 * s * 0.02 };
  }

  burst(x, y, z, colorHex, count, speed = 4) {
    const col = new THREE.Color(colorHex);
    for (let n = 0; n < count; n += 1) {
      const i = this.nextSlot;
      this.nextSlot = (this.nextSlot + 1) % this.pCount;
      this.pPos[i * 3] = x;
      this.pPos[i * 3 + 1] = y;
      this.pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.3;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pVel[i * 3] = Math.cos(a) * sp;
      this.pVel[i * 3 + 1] = up * sp;
      this.pVel[i * 3 + 2] = Math.sin(a) * sp;
      this.pMax[i] = 0.4 + Math.random() * 0.4;
      this.pLife[i] = this.pMax[i];
      this.pBase[i * 3] = col.r;
      this.pBase[i * 3 + 1] = col.g;
      this.pBase[i * 3 + 2] = col.b;
    }
  }

  flash(color, ms = 120) {
    if (!this.flashEl) return;
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = '0.45';
    this.flashLife = ms / 1000;
    this.flashMax = this.flashLife;
  }

  update(dt, time) {
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashEl) {
        this.flashEl.style.opacity = String(Math.max(0, 0.45 * (this.flashLife / Math.max(0.001, this.flashMax))));
      }
    }
    let alive = false;
    for (let i = 0; i < this.pCount; i += 1) {
      if (this.pLife[i] <= 0) continue;
      alive = true;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.pPos[i * 3 + 1] = -999;
        this.pCol[i * 3] = 0;
        this.pCol[i * 3 + 1] = 0;
        this.pCol[i * 3 + 2] = 0;
        continue;
      }
      this.pVel[i * 3 + 1] -= 9 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < 0.05) this.pPos[i * 3 + 1] = 0.05;
      const f = this.pLife[i] / this.pMax[i];
      this.pCol[i * 3] = this.pBase[i * 3] * f;
      this.pCol[i * 3 + 1] = this.pBase[i * 3 + 1] * f;
      this.pCol[i * 3 + 2] = this.pBase[i * 3 + 2] * f;
    }
    if (alive) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }
}
