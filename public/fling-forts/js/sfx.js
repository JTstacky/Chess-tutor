// sfx.js — sound (art and game-feel lane, see docs/COORDINATION.md). WebAudio synth, no files.
//
// Every sound is built in layers, the way a recorded effect is: a sharp TRANSIENT (the click of contact), a BODY
// (the pitched or resonant part that says what it is), a TAIL (rumble, ring, debris) and often a SWEETENER (a
// sparkle, a whoosh before the hit). The building blocks are oscillator notes, FM pairs for metal and bells, noise
// through sweeping filters, pitched thumps and bandpassed "voice" yelps. All of it runs through a stereo bus (a
// sound is placed left to right where it happens), a short room reverb, and a compressor with a limiter after it.
// Each play varies pitch and timing a little, and many sounds pick between two or three takes.
//
// API: unlockAudio(), sound(kind, x) where x is the world x (0..1280) it happens at, or nothing for the middle.
// Kinds: see SOUND_KINDS. Chiefs: strike_<race>. Troop weapons: shot_<type> (the PROJ types in view.js, plus
// laser and zap). Unknown kinds are ignored and return false.
let actx = null, out = null, wet = null, bus = null, noiseBuf = null;
const last = {};                                  // kind -> time last played, to stop pile-ups in one frame
const GAP = { strike: 0.1, shot: 0.055, die: 0.07, flyerDown: 0.1, tick: 0.2, impact: 0.05, block: 0.06, boom: 0.08, king: 0.12, shield: 0.08, build: 0.05, send: 0.06, fire: 0.04, click: 0.03, bonus: 0.15, hit: 0.045, fortHit: 0.07, guarded: 0.09, coin: 0.05, heal: 0.12, slash: 0.05 };
// how much of each sound goes to the room reverb (0 dry .. 0.5 roomy); anything not listed gets 0.12
const WET = { click: 0, tick: 0.02, boom: 0.3, fortDown: 0.4, win: 0.35, sudden: 0.3, roundStart: 0.25, tier: 0.3, ult: 0.4, shield: 0.3, guarded: 0.3, bonus: 0.25, strike: 0.2, flyerDown: 0.2, chiefDown: 0.3, chiefUp: 0.3, ko: 0.4, lose: 0.3 };
// loudness trim per sound, so a troop's shot sits under a castle falling (measured with tools/art_sfx_check.mjs)
const LEVEL = { shot_fire: 0.28, shot_bomb: 0.22, shot_grenade: 0.32, shot_claw: 0.7, shot_gust: 0.6, shot_ball: 0.8, shot_bullet: 1.7, shot_ray: 1.7, shot_laser: 1.7, shot_skull: 1.5, shot_wisp: 1.4, shot_arrow: 1.2, hit: 2, send: 1.8, click: 1.3, chiefUp: 1.8, lose: 1.6, die: 0.6, build: 0.6, fire: 0.7, tick: 1.4 };
// projectiles that share the sound of a near relative
const ALIAS = { shot_tracer: 'shot_bullet', shot_shotball: 'shot_bullet', shot_rivet: 'shot_bullet', shot_ring: 'shot_ray', shot_dart: 'shot_ray', shot_javelin: 'shot_arrow', shot_screech: 'shot_claw', shot_spike: 'shot_rock', shot_coconut: 'shot_rock', shot_wail: 'shot_skull', shot_magma: 'shot_fire', shot_orb: 'shot_acid', shot_shell: 'shot_ball', shot_keg: 'shot_bomb' };
const WORLD_W = 1300;

export function unlockAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 16; comp.ratio.value = 4.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const lim = actx.createDynamicsCompressor();                              // a limiter: nothing gets past it loud enough to clip
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    out = actx.createGain(); out.gain.value = 2.2;
    const post = actx.createGain(); post.gain.value = 0.72;
    out.connect(comp).connect(lim).connect(post).connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a small open-air room: 1.1 s of noise dying away, darker as it goes
    const len = Math.floor(actx.sampleRate * 1.1), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const k = i / len; lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.45 * k); b[i] = lp * Math.pow(1 - k, 2.6) * (i < 300 ? i / 300 : 1); } }
    const conv = actx.createConvolver(); conv.buffer = ir;
    wet = actx.createGain(); wet.gain.value = 0.9; wet.connect(conv).connect(out);
  } catch { actx = null; }
}

const vary = (amt = 0.06) => 1 + (Math.random() * 2 - 1) * amt;
const pick = (...takes) => takes[Math.floor(Math.random() * takes.length)];
const env = (v, t, dur, vol, a = 0.006) => { v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(a, dur * 0.5)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
/** One oscillator note: freq sliding to freq*slide over dur, starting `at` seconds from now. */
function tone(freq, dur, type = 'triangle', vol = 0.12, slide = 0, at = 0, attack = 0.006) {
  const t = actx.currentTime + at, o = actx.createOscillator(), v = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  env(v, t, dur, vol, attack);
  o.connect(v).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
/** A burst of filtered noise: thuds (lowpass), cracks and whooshes (bandpass), hiss (highpass). */
function noise(dur, vol = 0.2, type = 'lowpass', f0 = 800, f1 = 0, q = 0.8, at = 0, attack = 0.008) {
  const t = actx.currentTime + at, n = actx.createBufferSource(), f = actx.createBiquadFilter(), v = actx.createGain();
  n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = vary(0.1);
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  env(v, t, dur, vol, attack);
  n.connect(f).connect(v).connect(bus); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
}
/** FM pair: a carrier bent by a modulator. Metal, bells, glass and lasers (ratio sets the timbre, index how harsh). */
function fm(freq, ratio, index, dur, vol = 0.1, at = 0, slide = 0, type = 'sine') {
  const t = actx.currentTime + at, c = actx.createOscillator(), m = actx.createOscillator(), mg = actx.createGain(), v = actx.createGain();
  c.type = type; c.frequency.setValueAtTime(freq, t); m.frequency.setValueAtTime(freq * ratio, t);
  if (slide) { c.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur); m.frequency.exponentialRampToValueAtTime(Math.max(30, freq * ratio * slide), t + dur); }
  mg.gain.setValueAtTime(freq * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * index * 0.08), t + dur);   // bright at the strike, purer as it rings
  env(v, t, dur, vol, 0.003);
  m.connect(mg).connect(c.frequency); c.connect(v).connect(bus); c.start(t); m.start(t); c.stop(t + dur + 0.02); m.stop(t + dur + 0.02);
}
/** A drum-like thump: a sine that drops fast in pitch. The weight under hits and blasts. */
const thump = (freq, dur, vol = 0.3, at = 0) => tone(freq * 2.2, dur, 'sine', vol, 0.22, at, 0.003);
/** The click of contact: a few milliseconds of bright noise. */
const snap = (vol = 0.2, f = 3500, at = 0) => noise(0.022, vol, 'highpass', f, 0, 0.7, at, 0.001);
/** A cartoon voice: a buzzy note through a mouth-shaped filter that opens or closes (yelps, grunts, cheers). */
function voice(freq, dur, vol = 0.08, slide = 1, f0 = 900, f1 = 1600, at = 0) {
  const t = actx.currentTime + at, o = actx.createOscillator(), f = actx.createBiquadFilter(), v = actx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(v, t, dur, vol * 2.2, 0.012);
  o.connect(f).connect(v).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
/** Bits falling: n small knocks scattered over `span` seconds. */
function debris(n, span, f = 300, vol = 0.07, at = 0) { for (let i = 0; i < n; i++) { const a = at + Math.random() * span; tone((f + Math.random() * f) * vary(0.2), 0.045, 'triangle', vol * (1 - (a - at) / (span + 0.3)), 0.6, a); if (i % 2) noise(0.03, vol * 0.8, 'bandpass', 1200 + Math.random() * 1800, 0, 3, a); } }
/** A rush of air past the ear, rising or falling. */
const whoosh = (dur, vol, f0, f1, at = 0, q = 1.1) => noise(dur, vol, 'bandpass', f0, f1, q, at, dur * 0.35);

const RECIPES = {
  click() { snap(0.1, 4000); tone(760 * vary(0.03), 0.045, 'square', 0.07); tone(1140, 0.05, 'triangle', 0.07, 0, 0.018); },
  // the slingshot: rubber creaking as it lets go, a twang, the whoosh of the shot, the fork shuddering
  fire() { const p = vary(); tone(140 * p, 0.09, 'sawtooth', 0.07, 2.6); fm(190 * p, 2.01, 3, 0.28, 0.13, 0.03, 0.55); whoosh(0.3, 0.2, 500 * p, 2800 * p, 0.04); thump(60 * p, 0.16, 0.18, 0.05); tone(95 * p, 0.3, 'triangle', 0.05, 0.9, 0.1); snap(0.08, 2500, 0.03); },
  // a stone landing: crack of contact, a heavy thud, grit scattering
  impact() { const p = vary(0.1); snap(0.2, 2800); thump(70 * p, 0.24, 0.4); noise(0.14, 0.26, 'lowpass', 1500 * p, 260); pick(() => debris(4, 0.2, 420, 0.05, 0.04), () => noise(0.2, 0.1, 'bandpass', 2600, 700, 1.4, 0.03))(); },
  // a wall or building giving way: crack, splintering, a crumble, bits falling
  block() { const p = vary(0.1); snap(0.24, 2200); noise(0.08, 0.28, 'bandpass', 1900 * p, 650, 1.5); fm(210 * p, 1.41, 4, 0.2, 0.08, 0, 0.5); thump(75 * p, 0.2, 0.26, 0.02); noise(0.4, 0.16, 'lowpass', 900 * p, 170, 0.7, 0.05); debris(6, 0.35, 280, 0.07, 0.08); },
  // a chief taking a hit: armour clank, a yelp, a body thump
  king() { const p = vary(0.05); snap(0.16, 3000); fm(480 * p, 2.7, 3, 0.12, 0.07); voice(430 * p, 0.2, 0.09, 0.6, 1500, 700, 0.04); thump(60, 0.22, 0.26); noise(0.1, 0.12, 'lowpass', 1000, 300); },
  // force field: a glassy ping, a second partial beating against it, a shimmer running off
  shield() { const p = vary(0.04); fm(1250 * p, 1.5, 1.2, 0.4, 0.09, 0, 0.9); fm(1266 * p, 2.01, 0.6, 0.34, 0.05, 0.01); tone(625 * p, 0.18, 'triangle', 0.06, 1.12); whoosh(0.3, 0.06, 5200, 9000, 0.02, 2); snap(0.08, 6000); },
  // the castle shrugging off a shot while its chief stands: a dull clang and a magic ring
  guarded() { const p = vary(0.05); snap(0.18, 2600); fm(330 * p, 3.52, 2.4, 0.3, 0.12, 0, 0.97); fm(990 * p, 1.5, 1, 0.5, 0.05, 0.02, 0.99); thump(80, 0.14, 0.16); },
  // the castle taking real damage: masonry cracking, a deep knock, stones dropping
  fortHit() { const p = vary(0.08); snap(0.22, 2000); noise(0.1, 0.3, 'bandpass', 1300 * p, 500, 1.3); thump(55 * p, 0.3, 0.42); noise(0.36, 0.14, 'lowpass', 700, 150, 0.7, 0.05); debris(5, 0.4, 220, 0.07, 0.1); },
  // the castle coming down: a long groan, three collapsing waves, rubble raining, dust
  fortDown() { const p = vary(0.05); tone(70 * p, 0.7, 'sawtooth', 0.09, 0.55); for (let i = 0; i < 3; i++) { thump(52 - i * 6, 0.5, 0.42, 0.12 + i * 0.26); noise(0.5, 0.3, 'lowpass', 1900 - i * 400, 110, 0.6, 0.12 + i * 0.26); snap(0.2, 1800, 0.12 + i * 0.26); } debris(16, 1.2, 200, 0.08, 0.2); whoosh(1.1, 0.1, 900, 250, 0.5, 0.6); },
  // building: saw and hammer, then a bright "done" tick
  build() { const p = vary(0.05); noise(0.05, 0.2, 'bandpass', 900 * p, 0, 3); thump(140 * p, 0.07, 0.14); noise(0.05, 0.2, 'bandpass', 1250 * p, 0, 3, 0.09); thump(160 * p, 0.07, 0.14, 0.09); fm(780 * p, 2, 1.2, 0.16, 0.06, 0.17); },
  // troops marching out: a drum hit, boots, a short horn
  send() { const p = vary(0.05); thump(95 * p, 0.14, 0.26); snap(0.1, 2400); for (let i = 0; i < 3; i++) noise(0.04, 0.12, 'bandpass', 700 + i * 90, 0, 2.5, 0.07 + i * 0.07); voice(294 * p, 0.2, 0.05, 1.5, 700, 1300, 0.04); tone(440 * p, 0.14, 'square', 0.025, 0, 0.12); },
  // explosion: flash crack, sub drop, roar, a second slap off the hills, rubble
  boom() { const p = vary(0.08); snap(0.3, 1800); thump(55 * p, 0.6, 0.42); noise(0.55, 0.34, 'lowpass', 2300 * p, 110, 0.6); noise(0.1, 0.22, 'highpass', 2400); noise(0.5, 0.1, 'bandpass', 600, 200, 0.8, 0.22); thump(48, 0.3, 0.14, 0.26); debris(6, 0.5, 260, 0.05, 0.2); },
  // a bonus caught: a coin flick, a rising arpeggio of bells, a shimmer
  bonus() { snap(0.1, 5000); [660, 880, 1320, 1760].forEach((f, i) => { fm(f, 2.01, 0.9, 0.22, 0.07, i * 0.065); tone(f * 2, 0.1, 'sine', 0.025, 0, i * 0.065); }); whoosh(0.4, 0.05, 6000, 10000, 0.1, 1.5); },
  // gold: two coins chinking
  coin() { const p = vary(0.08); fm(2100 * p, 1.48, 1.4, 0.16, 0.06); fm(2800 * p, 1.48, 1.2, 0.2, 0.05, 0.055); snap(0.06, 6000); },
  // a healer's spell: a soft rising chord with a breath
  heal() { const p = vary(0.03); [523, 659, 784].forEach((f, i) => tone(f * p, 0.35, 'sine', 0.045, 1.02, i * 0.05, 0.05)); whoosh(0.35, 0.05, 2500, 6000, 0, 1.5); },
  // match won: drum roll into a fanfare, a held chord, the crowd
  win() { for (let i = 0; i < 6; i++) noise(0.04, 0.1, 'bandpass', 420, 0, 2, i * 0.045); [523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.22, 'square', 0.014, 0, 0.3 + i * 0.13); fm(f / 2, 2, 1.5, 0.24, 0.02, 0.3 + i * 0.13); }); [523, 659, 784, 1046].forEach((f) => tone(f, 0.9, 'triangle', 0.008, 0, 0.86)); for (let i = 0; i < 5; i++) voice(300 + Math.random() * 260, 0.5, 0.012, 1.25, 800, 1500, 0.9 + Math.random() * 0.2); whoosh(0.9, 0.04, 2500, 5000, 0.86, 0.5); thump(60, 0.3, 0.2, 0.86); },
  // sudden death: war drums under two horn blasts
  sudden() { for (const at of [0, 0.36]) { voice(196, 0.32, 0.07, 0.97, 500, 900, at); tone(98, 0.3, 'square', 0.06, 0.96, at); tone(294, 0.3, 'sawtooth', 0.035, 0.96, at); thump(50, 0.25, 0.3, at); } thump(46, 0.3, 0.26, 0.18); noise(0.8, 0.05, 'lowpass', 500, 200, 0.7); },
  // a new tier of the battle: a rising three-drum roll and a bright brass stab
  tier() { [0, 0.11, 0.22].forEach((at, i) => thump(70 + i * 14, 0.16, 0.26, at)); [392, 494, 587].forEach((f) => { voice(f, 0.4, 0.035, 1.01, 900, 1700, 0.3); tone(f * 2, 0.4, 'triangle', 0.012, 0, 0.3); }); whoosh(0.3, 0.08, 800, 4000, 0.05); },
  // an ultimate going off: a charge winding up, a thunderous release, the air ringing
  ult() { const p = vary(0.03); whoosh(0.45, 0.14, 300, 5000, 0, 1.6); fm(110 * p, 1.5, 6, 0.45, 0.07, 0, 3.2); snap(0.3, 1500, 0.45); thump(45, 0.8, 0.45, 0.45); noise(0.7, 0.3, 'lowpass', 2600, 100, 0.6, 0.45); fm(660 * p, 2.76, 2, 0.9, 0.05, 0.47, 0.98); debris(6, 0.6, 240, 0.05, 0.6); },
  // ---- each race's own ultimate (falls back to `ult` for a race without one) ----
  // Dwarven Mortars: three hollow tube thumps, whistles falling, a rolling string of blasts
  ult_fantasy() { for (let i = 0; i < 3; i++) { thump(85, 0.16, 0.34, i * 0.14); fm(180, 1.41, 3, 0.14, 0.06, i * 0.14, 0.6); snap(0.2, 1800, i * 0.14); } for (let i = 0; i < 3; i++) tone(1700 - i * 150, 0.5, 'sine', 0.035, 0.35, 0.45 + i * 0.12); for (let i = 0; i < 4; i++) { thump(48, 0.45, 0.4, 0.95 + i * 0.17); noise(0.4, 0.26, 'lowpass', 2000, 120, 0.6, 0.95 + i * 0.17); } debris(6, 0.6, 260, 0.05, 1.1); },
  // Orbital Ray: a rising charge whine, a held chord of light, a bass drop as it lands
  ult_aliens() { const p = vary(0.03); fm(220 * p, 2.01, 5, 0.8, 0.07, 0, 5); tone(440 * p, 0.8, 'sawtooth', 0.02, 4.2); whoosh(0.8, 0.1, 600, 7000, 0, 2); fm(1320 * p, 1.5, 3, 0.9, 0.07, 0.8, 0.5); fm(1980 * p, 0.5, 2, 0.8, 0.04, 0.8, 0.55); snap(0.3, 2500, 0.8); thump(42, 0.9, 0.45, 0.8); noise(0.7, 0.22, 'lowpass', 3000, 150, 0.6, 0.8); },
  // EMP Wave: a capacitor whine, a hard electric crack, a buzzing wall rolling away, lights popping
  ult_robots() { const p = vary(0.03); fm(300 * p, 3.01, 4, 0.4, 0.06, 0, 3.5); snap(0.34, 3000, 0.4); for (let i = 0; i < 10; i++) noise(0.035, 0.2, 'bandpass', 2200 + Math.random() * 3500, 0, 5, 0.4 + i * 0.05); fm(90 * p, 7.1, 7, 0.9, 0.09, 0.4, 0.6); tone(55, 0.9, 'square', 0.05, 0.8, 0.4); whoosh(0.9, 0.14, 4000, 500, 0.4, 1.5); thump(55, 0.5, 0.36, 0.4); for (let i = 0; i < 4; i++) fm(2400 + i * 300, 2.3, 1, 0.08, 0.03, 0.8 + i * 0.1); },
  // Stampede: a bellow, then hooves building to a thunder, snorts, the ground shaking
  ult_monsters() { voice(110, 0.5, 0.11, 0.75, 400, 800); voice(165, 0.45, 0.05, 0.8, 500, 900, 0.03); for (let i = 0; i < 16; i++) { const at = 0.3 + i * 0.075 - i * i * 0.0012; thump(70 + (i % 3) * 14, 0.11, 0.16 + i * 0.012, at); if (i % 2) noise(0.04, 0.1, 'bandpass', 600, 0, 2, at + 0.02); } noise(1.3, 0.12, 'lowpass', 400, 150, 0.6, 0.3); voice(140, 0.2, 0.06, 0.7, 500, 900, 0.9); thump(44, 0.6, 0.36, 1.35); },
  // Airstrike: propellers droning past, falling whistles, a line of bombs
  ult_military() { tone(92, 1.1, 'sawtooth', 0.06, 1.25); tone(138, 1.1, 'square', 0.025, 1.25); noise(1.1, 0.07, 'bandpass', 300, 700, 1.5, 0, 0.4); for (let i = 0; i < 3; i++) tone(1900 - i * 200, 0.55, 'sine', 0.04, 0.3, 0.5 + i * 0.15); for (let i = 0; i < 4; i++) { snap(0.26, 1700, 1.05 + i * 0.16); thump(46, 0.5, 0.42, 1.05 + i * 0.16); noise(0.45, 0.28, 'lowpass', 2200, 110, 0.6, 1.05 + i * 0.16); } debris(6, 0.6, 260, 0.05, 1.3); },
  // Army of the Dead: a low choir sliding up, a bell, earth cracking, bones rattling
  ult_undead() { [98, 147, 196].forEach((f, i) => voice(f, 1.2, 0.07 - i * 0.015, 1.5, 400, 1100, i * 0.05)); fm(196, 3.5, 3, 1.4, 0.08, 0.1, 0.99); fm(392, 2.76, 2, 1.2, 0.03, 0.12); noise(0.5, 0.18, 'lowpass', 600, 150, 0.7, 0.5); thump(45, 0.5, 0.3, 0.5); for (let i = 0; i < 12; i++) { const at = 0.7 + Math.random() * 0.7; tone(700 + Math.random() * 900, 0.035, 'square', 0.03, 0.8, at); } whoosh(1, 0.08, 500, 2200, 0.2, 3); },
  // Broadside: "fire!", then cannons going off down the line with their echoes
  ult_pirates() { voice(260, 0.18, 0.08, 1.4, 700, 1500); for (let i = 0; i < 6; i++) { const at = 0.25 + i * 0.12 + Math.random() * 0.03; snap(0.28, 1500, at); thump(58 - i * 2, 0.36, 0.4, at); noise(0.34, 0.28, 'lowpass', 1800, 130, 0.6, at); } noise(1, 0.08, 'bandpass', 500, 200, 0.8, 0.5); for (let i = 0; i < 3; i++) thump(44, 0.4, 0.3, 1.15 + i * 0.16); debris(5, 0.6, 300, 0.05, 1.2); },
  // Wildfire: a deep breath in, a roaring front rushing past, crackle and a hiss left behind
  ult_elementals() { whoosh(0.3, 0.12, 3000, 400, 0, 1); whoosh(1.3, 0.3, 250, 2200, 0.25, 0.7); noise(1.3, 0.2, 'lowpass', 600, 220, 0.7, 0.25, 0.3); tone(60, 1.3, 'sawtooth', 0.09, 1.6, 0.25); tone(90, 1.2, 'sawtooth', 0.04, 1.5, 0.3); for (let i = 0; i < 14; i++) snap(0.06, 2600 + Math.random() * 1500, 0.4 + Math.random() * 1.1); noise(0.6, 0.06, 'highpass', 4000, 7000, 0.7, 1.3); },
  // War Band: a long war horn swelling, drums coming in under it, a shout
  ult_beastfolk() { voice(147, 1.2, 0.11, 1.02, 450, 800); tone(147, 1.2, 'sawtooth', 0.035, 1.02, 0, 0.25); tone(220.5, 1.1, 'triangle', 0.025, 1.02, 0.1, 0.2); [0.35, 0.6, 0.85, 0.97, 1.1, 1.22].forEach((at, i) => { thump(62 + (i % 2) * 10, 0.2, 0.3, at); noise(0.05, 0.1, 'bandpass', 500, 0, 2, at); }); for (let i = 0; i < 4; i++) voice(220 + Math.random() * 120, 0.3, 0.03, 1.3, 800, 1500, 1.25 + Math.random() * 0.1); },
  // Tesla Cannon: gears winding, a rising coil hum, the bolt cracking down, steam venting
  ult_steampunk() { for (let i = 0; i < 6; i++) fm(500 + i * 60, 3.5, 2, 0.05, 0.05, i * 0.07 - i * i * 0.004); fm(110, 2, 6, 0.75, 0.07, 0, 4); tone(220, 0.75, 'sawtooth', 0.02, 3.6); snap(0.36, 2800, 0.78); for (let i = 0; i < 8; i++) noise(0.03, 0.24, 'bandpass', 2400 + Math.random() * 3500, 0, 5, 0.78 + i * 0.03); fm(80, 7.1, 8, 0.5, 0.1, 0.78, 0.7); thump(44, 0.8, 0.45, 0.78); noise(0.9, 0.16, 'highpass', 2500, 5500, 0.7, 0.95, 0.1); },
  // a troop going down: a squeak dropping away, a body thud, a puff
  die() { const p = vary(0.14); pick(() => voice(620 * p, 0.16, 0.06, 0.4, 1800, 600), () => voice(480 * p, 0.14, 0.06, 0.5, 1400, 500))(); thump(90 * p, 0.12, 0.14, 0.06); noise(0.16, 0.08, 'lowpass', 1200, 300, 0.7, 0.05); },
  // a flyer shot out of the sky: an engine cough, a falling whistle, the crunch
  flyerDown() { const p = vary(0.06); snap(0.14, 2600); tone(1500 * p, 0.44, 'sine', 0.08, 0.2); fm(900 * p, 1.01, 3, 0.44, 0.03, 0.02, 0.2); whoosh(0.42, 0.07, 2600, 500, 0, 2); thump(60, 0.22, 0.26, 0.42); noise(0.18, 0.24, 'lowpass', 1500, 250, 0.7, 0.42); debris(3, 0.2, 320, 0.05, 0.46); },
  // round start: a drum pickup and a three-note call landing on a chord
  roundStart() { thump(80, 0.1, 0.2); thump(80, 0.1, 0.2, 0.09); [392, 523, 659].forEach((f, i) => { voice(f, 0.13, 0.04, 1, 800, 1500, 0.16 + i * 0.09); tone(f / 2, 0.14, 'triangle', 0.05, 0, 0.16 + i * 0.09); }); [784, 988, 1175].forEach((f) => tone(f, 0.5, 'triangle', 0.025, 0, 0.45)); whoosh(0.3, 0.05, 4000, 7000, 0.45, 0.8); thump(60, 0.25, 0.22, 0.45); },
  // countdown tick: a dry woodblock
  tick() { tone(880, 0.06, 'square', 0.12, 0.8); noise(0.03, 0.28, 'bandpass', 1800, 0, 4); },
  // the last hit of a round, in slow motion: a huge slowed-down blow and a long ring
  ko() { snap(0.3, 1400); thump(40, 1.1, 0.5); noise(0.9, 0.3, 'lowpass', 1800, 70, 0.6); fm(220, 2.76, 3, 1.4, 0.06, 0.02, 0.6); whoosh(0.9, 0.08, 3000, 200, 0.05, 0.7); },
  // a chief knocked down: a dizzy slide whistle, a heavy fall, little stars
  chiefDown() { const p = vary(0.04); tone(900 * p, 0.45, 'sine', 0.07, 0.3); thump(55, 0.3, 0.36, 0.42); noise(0.2, 0.2, 'lowpass', 1100, 200, 0.7, 0.42); [1568, 1976, 2349].forEach((f, i) => fm(f, 2.01, 0.8, 0.2, 0.03, 0.55 + i * 0.09)); },
  // a chief back on his feet: a grunt, a rising whoosh, a proud two-note call
  chiefUp() { const p = vary(0.04); voice(180 * p, 0.16, 0.07, 1.4, 500, 1100); whoosh(0.3, 0.1, 500, 3500, 0.05); [392, 587].forEach((f, i) => { voice(f * p, 0.2, 0.04, 1, 900, 1600, 0.25 + i * 0.12); tone(f * p, 0.2, 'triangle', 0.02, 0, 0.25 + i * 0.12); }); },
  // troops of the beaten side: a falling three-note sigh
  lose() { [392, 349, 262].forEach((f, i) => { voice(f, 0.3, 0.045, 0.94, 900, 600, i * 0.22); tone(f / 2, 0.3, 'triangle', 0.03, 0.94, i * 0.22); }); },
  // ---- troop hits ----
  // a blade or claw landing on a troop
  slash() { const p = vary(0.12); whoosh(0.07, 0.16, 1800 * p, 6000 * p, 0, 2); snap(0.12, 3800, 0.05); fm(1700 * p, 2.3, 1.5, 0.09, 0.03, 0.05); },
  // a blunt blow landing on a troop: a meaty thump with a slap on top
  hit() { const p = vary(0.14); pick(() => { snap(0.14, 2200); thump(110 * p, 0.1, 0.2); noise(0.06, 0.14, 'lowpass', 1300 * p, 400); }, () => { snap(0.1, 3000); thump(140 * p, 0.08, 0.17); noise(0.05, 0.12, 'bandpass', 900 * p, 0, 2); })(); },
  // ---- troop weapons: what each kind of shot sounds like as it leaves ----
  shot_arrow() { const p = vary(0.08); fm(240 * p, 2.02, 2.5, 0.12, 0.09, 0, 0.7); whoosh(0.16, 0.12, 2200 * p, 5200 * p, 0.02, 2.5); snap(0.06, 5000); },
  shot_bullet() { const p = vary(0.1); snap(0.28, 2400); noise(0.07, 0.26, 'bandpass', 1500 * p, 500, 1); thump(120 * p, 0.07, 0.16); noise(0.16, 0.05, 'highpass', 3000, 6000, 0.7, 0.03); },
  shot_ball() { const p = vary(0.07); snap(0.3, 1500); thump(60 * p, 0.34, 0.42); noise(0.34, 0.3, 'lowpass', 1700 * p, 130, 0.6); whoosh(0.3, 0.07, 900, 300, 0.08, 0.8); fm(140 * p, 1.41, 3, 0.2, 0.05, 0.02, 0.6); },
  shot_rock() { const p = vary(0.1); voice(150 * p, 0.12, 0.06, 1.5, 500, 1000); whoosh(0.24, 0.16, 500 * p, 1700 * p, 0.05, 1.2); thump(85, 0.1, 0.1, 0.02); },
  shot_grenade() { const p = vary(0.08); fm(1400 * p, 2.4, 1.5, 0.05, 0.05); snap(0.08, 4000, 0.03); whoosh(0.26, 0.14, 600 * p, 2000 * p, 0.05, 1.3); thump(70, 0.25, 0.3, 0.3); noise(0.25, 0.22, 'lowpass', 1800, 180, 0.6, 0.3); },
  shot_fire() { const p = vary(0.08); whoosh(0.34, 0.22, 350 * p, 1500 * p, 0, 0.8); noise(0.3, 0.12, 'lowpass', 900, 300, 0.7, 0.03); tone(90 * p, 0.3, 'sawtooth', 0.06, 1.5); for (let i = 0; i < 3; i++) snap(0.05, 3000, 0.08 + i * 0.06); },
  shot_gfire() { const p = vary(0.08); whoosh(0.36, 0.2, 500 * p, 1900 * p, 0, 1); voice(140 * p, 0.34, 0.05, 1.6, 600, 1500); fm(520 * p, 1.5, 2, 0.3, 0.03, 0.02, 1.3); },
  shot_ray() { const p = vary(0.06); fm(1900 * p, 0.5, 2, 0.2, 0.08, 0, 0.2); tone(2600 * p, 0.16, 'sine', 0.05, 0.25); tone(640 * p, 0.1, 'square', 0.03, 1.7, 0.015); snap(0.05, 6000); },
  shot_laser() { const p = vary(0.04); fm(880 * p, 3.01, 4, 0.26, 0.07, 0, 0.9); tone(1760 * p, 0.26, 'sawtooth', 0.03, 0.96); noise(0.24, 0.07, 'bandpass', 4200, 5200, 6); snap(0.08, 5000); },
  shot_zap() { const p = vary(0.08); for (let i = 0; i < 5; i++) noise(0.03, 0.22, 'bandpass', 2400 + Math.random() * 3000, 0, 5, i * 0.03); fm(110 * p, 7.1, 5, 0.2, 0.07); snap(0.2, 3500); thump(70, 0.12, 0.14, 0.02); },
  shot_acid() { const p = vary(0.1); voice(260 * p, 0.12, 0.06, 0.5, 1400, 500); noise(0.14, 0.16, 'bandpass', 900 * p, 2400 * p, 3, 0.03); for (let i = 0; i < 3; i++) tone((700 + Math.random() * 500) * p, 0.05, 'sine', 0.04, 1.8, 0.1 + i * 0.05); },
  shot_web() { const p = vary(0.1); noise(0.12, 0.16, 'bandpass', 2600 * p, 900, 4); tone(900 * p, 0.14, 'sine', 0.05, 0.35); snap(0.06, 4500, 0.1); },
  shot_skull() { const p = vary(0.06); voice(240 * p, 0.36, 0.07, 1.8, 500, 1300); fm(392 * p, 1.5, 1.5, 0.36, 0.03, 0.03, 1.5); whoosh(0.36, 0.08, 700, 2400, 0, 3); },
  shot_ice() { const p = vary(0.06); fm(2400 * p, 1.48, 1.6, 0.2, 0.06); fm(3200 * p, 2.3, 1, 0.16, 0.04, 0.03); whoosh(0.16, 0.08, 4000, 8000, 0, 2); snap(0.08, 6500); },
  shot_gust() { const p = vary(0.1); whoosh(0.4, 0.22, 400 * p, 2400 * p, 0, 0.7); whoosh(0.3, 0.08, 2500, 5000, 0.08, 1.5); },
  shot_claw() { const p = vary(0.12); pick(() => { for (let i = 0; i < 3; i++) whoosh(0.06, 0.16, (3200 - i * 500) * p, 900, i * 0.035, 2); }, () => { voice(700 * p, 0.08, 0.06, 0.6, 2000, 900); whoosh(0.08, 0.16, 2400 * p, 700, 0.02, 2); })(); snap(0.1, 3500, 0.07); },
  shot_wisp() { const p = vary(0.06); fm(700 * p, 1.5, 1.2, 0.3, 0.06, 0, 1.6); tone(1400 * p, 0.2, 'sine', 0.03, 1.4, 0.04); whoosh(0.3, 0.06, 1500, 4500, 0, 2); },
  shot_bomb() { const p = vary(0.06); tone(1500 * p, 0.3, 'sine', 0.06, 0.4); whoosh(0.3, 0.08, 2600, 700, 0, 2); for (let i = 0; i < 4; i++) snap(0.04, 5000, i * 0.05); },
  // ---- each chief's own strike ----
  // dwarf warhammer: the swing, a heavy clang, the ground jumping
  strike_fantasy() { whoosh(0.1, 0.12, 400, 1500); snap(0.22, 2200, 0.09); thump(50, 0.34, 0.4, 0.09); fm(660, 2.76, 3, 0.4, 0.07, 0.09, 0.98); fm(990, 1.41, 2, 0.3, 0.04, 0.1); noise(0.18, 0.2, 'lowpass', 900, 200, 0.7, 0.09); debris(3, 0.25, 300, 0.05, 0.15); },
  // ray gun: a charge chirp, a falling "pew", a ring in the air
  strike_aliens() { const p = vary(0.05); tone(500 * p, 0.05, 'square', 0.04, 2.5); fm(1900 * p, 0.5, 3, 0.26, 0.08, 0.04, 0.16); tone(2400 * p, 0.22, 'sine', 0.06, 0.25, 0.04); fm(3100 * p, 1.5, 1, 0.3, 0.02, 0.08); snap(0.08, 6000, 0.04); },
  // tesla prod: crackles, a mains buzz, a pop
  strike_robots() { for (let i = 0; i < 6; i++) noise(0.03, 0.2, 'bandpass', 2600 + Math.random() * 2800, 0, 5, i * 0.035); fm(110, 7.1, 6, 0.26, 0.08); tone(55, 0.26, 'square', 0.06); snap(0.22, 3000); thump(70, 0.14, 0.16, 0.2); },
  // claws: three rips, a growl, a thud
  strike_monsters() { for (let i = 0; i < 3; i++) whoosh(0.07, 0.2, 3200 - i * 500, 900, i * 0.045, 2); voice(95 * vary(0.1), 0.32, 0.12, 0.7, 400, 900); thump(70, 0.16, 0.2, 0.12); snap(0.14, 3200, 0.1); },
  // bazooka: a hollow thoomp, the rocket hissing away, the bang with its echo
  strike_military() { thump(75, 0.14, 0.32); snap(0.16, 2000); whoosh(0.26, 0.12, 1600, 3600, 0.03, 1.2); snap(0.28, 1600, 0.28); thump(50, 0.4, 0.4, 0.28); noise(0.36, 0.3, 'lowpass', 2100, 140, 0.6, 0.28); debris(4, 0.3, 280, 0.05, 0.36); },
  // ghost fire: a hollow moan climbing, a second voice a fifth above, a cold breath
  strike_undead() { const p = vary(0.05); voice(260 * p, 0.44, 0.1, 1.9, 500, 1400); voice(392 * p, 0.4, 0.04, 1.5, 700, 1700, 0.04); fm(520 * p, 1.5, 1.5, 0.4, 0.03, 0.03, 1.6); whoosh(0.44, 0.09, 700, 2400, 0, 3); },
  // cutlass: the swish, steel ringing, a grunt
  strike_pirates() { const p = vary(0.06); whoosh(0.14, 0.24, 1200 * p, 5600 * p, 0, 1.6); fm(2100 * p, 1.41, 2, 0.36, 0.06, 0.08, 0.99); fm(3150 * p, 2.76, 1, 0.26, 0.03, 0.08); snap(0.14, 4500, 0.08); voice(170 * p, 0.1, 0.05, 1.3, 600, 1100); },
  // fire wave: a breath in, a rushing wall of flame, crackles in its wake
  strike_elementals() { whoosh(0.1, 0.08, 2500, 600); whoosh(0.5, 0.28, 350, 1900, 0.06, 0.8); noise(0.44, 0.14, 'lowpass', 700, 250, 0.7, 0.1); tone(70, 0.44, 'sawtooth', 0.08, 1.4, 0.06); for (let i = 0; i < 5; i++) snap(0.05, 3000, 0.2 + Math.random() * 0.3); },
  // bone axe: a woody crack, a chop, splinters
  strike_beastfolk() { whoosh(0.08, 0.12, 500, 1600); snap(0.24, 1800, 0.07); noise(0.05, 0.3, 'bandpass', 1500, 600, 2, 0.07); fm(170 * vary(0.08), 1.41, 3, 0.2, 0.09, 0.07, 0.5); thump(55, 0.28, 0.34, 0.08); debris(4, 0.25, 500, 0.05, 0.12); },
  // piston fist: a gear clank, the punch, a burst of steam whistling off
  strike_steampunk() { fm(520, 3.5, 3, 0.08, 0.08); snap(0.18, 2600, 0.03); thump(65, 0.18, 0.3, 0.03); noise(0.45, 0.2, 'highpass', 2600, 5400, 0.7, 0.06, 0.05); tone(1900, 0.34, 'sine', 0.022, 1.3, 0.08); fm(260, 2, 2, 0.12, 0.05, 0.03); },
};
export const SOUND_KINDS = Object.keys(RECIPES);

/** Play a sound. x: where it happens in the world (0..1280), so it is heard on that side; leave out for the middle. */
export function sound(kind, x) {
  kind = ALIAS[kind] || kind;
  const r = RECIPES[kind];
  if (!r || !actx || actx.state !== 'running') return false;
  const t = actx.currentTime, fam = kind.startsWith('strike_') ? 'strike' : kind.startsWith('shot_') ? 'shot' : kind.startsWith('ult_') ? 'ult' : kind;
  const gap = GAP[kind] ?? GAP[fam] ?? 0;
  if (t - (last[kind] ?? -1) < gap) return false;       // the same sound twice in one instant is just louder
  if (fam === 'shot' && t - (last.anyShot ?? -1) < 0.03) return false;      // a volley is a few shots, not thirty at once
  last[kind] = t; if (fam === 'shot') last.anyShot = t;
  try {
    // this play's own little bus: placed left to right, with its share sent to the room
    const g = actx.createGain(); g.gain.value = LEVEL[kind] ?? 1; let node = g;
    if (actx.createStereoPanner && x != null && isFinite(x)) { const p = actx.createStereoPanner(); p.pan.value = Math.max(-0.6, Math.min(0.6, ((x / WORLD_W) * 2 - 1) * 0.7)); g.connect(p); node = p; }
    node.connect(out);
    const send = actx.createGain(); send.gain.value = WET[kind] ?? WET[fam] ?? 0.12; node.connect(send).connect(wet);
    bus = g; r(); bus = null;
  } catch { bus = null; return false; }
  return true;
}
