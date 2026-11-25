// tuning.js — every number the balance tools turn: economy, prices, shot and building stats, round timings.
// Race and troop stats are in races.js. Rules and physics (sim.js) import these and re-export them.
// Owner: the balance lane. Change numbers here, then run: npm test, node tools/balance.mjs races|econ|units|rounds.

export const ROUND_TIME = 80, SUDDEN_TIME = 30, INTERMISSION = 3.2, ROUNDS_TO_WIN = 2, MAX_DRAWS = 2;
export const GOLD_START = 60, GOLD_RATE = 6, GOLD_CAP = 300;
export const BOUNTY = 0.3;                     // share of a troop's price paid to the other side when it is killed

export const CRUSH = 45;                      // a block falling on the chief
export const AMMO = {
  stone:   { name: 'Stone',   cost: 0,  reload: 1.4, dmg: 30, r: 46, bld: 1,   size: 11 },
  scatter: { name: 'Scatter', cost: 12, reload: 1.8, dmg: 16, r: 40, bld: 0.7, size: 8, split: 3 },
  fire:    { name: 'Firepot', cost: 18, reload: 1.8, dmg: 14, r: 44, bld: 0.8, size: 11, burn: { r: 60, t: 4.5, dps: 14 } },
  boulder: { name: 'Boulder', cost: 25, reload: 2.6, dmg: 48, r: 40, bld: 2.2, size: 15 },
};
export const BLOCK = { wood: { hp: 70 }, stone: { hp: 140 }, iron: { hp: 200 }, vault: { hp: 110 } };
export const MAT = { L: 'wood', S: 'stone', I: 'iron' };   // fort layout letters -> block kinds
export const BUILD = {
  wall:   { name: 'Wall',   cost: 30, hp: 150 },
  tower:  { name: 'Tower',  cost: 55, hp: 100, range: 190, rate: 0.7, dmg: 12 },
  shield: { name: 'Shield', cost: 45, hp: 90, life: 16 },
  mine:   { name: 'Mine',   cost: 38, hp: 100, income: 3, max: 2 },      // ground building: pays gold every second while it stands
  vault:  { name: 'Vault',  cost: 52, hp: 120, income: 3.5, max: 1 },       // fort addition: a block on top of the back wall
};

/** Fighting worth of one squad, from its stats: this is what prices are made from. */
export function worth(u, all) {
  const air = u.air ? 1.15 : 1;
  if (u.boom) { const c = u.boom.cloud ? u.boom.cloud.dps * u.boom.cloud.t * 0.5 : 0; return u.count * (u.boom.dmg + c) * 0.33 * Math.sqrt(u.hp / 28) * (u.air ? 1.3 : 1); }
  let ehp = u.hp * (1 + (u.armor || 0) * 0.13) + (u.regen || 0) * 10;
  let dps = (u.dmg / u.rate) * (1 + ((u.bld || 1) - 1) * 0.5);
  if (u.splash) dps *= 1.35;
  if (u.slow) dps *= 1.15;
  if (u.charge) dps *= 1 + (u.charge - 1) * 0.12;
  if (u.aa) dps *= 1.1;
  if (u.steal) ehp *= 1 + u.steal * 0.5;
  // staying power counts for a little more than hitting power: a troop has to live long enough to reach the fort
  let v = u.count * 0.72 * Math.pow(ehp, 0.58) * Math.pow(dps, 0.42) * (1 + (u.range || 0) / 260) * Math.pow(u.speed / 45, 0.25) * air;
  if (u.heal) v += u.heal.amt * 3.2;
  if (u.raiser) v *= 1.2;
  if (u.split) v += u.count * u.split.n * worth(all[u.split.kind], all) * 0.8;
  if (u.spawn) v += (20 / u.spawn.every) * worth(all[u.spawn.kind], all) * 0.5;
  return v;
}
export const PRICE_K = 0.62;

export const BONUS_R = 30, BONUS_BAND = [140, 320], BONUS_EVERY = [9, 14], CRATE_LIFE = 25, RAPID_TIME = 10;
export const FORT_GUARD = { range: 130, rate: 1.0, dmg: 10 };   // forts plink enemy troops at the gate
export const KING_UNIT_MUL = 0.6;                               // troops hit the chief softer than blocks
export const AGGRO = 120;
// the chief fights (owner, 2026-11-25): walks out to enemy ground troops near the fort, hits hard with a splash, and
// once none are near walks home and slowly heals. aggro/leash are distances from the fort's back edge (gate is 338).
// The chief only comes out once his fort's front wall (column 0) is down (owner, 2026-11-25). Out of the fort he grows
// to outScale over the first growIn units (drawing and hit size both use S.kingScale).
// Each chief's own attack (owner, 2026-11-25: themed attacks). range: extra reach in world units at home size
// (scaled by kingScale, matching the effect picture's length in view.js KING_FX); dmg: multiplier on KING_FIGHT.dmg;
// splash: radius around the target. Provisional numbers: lane 3 balances them.
export const KING_ATK = {
  fantasy:    { range: 0,   dmg: 1.0,  splash: 60 },   // warhammer shockwave
  aliens:     { range: 150, dmg: 0.8,  splash: 30 },   // laser
  robots:     { range: 140, dmg: 0.8,  splash: 50 },   // lightning
  monsters:   { range: 0,   dmg: 1.15, splash: 40 },   // claws
  military:   { range: 130, dmg: 0.85, splash: 50 },   // rocket
  undead:     { range: 120, dmg: 0.8,  splash: 40 },   // ghost-fire skull
  pirates:    { range: 0,   dmg: 1.15, splash: 44 },   // cutlass
  elementals: { range: 120, dmg: 0.75, splash: 70 },   // fire wave
  beastfolk:  { range: 0,   dmg: 1.1,  splash: 50 },   // bone axe
  steampunk:  { range: 60,  dmg: 0.95, splash: 50 },   // steam blast
};
export const KING_FIGHT = { outScale: 1.45, growIn: 60, aggro: 560, leash: 520, speed: 70, dmg: 40, rate: 0.9, splash: 60, splashMul: 0.5, reach: 10, regen: 3, calm: 2.5 };

