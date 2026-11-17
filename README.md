# NEON HARBOR

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game set in Port Solmar, a fictional sun-soaked neon
coastal city. You are Rae Voss, a driver-for-hire who owes $5,000 to the
fixer Sol. Drive, steal cars, dodge the police, and run five jobs to pay
the debt and earn your freedom.

Built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
All content is original: no Rockstar names, art, music, or assets.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080 — fully offline, no build step.

## Controls

- WASD: move / drive. Shift: sprint. Space: jump / handbrake.
- Mouse drag: orbit camera. Left click: shoot (pistol) or punch.
- E: enter / exit car. Q: draw / holster pistol. F: punch.
- P: pay-n-spray (clears wanted, near the garage). M: mute. Esc: pause.

## Systems

- Open city: road grid with traffic, sidewalk pedestrians, harbor,
  beach, palm boulevard, neon signs.
- Wanted level 1-5 stars: police cruisers chase and ram, foot cops try
  to bust you. Hide to cool down, or pay at the garage.
- Combat: punch and hitscan pistol, ammo pickups, health, hospital
  respawn.
- Five sequential story missions with markers, objectives, and rewards
  that pay off the $5,000 debt.
- Money, save/load via localStorage, minimap, speedometer, synthesized
  WebAudio sound (no audio files).

## Layout

- `game/index.html` — page shell, HUD, import map.
- `game/src/` — one module per system (city, vehicles, traffic, peds,
  police, combat, missions, camera, hud, audio, effects, save, shots).
- `game/vendor/three/` — three.js, vendored.

Screenshots in `screenshots/` are real renders captured from the game.
