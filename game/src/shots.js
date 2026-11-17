// ?shot= staging: puts the game in a photogenic state for each dossier
// screenshot, then the caller steps the sim (shotPreroll seconds) and
// renders. The 3 s preroll lets the mission banner and toast fade so
// the frame shows the street, not the UI text.
// Density rules (from the v1 review): drive + mission shots must be
// packed with traffic, peds, buildings and props; the chase shot needs
// police cruisers big and close in frame WITHOUT covering the player's
// car, so the camera sits to the side and the cruisers run offset.
import { Car } from './vehicles.js';

export function setupShot(game, name) {
  game.shotPreroll = 0.9;
  if (name === 'start') {
    // Title screen over the city; the camera orbits slowly.
    game.showTitleScreen();
    game.cameraRig.titleAngle = 2.4;
    return;
  }
  if (name === 'drive') {
    game.startNewGame();
    game.shotPreroll = 3.0;
    // Drive north up road x=0 through downtown: buildings both sides.
    const sedan = game.parkedCars[0];
    game.enterCarDirect(sedan);
    sedan.x = 0;
    sedan.z = 40;
    sedan.heading = Math.PI;
    sedan.speed = 14;
    sedan.cruise = 14;
    sedan.syncMesh();
    game.player.heading = Math.PI;
    // Extra traffic on the same road so the frame reads busy.
    game.addTrafficAt(1.8, 8, 3, 0);
    game.addTrafficAt(-1.8, -24, 3, 0);
    game.addTrafficAt(1.8, 72, 2, 0);
    // Extra pedestrians on the sidewalks AHEAD of the car (it drives
    // north, so they start north of it).
    for (const [x, z, dir] of [[5, -12, 1], [-5, -24, -1], [5, -36, -1], [-5, -8, 1]]) {
      game.addPedAt(x, z, 'z', 0, x > 0 ? 5 : -5, dir);
    }
    game.cameraRig.shotDist = 7.5;
    game.cameraRig.shotHeight = 3.0;
    return;
  }
  if (name === 'chase') {
    game.startNewGame();
    game.shotPreroll = 3.0;
    game.missions.startMission(2);
    game.police.setWanted(3);
    // Player in the sports coupe, speeding east on road z=0.
    const coupe = new Car(game.scene, {
      type: 'sports', color: 0xc23b2e, x: -60, z: 0, heading: Math.PI / 2,
    });
    game.parkedCars.push(coupe);
    game.enterCarDirect(coupe);
    coupe.speed = 24;
    coupe.cruise = 24;
    coupe.syncMesh();
    game.player.heading = Math.PI / 2;
    // Two cruisers tight behind, offset to either side so they flank
    // the player car instead of stacking up behind the camera.
    const c1 = game.police.spawnCruiser(-72, 2.5, Math.PI / 2);
    c1.speed = 24;
    const c2 = game.police.spawnCruiser(-76, -2.5, Math.PI / 2);
    c2.speed = 24;
    // Traffic ahead to dodge.
    game.addTrafficAt(48, 1.8, 0, 0);
    game.addTrafficAt(86, -1.8, 0, 0);
    // Front-side camera, ahead of the coupe on the road and looking
    // back: the coupe drives toward the lens with both cruisers
    // visible behind it. The offset keeps the camera on the road
    // (z +4.1, buildings start at z 6) so the pull-in never fires.
    game.cameraRig.orbit = Math.PI - 0.35;
    game.cameraRig.shotDist = 12;
    game.cameraRig.shotHeight = 5.0;
    return;
  }
  if (name === 'mission') {
    game.startNewGame();
    game.shotPreroll = 3.0;
    game.missions.startMission(3);
    game.missions.setStep(1);
    // On foot between the crates, guards closing in, crane and
    // containers in the background. Low close camera, less empty dock.
    game.player.x = 166;
    game.player.z = -6;
    game.player.heading = Math.PI / 2;
    game.player.mesh.position.set(166, 0, -6);
    game.player.mesh.rotation.y = Math.PI / 2;
    game.cameraRig.shotDist = 4.8;
    game.cameraRig.shotHeight = 2.6;
    return;
  }
}
