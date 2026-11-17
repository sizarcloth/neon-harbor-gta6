// Combat: punch (F or click without pistol) and hitscan pistol (Q to
// draw, click to shoot). Punch is a short arc in front of the player;
// the pistol fires along the camera's aim. Both are crimes: hitting
// someone raises the wanted level and scares nearby pedestrians.
import * as THREE from 'three';
import { PUNCH_RANGE, PISTOL_RANGE } from './config.js';

export class Combat {
  constructor(scene, audio, effects) {
    this.scene = scene;
    this.audio = audio;
    this.effects = effects;
    this.flash = new THREE.PointLight(0xffcc66, 0, 14);
    scene.add(this.flash);
    this.flashTimer = 0;
  }

  _targetsInArc(game, range, halfAngle) {
    const p = game.player;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const out = [];
    const consider = (w, kind) => {
      if (!w || w.state === 'down') return;
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) return;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos(halfAngle)) return;
      out.push({ w, kind, d });
    };
    for (const w of game.peds.peds) consider(w, 'ped');
    for (const w of game.peds.guards) consider(w, 'guard');
    for (const w of game.peds.cops) consider(w, 'cop');
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  punch(game) {
    const p = game.player;
    if (p.inCar) return;
    const hits = this._targetsInArc(game, PUNCH_RANGE, 0.9);
    this.audio.play('punch');
    // Whiff: a little arm swing feedback anyway (handled by the caller
    // via the punch animation timer on the player).
    p.punchTimer = 0.25;
    if (!hits.length) return;
    const { w, kind } = hits[0];
    this.effects.hitStop(60);
    this.effects.addTrauma(0.22);
    this.effects.burst(w.x, 1.2, w.z, 0xffcc44, 8, 3.5);
    game.peds.scare(p.x, p.z, 15);
    if (kind === 'ped') {
      game.peds.knockDown(w, 8);
      game.police.addWanted(1);
      if (game.hud) game.hud.toast('You knocked someone down');
    } else {
      w.health -= 1;
      if (w.health <= 0) {
        game.peds.knockDown(w, kind === 'cop' ? 10 : 20);
        game.police.addWanted(kind === 'cop' ? 2 : 1);
      }
    }
  }

  shoot(game) {
    const p = game.player;
    if (!p.pistol) {
      this.punch(game);
      return;
    }
    if (p.ammo <= 0) {
      if (game.hud) game.hud.toast('Out of ammo. Find an ammo box');
      return;
    }
    p.ammo -= 1;
    this.audio.play('shot');
    this.effects.addTrauma(0.16);
    // Muzzle flash at the player's hands.
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    this.flash.position.set(p.x + fx * 1.2, 1.5, p.z + fz * 1.2);
    this.flash.intensity = 3;
    this.flashTimer = 0.06;
    this.effects.burst(p.x + fx * 1.4, 1.5, p.z + fz * 1.4, 0xffcc66, 4, 2);
    // Aim along the camera direction, flattened to the ground plane.
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(fx, 0, fz);
    dir.normalize();
    let best = null;
    let bestD = PISTOL_RANGE;
    const consider = (w, kind) => {
      if (!w || w.state === 'down') return;
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > PISTOL_RANGE || d < 0.01) return;
      const dot = (dx * dir.x + dz * dir.z) / d;
      if (dot < Math.cos(0.16)) return;
      if (d < bestD) { bestD = d; best = { w, kind }; }
    };
    for (const w of game.peds.peds) consider(w, 'ped');
    for (const w of game.peds.guards) consider(w, 'guard');
    for (const w of game.peds.cops) consider(w, 'cop');
    if (best) {
      const { w, kind } = best;
      this.effects.burst(w.x, 1.2, w.z, 0xff5544, 10, 4);
      game.peds.knockDown(w, kind === 'ped' ? 8 : 20);
      game.police.addWanted(kind === 'cop' ? 2 : 1);
    }
    // A gunshot is a crime even when it misses, and it scares the street.
    game.police.addWanted(1);
    game.peds.scare(p.x, p.z, 22);
  }

  update(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
  }
}
