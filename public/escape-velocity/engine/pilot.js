// Pilot state: everything the original saved in the pilot file (research deep-economy-save §10-11),
// as plain JSON so it can go to localStorage now and to a server later.

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dates as the original prints them. FUN_10065578 (title box, mission computer): "Oct. 15th, 2276".
// FUN_10065854 (player info, <DL>, arrival message): full month names, except that it too prints
// "Sept." for September. Day suffix: st/nd/rd by the last digit, but 11-13 take "th".
const SHORT_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'Sept.', 'October', 'November', 'December'];
const ordinal = d => d + (d > 10 && d < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th');
export const shortDate = d => `${SHORT_MONTHS[d.m - 1]} ${ordinal(d.d)}, ${d.y}`;
export const longDate = d => `${LONG_MONTHS[d.m - 1]} ${ordinal(d.d)}, ${d.y}`;

// Default names offered by the New Pilot and ship-naming dialogs: STR# 128 in the application,
// strings 1-3 pilot names and 4-6 ship names (one picked at random).
export const DEFAULT_PILOT_NAMES = ['Rick Hardslab', 'Dash Riprock', 'Stud Beefpile'];
export const DEFAULT_SHIP_NAMES = ['Starseeker', 'Adventurer', 'Journeyman'];

export function newPilot(data, name, now = new Date(), { shipName = DEFAULT_SHIP_NAMES[0], strict = false } = {}) {
  const start = 128;                                         // Levo, the first syst resource
  const nav = data.syst[start];
  const spob = [nav.Nav1, nav.Nav2, nav.Nav3, nav.Nav4].find(x => x >= 128 && data.spob[x]) ?? -1;
  const T = data.ship[128];
  const p = {
    version: 1, game: data.game, name: String(name || 'Pilot').slice(0, 31),
    credits: 10000, shipType: 128, outfits: {}, weapons: {}, cargo: [0, 0, 0, 0, 0, 0], junk: {},
    fuel: T.Fuel, system: start, spob, kills: 0,
    date: { y: now.getFullYear() + data.yearOffset, m: now.getMonth() + 1, d: now.getDate() },
    legal: {}, explored: { [start]: 2 }, bits: [], persDead: {}, dominated: {}, missions: [],
    escorts: [], strict: !!strict, shipName: String(shipName || DEFAULT_SHIP_NAMES[0]).slice(0, 31),
    fresh: true,          // never entered space yet: starts at (50,50) with the tutorial (FUN_1004ef64)
  };
  for (const s of data.systList) if (s && s.Govt >= 128) p.legal[s.id] = data.govt[s.Govt]?.InitialRec ?? 0;
  // ev_newgame_init_player (0x1005c468..c514): every link of the start system starts at explored level 1,
  // so the map names the neighbours (checked in the original: orig-56). Then FUN_1006494c marks nebulae.
  // Only links in play (EVO 0x10053ab0); a new pilot has no bits set.
  for (const l of systLinks(nav)) if (data.syst[l] && data.visBitOn(p.bits, data.syst[l].VisBit)) p.explored[l] = Math.max(1, p.explored[l] ?? 0);
  markNebulae(data, p, start);
  for (let i = 0; i < 4; i++) {
    const id = T.WeapType[i];
    if (id >= 128 && T.WeapCount[i] > 0) p.weapons[id] = { count: T.WeapCount[i], ammo: Math.max(0, T.AmmoLoad[i]) };
  }
  return p;
}

// Thin behaviour wrapper the engine uses; the JSON stays the source of truth.
export class Pilot {
  constructor(json) { Object.assign(this, json); }
  legalIn(sys) { return this.legal[sys] ?? 0; }
  persAlive(id) { return !this.persDead[id]; }
  dateString() { return longDate(this.date); }
  shortDate() { return shortDate(this.date); }
  advanceDay() {
    const d = this.date, len = d.m === 2 && d.y % 4 === 0 ? 29 : MONTH_DAYS[d.m - 1];
    if (++d.d > len) { d.d = 1; if (++d.m > 12) { d.m = 1; d.y++; } }
  }
  toJSON() { return { ...this }; }
}

// Status labels (STR# 134, 0x10065ea8) and combat rating (STR# 138, 0x100661ec).
export function legalLabel(data, pilot, sys) {
  const S = data.syst[sys], G = data.govtOf(S.Govt) ?? data.govtList[0];
  if (G.Flags & 1) return data.str(134, 0);
  const L = pilot.legalIn(sys), C = G.CrimeTol;
  let i = 1;
  if (L < 0) { i = 2; for (const [k, m] of [[3, 1], [4, 4], [5, 16], [6, 64], [7, 256], [8, 1024], [9, 4096]]) if (L < -m * C) i = k; }
  else if (L > 0) { i = 10; for (const [k, m] of [[11, 4], [12, 16], [13, 64], [14, 256], [15, 1024]]) if (L > m * C) i = k; }
  return data.str(134, i);
}
export function combatRating(data, kills) {
  let i = 0;
  if (kills > 0) i = 1;
  for (const [k, n] of [[2, 100], [3, 200], [4, 400], [5, 800], [6, 1600], [7, 3200], [8, 6400], [9, 12800], [10, 25600]]) if (kills >= n) i = k;
  return data.str(138, i);
}

// The links of a syst record (up to 16, -1 / missing = none).
function systLinks(S) { return Object.keys(S).filter(k => /^con\d+$/i.test(k)).map(k => S[k]).filter(x => x >= 128); }

// FUN_1006494c: a nebula (only the first four count) becomes visible on the map once the pilot is in
// a system that lies inside it, its rect inset by 8 (PtInRect). Called on a new pilot, on arrival, on
// landing and for every system a map outfit explores.
// Open Pilot (FUN_1004c8d8 item 2, 0x1004cac8..cb20): the seen flags aren't in the pilot file
// (ev_newgame_init_player clears all four, 0x1005c518), so after the load every system that is in
// play (+0x6a, from the visibility pass FUN_10031934 just before) and explored (+0x40 > 0) marks its
// nebulae again, in system order.
export function rebuildNebulae(data, pilot) {
  pilot.nebulae = {};
  for (const S of data.systList) {
    if (S && data.visBitOn(pilot.bits ?? [], S.VisBit, false) && (pilot.explored?.[S.id] ?? 0) > 0) markNebulae(data, pilot, S.id);
  }
}

export function markNebulae(data, pilot, sys) {
  const S = data.syst[sys]; if (!S) return;
  pilot.nebulae ??= {};
  for (const n of Object.values(data.nebu ?? {}).filter(n => n.index < 4)) {
    if (pilot.nebulae[n.index] || n.XSize <= 0 || n.YSize <= 0) continue;
    const L = n.XPos + 8, T = n.YPos + 8, R = n.XPos + n.XSize - 8, B = n.YPos + n.YSize - 8;
    if (S.xPos >= L && S.xPos < R && S.yPos >= T && S.yPos < B) pilot.nebulae[n.index] = true;
  }
}
