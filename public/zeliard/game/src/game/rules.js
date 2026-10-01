// Turns the extracted rule files (data/rules/*.json) into the RULES tables the game
// uses, for the chosen difficulty. "english" = the Sierra DOS balance (default);
// "japanese" = the 1987 Japanese versions' balance from japanese_balance.json.
import { RULES } from './character.js';
import { SPELLS, SPELL_ORDER } from './spells.js';

const TOWN_KEYS = ['muralla', 'satono', 'bosque', 'helada', 'tumba', 'dorado', 'llama', 'pureza', 'esco'];

export function applyRules(data, difficulty = 'english') {
  const r = data.rules || {};
  const jp = difficulty === 'japanese';
  RULES.difficulty = jp ? 'japanese' : 'english';
  const J = r.japanese || {};

  // Levels: max HP and XP to the next level, by level (0-based).
  const table = r.progression?.levels?.table || [];
  RULES.hpByLevel = table.filter((l) => typeof l.level === 'number').map((l) => l.max_hp);
  RULES.xpForLevel = table.filter((l) => typeof l.level === 'number').map((l) => l.xp_to_next);
  if (!RULES.hpByLevel.length) {
    RULES.hpByLevel = [80, 120, 160, 200, 240, 280, 320, 380, 460, 540, 600, 640, 680, 720, 760, 780, 800];
    RULES.xpForLevel = [50, 150, 300, 420, 1000, 1500, 3000, 5000, 6000, 8000, 10000, 15000, 20000, 40000, 50000, 60000, 60000];
  }
  RULES.sageCaps = { muralla: 3, satono: 6, bosque: 9, helada: 11, tumba: 13, dorado: 15, llama: 18, pureza: 255 };
  for (const s of r.progression?.sage?.names_by_town || []) RULES.sageCaps[s.town.toLowerCase()] = s.max_level_grantable;
  RULES.sages = r.progression?.sage?.names_by_town || [];
  RULES.sageTexts = r.progression?.sage || {};

  // Spell charges per level (row = level before the level-up), then +2 each from 16.
  const ch = r.spells?.mechanics?.charges || r.spells?.charges;
  RULES.chargesByLevel = ch?.per_level_max || { 0: [12, 6, 8, 4, 3, 4, 3] };
  RULES.startCharges = ch?.starting || { espada: 12, saeta: 6, fuego: 8, lanzar: 4, rascar: 3, agua: 4, guerra: 3 };
  for (const s of r.spells?.spells || []) if (SPELLS[s.id]) { SPELLS[s.id].dmg = s.damage; SPELLS[s.id].name = s.name; SPELLS[s.id].desc = s.sage_description; }

  // Equipment.
  RULES.swords = {}; RULES.shields = {}; RULES.items = {};
  for (const s of r.items?.swords?.list || []) {
    RULES.swords[s.key] = { id: s.key, num: s.id, name: s.name, damage: s.base_damage, prices: { ...s.prices }, soldIn: s.sold_in || [], block: s.id >= 4 ? 1 : 0, reach: s.id >= 4 ? 1 : 0 };
  }
  for (const s of r.items?.shields?.list || []) {
    RULES.shields[s.key] = { id: s.key, num: s.id, tier: s.id, name: s.name, power: s.capacity, prices: { ...s.prices }, soldIn: s.sold_in || [] };
  }
  const holy = [80, 90, 100, 110, 115, 120];
  for (const s of r.items?.consumables?.list || []) RULES.items[s.key] = { id: s.key, num: s.id, type: 'consumable', name: s.name, effect: s.effect, prices: { ...s.prices }, soldIn: s.sold_in || [] };
  for (const s of r.items?.accessories?.list || []) RULES.items[s.key] = { id: s.key, num: s.id, type: 'accessory', name: s.name, effect: s.effect };
  for (const s of r.items?.crests_and_keys || []) RULES.items[s.key] = { id: s.key, type: s.key.includes('key') ? 'key' : s.key.includes('tear') ? 'tear' : 'crest', name: s.name };
  for (const [id, s] of Object.entries(RULES.swords)) RULES.items[id] = { type: 'sword', ...s };
  for (const [id, s] of Object.entries(RULES.shields)) RULES.items[id] = { type: 'shield', ...s };
  RULES.holyWater = holy;

  // Exchange rates (gold per alma) and other economy numbers.
  const econ = J.economy || {};
  RULES.exchange = jp ? econ.exchange_rates_gold_per_alma?.japanese : (econ.exchange_rates_gold_per_alma?.dos || r.progression?.currency?.exchange_almas_to_gold);
  RULES.exchange ||= { muralla: 6, satono: 6, bosque: 8, helada: 4, tumba: 2, dorado: 4, llama: 0.5, pureza: 6, esco: 8 };
  RULES.capePrice = jp ? 5000 : 2500;

  // Difficulty switches used by the game rules.
  RULES.jp = jp ? {
    noRegen: true, // no HP regeneration in caverns
    levelUpNoHeal: true, // level-up raises max HP and spell caps, but doesn't refill
    resetXpOnLevel: true, // surplus XP is discarded
    noLevelSwordBonus: true, // sword damage = sword base only
    flatShieldHalf: true, // frontal hit with a shield: 50% to HP and shield
    deathLoseAllAlmas: true, deathHalfXp: true, respawnAtLastSage: true,
    heat: { dmg: 10, every: 64, global: true },
    holyWaterFull: true, magiaFixed: 17, redOrb: 50,
    bossNoAlmas: true,
  } : null;
  RULES.heat = jp ? RULES.jp.heat : { dmg: 15, every: 64, global: false };
  RULES.hazardByLevel = data.physics?.hero?.hazardDamageByLevel?.value || [1, 1, 4, 8, 20, 20, 20, 20, 20];

  // Japanese price overrides (Kioku Feather and a few shop rows). Every prices table above
  // is a fresh copy, so these never leak into a later English game in the same session.
  if (jp) {
    const o = econ.shop_prices_other?.overrides_to_apply || {};
    const kio = RULES.items.kioku_feather;
    if (kio && o.kioku_feather) for (const t of TOWN_KEYS) kio.prices[t] = t === 'esco' ? o.kioku_feather.esco : o.kioku_feather.all_towns_except_esco;
    for (const [k, v] of Object.entries(o)) {
      const m = /^(\w+)\.(\w+)$/.exec(k);
      if (!m) continue;
      const it = RULES.items[m[2]] || RULES.swords[m[2]] || RULES.shields[m[2]];
      if (it?.prices) it.prices[m[1]] = v;
    }
  }
  // Boss tweaks for the Japanese balance.
  RULES.bossMul = {};
  for (const m of J.bosses?.multipliers || []) RULES.bossMul[m.boss] = jp ? m.japanese : m.dos;
  RULES.bossAlmas = { ...(J.bosses?.almas?.dos || {}) }; // a copy: the JP balance zeroes it
  if (jp) for (const k of Object.keys(RULES.bossAlmas)) RULES.bossAlmas[k] = 0;
  setupText(data, jp);
  return RULES;
}

// The Japanese balance also uses the Japanese edition's wording: item names and the
// story/dialogue lines translated from the 1987 text (data/text/ja_en.json) replace the
// Sierra lines they correspond to. English mode leaves the Sierra text untouched.
const NAME_CATS = new Set(['weapon', 'shield', 'spell', 'accessory', 'item', 'crest', 'key', 'ui']);
const LINE_CATS = new Set(['narration', 'dialogue']);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function setupText(data, jp) {
  const entries = Array.isArray(data.text) ? data.text : [];
  const names = [];
  const lines = [];
  for (const e of entries) {
    if (!e.dos_en || !e.en || e.dos_en === e.en) continue;
    if (NAME_CATS.has(e.category)) for (const alt of e.dos_en.split(/\s*\/\s*/)) names.push([alt, e.en]);
    else if (LINE_CATS.has(e.category)) {
      // Sierra lines are quoted with "..." where they were cut; match on the first part.
      const parts = e.dos_en.split(/\.\.\.|…/);
      while (parts.length > 1 && !parts[0].trim()) parts.shift(); // "...and seal him" continues a line
      const head = norm(parts[0]);
      // "First line... rest" means the Japanese line stands for several Sierra lines.
      const spans = parts.slice(1).some((s) => /[a-z]/i.test(s));
      if (head.length >= 12) lines.push([head, e.en, spans]);
    }
  }
  names.sort((a, b) => b[0].length - a[0].length);
  const byName = new Map(names.map(([a, b]) => [a.toLowerCase(), b]));
  // Story text: { text, head, spans } for the Japanese line whose Sierra source starts
  // `t` (callers pass the rest of a page joined, since Sierra splits sentences over lines).
  RULES.localizeLine = !jp ? () => null : (t) => {
    const n = norm(t || '');
    for (const [head, en, spans] of lines) if (n.startsWith(head)) return { text: en, head, spans };
    return null;
  };
  RULES.normText = norm;
  RULES.localize = !jp ? (t) => t : (t) => {
    if (typeof t !== 'string' || !t) return t;
    const n = norm(t);
    for (const [head, en] of lines) if (n.startsWith(head)) return en;
    let out = t;
    // Only multi-word names: single words like "Fire" or "Water" are too common in text.
    for (const [a, b] of names) if (a.includes(' ') && out.includes(a)) out = out.split(a).join(b);
    return out;
  };
  if (!jp) return;
  const rename = (o) => { if (o?.name && byName.has(o.name.toLowerCase())) o.name = byName.get(o.name.toLowerCase()); };
  for (const t of [RULES.swords, RULES.shields, RULES.items]) for (const o of Object.values(t)) rename(o);
  for (const s of Object.values(SPELLS)) rename(s);
}

export { TOWN_KEYS, SPELL_ORDER };
