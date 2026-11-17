// Story missions: five sequential jobs that pay off Rae's $5,000 debt
// to Sol. Each step is either "go here" (loc), "go here in a car"
// (needsCar), or a scripted action (steal a specific car, steal any
// car, collect crates). Rewards total exactly $5,000.
import { CRATE_SPOTS, TARGET_CAR, GARAGE } from './config.js';
import { buildCrate, buildBeacon } from './models.js';

export const MISSIONS = [
  {
    name: 'First Fare',
    reward: 300,
    intro: 'Sol: A client needs a ride across town. Be polite, drive smooth.',
    steps: [
      { text: 'Pick up the passenger at Marina Ave', loc: [20, 0] },
      { text: 'Drive the passenger to North Plaza', loc: [-120, 80], needsCar: true },
    ],
  },
  {
    name: 'Hot Wheels',
    reward: 600,
    intro: 'Sol: A red sports coupe is parked on Palm Row. Bring it to my garage.',
    steps: [
      { text: 'Steal the red sports coupe on Palm Row', action: 'enterTargetCar' },
      { text: 'Deliver the coupe to Sol\'s garage', loc: [GARAGE.x, GARAGE.z], needsCar: true },
    ],
  },
  {
    name: 'Heat Run',
    reward: 800,
    heat: 2,
    intro: 'Sol: Move this package across town. The cops are already watching.',
    steps: [
      { text: 'Pick up the package at North Market', loc: [0, 120] },
      { text: 'Deliver the package across town', loc: [-160, 0], needsCar: true },
      { text: 'Lose the heat and reach the safehouse', loc: [120, 120], needsCar: true, clearHeat: true },
    ],
  },
  {
    name: 'Harbor Heist',
    reward: 1100,
    intro: 'Sol: Three crates are sitting on the dock. Guards included, free of charge.',
    steps: [
      { text: 'Reach the harbor gate', loc: [140, 0] },
      { text: 'Collect 3 crates from the dock', action: 'collectCrates' },
      { text: 'Bring the crates to Sol\'s garage', loc: [GARAGE.x, GARAGE.z] },
    ],
  },
  {
    name: 'The Big Score',
    reward: 2200,
    intro: 'Sol: One last job. Grab a car, pick up the crew, and vanish.',
    steps: [
      { text: 'Steal a getaway car', action: 'stealAnyCar' },
      { text: 'Pick up the crew at South Yard', loc: [-40, -120], needsCar: true },
      { text: 'Escape to the hideout', loc: [120, -120], needsCar: true },
    ],
  },
];

export class MissionSystem {
  constructor(scene, peds, police, audio, hud) {
    this.scene = scene;
    this.peds = peds;
    this.police = police;
    this.audio = audio;
    this.hud = hud;
    this.index = 0;
    this.step = 0;
    this.done = false;
    this.collected = 0;
    this.onReward = null;
    this.onWin = null;
    this.onSave = null;
    // Mission crates live on the dock from the start; they only count
    // during the Harbor Heist collect step.
    this.crates = CRATE_SPOTS.map(([x, z]) => {
      const mesh = buildCrate(1.3);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = 0.4;
      scene.add(mesh);
      return { mesh, x, z, taken: false };
    });
    this.beacon = buildBeacon(0xffd23c);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this._pulse = 0;
  }

  get mission() {
    return MISSIONS[this.index] || null;
  }

  currentStep() {
    const m = this.mission;
    if (!m) return null;
    return m.steps[this.step] || null;
  }

  objective() {
    if (this.done) return 'Debt paid. Port Solmar is yours.';
    const m = this.mission;
    const s = this.currentStep();
    if (!m || !s) return '';
    if (s.action === 'collectCrates') {
      return `${m.name}: Collect the crates (${this.collected}/3)`;
    }
    return `${m.name}: ${s.text}`;
  }

  startMission(i) {
    if (i >= MISSIONS.length) {
      this.index = MISSIONS.length;
      this.step = 0;
      this.done = true;
      this.beacon.visible = false;
      return;
    }
    this.index = i;
    this.step = 0;
    this.done = false;
    this.collected = 0;
    for (const c of this.crates) {
      c.taken = false;
      c.mesh.visible = true;
    }
    const m = this.mission;
    if (!m) return;
    if (m.heat) this.police.setWanted(m.heat);
    if (i === 3) this.peds.spawnGuards();
    if (this.hud) {
      this.hud.banner(m.name, m.intro);
      this.hud.toast(`Mission ${i + 1} of 5: ${m.name}`);
    }
    this.audio.play('chime');
    this._placeBeacon();
  }

  setStep(s) {
    this.step = s;
    this._placeBeacon();
  }

  _beaconTarget() {
    const s = this.currentStep();
    if (!s) return null;
    if (s.loc) return { x: s.loc[0], z: s.loc[1] };
    if (s.action === 'enterTargetCar') return { x: TARGET_CAR.x, z: TARGET_CAR.z };
    if (s.action === 'collectCrates') return { x: 170, z: 0 };
    return null;
  }

  _placeBeacon() {
    const t = this._beaconTarget();
    if (!t || this.done) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beacon.position.set(t.x, 0, t.z);
  }

  onEnterCar(car) {
    const s = this.currentStep();
    if (!s || !s.action) return;
    if (s.action === 'enterTargetCar' && car.target) this._completeStep();
    else if (s.action === 'stealAnyCar') this._completeStep();
  }

  _completeStep() {
    const s = this.currentStep();
    const m = this.mission;
    if (!s || !m) return;
    if (s.clearHeat) this.police.clearWanted();
    this.audio.play('chime');
    this.step += 1;
    if (this.step >= m.steps.length) {
      this._completeMission();
    } else {
      if (this.hud) this.hud.toast('Step done. Next: ' + this.currentStep().text);
      this._placeBeacon();
    }
  }

  _completeMission() {
    const m = this.mission;
    if (!m) return;
    if (this.onReward) this.onReward(m.reward);
    if (this.hud) {
      this.hud.banner('Job done', `${m.name} paid $${m.reward}`);
      this.hud.toast(`+$${m.reward} from ${m.name}`);
    }
    if (this.onSave) this.onSave();
    if (this.index >= MISSIONS.length - 1) {
      this.done = true;
      this.index = MISSIONS.length;
      this.beacon.visible = false;
      if (this.onWin) this.onWin();
      return;
    }
    this.startMission(this.index + 1);
  }

  update(dt, player) {
    this._pulse += dt;
    if (this.beacon.visible) {
      const s = 1 + Math.sin(this._pulse * 3) * 0.08;
      this.beacon.userData.ring.scale.set(s, s, 1);
      this.beacon.userData.beam.material.opacity = 0.26 + Math.sin(this._pulse * 3) * 0.08;
    }
    if (this.done) return;
    const s = this.currentStep();
    if (!s) return;
    if (s.action === 'collectCrates') {
      for (const c of this.crates) {
        if (c.taken) continue;
        const d = Math.hypot(player.x - c.x, player.z - c.z);
        if (d < 4) {
          c.taken = true;
          c.mesh.visible = false;
          this.collected += 1;
          this.audio.play('pickup');
          if (this.hud) this.hud.toast(`Crate ${this.collected} of 3 collected`);
        }
      }
      if (this.collected >= 3) this._completeStep();
      return;
    }
    if (s.loc) {
      const d = Math.hypot(player.x - s.loc[0], player.z - s.loc[1]);
      const radius = s.needsCar ? 10 : 7;
      if (d < radius && (!s.needsCar || player.inCar)) this._completeStep();
    }
  }
}
