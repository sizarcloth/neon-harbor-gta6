// Boot: parse ?seed / ?nogl / ?shot, build the world, wire screens, expose the test seams.
import { World } from './world.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const nogl = params.has('nogl');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const world = new World(canvas, { seed });

Object.defineProperty(window, '__game', { get: () => world.snapshot() });
window.__step = (seconds, renderIt = false) => world.step(seconds, renderIt);
window.__shotReady = false;

function unlockAudio() { world.audio.unlock(); }

document.getElementById('btn-new').addEventListener('click', () => { unlockAudio(); world.audio.play('click'); world.startNewGame(); });
document.getElementById('btn-continue').addEventListener('click', () => { unlockAudio(); world.audio.play('click'); world.continueGame(); });
document.getElementById('btn-resume').addEventListener('click', () => { world.audio.play('click'); world.togglePause(); });
document.getElementById('btn-restart').addEventListener('click', () => { world.audio.play('click'); world.startNewGame(); });
document.getElementById('btn-quit').addEventListener('click', () => { world.audio.play('click'); world.toTitle(); });
document.getElementById('btn-again').addEventListener('click', () => { world.audio.play('click'); world.startNewGame(); });
document.getElementById('btn-pause-mute').addEventListener('click', (e) => {
  world.muted = !world.muted;
  world.audio.setMuted(world.muted);
  e.target.textContent = world.muted ? 'Unmute (M)' : 'Mute (M)';
});
document.getElementById('mutebtn').addEventListener('click', (e) => {
  world.muted = !world.muted;
  world.audio.setMuted(world.muted);
  e.target.textContent = world.muted ? 'Unmute' : 'Mute';
});

// Continue is only offered when a save exists.
const save = world.loadSave();
const btnContinue = document.getElementById('btn-continue');
if (save) {
  btnContinue.style.display = 'block';
  document.getElementById('save-info').textContent = `Save found: $${save.money}, mission ${Math.min(save.missionIndex + 1, 5)} of 5, debt $${save.debt}.`;
} else {
  btnContinue.style.display = 'none';
  document.getElementById('save-info').textContent = 'No save yet. New Game starts the story.';
}

if (shot) {
  stageShot(shot, world);
  world.render();
  window.__shotReady = true;
} else if (nogl) {
  world.render();
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (acc >= STEP) { world.update(STEP); acc -= STEP; }
    world.render();
    if (!window.__shotReady) window.__shotReady = true;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.state === 'playing') world.togglePause();
  });
  requestAnimationFrame(frame);
}
