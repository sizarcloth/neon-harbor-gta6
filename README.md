# NEON HARBOR: Port Solmar

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). No real places, people, brands or music: Port Solmar is a fictional sun-soaked neon coastal city, and Rae Voss is a fictional driver-for-hire who owes the fixer Sol $5000.

## Play it

Serve the static files and open the page in a desktop browser. No build step, no network requests, fully offline:

```sh
node serve.ts
# open http://localhost:8080
```

## The game

Third-person 3D (three.js, vendored under `game/vendor/three/`). Rae runs five sequential missions to pay off the debt: First Fare, Hot Wheels, Heat Run, Harbor Heist, and The Big Score.

Systems in the game:

- On foot: WASD run, Shift sprint, Space jump, mouse-drag orbit camera.
- Cars: E to enter and exit, including stealing parked and traffic cars. Four car types with different speed and handling: sedan, taxi, sports coupe, pickup.
- Traffic: cars driving the road grid, pedestrians walking the sidewalks. Pedestrians flee from gunshots and crashes.
- Wanted level 1 to 5 stars: stealing in view, hitting pedestrians, shooting, and killing cops raise it. Police cruisers chase and ram; foot cops chase and try to bust the player. Wanted decays while hidden, and the pay-n-spray garage clears stars for $100.
- Combat: punch (F or click) and pistol (Q, click to shoot, limited ammo, green ammo pickups). Health bar, health pickups, death respawns at the hospital and costs $200.
- Missions and story: five jobs with intro text, objectives, a beacon marker, and cash rewards that add up to the $5000 debt.
- Progression: mission money buys a sports coupe at the garage shop ($1500), plus health and ammo pickups. Progress saves to localStorage; Continue resumes it from the title screen.
- HUD: minimap with roads, player, mission marker and cops, wanted stars, money, debt, health, ammo, objective, and a speedometer in a car.
- Sound: synthesized WebAudio only, no audio files: engine hum, police siren, gunshots, pickup chimes. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Sprint |
| Space | Jump / handbrake |
| Mouse drag | Orbit camera |
| E | Enter / exit car (buy the sports coupe at the garage sign) |
| F | Punch |
| Q | Pistol |
| Click | Shoot (pistol out) / punch (fists) |
| P | Pause |
| M | Mute |

## Screenshots

1. Title screen over Port Solmar.
2. Driving through the city with traffic and the minimap.
3. Police chase: wanted stars, cruisers closing in, minimap, mission objective, money, speedometer.
4. Harbor Heist on foot at the harbor, crates and guards in view.

## Files

- `game/index.html` - page, HUD, screens, import map.
- `game/src/main.js` - boot, game loop, `window.__game` / `window.__step` / `window.__shotReady` seams, `?shot=` scenes.
- `game/src/world.js` - the World: state, player, police, save, camera.
- `game/src/city.js` - Port Solmar: sky, ground, buildings, palms, lamps, road graph, colliders.
- `game/src/vehicles.js` - car physics, traffic AI, police chase AI.
- `game/src/people.js` - pedestrians, foot cops, harbor guards.
- `game/src/combat.js` - punch, pistol, pickups, particles.
- `game/src/missions.js` - the five-mission state machine and beacon.
- `game/src/hud.js` - HUD readouts and minimap.
- `game/src/audio.js` - synthesized WebAudio SFX and loops.
- `game/src/models.js` - procedural models, code only.
- `game/src/textures.js` - canvas-generated textures.
- `game/src/config.js` - tuning, palette, mission data.
- `game/src/input.js` - keyboard and mouse input.
- `game/src/random.js` - seeded RNG.
- `game/src/shots.js` - screenshot staging.
- `game/vendor/three/` - three.js, vendored byte-for-byte.
