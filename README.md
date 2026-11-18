# NEON HARBOR — Port Solmar

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sizarcloth/neon-harbor-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game set in the sun-soaked neon coastal city of **Port Solmar**.
You are **Rae Voss**, and you owe $5,000 to the harbor crew. Five jobs stand between
you and freedom: steal cars, outrun the law, smash crates, and settle the debt
before the sun goes down on Solmar.

## Play

Open `game/index.html` in a browser (or serve the repo root and visit `/game/`).
Everything runs offline: no network calls, no assets fetched at runtime.

- **WASD** move / drive, **Shift** sprint, **Space** jump / handbrake
- **E** enter / exit car, **F** punch, **Click** shoot, **B** shop at the garage
- **Esc** pause, **M** mute, drag the mouse to look around

## What is in the city

- A drivable coastal grid with traffic, pedestrians, palms, neon signs, and a harbor
- 5 sequential story missions with a $5,000 debt to clear
- A 1-5 star wanted system with police cruisers and on-foot cops
- Hand-to-hand and pistol combat, health and ammo pickups
- A minimap, objective tracker, speedometer, and save / continue via localStorage
- Synthesized WebAudio sound: engine, sirens, gunfire, and UI

## Tech

Three.js (vendored, `game/vendor/three/`), plain ES modules, no build step.
All models and textures are generated in code at runtime.

Built for the [make.fun](https://make.fun) **gta6-01** bounty.
