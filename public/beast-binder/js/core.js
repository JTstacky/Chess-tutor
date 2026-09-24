"use strict";
// core.js — shared helpers, balance tables, type chart, regions, ranks.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// integer hash -> [0,1). Deterministic, used for terrain texels and prop placement.
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// smooth value noise in [0,1)
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const CONFIG = {
  tile: 32,                 // world px per tile
  texel: 2,                 // world px per terrain "pixel" — the art grid of the ground
  worldTiles: 256,
  chunkTiles: 16,

  beastHeight: 44,          // world px height of a size-1.0 beast
  playerHeight: 54,

  player: {
    speed: 205, radius: 9, baseHp: 120, hpPerRank: 20, regen: 3, regenDelay: 4,
    dashSpeed: 640, dashTime: 0.17, dashCd: 1.1,
    boltCd: 0.3, boltSpeed: 620, boltDmg: 9, boltDmgPerRank: 3.2, boltRange: 520,
    netCd: 0.9, netRange: 300, netRadius: 52, netFlight: 0.32,
    hornCd: 32, hornTime: 9, chargeTime: 9,
  },

  dazeTime: 9,              // seconds a defeated wild stays bindable
  cowedTime: 6,             // pack members cower this long when their alpha falls
  reviveTime: 28,          // a fallen army beast returns after this long
  reserveMax: 240,
  leash: 560, teleportLeash: 1050,
  aggroRange: 250,

  // Binder ranks: renown needed (cumulative) and the army size each rank commands.
  ranks: [
    { name: "Novice Binder",   renown: 0,      cap: 3 },
    { name: "Trapper",         renown: 60,     cap: 5 },
    { name: "Beastcaller",     renown: 200,    cap: 8 },
    { name: "Packmaster",      renown: 500,    cap: 12 },
    { name: "Warden",          renown: 1100,   cap: 17 },
    { name: "Hordekeeper",     renown: 2300,   cap: 24 },
    { name: "Beastmarshal",    renown: 4600,   cap: 34 },
    { name: "Warbringer",      renown: 9000,   cap: 46 },
    { name: "Swarm Sovereign", renown: 17000,  cap: 62 },
    { name: "Titan-Tamer",     renown: 31000,  cap: 82 },
    { name: "Beastlord",       renown: 55000,  cap: 110 },
    { name: "Apex Overlord",   renown: 95000,  cap: 150 },
    { name: "Hordefather",     renown: 150000, cap: 200 },
    { name: "World-Shaker",    renown: 230000, cap: 260 },
    { name: "Living Legend",   renown: 350000, cap: 330 },
    { name: "Beast God",       renown: 520000, cap: 400 },
  ],

  // The Bindframe is forged from Titan cores: tier = Titans felled on this planet. The frame is what lets a
  // Binder command more beasts, so each core also lifts the ceiling on rank (index into ranks, by cores held).
  rankCapAtCores: [4, 6, 8, 10, 12, 14, 15],
  stompCd: 6,
  mech: [
    { hp: 1,   bolt: 1,    radius: 9,  slam: 0 },
    { hp: 1.35, bolt: 1.3, radius: 13, slam: 70 },
    { hp: 1.8, bolt: 1.7,  radius: 17, slam: 95 },
    { hp: 2.5, bolt: 2.3,  radius: 22, slam: 125 },
    { hp: 3.4, bolt: 3.1,  radius: 28, slam: 160 },
    { hp: 4.8, bolt: 4.2,  radius: 34, slam: 200 },
    { hp: 6.4, bolt: 5.5,  radius: 40, slam: 250 },
  ],

  // Boons: every Binder level offers a pick of three. `w` = draw weight, rarity only colours the card.
  boons: [
    { id: "twin",    name: "Forked Bolt",     desc: "+1 staff bolt per shot",                       max: 4, rarity: "epic",   w: 5 },
    { id: "pierce",  name: "Piercing Bolts",  desc: "Bolts punch through +1 more foe",              max: 3, rarity: "rare",   w: 7 },
    { id: "rapid",   name: "Quick Hands",     desc: "+12% staff fire rate",                         max: 6, rarity: "common", w: 10 },
    { id: "blast",   name: "Runic Blast",     desc: "Bolts burst on impact (+28 radius)",           max: 3, rarity: "epic",   w: 5 },
    { id: "frenzy",  name: "Pack Tempo",      desc: "Horde attacks 8% faster",                      max: 8, rarity: "common", w: 10 },
    { id: "crit",    name: "Savage Instinct", desc: "+8% chance for the horde to strike for double", max: 6, rarity: "rare",  w: 8 },
    { id: "leech",   name: "Blood Bond",      desc: "Beasts heal 3% health on every kill",          max: 5, rarity: "rare",   w: 7 },
    { id: "swift",   name: "Fleet March",     desc: "+6% speed for you and the horde",              max: 5, rarity: "common", w: 9 },
    { id: "bulwark", name: "Bulwark",         desc: "+15% health and regeneration for you",         max: 6, rarity: "common", w: 9 },
    { id: "magnet",  name: "Binding Aura",    desc: "+30% gem pull and walk-over bind range",       max: 5, rarity: "common", w: 9 },
    { id: "nets",    name: "Net Volley",      desc: "+1 net per throw",                             max: 3, rarity: "rare",   w: 6 },
    { id: "greed",   name: "Essence Greed",   desc: "+20% essence",                                 max: 5, rarity: "common", w: 8 },
    { id: "scholar", name: "Beast Lore",      desc: "+15% experience for beasts and Binder",        max: 5, rarity: "common", w: 8 },
    { id: "fame",    name: "Fame",            desc: "+6% renown",                                  max: 5, rarity: "rare",   w: 7 },
    { id: "lucky",   name: "Lucky Star",      desc: "+7% chance a bound beast arrives with a ★",   max: 5, rarity: "rare",   w: 6 },
    { id: "giant",   name: "Giantslayer",     desc: "+20% damage to Alphas and Titans",             max: 5, rarity: "rare",   w: 7 },
    { id: "horn",    name: "Echoing Horn",    desc: "War Horn recharges 15% faster, lasts +2s",     max: 4, rarity: "common", w: 7 },
    { id: "revive",  name: "Second Wind",     desc: "Fallen beasts return 12% sooner",              max: 5, rarity: "common", w: 8 },
    { id: "slam",    name: "Shockwave Dash",  desc: "Dash ends in a shockwave (+35% slam damage)",  max: 5, rarity: "rare",   w: 7 },
    { id: "combo",   name: "Bloodlust",       desc: "Frenzy lasts +1.5s before fading",             max: 4, rarity: "rare",   w: 6 },
    { id: "warlord", name: "Warlord",         desc: "+3 horde size",                                max: 6, rarity: "epic",   w: 4 },
  ],

  upgrades: [
    { id: "fury",    name: "Pack Fury",     desc: "+8% army damage",            base: 40,  grow: 1.38, max: 40 },
    { id: "vigor",   name: "Thick Hides",   desc: "+8% army health",            base: 40,  grow: 1.38, max: 40 },
    { id: "net",     name: "Wider Net",     desc: "+12% net radius & bind chance", base: 50, grow: 1.6, max: 10 },
    { id: "bolt",    name: "Staff Focus",   desc: "+15% staff bolt damage",     base: 35,  grow: 1.36, max: 40 },
    { id: "command", name: "Commanding Voice", desc: "+2 army size",            base: 120, grow: 1.45, max: 25 },
    { id: "mend",    name: "Swift Mending", desc: "Fallen beasts return 10% sooner, army regenerates faster", base: 60, grow: 1.6, max: 8 },
  ],
};

// Horde stances (keys 1 · 2 · 3): how far the horde ranges from the binder, and what it trades for it.
const STANCES = {
  swarm: { key: 1, name: "Swarm", color: "#7be0ff", desc: "The horde fights whatever comes near", range: 1, leash: 1, dmg: 1, taken: 1, spread: 1, speed: 1 },
  guard: { key: 2, name: "Guard", color: "#5cf08a", desc: "Stay tight around you and only fight what reaches you · take 30% less damage, deal 10% less", range: 0.55, leash: 0.4, dmg: 0.9, taken: 0.7, spread: 0.7, speed: 1 },
  hunt:  { key: 3, name: "Hunt",  color: "#ff8a3a", desc: "Range far and run prey down · +15% damage and speed, take 20% more damage", range: 1.8, leash: 1.5, dmg: 1.15, taken: 1.2, spread: 1.15, speed: 1.1 },
};

// Elemental Resonance: the more of the marching horde shares an element, the stronger its bond.
// Level I needs a quarter of the horde (at least 2 beasts), level II half of it (at least 4).
// Rock, ground and steel resonate together as Stone. `v` is the effect size at level I / II.
const RESONANCE = [
  { id: "fire",     types: ["fire"],                   name: "Blaze",    v: [0.15, 0.3],  desc: (v) => pct(v) + " of horde hits set foes burning" },
  { id: "water",    types: ["water"],                  name: "Tide",     v: [0.01, 0.02], desc: (v) => "Horde regenerates " + pct(v) + " health a second, even mid-fight" },
  { id: "grass",    types: ["grass"],                  name: "Bloom",    v: [0.2, 0.4],   desc: (v) => "Fallen beasts return " + pct(v) + " sooner" },
  { id: "electric", types: ["electric"],               name: "Surge",    v: [0.1, 0.2],   desc: (v) => pct(v) + " of horde hits arc to a second foe" },
  { id: "ice",      types: ["ice"],                    name: "Rime",     v: [0.2, 0.4],   desc: (v) => pct(v) + " of horde hits slow the foe" },
  { id: "stone",    types: ["rock", "ground", "steel"], name: "Bulwark", v: [0.1, 0.2],   desc: (v) => "Horde takes " + pct(v) + " less damage" },
  { id: "air",      types: ["air"],                    name: "Tailwind", v: [0.1, 0.2],   desc: (v) => "+" + pct(v) + " horde speed, +" + pct(v / 2) + " yours" },
  { id: "bug",      types: ["bug"],                    name: "Hive",     v: [0.08, 0.16], desc: (v) => "Horde attacks " + pct(v) + " faster" },
  { id: "poison",   types: ["poison"],                 name: "Venom",    v: [0.2, 0.4],   desc: (v) => pct(v) + " of horde hits poison the foe" },
  { id: "psychic",  types: ["psychic"],                name: "Mindlink", v: [0.1, 0.2],   desc: (v) => "+" + pct(v) + " net radius and bind chance" },
  { id: "shadow",   types: ["shadow"],                 name: "Ambush",   v: [0.08, 0.16], desc: (v) => "+" + pct(v) + " horde critical chance" },
  { id: "light",    types: ["light"],                  name: "Radiance", v: [0.15, 0.3],  desc: (v) => "+" + pct(v) + " staff bolt damage" },
  { id: "dragon",   types: ["dragon"],                 name: "Dominion", v: [0.08, 0.16], desc: (v) => "+" + pct(v) + " horde damage" },
  { id: "normal",   types: ["normal"],                 name: "Kinship",  v: [0.1, 0.2],   desc: (v) => "+" + pct(v) + " essence and experience" },
];
function pct(v) { return Math.round(v * 100) + "%"; }
const RES_BY_ID = {};
for (const R of RESONANCE) RES_BY_ID[R.id] = R;

// Elite beasts carry an affix. Wild, it changes how you fight them; bound, it keeps working for you.
const AFFIXES = {
  swift:    { name: "Swift",    color: "#9dffb0", wild: "Fast and relentless",                             ally: "35% faster, attacks 20% faster" },
  vampiric: { name: "Vampiric", color: "#ff4a6a", wild: "Heals from every blow it lands",                  ally: "Heals 25% of the damage it deals" },
  thorned:  { name: "Thorned",  color: "#c8a05a", wild: "Claws and fangs that strike it are cut in return", ally: "Melee attackers take 25% of their blow back" },
  warded:   { name: "Warded",   color: "#7be0ff", wild: "A ward soaks 75% of damage — a net shatters it",  ally: "Takes 20% less damage" },
  volatile: { name: "Volatile", color: "#ff8a3a", wild: "Explodes a moment after it is dazed — net it fast or get clear", ally: "Explodes among the foes when it falls" },
};
const AFFIX_IDS = Object.keys(AFFIXES);

// element chart: strong deals 1.5x, weak deals 0.65x
const TYPES = {
  normal:   { name: "Normal",   color: "#d8d2b8", strong: [], weak: ["rock", "steel"] },
  fire:     { name: "Fire",     color: "#ff7a3c", strong: ["grass", "ice", "bug", "steel"], weak: ["fire", "water", "rock", "dragon"] },
  water:    { name: "Water",    color: "#4aa8ff", strong: ["fire", "rock", "ground"], weak: ["water", "grass", "dragon"] },
  grass:    { name: "Grass",    color: "#6fdc4e", strong: ["water", "ground", "rock"], weak: ["fire", "grass", "poison", "bug", "air", "dragon", "steel"] },
  electric: { name: "Electric", color: "#ffd83f", strong: ["water", "air"], weak: ["electric", "grass", "ground", "dragon"] },
  ice:      { name: "Ice",      color: "#a8ecff", strong: ["grass", "ground", "air", "dragon"], weak: ["fire", "water", "ice", "steel"] },
  rock:     { name: "Rock",     color: "#c8a05a", strong: ["fire", "ice", "air", "bug"], weak: ["water", "grass", "ground", "steel"] },
  ground:   { name: "Ground",   color: "#d8a868", strong: ["fire", "electric", "poison", "rock", "steel"], weak: ["grass", "bug", "air", "water"] },
  air:      { name: "Air",      color: "#d4ecff", strong: ["grass", "bug"], weak: ["electric", "rock", "steel"] },
  bug:      { name: "Bug",      color: "#a8cc3c", strong: ["grass", "psychic"], weak: ["fire", "air", "poison", "rock", "steel"] },
  poison:   { name: "Poison",   color: "#b874dc", strong: ["grass", "light"], weak: ["poison", "ground", "rock", "psychic"] },
  psychic:  { name: "Psychic",  color: "#ff74d4", strong: ["poison"], weak: ["psychic", "steel", "shadow"] },
  shadow:   { name: "Shadow",   color: "#8a6cc8", strong: ["psychic", "light"], weak: ["shadow", "light"] },
  light:    { name: "Light",    color: "#ffe89a", strong: ["shadow", "dragon"], weak: ["fire", "poison", "steel"] },
  steel:    { name: "Steel",    color: "#bcc6d8", strong: ["ice", "rock", "light"], weak: ["fire", "water", "electric", "steel"] },
  dragon:   { name: "Dragon",   color: "#8a72ff", strong: ["dragon"], weak: ["steel"] },
};

function typeMult(moveType, targetTypes) {
  const t = TYPES[moveType];
  if (!t) return 1;
  let m = 1;
  for (const tt of targetTypes) {
    if (t.strong.indexOf(tt) >= 0) m *= 1.5;
    else if (t.weak.indexOf(tt) >= 0) m *= 0.65;
  }
  return m;
}

// Regions, in the order the journey visits them. cx/cy are tile coordinates of
// the region's heart; lair is where its Titan sleeps.
const REGIONS = [
  { id: "meadow",  name: "Greenhollow Meadow", cx: 128, cy: 204, lvl: [1, 6],   pack: [1, 3],  tiers: [70, 28, 2, 0, 0],
    types: ["grass", "bug", "normal", "air"], lair: [150, 176], titan: "thornstag", titanName: "Old Bramblecrown", titanLvl: 9 },
  { id: "mere",    name: "Mirrormere Wetlands", cx: 58, cy: 168, lvl: [6, 13],  pack: [2, 5],  tiers: [45, 42, 12, 1, 0],
    types: ["water", "poison", "light"], lair: [34, 150], titan: "mireguard", titanName: "The Mere Mother", titanLvl: 16 },
  { id: "dust",    name: "Dustreach Barrens",  cx: 202, cy: 150, lvl: [12, 20], pack: [3, 6],  tiers: [25, 45, 25, 5, 0],
    types: ["ground", "rock", "electric"], lair: [228, 128], titan: "mysticave", titanName: "Dune Colossus", titanLvl: 24 },
  { id: "frost",   name: "Frostspine Reach",   cx: 66, cy: 82,   lvl: [19, 28], pack: [4, 8],  tiers: [12, 40, 33, 13, 2],
    types: ["ice", "steel", "psychic"], lair: [40, 62], titan: "crystallon", titanName: "Glacier Heart", titanLvl: 32, gate: 2 },
  { id: "cinder",  name: "Cinder Caldera",     cx: 192, cy: 72,  lvl: [27, 38], pack: [5, 10], tiers: [5, 30, 38, 22, 5],
    types: ["fire", "dragon"], lair: [216, 48], titan: "solvern", titanName: "Solvern the Sunspear", titanLvl: 42, gate: 3 },
  { id: "rift",    name: "The Umbral Rift",    cx: 128, cy: 30,  lvl: [36, 50], pack: [6, 12], tiers: [0, 18, 38, 30, 14],
    types: ["shadow", "psychic", "dragon"], lair: [128, 14], titan: "voidwraith", titanName: "The Hollow Sovereign", titanLvl: 54, gate: 4 },
];
const CAMP = { tx: 128, ty: 214 };

const SPECIES_BY_ID = {};
for (const s of SPECIES) SPECIES_BY_ID[s.id] = s;

// flying / swimming beasts may cross water
function canCrossWater(sp) {
  return sp.types.indexOf("air") >= 0 || sp.types.indexOf("water") >= 0 || sp.types.indexOf("dragon") >= 0;
}
function isFlyer(sp) { return sp.types.indexOf("air") >= 0; }
