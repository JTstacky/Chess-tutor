// ai.js — a computer opponent that plays through the same actions as a person (fire/build/send/setAmmo).
import { guarded, fortSpan, AMMO, isOpen, heroOk, ultReady, ultimate, autoBuild, freeSlots, slotCount, powerCost, upgradePower, hasAmmo, UNIT, BUILD, W, MID, FORT, RACE_KEYS, kingPos, catPos, colX, rowY, mx, dir, gateX, solve, fire, build, send, setAmmo, placeOk, costFor, shotCost, raceOf, bonusY, rulesOf } from './sim.js';

export const LEVELS = {
  // owner 2026-11-25: the computer was too hard (every level fired at the reload limit). A person fires about 12-18 shots
  // a minute; these give about 11 (easy), 17 (normal) and 24 (hard). Measured with lane 3's tools/ailevels.mjs.
  // fireMul: extra wait after a reload, as a multiple of that reload (survives reload tuning). With the 3 s stone
  // reload: about 6 (easy), 9 (normal) and 13 (hard) shots a minute.
  easy:   { aimErr: 0.13,  think: 1.2, special: 0.12, defend: 0.25, offense: 0.35, fireMul: 2.3,  bonus: 0.15, invest: 0.25 },
  normal: { aimErr: 0.075, think: 0.8, special: 0.3,  defend: 0.6,  offense: 0.6,  fireMul: 1.2,  bonus: 0.45, invest: 0.6 },
  hard:   { aimErr: 0.04,  think: 0.5, special: 0.5,  defend: 0.9,  offense: 0.85, fireMul: 0.7, bonus: 0.8,  invest: 0.9 },
};
export function pickRace(seed = 1) { return RACE_KEYS[Math.abs(seed) % RACE_KEYS.length]; }

/** opts (for the balance tools): invest/bonus/troops false switch that habit off; only: [unit keys] limits what it sends. */
export function createAI(p, level = 'normal', seed = 7, opts = {}) {
  const cfg = { ...(LEVELS[level] || LEVELS.normal) };
  const recent = [];                                               // the last few troops sent
  const motion = new WeakMap();                                    // observed positions, never a live aim reference
  if (opts.invest === false) cfg.invest = 0;
  if (opts.invest === true) cfg.invest = 1;
  if (opts.bonus === false) cfg.bonus = 0;
  if (opts.bonus === true) cfg.bonus = 1;
  let a = seed >>> 0;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  let timer = 0, waitFire = 0, planRound = 0, planDone = 0;
  const fireWait = (s) => cfg.fireMul * AMMO_R(s) * Math.max(0.35, rulesOf(s).reload);   // no-reload modes: about three times the shots
  const AMMO_R = (s) => (AMMO[s.players[p].ammo]?.reload || 3) * (raceOf(s, p).mods.reload || 1);
  const foe = 1 - p;

  /** Fling at a point with this level's wobble. Tries the wanted lob angle first, then others that reach. */
  function shootAt(s, tx, ty, ang, vx = 0) {
    for (const an of [ang, -1.45, -1.1, -0.6, 0, 0.95, 0.75, 1.15, 0.55]) {
      let aimX = tx, sol;
      // Use this trajectory's flight time, rather than assuming every shot
      // takes 1.2 seconds and every target is still marching at full speed.
      for (let i = 0; i < 4; i++) {
        sol = solve(p, aimX, ty, an);
        if (!sol || !vx) break;
        aimX = Math.max(20, Math.min(W - 20, tx + vx * sol.t));
      }
      sol = solve(p, aimX, ty, an);
      if (!sol) continue;
      const ang2 = an + gauss() * cfg.aimErr, pw = sol.power * (1 + gauss() * cfg.aimErr * 0.7);
      return fire(s, p, Math.cos(ang2) * dir(p), Math.sin(ang2), pw);
    }
    return false;
  }
  /** Lead a flying bonus: find the angle whose flight meets it. */
  function bonusShot(s, b) {
    const c = catPos(p);
    for (const an of [0.8, 1.0, 0.6]) {
      let bx = b.x;
      for (let i = 0; i < 4; i++) { const sol = solve(p, bx, bonusY(b), an); if (!sol) { bx = null; break; } bx = b.x + b.vx * sol.t; }
      if (bx === null || (bx - c.x) * dir(p) < 120 || bx < 40 || bx > W - 40) continue;
      const sol = solve(p, bx, bonusY(b), an);
      if (sol) return fire(s, p, Math.cos(an + gauss() * cfg.aimErr * 0.5) * dir(p), Math.sin(an), sol.power * (1 + gauss() * cfg.aimErr * 0.4));
    }
    return false;
  }
  /** Build on the first free spot, trying from the given end of the build strip. */
  const buildAt = (s, kind) => autoBuild(s, p, kind);        // same spots a player's one-tap build uses

  function think(s) {
    const me = s.players[p], race = raceOf(s, p), cost = (k) => costFor(s, p, k);
    const roster = (opts.only || (opts.troops === false ? [] : race.roster)).filter((k) => isOpen(s, p, k));   // only what this tier has unlocked
    const myFront = mx(p, FORT.frontX);
    const threats = s.units.filter((u) => u.owner === foe && Math.abs(u.x - myFront) < 520);
    const close = threats.filter((u) => Math.abs(u.x - myFront) < 300);
    const flyers = threats.filter((u) => UNIT[u.kind].air);
    const myB = s.buildings.filter((b) => b.owner === p);
    const foeWalls = s.buildings.filter((b) => b.owner === foe && b.kind !== 'shield');
    const foeShield = s.buildings.find((b) => b.owner === foe && b.kind === 'shield');

    // --- invest: mines and a vault pay for themselves in about 20 seconds, so early is best ---
    // opts.plan (balance tools): build exactly these, in this order, as soon as each is affordable, and nothing else.
    // Each is built once a round; opts.rebuild: how many times a round a lost one is replaced (default 0).
    if (opts.plan) {
      if (planRound !== s.round) { planRound = s.round; planDone = 0; }
      const live = myB.filter((x) => !x.dead && x.kind !== 'shield'), cap = opts.plan.length * (1 + (opts.rebuild || 0));
      const want = opts.plan.find((k, n) => isOpen(s, p, k) && live.filter((x) => x.kind === k).length < opts.plan.slice(0, n + 1).filter((x) => x === k).length);
      if (want && s.roundT >= (opts.after || 0) && planDone < cap && freeSlots(s, p) > 0 && me.gold >= cost(want) + 5 && buildAt(s, want)) planDone++;
    }
    if (!opts.plan && cfg.invest && s.phase === 'play' && s.clock > 40 && !close.length && rand() < cfg.invest * 0.5) {
      const mines = myB.filter((b) => b.kind === 'mine').length;
      if (mines < Math.max(1, slotCount(s, p) - 1) && freeSlots(s, p) >= 2 && me.gold >= cost('mine') + 5) buildAt(s, 'mine', true);   // keeps a slot for a wall or tower
    }

    // a Cramped base (2 spots): the tower goes up as soon as towers open, not after 3 threats (f2: mine+tower 73% v the old habit's 51%)
    if (!opts.plan && slotCount(s, p) <= 2 && s.phase !== 'roundOver' && isOpen(s, p, 'tower') && !myB.some((b) => b.kind === 'tower' && !b.dead) && freeSlots(s, p) > 0 && me.gold >= cost('tower') + 5) buildAt(s, 'tower', true);

    // --- fling shot power: a level now and then when there is gold to spare ---
    // opts.power (balance tools): false never buys; a number buys up to that level as soon as it can pay
    { const pc = powerCost(s, p); if (pc != null && s.phase !== 'roundOver' && opts.power !== false && (typeof opts.power === 'number' ? (me.power || 0) < opts.power && me.gold >= pc + 5 : me.gold >= pc + 50 && rand() < (cfg.invest || 0.3) * 0.25)) upgradePower(s, p); }

    // --- defend ---
    if (!opts.plan && threats.length && rand() < cfg.defend) {
      const towers = myB.filter((b) => b.kind === 'tower').length, walls = myB.filter((b) => b.kind === 'wall').length;
      if ((threats.length >= 3 || flyers.length) && towers < 2 && me.gold >= cost('tower')) buildAt(s, 'tower', true);
      else if (walls < 2 && threats.length > flyers.length && me.gold >= cost('wall') + 10) buildAt(s, 'wall', false);
    }
    const shieldFan = (race.mods.shieldMul || 1) < 1 ? 1.8 : 1;
    if (s.phase === 'play' && me.kingHp < me.kingMax * 0.8 && me.gold > cost('shield') + 40 && rand() < cfg.defend * 0.35 * shieldFan) build(s, p, 'shield', 0);

    // --- shoot ---
    waitFire -= cfg.think;
    if (me.reload <= 0 && waitFire <= 0) {
      waitFire = fireWait(s);
      // Landed rewards need a second shot; no troop dispatch or passive collection.
      if (!close.length && rand() < cfg.bonus) {
        const c = catPos(p), crates = s.bonuses.filter(b => b.state === 'ground' && !b.gone && (b.x-c.x)*dir(p)>1).sort((a,b)=>Math.abs(a.x-c.x)-Math.abs(b.x-c.x));
        for (const b of crates) { setAmmo(s, p, 'stone'); if (shootAt(s, b.x, 20, -0.6)) return; }
      }
      const flying = s.bonuses.filter((b) => b.state === 'fly');
      // Prefer nearby balloons: their landed crates are easier to claim with the next shot.
      const nearMe = flying.filter((b) => (b.x - MID) * dir(p) < 0 && (b.vx * dir(p) > 0 || (b.x - MID) * dir(p) < -160));
      if (nearMe.length && !close.length && rand() < cfg.bonus) { setAmmo(s, p, 'stone'); for (const b of nearMe) if (bonusShot(s, b)) return; }
      let tx, ty, vx = 0, ang = 0.85, ammo = 'stone';
      const k = kingPos(foe, s);
      const up = guarded(s, foe), [fa, fz] = fortSpan(foe), fcx = (fa + fz) / 2;
      const mine = foeWalls.find((b) => b.kind === 'mine');
      if (close.length) {
        const c = close[Math.floor(rand() * close.length)], cs = UNIT[c.kind];
        tx = c.x; ty = c.y + cs.r; vx = motion.get(c)?.vx || 0; ang = cs.air ? 0.7 : 1.0;
        if (close.length >= 3 && rand() < cfg.special) ammo = rand() < 0.5 ? 'scatter' : 'fire';
        if (close.length >= 2 && !cs.air && hasAmmo(s, p, 'roll') && rand() < cfg.special * 1.5) { ammo = 'roll'; ang = 1.15; }   // a steep lob that lands short and rolls into them
      } else if (foeShield && rand() < 0.4) { tx = foeShield.x; ty = 150; if (rand() < cfg.special) ammo = 'boulder'; }
      else if (!up) { tx = fcx; ty = FORT.h * 0.55; ang = 0.95; if (rand() < cfg.special * 1.5) ammo = 'boulder'; }                      // chief knocked out: pound the castle
      else if (mine && rand() < 0.3) { tx = mine.x; ty = 20; ang = 0.9; }
      else if (foeWalls.length && rand() < 0.25) { tx = foeWalls[0].x; ty = 40; ang = 0.9; if (rand() < cfg.special) ammo = 'boulder'; }
      else { tx = k.x; ty = k.y; ang = 0.7 + rand() * 0.5; if (rand() < cfg.special * 0.5) ammo = 'boulder'; }                         // the chief guarding the castle
      if (opts.shot) ammo = opts.shot;                              // balance tools: every shot is this type (Normal when it cannot pay)
      if (me.freeShots > 0 && ammo === 'stone') ammo = 'boulder';
      setAmmo(s, p, ammo);
      if (me.gold < shotCost(s, p)) setAmmo(s, p, 'stone');
      shootAt(s, tx, ty, ang, vx);
    }

    // --- ultimate: fire it when it will hit something worth hitting ---
    if (opts.ult !== false && ultReady(s, p)) {
      const sh = race.ult.shape, foeArmy = s.units.filter((u) => u.owner === foe && !UNIT[u.kind].air).length;
      const worth = sh === 'sweep' ? foeArmy >= 3 || foeWalls.length >= 2 : sh === 'summon' ? true : true;
      if ((worth && rand() < 0.5) || s.phase === 'sudden') ultimate(s, p);
    }

    let saving = false;

    // --- troops ---
    const reserve = threats.length ? 60 : 35;
    if (saving) return;
    if (roster.length && me.gold > reserve + 20 && rand() < cfg.offense * 0.5) {
      const boomer = roster.find((k) => UNIT[k].boom && !UNIT[k].air), tank = roster.slice().sort((x, y) => UNIT[y].hp * UNIT[y].count - UNIT[x].hp * UNIT[x].count)[0];
      // counters: flyers -> troops that hit air (best vsAir first); walls and towers -> siege, bombs or heavy hitters
      const antiAir = roster.filter((k) => UNIT[k].range && !UNIT[k].boom && !UNIT[k].noAir && (!UNIT[k].air || UNIT[k].aa)).sort((x, y) => (UNIT[y].vsAir ?? 1) - (UNIT[x].vsAir ?? 1));
      const breakers = roster.filter((k) => UNIT[k].siege || (UNIT[k].bld || 1) >= 2 || (UNIT[k].boom && !UNIT[k].air));
      // a varied army, like a player: every troop twice, plus one extra pick for whatever counters the board right now
      // (it used to stack wall-breakers and spent up to half its troop gold on one siege troop, which skewed prices)
      const pool = [...roster, ...roster];
      if (flyers.length && antiAir.length) pool.push(antiAir[0], ...antiAir);
      else if (foeWalls.length >= 2 && breakers.length) pool.push(breakers[Math.floor(rand() * breakers.length)]);
      if (threats.length) pool.push(tank);
      let kind = pool[Math.floor(rand() * pool.length)];
      if (recent.filter((k) => k === kind).length >= 2) kind = pool[Math.floor(rand() * pool.length)];   // rarely the same troop three times running
      if (me.gold >= cost(kind) + reserve * 0.5 && send(s, p, kind, gateX(p))) { recent.push(kind); if (recent.length > 3) recent.shift(); }
    }
  }

  return {
    level, p,
    update(s, dt) {
      if (s.phase !== 'play' && s.phase !== 'sudden') return;
      for (const u of s.units) if (u.owner === foe && u.hp > 0) {
        const seen = motion.get(u);
        if (seen) {
          const elapsed = s.time - seen.time;
          seen.vx = elapsed > 0 ? (u.x - seen.x) / elapsed : 0;
          seen.x = u.x; seen.time = s.time;
        } else motion.set(u, { x: u.x, time: s.time, vx: 0 });
      }
      timer -= dt;
      if (timer <= 0) { timer = cfg.think * (0.7 + rand() * 0.6); think(s); }
    },
  };
}
