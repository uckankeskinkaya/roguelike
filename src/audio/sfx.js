// All sound is synthesized with WebAudio at runtime: no audio files.
let ctx = null;
let master, sfxBus, musicBus, comp, noiseBuf;
const last = new Map();
let xpCombo = 0, xpComboT = 0;

const settings = { sfx: 0.8, music: 0.55 };

export function audioReady() { return !!ctx; }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'interactive' });
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
  comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = 0.9;
  sfxBus = ctx.createGain(); musicBus = ctx.createGain();
  sfxBus.connect(comp); musicBus.connect(comp);
  comp.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  music.start();
}

export function setVolumes(sfx, mus) {
  settings.sfx = sfx; settings.music = mus;
  applyVolumes();
}
function applyVolumes() {
  if (!ctx) return;
  sfxBus.gain.value = settings.sfx * settings.sfx;
  musicBus.gain.value = settings.music * settings.music * 0.6;
}

// ----------------------------------------------------------------- helpers
function out(pan) {
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(sfxBus);
    return p;
  }
  return sfxBus;
}

function tone(dest, { type = 'sine', f0 = 440, f1 = null, t = 0, dur = 0.1, vol = 0.2, attack = 0.002, curve = 'exp', detune = 0 }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== null) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    else o.frequency.linearRampToValueAtTime(f1, now + dur);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); g.connect(dest);
  o.start(now); o.stop(now + dur + 0.02);
  return o;
}

function noise(dest, { t = 0, dur = 0.1, vol = 0.2, type = 'lowpass', f0 = 2000, f1 = null, q = 0.7, attack = 0.002 }) {
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, now);
  if (f1 !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.02);
}

const rnd = (a, b) => a + Math.random() * (b - a);

// --------------------------------------------------------------- sound defs
// Each entry: [min gap in ms, fn(dest, v, pitch)]
const SOUNDS = {
  blaster: [40, (d, v, p) => {
    tone(d, { type: 'square', f0: 1150 * p, f1: 360 * p, dur: 0.09, vol: 0.09 * v });
    tone(d, { type: 'sine', f0: 420 * p, f1: 120, dur: 0.07, vol: 0.12 * v });
  }],
  shotgun: [60, (d, v, p) => {
    noise(d, { dur: 0.22, vol: 0.38 * v, f0: 3200 * p, f1: 300 });
    tone(d, { type: 'sine', f0: 160 * p, f1: 45, dur: 0.18, vol: 0.4 * v });
  }],
  needle: [28, (d, v, p) => {
    tone(d, { type: 'triangle', f0: rnd(1700, 2000) * p, f1: 900, dur: 0.04, vol: 0.06 * v });
  }],
  rail: [80, (d, v, p) => {
    tone(d, { type: 'sawtooth', f0: 300 * p, f1: 2400, dur: 0.06, vol: 0.12 * v });
    noise(d, { t: 0.03, dur: 0.35, vol: 0.32 * v, type: 'highpass', f0: 1800, f1: 600 });
    tone(d, { type: 'sine', f0: 110, f1: 28, t: 0.03, dur: 0.5, vol: 0.45 * v });
  }],
  rocket: [70, (d, v, p) => {
    noise(d, { dur: 0.35, vol: 0.22 * v, type: 'bandpass', f0: 500 * p, f1: 2600, q: 1.5, attack: 0.03 });
    tone(d, { type: 'sawtooth', f0: 90 * p, f1: 50, dur: 0.15, vol: 0.12 * v });
  }],
  boomerang: [60, (d, v, p) => {
    const o = tone(d, { type: 'triangle', f0: 520 * p, f1: 780 * p, dur: 0.16, vol: 0.09 * v, curve: 'lin' });
    o.detune.setValueAtTime(0, ctx.currentTime);
  }],
  zap: [50, (d, v, p) => {
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
    for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(rnd(300, 1800) * p, now + i * 0.016);
    g.gain.setValueAtTime(0.16 * v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(f); f.connect(g); g.connect(d); o.start(now); o.stop(now + 0.15);
  }],
  flame: [45, (d, v) => {
    noise(d, { dur: 0.12, vol: 0.09 * v, type: 'bandpass', f0: rnd(700, 1100), q: 0.6, attack: 0.02 });
  }],
  homing: [60, (d, v, p) => {
    tone(d, { type: 'sine', f0: 900 * p, f1: 1500 * p, dur: 0.07, vol: 0.08 * v });
    tone(d, { type: 'sine', f0: 1200 * p, f1: 1900 * p, t: 0.05, dur: 0.06, vol: 0.06 * v });
  }],
  hit: [22, (d, v, p) => {
    noise(d, { dur: 0.045, vol: 0.12 * v, type: 'highpass', f0: 2500 * p });
    tone(d, { type: 'square', f0: rnd(180, 240) * p, f1: 90, dur: 0.04, vol: 0.05 * v });
  }],
  crit: [40, (d, v, p) => {
    tone(d, { type: 'sine', f0: 1600 * p, f1: 2300, dur: 0.09, vol: 0.12 * v });
    noise(d, { dur: 0.05, vol: 0.12 * v, type: 'highpass', f0: 3500 });
  }],
  kill: [30, (d, v, p) => {
    tone(d, { type: 'square', f0: 520 * p, f1: 70, dur: 0.13, vol: 0.09 * v });
    noise(d, { dur: 0.1, vol: 0.14 * v, f0: 2600, f1: 400 });
  }],
  bigkill: [60, (d, v, p) => {
    tone(d, { type: 'sawtooth', f0: 220 * p, f1: 40, dur: 0.35, vol: 0.18 * v });
    noise(d, { dur: 0.35, vol: 0.25 * v, f0: 1800, f1: 120 });
  }],
  boom: [50, (d, v, p) => {
    noise(d, { dur: 0.7, vol: 0.5 * v, f0: 1400 * p, f1: 60, attack: 0.005 });
    tone(d, { type: 'sine', f0: 95 * p, f1: 28, dur: 0.6, vol: 0.55 * v });
  }],
  dash: [60, (d, v) => {
    noise(d, { dur: 0.2, vol: 0.2 * v, type: 'bandpass', f0: 500, f1: 3200, q: 2, attack: 0.01 });
    tone(d, { type: 'sine', f0: 300, f1: 900, dur: 0.12, vol: 0.05 * v });
  }],
  nova: [80, (d, v) => {
    tone(d, { type: 'sine', f0: 200, f1: 50, dur: 0.4, vol: 0.4 * v });
    noise(d, { dur: 0.3, vol: 0.2 * v, type: 'bandpass', f0: 3000, f1: 300, q: 1 });
  }],
  hurt: [90, (d, v) => {
    tone(d, { type: 'sawtooth', f0: 260, f1: 60, dur: 0.3, vol: 0.28 * v });
    noise(d, { dur: 0.18, vol: 0.3 * v, f0: 1800, f1: 200 });
  }],
  xp: [30, (d, v) => {
    const f = 880 * Math.pow(2, xpCombo / 12);
    tone(d, { type: 'sine', f0: f, f1: f * 1.5, dur: 0.07, vol: 0.06 * v });
  }],
  heal: [100, (d, v) => {
    [523, 659, 784].forEach((f, i) => tone(d, { type: 'triangle', f0: f, t: i * 0.06, dur: 0.18, vol: 0.12 * v }));
  }],
  levelup: [200, (d, v) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(d, { type: 'square', f0: f, t: i * 0.05, dur: 0.22, vol: 0.06 * v }));
    [523, 1047].forEach((f) => tone(d, { type: 'sine', f0: f, t: 0.25, dur: 0.5, vol: 0.1 * v }));
  }],
  wave: [300, (d, v) => {
    [220, 330, 440].forEach((f, i) => {
      tone(d, { type: 'sawtooth', f0: f, t: i * 0.02, dur: 0.9, vol: 0.07 * v, attack: 0.05 });
    });
    tone(d, { type: 'sine', f0: 55, f1: 50, dur: 1, vol: 0.3 * v, attack: 0.05 });
  }],
  waveend: [300, (d, v) => {
    [392, 523, 659, 784].forEach((f, i) => tone(d, { type: 'triangle', f0: f, t: i * 0.08, dur: 0.4, vol: 0.12 * v }));
  }],
  boss: [500, (d, v) => {
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
    const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(38, now + 2);
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, now); f.frequency.exponentialRampToValueAtTime(200, now + 2);
    lfo.frequency.value = 9; lg.gain.value = 0.25 * v;
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35 * v, now + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(d);
    o.start(now); lfo.start(now); o.stop(now + 2.3); lfo.stop(now + 2.3);
    noise(d, { dur: 2, vol: 0.2 * v, f0: 400, f1: 60, attack: 0.3 });
  }],
  bossphase: [500, (d, v) => {
    SOUNDS.boss[1](d, v * 0.8);
    SOUNDS.boom[1](d, v, 0.7);
  }],
  eshot: [55, (d, v) => {
    tone(d, { type: 'sine', f0: 520, f1: 260, dur: 0.08, vol: 0.05 * v });
  }],
  charge: [120, (d, v) => {
    tone(d, { type: 'sawtooth', f0: 120, f1: 420, dur: 0.28, vol: 0.07 * v, curve: 'lin' });
  }],
  fuse: [100, (d, v) => {
    [0, 0.12, 0.24].forEach((t) => tone(d, { type: 'square', f0: 1300, t, dur: 0.05, vol: 0.05 * v }));
  }],
  down: [200, (d, v) => {
    tone(d, { type: 'sawtooth', f0: 440, f1: 55, dur: 0.8, vol: 0.2 * v, curve: 'lin' });
  }],
  revive: [200, (d, v) => {
    [392, 523, 784].forEach((f, i) => tone(d, { type: 'sine', f0: f, t: i * 0.07, dur: 0.3, vol: 0.14 * v }));
  }],
  tick: [100, (d, v) => tone(d, { type: 'sine', f0: 660, dur: 0.1, vol: 0.12 * v })],
  go: [100, (d, v) => tone(d, { type: 'square', f0: 990, f1: 1320, dur: 0.25, vol: 0.08 * v })],
  pick: [80, (d, v) => {
    tone(d, { type: 'triangle', f0: 660, f1: 990, dur: 0.12, vol: 0.12 * v });
    tone(d, { type: 'sine', f0: 1320, t: 0.06, dur: 0.2, vol: 0.08 * v });
  }],
  hover: [40, (d, v) => tone(d, { type: 'sine', f0: 1200, dur: 0.03, vol: 0.03 * v })],
  click: [40, (d, v) => tone(d, { type: 'triangle', f0: 800, f1: 1200, dur: 0.06, vol: 0.08 * v })],
  horde: [500, (d, v) => {
    [0, 0.3].forEach((t) => tone(d, { type: 'sawtooth', f0: 180, f1: 260, t, dur: 0.28, vol: 0.08 * v, curve: 'lin' }));
  }],
  gameover: [1000, (d, v) => {
    [440, 392, 330, 220].forEach((f, i) => tone(d, { type: 'triangle', f0: f, t: i * 0.22, dur: 0.6, vol: 0.15 * v }));
    tone(d, { type: 'sine', f0: 110, f1: 40, t: 0.6, dur: 1.6, vol: 0.3 * v });
  }],
  victory: [1000, (d, v) => {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(d, { type: 'square', f0: f, t: i * 0.12, dur: 0.35, vol: 0.07 * v }));
  }],
  poi: [200, (d, v) => {
    tone(d, { type: 'sawtooth', f0: 110, f1: 330, dur: 0.5, vol: 0.12 * v, curve: 'lin', attack: 0.05 });
    [330, 495, 660].forEach((f, i) => tone(d, { type: 'triangle', f0: f, t: 0.1 + i * 0.07, dur: 0.4, vol: 0.09 * v }));
  }],
  chest: [150, (d, v) => {
    noise(d, { dur: 0.12, vol: 0.2 * v, type: 'bandpass', f0: 900, q: 2 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(d, { type: 'square', f0: f, t: 0.05 + i * 0.06, dur: 0.28, vol: 0.06 * v }));
    tone(d, { type: 'sine', f0: 1047, t: 0.35, dur: 0.6, vol: 0.12 * v });
  }],
  loot: [60, (d, v) => {
    tone(d, { type: 'triangle', f0: 880, f1: 1320, dur: 0.12, vol: 0.12 * v });
    tone(d, { type: 'sine', f0: 1760, t: 0.07, dur: 0.25, vol: 0.09 * v });
  }],
  spawn: [90, (d, v) => tone(d, { type: 'sine', f0: 180, f1: 90, dur: 0.12, vol: 0.04 * v })],
};

export function sfx(name, { vol = 1, pitch = 1, pan = 0 } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const def = SOUNDS[name];
  if (!def) return;
  const nowMs = performance.now();
  const prev = last.get(name) || 0;
  if (nowMs - prev < def[0]) return;
  last.set(name, nowMs);
  if (name === 'xp') {
    xpCombo = nowMs - xpComboT < 450 ? Math.min(xpCombo + 1, 14) : 0;
    xpComboT = nowMs;
  }
  try { def[1](out(pan), vol, pitch); } catch { /* ignore audio glitches */ }
}

// ------------------------------------------------------------------- music
// A small procedural sequencer: dark A-minor loop whose layers follow the
// game's intensity (0 menu, 1 intermission, 2 wave, 3 boss).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PROG = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [50, 53, 57], // Dm
  [52, 56, 59], // E
];
const BPM = 104;

export const music = {
  intensity: 0,
  timer: null,
  step: 0,
  nextT: 0,
  start() {
    if (this.timer || !ctx) return;
    this.nextT = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },
  setIntensity(i) { this.intensity = i; },
  schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const stepDur = 60 / BPM / 4;
    while (this.nextT < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextT, stepDur);
      this.nextT += stepDur;
      this.step = (this.step + 1) % 64;
    }
  },
  playStep(s, t, sd) {
    const I = this.intensity;
    const bar = Math.floor(s / 16) % 4;
    const chord = PROG[bar];
    const inBar = s % 16;
    const dest = musicBus;
    const at = t - ctx.currentTime;
    if (at < -0.05) return;
    const T = Math.max(0, at);

    // pad: one long chord per bar
    if (inBar === 0) {
      for (const n of chord) {
        for (const det of [-7, 7]) {
          padVoice(dest, NOTE(n - 12), T, sd * 16, I === 0 ? 0.03 : 0.022, det);
        }
      }
    }
    if (I >= 1 && inBar % 4 === 2) {
      noise(dest, { t: T, dur: 0.05, vol: I >= 2 ? 0.05 : 0.025, type: 'highpass', f0: 7000 });
    }
    if (I >= 2) {
      // bass: driving eighths with octave pops
      if (inBar % 2 === 0) {
        const root = chord[0] - 24 + (inBar % 8 === 6 ? 12 : 0);
        bassVoice(dest, NOTE(root), T, sd * 1.8, 0.12);
      }
      // kick
      if (inBar % 4 === 0 || (I >= 3 && inBar % 4 === 0)) {
        tone(dest, { type: 'sine', f0: 140, f1: 38, t: T, dur: 0.22, vol: 0.4 });
      }
      // snare/clap on 2 and 4
      if (inBar === 4 || inBar === 12) {
        noise(dest, { t: T, dur: 0.14, vol: 0.12, type: 'bandpass', f0: 1800, q: 0.9 });
      }
    }
    if (I >= 3) {
      // boss arp
      const n = chord[(s % 3)] + 12 + (Math.floor(s / 3) % 2) * 12;
      tone(dest, { type: 'square', f0: NOTE(n), t: T, dur: sd * 0.9, vol: 0.025 });
      if (inBar % 2 === 1) noise(dest, { t: T, dur: 0.03, vol: 0.03, type: 'highpass', f0: 9000 });
    }
  },
};

function padVoice(dest, f, t, dur, vol, det) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const fl = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
  fl.type = 'lowpass'; fl.frequency.value = 700; fl.Q.value = 0.5;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + dur * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, now + dur * 1.05);
  o.connect(fl); fl.connect(g); g.connect(dest);
  o.start(now); o.stop(now + dur * 1.1);
}

function bassVoice(dest, f, t, dur, vol) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const fl = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = f;
  fl.type = 'lowpass'; fl.Q.value = 6;
  fl.frequency.setValueAtTime(900, now);
  fl.frequency.exponentialRampToValueAtTime(140, now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(fl); fl.connect(g); g.connect(dest);
  o.start(now); o.stop(now + dur + 0.02);
}
