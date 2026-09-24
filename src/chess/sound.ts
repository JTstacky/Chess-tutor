// Tiny synthesized sound effects (no audio files to download).
import { settings } from './storage';

let ctx: AudioContext | null = null;

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  if (!settings.sound) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

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
