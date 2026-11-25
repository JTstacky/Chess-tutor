import { RACE_DATA, PRICE_TUNE } from './races.js';
export { PRICE_TUNE };
import { ROUND_TIME, SUDDEN_TIME, INTERMISSION, ROUNDS_TO_WIN, MAX_DRAWS, GOLD_START, GOLD_RATE, GOLD_CAP, BOUNTY, CRUSH, AMMO, BLOCK, MAT, BUILD, worth, PRICE_K, BONUS_R, BONUS_BAND, BONUS_EVERY, CRATE_LIFE, RAPID_TIME, FORT_GUARD, KING_UNIT_MUL, AGGRO, KING_FIGHT, KING_ATK, TIERS, SUDDEN_AT, AMMO_TIER, BUILD_TIER, HERO, ULT, ULT_DEFAULT, KING_BASE_HP } from './tuning.js';
export * from './tuning.js';
// sim.js — Fling Forts rules and physics, side view. Pure: no DOM, so node tests run the same code as the game.
// World: x runs left to right (0..W), y is height above the ground (0 = ground). Player 0 owns the left fort,
// player 1 the right one. Everything for player 1 is the mirror image of player 0 (mx()).

export const W = 1300, SKY = 900, CELL = 50, MID = W / 2;
export const G = 900;                         // gravity, units / s^2
export const V_MAX = 1250, V_MIN = 240;       // launch speed range (full pull reaches right across at 45 degrees)
export const ANG_MIN = 0.09, ANG_MAX = 1.48;  // launch angle limits above the horizon, radians
export const KING_HP = KING_BASE_HP, KING_R = 35, KING_Y = 37;     // hit circle matches the 90-unit chief picture (feet to chest)
export const FORT = { back: 110, cols: 4, kingX: 210, catX: 56, catY: 252, gateX: 338, frontX: 310, domeR: 246, zone: [374, 612] };
export const WALL = { w: 34, h: 92 }, TOWER = { w: 38, h: 160 }, MINE = { w: 46, h: 48 };
export const GEOM = { wall: WALL, tower: TOWER, mine: MINE };
export const AIR_Y = 150;                     // flyers cruise at this height and a bit above


// ---------- troops and races (data in races.js) ----------
export const UNIT = {}, RACES = {};
for (const [rk, r] of Object.entries(RACE_DATA)) {
  const local = {};
  for (const [k, u] of Object.entries(r.units)) local[k] = { ...u, split: u.split && { ...u.split }, spawn: u.spawn && { ...u.spawn } };
  for (const [k, u] of Object.entries(local)) {
    const key = `${rk}_${k}`;
    UNIT[key] = { ...u, key, race: rk, cost: u.minion ? 0 : Math.max(10, Math.round(PRICE_K * worth(u, local) * (PRICE_TUNE[key] || 1))) };
    if (u.split) UNIT[key].split = { ...u.split, kind: `${rk}_${u.split.kind}` };
    if (u.spawn) UNIT[key].spawn = { ...u.spawn, kind: `${rk}_${u.spawn.kind}` };
    if (u.raiser) UNIT[key].raiser = `${rk}_${u.raiser}`;
  }
  const keys = Object.keys(r.units).filter((k) => !r.units[k].minion).map((k) => `${rk}_${k}`);
  // the race's hero (races.js `hero`, explicit cost); until lane 3's data lands, a big copy of its strongest troop
  const hk = `${rk}_hero`;
  if (r.hero) {
    UNIT[hk] = { ...r.hero, key: hk, race: rk, hero: true, count: 1, cost: r.hero.cost ?? 140 };
    if (r.hero.split) UNIT[hk].split = { ...r.hero.split, kind: `${rk}_${r.hero.split.kind}` };
    if (r.hero.spawn) UNIT[hk].spawn = { ...r.hero.spawn, kind: `${rk}_${r.hero.spawn.kind}` };
    if (r.hero.raiser) UNIT[hk].raiser = `${rk}_${r.hero.raiser}`;
  } else {
    const best = keys.filter((k) => !UNIT[k].air && !UNIT[k].boom).sort((a, b) => UNIT[b].hp * UNIT[b].count - UNIT[a].hp * UNIT[a].count)[0];
    const b = UNIT[best];
    UNIT[hk] = { ...b, key: hk, race: rk, hero: true, name: `${r.name} Hero`, short: 'Hero', count: 1, hp: Math.round(b.hp * b.count * 2.2), dmg: Math.round(b.dmg * 2.2), r: Math.round(b.r * 1.45), splash: Math.max(b.splash || 0, 45), cost: 140, art: best, tier: HERO.tier, provisional: true };
  }
  UNIT[hk].tier = UNIT[hk].tier ?? HERO.tier;
  RACES[rk] = { ...r, key: rk, ground: keys.filter((k) => !UNIT[k].air), air: keys.filter((k) => UNIT[k].air), roster: keys, hero: hk, ult: { ...ULT_DEFAULT, ...(r.ult || {}) } };
}
export const RACE_KEYS = Object.keys(RACES);

// ---------- bonuses that fly across the sky ----------
// air: hit one in flight and it is yours at once. crate: one hit pops the balloon; the crate falls and the
// first troop to reach it claims it.
export const BONUS = {
  gold:   { cat: 'air',   name: '+40 gold' },
  rapid:  { cat: 'air',   name: 'Rapid reload' },
  ammo:   { cat: 'air',   name: '3 free specials' },
  repair: { cat: 'crate', name: 'Chief healed' },
  troops: { cat: 'crate', name: 'Free troops' },
  chest:  { cat: 'crate', name: '+90 gold' },
};
export const DT = 1 / 60;

// ---------- helpers ----------
export function rng(seed) {             // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const dir = (p) => (p === 0 ? 1 : -1);                 // +x direction a player shoots and marches toward
export const mx = (p, x) => (p === 0 ? x : W - x);            // a left-fort x mirrored for player p
export const ownerOfX = (x) => (x < MID ? 0 : 1);
export const colX = (p, c) => mx(p, FORT.back + (FORT.cols - 1 - c + 0.5) * CELL);   // c = 0 is the front column
export const rowY = (r) => (r + 0.5) * CELL;
/** Where player p's chief stands: home inside the fort, or out fighting (pass the state; without it, home). */
export const kingHome = (p) => mx(p, FORT.kingX);
/** How big the chief is: 1 at home, growing to KING_FIGHT.outScale as he walks out (drawing and hits both use it). */
export const kingScale = (p, s) => (s && s.players[p].kx != null ? 1 + (KING_FIGHT.outScale - 1) * Math.min(1, Math.abs(s.players[p].kx - kingHome(p)) / KING_FIGHT.growIn) : 1);
export const kingR = (p, s) => KING_R * kingScale(p, s);
export const kingPos = (p, s) => ({ x: s && s.players[p].kx != null ? s.players[p].kx : kingHome(p), y: KING_Y * kingScale(p, s) });
/** The chief's front wall (fort column 0) is all down, so he may come out to fight. */
export const fortOpen = (s, p) => !s.blocks.some((b) => !b.dead && b.owner === p && b.c === 0);
export const catPos = (p) => ({ x: mx(p, FORT.catX), y: FORT.catY });
export const gateX = (p) => mx(p, FORT.gateX);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;
export function compact(arr, keep) { let n = 0; for (let i = 0; i < arr.length; i++) { const x = arr[i]; if (keep(x)) arr[n++] = x; } arr.length = n; }

/** Launch velocity for a pull: (dx, dy) points the way the shot should go, power 0..1. Null when it points backwards. */
export function launch(p, dx, dy, power) {
  const fx = dx * dir(p);
  if (hyp(dx, dy) < 1e-6 || fx <= 0 && dy <= 0) return null;
  let ang = Math.atan2(dy, fx);
  if (ang > Math.PI / 2 + 0.5 || ang < -0.9) return null;      // pulled the wrong way
  ang = clamp(ang, ANG_MIN, ANG_MAX);
  const v = V_MIN + clamp(power, 0, 1) * (V_MAX - V_MIN);
  return { vx: Math.cos(ang) * v * dir(p), vy: Math.sin(ang) * v, ang, v };
}
/** Points along the flight of a shot (for the aim preview and the computer player), t in seconds. */
export function arcAt(p, vel, t) { const c = catPos(p); return { x: c.x + vel.vx * t, y: c.y + vel.vy * t - 0.5 * G * t * t }; }
/** Launch that lands a shot on (tx, ty) using the given angle (high lob) — null when out of reach. */
export function solve(p, tx, ty, ang) {
  const c = catPos(p), d = (tx - c.x) * dir(p), h = ty - c.y;
  if (d <= 1) return null;
  const cos = Math.cos(ang), den = 2 * cos * cos * (d * Math.tan(ang) - h);
  if (den <= 0) return null;
  const v = Math.sqrt(G * d * d / den);
  if (v > V_MAX || v < V_MIN) return null;
  return { dx: Math.cos(ang) * dir(p), dy: Math.sin(ang), power: (v - V_MIN) / (V_MAX - V_MIN), v, t: d / (v * cos) };
}

// ---------- race-adjusted numbers ----------
export const raceOf = (s, p) => RACES[s.players[p].race];
export function costFor(s, p, key) {
  const m = raceOf(s, p).mods;
  if (AMMO[key]) return m.ammoCost?.[key] ?? AMMO[key].cost;
  if (key === 'shield' && m.shieldCost) return m.shieldCost;
  if (key === 'wall' && m.wallCost) return m.wallCost;
  if (BUILD[key]) return BUILD[key].cost;
  if (UNIT[key]?.hero) return UNIT[key].cost;
  if (UNIT[key]) return Math.max(8, Math.round(UNIT[key].cost * (m.unitCost || 1)));
  if (key === 'ult') return 0;
  return Infinity;
}
/** Gold per second for player p right now: base rate, mines and vault, race bonus; the base doubles in sudden death. */
export function incomeOf(s, p) {
  const m = raceOf(s, p).mods;
  let n = TIERS.income[(s.tier || 1) - 1] * (s.phase === 'sudden' ? 2 : 1);
  for (const b of s.buildings) if (b.owner === p && b.kind === 'mine' && !b.dead) n += BUILD.mine.income;
  for (const b of s.blocks) if (b.owner === p && b.kind === 'vault' && !b.dead) n += BUILD.vault.income;
  return n * (m.income || 1);
}
/** Gold the other side gets when this troop is killed. */
export function bountyOf(kind, s, owner) {
  const u = UNIT[kind];
  if (u.minion) return 1;
  const paid = s && (owner === 0 || owner === 1) ? costFor(s, owner, kind) : u.cost;
  const g = Math.max(1, Math.round(BOUNTY * paid / u.count));
  return u.hero ? Math.min(HERO.bounty, g) : g;
}
/** The gold cap now (it rises with the tier). */
export const capOf = (s) => TIERS.cap[(s.tier || 1) - 1];
/** Seconds into the round when tier t opens (later rounds escalate faster). */
export const tierAt = (s, t) => TIERS.at[t - 1] * (s.round > 1 ? TIERS.laterRounds : 1);
/** Which tier an ammo, building or troop belongs to. */
export function tierOf(key) {
  if (AMMO[key]) return AMMO_TIER[key] ?? 1;
  if (BUILD[key]) return BUILD_TIER[key] ?? 1;
  if (UNIT[key]) return UNIT[key].tier ?? (UNIT[key].hero ? HERO.tier : 2);
  return 1;
}
/** Seconds into the round when key unlocks for player p (0 = open from the start). */
export const unlockAt = (s, p, key) => tierAt(s, tierOf(key));
export const isOpen = (s, p, key) => s.open || (s.roundT || 0) >= unlockAt(s, p, key) - 1e-9;
export function shotCost(s, p) {
  const pl = s.players[p];
  if (pl.ammo !== 'stone' && pl.freeShots > 0) return 0;
  return costFor(s, p, pl.ammo);
}
export const rosterOf = (s, p) => raceOf(s, p).roster;

// ---------- state ----------
function newPlayer(id, race) {
  const kingMax = Math.round(KING_HP * (RACES[race].mods.kingHp || 1));
  return { id, race, guard: 0, earned: 0, kills: 0, gold: GOLD_START, kingHp: kingMax, kingMax, ult: 0, ultUsed: false, ultCap: 0, heroCd: 0, kx: kingHome(id), kingCd: 0, kingAct: 0, kingQuiet: 0, kingHeal: false, kingFace: dir(id), reload: 0, ammo: 'stone', rapid: 0, freeShots: 0, shots: 0, hits: 0, spent: 0, bonuses: 0, dealt: 0 };
}
function buildFort(s, p) {
  const r = RACES[s.players[p].race], m = r.mods.blockHp || 1;
  for (const [c, row, mat] of r.fort.layout) { const kind = MAT[mat], hp = Math.round(BLOCK[kind].hp * m); s.blocks.push({ id: s.nextId++, owner: p, c, r: row, kind, hp, maxHp: hp, drop: 0 }); }
}
function fresh(s) {
  s.players = [newPlayer(0, s.races[0]), newPlayer(1, s.races[1])];
  s.projectiles = []; s.units = []; s.buildings = []; s.fires = []; s.fx = []; s.bonuses = []; s.blocks = [];
  buildFort(s, 0); buildFort(s, 1);
  s.phase = 'play'; s.clock = SUDDEN_AT; s.roundWinner = null; s.roundT = 0; s.tier = s.open ? TIERS.at.length : 1; s.ultq = []; s.waves = [];   // open: every tier unlocked (rule tests, tools)
  s.bonusTimer = 5 + s.rand() * 3;
}
export function createGame({ mode = '2p', seed = 1, races = ['fantasy', 'pirates'], open = false } = {}) {
  const s = { mode, seed, open, rand: rng(seed), time: 0, nextId: 1, races: races.slice(), round: 1, roundsWon: [0, 0], draws: 0, interTimer: 0, winner: null, events: [], bonusSide: 0 };
  fresh(s);
  return s;
}
const live = (s) => s.phase === 'play' || s.phase === 'sudden';
const emit = (s, type, data) => { s.events.push({ type, ...data }); };
const fx = (s, kind, x, y, extra = {}) => { s.fx.push({ kind, x, y, t: 0, ttl: extra.ttl || 0.6, ...extra }); };
export const blockPos = (b) => ({ x: colX(b.owner, b.c), y: rowY(b.r) });
export const fortHp = (s, p) => s.blocks.reduce((n, b) => n + (b.owner === p ? b.hp : 0), 0);

// ---------- actions (people and the computer both use these; each returns true when it happened) ----------
export function setAmmo(s, p, kind) { if (!AMMO[kind] || !isOpen(s, p, kind)) return false; s.players[p].ammo = kind; return true; }
export const canAfford = (s, p, cost) => s.players[p].gold >= cost;

/** Fire the loaded ammo along (dx, dy) with power 0..1. */
export function fire(s, p, dx, dy, power) {
  if (!live(s)) return false;
  const pl = s.players[p];
  if (pl.reload > 0) return false;
  const a = AMMO[pl.ammo], cost = shotCost(s, p);
  if (!canAfford(s, p, cost)) { pl.ammo = 'stone'; return false; }
  const vel = launch(p, dx, dy, power);
  if (!vel) return false;
  const c = catPos(p);
  s.projectiles.push({ id: s.nextId++, owner: p, ammo: pl.ammo, x: c.x, y: c.y, vx: vel.vx, vy: vel.vy, split: !!a.split, shard: false, t: 0, spin: 0 });
  if (pl.ammo !== 'stone' && pl.freeShots > 0) pl.freeShots--;
  pl.gold -= cost; pl.spent += cost; pl.shots++;
  pl.reload = a.reload * (raceOf(s, p).mods.reload || 1) * (pl.rapid > 0 ? 0.5 : 1);
  emit(s, 'fire', { p, ammo: pl.ammo, x: c.x, y: c.y });
  if (pl.ammo !== 'stone' && pl.gold < shotCost(s, p)) pl.ammo = 'stone';
  return true;
}

/** May player p put this building / squad at ground position x? */
/** One-tap building (owner, 2026-11-25): the first free spot in the build strip, walls from the front, towers and mines
 *  from the back (the same rule the computer uses). Returns true if it was built. */
export function autoBuild(s, p, kind) {
  const fromBack = kind !== 'wall';
  for (let i = 0; i < 6; i++) {
    const u = fromBack ? FORT.zone[0] + 24 + i * 44 : FORT.zone[1] - 24 - i * 44, x = mx(p, u);
    if (placeOk(s, p, kind, x)) return build(s, p, kind, x);
  }
  return false;
}
export function placeOk(s, p, kind, x) {
  const u = mx(p, x);                                           // as a left-fort coordinate
  if (!isOpen(s, p, kind)) return false;                        // not unlocked yet this round
  if (kind === 'shield') return s.phase !== 'sudden' && !s.buildings.some((b) => b.owner === p && b.kind === 'shield');
  if (kind === 'vault') return !s.blocks.some((b) => b.owner === p && b.kind === 'vault' && !b.dead) && (() => { const n = s.blocks.filter((b) => b.owner === p && b.c === 3 && !b.dead).length; return n > 0 && n < 5; })();   // needs a standing back wall
  if (BUILD[kind]) {
    if (u < FORT.zone[0] || u > FORT.zone[1]) return false;
    if (BUILD[kind].max && s.buildings.filter((b) => b.owner === p && b.kind === kind && !b.dead).length >= BUILD[kind].max) return false;
    return !s.buildings.some((b) => b.kind !== 'shield' && Math.abs(b.x - x) < 46);
  }
  if (UNIT[kind]?.hero) return kind === raceOf(s, p).hero && heroOk(s, p) && u >= FORT.gateX - 40 && u <= FORT.zone[1];
  if (UNIT[kind]) return rosterOf(s, p).includes(kind) && u >= FORT.gateX - 40 && u <= FORT.zone[1];
  return false;
}
/** A hero can be bought: under the limit and off cooldown. */
export function heroOk(s, p) { return s.players[p].heroCd <= 0 && s.units.filter((u) => u.owner === p && u.hp > 0 && UNIT[u.kind].hero).length < HERO.max; }
export function build(s, p, kind, x) {
  const spec = BUILD[kind], cost = costFor(s, p, kind);
  if (!live(s) || !spec || !canAfford(s, p, cost) || !placeOk(s, p, kind, x)) return false;
  const m = raceOf(s, p).mods, pl = s.players[p];
  if (kind === 'vault') {                                       // a new block on top of the back wall
    const col = s.blocks.filter((b) => b.owner === p && b.c === 3 && !b.dead), r = col.reduce((n, b) => Math.max(n, b.r + 1), 0);
    const hp = Math.round(spec.hp * (m.blockHp || 1));
    s.blocks.push({ id: s.nextId++, owner: p, c: 3, r, kind: 'vault', hp, maxHp: hp, drop: 0 });
    pl.gold -= cost; pl.spent += cost;
    emit(s, 'build', { p, kind, x: colX(p, 3) });
    return true;
  }
  const hp = Math.round(spec.hp * (kind === 'wall' ? m.wallHp || 1 : kind === 'tower' ? m.towerHp || 1 : 1));
  const b = { id: s.nextId++, owner: p, kind, x, hp, maxHp: hp, cd: 0, age: 0, life: kind === 'shield' ? m.shieldLife || spec.life : 0 };
  if (kind === 'shield') b.x = kingPos(p, s).x;
  s.buildings.push(b);
  pl.gold -= cost; pl.spent += cost;
  emit(s, 'build', { p, kind, x: b.x });
  return true;
}
function makeUnit(s, p, kind, x) {
  const spec = UNIT[kind], m = RACES[s.players[p].race].mods, hp = Math.round(spec.hp * (m.unitHp || 1)), lane = s.rand();
  return { id: s.nextId++, owner: p, kind, x: clamp(x, 20, W - 20), y: spec.air ? AIR_Y + lane * 60 : 0, hp, maxHp: hp, cd: 0, slow: 0, walk: s.rand() * 6, lane, act: 0, hurt: 0, fresh: true, spawnT: spec.spawn ? spec.spawn.every : 0 };
}
function spawnSquad(s, p, kind, x, n = UNIT[kind].count) {
  const spec = UNIT[kind];
  for (let i = 0; i < n; i++) s.units.push(makeUnit(s, p, kind, x - dir(p) * i * (spec.r * 1.7)));
}
export function send(s, p, kind, x = gateX(p)) {
  const spec = UNIT[kind], cost = costFor(s, p, kind);
  if (!live(s) || !spec || !canAfford(s, p, cost) || !placeOk(s, p, kind, x)) return false;
  spawnSquad(s, p, kind, x);
  s.players[p].gold -= cost; s.players[p].spent += cost;
  emit(s, spec.hero ? 'hero' : 'send', { p, kind, x });
  return true;
}

// ---------- damage ----------
const hurtKingRaw = (...a) => hurtKing(...a);
function hurtKing(s, p, dmg, x, y, by) {
  if (!live(s) || dmg <= 0) return;
  const pl = s.players[p], d = Math.min(pl.kingHp, dmg * (s.phase === 'sudden' ? 2 : 1));
  pl.kingHp -= d; pl.kingFlash = 0.25; pl.kingQuiet = 0; ultGain(s, by, p, d);
  if (by === 0 || by === 1) s.players[by].dealt += d;
  emit(s, 'king-hit', { p, x, y, dmg: d });
}
/** Charge the ultimate meters: the attacker for damage dealt, the victim for damage taken. */
function ultGain(s, by, victim, d) {
  if (!(d > 0)) return;
  if ((by === 0 || by === 1) && by !== victim) s.players[by].ult = Math.min(1, s.players[by].ult + d * ULT.perDealt);
  if (victim === 0 || victim === 1) s.players[victim].ult = Math.min(1, s.players[victim].ult + d * ULT.perTaken);
}
function hurtBlock(s, b, dmg, by) {
  if (b.dead || dmg <= 0) return;
  b.hp -= dmg; b.flash = 0.2; ultGain(s, by, b.owner, Math.min(dmg, b.hp + dmg));
  if (by === 0 || by === 1) s.players[by].dealt += Math.min(dmg, b.hp + dmg) * 0.25;
  if (b.hp <= 0) { b.dead = true; const q = blockPos(b); fx(s, 'rubble', q.x, q.y, { ttl: 0.8, mat: b.kind }); emit(s, 'block-broken', { p: b.owner, x: q.x, y: q.y, mat: b.kind }); s.settle = true; }
}
/** Hurt a troop. Armour takes a bit off every hit (not off burning). Remembers who did it, for the bounty. */
function hurtUnit(s, u, dmg, by, dot = false, pierce = false) {
  if (u.hp <= 0 || dmg <= 0) return 0;
  const armor = pierce ? 0 : (UNIT[u.kind].armor || 0) + (RACES[s.players[u.owner].race].mods.unitArmor || 0);
  const d = dot ? dmg : Math.max(1, dmg - armor);
  u.hp -= d; if (!dot) u.hurt = 0.25; ultGain(s, by, u.owner, d);
  if (u.hp <= 0) u.by = by;
  return d;
}
const unitY = (u) => u.y + UNIT[u.kind].r;      // centre height of a troop
function hurtBuilding(s, b, dmg) {
  if (b.dead || dmg <= 0) return;
  b.hp -= dmg; b.flash = 0.2;
  if (b.hp <= 0) { b.dead = true; fx(s, b.kind === 'shield' ? 'pop' : 'rubble', b.x, 40, { ttl: 0.8, mat: 'wood', owner: b.owner }); emit(s, 'destroyed', { p: b.owner, kind: b.kind, x: b.x }); }
}
const has = (s, p, c, r) => s.blocks.some((b) => !b.dead && b.owner === p && b.c === c && b.r === r);
/** After a block breaks: anything left without support drops; roof blocks land on the chief. */
function settleFort(s) {
  s.settle = false;
  compact(s.blocks, (b) => !b.dead);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const b of s.blocks.slice().sort((a, c) => a.r - c.r)) {
      if (b.dead || b.r === 0 || has(s, b.owner, b.c, b.r - 1)) continue;
      const roof = b.c === 1 || b.c === 2;
      if (roof && b.r === 2) {                                   // each roof beam rests on the wall beside it
        const side = b.c === 1 ? 0 : 3;
        if (has(s, b.owner, side, 2)) continue;
        const q = blockPos(b), k = kingPos(b.owner, s);
        b.dead = true; moved = true;
        fx(s, 'rubble', q.x, KING_Y + 20, { ttl: 0.8, mat: b.kind });
        emit(s, 'crush', { p: b.owner, x: q.x });
        hurtKing(s, b.owner, CRUSH, k.x, k.y, 1 - b.owner);
        continue;
      }
      b.r--; b.drop += CELL; moved = true;
    }
    compact(s.blocks, (b) => !b.dead);
    if (!moved) break;
  }
}

// solid things a shot can hit: returns { kind, ref } for the first one the circle (x, y, rad) touches
function solidAt(s, pr, x, y, rad) {
  const foe = 1 - pr.owner;
  for (const b of s.buildings) {
    if (b.dead) continue;
    if (b.kind === 'shield') { if (b.owner === foe && hyp(x - b.x, y) < FORT.domeR + rad * 0.5) return { kind: 'shield', ref: b }; continue; }
    const g = GEOM[b.kind];
    if (Math.abs(x - b.x) < g.w / 2 + rad && y < g.h + rad) return { kind: 'bld', ref: b };
  }
  for (const b of s.blocks) {
    if (b.dead) continue;
    const q = blockPos(b), dx = Math.max(Math.abs(x - q.x) - CELL / 2, 0), dy = Math.max(Math.abs(y - q.y) - CELL / 2, 0);
    if (dx * dx + dy * dy < rad * rad) return { kind: 'block', ref: b };
  }
  for (const p of [0, 1]) { const k = kingPos(p, s); if (hyp(x - k.x, y - k.y) < kingR(p, s) + rad) return { kind: 'king', ref: p }; }
  for (const u of s.units) if (u.owner === foe && u.hp > 0 && hyp(x - u.x, y - unitY(u)) < UNIT[u.kind].r + rad) return { kind: 'unit', ref: u };
  // the catapult stands on a stone pedestal behind each fort
  for (const p of [0, 1]) { const c = catPos(p); if (p !== pr.owner && Math.abs(x - c.x) < 46 + rad && y < c.y - 16) return { kind: 'pedestal', ref: p }; }
  return null;
}

/** A shot stops at (pr.x, pr.y): damage what it struck, splash the rest. */
function impact(s, pr, hit) {
  const a = pr.ult ? { ...AMMO[pr.ammo], ...pr.ult } : AMMO[pr.ammo], sh = pr.shard;
  const dmg = sh ? AMMO.scatter.dmg : a.dmg, r = sh ? AMMO.scatter.r : a.r, bld = sh ? AMMO.scatter.bld : a.bld;
  const me = pr.owner, foe = 1 - me;
  // an ultimate's hits on the chief are capped per use (TIERS-era rule: no coin-flip ultimates)
  const hurtKing = (s2, p2, amt, x, y, by) => { if (pr.ult) { const pl = s.players[me]; amt = Math.min(amt, pl.ultCap); pl.ultCap -= amt; } hurtKingRaw(s2, p2, amt, x, y, by); };
  let any = false;
  const direct = hit?.ref;
  if (hit?.kind === 'block' && direct.owner === foe) { hurtBlock(s, direct, dmg * bld, me); any = true; }
  if (hit?.kind === 'bld' && direct.owner === foe) { hurtBuilding(s, direct, dmg * bld); any = true; }
  if (hit?.kind === 'king' && direct === foe) { hurtKing(s, foe, dmg * (a.bld > 1 && !sh ? 1.3 : 1), pr.x, pr.y, me); any = true; }
  // splash: troops in the blast, other blocks and buildings at reduced strength, the chief only by line of sight
  for (const u of s.units) if (u.owner === foe && hyp(u.x - pr.x, unitY(u) - pr.y) < r + UNIT[u.kind].r) { hurtUnit(s, u, dmg, me); any = true; }
  for (const b of s.blocks) { if (b.dead || b.owner !== foe || b === direct) continue; const q = blockPos(b); if (hyp(q.x - pr.x, q.y - pr.y) < r + CELL * 0.3) { hurtBlock(s, b, dmg * bld * 0.4, me); any = true; } }
  for (const b of s.buildings) { if (b.dead || b.owner !== foe || b === direct || b.kind === 'shield') continue; if (Math.abs(b.x - pr.x) < r && pr.y < GEOM[b.kind].h + r) { hurtBuilding(s, b, dmg * bld * 0.4); any = true; } }
  if (hit?.kind !== 'king') { const k = kingPos(foe, s); if (hyp(k.x - pr.x, k.y - pr.y) < r * 0.6 + kingR(foe, s) && !shielded(s, foe, pr.x, pr.y)) { hurtKing(s, foe, dmg * 0.5, pr.x, pr.y, me); any = true; } }
  if (a.burn && !sh && pr.y < 30) s.fires.push({ owner: me, kind: 'fire', x: pr.x, r: a.burn.r, t: a.burn.t * (raceOf(s, me).mods.burnTime || 1), dps: a.burn.dps });
  if (any) s.players[me].hits++;
  fx(s, 'boom', pr.x, pr.y, { r, owner: me, ttl: 0.5, big: pr.ammo === 'boulder' && !sh });
  emit(s, 'impact', { p: me, ammo: pr.ammo, x: pr.x, y: pr.y, hit: any, on: hit?.kind || 'ground' });
}
/** Is there a block between the blast and the chief? (the blast only reaches the chief through an opening) */
function shielded(s, p, x, y) {
  const k = kingPos(p, s);
  for (let i = 1; i < 6; i++) {
    const f = i / 6, px = x + (k.x - x) * f, py = y + (k.y - y) * f;
    for (const b of s.blocks) { if (b.dead || b.owner !== p) continue; const q = blockPos(b); if (Math.abs(px - q.x) < CELL / 2 && Math.abs(py - q.y) < CELL / 2) return true; }
  }
  return false;
}

// ---------- bonuses ----------
function spawnBonus(s) {
  const keys = Object.keys(BONUS), kind = keys[Math.floor(s.rand() * keys.length)];
  const d = s.bonusSide ? -1 : 1; s.bonusSide ^= 1;
  s.bonuses.push({ id: s.nextId++, kind, cat: BONUS[kind].cat, state: 'fly', t: 0, x: d > 0 ? -40 : W + 40, y: BONUS_BAND[0] + s.rand() * (BONUS_BAND[1] - BONUS_BAND[0]), vx: d * (70 + s.rand() * 36), bob: s.rand() * 6 });
  emit(s, 'bonus-spawn', { kind });
}
function award(s, p, kind, x, y) {
  const pl = s.players[p], bg = raceOf(s, p).mods.bonusGold || 1;
  pl.bonuses++;
  switch (kind) {
    case 'gold': pl.gold = Math.min(capOf(s), pl.gold + 40 * bg); break;
    case 'rapid': pl.rapid = RAPID_TIME; break;
    case 'ammo': pl.freeShots += 3; break;
    case 'repair': pl.kingHp = Math.min(pl.kingMax, pl.kingHp + 50); break;
    case 'chest': pl.gold = Math.min(capOf(s), pl.gold + 90 * bg); break;
    case 'troops': spawnSquad(s, p, raceOf(s, p).ground[0], x); break;
  }
  fx(s, 'sparkle', x, y, { ttl: 0.9, owner: p });
  emit(s, 'bonus', { p, kind, x, y });
}
export const bonusY = (b) => (b.state === 'fly' ? b.y + Math.sin(b.t * 2.2 + b.bob) * 10 : b.y);
function stepBonuses(s, dt) {
  s.bonusTimer -= dt;
  if (s.bonusTimer <= 0 && s.bonuses.filter((b) => b.state === 'fly').length < 2) { spawnBonus(s); s.bonusTimer = BONUS_EVERY[0] + s.rand() * (BONUS_EVERY[1] - BONUS_EVERY[0]); }
  for (const b of s.bonuses) {
    b.t += dt;
    if (b.state === 'fly') { b.x += b.vx * dt; if (b.x < -80 || b.x > W + 80) b.gone = true; }
    else if (b.state === 'fall') { b.vy -= G * 0.6 * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.state = 'ground'; b.t = 0; emit(s, 'crate-land', { x: b.x }); } }
    else if (b.state === 'ground') {
      if (b.t > CRATE_LIFE) { b.gone = true; continue; }
      let best = null, bd = Infinity;
      for (const u of s.units) { if (UNIT[u.kind].air) continue; const d = Math.abs(u.x - b.x); if (d < UNIT[u.kind].r + 16 && d < bd) { bd = d; best = u; } }
      if (best) { award(s, best.owner, b.kind, b.x, 30); b.gone = true; }
    }
  }
  compact(s.bonuses, (b) => !b.gone);
}
function hitBonus(s, pr, b) {
  if (b.cat === 'air') { award(s, pr.owner, b.kind, b.x, bonusY(b)); b.gone = true; return; }
  b.y = bonusY(b); b.state = 'fall'; b.vy = 0; b.knockedBy = pr.owner;
  b.x = clamp(b.x, FORT.gateX + 20, W - FORT.gateX - 20);       // crates always come down on the open ground between the forts
  fx(s, 'pop', b.x, b.y, { ttl: 0.4, owner: pr.owner }); emit(s, 'crate-knock', { p: pr.owner, x: b.x, y: b.y });
}

// ---------- step ----------
export function step(s, dt = DT) {
  s.time += dt;
  for (const f of s.fx) f.t += dt;
  compact(s.fx, (f) => f.t < f.ttl);
  for (const b of s.blocks) { if (b.drop > 0) b.drop = Math.max(0, b.drop - 420 * dt); if (b.flash > 0) b.flash -= dt; }
  for (const b of s.buildings) if (b.flash > 0) b.flash -= dt;
  for (const p of s.players) if (p.kingFlash > 0) p.kingFlash -= dt;

  if (s.phase === 'roundOver') {
    s.interTimer -= dt;
    stepProjectiles(s, dt);
    if (s.interTimer <= 0) { s.round++; fresh(s); emit(s, 'round-start', { round: s.round }); }
    return;
  }
  if (s.phase === 'over') { stepProjectiles(s, dt); return; }

  s.clock -= dt;
  s.roundT += dt;
  for (let t = s.tier + 1; t <= TIERS.at.length; t++) if (s.roundT >= tierAt(s, t)) { s.tier = t; emit(s, 'tier', { tier: t, name: ['Skirmish', 'Battle', 'War'][t - 1] }); }
  if (s.clock <= 0) {
    if (s.phase === 'play') {
      s.phase = 'sudden'; s.clock = SUDDEN_TIME;
      for (const b of s.buildings) if (b.kind === 'shield' && !b.dead) { b.dead = true; fx(s, 'pop', b.x, 60, { ttl: 0.7, owner: b.owner }); }
      emit(s, 'sudden', {});
    } else { endRound(s, timeoutWinner(s)); return; }
  }
  for (const p of s.players) {
    const m = RACES[p.race].mods;
    p.gold = Math.min(capOf(s), p.gold + incomeOf(s, p.id) * dt);
    if (p.heroCd > 0) p.heroCd = Math.max(0, p.heroCd - dt);
    p.ult = Math.min(1, p.ult + ULT.perSec * dt);
    p.reload = Math.max(0, p.reload - dt); p.rapid = Math.max(0, p.rapid - dt);
    if (m.kingRegen && p.kingHp > 0 && s.phase === 'play') p.kingHp = Math.min(p.kingMax, p.kingHp + m.kingRegen * dt);
  }
  stepBonuses(s, dt);
  stepProjectiles(s, dt);
  stepBuildings(s, dt);
  stepUnits(s, dt);
  stepKings(s, dt);
  stepUlts(s, dt);
  stepFires(s, dt);
  if (s.settle) settleFort(s);
  reap(s);
  compact(s.buildings, (b) => !b.dead);
  const k0 = s.players[0].kingHp <= 0, k1 = s.players[1].kingHp <= 0;
  if (k0 || k1) endRound(s, k0 && k1 ? -1 : k0 ? 1 : 0);
}
/** Clear away dead troops: pay the bounty, burst splitters into their little ones, raise skeletons. */
function reap(s) {
  const born = [];
  compact(s.units, (u) => {
    if (u.hp > 0) return true;
    const spec = UNIT[u.kind], foe = 1 - u.owner;
    fx(s, 'poof', u.x, unitY(u), { ttl: 0.45, owner: u.owner });
    if (spec.hero) { s.players[u.owner].heroCd = HERO.cooldown; emit(s, 'hero-down', { p: u.owner, x: u.x }); }
    if (u.spent) return false;                                   // blew itself up: no bounty
    if (u.by === foe) {
      const pl = s.players[foe], g = bountyOf(u.kind, s, u.owner) + (RACES[pl.race].mods.plunder || 0);
      pl.gold = Math.min(capOf(s), pl.gold + g); pl.earned += g; pl.kills++;
      emit(s, 'bounty', { p: foe, gold: g, x: u.x, y: unitY(u), kind: u.kind });
      fx(s, 'coin', u.x, unitY(u), { ttl: 0.9, gold: g, owner: foe });
    }
    if (spec.split) for (let i = 0; i < spec.split.n; i++) born.push(makeUnit(s, u.owner, spec.split.kind, u.x + (i - (spec.split.n - 1) / 2) * 18));
    if (u.raiseFor === foe) { born.push(makeUnit(s, foe, u.raiseKind, u.x)); fx(s, 'heal', u.x, 30, { ttl: 0.5, r: 30, owner: foe }); }
    return false;
  });
  for (const b of born) s.units.push(b);
}
/** Time ran out: healthier chief wins, then the fort in better shape, then whoever did more damage. */
function timeoutWinner(s) {
  const [a, b] = s.players;
  const cmp = (x, y) => (Math.abs(x - y) < 1e-6 ? 0 : x > y ? 1 : -1);
  const c = cmp(a.kingHp / a.kingMax, b.kingHp / b.kingMax) || cmp(fortHp(s, 0), fortHp(s, 1)) || cmp(a.dealt, b.dealt);
  return c === 0 ? -1 : c > 0 ? 0 : 1;
}
function endRound(s, winner) {
  s.roundWinner = winner;
  if (winner >= 0) s.roundsWon[winner]++; else s.draws++;
  emit(s, 'round-end', { winner });
  if (winner >= 0 && s.roundsWon[winner] >= ROUNDS_TO_WIN) { s.phase = 'over'; s.winner = winner; emit(s, 'match-end', { winner }); }
  else if (s.draws > MAX_DRAWS) {                               // nobody is really playing: call it on rounds, or a draw
    s.phase = 'over'; s.winner = s.roundsWon[0] === s.roundsWon[1] ? -1 : s.roundsWon[0] > s.roundsWon[1] ? 0 : 1; emit(s, 'match-end', { winner: s.winner });
  } else { s.phase = 'roundOver'; s.interTimer = INTERMISSION; }
}

function stepProjectiles(s, dt) {
  const born = [];
  compact(s.projectiles, (pr) => stepShot(s, pr, dt, born));
  for (const b of born) s.projectiles.push(b);
}
/** Advance one shot. Moves in small sub-steps so nothing thin can be skipped. Returns false when used up. */
function stepShot(s, pr, dt, born) {
  pr.t += dt; pr.spin += dt * 7;
  const rad = pr.shard ? AMMO.scatter.size * 0.8 : AMMO[pr.ammo].size;
  const n = Math.max(1, Math.ceil(hyp(pr.vx, pr.vy) * dt / 6)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const vy0 = pr.vy;
    pr.x += pr.vx * h; pr.y += pr.vy * h - 0.5 * G * h * h; pr.vy -= G * h;
    if (!live(s)) { if (pr.y <= 0) return false; continue; }
    if (pr.split && vy0 > 0 && pr.vy <= 0) {                     // scatter bursts at the top of its arc
      for (const k of [-1, 0, 1]) born.push({ ...pr, id: s.nextId++, split: false, shard: true, vx: pr.vx * (1 + k * 0.13), vy: k === 0 ? 0 : 40 });
      fx(s, 'burst', pr.x, pr.y, { ttl: 0.35, owner: pr.owner });
      return false;
    }
    for (const b of s.bonuses) if (b.state === 'fly' && !b.gone && hyp(pr.x - b.x, pr.y - bonusY(b)) < BONUS_R + rad) hitBonus(s, pr, b);
    const hit = solidAt(s, pr, pr.x, pr.y, rad * 0.85);
    if (hit) {
      if (hit.kind === 'shield') { hurtBuilding(s, hit.ref, (pr.shard ? AMMO.scatter.dmg : AMMO[pr.ammo].dmg) * (pr.ammo === 'boulder' && !pr.shard ? 1.6 : 1)); fx(s, 'ripple', pr.x, pr.y, { ttl: 0.5, owner: hit.ref.owner }); emit(s, 'shield-hit', { p: hit.ref.owner, x: pr.x, y: pr.y }); return false; }
      impact(s, pr, hit); return false;
    }
    if (pr.y <= 0) { pr.y = 0; impact(s, pr, null); return false; }
    if (pr.x < -150 || pr.x > W + 150) return false;
  }
  return true;
}

/** Nearest enemy troop within reach of a point on the ground line (towers and the fort's guards hit flyers too). */
function nearestFoe(s, owner, x, range) {
  let best = null, bd = range;
  for (const u of s.units) { if (u.owner === owner || u.hp <= 0) continue; const d = Math.abs(u.x - x); if (d < bd) { bd = d; best = u; } }
  return best;
}
function stepBuildings(s, dt) {
  for (const pl of s.players) {
    pl.guard -= dt;
    if (pl.guard > 0) continue;
    const gx = mx(pl.id, FORT.frontX), best = nearestFoe(s, pl.id, gx, FORT_GUARD.range);
    if (best) { hurtUnit(s, best, FORT_GUARD.dmg, pl.id); pl.guard = FORT_GUARD.rate; fx(s, 'bolt', gx, CELL * 3, { ttl: 0.18, tx: best.x, ty: unitY(best), owner: pl.id }); }
  }
  for (const b of s.buildings) {
    b.age += dt;
    if (b.kind === 'shield') { if (b.age > b.life) { b.dead = true; fx(s, 'pop', b.x, 60, { ttl: 0.7, owner: b.owner }); } continue; }
    if (b.kind !== 'tower' || b.dead) continue;                  // a tower knocked down earlier this step does not fire
    b.cd -= dt;
    if (b.cd > 0) continue;
    const best = nearestFoe(s, b.owner, b.x, BUILD.tower.range);
    if (best) { hurtUnit(s, best, BUILD.tower.dmg * (raceOf(s, b.owner).mods.towerDmg || 1), b.owner); b.cd = BUILD.tower.rate; fx(s, 'bolt', b.x, TOWER.h - 20, { ttl: 0.18, tx: best.x, ty: unitY(best), owner: b.owner }); emit(s, 'tower-shot', { p: b.owner }); }
  }
}

/** The first enemy thing standing in a ground troop's way: a wall, tower or mine, then the fort's front column, then the chief. */
function obstacle(s, u) {
  const foe = 1 - u.owner, d = dir(u.owner);
  let best = null, bd = Infinity;
  for (const b of s.buildings) {
    if (b.owner !== foe || b.dead || b.kind === 'shield') continue;
    const gap = (b.x - u.x) * d - GEOM[b.kind].w / 2;
    if (gap > -40 && gap < bd) { bd = gap; best = { kind: 'bld', ref: b, gap }; }
  }
  { const k = kingPos(foe, s), gap = (k.x - u.x) * d - kingR(foe, s); if (s.players[foe].kx !== kingHome(foe) && gap > -40 && gap < bd) { bd = gap; best = { kind: 'king', ref: foe, gap }; } }
  // lowest block of the first fort column still standing in the way
  for (let c = 0; c < FORT.cols; c++) {
    const col = s.blocks.filter((b) => !b.dead && b.owner === foe && b.c === c && b.r <= 1);
    if (c > 0 && c < 3) { const k = kingPos(foe, s), gap = (k.x - u.x) * d - kingR(foe, s); if (gap < bd) { bd = gap; best = { kind: 'king', ref: foe, gap }; } break; }
    if (!col.length) continue;
    const b = col.sort((x, y) => x.r - y.r)[0], gap = (colX(foe, c) - u.x) * d - CELL / 2;
    if (gap < bd) { bd = gap; best = { kind: 'block', ref: b, gap }; }
    break;
  }
  return best;
}
/** What a flyer goes for: it flies over everything to the enemy fort, tears the roof off, then dives on the chief. */
function airTarget(s, u) {
  const foe = 1 - u.owner, k = kingPos(foe, s), gap = (k.x - u.x) * dir(u.owner);
  const roof = s.blocks.filter((b) => !b.dead && b.owner === foe && (b.c === 1 || b.c === 2)).sort((a, b) => b.r - a.r || a.c - b.c)[0];
  return roof ? { kind: 'block', ref: roof, gap } : { kind: 'king', ref: foe, gap };
}
/** Can a troop of type a hit a troop of type b? Flyers are only reached by shooters on the ground and by flyers marked aa. */
// troop roles (all optional, set in races.js): noAir never targets flyers; vsAir multiplies damage to flyers;
// pierce ignores armour; siege ignores enemy troops and goes straight for buildings and the fort
export const canHit = (a, b) => !b.air || (!a.noAir && !!a.range && !a.boom && (!a.air || !!a.aa));

function explode(s, u, spec) {
  const foe = 1 - u.owner, y = spec.air ? CELL * 2.5 : 20;
  u.hp = 0; u.spent = true;
  for (const b of s.blocks) { if (b.dead || b.owner !== foe) continue; const q = blockPos(b); if (hyp(q.x - u.x, q.y - y) < spec.boom.r + CELL * 0.4) hurtBlock(s, b, spec.boom.dmg, u.owner); }
  for (const b of s.buildings) if (b.owner === foe && !b.dead && b.kind !== 'shield' && Math.abs(b.x - u.x) < spec.boom.r) hurtBuilding(s, b, spec.boom.dmg);
  for (const e of s.units) if (e.owner === foe && e.hp > 0 && !UNIT[e.kind].air && Math.abs(e.x - u.x) < spec.boom.r * 0.7) hurtUnit(s, e, spec.boom.dmg * 0.5, u.owner);
  const k = kingPos(foe, s);
  if (Math.abs(k.x - u.x) < spec.boom.r * 0.6 + kingR(foe, s) && !shielded(s, foe, u.x, y)) hurtKing(s, foe, spec.boom.dmg * 0.7, u.x, y, u.owner);
  if (spec.boom.cloud) s.fires.push({ owner: u.owner, kind: 'spore', x: u.x, ...spec.boom.cloud });
  fx(s, 'boom', u.x, y + 4, { ttl: 0.6, r: spec.boom.r, owner: u.owner, big: true, spore: !!spec.boom.cloud });
  emit(s, 'boom', { p: u.owner, x: u.x });
}

/** Chiefs fight: go for the nearest enemy ground troop near the fort (never past the leash), strike with a splash;
 *  with none near, walk home and, after a calm spell, heal slowly. */
function stepKings(s, dt) {
  const K = KING_FIGHT;
  for (const pl of s.players) {
    const A = KING_ATK[pl.race] || { range: 0, dmg: 1, splash: K.splash };
    const p = pl.id, foe = 1 - p, home = kingHome(p), local = (x) => (p === 0 ? x : W - x);
    pl.kingCd = Math.max(0, pl.kingCd - dt); if (pl.kingAct > 0) pl.kingAct -= dt;
    pl.kingHeal = false;
    if (pl.kingHp <= 0 || pl.kingIdle) continue;            // kingIdle: tests that need a chief who stays put
    let target = null, td = Infinity;
    if (fortOpen(s, p)) for (const u of s.units) {
      if (u.owner !== foe || u.hp <= 0 || UNIT[u.kind].air || local(u.x) > K.aggro) continue;
      const dd = Math.abs(u.x - pl.kx); if (dd < td) { td = dd; target = u; }
    }
    if (target) {
      pl.kingQuiet = 0;
      const reach = kingR(p, s) + UNIT[target.kind].r + K.reach + A.range * kingScale(p, s);
      pl.kingFace = Math.sign(target.x - pl.kx) || pl.kingFace;
      if (td > reach) {
        const nx = pl.kx + Math.sign(target.x - pl.kx) * Math.min(K.speed * dt, td - reach);
        pl.kx = p === 0 ? clamp(nx, home, K.leash) : clamp(nx, W - K.leash, home);
      }
      if (td <= reach + 2 && pl.kingCd <= 0) {
        pl.kingCd = K.rate * (A.rate ?? 1); pl.kingAct = 0.3;
        // attack shape from KING_ATK: 'blast' (default) hits the target and everything within splash of it; 'front' and
        // 'line' hit every enemy ground troop on the side he faces within his reach (melee swing, beam or wave)
        const dmg = K.dmg * A.dmg, side = A.side ?? K.splashMul, f = pl.kingFace, sc = kingScale(p, s);
        const wide = A.shape === 'front' || A.shape === 'line';
        for (const e of s.units) {
          if (e.owner !== foe || e.hp <= 0 || UNIT[e.kind].air) continue;
          const hit = e === target || (wide
            ? (e.x - pl.kx) * f >= 0 && Math.abs(e.x - pl.kx) <= kingR(p, s) + UNIT[e.kind].r + K.reach + A.range * sc
            : Math.abs(e.x - target.x) < A.splash);
          if (!hit) continue;
          hurtUnit(s, e, e === target ? dmg : dmg * side, p);
          if (A.push && e.hp > 0) e.x = clamp(e.x - dir(e.owner) * A.push, 0, W);   // shoved back toward its own fort
        }
        fx(s, 'burst', target.x, 26, { ttl: 0.3, owner: p });
        emit(s, 'king-strike', { p, x: target.x });
      }
      continue;
    }
    if (Math.abs(pl.kx - home) > 0.5) { pl.kingFace = Math.sign(home - pl.kx); pl.kx += Math.sign(home - pl.kx) * Math.min(K.speed * dt, Math.abs(home - pl.kx)); continue; }
    pl.kx = home; pl.kingFace = dir(p);
    pl.kingQuiet += dt;
    if (pl.kingQuiet > K.calm && pl.kingHp < pl.kingMax) { pl.kingHp = Math.min(pl.kingMax, pl.kingHp + K.regen * dt); pl.kingHeal = true; }
  }
}

// ---------- ultimates ----------
/** Ready to fire: meter full, not used this round, round live. */
export const HERO_CD = HERO.cooldown;
export const ultReady = (s, p) => live(s) && s.players[p].ult >= 1 && !s.players[p].ultUsed;
/** Fire player p's ultimate (races.js `ult`): barrage, sweep, beam or summon. */
export function ultimate(s, p) {
  if (!ultReady(s, p)) return false;
  const pl = s.players[p], foe = 1 - p, U = raceOf(s, p).ult;
  pl.ultUsed = true; pl.ult = 0;
  pl.ultCap = (U.chiefCap ?? 1) * s.players[foe].kingMax;
  if (U.shape === 'barrage') {
    for (let i = 0; i < (U.n || 8); i++) {
      const u = 80 + s.rand() * (FORT.gateX + 140 - 80), x = mx(foe, u);       // over the enemy fort and gate
      s.ultq.push({ t: (U.over || 1.5) * i / Math.max(1, (U.n || 8) - 1), owner: p, kind: 'drop', x });
    }
  } else if (U.shape === 'sweep') {
    s.waves.push({ owner: p, x: gateX(p), hit: new Set(), U });
  } else if (U.shape === 'beam') {
    s.ultq.push({ t: 0.8, owner: p, kind: 'beam', x: kingPos(foe, s).x });
  } else if (U.shape === 'summon') {
    for (const [k, n] of U.units || []) { const key = UNIT[k] ? k : `${pl.race}_${k}`; if (UNIT[key]) spawnSquad(s, p, key, gateX(p), n); }
  }
  s.ultShow = { p, name: U.name, at: s.time };
  emit(s, 'ult', { p, shape: U.shape, x: U.shape === 'beam' ? kingPos(foe, s).x : mx(foe, 200), name: U.name, dur: U.shape === 'barrage' ? (U.over || 1.5) + 1.2 : U.shape === 'sweep' ? W / (U.speed || 380) : U.shape === 'beam' ? 1.2 : 0.5, reach: U.shape === 'beam' ? (U.r || 50) : U.shape === 'barrage' ? (U.r || 60) : 30 });
  return true;
}
function stepUlts(s, dt) {
  for (const q of s.ultq) {
    q.t -= dt;
    if (q.t > 0 || q.done) continue;
    q.done = true;
    const U = raceOf(s, q.owner).ult, foe = 1 - q.owner;
    if (q.kind === 'drop') s.projectiles.push({ id: s.nextId++, owner: q.owner, ammo: 'boulder', x: q.x, y: SKY - 40, vx: 0, vy: -420, split: false, shard: false, t: 0, spin: 0, ult: { dmg: U.dmg, r: U.r, bld: U.bld, size: 15 } });
    if (q.kind === 'beam') {
      const pl = s.players[q.owner];
      for (const b of s.blocks) if (!b.dead && b.owner === foe && Math.abs(blockPos(b).x - q.x) < (U.r || 50)) hurtBlock(s, b, U.blockDmg ?? 80, q.owner);
      for (const u of s.units) if (u.owner === foe && u.hp > 0 && Math.abs(u.x - q.x) < (U.r || 50)) hurtUnit(s, u, (U.dmg || 120) * 0.5, q.owner);
      const amt = Math.min(U.dmg || 120, pl.ultCap); pl.ultCap -= amt; hurtKing(s, foe, amt, q.x, 40, q.owner);
      fx(s, 'boom', q.x, 40, { r: U.r || 50, owner: q.owner, ttl: 0.6, big: true });
    }
  }
  compact(s.ultq, (q) => !q.done);
  for (const w of s.waves) {
    const d = dir(w.owner), foe = 1 - w.owner, U = w.U;
    w.x += d * (U.speed || 380) * dt;
    for (const u of s.units) if (u.owner === foe && u.hp > 0 && !UNIT[u.kind].air && !w.hit.has(u.id) && Math.abs(u.x - w.x) < 30) { w.hit.add(u.id); hurtUnit(s, u, U.dmg || 40, w.owner); if (U.slow) u.slow = Math.max(u.slow, U.slow); }
    for (const b of s.buildings) if (b.owner === foe && !b.dead && b.kind !== 'shield' && !w.hit.has('b' + b.id) && Math.abs(b.x - w.x) < 30) { w.hit.add('b' + b.id); hurtBuilding(s, b, U.bldDmg ?? (U.dmg || 40) * 2); }
    for (const b of s.blocks) if (!b.dead && b.owner === foe && b.r <= 1 && !w.hit.has('k' + b.id) && Math.abs(blockPos(b).x - w.x) < 30) { w.hit.add('k' + b.id); hurtBlock(s, b, U.bldDmg ?? (U.dmg || 40) * 2, w.owner); }
    if (U.burn && Math.floor(w.x / 70) !== Math.floor((w.x - d * (U.speed || 380) * dt) / 70)) s.fires.push({ owner: w.owner, kind: 'fire', x: w.x, r: 40, t: U.burn.t, dps: U.burn.dps });
    if (mx(foe, w.x) < 60) w.done = true;                      // reached the far edge
  }
  compact(s.waves, (w) => !w.done);
}
/** Auras (heroes): heal friends, scorch enemies, or raise friends' damage within r. Returns friend damage multipliers. */
function stepAuras(s, dt) {
  const mul = new Map();
  for (const a of s.units) {
    const A = UNIT[a.kind].aura;
    if (!A || a.hp <= 0) continue;
    for (const u of s.units) {
      if (u.hp <= 0 || Math.abs(u.x - a.x) > A.r) continue;
      if (u.owner === a.owner) {
        if (A.heal && u !== a && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + A.heal * dt);
        if (A.dmgMul && u !== a) mul.set(u, Math.max(mul.get(u) || 1, A.dmgMul));
      } else if (A.dps && !UNIT[u.kind].air) hurtUnit(s, u, A.dps * dt, a.owner, true);
    }
  }
  return mul;
}

function stepUnits(s, dt) {
  const born = [], auraMul = stepAuras(s, dt);
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const spec = UNIT[u.kind], foe = 1 - u.owner, d = dir(u.owner), m = RACES[s.players[u.owner].race].mods;
    u.cd = Math.max(0, u.cd - dt);
    if (u.slow > 0) u.slow -= dt;
    if (u.act > 0) u.act -= dt;
    if (u.hurt > 0) u.hurt -= dt;
    if (spec.regen && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + spec.regen * dt);
    if (spec.spawn) {
      u.spawnT -= dt;
      if (u.spawnT <= 0) { u.spawnT = spec.spawn.every; if (s.units.filter((e) => e.owner === u.owner && e.kind === spec.spawn.kind).length < 6) born.push(makeUnit(s, u.owner, spec.spawn.kind, u.x)); }
    }
    if (spec.heal && u.cd <= 0) {
      let healed = false;
      for (const f of s.units) if (f.owner === u.owner && f !== u && f.hp > 0 && f.hp < f.maxHp && Math.abs(f.x - u.x) < spec.heal.r) { f.hp = Math.min(f.maxHp, f.hp + spec.heal.amt); healed = true; }
      if (healed) { u.cd = spec.rate; u.act = 0.3; fx(s, 'heal', u.x, 30, { ttl: 0.5, r: spec.heal.r, owner: u.owner }); }
    }
    let foeUnit = null, fd = Infinity;
    if (!spec.siege) for (const e of s.units) { if (e.owner !== foe || e.hp <= 0 || !canHit(spec, UNIT[e.kind])) continue; const dd = Math.abs(e.x - u.x); if (dd < fd) { fd = dd; foeUnit = e; } }
    const reach = spec.range || 0, ob = spec.air ? airTarget(s, u) : obstacle(s, u);
    let target = null, tkind = null;
    if (foeUnit && !(spec.boom && spec.air) && fd < (reach || spec.r + UNIT[foeUnit.kind].r + 4)) { target = foeUnit; tkind = 'unit'; }
    else if (ob && ob.gap < Math.max(reach, spec.r + 2)) { target = ob.ref; tkind = ob.kind; }

    if (target !== null) {
      if (spec.boom && !spec.air) { explode(s, u, spec); continue; }             // ground bombers blow up on whatever they reach: troops, buildings, the fort
      if (spec.boom && tkind !== 'unit') { explode(s, u, spec); continue; }       // flying bombers blow up on buildings and forts
      if (u.cd <= 0) {
        u.cd = spec.rate; u.act = 0.28;
        const dmg = (spec.dmg || 4) * (u.fresh && spec.charge ? spec.charge : 1) * (auraMul.get(u) || 1);
        u.fresh = false;
        if (tkind === 'unit') {
          const hit = (e, amt) => {
            const es = UNIT[e.kind], dealt = hurtUnit(s, e, amt * (es.air ? spec.vsAir ?? 1 : 1), u.owner, false, !!spec.pierce);
            if (spec.slow) e.slow = Math.max(e.slow, spec.slow);
            if (spec.steal) u.hp = Math.min(u.maxHp, u.hp + dealt * spec.steal);
            if (e.hp <= 0 && !es.air && !es.minion && (spec.raiser || (m.raise && s.rand() < m.raise))) { e.raiseFor = u.owner; e.raiseKind = spec.raiser || `${spec.race}_skeleton`; }
          };
          hit(target, dmg);
          if (spec.splash) { const air = !!UNIT[target.kind].air; for (const e of s.units) if (e !== target && e.owner === foe && e.hp > 0 && !!UNIT[e.kind].air === air && Math.abs(e.x - target.x) < spec.splash) hit(e, dmg * 0.6); }
        }
        else if (tkind === 'bld') hurtBuilding(s, target, dmg * spec.bld);
        else if (tkind === 'block') hurtBlock(s, target, dmg * spec.bld, u.owner);
        else hurtKing(s, foe, dmg * KING_UNIT_MUL, u.x, 20, u.owner);
        if (spec.range) {
          const tx = tkind === 'unit' || tkind === 'bld' ? target.x : tkind === 'block' ? blockPos(target).x : kingPos(foe, s).x;
          const ty = tkind === 'unit' ? unitY(target) : tkind === 'block' ? blockPos(target).y : 24;
          fx(s, 'bolt', u.x, u.y + spec.r * 1.4, { ttl: 0.16, tx, ty, owner: u.owner, thin: true });
        }
      }
      continue;
    }
    // move: toward an enemy troop in sight, else a dropped crate nearby, else on to the fort
    let goal = u.x + d * 100;
    if (foeUnit && !(spec.boom && spec.air) && fd < Math.max(AGGRO, reach)) goal = foeUnit.x;
    else if (!spec.boom && !spec.air) { let cd = 220; for (const b of s.bonuses) if (b.state === 'ground' && Math.abs(b.x - u.x) < cd) { cd = Math.abs(b.x - u.x); goal = b.x; } }
    const sp = spec.speed * (m.unitSpeed || 1) * (u.slow > 0 ? 0.5 : 1), stepX = Math.sign(goal - u.x) * Math.min(Math.abs(goal - u.x), sp * dt);
    u.x = clamp(u.x + stepX, 20, W - 20); u.walk += Math.abs(stepX) * 0.09;
  }
  for (const b of born) s.units.push(b);
}

function stepFires(s, dt) {
  for (const f of s.fires) {
    f.t -= dt;
    const foe = 1 - f.owner;
    for (const u of s.units) if (u.owner === foe && u.hp > 0 && !UNIT[u.kind].air && Math.abs(u.x - f.x) < f.r) { hurtUnit(s, u, f.dps * dt, f.owner, true); if (f.kind === 'spore') u.slow = Math.max(u.slow, 0.3); }
    for (const b of s.blocks) { if (b.dead || b.owner !== foe || b.r > 0) continue; if (Math.abs(colX(foe, b.c) - f.x) < f.r + CELL / 2) hurtBlock(s, b, f.dps * 0.5 * dt, f.owner); }
    for (const b of s.buildings) if (b.owner === foe && !b.dead && b.kind !== 'shield' && Math.abs(b.x - f.x) < f.r + 15) hurtBuilding(s, b, f.dps * 0.6 * dt);
    const k = kingPos(foe, s);
    if (Math.abs(k.x - f.x) < f.r * 0.5 + kingR(foe, s) && !shielded(s, foe, f.x, 20)) hurtKing(s, foe, f.dps * 0.35 * dt, f.x, 10, f.owner);
  }
  compact(s.fires, (f) => f.t > 0);
}

/** Drain s.events (the view plays sounds and effects from them). */
export function takeEvents(s) { const e = s.events; s.events = []; return e; }
