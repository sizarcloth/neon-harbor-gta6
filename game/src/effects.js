// Game feel: trauma-based screen shake, hit-stop, pooled particles.
// Juice is information: every effect answers "what just happened and how
// big was it". Nothing here changes game logic, only presentation.
import * as THREE from 'three';

const MAX_PARTICLES = 200;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.trauma = 0;
    this.hitStopUntil = 0;
    this.time = 0;
    this.onDamageFlash = null;

    const geo = new THREE.BufferGeometry();
    this._positions = new Float32Array(MAX_PARTICLES * 3);
    this._colors = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    this._points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.22, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this._points.frustumCulled = false;
    scene.add(this._points);
    this._vel = new Float32Array(MAX_PARTICLES * 3);
    this._life = new Float32Array(MAX_PARTICLES);
    this._maxLife = new Float32Array(MAX_PARTICLES);
    this._cursor = 0;
    // Park all particles far below the world until used.
    for (let i = 0; i < MAX_PARTICLES; i += 1) this._positions[i * 3 + 1] = -100;
  }

  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  hitStop(ms) {
    this.hitStopUntil = Math.max(this.hitStopUntil, this.time + ms / 1000);
  }

  get timeScale() {
    return this.time < this.hitStopUntil ? 0 : 1;
  }

  burst(x, y, z, colorHex, count = 14, speed = 5) {
    const color = new THREE.Color(colorHex);
    for (let n = 0; n < count; n += 1) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      this._positions[i * 3] = x;
      this._positions[i * 3 + 1] = y;
      this._positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.3;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this._vel[i * 3] = Math.cos(a) * sp;
      this._vel[i * 3 + 1] = up * sp;
      this._vel[i * 3 + 2] = Math.sin(a) * sp;
      this._colors[i * 3] = color.r;
      this._colors[i * 3 + 1] = color.g;
      this._colors[i * 3 + 2] = color.b;
      this._life[i] = this._maxLife[i] = 0.4 + Math.random() * 0.4;
    }
    this._points.geometry.attributes.position.needsUpdate = true;
    this._points.geometry.attributes.color.needsUpdate = true;
  }

  damageFlash() {
    if (this.onDamageFlash) this.onDamageFlash();
  }

  // Camera shake offset for this frame (call once per render).
  shakeOffset() {
    if (this.trauma <= 0.01) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma;
    const t = this.time * 47;
    return {
      x: (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5) * 0.24 * s,
      y: (Math.cos(t * 1.7) + Math.sin(t * 3.1) * 0.5) * 0.2 * s,
    };
  }

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this._life[i] <= 0) continue;
      anyAlive = true;
      this._life[i] -= dt;
      if (this._life[i] <= 0) {
        this._positions[i * 3 + 1] = -100;
        continue;
      }
      this._vel[i * 3 + 1] -= 9 * dt;
      this._positions[i * 3] += this._vel[i * 3] * dt;
      this._positions[i * 3 + 1] += this._vel[i * 3 + 1] * dt;
      this._positions[i * 3 + 2] += this._vel[i * 3 + 2] * dt;
      if (this._positions[i * 3 + 1] < 0.05) {
        this._positions[i * 3 + 1] = 0.05;
        this._vel[i * 3 + 1] *= -0.3;
      }
    }
    if (anyAlive) this._points.geometry.attributes.position.needsUpdate = true;
  }
}
