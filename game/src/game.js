// game.js — NEON HARBOR orchestrator: owns the scene, the sim loop,
// state, missions, wanted, save/load, the __game test seam and the
// ?shot= setups. Subsystems do their own job; this file wires them.

import * as THREE from 'three';
import { City, LAYOUT } from './city.js';
import { Player } from './player.js';
import { TrafficManager } from './traffic.js';
import { PedManager } from './peds.js';
import { PoliceManager } from './police.js';
import { MissionManager, MISSIONS, CRATE_SPOTS } from './missions.js';
import { Combat, PickupManager } from './combat.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Juice } from './juice.js';
import { BlobShadows, createCarMesh, CAR_TYPES } from './models.js';
import { mulberry32, rand, pick, clamp, dist2D } from './utils.js';

const SAVE_KEY = 'neon-harbor-save-v1';
const MUTE_KEY = 'neon-harbor-muted';
const DEBT_TOTAL = 5000;
const GARAGE = { x: 60, z: 40 };
const HOSPITAL = { x: -40, z: -40 };
const POLICE_STATION = { x: 0, z: -80 };

const PARKED_SPOTS = [
  { x: -13, z: 48, heading: 0, type: 'sedan', color: 0x8a2f2f },
  { x: -20, z: 52, heading: 0, type: 'taxi', color: 0xe8b93c },
  { x: -8, z: 56, heading: Math.PI, type: 'pickup', color: 0x3a6e4a },
  { x: -25, z: 60, heading: 0, type: 'sedan', color: 0x2f4a8a },
  { x: -16, z: 66, heading: Math.PI, type: 'sedan', color: 0x8a8a8a },
  { x: -15, z: 100, heading: 0, type: 'sedan', color: 0x5a5a6e },
  { x: -22, z: 108, heading: Math.PI, type: 'pickup', color: 0xa88a3a },
  { x: 155, z: 20, heading: Math.PI / 2, type: 'sedan', color: 0x4a7a8a },
  { x: 150, z: -20, heading: 0, type: 'pickup', color: 0x8a2f2f },
  { x: 160, z: -2, heading: Math.PI, type: 'taxi', color: 0xe8b93c },
];
const TARGET_CAR_SPOT = { x: -28, z: 92, heading: 0, type: 'sport', color: 0xc22a2a };

export class Game {
  constructor(container) {
    const params = new URLSearchParams(location.search);
    this.nogl = params.has('nogl');
    this.seed = parseInt(params.get('seed') || '1', 10) || 1;
    this.shotName = params.get('shot') || null;
    this.rng = mulberry32(this.seed);
    this.time = 0;

    // Renderer + scene + camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2c89b, 90, 280);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(90, 55, 70);
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.5);
    sun.position.set(-80, 120, -40);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x9ec3e8, 0x8a7a5a, 0.85));

    // World + systems.
    this.city = new City(this.scene, this.rng);
    this.cars = [];
    this.player = new Player(this.scene, this.city);
    this.spawnParkedCars();
    this.traffic = new TrafficManager(this.scene, this.city, this.rng, this.cars);
    this.peds = new PedManager(this.scene, this.city, this.rng);
    this.police = new PoliceManager(this.scene, this.city, this.rng, this.cars);
    this.missions = new MissionManager();
    this.combat = new Combat();
    this.pickups = new PickupManager(this.scene);
    this.hud = new HUD();
    this.hud.quiet = !!this.shotName;
    this.audio = new AudioSys();
    this.audio.setMuted(localStorage.getItem(MUTE_KEY) === '1');
    this.juice = new Juice(this.scene);
    this.blobs = new BlobShadows(this.scene, 64);
    this.buildCrates();
    this.buildObjectiveBeacon();

    // Run state.
    this.state = 'title';
    this.shopOpen = false;
    this.money = 0;
    this.earned = 0;
    this.debt = DEBT_TOTAL;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.health = 100;
    this.ammo = 12;
    this.pistol = false;
    this.exitPromptTimer = 0;
    this.lastRamTime = -10; // cruiser ram damage has a 1s cooldown
    this.titleAngle = 0.6;
    this.shotCam = null;

    this.input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };
    this.keys = new Set();
    this.dragging = false;
    this.lastMouseX = 0;

    this.buildSnapshot();
    this.wireInput();
    this.wireButtons();
    this.refreshContinueButton();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Shot setups run now (synchronous, so __shotReady is true on load).
    if (this.shotName) this.setupShot(this.shotName);
    this.syncSnapshot();
    this.render();
    window.__shotReady = true;
  }

  spawnParkedCars() {
    for (const spot of PARKED_SPOTS) {
      const mesh = createCarMesh(spot.type, spot.color);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.heading;
      this.scene.add(mesh);
      this.cars.push({
        id: `parked-${spot.x}-${spot.z}`,
        type: spot.type,
        mesh,
        x: spot.x,
        z: spot.z,
        heading: spot.heading,
        speed: 0,
        driver: null,
        parked: true,
        color: spot.color,
      });
    }
    const t = TARGET_CAR_SPOT;
    const mesh = createCarMesh(t.type, t.color);
    mesh.position.set(t.x, 0, t.z);
    mesh.rotation.y = t.heading;
    this.scene.add(mesh);
    this.targetCar = {
      id: 'target-sport',
      type: t.type,
      mesh,
      x: t.x,
      z: t.z,
      heading: t.heading,
      speed: 0,
      driver: null,
      parked: true,
      target: true,
      color: t.color,
    };
    this.cars.push(this.targetCar);
  }

  buildCrates() {
    this.crateMeshes = [];
    this.crateBeacons = [];
    const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
    const beaconGeo = new THREE.CylinderGeometry(0.45, 0.45, 9, 10, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [x, z] of CRATE_SPOTS) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.6, z);
      mesh.rotation.y = rand(this.rng, 0, Math.PI);
      this.scene.add(mesh);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(x, 4.5, z);
      this.scene.add(beacon);
      this.crateMeshes.push(mesh);
      this.crateBeacons.push(beacon);
    }
  }

  buildObjectiveBeacon() {
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 14, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.objectiveBeacon = new THREE.Mesh(geo, mat);
    this.objectiveBeacon.position.set(20, 7, 20);
    this.scene.add(this.objectiveBeacon);
  }

  // ---- state flow ----

  newGame() {
    this.audio.init();
    this.audio.resume();
    this.resetRun();
    this.state = 'playing';
    this.showScreen('game');
    this.hud.showGame();
    this.hud.banner('First Fare', MISSIONS[0].intro);
    this.startMissionEffects();
    this.save();
    this.syncSnapshot();
  }

  continueGame() {
    const save = this.load();
    if (!save) return;
    this.audio.init();
    this.audio.resume();
    this.resetRun();
    this.money = save.money;
    this.earned = save.earned || 0;
    this.debt = DEBT_TOTAL - this.earned;
    this.missions.startMission(save.missionIndex);
    this.missions.missionStep = Math.min(save.missionStep || 0, MISSIONS[save.missionIndex].steps.length - 1);
    this.player.place(save.x ?? 0, save.z ?? 8);
    this.state = 'playing';
    this.showScreen('game');
    this.hud.showGame();
    this.hud.banner(this.missions.mission.name, this.missions.mission.intro);
    this.startMissionEffects();
    this.syncSnapshot();
  }

  resetRun() {
    this.money = 0;
    this.earned = 0;
    this.debt = DEBT_TOTAL;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.health = 100;
    this.ammo = 12;
    this.pistol = false;
    this.shopOpen = false;
    this.missions.startMission(0);
    this.player.place(0, 8);
    this.player.setHeading(0);
    this.player.snapCamera();
    this.police.removeCops();
    while (this.police.cruisers.length) this.police.removeCruiser(this.police.cruisers[0]);
    this.peds.removeGuards();
    this.resetCrates();
  }

  resetCrates() {
    for (let i = 0; i < this.crateMeshes.length; i += 1) {
      this.crateMeshes[i].visible = true;
      this.crateBeacons[i].visible = true;
    }
    this.missions.cratesCollected = new Set();
  }

  startMissionEffects() {
    const m = this.missions.mission;
    if (!m) return;
    if (m.wantedOnStart) this.wanted = Math.max(this.wanted, m.wantedOnStart);
    this.peds.removeGuards();
    if (this.missions.missionIndex === 3) {
      this.resetCrates();
      this.peds.spawnGuard(162, -8);
      this.peds.spawnGuard(168, 10);
      this.peds.spawnGuard(178, 0);
    }
  }

  showScreen(name) {
    for (const id of ['title-screen', 'pause-menu', 'death-screen', 'win-screen', 'shop-panel']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    const map = {
      title: 'title-screen',
      pause: 'pause-menu',
      dead: 'death-screen',
      win: 'win-screen',
      shop: 'shop-panel',
    };
    if (name !== 'game' && map[name]) {
      const el = document.getElementById(map[name]);
      if (el) el.style.display = 'flex';
    }
    if (name === 'game') this.hud.showGame();
    else if (name === 'title') this.hud.hideGame();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.stopAllLoops();
    this.showScreen('pause');
    this.save();
    this.syncSnapshot();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.showScreen('game');
    this.syncSnapshot();
  }

  die() {
    this.state = 'dead';
    this.audio.stopAllLoops();
    this.audio.play('bust');
    this.showScreen('dead');
    this.syncSnapshot();
  }

  respawn() {
    this.health = 100;
    this.money = Math.max(0, this.money - Math.floor(this.money * 0.1));
    this.wanted = 0;
    this.player.place(HOSPITAL.x, HOSPITAL.z);
    this.player.setHeading(0);
    this.player.snapCamera();
    this.state = 'playing';
    this.showScreen('game');
    this.hud.toast('You woke up at the hospital. The bill stings.');
    this.syncSnapshot();
  }

  bust() {
    if (this.state !== 'playing') return;
    this.wanted = 0;
    this.money = Math.max(0, this.money - 150);
    this.audio.play('bust');
    this.police.removeCops();
    this.player.place(POLICE_STATION.x, POLICE_STATION.z);
    this.player.setHeading(0);
    this.player.snapCamera();
    this.hud.toast('Busted. The cops took $150.');
    this.syncSnapshot();
  }

  onMissionComplete() {
    const m = this.missions.mission;
    this.earned += m.reward;
    this.money += m.reward;
    this.debt = Math.max(0, DEBT_TOTAL - this.earned);
    this.audio.play('mission');
    if (m.clearWantedOnComplete) this.wanted = 0;
    if (this.missions.missionIndex + 1 >= MISSIONS.length) {
      this.missions.missionIndex = MISSIONS.length;
      this.missions.missionDone = true;
      this.debt = 0;
      this.state = 'win';
      this.audio.stopAllLoops();
      const el = document.getElementById('win-stats');
      if (el) el.textContent = `Debt paid. You earned $${this.money} across ${MISSIONS.length} jobs.`;
      this.showScreen('win');
      this.save();
      this.syncSnapshot();
      return;
    }
    this.missions.missionIndex += 1;
    this.missions.missionStep = 0;
    this.missions.cratesCollected = new Set();
    this.startMissionEffects();
    const next = this.missions.mission;
    this.hud.banner(next.name, next.intro);
    this.save();
    this.syncSnapshot();
  }

  // ---- save / load ----

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        money: this.money,
        earned: this.earned,
        missionIndex: this.missions.missionIndex,
        missionStep: this.missions.missionStep,
        x: this.player.x,
        z: this.player.z,
      }));
    } catch { /* storage unavailable: ignore */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.v !== 1 || typeof s.missionIndex !== 'number') return null;
      return s;
    } catch {
      return null;
    }
  }

  refreshContinueButton() {
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = this.load() ? 'block' : 'none';
  }

  // ---- wanted / damage ----

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.wantedTimer = 0;
  }

  damagePlayer(amount, fromX, fromZ) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    this.juice.flash('#ff2a2a', 120);
    this.juice.addTrauma(0.35);
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
    this.syncSnapshot();
  }

  // ---- input ----

  wireInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.syncInputFlags();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.shopOpen) this.closeShop();
        else if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (this.state !== 'playing' || this.shopOpen) return;
      if (e.code === 'KeyE') this.tryEnterExitCar();
      if (e.code === 'KeyF') this.tryPunch();
      if (e.code === 'KeyQ') {
        this.pistol = !this.pistol;
        this.hud.toast(this.pistol ? 'Pistol out' : 'Pistol away');
        this.audio.play('click');
      }
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'KeyB') this.tryOpenShop();
      this.syncSnapshot();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.syncInputFlags();
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || this.shopOpen) return;
      this.dragging = true;
      this.lastMouseX = e.clientX;
      if (this.pistol) this.tryShoot();
      this.syncSnapshot();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;
      this.player.camYaw += dx * 0.005;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.syncInputFlags();
      this.dragging = false;
    });
  }

  syncInputFlags() {
    const k = this.keys;
    this.input.forward = k.has('KeyW') || k.has('ArrowUp');
    this.input.back = k.has('KeyS') || k.has('ArrowDown');
    this.input.left = k.has('KeyA') || k.has('ArrowLeft');
    this.input.right = k.has('KeyD') || k.has('ArrowRight');
    this.input.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    this.input.jump = k.has('Space');
    this.input.handbrake = k.has('Space');
  }

  wireButtons() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        this.audio.init();
        this.audio.resume();
        this.audio.play('click');
        fn();
      });
    };
    bind('btn-new', () => this.newGame());
    bind('btn-continue', () => this.continueGame());
    bind('btn-resume', () => this.resume());
    bind('btn-restart', () => {
      this.missions.startMission(this.missions.missionIndex);
      this.startMissionEffects();
      this.hud.toast('Mission restarted');
      this.resume();
    });
    bind('btn-mute', () => this.toggleMute());
    bind('btn-respawn', () => this.respawn());
    bind('btn-again', () => this.newGame());
    bind('btn-shop-close', () => this.closeShop());
    bind('btn-buy-car', () => this.buy('car'));
    bind('btn-buy-health', () => this.buy('health'));
    bind('btn-buy-ammo', () => this.buy('ammo'));
    bind('btn-clear-wanted', () => this.buy('wanted'));
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    localStorage.setItem(MUTE_KEY, this.audio.muted ? '1' : '0');
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = this.audio.muted ? 'Sound: Off' : 'Sound: On';
    this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on');
  }

  // ---- actions ----

  nearestCar(x, z, maxD) {
    let best = null;
    let bestD = Infinity;
    for (const car of this.cars) {
      const d = dist2D(x, z, car.x, car.z);
      if (d < maxD && d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  tryEnterExitCar() {
    const player = this.player;
    if (player.inCar) {
      player.exitCar();
      this.audio.play('enter');
      return;
    }
    const car = this.nearestCar(player.x, player.z, 4);
    if (!car) return;
    // Stealing in view of a cop raises the heat.
    const copNear = this.police.cops.some((c) => dist2D(c.x, c.z, player.x, player.z) < 30)
      || this.police.cruisers.some((c) => dist2D(c.x, c.z, player.x, player.z) < 30);
    if (!car.owned && copNear) this.addWanted(1);
    if (car.police) {
      // Taking a cruiser: it leaves the pursuit.
      this.police.cruisers = this.police.cruisers.filter((c) => c !== car);
    }
    player.enterCar(car);
    this.audio.play('enter');
    this.exitPromptTimer = 4;
    this.syncSnapshot();
  }

  combatTargets() {
    const targets = [];
    for (const p of this.peds.peds) {
      targets.push({ x: p.x, z: p.z, state: p.state, hp: p.hp ?? 20, kind: p.kind, ref: p });
    }
    for (const c of this.police.cops) {
      targets.push({ x: c.x, z: c.z, state: c.state || 'active', hp: c.hp ?? 68, kind: 'cop', ref: c });
    }
    return targets;
  }

  damagePerson(target, amount) {
    target.hp -= amount;
    if (target.hp > 0) return false;
    if (target.kind === 'cop') {
      this.police.knockDownCop(target.ref);
      this.addWanted(2);
    } else {
      this.peds.knockDown(target.ref);
    }
    return true;
  }

  tryPunch() {
    if (this.player.inCar) return;
    const hit = this.combat.punch(this.player, this.combatTargets());
    if (!hit) return;
    this.audio.play('punch');
    this.juice.hitStop(60);
    this.juice.addTrauma(0.25);
    this.juice.burst(hit.x, 1.2, hit.z, 0xffd23c, 8, 3);
    this.damagePerson(hit, 25);
    this.addWanted(1);
    this.peds.scare(hit.x, hit.z, 18);
    this.syncSnapshot();
  }

  tryShoot() {
    if (this.player.inCar || !this.pistol) return;
    if (this.ammo <= 0) {
      this.hud.toast('No ammo. Find green ammo boxes.');
      return;
    }
    this.ammo -= 1;
    this.audio.play('shoot');
    this.juice.addTrauma(0.12);
    const result = this.combat.shoot(this.player, this.player.camYaw, this.combatTargets());
    this.juice.burst(result.point.x, result.point.y, result.point.z, 0xfff2b0, 6, 3);
    if (result.target) this.damagePerson(result.target, 34);
    this.addWanted(1);
    this.peds.scare(this.player.x, this.player.z, 25);
    this.syncSnapshot();
  }

  tryOpenShop() {
    if (dist2D(this.player.x, this.player.z, GARAGE.x, GARAGE.z) > 15) return;
    this.shopOpen = true;
    const moneyEl = document.getElementById('shop-money');
    if (moneyEl) moneyEl.textContent = `$${this.money}`;
    const panel = document.getElementById('shop-panel');
    if (panel) panel.style.display = 'flex';
  }

  closeShop() {
    this.shopOpen = false;
    const panel = document.getElementById('shop-panel');
    if (panel) panel.style.display = 'none';
  }

  buy(what) {
    const prices = { car: 1500, health: 50, ammo: 30, wanted: 100 };
    const price = prices[what];
    if (this.money < price) {
      this.hud.toast('Not enough money.');
      return;
    }
    this.money -= price;
    if (what === 'car') {
      const mesh = createCarMesh('sport', 0x2f6ec9);
      mesh.position.set(GARAGE.x + 4, 0, GARAGE.z + 6);
      this.scene.add(mesh);
      this.cars.push({
        id: `owned-${Date.now()}`,
        type: 'sport', mesh,
        x: GARAGE.x + 4, z: GARAGE.z + 6, heading: 0, speed: 0,
        driver: null, parked: true, owned: true, color: 0x2f6ec9,
      });
      this.hud.toast('Sports coupe delivered to the garage.');
    } else if (what === 'health') {
      this.health = 100;
      this.hud.toast('Health restored.');
    } else if (what === 'ammo') {
      this.ammo = Math.min(36, this.ammo + 12);
      this.hud.toast('Ammo restocked.');
    } else if (what === 'wanted') {
      this.wanted = 0;
      this.hud.toast('Wanted level cleared.');
    }
    this.audio.play('pickup');
    const moneyEl = document.getElementById('shop-money');
    if (moneyEl) moneyEl.textContent = `$${this.money}`;
    this.syncSnapshot();
  }

  // ---- sim ----

  step(dt) {
    this.time += dt;
    if (this.state === 'title') {
      this.traffic.update(dt, null);
      this.peds.update(dt, this.player, null);
      this.titleAngle += dt * 0.02;
      const cx = 20;
      const cz = 20;
      this.camera.position.set(
        cx + Math.cos(this.titleAngle) * 95,
        58,
        cz + Math.sin(this.titleAngle) * 95
      );
      this.camera.lookAt(cx, 0, cz);
      this.syncSnapshot();
      return;
    }
    if (this.state !== 'playing' || this.shopOpen) return;
    const sdt = this.juice.scaleDt(dt);
    if (sdt > 0) this.updateWorld(sdt);
    this.hud.updateTimers(dt);
    this.juice.update(dt, this.time);
    this.syncSnapshot();
  }

  updateWorld(dt) {
    const player = this.player;
    const playerCar = player.inCar ? player.car : null;
    player.update(dt, this.input, this.cars, (impact) => {
      if (impact > 8) {
        this.audio.play('crash');
        this.juice.addTrauma(0.4);
        this.juice.hitStop(70);
        this.damagePlayer(Math.min(35, (impact - 8) * 1.5));
        this.peds.scare(player.x, player.z, 20);
      }
    });
    this.traffic.update(dt, playerCar);
    this.peds.update(dt, player, (guard) => {
      this.damagePlayer(8, guard.x, guard.z);
      this.audio.play('punch');
    });
    this.police.update(dt, player, this.wanted, () => this.bust(), (car, speed) => {
      // One hit per second at most: without the cooldown an adjacent
      // cruiser dealt 10 damage every frame and killed instantly.
      if (speed > 4 && this.time - this.lastRamTime > 1.0) {
        this.lastRamTime = this.time;
        this.damagePlayer(10, car.x, car.z);
      }
    });
    this.combat.update(dt);
    this.pickups.update(dt, this.time, player, (kind) => {
      if (kind === 'ammo') {
        this.ammo = Math.min(36, this.ammo + 6);
        this.hud.toast('Ammo +6');
      } else {
        this.health = Math.min(100, this.health + 30);
        this.hud.toast('Health +30');
      }
      this.audio.play('pickup');
    });
    // Player car hitting a pedestrian.
    if (playerCar && Math.abs(playerCar.speed) > 3) {
      for (const ped of this.peds.peds) {
        if (ped.state === 'down') continue;
        if (dist2D(ped.x, ped.z, playerCar.x, playerCar.z) < 1.9) {
          this.peds.knockDown(ped);
          this.addWanted(1);
          this.audio.play('crash');
          this.juice.addTrauma(0.3);
          this.peds.scare(ped.x, ped.z, 20);
        }
      }
    }
    // Crate collection.
    const step = this.missions.currentStep();
    if (step && step.action === 'collectCrates') {
      CRATE_SPOTS.forEach(([x, z], i) => {
        if (this.missions.cratesCollected.has(i)) return;
        if (dist2D(player.x, player.z, x, z) < 4) {
          this.missions.collectCrate(i);
          this.crateMeshes[i].visible = false;
          this.crateBeacons[i].visible = false;
          this.audio.play('pickup');
          this.juice.burst(x, 1, z, 0xffd23c, 14, 4);
          this.hud.toast(`Crate ${this.missions.cratesCollected.size}/3 collected`);
        }
      });
    }
    // Mission progress.
    const result = this.missions.update(this);
    if (result === 'advanced') {
      this.audio.play('pickup');
      this.hud.toast(this.missions.currentStep().text);
    } else if (result === 'completed') {
      this.onMissionComplete();
    }
    // Wanted decay when no police can see the player.
    if (this.wanted > 0) {
      const nearest = this.police.nearestDistance(player);
      const copNear = this.police.cops.some((c) => dist2D(c.x, c.z, player.x, player.z) < 45);
      if ((nearest === null || nearest > 45) && !copNear) {
        this.wantedTimer += dt;
        if (this.wantedTimer > 8) {
          this.wantedTimer = 0;
          this.wanted -= 1;
          if (this.wanted === 0) this.hud.toast('You lost the cops.');
        }
      } else {
        this.wantedTimer = 0;
      }
    }
    // Audio loops.
    if (playerCar) {
      this.audio.engine(playerCar.speed, CAR_TYPES[playerCar.type].maxSpeed);
    } else {
      this.audio.stopEngine();
    }
    if (this.police.count() > 0) {
      this.audio.siren(this.police.nearestDistance(player));
    } else {
      this.audio.stopSiren();
    }
    // Contextual prompt.
    if (this.exitPromptTimer > 0) {
      this.exitPromptTimer -= dt;
      this.hud.prompt('Press E to exit the car');
    } else if (!player.inCar && this.nearestCar(player.x, player.z, 4)) {
      this.hud.prompt('Press E to enter the car');
    } else if (dist2D(player.x, player.z, GARAGE.x, GARAGE.z) < 15) {
      this.hud.prompt('Press B for the garage shop');
    } else {
      this.hud.prompt(null);
    }
    // Objective beacon follows the current step.
    const s = this.missions.currentStep();
    if (s && s.loc) {
      this.objectiveBeacon.visible = true;
      this.objectiveBeacon.position.set(s.loc[0], 7, s.loc[1]);
    } else if (s && s.action === 'enterTargetCar') {
      this.objectiveBeacon.visible = true;
      this.objectiveBeacon.position.set(this.targetCar.x, 7, this.targetCar.z);
    } else {
      this.objectiveBeacon.visible = false;
    }
    // Camera follows the player.
    let override = null;
    if (this.shotCam === 'chase-front' && playerCar) {
      const fwd = { x: Math.sin(playerCar.heading), z: Math.cos(playerCar.heading) };
      override = {
        pos: new THREE.Vector3(playerCar.x + fwd.x * 15, 4.5, playerCar.z + fwd.z * 15),
        look: new THREE.Vector3(playerCar.x - fwd.x * 8, 1, playerCar.z - fwd.z * 8),
      };
    } else if (this.shotCam === 'mission-close') {
      // High behind-the-player angle: clears the harbor container stacks
      // (up to 5.2 m) and the palm canopies that a low camera ends up
      // inside of. The sightline stays well above the stacks until it
      // drops onto the player.
      const fwd = { x: Math.sin(player.camYaw), z: Math.cos(player.camYaw) };
      override = {
        pos: new THREE.Vector3(player.x - fwd.x * 10, 10, player.z - fwd.z * 10),
        look: new THREE.Vector3(player.x + fwd.x * 3, 1, player.z + fwd.z * 3),
      };
    }
    player.updateCamera(this.camera, dt, this.juice, this.time, override);
  }

  render() {
    // Blob shadows: player, cars, peds, cops.
    let bi = 0;
    this.blobs.set(bi, this.player.x, this.player.z, this.player.inCar ? 0 : 0.6);
    bi += 1;
    for (const car of this.cars) {
      this.blobs.set(bi, car.x, car.z, 2.3);
      bi += 1;
      if (bi >= 60) break;
    }
    for (const ped of this.peds.peds) {
      if (bi >= 64) break;
      this.blobs.set(bi, ped.x, ped.z, 0.6);
      bi += 1;
    }
    for (const cop of this.police.cops) {
      if (bi >= 64) break;
      this.blobs.set(bi, cop.x, cop.z, 0.6);
      bi += 1;
    }
    for (; bi < 64; bi += 1) this.blobs.hide(bi);
    this.blobs.update();
    this.renderer.render(this.scene, this.camera);
    if (this.state === 'playing') {
      const step = this.missions.currentStep();
      let marker = null;
      if (step && step.loc) marker = { x: step.loc[0], z: step.loc[1] };
      else if (step && step.action === 'enterTargetCar') marker = { x: this.targetCar.x, z: this.targetCar.z };
      this.hud.drawMinimap({
        player: { x: this.player.x, z: this.player.z, heading: this.player.heading },
        marker,
        cops: this.police.positions(),
        crates: CRATE_SPOTS.filter((_, i) => !this.missions.cratesCollected.has(i)).map(([x, z]) => ({ x, z })),
        time: this.time,
      });
    }
  }

  // ---- snapshot + debug seam ----

  buildSnapshot() {
    const debug = {
      placePlayer: (x, z) => {
        this.player.place(x, z);
        this.player.snapCamera();
        this.syncSnapshot();
      },
      setHeading: (h) => {
        this.player.setHeading(h);
        this.syncSnapshot();
      },
      trafficPositions: () => this.traffic.positions(),
      pedPositions: () => this.peds.positions(),
      nearestPed: () => {
        const p = this.peds.nearest(this.player.x, this.player.z);
        return p ? { x: p.x, z: p.z } : { x: this.player.x + 5, z: this.player.z };
      },
      policeCarPositions: () => this.police.positions(),
      cityColliders: () => this.city.colliders.map((c) => ({ ...c })),
      startMission: (i) => {
        this.missions.startMission(i);
        this.startMissionEffects();
        this.syncSnapshot();
      },
      teleportToObjective: () => {
        const step = this.missions.currentStep();
        if (!step) return;
        let dest = null;
        if (step.loc) dest = { x: step.loc[0], z: step.loc[1] };
        else if (step.action === 'enterTargetCar') dest = { x: this.targetCar.x, z: this.targetCar.z - 2 };
        else if (step.action === 'collectCrates') {
          const idx = CRATE_SPOTS.findIndex((_, i) => !this.missions.cratesCollected.has(i));
          if (idx >= 0) dest = { x: CRATE_SPOTS[idx][0], z: CRATE_SPOTS[idx][1] };
        } else if (step.action === 'stealAnyCar') {
          const car = this.nearestCar(this.player.x, this.player.z, 200);
          if (car) dest = { x: car.x + 2, z: car.z };
        }
        if (!dest) return;
        if (this.player.inCar && this.player.car) {
          this.player.car.x = dest.x;
          this.player.car.z = dest.z;
          this.player.car.speed = 0;
          this.player.car.mesh.position.set(dest.x, 0, dest.z);
          this.player.x = dest.x;
          this.player.z = dest.z;
        } else {
          this.player.place(dest.x, dest.z);
        }
        this.player.snapCamera();
        this.syncSnapshot();
      },
      getInCar: () => {
        if (this.player.inCar) return;
        let car = this.nearestCar(this.player.x, this.player.z, 100);
        if (!car) {
          const mesh = createCarMesh('sedan', 0x8a8a8a);
          const x = this.player.x + 3;
          const z = this.player.z;
          mesh.position.set(x, 0, z);
          this.scene.add(mesh);
          car = {
            id: `spawned-${Date.now()}`, type: 'sedan', mesh,
            x, z, heading: 0, speed: 0, driver: null, parked: true, color: 0x8a8a8a,
          };
          this.cars.push(car);
        }
        if (car.police) {
          this.police.cruisers = this.police.cruisers.filter((c) => c !== car);
        }
        this.player.enterCar(car);
        this.syncSnapshot();
      },
      setMoney: (n) => {
        this.money = n;
        this.syncSnapshot();
      },
      saveNow: () => this.save(),
      currentStep: () => this.missions.currentStep(),
    };
    this.snap = {
      state: 'title',
      missionIndex: 0,
      missionStep: 0,
      missionDone: false,
      objective: '',
      money: 0,
      debt: DEBT_TOTAL,
      wanted: 0,
      health: 100,
      ammo: 12,
      pistol: false,
      inCar: false,
      speed: 0,
      policeCars: 0,
      player: { x: 0, z: 8, speed: 0, heading: 0 },
      debug,
    };
    window.__game = this.snap;
    window.__step = (seconds, renderIt) => {
      const sub = 1 / 60;
      let remaining = seconds;
      let guard = 0;
      while (remaining > 0 && guard < 1200) {
        const dt = Math.min(sub, remaining);
        this.step(dt);
        remaining -= dt;
        guard += 1;
      }
      if (renderIt) this.render();
    };
  }

  syncSnapshot() {
    const s = this.snap;
    s.state = this.state;
    s.missionIndex = this.missions.missionIndex;
    s.missionStep = this.missions.missionStep;
    s.missionDone = this.missions.missionDone;
    s.objective = this.missions.objectiveText();
    s.money = this.money;
    s.debt = this.debt;
    s.wanted = this.wanted;
    s.health = this.health;
    s.ammo = this.ammo;
    s.pistol = this.pistol;
    s.inCar = this.player.inCar;
    s.speed = this.player.speed;
    s.policeCars = this.police.count();
    s.player.x = this.player.x;
    s.player.z = this.player.z;
    s.player.speed = this.player.speed;
    s.player.heading = this.player.heading;
    this.hud.update(s);
  }

  // ---- screenshot setups ----

  setupShot(name) {
    if (name === 'start') return; // title screen over the city
    this.newGame();
    if (name === 'drive') {
      // In a sedan on the avenue, moving, traffic around.
      const car = this.cars.find((c) => c.id.startsWith('parked-'));
      car.x = 0;
      car.z = 10;
      car.heading = 0;
      car.speed = 12;
      car.mesh.position.set(0, 0, 10);
      car.mesh.rotation.y = 0;
      this.player.enterCar(car);
      this.player.snapCamera();
      this.stepSim(1.2);
    } else if (name === 'chase') {
      // Mission 3, wanted 3, sports car at speed, cruisers right behind.
      this.missions.startMission(2);
      this.wanted = 3;
      this.startMissionEffects();
      const car = this.targetCar;
      car.x = 0;
      car.z = 0;
      car.heading = 0;
      car.speed = 18;
      car.mesh.position.set(0, 0, 0);
      car.mesh.rotation.y = 0;
      this.player.enterCar(car);
      this.shotCam = 'chase-front';
      for (let i = 0; i < 2; i += 1) {
        const cruiser = this.police.spawnCruiser(this.player);
        // Wide stagger: both cruisers read beside the player's car in
        // the front camera instead of hiding directly behind it.
        cruiser.x = i === 0 ? 4.5 : -4.5;
        cruiser.z = i === 0 ? -11 : -16;
        cruiser.heading = 0;
        cruiser.speed = 17;
        cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
        cruiser.mesh.rotation.y = 0;
      }
      this.player.snapCamera();
      this.stepSim(1.0);
      // Re-stage the cruisers after the sim step: during the step they
      // converge onto the player's line and hide behind the car. Pin them
      // flanking the player so the chase reads in the frame.
      const chasers = this.police.cruisers;
      const spots = [
        { x: this.player.x + 4.5, z: this.player.z - 7 },
        { x: this.player.x - 4.5, z: this.player.z - 12 },
      ];
      chasers.forEach((c, i) => {
        const s = spots[i % spots.length];
        c.x = s.x;
        c.z = s.z;
        c.heading = this.player.car ? this.player.car.heading : 0;
        c.speed = 18;
        c.mesh.position.set(c.x, 0, c.z);
        c.mesh.rotation.y = c.heading;
      });
    } else if (name === 'mission') {
      // Mission 4, on foot at the harbor, guards closing in. The player
      // stands at (176,-6) facing east: the camera lands west at (166,-6)
      // on a sightline the harbor colliders leave clear (verified by
      // probe) and clear of the palm columns too (palms stand at x=155
      // and x=166 on fixed 13 m steps; a palm at (166,2) blocked the
      // earlier due-east framing, and a container stack sits at
      // x 165.5..171.5, z -1.7..0.9).
      this.missions.startMission(3);
      this.startMissionEffects();
      this.player.place(176, -6);
      this.player.setHeading(Math.PI / 2);
      this.shotCam = 'mission-close';
      this.player.snapCamera();
      this.stepSim(0.6);
    }
    this.syncSnapshot();
  }

  stepSim(seconds) {
    const sub = 1 / 60;
    let remaining = seconds;
    while (remaining > 0) {
      const dt = Math.min(sub, remaining);
      this.step(dt);
      remaining -= dt;
    }
    this.render();
  }
}
