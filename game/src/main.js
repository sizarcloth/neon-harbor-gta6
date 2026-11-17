// NEON HARBOR: main wiring. Builds the world, runs the sim, owns the
// player, and exposes the window.__game / window.__step seams the
// playtest and the screenshot hooks use.
//
// Design Read (anti-slop): open-world crime game for make.fun judges,
// in a sun-soaked neon coastal style, dial ENERGY 3 / RHYTHM 2 / MOTION 2.
import * as THREE from 'three';
import {
  WORLD_HALF, PLAYER_SPAWN, GARAGE, HOSPITAL, POLICE_STATION,
  WALK_SPEED, SPRINT_SPEED, JUMP_SPEED, GRAVITY, PLAYER_RADIUS,
  ENTER_RANGE, AMMO_START, AMMO_MAX, HEALTH_MAX, DEBT_TOTAL,
  PARKED_CARS, TARGET_CAR, AMMO_SPOTS, SKIN_TONES,
} from './config.js';
import { makeRng, hashSeed, randPick } from './rng.js';
import { City } from './city.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { Car, TrafficSystem } from './vehicles.js';
import { PedSystem } from './peds.js';
import { PoliceSystem } from './police.js';
import { Combat } from './combat.js';
import { MissionSystem } from './missions.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { loadSave, saveGame } from './save.js';
import { setupShot } from './shots.js';
import { buildCharacterMesh, buildPickup } from './models.js';

export class Game {
  constructor(params) {
    this.params = params;
    this.seed = hashSeed(params.get('seed') || String((Date.now() % 2147483647)));
    this.rng = makeRng(this.seed);
    this.nogl = params.has('nogl');
    this.time = 0;
    this.state = 'title';
    this.shopOpen = false;
    this.money = 0;
    this.earned = 0;
    this.ownedSports = false;
    this._lastDt = 1 / 60;
    this._hitCooldown = 0;
    this._crashCooldown = 0;

    // Renderer + scene.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if ('SRGBColorSpace' in THREE) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffc98a);
    this.scene.fog = new THREE.Fog(0xffc98a, 90, 340);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(60, 55, 120);

    const hemi = new THREE.HemisphereLight(0xffe0b3, 0x8a6a4a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a8, 1.7);
    sun.position.set(80, 120, 60);
    this.scene.add(sun);

    // Systems.
    this.city = new City(this.scene, this.rng);
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioSys();
    this.effects = new Effects(this.scene);
    this.traffic = new TrafficSystem(this.scene, this.rng, this.city);
    this.peds = new PedSystem(this.scene, this.rng, this.city);
    this.police = new PoliceSystem(this.scene, this.city, this.peds, this.audio, this.effects);
    this.combat = new Combat(this.scene, this.audio, this.effects);
    this.hud = new HUD();
    this.cameraRig = new CameraRig(this.camera, this.input, this.effects, this.city);
    this.missions = new MissionSystem(this.scene, this.peds, this.police, this.audio, this.hud);

    // Player character: Rae Voss, teal jacket, red cap.
    this.player = {
      x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, y: 0, vy: 0,
      heading: PLAYER_SPAWN.heading, speed: 0, health: HEALTH_MAX,
      inCar: false, car: null, pistol: false, ammo: AMMO_START,
      grounded: true, walkPhase: 0, bodyScale: 1, punchTimer: 0,
      lastDamageAt: -99,
    };
    this.player.mesh = buildCharacterMesh({
      shirt: 0x17b8a6, pants: 0x2b3a4a,
      skin: SKIN_TONES[0], hair: 0x4a2e12, hat: 'cap',
    });
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.scene.add(this.player.mesh);

    // Parked cars, including the mission 2 target coupe.
    this.parkedCars = PARKED_CARS.map((c) => {
      const car = new Car(this.scene, { ...c, parked: true });
      return car;
    });
    const target = new Car(this.scene, { ...TARGET_CAR, parked: true, target: true });
    this.parkedCars.push(target);

    // Ammo pickups.
    this.pickups = AMMO_SPOTS.map(([x, z]) => {
      const mesh = buildPickup('ammo');
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      return { mesh, x, z, taken: false, timer: 0 };
    });

    // Wire callbacks.
    this.missions.onReward = (amount) => {
      this.money += amount;
      this.earned += amount;
    };
    this.missions.onSave = () => this.saveNow();
    this.missions.onWin = () => {
      this.state = 'win';
      this.audio.stopAllLoops();
      this.audio.play('win');
      this.hud.showWin(this);
      this.saveNow();
    };
    this.peds.onBusted = () => this.busted();
    this.peds.onPlayerDamage = (amount) => this.damagePlayer(amount);
    this.police.onToast = (msg) => this.hud.toast(msg);
    this.police.onRam = (dmg) => this.damagePlayer(dmg);
    this.effects.onDamageFlash = () => this.hud.damageFlash();
    this.input.onAction = (code) => this._onAction(code);
    this.input.onClick = () => {
      if (this.state === 'playing' && !this.shopOpen) this.combat.shoot(this);
    };
    this._wireButtons();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get debt() {
    return Math.max(0, DEBT_TOTAL - this.earned);
  }

  allCars() {
    return [
      ...this.parkedCars,
      ...this.traffic.cars.map((e) => e.car),
      ...this.police.cruisers,
    ];
  }

  // -- lifecycle -------------------------------------------------------

  showTitleScreen() {
    this.state = 'title';
    this.shopOpen = false;
    this.cameraRig.titleMode = true;
    this.audio.stopAllLoops();
    this.hud.showTitle(!!loadSave());
  }

  startNewGame() {
    this.money = 0;
    this.earned = 0;
    this.ownedSports = false;
    this.police.clearWanted();
    for (const cop of [...this.peds.cops]) this.peds.removeCop(cop);
    for (const g of this.peds.guards) this.scene.remove(g.mesh);
    this.peds.guards = [];
    for (const w of this.peds.peds) {
      if (w.state === 'down') { w.state = 'walk'; w.health = 2; }
    }
    for (const pk of this.pickups) {
      pk.taken = false;
      pk.timer = 0;
      pk.mesh.visible = true;
    }
    this._resetPlayer(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.heading);
    this.missions.startMission(0);
    this.state = 'playing';
    this.shopOpen = false;
    this.cameraRig.titleMode = false;
    this.cameraRig.reset();
    this.hud.hideTitle();
    this.hud.hidePause();
    this.hud.hideShop();
    this.saveNow();
  }

  continueGame() {
    const save = loadSave();
    if (!save) return;
    this.money = save.money || 0;
    this.earned = save.earned || 0;
    this.ownedSports = !!save.ownedSports;
    this.police.clearWanted();
    this._resetPlayer(save.player?.x ?? PLAYER_SPAWN.x, save.player?.z ?? PLAYER_SPAWN.z, save.player?.heading ?? 0);
    this.player.health = save.health ?? HEALTH_MAX;
    this.player.ammo = save.ammo ?? AMMO_START;
    this.missions.startMission(Math.min(save.missionIndex || 0, 4));
    if (save.missionStep) this.missions.setStep(save.missionStep);
    this.state = 'playing';
    this.shopOpen = false;
    this.cameraRig.titleMode = false;
    this.cameraRig.reset();
    this.hud.hideTitle();
  }

  _resetPlayer(x, z, heading) {
    const p = this.player;
    if (p.inCar && p.car) {
      p.car.driver = null;
      p.car.speed = 0;
    }
    p.inCar = false;
    p.car = null;
    p.x = x;
    p.z = z;
    p.y = 0;
    p.vy = 0;
    p.heading = heading;
    p.speed = 0;
    p.health = HEALTH_MAX;
    p.ammo = AMMO_START;
    p.pistol = false;
    p.grounded = true;
    p.mesh.visible = true;
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = heading;
    this.audio.stopEngine();
  }

  saveNow() {
    const p = this.player;
    saveGame({
      money: this.money,
      earned: this.earned,
      missionIndex: this.missions.index,
      missionStep: this.missions.step,
      player: { x: p.x, z: p.z, heading: p.heading },
      health: p.health,
      ammo: p.ammo,
      ownedSports: this.ownedSports,
    });
  }

  // -- input actions ---------------------------------------------------

  _onAction(code) {
    if (code === 'KeyM') {
      this.audio.setMuted(!this.audio.muted);
      if (this.state === 'paused') this.hud.showPause(this.audio.muted);
      return;
    }
    if (this.state === 'title') {
      if (code === 'Enter') {
        this.audio.init();
        this.startNewGame();
      }
      return;
    }
    if (this.state === 'win') return;
    if (this.shopOpen) {
      if (code === 'Escape' || code === 'KeyB') {
        this.shopOpen = false;
        this.hud.hideShop();
      }
      return;
    }
    if (this.state === 'paused') {
      if (code === 'Escape') {
        this.state = 'playing';
        this.hud.hidePause();
      }
      return;
    }
    if (this.state !== 'playing') return;
    switch (code) {
      case 'KeyE':
        if (this.player.inCar) this.exitCar();
        else this.tryEnterCar();
        break;
      case 'KeyQ':
        if (!this.player.inCar) {
          this.player.pistol = !this.player.pistol;
          this.audio.play('click');
          this.hud.toast(this.player.pistol ? 'Pistol drawn' : 'Pistol holstered');
        }
        break;
      case 'KeyF':
        this.combat.punch(this);
        break;
      case 'Space':
        if (!this.player.inCar && this.player.grounded) {
          this.player.vy = JUMP_SPEED;
          this.player.grounded = false;
          this.player.bodyScale = 1.15;
          this.audio.play('jump');
        }
        break;
      case 'KeyP':
        this.tryPayNSpray();
        break;
      case 'KeyB':
        if (this._nearGarage()) {
          this.shopOpen = true;
          this.hud.showShop(this);
          this.audio.play('click');
        }
        break;
      case 'Escape':
        this.state = 'paused';
        this.hud.showPause(this.audio.muted);
        break;
      default:
        break;
    }
  }

  _wireButtons() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { this.audio.init(); this.audio.play('click'); fn(); });
    };
    bind('btn-new', () => this.startNewGame());
    bind('btn-continue', () => this.continueGame());
    bind('btn-resume', () => { this.state = 'playing'; this.hud.hidePause(); });
    bind('btn-restart', () => this.startNewGame());
    bind('btn-mute', () => {
      this.audio.setMuted(!this.audio.muted);
      this.hud.showPause(this.audio.muted);
    });
    bind('btn-quit', () => this.showTitleScreen());
    bind('btn-close-shop', () => { this.shopOpen = false; this.hud.hideShop(); });
    bind('btn-buy-car', () => this._buyCar());
    bind('btn-buy-health', () => this._buyHealth());
    bind('btn-buy-ammo', () => this._buyAmmo());
    bind('btn-win-again', () => this.startNewGame());
    bind('btn-win-title', () => this.showTitleScreen());
  }

  // -- cars ------------------------------------------------------------

  tryEnterCar() {
    const p = this.player;
    let best = null;
    let bestD = ENTER_RANGE;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    // Theft is a crime when someone sees it: a traffic car's driver
    // always does, a police car always does, a parked car only when a
    // foot cop is nearby.
    if (best.traffic) this.police.addWanted(1);
    else if (best.police) this.police.addWanted(2);
    else if (this.peds.cops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 25)) {
      this.police.addWanted(1);
    }
    this.enterCarDirect(best);
  }

  enterCarDirect(car) {
    const p = this.player;
    if (car.traffic) {
      this.traffic.cars = this.traffic.cars.filter((e) => e.car !== car);
      car.traffic = false;
      this.parkedCars.push(car);
    }
    if (car.police) {
      this.police.cruisers = this.police.cruisers.filter((c) => c !== car);
      car.police = false;
      this.parkedCars.push(car);
    }
    car.parked = false;
    car.driver = 'player';
    p.inCar = true;
    p.car = car;
    p.mesh.visible = false;
    p.heading = car.heading;
    p.x = car.x;
    p.z = car.z;
    this.audio.startEngine();
    this.missions.onEnterCar(car);
  }

  exitCar() {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    // Step out on the car's left side.
    const lx = Math.cos(car.heading);
    const lz = -Math.sin(car.heading);
    let x = car.x + lx * 2.6;
    let z = car.z + lz * 2.6;
    const res = this.city.collideCircle(x, z, PLAYER_RADIUS);
    x = res.x;
    z = res.z;
    p.inCar = false;
    p.car = null;
    p.x = x;
    p.z = z;
    p.y = 0;
    p.vy = 0;
    p.heading = car.heading;
    p.speed = 0;
    p.mesh.visible = true;
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = p.heading;
    this.audio.stopEngine();
  }

  _nearGarage() {
    const p = this.player;
    return Math.hypot(p.x - GARAGE.x, p.z - GARAGE.z) < GARAGE.radius;
  }

  tryPayNSpray() {
    const p = this.player;
    const w = this.police.wanted;
    if (!p.inCar || w === 0 || !this._nearGarage()) return;
    const cost = 50 * w;
    if (this.money < cost) {
      this.hud.toast(`Pay-n-spray costs $${cost}. You have $${this.money}`);
      return;
    }
    this.money -= cost;
    this.police.clearWanted();
    this.audio.play('chime');
    this.hud.toast('Fresh paint. The heat is off');
  }

  _buyCar() {
    if (this.money < 1500 || this.ownedSports) return;
    this.money -= 1500;
    this.ownedSports = true;
    const car = new Car(this.scene, {
      type: 'sports', color: 0xff7a3c, x: GARAGE.x, z: GARAGE.z + 6, heading: Math.PI / 2, parked: true,
    });
    this.parkedCars.push(car);
    this.audio.play('chime');
    this.hud.toast('Sports coupe delivered to the garage');
    this.hud.showShop(this);
    this.saveNow();
  }

  _buyHealth() {
    if (this.money < 50 || this.player.health >= HEALTH_MAX) return;
    this.money -= 50;
    this.player.health = HEALTH_MAX;
    this.audio.play('chime');
    this.hud.toast('Patched up. Full health');
    this.hud.showShop(this);
  }

  _buyAmmo() {
    if (this.money < 30 || this.player.ammo >= AMMO_MAX) return;
    this.money -= 30;
    this.player.ammo = Math.min(AMMO_MAX, this.player.ammo + 12);
    this.audio.play('chime');
    this.hud.toast('Ammo restocked');
    this.hud.showShop(this);
  }

  // -- damage, death, bust ----------------------------------------------

  damagePlayer(amount) {
    const p = this.player;
    if (this.state !== 'playing' || p.health <= 0) return;
    p.health -= amount;
    p.lastDamageAt = this.time;
    this.effects.damageFlash();
    this.effects.addTrauma(0.3);
    if (p.health <= 0) this._die();
  }

  _die() {
    const p = this.player;
    if (p.inCar) {
      p.car.driver = null;
      p.car.speed = 0;
      p.inCar = false;
      p.car = null;
    }
    this.money = Math.max(0, this.money - 100);
    this.police.clearWanted();
    this._resetPlayer(HOSPITAL.x, HOSPITAL.z, 0);
    this.hud.toast('WASTED. You woke up at the hospital, $100 lighter');
    this.audio.play('busted');
    this.saveNow();
  }

  busted() {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (p.inCar) {
      p.car.driver = null;
      p.car.speed = 0;
      p.inCar = false;
      p.car = null;
    }
    this.money = Math.max(0, this.money - 100);
    this.police.clearWanted();
    for (const cop of [...this.peds.cops]) this.peds.removeCop(cop);
    this._resetPlayer(POLICE_STATION.x, POLICE_STATION.z, 0);
    this.hud.toast('BUSTED. The cops took $100 and let you walk');
    this.audio.play('busted');
    this.saveNow();
  }

  // -- shot helpers -----------------------------------------------------

  addTrafficAt(x, z, dir, road) {
    const d = [
      { axis: 'x', dir: 1 }, { axis: 'x', dir: -1 },
      { axis: 'z', dir: 1 }, { axis: 'z', dir: -1 },
    ][dir];
    const car = new Car(this.scene, {
      type: 'sedan', color: 0x9fb4c0, x, z,
      heading: Math.atan2(d.axis === 'x' ? d.dir : 0, d.axis === 'z' ? d.dir : 0),
      traffic: true,
    });
    car.driver = 'traffic';
    this.traffic.cars.push({
      car, dir, road, speed: 8,
      target: this.traffic._nextTarget(x, z, dir, road),
    });
    return car;
  }

  addPedAt(x, z, axis, road, side, dir) {
    const w = this.peds._spawnPed();
    w.x = x;
    w.z = z;
    w.axis = axis;
    w.road = road;
    w.side = side;
    w.dir = dir;
    w.heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    w.mesh.position.set(x, 0, z);
    w.mesh.rotation.y = w.heading;
    return w;
  }

  // -- simulation -------------------------------------------------------

  step(dt) {
    this.effects.update(dt);
    if (this.state !== 'playing' || this.shopOpen) return;
    const scaled = dt * this.effects.timeScale;
    if (scaled <= 0) return;
    this.time += scaled;
    this._hitCooldown = Math.max(0, this._hitCooldown - scaled);
    this._crashCooldown = Math.max(0, this._crashCooldown - scaled);
    this._updatePlayer(scaled);
    this.traffic.update(scaled, this.allCars());
    this.peds.update(scaled, this.player, this.police.wanted, this.missions.index);
    this.police.update(scaled, this.player, this.player.inCar ? this.player.car : null);
    this.missions.update(scaled, this.player);
    this.combat.update(scaled);
    this._updatePickups(scaled);
    this._updateCarCollisions(scaled);
    // Slow health regen after 5 s without damage.
    const p = this.player;
    if (this.time - p.lastDamageAt > 5 && p.health > 0 && p.health < HEALTH_MAX) {
      p.health = Math.min(HEALTH_MAX, p.health + 2 * scaled);
    }
    if (p.inCar && p.car) {
      this.audio.setEngine(Math.abs(p.car.speed) / p.car.spec.top);
    }
  }

  stepSeconds(seconds) {
    const n = Math.max(1, Math.ceil(seconds * 60));
    const dt = seconds / n;
    for (let i = 0; i < n; i += 1) this.step(dt);
  }

  _updatePlayer(dt) {
    const p = this.player;
    const input = this.input;
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.bodyScale += (1 - p.bodyScale) * Math.min(1, dt * 6);
    if (p.inCar && p.car) {
      const car = p.car;
      car.drivePlayer(dt, input);
      const impact = car.collide(this.city);
      if (impact > 14 && this._crashCooldown <= 0) {
        this._crashCooldown = 0.8;
        this.damagePlayer((impact - 14) * 1.2);
        this.effects.addTrauma(0.4);
        this.effects.burst(car.x, 1, car.z, 0xffcc44, 12, 5);
        this.audio.play('crash');
      }
      car.syncMesh();
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = car.speed;
      return;
    }
    // On foot: W/S move along the facing, A/D turn, Shift sprints.
    const fwd = input.isDown('KeyW') ? 1 : 0;
    const back = input.isDown('KeyS') ? 1 : 0;
    const left = input.isDown('KeyA') ? 1 : 0;
    const right = input.isDown('KeyD') ? 1 : 0;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    p.heading += (left - right) * 2.6 * dt;
    const top = sprint ? SPRINT_SPEED : WALK_SPEED;
    const target = fwd ? top : back ? -top * 0.55 : 0;
    const rate = target !== 0 ? 26 : 32;
    p.speed += Math.max(-rate * dt, Math.min(rate * dt, target - p.speed));
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    const res = this.city.collideCircle(p.x, p.z, PLAYER_RADIUS);
    p.x = res.x;
    p.z = res.z;
    const m = WORLD_HALF - 2;
    p.x = Math.max(-m, Math.min(m, p.x));
    p.z = Math.max(-m, Math.min(m, p.z));
    // Jump + gravity.
    if (!p.grounded) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
        p.bodyScale = 0.78;
        this.effects.burst(p.x, 0.1, p.z, 0xc9b896, 6, 2);
      }
    }
    // Walk-cycle swing + punch arm.
    const u = p.mesh.userData;
    const moving = Math.abs(p.speed) > 0.3;
    if (moving) p.walkPhase += dt * Math.abs(p.speed) * 2.4;
    const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
    u.legL.rotation.x += (swing - u.legL.rotation.x) * Math.min(1, dt * 12);
    u.legR.rotation.x += (-swing - u.legR.rotation.x) * Math.min(1, dt * 12);
    u.armL.rotation.x += (-swing * 0.8 - u.armL.rotation.x) * Math.min(1, dt * 12);
    const armRTarget = p.punchTimer > 0 ? -1.9 : swing * 0.8;
    u.armR.rotation.x += (armRTarget - u.armR.rotation.x) * Math.min(1, dt * 18);
    const s = p.bodyScale;
    u.body.scale.set(2 - s, s, 2 - s);
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = p.heading;
    // Hit by a moving car?
    if (this._hitCooldown <= 0) {
      for (const car of this.allCars()) {
        if (Math.abs(car.speed) < 3) continue;
        const d = Math.hypot(car.x - p.x, car.z - p.z);
        if (d < 2.6) {
          this._hitCooldown = 0.8;
          const push = 3.5;
          p.x += ((p.x - car.x) / (d || 1)) * push;
          p.z += ((p.z - car.z) / (d || 1)) * push;
          this.damagePlayer(10);
          this.effects.burst(p.x, 1, p.z, 0xff5544, 8, 4);
          this.peds.scare(p.x, p.z, 15);
          break;
        }
      }
    }
  }

  _updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) {
        pk.timer -= dt;
        if (pk.timer <= 0) {
          pk.taken = false;
          pk.mesh.visible = true;
        }
        continue;
      }
      pk.mesh.userData.spin.rotation.y += dt * 2;
      if (!p.inCar && Math.hypot(p.x - pk.x, p.z - pk.z) < 2) {
        pk.taken = true;
        pk.timer = 30;
        pk.mesh.visible = false;
        p.ammo = Math.min(AMMO_MAX, p.ammo + 6);
        this.audio.play('pickup');
        this.hud.toast('Ammo +6');
        this.effects.burst(pk.x, 1, pk.z, 0x2eff8f, 10, 3);
      }
    }
  }

  _updateCarCollisions(dt) {
    const p = this.player;
    if (!p.inCar || !p.car) return;
    const mine = p.car;
    // Oriented-box check in the player car's local frame: a plain
    // circle test would false-positive on cars in the next lane (lanes
    // are 3.6 m apart, cars are 1.9 m wide).
    const fx = Math.sin(mine.heading);
    const fz = Math.cos(mine.heading);
    const rx = Math.cos(mine.heading);
    const rz = -Math.sin(mine.heading);
    for (const other of this.allCars()) {
      if (other === mine) continue;
      const dx = other.x - mine.x;
      const dz = other.z - mine.z;
      const localF = dx * fx + dz * fz;
      const localR = dx * rx + dz * rz;
      if (Math.abs(localF) > 4.3 || Math.abs(localR) > 2.0) continue;
      const overlapF = 4.3 - Math.abs(localF);
      const overlapR = 2.0 - Math.abs(localR);
      const closing = Math.abs(mine.speed - other.speed);
      if (overlapF < overlapR) {
        // Rear-end / head-on: shove the other car forward, slow down.
        const s = Math.sign(localF) || 1;
        mine.x -= fx * s * overlapF * 0.4;
        mine.z -= fz * s * overlapF * 0.4;
        other.x += fx * s * overlapF * 0.6;
        other.z += fz * s * overlapF * 0.6;
        other.speed = Math.max(other.speed, mine.speed * 0.55);
        mine.speed *= 0.88;
      } else {
        // Side swipe: push apart laterally.
        const s = Math.sign(localR) || 1;
        mine.x -= rx * s * overlapR * 0.5;
        mine.z -= rz * s * overlapR * 0.5;
        other.x += rx * s * overlapR * 0.5;
        other.z += rz * s * overlapR * 0.5;
        mine.speed *= 0.94;
      }
      if (closing > 8 && this._crashCooldown <= 0) {
        this._crashCooldown = 0.8;
        this.damagePlayer((closing - 8) * 0.8);
        this.effects.addTrauma(0.35);
        this.effects.burst(mine.x, 1, mine.z, 0xffcc44, 10, 4);
        this.audio.play('crash');
      }
      other.syncMesh();
    }
  }

  _computePrompt() {
    if (this.state !== 'playing' || this.shopOpen) return null;
    const p = this.player;
    if (!p.inCar) {
      for (const car of this.allCars()) {
        if (Math.hypot(car.x - p.x, car.z - p.z) < ENTER_RANGE) return 'Press E to enter the car';
      }
      if (this._nearGarage()) return 'Press B to open the garage shop';
      return null;
    }
    if (this._nearGarage()) {
      const w = this.police.wanted;
      if (w > 0) return `Press P: pay-n-spray, clear wanted ($${50 * w})`;
      return 'Press B to open the garage shop';
    }
    return null;
  }

  // -- render -----------------------------------------------------------

  render(dt) {
    const p = this.player;
    const speedNorm = p.inCar && p.car ? Math.abs(p.car.speed) / p.car.spec.top : Math.abs(p.speed) / SPRINT_SPEED;
    this.cameraRig.update(dt || 1 / 60, { x: p.x, y: p.y, z: p.z, heading: p.heading }, p.inCar, speedNorm);
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'title') this.hud.update(this, this._computePrompt());
  }

  // -- public seams for the playtest ------------------------------------

  expose() {
    const game = this;
    window.__game = {
      get state() { return game.state; },
      get missionIndex() { return game.missions.index; },
      get missionStep() { return game.missions.step; },
      get missionDone() { return game.missions.done; },
      get objective() { return game.missions.objective(); },
      get debt() { return game.debt; },
      get money() { return game.money; },
      get wanted() { return game.police.wanted; },
      get inCar() { return game.player.inCar; },
      get player() {
        return { x: game.player.x, z: game.player.z, speed: game.player.speed };
      },
      get ammo() { return game.player.ammo; },
      get pistol() { return game.player.pistol; },
      get policeCars() { return game.police.cruisers.length; },
      debug: {
        placePlayer(x, z) {
          if (game.player.inCar) game.exitCar();
          const res = game.city.collideCircle(x, z, PLAYER_RADIUS);
          game.player.x = res.x;
          game.player.z = res.z;
          game.player.y = 0;
          game.player.vy = 0;
          game.player.speed = 0;
          game.player.mesh.position.set(res.x, 0, res.z);
        },
        setHeading(h) {
          game.player.heading = h;
          game.player.mesh.rotation.y = h;
        },
        trafficPositions() {
          return game.traffic.positions();
        },
        pedPositions() {
          return game.peds.positions();
        },
        nearestPed() {
          const w = game.peds.nearestPed(game.player.x, game.player.z);
          return w ? { x: w.x, z: w.z } : { x: 0, z: 0 };
        },
        policeCarPositions() {
          return game.police.positions();
        },
        startMission(i) {
          game.missions.startMission(i);
        },
        teleportToObjective() {
          const s = game.missions.currentStep();
          if (!s || !s.loc) return;
          const [x, z] = s.loc;
          if (game.player.inCar && game.player.car) {
            const car = game.player.car;
            car.x = x;
            car.z = z;
            car.speed = 0;
            car.syncMesh();
          }
          game.player.x = x;
          game.player.z = z;
          game.player.y = 0;
          game.player.speed = 0;
          game.player.mesh.position.set(x, 0, z);
        },
        getInCar() {
          if (game.player.inCar) return;
          const p = game.player;
          let best = null;
          let bestD = Infinity;
          for (const car of [...game.parkedCars, ...game.traffic.cars.map((e) => e.car)]) {
            const d = Math.hypot(car.x - p.x, car.z - p.z);
            if (d < bestD) { bestD = d; best = car; }
          }
          if (!best) {
            best = new Car(game.scene, {
              type: 'sedan', color: 0x9fb4c0, x: p.x + 2, z: p.z, heading: p.heading, parked: true,
            });
            game.parkedCars.push(best);
          }
          game.enterCarDirect(best);
        },
        setMoney(n) {
          game.money = n;
        },
        saveNow() {
          game.saveNow();
        },
        currentStep() {
          const s = game.missions.currentStep();
          if (!s) return null;
          return {
            action: s.action || null,
            needsCar: !!s.needsCar,
            loc: s.loc ? [s.loc[0], s.loc[1]] : null,
          };
        },
      },
    };
    window.__step = (seconds, renderIt) => {
      game.stepSeconds(seconds);
      if (renderIt) game.render(1 / 60);
    };
    window.__shotReady = false;
  }
}

// -- boot ---------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const game = new Game(params);
game.expose();
game.showTitleScreen();

const shot = params.get('shot');
if (shot) {
  game.hud.quiet = true;
  setupShot(game, shot);
  game.stepSeconds(game.shotPreroll || 0.9);
  game.render(1 / 60);
  window.__shotReady = true;
} else if (game.nogl) {
  game.render(1 / 60);
  window.__shotReady = true;
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.step(dt);
    game.render(dt);
    if (!window.__shotReady) window.__shotReady = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
