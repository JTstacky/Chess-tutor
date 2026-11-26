// Race traits (owner, 2026-11-26): every race has exactly two strengths and two weaknesses, picked from this list.
// A race's `mods` (what the rules read) are built only from its four traits, and the card text is written from the
// same numbers, so what a race card says is exactly what the game does.
//
// In races.js a race lists   traits: { plus: ['castle', 'chiefHit'], minus: ['troopCost', 'reload'] }
// and may give its own size for any of them:   traitSize: { castle: 0.25 }   (the balance lever).
// Sizes are positive numbers; whether a trait helps or hurts comes from the list it is in.
//
// Each trait: label for a strength and a weakness, the default size, a line of text from the size, and what it does
// to the mods. `only: 'plus'` traits are race powers that have no weakness form; `only: 'minus'` the reverse.
// Nothing hidden (owner, 2026-11-26): a race whose troops cost more or less across the board says so here
// (Elite troops, Rabble, Cheap or Costly troops). Troop prices otherwise come from their stats alone.

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${Math.round(v * 10) / 10} s`;

export const TRAITS = {
  // ---- the castle and the flingshot
  castle: { group: 'Castle', size: 0.2, plus: 'Stronger castle', minus: 'Weaker castle',
    text: (v, up) => `Castle has ${pct(v)} ${up ? 'more' : 'less'} health`,
    apply: (m, v, up) => { m.castleHp = 1 + (up ? v : -v); } },
  fling: { group: 'Flingshot', size: 0.15, plus: 'Stronger flingshot', minus: 'Weaker flingshot',
    text: (v, up) => `Flingshot shots hit ${pct(v)} ${up ? 'harder' : 'softer'}`,
    apply: (m, v, up) => { m.shotDmg = 1 + (up ? v : -v); } },
  reload: { group: 'Flingshot', size: 0.15, plus: 'Quick reload', minus: 'Slow reload',
    text: (v, up) => `Flingshot reloads ${pct(v)} ${up ? 'faster' : 'slower'}`,
    apply: (m, v, up) => { m.reload = up ? 1 - v : 1 + v; } },
  ammo: { group: 'Flingshot', size: 0.25, plus: 'Cheap ammo', minus: 'Costly ammo',
    text: (v, up) => `Special shots cost ${pct(v)} ${up ? 'less' : 'more'}`,
    apply: (m, v, up) => { m.ammoMul = up ? 1 - v : 1 + v; } },
  // ---- the chief
  chiefHp: { group: 'Chief', size: 0.25, plus: 'Tough chief', minus: 'Frail chief',
    text: (v, up) => `Chief has ${pct(v)} ${up ? 'more' : 'less'} health`,
    apply: (m, v, up) => { m.kingHp = 1 + (up ? v : -v); } },
  chiefHit: { group: 'Chief', size: 0.3, plus: 'Fierce chief', minus: 'Gentle chief',
    text: (v, up) => `Chief hits troops ${pct(v)} ${up ? 'harder' : 'softer'}`,
    apply: (m, v, up) => { m.kingDmg = 1 + (up ? v : -v); } },
  chiefRise: { group: 'Chief', size: 3, plus: 'Quick to rise', minus: 'Slow to rise',
    text: (v, up) => `Knocked-out chief is up ${secs(v)} ${up ? 'sooner' : 'later'}`,
    apply: (m, v, up) => { m.koDown = up ? -v : v; } },
  regen: { group: 'Chief', size: 2, only: 'plus', plus: 'Chief heals',
    text: (v) => `Chief heals ${v} health a second while standing`,
    apply: (m, v) => { m.kingRegen = v; } },
  // ---- troops
  troopCost: { group: 'Troops', size: 0.12, plus: 'Cheap troops', minus: 'Costly troops',
    text: (v, up) => `Troops cost ${pct(v)} ${up ? 'less' : 'more'}`,
    apply: (m, v, up) => { m.unitCost = (m.unitCost || 1) * (1 + (up ? -v : v)); } },
  troopHp: { group: 'Troops', size: 0.15, plus: 'Hardy troops', minus: 'Fragile troops',
    text: (v, up) => `Troops have ${pct(v)} ${up ? 'more' : 'less'} health`,
    apply: (m, v, up) => { m.unitHp = (m.unitHp || 1) * (1 + (up ? v : -v)); } },
  troopSpeed: { group: 'Troops', size: 0.15, plus: 'Swift troops', minus: 'Slow troops',
    text: (v, up) => `Troops move ${pct(v)} ${up ? 'faster' : 'slower'}`,
    apply: (m, v, up) => { m.unitSpeed = 1 + (up ? v : -v); } },
  elite: { group: 'Troops', size: 0.3, only: 'plus', plus: 'Elite troops',
    text: (v) => `Troops cost ${pct(v)} more, but have ${pct(v * 0.8)} more health and hit ${pct(v * 0.8)} harder`,
    apply: (m, v) => { m.unitCost = (m.unitCost || 1) * (1 + v); m.unitHp = (m.unitHp || 1) * (1 + v * 0.8); m.unitDmg = (m.unitDmg || 1) * (1 + v * 0.8); } },
  rabble: { group: 'Troops', size: 0.3, only: 'minus', minus: 'Rabble',
    text: (v) => `Troops cost ${pct(v)} less, but have ${pct(v * 0.9)} less health and hit ${pct(v * 0.9)} softer`,
    apply: (m, v) => { m.unitCost = (m.unitCost || 1) * (1 - v); m.unitHp = (m.unitHp || 1) * (1 - v * 0.9); m.unitDmg = (m.unitDmg || 1) * (1 - v * 0.9); } },
  armour: { group: 'Troops', size: 1, only: 'plus', plus: 'Armoured troops',
    text: (v) => `Troops block ${v} damage from every hit`,
    apply: (m, v) => { m.unitArmor = v; } },
  raise: { group: 'Troops', size: 0.45, only: 'plus', plus: 'Raise the dead',
    text: (v) => `Enemy troops you kill may rise as your Skeletons (${pct(v)})`,
    apply: (m, v) => { m.raise = v; } },
  // ---- gold and building
  gold: { group: 'Gold', size: 0.15, plus: 'Rich', minus: 'Poor',
    text: (v, up) => `Gold comes in ${pct(v)} ${up ? 'faster' : 'slower'}`,
    apply: (m, v, up) => { m.income = 1 + (up ? v : -v); } },
  plunder: { group: 'Gold', size: 3, only: 'plus', plus: 'Plunder',
    text: (v) => `+${v} gold a kill; bonus crates give 50% more`,
    apply: (m, v) => { m.plunder = v; m.bonusGold = 1.5; } },
  build: { group: 'Buildings', size: 0.25, plus: 'Cheap building', minus: 'Costly building',
    text: (v, up) => `Walls, towers and mines cost ${pct(v)} ${up ? 'less' : 'more'}`,
    apply: (m, v, up) => { m.buildMul = up ? 1 - v : 1 + v; } },
  sturdy: { group: 'Buildings', size: 0.25, plus: 'Sturdy buildings', minus: 'Flimsy buildings',
    text: (v, up) => `Walls and towers have ${pct(v)} ${up ? 'more' : 'less'} health`,
    apply: (m, v, up) => { m.wallHp = m.towerHp = 1 + (up ? v : -v); } },
  towers: { group: 'Buildings', size: 0.4, plus: 'Deadly towers', minus: 'Weak towers',
    text: (v, up) => `Towers hit ${pct(v)} ${up ? 'harder' : 'softer'}`,
    apply: (m, v, up) => { m.towerDmg = 1 + (up ? v : -v); } },
  shields: { group: 'Shields', size: 0.3, plus: 'Strong shields', minus: 'Weak shields',
    text: (v, up) => up ? `Shields cost ${pct(v)} less, last ${pct(v)} longer` : `Shields cost ${pct(v)} more, fade ${pct(v)} sooner`,
    apply: (m, v, up) => { m.shieldMul = up ? 1 - v : 1 + v; m.shieldLifeMul = up ? 1 + v : 1 - v; } },
  burn: { group: 'Flingshot', size: 0.4, only: 'plus', plus: 'Wildfire',
    text: (v) => `Firepots cost ${pct(v / 2)} less and burn ${pct(v)} longer`,
    apply: (m, v) => { m.burnTime = 1 + v; m.fireMul = 1 - v / 2; } },
};

/** The rules' modifiers for a race, from its traits only. */
export function traitMods(r) {
  const m = {}, t = r.traits || { plus: [], minus: [] };
  for (const [list, up] of [[t.plus, true], [t.minus, false]]) for (const k of list) {
    const T = TRAITS[k];
    if (!T) throw Error(`unknown trait ${k}`);
    if (!up && T.only === 'plus') throw Error(`${k} cannot be a weakness`);
    if (up && T.only === 'minus') throw Error(`${k} cannot be a strength`);
    T.apply(m, r.traitSize?.[k] ?? T.size, up);
  }
  return m;
}
/** Card lines: [{ key, label, text }] strengths and weaknesses. */
export function traitLines(r) {
  const t = r.traits || { plus: [], minus: [] }, line = (k, up) => { const T = TRAITS[k], v = r.traitSize?.[k] ?? T.size; return { key: k, group: T.group, label: up ? T.plus : T.minus, text: T.text(v, up) }; };
  return { plus: t.plus.map((k) => line(k, true)), minus: t.minus.map((k) => line(k, false)) };
}
