// view.js — sprite loading and all drawing (art and game-feel lane, see docs/COORDINATION.md). Side view: left fort v
// right fort. Layout and touch geometry live in layout.js and are re-exported here for existing imports.
import * as S from './sim.js';
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
const raceGroup = (name) => { const m = /^(?:t|fortblk|kingatk|kingfx)_([a-z]+)(?:_|$)/.exec(name); return m && RACE_DATA_KEYS.has(m[1]) ? m[1] : 'core'; };
let RACE_DATA_KEYS = new Set();
/** Load one group of sprites; returns a promise that settles when all of them are in (or failed). */
export function loadGroup(name) {
  if (art.state[name]) return art.state[name].done;
  const st = art.state[name] = { ready: false, done: null };
  st.done = Promise.all((art.groups[name] || []).map(([key, file]) => new Promise((ok) => { const im = new Image(); im.onload = () => { art.img[key] = im; ok(); }; im.onerror = () => ok(); im.src = art.base + file; }))).then(() => { st.ready = true; });
  return st.done;
}
export async function loadArt(base = 'assets/') {
  art.base = base;
  art.meta = await (await fetch(base + 'sprites.json')).json();
  try { art.tips = await (await fetch(base + 'tips.json')).json(); } catch { art.tips = {}; }      // weapon tips of attack pictures (tools/art_tips.py)
  RACE_DATA_KEYS = new Set(S.RACE_KEYS.filter((r) => art.meta[`king_${r}`] && !['forge', 'reed', 'moss'].includes(r)));
  for (const [name, m] of Object.entries(art.meta)) {
    const grp = raceGroup(name), add = (key, file) => { (art.groups[grp] ||= []).push([key, file]); art.groupOf[key] = grp; };
    if (m.file) add(name, m.file);
    else m.frames.forEach((f, i) => add(`${name}_${i}`, f.file));
  }
  await loadGroup('core');
  art.ready = true;
}
/** The loaded image for a key, or null. Asking for a sprite of a race that has not loaded yet starts its load. */
const spr = (key) => { const im = art.img[key]; if (im) return im; const grp = art.groupOf[key]; if (grp && !art.state[grp]) loadGroup(grp); return null; };
/** True while a sprite exists but its race is still loading: draw nothing for a moment instead of a stand-in. */
const coming = (key) => { const grp = art.groupOf[key]; return !!grp && !art.state[grp]?.ready; };
// ---- sprite lookups with fallbacks, so a race plays before its own art has arrived ----
const OLD_KINGS = ['king_forge_0', 'king_reed_0', 'king_moss_0'];
export const unitKey = (kind, frame) => (spr(`t_${kind}_${frame}`) || coming(`t_${kind}_${frame}`) ? `t_${kind}_${frame}` : `t_${UNIT[kind].art}_${frame}`);
export const kingKey = (race) => (spr(`king_${race}_0`) || coming(`king_${race}_0`) ? `king_${race}_0` : OLD_KINGS[S.RACE_KEYS.indexOf(race) % 3]);
const BLK = { wood: 0, stone: 1, iron: 2 };
function blockKey(race, kind, worn) {
  if (kind === 'vault') return spr('builds_3') ? 'builds_3' : 'bonus_crate_3';
  const k = `fortblk_${race}_${BLK[kind] + (worn ? 3 : 0)}`;
  return spr(k) || coming(k) ? k : kind === 'wood' ? (worn ? 'blocks_1' : 'blocks_0') : worn ? 'blocks_3' : 'blocks_2';
}

// ---------- drawing helpers ----------
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
/** Draw a sprite with its bottom-centre at world (x, y), `h` world units tall. flip mirrors it; rot spins about its centre. */
function sprite(g, key, x, y, h, { flip = false, rot = 0, alpha = 1, sx = 1, sy = 1, anchorY = 1 } = {}) {
  const im = spr(key);
  if (!im) return false;
  const w = h * im.width / im.height;
  g.save();
  g.translate(x, -y);
  if (rot) { g.translate(0, -h * (anchorY - 0.5)); g.rotate(rot); g.translate(0, h * (anchorY - 0.5)); }
  g.scale((flip ? -1 : 1) * sx, sy);
  if (alpha !== 1) g.globalAlpha *= alpha;
  g.drawImage(im, -w / 2, -h * anchorY, w, h);
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
function drawKingFx(g, race, tip, x, H, face, t, now) {
  const F = KING_FX[race], im = F && spr(`kingfx_${race}_0`);
  if (!im) return;
  const k = H / CHIEF_H, h = F.h * k, w = h * im.width / im.height, len = F.len * k, fl = face < 0;
  const ox = tip.x, oy = tip.y, ease = 1 - (1 - t) * (1 - t), fade = t < 0.6 ? 1 : (1 - t) / 0.4;
  if (F.style === 'beam' || F.style === 'bolt') {
    // snaps out from the tip to full length in the first fifth, flickers, then thins away; the bolt flips to crackle
    const L = Math.max(w, len) * Math.min(1, 0.25 + t * 4), thin = F.style === 'beam' ? (t < 0.6 ? 1 + 0.18 * Math.sin(now * 70) : (1 - t) / 0.4) : 1 + 0.12 * Math.sin(now * 90);
    stamp(g, im, ox + face * L / 2, oy, L, h * thin, { flipX: fl, flipY: F.style === 'bolt' && Math.floor(now * 26) % 2 === 1, alpha: F.style === 'bolt' ? fade : 1 });
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
const CHIEF = [{ x: null, walk: 0, act: 0, hit: -9 }, { x: null, walk: 0, act: 0, hit: -9 }];     // last drawn x and how recently he moved, per player
/** The chief (he fights now): walks out with a stepping bob, swings while pl.kingAct > 0 (his own attack picture
 *  kingatk_<race>_0 when it exists, a lunge of the standing picture until then), heals at home with rising green
 *  plus signs, and shows an HP bar whenever he is out of the fort or hurt. */
function drawChief(g, s, p, now) {
  const pl = s.players[p], k = S.kingPos(p, s), home = S.kingPos(p).x, st = CHIEF[p];
  const face = pl.kingFace || S.dir(p), flip = face < 0, hurt = pl.kingFlash > 0, out = Math.abs(k.x - home) >= 1;
  if (st.x != null && Math.abs(k.x - st.x) > 0.05) st.walk = now;
  st.x = k.x;
  if ((pl.kingAct || 0) > st.act + 0.05) st.hit = now;                     // kingAct jumped up: a new strike starts
  st.act = pl.kingAct || 0;
  // one strike = KING_FX_T seconds from the moment kingAct jumps: the weapon pose is held for all of it, so the
  // effect never plays over a chief who has already gone back to standing
  const ft = (now - st.hit) / KING_FX_T, striking = ft >= 0 && ft < 1;
  const walking = now - st.walk < 0.12 && !striking, sw = striking ? Math.sin(Math.PI * Math.min(1, ft * 1.6)) : 0;
  const bob = walking ? Math.abs(Math.sin(now * 11)) * 5 : Math.sin(now * 2.2 + p * 2) * 1.5;
  const atk = `kingatk_${pl.race}_0`, useAtk = striking && !!spr(atk);
  // size: CHIEF_H at home (as tall as the two-block hollow under his roof allows) times the rules' own scale
  // (S.kingScale: 1 at home, growing once he is out), so the picture matches what shots hit
  const big = S.kingScale(p, s), H = CHIEF_H * big;
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
    sprite(g, atk, x, 0, ha, { flip });
    if (tp) tip = { x: x + face * (tp[0] - 0.5) * wa, y: (1 - tp[1]) * ha };
  }
  else sprite(g, kingKey(pl.race), x, walking ? bob : 0, walking ? H : H + bob, { flip, rot: face * (sw * 0.28 + (walking ? Math.sin(now * 11) * 0.05 : 0)) });
  g.restore();
  if (striking) drawKingFx(g, pl.race, tip, x, H, face, ft, now);
  // a twinkle on his crown
  { const tw = (now * 0.9 + p * 0.5) % 1, z = Math.sin(Math.PI * tw); if (z > 0.05) sprite(g, 'fx_0', k.x + face * H * 0.04, H * 0.92 - H * 0.11 * z, H * 0.22 * z, { rot: now * 2, alpha: 0.9 * z }); }
  if (pl.kingHeal) {
    g.beginPath(); g.ellipse(k.x, -6, H * 0.5, H * 0.13, 0, 0, 7); g.fillStyle = `rgba(120,255,170,${0.22 + 0.1 * Math.sin(now * 4)})`; g.fill();
    for (let i = 0; i < 4; i++) { const q = (now * 0.7 + i / 4) % 1; text(g, '+', k.x + Math.sin(i * 2.4 + p) * 26, 14 + q * H, 22 - q * 6, `rgba(140,255,160,${1 - q})`, 'center', `rgba(20,70,30,${0.8 * (1 - q)})`); }
  }
  if (out || pl.kingHp < pl.kingMax - 0.5) {
    const f = pl.kingHp / pl.kingMax;
    const by = H + 16;
    rrect(g, k.x - 33, -(by + 12), 66, 12, 6); g.fillStyle = INK; g.fill();
    bar(g, k.x, by + 1, 62, 10, f, f > 0.35 ? '#6fd45a' : '#ff5a4a');
    sprite(g, 'ui_2', k.x - 36, by - 2, 16);
  }
}
const SLING_DIR = [null, null];                  // the last aim direction per player, for the snap after a shot
function drawFort(g, s, p, ui, now) {
  const col = COLORS[p], pl = s.players[p], flip = p === 1;
  const c = S.catPos(p);
  // stone tower under the slingshot
  const towerTop = Math.floor((c.y - 100) / CELL) * CELL;            // whole blocks, ending just under the sling's base
  for (let y = 0; y < towerTop; y += CELL) for (const dx of [-22, 22]) sprite(g, 'blocks_2', c.x + dx, y, CELL + 1);
  rrect(g, c.x - 50, -(towerTop + 8), 100, 10, 4); g.fillStyle = '#6d6a66'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  // slingshot: a Y frame on the tower; two bands run from the prong tips to a leather pouch that is pulled back
  // along the aim while a finger drags, and snaps forward and wobbles after a shot. The launch point (S.catPos) is the
  // middle of the fork, so the physics is untouched.
  const aim = ui.aimOf?.[p], kick = Math.max(0, (ui.kick?.[p] || 0)), d = S.dir(p);
  const SL = { h: 118, drop: 99, back: { x: -25, y: 0 }, front: { x: 25, y: 0 } };      // frame size and where the bands tie on, from the fork middle
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
  if (hasSling) {
    band(tipB);                                                          // the far band goes behind the frame
    sprite(g, 'sling_0', c.x, c.y - SL.drop, SL.h, { flip });
    const loaded = aim || (pl.reload <= 0 && kick <= 0);
    if (loaded) { const IDX = { stone: 0, scatter: 1, fire: 2, boulder: 3 }; sprite(g, `shots_${IDX[pl.ammo] ?? 0}`, pouch.x + Math.cos(ang) * 3 * d * 0, pouch.y - 10, 20, { anchorY: 1 }); }
    sprite(g, 'sling_1', pouch.x, pouch.y - 9, 18, { flip, rot: flip ? -ang + Math.PI : ang });
    band(tipF);                                                          // the near band in front of everything
  } else sprite(g, 'catapult_0', c.x, c.y - 14, 62, { flip });
  // flag in the side colour
  const fx = S.colX(p, 3), fy = S.rowY(2) + CELL / 2 + 4;
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(fx, -fy + 44); g.lineTo(fx, -fy - 46); g.stroke();
  const wave = Math.sin(now * 3 + p) * 4;
  g.beginPath(); g.moveTo(fx, -fy - 46); g.quadraticCurveTo(fx + d * 20, -fy - 50 + wave, fx + d * 38, -fy - 38); g.quadraticCurveTo(fx + d * 20, -fy - 30 - wave, fx, -fy - 24); g.closePath();
  g.fillStyle = col.main; g.fill(); g.stroke();
  // the chief: behind his blocks while he is at home, drawn again in front of the troops when he is out fighting
  if (ui.menu || ui.pick || Math.abs(S.kingPos(p, s).x - S.kingPos(p).x) < 1) drawChief(g, s, p, now);
  // blocks
  for (const b of s.blocks) {
    if (b.owner !== p || b.dead) continue;
    const q = S.blockPos(b), worn = b.hp < b.maxHp * 0.5;
    const key = blockKey(pl.race, b.kind, worn);
    g.save(); if (b.flash > 0) g.filter = 'brightness(1.7)';
    sprite(g, key, q.x, q.y - CELL / 2 + b.drop, CELL + 2);
    g.restore();
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
      bar(g, b.x, FORT.domeR + 12, 70, 9, b.hp / b.maxHp, '#8fd8ff');
      continue;
    }
    const h = S.GEOM[b.kind].h + 10;
    const bk = b.kind === 'wall' ? 'builds_0' : b.kind === 'tower' ? 'builds_1' : spr('builds_2') ? 'builds_2' : 'bonus_crate_2';
    g.save(); if (b.flash > 0) g.filter = 'brightness(1.7)';
    sprite(g, bk, b.x, -4, h, { flip: b.owner === 1 });
    if (b.kind === 'mine') text(g, `+${BUILD.mine.income}`, b.x, h + 14 + Math.sin(now * 3 + b.id) * 2, 14, '#ffe36b');
    g.restore();
    g.beginPath(); g.ellipse(b.x, 2, 24, 6, 0, 0, 7); g.fillStyle = col.main; g.globalAlpha = 0.75; g.fill(); g.globalAlpha = 1;
    if (b.hp < b.maxHp) bar(g, b.x, h + 6, 44, 7, b.hp / b.maxHp, col.main);
  }
}

function drawUnits(g, s, now) {
  const us = s.units.slice().sort((a, b) => (UNIT[a.kind].air ? 1 : 0) - (UNIT[b.kind].air ? 1 : 0) || b.lane - a.lane);
  for (const u of us) {
    const spec = UNIT[u.kind], col = COLORS[u.owner], h = spec.r * 3.5, air = !!spec.air;
    const y = air ? u.y + Math.sin(now * 2.4 + u.id) * 6 : -2 - u.lane * 9;
    const frame = u.hurt > 0 ? 3 : u.act > 0 ? 2 : air ? Math.floor(now * 5 + u.id) % 2 : Math.floor(u.walk) % 2;
    const hop = air || u.act > 0 || u.hurt > 0 ? 0 : Math.abs(Math.sin(u.walk * Math.PI)) * spec.r * 0.22;
    // team-colour disc on the ground (a fainter shadow under flyers)
    g.beginPath(); g.ellipse(u.x, air ? 0 : -y + 1, spec.r * (air ? 0.9 : 1.15), spec.r * (air ? 0.24 : 0.34), 0, 0, 7); g.fillStyle = col.main; g.globalAlpha = air ? 0.35 : 0.8; g.fill();
    if (!air) { g.lineWidth = 2; g.strokeStyle = col.dark; g.stroke(); }
    g.globalAlpha = 1;
    const lean = u.act > 0 ? 0.1 * S.dir(u.owner) : u.hurt > 0 ? -0.12 * S.dir(u.owner) : 0;
    g.save(); if (u.slow > 0) g.filter = 'hue-rotate(160deg) saturate(0.7)';
    if (!sprite(g, unitKey(u.kind, frame), u.x, y + hop, h, { flip: u.owner === 1, rot: lean }) && !coming(unitKey(u.kind, frame))) { g.beginPath(); g.arc(u.x, -y - spec.r, spec.r, 0, 7); g.fillStyle = col.main; g.fill(); }
    g.restore();
    if (air) { g.beginPath(); g.arc(u.x, -(y + h + 12), 5, 0, 7); g.fillStyle = col.main; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
    if (u.hp < u.maxHp) bar(g, u.x, y + h + 4, Math.max(22, spec.r * 2), 6, u.hp / u.maxHp, col.main);
  }
}

function drawBonuses(g, s, now) {
  const AIR = { gold: 0, rapid: 1, ammo: 2 }, CR = { repair: 0, troops: 1, chest: 2 };
  for (const b of s.bonuses) {
    const y = S.bonusY(b);
    if (b.state === 'fly') {
      if (b.cat === 'air') sprite(g, `bonus_air_${AIR[b.kind]}`, b.x, y - 46, 92, { flip: b.vx < 0, rot: Math.sin(now * 2 + b.bob) * 0.08, anchorY: 1 });
      else sprite(g, `bonus_crate_${CR[b.kind]}`, b.x, y - 56, 112, { rot: Math.sin(now * 1.6 + b.bob) * 0.05 });
    } else {
      const blink = b.state === 'ground' && b.t > S.CRATE_LIFE - 5 && Math.floor(now * 6) % 2;
      if (!blink) sprite(g, 'bonus_crate_3', b.x, y - 2, 46, { rot: b.state === 'fall' ? Math.sin(now * 9) * 0.15 : 0 });
      if (b.state === 'ground') text(g, S.BONUS[b.kind].name, b.x, 62 + Math.sin(now * 4) * 3, 15, '#fff6c8');
    }
  }
}

function drawShots(g, s) {
  const IDX = { stone: 0, scatter: 1, fire: 2, boulder: 3 };
  for (const pr of s.projectiles) {
    const a = AMMO[pr.ammo], size = (pr.shard ? 14 : a.size * 2.5);
    // motion streak
    g.strokeStyle = pr.ammo === 'fire' ? 'rgba(255,170,60,0.55)' : 'rgba(255,255,255,0.45)'; g.lineWidth = size * 0.45; g.lineCap = 'round';
    g.beginPath(); g.moveTo(pr.x, -pr.y); g.lineTo(pr.x - pr.vx * 0.035, -(pr.y - pr.vy * 0.035)); g.stroke();
    sprite(g, `shots_${pr.shard ? 0 : IDX[pr.ammo]}`, pr.x, pr.y - size / 2, size, { rot: pr.spin * (pr.vx > 0 ? 1 : -1), anchorY: 1 });
  }
}

/** Where the troop that fired bolt f holds the tip of its weapon, in world coords (null if it cannot be found).
 *  Uses the same size and place drawUnits gives the troop. */
function muzzleOf(s, f, now) {
  let u = null, best = 3;
  for (const e of s.units) { if (e.owner !== f.owner || e.hp <= 0) continue; const d = Math.abs(e.x - f.x); if (d < best) { best = d; u = e; } }
  if (!u) return null;
  const spec = UNIT[u.kind], key = unitKey(u.kind, 2), im = spr(key), tp = art.tips?.[key];
  if (!im || !tp) return null;
  const h = spec.r * 3.5, w = h * im.width / im.height, y = spec.air ? u.y + Math.sin(now * 2.4 + u.id) * 6 : -2 - u.lane * 9;
  return { x: u.x + S.dir(u.owner) * (tp[0] - 0.5) * w, y: y + (1 - tp[1]) * h };
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
    const k = f.t / f.ttl;
    if (f.kind === 'boom') { const fr = Math.min(3, Math.floor(k * 4)), h = (f.r || 40) * (f.big ? 2.4 : 1.9);
      if (k < 0.5) { const q = k / 0.5; g.strokeStyle = `rgba(255,244,200,${0.8 * (1 - q)})`; g.lineWidth = (f.big ? 10 : 6) * (1 - q) + 1; g.beginPath(); g.arc(f.x, -f.y, (f.r || 40) * (0.3 + q * (f.big ? 1.5 : 1.1)), 0, 7); g.stroke(); } if (f.spore) g.filter = 'hue-rotate(70deg)'; sprite(g, `fx_${fr}`, f.x, f.y - h * 0.45, h, { alpha: 1 - k * k }); g.filter = 'none'; }
    else if (f.kind === 'burst' || f.kind === 'pop') sprite(g, 'fx_0', f.x, f.y - 30, 60 * (1 + k), { alpha: 1 - k });
    else if (f.kind === 'rubble') {
      // the block's own picture breaks into six pieces that fly out, spin and fall, over a puff of dust
      const who = f.owner ?? (f.x < S.MID ? 0 : 1), key = blockKey(s.players[who].race, BLK[f.mat] == null ? 'wood' : f.mat, true);
      sprite(g, 'fx_3', f.x, f.y - 26, 70 * (0.6 + k), { alpha: 0.75 * (1 - k) });
      if (!chunks(g, key, f.x, f.y, k, f.x * 0.37 + f.y)) { g.fillStyle = f.mat === 'stone' ? '#9a9793' : '#c9822e'; for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, d = k * 60; g.fillRect(f.x + Math.cos(a) * d - 5, -(f.y + Math.sin(a) * d * 0.7 + 30 * k - 90 * k * k) - 5, 10 * (1 - k) + 2, 10 * (1 - k) + 2); } }
      if (k < 0.18) sprite(g, 'fx_0', f.x, f.y - 24, 48 + k * 160, { alpha: 1 - k / 0.18 });
    }
    else if (f.kind === 'coin') { const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.8), cy = f.y + 20 + (1 - (1 - k) * (1 - k)) * 52; g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; sprite(g, 'ui_0', f.x - 16 * pop, cy - 9 * pop, 18 * pop); text(g, `+${f.gold}`, f.x + 8 * pop, cy, 18 * pop, '#ffe36b'); g.globalAlpha = 1; }
    else if (f.kind === 'poof') sprite(g, 'fx_3', f.x, f.y - 10, 50 * (1 + k), { alpha: 1 - k });
    else if (f.kind === 'bolt') {
      // a troop's shot starts at the tip of its weapon in the attack picture (assets/tips.json), not at a guessed
      // point on its body; fort and tower bolts keep the point the rules give
      let bx = f.x, by = f.y;
      if (f.thin) { const m = muzzleOf(s, f, now); if (m) { bx = m.x; by = m.y; } }
      g.strokeStyle = f.thin ? COLORS[f.owner].light : '#fff3b0'; g.lineWidth = f.thin ? 3 : 4; g.lineCap = 'round'; g.globalAlpha = 1 - k; g.beginPath(); g.moveTo(bx, -by); g.lineTo(f.tx, -f.ty); g.stroke();
      if (f.thin) { g.beginPath(); g.arc(bx, -by, 4.5 * (1 - k) + 1.5, 0, 7); g.fillStyle = '#fff'; g.fill(); }      // a flash at the muzzle
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
  const lay = DRAW_LAY, edge = lay.gy / lay.s, IDX = { stone: 0, scatter: 1, fire: 2, boulder: 3 };
  const mark = (x, y, key, col, size) => {
    const over = y - edge; if (over <= 0) return;
    if (Math.abs(x - W / 2) < 100) x = W / 2 + (x < W / 2 ? -100 : 100);          // beside the clock, never on it
    const z = Math.max(0.55, 1 - over / 900), yy = edge - 18, bob = Math.sin(now * 8) * 2;
    g.save(); g.translate(Math.max(20, Math.min(W - 20, x)), -(yy + bob)); g.scale(z * 1.5, z * 1.5);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(13, 9); g.lineTo(-13, 9); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
    g.restore();
    sprite(g, key, Math.max(20, Math.min(W - 20, x)), yy - 20 - size * 1.5 * z, size * 1.5 * z, { alpha: 0.95 });
  };
  for (const pr of s.projectiles) mark(pr.x, pr.y, `shots_${pr.shard ? 0 : IDX[pr.ammo]}`, COLORS[pr.owner]?.main || '#fff', pr.shard ? 14 : 24);
  for (const b of s.bonuses) if (b.state === 'fly') mark(b.x, S.bonusY(b), b.cat === 'air' ? `bonus_air_${{ gold: 0, rapid: 1, shield: 2 }[b.kind] ?? 0}` : 'bonus_crate_0', '#ffd23f', 30);
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
      const cost = S.costFor(s, p, key);
      const free = b.kind === 'ammo' && key !== 'stone' && pl.freeShots > 0;
      const can = free || pl.gold >= cost, on = (b.kind === 'ammo' && pl.ammo === key) || ui.armed[p] === key;
      const locked = (key === 'shield' && (s.phase === 'sudden' || s.buildings.some((q) => q.owner === p && q.kind === 'shield')))
        || (key === 'vault' && !S.placeOk(s, p, 'vault', 0))
        || (key === 'mine' && s.buildings.filter((q) => q.owner === p && q.kind === 'mine').length >= BUILD.mine.max);
      g.save(); g.globalAlpha = ai ? 0.45 : can && !locked ? 1 : 0.5;
      g.translate(real.x, -real.y); g.scale(k, k);
      rrect(g, b.x, -b.y + 3, b.w, b.h, 12); g.fillStyle = 'rgba(40,22,8,0.55)'; g.fill();
      rrect(g, b.x, -b.y, b.w, b.h - 3, 12); g.fillStyle = on ? col.main : '#f6e7c8'; g.fill(); g.lineWidth = 3; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      const cx = narrow ? b.w / 2 : b.x + 24, iy = b.y - b.h + (narrow ? 22 : 8), tx = narrow ? b.w / 2 : b.x + 70, z = narrow ? 0.74 : 1;
      const fitH = (k2, h, maxW) => { const im = spr(k2); return im ? Math.min(h, maxW * im.height / im.width) : h; };   // height that keeps a wide picture inside its slot
      if (b.kind === 'ammo') sprite(g, `shots_${['stone', 'scatter', 'fire', 'boulder'].indexOf(key)}`, cx, iy + 4 * z, 36 * z);
      else if (key === 'wall') sprite(g, 'builds_0', cx, iy, 44 * z);
      else if (key === 'tower') sprite(g, 'builds_1', cx, iy, 46 * z);
      else if (key === 'shield') sprite(g, 'ui_1', cx, iy + 3 * z, 38 * z);
      else if (key === 'mine') { const mk = spr('builds_2') ? 'builds_2' : 'bonus_crate_2', mh = fitH(mk, 42 * z, 44 * z); sprite(g, mk, cx, iy + (42 * z - mh) / 2, mh); }
      else if (key === 'vault') sprite(g, spr('builds_3') ? 'builds_3' : 'bonus_crate_3', cx, iy + 2 * z, 38 * z);
      else { const uk = unitKey(key, 0), uh = fitH(uk, 44 * z, 44 * z); sprite(g, uk, cx, iy + (44 * z - uh) / 2, uh, { flip: p === 1 }); }
      const name = AMMO[key]?.name || BUILD[key]?.name || UNIT[key].short;
      if (!narrow) { const nx = b.x + 48, room = b.w - 54; g.font = FONT(name.length > 8 ? 11 : 13); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = on ? '#fff' : INK; g.fillText(name, nx + room / 2, -(b.y - 19), room); }
      const label = free ? (narrow ? `x${pl.freeShots}` : `free x${pl.freeShots}`) : cost ? `${cost}` : 'free';
      if (cost && !free) sprite(g, 'ui_0', tx - (narrow ? 13 : 15), b.y - (narrow ? 55 : 50), narrow ? 14 : 16);
      text(g, label, tx + (cost && !free ? 8 : 0), b.y - (narrow ? 47 : 41), narrow ? 15 : 16, on ? '#fff' : '#7a4a12', 'center', null);
      if (b.kind === 'ammo' && on && pl.reload > 0) { const a = AMMO[key].reload; g.fillStyle = 'rgba(30,16,4,0.5)'; rrect(g, b.x, -b.y, b.w * Math.min(1, pl.reload / a), b.h - 3, 13); g.fill(); }
      g.restore();
    }
    // a finger resting on a button (ui.held, set by input.js) shows its full name in a tag above it
    const held = ui.held && ui.held.p === p ? buttons(p).find((q) => keyFor(s, p, q) === ui.held.key) : null;
    if (held) {
      const key = ui.held.key, nm = AMMO[key]?.name || BUILD[key]?.name || UNIT[key]?.name || UNIT[key]?.short || key, k = DRAW_LAY?.compact ? held.h / 60 * 1.5 : 1;
      g.font = FONT(18 * k); const tw = g.measureText(nm).width + 24 * k, th = 30 * k;
      const cx = Math.max(DRAW_LAY ? -DRAW_LAY.ox / DRAW_LAY.s + tw / 2 + 4 : tw / 2, Math.min((DRAW_LAY ? (DRAW_LAY.w - DRAW_LAY.ox) / DRAW_LAY.s : W) - tw / 2 - 4, held.x + held.w / 2)), top = held.y + th + 8 * k;
      rrect(g, cx - tw / 2, -top, tw, th, 9 * k); g.fillStyle = 'rgba(40,24,10,0.9)'; g.fill(); g.lineWidth = 2.5 * k; g.strokeStyle = col.light; g.stroke();
      g.beginPath(); g.moveTo(held.x + held.w / 2 - 7 * k, -(top - th)); g.lineTo(held.x + held.w / 2 + 7 * k, -(top - th)); g.lineTo(held.x + held.w / 2, -(top - th - 8 * k)); g.closePath(); g.fillStyle = 'rgba(40,24,10,0.9)'; g.fill();
      text(g, nm, cx, top - th / 2, 18 * k, '#fff', 'center', null);
    }
    if (ai) text(g, `COMPUTER · ${String(ui.aiLevel).toUpperCase()}`, S.mx(p, 325), -110, 24, '#fff');
    // ---- top panel: chief HP, gold, rounds ----
    const x = S.mx(p, 210), top = ui.topY, d = p === 0 ? 1 : -1, al = p === 0 ? 'left' : 'right', slim = !!DRAW_LAY?.compact;
    const hpK = pl.kingHp / pl.kingMax, hpCol = hpK > 0.35 ? '#6fd45a' : '#ff5a4a';
    if (slim) {
      // phones: one row (heart, HP, gold, rounds), starting clear of the slingshot on the back tower
      const left = S.mx(p, 122);
      rrect(g, Math.min(left, left + d * 318), -top, 318, 40, 14); g.fillStyle = 'rgba(40,24,10,0.62)'; g.fill();
      sprite(g, 'ui_2', left + d * 20, top - 31, 22);
      bar(g, left + d * 100, top - 28, 120, 16, hpK, hpCol);
      text(g, `${Math.ceil(pl.kingHp)}`, left + d * 100, top - 20, 13, '#fff', 'center');
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
      text(g, `${Math.ceil(pl.kingHp)}`, left + d * 135, top - 57, 14, '#fff', 'center');
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
  if (s.phase === 'roundOver' || s.phase === 'over') {
    const w = s.phase === 'over' ? s.winner : s.roundWinner;
    const msg = w < 0 ? (s.phase === 'over' ? 'Match drawn' : 'Round drawn') : `${RACES[s.players[w].race].name} ${s.phase === 'over' ? 'win the match!' : 'win the round'}`;
    rrect(g, W / 2 - 380, -430, 760, 110, 24); g.fillStyle = 'rgba(40,24,10,0.8)'; g.fill();
    text(g, msg, W / 2, 386, 44, w < 0 ? '#fff' : COLORS[w].light);
    text(g, `${s.roundsWon[0]} – ${s.roundsWon[1]}`, W / 2, 342, 24, '#fff');
  } else if (s.time < 2.2 && s.phase === 'play') {
    text(g, s.round === 1 ? 'Fling!' : `Round ${s.round}`, W / 2, 400, 64 * Math.min(1, s.time * 3), '#fff');
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
      g.font = FONT(14, 600); g.fillStyle = '#fff'; g.fillText(r.tag, x0 + 14, -222, 594);
      g.font = FONT(13, 700);
      r.pros.forEach((tx, i) => { g.fillStyle = '#9be88a'; g.fillText('+ ' + tx, x0 + 14, -(200 - i * 17), 296); });      // strengths left, weaknesses right: never more than three rows
      r.cons.forEach((tx, i) => { g.fillStyle = '#ffab96'; g.fillText('– ' + tx, x0 + 318, -(200 - i * 17), 292); });
      r.roster.forEach((k, i) => { const step = Math.min(100, 594 / r.roster.length), ux = x0 + 14 + step * (i + 0.5); sprite(g, unitKey(k, 0), ux, 120, 30, { flip: p === 1 }); g.font = FONT(11, 700); g.fillStyle = UNIT[k].air ? '#a8d8ff' : '#fff'; g.textAlign = 'center'; g.fillText(UNIT[k].short, ux, -111, step - 6); }); g.textAlign = 'left';
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
  drawBackdrop(g, lay);
  ui.topY = Math.min((lay.gy - 8) / lay.s, 880);
  const shake = ui.shake > 0 ? ui.shake * 7 : 0;
  g.setTransform(lay.dpr * lay.s, 0, 0, lay.dpr * lay.s, lay.dpr * (lay.ox + (shake ? Math.sin(now * 90) * shake : 0)), lay.dpr * (lay.gy + (shake ? Math.cos(now * 70) * shake : 0)));
  PAUSE.y = ui.topY - 100;
  drawFort(g, s, 0, ui, now); drawFort(g, s, 1, ui, now);
  if (ui.menu) return;
  if (ui.pick) { drawPick(g, s, ui, now); return; }
  drawZones(g, s, ui, now);
  drawBuildings(g, s, now);
  drawUnits(g, s, now);
  for (const p of [0, 1]) if (Math.abs(S.kingPos(p, s).x - S.kingPos(p).x) >= 1) drawChief(g, s, p, now);   // a chief out of his fort
  drawBonuses(g, s, now);
  drawShots(g, s);
  drawFx(g, s, now);
  drawAim(g, s, ui);
  drawHud(g, s, ui, now);
  drawAbove(g, s, ui, now);
}
