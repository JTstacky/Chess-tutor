// view.js — sprite loading and all drawing (art and game-feel lane, see docs/COORDINATION.md). Side view: left fort v
// right fort. Layout and touch geometry live in layout.js and are re-exported here for existing imports.
import * as S from './sim.js';
import {hasRotorRig,paintRotorCraft,rotorPhase} from './rotor-animation.js';
import { victoryDance, slingFall } from './celebration.js';
import { MONSTER_FLIGHT, TRACKED_FACING, monsterFacing, attackFacing, DEFENCE_SHOT, drawUltimateStrike, dropBombStyle, ultimatePayload } from './animation-fixes.js';
import { chiefAim, drawChiefAim } from './chief-effects.js';
import { drawCastleSmoke } from './castle-smoke.js';
import { CONTRAST_KINDS, prepareTroopContrast, drawTroopContrast, rotorContrastSource } from './troop-contrast.js';
import { HUD_H, SKY_MIN, PHONE_H, PHONE_BTN, PHONE_GAP, BTN_KEYS, BH, computeLayout, worldToScreen, screenToWorld, buttons, buttonAt, keyFor, PAUSE, PICK, pickHit } from './layout.js';
export { HUD_H, SKY_MIN, PHONE_H, PHONE_BTN, PHONE_GAP, BTN_KEYS, computeLayout, worldToScreen, screenToWorld, buttons, buttonAt, keyFor, PAUSE, PICK, pickHit };

const { W, CELL, FORT, AMMO, BUILD, UNIT, RACES } = S;
export const COLORS = [
  { main: '#e8563a', dark: '#8f2a1b', light: '#ffb199', name: 'Red' },
  { main: '#2f8fd6', dark: '#174a7c', light: '#a8d8ff', name: 'Blue' },
];
const INK = '#3a2412';
const FONT = (px, w = 800) => `${w} ${px}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;

// ---------- sprites ----------
// Sprites load in groups so a phone does not fetch every race before the menu shows: "core" (background, blocks,
// shots, effects, buttons, the first three races) loads at start; each of the ten races loads the first time
// anything of it is drawn (its card in the race picker, or the match starting), all its sprites together.
export const art = { ready: false, img: {}, meta: null, base: 'assets/', groups: {}, groupOf: {}, state: {} };
// chiefs stay in core: the race picker shows all ten of them at once
// a race loads in two steps: its base sheets (group '<race>'), then the in-between animation frames (u2_, king2_:
// group '<race>+') in the background, so a match can start on the base sheets alone. Knockout frames (kingko_) and
// ultimate effects (ultfx_, group 'ult+') are background too: neither can happen in the first seconds of a round
// castle_, fortblk_ and the chief's own sheets (king2_, kingatk_, kingfx_) of a race: group '<race>#', so the menu can draw two
// castles and chiefs without fetching two troop libraries.
// The first three races' old sheets (t_<old unit>, king_/fortblk_ forge, reed, moss) are fallbacks only: group 'legacy',
// fetched the first time something actually asks for one (Codex art review L02/L03)
const LEGACY = /^(t_(netter|caller|spore|slinger|skimmer|anvil|bark|keg|sprout)|(king|fortblk)_(forge|reed|moss))(_|$)/;
const raceGroup = (name) => { if (LEGACY.test(name)) return 'legacy'; const cm = /^(castle|fortblk|king2|kingatk|kingair|kingairfx|kingfx)_([a-z]+)(?:_|$)/.exec(name); if (cm && RACE_DATA_KEYS.has(cm[2])) return cm[2] + '#'; if (name.startsWith('ultfx_')) return 'ult+'; const m = /^(t|u2|w|f|a|h|w2|f2|fortblk|castle|kingatk|kingfx|king2|kingko)_([a-z]+)(?:_|$)/.exec(name); return m && RACE_DATA_KEYS.has(m[2]) ? m[2] + (m[1] === 'u2' || m[1] === 'king2' || m[1] === 'w' || m[1] === 'f' || m[1] === 'a' || m[1] === 'h' || m[1] === 'w2' || m[1] === 'f2' || m[1] === 'kingko' ? '+' : '') : 'core'; };
let RACE_DATA_KEYS = new Set();
let manifestIn; const manifest = new Promise((ok) => { manifestIn = ok; });   // settles once sprites.json is read and every sprite has its group
let PREVIEW = true;
const IMAGE_FILES = new Map(), IMAGE_LOADS = new Map();
function loadSprite(key) {
  const file = IMAGE_FILES.get(key);
  if (!file) return Promise.resolve(null);
  if (!IMAGE_LOADS.has(file)) IMAGE_LOADS.set(file, new Promise((ok) => {
    let tries = 0;
    const go = () => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => { if (++tries > 2) { (art.failed ||= []).push(key); ok(null); } else setTimeout(go, 500 * tries); }; im.src = art.base + file + (tries ? `?r=${tries}` : ''); };
    go();
  }));
  return IMAGE_LOADS.get(file).then((im) => {
    if (im) {
      art.img[key] = im;
      const kind = key.replace(/^(t|u2|w2?|f2?|a|h)_/, '').replace(/_\d+$/, '');
      if (CONTRAST_KINDS.has(kind)) prepareTroopContrast(im);
      if (kind === 'steampunk_gyro') rotorContrastSource(im);
    }
    return im;
  });
}
/** Load one group of sprites; returns a promise that settles when all of them are in (or failed). */
export function loadGroup(name) {
  if (art.state[name]) return art.state[name].done;
  const st = art.state[name] = { ready: false, done: null };
  const castles = RACE_DATA_KEYS.has(name) ? loadGroup(name + '#') : null;   // a race's castles come with its troops
  st.done = manifest.then(() => Promise.all((art.groups[name] || []).map(([key]) => loadSprite(key)))).then(() => { st.ready = true; if (RACE_DATA_KEYS.has(name)) loadGroup(name + '+'); });
  if (castles) st.done = Promise.all([st.done, castles]);
  return st.done;
}
export async function loadArt(base = 'assets/') {
  art.base = base;
  art.meta = await (await fetch(base + 'sprites.json')).json();
  try { art.tips = await (await fetch(base + 'tips.json')).json(); } catch { art.tips = {}; }      // weapon tips of attack pictures (tools/art_tips.py)
  RACE_DATA_KEYS = new Set(S.RACE_KEYS.filter((r) => art.meta[`king_${r}`] && !['forge', 'reed', 'moss'].includes(r)));
  for (const [name, m] of Object.entries(art.meta)) {
    if (m.off) continue;                                          // switched-off in-between sheets: both players check .off first, never fetched
    const grp = raceGroup(name), add = (key, file) => { (art.groups[grp] ||= []).push([key, file]); art.groupOf[key] = grp; IMAGE_FILES.set(key, file); };
    if (m.file) add(name, m.file);
    else m.frames.forEach((f, i) => { add(`${name}_${i}`, f.file); if (f.r) (art.reg ||= {})[`${name}_${i}`] = f.r; });   // r: the frame's own small scale and shift that holds its body steady in its cycle (tools/art_register.py)
  }
  manifestIn();
  await loadGroup('core');
  art.ready = true;
}
/** The loaded image for a key, or null. Asking for a sprite of a race that has not loaded yet starts its load. */
const FULL = new Map();                               // in-between sheet -> did all its frames load
const spr = (key) => {
  // Menu/picker portraits are individual images, never a request for a whole race library.
  // A match explicitly preloads just its two races below; shared fallback references decode once.
  if (PREVIEW) { const im = art.img[key]; if (im) return im; if (IMAGE_FILES.has(key)) loadSprite(key); return null; }
  const grp = art.groupOf[key];
  if (grp && grp.endsWith('+')) {                     // in-between frames: used only once the whole set is in, so a sequence never plays with holes
    if (art.state[grp]?.ready) {
      const sheet = key.replace(/_\d+$/, ''); let ok = FULL.get(sheet);
      if (ok === undefined) { ok = (art.meta[sheet]?.frames || []).every((_, i) => !!art.img[`${sheet}_${i}`]); FULL.set(sheet, ok); }
      return ok ? art.img[key] : null;       // one frame failed to load: the whole sheet stays off and the four base poses play
    }
    if (!art.state[grp.slice(0, -1)]) loadGroup(grp.slice(0, -1));
    return null;
  }
  const im = art.img[key]; if (im) return im; if (grp && !art.state[grp]) loadGroup(grp); return null;
};
/** True while a sprite exists but its race is still loading: draw nothing for a moment instead of a stand-in. */
const coming = (key) => { const grp = art.groupOf[key]; return !!grp && !art.state[grp]?.ready; };
// ---- sprite lookups with fallbacks, so a race plays before its own art has arrived ----
const OLD_KINGS = ['king_forge_0', 'king_reed_0', 'king_moss_0'];
export const unitKey = (kind, frame) => {
  const own = `t_${kind}_${frame}`;
  if (spr(own) || coming(own)) return own;
  // its picture did not arrive: show another of its own poses (the first troops' art stands in only if it has none at
  // all; one lost download used to put a different creature, a bark golem, into the middle of the animation)
  for (const f of [0, 1, 2, 3]) if (f !== frame && art.img[`t_${kind}_${f}`]) return `t_${kind}_${f}`;
  const alt = UNIT[kind].art;
  if (alt && !art.img[`t_${alt}_${frame}`]) for (const f of [0, 1, 2, 3]) if (art.img[`t_${alt}_${f}`]) return `t_${alt}_${f}`;
  return `t_${alt}_${frame}`;
};
export const kingKey = (race) => (spr(`king_${race}_0`) || coming(`king_${race}_0`) ? `king_${race}_0` : OLD_KINGS[S.RACE_KEYS.indexOf(race) % 3]);
const BLK = { wood: 0, stone: 1, iron: 2 };
// The picture of a fling shot. The Explosive (a fused bomb) and the Rolling shot (a spiked stone wheel) have their own on
// the shots2 sheet (tools/art_shots2_manifest.py); the old boulder stands in until that has loaded.
const SHOT_IDX = { stone: 0, scatter: 1, fire: 2, boulder: 3, roll: 3 }, SHOT2 = { roll: 0, boulder: 1 };
const shotKey = (ammo) => (SHOT2[ammo] != null && spr(`shots2_${SHOT2[ammo]}`) ? `shots2_${SHOT2[ammo]}` : `shots_${SHOT_IDX[ammo] ?? 0}`);
// A race's own wall, tower and gold mine (art review A12): sheet fortblk_<race>_b, frames 0 wall, 1 tower, 2 mine, which
// loads with the race's castle. Until it is in (or for a race without one) the shared builds sheet stands in.
const BLD = { wall: 0, tower: 1, mine: 2 };
function buildKey(race, kind) {
  const k = `fortblk_${race}_b_${BLD[kind]}`;
  return spr(k) ? k : kind === 'mine' && !spr('builds_2') ? 'bonus_crate_2' : `builds_${BLD[kind]}`;
}
function blockKey(race, kind, worn) {
  if (kind === 'vault') return spr('builds_3') ? 'builds_3' : 'bonus_crate_3';
  const k = `fortblk_${race}_${BLK[kind] + (worn ? 3 : 0)}`;
  return spr(k) || coming(k) ? k : kind === 'wood' ? (worn ? 'blocks_1' : 'blocks_0') : worn ? 'blocks_3' : 'blocks_2';
}

// ---------- drawing helpers ----------
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
/** Draw a sprite with its bottom-centre at world (x, y), `h` world units tall. flip mirrors it; rot spins about its centre. */
function sprite(g, key, x, y, h, { flip = false, rot = 0, alpha = 1, sx = 1, sy = 1, anchorY = 1, rotor = null, contrast = false } = {}) {
  const im = spr(key);
  if (!im) return false;
  const w = h * im.width / im.height;
  g.save();
  g.translate(x, -y);
  if (rot) { g.translate(0, -h * (anchorY - 0.5)); g.rotate(rot); g.translate(0, h * (anchorY - 0.5)); }
  g.scale((flip ? -1 : 1) * sx, sy);
  if (alpha !== 1) g.globalAlpha *= alpha;
  const ink = contrast && art.contrast !== false;
  const rotorSpr = ink && rotor ? key => { const source = spr(key); return source && rotorContrastSource(source); } : spr;
  if (!rotor || !paintRotorCraft(g,rotor.kind,rotor.now,rotor.id,ink ? rotorContrastSource(im) : im,w,h,anchorY,rotorSpr)) {
    if (ink) drawTroopContrast(g, im, w, h, anchorY);
    else g.drawImage(im, -w / 2, -h * anchorY, w, h);
  }
  g.restore();
  return true;
}
function bar(g, x, y, w, h, frac, col, back = 'rgba(40,24,10,0.75)') {
  rrect(g, x - w / 2, -y - h, w, h, h / 2); g.fillStyle = back; g.fill();
  if (frac > 0) { rrect(g, x - w / 2 + 1.5, -y - h + 1.5, Math.max(h - 3, (w - 3) * Math.min(1, frac)), h - 3, (h - 3) / 2); g.fillStyle = col; g.fill(); }
}
/** Break a sprite into six pieces (a 3 by 2 cut of its picture) flying out from world (x, y). k runs 0..1.
 *  Returns false if the sprite is not loaded. */
function chunks(g, key, x, y, k, seed) {
  const im = spr(key);
  if (!im) return false;
  const cw = im.width / 3, ch = im.height / 2, size = CELL * 0.4;
  for (let i = 0; i < 6; i++) {
    const r1 = Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1, r2 = Math.abs(Math.sin(seed * 39.3468 + i * 11.135)) % 1;
    const a = (i / 6) * Math.PI * 2 + r1 * 0.9, sp = 60 + r2 * 70;
    const dx = Math.cos(a) * sp * k * 1.15, dy = (Math.sin(a) * 0.5 + 0.7) * sp * 1.5 * k - 230 * k * k;
    g.save();
    g.translate(x + dx, -Math.max(4, y + dy));                       // pieces stop at the ground
    g.rotate(a + k * (5 + r2 * 6) * (i % 2 ? 1 : -1));
    g.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    g.drawImage(im, (i % 3) * cw, Math.floor(i / 3) * ch, cw, ch, -size / 2, -size / 2, size, size);
    g.restore();
  }
  return true;
}

function text(g, str, x, y, px, col = '#fff', align = 'center', stroke = INK) {
  g.font = FONT(px); g.textAlign = align; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = Math.max(3, px * 0.22); g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(str, x, -y); }
  g.fillStyle = col; g.fillText(str, x, -y);
}

// ---------- scene ----------
function drawBackdrop(g, lay) {
  const bg = spr('bg');
  g.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  if (bg) {
    // cover the whole canvas; the meadow at the bottom of the picture sits just above the ground line
    const k = Math.max(lay.w / bg.width, (lay.gy + 20) / (bg.height * 0.93));
    const bw = bg.width * k, bh = bg.height * k;
    g.drawImage(bg, (lay.w - bw) / 2, lay.gy + 20 - bh * 0.93, bw, bh);
  } else { const gr = g.createLinearGradient(0, 0, 0, lay.gy); gr.addColorStop(0, '#6ec1f2'); gr.addColorStop(1, '#d9f2c4'); g.fillStyle = gr; g.fillRect(0, 0, lay.w, lay.h); }
  const gd = spr('ground');
  if (gd) {
    const th = Math.max((HUD_H + 40) * lay.s, lay.h - lay.gy + 40 * lay.s), tw = th * gd.width / gd.height, top = lay.gy - th * 0.14;
    for (let x = ((lay.ox % tw) - tw); x < lay.w; x += tw) g.drawImage(gd, x, top, tw + 1, th);
  } else { g.fillStyle = '#6b4a2b'; g.fillRect(0, lay.gy, lay.w, lay.h - lay.gy); }
}

// Each chief has his own attack: his own weapon pose (kingatk_<race>_0) and his own effect picture (kingfx_<race>_0),
// moved in its own way. style: beam and bolt stretch out from the weapon; shot flies out and pops; wave rolls forward
// and grows; ground bursts up from the floor in front; slash pops and twists; arc sweeps a crescent round him; puff
// billows out. len is how far past the weapon's tip the effect reaches (the rules' range follows it: KING_ATK in
// js/tuning.js) and h its height, for a chief CHIEF_H tall; ground effects take their size from len alone.
const KING_FX = {
  fantasy: { style: 'ground', h: 62, len: 58 },      // warhammer: rock shockwave
  aliens: { style: 'beam', h: 34, len: 150 },        // ray gun: green laser
  robots: { style: 'bolt', h: 46, len: 140 },        // tesla prod: lightning
  monsters: { style: 'slash', h: 60, len: 52 },      // claws: three slash marks
  military: { style: 'shot', h: 26, len: 130, burst: 50 },      // bazooka: rocket
  undead: { style: 'shot', h: 46, len: 120, burst: 40, pop: false },   // staff: ghost-fire skull
  pirates: { style: 'arc', h: 78, len: 50 },         // cutlass: crescent slash
  elementals: { style: 'wave', h: 54, len: 120 },    // fire wave
  beastfolk: { style: 'ground', h: 66, len: 62 },    // bone axe: dirt and stones
  steampunk: { style: 'puff', h: 44, len: 60 },      // piston fist: steam blast
};
const KING_FX_T = 0.42;                          // seconds an attack effect plays
/** Draw an image centred on world (cx, cy), w by h, turned and mirrored. */
function stamp(g, im, cx, cy, w, h, { rot = 0, flipX = false, flipY = false, alpha = 1 } = {}) {
  if (alpha <= 0) return;
  g.save(); g.translate(cx, -cy); g.scale(flipX ? -1 : 1, flipY ? -1 : 1); g.rotate(rot); g.globalAlpha = alpha;
  g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
}
/** A chief's attack effect, t running 0..1 from the moment he strikes. tip is the world point where his weapon ends
 *  in the attack picture (measured per picture: assets/tips.json), so the beam leaves the gun and not his belly.
 *  x is his centre, H his height, face +1/-1. */
function drawKingFx(g, race, tip, x, H, face, t, now, aim = null) {
  const base = KING_FX[race], F = aim?.len ? {...base, len: Math.max(10, aim.len - (tip.x-x)*face) / (H/CHIEF_H)} : base, im = F && spr(`kingfx_${race}_0`);
  if (!im) return;
  const k = H / CHIEF_H, h = F.h * k, w = h * im.width / im.height, len = F.len * k, fl = face < 0;
  const ox = tip.x, oy = tip.y, ease = 1 - (1 - t) * (1 - t), fade = t < 0.6 ? 1 : (1 - t) / 0.4;
  if (F.style === 'beam' || F.style === 'bolt') {
    const q = Math.min(1, t / .65), size = Math.min(w, 38 * k);
    if (q < 1) stamp(g, im, ox + face * len * q, oy, size, h, { flipX: fl, alpha: fade });
    else sprite(g, 'fx_0', ox + face * len, oy - h / 2, h, { alpha: fade });
  } else if (F.style === 'shot') {
    // leaves the tip nose first (the picture's own tail trails back over the weapon for the first moment)
    // and angles down to land on a troop: it ends at troop height (not at the weapon's height) and bursts there
    const fly = Math.min(1, t / 0.7), px = ox + face * (w * 0.5 + (len - w * 0.5) * fly), ey = 20 * k, drop = fly * fly;
    const py = oy + (ey - oy) * drop, tilt = Math.atan2((oy - ey) * 2 * fly, Math.max(1, len - w * 0.5));     // nose follows the path
    if (t < 0.7) stamp(g, im, px, py, w, h, { flipX: fl, rot: tilt + Math.sin(now * 30) * 0.03 });
    else {
      // the burst is as wide as the rules' blast (F.burst is its radius): the painted explosion for the rocket, the
      // skull itself swelling for the ghost fire
      const q = (t - 0.7) / 0.3, d = 2 * F.burst * k * (0.55 + 0.45 * q), bx = ox + face * len;
      if (F.pop !== false) sprite(g, `fx_${Math.min(3, Math.floor(q * 4))}`, bx, Math.max(0, ey - d * 0.4), d * 1.15, { alpha: 1 - q * q });
      else stamp(g, im, bx, Math.max(d / 2, ey), d * im.width / im.height, d, { flipX: fl, alpha: 1 - q });
    }
  } else if (F.style === 'wave') {
    // pours out of his palms, drops to roll along the ground, and its front stops at the end of his reach
    const z = 0.5 + 0.5 * ease, front = w * 0.5 + (len - w * 0.5) * ease, drop = Math.min(1, t * 2.5);
    stamp(g, im, ox + face * (front - w * z / 2), Math.max(h * z / 2, oy * (1 - drop) + h * z / 2 * drop), w * z, h * z, { flipX: fl, alpha: fade });
  } else if (F.style === 'ground') {
    // bursts up from the floor where the weapon's head lands and spreads forward to the end of his reach
    const wd = len * 1.2 * (0.35 + 0.65 * Math.min(1, t * 3.5)), hd = wd * im.height / im.width * (1.7 + 0.25 * Math.sin(t * Math.PI));   // taller than the picture's own shape, so a short reach still reads as a big hit
    stamp(g, im, ox + face * wd * 0.38, hd / 2 - 2, wd, hd, { flipX: fl, alpha: fade });
  } else if (F.style === 'slash') {
    // the marks open just in front of the claws and carry forward to the end of his reach
    const z = 0.7 + 0.45 * ease, c0 = w * z * 0.3, c1 = Math.max(c0, len - w * z * 0.4);
    stamp(g, im, ox + face * (c0 + (c1 - c0) * ease), oy - h * 0.05, w * z, h * z, { flipX: fl, rot: -0.35 + 0.5 * ease, alpha: fade });
  } else if (F.style === 'arc') {
    // the crescent starts on the blade's tip and sweeps down round his shoulder to the ground in front
    const px = x, py = H * 0.55, dx = (ox - px) * face, dy = oy - py, r = Math.hypot(dx, dy) + len * 0.2, a0 = Math.atan2(dy, dx), a = a0 + 0.25 - 1.5 * ease;
    stamp(g, im, px + face * Math.cos(a) * r, py + Math.sin(a) * r, w, h, { flipX: fl, rot: -a, alpha: fade });
  } else if (F.style === 'puff') {
    // billows out of the fist to the end of his reach
    const z = 0.45 + 0.55 * ease, front = w * 0.45 + (len * 1.2 - w * 0.45) * ease;
    stamp(g, im, ox + face * (front - w * z / 2), oy + 4 * k * ease, w * z, h * z, { flipX: fl, alpha: t < 0.4 ? 1 : (1 - t) / 0.6 });
    // the blast shoves troops back: a puff of dust skids along the ground past the end of the steam
    if (t > 0.25) { const q = (t - 0.25) / 0.75; sprite(g, 'fx_3', ox + face * (len + 24 * k * q), -4, 34 * k * (0.6 + 0.6 * q), { flip: fl, alpha: 0.8 * (1 - q) }); }
  }
}
const CHIEF_H = 90;                              // the chief's height at home, in world units
const CHIEF = [{ x: null, walk: 0, act: 0, hit: -9, step: 0, flash: 0, hurtAt: -9 }, { x: null, walk: 0, act: 0, hit: -9, step: 0, flash: 0, hurtAt: -9 }];     // last drawn x and how recently he moved, per player
/** The chief (he fights now): walks out with a stepping bob, swings while pl.kingAct > 0 (his own attack picture
 *  kingatk_<race>_0 when it exists, a lunge of the standing picture until then), heals at home with rising green
 *  plus signs, and shows an HP bar whenever he is out of the fort or hurt. */
function drawChief(g, s, p, now) {
  const pl = s.players[p], k = S.kingPos(p, s), home = S.kingPos(p).x, st = CHIEF[p];
  if (st.player !== pl) { Object.assign(st, {player:pl, x:null, act:0, hit:-9, aim:null, walk:-9, hurtAt:-9}); }
  const hurt = pl.kingFlash > 0, out = Math.abs(k.x - home) >= 1;
  if (st.x != null && Math.abs(k.x - st.x) > 0.05) { st.walk = now; st.step += Math.min(8, Math.abs(k.x - st.x)) / (11 * S.kingScale(p, s)); }   // one walk frame every 11 units of ground at home size
  st.x = k.x;
  if ((pl.kingFlash || 0) > st.flash + 0.05) st.hurtAt = now;                // kingFlash jumped up: a new hit
  st.flash = pl.kingFlash || 0;
  if ((pl.kingAct || 0) > st.act + 0.05) { st.hit = now; st.aim = chiefAim(pl.kingAim); st.face = st.aim ? Math.sign(st.aim.x-k.x) || pl.kingFace || S.dir(p) : pl.kingFace || S.dir(p); }                     // kingAct jumped up: a new strike starts
  st.act = pl.kingAct || 0;
  // one strike = KING_FX_T seconds from the moment kingAct jumps: the weapon pose is held for all of it, so the
  // effect never plays over a chief who has already gone back to standing
  const ft = (now - st.hit) / KING_FX_T, striking = ft >= 0 && ft < 1;
  const face = striking ? st.face : pl.kingFace || S.dir(p), flip = face < 0;
  const walking = now - st.walk < 0.12 && !striking, sw = striking ? Math.sin(Math.PI * Math.min(1, ft * 1.6)) : 0;
  const bob = walking ? Math.abs(Math.sin(now * 11)) * 5 : Math.sin(now * 2.2 + p * 2) * 1.5;
  const sequence = `kingair_${pl.race}`, seq = art.meta?.[sequence];
  const animatedStrike = striking && st.aim?.air && seq?.frames.every((_, i) => !!spr(`${sequence}_${i}`));
  const strikeFrame = ft < .12 ? 0 : ft < (st.aim?.air ? .9 : .55) ? 1 : 2;
  const atk = animatedStrike ? `${sequence}_${strikeFrame}` : `kingatk_${pl.race}_0`, useAtk = striking && !!spr(atk);
  // size: CHIEF_H at home (as tall as the two-block hollow under his roof allows) times the rules' own scale
  // (S.kingScale: 1 at home, growing once he is out), so the picture matches what shots hit
  const big = S.kingScale(p, s), H = CHIEF_H * big;
  const ko = s.ko && (s.phase === 'roundOver' || s.phase === 'over') ? s.ko : null;
  if (pl.down > 0 || (ko && ko.loser === p && pl.kingHp <= 0)) {   // knocked out: topples back over half a second, bounces once, lies stunned
    const a = s.time - (pl.koAt ?? s.time), fall = Math.min(1, a / 0.5), bounce = a > 0.5 && a < 0.8 ? Math.sin(Math.PI * (a - 0.5) / 0.3) * 0.08 : 0;
    const back = -face, rot = back * (Math.PI / 2) * (fall * fall) * (1 - bounce);
    g.save(); g.translate(k.x - back * H * 0.12 * fall, 0); g.filter = 'saturate(0.6) brightness(0.92)';
    const ko2 = `kingko_${pl.race}_${a < 0.22 ? 0 : a < 0.5 ? 1 : 2}`, km = art.meta?.[`kingko_${pl.race}`];
    if (spr(ko2)) sprite(g, ko2, a < 0.5 ? 0 : -back * H * 0.1, a >= 0.5 ? H * bounce * 0.6 : 0, H * (km?.k || 1), { flip });
    else sprite(g, kingKey(pl.race), 0, -H * 0.4 * fall * fall, H, { flip, rot });   // lowered as he tips so he lies on the ground
    g.restore();
    return;
  }
  if (ko && ko.winner === p) {
    const dance = victoryDance(s.time - ko.at, p), walk = `king2_${pl.race}`, cheer = `kingko_${pl.race}_3`;
    const key = dance.step < 4 && spr(`${walk}_0`) ? `${walk}_${Math.floor(dance.stride * 12) % 4}` : spr(cheer) ? cheer : kingKey(pl.race);
    const km = art.meta?.[key.replace(/_\d+$/, '')], facing = face * (dance.turn ? -1 : 1);
    sprite(g, key, k.x + face * dance.x * H, dance.y * H, H * (km?.k || 1), { flip: facing < 0, rot: face * dance.rot, sx: dance.sx, sy: dance.sy });
    return;
  }
  // he stands out at all times: a soft gold glow behind him and a gold ring in his side's colour under his feet
  const pulse = 0.5 + 0.5 * Math.sin(now * 3 + p), gl = g.createRadialGradient(k.x, -H * 0.5, H * 0.1, k.x, -H * 0.5, H * 0.75);
  gl.addColorStop(0, `rgba(255,226,110,${0.5 + 0.15 * pulse})`); gl.addColorStop(1, 'rgba(255,226,110,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(k.x, -H * 0.5, H * 0.75, 0, 7); g.fill();
  g.beginPath(); g.ellipse(k.x, -5, H * 0.5, H * 0.12, 0, 0, 7); g.fillStyle = 'rgba(255,210,63,0.4)'; g.fill(); g.lineWidth = 3; g.strokeStyle = COLORS[p].main; g.stroke();
  g.save(); if (hurt) g.filter = 'brightness(1.9) saturate(0.4)';
  const x = k.x + (hurt ? Math.sin(now * 60) * 2 : 0) + face * sw * (useAtk ? 8 : 16);
  let tip = { x: x + face * H * 0.42, y: H * 0.5 };                        // where the effect starts when there is no measured tip
  if (useAtk) {
    const ia = spr(atk), ii = spr(kingKey(pl.race)), ha = H * (ii ? ia.height / ii.height : 1), wa = ha * ia.width / ia.height, tp = art.tips?.[atk];   // cut at the standing picture's scale
    const anchor = animatedStrike ? seq.frames[strikeFrame].anchor : null;
    const ax = anchor ? x + face * (.5 - anchor[0]) * wa : x, ay = anchor ? (anchor[1] - 1) * ha : 0;
    sprite(g, atk, ax, ay, ha, { flip });
    if (art.trace) art.trace.push(['k', p, pl.race, atk, true, +ha.toFixed(1), 0, +x.toFixed(1), 0, +(pl.kingAct || 0).toFixed(3)]);
    if (tp) tip = { x: ax + face * (tp[0] - 0.5) * wa, y: ay + (1 - tp[1]) * ha };
  }
  else {
    // his own walk cycle (four frames) and hit frames (flinch, then knocked back) from sheet king2_<race>; until that
    // sheet is in, the standing picture bobs and tilts as before
    const m2 = art.meta?.[`king2_${pl.race}`], has2 = !!m2 && !!spr(`king2_${pl.race}_0`), he = now - st.hurtAt;
    const f2 = !has2 ? -1 : he >= 0 && he < 0.3 ? (he < 0.07 ? 4 : 5) : walking ? Math.floor(st.step) % 4 : -1;
    if (art.trace) art.trace.push(['k', p, pl.race, f2 >= 0 ? `king2_${pl.race}_${f2}` : kingKey(pl.race), true, +(H * (f2 >= 0 ? m2.k || 1 : 1)).toFixed(1), 0, +x.toFixed(1), +Math.max(0, 0.3 - he).toFixed(3), +(pl.kingAct || 0).toFixed(3)]);
    if (f2 >= 0) {
      const back = f2 >= 4 ? Math.sin(Math.PI * Math.min(1, he / 0.3)) : 0;       // eased knock-back and return
      sprite(g, `king2_${pl.race}_${f2}`, x - face * back * H * 0.07, 0, H * (m2.k || 1), { flip, rot: -face * back * 0.06 });
    } else sprite(g, kingKey(pl.race), x, walking ? bob : 0, walking ? H : H + bob, { flip, rot: face * (sw * 0.28 + (walking ? Math.sin(now * 11) * 0.05 : 0)) });
  }
  g.restore();
  if (striking && (!animatedStrike || ft >= .12)) {
    const effectT = animatedStrike ? (ft - .12) / .88 : ft;
    if (st.aim && (st.aim.air || st.aim.kind !== 'area' || pl.race === 'military')) {
      if (art.trace) art.trace.push(['ka', p, pl.race, st.aim.air, st.aim.kind, st.aim.x, st.aim.y, face]);
      drawChiefAim(g, pl.race, tip, st.aim, effectT, now, big, {spr, stamp, sprite});
    } else drawKingFx(g, pl.race, tip, x, H, face, effectT, now, st.aim);
  }
  // a twinkle on his crown
  { const tw = (now * 0.9 + p * 0.5) % 1, z = Math.sin(Math.PI * tw); if (z > 0.05) sprite(g, 'fx_0', k.x + face * H * 0.04, H * 0.92 - H * 0.11 * z, H * 0.22 * z, { rot: now * 2, alpha: 0.9 * z }); }
  if (pl.kingHeal) {
    g.beginPath(); g.ellipse(k.x, -6, H * 0.5, H * 0.13, 0, 0, 7); g.fillStyle = `rgba(120,255,170,${0.22 + 0.1 * Math.sin(now * 4)})`; g.fill();
    for (let i = 0; i < 4; i++) { const q = (now * 0.7 + i / 4) % 1; text(g, '+', k.x + Math.sin(i * 2.4 + p) * 26, 14 + q * H, 22 - q * 6, `rgba(140,255,160,${1 - q})`, 'center', `rgba(20,70,30,${0.8 * (1 - q)})`); }
  }
  if (pl.down <= 0) {                             // his health over his head (he guards the castle)
    const f = pl.kingHp / pl.kingMax;
    const by = H + 16;
    rrect(g, k.x - 33, -(by + 12), 66, 12, 6); g.fillStyle = INK; g.fill();
    bar(g, k.x, by + 1, 62, 10, f, f > 0.35 ? '#6fd45a' : '#ff5a4a');
    sprite(g, 'ui_2', k.x - 36, by - 2, 16);
  }
}
/** The castle: race art castle_<race>_0..3 by damage when present; until then a keep built from the race's fort
 *  blocks with battlements, darkening and losing height as it is damaged. Flashes when hit; sparks show the guard. */
const castleSmokeMask = (race, stage) => art.meta?.[`castle_${race}`]?.frames[stage]?.smoke;
function drawCastle(g, s, p, now) {
  const pl = s.players[p], [a, b] = S.fortSpan(p), H = S.FORT.h, w = b - a, cx = (a + b) / 2;
  const f = pl ? Math.max(0, pl.fortHp / pl.fortMax) : 1, stage = f <= 0 ? 3 : f < 0.34 ? 2 : f < 0.67 ? 1 : 0;
  const art = pl && spr(`castle_${pl.race}_${stage}`);
  g.save(); if (pl && pl.fortFlash > 0) g.filter = 'brightness(1.6)';
  const fell = stage === 3 && DOWN_AT[p] != null ? (now - DOWN_AT[p]) / 0.7 : 9;
  if (art && fell < 1 && spr(`castle_${pl.race}_2`)) {         // coming down: the broken castle shudders and sinks as the rubble appears
    const im2 = spr(`castle_${pl.race}_2`), hh = w * im2.height / im2.width, e = fell * fell;
    sprite(g, `castle_${pl.race}_3`, cx, 0, w * art.height / art.width, { flip: p === 1, alpha: Math.min(1, fell * 1.6) });
    sprite(g, `castle_${pl.race}_2`, cx + Math.sin(now * 70) * 5 * (1 - fell), -hh * 0.1 * e, hh, { flip: p === 1, alpha: 1 - e, sy: 1 - 0.55 * e });
    g.restore(); return;
  }
  if (art) {
    const mask = castleSmokeMask(pl.race, stage);
    if (!drawCastleSmoke(g, art, mask, cx, w, p === 1, now, p)) sprite(g, `castle_${pl.race}_${stage}`, cx, 0, w * art.height / art.width, { flip: p === 1 });
    g.restore(); return;
  }
  const race = pl ? pl.race : S.RACE_KEYS[0], keep = (kind, worn) => blockKey(race, kind, worn);
  const top = stage === 3 ? CELL : H - stage * 22;                 // ruins are low
  for (let y = 0; y < top - 1; y += CELL) for (let x = a; x < b - 1; x += CELL) {
    const tower = x === a || x + CELL >= b - 1, kind = tower ? 'stone' : 'wood';
    sprite(g, keep(tower ? 'stone' : 'stone', stage >= 1 && ((x + y) / CELL) % 3 === 0), x + CELL / 2, y, CELL + 1);
  }
  if (stage < 3) for (let x = a; x < b - 1; x += CELL) if (((x - a) / CELL) % 2 === 0) sprite(g, keep('stone', stage >= 2), x + CELL / 2, top, CELL * 0.62);   // battlements
  // a gate in the front face (gone once the castle is rubble)
  if (stage < 3) { const gx = p === 0 ? b - CELL : a + CELL;
  g.beginPath(); g.moveTo(gx - 22, 0); g.lineTo(gx - 22, -46); g.quadraticCurveTo(gx, -70, gx + 22, -46); g.lineTo(gx + 22, 0); g.closePath(); g.fillStyle = '#2b1d12'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); }
  g.restore();
}
const SLING_DIR = [null, null];                  // the last aim direction per player, for the snap after a shot
function drawBrokenSling(g, c, SL, p, age) {
  const f = slingFall(age), d = S.dir(p), base = c.y - SL.drop, im = spr('sling_0');
  if (!im) return;
  const h = SL.h, w = h * im.width / im.height;
  if (!f.broken) {
    g.save(); g.translate(c.x, -base); g.rotate(d * f.fall * Math.PI / 2);
    sprite(g, 'sling_0', 0, 0, h, { flip: p === 1 });
    sprite(g, 'sling_1', 0, h * 0.7, 18, { flip: p === 1 });
    // The slack bands stay attached until the fork strikes the roof.
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * 25 * h / 118, -h * 0.84); g.quadraticCurveTo(side * 12, -h * 0.64, 0, -h * 0.76); g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.strokeStyle = '#d59a55'; g.lineWidth = 3; g.stroke(); }
    g.restore();
    return;
  }
  // Three non-overlapping pieces of the existing painted frame: both fork arms and the stock.
  // They begin exactly where the tipped frame ended, then tumble down and remain on the grass.
  const pieces = [[0, 0, .5, .54], [.5, 0, .5, .54], [0, .54, 1, .46]];
  pieces.forEach(([rx, ry, rw, rh], i) => {
    const cx = (rx + rw / 2 - .5) * w * (p === 1 ? -1 : 1), cy = (ry + rh / 2) * h;
    const fromX = c.x + d * (h - cy), fromY = base - d * cx;
    const q = f.scatter, x = fromX + d * (i - 1) * 52 * q;
    const y = fromY * (1 - q) + (rw * w / 2 + 2) * q + Math.sin(q * Math.PI) * (22 + i * 8);
    g.save(); g.translate(x, -y); g.rotate(d * Math.PI / 2 + d * (i - 1) * Math.PI * 2 * q); g.scale(p === 1 ? -1 : 1, 1);
    g.drawImage(im, rx * im.width, ry * im.height, rw * im.width, rh * im.height, -rw * w / 2, -rh * h / 2, rw * w, rh * h); g.restore();
  });
  sprite(g, 'sling_1', c.x + d * (h * .7 + 38 * f.scatter), base * (1 - f.scatter) + 8, 18, { rot: d * f.scatter * 5 });
  if (f.dust > 0) sprite(g, 'fx_3', c.x + d * h * .5, base, h * (.5 + (1 - f.dust) * .6), { alpha: f.dust * .8 });
}
function drawFort(g, s, p, ui, now, wrecks) {
  const col = COLORS[p], pl = s.players[p], flip = p === 1;
  const fallen = !!pl && pl.fortHp <= 0 && !ui.menu && !ui.pick, drop = fallen ? S.FORT.h - CELL : 0;   // a fallen castle brings its slingshot and flag down onto the rubble
  const c0 = S.catPos(p), c = { x: c0.x, y: c0.y - drop };
  // the slingshot stands ON the castle picture: its foot at the roof height measured from the art (castle_<race>.seat,
  // tools/art_castle_seat.py), not at one height for every castle; on a fallen castle it rides the rubble down
  // The fork stays at the rules' launch point (shots leave from it), so on a lower roof the frame is drawn a little
  // bigger to reach down to it.
  const seat = pl && art.meta?.[`castle_${pl.race}`]?.seat; let slK = 1;
  if (seat && spr(`castle_${pl.race}_0`)) {
    const fell = fallen ? (DOWN_AT[p] != null ? Math.min(1, (now - DOWN_AT[p]) / 0.7) : 1) : 0, e = fell * fell;
    slK = Math.max(1, Math.min(1.3, (c0.y - seat[0]) / 99));
    c.y = seat[0] + (seat[3] - seat[0]) * e + 99 * slK;
  }
  drawCastle(g, s, p, now);                                          // the castle; the slingshot stands on its top
  // slingshot: a Y frame on the tower; two bands run from the prong tips to a leather pouch that is pulled back
  // along the aim while a finger drags, and snaps forward and wobbles after a shot. The launch point (S.catPos) is the
  // middle of the fork, so the physics is untouched.
  const aim = ui.aimOf?.[p], kick = Math.max(0, (ui.kick?.[p] || 0)), d = S.dir(p);
  const SL = { h: 118 * slK, drop: 99 * slK, back: { x: -25 * slK, y: 0 }, front: { x: 25 * slK, y: 0 } };      // frame size and where the bands tie on, from the fork middle
  const tipB = { x: c.x + d * SL.back.x, y: c.y + SL.back.y }, tipF = { x: c.x + d * SL.front.x, y: c.y + SL.front.y };
  let pouch, ang = 0;
  if (aim) {
    const v = S.launch(p, aim.dx, aim.dy, aim.power), n = v ? Math.hypot(v.vx, v.vy) || 1 : 1, ux = v ? v.vx / n : d, uy = v ? v.vy / n : 0.4, pull = 22 + aim.power * 62;
    pouch = { x: c.x - ux * pull, y: c.y - uy * pull }; ang = Math.atan2(-uy, ux);
    SLING_DIR[p] = { ux, uy };
  } else if (kick > 0) {
    const u = SLING_DIR[p] || { ux: d, uy: 0.4 }, q = 1 - kick, swing = Math.cos(q * 16) * kick * 34 * (q < 0.12 ? -1 : 1);   // forward snap, then a dying wobble
    pouch = { x: c.x + u.ux * (q < 0.12 ? 30 * (q / 0.12) : swing), y: c.y + u.uy * (q < 0.12 ? 30 * (q / 0.12) : swing) - 6 * q }; ang = Math.atan2(-u.uy, u.ux);
  } else pouch = { x: c.x + d * 1, y: c.y - 14 + Math.sin(now * 2 + p) * 1.2 };
  const band = (tip) => { g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 6.5; g.beginPath(); g.moveTo(tip.x, -tip.y); g.lineTo(pouch.x, -pouch.y); g.stroke(); g.strokeStyle = aim ? '#e9b06a' : '#d59a55'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(tip.x, -tip.y); g.lineTo(pouch.x, -pouch.y); g.stroke(); };
  const hasSling = !!spr('sling_0');
  const defeated = !ui.menu && !ui.pick && s.ko?.loser === p && (s.phase === 'roundOver' || s.phase === 'over');
  if (defeated) wrecks.push(() => drawBrokenSling(g, c, SL, p, s.time - s.ko.at));
  else if (hasSling) {
    band(tipB);                                                          // the far band goes behind the frame
    sprite(g, 'sling_0', c.x, c.y - SL.drop, SL.h, { flip });
    const loaded = aim || (pl.reload <= 0 && kick <= 0);
    if (loaded) { sprite(g, shotKey(pl.ammo), pouch.x + Math.cos(ang) * 3 * d * 0, pouch.y - 10, 20, { anchorY: 1 }); }
    sprite(g, 'sling_1', pouch.x, pouch.y - 9, 18, { flip, rot: flip ? -ang + Math.PI : ang });
    band(tipF);                                                          // the near band in front of everything
  } else sprite(g, 'catapult_0', c.x, c.y - 14, 62, { flip });
  // flag in the side colour
  const fx = S.mx(p, S.FORT.back - 6), fy = S.FORT.h + 46 - drop;
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(fx, 0); g.lineTo(fx, -fy - 46); g.stroke();   // the pole stands on the ground behind the castle
  const wave = Math.sin(now * 3 + p) * 4;
  g.beginPath(); g.moveTo(fx, -fy - 46); g.quadraticCurveTo(fx + d * 20, -fy - 50 + wave, fx + d * 38, -fy - 38); g.quadraticCurveTo(fx + d * 20, -fy - 30 - wave, fx, -fy - 24); g.closePath();
  g.fillStyle = col.main; g.fill(); g.stroke();
  // the chief: behind his blocks while he is at home, drawn again in front of the troops when he is out fighting
  if (ui.menu || ui.pick) drawChief(g, s, p, now);
}

/** Each side's building spots (owner, 2026-11-26; 3, or 4 / 2 by race trait): a numbered stone pad in the team colour. An empty pad
 *  shows a pulsing "+"; a built one keeps its number in the dirt below, so players always see they have exactly three. */
function drawSlots(g, s, now, top = false) {
  for (const p of [0, 1]) for (let i = 0; i < S.slotCount(s, p); i++) {
    const x = S.slotX(s, p, i), used = !!S.inSlot(s, p, i), col = COLORS[p], n = String(i + 1);   // numbered from the castle outwards on both sides
    if (used !== top) continue;
    if (used) {                                                    // a small number badge by the building's foot (drawn over it)
      g.beginPath(); g.arc(x + 30, -12, 10, 0, 7); g.fillStyle = col.main; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      text(g, n, x + 30, 12, 13, '#fff');
      continue;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.5 + i);
    g.save();                                                      // an empty pad on the grass, dashed in the team colour
    g.beginPath(); g.ellipse(x, -6, 38, 11, 0, 0, 7); g.fillStyle = 'rgba(255,248,225,' + (0.35 + 0.15 * pulse) + ')'; g.fill();
    g.lineWidth = 3.5; g.strokeStyle = col.main; g.setLineDash([9, 6]); g.lineDashOffset = -now * 12; g.stroke();
    g.restore();
    g.beginPath(); g.arc(x, -42, 15, 0, 7); g.fillStyle = col.main; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();   // the spot's number above it
    text(g, n, x, 42, 18, '#fff');
    g.globalAlpha = 0.6 + 0.4 * pulse; text(g, '+', x, 14, 26, '#fff'); g.globalAlpha = 1;
  }
}

function drawBuildings(g, s, now) {
  for (const b of s.buildings) {
    if (b.dead) continue;
    const col = COLORS[b.owner];
    if (b.kind === 'shield') {
      const left = Math.max(0, 1 - b.age / b.life), pulse = 0.5 + 0.08 * Math.sin(now * 5);
      g.save();
      const gr = g.createRadialGradient(b.x, 0, FORT.domeR * 0.55, b.x, 0, FORT.domeR);
      gr.addColorStop(0, 'rgba(160,220,255,0.05)'); gr.addColorStop(0.85, `rgba(150,215,255,${0.28 * pulse + 0.1})`); gr.addColorStop(1, 'rgba(255,255,255,0.75)');
      g.beginPath(); g.arc(b.x, 0, FORT.domeR, Math.PI, 0); g.closePath(); g.fillStyle = gr; g.fill();
      g.lineWidth = 4; g.strokeStyle = col.light; g.setLineDash([left * 400, 4000]); g.beginPath(); g.arc(b.x, 0, FORT.domeR, Math.PI, 0); g.stroke(); g.setLineDash([]);
      g.restore();
      bar(g, b.x, FORT.domeR + 46, 70, 9, b.hp / b.maxHp, '#8fd8ff');      // above the flingshot's fork, which stands through the top of the dome now that the dome is centred on the castle
      continue;
    }
    const bk = buildKey(s.players[b.owner].race, b.kind), bi = spr(bk);
    const gap = S.slotCount(s, b.owner) > 1 ? Math.abs(S.slotX(s, b.owner, 1) - S.slotX(s, b.owner, 0)) : 100;
    const h = Math.min(S.GEOM[b.kind].h + 10, bi ? Math.min(100, gap + 16) * bi.height / bi.width : 999);      // a wide picture is held to its spot's width (spots are 60 to 100 apart by race), so neighbours do not swallow each other
    // whose it is (art review A12): the same outlined team-colour disc the troops stand on, under the building's foot
    { const rw = Math.max(24, (bi ? h * bi.width / bi.height : 48) * 0.5); g.beginPath(); g.ellipse(b.x, 1, rw, 8, 0, 0, 7); g.fillStyle = col.main; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = col.dark; g.stroke(); }
    g.save(); if (b.flash > 0) g.filter = 'brightness(1.7)';
    sprite(g, bk, b.x, -4, h, { flip: b.owner === 1 });
    if (b.kind === 'mine') text(g, `+${BUILD.mine.income}`, b.x, h + 14 + Math.sin(now * 3 + b.id) * 2, 14, '#ffe36b');
    g.restore();
    if (b.hp < b.maxHp) bar(g, b.x, h + 6, 44, 7, b.hp / b.maxHp, col.main);
  }
}

// A troop's class (UNIT[k].cls, set by the balance lane) as a coloured chip: one colour per job, a short code where
// there is no room for the word, and a leading wing mark for the flying ones.
export const CLS = {
  'Melee': ['#c8553a', 'MEL'], 'Ranged': ['#3f8fd6', 'RNG'], 'Anti-air': ['#2bb3c4', 'AA'], 'Anti-ground': ['#8a6a2e', 'AG'],
  'Siege': ['#7d6f66', 'SIEGE'], 'Bomber': ['#e08a1e', 'BOMB'], 'Support': ['#4caf50', 'SUP'],
};
/** { col, short, full } for a class name; flying classes take the colour of what they do. */
function clsOf(cls) {
  if (!cls) return null;
  const fly = cls.startsWith('Flying '), base = fly ? cls.slice(7) : cls, key = Object.keys(CLS).find((k) => k.toLowerCase() === base.toLowerCase()) || 'Melee';
  return { col: CLS[key][0], short: (fly ? '\u2191' : '') + CLS[key][1], full: cls, fly };
}
/** A class chip centred on (cx, y is its top edge, y-up). */
function clsChip(g, c, cx, top, size, label, maxW = 1e9) {
  g.font = FONT(size); let tw = g.measureText(label).width;
  if (tw + size * 0.9 > maxW) { size = Math.max(6, size * (maxW - size * 0.9) / tw); g.font = FONT(size); tw = g.measureText(label).width; }   // whole words, shrunk to fit
  const w = tw + size * 0.9, h = size * 1.35;
  rrect(g, cx - w / 2, -top, w, h, h / 2); g.fillStyle = c.col; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(30,16,4,0.7)'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(label, cx, -(top - h / 2) + 0.5);
  return w;
}

// A troop's animation. The original sheet t_<unit> has four frames (move A, move B, attack, hurt); the extra sheet
// u2_<unit> adds six in-betweens (move A>B, move B>A, attack mid-swing, attack recover, hurt flinch, hurt recover), so
// a walk is 4 frames, an attack 3 and a hit 3. Until a troop's extra sheet is loaded it plays the original four.
const MACHINE = new Set(['aliens_saucer', 'aliens_mothership', 'robots_drone', 'robots_gunship', 'military_chopper', 'military_bomber', 'pirates_sloop', 'steampunk_gyro', 'steampunk_zeppelin']);   // flyers that never flap
// melee troops whose blow is a cut (a slash arc), by full key; every other melee blow is a thump (an impact burst):
// the Steam Knight's lance thrust and the Thorn Elemental's vines land as a burst, not a sword crescent (art review A07)
const BLADE = new Set(['fantasy_shieldbearer', 'fantasy_dancer', 'undead_skeleton', 'pirates_deckhand', 'pirates_bosun', 'beastfolk_goblin', 'robots_scrap', 'elementals_imp', 'steampunk_clockwork']);
const ROTOR = new Set(['military_chopper', 'robots_drone', 'robots_gunship', 'steampunk_gyro']);      // flyers held up by blades that must never stop
const REG0 = [1, 0, 0];
// Where a ground troop's feet are drawn for its lane (the rules' u.lane, 0 back .. 1 front). The lanes are drawn shallow
// so the front row's feet and team discs stay on the grass, clear of the first button row (art review A15).
const LANE_Y = (u) => 2 - u.lane * 5;
// How each kind of shot moves (docs/ANIMATION-RESEARCH.md): straight and instant-looking, tumbling, or glowing with a tail
const SHOT_STRAIGHT = new Set(['bullet', 'tracer', 'rivet', 'ray', 'laser', 'dart', 'ring', 'zap', 'screech', 'wail', 'gust', 'shotball', 'shell']);
const SHOT_SPIN = new Set(['rock', 'coconut', 'keg', 'bomb', 'grenade', 'ball', 'shotball']);
const SHOT_GLOW = new Set(['fire', 'gfire', 'magma', 'orb', 'wisp', 'skull', 'wail', 'ice', 'acid']);
const SHOT_GUN = new Set(['bullet', 'tracer', 'rivet', 'shotball', 'shell', 'grenade', 'ball']);
const ACT_T = 0.28, HURT_T = 0.25;               // how long the rules keep u.act and u.hurt up after a strike or a hit
/** Which picture a troop shows now: { key, k (height multiplier), dy (lift, as a share of the height) }. */
function unitFrame(u, spec, now, hit) {
  // Preserve propulsion through every live state; recoil, squash and hit tint are
  // applied to this same rig below. Sloop deliberately remains in the art lane.
  if(hasRotorRig(u.kind) && spr(`f_${u.kind}_0`)) {
    const m=art.meta[`f_${u.kind}`];return {key:`f_${u.kind}_0`,k:m.k||1,dy:m.dy||0,rotor:{kind:u.kind,now,id:u.id}};
  }
  const base = (i) => ({ key: unitKey(u.kind, i), k: 1, dy: 0 });
  const xm = art.meta?.[`u2_${u.kind}`], has = !!xm && !!spr(`u2_${u.kind}_0`);
  const extra = (i) => ({ key: `u2_${u.kind}_${i}`, k: xm.k || 1, dy: xm.dy || 0 });
  // a hit plays flinch, knocked back, recover. Under rapid fire the rules restart u.hurt every few frames: the flinch
  // then shows only for the first blow of the run, and the troop stays knocked back until the blows stop
  // a troop with its own hurt sheet (h_<unit>: flinch, knocked back, recover, drawn on its flight model) plays that
  const hm = art.meta?.[`h_${u.kind}`];
  if (u.hurt > 0 && hm && spr(`h_${u.kind}_0`)) return { key: `h_${u.kind}_${hit && now - hit.t0 < 0.05 ? 0 : u.hurt > 0.09 ? 1 : 2}`, k: hm.k || 1, dy: hm.dy || 0 };
  if (u.hurt > 0) return !has ? base(3) : hit && now - hit.t0 < 0.05 ? extra(4) : u.hurt > 0.09 ? base(3) : extra(5);
  // rotor craft keep flying while they shoot (art review A10): their attack sheet holds the blades at one angle, so it
  // shows only for the instant of the shot (its muzzle flash) and the flight cycle, blades turning, plays around it
  const spin = ROTOR.has(u.kind) && !!spr(`f_${u.kind}_0`) && !(ACT_T - u.act >= 0.035 && ACT_T - u.act < 0.12);
  if (u.act > 0 && !spin) {
    const e = Math.max(0, ACT_T - u.act);
    // each troop's own four-frame attack (sheet a_<unit>, drawn as one picture): a short wind-up, the strike as the
    // blow lands or the shot leaves, the follow-through, the recover
    const am = art.meta?.[`a_${u.kind}`];
    if (am && spr(`a_${u.kind}_0`)) return { key: `a_${u.kind}_${e < 0.035 ? 0 : e < 0.12 ? 1 : e < 0.2 ? 2 : 3}`, k: am.k || 1, dy: am.dy || 0 };
    if (!has) return base(2);
    // a shooter is already at full draw when its shot leaves; a fighter is caught mid-swing first
    return spec.range ? (e < 0.14 ? base(2) : extra(3)) : e < 0.05 ? extra(2) : e < 0.18 ? base(2) : extra(3);
  }
  // ground troops walk on their own six-frame cycle (sheet w_<unit>, drawn as one picture so the body holds still and
  // the legs stride and swap). One cycle covers about 0.85 of the troop's height in ground, so the feet do not slide;
  // squad mates start on different frames.
  const wk = spec.air ? null : `w_${art.meta?.[`w_${u.kind}`] ? u.kind : spec.art}`, wm = wk && art.meta?.[wk];
  if (wm && spr(`${wk}_0`)) {
    // with the in-between sheet (w2_) the cycle plays as twelve frames: 1 A 2 B 3 C 4 D 5 E 6 F
    const w2 = `w2_${wk.slice(2)}`, m2 = art.meta?.[w2], twelve = !!m2 && !m2.off && !!spr(`${w2}_0`), ph = u.walk / 0.09 / (spec.r * 3.5 * 0.85);
    if (twelve) { const j = (Math.floor(ph * 12) + u.id * 4) % 12, i = j >> 1; return j % 2 ? { key: `${w2}_${i}`, k: m2.k || 1, dy: 0, walk: true } : { key: `${wk}_${i}`, k: wm.k || 1, dy: 0, walk: true }; }
    const i = (Math.floor(ph * 6) + u.id * 2) % 6; return { key: `${wk}_${i}`, k: wm.k || 1, dy: 0, walk: true };
  }
  // flyers have a six-frame flying cycle (sheet f_<unit>): creatures flap, machines hold their wings and hull rigid
  // and only spin rotors and propellers, ghosts and clouds ripple
  const fm = spec.air && art.meta?.[`f_${u.kind}`];
  if (fm && spr(`f_${u.kind}_0`)) {
    const f2 = art.meta?.[`f2_${u.kind}`], rate = MACHINE.has(u.kind) ? 18 : 9;
    // These two f2 sheets redraw the body rather than interpolate it; keep the registered six-frame model.
    if (!MONSTER_FLIGHT.has(u.kind) && f2 && !f2.off && spr(`f2_${u.kind}_0`)) { const j = Math.floor(now * rate * 2 + u.id * 3.4) % 12, i = j >> 1; return j % 2 ? { key: `f2_${u.kind}_${i}`, k: f2.k || 1, dy: f2.dy || 0 } : { key: `f_${u.kind}_${i}`, k: fm.k || 1, dy: fm.dy || 0 }; }
    return { key: `f_${u.kind}_${Math.floor(now * rate + u.id * 1.7) % 6}`, k: fm.k || 1, dy: fm.dy || 0 };
  }
  if (!has) return base(spec.air ? Math.floor(now * 5 + u.id) % 2 : Math.floor(u.walk) % 2);
  const i = spec.air ? Math.floor(now * 10 + u.id * 1.7) % 4 : Math.floor(u.walk * 2) % 4;
  return i === 0 ? base(0) : i === 1 ? extra(0) : i === 2 ? base(1) : extra(1);
}

const HELD = new Map();                               // troop id -> { key, fr, t }: the pose it is showing and since when
const HITS = new Map();                               // troop id -> { t0, seen, kick }: the run of blows it is taking
function drawUnits(g, s, now) {
  if (HITS.size > 400) HITS.clear();
  if (HELD.size > 600) HELD.clear();
  const us = s.units.slice().sort((a, b) => (UNIT[a.kind].air ? 1 : 0) - (UNIT[b.kind].air ? 1 : 0) || b.lane - a.lane);
  for (const u of us) {
    const spec = UNIT[u.kind], col = COLORS[u.owner], h = spec.r * 3.5, air = !!spec.air;
    if (u.kind === 'military_bomber') loadSprite('ultfx_a_1'); // its painted olive/yellow payload, before release
    const y = air ? u.y + Math.sin(now * 2.4 + u.id) * 6 : LANE_Y(u);
    const victory = s.ko && s.ko.loser >= 0 && s.ko.winner === u.owner && (s.phase === 'roundOver' || s.phase === 'over');
    if (victory) {
      const machine = MACHINE.has(u.kind) || u.kind === 'military_tank' || u.kind === 'robots_tread';
      const dance = victoryDance(s.time - s.ko.at, u.id, air, machine), face = S.dir(u.owner) * (dance.turn ? -1 : 1);
      // Advance the painted feet/wings even though combat has stopped. Never retain a frozen attack,
      // muzzle flash or hurt tint on the winner, and never move the actual collision body.
      const footTime = air || dance.step < 4 ? dance.stride : dance.step < 6 ? .32 : 0;
      const pose = { ...u, hurt: 0, act: 0, walk: footTime * 0.09 * h * 0.85 };
      const fr = unitFrame(pose, spec, s.time - s.ko.at, null), rg = art.reg?.[fr.key] || REG0, hk = h * fr.k;
      const x = u.x + S.dir(u.owner) * dance.x * h, yy = (air ? u.y : y) + dance.y * h;
      g.beginPath(); g.ellipse(x, air ? 0 : -y + 1, spec.r * 1.1, spec.r * .3, 0, 0, 7); g.fillStyle = col.main; g.globalAlpha = air ? .35 : .8; g.fill(); g.globalAlpha = 1;
      sprite(g, fr.key, x + face * rg[1] * hk, yy + fr.dy * h + rg[2] * hk, hk * rg[0], { contrast: CONTRAST_KINDS.has(u.kind), rotor: fr.rotor, flip: face < 0, rot: S.dir(u.owner) * dance.rot, sx: dance.sx, sy: dance.sy });
      if (art.trace) art.trace.push(['victory', u.id, u.kind, fr.key, !!spr(fr.key), dance.step, x, yy, face]);
      continue;
    }
    let hit = HITS.get(u.id);
    if (u.hurt > 0) { if (!hit || now - hit.seen > 0.1) { HITS.set(u.id, hit = { t0: now, seen: now, kick: 0 }); art.onSound?.('hit', u.x); } hit.seen = now; }
    let fr = unitFrame(u, spec, now, hit);
    const dirU = attackFacing(u, now, s.hits, s.fx);
    if (art.trace) { art.trace.push(['face', u.id, u.kind, dirU]); if(fr.rotor)art.trace.push(['rotor',u.id,u.kind,rotorPhase(now,u.id)]); }
    // no picture is shown for a single frame: once a troop changes pose it holds it for at least 1/15 s (a blow
    // landing mid-recovery, or blows arriving every other frame, otherwise make it flick between two poses)
    const hold = HELD.get(u.id);
    // (only between hit and attack poses: a walking troop that is struck reacts on the very next frame)
    const busy = u.hurt > 0 || u.act > 0;
    if (hold && hold.busy && busy && hold.key !== fr.key && now - hold.t < 0.066 && now >= hold.t && spr(hold.key)) fr = hold.fr; else if (!hold || hold.key !== fr.key) HELD.set(u.id, { key: fr.key, fr, t: now, busy });
    if (art.trace) art.trace.push(['u', u.id, u.kind, fr.key, !!spr(fr.key), +(spec.r * 3.5 * fr.k).toFixed(1), +fr.dy.toFixed(3), +u.x.toFixed(1), +(u.hurt || 0).toFixed(3), +(u.act || 0).toFixed(3)]);     // test hook: tools/art_battle_record.mjs
    const koS = s.ko && s.ko.loser >= 0 && (s.phase === 'roundOver' || s.phase === 'over') ? s.ko : null;
    const lose = koS && u.owner === koS.loser;
    let hop = air || u.act > 0 || u.hurt > 0 || lose ? 0 : Math.abs(Math.sin(u.walk * Math.PI)) * spec.r * 0.22;
    if (fr.walk) hop = 0;                           // the walk cycle has its own bob drawn in
    if (lose) { g.save(); g.filter = 'saturate(0.35) brightness(0.85)'; }
    // team-colour disc on the ground (a fainter shadow under flyers)
    g.beginPath(); g.ellipse(u.x, air ? 0 : -y + 1, spec.r * (air ? 0.9 : 1.15), spec.r * (air ? 0.24 : 0.34), 0, 0, 7); g.fillStyle = col.main; g.globalAlpha = air ? 0.35 : 0.8; g.fill();
    if (!air) { g.lineWidth = 2; g.strokeStyle = col.dark; g.stroke(); }
    g.globalAlpha = 1;
    // eased body motion on top of the frames: a hit knocks the troop back and it springs upright again, a strike
    // lunges forward and settles; both ease in and out so nothing snaps
    const he = u.hurt > 0 ? 1 - u.hurt / HURT_T : -1, ae = u.act > 0 && u.hurt <= 0 ? Math.max(0, 1 - u.act / ACT_T) : -1;
    // knock-back eases toward where the hit has got to (out while the blows land, home as it recovers) instead of
    // being read straight off u.hurt, so a second blow mid-recovery does not snap the troop back to upright first
    let kick = 0;
    if (hit) { const want = u.hurt > 0.09 ? 1 : u.hurt > 0 ? u.hurt / 0.09 : 0; hit.kick += (want - hit.kick) * 0.4; kick = hit.kick; if (u.hurt <= 0 && kick < 0.02) HITS.delete(u.id); }
    const lunge = ae >= 0 ? Math.sin(Math.PI * Math.min(1, ae * 1.3)) : 0;
    const lean = (lunge * 0.1 - kick * 0.14) * dirU, dx = (lunge * spec.r * 0.28 - kick * spec.r * 0.38) * dirU;
    const hc = hit ? (now - hit.t0) / 0.075 : 9, sq = hc >= 0 && hc < 1 ? 1 - 0.08 * Math.sin(Math.PI * hc) : 1;                 // a quick squash as the blow lands
    g.save();
    const fl = he >= 0 && he < 0.22 ? `brightness(${1.9 - he * 4})` : '';
    if (u.slow > 0 || fl) g.filter = `${u.slow > 0 ? 'hue-rotate(160deg) saturate(0.7) ' : ''}${fl}`.trim();                      // white flash on the hit
    const rg = art.reg?.[fr.key] || REG0, hk = h * fr.k;         // the frame's registration: holds the body steady through its cycle
    if (!sprite(g, fr.key, u.x + dx + dirU * rg[1] * hk, y + hop + fr.dy * h + rg[2] * hk, hk * rg[0], { contrast: CONTRAST_KINDS.has(u.kind), rotor: fr.rotor, flip: dirU < 0, rot: lean + (lose ? -dirU * (0.22 + 0.04 * Math.sin(now * 2 + u.id)) : 0), sx: 2 - sq, sy: lose ? sq * 0.92 : sq }) && !coming(fr.key)) { g.beginPath(); g.arc(u.x, -y - spec.r, spec.r, 0, 7); g.fillStyle = col.main; g.fill(); }
    g.restore();
    if (!spec.range && !spec.heal && ae >= 0.1 && ae < 0.62) {       // a melee blow: a blade leaves a slash arc, anything else an impact burst, where it lands
      const blade = BLADE.has(u.kind), fxi = spr(blade ? 'proj_f_4' : 'proj_f_5'), q = (ae - 0.1) / 0.52;
      if (fxi) { const sz = h * (blade ? 0.8 : 0.55) * (0.75 + 0.45 * q); stamp(g, fxi, u.x + dirU * (spec.r * 1.25 + (blade ? 4 : 8) * q), y + h * 0.5, sz * fxi.width / fxi.height, sz, { flipX: dirU < 0, alpha: 1 - q * q, rot: blade ? (q - 0.5) * 0.5 : 0 }); }
    }
    if (spec.siege && !spec.range && ae >= 0.15) {                 // a siege troop only ever strikes walls and forts: chips of stone fly back from the blow
      const tp = art.tips?.[unitKey(u.kind, 2)], im2 = spr(unitKey(u.kind, 2)), w2 = im2 ? h * im2.width / im2.height : h;
      const ox = u.x + dirU * ((tp ? tp[0] - 0.5 : 0.4) * w2), oy = y + (tp ? 1 - tp[1] : 0.5) * h, q = (ae - 0.15) / 0.85;
      for (let i = 0; i < 6; i++) {
        const a = 0.5 + ((i * 53 + u.id * 17) % 100) / 100 * 1.6, v = 40 + ((i * 31 + u.id * 7) % 50), cxp = ox - dirU * Math.cos(a) * v * q * 0.6, cyp = oy + Math.sin(a) * v * q - 70 * q * q, r = 2.2 + (i % 3) * 1.3;
        g.globalAlpha = 1 - q; g.fillStyle = i % 2 ? '#9a8f84' : '#6f655c'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.rect(cxp - r, -cyp - r, r * 2, r * 1.7); g.fill(); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (air) { g.beginPath(); g.arc(u.x, -(y + h + 12), 5, 0, 7); g.fillStyle = col.main; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
    if (u.hp < u.maxHp && !koS) bar(g, u.x, y + h + 4, Math.max(22, spec.r * 2), 6, u.hp / u.maxHp, col.main);
    if (lose) g.restore();
  }
}

function drawBonuses(g, s, now) {
  for (const b of s.bonuses) {
    const y = S.bonusY(b);
    if (b.state === 'fly') {
      sprite(g, 'bonus_crate_2', b.x, y - 56, 112, { rot: Math.sin(now * 1.6 + b.bob) * 0.05 });
      text(g, S.BONUS[b.kind].name, b.x, y + 58, 13, '#fff6c8');
    } else {
      const blink = b.state === 'ground' && b.t > S.CRATE_LIFE - 5 && Math.floor(now * 6) % 2;
      if (!blink) {
        const rot = b.state === 'fall' ? Math.sin(now * 9) * 0.15 : 0;
        sprite(g, 'bonus_crate_3', b.x, y - 2, 46, { rot });
      }
      if (b.state === 'ground') text(g, S.BONUS[b.kind].name + ' - hit to claim', b.x, 62 + Math.sin(now * 4) * 3, 15, '#fff6c8');
    }
  }
}

function drawShots(g, s) {
  for (const pr of s.projectiles) {
    const a = AMMO[pr.ammo], size = (pr.shard ? 14 : a.size * 2.5);
    if (pr.ult) {                                 // an ultimate's barrage: the caster's own shell, bomb or flaming ball, nose down
      const uk = ultimatePayload(s.players[pr.owner]?.race), ui2 = spr(uk);
      if (ui2) {
        const h = 66 + 4 * Math.sin(pr.t * 16);
        for (let i=2;i>=1;i--) stamp(g,ui2,pr.x,pr.y+30+i*24,h*ui2.width/ui2.height*.8,h*.8,{alpha:.18/i});
        stamp(g, ui2, pr.x, pr.y + 30, h * ui2.width / ui2.height, h);
        continue;
      }
    }
    if (pr.rolling != null) {                     // rolling along the ground: the wheel turns the way it travels and kicks up dust behind it
      const d = Math.sign(pr.vx) || 1;
      for (let i = 0; i < 4; i++) { const q = ((pr.t * 3.2 + i / 4) % 1); sprite(g, 'fx_3', pr.x - d * (size * 0.5 + q * 46), 2 + q * 10, 12 + q * 22, { alpha: 0.5 * (1 - q) }); }
      sprite(g, shotKey(pr.ammo), pr.x, pr.y - size / 2 + Math.abs(Math.sin(pr.t * 23)) * 1.5, size, { rot: pr.spin, anchorY: 1 });
      continue;
    }
    // motion streak
    g.strokeStyle = pr.ammo === 'fire' ? 'rgba(255,170,60,0.55)' : 'rgba(255,255,255,0.45)'; g.lineWidth = size * 0.45; g.lineCap = 'round';
    g.beginPath(); g.moveTo(pr.x, -pr.y); g.lineTo(pr.x - pr.vx * 0.035, -(pr.y - pr.vy * 0.035)); g.stroke();
    sprite(g, pr.shard ? 'shots_0' : shotKey(pr.ammo), pr.x, pr.y - size / 2, size, { rot: pr.spin * (pr.vx > 0 ? 1 : -1), anchorY: 1 });
  }
}

/** Where the troop that fired bolt f holds the tip of its weapon, in world coords (null if it cannot be found).
 *  Uses the same size and place drawUnits gives the troop. */
// What each shooting troop fires, so the shot matches the weapon in its attack picture. Sprite shots are frames of the
// Original projectile sprites, including compact energy packets; never stretch them across a firing lane.
const PROJ = {
  arrow: ['proj_a_0', 26], bullet: ['proj_a_1', 16], ball: ['proj_a_2', 17], rock: ['proj_a_3', 17], grenade: ['proj_a_4', 13], fire: ['proj_a_5', 28],
  gfire: ['proj_b_0', 28], ray: ['proj_b_1', 18], acid: ['proj_b_2', 20], web: ['proj_b_3', 20], skull: ['proj_b_4', 26], ice: ['proj_b_5', 22],
  gust: ['proj_c_0', 26], claw: ['proj_c_1', 26], wisp: ['proj_c_2', 22], bomb: ['proj_c_3', 16],
  laser: ['proj_d_0', 30], zap: ['proj_d_1', 30], shotball: ['proj_d_2', 20], tracer: ['proj_d_3', 24], rivet: ['proj_d_4', 20], ring: ['proj_d_5', 18],
  javelin: ['proj_e_0', 30], screech: ['proj_e_1', 22], spike: ['proj_e_2', 22], coconut: ['proj_e_3', 15], wail: ['proj_e_4', 26], magma: ['proj_e_5', 24],
  orb: ['proj_f_0', 20], dart: ['proj_f_1', 18], shell: ['proj_f_2', 22], keg: ['proj_f_3', 17],
};
const SHOT = {
  // one thing per shooter: within a race no two troops fire the same projectile
  archer: 'arrow', gryphon: 'javelin', dragon: 'fire', trooper: 'ray', walker: 'zap', spitter: 'acid', saucer: 'ring', mothership: 'orb',
  laser: 'laser', drone: 'dart', gunship: 'tracer', spider: 'web', cyclops: 'rock', bats: 'screech', gargoyle: 'spike',
  rifles: 'bullet', grenadier: 'grenade', tank: 'shell', chopper: 'tracer', necro: 'skull', ghost: 'wail', bonedrake: 'gfire',
  buccaneer: 'shotball', cannoneer: 'ball', parrots: 'coconut', sloop: 'keg', frost: 'ice', gale: 'gust', storm: 'zap',
  shaman: 'wisp', wyvern: 'magma', tesla: 'zap', gyro: 'rivet', zeppelin: 'bomb', bomber: 'bomb', vultures: 'bomb',
};
const SHOT_HIT = { magma: '#ff8a3c', laser: '#ff6a5c', zap: '#fff6a0', ring: '#8fd0ff', orb: '#9dff6a', dart: '#8fd0ff', wail: '#b6e3ff', fire: '#ffb347', gfire: '#9dff6a', acid: '#9dff6a', ray: '#b6f6ff', ice: '#d6f3ff', skull: '#b6e3ff', wisp: '#b9ffb0', web: '#ffffff', gust: '#ffffff' };
const BOLT = new WeakMap();                           // bolt effect -> { sp, m, flyer }, fixed at first draw
function shooterOf(s, f) {
  let u = null, best = 3;
  for (const e of s.units) { if (e.owner !== f.owner || e.hp <= 0) continue; const d = Math.abs(e.x - f.x); if (d < best) { best = d; u = e; } }
  return u;
}
function muzzleOf(s, f, now) {
  const u = shooterOf(s, f);
  if (!u) return null;
  const spec = UNIT[u.kind], ak = `a_${u.kind}_1`, own = !!spr(ak) && !!art.tips?.[ak], key = own ? ak : unitKey(u.kind, 2), im = spr(key), tp = art.tips?.[key];
  if (!im || !tp) return null;
  const h = spec.r * 3.5 * (own ? art.meta[`a_${u.kind}`].k || 1 : 1), w = h * im.width / im.height, y = spec.air ? u.y + Math.sin(now * 2.4 + u.id) * 6 : LANE_Y(u);
  return { x: u.x + (TRACKED_FACING.has(u.kind) ? Math.sign(f.tx-u.x) || monsterFacing(u, now) : S.dir(u.owner)) * (tp[0] - 0.5) * w, y: y + (1 - tp[1]) * h };
}

// ---- cartoon dust: things that break go up in a puffy cloud (sheet dust2, five frames of one burst) and throw out
// stones, bricks and planks (sheet rubble2). tools/art_dust_manifest.py; owner 2026-11-26. ----
const DUST_AT = [0, 0.1, 0.26, 0.6, 0.84, 1.001];      // when each frame of the burst starts, as a share of its life
/** One dust burst at world (x, y = its foot), q running 0..1. size is the height of its biggest frame. False until the sheet is in. */
function cloud(g, x, y, size, q, { flip = false, alpha = 1 } = {}) {
  let i = 0; while (i < 4 && q >= DUST_AT[i + 1]) i++;
  const im = spr(`dust2_${i}`), ref = spr('dust2_2');
  if (!im || !ref) return false;
  const loc = (q - DUST_AT[i]) / (DUST_AT[i + 1] - DUST_AT[i]);                 // how far through this frame
  const pop = i === 0 ? 0.7 + 0.5 * loc : 1 + 0.1 * loc, h = size * im.height / ref.height * pop, w = h * im.width / im.height;
  const squash = i === 2 ? 1 + 0.07 * Math.sin(loc * Math.PI) : 1;               // the big cloud swells once
  stamp(g, im, x, y + h * 0.36 + (i > 2 ? size * 0.12 * (i - 3 + loc) : 0), w * squash, h / squash, { flipX: flip, alpha: alpha * (i === 4 ? 1 - loc : 1) });
  return true;
}
/** n pieces of rubble thrown from world (x, y), q running 0..1: they arc out, spin, drop to the ground and fade. */
function debris(g, x, y, q, n, seed, { size = 14, away = 0, speed = 1, set = [0, 1, 2, 3, 4] } = {}) {
  if (!spr('rubble2_0')) return false;
  for (let i = 0; i < n; i++) {
    const im = spr(`rubble2_${set[i % set.length]}`); if (!im) continue;
    const an = away ? 0.25 + rnd(i, seed) * 1.2 : (i / n) * Math.PI + (rnd(i, seed) - 0.5) * 0.5, v = (80 + rnd(i, seed + 1) * 90) * speed, d = size * (0.75 + rnd(i, seed + 2) * 0.5);
    const px = x + (away || 1) * Math.cos(an) * v * q, py = Math.max(d * 0.4, y + Math.sin(an) * v * 1.5 * q - 300 * q * q);
    stamp(g, im, px, py, d * im.width / im.height, d, { rot: q * (6 + rnd(i, seed + 3) * 8) * (i % 2 ? 1 : -1), alpha: q < 0.7 ? 1 : (1 - q) / 0.3 });
  }
  return true;
}
// ---- fling shot damage numbers. The rules do not say how much a shot took off, so main.js calls preStep before each
// step of the rules while shots are flying, and the number is what the struck side lost over that step. ----
let SNAP = null;
const CHIP_AT = [0, 0];
const hpOf = (s) => ({ f: s.players.map((p) => p.fortHp), k: s.players.map((p) => p.kingHp), u: new Map(s.units.map((u) => [u.id, [u.hp, u.x, u.owner, u.y + (UNIT[u.kind]?.r || 12)]])), b: new Map(s.buildings.map((b) => [b, b.dead ? 0 : b.hp])),
  roll: s.projectiles.filter((q) => q.rolling != null).map((q) => q.owner) });
export function preStep(s) { SNAP = s.projectiles.length ? hpOf(s) : null; }
/** What side `foe` lost since the last preStep, near world x. Each loss is counted once (a second shot in the same step gets the rest). */
function shotDamage(s, foe, x) {
  if (!SNAP) return 0;
  const now = hpOf(s), lost = (a, b) => Math.max(0, (a || 0) - Math.max(0, b || 0));
  let n = lost(SNAP.f[foe], now.f[foe]) + lost(SNAP.k[foe], now.k[foe]);
  SNAP.f[foe] = now.f[foe]; SNAP.k[foe] = now.k[foe];
  for (const [id, was] of SNAP.u) if (was[2] === foe && Math.abs(was[1] - x) < 170) { n += lost(was[0], now.u.get(id)?.[0]); was[0] = now.u.get(id)?.[0] || 0; }
  for (const [b, was] of SNAP.b) if (b.owner === foe && Math.abs(b.x - x) < 170) { const h = b.dead ? 0 : b.hp; n += lost(was, h); SNAP.b.set(b, h); }
  return n;
}
/** After the step: a Rolling shot crushing troops makes no event of its own, so its numbers are read off here. */
export function postStep(s) {
  if (!SNAP || !SNAP.roll.length) return;
  for (const [id, was] of SNAP.u) {
    if (!SNAP.roll.includes(1 - was[2])) continue;
    const u = s.units.find((q) => q.id === id), n = was[0] - Math.max(0, u ? u.hp : 0);
    if (n >= 3 && s.projectiles.some((q) => q.rolling != null && q.owner !== was[2] && Math.abs(q.x - was[1]) < 60)) VFX.push({ type: 'dmg', x: was[1], y: was[3] + 22, n: Math.round(n), p: 1 - was[2], dur: 1.05 });
  }
}
export const debugVfx = () => VFX;                    // test hook (tools/art_collapse_shots.mjs)
// ---- one-off effects set off by rule events: main.js hands every event to noteEvent ----
const VFX = [];                                       // { type, x, y, p, dur, t0 } in wall-clock seconds, t0 set at first draw
const DOWN_AT = [null, null];                         // when each castle started to fall (wall clock), for the collapse
const ULT_WAVE = { robots: 0, monsters: 1, elementals: 2 }, ULT_RISE = { undead: 0, beastfolk: 1 };
const BEAMS = new WeakMap();                          // queued beam -> { fireAt } in wall-clock seconds
export function noteEvent(e, s) {
  if (e.type === 'fort-hit') {
    // The burst belongs on the castle. The rules report where the attacker was (a troop at the gate, a blast on the
    // ground in front), which is where a knocked-out chief lies: rubble seemed to come out of him (owner, 2026-11-26).
    // So the point is moved onto the castle's own wall, and small steady damage (fire, a troop's jabs) is thinned out.
    const [x0, x1] = S.fortSpan(e.p), front = e.p === 0 ? x1 : x0, t = performance.now(), small = (e.dmg || 0) < 4;
    if (small && t - (CHIP_AT[e.p] || 0) < 260) return;
    CHIP_AT[e.p] = t;
    const inside = e.x > x0 + 16 && e.x < x1 - 16, x = inside ? e.x : front - S.dir(e.p) * (14 + Math.random() * 26);
    VFX.push({ type: 'chips', x, y: Math.max(34, Math.min(FORT.h - 6, (e.y ?? 90) + (inside ? 0 : 20 + Math.random() * 50))), p: e.p, big: (e.dmg || 0) >= 14, dur: 0.75 });
  }
  else if (e.type === 'impact' || e.type === 'shield-hit') {                     // a fling shot lands: what it took off, as a number that pops and floats up
    const n = shotDamage(s, e.type === 'impact' ? 1 - e.p : e.p, e.x);
    if (n >= 1) VFX.push({ type: 'dmg', x: e.x, y: Math.max(26, (e.y ?? 0) + 26), n: Math.round(n), p: e.type === 'impact' ? e.p : 1 - e.p, dur: 1.05 });
  }
  else if (e.type === 'fort-guarded') VFX.push({ type: 'guard', x: e.x, y: e.y ?? 90, p: e.p, dur: 0.5 });
  else if (e.type === 'fort-down') VFX.push({ type: 'collapse', p: e.p, x: e.x, dur: 1.9 });
  else if (e.type === 'chief-down') VFX.push({ type: 'dizzy', p: e.p, dur: 2.4 });
  else if (e.type === 'chief-up') VFX.push({ type: 'rise', p: e.p, dur: 0.8 });
  else if (e.type === 'power') VFX.push({ type: 'power', p: e.p, level: e.level, dur: 0.9 });
  else if (e.type === 'ult' && e.shape === 'summon') VFX.push({ type: 'summon', p: e.p, x: S.gateX(e.p) + S.dir(e.p) * 185, race: s.players[e.p].race, dur: 2.4 });
  else if (e.type === 'bounty' && UNIT[e.kind] && e.y != null && VFX.reduce((n, v) => n + (v.type === 'death'), 0) < 24) VFX.push({ type: 'death', kind: e.kind, x: e.x, y: e.y, p: 1 - e.p, dur: UNIT[e.kind].air ? 1 : 0.75 });
  else if (e.type === 'round-start') { VFX.length = 0; DOWN_AT[0] = DOWN_AT[1] = null; }
  if (VFX.length > 70) VFX.splice(0, VFX.length - 70);
}
const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };      // steady pseudo-random per particle
// How a beaten troop leaves (art review A11): its own knocked-back picture plays out an exit that fits what it is,
// in place of the one beige puff every troop used to get. The rules have already removed it; this is only the picture.
const DIE_BREAK = { robots_scrap: '#9aa3ad', robots_tread: '#9aa3ad', robots_laser: '#9aa3ad', robots_bomb: '#9aa3ad', steampunk_clockwork: '#c9973f', steampunk_knight: '#c9973f', steampunk_boiler: '#c9973f',
  military_tank: '#6f7f55', aliens_walker: '#8f9bd0', pirates_cannoneer: '#5a5560', undead_skeleton: '#efe8d6', undead_golem: '#efe8d6', elementals_golem: '#8f8a84', monsters_gargoyle: '#8f8a84' };     // falls to pieces: chips of what it is made of
const DIE_SINK = new Set(['aliens_blob', 'aliens_bloblet', 'monsters_slime', 'monsters_slimelet', 'elementals_imp', 'elementals_frost', 'elementals_thorn']);      // soft things flatten and melt away
const DIE_FADE = new Set(['undead_ghost', 'elementals_gale', 'elementals_storm']);                                   // spirits and weather thin out and drift up
function drawDeath(g, f, a, q) {
  const u = UNIT[f.kind], h = u.r * 3.5, back = -S.dir(f.p), hm = art.meta?.[`h_${f.kind}`], own = hm && spr(`h_${f.kind}_1`);
  const key = own ? `h_${f.kind}_1` : unitKey(f.kind, 3), hk = h * (own ? hm.k || 1 : 1), flip = f.p === 1, feet = f.y - u.r;
  if (!spr(key)) { sprite(g, 'fx_3', f.x, f.y - 10, 50 * (1 + q), { alpha: 1 - q }); return; }
  const chips = (col, n, y0) => {
    for (let i = 0; i < n; i++) {
      const an = rnd(i, f.x) * Math.PI, v = 50 + rnd(i, 2) * 90, r = 2 + rnd(i, 3) * 3, x = f.x + Math.cos(an) * v * q, y = Math.max(1, y0 + Math.sin(an) * v * q - 260 * q * q);
      g.globalAlpha = 1 - q * q; g.fillStyle = i % 3 ? col : '#3a3a40'; g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.rect(x - r, -y - r, r * 2, r * 1.6); g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
  };
  if (u.air && DIE_FADE.has(f.kind)) {                       // thins out: stretches upward and fades
    sprite(g, key, f.x, feet + 26 * q, hk, { flip, alpha: (1 - q) * (1 - q), sx: 1 - 0.45 * q, sy: 1 + 0.5 * q });
  } else if (u.air) {                                        // shot down: tumbles out of the sky, wings folded, and hits the ground
    const T = 0.62, c = Math.min(1, a / (f.dur * T)), y = feet * (1 - c * c), machine = MACHINE.has(f.kind);
    if (c < 1) {
      if (machine) for (let i = 1; i <= 3; i++) { const cc = Math.max(0, c - i * 0.09); sprite(g, 'fx_3', f.x + back * 6 * i, feet * (1 - cc * cc) + hk * 0.5, 16 + 9 * i, { alpha: 0.5 - i * 0.12 }); }   // a trail of smoke
      sprite(g, key, f.x + back * 14 * c, y, hk, { flip, rot: back * c * (machine ? 1.1 : 2.6), sx: machine ? 1 : 1 - 0.3 * c });
    } else {
      const d = (a - f.dur * T) / (f.dur * (1 - T)), fr = Math.min(3, Math.floor(d * 4));
      if (machine) { sprite(g, `fx_${fr}`, f.x + back * 14, 0, 60 * (1 + d * 0.4), { alpha: 1 - d * d }); chips(DIE_BREAK[f.kind] || '#8a8f98', 7, 6); }
      else { sprite(g, key, f.x + back * 14, 0, hk, { flip, rot: back * 2.6, alpha: 1 - d, sx: 0.7, sy: 1 - 0.5 * d }); sprite(g, 'fx_3', f.x + back * 14, 2, 34 * (1 + d), { alpha: 0.7 * (1 - d) }); }
    }
  } else if (DIE_SINK.has(f.kind)) {                         // soft: spreads flat and melts into the ground
    sprite(g, key, f.x, feet, hk, { flip, alpha: q < 0.5 ? 1 : 1 - (q - 0.5) * 2, sx: 1 + 0.55 * q, sy: Math.max(0.08, 1 - 0.92 * q) });
  } else if (DIE_BREAK[f.kind]) {                            // built or stacked: jolts, then drops in pieces
    if (q < 0.4) sprite(g, key, f.x + Math.sin(a * 90) * 2.5 * (1 - q), feet - h * 0.25 * (q / 0.4) ** 2, hk, { flip, rot: back * 0.25 * q, alpha: 1 - (q / 0.4) ** 2 * 0.7, sy: 1 - 0.35 * (q / 0.4) });
    chips(DIE_BREAK[f.kind], Math.round(5 + u.r / 4), h * 0.4);
  } else {                                                   // flesh and blood: keels over backwards and lies there a moment
    const c = Math.min(1, q / 0.55), e = c * c * (3 - 2 * c), d = Math.max(0, (q - 0.7) / 0.3);
    sprite(g, key, f.x + back * h * 0.28 * e, feet - h * 0.3 * e + (e >= 1 ? 0 : Math.sin(Math.PI * c) * h * 0.06), hk, { flip, rot: back * 1.45 * e, alpha: 1 - d, sy: 1 - 0.15 * d });
    if (c >= 1 && d < 1) sprite(g, 'fx_3', f.x + back * h * 0.4, 0, 22 * (1 + d), { alpha: 0.45 * (1 - d) });      // a little dust as it lands
  }
}
function drawVfx(g, s, now) {
  for (const f of VFX) {
    if (f.t0 == null) { f.t0 = now; if (f.type === 'collapse') DOWN_AT[f.p] = now; }
    const a = now - f.t0, q = Math.max(0, Math.min(1, a / f.dur));
    if (f.type === 'death') { drawDeath(g, f, a, q); continue; }
    if (f.type === 'dmg') {                           // a fling shot's damage: pops, floats up and fades; bigger hits are bigger and hotter
      const pop = q < 0.12 ? 0.5 + q / 0.12 * 0.8 : q < 0.22 ? 1.3 - (q - 0.12) * 3 : 1, px = (f.n >= 60 ? 30 : f.n >= 25 ? 25 : 20) * pop;
      g.globalAlpha = q < 0.7 ? 1 : (1 - q) / 0.3;
      text(g, `-${f.n}`, f.x, f.y + 46 * (1 - (1 - q) * (1 - q)), px, f.n >= 60 ? '#ff7a3c' : f.n >= 25 ? '#ffd23c' : '#ffffff');
      g.globalAlpha = 1; continue;
    }
    if (f.type === 'chips') {                         // the castle really hurt: a puff of dust bursts from its wall and bits of it fly back toward the attacker
      const away = -S.dir(f.p);
      if (!cloud(g, f.x, f.y, f.big ? 74 : 52, q)) { g.globalAlpha = (1 - q) * 0.55; g.fillStyle = '#d9cfc2'; g.beginPath(); g.arc(f.x, -f.y, 10 + 26 * q, 0, 7); g.fill(); g.globalAlpha = 1; }
      debris(g, f.x, f.y, q, f.big ? 6 : 4, f.x * 0.7 + f.y, { size: f.big ? 17 : 13, away, speed: 0.8 });
    } else if (f.type === 'guard') {                  // the chief still stands: the shot rings off a shield of light
      const c = COLORS[f.p].light, r = 16 + 34 * q;
      g.globalAlpha = (1 - q) * 0.9; g.lineWidth = 5 * (1 - q) + 1; g.strokeStyle = c; g.beginPath(); g.arc(f.x, -f.y, r, 0, 7); g.stroke();
      g.strokeStyle = '#fff6c4'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + 0.4; g.moveTo(f.x + Math.cos(an) * r * 0.55, -f.y + Math.sin(an) * r * 0.55); g.lineTo(f.x + Math.cos(an) * r * 1.3, -f.y + Math.sin(an) * r * 1.3); }
      g.stroke();
    } else if (f.type === 'collapse') {               // the castle comes down: cartoon dust clouds burst out of it one after another while its stones and beams fly
      const [x0, x1] = S.fortSpan(f.p), w = x1 - x0;
      f.from = [x0 + w * 0.1, x1 - w * 0.1];
      for (let i = 0; i < 20; i++) {                   // pieces first, so the clouds roll over them
        const st = rnd(i, 6) * 0.55, dq = Math.max(0, Math.min(1, (a - st) / 1.25)); if (dq <= 0 || dq >= 1) continue;
        const bx = x0 + w * (0.1 + rnd(i, 7) * 0.8), by = 30 + rnd(i, 8) * (FORT.h - 20), vx = (rnd(i, 9) - 0.5) * 300, vy = 150 + rnd(i, 10) * 240, d = 15 + rnd(i, 11) * 15;
        let y = by + vy * dq - 640 * dq * dq, x = bx + vx * dq; if (y < d * 0.4) y = d * 0.4 + Math.abs(Math.sin(dq * 9 + i)) * 10 * (1 - dq);      // a little bounce where it lands
        const im = spr(`rubble2_${i % 5}`);
        if (im) stamp(g, im, x, y, d * im.width / im.height, d, { rot: dq * (rnd(i, 12) - 0.5) * 14, alpha: 1 - dq * dq * dq });
        else { g.globalAlpha = 1 - dq * dq * dq; g.fillStyle = '#8a8076'; g.fillRect(x - d / 3, -y - d / 3, d * 0.66, d * 0.55); g.globalAlpha = 1; }
      }
      for (let i = 0; i < 8; i++) {                    // eight bursts: the first in the middle, then up the walls and along the foot
        const st = i * 0.11, dq = Math.max(0, Math.min(1, (a - st) / 1.05)); if (dq <= 0 || dq >= 1) continue;
        const cx = x0 + w * (i === 0 ? 0.5 : 0.1 + rnd(i, 4) * 0.8), cy = i === 0 ? FORT.h * 0.45 : i > 4 ? 26 + rnd(i, 5) * 20 : 50 + rnd(i, 5) * (FORT.h - 40), size = i === 0 ? 150 : 88 + rnd(i, 3) * 46;
        if (!cloud(g, cx, cy, size, dq, { flip: i % 2 === 1 })) { g.globalAlpha = (1 - dq) * 0.7; g.fillStyle = i % 2 ? '#e3d9cb' : '#cbbfae'; g.beginPath(); g.arc(cx, -cy, 26 + 70 * dq, 0, 7); g.fill(); g.globalAlpha = 1; }
      }
    } else if (f.type === 'dizzy' && s.players[f.p]?.down > 0) {    // a chief out cold: stars circle his head
      const k = S.kingPos(f.p, s), im = spr('proj_f_5'), H = CHIEF_H * S.kingScale(f.p, s);
      if (im && a > 0.5) for (let i = 0; i < 3; i++) { const an = now * 4 + i * 2.094, sx = k.x - S.dir(f.p) * H * 0.45 + Math.cos(an) * 20, sy = H * 0.42 + Math.sin(an) * 6; stamp(g, im, sx, sy, 15, 15 * im.height / im.width, { alpha: Math.min(1, (a - 0.5) * 3) * (0.65 + 0.35 * Math.sin(an)), rot: an }); }
    } else if (f.type === 'power') {                  // a fling shot power level bought: gold rings burst from the sling on the castle roof, one spark per level
      const sp = S.fortSpan(f.p), x = (sp[0] + sp[1]) / 2, y = FORT.h + 45;
      g.save();
      for (let i = 0; i < 2; i++) { const c = Math.max(0, Math.min(1, q * 1.3 - i * 0.25)); if (c <= 0 || c >= 1) continue; g.beginPath(); g.arc(x, -y, 14 + c * 62, 0, 7); g.lineWidth = 9 * (1 - c) + 2; g.strokeStyle = `rgba(120,70,10,${0.5 * (1 - c)})`; g.stroke(); g.lineWidth = 6 * (1 - c) + 1; g.strokeStyle = `rgba(255,205,60,${1 - c})`; g.stroke(); }
      for (let i = 0; i < (f.level || 1); i++) { const an = -Math.PI / 2 + (i - ((f.level || 1) - 1) / 2) * 0.5, r = 22 + q * 58; g.beginPath(); g.arc(x + Math.cos(an) * r, -y + Math.sin(an) * r, 5 * (1 - q) + 1, 0, 7); g.fillStyle = `rgba(255,240,170,${1 - q})`; g.fill(); }
      g.restore();
    } else if (f.type === 'rise') {                   // back on his feet: a ring of light climbs him
      const k = S.kingPos(f.p, s), H = CHIEF_H * S.kingScale(f.p, s);
      g.globalAlpha = 1 - q; g.strokeStyle = '#fff1a8'; g.lineWidth = 4; g.beginPath(); g.ellipse(k.x, -(H * q), 30 * (1 - q * 0.4), 9, 0, 0, 7); g.stroke();
      g.strokeStyle = COLORS[f.p].light; g.lineWidth = 2; g.beginPath(); g.ellipse(k.x, -(H * q * 0.7), 36 * (1 - q * 0.4), 11, 0, 0, 7); g.stroke();
    } else if (f.type === 'bombdrop') {               // a bomb let go by a bomber: falls nose down, picks up speed, bursts on the ground
      const a = f.sim != null ? f.sim + (now - f.simAt) : now - f.t0, T = f.fall || 0.3;                          // the rules' drop time: the blast and the damage arrive together
      if (a < T) {
        const c = a / T, x = f.x + (f.tx - f.x) * c, y = f.y + (f.ty - f.y) * c * c, style = dropBombStyle(f.kind, f.big), im = art.img[style.key] || spr(style.key);
        if (im) { const h = style.height; g.globalAlpha = 0.4; g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 5, -(y + h * 0.6)); g.lineTo(x - 5, -(y + h * 0.6 + 26 * c)); g.moveTo(x + 5, -(y + h * 0.6)); g.lineTo(x + 5, -(y + h * 0.6 + 20 * c)); g.stroke(); g.globalAlpha = 1; stamp(g, im, x, y, h * im.width / im.height, h, { rot: style.finned ? Math.sin(a * 14) * 0.08 * (1 - c) : a * 7 }); }      // the big bomb wobbles on its fins as it steadies; the round one tumbles
      } else {
        if (!f.hit) { f.hit = true; art.onSound?.('boom', f.tx); }
        const c = Math.min(1, (a - T) / (f.dur - T)), h = f.splash * 1.9;
        g.strokeStyle = `rgba(255,244,200,${0.85 * (1 - c)})`; g.lineWidth = 6 * (1 - c) + 1; g.beginPath(); g.ellipse(f.tx, -f.ty + 4, f.splash * (0.3 + 0.8 * c), f.splash * (0.3 + 0.8 * c) * 0.35, 0, 0, 7); g.stroke();
        sprite(g, `fx_${Math.min(3, Math.floor(c * 4))}`, f.tx, f.ty - h * 0.2, h, { alpha: 1 - c * c });
      }
    } else if (f.type === 'summon') {                 // a summon: the thing they come from rises out of the ground, holds, sinks
      const im = spr(`ultfx_c_${ULT_RISE[f.race] ?? 0}`);
      for(let i=0;i<3;i++) {
        const key=f.race==='undead'?'proj_b_4':'proj_c_2',phase=(a*.7+i/3)%1;
        sprite(g,key,f.x+(i-1)*42,phase*90,22+phase*8,{alpha:(1-phase)*.7,rot:Math.sin(a*3+i)*.2});
      }
      if (im) { const up = a < 0.35 ? a / 0.35 : a > f.dur - 0.5 ? Math.max(0, (f.dur - a) / 0.5) : 1, h = 150, e = up * up * (3 - 2 * up); g.globalAlpha = Math.min(1, up * 1.5); sprite(g, `ultfx_c_${ULT_RISE[f.race] ?? 0}`, f.x, -h * (1 - e) * 0.5, h, { flip: f.p === 1, sy: 0.5 + 0.5 * e }); }
    }
    g.globalAlpha = 1;
  }
  for (let i = VFX.length - 1; i >= 0; i--) if (VFX[i].t0 != null && now - VFX[i].t0 > VFX[i].dur) VFX.splice(i, 1);
  // Race-specific fronts remain pinned to the simulated wave. Painted echoes stay behind it.
  for (const w of s.waves || []) {
    const race=s.players[w.owner].race,key=`ultfx_b_${ULT_WAVE[race]??0}`,d=S.dir(w.owner),h=170;
    if(race==='robots') for(let i=2;i>=1;i--)sprite(g,key,w.x-d*(h*.25+i*28),0,h*(1-i*.12),{flip:d<0,alpha:.22/i});
    if(race==='elementals')for(let i=0;i<4;i++)sprite(g,`fire_${(Math.floor(now*10)+i)%3}`,w.x-d*(35+i*30),0,55+20*Math.sin(now*9+i)**2,{flip:d<0,alpha:.65});
    const bounce=race==='monsters'?Math.abs(Math.sin(now*16))*12:Math.sin(now*8)*3;
    sprite(g,key,w.x-d*h*.25,bounce,h,{flip:d<0,sx:1+.025*Math.sin(now*15),sy:1+.035*Math.cos(now*16)});
  }
  // Render the rule's queued orbital/tesla strike as converging charges and a painted blast.
  for (const q of s.ultq || []) {
    if(q.kind!=='beam')continue;
    if(!BEAMS.has(q)) {
      BEAMS.set(q,true);
      VFX.push({type:'beam',x:q.x,p:q.owner,race:s.players[q.owner].race,radius:S.raceOf(s,q.owner).ult.r,
        dur:Math.max(0,q.t)+.55,charge:Math.max(0,q.t),t0:now});
    }
  }
  for(const f of VFX)if(f.type==='beam')drawUltimateStrike(g,f,now-f.t0,{spr,stamp,sprite,ceiling:(DRAW_LAY.gy-68)/DRAW_LAY.s});

}

function drawFx(g, s, now) {
  for (const f of s.fires) {
    const n = Math.max(2, Math.round(f.r / 28)), a = Math.min(1, f.t / 0.8);
    for (let i = 0; i < n; i++) {
      const x = f.x + (i - (n - 1) / 2) * (f.r * 1.6 / n);
      if (f.kind === 'spore') { g.beginPath(); g.arc(x, -(22 + Math.sin(now * 2 + i) * 6), 24, 0, 7); g.fillStyle = `rgba(150,200,90,${0.35 * a})`; g.fill(); }
      else sprite(g, `fire_${(Math.floor(now * 9) + i) % 3}`, x, -3, 44 + (i % 2) * 8, { alpha: a });
    }
  }
  for (const f of s.fx) {
    const k = Math.max(0, Math.min(1, f.t / f.ttl));
    if (f.kind === 'boom') { const fr = Math.min(3, Math.floor(k * 4)), h = (f.r || 40) * (f.big ? 2.4 : 1.9);
      if (k < 0.5) { const q = k / 0.5; g.strokeStyle = `rgba(255,244,200,${0.8 * (1 - q)})`; g.lineWidth = (f.big ? 10 : 6) * (1 - q) + 1; g.beginPath(); g.arc(f.x, -f.y, (f.r || 40) * (0.3 + q * (f.big ? 1.5 : 1.1)), 0, 7); g.stroke(); } if (f.spore) g.filter = 'hue-rotate(70deg)'; sprite(g, `fx_${fr}`, f.x, f.y - h * 0.45, h, { alpha: 1 - k * k }); g.filter = 'none'; }
    else if (f.kind === 'burst' || f.kind === 'pop') sprite(g, 'fx_0', f.x, f.y - 30, 60 * (1 + k), { alpha: 1 - k });
    else if (f.kind === 'rubble') {
      // something built is smashed: a cartoon dust cloud bursts where it stood and bits of it fly out, spin and fall
      const who = f.owner ?? (f.x < S.MID ? 0 : 1), big = f.y > 20;                  // buildings (y 40) burst bigger than a single block
      if (!cloud(g, f.x, f.y - 4, big ? 118 : 84, k)) sprite(g, 'fx_3', f.x, f.y - 26, 70 * (0.6 + k), { alpha: 0.75 * (1 - k) });
      if (!debris(g, f.x, f.y, k, big ? 7 : 5, f.x * 0.37 + f.y, { size: big ? 19 : 15, set: f.mat === 'stone' || f.mat === 'iron' ? [0, 1, 4, 2] : [3, 0, 3, 2, 1, 4] }))
        chunks(g, blockKey(s.players[who].race, BLK[f.mat] == null ? 'wood' : f.mat, true), f.x, f.y, k, f.x * 0.37 + f.y);
    }
    else if (f.kind === 'coin') { const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.8), cy = f.y + 20 + (1 - (1 - k) * (1 - k)) * 52; g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; sprite(g, 'ui_0', f.x - 16 * pop, cy - 9 * pop, 18 * pop); text(g, `+${f.gold}`, f.x + 8 * pop, cy, 18 * pop, '#ffe36b'); g.globalAlpha = 1; }
    else if (f.kind === 'poof') { if (!VFX.some((v) => v.type === 'death' && Math.abs(v.x - f.x) < 0.5 && Math.abs(v.y - f.y) < 0.5)) sprite(g, 'fx_3', f.x, f.y - 10, 50 * (1 + k), { alpha: 1 - k }); }      // a troop with its own exit (drawDeath) does not also get the puff
    else if (f.kind === 'bolt') {
      // a troop's shot starts at the tip of its weapon in the attack picture (assets/tips.json), not at a guessed
      // point on its body; fort and tower bolts keep the point the rules give
      let bx = f.x, by = f.y, info = BOLT.get(f);
      if (!info) {                                                  // first draw: the shooter is still standing where it fired from
        const sh0 = f.thin ? shooterOf(s, f) : null, m = sh0 ? muzzleOf(s, f, now) : null;
        const flyer = !!sh0 && s.units.some((e) => e.owner !== f.owner && UNIT[e.kind].air && Math.abs(e.x - f.tx) < 8 && Math.abs(e.y - f.ty) < 40);
        BOLT.set(f, info = { sp: sh0 ? UNIT[sh0.kind] : null, m, flyer, drop: !!sh0 && !!UNIT[sh0.kind].drop });
        // a bomber (drop: true) lets a bomb fall straight down from its belly; it bursts on the ground as wide as its splash
        if (info.drop) VFX.push(info.vfx = { type: 'bombdrop', kind: sh0.kind, x: sh0.x, y: sh0.y + UNIT[sh0.kind].r * 0.4, tx: f.tx, ty: Math.max(8, f.ty - 20), big: UNIT[sh0.kind].r >= 20, splash: UNIT[sh0.kind].splash || 40, fall: f.fly || 0.6, dur: (f.fly || 0.6) + 0.5 });
        if (sh0) { const k0 = sh0.kind.split('_').slice(1).join('_'); art.onSound?.('shot_' + (SHOT[k0] || SHOT[String(UNIT[sh0.kind].art || '').split('_').slice(1).join('_')] || 'bullet'), f.x); }
      }
      // The rules' shot follows its target (the damage lands on the troop wherever it has got to by then), so the drawn
      // shot does too: it is matched to its pending hit in s.hits (same shooter, same arrival time) and its far end rides
      // the target until it arrives or the target falls; castles, buildings and chiefs stay where the rules aimed.
      if (info.hit === undefined) info.hit = (f.fly && s.hits.find((h) => h.tkind === 'unit' && h.by?.id === f.by && h.owner === f.owner && Math.abs(h.t + f.t - f.fly) < 0.05)) || null;
      const tg = info.hit?.target;
      if (tg && tg.hp > 0 && f.t < f.fly && !info.drop) info.aim = [tg.x, tg.y + UNIT[tg.kind].r];
      const ftx = info.aim ? info.aim[0] : f.tx, fty = info.aim ? info.aim[1] : f.ty;
      if (art.trace) art.trace.push(['b', f.by, +f.t.toFixed(3), +ftx.toFixed(1), +fty.toFixed(1), tg ? +tg.x.toFixed(1) : null, f.tx, f.fly]);     // test hook: tools/art_track_check.mjs
      if (info.drop) { if (info.vfx) { info.vfx.sim = f.t; info.vfx.simAt = now; } continue; }      // the bomb keeps the rules' clock while its shot lives
      if (false) continue;                                      // drawn by drawVfx: the bomb takes longer to fall than the rules' flash lasts
      if (info.m) { bx = info.m.x; by = info.m.y; }
      // what the shooter is decides the look: armour-piercing shots go clean through and spark out the far side,
      // anti-air shots that reach a flyer are brighter and burst on it
      const sp = info.sp, aa = !!sp && (sp.vsAir || 1) > 1 && info.flyer, pierce = !!sp?.pierce;      // the burst is for flyers only, not for roof blocks
      const shot = sp ? SHOT[sp.key?.split('_').slice(1).join('_')] || SHOT[String(sp.art || '').split('_').slice(1).join('_')] || 'bullet' : DEFENCE_SHOT[s.players[f.owner]?.race] || 'arrow';
      const lob = !!sp?.noAir && !pierce, pr = PROJ[shot] || PROJ.bullet, pim = spr(pr[0]) || spr('shots_0');
      // The path is a real throw (docs/ANIMATION-RESEARCH.md): steady across, and up and down under gravity for the
      // rules' flight time fl, so a slow lobbed shot climbs high and a quick one stays flat (peak = g * fl^2 / 8).
      // Lobbed things feel the world's full gravity; arrows, spears and spells a third of it; bullets and rays none.
      const fl = f.fly || f.ttl * 0.45, grav = lob ? S.G : SHOT_STRAIGHT.has(shot) ? 0 : S.G * 0.33, peak = Math.min(150, grav * fl * fl / 8);
      const at = (q) => [bx + (ftx - bx) * q, by + (fty - by) * q + peak * 4 * q * (1 - q)];
      const left = ftx < bx;
      if (shot === 'claw') {                                 // a bite, peck or claw: slash marks on the target, nothing flies
        if (pim) stamp(g, pim, ftx, fty, 26 * (0.7 + 0.5 * k), 26 * (0.7 + 0.5 * k) * pim.height / pim.width, { flipX: left, alpha: 1 - k * k });
      } else if (pim) {
        // the thing the weapon fires flies from its tip to the target (in an arc if it is lobbed), nose first, then a
        // puff where it lands; the rules give a shot a sixth of a second, so it is quick
        const q = Math.min(1, f.t / fl);                                      // flies for the rules' flight time; the damage lands as it arrives
        if (f.t < 0.05 && SHOT_GUN.has(shot)) {                               // muzzle flash: two frames of light at the barrel
          const r = (shot === 'shell' || shot === 'shotball' ? 15 : 9) * (1 - f.t / 0.05 * 0.4); g.globalAlpha = 0.95; g.fillStyle = '#fff6c8'; g.beginPath();
          for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, rr = i % 2 ? r * 0.38 : r; g.lineTo(bx + Math.cos(an) * rr * (i % 4 === 0 ? 1.5 : 1), -(by + Math.sin(an) * rr)); } g.closePath(); g.fill(); g.globalAlpha = 1;
        }
        if (q < 1) {
          const dq = 0.03 / fl, [px, py] = at(q), [qx, qy] = at(Math.min(1, q + dq)), vx = (qx - px) || (ftx - bx) * 1e-3, vy = qy - py;
          const spin = SHOT_SPIN.has(shot), stretch = spin ? 1 : 1 + 0.22 * Math.max(0, 1 - q / 0.18), len = pr[1] * 1.4 * stretch;      // stretched as it leaves, true size in flight
          if (SHOT_GLOW.has(shot)) for (let i = 3; i >= 1; i--) {             // fire and magic leave a short fading tail of themselves
            const [ax, ay] = at(Math.max(0, q - dq * 1.6 * i)), sz = pr[1] * 1.4 * (1 - i * 0.17);
            stamp(g, pim, ax, ay, sz, sz * pim.height / pim.width, { flipX: left, rot: left ? Math.atan2(-vy, -vx) : Math.atan2(-vy, vx), alpha: 0.34 - i * 0.09 });
          }
          if (shot === 'bullet' || shot === 'tracer' || shot === 'rivet' || shot === 'ray' || shot === 'laser' || shot === 'dart') { const trail = Math.min(.06 / fl, 18 / Math.max(1, Math.hypot(ftx-bx, fty-by))), [sx, sy] = at(Math.max(0, q - trail)); g.globalAlpha = 0.45; g.strokeStyle = shot === 'ray' || shot === 'dart' ? '#8ff3ff' : shot === 'laser' ? '#ff6a5c' : '#ffe9a8'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, -sy); g.lineTo(px, -py); g.stroke(); g.globalAlpha = 1; }
          // thrown round things tumble (about a turn and a half a second, forwards); everything else flies nose first
          const rot = spin ? (left ? 1 : -1) * f.t * 9.5 : left ? Math.atan2(-vy, -vx) : Math.atan2(-vy, vx);
          stamp(g, pim, px, py, len, pr[1] * 1.4 * (spin ? 1 : 2 - stretch) * pim.height / pim.width, { flipX: left, rot });
        } else {
          if (lob && f.t - fl < 0.05) stamp(g, pim, ftx, fty - 2, pr[1] * 1.4 * 1.35, pr[1] * 1.4 * 0.6 * pim.height / pim.width, { flipX: left });      // two frames flattened on the ground before it bursts
          const e = Math.min(1, (f.t - fl) / Math.max(0.05, f.ttl - fl)), r = (lob ? 8 : 5) + (lob ? 16 : 9) * e; g.globalAlpha = 1 - e; g.beginPath(); g.arc(ftx, -fty, r, 0, 7); g.fillStyle = SHOT_HIT[shot] || '#ffe9a8'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(60,30,8,0.7)'; g.stroke();
          if (sp?.siege) for (let i = 0; i < 5; i++) { const an = 0.4 + i * 0.55, v = 16 + (i * 37 % 20), cr = 2.5 + i % 2 * 1.5; g.fillStyle = i % 2 ? '#9a8f84' : '#6f655c'; g.fillRect(ftx + Math.cos(an) * v * e * 2 - cr, -(fty + Math.sin(an) * v * e * 2 - 30 * e * e) - cr, cr * 2, cr * 1.7); }
        }
        g.globalAlpha = 1 - k;
      }
      g.globalAlpha = 1 - k;
      if (aa) {                                                     // the bonus hit on a flyer: a star burst with a ring
        const r = 9 + 16 * k; g.lineWidth = 3; g.strokeStyle = '#ffe36b'; g.beginPath(); g.arc(ftx, -fty, r, 0, 7); g.stroke();
        g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.3; g.moveTo(ftx + Math.cos(a) * r * 0.5, -fty + Math.sin(a) * r * 0.5); g.lineTo(ftx + Math.cos(a) * r * 1.35, -fty + Math.sin(a) * r * 1.35); } g.stroke();
      }
      if (pierce) {                                                 // through and through
        const dx = ftx - bx, dy = fty - by, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, ex = ftx + ux * 26, ey = fty + uy * 26;
        g.lineWidth = 2.5; g.strokeStyle = '#ffd23f'; g.beginPath();
        for (const a of [-0.7, 0, 0.7]) { const ca = Math.cos(a), sa = Math.sin(a), vx = ux * ca - uy * sa, vy = ux * sa + uy * ca, r0 = 4 + 10 * k, r1 = 10 + 22 * k; g.moveTo(ex + vx * r0, -(ey + vy * r0)); g.lineTo(ex + vx * r1, -(ey + vy * r1)); }
        g.stroke();
      }
      if (f.thin && (!sp || ['bullet', 'ball', 'ray', 'laser', 'zap'].includes(shot))) { g.beginPath(); g.arc(bx, -by, 4.5 * (1 - k) + 1.5, 0, 7); g.fillStyle = '#fff'; g.fill(); }      // a flash at the muzzle of a gun
      g.globalAlpha = 1;
    }
    else if (f.kind === 'heal') { g.strokeStyle = `rgba(120,255,170,${1 - k})`; g.lineWidth = 4; g.beginPath(); g.ellipse(f.x, -8, f.r * k, f.r * k * 0.25, 0, 0, 7); g.stroke(); }
    else if (f.kind === 'ripple') { g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 5; g.beginPath(); g.arc(f.x, -f.y, 14 + k * 40, 0, 7); g.stroke(); }
    else if (f.kind === 'sparkle') { for (let i = 0; i < 8; i++) { const a = i * 0.785 + k * 2, d = 20 + k * 60, z = 26 * (1 - k) + 8; if (!sprite(g, 'fx_0', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - z / 2, z, { rot: a + k * 3, alpha: 1 - k * k })) text(g, '✦', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 22 * (1 - k) + 6, '#ffe36b', 'center', null); } }
  }
}

/** Shots and flying bonuses that are above the top of the screen: an arrow at the top edge at their x, with a small
 *  picture of the thing, shrinking the higher it is. */
function drawAbove(g, s, ui, now) {
  const lay = DRAW_LAY, edge = lay.gy / lay.s, IDX = SHOT_IDX;
  const mark = (x, y, key, col, size) => {
    const over = y - edge; if (over <= 0) return;
    if (Math.abs(x - W / 2) < 100) x = W / 2 + (x < W / 2 ? -100 : 100);          // beside the clock, never on it
    const panelH = DRAW_LAY?.compact ? 40 : 78, underPanel = Math.abs(x - W / 2) > 250;                   // the score panels sit in the top corners
    const z = Math.max(0.55, 1 - over / 900), yy = underPanel ? Math.min(edge - 18, (ui.topY || edge) - panelH - 16) : edge - 18, bob = Math.sin(now * 8) * 2;
    g.save(); g.translate(Math.max(20, Math.min(W - 20, x)), -(yy + bob)); g.scale(z * 1.5, z * 1.5);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(13, 9); g.lineTo(-13, 9); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
    g.restore();
    sprite(g, key, Math.max(20, Math.min(W - 20, x)), yy - 20 - size * 1.5 * z, size * 1.5 * z, { alpha: 0.95 });
  };
  for (const pr of s.projectiles) mark(pr.x, pr.y, pr.ult ? ultimatePayload(s.players[pr.owner]?.race) : pr.shard ? 'shots_0' : shotKey(pr.ammo), COLORS[pr.owner]?.main || '#fff', pr.shard ? 14 : 24);
  for (const b of s.bonuses) if (b.state === 'fly') mark(b.x, S.bonusY(b), 'bonus_crate_2', '#ffd23f', 30);
}

function drawAim(g, s, ui) {
  for (const a of ui.aims.values()) {
    if (a.kind !== 'field' || !a.aim) continue;
    const p = a.p, col = COLORS[p], vel = S.launch(p, a.aim.dx, a.aim.dy, a.aim.power);
    // the pull itself, as a rubber band from the finger back to where it went down
    g.strokeStyle = col.dark; g.lineWidth = 7; g.lineCap = 'round'; g.globalAlpha = 0.55;
    g.beginPath(); g.moveTo(a.sx, -a.sy); g.lineTo(a.x, -a.y); g.stroke(); g.globalAlpha = 1;
    g.beginPath(); g.arc(a.x, -a.y, 16, 0, 7); g.fillStyle = col.main; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    if (!vel) { text(g, '✕', a.x, a.y + 40, 30, '#ff5a4a'); continue; }
    // only the first part of the flight is shown: judging the rest is the skill
    for (let i = 1; i <= 9; i++) { const q = S.arcAt(p, vel, i * 0.055); if (q.y < 0) break; g.beginPath(); g.arc(q.x, -q.y, 7.5 - i * 0.5, 0, 7); g.fillStyle = '#fff'; g.globalAlpha = 0.95 - i * 0.07; g.fill(); g.lineWidth = 2; g.strokeStyle = col.dark; g.stroke(); }
    g.globalAlpha = 1;
    const c = S.catPos(p);
    if (DRAW_LAY?.compact) bar(g, c.x + S.dir(p) * 96, c.y - 46, 84, 14, a.aim.power, a.aim.power > 0.92 ? '#ffd23f' : col.main);
    else bar(g, c.x, c.y + 78, 70, 10, a.aim.power, a.aim.power > 0.92 ? '#ffd23f' : col.main);
  }
}

function drawZones(g, s, ui, now) {
  for (const p of [0, 1]) {
    const k = ui.armed[p];
    if (!k || !BUILD[k]) continue;
    const x0 = S.mx(p, FORT.zone[0]), x1 = S.mx(p, FORT.zone[1]);
    g.fillStyle = COLORS[p].light; g.globalAlpha = 0.28 + 0.12 * Math.sin(now * 6);
    rrect(g, Math.min(x0, x1), -150, Math.abs(x1 - x0), 150, 14); g.fill(); g.globalAlpha = 1;
    text(g, `Tap here to build the ${BUILD[k].name}`, (x0 + x1) / 2, 176, 20, '#fff');
  }
}

/** The fling shot power button (owner, 2026-11-26): five pips for the levels, the price of the next one. */
function drawPowerButton(g, s, p, real, k, b, narrow, ai, col) {
  const pl = s.players[p], lv = pl.power || 0, cost = S.powerCost(s, p), can = cost != null && pl.gold >= cost;
  g.save(); g.globalAlpha = ai ? 0.45 : can || cost == null ? 1 : 0.5;
  g.translate(real.x, -real.y); g.scale(k, k);
  rrect(g, b.x, -b.y + 3, b.w, b.h, 12); g.fillStyle = 'rgba(40,22,8,0.55)'; g.fill();
  rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.fillStyle = '#f6e7c8'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  const cx = narrow ? b.w / 2 : b.x + 24;
  if (spr('shots2_2')) sprite(g, 'shots2_2', cx, b.y - b.h + (narrow ? 15 : 8), narrow ? 32 : 38);      // its own icon: a glowing stone in a drawn sling
  else sprite(g, 'shots_0', cx, b.y - b.h + (narrow ? 22 : 12), narrow ? 20 : 28);
  text(g, '▲', cx + (narrow ? 15 : 17), b.y - b.h + (narrow ? 26 : 30), narrow ? 12 : 14, '#3fbf4a', 'center', INK);
  if (!narrow) { g.font = FONT(13); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText('Power', b.x + 48 + (b.w - 54) / 2, -(b.y - 19), b.w - 54); }
  for (let i = 0; i < 5; i++) { const px = (narrow ? b.w / 2 - 26 : b.x + 10) + i * (narrow ? 13 : 9), py = narrow ? b.y - 8 : b.y - 50; g.beginPath(); g.arc(px, -py, narrow ? 4.5 : 3.5, 0, 7); g.fillStyle = i < lv ? col.main : 'rgba(60,40,20,0.25)'; g.fill(); }
  const tx = narrow ? b.w / 2 : b.x + 70;
  if (cost == null) text(g, 'MAX', tx, b.y - (narrow ? 50 : 41), narrow ? 14 : 16, '#7a4a12', 'center', null);
  else { sprite(g, 'ui_0', tx - (narrow ? 13 : 15), b.y - (narrow ? 58 : 50), narrow ? 14 : 16); text(g, String(cost), tx + 8, b.y - (narrow ? 50 : 41), narrow ? 15 : 16, '#7a4a12', 'center', null); }
  g.restore();
}

/** The ultimate button: the race's ultimate name over a meter that fills; glows when ready. */
const ULT_ORDER = ['fantasy', 'aliens', 'robots', 'monsters', 'military', 'undead', 'pirates', 'elementals', 'beastfolk', 'steampunk'];   // the order of the badges in ulticon_a and ulticon_b
function drawUltButton(g, s, p, real, k, b, narrow, ai, col) {
  const pl = s.players[p], U = S.raceOf(s, p).ult, ready = S.ultReady(s, p);
  g.save(); g.globalAlpha = ai ? 0.45 : pl.ultUsed ? 0.45 : 1;
  g.translate(real.x, -real.y); g.scale(k, k);
  rrect(g, b.x, -b.y + 3, b.w, b.h, 12); g.fillStyle = 'rgba(40,22,8,0.55)'; g.fill();
  rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.fillStyle = '#3a2a4a'; g.fill();
  g.save(); rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.clip();
  g.fillStyle = ready ? '#ffcc33' : col.main; g.fillRect(b.x, -b.y + (b.h - 3) * (1 - pl.ult), b.w, (b.h - 3) * pl.ult);
  g.restore();
  rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.lineWidth = ready ? 4 : 3; g.strokeStyle = ready ? '#fff' : INK; g.stroke();
  const label = pl.ultUsed ? 'Used' : ready ? 'GO!' : `${Math.floor(pl.ult * 100)}%`, head = ready && !narrow ? U.name : 'Ultimate';   // ready: its name on top, a big GO! below
  // the race's own ultimate badge: dim while it charges, bright and pulsing when it is ready
  const ri = ULT_ORDER.indexOf(pl.race), ik = ri < 0 ? null : `ulticon_${ri < 5 ? 'a' : 'b'}_${ri % 5}`, ic = ik && spr(ik);
  let tx = b.w / 2;
  if (ic) {
    const beat = ready ? 1 + 0.07 * Math.sin(performance.now() / 110) : 1, d = (b.h - 3) * (narrow ? 0.62 : 0.8) * beat, cx = narrow ? b.w / 2 : b.x + (b.h - 3) * 0.5 + 2, cy = (b.h - 3) * (narrow ? 0.4 : 0.5);
    g.save(); if (!ready) { g.globalAlpha *= 0.55 + 0.35 * pl.ult; g.filter = `saturate(${0.25 + 0.75 * pl.ult})`; }
    if (ready) { const gl = g.createRadialGradient(cx, cy, d * 0.3, cx, cy, d * 0.75); gl.addColorStop(0, 'rgba(255,240,150,0.9)'); gl.addColorStop(1, 'rgba(255,240,150,0)'); g.fillStyle = gl; g.fillRect(cx - d, cy - d, d * 2, d * 2); }
    g.drawImage(ic, cx - d / 2, cy - d / 2, d, d); g.restore();
    if (!narrow) tx = b.x + (b.h - 3) + (b.w - (b.h - 3)) / 2;
  }
  if (narrow && ic) text(g, label, tx, -(b.h - 14), 12, '#fff', 'center', INK);
  else {
    { const room0 = ic && !narrow ? b.w - (b.h - 3) - 8 : b.w - 10; let hs = narrow ? 12 : 13; g.font = FONT(hs); const hw = g.measureText(narrow ? 'ULT' : head).width; if (hw > room0) hs = Math.max(9, hs * room0 / hw);
      text(g, narrow ? 'ULT' : head, tx, -b.h + 16, hs, '#fff', 'center', INK); }
    const room = ic && !narrow ? b.w - (b.h - 3) - 8 : b.w - 10; let fs = narrow ? 14 : ready ? 20 : 15;
    g.font = FONT(fs); const lw = g.measureText(label).width; if (lw > room) fs = Math.max(8, fs * room / lw);   // long names shrink to fit
    text(g, label, tx, -b.h / 2 + 8, fs, '#fff', 'center', INK);
  }
  g.restore();
}
function drawHud(g, s, ui, now) {
  for (const p of [0, 1]) {
    const pl = s.players[p], col = COLORS[p], ai = s.mode === 'solo' && p === 1;
    // ---- control strip ----
    for (const real of buttons(p)) {
      const key = keyFor(s, p, real);
      if (!key) continue;
      // every button is drawn in a frame 60 units high; on phones the frame is scaled to the pixel-sized box, and
      // narrow boxes drop the name and stack picture over price
      const k = real.h / BH, b = { ...real, x: 0, y: 0, w: real.w / k, h: BH }, narrow = b.w < 96;
      if (b.kind === 'ult') { drawUltButton(g, s, p, real, k, b, narrow, ai, col); continue; }
      if (b.kind === 'power') { drawPowerButton(g, s, p, real, k, b, narrow, ai, col); continue; }
      const cost = S.costFor(s, p, key);
      const shut = !S.isOpen(s, p, key), wait = shut ? Math.max(0, S.unlockAt(s, p, key) - (s.roundT || 0)) : 0;
      const free = b.kind === 'ammo' && key !== 'stone' && pl.freeShots > 0;
      const can = free || pl.gold >= cost, on = (b.kind === 'ammo' && pl.ammo === key) || ui.armed[p] === key;
      const locked = (key === 'shield' && (s.phase === 'sudden' || s.buildings.some((q) => q.owner === p && q.kind === 'shield')))
        || (key === 'vault' && !S.placeOk(s, p, 'vault', 0))
        || ((key === 'wall' || key === 'tower' || key === 'mine') && !S.freeSlots(s, p))   // all building spots taken
        || shut || (b.kind === 'hero' && !S.heroOk(s, p));
      g.save(); g.globalAlpha = ai ? 0.45 : can && !locked ? 1 : 0.5;
      g.translate(real.x, -real.y); g.scale(k, k);
      rrect(g, b.x, -b.y + 3, b.w, b.h, 12); g.fillStyle = 'rgba(40,22,8,0.55)'; g.fill();
      rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.fillStyle = on ? col.main : '#f6e7c8'; g.fill(); g.lineWidth = 3; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      const chipped = narrow && !!UNIT[key]?.cls;
      const cx = narrow ? b.w / 2 : b.x + 24, iy = b.y - b.h + (narrow ? (chipped ? 20 : 22) : 8), tx = narrow ? b.w / 2 : b.x + 70, z = narrow ? (chipped ? 0.66 : 0.74) : 1;
      const fitH = (k2, h, maxW) => { const im = spr(k2); return im ? Math.min(h, maxW * im.height / im.width) : h; };   // height that keeps a wide picture inside its slot
      if (b.kind === 'ammo') sprite(g, shotKey(key), cx, iy + 4 * z, 36 * z);
      else if (key === 'wall' || key === 'tower') { const bk = buildKey(s.players[p].race, key), bh = fitH(bk, 45 * z, 44 * z); sprite(g, bk, cx, iy + (45 * z - bh) / 2, bh, { flip: p === 1 }); }
      else if (key === 'shield') sprite(g, 'ui_1', cx, iy + 3 * z, 38 * z);
      else if (key === 'mine') { const mk = buildKey(s.players[p].race, 'mine'), mh = fitH(mk, 42 * z, 44 * z); sprite(g, mk, cx, iy + (42 * z - mh) / 2, mh); }
      else if (key === 'vault') sprite(g, spr('builds_3') ? 'builds_3' : 'bonus_crate_3', cx, iy + 2 * z, 38 * z);
      else { const uk = unitKey(key, 0), uh = fitH(uk, 44 * z, 44 * z); sprite(g, uk, cx, iy + (44 * z - uh) / 2, uh, { flip: p === 1 }); }
      const name = AMMO[key]?.name || BUILD[key]?.name || UNIT[key].short;
      const cl = b.kind === 'unit' || UNIT[key] ? clsOf(UNIT[key]?.cls) : null;      // troops carry a class chip; with one, name and price move up to make room
      if (!narrow) { const nx = b.x + 48, room = b.w - 54; g.font = FONT(name.length > 8 ? 11 : 13); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = on ? '#fff' : INK; g.fillText(name, nx + room / 2, -(b.y - (cl ? 13 : 19)), room); }
      const label = free ? (narrow ? `x${pl.freeShots}` : `free x${pl.freeShots}`) : cost ? `${cost}` : 'free';
      const up = cl && !narrow ? 11 : 0;
      if (cost && !free) sprite(g, 'ui_0', tx - (narrow ? 13 : 15), b.y - (narrow ? 55 : 50) + up, narrow ? 14 : 16);
      text(g, label, tx + (cost && !free ? 8 : 0), b.y - (narrow ? 47 : 41) + up, narrow ? 15 : 16, on ? '#fff' : '#7a4a12', 'center', null);
      if (cl) {
        if (narrow) clsChip(g, cl, b.w / 2, b.y - 3, 9, cl.full, b.w - 6);   // full words, never abbreviations
        else { const room = b.w - 54; clsChip(g, cl, b.x + 48 + room / 2, b.y - 41, 9.5, cl.full, room); }
      }
      if (shut) {                                                      // not unlocked yet: dark cover with the time left
        g.fillStyle = 'rgba(30,16,4,0.62)'; rrect(g, b.x, -b.y, b.w, b.h - 3, 13); g.fill();
        text(g, `${Math.floor(Math.ceil(wait) / 60)}:${String(Math.ceil(wait) % 60).padStart(2, '0')}`, b.w / 2, -b.h / 2 - 1, narrow ? 16 : 19, '#fff', 'center', INK);
      } else if (b.kind === 'hero' && pl.heroCd > 0) {
        g.fillStyle = 'rgba(30,16,4,0.55)'; rrect(g, b.x, -b.y, b.w * pl.heroCd / S.HERO_CD, b.h - 3, 13); g.fill();
      }
      if (b.kind === 'ammo' && on && pl.reload > 0) { const a = AMMO[key].reload; g.fillStyle = 'rgba(30,16,4,0.5)'; rrect(g, b.x, -b.y, b.w * Math.min(1, pl.reload / a), b.h - 3, 13); g.fill(); }
      g.restore();
    }
    // a finger resting on a button (ui.held, set by input.js) shows its full name in a tag above it
    const held = ui.held && ui.held.p === p ? buttons(p).find((q) => keyFor(s, p, q) === ui.held.key) : null;
    if (held) {
      const key = ui.held.key, nm = AMMO[key]?.name || BUILD[key]?.name || UNIT[key]?.name || UNIT[key]?.short || key, k = DRAW_LAY?.compact ? held.h / 60 * 1.5 : 1;
      const hc = clsOf(UNIT[key]?.cls), role = hc ? UNIT[key].role || '' : '';
      g.font = FONT(12 * k); const rw = role ? g.measureText(role).width : 0, cw = hc ? g.measureText(hc.full).width + 14 * k : 0;
      g.font = FONT(18 * k); const tw = Math.max(g.measureText(nm).width, rw, cw) + 24 * k, th = (hc ? 30 + 20 + (role ? 17 : 0) : 30) * k;
      const cx = Math.max(DRAW_LAY ? -DRAW_LAY.ox / DRAW_LAY.s + tw / 2 + 4 : tw / 2, Math.min((DRAW_LAY ? (DRAW_LAY.w - DRAW_LAY.ox) / DRAW_LAY.s : W) - tw / 2 - 4, held.x + held.w / 2)), top = held.y + th + 8 * k;
      rrect(g, cx - tw / 2, -top, tw, th, 9 * k); g.fillStyle = 'rgba(40,24,10,0.9)'; g.fill(); g.lineWidth = 2.5 * k; g.strokeStyle = col.light; g.stroke();
      g.beginPath(); g.moveTo(held.x + held.w / 2 - 7 * k, -(top - th)); g.lineTo(held.x + held.w / 2 + 7 * k, -(top - th)); g.lineTo(held.x + held.w / 2, -(top - th - 8 * k)); g.closePath(); g.fillStyle = 'rgba(40,24,10,0.9)'; g.fill();
      text(g, nm, cx, top - 15 * k, 18 * k, '#fff', 'center', null);
      if (hc) { clsChip(g, hc, cx, top - 28 * k, 12 * k, hc.full); if (role) text(g, role, cx, top - 28 * k - 16 * k - 12 * k, 12 * k, '#f3e3c2', 'center', null); }
    }
    if (ai) text(g, `COMPUTER · ${String(ui.aiLevel).toUpperCase()}`, S.mx(p, 325), -110, 24, '#fff');
    // ---- top panel: chief HP, gold, rounds ----
    const x = S.mx(p, 210), top = ui.topY, d = p === 0 ? 1 : -1, al = p === 0 ? 'left' : 'right', slim = !!DRAW_LAY?.compact;
    const hpK = pl.fortHp / pl.fortMax, hpCol = hpK > 0.35 ? '#6fd45a' : '#ff5a4a';   // castle health: the objective
    if (slim) {
      // phones: one row (heart, HP, gold, rounds), starting clear of the slingshot on the back tower
      const left = S.mx(p, 122);
      rrect(g, Math.min(left, left + d * 318), -top, 318, 40, 14); g.fillStyle = 'rgba(40,24,10,0.62)'; g.fill();
      sprite(g, 'ui_2', left + d * 20, top - 31, 22);
      bar(g, left + d * 100, top - 28, 120, 16, hpK, hpCol);
      text(g, `${Math.ceil(pl.fortHp)}`, left + d * 100, top - 20, 13, '#fff', 'center');
      sprite(g, 'ui_0', left + d * 184, top - 32, 24);
      text(g, `${Math.floor(pl.gold)}`, left + d * 200, top - 20, 22, '#ffe36b', al);
      for (let i = 0; i < S.ROUNDS_TO_WIN; i++) { g.beginPath(); g.arc(left + d * (302 - i * 18), -(top - 20), 6, 0, 7); g.fillStyle = i < s.roundsWon[p] ? '#ffd23f' : 'rgba(255,255,255,0.25)'; g.fill(); }
    } else {
      const left = S.mx(p, 24);
      rrect(g, Math.min(left, left + d * 390), -top, 390, 78, 16); g.fillStyle = 'rgba(40,24,10,0.62)'; g.fill();
      g.font = FONT(20); g.textAlign = al; g.textBaseline = 'middle'; g.fillStyle = col.light; g.fillText(RACES[pl.race].name, left + d * 14, -(top - 20), 200);
      // income sits in the top row beside the round dots, so it can never run into the gold number
      text(g, `+${S.incomeOf(s, p).toFixed(1).replace('.0', '')}/s`, left + d * (350 - S.ROUNDS_TO_WIN * 24), top - 20, 14, '#fff6c8', p === 0 ? 'right' : 'left', null);
      for (let i = 0; i < S.ROUNDS_TO_WIN; i++) { g.beginPath(); g.arc(left + d * (360 - i * 24), -(top - 20), 8, 0, 7); g.fillStyle = i < s.roundsWon[p] ? '#ffd23f' : 'rgba(255,255,255,0.25)'; g.fill(); }
      sprite(g, 'ui_2', left + d * 26, top - 68, 24);
      bar(g, left + d * 135, top - 66, 180, 18, hpK, hpCol);
      text(g, `${Math.ceil(pl.fortHp)}`, left + d * 135, top - 57, 14, '#fff', 'center');
      sprite(g, 'ui_0', left + d * 262, top - 70, 28);
      text(g, `${Math.floor(pl.gold)}`, left + d * 282, top - 56, 24, '#ffe36b', al);
    }
    if (pl.rapid > 0) text(g, `rapid ${Math.ceil(pl.rapid)}s`, x, top - (slim ? 58 : 96), 16, '#9fe0ff');
    const t = ui.toast[p];
    if (t && t.until > now) text(g, t.text, S.mx(p, 330), 330, 22, '#fff');
  }
  // ---- clock ----
  const sud = s.phase === 'sudden', secs = Math.max(0, Math.ceil(s.clock));
  rrect(g, W / 2 - 74, -ui.topY, 148, 56, 16); g.fillStyle = sud ? 'rgba(170,30,20,0.85)' : 'rgba(40,24,10,0.62)'; g.fill();
  text(g, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, W / 2, ui.topY - 30, 30, sud && Math.floor(now * 3) % 2 ? '#ffd23f' : '#fff');
  if (sud) text(g, 'SUDDEN DEATH · double damage', W / 2, ui.topY - 76, 18, '#ffd23f');
  g.beginPath(); g.arc(PAUSE.x, -PAUSE.y, PAUSE.r, 0, 7); g.fillStyle = 'rgba(40,24,10,0.62)'; g.fill();
  g.fillStyle = '#fff'; g.fillRect(PAUSE.x - 9, -PAUSE.y - 10, 6, 20); g.fillRect(PAUSE.x + 3, -PAUSE.y - 10, 6, 20);
  // ---- banners ----
  const BY = Math.min(400, (ui.topY || 880) - 205);                  // mid-sky banners sit below the pause button on short screens
  const camOn = ui.cam && performance.now() / 1000 - ui.cam.at < ui.cam.dur - 0.4;   // the knockout zoom plays first, then the banner
  if ((s.phase === 'roundOver' || s.phase === 'over') && !camOn) {
    const w = s.phase === 'over' ? s.winner : s.roundWinner;
    const msg = w < 0 ? (s.phase === 'over' ? 'Match drawn' : 'Round drawn') : `${RACES[s.players[w].race].name} ${s.phase === 'over' ? 'win the match!' : 'win the round'}`;
    const yB = Math.min(386, BY + 20);                               // under the pause button on short screens
    rrect(g, W / 2 - 380, -(yB + 44), 760, 110, 24); g.fillStyle = 'rgba(40,24,10,0.8)'; g.fill();
    text(g, msg, W / 2, yB, 44, w < 0 ? '#fff' : COLORS[w].light);
    text(g, `${s.roundsWon[0]} – ${s.roundsWon[1]}`, W / 2, yB - 44, 24, '#fff');
  } else if (camOn) {
    // nothing over the knockout
  } else if (false) {
  } else if (s.ultShow && s.time - s.ultShow.at < 2.0) {                // an ultimate: its name across the sky in the caster's colour
    const a = s.time - s.ultShow.at;
    text(g, s.ultShow.name + '!', W / 2, BY, 58 * Math.min(1, a * 4), COLORS[s.ultShow.p].light);
  } else if (s.tier > 1 && (s.roundT || 0) - S.tierAt(s, s.tier) < 2.4 && !s.open) {   // a new tier
    const a = s.roundT - S.tierAt(s, s.tier), TN = ['', 'Skirmish', 'Battle!', 'War!'];
    const z = Math.min(1, a * 3), pop = z < 1 ? z * (1.25 - 0.25 * z) : 1, bn = spr('tierbanner_0');
    if (bn) { const bw = 500 * pop; stamp(g, bn, W / 2, BY, bw, bw * bn.height / bn.width, { alpha: Math.min(1, (2.4 - a) * 3) }); text(g, `Tier ${s.tier}: ${TN[s.tier]}`, W / 2, BY + 3, 32 * pop, '#6a3a10', 'center', '#fff3c4'); }
    else text(g, `Tier ${s.tier}: ${TN[s.tier]}`, W / 2, BY, 50 * z, '#ffd23f');
  } else if ((s.roundT || 0) < 2.2 && s.phase === 'play') {
    text(g, s.round === 1 ? 'Fling!' : `Round ${s.round}`, W / 2, BY, 64 * Math.min(1, (s.roundT || 0) * 3), '#fff');
  }
}

function drawPick(g, s, ui, now) {
  const pk = ui.pick;
  g.fillStyle = 'rgba(30,18,8,0.6)'; g.fillRect(-400, -1400, W + 800, 1700);
  for (const p of [0, 1]) {
    const col = COLORS[p], ai = pk.mode === 'solo' && p === 1;
    text(g, ai ? 'Computer' : p === 0 ? 'Left player: pick your people' : 'Right player: pick your people', S.mx(p, 325), 592, 24, col.light);
    for (const c of PICK.cards) {
      const x = p === 0 ? c.x : W - c.x - c.w, r = RACES[c.key], on = pk.race[p] === c.key;
      rrect(g, x, -c.y, c.w, c.h, 14); g.fillStyle = on ? '#fff3d6' : 'rgba(246,231,200,0.9)'; g.fill(); g.lineWidth = on ? 6 : 3; g.strokeStyle = on ? col.main : INK; g.stroke();
      sprite(g, kingKey(c.key), x + c.w / 2, c.y - 112, 88, { flip: p === 1 });
      g.font = FONT(15); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText(r.name, x + c.w / 2, -(c.y - 128), c.w - 10);
    }
    // details of the chosen people
    const r = RACES[pk.race[p]], x0 = p === 0 ? 14 : W - 636;
    rrect(g, x0, -262, 622, 160, 14); g.fillStyle = 'rgba(40,24,10,0.72)'; g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    if (r) {
      g.font = FONT(19); g.fillStyle = col.light; g.fillText(`${r.name} · ${r.theme}`, x0 + 14, -244, 594);
      g.font = FONT(14, 600); g.fillStyle = '#fff'; g.fillText(r.tag, x0 + 14, -222, r.leanLine ? 340 : 594);
      if (r.leanLine) { g.textAlign = 'right'; g.font = FONT(13, 800); g.fillStyle = '#ffe36b'; g.fillText(`Builds: ${r.leanLine.plain}`, x0 + 608, -222, 240); g.textAlign = 'left'; }   // the race's building leaning (races.js lean)
      // two strengths left, two weaknesses right: the trait's name, then what it does in words (js/traits.js plainText)
      for (const [list, xx, colr, mark] of [[r.traitLines.plus, x0 + 14, '#9be88a', '+ '], [r.traitLines.minus, x0 + 318, '#ffab96', '– ']]) list.forEach((l, i) => {
        const yy = 203 - i * 28; g.fillStyle = colr; g.font = FONT(14, 800); g.fillText(mark + l.label, xx, -yy, 292);
        g.fillStyle = '#f3e3c2'; g.font = FONT(12, 600); g.fillText(l.plain, xx + 14, -(yy - 14), 278);   // words only, no numbers (owner); the Guidebook keeps the numbers
      });
      // One chief sentence, from the same tuning text as the Guidebook. The bottom strip holds two
      // readable lines instead of squeezing a long sentence to subpixel text on a landscape phone.
      const chief = S.KING_ATK[pk.race[p]];
      if (chief?.what && chief?.weak) {
        const what = chief.what[0].toLowerCase() + chief.what.slice(1);
        const summary = `Chief: ${what}, weak to ${chief.weak}`;
        g.font = FONT(24, 600); g.fillStyle = '#fff3cf';
        const lines = []; let line = '';
        for (const word of summary.split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (line && g.measureText(next).width > 594) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        lines.forEach((line, i) => g.fillText(line, x0 + 14, -(lines.length === 1 ? 128 : 140 - i * 25)));
        if (art.trace) art.trace.push(['pickChief', p, pk.race[p], summary, lines, 24]);
      }
    } else { g.font = FONT(18, 600); g.fillStyle = '#fff'; g.fillText('Tap a card to see its troops and powers', x0 + 14, -182, 594); }
    const rd = PICK.ready, rx = p === 0 ? rd.x : W - rd.x - rd.w, ready = pk.ready[p], can = !!pk.race[p];
    rrect(g, rx, -rd.y, rd.w, rd.h, 20); g.fillStyle = ready ? '#6fd45a' : can ? col.main : 'rgba(120,110,100,0.8)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    text(g, ready ? 'Ready!' : can ? 'Tap when ready' : 'Choose a card', rx + rd.w / 2, rd.y - rd.h / 2, 24, '#fff');
  }
  void now;
}

let DRAW_LAY = null;                              // the layout of the frame being drawn
export function draw(g, lay, s, ui, now) {
  DRAW_LAY = lay;
  PREVIEW = !!(ui.menu || ui.pick);
  if (!PREVIEW) for (const p of s.players) if (RACE_DATA_KEYS.has(p.race)) loadGroup(p.race);
  // ult+ is a standalone group, not a race's second-stage library. Warm before activation.
  if (!PREVIEW && s.players.some(p => p.ult >= .5 || p.ultUsed)) loadGroup('ult+');
  for (const v of VFX) if (v.type === 'collapse' && v.t0 == null) { v.t0 = now; DOWN_AT[v.p] = now; }      // before the castle is drawn, or it shows one frame as finished rubble
  drawBackdrop(g, lay);
  ui.topY = Math.min((lay.gy - 8) / lay.s, 880);
  const shake = ui.shake > 0 ? ui.shake * 7 : 0;
  const cam = camera(lay, ui);
  const worldT = () => g.setTransform(lay.dpr * lay.s * cam.z, 0, 0, lay.dpr * lay.s * cam.z, lay.dpr * (cam.ox + (shake ? Math.sin(now * 90) * shake : 0)), lay.dpr * (cam.oy + (shake ? Math.cos(now * 70) * shake : 0)));
  const flatT = () => g.setTransform(lay.dpr * lay.s, 0, 0, lay.dpr * lay.s, lay.dpr * lay.ox, lay.dpr * lay.gy);
  worldT();
  PAUSE.y = ui.topY - 100;
  const wrecks = [];                            // the losing sling must remain readable in front of castle dust
  drawFort(g, s, 0, ui, now, wrecks); drawFort(g, s, 1, ui, now, wrecks);
  if (ui.menu) return;
  if (ui.pick) { drawPick(g, s, ui, now); return; }
  drawZones(g, s, ui, now);
  drawSlots(g, s, now);
  drawBuildings(g, s, now);
  drawSlots(g, s, now, true);
  drawUnits(g, s, now);
  for (const p of [0, 1]) drawChief(g, s, p, now);                // chiefs guard in front of their castles
  drawBonuses(g, s, now);
  drawShots(g, s);
  drawFx(g, s, now);
  drawVfx(g, s, now);
  for (const drawWreck of wrecks) drawWreck();
  drawAim(g, s, ui);
  drawKo(g, s, now);
  if (cam.z > 1.001) flatT();                     // the control strip, clock and banners do not zoom
  drawHud(g, s, ui, now);
  drawAbove(g, s, ui, now);
}
/** The knockout camera: eases in onto the beaten chief, holds, eases back out. Returns zoom and screen offset. */
function camera(lay, ui) {
  const c = ui.cam, flat = { z: 1, ox: lay.ox, oy: lay.gy };
  if (!c) return flat;
  const t = performance.now() / 1000 - c.at;
  if (t < 0 || t > c.dur) return flat;
  const ease = (q) => q * q * (3 - 2 * q), k = t < 0.45 ? ease(t / 0.45) : t > c.dur - 0.7 ? ease((c.dur - t) / 0.7) : 1;
  const z = 1 + (c.zoom - 1) * k;
  // keep the chief (a little above his feet) at the middle of the playing area while zooming
  const fx = lay.ox + c.x * lay.s, fy = lay.gy - (c.y + 20) * lay.s, tx = lay.w / 2, ty = Math.min(lay.gy * 0.62, lay.h * 0.45);
  const sx = fx + (tx - fx) * k, sy = fy + (ty - fy) * k;            // where the chief sits on screen this frame
  return { z, ox: sx - c.x * lay.s * z, oy: sy + (c.y + 20) * lay.s * z - (lay.gy - lay.gy) };
}
/** Stars circling the knocked-out chief's head and a "K.O.!" pop. */
function drawKo(g, s, now) {
  for (const p of [0, 1]) if (s.players[p].down > 0) drawKoOne(g, s, p, now);
}
function drawKoOne(g, s, p, now) {
  const ko = { loser: p, at: s.players[p].koAt ?? s.time };
  const a = s.time - ko.at, k = S.kingPos(ko.loser, s), H = CHIEF_H * S.kingScale(ko.loser, s);
  if (a > 2.2 && (s.phase === 'play' || s.phase === 'sudden')) text(g, `${Math.ceil(s.players[p].down)}`, k.x, H * 0.85, 22, '#fff');   // seconds until he gets up
  if (a > 0.35) for (let i = 0; i < 4; i++) {
    const t = now * 3 + i * Math.PI / 2, hx = k.x - S.dir(ko.loser) * H * 0.55;
    sprite(g, 'fx_0', hx + Math.cos(t) * H * 0.32, H * 0.22 + Math.sin(t) * H * 0.08, H * 0.2, { rot: now * 4, alpha: 0.95 });
  }
  if (a < 2.2) { const z = Math.min(1, a * 5); text(g, 'K.O.!', k.x + S.dir(ko.loser) * H * 1.05, H * 0.75 + 12 * z, 38 * z, '#ffd23f'); }   // beside him, out over the field (clear of the clock when zoomed)
}
