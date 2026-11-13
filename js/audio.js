// Synthesized sound effects (WebAudio). No audio files.
(function (DD) {
  'use strict';
  let ac = null, master = null, muted = false, noiseBuf = null;

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.22;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  }

  function tone(f0, f1, dur, type, vol, delay) {
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, cutoff, delay) {
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = 'lowpass'; f.frequency.value = cutoff || 2000;
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const SFX = {
    jump: () => tone(240, 520, 0.14, 'square', 0.18),
    land: () => noise(0.06, 0.12, 500),
    pickup: () => { tone(880, 880, 0.07, 'triangle', 0.35); tone(1320, 1320, 0.12, 'triangle', 0.35, 0.06); },
    power: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.2, i * 0.07)); },
    trophy: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.4, i * 0.09)); },
    shoot: () => { tone(900, 140, 0.14, 'sawtooth', 0.2); noise(0.08, 0.2, 4000); },
    eshoot: () => tone(300, 700, 0.12, 'sawtooth', 0.1),
    boom: () => { noise(0.3, 0.45, 1400); tone(200, 50, 0.3, 'square', 0.2); },
    die: () => { noise(0.5, 0.45, 1800); tone(440, 50, 0.7, 'sawtooth', 0.28); },
    door: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'square', 0.18, i * 0.08)); },
    warp: () => { tone(200, 1600, 0.6, 'sine', 0.35); tone(300, 2400, 0.6, 'triangle', 0.2, 0.1); },
    life: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.35, i * 0.06)); },
    jet: () => noise(0.12, 0.25, 900),
    thrust: () => noise(0.1, 0.1, 700),
    jetout: () => tone(400, 80, 0.4, 'square', 0.2)
  };

  DD.Audio = {
    unlock: unlock,
    play: function (name) {
      if (muted || !ac || !SFX[name]) return;
      try { SFX[name](); } catch (e) { /* audio is optional */ }
    },
    toggleMute: function () { muted = !muted; return muted; }
  };
})(globalThis.DD = globalThis.DD || {});
