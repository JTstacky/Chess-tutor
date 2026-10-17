// Shots, beams, collision and damage (EV 1.0.5, research deep-weapons).
import { addPolar, bearing, thrustLimited, boxClamp, wrap } from './trig.js';
import { POD_TYPE, isDisabled, isDead, hasOutfit, outfitVals, newShip, defaultWeapons, computeStats, SPEED } from './ships.js';
import { MOD } from './data.js';
import { shotHitsRoid, roidSize } from './asteroids.js';

export const MAX_SHOTS = 128, MAX_BEAMS = 8;
const TURRET = new Set([4, 7, 8]);

export function spriteSize(game, s) {
  const sp = game.data.sprite(s.type);
  return sp ? { w: sp.w, h: sp.h } : { w: 32, h: 32 };
}

// ev_fighter_launch 0x1001c9c4: a new ship of type W.AmmoType beside the carrier.
export function launchFighter(game, s, wid) {
  const W = game.data.weap[wid], type = W.AmmoType;
  if (!game.data.ship[type] || (s.target >= 0 && !game.ships[s.target]?.alive && s.slot !== 0)) return null;
  const slot = game.ships.findIndex((x, i) => i > 0 && !x?.alive); if (slot < 0) return null;
  const f = newShip(game.data, slot, type, { x: s.x, y: s.y, vx: s.vx, vy: s.vy, ai: 5, govt: s.govt, leader: s.slot, delay: W.Count, carrierBay: wid,
    target: s.slot === 0 ? -1 : s.target, mission: -1, landedAt: -2 });
  computeStats(game.data, f);
  f.weapons = defaultWeapons(game.data, type, s.slot === 0 ? 0.5 : 1.75);
  let h = s.facing; if (W.Inaccuracy > 0) h = wrap(h + game.rng.rand(2 * W.Inaccuracy) - W.Inaccuracy);
  f.facing = f.desired = h;
  const v = { x: f.vx, y: f.vy }; thrustLimited(v, h, f.stats.speed, f.stats.speed); f.vx = v.x; f.vy = v.y;
  game.ships[slot] = f;
  return f;
}

// A fighter back aboard its carrier (inside the carrier's half-size box).
export function dockFighter(game, f) {
  const c = game.ships[f.leader]; if (!c?.alive || f.carrierBay == null) return false;
  const sz = spriteSize(game, c);
  if (Math.abs(f.x - c.x) > sz.w / 2 || Math.abs(f.y - c.y) > sz.h / 2) return false;
  const bay = c.weapons[f.carrierBay]; if (bay) bay.ammo++;
  if (c.slot === 0 && game.pilot.weapons[f.carrierBay]) game.pilot.weapons[f.carrierBay].ammo = bay.ammo;
  game.removeShip(f);
  return true;
}

export function canFire(s, W, slot) {
  if (W.AmmoType < -999 && s.fuel < Math.abs(W.AmmoType) - 1000) return false;
  return W.AmmoType < 0 || slot.ammo > 0;
}

// Lead aim 0x10062be4, including the original's missing factor 2 on the cross term.
export function leadAim(s, t, speed) {
  const dx = t.x - s.x, dy = t.y - s.y, rx = t.vx - s.vx, ry = t.vy - s.vy;
  const a = speed * speed - rx * rx - ry * ry, b = -(dx * rx + dy * ry), c = -dx * dx - dy * dy;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return bearing(s.x, s.y, t.x, t.y);
  const tt = Math.abs((-b + Math.sqrt(disc)) / (2 * a));
  return bearing(s.x, s.y, t.x + t.vx * tt, t.y + t.vy * tt);
}

export function spawnShot(game, s, targetSlot, wid) {
  const W = game.data.weap[wid];
  const shot = game.shots.find(x => x.life <= -2) ?? (game.shots.length < MAX_SHOTS ? game.shots[game.shots.push({ life: -2 }) - 1] : null);
  if (!shot) return null;
  const t = targetSlot >= 0 ? game.ships[targetSlot] : null;
  let x = s.x, y = s.y, vx = 0, vy = 0, heading = s.facing;
  const g = W.Guidance;
  if (TURRET.has(g)) {
    s.mount = (s.mount + 1) % 4;
    const p = { x, y }; addPolar(p, s.facing, game.data.ship[s.type].TurretYDisp[s.mount] ?? 0); x = p.x; y = p.y;
    if (t?.alive) heading = leadAim(s, t, W.Speed / 100);
    else if (g === 8) heading = wrap(s.facing + 180);
  }
  if (s.slot === 0) {
    if (!TURRET.has(g)) { vx = s.vx; vy = s.vy; }
    if (g === 5) { vx *= 0.5; vy *= 0.5; }
  }
  let life = Math.trunc(W.Count / SPEED.S);   // FUN_1001d914
  if (s.slot !== 0 && s.leader !== 0) life = Math.trunc(life * (game.data.evo ? 1.5 : 1.75));
  const sp = game.data.sprite(200 + W.Graphic);
  Object.assign(shot, {
    wid, owner: s.slot, target: targetSlot, life, maxLife: life, heading, state: 0, clamp: s.state === 13, decay: 0, decayN: 0,
    x, y, vx, vy, w: (sp?.w ?? 8) + 2 * Math.max(0, W.ProxRadius), h: (sp?.h ?? 8) + 2 * Math.max(0, W.ProxRadius),
  });
  const interference = game.data.syst[game.system]?.Interference ?? 0;
  if (game.data.evo) { if (g === 1 && (W.Seeker & 8) && game.rng.rand(100) + 1 <= interference) shot.state = 999; }   // jammed: flies straight
  else if (g === 1 && game.rng.rand(100) + 1 <= interference) shot.state = 1;
  if (g === -1 || g === 1 || g === 2) { const p = { x: shot.x, y: shot.y }; addPolar(p, heading, 0.5 * spriteSize(game, s).h); shot.x = p.x; shot.y = p.y; }
  if (g === -1 && game.data.evo) {                                      // EVO ShotXOffset, alternate sides (FUN_100612fc)
    const off = shotXOffset(game.data, s, wid);
    if (off) { const p = { x: shot.x, y: shot.y }; addPolar(p, wrap(s.facing + 90), off); shot.x = p.x; shot.y = p.y; }
    s.xside = (s.xside ?? 0) < 0 ? 0 : -1;
  }
  if (W.Inaccuracy > 0 && g !== 5) shot.heading = heading = wrap(heading + game.rng.rand(2 * W.Inaccuracy) - W.Inaccuracy);
  if (!(g === 6 && s.slot === 0)) { const v = { x: shot.vx, y: shot.vy }; addPolar(v, heading, W.Speed / 100); shot.vx = v.x; shot.vy = v.y; }
  if (W.Inaccuracy > 0 && g === 5) shot.heading = wrap(heading + game.rng.rand(2 * W.Inaccuracy) - W.Inaccuracy);
  return shot;
}

// FUN_100612fc: ship ShotXOffset, 0 for MiscFlags 0x80 or fewer than two guns; negated while side toggle >= 0.
export function shotXOffset(data, s, wid) {
  let off = data.ship[s.type]?.ShotXOffset ?? 0;
  if (data.weap[wid].MiscFlags & 0x80) off = 0;
  if (off < 1 || (s.weapons[wid]?.count ?? 0) < 2) return 0;
  return (s.xside ?? 0) >= 0 ? -off : off;
}

export function spawnBeam(game, s, targetSlot, wid, angle, nose) {
  const W = game.data.weap[wid];
  let b = game.beams.find(x => x.life < 0);
  if (!b) { if (game.beams.length >= MAX_BEAMS) return null; b = { life: -1 }; game.beams.push(b); }
  Object.assign(b, { wid, owner: s.slot, target: W.Guidance === 3 ? targetSlot : -1, life: W.Count, nose, angle });
  return b;
}

// One trigger pull for weapon `wid` (player 0x100397a0, NPC block of 0x10018054).
export function fireWeapon(game, s, wid) {
  const W = game.data.weap[wid], slot = s.weapons[wid];
  if (!W || !slot || slot.count <= 0 || slot.reload > 0 || s.jump > 0) return 0;
  const n = (W.MiscFlags & 0x40) ? slot.count : 1, t = s.target >= 0 ? game.ships[s.target] : null;
  const live = t?.alive ? t : null;
  let fired = 0;
  for (let i = 0; i < n; i++) {
    if (!canFire(s, W, slot)) continue;
    const g = W.Guidance;
    let ok = false;
    if (g === 99) ok = !!launchFighter(game, s, wid);
    else if (s.slot === 0) {
      if (g === -1 || g === 1 || g === 2 || g === 5 || g === 6) ok = !!spawnShot(game, s, s.target, wid);
      else if (g === 0) ok = !!spawnBeam(game, s, s.target, wid, s.facing, true);
      else if (g === 3) ok = !!live && !!spawnBeam(game, s, s.target, wid, bearing(s.x, s.y, live.x, live.y), false);
      else if (g === 4) ok = !!live && !!spawnShot(game, s, s.target, wid);
      else if (g === 7 || g === 8) {
        if (!live) ok = g === 7 && !!spawnShot(game, s, -1, wid);
        else {
          const a = Math.abs(bearing(s.x, s.y, live.x, live.y) - (g === 8 ? wrap(s.facing + 180) : s.facing)) % 360;
          if (a < 46) ok = !!spawnShot(game, s, s.target, wid); else if (g === 7) ok = !!spawnShot(game, s, -1, wid);
        }
      }
    } else {
      if ((g === 3 || g === 4) && live) {
        const r = Math.trunc(g === 3 ? W.Speed / 100 : W.Speed / 100 * W.Count);
        if (Math.abs(live.x - s.x) < r && Math.abs(live.y - s.y) < r)
          ok = g === 3 ? !!spawnBeam(game, s, s.target, wid, bearing(s.x, s.y, live.x, live.y), false) : !!spawnShot(game, s, s.target, wid);
      } else if ((g === 7 || g === 8) && live) {
        const r = Math.trunc(W.Speed / 100 * W.Count);
        const a = Math.abs(bearing(s.x, s.y, live.x, live.y) - (g === 8 ? wrap(s.facing + 180) : s.facing)) % 360;
        if (Math.abs(live.x - s.x) < r && Math.abs(live.y - s.y) < r && a < 46) ok = !!spawnShot(game, s, s.target, wid);
      } else if ((g === 1 || g === 2) && live) ok = !!spawnShot(game, s, s.target, wid);
      else if (g === -1 || g === 6) ok = !!spawnShot(game, s, s.target, wid);
      else if (g === 0) ok = !!spawnBeam(game, s, s.target, wid, s.facing, true);
    }
    if (!ok) continue;
    fired++;
    if (g === 99) { slot.ammo = Math.max(0, slot.ammo - 1); continue; }
    if (W.AmmoType !== -1 && s.pers !== 0x1ff) {
      if (W.AmmoType < 1) { if (W.AmmoType < -999) s.fuel = Math.max(0, s.fuel - (Math.abs(W.AmmoType) - 1000)); }
      else slot.ammo = Math.max(0, slot.ammo - 1);
    }
  }
  if (fired > 0) {
    slot.reload = fired * Math.trunc(W.Reload / slot.count);
    if (W.Sound >= 0) game.emit({ type: 'sound', id: 200 + W.Sound, x: s.x, y: s.y, loop: !!(W.MiscFlags & 0x10), beam: W.Guidance === 0 || W.Guidance === 3 });
  }
  return fired;
}

// ev_ship_apply_damage 0x10017384
export function applyDamage(game, T, hx, hy, impact, mass, energy, attacker, direct, clamp = false) {
  if (!T.alive || T.type === POD_TYPE) return;
  const wasDisabled = isDisabled(T), wasDead = isDead(T);
  if (impact > 0 && T.jump <= 0) {
    const v = { x: T.vx, y: T.vy };
    thrustLimited(v, bearing(hx, hy, T.x, T.y), impact / Math.max(1, T.stats.mass), T.stats.baseSpeed);
    boxClamp(v, T.stats.speed); T.vx = v.x; T.vy = v.y;
  }
  const big = Math.max(mass, energy), evo = game.data.evo;
  let d = T.pool < 0 ? Math.trunc(0.25 * energy + mass) : Math.trunc(0.25 * mass + energy);
  if (evo) { if (d < 1 && (mass > 0 || energy > 0)) d = 1; }          // EVO FUN_10063984: minimum 1
  else if (d < big && (mass > 0 || energy > 0)) d = big;
  const pin = evo && (game.data.ship[T.type].Flags & 0x10) ? 0.85 : 0.6;
  if (clamp && T.pool - d < -T.stats.armorMax) d = Math.trunc(pin * T.stats.armorMax + T.pool);
  T.pool -= Math.max(d, 0);
  const A = attacker >= 0 ? game.ships[attacker] : null;
  const byPlayer = attacker === 0 || (A && A.leader === 0);
  if (!wasDisabled && isDisabled(T) && T.slot !== 0) {
    T.disabledSeen = true;
    if (T.leader === 0) T.leader = -1;
    game.emit({ type: 'disabled', slot: T.slot });
    if (byPlayer && T.defends === -1 && !(T.mission >= 0)) game.legalPenalty(T.govt, 1);
    game.onShipDisabled?.(T);
  }
  if (!wasDead && isDead(T)) {
    if (byPlayer && T.slot !== 0) { game.pilot.kills = Math.min(32000, game.pilot.kills + T.stats.crew); if (T.defends === -1 && !(T.mission >= 0)) game.legalPenalty(T.govt, 3); }
    if (T.slot !== 0) game.onShipKilled?.(T);
    game.startDeath(T);
  }
  // Provocation (the end of 0x10017384): does the victim turn on its attacker?
  if (T.slot !== 0) game.provoke?.(T, attacker, mass, energy, direct);
  if (attacker === 0) game.attackNotice(T);
}

function shotHits(game, shot, W, O, T) {
  if (T.type === POD_TYPE || T.slot === O.slot || T.pers === 0x1ff || !T.alive || T.death > 0) return false;
  if ((W.Guidance === 1 || W.Guidance === 2) && T.slot !== shot.target) return false;
  if (O.leader !== -1 && T.leader !== -1 && T.leader === O.leader) return false;
  if (O.govt !== -1 && T.govt === O.govt) return false;
  if (O.defends !== -1 && T.defends === O.defends) return false;
  if (O.slot === 0 && T.leader === 0) return false;                     // the player's escorts
  if (O.leader !== -1 && T.slot === O.leader) return false;             // own mothership
  if (T.leader === O.slot) return false;                                // own fighters/escorts
  const sz = spriteSize(game, T);
  return Math.abs(T.x - shot.x) * 2 < sz.w + shot.w && Math.abs(T.y - shot.y) * 2 < sz.h + shot.h;
}

export function explode(game, kind, x, y, delay = 0) {
  game.emit({ type: 'explosion', kind, x, y, delay });
  if (kind >= 1) game.emit({ type: 'sound', id: kind === 2 ? 300 : 301, x, y });
}

// Shot update 0x10015e9c + guidance 0x10030720 + collision 0x10016420.
export function stepShots(game) {
  const ships = game.ships, player = ships[0];
  for (const shot of game.shots) {
    if (shot.life <= -2) continue;
    const W = game.data.weap[shot.wid];
    if (shot.life <= 0) { if (W.ExplodType > 0) explode(game, 0, shot.x, shot.y); shot.life = -2; continue; }
    shot.life--;
    // EVO decay (100269a4): every Decay+1 steps the shot loses one more point of mass and energy.
    if (W.Decay > 0 && game.data.evo && ++shot.decayN > W.Decay) { shot.decayN = 0; shot.decay++; }
    guide(game, shot, W, player);
    shot.x += shot.vx * SPEED.S; shot.y += shot.vy * SPEED.S;
    const O = ships[shot.owner] ?? { slot: shot.owner, govt: -2, leader: -1, defends: -1 };
    for (const T of ships) {
      if (!T || !shotHits(game, shot, W, O, T)) continue;
      if (T.slot === 0) game.uncloak?.();          // FUN_10016420 l.9643: a hit decloaks the player
      explode(game, Math.max(0, W.ExplodType), shot.x, shot.y);
      applyDamage(game, T, shot.x, shot.y, W.Impact, Math.max(0, W.MassDmg - shot.decay), Math.max(0, W.EnergyDmg - shot.decay), shot.owner, true, shot.clamp);
      if (W.BlastRadius > 0) for (const B of ships) {
        if (!B?.alive || B === T) continue;
        if (B.slot === shot.owner && ((W.MiscFlags & 0x100) || shot.owner !== 0)) continue;
        if (Math.abs(B.x - shot.x) <= W.BlastRadius && Math.abs(B.y - shot.y) <= W.BlastRadius)
          applyDamage(game, B, shot.x, shot.y, W.Impact, W.MassDmg, W.EnergyDmg, shot.owner, false, shot.clamp);
      }
      shot.life = -2;
      break;
    }
    if (shot.life > -2 && !(W.MiscFlags & 0x20)) {
      const r = game.roids.find(x => shotHitsRoid(shot, x));
      if (r) shotHitsRoidFx(game, shot, W);
    }
  }
  decoyHits(game);                     // Override's FUN_10062800 is the same routine (kinds 5/-1, owners, state 2)
}

// FUN_1001f59c: a shot that touches an asteroid explodes by its ExplodType and dies; the asteroid
// takes nothing. Type 2 adds debris: 0.04 * BlastRadius small blasts (delay 4-11) within a quarter of
// the radius and 0.16 * BlastRadius tiny ones (delay 8-23) within half of it. Only sprites of kind -1
// count (+0x52); a shot's sprite gets kind 5 when its weapon has MiscFlags 0x20 (0x1001e394), so decoys
// pass through.
function shotHitsRoidFx(game, shot, W) {
  const t = W.ExplodType;
  if (t === 0) game.emit({ type: 'explosion', kind: 0, x: shot.x, y: shot.y });
  if (t === 1 || t === 2) explode(game, t, shot.x, shot.y);
  if (t === 2) roidDebris(game, shot.x, shot.y, W.BlastRadius, Math.trunc(0.04 * W.BlastRadius), Math.trunc(0.16 * W.BlastRadius));
  shot.life = -2;
}
function roidDebris(game, x, y, B, n1, n2) {
  const rng = game.rng;
  for (let i = 0; i < n1; i++) {
    const ex = x + rng.rand(Math.trunc(0.5 * B)) - 0.25 * B, ey = y + rng.rand(Math.trunc(0.5 * B)) - 0.25 * B;
    game.emit({ type: 'explosion', kind: 1, x: ex, y: ey, delay: rng.rand(8) + 4 });
  }
  for (let i = 0; i < n2; i++) {
    const ex = x + rng.rand(B) - 0.5 * B, ey = y + rng.rand(B) - 0.5 * B;
    game.emit({ type: 'explosion', kind: 0, x: ex, y: ey, delay: rng.rand(16) + 8 });
  }
}

function guide(game, shot, W, player) {
  const g = W.Guidance, speed = W.Speed / 100;
  if (g === 6) {
    const p = { x: 0, y: 0 }; addPolar(p, shot.heading, speed);
    shot.vx = 0.01 * (95 * shot.vx + 5 * p.x); shot.vy = 0.01 * (95 * shot.vy + 5 * p.y); return;
  }
  const T = shot.target >= 0 ? game.ships[shot.target] : null;
  // Guidance 5 (bombs, decoy flares): the sprite turns 1 degree a step toward the direction of motion
  // (bearing of 1000 * velocity, end of 0x10030720); the velocity is left alone.
  if (g === 5) {
    const b = bearing(0, 0, 1000 * shot.vx, 1000 * shot.vy);
    if (b !== shot.heading) shot.heading = wrap(shot.heading + (wrap(b - shot.heading) < 181 ? 1 : -1));
    return;
  }
  if (g !== 1 && g !== 2) return;
  if (game.data.evo) return guideEvo(game, shot, W, T, speed);
  const armed = 15 < 1.75 * W.Count - shot.life;
  const fly = () => { const v = { x: 0, y: 0 }; addPolar(v, shot.heading, speed); boxClamp(v, speed); shot.vx = v.x; shot.vy = v.y; };
  if (shot.state === 0) {
    if (T?.alive) {
      if (armed) {
        let turn = g === 1 ? 1 : 4;
        if (T.slot === 0 && g === 2 && hasOutfit(game.data, game.pilot.outfits, MOD.JAMMER)) turn = 1;
        if (T.slot === 0 && game.pilot.cloaked) turn = 0;
        const b = bearing(shot.x, shot.y, T.x, T.y), diff = b - shot.heading;
        if (Math.abs(diff) > turn) shot.heading = wrap(shot.heading + (wrap(diff) < 181 ? turn : -turn));
      }
      fly();
    }
    // Guidance 2 seeks: 1 in 10 steps the 10 asteroid slots, the first active one within 200 px on both
    // axes and 15 degrees of the heading: state 1, target = that slot. Then, still in state 0, 1 in 15
    // steps the shots for a live decoy (MiscFlags 0x20) of another owner within 200 px on both axes and
    // 10 degrees of the heading: state 2, target = that shot's index.
    if (g === 2 && game.rng.rand(10) === 0) {
      const k = game.roids.findIndex(r => r.active && Math.abs(Math.trunc(r.x - shot.x)) < 200 && Math.abs(Math.trunc(r.y - shot.y)) < 200
        && Math.abs(bearing(shot.x, shot.y, r.x, r.y) - shot.heading) % 360 < 16);
      if (k >= 0) { shot.state = 1; shot.target = k; }
    }
    if (shot.state === 0 && g === 2 && game.rng.rand(15) === 0) {
      const k = game.shots.findIndex(o => o.life > 0 && o.owner !== shot.owner && (game.data.weap[o.wid].MiscFlags & 0x20)
        && Math.abs(Math.trunc(o.x - shot.x)) < 200 && Math.abs(Math.trunc(o.y - shot.y)) < 200
        && Math.abs(bearing(shot.x, shot.y, o.x, o.y) - shot.heading) % 360 < 11);
      if (k >= 0) { shot.state = 2; shot.target = k; }
    }
    return;
  }
  if (g === 1) {                                         // jammed by the system's interference
    if (armed) shot.heading = wrap(shot.heading + (game.frame % 200 < 100 ? -1 : 1));
    fly(); return;
  }
  // State 1 steers 5 degrees a step at the asteroid in its slot (dropped once the slot is inactive).
  // State 2 steers at the decoy shot, but tests the *ship* with that index for being active (an
  // original slip, deep-weapons 4.3); an inactive one drops the target.
  let b = shot.heading;
  if (shot.state === 1) {
    const r = shot.target >= 0 ? game.roids[shot.target] : null;
    if (r && !r.active) shot.target = -1; else if (r) b = bearing(shot.x, shot.y, r.x, r.y);
  } else if (shot.target >= 0) {
    const o = game.shots[shot.target];
    if (!game.ships[shot.target]?.alive || !o) shot.target = -1; else b = bearing(shot.x, shot.y, o.x, o.y);
  }
  if (armed && Math.abs(b - shot.heading) > 5) shot.heading = wrap(shot.heading + (wrap(b - shot.heading) < 181 ? 5 : -5));
  fly();
}

// Shot against shot (0x100162b4): a decoy (MiscFlags 0x20) and an ordinary shot of different owners,
// one of them hunting a decoy (state 2), destroy each other when their rectangles meet: a small
// explosion and snd 301 at priority 5.
function decoyHits(game) {
  const live = game.shots.filter(o => o.life > 0), decoy = o => !!(game.data.weap[o.wid].MiscFlags & 0x20);
  for (const a of live) {
    if (!decoy(a) || a.life <= 0) continue;
    for (const b of live) {
      if (b === a || decoy(b) || b.life <= 0 || a.owner === b.owner || (a.state !== 2 && b.state !== 2)) continue;
      if (Math.abs(a.x - b.x) * 2 > a.w + b.w || Math.abs(a.y - b.y) * 2 > a.h + b.h) continue;
      explode(game, 0, b.x, b.y);
      game.emit({ type: 'sound', id: 301, x: b.x, y: b.y });
      a.life = -2; b.life = -2;
      break;
    }
  }
}

// EVO jamming class k (FUN_1005a940): 2 = always confuses, 1 = confuses on Rand(2)==0, 0 = no.
// The player uses owned ModType 10 outfits' ModVal bits (1<<k half, 0x10<<k always); NPCs their
// government's InherentJam bits, one level weaker for AI 1/2 ships when bit 0x100 is set.
function jamLevel(game, T, k) {
  let lvl = 0;
  const test = bits => { if (bits & (0x10 << k)) lvl = 2; else if ((bits & (1 << k)) && lvl < 1) lvl = 1; };
  if (T.slot === 0) for (const v of outfitVals(game.data, game.pilot.outfits, MOD.JAMMER)) test(v);
  else {
    const G = game.data.govtOf(T.govt); if (!G) return 0;
    test(G.InherentJam ?? 0);
    if ((T.ai === 1 || T.ai === 2) && (G.InherentJam & 0x100)) lvl = Math.max(0, lvl - 1);
  }
  return lvl === 2 ? 2 : lvl === 1 && game.rng.rand(2) === 0 ? 1 : 0;
}

// EVO homing step (FUN_100233bc + final-behaviour-closure corrections).
function guideEvo(game, shot, W, T, speed) {
  const Seek = W.Seeker ?? 0, armed = 15 < 1.5 * W.Count - shot.life;
  const base = W.Guidance === 1 ? 1 + ((Seek & 0x1000) ? 2 : 0) + ((Seek & 0x2000) ? 4 : 0) : 0;   // FUN_100608a4
  const fly = () => { const v = { x: 0, y: 0 }; addPolar(v, shot.heading, speed); boxClamp(v, speed); shot.vx = v.x; shot.vy = v.y; };
  // Jammed at launch (state 999): the heading weaves by the turn rate, left while frame % 200 < 100,
  // then right; with Seeker 0x8000 a 1 in 1000 chance a step to turn on the shooter.
  if (shot.state === 999) {
    if (armed) shot.heading = wrap(shot.heading + (game.frame % 200 < 100 ? -base : base));
    fly();
    if ((Seek & 0x8000) && game.rng.rand(1000) === 0 && shot.owner !== -1) { shot.state = 0; shot.target = shot.owner; shot.owner = -1; }
    return;
  }
  // Chasing an asteroid (state 1) or a decoy (state 2, tested as a ship index, as in EV) at the
  // turn rate; an inactive one drops the target and the shot flies on.
  if (shot.state === 1 || shot.state === 2) {
    let b = shot.heading;
    if (shot.target >= 0) {
      const o = shot.state === 1 ? game.roids[shot.target] : game.shots[shot.target];
      const alive = shot.state === 1 ? !!o?.active : !!game.ships[shot.target]?.alive;
      if (!alive || !o) shot.target = -1; else b = bearing(shot.x, shot.y, o.x, o.y);
    }
    if (armed && Math.abs(b - shot.heading) > base) shot.heading = wrap(shot.heading + (wrap(b - shot.heading) < 181 ? base : -base));
    fly();
    return;
  }
  if (armed) {
    let turn = 1 + ((Seek & 0x1000) ? 2 : 0) + ((Seek & 0x2000) ? 4 : 0);
    const retarget = () => { if (shot.owner !== -1) { shot.target = shot.owner; shot.owner = -1; } };
    if (T?.alive) for (let k = 0; k < 4; k++) {
      if ((Seek & (0x10 << k)) && jamLevel(game, T, k) && game.rng.rand(2) === 0) { if (turn > 0) turn = -turn; if ((Seek & 0x8000) && game.rng.rand(1000) === 0) retarget(); }
      if ((Seek & (0x100 << k)) && jamLevel(game, T, k)) { if (turn > 0) turn = -turn; if ((Seek & 0x8000) && game.rng.rand(500) === 0) retarget(); }
    }
    if (T?.slot === 0 && game.pilot.cloaked) { turn = 0; if ((Seek & 0x8000) && game.rng.rand(1000) === 0) retarget(); }
    const Tn = shot.target >= 0 ? game.ships[shot.target] : null;
    const b = Tn?.alive ? bearing(shot.x, shot.y, Tn.x, Tn.y) : shot.heading;
    if ((Seek & 0x4000) && Tn?.alive && Math.abs(Math.trunc(Tn.x - shot.x)) < 250 && Math.abs(Math.trunc(Tn.y - shot.y)) < 250
      && Math.abs(b - shot.heading) % 360 > 45) shot.target = -1;
    const diff = b - shot.heading;
    if (Math.abs(diff) > Math.abs(turn)) shot.heading = wrap(shot.heading + (wrap(diff) < 181 ? turn : -turn));
  }
  fly();
  // FUN_100233bc: homing shots with Seeker 2 look for an asteroid 1 step in 10 (200 px box, 15
  // degrees), then with Seeker 4 and still in state 0 for a decoy 1 step in 15 (200 px, 10 degrees).
  if (W.Guidance !== 1) return;
  if ((Seek & 2) && game.rng.rand(10) === 0) {
    const k = game.roids.findIndex(r => r.active && Math.abs(Math.trunc(r.x - shot.x)) < 200 && Math.abs(Math.trunc(r.y - shot.y)) < 200
      && Math.abs(bearing(shot.x, shot.y, r.x, r.y) - shot.heading) % 360 < 16);
    if (k >= 0) { shot.state = 1; shot.target = k; }
  }
  if (shot.state === 0 && (Seek & 4) && game.rng.rand(15) === 0) {
    const k = game.shots.findIndex(o => o.life > 0 && o.owner !== shot.owner && (game.data.weap[o.wid].MiscFlags & 0x20)
      && Math.abs(Math.trunc(o.x - shot.x)) < 200 && Math.abs(Math.trunc(o.y - shot.y)) < 200
      && Math.abs(bearing(shot.x, shot.y, o.x, o.y) - shot.heading) % 360 < 11);
    if (k >= 0) { shot.state = 2; shot.target = k; }
  }
}

// Beams: circle of radius L around the shooter intersected with a thin cone (0x1002dd40).
export function stepBeams(game) {
  for (const b of game.beams) {
    if (b.life < 0) continue;
    const O = game.ships[b.owner];
    if (!O?.alive || O.death > 0) { b.life = -1; continue; }
    const W = game.data.weap[b.wid];
    b.life--;
    const t = b.target >= 0 ? game.ships[b.target] : null;
    let a = t?.alive ? bearing(O.x, O.y, t.x, t.y) : O.facing;
    if (W.Inaccuracy > 0) a = wrap(a + game.rng.rand(2 * W.Inaccuracy) - W.Inaccuracy);
    const p = { x: O.x, y: O.y }; if (b.nose) addPolar(p, a, 0.5 * spriteSize(game, O).h);
    const L = Math.trunc(2 * W.Speed / 100);
    b.x = p.x; b.y = p.y; b.angle = a; b.len = L;
    // Only a beam whose start lies left of the status bar (screen x <= right - 0x95 = 491, the view
    // centre being x 248) is drawn and does damage, to ships and asteroids alike; nothing else is
    // tested (0x1002dd40: the start x as a short after the nose offset; the end is clipped to 491).
    const P0 = game.ships[0];
    b.off = !!P0 && ((Math.trunc(248 + (p.x - P0.x)) << 16) >> 16) > 640 - 0x95;
    if (b.off) { if (b.life <= 0) b.life = -1; continue; }
    for (const T of game.ships) {
      if (!T?.alive || T === O || T.type === POD_TYPE || T.death > 0) continue;
      if (O.govt !== -1 && T.govt === O.govt) continue;
      if (T.leader === O.slot || O.leader === T.slot || (O.leader !== -1 && T.leader === O.leader)) continue;
      if (O.slot === 0 && T.leader === 0) continue;
      const dx = T.x - O.x, dy = T.y - O.y;
      if (dx * dx + dy * dy > L * L) continue;
      const tol = Math.trunc(Math.trunc(0.66 * spriteSize(game, T).h) * 10 / 32);
      if (Math.abs(bearing(O.x, O.y, T.x, T.y) - a) > tol) continue;
      if (W.Impact < 0 && T.slot !== 0) T.tractored = true;
      applyDamage(game, T, O.x, O.y, W.Impact, W.MassDmg, W.EnergyDmg, O.slot, true, false);
      if (game.frame % 3 === 0) game.emit({ type: 'explosion', kind: 0, x: T.x + game.rng.rand(50) - 25, y: T.y + game.rng.rand(50) - 25 });
    }
    // Asteroids (0x1002dd40, after the ships): inside the beam length on both axes and within
    // trunc(0.66 * sprite width) * 10 / 32 degrees. An explosion by ExplodType within 25 px of it
    // (no sound), type 2 with debris, then the damage counter loses MassDmg and a quarter of
    // EnergyDmg. Only a counter below -31999 removes the asteroid.
    // Override's beam step (FUN_10020ffc) has no asteroid loop.
    if (!game.data.evo) for (const r of game.roids) {
      if (!r.active) continue;
      if (Math.abs(r.x - O.x) > L || Math.abs(r.y - O.y) > L) continue;
      const tol = Math.trunc(Math.trunc(0.66 * roidSize(r)) * 10 / 32);
      if (Math.abs(bearing(O.x, O.y, r.x, r.y) - a) > tol) continue;
      const ex = r.x - 25 + game.rng.rand(50), ey = r.y - 25 + game.rng.rand(50), t = W.ExplodType, B = W.BlastRadius;
      if (t >= 0 && t <= 2) game.emit({ type: 'explosion', kind: t, x: ex, y: ey });
      if (t === 2) roidDebris(game, ex, ey, B, Math.trunc(2 * B / 50), Math.trunc(8 * B / 50));
      r.hp -= W.MassDmg;
      r.hp = Math.trunc(r.hp - 0.25 * W.EnergyDmg);
    }
    if (b.life <= 0) b.life = -1;
  }
}
