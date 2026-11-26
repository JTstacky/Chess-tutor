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
export const AMMO_TIER = { stone: 1, scatter: 1, fire: 2, boulder: 3, roll: 1 };
// fling shot power (owner, 2026-11-26): up to five levels per round, each dearer than the last; every level adds dmg to all
// your fling shots (not the ultimate)
export const POWER = { max: 5, cost: [20, 35, 60, 100, 170], dmg: 0.25 };
export const BUILD_TIER = { wall: 1, mine: 1, tower: 2, shield: 2 };
// heroes: one alive per player, a cooldown after one dies, bounty capped
export const HERO = { tier: 3, max: 1, cooldown: 30, bounty: 20 };
// ultimate meter (0..1): fills with time, damage dealt and damage taken (so the side behind is not starved)
export const ULT = { perSec: 1 / 148, perDealt: 1 / 3200, perTaken: 1 / 2400 };
// a race without its own ultimate in races.js gets this one
export const ULT_DEFAULT = { name: 'Barrage', shape: 'barrage', n: 8, dmg: 45, r: 60, bld: 2, over: 1.6, chiefCap: 0.15 };
export const KING_BASE_HP = 400;   // was 300, then 450 (lane 3)
// building slots (owner, 2026-11-26): marked spots per side, left-fort x, back to front; any mix of walls, towers, mines.
// Three normally; the Sprawling base / Cramped base traits give 4 or 2 (js/traits.js slots)
export const BUILD_SLOTS = [444, 520, 596];
export const SLOT_LAYOUT = { 1: [520], 2: [470, 570], 3: BUILD_SLOTS, 4: [432, 492, 552, 612], 5: [426, 474, 522, 570, 618] };
// each race leans to one building (races.js lean): walls +v health, towers +v damage, mines +v income
export const LEAN = { size: 0.15, label: { wall: 'Stronger walls', tower: 'Sharper towers', mine: 'Richer mines' } };
export const MINE_LOOT = 50;                                      // gold for destroying an enemy mine (owner)
// the castle (owner: destroy the enemy fort to win; it takes no damage while its chief is up)
export const FORT_HP = 1700, FORT_H = 230;                         // castle hit points and height (world units)
export const KO_DOWN = 12, KO_REVIVE = 0.5;                        // a knocked-out chief lies stunned this long, then gets up with this share of his HP
export const BOUNTY = 0.12;                     // share of a troop's price paid to the other side when it is killed

export const CRUSH = 45;                      // a block falling on the chief
export const AMMO = {
  // fling shot types (owner, 2026-11-26): keys kept from the old names (stone, fire, boulder) so saves, art and tools still match
  stone:   { name: 'Normal',    cost: 0,  reload: 3.0, dmg: 30, r: 46, bld: 1,   troop: 1.6, size: 11 },
  scatter: { name: 'Scatter',   cost: 6,  reload: 3.5, dmg: 16, r: 40, bld: 0.7, troop: 1.6, size: 8, split: 3 },
  fire:    { name: 'Flame',     cost: 9,  reload: 3.5, dmg: 14, r: 44, bld: 0.8, troop: 1.6, size: 11, burn: { r: 60, t: 4.5, dps: 14 } },
  boulder: { name: 'Explosive', cost: 14, reload: 4.5, dmg: 48, r: 58, bld: 2.2, troop: 1.6, size: 15 },        // was the Boulder: now a bigger blast
  // race special (traits.js rolling): lands, then rolls on along the ground for roll.t seconds crushing enemy troops (once
  // each), and smashes into the first enemy building or castle it reaches
  roll:    { name: 'Rolling',   cost: 12, reload: 4.0, dmg: 24, r: 34, bld: 1.2, size: 14, special: true, roll: { t: 2.6, speed: 230, crush: 50 } },
};
export const BLOCK = { wood: { hp: 125 }, stone: { hp: 250 }, iron: { hp: 355 }, vault: { hp: 195 } };   // 1.5x for the longer round
export const MAT = { L: 'wood', S: 'stone', I: 'iron' };   // fort layout letters -> block kinds
export const BUILD = {
  wall:   { name: 'Wall',   cost: 20, hp: 1200 },                    // strong and cheap: it only holds troops up (shots fly through), so it has to last
  tower:  { name: 'Tower',  cost: 55, hp: 70, range: 190, rate: 0.7, dmg: 15 },   // fragile but damaging (owner)
  shield: { name: 'Shield', cost: 45, hp: 90, life: 16 },
  mine:   { name: 'Mine',   cost: 44, hp: 220, income: 2 },              // ground building: pays gold every second while it stands (no own limit: the three slots are the limit)
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
// a dropped power-up that lands this far in front of a chief's home spot (or anywhere behind it) goes to that side
export const DROP_HOME = 40;
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
// Chief attack styles (owner, 2026-11-26): every chief is one of three kinds, so a player can read the enemy chief
// and pick troops against him.
//   single: all the damage on one troop (weak to swarms)
//   area:   every troop in the shape takes the same modest damage (weak to one tough troop)
//           shape 'front' / 'line': everything on the side he faces within reach; 'blast': within splash of the target
//   chain:  the target, then jumps to the nearest troops within KING_FIGHT.chainR at KING_FIGHT.chain strength
// air: his separate attack on flyers (same kinds; area uses r, a radius around the struck flyer). He strikes a flyer
// only when no ground troop is in his reach, and never walks toward one.
// what: the kind in words for the race card and Guidebook; weak: what beats him.
export const KING_ATK = {
  fantasy:    { kind: 'single', range: 50,  dmg: 3.4,  rate: 1.4, what: 'One crushing hammer blow on a single troop', weak: 'swarms',
                air: { kind: 'single', dmg: 3.0, rate: 1.4 } },                               // hammer lightning: one heavy bolt
  aliens:     { kind: 'single', range: 150, dmg: 1.0,  rate: 0.9, what: 'A quick laser on one troop at long reach', weak: 'swarms',
                air: { kind: 'single', dmg: 0.95, rate: 0.9 } },                               // ray pistol: the best flyer-killer
  robots:     { kind: 'chain',  range: 140, dmg: 0.8,  rate: 1.25, what: 'Lightning that jumps from troop to troop', weak: 'one tough troop',
                air: { kind: 'chain', dmg: 0.9, rate: 1.25 } },                               // tesla prod: chains between flyers
  monsters:   { kind: 'area',   shape: 'front', range: 28,  dmg: 0.9,  rate: 0.7, what: 'Fast claw swipes at everything close', weak: 'ranged troops and one tough troop',
                air: { kind: 'single', dmg: 2.2, rate: 1.8 } },                               // thrown rock: heavy, slow, poor against flocks
  military:   { kind: 'area',   shape: 'blast', range: 130, dmg: 1.5, splash: 50, rate: 1.4, what: 'A slow rocket that bursts among troops', weak: 'one tough troop',
                air: { kind: 'area', dmg: 1.3, rate: 1.4, r: 45 } },                          // bazooka: a burst in the air
  undead:     { kind: 'chain',  range: 120, dmg: 0.9,  rate: 1.0, what: 'A ghost-fire skull that leaps between troops', weak: 'one tough troop',
                air: { kind: 'single', dmg: 1.2, rate: 1.0 } },                               // spectral skull: homes on one flyer
  pirates:    { kind: 'area',   shape: 'front', range: 26,  dmg: 0.45,  rate: 1.0, what: 'A wide cutlass arc up close', weak: 'ranged troops',
                air: { kind: 'single', dmg: 1.2, rate: 1.6 } },                               // flintlock: one heavy shot
  elementals: { kind: 'area',   shape: 'line',  range: 120, dmg: 1.4,  rate: 1.3, what: 'A long fire wave over everyone', weak: 'one tough troop',
                air: { kind: 'area', dmg: 1.1, rate: 1.5, r: 70 } },                          // fire fan: wide
  beastfolk:  { kind: 'single', range: 50,  dmg: 3.8,  rate: 1.15, what: 'One heavy axe slam', weak: 'swarms',
                air: { kind: 'single', dmg: 1.6, rate: 1.3 } },                               // bone javelin
  steampunk:  { kind: 'area',   shape: 'front', range: 60,  dmg: 0.4,  rate: 1.0, push: 12, what: 'A steam blast that shoves troops back', weak: 'ranged troops',
                air: { kind: 'single', dmg: 1.2, rate: 1.2, push: 40 } },                     // brass fist: knocks the flyer back
};
// air: share of damage chiefs do to flyers (0 = ground only). airReach: how far along the ground a flyer may be for him
// to strike it. chain: strength of the first hit and each jump; chainR: how far a jump reaches.
export const KING_FIGHT = { air: 1, airReach: 170, chain: [1, 0.6, 0.36, 0.22], chainR: 70, outScale: 1.45, growIn: 60, aggro: 560, leash: 520, speed: 70, dmg: 40, rate: 0.9, splash: 60, splashMul: 0.5, reach: 10, regen: 3, calm: 2.5 };

