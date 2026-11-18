// Screenshot scenes behind ?shot=start|drive|chase|mission. Each stages the real
// rules forward from a fresh world, then the caller renders once and flags ready.
// The mission banner is a 4 s intro: staging advances the HUD past it so the frame
// shows the game as a player sees it after the intro, not the title card.
export function stageShot(name, world) {
  if (name === 'drive') {
    world.startNewGame();
    world.placePlayer(-12, 46);
    world.debug.getInCar();
    world.debug.placeCar(2.2, 24, 0);
    world.debug.setCarSpeed(18);
    world.step(1, false);
    world.debug.setCarSpeed(18);
    world.step(1, false);
    world.hud.update(5);
    return;
  }
  if (name === 'chase') {
    world.startNewGame();
    world.placePlayer(-12, 46);
    world.debug.getInCar();
    world.debug.placeCar(2.2, 24, 0);
    world.debug.setCarSpeed(20);
    world.debug.setWanted(3);
    world.debug.spawnPoliceNear(0, 2, 0.2);
    world.debug.spawnPoliceNear(-3, -10, 0.1);
    world.debug.spawnPoliceNear(3, -22, 0);
    for (let i = 0; i < 3; i += 1) {
      world.step(1.4, false);
      world.debug.setCarSpeed(20);
    }
    world.hud.update(5);
    // Chase camera: high behind the player car, looking down the road, so the
    // pursuing cruisers are in frame behind it instead of behind the camera.
    const p = world.playerCar;
    world.shotCam = { pos: [p.x, 15, p.z - 22], look: [p.x, 1, p.z + 6] };
    return;
  }
  if (name === 'mission') {
    world.startNewGame();
    world.missions.startMission(3);
    world.placePlayer(164, 14);
    world.debug.setHeading(2.36);
    world.step(1, false);
    world.hud.update(5);
    return;
  }
  // Default: title screen over the city, attract mode running.
  world.toTitle();
  world.orbitAngle = 0.7;
  world.step(5, false);
}
