"use strict";
// combat.js — how things fight: knockback physics, status effects, the attack
// "forms" each element uses, hazard zones, Titan move sets, and projectile art.
// (units.js owns the unit model, targeting and damage; this file owns the moves.)

// ---------------------------------------------------------------- knockback
// Shove a unit. `lift` also throws it into the air: it tumbles, cannot act, and lands in a puff of dust.
function knock(u, nx, ny, force, lift) {
  if (!u || u.removed || u.titan || u.dazed) return;
  if (u === Game.player) {
    // a Bindframe is heavy: the bigger the frame, the less it slides
    const k = 1 / (1 + Game.mechTier() * 0.6);
    u.kvx = (u.kvx || 0) + nx * force * k; u.kvy = (u.kvy || 0) + ny * force * k;
    return;
  }
  const mass = clamp(u.r / 10, 0.8, 3.5) * (u.alpha ? 1.5 : 1);
  u.kvx = (u.kvx || 0) + (nx * force) / mass; u.kvy = (u.kvy || 0) + (ny * force) / mass;
  if (lift) { u.kvz = Math.max(u.kvz || 0, lift / Math.sqrt(mass)); u.kz = Math.max(u.kz || 0, 0.5); u.spinDir = nx >= 0 ? 1 : -1; u.target = null; }
}

// returns true while the unit is airborne or winded and so cannot act
function updateKnock(u, dt) {
  if (u.stunT > 0) u.stunT -= dt;
  const moving = (u.kvx || 0) * u.kvx + (u.kvy || 0) * u.kvy > 30;
  if (!(u.kz > 0) && !moving) { u.kvx = 0; u.kvy = 0; return u.stunT > 0; }
  World.move(u, u.kvx * dt, u.kvy * dt, u.pass);
  const f = Math.exp(-dt * (u.kz > 0 ? 0.8 : 8)); u.kvx *= f; u.kvy *= f;
  if (u.kz > 0) {
    u.kvz -= 1100 * dt; u.kz += u.kvz * dt; u.spin = (u.spin || 0) + dt * 11 * (u.spinDir || 1);
    if (u.kz <= 0) {
      u.kz = 0; u.kvz = 0; u.spin = 0;
      if (u.pounce) landPounce(u);
      else {
        u.stunT = 0.35; u.kvx *= 0.3; u.kvy *= 0.3;
        if (Game.onScreen(u.x, u.y)) { FX.burst(u.x, u.y, "#c8c0a8", 5, 70, 0.35, 3); SFX.play("thud", 0.35, 1.4 - Math.min(0.7, u.r / 40)); }
      }
    }
    return true;
  }
  return u.stunT > 0;
}

// ---------------------------------------------------------------- status effects
const STATUS_COL = { burn: "#ff8a3a", poison: "#b874dc", slow: "#a8ecff" };
function applyStatus(tgt, kind, src, power) {
  if (!tgt || tgt === Game.player || tgt.hp <= 0 || tgt.dazed) return;
  if (kind === "slow") { tgt.slowT = tgt.titan ? 1 : 2.4; return; }
  tgt.dotT = kind === "poison" ? 4 : 2.5; tgt.dotKind = kind; tgt.dotSrc = src;
  tgt.dotDps = Math.max(tgt.dotT > 0 ? tgt.dotDps || 0 : 0, power * (tgt.titan ? 0.3 : 1));
}
function updateStatus(u, dt) {
  if (u.slowT > 0) u.slowT -= dt;
  if (u.dotT > 0) {
    u.dotT -= dt; u.dotTick = (u.dotTick || 0) - dt;
    if (u.dotTick <= 0) { u.dotTick = 0.5; tickDamage(u, u.dotDps * 0.5, u.dotSrc, STATUS_COL[u.dotKind]); }
    if (u.dotT <= 0) u.dotDps = 0;
  }
}
// quiet damage over time: no hit-flash, no knockback, no sound — just a rising mote
function tickDamage(u, dmg, src, color) {
  if (!targetable(u)) return;
  u.hp -= Math.max(1, Math.round(dmg)); u.hurtT = 0;
  if (Game.onScreen(u.x, u.y)) FX.mote(u.x + (Math.random() - 0.5) * u.r, u.y - u.r * 1.4, 0, -36, color, 0.45, 3);
  if (u.team === 1 && !u.aggro) provoke(u);
  if (u.hp <= 0) { u.hp = 0; onDefeat(u, src); }
}

// ---------------------------------------------------------------- hazard zones
function addZone(x, y, r, life, team, dps, type, src) {
  if (Game.zones.length > 40) Game.zones.shift();
  Game.zones.push({ x, y, r, life, max: life, team, dps, type, src, tick: 0.2 });
}
function updateZones(dt) {
  let w = 0;
  for (const z of Game.zones) {
    z.life -= dt; if (z.life <= 0) continue;
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.5;
      const col = TYPES[z.type] ? TYPES[z.type].color : "#b874dc", want = z.team === 0 ? 1 : 0;
      Grid.query(z.x, z.y, z.r + 40, (e) => { if (e.team === want && dist2(e.x, e.y, z.x, z.y) < (z.r + e.r) * (z.r + e.r)) tickDamage(e, z.dps * 0.5 * (e.titan ? 0.3 : 1), z.src, col); });
      const p = Game.player;
      if (z.team === 1 && p.hp > 0 && dist2(p.x, p.y, z.x, z.y) < z.r * z.r) dealDamage(z.src, p, z.dps * 0.2, z.type, { zone: true });
    }
    Game.zones[w++] = z;
  }
  Game.zones.length = w;
}
function drawZones(ctx, time) {
  for (const z of Game.zones) {
    const k = Math.min(1, z.life / 0.6, (z.max - z.life) / 0.25), col = TYPES[z.type] ? TYPES[z.type].color : "#b874dc";
    ctx.globalAlpha = 0.24 * k; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6 * k; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = time * 12;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 5; i++) {                                     // bubbles swell and pop
      const ph = (time * 0.9 + i * 0.37 + z.x * 0.01) % 1, a = i * 2.4 + z.y, rr = z.r * (0.25 + 0.13 * i);
      ctx.globalAlpha = (1 - ph) * 0.8 * k; ctx.fillStyle = "#ffffff";
      const s = 2 + ph * 4; ctx.fillRect(Math.round(z.x + Math.cos(a) * rr - s / 2), Math.round(z.y + Math.sin(a) * rr * 0.8 - ph * 10 - s / 2), s, s);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- helpers
// every foe of `src` inside a circle (the binder counts as a foe of team 1)
function forEnemies(src, x, y, rad, fn) {
  const want = src.team === 0 ? 1 : 0;
  Grid.query(x, y, rad + 60, (e) => { if (e.team === want && targetable(e) && dist2(e.x, e.y, x, y) < (rad + e.r) * (rad + e.r)) fn(e); });
  const p = Game.player;
  if (src.team === 1 && p.hp > 0 && dist2(p.x, p.y, x, y) < (rad + p.r) * (rad + p.r)) fn(p);
}
function inCone(x, y, a, half, range, e) {
  const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
  if (d > range + e.r) return false;
  let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  return Math.abs(da) < half + Math.atan2(e.r, Math.max(1, d));
}
// damage everything along a line; returns how many were hit
function lineDamage(src, x0, y0, a, len, width, dmg, type, opts) {
  const cx = Math.cos(a), cy = Math.sin(a);
  let n = 0;
  forEnemies(src, x0 + cx * len / 2, y0 + cy * len / 2, len / 2 + width, (e) => {
    const dx = e.x - x0, dy = e.y - e.r * 0.6 - y0, along = dx * cx + dy * cy, perp = Math.abs(dx * cy - dy * cx);
    if (along < -e.r || along > len + e.r || perp > width + e.r) return;
    dealDamage(src, e, e === Game.player ? dmg * 0.6 : dmg, type, opts); n++;
  });
  return n;
}
// lightning that leaps from foe to foe
function chainLightning(src, x, y, first, dmg, jumps, type, color) {
  const hit = {};
  let cur = first, px = x, py = y;
  for (let j = 0; j <= jumps && cur; j++) {
    FX.zap(px, py, cur.x, cur.y - cur.r, color, 0.2, j ? 2 : 3);
    dealDamage(src, cur, cur === Game.player ? dmg * 0.6 : dmg, type, null);
    hit[cur.uid || "p"] = 1; px = cur.x; py = cur.y - cur.r; dmg *= 0.6;
    let next = null, bd = 130 * 130;
    forEnemies(src, px, py, 130, (e) => { if (hit[e.uid || "p"]) return; const d = dist2(e.x, e.y, px, py); if (d < bd) { bd = d; next = e; } });
    cur = next;
  }
}

// ---------------------------------------------------------------- attack forms
// What an attack looks like and does is decided by the beast's element, so a horde
// of mixed types reads as claws, flame, lightning, beams and tidal spray — not one pellet.
const FORM_MELEE = { rock: "slam", ground: "slam", steel: "slam", normal: "pounce", bug: "pounce", shadow: "pounce" };
const FORM_RANGED = { fire: "breath", dragon: "breath", electric: "chain", light: "beam", psychic: "beam", water: "spray", ice: "shards", air: "gust" };
const FORM_RANGE = { breath: 130, chain: 210, beam: 250, spray: 190, shards: 220, gust: 190 };
const FORM_CD = { slam: 1.3, pounce: 1.15, breath: 1.25, beam: 1.2, gust: 1.2, chain: 1.1 };
const FORM_STATUS = { fire: "burn", dragon: "burn", ice: "slow", poison: "poison" };

function applyForm(u) {
  if (!u.sp) { u.form = u.style === "melee" ? "slash" : u.style === "lob" ? "lob" : "shot"; return; }
  const t = u.moveType;
  if (u.titan) u.form = u.style === "melee" ? "slash" : u.style === "lob" ? "lob" : u.style === "homing" ? "homing" : "shot";
  else if (u.style === "melee") u.form = FORM_MELEE[t] === "pounce" ? (u.sp.spd >= 52 ? "pounce" : "slash") : FORM_MELEE[t] || "slash";
  else if (u.style === "lob") u.form = "lob";
  else if (u.style === "homing") u.form = "homing";
  else u.form = FORM_RANGED[t] || "shot";
  if (FORM_RANGE[u.form]) u.range = FORM_RANGE[u.form];
}

function performAttack(u, t) {
  const form = u.form || "slash";
  u.atkTimer = u.cd * (FORM_CD[form] || 1) * (u.team === 0 ? (Game.hornT > 0 ? 0.75 : 1) * Math.pow(0.92, Game.boon("frenzy")) / (1 + Game.res("bug")) : 1);
  u.lungeT = 0.32;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
  u.lungeDx = dx / d; u.lungeDy = dy / d;
  if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
  const type = u.moveType, col = TYPES[type] ? TYPES[type].color : (u.color || "#ffffff"), see = Game.onScreen(u.x, u.y);
  const pd = t === Game.player ? 0.7 : 1, sx = u.x, sy = u.y - u.r * 1.2, status = FORM_STATUS[type];
  switch (form) {
    case "slam": {
      // a ground-pound: everything around the point of impact is hit and shoved back
      const rad = 30 + u.r * 1.2;
      if (see) { FX.ring(t.x, t.y, 6, rad, col, 0.3, 4); FX.burst(t.x, t.y, "#c8c0a8", 7, 110, 0.4, 4); SFX.play("thud", 0.5, 1.1 - Math.min(0.5, u.r / 50)); }
      forEnemies(u, t.x, t.y, rad, (e) => dealDamage(u, e, u.atk * 0.8 * (e === Game.player ? 0.7 : 1), type, { kb: 9 }));
      break;
    }
    case "pounce": {
      if (d > u.r + t.r + 22 && !(u.kz > 0)) {
        // leap: the damage lands when the beast does
        const T = 0.345; u.kvz = 190; u.kz = 0.5; u.spinDir = 0;
        const v = (d - (u.r + t.r) * 0.6) / T; u.kvx = (dx / d) * v; u.kvy = (dy / d) * v;
        u.pounce = t; u.lungeT = 0;
        if (see) SFX.play("whoosh", 0.3, 1.3);
        break;
      }
      dealDamage(u, t, u.atk * pd, type, null);
      if (see) FX.slash(t.x, t.y - t.r, a, 10 + u.r * 0.9, col);
      break;
    }
    case "breath": {
      const range = u.range + 40, half = 0.5;
      if (see) { FX.cone(sx, sy, a, half * 0.8, range, col, 9, 5); FX.cone(sx, sy, a, half * 0.5, range, "#fff0a0", 4, 3); SFX.play(type === "fire" || type === "dragon" ? "flame" : "whoosh", 0.4); }
      forEnemies(u, u.x, u.y, range, (e) => { if (!inCone(u.x, u.y, a, half, range, e)) return; dealDamage(u, e, u.atk * 0.62 * (e === Game.player ? 0.7 : 1), type, null); if (status) applyStatus(e, status, u, u.atk * 0.22); });
      break;
    }
    case "chain":
      if (see) SFX.play("zap", 0.45);
      chainLightning(u, sx, sy, t, u.atk * 0.95, 2, type, col);
      break;
    case "beam": {
      const len = u.range + 50;
      if (see) { FX.beam(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, col, 0.28, 7); SFX.play("beam", 0.35, type === "light" ? 1.3 : 0.9); }
      lineDamage(u, sx, sy, a, len, 9, u.atk * 0.62, type, null);
      break;
    }
    case "spray": case "shards":
      for (let i = -1; i <= 1; i++) spawnShot(u, t, { angle: a + i * (form === "spray" ? 0.16 : 0.22), dmg: u.atk * 0.42, status: form === "shards" ? "slow" : null, kb: form === "spray" ? 6 : 0, size: 5 + u.scale });
      if (see) SFX.play(form === "spray" ? "splash" : "chink", 0.4);
      break;
    case "gust":
      spawnShot(u, t, { angle: a, dmg: u.atk * 0.55, kind: "wave", pierce: 5, kb: 12, size: 12 + u.scale * 4, speed: 330, life: 0.7, look: "gust" });
      if (see) SFX.play("whoosh", 0.45, 0.9);
      break;
    case "lob": case "homing": case "shot":
      fireProjectile(u, t);
      if (see) SFX.play(form === "lob" ? "lob" : "shoot", 0.3, 0.9 + Math.random() * 0.3);
      break;
    default: {                                                        // "slash": claws, fangs, horns
      dealDamage(u, t, u.atk * pd, type, u.titan ? { kb: 12 } : null);
      if (see) FX.slash(t.x, t.y - t.r, a + (Math.random() - 0.5) * 0.8, 10 + u.r * 0.9, col);
      if (status && Math.random() < 0.5) applyStatus(t, status, u, u.atk * 0.2);
      if (type === "electric" && Math.random() < 0.4) chainLightning(u, u.x, sy, t, u.atk * 0.3, 1, type, col);
    }
  }
}

function landPounce(u) {
  const t = u.pounce; u.pounce = null; u.kvx = 0; u.kvy = 0;
  const col = TYPES[u.moveType] ? TYPES[u.moveType].color : "#ffffff";
  if (Game.onScreen(u.x, u.y)) FX.burst(u.x, u.y, "#c8c0a8", 4, 60, 0.3, 3);
  if (!t || (t !== Game.player && !targetable(t)) || dist2(t.x, t.y, u.x, u.y) > Math.pow(u.r + t.r + 34, 2)) return;
  dealDamage(u, t, u.atk * 1.25 * (t === Game.player ? 0.7 : 1), u.moveType, { kb: 8 });
  if (Game.onScreen(u.x, u.y)) { FX.slash(t.x, t.y - t.r, Math.atan2(t.y - u.y, t.x - u.x), 12 + u.r, col); FX.slash(t.x, t.y - t.r, Math.atan2(t.y - u.y, t.x - u.x) + 1.4, 10 + u.r, "#ffffff"); }
}

// ---------------------------------------------------------------- projectiles
function spawnShot(src, tgt, o) {
  const type = o.type || src.moveType, col = TYPES[type] ? TYPES[type].color : (src.color || "#ffffff");
  const sx = o.x !== undefined ? o.x : src.x, sy = o.y !== undefined ? o.y : src.y - src.r * 1.2, sp = o.speed || 400;
  Game.projectiles.push({ kind: o.kind || "shot", x: sx, y: sy, vx: Math.cos(o.angle) * sp, vy: Math.sin(o.angle) * sp, speed: sp, team: src.team, dmg: o.dmg, type, src,
    target: tgt, life: o.life || 0.9, color: col, size: o.size || 6, r: (o.size || 6) + 4, pierce: o.pierce || 0, kb: o.kb || 0, status: o.status || FORM_STATUS[type] || null, look: o.look || type, age: 0 });
}

function fireProjectile(src, tgt) {
  const type = src.moveType, col = TYPES[type] ? TYPES[type].color : (src.color || "#ffffff");
  const sx = src.x, sy = src.y - src.r * 1.2;
  if (src.style === "lob") {
    Game.projectiles.push({ kind: "lob", x: sx, y: sy, sx, sy, tx: tgt.x, ty: tgt.y, t: 0, dur: 0.75, team: src.team, dmg: src.atk, type, src, color: col, aoe: 52 + src.r, size: 6 + src.scale * 2,
      look: type, age: 0, kb: type === "rock" || type === "ground" ? 10 : 0, zone: type === "poison" || type === "fire" });
    return;
  }
  const a = Math.atan2(tgt.y - tgt.r - sy, tgt.x - sx);
  spawnShot(src, tgt, { angle: a, dmg: src.atk, kind: src.style === "homing" ? "homing" : "shot", speed: src.kind === "ranger" ? 560 : src.style === "homing" ? 300 : 400,
    life: src.style === "homing" ? 1.8 : 0.9, size: Math.min(12, 4 + src.scale * 2), look: src.kind === "ranger" ? "bullet" : type });
}

function updateProjectiles(dt) {
  const list = Game.projectiles;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    let dead = false;
    p.age = (p.age || 0) + dt;
    if (p.kind === "lob" || p.kind === "net") {
      p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      if (p.sky) { p.x = p.tx + (1 - t) * 90; p.y = p.ty; p.z = (1 - t) * (1 - t) * 760; }
      else { p.x = lerp(p.sx, p.tx, t); p.y = lerp(p.sy, p.ty, t); p.z = Math.sin(t * Math.PI) * (p.kind === "net" ? 46 : 70); }
      if (p.sky && Math.random() < 0.7) FX.mote(p.x, p.y - p.z, 20, -40, p.color, 0.35, 4);
      if (t >= 1) {
        dead = true;
        if (p.kind === "net") Game.netLanded(p.tx, p.ty);
        else {
          FX.ring(p.tx, p.ty, 6, p.aoe, p.color, 0.35, 3);
          if (p.pillar) { FX.pillar(p.tx, p.ty, p.aoe * 0.55, p.color, 0.55); FX.ring(p.tx, p.ty, 10, p.aoe * 1.5, "#ffffff", 0.5, 5); FX.addShake(8); }
          FX.burst(p.tx, p.ty, p.color, p.sky ? 18 : 10, p.sky ? 220 : 140, 0.4, 4);
          if (Game.onScreen(p.tx, p.ty)) { SFX.play(p.sky ? "bigHit" : "boom", p.sky ? 0.5 : 0.35, 0.9 + Math.random() * 0.3); if (p.sky || p.shake) FX.addShake(p.sky ? 3 : p.shake); }
          forEnemies(p, p.tx, p.ty, p.aoe, (e) => dealDamage(p.src, e, p.dmg * (e === Game.player && !p.sky ? 1 : e === Game.player ? 0.5 : 1), p.type, p.kb ? { kb: p.kb } : null));
          if (p.zone) addZone(p.tx, p.ty, p.aoe * 0.85, 4, p.team, p.dmg * 0.35, p.type, p.src);
        }
      }
    } else {
      p.life -= dt;
      if (p.kind === "homing" && (p.target === Game.player ? Game.player.hp > 0 : targetable(p.target))) {
        const a = Math.atan2(p.target.y - p.target.r - p.y, p.target.x - p.x);
        const ca = Math.atan2(p.vy, p.vx);
        let da = a - ca; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = ca + clamp(da, -5 * dt, 5 * dt);
        p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.random() < 0.3) FX.mote(p.x, p.y, -p.vx * 0.05, -p.vy * 0.05, p.color, 0.25, 3);
      if (p.life <= 0) dead = true;
      else {
        let hit = null;
        const want = p.team === 0 ? 1 : 0;
        Grid.query(p.x, p.y, p.r + 60, (e) => {
          if (hit || e.team !== want || !targetable(e) || (p.hitIds && p.hitIds[e.uid])) return;
          const rr = p.r + e.r;
          if (dist2(e.x, e.y - e.r, p.x, p.y) < rr * rr) hit = e;
        });
        if (!hit && p.team === 1 && !(p.hitIds && p.hitIds.p)) {
          const pl = Game.player, rr = p.r + pl.r + 4;
          if (pl.hp > 0 && dist2(pl.x, pl.y - 14, p.x, p.y) < rr * rr) hit = pl;
        }
        if (hit) {
          dead = true;
          dealDamage(p.src, hit, p.dmg, p.type, p.fromPlayer ? { text: true, kb: p.kb || 5 } : p.kb ? { kb: p.kb } : null);
          if (p.status) applyStatus(hit, p.status, p.src, p.dmg * 0.3);
          if (p.blast) {
            // Runic Blast: splash everything near the impact
            FX.ring(p.x, p.y, 6, p.blast, p.color, 0.3, 3);
            Grid.query(p.x, p.y, p.blast + 40, (e) => { if (e !== hit && e.team === 1 && targetable(e) && dist2(e.x, e.y - e.r, p.x, p.y) < (p.blast + e.r) * (p.blast + e.r)) dealDamage(p.src, e, p.dmg * 0.6, p.type); });
          }
          if (p.pierce > 0) { p.pierce--; dead = false; (p.hitIds = p.hitIds || {})[hit.uid || "p"] = 1; }
          else if (Game.onScreen(p.x, p.y)) FX.burst(p.x, p.y, "#ffffff", 3, 70, 0.2, 3);
        }
      }
    }
    if (!dead) list[w++] = p;
  }
  list.length = w;
}

// Every element has its own projectile: fireballs gutter, water wobbles, ice and
// steel spin, lightning crackles, leaves tumble. `look` defaults to the move's type.
function drawProjectile(ctx, p, time) {
  const z = p.z || 0, s = p.size || 6;
  if (p.kind === "lob" || p.kind === "net") {
    if (p.warn) {
      // where it will land: a ring that fills as the impact nears
      const k = Math.min(1, p.t), hostile = p.team === 1;
      ctx.globalAlpha = 0.12 + k * 0.22; ctx.fillStyle = hostile ? "#ff3a3a" : "#ffd84a";
      ctx.beginPath(); ctx.ellipse(p.tx, p.ty, p.aoe * k, p.aoe * 0.8 * k, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = hostile ? "#ff5a5a" : "#ffd84a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.tx, p.ty, p.aoe, p.aoe * 0.8, 0, 0, TAU); ctx.stroke();
    }
    const sh = p.sky ? Math.max(0.2, 1 - z / 760) : 1;
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#0a0e18";
    ctx.beginPath(); ctx.ellipse(p.sky ? p.tx : p.x, p.sky ? p.ty : p.y, s * sh * 1.4, s * 0.6 * sh, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  const x = p.x, y = p.y - z;
  if (p.kind === "net") {
    // the net whirls open as it flies
    const r = 9 + Math.sin(Math.min(1, p.t) * Math.PI) * 6, rot = p.t * 7;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = "#9fd8ff";
    for (let i = -1; i <= 1; i++) { const hw = Math.sqrt(Math.max(0, r * r - i * i * r * r * 0.25)); ctx.beginPath(); ctx.moveTo(-hw, i * r * 0.5); ctx.lineTo(hw, i * r * 0.5); ctx.moveTo(i * r * 0.5, -hw); ctx.lineTo(i * r * 0.5, hw); ctx.stroke(); }
    ctx.fillStyle = "#ffd84a"; for (let i = 0; i < 4; i++) ctx.fillRect(Math.cos(i * TAU / 4) * r - 1.5, Math.sin(i * TAU / 4) * r - 1.5, 3, 3);
    ctx.restore();
    return;
  }
  const look = p.look || p.type, col = p.color, age = p.age || 0;
  const ang = p.kind === "lob" ? (p.sky ? 1.9 : Math.atan2(p.ty - p.sy - Math.cos(Math.min(1, p.t) * Math.PI) * 140, p.tx - p.sx)) : Math.atan2(p.vy, p.vx);
  const tail = (len, wid, c, a) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, -wid); ctx.lineTo(wid, 0); ctx.lineTo(0, wid); ctx.fill(); ctx.globalAlpha = 1; };
  const disc = (dx, dy, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill(); };
  const halo = (r, a) => { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a; disc(0, 0, r, col); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; };
  ctx.save(); ctx.translate(x, y);
  switch (look) {
    case "arcane": {                                                   // the binder's rune-bolt
      ctx.rotate(ang); halo(s * 1.5, 0.3);
      tail(s * 4, s * 0.55, col, 0.55); tail(s * 2.4, s * 0.3, "#ffffff", 0.8);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s * 1.2, 0); ctx.lineTo(0, -s * 0.62); ctx.lineTo(-s * 0.7, 0); ctx.lineTo(0, s * 0.62); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(s * 0.7, 0); ctx.lineTo(0, -s * 0.28); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(0, s * 0.28); ctx.fill();
      for (let i = 0; i < 2; i++) { const o = age * 22 + i * Math.PI; ctx.fillStyle = "#ffffff"; ctx.fillRect(-s * 0.4 + Math.cos(o) * s * 0.3 - 1, Math.sin(o) * s * 0.9 - 1, 2, 2); }
      break;
    }
    case "power": {                                                    // the heavy shot: a lance of light
      ctx.rotate(ang); halo(s * 1.8, 0.4);
      tail(s * 5.5, s * 0.8, col, 0.6); tail(s * 3.4, s * 0.45, "#ffffff", 0.9);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(-s * 0.2, 0, s * (0.9 + 0.2 * Math.sin(age * 30)), -1.2, 1.2); ctx.stroke(); ctx.globalAlpha = 1;
      disc(0, 0, s * 0.55, "#ffffff");
      break;
    }
    case "fire": case "dragon": {
      ctx.rotate(ang); halo(s * 1.6, 0.3);
      const c1 = look === "fire" ? "#ff5a1a" : "#5a3adc", c2 = look === "fire" ? "#ffa83a" : "#a88aff";
      for (let i = 3; i >= 1; i--) disc(-i * s * 0.62, Math.sin(age * 26 + i * 1.7) * s * 0.3, s * (0.62 - i * 0.12), i === 1 ? c2 : c1);
      disc(0, 0, s * 0.72, c1); disc(s * 0.1, 0, s * 0.48, c2); disc(s * 0.18, 0, s * 0.24, "#fff6c0");
      break;
    }
    case "water": {
      ctx.rotate(ang);
      const wob = 1 + Math.sin(age * 20) * 0.12;
      tail(s * 2.2, s * 0.55, "#2a70c8", 0.7);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.75 * wob, s * 0.62 / wob, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(s * 0.12, -s * 0.34, Math.max(2, s * 0.26), Math.max(2, s * 0.22));
      disc(-s * 1.5, Math.sin(age * 15) * s * 0.4, s * 0.2, col);
      break;
    }
    case "ice": {
      ctx.rotate(ang); halo(s * 1.2, 0.2);
      ctx.fillStyle = "#58a0d8"; ctx.beginPath(); ctx.moveTo(s * 1.5, 0); ctx.lineTo(0, -s * 0.5); ctx.lineTo(-s * 1.1, 0); ctx.lineTo(0, s * 0.5); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s * 1.5, 0); ctx.lineTo(0, -s * 0.5); ctx.lineTo(-s * 1.1, 0); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 1.1, 0); ctx.lineTo(s * 1.5, 0); ctx.stroke();
      break;
    }
    case "electric": {
      ctx.rotate(ang); halo(s * 1.5, 0.35);
      const rnd = mulberry32(((age * 30) | 0) * 131 + ((p.x | 0) & 255));
      ctx.beginPath(); ctx.moveTo(-s * 3, 0);
      for (let i = 1; i < 5; i++) ctx.lineTo(-s * 3 + i * s * 0.85, (rnd() - 0.5) * s * 1.5);
      ctx.lineTo(s, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineJoin = "miter"; ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
      disc(s * 0.8, 0, s * 0.4, "#ffffff");
      break;
    }
    case "grass": case "bug": {
      if (look === "bug") { ctx.rotate(ang); tail(s * 2, s * 0.3, "#5a7a1a", 0.6); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s * 1.4, 0); ctx.lineTo(-s * 0.6, -s * 0.4); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(-s * 0.6, s * 0.4); ctx.fill(); break; }
      ctx.rotate(age * 15 + (p.x & 7));                                // a leaf, tumbling
      ctx.fillStyle = "#2f7434"; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.05, s * 0.48, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.08, s * 0.9, s * 0.34, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#d8ffb0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
      break;
    }
    case "rock": case "ground": {
      ctx.rotate(age * 9);                                             // a boulder, tumbling
      ctx.fillStyle = "#4a3a22"; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, rr = s * (0.85 + ((i * 37) % 5) * 0.07); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, rr = s * (0.68 + ((i * 37) % 5) * 0.06); ctx.lineTo(Math.cos(a) * rr - s * 0.08, Math.sin(a) * rr - s * 0.1); } ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.5; ctx.fillRect(-s * 0.4, -s * 0.5, s * 0.35, s * 0.25); ctx.globalAlpha = 1;
      break;
    }
    case "poison": {
      const wob = 1 + Math.sin(age * 16) * 0.18;
      ctx.rotate(ang); tail(s * 1.8, s * 0.5, "#6a2a9a", 0.6);
      ctx.fillStyle = "#6a2a9a"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.85 * wob, s * 0.85 / wob, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62 * wob, s * 0.62 / wob, 0, 0, TAU); ctx.fill();
      disc(s * 0.2, -s * 0.2, s * 0.18, "#f0d0ff"); disc(-s * 0.3, s * 0.15, s * 0.12, "#f0d0ff");
      break;
    }
    case "psychic": {
      halo(s * 1.4, 0.3);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const k = (age * 2.5 + i * 0.5) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(0, 0, s * (0.4 + k * 0.9), 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1; disc(0, 0, s * 0.42, "#ffffff"); disc(0, 0, s * 0.26, col);
      break;
    }
    case "shadow": {
      ctx.rotate(ang);
      for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.5 - i * 0.1; disc(-i * s * 0.7, Math.sin(age * 12 + i) * s * 0.4, s * (0.6 - i * 0.1), "#3a1a5c"); }
      ctx.globalAlpha = 1; disc(0, 0, s * 0.8, col); disc(0, 0, s * 0.58, "#12081e");
      ctx.fillStyle = "#e0a0ff"; ctx.fillRect(s * 0.1, -s * 0.2, 2, 2);
      break;
    }
    case "light": {
      halo(s * 1.8, 0.35); ctx.rotate(age * 5);
      ctx.fillStyle = col; for (let i = 0; i < 2; i++) { ctx.rotate(Math.PI / 2 * i); ctx.beginPath(); ctx.moveTo(-s * 1.3, 0); ctx.lineTo(0, -s * 0.3); ctx.lineTo(s * 1.3, 0); ctx.lineTo(0, s * 0.3); ctx.fill(); }
      ctx.rotate(Math.PI / 4); ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(0, -s * 0.2); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 0.2); ctx.fill();
      disc(0, 0, s * 0.3, "#ffffff");
      break;
    }
    case "steel": {
      ctx.rotate(age * 20);                                            // a whirling blade
      ctx.fillStyle = "#5a6478"; for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 1.2, 0); ctx.lineTo(0, s * 0.3); ctx.fill(); }
      ctx.fillStyle = col; for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 1.2, 0); ctx.lineTo(0, 0); ctx.fill(); }
      disc(0, 0, s * 0.25, "#2a2e3a");
      break;
    }
    case "air": case "gust": {
      ctx.rotate(ang);
      const big = look === "gust", k = big ? Math.min(1, age * 4) : 1;
      ctx.strokeStyle = "#ffffff"; ctx.lineCap = "round";
      for (let i = 0; i < (big ? 3 : 2); i++) { ctx.globalAlpha = (0.85 - i * 0.25) * (big ? Math.min(1, p.life * 4) : 1); ctx.lineWidth = Math.max(1.5, s * (0.28 - i * 0.07)); ctx.beginPath(); ctx.arc(-s * (0.9 + i * 0.5), 0, s * k * (1 - i * 0.12), -1.05, 1.05); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.lineCap = "butt";
      break;
    }
    case "bullet": {
      ctx.rotate(ang); tail(s * 3, s * 0.3, "#ffd83f", 0.7);
      ctx.fillStyle = "#fff6c0"; ctx.fillRect(-s * 0.5, -1.5, s * 1.2, 3);
      break;
    }
    default: {
      ctx.rotate(ang); tail(s * 2.6, s * 0.5, col, 0.6);
      disc(0, 0, s * 0.6, col); disc(s * 0.1, 0, s * 0.3, "#ffffff");
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Titans
// Each Titan cycles through its own set of telegraphed moves, and quickens when
// it is nearly beaten. A bound Titan fights for the horde with the same moves.
const TITAN_MOVES = {
  thornstag:  ["charge", "stomp", "barrage"],
  mireguard:  ["rain", "stomp", "breath"],
  mysticave:  ["rain", "charge", "stomp"],
  crystallon: ["barrage", "breath", "stomp"],
  solvern:    ["breath", "rain", "charge", "stomp"],
  voidwraith: ["blink", "barrage", "breath", "stomp"],
};
const TITAN_WIND = { stomp: 0.9, charge: 1.0, barrage: 0.7, rain: 0.6, breath: 0.85, blink: 0.8 };
const TITAN_DUR = { stomp: 0, charge: 0.62, barrage: 1.3, rain: 0, breath: 1.35, blink: 0 };
const CHARGE_LEN = 430, BREATH_HALF = 0.42;
// a wild pack Alpha gets two signature moves by how it fights: a smaller, slower-telegraphed Titan
function alphaMoves(u) { return u.style === "melee" ? ["charge", "stomp"] : u.form === "breath" ? ["breath", "stomp"] : ["barrage", "rain"]; }

function titanStompRadius(u) { return u.r * 2 + 70; }
function titanBreathRange(u) { return 250 + u.r * 1.6; }
function titanHurt(u, e, mult, opts) { dealDamage(u, e, u.atk * mult * (e === Game.player ? 0.5 : 1), u.moveType, opts); }

// returns true while the Titan is committed to a move (so it neither walks nor bites)
function updateTitan(u, dt) {
  let m = u.tAtk;
  if (!m) {
    const big = u.titan;
    u.tCd = (u.tCd === undefined ? (big ? 2.5 : 1.5 + Math.random() * 2) : u.tCd) - dt;
    const t = u.target;
    if (u.tCd > 0 || !t) return false;
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    if (d > (big ? 560 : 380)) return false;
    const moves = big ? TITAN_MOVES[u.sp.id] || ["stomp", "charge", "barrage"] : alphaMoves(u);
    u.tIdx = ((u.tIdx === undefined ? -1 : u.tIdx) + 1) % moves.length;
    let kind = moves[u.tIdx];
    if (kind === "stomp" && d > titanStompRadius(u) + 50) kind = moves.find((k) => k !== "stomp") || "stomp";
    if (kind === "charge" && d < 90) kind = "stomp";
    const enr = big && u.hp < u.maxHp * 0.35;
    if (enr && !u.enraged) {
      u.enraged = true;
      if (Game.onScreen(u.x, u.y)) { FX.text(u.x, u.y - u.r * 5, u.name + " is ENRAGED!", "#ff5a5a", 2, 18); FX.ring(u.x, u.y, u.r, 360, "#ff3a3a", 0.8, 6); FX.addShake(8); SFX.play("roar", 0.9, 0.8); }
    }
    const wind = TITAN_WIND[kind] * (enr ? 0.75 : 1) * (big ? 1 : 1.2);
    m = u.tAtk = { kind, t: 0, wind, dur: TITAN_DUR[kind] * (big || kind !== "breath" ? 1 : 0.7), a: Math.atan2(t.y - u.y, t.x - u.x), tx: t.x, ty: t.y, hit: {}, fired: 0, tick: 0, enr, big, len: big ? CHARGE_LEN : 250 };
    u.windup = wind; u.moving = false;
    if (Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
    if (Game.onScreen(u.x, u.y)) SFX.play("windup", 0.5, kind === "stomp" ? 0.7 : 1);
    return true;
  }
  m.t += dt;
  const col = TYPES[u.moveType].color, see = Game.onScreen(u.x, u.y), status = FORM_STATUS[u.moveType];
  if (m.t < m.wind) {
    u.windup = m.wind - m.t;
    // a breath tracks its prey while it is drawn; a charge is locked the moment it is called
    if (m.kind === "breath" && u.target) { let da = Math.atan2(u.target.y - u.y, u.target.x - u.x) - m.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; m.a += clamp(da, -1.2 * dt, 1.2 * dt); }
    return true;
  }
  u.windup = 0;
  if (!m.started) {
    m.started = true;
    switch (m.kind) {
      case "stomp": {
        const rad = titanStompRadius(u);
        FX.ring(u.x, u.y, u.r, rad, col, 0.45, 6); FX.ring(u.x, u.y, u.r * 0.5, rad * 0.7, "#ffffff", 0.3, 3);
        FX.burst(u.x, u.y, col, 24, 260, 0.6, 5); FX.burst(u.x, u.y, "#c8c0a8", 16, 200, 0.7, 5);
        if (see) { FX.addShake(8); SFX.play("bigHit"); }
        forEnemies(u, u.x, u.y, rad, (e) => titanHurt(u, e, 1, { kb: 17 }));
        break;
      }
      case "blink": {
        FX.burst(u.x, u.y - u.r, col, 26, 240, 0.6, 5);
        if (!World.solidAt(m.tx, m.ty, u.pass)) { u.x = m.tx; u.y = m.ty; }
        const rad = u.r * 2 + 50;
        FX.ring(u.x, u.y, u.r, rad, col, 0.45, 6); FX.burst(u.x, u.y - u.r, col, 30, 300, 0.7, 5); FX.pillar(u.x, u.y, u.r * 1.2, col, 0.4);
        if (see) { FX.addShake(7); SFX.play("warp"); SFX.play("bigHit", 0.7); }
        forEnemies(u, u.x, u.y, rad, (e) => titanHurt(u, e, 0.9, { kb: 15 }));
        break;
      }
      case "rain": {
        // boulders / meteors / mire-bombs fall on the horde: every impact point is telegraphed
        const n = !m.big ? 3 : m.enr ? 11 : 7, foes = [];
        forEnemies(u, m.tx, m.ty, 380, (e) => foes.push(e));
        for (let i = 0; i < n; i++) {
          const e = foes.length ? foes[(Math.random() * foes.length) | 0] : null, sp = i === 0 ? 0 : 70;
          const tx = (e ? e.x : m.tx) + (Math.random() - 0.5) * 2 * sp, ty = (e ? e.y : m.ty) + (Math.random() - 0.5) * 2 * sp;
          Game.projectiles.push({ kind: "lob", sky: true, warn: true, x: tx, y: ty, sx: tx, sy: ty, tx, ty, t: 0, dur: 1.15 + i * 0.13, team: u.team, dmg: u.atk * 0.8, type: u.moveType, src: u, color: col,
            aoe: m.big ? 68 : 54, size: m.big ? 13 : 9, look: u.moveType, age: 0, kb: 13, zone: u.moveType === "poison" || u.moveType === "water" || u.moveType === "fire" });
        }
        if (see) SFX.play("roar", 0.5, 1.2);
        break;
      }
      case "charge": if (see) SFX.play("whoosh", 0.8, 0.6); break;
      case "breath": if (see) SFX.play("flame", 0.8, 0.7); break;
    }
  }
  const at = m.t - m.wind;
  if (m.kind === "charge") {
    const ox = u.x, oy = u.y, sp = (m.len / TITAN_DUR.charge) * dt;
    World.move(u, Math.cos(m.a) * sp, Math.sin(m.a) * sp, u.pass);
    u.moving = true; u.facing = Math.cos(m.a) >= 0 ? 1 : -1;
    if (see && Math.random() < 0.8) FX.burst(u.x, u.y, "#c8c0a8", 2, 90, 0.4, 5);
    // everything in the way is thrown aside
    forEnemies(u, u.x, u.y, u.r + 16, (e) => {
      const id = e.uid || "p"; if (m.hit[id]) return; m.hit[id] = 1;
      titanHurt(u, e, 1.1, null);
      const side = (e.x - u.x) * -Math.sin(m.a) + (e.y - u.y) * Math.cos(m.a) >= 0 ? 1 : -1;
      knock(e, -Math.sin(m.a) * side * 0.8 + Math.cos(m.a) * 0.6, Math.cos(m.a) * side * 0.8 + Math.sin(m.a) * 0.6, m.big ? 430 : 260, m.big ? 270 : 150);
    });
    if (Math.hypot(u.x - ox, u.y - oy) < sp * 0.3) m.t = m.wind + m.dur;   // ran into something solid
  } else if (m.kind === "barrage") {
    const total = !m.big ? 9 : m.enr ? 30 : 20, want = Math.min(total, Math.floor((at / m.dur) * total) + 1);
    while (m.fired < want) {
      const a = m.a + m.fired * 0.62;
      spawnShot(u, u.target, { angle: a, dmg: u.atk * 0.4, speed: 250, life: 1.7, size: 9, kind: u.sp.id === "voidwraith" && m.fired % 3 === 0 ? "homing" : "shot" });
      m.fired++;
    }
    if (see && Math.random() < 0.3) SFX.play("shoot", 0.25, 0.7 + Math.random() * 0.3);
  } else if (m.kind === "breath") {
    const range = titanBreathRange(u), sx = u.x, sy = u.y - u.r * 1.4;
    if (u.target) { let da = Math.atan2(u.target.y - u.y, u.target.x - u.x) - m.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; m.a += clamp(da, -0.55 * dt, 0.55 * dt); }
    if (see) { FX.cone(sx, sy, m.a, BREATH_HALF * 0.85, range * 0.9, col, 5, 7); FX.cone(sx, sy, m.a, BREATH_HALF * 0.5, range * 0.9, "#ffffff", 1, 4); }
    m.tick -= dt;
    if (m.tick <= 0) {
      m.tick = 0.18;
      forEnemies(u, u.x, u.y, range, (e) => {
        if (!inCone(u.x, u.y, m.a, BREATH_HALF, range, e)) return;
        titanHurt(u, e, 0.28, null);
        if (status) applyStatus(e, status, u, u.atk * 0.15);
        const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy) || 1; knock(e, dx / d, dy / d, 120, 0);
      });
    }
  }
  if (at >= m.dur) { u.tAtk = null; u.tCd = m.big ? (m.enr ? 2 : 3.2) + Math.random() * 1.2 : 4.5 + Math.random() * 2.5; }
  return true;
}

function drawTitanTelegraph(ctx, u, time) {
  const m = u.tAtk; if (!m) return;
  const winding = m.t < m.wind, k = clamp(m.t / m.wind, 0, 1), hostile = u.team === 1;
  const fill = hostile ? "#ff3a3a" : "#ffd84a", edge = hostile ? "#ff5a5a" : "#ffd84a";
  if (m.kind === "stomp" || m.kind === "blink") {
    if (!winding) return;
    const rad = m.kind === "stomp" ? titanStompRadius(u) : u.r * 2 + 50, cx = m.kind === "stomp" ? u.x : m.tx, cy = m.kind === "stomp" ? u.y : m.ty;
    ctx.globalAlpha = 0.16 + k * 0.2; ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(cx, cy, rad * k, rad * 0.8 * k, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = edge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * 0.8, 0, 0, TAU); ctx.stroke();
  } else if (m.kind === "charge") {
    if (!winding) return;
    const w = u.r * 1.25;
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(m.a);
    const len = m.len || CHARGE_LEN;
    ctx.globalAlpha = 0.12 + k * 0.22; ctx.fillStyle = fill; ctx.fillRect(0, -w, len * k, w * 2);
    ctx.globalAlpha = 0.8; ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.strokeRect(0, -w, len, w * 2);
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const cx = ((time * 1.4 + i / 4) % 1) * len; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(cx - 14, -w * 0.6); ctx.lineTo(cx, 0); ctx.lineTo(cx - 14, w * 0.6); ctx.stroke(); }
    ctx.restore();
  } else if (m.kind === "breath") {
    const range = titanBreathRange(u);
    ctx.globalAlpha = winding ? 0.1 + k * 0.2 : 0.14; ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, winding ? range * (0.3 + 0.7 * k) : range, m.a - BREATH_HALF, m.a + BREATH_HALF); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.75; ctx.strokeStyle = edge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, range, m.a - BREATH_HALF, m.a + BREATH_HALF); ctx.closePath(); ctx.stroke();
  } else if (m.kind === "barrage" || m.kind === "rain") {
    if (!winding) return;
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 24); ctx.strokeStyle = edge; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * (2.4 - k), u.r * (2.4 - k) * 0.8, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
