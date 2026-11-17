// Synthesized WebAudio SFX (sfxr-style): oscillators + filtered noise,
// no audio files, no fetches. AudioContext is created lazily on the
// first user gesture; every call is a no-op without one, so the game
// never breaks in headless browsers. One master gain; M mutes.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = window.localStorage.getItem('neon-harbor-muted') === '1';
    } catch { /* storage unavailable: sound on */ }
    this._lastPlay = {};
    this._engine = null;
    this._siren = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    try {
      window.localStorage.setItem('neon-harbor-muted', m ? '1' : '0');
    } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(m ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  _throttle(name, ms) {
    const now = performance.now();
    if (this._lastPlay[name] && now - this._lastPlay[name] < ms) return false;
    this._lastPlay[name] = now;
    return true;
  }

  _tone({ type = 'square', from = 440, to = null, dur = 0.2, vol = 0.5, punch = 0 }) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    const peak = vol * (1 + punch);
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.3, vol = 0.5, lowpass = 1200, punch = 0 }) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * (1 + punch), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        if (this._throttle(name, 60)) this._tone({ type: 'square', from: 1200, dur: 0.05, vol: 0.2 });
        break;
      case 'punch':
        if (this._throttle(name, 80)) {
          this._tone({ type: 'square', from: 200, to: 90, dur: 0.14, vol: 0.55, punch: 0.5 });
          this._noise({ dur: 0.1, vol: 0.25, lowpass: 600 });
        }
        break;
      case 'shot':
        if (this._throttle(name, 70)) {
          this._noise({ dur: 0.22, vol: 0.7, lowpass: 2500, punch: 0.6 });
          this._tone({ type: 'square', from: 900, to: 140, dur: 0.12, vol: 0.4, punch: 0.4 });
        }
        break;
      case 'crash':
        if (this._throttle(name, 150)) this._noise({ dur: 0.4, vol: 0.6, lowpass: 700, punch: 0.7 });
        break;
      case 'chime':
        if (this._throttle(name, 100)) {
          this._tone({ type: 'sine', from: 660, dur: 0.18, vol: 0.45 });
          setTimeout(() => this._tone({ type: 'sine', from: 990, dur: 0.3, vol: 0.4 }), 120);
        }
        break;
      case 'pickup':
        if (this._throttle(name, 100)) this._tone({ type: 'sawtooth', from: 440, to: 880, dur: 0.22, vol: 0.35 });
        break;
      case 'jump':
        if (this._throttle(name, 120)) this._tone({ type: 'sine', from: 300, to: 520, dur: 0.16, vol: 0.25 });
        break;
      case 'busted':
        if (this._throttle(name, 200)) this._tone({ type: 'sawtooth', from: 320, to: 180, dur: 0.5, vol: 0.4 });
        break;
      case 'win':
        if (this._throttle(name, 200)) {
          [523, 659, 784, 1046].forEach((f, i) => {
            setTimeout(() => this._tone({ type: 'sine', from: f, dur: 0.32, vol: 0.4 }), i * 140);
          });
        }
        break;
      default:
        break;
    }
  }

  // Engine loop: one sawtooth osc, pitch + volume follow speed.
  startEngine() {
    if (!this.ctx || this._engine) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start();
    this._engine = { osc, gain: g };
  }

  setEngine(speedNorm) {
    if (!this._engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._engine.osc.frequency.setTargetAtTime(55 + speedNorm * 90, t, 0.08);
    this._engine.gain.gain.setTargetAtTime(0.05 + speedNorm * 0.09, t, 0.08);
  }

  stopEngine() {
    if (!this._engine) return;
    try { this._engine.osc.stop(); } catch { /* already stopped */ }
    this._engine = null;
  }

  // Siren loop: one triangle osc, LFO sweeps 700-950 Hz.
  startSiren() {
    if (!this.ctx || this._siren) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 820;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.25;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    lfo.start();
    this._siren = { osc, lfo, gain: g };
  }

  setSiren(nearNorm) {
    if (!this._siren || !this.ctx) return;
    this._siren.gain.gain.setTargetAtTime(nearNorm * 0.12, this.ctx.currentTime, 0.15);
  }

  stopSiren() {
    if (!this._siren) return;
    try { this._siren.osc.stop(); this._siren.lfo.stop(); } catch { /* already stopped */ }
    this._siren = null;
  }

  stopAllLoops() {
    this.stopEngine();
    this.stopSiren();
  }
}
