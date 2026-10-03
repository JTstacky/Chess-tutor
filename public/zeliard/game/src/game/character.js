// A knight's persistent state (what gets saved) and the stats derived from it.
// Numbers come from data/rules/*.json via rules.js (DOS English balance by default,
// with the Japanese-version overrides applied when that difficulty is chosen).
export const RULES = {
  difficulty: 'english',
  hpByLevel: [80], xpForLevel: [50],
  swords: {}, shields: {}, items: {}, exchange: {}, chargesByLevel: {}, startCharges: {},
  sageCaps: {}, jp: null, heat: { dmg: 15, every: 64 }, hazardByLevel: [1, 1, 4, 8, 20, 20, 20, 20, 20],
};

const SPELL_IDS = ['espada', 'saeta', 'fuego', 'lanzar', 'rascar', 'agua', 'guerra'];

export function newCharacter(name = 'Duke', difficulty = 'english') {
  const charges = { ...(RULES.startCharges || {}) };
  return {
    v: 2,
    name,
    difficulty,
    level: 0,
    xp: 0,
    hp: RULES.hpByLevel[0] || 80,
    gold: 0,
    almas: 0,
    bank: 0,
    sword: 'training_sword',
    shield: null,
    shieldHp: 0,
    spellsLearned: [],
    charges, // current charges per spell
    maxCharges: { ...charges },
    spell: null, // selected spell id
    items: [], // up to 5 consumable slots (item ids; repeats allowed)
    accessories: [], // shoes/cape collected, in order
    worn: null, // the one accessory worn
    crests: [], // elf_crest, crest_of_glory, heros_crest
    keys: 0,
    lionKeys: 0,
    tears: 0,
    bits: {}, // original save bytes: { '0x02': 0x80 | ... } (chests, doors, bosses, story)
    sagesMet: [],
    lastSage: 'mrmp',
    sabreOil: 0,
    location: { map: 'cmap', x: null },
    playTime: 0,
    deaths: 0,
  };
}

// Older saves (v1) carried different fields; bring them up to date.
export function migrate(c) {
  if (!c) return c;
  if (c.v === 2) return c;
  const n = newCharacter(c.name, c.difficulty);
  for (const k of ['level', 'xp', 'hp', 'gold', 'almas', 'bank', 'playTime', 'deaths']) if (c[k] != null) n[k] = c[k];
  return n;
}

// Developer testing knight (matched by name hash): hits land but leave 1 HP, the purse stays
// full, cavern maps are fully drawn and the pause menu can jump to any map.
export const TESTER_GOLD = 9999999;
const nameHash = (s) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
export const isTester = (c) => typeof c?.name === 'string' && nameHash(c.name) === 0xd1556516;

export function maxHp(c) {
  const t = RULES.hpByLevel;
  return t[Math.min(c.level, t.length - 1)] || 80;
}
export function xpNeeded(c) {
  const t = RULES.xpForLevel;
  return t[Math.min(c.level, t.length - 1)] || 60000;
}
export function shieldPower(id) { return RULES.shields[id]?.power ?? 0; }
export function shieldTier(c) { return c.shield ? RULES.shields[c.shield]?.tier || 1 : 0; }

// Get_Stats source 1: min(255, base + floor(level/2)) × (sabre oil + 1), doubled on the
// downward thrust. The Japanese versions have no level bonus.
export function swordDamage(c, thrust = false) {
  const base = RULES.swords[c.sword]?.damage ?? 1;
  let d = Math.min(255, base + (RULES.jp?.noLevelSwordBonus ? 0 : Math.floor(c.level / 2)));
  d = Math.min(255, d * ((c.sabreOil || 0) + 1));
  if (thrust) d = Math.min(255, d * 2);
  return d;
}

// Movement and immunity effects of the worn accessory, plus sword reach.
export function derived(c) {
  const w = c.worn;
  return {
    reach: RULES.swords[c.sword]?.reach || 0,
    jumpRows: w === 'feruza_shoes' ? 4.25 : 2.25,
    hazardProof: w === 'pirika_shoes',
    slopeGrip: w === 'silkarn_shoes',
    iceGrip: w === 'ruzeria_shoes',
    heatProof: w === 'asbestos_cape',
  };
}

// Experience (16-bit, saturating). The original won't let you bank a second level:
// XP is capped at need(level) + need(level+1) - 1.
export function addXp(c, amount) {
  c.xp = Math.min(65535, c.xp + amount);
  const need = xpNeeded(c);
  const next = RULES.xpForLevel[Math.min(c.level + 1, RULES.xpForLevel.length - 1)] || need;
  if (c.xp >= need + next) c.xp = need + next - 1;
}

// The Sage's reading of your progress (tier 0..3; 3 = ready to rise).
export function sageTier(c) {
  const need = xpNeeded(c);
  if (c.xp >= need) return 3;
  if (c.xp >= need - (need >> 2)) return 2;
  if (c.xp >= need >> 1) return 1;
  return 0;
}

export function chargesFor(level) {
  const t = RULES.chargesByLevel || {};
  if (level <= 16 && t[level]) return t[level];
  const top = t[16] || t[0] || [12, 6, 8, 4, 3, 4, 3];
  return top.map((v) => Math.min(255, v + 2 * Math.max(0, level - 16)));
}

// Raise one level (a Sage does this). Returns false if not enough XP.
export function levelUp(c) {
  const need = xpNeeded(c);
  if (c.xp < need) return false;
  const row = chargesFor(c.level);
  c.level = Math.min(255, c.level + 1);
  SPELL_IDS.forEach((id, i) => { c.maxCharges[id] = row[i]; });
  if (RULES.jp?.resetXpOnLevel) c.xp = 0;
  else {
    c.xp -= need;
    const next = xpNeeded(c);
    if (c.xp >= next) c.xp = next - 1;
  }
  if (!RULES.jp?.levelUpNoHeal) {
    c.hp = maxHp(c);
    for (const id of SPELL_IDS) c.charges[id] = c.maxCharges[id];
  }
  return true;
}

export function refillSpells(c) { for (const id of SPELL_IDS) c.charges[id] = c.maxCharges[id] ?? c.charges[id]; }

export function setBit(c, byte, mask) {
  const b = typeof byte === 'string' ? byte.toLowerCase() : `0x${byte.toString(16).padStart(2, '0')}`;
  c.bits[b] = (c.bits[b] || 0) | (typeof mask === 'string' ? parseInt(mask, 16) : mask);
}
export function hasBit(c, byte, mask) {
  const b = typeof byte === 'string' ? byte.toLowerCase() : `0x${byte.toString(16).padStart(2, '0')}`;
  const m = typeof mask === 'string' ? parseInt(mask, 16) : mask;
  return ((c.bits[b] || 0) & m) === m && m !== 0;
}
// What an item does for this knight, in plain words with the numbers as they
// stand now (the rules file's notes carry the formulas; players never see those).
export function itemDesc(id, c) {
  const n = (v) => (v == null ? '?' : v);
  switch (id) {
    case 'feruza_shoes': return 'Jump twice as high.';
    case 'pirika_shoes': return 'Thorns, Gelroid and fire floors no longer hurt you.';
    case 'silkarn_shoes': return 'No more sliding down slopes.';
    case 'ruzeria_shoes': return 'No more slipping on ice.';
    case 'asbestos_cape': return `Keeps out the heat of the burning caverns (${n(RULES.heat?.dmg)} damage a pulse without it).`;
    case 'kenko_potion': return `Heals ${RULES.jp?.kenkoHeal ?? 80} HP.`;
    case 'juuen_fruit': return 'Restores all your HP.';
    case 'elixir_of_kashi': { const sp = c?.spell; return sp ? `Refills ${SPELL_NAME(sp)} to ${n(c.maxCharges?.[sp])} charges.` : 'Refills the charges of your chosen spell.'; }
    case 'chikara_powder': return 'Refills the charges of every spell you know.';
    case 'magia_stone': return `Four spirits circle you for a while, each hitting for ${RULES.jp?.magiaFixed || Math.min(255, ((c?.level ?? 1) + 1) * 4)}. Caverns only.`;
    case 'holy_water_of_acero': { const t = c ? shieldTier(c) : 0; const add = t ? RULES.holyWater?.[t - 1] : null; return t ? `Mends your shield by ${RULES.jp?.holyWaterFull ? 'all of its strength' : n(add)}.` : 'Mends your shield, more for a stronger shield.'; }
    case 'sabre_oil': return `Doubles your sword's bite (${c?.sword ? `${swordDamage(c)} now` : 'per use'}) until you next enter a town. Stacks.`;
    case 'kioku_feather': return 'Carries you back to town at once, with no toll. Caverns only.';
    default: return RULES.items[id]?.desc || '';
  }
}
// Spell names live in spells.js, which imports this file; look them up lazily.
const SPELL_NAME = (id) => globalThis.__SPELLS?.[id]?.name || id;

export function getByte(c, byte) {
  const b = typeof byte === 'string' ? byte.toLowerCase() : `0x${byte.toString(16).padStart(2, '0')}`;
  return c.bits[b] || 0;
}
