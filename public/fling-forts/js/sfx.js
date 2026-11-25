// sfx.js — sound (art and game-feel lane, see docs/COORDINATION.md). WebAudio synth, no files.
// Every sound is a short recipe of tones, pitch sweeps and filtered noise through one compressor, with a little
// random pitch each time so repeats don't sound like a machine. API (used by main.js): unlockAudio(), sound(kind).
// Kinds: click fire impact block king shield build boom bonus win sudden die flyerDown roundStart tick, and one
// strike sound per chief: strike_<race> (sound('strike_' + race); races without one can fall back to 'impact').
// Unknown kinds are ignored.
let actx = null, out = null, noiseBuf = null;
const last = {};                                  // kind -> time last played, to stop pile-ups in one frame
const GAP = { strike: 0.1, die: 0.07, flyerDown: 0.1, tick: 0.2, impact: 0.05, block: 0.06, boom: 0.08, king: 0.12, shield: 0.08, build: 0.05, fire: 0.04, click: 0.03, bonus: 0.15 };

export function unlockAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.16;
    out = actx.createGain(); out.gain.value = 2.4;
    const post = actx.createGain(); post.gain.value = 0.8;                  // headroom after the compressor's make-up gain
    out.connect(comp).connect(post).connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}

const vary = (amt = 0.06) => 1 + (Math.random() * 2 - 1) * amt;
/** One oscillator note: freq sliding to freq*slide over dur, starting `at` seconds from now. */
function tone(freq, dur, type = 'triangle', vol = 0.12, slide = 0, at = 0) {
  const t = actx.currentTime + at, o = actx.createOscillator(), v = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
/** A burst of filtered noise: thuds (lowpass), cracks and whooshes (bandpass), hiss (highpass). */
function noise(dur, vol = 0.2, type = 'lowpass', f0 = 800, f1 = 0, q = 0.8, at = 0) {
  const t = actx.currentTime + at, n = actx.createBufferSource(), f = actx.createBiquadFilter(), v = actx.createGain();
  n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = vary(0.1);
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + 0.008); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(v).connect(out); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
}

const RECIPES = {
  click() { tone(720 * vary(0.03), 0.05, 'square', 0.09); tone(1080, 0.05, 'triangle', 0.08, 0, 0.02); },
  // sling: a creak of the arm, a whoosh, and the thump of it stopping
  fire() { const p = vary(); noise(0.26, 0.2, 'bandpass', 500 * p, 2600 * p, 1.2); tone(170 * p, 0.2, 'sawtooth', 0.06, 2.4); tone(95 * p, 0.12, 'sine', 0.16, 0.6, 0.14); },
  // a stone landing: low thud plus a short gritty crack
  impact() { const p = vary(0.1); tone(120 * p, 0.2, 'sine', 0.36, 0.45); noise(0.12, 0.26, 'lowpass', 1400 * p, 300); noise(0.05, 0.1, 'highpass', 3000); },
  // a block giving way: crack, crumble, bits falling
  block() { const p = vary(0.1); noise(0.07, 0.28, 'bandpass', 1900 * p, 700, 1.5); tone(150 * p, 0.16, 'square', 0.07, 0.4); noise(0.34, 0.16, 'lowpass', 900 * p, 180, 0.7, 0.05); for (let i = 0; i < 3; i++) tone((260 + Math.random() * 220) * p, 0.05, 'triangle', 0.05, 0.6, 0.12 + i * 0.07 + Math.random() * 0.03); },
  // the chief taking a hit: a yelp over a dull thump
  king() { const p = vary(0.05); tone(520 * p, 0.09, 'square', 0.07, 1.5); tone(700 * p, 0.2, 'sawtooth', 0.07, 0.42, 0.08); tone(90, 0.2, 'sine', 0.22, 0.5); noise(0.1, 0.12, 'lowpass', 1000, 300); },
  // force field: glassy ping with a wobble
  shield() { const p = vary(0.04); tone(1250 * p, 0.3, 'sine', 0.09, 0.82); tone(1880 * p, 0.22, 'sine', 0.05, 0.9, 0.015); tone(625 * p, 0.16, 'triangle', 0.06, 1.1); noise(0.08, 0.05, 'highpass', 5000); },
  // building or sending troops: two knocks and a bright tick
  build() { const p = vary(0.05); noise(0.045, 0.18, 'bandpass', 950 * p, 0, 3); noise(0.045, 0.18, 'bandpass', 1250 * p, 0, 3, 0.085); tone(520 * p, 0.07, 'triangle', 0.07, 0, 0.0); tone(780 * p, 0.1, 'triangle', 0.07, 0, 0.085); },
  // explosion or a building coming down: sub drop, roar, rubble tail
  boom() { const p = vary(0.08); tone(110 * p, 0.55, 'sine', 0.34, 0.3); noise(0.5, 0.34, 'lowpass', 2200 * p, 120, 0.6); noise(0.09, 0.22, 'highpass', 2400); noise(0.5, 0.1, 'bandpass', 600, 200, 0.8, 0.22); },
  // a bonus caught: rising sparkle
  bonus() { [660, 880, 1320, 1760].forEach((f, i) => { tone(f, 0.16, 'triangle', 0.08, 0, i * 0.065); tone(f * 2, 0.1, 'sine', 0.03, 0, i * 0.065); }); noise(0.3, 0.04, 'highpass', 6000, 9000, 0.7, 0.1); },
  // match won: a small fanfare with a held chord
  win() { [523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.22, 'square', 0.015, 0, i * 0.13); tone(f / 2, 0.24, 'triangle', 0.02, 0, i * 0.13); }); [523, 659, 784, 1046].forEach((f) => tone(f, 0.9, 'triangle', 0.009, 0, 0.56)); noise(0.5, 0.03, 'highpass', 5000, 8000, 0.7, 0.56); },
  // sudden death: two low horn blasts
  sudden() { for (const at of [0, 0.36]) { tone(196, 0.3, 'sawtooth', 0.09, 0.96, at); tone(98, 0.3, 'square', 0.07, 0.96, at); tone(294, 0.3, 'sawtooth', 0.04, 0.96, at); } noise(0.7, 0.05, 'lowpass', 500, 200, 0.7); },
  // a troop going down: a short squeak dropping away, with a soft puff
  die() { const p = vary(0.14); tone(620 * p, 0.14, 'square', 0.05, 0.42); tone(310 * p, 0.12, 'triangle', 0.06, 0.5, 0.03); noise(0.14, 0.09, 'lowpass', 1200, 300, 0.7, 0.04); },
  // a flyer shot out of the sky: a falling whistle, then a small crunch
  flyerDown() { const p = vary(0.06); tone(1500 * p, 0.42, 'sine', 0.09, 0.22); tone(1000 * p, 0.42, 'triangle', 0.04, 0.22, 0.02); noise(0.4, 0.06, 'bandpass', 2400, 500, 2); noise(0.16, 0.24, 'lowpass', 1500, 250, 0.7, 0.4); tone(100, 0.18, 'sine', 0.2, 0.5, 0.4); },
  // round start: a quick three-note call that lands on a bright chord
  roundStart() { [392, 523, 659].forEach((f, i) => { tone(f, 0.12, 'square', 0.04, 0, i * 0.09); tone(f / 2, 0.14, 'triangle', 0.06, 0, i * 0.09); }); [784, 988, 1175].forEach((f) => tone(f, 0.45, 'triangle', 0.03, 0, 0.29)); noise(0.2, 0.05, 'highpass', 5000, 8000, 0.7, 0.29); },
  // countdown tick: a dry woodblock
  tick() { tone(880, 0.06, 'square', 0.13, 0.8); noise(0.03, 0.3, 'bandpass', 1800, 0, 4); },
  // ---- each chief's own strike ----
  // dwarf warhammer: a heavy clang and a ground thump
  strike_fantasy() { tone(90, 0.3, 'sine', 0.34, 0.45); tone(880, 0.22, 'square', 0.05, 0.98); tone(1320, 0.18, 'triangle', 0.05, 0.97); noise(0.16, 0.22, 'lowpass', 900, 200); },
  // ray gun: a falling "pew" with a ring
  strike_aliens() { const p = vary(0.05); tone(1800 * p, 0.24, 'sawtooth', 0.07, 0.18); tone(2400 * p, 0.2, 'sine', 0.07, 0.25); tone(600 * p, 0.12, 'square', 0.04, 1.6, 0.02); },
  // tesla prod: a buzzing zap
  strike_robots() { for (let i = 0; i < 5; i++) noise(0.035, 0.22, 'bandpass', 2600 + Math.random() * 2600, 0, 5, i * 0.04); tone(110, 0.24, 'sawtooth', 0.09, 1.02); tone(55, 0.24, 'square', 0.07); },
  // claws: three quick rips and a growl
  strike_monsters() { for (let i = 0; i < 3; i++) noise(0.07, 0.2, 'bandpass', 3200 - i * 500, 900, 2, i * 0.045); tone(95 * vary(0.1), 0.28, 'sawtooth', 0.12, 0.6); },
  // bazooka: a hollow thoomp, a hiss, then the bang
  strike_military() { tone(160, 0.12, 'sine', 0.3, 0.4); noise(0.24, 0.1, 'bandpass', 1800, 3200, 1.2, 0.03); tone(80, 0.3, 'sine', 0.3, 0.4, 0.28); noise(0.3, 0.3, 'lowpass', 2000, 150, 0.6, 0.28); },
  // ghost fire: a hollow moan sliding up with a breathy tail
  strike_undead() { const p = vary(0.05); tone(260 * p, 0.4, 'sine', 0.12, 1.9); tone(392 * p, 0.4, 'triangle', 0.05, 1.5, 0.03); noise(0.4, 0.09, 'bandpass', 700, 2200, 3); },
  // cutlass: a sharp swish and a steel ring
  strike_pirates() { const p = vary(0.06); noise(0.14, 0.24, 'bandpass', 1200 * p, 5200 * p, 1.6); tone(2100 * p, 0.3, 'triangle', 0.05, 0.99, 0.07); tone(3150 * p, 0.22, 'sine', 0.03, 0.99, 0.07); },
  // fire wave: a rushing whoosh with a low roar
  strike_elementals() { noise(0.45, 0.26, 'bandpass', 400, 1800, 0.8); noise(0.4, 0.14, 'lowpass', 700, 250, 0.7, 0.05); tone(70, 0.4, 'sawtooth', 0.08, 1.4); },
  // bone axe: a woody crack and a dull chop
  strike_beastfolk() { noise(0.05, 0.3, 'bandpass', 1500, 600, 2); tone(130 * vary(0.08), 0.22, 'square', 0.1, 0.4); tone(70, 0.26, 'sine', 0.3, 0.5, 0.02); noise(0.22, 0.14, 'lowpass', 800, 180, 0.7, 0.05); },
  // piston fist: a clank, then a burst of steam
  strike_steampunk() { tone(520, 0.07, 'square', 0.08, 0.7); tone(140, 0.14, 'sine', 0.24, 0.5, 0.03); noise(0.4, 0.2, 'highpass', 2600, 5200, 0.7, 0.06); tone(1900, 0.3, 'sine', 0.025, 1.3, 0.08); },
};
export const SOUND_KINDS = Object.keys(RECIPES);

export function sound(kind) {
  const r = RECIPES[kind];
  if (!r || !actx || actx.state !== 'running') return false;
  const t = actx.currentTime;
  const gk = kind.startsWith('strike_') ? 'strike_' + kind : kind, gap = GAP[kind] ?? (kind.startsWith('strike_') ? GAP.strike : 0);
  if (t - (last[gk] ?? -1) < gap) return false;       // the same sound twice in one instant is just louder
  last[gk] = t;
  try { r(); } catch { return false; }
  return true;
}
