// NEON HARBOR tuning, palette, world layout and mission data. One place for every number.
export const SAVE_KEY = 'neon-harbor-save-v1';
export const SEED_DEFAULT = 1;

// World: a 400x400 m coastal city. Roads every 40 m from -160 to 160.
export const WORLD = { half: 200, roadMin: -160, roadMax: 160, roadStep: 40, roadWidth: 9 };
export const ROADS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];

// Warm sunset + teal sea + neon pink. Palette: 3 core colours + 1 accent (per anti-slop R-29).
export const PALETTE = {
  skyTop: 0x2e3a68, skyHorizon: 0xff9e64, fog: 0xf2a06b,
  sun: 0xffd9a0, hemiSky: 0xffc490, hemiGround: 0x3a4a5a,
  asphalt: 0x33363e, sidewalk: 0x9a938a, block: 0x8a7f72,
  sand: 0xe8c98f, sea: 0x1e7f8c, harbor: 0x7d7468,
  neonPink: 0xff2e88, neonCyan: 0x2ee6ff, neonAmber: 0xffb020,
  hudPanel: 'rgba(12,16,28,0.78)', hudText: '#f5efe4', hudAmber: '#ffb020', hudPink: '#ff2e88',
};

export const PLAYER = { walk: 5.5, sprint: 9.5, jump: 7.5, radius: 0.6, health: 100 };
export const START = { money: 0, debt: 5000, ammo: 24, health: 100 };

export const CAR_TYPES = {
  sedan: { maxSpeed: 26, accel: 11, brake: 22, steer: 1.9, body: 0xff5a3c, label: 'Sedan' },
  taxi: { maxSpeed: 24, accel: 10, brake: 22, steer: 1.9, body: 0xffc21c, label: 'Taxi' },
  sports: { maxSpeed: 38, accel: 16, brake: 26, steer: 2.4, body: 0x2ee6ff, label: 'Sports coupe' },
  pickup: { maxSpeed: 22, accel: 9, brake: 20, steer: 1.7, body: 0x7fb069, label: 'Pickup' },
  police: { maxSpeed: 30, accel: 14, brake: 26, steer: 2.2, body: 0xf2f2f2, label: 'Cruiser' },
};

// Parked cars the player can steal. First one is the playtest's lot car.
export const PARKED_CARS = [
  { type: 'sedan', x: -12, z: 48, heading: 0.3 },
  { type: 'taxi', x: -26, z: 58, heading: 0.3 },
  { type: 'pickup', x: -30, z: 68, heading: 0.3 },
  { type: 'sports', x: -28, z: 92, heading: -0.2 }, // mission 2 target
  { type: 'sedan', x: 52, z: -8, heading: 1.57 },
  { type: 'taxi', x: 88, z: 44, heading: 1.57 },
  { type: 'pickup', x: -88, z: -52, heading: 0 },
  { type: 'sedan', x: 124, z: -84, heading: -1.57 },
  { type: 'sedan', x: -52, z: 124, heading: 1.57 },
  { type: 'taxi', x: 44, z: 92, heading: 0 },
  { type: 'sedan', x: -124, z: -12, heading: 0 },
  { type: 'pickup', x: 132, z: 60, heading: -1.57 },
];

export const GARAGE = { x: 116, z: 116, radius: 10, sprayCost: 100, sportsCost: 1500 };
export const HOSPITAL = { x: -116, z: 156, radius: 8 };
export const SHOP_SIGN = { x: 104, z: 104 };
export const CRATES = [{ x: 158, z: -12 }, { x: 172, z: 6 }, { x: 182, z: -4 }];
export const GUARD_POSTS = [{ x: 166, z: -18 }, { x: 176, z: 12 }];
export const AMMO_SPOTS = [{ x: 44, z: 44 }, { x: -84, z: -44 }, { x: 124, z: -44 }, { x: -44, z: 124 }, { x: 164, z: 30 }, { x: -124, z: 84 }];
export const HEALTH_SPOTS = [{ x: -44, z: -84 }, { x: 84, z: 84 }, { x: -124, z: 44 }, { x: 44, z: -124 }];

// Five sequential missions. Rewards sum to exactly $5000, the debt.
export const MISSIONS = [
  {
    name: 'First Fare', reward: 300,
    intro: 'Sol needs his money. First job: drive a passenger across town.',
    steps: [
      { text: 'Pick up the passenger at Palm Ave', loc: { x: 36, z: -36 }, radius: 4 },
      { text: 'Drive the passenger to the hotel', loc: { x: -76, z: 116 }, radius: 7, needsCar: true },
    ],
  },
  {
    name: 'Hot Wheels', reward: 700,
    intro: 'A buyer wants a sports coupe. Steal the blue one from the lot.',
    steps: [
      { text: 'Steal the blue sports coupe', loc: { x: -28, z: 92 }, radius: 4, action: 'enterTargetCar' },
      { text: 'Deliver the coupe to the garage', loc: { x: 116, z: 116 }, radius: 8, needsCar: true },
    ],
  },
  {
    name: 'Heat Run', reward: 1000,
    intro: 'A package, a deadline, and cops on the radio. Move fast.',
    steps: [
      { text: 'Pick up the package at the north lot', loc: { x: -116, z: -116 }, radius: 4 },
      { text: 'Deliver the package while wanted', loc: { x: 116, z: -116 }, radius: 7, needsCar: true, heatOnPickup: true },
    ],
  },
  {
    name: 'Harbor Heist', reward: 1500,
    intro: 'Crates at the harbor, guards on patrol. Grab all three.',
    steps: [
      { text: 'Collect the 3 crates at the harbor', loc: { x: 172, z: 0 }, radius: 4, action: 'collectCrates' },
      { text: 'Drive the crates to the garage', loc: { x: 116, z: 116 }, radius: 8, needsCar: true },
    ],
  },
  {
    name: 'The Big Score', reward: 1500,
    intro: 'One last job and the debt is gone. Steal a car, grab the crew, run.',
    steps: [
      { text: 'Steal any car', loc: { x: 0, z: 0 }, radius: 4, action: 'stealAnyCar' },
      { text: 'Pick up the crew at the beach', loc: { x: -40, z: 156 }, radius: 7, needsCar: true },
      { text: 'Escape to the hideout', loc: { x: 156, z: 156 }, radius: 8, needsCar: true },
    ],
  },
];

export const WANTED_DECAY_HIDDEN_S = 10;
export const POLICE_MAX = 3;
export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 22;
