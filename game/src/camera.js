// Third-person follow camera with mouse-orbit offset, speed-based FOV,
// building-aware pull-in, and trauma shake from the effects system.
// The title screen uses a slow orbit over the city instead.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, input, effects, city) {
    this.camera = camera;
    this.input = input;
    this.effects = effects;
    this.city = city;
    this.orbit = 0;
    this.pitch = 0;
    this.idleTime = 0;
    this.fov = 60;
    this.titleMode = true;
    this.titleAngle = 0.6;
    this.shotDist = 0;
    this.shotHeight = 0;
    this._pos = new THREE.Vector3(60, 55, 120);
  }

  reset() {
    this.orbit = 0;
    this.pitch = 0;
    this.idleTime = 0;
  }

  update(dt, target, inCar, speedNorm) {
    if (this.titleMode) {
      this.titleAngle += dt * 0.025;
      const r = 130;
      const px = Math.cos(this.titleAngle) * r;
      const pz = Math.sin(this.titleAngle) * r * 0.8 + 20;
      this._pos.set(px, 58, pz);
      this.camera.position.copy(this._pos);
      this.camera.lookAt(10, 4, -10);
      this._setFov(55, dt);
      return;
    }
    const { dx, dy } = this.input.takeOrbit();
    if (dx !== 0 || dy !== 0) {
      this.orbit = Math.max(-2.4, Math.min(2.4, this.orbit - dx * 0.004));
      this.pitch = Math.max(-1.2, Math.min(2.6, this.pitch + dy * 0.008));
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      if (this.idleTime > 1.5) {
        // Ease the camera back behind the player when untouched.
        this.orbit += (0 - this.orbit) * Math.min(1, dt * 0.7);
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 0.7);
      }
    }
    const wantDist = this.shotDist || (inCar ? 10.5 : 7);
    const wantHeight = this.shotHeight || (inCar ? 4 : 3.1);
    const camYaw = target.heading + Math.PI + this.orbit;
    const dirX = Math.sin(camYaw);
    const dirZ = Math.cos(camYaw);
    // Pull the camera in if a building would block the view.
    let dist = wantDist;
    for (let d = wantDist; d >= 3; d -= 1.5) {
      const px = target.x + dirX * d;
      const pz = target.z + dirZ * d;
      if (!this.city.pointBlocked(px, pz, 0.8)) { dist = d; break; }
      dist = d;
    }
    const px = target.x + dirX * dist;
    const py = (target.y || 0) + wantHeight + this.pitch;
    const pz = target.z + dirZ * dist;
    const shake = this.effects.shakeOffset();
    // Smooth follow: lerp, but snap on large jumps (teleports).
    const snap = this._pos.distanceTo(new THREE.Vector3(px, py, pz)) > 25;
    const k = snap ? 1 : Math.min(1, dt * 7);
    this._pos.x += (px + shake.x - this._pos.x) * k;
    this._pos.y += (Math.max(1.4, py + shake.y) - this._pos.y) * k;
    this._pos.z += (pz - this._pos.z) * k;
    this.camera.position.copy(this._pos);
    const lookX = target.x + Math.sin(target.heading) * 3.5;
    const lookZ = target.z + Math.cos(target.heading) * 3.5;
    this.camera.lookAt(lookX, (target.y || 0) + 1.7, lookZ);
    this._setFov(60 + speedNorm * 8, dt);
  }

  _setFov(target, dt) {
    this.fov += (target - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
