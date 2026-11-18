// Keyboard + mouse input. Held keys are state; one-shot presses queue as flags.
export const ACT = { PUNCH: 1, FIRE: 2, ENTER: 4, PISTOL: 8, PAUSE: 16, JUMP: 32, MUTE: 64 };

export function createInput() {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0, mouseDY = 0, dragging = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyF') actions |= ACT.PUNCH;
    else if (e.code === 'KeyE') actions |= ACT.ENTER;
    else if (e.code === 'KeyQ') actions |= ACT.PISTOL;
    else if (e.code === 'Space') actions |= ACT.JUMP;
    else if (e.code === 'KeyM') actions |= ACT.MUTE;
    else if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACT.PAUSE;
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('pointerdown', (e) => {
    if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A')) return;
    actions |= ACT.FIRE;
    dragging = true;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });

  return {
    held(code) { return keys.has(code); },
    // WASD as a -1..1 pair, relative to the camera heading.
    move() {
      const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      return { x, z };
    },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    handbrake() { return keys.has('Space'); },
    takeActions() { const a = actions; actions = 0; return a; },
    takeMouse() { const m = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return m; },
    clear() { keys.clear(); actions = 0; },
  };
}
