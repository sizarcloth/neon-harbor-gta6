// Keyboard + mouse input. Movement keys are polled by the sim; action
// keys (E/Q/F/P/M/B/Esc) fire callbacks on keydown. Left-click (a press
// with almost no drag) is the shoot/punch action; dragging orbits the
// camera. All listeners live here so the sim never touches the DOM.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.canvas = canvas;
    this.orbitDX = 0;
    this.orbitDY = 0;
    this.dragging = false;
    this.onAction = null;
    this.onClick = null;
    this._downPos = null;
    this._downTime = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onAction) this.onAction(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this._downPos = { x: e.clientX, y: e.clientY };
      this._downTime = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* headless: no capture */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.orbitDX += e.movementX || 0;
      this.orbitDY += e.movementY || 0;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      const moved = this._downPos
        ? Math.hypot(e.clientX - this._downPos.x, e.clientY - this._downPos.y)
        : 99;
      const dt = performance.now() - this._downTime;
      if (moved < 6 && dt < 500 && this.onClick) this.onClick(e.clientX, e.clientY);
      this._downPos = null;
    });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Consume accumulated orbit drag since the last frame.
  takeOrbit() {
    const dx = this.orbitDX;
    const dy = this.orbitDY;
    this.orbitDX = 0;
    this.orbitDY = 0;
    return { dx, dy };
  }

  clear() {
    this.keys.clear();
    this.orbitDX = 0;
    this.orbitDY = 0;
  }
}
