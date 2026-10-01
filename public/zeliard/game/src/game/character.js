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
export function getByte(c, byte) {
  const b = typeof byte === 'string' ? byte.toLowerCase() : `0x${byte.toString(16).padStart(2, '0')}`;
  return c.bits[b] || 0;
}
