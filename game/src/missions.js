// Five sequential missions: objectives, beacon marker, rewards, win state.
import * as THREE from 'three';
import { MISSIONS, CRATES } from './config.js';

export class Missions {
  constructor(world) {
    this.world = world;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.cratesGot = 0;
    this.done = false;
    // Beacon: a pulsing yellow column over the current objective.
    const geo = new THREE.CylinderGeometry(1.5, 1.5, 9, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 4.5;
    world.scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(1.6, 2.1, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    world.scene.add(this.ring);
  }

  get def() { return MISSIONS[this.missionIndex]; }
  get step() { return this.done ? null : this.def.steps[this.stepIndex]; }

  objectiveText() {
    if (this.done) return 'All missions complete. The debt is paid.';
    return `${this.def.name}: ${this.step.text}`;
  }

  currentStep() {
    const s = this.step;
    if (!s) return null;
    const out = {};
    if (s.action) out.action = s.action;
    if (s.needsCar) out.needsCar = true;
    if (s.loc) out.loc = { x: s.loc.x, z: s.loc.z };
    return out;
  }

  // Where the beacon and the minimap marker point right now.
  targetPoint() {
    const s = this.step;
    if (!s) return null;
    if (s.action === 'enterTargetCar') return { x: this.world.targetCar.x, z: this.world.targetCar.z };
    if (s.action === 'collectCrates') {
      const left = CRATES.filter((c) => !this.world.crates.find((wc) => wc.x === c.x && wc.z === c.z && wc.got));
      return left.length ? left[0] : { x: 172, z: 0 };
    }
    if (s.action === 'stealAnyCar') return null;
    return s.loc;
  }

  startMission(i) {
    this.missionIndex = i;
    this.stepIndex = 0;
    this.cratesGot = 0;
    this.done = false;
    for (const c of this.world.crates) { c.got = false; c.mesh.visible = true; }
    this.showIntro();
  }

  showIntro() {
    if (this.done) return;
    this.world.hud.showBanner(this.def.name, this.def.intro);
    this.world.audio.play('mission');
  }

  completeStep() {
    const prevMission = this.missionIndex;
    const prevStep = this.stepIndex;
    this.stepIndex += 1;
    if (this.stepIndex >= this.def.steps.length) {
      this.completeMission();
      return;
    }
    // Picking up the Heat Run package puts the cops on the player.
    if (this.step.heatOnPickup) {
      this.world.setWanted(2);
      this.world.hud.toast('The cops are onto you. Lose them after the drop.');
    }
    if (prevMission === 3 && prevStep === 0) this.world.hud.toast('Crates loaded. Get them to the garage.');
    this.world.audio.play('chime');
  }

  completeMission() {
    const reward = this.def.reward;
    this.world.money += reward;
    this.world.hud.toast(`Mission complete: ${this.def.name}. Paid $${reward}.`);
    this.world.audio.play('mission');
    if (this.missionIndex >= MISSIONS.length - 1) {
      this.done = true;
      this.missionIndex = MISSIONS.length;
      this.world.debt = 0;
      this.world.setState('win');
      return;
    }
    this.missionIndex += 1;
    this.stepIndex = 0;
    this.cratesGot = 0;
    if (this.missionIndex === 3) this.world.spawnGuards();
    this.showIntro();
  }

  teleportToObjective() {
    const s = this.step;
    if (!s) return;
    const w = this.world;
    if (s.action === 'collectCrates') {
      const left = CRATES.filter((c) => !w.crates.find((wc) => wc.x === c.x && wc.z === c.z && wc.got));
      if (left.length) { w.placePlayer(left[0].x, left[0].z); return; }
    }
    if (s.action === 'enterTargetCar') { w.placePlayer(w.targetCar.x + 2, w.targetCar.z); return; }
    if (s.action === 'stealAnyCar') return;
    const t = s.loc;
    if (w.inCar && w.playerCar) {
      w.playerCar.x = t.x; w.playerCar.z = t.z;
      w.playerCar.speed = 0;
      w.playerCar.setTransform();
      w.player.x = t.x; w.player.z = t.z;
    } else {
      w.placePlayer(t.x, t.z);
    }
  }

  update(dt, time) {
    const target = this.targetPoint();
    if (target && !this.done) {
      this.beacon.visible = true;
      this.ring.visible = true;
      this.beacon.position.x = target.x;
      this.beacon.position.z = target.z;
      this.ring.position.x = target.x;
      this.ring.position.z = target.z;
      const pulse = 0.35 + Math.sin(time * 3) * 0.15;
      this.beacon.material.opacity = pulse;
      this.ring.material.opacity = 0.5 + Math.sin(time * 3) * 0.2;
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }
    if (this.done || this.world.state !== 'playing') return;
    const s = this.step;
    const w = this.world;
    if (s.action === 'enterTargetCar') {
      if (w.inCar && w.playerCar === w.targetCar) this.completeStep();
    } else if (s.action === 'collectCrates') {
      for (const c of w.crates) {
        if (!c.got && (w.player.x - c.x) ** 2 + (w.player.z - c.z) ** 2 < 9) {
          c.got = true;
          c.mesh.visible = false;
          this.cratesGot += 1;
          w.audio.play('pickup');
          w.hud.toast(`Crate ${this.cratesGot} of 3 collected`);
        }
      }
      if (this.cratesGot >= 3) this.completeStep();
    } else if (s.action === 'stealAnyCar') {
      if (w.inCar) this.completeStep();
    } else {
      const px = w.inCar && w.playerCar ? w.playerCar.x : w.player.x;
      const pz = w.inCar && w.playerCar ? w.playerCar.z : w.player.z;
      if ((px - s.loc.x) ** 2 + (pz - s.loc.z) ** 2 < s.radius * s.radius) this.completeStep();
    }
  }
}
