// Tiny synthesized sound effects (no audio files to download).
import { settings } from './storage';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!settings.sound) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  sweep(freq, freq, duration, type, gain, delay);
}

/** A tone that glides from one pitch to another. */
function sweep(f1: number, f2: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t);
  if (f2 !== f1) osc.frequency.exponentialRampToValueAtTime(f2, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** Filtered white noise: whooshes, splashes, rumbles. */
function noise(duration: number, gain = 0.2, delay = 0, freq = 1000, type: BiquadFilterType = 'bandpass', toFreq = freq) {
  const ac = audio();
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq !== freq) f.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, duration / 4));
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + duration);
}

const notes = (freqs: number[], step: number, type: OscillatorType = 'triangle', gain = 0.12, len = step * 1.5) =>
  freqs.forEach((f, i) => f && tone(f, len, type, gain, i * step));

export const sounds = {
  move: () => tone(420, 0.08, 'triangle', 0.2),
  capture: () => {
    tone(220, 0.12, 'square', 0.08);
    tone(160, 0.1, 'triangle', 0.2, 0.02);
  },
  check: () => {
    tone(660, 0.1, 'square', 0.07);
    tone(880, 0.12, 'square', 0.07, 0.08);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, i * 0.12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.15)),
  draw: () => [440, 440].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, i * 0.2)),
  lowTime: () => tone(1000, 0.05, 'square', 0.05),
};

/** Cartoon sound effects for piece moves and battles. */
export const sfx = {
  hop: () => sweep(380, 720, 0.07, 'sine', 0.14),
  gallop: () => [0, 0.09, 0.22, 0.31].forEach((d, i) => tone(i % 2 ? 620 : 820, 0.04, 'square', 0.05, d)),
  glide: () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, 'sine', 0.05, i * 0.07)),
  rumble: () => noise(0.45, 0.25, 0, 180, 'lowpass'),
  teleport: () => sweep(500, 2000, 0.18, 'sine', 0.08),
  appear: () => {
    sweep(1800, 900, 0.12, 'sine', 0.08);
    tone(1760, 0.3, 'sine', 0.06, 0.08);
  },
  royal: () => notes([523, 784], 0.12, 'sawtooth', 0.05),
  thud: () => {
    sweep(150, 50, 0.22, 'sine', 0.4);
    noise(0.12, 0.12, 0, 400, 'lowpass');
  },
  whoosh: () => noise(0.35, 0.25, 0, 500, 'bandpass', 2500),
  sparkle: () => [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.18, 'sine', 0.06, i * 0.05)),
  pop: () => sweep(400, 1000, 0.07, 'sine', 0.2),
  boing: () => {
    sweep(180, 620, 0.18, 'triangle', 0.2);
    sweep(620, 380, 0.18, 'triangle', 0.14, 0.18);
  },
  bonk: () => {
    tone(190, 0.12, 'square', 0.1);
    sweep(900, 300, 0.1, 'triangle', 0.16);
  },
  splash: () => {
    noise(0.55, 0.3, 0, 3000, 'highpass');
    [0.05, 0.12, 0.2].forEach((d) => sweep(600, 1200, 0.05, 'sine', 0.08, d));
  },
  splat: () => {
    noise(0.25, 0.3, 0, 900, 'lowpass');
    sweep(300, 80, 0.2, 'sawtooth', 0.06);
  },
  zap: () => sweep(1600, 180, 0.35, 'sawtooth', 0.07),
  ding: () => {
    tone(1760, 0.7, 'sine', 0.12);
    tone(2637, 0.5, 'sine', 0.05, 0.02);
  },
  laugh: () => [0, 0.15, 0.3, 0.45].forEach((d) => sweep(560, 420, 0.1, 'square', 0.04, d)),
  ribbit: () => [0, 0.16].forEach((d) => sweep(200, 130, 0.11, 'sawtooth', 0.09, d)),
  fanfare: () => notes([523, 523, 523, 659, 0, 523, 659, 784], 0.11, 'sawtooth', 0.05),
  slideDown: () => sweep(1500, 250, 0.6, 'sine', 0.12),
  slideUp: () => sweep(250, 1500, 0.5, 'sine', 0.12),
  clang: () => {
    tone(1250, 0.45, 'square', 0.05);
    tone(1870, 0.35, 'square', 0.04);
    noise(0.1, 0.2, 0, 4000, 'highpass');
  },
  boom: () => {
    noise(0.7, 0.4, 0, 400, 'lowpass', 80);
    sweep(120, 35, 0.5, 'sine', 0.4);
  },
  crash: () => {
    noise(0.6, 0.3, 0, 1800, 'bandpass', 600);
    [0.05, 0.13, 0.22].forEach((d) => tone(300 + Math.random() * 500, 0.08, 'square', 0.04, d));
  },
  squish: () => sweep(320, 90, 0.18, 'sawtooth', 0.08),
  bubble: () => [0, 0.1, 0.2].forEach((d) => sweep(300, 950, 0.08, 'sine', 0.12, d)),
  freeze: () => {
    [2093, 2637, 3136, 2349, 2794].forEach((f, i) => tone(f, 0.2, 'sine', 0.05, i * 0.06));
    noise(0.5, 0.08, 0, 6000, 'highpass');
  },
  punch: () => {
    noise(0.15, 0.4, 0, 700, 'lowpass');
    sweep(220, 60, 0.15, 'sine', 0.3);
  },
  squeak: () => [0, 0.12, 0.24].forEach((d) => sweep(1300, 1900, 0.07, 'sine', 0.08, d)),
  poof: () => noise(0.35, 0.25, 0, 1200, 'bandpass', 300),
  whirl: () => [0, 0.15, 0.3, 0.45].forEach((d) => sweep(300, 700, 0.15, 'triangle', 0.07, d)),
  shrink: () => sweep(300, 2200, 0.9, 'sine', 0.08),
  rocket: () => {
    noise(0.9, 0.25, 0, 300, 'bandpass', 1500);
    sweep(150, 900, 0.9, 'sawtooth', 0.03);
  },
  fireworks: () =>
    [0, 0.1, 0.25, 0.3, 0.45].forEach((d) => {
      noise(0.1, 0.25, d, 3000, 'highpass');
      tone(900 + Math.random() * 1500, 0.2, 'sine', 0.04, d);
    }),
  snore: () => sweep(110, 80, 0.7, 'sawtooth', 0.04),
  cough: () => [0, 0.2].forEach((d) => noise(0.12, 0.2, d, 700)),
  music: () => notes([659, 784, 880, 784, 659, 784, 988, 1047], 0.13, 'triangle', 0.08),
  clunk: () => {
    tone(160, 0.1, 'square', 0.1);
    noise(0.08, 0.2, 0, 900, 'lowpass');
  },
  tada: () => notes([523, 659, 784, 1047], 0.08, 'triangle', 0.12, 0.3),
  fizzle: () => noise(0.6, 0.15, 0, 5000, 'highpass', 1500),
  creak: () => sweep(180, 260, 0.5, 'sawtooth', 0.03),
  whistle: () => sweep(2000, 700, 0.7, 'sine', 0.06),
  wobble: () => [0, 0.2, 0.4].forEach((d) => sweep(300, 220, 0.18, 'triangle', 0.06, d)),
  step: () => tone(300, 0.05, 'triangle', 0.12),
};

export type Sfx = keyof typeof sfx;
