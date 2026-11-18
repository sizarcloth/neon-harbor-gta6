// Synthesized WebAudio SFX. No audio files. Lazy AudioContext, one master gain, no-op without it.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;
  const lastPlay = {};

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }
  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  // One-shot: oscillator or noise through an envelope into the master gain.
  function blip({ type = 'square', from = 880, to = null, dur = 0.2, vol = 0.5, slide = 0, noise = false, lowpass = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    let src;
    if (noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      src = ctx.createBufferSource();
      src.buffer = buf;
    } else {
      src = ctx.createOscillator();
      src.type = type;
      src.frequency.setValueAtTime(from, t);
      if (to !== null) src.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      else if (slide) src.frequency.exponentialRampToValueAtTime(Math.max(30, from * (1 + slide)), t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = src;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function play(name) {
    const now = performance.now();
    if (lastPlay[name] && now - lastPlay[name] < 50) return; // one voice per event
    lastPlay[name] = now;
    switch (name) {
      case 'punch': blip({ type: 'square', from: 200, slide: -0.3, dur: 0.15, vol: 0.6 }); break;
      case 'shot': blip({ noise: true, dur: 0.18, vol: 0.7, lowpass: 2500 }); blip({ type: 'square', from: 900, slide: -0.8, dur: 0.08, vol: 0.3 }); break;
      case 'chime': blip({ type: 'sine', from: 660, to: 990, dur: 0.35, vol: 0.4 }); break;
      case 'click': blip({ type: 'square', from: 1200, dur: 0.05, vol: 0.25 }); break;
      case 'pickup': blip({ type: 'sawtooth', from: 440, slide: 0.5, dur: 0.25, vol: 0.4 }); break;
      case 'crash': blip({ noise: true, dur: 0.4, vol: 0.7, lowpass: 900 }); break;
      case 'jump': blip({ type: 'sine', from: 300, slide: 0.4, dur: 0.18, vol: 0.3 }); break;
      case 'mission': blip({ type: 'sine', from: 523, to: 784, dur: 0.5, vol: 0.45 }); break;
      case 'busted': blip({ type: 'sawtooth', from: 300, slide: -0.5, dur: 0.5, vol: 0.4 }); break;
      default: break;
    }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 70;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  function setEngine(rpm) { // rpm 0..1 from car speed
    if (!engineOsc) return;
    engineOsc.frequency.setTargetAtTime(60 + rpm * 90, ctx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(0.05 + rpm * 0.08, ctx.currentTime, 0.05);
  }
  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch { /* already stopped */ }
    engineOsc = null; engineGain = null;
  }
  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 800;
    sirenLfo = ctx.createOscillator(); sirenLfo.type = 'sine'; sirenLfo.frequency.value = 1.25;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 150;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0.06;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
  }
  function setSiren(dist) { // fade with distance, silent past 60 m
    if (!sirenGain) return;
    sirenGain.gain.setTargetAtTime(dist > 60 ? 0 : 0.06 * (1 - dist / 60), ctx.currentTime, 0.1);
  }
  function stopSiren() {
    if (!sirenOsc) return;
    try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
    sirenOsc = null; sirenLfo = null; sirenGain = null;
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  }
  return { unlock, play, startEngine, setEngine, stopEngine, startSiren, setSiren, stopSiren, setMuted, isMuted: () => muted };
}
