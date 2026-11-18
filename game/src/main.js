// main.js — NEON HARBOR entry point. Builds the game, then runs the
// requestAnimationFrame loop in normal play. In ?nogl=1 mode the loop
// stays off and the sim is driven by window.__step (playtest harness).

import { Game } from './game.js';

const container = document.getElementById('game-container');
const game = new Game(container);
window.__neonHarbor = game;

const params = new URLSearchParams(location.search);
if (!params.has('nogl')) {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.step(dt);
    game.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
