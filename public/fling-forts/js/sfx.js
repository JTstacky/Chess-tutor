// sfx.js — sound (art and game-feel lane, see docs/COORDINATION.md). Recorded sounds, not a synthesiser.
//
// Every sound in the game is a mix of real recordings (wood, stone, metal, cannon, blades, creatures, fire, air),
// built offline by tools/sfx_build.py from CC0 libraries (docs/SOUND-CREDITS.md) into one file, assets/sfx/pack.bin,
// with its index assets/sfx/pack.json: {kind: [[offset, bytes, seconds, gain], ...]}, one entry per take. A sound has
// up to three takes made from different recordings; each play picks a take (never the same twice running), shifts
// its pitch a few percent, places it left to right where it happens, sends a share to a short room reverb, and the
// whole mix goes through a compressor and a limiter.
//
// API: unlockAudio(), sound(kind, x) where x is the world x (0..1280) it happens at, or nothing for the middle.
// Kinds: SOUND_KINDS (filled once the index has loaded). Chiefs: strike_<race>, ult_<race>, chiefDown_<race>. Each race's
// voice: send_<race> (troops sent), die_<race> (a troop beaten); main.js falls back to the plain send / die.
// Troop weapons:
// shot_<type> (the PROJ types in view.js, plus laser and zap). Unknown or not-yet-loaded kinds return false.
let actx = null, out = null, wet = null;
const last = {};                                  // kind -> time last played, to stop pile-ups in one frame
const lastTake = {};                              // kind -> the take played last, so the next one differs
const GAP = { strike: 0.1, shot: 0.055, die: 0.07, flyerDown: 0.1, tick: 0.2, impact: 0.05, block: 0.06, boom: 0.08, king: 0.12, shield: 0.08, build: 0.05, send: 0.06, fire: 0.04, click: 0.03, bonus: 0.15, hit: 0.045, fortHit: 0.08, slash: 0.045, coin: 0.04, heal: 0.1, guarded: 0.06 };
// how much of each sound goes to the room reverb (0 dry .. 0.5 roomy); anything not listed gets 0.1
const WET = { click: 0, tick: 0.02, coin: 0.04, boom: 0.26, fortDown: 0.35, win: 0.3, sudden: 0.3, roundStart: 0.25, tier: 0.28, ult: 0.32, shield: 0.25, guarded: 0.22, bonus: 0.2, strike: 0.18, flyerDown: 0.2, chiefDown: 0.25, chiefUp: 0.25, ko: 0.35, lose: 0.3, fortHit: 0.22 };
// how far a play's pitch may wander (as a share of its pitch); voices and stingers stay put
const VARY = { click: 0.02, tick: 0, coin: 0.05, win: 0, lose: 0, roundStart: 0, tier: 0, sudden: 0, ult: 0.015, die: 0.09, hit: 0.08, slash: 0.07, shot: 0.06, strike: 0.04, fortDown: 0.02 };
// projectiles that share the sound of a near relative
const ALIAS = { shot_tracer: 'shot_bullet', shot_shotball: 'shot_bullet', shot_rivet: 'shot_bullet', shot_ring: 'shot_ray', shot_dart: 'shot_ray', shot_javelin: 'shot_arrow', shot_screech: 'shot_claw', shot_spike: 'shot_rock', shot_coconut: 'shot_rock', shot_wail: 'shot_skull', shot_magma: 'shot_fire', shot_orb: 'shot_acid', shot_shell: 'shot_ball', shot_keg: 'shot_bomb' };
const WORLD_W = 1300;

export const SOUND_KINDS = [];
const TAKES = {};                                  // kind -> [{ buf, gain }]
let index = null, blob = null, fetching = null, decoding = null;

/** Fetch the pack (two requests). Safe to call early: no audio context is needed until the sounds are decoded. */
function fetchPack() {
  return fetching ||= (async () => {
    const at = (f) => new URL(`../assets/sfx/${f}`, import.meta.url);
    const [i, b] = await Promise.all([fetch(at('pack.json')).then((r) => r.json()), fetch(at('pack.bin')).then((r) => r.arrayBuffer())]);
    index = i; blob = b; SOUND_KINDS.length = 0; SOUND_KINDS.push(...Object.keys(i));
  })().catch(() => { fetching = null; });
}
/** Decode every take, the everyday sounds first, a few at a time so a frame never stalls on it. */
function decodePack() {
  return decoding ||= (async () => {
    await fetchPack(); if (!index || !actx) { decoding = null; return; }
    const first = ['click', 'fire', 'impact', 'block', 'hit', 'send', 'coin', 'roundStart', 'tick'];
    const kinds = [...first.filter((k) => index[k]), ...Object.keys(index).filter((k) => !first.includes(k))];
    for (const kind of kinds) {
      const takes = await Promise.all(index[kind].map(async ([off, len, , gain]) => {
        try { return { buf: await new Promise((ok, no) => { const p = actx.decodeAudioData(blob.slice(off, off + len), ok, no); if (p && p.catch) p.catch(no); }), gain: gain ?? 1 }; } catch { return null; }
      }));
      TAKES[kind] = takes.filter(Boolean);
    }
  })();
}
/** Resolves when every sound is ready to play (tools use it; the game just plays what has arrived). */
export const soundsReady = () => decodePack();
if (typeof window !== 'undefined') setTimeout(fetchPack, 1200);       // after the first paint; decoding waits for the first touch

export function unlockAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.2;
    const lim = actx.createDynamicsCompressor();                              // a limiter: nothing gets past it loud enough to clip
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    out = actx.createGain(); out.gain.value = 1.5;
    const post = actx.createGain(); post.gain.value = 0.8;
    out.connect(comp).connect(lim).connect(post).connect(actx.destination);
    // a small open-air room: 1.1 s of noise dying away, darker as it goes
    const len = Math.floor(actx.sampleRate * 1.1), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const k = i / len; lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.45 * k); b[i] = lp * Math.pow(1 - k, 2.6) * (i < 300 ? i / 300 : 1); } }
    const conv = actx.createConvolver(); conv.buffer = ir;
    wet = actx.createGain(); wet.gain.value = 0.8; wet.connect(conv).connect(out);
    decodePack();
  } catch { actx = null; }
}

/** Play a sound. x: where it happens in the world (0..1280), so it is heard on that side; leave out for the middle. */
export function sound(kind, x) {
  kind = ALIAS[kind] || kind;
  const fam = kind.includes('_') ? kind.slice(0, kind.indexOf('_')) : kind;      // strike_<race>, shot_<type>, ult_<race>, and the race voices send_/die_/chiefDown_<race>
  let takes = TAKES[kind];
  if (!takes?.length && fam === 'ult') { kind = 'ult'; takes = TAKES.ult; }       // a race without its own signature
  if (!takes?.length || !actx || actx.state !== 'running') return false;
  const t = actx.currentTime, gap = GAP[kind] ?? GAP[fam] ?? 0;
  if (t - (last[kind] ?? -1) < gap) return 'held';       // the same sound twice in one instant is just louder
  if (fam === 'shot' && t - (last.anyShot ?? -1) < 0.03) return 'held';      // a volley is a few shots, not thirty at once
  if (fam === 'die' && t - (last.anyDie ?? -1) < 0.16) return 'held';        // voices: a blast that beats five troops is one or two cries, not a choir
  if (fam === 'send' && t - (last.anySend ?? -1) < 0.35) return 'held';
  last[kind] = t; if (fam === 'shot') last.anyShot = t; else if (fam === 'die') last.anyDie = t; else if (fam === 'send') last.anySend = t;
  try {
    let n = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && n === lastTake[kind]) n = (n + 1) % takes.length;
    lastTake[kind] = n;
    const take = takes[n], src = actx.createBufferSource(); src.buffer = take.buf;
    const v = VARY[kind] ?? VARY[fam] ?? 0.04; src.playbackRate.value = 1 + (Math.random() * 2 - 1) * v;
    // this play's own little bus: placed left to right, with its share sent to the room
    const g = actx.createGain(); g.gain.value = take.gain * (1 - Math.random() * 0.12); let node = g;
    if (actx.createStereoPanner && x != null && isFinite(x)) { const p = actx.createStereoPanner(); p.pan.value = Math.max(-0.6, Math.min(0.6, ((x / WORLD_W) * 2 - 1) * 0.7)); g.connect(p); node = p; }
    node.connect(out);
    const send = actx.createGain(); send.gain.value = WET[kind] ?? WET[fam] ?? 0.1; node.connect(send).connect(wet);
    src.connect(g); src.start(t);
  } catch { return false; }
  return true;
}
