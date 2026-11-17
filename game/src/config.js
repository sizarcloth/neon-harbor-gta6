// NEON HARBOR: shared constants. One source of truth for tuning numbers.
export const WORLD_HALF = 200;
export const ROADS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_HALF = 4;
export const DEBT_TOTAL = 5000;

export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 7.5;
export const JUMP_SPEED = 8.5;
export const GRAVITY = 22;

export const PLAYER_RADIUS = 0.55;
export const CAR_RADIUS = 2.1;
export const ENTER_RANGE = 5.5;
export const PUNCH_RANGE = 2.8;
export const PISTOL_RANGE = 60;
export const AMMO_START = 12;
export const AMMO_MAX = 24;
export const HEALTH_MAX = 100;

export const TRAFFIC_COUNT = 12;
export const PED_COUNT = 18;

// Car types: top speed (m/s), acceleration (m/s^2), steering response.
export const CAR_TYPES = {
  sedan: { top: 27, accel: 11, steer: 1.0, length: 4.4, width: 1.9 },
  taxi: { top: 25, accel: 10, steer: 1.0, length: 4.4, width: 1.9 },
  sports: { top: 35, accel: 15, steer: 1.25, length: 4.5, width: 2.0 },
  pickup: { top: 23, accel: 9, steer: 0.9, length: 4.9, width: 2.0 },
  police: { top: 31, accel: 14, steer: 1.15, length: 4.5, width: 1.95 },
};

export const CAR_PAINTS = [
  0xc23b2e, 0x2e6fc2, 0xe8e3d5, 0x2b2b2b, 0x3f8f5a,
  0xd8a13c, 0x7a4fa3, 0x9fb4c0, 0xe06a9a, 0x3c8f8f,
];

export const BUILDING_COLORS = [
  0xe8d9b8, 0xd9a066, 0xc98a6b, 0x9db8a4, 0xe5c8c0,
  0xb8c4cc, 0xd9c46a, 0xc2b280, 0xa8b8d0, 0xe0a899,
];

export const SKIN_TONES = [0xf2c89b, 0xd9a066, 0xa06a3b, 0x8a5a2e, 0xf7d7b0];
export const SHIRT_COLORS = [
  0xc23b2e, 0x2e6fc2, 0x3f8f5a, 0xd8a13c, 0x7a4fa3,
  0xe06a9a, 0x3c8f8f, 0xe8e3d5, 0x5a5a5a, 0xd97b2e,
];

export const NEON_SIGNS = [
  { text: 'SOLMAR', color: '#ff2e88' },
  { text: 'HOTEL', color: '#ffd23c' },
  { text: 'TACOS', color: '#2eff8f' },
  { text: 'NEON BAR', color: '#3cc8ff' },
  { text: 'PIER 9', color: '#ff7a3c' },
  { text: 'SURF', color: '#2eff8f' },
  { text: 'CINEMA', color: '#ff2e88' },
  { text: 'DINER', color: '#ffd23c' },
];

// Fixed street-parked cars (road-edge parking, facing along the road).
// Heading: forward = (sin h, cos h) in (x, z). h = PI/2 faces +X.
export const PARKED_CARS = [
  { type: 'sedan', x: -12, z: 43.6, heading: Math.PI / 2, color: 0x2e6fc2 },
  { type: 'taxi', x: -20, z: 43.6, heading: Math.PI / 2, color: 0xd8a13c },
  { type: 'pickup', x: 24, z: 43.6, heading: Math.PI / 2, color: 0x3f8f5a },
  { type: 'sedan', x: 43.6, z: -60, heading: 0, color: 0xc23b2e },
  { type: 'taxi', x: 43.6, z: 100, heading: Math.PI, color: 0xd8a13c },
  { type: 'sedan', x: -83.6, z: -20, heading: 0, color: 0xe8e3d5 },
  { type: 'pickup', x: -83.6, z: 60, heading: Math.PI, color: 0x2b2b2b },
  { type: 'sedan', x: 20, z: -83.6, heading: Math.PI / 2, color: 0x9fb4c0 },
  { type: 'taxi', x: 100, z: -83.6, heading: -Math.PI / 2, color: 0xd8a13c },
  { type: 'sedan', x: -60, z: 123.6, heading: Math.PI / 2, color: 0x7a4fa3 },
];

// Mission 2 target: the red sports coupe in the Palm Row parking lot.
export const TARGET_CAR = { type: 'sports', x: -28, z: 92, heading: Math.PI / 2, color: 0xc23b2e };

// Mission 4 crates on the harbor dock.
export const CRATE_SPOTS = [[158, -12], [172, 6], [182, -4]];

// Harbor guards (mission 4).
export const GUARD_SPOTS = [[155, -20], [168, 12], [178, -10]];

// Ammo pickup boxes around the city.
export const AMMO_SPOTS = [[80, 40], [-80, -80], [40, -120], [-140, 40]];

export const GARAGE = { x: 60, z: -36, radius: 10 };
export const HOSPITAL = { x: 0, z: 160 };
export const POLICE_STATION = { x: 0, z: -40 };
export const PLAYER_SPAWN = { x: 0, z: 8, heading: 0 };
