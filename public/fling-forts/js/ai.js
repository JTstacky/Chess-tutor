// ai.js — a computer opponent that plays through the same actions as a person (fire/build/send/setAmmo).
import { AMMO, isOpen, heroOk, ultReady, ultimate, autoBuild, UNIT, BUILD, W, FORT, RACE_KEYS, kingPos, catPos, colX, rowY, mx, dir, gateX, solve, fire, build, send, setAmmo, placeOk, costFor, shotCost, raceOf, bonusY } from './sim.js';

export const LEVELS = {
  // owner 2026-11-25: the computer was too hard (every level fired at the reload limit). A person fires about 12-18 shots
  // a minute; these give about 11 (easy), 17 (normal) and 24 (hard). Measured with lane 3's tools/ailevels.mjs.
  // fireMul: extra wait after a reload, as a multiple of that reload (survives reload tuning). With the 3 s stone
  // reload: about 6 (easy), 9 (normal) and 13 (hard) shots a minute.
  easy:   { aimErr: 0.13,  think: 1.2, special: 0.12, defend: 0.25, offense: 0.35, fireMul: 2.3,  bonus: 0.15, invest: 0.25 },
  normal: { aimErr: 0.075, think: 0.8, special: 0.3,  defend: 0.6,  offense: 0.6,  fireMul: 1.2,  bonus: 0.45, invest: 0.6 },
  hard:   { aimErr: 0.04,  think: 0.5, special: 0.5,  defend: 0.9,  offense: 0.85, fireMul: 0.55, bonus: 0.8,  invest: 0.9 },
};
export function pickRace(seed = 1) { return RACE_KEYS[Math.abs(seed) % RACE_KEYS.length]; }

/** opts (for the balance tools): invest/bonus/troops false switch that habit off; only: [unit keys] limits what it sends. */
export function createAI(p, level = 'normal', seed = 7, opts = {}) {
  const cfg = { ...(LEVELS[level] || LEVELS.normal) };
  if (opts.invest === false) cfg.invest = 0;
  if (opts.invest === true) cfg.invest = 1;
  if (opts.bonus === false) cfg.bonus = 0;
  if (opts.bonus === true) cfg.bonus = 1;
  let a = seed >>> 0;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  let timer = 0, waitFire = 0;
  const fireWait = (s) => cfg.fireMul * AMMO_R(s);
  const AMMO_R = (s) => (AMMO[s.players[p].ammo]?.reload || 3) * (raceOf(s, p).mods.reload || 1);
  const foe = 1 - p;

  /** Fling at a point with this level's wobble. Tries the wanted lob angle first, then others that reach. */
  function shootAt(s, tx, ty, ang) {
    for (const an of [ang, 0.95, 0.75, 1.15, 0.55]) {
      const sol = solve(p, tx, ty, an);
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
    const fb = s.blocks.filter((b) => b.owner === foe && !b.dead);

    // --- invest: mines and a vault pay for themselves in about 20 seconds, so early is best ---
    if (cfg.invest && s.phase === 'play' && s.clock > 40 && !close.length && rand() < cfg.invest * 0.5) {
      const mines = myB.filter((b) => b.kind === 'mine').length;
      if (mines < BUILD.mine.max && me.gold >= cost('mine') + 5) buildAt(s, 'mine', true);
      else if (me.gold >= cost('vault') + 10 && placeOk(s, p, 'vault', 0)) build(s, p, 'vault', 0);
    }

    // --- defend ---
    if (threats.length && rand() < cfg.defend) {
      const towers = myB.filter((b) => b.kind === 'tower').length, walls = myB.filter((b) => b.kind === 'wall').length;
      if ((threats.length >= 3 || flyers.length) && towers < 2 && me.gold >= cost('tower')) buildAt(s, 'tower', true);
      else if (walls < 2 && threats.length > flyers.length && me.gold >= cost('wall') + 10) buildAt(s, 'wall', false);
    }
    const shieldFan = race.mods.shieldCost < BUILD.shield.cost ? 1.8 : 1;
    if (s.phase === 'play' && me.kingHp < me.kingMax * 0.8 && me.gold > cost('shield') + 40 && rand() < cfg.defend * 0.35 * shieldFan) build(s, p, 'shield', 0);

    // --- fetch dropped crates with the fastest ground troop ---
    const crate = s.bonuses.find((b) => b.state === 'ground');
    if (crate && roster.length && rand() < cfg.offense * 0.6 && !s.units.some((u) => u.owner === p && !UNIT[u.kind].air && Math.abs(u.x - crate.x) < 260)) {
      const fast = roster.filter((k) => !UNIT[k].boom && !UNIT[k].air).sort((x, y) => UNIT[y].speed - UNIT[x].speed)[0];
      if (fast && me.gold >= cost(fast)) send(s, p, fast);
    }

    // --- shoot ---
    waitFire -= cfg.think;
    if (me.reload <= 0 && waitFire <= 0) {
      waitFire = fireWait(s);
      const flying = s.bonuses.filter((b) => b.state === 'fly');
      if (flying.length && !close.length && rand() < cfg.bonus) { setAmmo(s, p, 'stone'); for (const b of flying) if (bonusShot(s, b)) return; }
      let tx, ty, ang = 0.85, ammo = 'stone';
      const k = kingPos(foe, s);
      const roof = fb.filter((b) => (b.c === 1 || b.c === 2) && b.r >= 2);
      const front = fb.filter((b) => b.c === 0).sort((x, y) => y.r - x.r);
      const mine = foeWalls.find((b) => b.kind === 'mine');
      if (close.length) {
        const c = close[Math.floor(rand() * close.length)], cs = UNIT[c.kind];
        tx = c.x + dir(foe) * cs.speed * 1.2; ty = c.y; ang = cs.air ? 0.7 : 1.0;
        if (close.length >= 3 && rand() < cfg.special) ammo = rand() < 0.5 ? 'scatter' : 'fire';
      } else if (foeShield && rand() < 0.4) { tx = foeShield.x; ty = 150; if (rand() < cfg.special) ammo = 'boulder'; }
      else if (!roof.length) { tx = k.x; ty = k.y; ang = 1.2; if (rand() < cfg.special) ammo = rand() < 0.6 ? 'boulder' : 'fire'; }   // open roof: drop it in
      else if (!front.length) { tx = k.x; ty = k.y; ang = 0.35; }                                                                      // open front: straight in
      else if (mine && rand() < 0.3) { tx = mine.x; ty = 20; ang = 0.9; }
      else if (foeWalls.length && rand() < 0.25) { tx = foeWalls[0].x; ty = 40; ang = 0.9; if (rand() < cfg.special) ammo = 'boulder'; }
      else {
        const b = rand() < 0.65 ? roof[Math.floor(rand() * roof.length)] : front[0];
        tx = colX(foe, b.c); ty = rowY(b.r) + 22; ang = b.c === 0 ? 0.7 : 1.1;
        if (rand() < cfg.special * 0.7) ammo = 'boulder';
      }
      if (me.freeShots > 0 && ammo === 'stone') ammo = 'boulder';
      setAmmo(s, p, ammo);
      if (me.gold < shotCost(s, p)) setAmmo(s, p, 'stone');
      shootAt(s, tx, ty, ang);
    }

    // --- ultimate: fire it when it will hit something worth hitting ---
    if (opts.ult !== false && ultReady(s, p)) {
      const sh = race.ult.shape, foeArmy = s.units.filter((u) => u.owner === foe && !UNIT[u.kind].air).length;
      const worth = sh === 'sweep' ? foeArmy >= 3 || foeWalls.length >= 2 : sh === 'summon' ? true : true;
      if ((worth && rand() < 0.5) || s.phase === 'sudden') ultimate(s, p);
    }

    // --- hero: buy it as soon as it is open and affordable; save for it at tier 3 ---
    let saving = false;
    if (opts.hero !== false && isOpen(s, p, race.hero) && heroOk(s, p)) {
      if (me.gold >= cost(race.hero)) send(s, p, race.hero, gateX(p));
      else saving = !close.length && rand() < cfg.offense;
    }

    // --- troops ---
    const reserve = threats.length ? 60 : 35;
    if (saving) return;
    if (roster.length && me.gold > reserve + 20 && rand() < cfg.offense * 0.5) {
      const boomer = roster.find((k) => UNIT[k].boom && !UNIT[k].air), tank = roster.slice().sort((x, y) => UNIT[y].hp * UNIT[y].count - UNIT[x].hp * UNIT[x].count)[0];
      // counters: flyers -> troops that hit air (best vsAir first); walls and towers -> siege, bombs or heavy hitters
      const antiAir = roster.filter((k) => UNIT[k].range && !UNIT[k].boom && !UNIT[k].noAir && (!UNIT[k].air || UNIT[k].aa)).sort((x, y) => (UNIT[y].vsAir ?? 1) - (UNIT[x].vsAir ?? 1));
      const breakers = roster.filter((k) => UNIT[k].siege || (UNIT[k].bld || 1) >= 2 || (UNIT[k].boom && !UNIT[k].air));
      const pool = flyers.length && antiAir.length ? [antiAir[0], ...antiAir, ...antiAir, ...roster] : foeWalls.length && breakers.length ? [...breakers, ...breakers, tank, ...roster] : threats.length ? [tank, ...roster] : roster;
      const kind = pool[Math.floor(rand() * pool.length)];
      if (me.gold >= cost(kind) + reserve * 0.5) send(s, p, kind, gateX(p));
    }
  }

  return {
    level, p,
    update(s, dt) {
      if (s.phase !== 'play' && s.phase !== 'sudden') return;
      timer -= dt;
      if (timer <= 0) { timer = cfg.think * (0.7 + rand() * 0.6); think(s); }
    },
  };
}
