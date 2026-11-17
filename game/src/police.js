// Wanted level 1-5, police cruisers that chase and ram, foot cops that
// bust, heat decay when hidden. Crimes feed in from combat and car
// theft; the garage (pay-n-spray) and the hideout clear the heat.
import { ROADS } from './config.js';
import { Car } from './vehicles.js';
import { randRange } from './rng.js';

export class PoliceSystem {
  constructor(scene, city, peds, audio, effects) {
    this.scene = scene;
    this.city = city;
    this.peds = peds;
    this.audio = audio;
    this.effects = effects;
    this.wanted = 0;
    this.cruisers = [];
    this.hiddenTimer = 0;
    this.ramCooldown = 0;
    this.time = 0;
    this.onToast = null;
  }

  addWanted(n) {
    if (n <= 0) return;
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.hiddenTimer = 0;
    if (before === 0 && this.wanted > 0 && this.onToast) {
      this.onToast('WANTED: the police are after you');
    }
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.hiddenTimer = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this.hiddenTimer = 0;
    for (const c of this.cruisers) c.remove();
    this.cruisers = [];
    this.audio.stopSiren();
  }

  spawnCruiser(x, z, heading) {
    const car = new Car(this.scene, {
      type: 'police', color: 0xeef0ea, x, z, heading, police: true,
    });
    car.driver = 'police';
    this.cruisers.push(car);
    return car;
  }

  _spawnNearPlayer(player) {
    const angle = Math.random() * Math.PI * 2;
    const px = player.x + Math.cos(angle) * 35;
    const pz = player.z + Math.sin(angle) * 35;
    const road = this.city.nearestRoadPoint(px, pz);
    const heading = Math.atan2(player.x - road.x, player.z - road.z);
    return this.spawnCruiser(road.x, road.z, heading);
  }

  positions() {
    return this.cruisers.map((c) => ({ x: c.x, z: c.z }));
  }

  nearestDistance(player) {
    let best = Infinity;
    for (const c of this.cruisers) best = Math.min(best, Math.hypot(c.x - player.x, c.z - player.z));
    for (const cop of this.peds.cops) best = Math.min(best, Math.hypot(cop.x - player.x, cop.z - player.z));
    return best;
  }

  update(dt, player, playerCar) {
    this.time += dt;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    if (this.wanted > 0) {
      // Keep the cruiser count in step with the heat.
      const want = Math.min(this.wanted, 3);
      while (this.cruisers.length < want) this._spawnNearPlayer(player);
      // Foot cops join the chase at 2 stars and up.
      if (this.wanted >= 2 && this.peds.cops.length < 2) {
        const angle = Math.random() * Math.PI * 2;
        const road = this.city.nearestRoadPoint(
          player.x + Math.cos(angle) * 20, player.z + Math.sin(angle) * 20,
        );
        this.peds.spawnCop(road.x, road.z);
      }
      this.audio.startSiren();
    } else if (this.cruisers.length) {
      for (const c of this.cruisers) c.remove();
      this.cruisers = [];
      this.audio.stopSiren();
    }

    for (const cruiser of this.cruisers) {
      const d = Math.hypot(player.x - cruiser.x, player.z - cruiser.z);
      const chaseSpeed = Math.min(28, 21 + this.wanted * 1.4);
      const st = cruiser._chase || (cruiser._chase = { lx: cruiser.x, lz: cruiser.z, timer: 0, detour: null, detourUntil: 0 });
      if (st.detour) {
        // Driving back to the road grid after being blocked.
        const dd = cruiser.driveToward(dt, st.detour.x, st.detour.z, chaseSpeed, 3.2);
        if (dd < 3 || this.time > st.detourUntil) st.detour = null;
      } else if (!player.inCar && d < 6) {
        // On-foot suspect: pull up and wait for the foot cops.
        cruiser.driveToward(dt, cruiser.x, cruiser.z, 0);
      } else {
        cruiser.driveToward(dt, player.x, player.z, chaseSpeed, 2.8);
        // Stall detection: pushing into a building wall head-on kills
        // speed every frame, so a cruiser with no detour would sit
        // there forever. If it barely moved while trying, get back on
        // the road grid and drive along it toward the player: roads
        // are guaranteed-open corridors, unlike a blind sideways hop.
        st.timer += dt;
        if (st.timer >= 0.5) {
          const moved = Math.hypot(cruiser.x - st.lx, cruiser.z - st.lz);
          st.lx = cruiser.x;
          st.lz = cruiser.z;
          st.timer = 0;
          if (moved < 2 && cruiser.speed > 4) {
            const rp = this.city.nearestRoadPoint(cruiser.x, cruiser.z);
            const pp = this.city.nearestRoadPoint(player.x, player.z);
            const onVertical = ROADS.some((r) => Math.abs(r - rp.x) < 0.01);
            st.detour = onVertical
              ? { x: rp.x, z: rp.z + Math.sign(pp.z - rp.z || 1) * 14 }
              : { x: rp.x + Math.sign(pp.x - rp.x || 1) * 14, z: rp.z };
            st.detourUntil = this.time + 2.0;
          }
        }
      }
      cruiser.collide(this.city);
      // Ram the player's car on contact.
      if (playerCar && d < 4.6 && this.ramCooldown <= 0) {
        this.ramCooldown = 0.9;
        const pushX = (playerCar.x - cruiser.x) / (d || 1);
        const pushZ = (playerCar.z - cruiser.z) / (d || 1);
        playerCar.x += pushX * 1.6;
        playerCar.z += pushZ * 1.6;
        playerCar.speed *= 0.72;
        cruiser.speed *= 0.55;
        this.effects.addTrauma(0.45);
        this.effects.burst(playerCar.x, 1, playerCar.z, 0xffcc44, 10, 4);
        this.audio.play('crash');
        if (this.onRam) this.onRam(8);
      }
      cruiser.syncMesh();
    }

    // Siren volume follows the nearest cruiser.
    if (this.cruisers.length) {
      const near = this.nearestDistance(player);
      this.audio.setSiren(Math.max(0, 1 - near / 60));
    } else {
      this.audio.setSiren(0);
    }

    // Heat decay: no police within 30 m for 8 s drops one star.
    if (this.wanted > 0) {
      if (this.nearestDistance(player) > 30) {
        this.hiddenTimer += dt;
        if (this.hiddenTimer >= 8) {
          this.hiddenTimer = 0;
          this.wanted -= 1;
          if (this.onToast) {
            this.onToast(this.wanted === 0 ? 'You lost them' : 'Heat cooling off');
          }
        }
      } else {
        this.hiddenTimer = 0;
      }
    }
  }
}
