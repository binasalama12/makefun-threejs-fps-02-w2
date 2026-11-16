// All sound is synthesised on the spot with WebAudio: short oscillator chirps for
// gunfire and UI, filtered noise bursts for scatter shots and the orb blast.
// No audio files exist anywhere in the game folder, so nothing is ever fetched.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freqA, freqB, dur, type, vol, when = 0) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1, when = 0) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const gain = c.createGain(); gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'scatter') { noise(0.16, 0.9, 700, 0.7); tone(150, 50, 0.14, 'square', 0.35); }
      else if (kind === 'precision') { noise(0.22, 0.7, 1200, 0.8); tone(220, 40, 0.24, 'sawtooth', 0.4); }
      else if (kind === 'smg') { tone(340, 90, 0.07, 'square', 0.30); noise(0.05, 0.35, 2200, 1); }
      else { tone(280, 70, 0.09, 'square', 0.38); noise(0.06, 0.4, 1800, 1); }
    },
    enemyShot() { tone(190, 60, 0.08, 'square', 0.16); noise(0.05, 0.18, 1400, 1); },
    dry() { tone(1200, 900, 0.04, 'square', 0.15); },
    reload() { tone(500, 300, 0.06, 'square', 0.2); tone(700, 420, 0.06, 'square', 0.2, 0.16); },
    hit() { tone(1500, 1100, 0.05, 'square', 0.22); },
    // Headshots must sound different at a glance: a bright double-ping an
    // octave above the body-hit tick, so the ear learns before the eye does.
    headshot() { tone(2300, 1900, 0.05, 'square', 0.26); tone(2900, 2400, 0.06, 'square', 0.2, 0.045); },
    reclaimDone() { tone(1320, 1320, 0.07, 'sine', 0.24); tone(990, 990, 0.09, 'sine', 0.24, 0.08); },
    kill() { tone(880, 1320, 0.12, 'triangle', 0.3); tone(1320, 1760, 0.1, 'triangle', 0.22, 0.08); },
    hurt() { tone(160, 70, 0.16, 'sawtooth', 0.3); },
    buy() { tone(990, 990, 0.06, 'sine', 0.25); tone(1480, 1480, 0.08, 'sine', 0.25, 0.07); },
    denied() { tone(220, 160, 0.12, 'square', 0.2); },
    orbThrow() { tone(600, 1200, 0.14, 'sine', 0.2); },
    orbBoom() { noise(0.5, 1.0, 240, 0.5); tone(90, 30, 0.5, 'sine', 0.7); },
    captureTick() { tone(1040, 1040, 0.05, 'sine', 0.14); },
    roundWin() { tone(660, 660, 0.1, 'triangle', 0.3); tone(880, 880, 0.1, 'triangle', 0.3, 0.1); tone(1320, 1320, 0.16, 'triangle', 0.3, 0.2); },
    roundLose() { tone(440, 440, 0.12, 'triangle', 0.28); tone(330, 330, 0.12, 'triangle', 0.28, 0.12); tone(220, 220, 0.2, 'triangle', 0.28, 0.24); },
  };
}
