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
export const art = { ready: false, img: {}, meta: null };
export async function loadArt(base = 'assets/') {
  art.meta = await (await fetch(base + 'sprites.json')).json();
  const jobs = [];
  const load = (key, file) => jobs.push(new Promise((ok) => { const im = new Image(); im.onload = () => { art.img[key] = im; ok(); }; im.onerror = () => ok(); im.src = base + file; }));
  for (const [name, m] of Object.entries(art.meta)) {
    if (m.file) load(name, m.file);
    else m.frames.forEach((f, i) => load(`${name}_${i}`, f.file));
  }
  await Promise.all(jobs);
  art.ready = true;
}
const spr = (key) => art.img[key] || null;
// ---- sprite lookups with fallbacks, so a race plays before its own art has arrived ----
const OLD_KINGS = ['king_forge_0', 'king_reed_0', 'king_moss_0'];
export const unitKey = (kind, frame) => (spr(`t_${kind}_${frame}`) ? `t_${kind}_${frame}` : `t_${UNIT[kind].art}_${frame}`);
export const kingKey = (race) => (spr(`king_${race}_0`) ? `king_${race}_0` : OLD_KINGS[S.RACE_KEYS.indexOf(race) % 3]);
const BLK = { wood: 0, stone: 1, iron: 2 };
function blockKey(race, kind, worn) {
  if (kind === 'vault') return spr('builds_3') ? 'builds_3' : 'bonus_crate_3';
  const k = `fortblk_${race}_${BLK[kind] + (worn ? 3 : 0)}`;
  return spr(k) ? k : kind === 'wood' ? (worn ? 'blocks_1' : 'blocks_0') : worn ? 'blocks_3' : 'blocks_2';
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

function drawFort(g, s, p, ui, now) {
  const col = COLORS[p], pl = s.players[p], flip = p === 1;
  const c = S.catPos(p);
  // stone pedestal under the catapult
  for (let y = 0; y < c.y - 20; y += CELL) for (const dx of [-22, 22]) sprite(g, 'blocks_2', c.x + dx, y, CELL + 1);
  rrect(g, c.x - 50, -(c.y - 14), 100, 10, 4); g.fillStyle = '#6d6a66'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  // catapult: base, then the arm swinging on the pivot; pulled back while aiming, snapped forward after a shot
  const aim = ui.aimOf?.[p], kick = Math.max(0, (ui.kick?.[p] || 0));
  const armAng = aim ? -0.25 - aim.power * 0.75 : kick > 0 ? 0.9 * kick - 0.2 : -0.2;
  sprite(g, 'catapult_0', c.x, c.y - 14, 62, { flip });
  g.save(); g.translate(c.x, -(c.y + 38)); g.scale(flip ? -1 : 1, 1); g.rotate(-armAng - Math.PI / 2 + 0.9);
  const arm = spr('catapult_1');
  if (arm) { const h = 26, w = h * arm.width / arm.height; g.drawImage(arm, -w * 0.72, -h / 2, w, h); }
  g.restore();
  // flag in the side colour
  const fx = S.colX(p, 3), fy = S.rowY(2) + CELL / 2 + 4;
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(fx, -fy + 44); g.lineTo(fx, -fy - 46); g.stroke();
  const wave = Math.sin(now * 3 + p) * 4, d = S.dir(p);
  g.beginPath(); g.moveTo(fx, -fy - 46); g.quadraticCurveTo(fx + d * 20, -fy - 50 + wave, fx + d * 38, -fy - 38); g.quadraticCurveTo(fx + d * 20, -fy - 30 - wave, fx, -fy - 24); g.closePath();
  g.fillStyle = col.main; g.fill(); g.stroke();
  // the chief in his room
  const k = S.kingPos(p), hurt = pl.kingFlash > 0;
  const bob = Math.sin(now * 2.2 + p * 2) * 1.5;
  g.save(); if (hurt) g.filter = 'brightness(1.9) saturate(0.4)';
  sprite(g, kingKey(pl.race), k.x + (hurt ? Math.sin(now * 60) * 2 : 0), 0, 70 + bob, { flip });
  g.restore();
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
    if (!sprite(g, unitKey(u.kind, frame), u.x, y + hop, h, { flip: u.owner === 1, rot: lean })) { g.beginPath(); g.arc(u.x, -y - spec.r, spec.r, 0, 7); g.fillStyle = col.main; g.fill(); }
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
    if (f.kind === 'boom') { const fr = Math.min(3, Math.floor(k * 4)), h = (f.r || 40) * (f.big ? 2.4 : 1.9); if (f.spore) g.filter = 'hue-rotate(70deg)'; sprite(g, `fx_${fr}`, f.x, f.y - h * 0.45, h, { alpha: 1 - k * k }); g.filter = 'none'; }
    else if (f.kind === 'burst' || f.kind === 'pop') sprite(g, 'fx_0', f.x, f.y - 30, 60 * (1 + k), { alpha: 1 - k });
    else if (f.kind === 'rubble') { g.fillStyle = f.mat === 'stone' ? '#9a9793' : '#c9822e'; for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, d = k * 60; g.fillRect(f.x + Math.cos(a) * d - 5, -(f.y + Math.sin(a) * d * 0.7 + 30 * k - 90 * k * k) - 5, 10 * (1 - k) + 2, 10 * (1 - k) + 2); } }
    else if (f.kind === 'coin') text(g, `+${f.gold}`, f.x, f.y + 20 + k * 46, 18, '#ffe36b');
    else if (f.kind === 'poof') sprite(g, 'fx_3', f.x, f.y - 10, 50 * (1 + k), { alpha: 1 - k });
    else if (f.kind === 'bolt') { g.strokeStyle = f.thin ? COLORS[f.owner].light : '#fff3b0'; g.lineWidth = f.thin ? 3 : 4; g.globalAlpha = 1 - k; g.beginPath(); g.moveTo(f.x, -f.y); g.lineTo(f.tx, -f.ty); g.stroke(); g.globalAlpha = 1; }
    else if (f.kind === 'heal') { g.strokeStyle = `rgba(120,255,170,${1 - k})`; g.lineWidth = 4; g.beginPath(); g.ellipse(f.x, -8, f.r * k, f.r * k * 0.25, 0, 0, 7); g.stroke(); }
    else if (f.kind === 'ripple') { g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 5; g.beginPath(); g.arc(f.x, -f.y, 14 + k * 40, 0, 7); g.stroke(); }
    else if (f.kind === 'sparkle') { for (let i = 0; i < 8; i++) { const a = i * 0.785 + k * 2, d = 20 + k * 60; text(g, '✦', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 22 * (1 - k) + 6, '#ffe36b', 'center', null); } }
  }
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
    bar(g, c.x, c.y + 78, 70, 10, a.aim.power, a.aim.power > 0.92 ? '#ffd23f' : col.main);
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
      if (b.kind === 'ammo') sprite(g, `shots_${['stone', 'scatter', 'fire', 'boulder'].indexOf(key)}`, cx, iy + 4 * z, 36 * z);
      else if (key === 'wall') sprite(g, 'builds_0', cx, iy, 44 * z);
      else if (key === 'tower') sprite(g, 'builds_1', cx, iy, 46 * z);
      else if (key === 'shield') sprite(g, 'ui_1', cx, iy + 3 * z, 38 * z);
      else if (key === 'mine') sprite(g, spr('builds_2') ? 'builds_2' : 'bonus_crate_2', cx, iy, 42 * z);
      else if (key === 'vault') sprite(g, spr('builds_3') ? 'builds_3' : 'bonus_crate_3', cx, iy + 2 * z, 38 * z);
      else sprite(g, unitKey(key, 0), cx, iy, 44 * z, { flip: p === 1 });
      const name = AMMO[key]?.name || BUILD[key]?.name || UNIT[key].short;
      if (!narrow) { g.font = FONT(name.length > 8 ? 11 : 13); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = on ? '#fff' : INK; g.fillText(name, tx, -(b.y - 19), 56); }
      const label = free ? (narrow ? `x${pl.freeShots}` : `free x${pl.freeShots}`) : cost ? `${cost}` : 'free';
      if (cost && !free) sprite(g, 'ui_0', tx - (narrow ? 13 : 15), b.y - (narrow ? 55 : 50), narrow ? 14 : 16);
      text(g, label, tx + (cost && !free ? 8 : 0), b.y - (narrow ? 47 : 41), narrow ? 15 : 16, on ? '#fff' : '#7a4a12', 'center', null);
      if (b.kind === 'ammo' && on && pl.reload > 0) { const a = AMMO[key].reload; g.fillStyle = 'rgba(30,16,4,0.5)'; rrect(g, b.x, -b.y, b.w * Math.min(1, pl.reload / a), b.h - 3, 13); g.fill(); }
      g.restore();
    }
    if (ai) text(g, `COMPUTER · ${String(ui.aiLevel).toUpperCase()}`, S.mx(p, 325), -110, 24, '#fff');
    // ---- top panel: chief HP, gold, rounds ----
    const x = S.mx(p, 210), top = ui.topY, d = p === 0 ? 1 : -1, al = p === 0 ? 'left' : 'right', left = S.mx(p, 24);
    rrect(g, Math.min(left, left + d * 390), -top, 390, 78, 16); g.fillStyle = 'rgba(40,24,10,0.62)'; g.fill();
    text(g, RACES[pl.race].name, left + d * 14, top - 20, 20, col.light, al, null);
    for (let i = 0; i < S.ROUNDS_TO_WIN; i++) { g.beginPath(); g.arc(left + d * (360 - i * 24), -(top - 20), 8, 0, 7); g.fillStyle = i < s.roundsWon[p] ? '#ffd23f' : 'rgba(255,255,255,0.25)'; g.fill(); }
    sprite(g, 'ui_2', left + d * 26, top - 68, 24);
    bar(g, left + d * 135, top - 66, 180, 18, pl.kingHp / pl.kingMax, pl.kingHp / pl.kingMax > 0.35 ? '#6fd45a' : '#ff5a4a');
    text(g, `${Math.ceil(pl.kingHp)}`, left + d * 135, top - 57, 14, '#fff', 'center');
    sprite(g, 'ui_0', left + d * 262, top - 70, 28);
    text(g, `${Math.floor(pl.gold)}`, left + d * 282, top - 56, 24, '#ffe36b', al);
    text(g, `+${S.incomeOf(s, p).toFixed(1).replace('.0', '')}/s`, left + d * 366, top - 56, 14, '#fff6c8', p === 0 ? 'right' : 'left', null);
    if (pl.rapid > 0) text(g, `rapid ${Math.ceil(pl.rapid)}s`, x, top - 96, 16, '#9fe0ff');
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
      r.pros.forEach((tx, i) => { g.fillStyle = '#9be88a'; g.fillText('+ ' + tx, x0 + 14, -(200 - i * 17), 594); });
      r.cons.forEach((tx, i) => { g.fillStyle = '#ffab96'; g.fillText('– ' + tx, x0 + 14, -(200 - (r.pros.length + i) * 17), 594); });
      r.roster.forEach((k, i) => { sprite(g, unitKey(k, 0), x0 + 40 + i * 82, 104, 30, { flip: p === 1 }); g.font = FONT(11, 700); g.fillStyle = UNIT[k].air ? '#a8d8ff' : '#fff'; g.textAlign = 'left'; g.fillText(UNIT[k].short, x0 + 58 + i * 82, -118, 62); });
    } else { g.font = FONT(18, 600); g.fillStyle = '#fff'; g.fillText('Tap a card to see its troops and powers', x0 + 14, -182, 594); }
    const rd = PICK.ready, rx = p === 0 ? rd.x : W - rd.x - rd.w, ready = pk.ready[p], can = !!pk.race[p];
    rrect(g, rx, -rd.y, rd.w, rd.h, 20); g.fillStyle = ready ? '#6fd45a' : can ? col.main : 'rgba(120,110,100,0.8)'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    text(g, ready ? 'Ready!' : can ? 'Tap when ready' : 'Choose a card', rx + rd.w / 2, rd.y - rd.h / 2, 24, '#fff');
  }
  void now;
}

export function draw(g, lay, s, ui, now) {
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
  drawBonuses(g, s, now);
  drawShots(g, s);
  drawFx(g, s, now);
  drawAim(g, s, ui);
  drawHud(g, s, ui, now);
}
