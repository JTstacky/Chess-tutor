// tuning.js — every number the balance tools turn: economy, prices, shot and building stats, round timings.
// Race and troop stats are in races.js. Rules and physics (sim.js) import these and re-export them.
// Owner: the balance lane. Change numbers here, then run: npm test, node tools/balance.mjs races|econ|units|rounds.

// Pacing (owner, 2026-11-25: 5-10 minute matches that start slow and escalate; docs/PACING-PLAN.md).
// A round opens in tier 1 and steps up at TIERS.at seconds; rounds 2 and 3 step up faster (laterRounds).
// Sudden death starts SUDDEN_AT seconds into the round and lasts SUDDEN_TIME.
// owner 2026-11-25: every regular troop is open from the start; the build-up comes from slow gold instead
export const TIERS = { at: [0, 60, 120], income: [2.5, 4, 6], cap: [150, 250, 400], laterRounds: 0.6 };
export const SUDDEN_AT = 240, SUDDEN_TIME = 60, INTERMISSION = 6.5, ROUNDS_TO_WIN = 2, MAX_DRAWS = 2;   // 6.5: room for the knockout
// the end of a round (owner: dramatic): slow motion for KO.slow real seconds at KO.rate speed, the camera zooms KO.zoom
// times onto the beaten chief and holds for KO.cam real seconds, then the end screen after KO.over seconds
export const KO = { slow: 2.0, rate: 0.3, zoom: 2.3, cam: 3.4, over: 4.6 };
export const ROUND_TIME = SUDDEN_AT;                              // old name, kept for tools
export const GOLD_START = 60, GOLD_RATE = TIERS.income[0], GOLD_CAP = TIERS.cap[2];   // old names; the live values follow the tier
// what each tier unlocks; troops are all open from the start (a troop may still carry `tier` in races.js; heroes HERO.tier)
export const AMMO_TIER = { stone: 1, scatter: 1, fire: 2, boulder: 3 };
export const BUILD_TIER = { wall: 1, mine: 1, tower: 2, shield: 2 };
// heroes: one alive per player, a cooldown after one dies, bounty capped
export const HERO = { tier: 3, max: 1, cooldown: 30, bounty: 20 };
// ultimate meter (0..1): fills with time, damage dealt and damage taken (so the side behind is not starved)
export const ULT = { perSec: 1 / 148, perDealt: 1 / 3200, perTaken: 1 / 2400 };
// a race without its own ultimate in races.js gets this one
export const ULT_DEFAULT = { name: 'Barrage', shape: 'barrage', n: 8, dmg: 45, r: 60, bld: 2, over: 1.6, chiefCap: 0.15 };
export const KING_BASE_HP = 400;   // was 300, then 450 (lane 3)
// building slots (owner, 2026-11-26): three marked spots per side, left-fort x, back to front; any mix of walls, towers, mines
export const BUILD_SLOTS = [444, 520, 596];
// each race leans to one building (races.js lean): walls +v health, towers +v damage, mines +v income
export const LEAN = { size: 0.15, label: { wall: 'Stronger walls', tower: 'Sharper towers', mine: 'Richer mines' } };
export const MINE_LOOT = 50;                                      // gold for destroying an enemy mine (owner)
// the castle (owner: destroy the enemy fort to win; it takes no damage while its chief is up)
export const FORT_HP = 1700, FORT_H = 230;                         // castle hit points and height (world units)
export const KO_DOWN = 12, KO_REVIVE = 0.5;                        // a knocked-out chief lies stunned this long, then gets up with this share of his HP
export const BOUNTY = 0.12;                     // share of a troop's price paid to the other side when it is killed

export const CRUSH = 45;                      // a block falling on the chief
export const AMMO = {
  stone:   { name: 'Stone',   cost: 0,  reload: 3.0, dmg: 30, r: 46, bld: 1,   size: 11 },
  scatter: { name: 'Scatter', cost: 12, reload: 3.5, dmg: 16, r: 40, bld: 0.7, size: 8, split: 3 },
  fire:    { name: 'Firepot', cost: 18, reload: 3.5, dmg: 14, r: 44, bld: 0.8, size: 11, burn: { r: 60, t: 4.5, dps: 14 } },
  boulder: { name: 'Boulder', cost: 25, reload: 4.5, dmg: 48, r: 40, bld: 2.2, size: 15 },
};
export const BLOCK = { wood: { hp: 125 }, stone: { hp: 250 }, iron: { hp: 355 }, vault: { hp: 195 } };   // 1.5x for the longer round
export const MAT = { L: 'wood', S: 'stone', I: 'iron' };   // fort layout letters -> block kinds
export const BUILD = {
  wall:   { name: 'Wall',   cost: 30, hp: 400 },
  tower:  { name: 'Tower',  cost: 55, hp: 100, range: 190, rate: 0.7, dmg: 12 },
  shield: { name: 'Shield', cost: 45, hp: 90, life: 16 },
  mine:   { name: 'Mine',   cost: 44, hp: 100, income: 2 },              // ground building: pays gold every second while it stands (no own limit: the three slots are the limit)
  // vault removed (owner: the lockbox did nothing useful)
  _vault: { name: 'Vault',  cost: 60, hp: 120, income: 3.5, max: 1 },       // fort addition: a block on top of the back wall
};

/** Fighting worth of one squad, from its stats: this is what prices are made from. */
export function worth(u, all) {
  const air = u.air ? 1.15 : 1;
  if (u.boom) { const c = u.boom.cloud ? u.boom.cloud.dps * u.boom.cloud.t * 0.5 : 0; return u.count * (u.boom.dmg + c) * 0.33 * Math.sqrt(u.hp / 28) * (u.air ? 1.3 : 1); }
  let ehp = u.hp * (1 + (u.armor || 0) * 0.11) + (u.regen || 0) * 10;
  let dps = (u.dmg / u.rate) * (1 + ((u.bld || 1) - 1) * 0.5);
  if (u.splash) dps *= 1.35;
  if (u.slow) dps *= 1.15;
  if (u.charge) dps *= 1 + (u.charge - 1) * 0.12;
  if (u.aa) dps *= 1.1;
  if (u.vsAir) dps *= 1 + (u.vsAir - 1) * 0.15;      // extra damage to flyers only
  if (u.noAir && u.range) dps *= 0.92;                 // cannot shoot flyers at all
  if (u.pierce) dps *= 1.12;                           // ignores armour
  if (u.siege) dps *= 0.85;                            // only ever hits buildings and walls
  if (u.steal) ehp *= 1 + u.steal * 0.5;
  // staying power counts for a little more than hitting power: a troop has to live long enough to reach the fort
  let v = u.count * 0.72 * Math.pow(ehp, 0.58) * Math.pow(dps, 0.42) * (1 + (u.range || 0) / 260) * Math.pow(u.speed / 45, 0.25) * air;
  if (u.heal) v += u.heal.amt * 3.2;
  if (u.raiser) v *= 1.2;
  if (u.split) v += u.count * u.split.n * worth(all[u.split.kind], all) * 0.8;
  if (u.spawn) v += (20 / u.spawn.every) * worth(all[u.spawn.kind], all) * 0.5;
  return v;
}
export const PRICE_K = 0.4819;

export const BONUS_R = 30, BONUS_BAND = [140, 320], BONUS_EVERY = [9, 14], CRATE_LIFE = 25, RAPID_TIME = 10;
export const FORT_GUARD = { range: 130, rate: 1.0, dmg: 10 };   // forts plink enemy troops at the gate
/** How fast troop shots travel (world units a second). The damage lands when the shot arrives, so a target that dies
 *  first is not hit twice. Thrown and lobbed things are slower than bullets; beams, lightning and screams are near
 *  instant; bombs fall from flyers. Flight times are clamped to [min, max]. */
export const SHOT_FLIGHT = {
  direct: 250, lob: 160, min: 0.2, max: 1.1,                           // about Warcraft III's archer (0.56 s at full range); lobbed is heavy and slow (docs/ANIMATION-RESEARCH.md)
  beam: ['laser', 'walker', 'storm', 'tesla', 'bats', 'ghost'], beamTime: 0.12,
  drop: 0.6,                                                           // a bomb falling from a flyer
};
export const KING_UNIT_MUL = 0.6;                               // troops hit the chief softer than blocks
export const AGGRO = 120;
// the chief fights (owner, 2026-11-25): walks out to enemy ground troops near the fort, hits hard with a splash, and
// once none are near walks home and slowly heals. aggro/leash are distances from the fort's back edge (gate is 338).
// The chief only comes out once his fort's front wall (column 0) is down (owner, 2026-11-25). Out of the fort he grows
// to outScale over the first growIn units (drawing and hit size both use S.kingScale).
// Each chief's own attack (owner, 2026-11-25: themed attacks). range: extra reach in world units at home size
// (scaled by kingScale, matching the effect picture's length in view.js KING_FX); dmg: multiplier on KING_FIGHT.dmg;
// shape: 'front' and 'line' hit every ground troop in front within reach, 'blast' hits the target and those within
// splash of it; side: share of the damage for everything but the target; rate: multiplier on KING_FIGHT.rate (above 1
// is slower); push: world units survivors are shoved back. Melee range ends where the effect picture ends.
// dmg is balanced on tools/kingbench.mjs (tools/kingtune.mjs) so every chief scores about 100.
export const KING_ATK = {
  fantasy:    { shape: 'front', range: 34,  dmg: 2.1 , side: 0.7, rate: 1.1 },            // warhammer: slow, the shockwave hits everything in reach hard
  aliens:     { shape: 'line',  range: 150, dmg: 0.63, side: 0.3 },                        // laser: long thin beam, mostly one target
  robots:     { shape: 'line',  range: 140, dmg: 0.57, side: 0.5, rate: 1.25 },                       // lightning: arcs through the line
  monsters:   { shape: 'front', range: 28,  dmg: 1.35, side: 0.5, rate: 0.7 },             // claws: fast swipes, short reach
  military:   { shape: 'blast', range: 130, dmg: 0.96, side: 0.6, splash: 50, rate: 1.3 }, // rocket: slow, bursts where it lands
  undead:     { shape: 'blast', range: 120, dmg: 0.85, splash: 40 },                       // ghost-fire skull: bursts where it lands
  pirates:    { shape: 'front', range: 26,  dmg: 2.15, side: 0.6 },                        // cutlass: wide arc up close
  elementals: { shape: 'line',  range: 120, dmg: 0.48, side: 1, rate: 1.5 },                         // fire wave: rolls over everyone alike, low damage
  beastfolk:  { shape: 'front', range: 38,  dmg: 1.91, side: 0.6 },             // bone axe: heavy ground slam
  steampunk:  { shape: 'front', range: 60,  dmg: 0.72, side: 0.8, push: 24 },              // steam blast: shoves troops back
};
export const KING_FIGHT = { outScale: 1.45, growIn: 60, aggro: 560, leash: 520, speed: 70, dmg: 40, rate: 0.9, splash: 60, splashMul: 0.5, reach: 10, regen: 3, calm: 2.5 };

