// audio.js — synthesized WebAudio SFX (sfxr-style). No audio files.
// AudioContext is created lazily on the first user gesture; every call
// is a no-op when audio is unavailable, so the game never breaks.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastPlay = {};
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

  init() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
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

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // One-shot tone: oscillator + envelope + optional frequency slide.
  tone({ type = 'square', freq = 440, slide = 0, dur = 0.2, vol = 0.5, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * (1 + slide)), t0 + dur);
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Noise burst through a lowpass filter.
  noise({ dur = 0.2, vol = 0.5, cutoff = 1200, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // Named SFX. Same sound within 50 ms plays once (no stacking).
  play(name) {
    if (!this.ctx) return;
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < 50) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'shoot':
        this.noise({ dur: 0.12, vol: 0.5, cutoff: 3000 });
        this.tone({ type: 'square', freq: 900, slide: -0.7, dur: 0.1, vol: 0.3 });
        break;
      case 'punch':
        this.tone({ type: 'square', freq: 200, slide: -0.3, dur: 0.14, vol: 0.5 });
        this.noise({ dur: 0.08, vol: 0.25, cutoff: 800 });
        break;
      case 'pickup':
        this.tone({ type: 'sine', freq: 660, dur: 0.15, vol: 0.4 });
        this.tone({ type: 'sine', freq: 990, dur: 0.25, vol: 0.4, delay: 0.09 });
        break;
      case 'mission':
        this.tone({ type: 'sine', freq: 523, dur: 0.18, vol: 0.45 });
        this.tone({ type: 'sine', freq: 784, dur: 0.3, vol: 0.45, delay: 0.14 });
        break;
      case 'crash':
        this.noise({ dur: 0.35, vol: 0.6, cutoff: 700 });
        this.tone({ type: 'square', freq: 150, slide: -0.4, dur: 0.3, vol: 0.4 });
        break;
      case 'click':
        this.tone({ type: 'square', freq: 1200, dur: 0.05, vol: 0.2 });
        break;
      case 'bust':
        this.tone({ type: 'triangle', freq: 400, slide: -0.6, dur: 0.5, vol: 0.4 });
        break;
      case 'enter':
        this.tone({ type: 'triangle', freq: 300, slide: 0.3, dur: 0.12, vol: 0.3 });
        break;
      case 'jump':
        this.tone({ type: 'sine', freq: 300, slide: 0.4, dur: 0.15, vol: 0.25 });
        break;
      default:
        break;
    }
  }

  // Engine loop: sawtooth whose pitch follows speed. One instance only.
  engine(speed, maxSpeed) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const ratio = Math.max(0, Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed)));
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 75, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.04 + ratio * 0.1, this.ctx.currentTime, 0.1);
  }

  stopEngine() {
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  // Siren loop: triangle wave wobbling between 700 and 950 Hz.
  siren(distance) {
    if (!this.ctx) return;
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 820;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'sine';
      this.sirenLfo.frequency.value = 1.25;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 130;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    }
    const vol = distance === null ? 0 : Math.max(0, 0.16 * (1 - distance / 60));
    this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
  }

  stopSiren() {
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  stopAllLoops() {
    this.stopEngine();
    this.stopSiren();
  }
}
