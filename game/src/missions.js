// missions.js — the five-story job chain for Sol. Each mission is a
// list of steps; a step completes by arriving somewhere, entering a
// car, or collecting crates. Rewards total exactly $5000: the debt.

export const CRATE_SPOTS = [[158, -12], [172, 6], [182, -4]];

export const MISSIONS = [
  {
    name: 'First Fare',
    reward: 300,
    intro: 'Sol needs a driver. Pick up the passenger at the plaza and take them to the hotel. Easy money.',
    steps: [
      { text: 'Pick up the passenger at the plaza', loc: [20, 20], radius: 6 },
      { text: 'Drive the passenger to the hotel', loc: [80, -40], radius: 8, needsCar: true },
    ],
  },
  {
    name: 'Hot Wheels',
    reward: 800,
    intro: 'A red sports coupe is parked uptown. Steal it and bring it to the garage. No questions.',
    steps: [
      { text: 'Steal the red sports coupe', action: 'enterTargetCar' },
      { text: 'Deliver the coupe to the garage', loc: [60, 40], radius: 8, needsCar: true },
    ],
  },
  {
    name: 'Heat Run',
    reward: 900,
    intro: 'A package needs to move across town, and the cops are already watching. Grab it, deliver it, lose them.',
    wantedOnStart: 2,
    clearWantedOnComplete: true,
    steps: [
      { text: 'Pick up the package', loc: [-40, 60], radius: 6 },
      { text: 'Deliver the package across town', loc: [120, 100], radius: 8, needsCar: true },
    ],
  },
  {
    name: 'Harbor Heist',
    reward: 800,
    intro: 'Crates at the harbor, guards on watch. Collect all three and bring them to the warehouse.',
    steps: [
      { text: 'Collect the crates at the harbor', action: 'collectCrates' },
      { text: 'Deliver the crates to the warehouse', loc: [120, 40], radius: 8, needsCar: true },
    ],
  },
  {
    name: 'The Big Score',
    reward: 2200,
    intro: 'The big score. Steal a car, pick up the crew, and get to the hideout. This pays the debt.',
    steps: [
      { text: 'Steal a car for the job', action: 'stealAnyCar' },
      { text: 'Pick up the crew', loc: [-40, -60], radius: 8, needsCar: true },
      { text: 'Escape to the hideout', loc: [0, -60], radius: 8, needsCar: true },
    ],
  },
];

export class MissionManager {
  constructor() {
    this.missionIndex = 0;
    this.missionStep = 0;
    this.missionDone = false;
    this.cratesCollected = new Set();
  }

  get mission() {
    return MISSIONS[this.missionIndex] || null;
  }

  currentStep() {
    const m = this.mission;
    if (!m) return null;
    return m.steps[this.missionStep] || null;
  }

  objectiveText() {
    const m = this.mission;
    if (!m) return 'Debt paid. Port Solmar is yours.';
    const step = this.currentStep();
    return `${m.name}: ${step ? step.text : 'Done'}`;
  }

  startMission(i) {
    this.missionIndex = i;
    this.missionStep = 0;
    this.missionDone = false;
    this.cratesCollected = new Set();
  }

  collectCrate(i) {
    this.cratesCollected.add(i);
  }

  cratesLeft() {
    return CRATE_SPOTS.length - this.cratesCollected.size;
  }

  // Check the current step against the live game state. Returns
  // 'advanced' | 'completed' | null. The game applies rewards.
  update(game) {
    const step = this.currentStep();
    if (!step) return null;
    const player = game.player;
    let done = false;
    if (step.action === 'enterTargetCar') {
      done = player.inCar && player.car === game.targetCar;
    } else if (step.action === 'stealAnyCar') {
      done = player.inCar;
    } else if (step.action === 'collectCrates') {
      done = this.cratesCollected.size >= CRATE_SPOTS.length;
    } else if (step.loc) {
      const dx = player.x - step.loc[0];
      const dz = player.z - step.loc[1];
      const near = Math.sqrt(dx * dx + dz * dz) < step.radius;
      done = near && (!step.needsCar || player.inCar);
    }
    if (!done) return null;
    this.missionStep += 1;
    if (this.missionStep >= this.mission.steps.length) return 'completed';
    return 'advanced';
  }
}
