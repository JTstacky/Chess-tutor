// sfx.js — sound (art and game-feel lane, see docs/COORDINATION.md). Tiny WebAudio synth, no files.
let actx = null;
export function unlockAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
}
function tone(freq, dur, type = 'triangle', vol = 0.12, slide = 0) {
  if (!actx || actx.state !== 'running') return;
  const t = actx.currentTime, o = actx.createOscillator(), v = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(v).connect(actx.destination); o.start(t); o.stop(t + dur);
}
export function sound(kind) {
  switch (kind) {
    case 'click': tone(660, 0.06, 'square', 0.05); break;
    case 'fire': tone(180, 0.28, 'sawtooth', 0.07, 2.6); break;
    case 'impact': tone(110, 0.22, 'triangle', 0.14, 0.5); break;
    case 'block': tone(150, 0.2, 'square', 0.09, 0.4); setTimeout(() => tone(90, 0.25, 'triangle', 0.1, 0.6), 60); break;
    case 'king': tone(320, 0.3, 'sawtooth', 0.1, 0.5); break;
    case 'shield': tone(900, 0.2, 'sine', 0.08, 0.5); break;
    case 'build': tone(440, 0.08, 'triangle', 0.08); setTimeout(() => tone(660, 0.1, 'triangle', 0.08), 70); break;
    case 'boom': tone(70, 0.5, 'sawtooth', 0.13, 0.4); break;
    case 'bonus': [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.09), i * 70)); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 120)); break;
    case 'sudden': tone(200, 0.6, 'square', 0.08, 0.5); break;
  }
}
