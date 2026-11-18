// NEON HARBOR world: scene, player, cars, people, police, missions, save, debug seam.
import * as THREE from 'three';
import { SAVE_KEY, START, PLAYER, PARKED_CARS, GARAGE, HOSPITAL, CRATES, GUARD_POSTS, TRAFFIC_COUNT, PED_COUNT, POLICE_MAX, ROADS, SHOP_SIGN } from './config.js';
import { createRandom, clamp, angleLerp, range, pick } from './random.js';
import { createInput, ACT } from './input.js';
import { createAudio } from './audio.js';
import { buildCity, resolveCollisions } from './city.js';
import { buildPerson, buildCrate, buildCar } from './models.js';
import { Car } from './vehicles.js';
import { Ped, FootCop, Guard, sidewalkPoint, nearestPed } from './people.js';
import { Particles, Pickups, punch, shoot, damagePlayer } from './combat.js';
import { Missions } from './missions.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;

export class World {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.seed = opts.seed ?? 1;
    this.rng = createRandom(this.seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.city = buildCity(this.scene, this.rng);
    this.input = createInput();
    this.audio = createAudio();
    this.particles = new Particles(this.scene);
    this.pickups = new Pickups(this.scene);
    this.missions = new Missions(this);
    this.hud = createHud(this);
    this.time = 0;
    this.state = 'title';
    this.money = START.money;
    this.debt = START.debt;
    this.ammo = START.ammo;
    this.pistol = false;
    this.wanted = 0;
    this.inCar = false;
    this.playerCar = null;
    this.targetCar = null;
    this.ownedSports = false;
    this.muted = false;
    this.trauma = 0;
    this.hitStopT = 0;
    this.hiddenT = 0;
    this.deadT = 0;
    this.bumpCooldown = 0;
    this.ramCooldown = 0;
    this.garageCooldown = 0;
    this.orbitAngle = 0.7;
    this.shotCam = null; // set by ?shot= staging: a fixed camera for the frame
    this.camYaw = 0;
    this.camPitch = 0.35;
    this.player = { x: 2, z: 8, y: 0, vy: 0, heading: 0, health: START.health, speed: 0, onGround: true, squashT: 0 };
    this.playerMesh = buildPerson(0xff7a3c, 0x2c3e50);
    this.playerMesh.position.set(2, 0, 8);
    this.scene.add(this.playerMesh);
    // Tracer for gunshots: one reusable thin cylinder.
    this.tracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }),
    );
    this.scene.add(this.tracer);
    this.tracerT = 0;
    this.cars = [];
    this.peds = [];
    this.footCops = [];
    this.guards = [];
    this.crates = [];
    for (const c of CRATES) {
      const mesh = buildCrate();
      mesh.position.set(c.x, 0, c.z);
      this.scene.add(mesh);
      this.crates.push({ x: c.x, z: c.z, mesh, got: false });
    }
    this.spawnParkedCars();
    this.spawnTraffic();
    this.spawnPeds();
    this.spawnGuards();
    this.debug = {
      placePlayer: (x, z) => this.placePlayer(x, z),
      setHeading: (h) => { this.player.heading = h; this.camYaw = h; },
      trafficPositions: () => this.cars.filter((c) => c.mode === 'traffic').map((c) => ({ x: c.x, z: c.z })),
      pedPositions: () => this.peds.map((p) => p.pos),
      nearestPed: () => { const p = nearestPed(this.peds, this.player.x, this.player.z); return p ? { x: p.x, z: p.z } : { x: 0, z: 0 }; },
      policeCarPositions: () => this.cars.filter((c) => c.mode === 'police').map((c) => ({ x: c.x, z: c.z })),
      startMission: (i) => this.missions.startMission(i),
      teleportToObjective: () => this.missions.teleportToObjective(),
      getInCar: () => this.getInCar(),
      setMoney: (n) => { this.money = n; },
      saveNow: () => this.save(),
      currentStep: () => this.missions.currentStep(),
      placeCar: (x, z, heading) => {
        if (!this.inCar) this.getInCar();
        if (this.playerCar) {
          this.playerCar.x = x; this.playerCar.z = z; this.playerCar.heading = heading;
          this.playerCar.speed = 0; this.playerCar.setTransform();
          this.player.x = x; this.player.z = z;
        }
      },
      setCarSpeed: (v) => { if (this.playerCar) this.playerCar.speed = v; },
      setWanted: (n) => this.setWanted(n),
      spawnPoliceNear: (x, z, heading) => this.spawnPoliceCar(x, z, heading),
    };
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    });
  }

  // ---- setup ----
  spawnParkedCars() {
    for (const def of PARKED_CARS) {
      const car = new Car(this.scene, def.type, def.x, def.z, def.heading);
      car.mode = 'parked';
      this.cars.push(car);
      if (def.type === 'sports' && Math.abs(def.x + 28) < 1 && Math.abs(def.z - 92) < 1) this.targetCar = car;
    }
  }
  spawnTraffic() {
    const types = ['sedan', 'taxi', 'sedan', 'pickup', 'taxi', 'sedan'];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      let x = 0, z = 0, tries = 0;
      do {
        const a = pick(this.rng, ROADS), b = pick(this.rng, ROADS);
        x = a; z = b;
        tries += 1;
      } while (Math.hypot(x, z) < 30 && tries < 20);
      const car = new Car(this.scene, pick(this.rng, types), x, z, this.rng() * Math.PI * 2);
      car.mode = 'traffic';
      this.cars.push(car);
    }
  }
  spawnPeds() {
    for (let i = 0; i < PED_COUNT; i += 1) {
      const p = sidewalkPoint(this.rng);
      this.peds.push(new Ped(this.scene, p.x, p.z, this.rng));
    }
  }
  spawnGuards() {
    for (const g of this.guards) this.scene.remove(g.mesh);
    this.guards = [];
    for (const p of GUARD_POSTS) this.guards.push(new Guard(this.scene, p.x, p.z));
  }

  // ---- state ----
  setState(s) {
    this.state = s;
    this.hud.setVisible(s === 'playing' || s === 'paused');
    document.getElementById('screen-title').style.display = s === 'title' ? 'flex' : 'none';
    document.getElementById('screen-pause').style.display = s === 'paused' ? 'flex' : 'none';
    document.getElementById('screen-win').style.display = s === 'win' ? 'flex' : 'none';
    document.getElementById('screen-dead').style.display = this.deadT > 0 ? 'flex' : 'none';
    if (s === 'win') {
      document.getElementById('win-stats').textContent = `All 5 missions done. $${this.money} earned. The debt is paid.`;
      this.audio.stopEngine();
      this.audio.stopSiren();
    }
    if (s === 'title') { this.audio.stopEngine(); this.audio.stopSiren(); }
  }
  toTitle() { this.setState('title'); }
  togglePause() {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }

  startNewGame() {
    this.money = START.money; this.debt = START.debt; this.ammo = START.ammo;
    this.pistol = false; this.wanted = 0; this.inCar = false; this.playerCar = null;
    this.ownedSports = false;
    this.player.health = START.health;
    this.player.x = 2; this.player.z = 8; this.player.y = 0; this.player.vy = 0;
    this.player.heading = 0; this.camYaw = 0; this.camPitch = 0.35;
    this.deadT = 0; this.trauma = 0; this.hiddenT = 0;
    for (const c of this.cars) c.remove();
    this.cars = [];
    this.spawnParkedCars();
    this.spawnTraffic();
    for (const p of this.peds) p.remove(this.scene);
    this.peds = [];
    this.spawnPeds();
    this.spawnGuards();
    for (const c of this.crates) { c.got = false; c.mesh.visible = true; }
    for (const it of this.pickups.items) { it.taken = false; it.mesh.visible = true; it.respawnT = 0; }
    this.footCops = [];
    this.missions.missionIndex = 0;
    this.missions.stepIndex = 0;
    this.missions.cratesGot = 0;
    this.missions.done = false;
    this.playerMesh.visible = true;
    this.setState('playing');
    this.missions.showIntro();
  }

  continueGame() {
    const save = this.loadSave();
    if (!save) return;
    this.money = save.money; this.debt = save.debt;
    this.ammo = save.ammo; this.player.health = save.health;
    this.ownedSports = !!save.ownedSports;
    this.muted = !!save.muted;
    this.audio.setMuted(this.muted);
    this.missions.missionIndex = save.missionIndex;
    this.missions.stepIndex = save.stepIndex || 0;
    this.missions.done = save.missionIndex >= 5;
    this.player.x = save.player.x; this.player.z = save.player.z;
    this.player.heading = save.player.heading || 0;
    this.camYaw = this.player.heading;
    this.wanted = 0;
    this.setState('playing');
    this.missions.showIntro();
  }

  // ---- save ----
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, money: this.money, debt: this.debt,
        missionIndex: this.missions.missionIndex, stepIndex: this.missions.stepIndex,
        health: this.player.health, ammo: this.ammo, ownedSports: this.ownedSports,
        muted: this.muted, player: { x: this.player.x, z: this.player.z, heading: this.player.heading },
      }));
    } catch { /* storage unavailable: the game still runs */ }
  }
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ---- player ----
  placePlayer(x, z) {
    if (this.inCar && this.playerCar) {
      this.playerCar.mode = 'parked';
      this.playerCar = null;
      this.inCar = false;
      this.audio.stopEngine();
    }
    this.player.x = x; this.player.z = z; this.player.y = 0; this.player.vy = 0;
    this.playerMesh.position.set(x, 0, z);
    this.playerMesh.visible = true;
  }

  getInCar() {
    if (this.inCar) return;
    let best = null, bestD = 60 * 60;
    for (const c of this.cars) {
      if (c.mode !== 'parked' && c.mode !== 'traffic') continue;
      const d = (c.x - this.player.x) ** 2 + (c.z - this.player.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) {
      best = new Car(this.scene, 'sedan', this.player.x + 3, this.player.z, 0);
      this.cars.push(best);
    }
    this.placePlayer(best.x + 2.5, best.z);
    this.enterCar(best);
  }

  enterCar(car) {
    this.playerCar = car;
    car.mode = 'player';
    car.edge = null;
    this.inCar = true;
    this.player.x = car.x; this.player.z = car.z;
    this.playerMesh.visible = false;
    this.audio.startEngine();
  }

  enterExitCar() {
    if (this.inCar && this.playerCar) {
      const car = this.playerCar;
      car.mode = 'parked';
      car.speed = 0;
      const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
      this.playerCar = null;
      this.inCar = false;
      this.audio.stopEngine();
      this.placePlayer(car.x + rx * 2.2, car.z + rz * 2.2);
      return;
    }
    // Buy the sports coupe at the shop sign when no car is near.
    const sd = (this.player.x - SHOP_SIGN.x) ** 2 + (this.player.z - SHOP_SIGN.z) ** 2;
    let best = null, bestD = 3.5 * 3.5;
    for (const c of this.cars) {
      if (c.mode !== 'parked' && c.mode !== 'traffic') continue;
      const d = (c.x - this.player.x) ** 2 + (c.z - this.player.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best && sd < 16 && !this.ownedSports) {
      if (this.money >= 1500) {
        this.money -= 1500;
        this.ownedSports = true;
        const car = new Car(this.scene, 'sports', 128, 116, 0);
        car.mode = 'parked';
        this.cars.push(car);
        this.hud.toast('Sports coupe bought. It is parked by the garage.');
        this.audio.play('chime');
      } else {
        this.hud.toast('Sports coupe costs $1500. Keep working missions.');
      }
      return;
    }
    if (!best) return;
    // Stealing in view of a pedestrian is a crime.
    let seen = false;
    for (const p of this.peds) {
      if (p.state !== 'down' && (p.x - best.x) ** 2 + (p.z - best.z) ** 2 < 20 * 20) { seen = true; break; }
    }
    if (seen) { this.commitCrime(1); this.hud.toast('Car stolen in view. The cops noticed.'); }
    this.enterCar(best);
  }

  // ---- crime and police ----
  commitCrime(level) {
    if (level > this.wanted) this.wanted = level;
    this.hiddenT = 0;
  }
  setWanted(n) { this.wanted = n; this.hiddenT = 0; }
  addTrauma(n) { this.trauma = Math.min(1, this.trauma + n); }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  spawnPoliceCar(x, z, heading = 0) {
    const car = new Car(this.scene, 'police', x, z, heading);
    car.mode = 'police';
    this.cars.push(car);
    return car;
  }
  managePolice(dt) {
    const want = this.wanted > 0 ? Math.min(this.wanted, POLICE_MAX) : 0;
    let have = this.cars.filter((c) => c.mode === 'police').length;
    if (have < want) {
      const g = this.city.graph;
      const cands = g.nodes.filter((n) => {
        const d = Math.hypot(n.x - this.player.x, n.z - this.player.z);
        return d > 45 && d < 65;
      });
      const node = cands.length ? pick(this.rng, cands) : g.nodes[g.nearestNode(this.player.x + 50, this.player.z)];
      this.spawnPoliceCar(node.x, node.z, Math.atan2(this.player.x - node.x, this.player.z - node.z));
      have += 1;
    } else if (have > want) {
      const police = this.cars.filter((c) => c.mode === 'police');
      police.sort((a, b) => ((b.x - this.player.x) ** 2 + (b.z - this.player.z) ** 2) - ((a.x - this.player.x) ** 2 + (a.z - this.player.z) ** 2));
      for (let i = 0; i < have - want; i += 1) {
        const c = police[i];
        c.remove();
        this.cars.splice(this.cars.indexOf(c), 1);
      }
    }
    // Foot cops at wanted 2+.
    if (this.wanted >= 2 && this.footCops.length < 2) {
      const p = sidewalkPoint(this.rng);
      const d = Math.hypot(p.x - this.player.x, p.z - this.player.z);
      if (d > 20 && d < 40) this.footCops.push(new FootCop(this.scene, p.x, p.z));
    }
    if (this.wanted < 2) {
      for (const c of this.footCops) this.scene.remove(c.mesh);
      this.footCops = [];
    }
    // Wanted decays when no police can see the player.
    if (this.wanted > 0) {
      let nearest = Infinity;
      for (const c of this.cars) {
        if (c.mode !== 'police') continue;
        nearest = Math.min(nearest, Math.hypot(c.x - this.player.x, c.z - this.player.z));
      }
      if (nearest > 45) {
        this.hiddenT += dt;
        if (this.hiddenT > 10) { this.wanted -= 1; this.hiddenT = 0; this.hud.toast('Heat is cooling off.'); }
      } else this.hiddenT = 0;
    }
  }

  bust() {
    this.money = Math.max(0, this.money - 100);
    this.wanted = 0;
    this.hud.toast('Busted. Sol bailed you out for $100.');
    this.audio.play('busted');
    for (const c of this.footCops) this.scene.remove(c.mesh);
    this.footCops = [];
  }

  guardShot(guard) {
    const from = new THREE.Vector3(guard.x, 1.4, guard.z);
    const to = new THREE.Vector3(this.player.x, 1.2, this.player.z);
    this.showTracer(from, to);
    this.audio.play('shot');
    if (Math.random() < 0.6) damagePlayer(this, 6, 'guard');
  }

  die() {
    if (this.deadT > 0) return;
    this.deadT = 1.6;
    document.getElementById('screen-dead').style.display = 'flex';
    this.audio.play('busted');
  }
  respawn() {
    this.money = Math.max(0, this.money - 200);
    this.player.health = START.health;
    this.wanted = 0;
    this.ammo = Math.max(this.ammo, 12);
    if (this.inCar && this.playerCar) { this.playerCar.mode = 'parked'; this.playerCar = null; this.inCar = false; }
    this.placePlayer(HOSPITAL.x + 6, HOSPITAL.z);
    this.deadT = 0;
    document.getElementById('screen-dead').style.display = 'none';
    this.hud.toast('You woke up at the hospital. -$200.');
    this.save();
  }

  onCarBump(speed) {
    if (this.bumpCooldown > 0 || speed < 6) return;
    this.bumpCooldown = 0.6;
    this.audio.play('crash');
    this.addTrauma(0.3);
    if (this.inCar) damagePlayer(this, 4, 'crash');
  }

  showTracer(from, to) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    this.tracer.position.copy(mid);
    this.tracer.scale.set(1, len, 1);
    this.tracer.lookAt(to);
    this.tracer.rotateX(Math.PI / 2);
    this.tracer.material.opacity = 0.9;
    this.tracerT = 0.09;
  }

  // ---- per-frame ----
  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - 1.5 * dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.garageCooldown = Math.max(0, this.garageCooldown - dt);
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      if (this.tracerT <= 0) this.tracer.material.opacity = 0;
    }
    if (this.hitStopT > 0) { this.hitStopT -= dt; return; }

    if (this.state === 'title' || this.state === 'win') {
      this.updateAmbient(dt);
      this.particles.update(dt);
      return;
    }
    if (this.state !== 'playing') return;

    // Death pause, then respawn.
    if (this.deadT > 0) {
      this.deadT -= dt;
      if (this.deadT <= 0) this.respawn();
      return;
    }

    const acts = this.input.takeActions();
    const mouse = this.input.takeMouse();
    this.camYaw -= mouse.dx * 0.005;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.002, 0.12, 0.85);
    if (acts & ACT.PAUSE) this.togglePause();
    if (acts & ACT.MUTE) { this.muted = !this.muted; this.audio.setMuted(this.muted); this.save(); }
    if (this.state !== 'playing') return;

    if (acts & ACT.PISTOL) {
      this.pistol = !this.pistol;
      this.audio.play('click');
      this.hud.toast(this.pistol ? 'Pistol out' : 'Pistol away');
    }
    if (acts & ACT.ENTER) this.enterExitCar();
    if (acts & ACT.PUNCH) punch(this);
    if (acts & ACT.FIRE) shoot(this);
    if (acts & ACT.JUMP && !this.inCar && this.player.onGround) {
      this.player.vy = PLAYER.jump;
      this.player.onGround = false;
      this.audio.play('jump');
    }

    if (this.inCar && this.playerCar) {
      const move = this.input.move();
      this.playerCar.drive(dt, move, this.input.handbrake());
      const hit = resolveCollisions(this.city.colliders, this.playerCar, 2.0);
      if (hit && Math.abs(this.playerCar.speed) > 8) {
        this.playerCar.speed *= 0.5;
        this.onCarBump(9);
      }
      this.playerCar.collideWithOthers(dt, this);
      this.playerCar.setTransform();
      this.player.x = this.playerCar.x;
      this.player.z = this.playerCar.z;
      this.player.speed = Math.abs(this.playerCar.speed);
      this.audio.setEngine(Math.abs(this.playerCar.speed) / this.playerCar.def.maxSpeed);
      // Pay-n-spray: drive in with stars and $100 to clear them.
      const gd = (this.playerCar.x - GARAGE.x) ** 2 + (this.playerCar.z - GARAGE.z) ** 2;
      if (gd < GARAGE.radius * GARAGE.radius && this.garageCooldown <= 0) {
        this.garageCooldown = 4;
        if (this.wanted > 0 && this.money >= GARAGE.sprayCost) {
          this.money -= GARAGE.sprayCost;
          this.wanted = 0;
          this.hud.toast(`Spray shop: stars cleared for $${GARAGE.sprayCost}.`);
          this.audio.play('chime');
        } else if (this.wanted > 0) {
          this.hud.toast(`Spray shop needs $${GARAGE.sprayCost} to clear your stars.`);
        }
      }
    } else {
      this.audio.setEngine(0);
      const move = this.input.move();
      const speed = this.input.sprint() ? PLAYER.sprint : PLAYER.walk;
      let vx = 0, vz = 0;
      if (move.x !== 0 || move.z !== 0) {
        const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
        const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
        vx = (fx * move.z + rx * move.x);
        vz = (fz * move.z + rz * move.x);
        const len = Math.hypot(vx, vz);
        vx = (vx / len) * speed; vz = (vz / len) * speed;
        this.player.heading = angleLerp(this.player.heading, Math.atan2(vx, vz), clamp(10 * dt, 0, 1));
      }
      this.player.x += vx * dt;
      this.player.z += vz * dt;
      resolveCollisions(this.city.colliders, this.player, PLAYER.radius);
      this.player.x = clamp(this.player.x, -195, 195);
      this.player.z = clamp(this.player.z, -195, 195);
      this.player.speed = Math.hypot(vx, vz);
      // Jump physics.
      if (!this.player.onGround) {
        this.player.vy -= 20 * dt;
        this.player.y += this.player.vy * dt;
        if (this.player.y <= 0) {
          this.player.y = 0; this.player.vy = 0; this.player.onGround = true;
          this.player.squashT = 0.12;
        }
      }
      if (this.player.squashT > 0) {
        this.player.squashT -= dt;
        const s = this.player.squashT > 0 ? 0.82 : 1;
        this.playerMesh.scale.set(1.15, s, 1.15);
        if (this.player.squashT <= 0) this.playerMesh.scale.set(1, 1, 1);
      }
      // Walk swing.
      const u = this.playerMesh.userData;
      const swinging = this.player.speed > 0.5;
      if (swinging) {
        const ph = this.time * this.player.speed * 1.6;
        const sw = Math.sin(ph) * 0.55;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
      } else {
        u.legL.rotation.x = 0; u.legR.rotation.x = 0; u.armL.rotation.x = 0; u.armR.rotation.x = 0;
      }
      this.playerMesh.position.set(this.player.x, this.player.y, this.player.z);
      this.playerMesh.rotation.y = this.player.heading;
    }

    this.updateAmbient(dt);
    this.managePolice(dt);
    this.missions.update(dt, this.time);
    this.pickups.update(dt, this);
    this.particles.update(dt);
    // Police ramming.
    for (const c of this.cars) {
      if (c.mode !== 'police') continue;
      const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
      if (this.inCar && this.playerCar) {
        if (d < 4.4 && this.ramCooldown <= 0) {
          this.ramCooldown = 0.5;
          this.playerCar.speed *= 0.6;
          this.audio.play('crash');
          this.addTrauma(0.3);
          damagePlayer(this, 5, 'ram');
        }
      } else if (d < 2.4 && this.ramCooldown <= 0) {
        this.ramCooldown = 0.8;
        this.audio.play('crash');
        this.addTrauma(0.4);
        damagePlayer(this, 15, 'ram');
        const dx = this.player.x - c.x, dz = this.player.z - c.z;
        const dd = Math.hypot(dx, dz) || 1;
        this.player.x += (dx / dd) * 2;
        this.player.z += (dz / dd) * 2;
      }
    }
    // Siren follows the nearest cruiser.
    let nearestPolice = Infinity;
    for (const c of this.cars) {
      if (c.mode !== 'police') continue;
      nearestPolice = Math.min(nearestPolice, Math.hypot(c.x - this.player.x, c.z - this.player.z));
    }
    if (nearestPolice < 60) { this.audio.startSiren(); this.audio.setSiren(nearestPolice); }
    else this.audio.stopSiren();
    if (this.state === 'paused') this.save();
  }

  updateAmbient(dt) {
    for (const c of this.cars) {
      if (!c.alive) continue;
      if (c.mode === 'traffic') c.trafficStep(dt, this);
      else if (c.mode === 'police') c.policeStep(dt, this);
      else if (c.mode === 'player') c.setTransform();
    }
    // Prune dead police entries.
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      if (!this.cars[i].alive) this.cars.splice(i, 1);
    }
    for (const p of this.peds) p.update(dt);
    for (let i = this.footCops.length - 1; i >= 0; i -= 1) {
      const c = this.footCops[i];
      c.update(dt, this);
      if (!c.alive) this.footCops.splice(i, 1);
    }
    for (const g of this.guards) g.update(dt, this);
  }

  updateCamera(dt) {
    const shake = this.trauma * this.trauma * 0.5;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    if (this.shotCam) {
      this.camera.position.set(this.shotCam.pos[0] + sx, this.shotCam.pos[1] + sy, this.shotCam.pos[2]);
      this.camera.lookAt(this.shotCam.look[0], this.shotCam.look[1], this.shotCam.look[2]);
      return;
    }
    if (this.state === 'title' || this.state === 'win') {
      this.orbitAngle += dt * 0.04;
      const a = this.orbitAngle;
      this.camera.position.set(Math.sin(a) * 135 + sx, 58 + sy, Math.cos(a) * 135);
      this.camera.lookAt(0, 8, 0);
      return;
    }
    if (this.inCar && this.playerCar) {
      const target = this.playerCar.heading;
      this.camYaw = angleLerp(this.camYaw, target, clamp(3 * dt, 0, 1));
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      this.camera.position.set(
        this.playerCar.x - fx * 9.5 + sx,
        3.6 + sy,
        this.playerCar.z - fz * 9.5,
      );
      this.camera.lookAt(this.playerCar.x + fx * 6, 1.4, this.playerCar.z + fz * 6);
      return;
    }
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const dist = 6.5, height = 2.4 + this.camPitch * 2.2;
    this.camera.position.set(
      this.player.x - fx * dist + sx,
      this.player.y + height + sy,
      this.player.z - fz * dist,
    );
    this.camera.lookAt(this.player.x + fx * 2, this.player.y + 1.6, this.player.z + fz * 2);
  }

  render() {
    this.updateCamera(STEP);
    this.renderer.render(this.scene, this.camera);
    this.hud.update(STEP);
  }

  step(seconds, renderIt = false) {
    const n = Math.max(1, Math.round(seconds / STEP));
    for (let i = 0; i < n; i += 1) this.update(STEP);
    if (renderIt) this.render();
  }

  snapshot() {
    return {
      state: this.state,
      missionIndex: this.missions.missionIndex,
      missionStep: this.missions.stepIndex,
      objective: this.missions.objectiveText(),
      debt: this.debt,
      money: this.money,
      ammo: this.ammo,
      pistol: this.pistol,
      inCar: this.inCar,
      wanted: this.wanted,
      policeCars: this.cars.filter((c) => c.mode === 'police').length,
      missionDone: this.missions.done,
      player: { x: this.player.x, z: this.player.z, speed: this.player.speed },
      debug: this.debug,
    };
  }
}
