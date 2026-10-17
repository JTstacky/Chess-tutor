// Mission engine (EV 1.0.5, research deep-missions). Mission slot state lives in pilot.missions
// (8 slots) so it saves with the pilot. Resource ids are kept; the original's 0-based indices
// appear only where a selector encodes one (v - 10000 etc.), converted with +128.
import { SPOB } from './data.js';
import { addPolar, wrap } from './trig.js';
import { rollDude, makeNpc, freeSlot, ARRIVAL_RADIUS } from './spawn.js';
import { computeStats, isDead, isDisabled } from './ships.js';
import { longDate } from './pilot.js';

export const MAX_MISSIONS = 8;
export const LIST_COMPUTER = 0, LIST_BAR = 1, LIST_FLIGHT = 2;
const NO_LIMIT = -32000;

const idx2govt = v => (v === 9999 || v < 0 ? -1 : v + 128);          // 0-based govt index in a selector -> id

// ev_mission_randomize_cargo_qty 0x10051dc0
export const randomizeQty = (rng, q) => (q >= -1 ? q : Math.abs(q) + rng.rand(Math.abs(q)));
// ev_cargo_free_space 0x100676a4 (escort freighters lend their holds, but not to mission cargo)
export function cargoFreeSpace(cap, capEsc, used, missionLoaded) {
  if (cap < capEsc) used = Math.max(0, used - missionLoaded - (capEsc - cap)) + missionLoaded;
  return cap - used;
}
// Goal test of 0x100573bc on plain numbers; returns { done, failed }.
export function goalState(s, alive, inShipSys) {
  let done = false, failed = false;
  if (s.goal === -1 || s.count < 1) done = true;
  else if (s.spawned < s.count) done = false;
  else switch (s.goal) {
    case 0: done = s.killed >= s.count; break;
    case 1: if (s.killed < 1) done = s.disabled >= s.count; else failed = true; break;
    case 2: case 5: done = s.boarded >= s.count; break;
    case 3: if (s.killed < 1 && s.disabled < 1) done = alive > 0; else failed = true; break;
    case 4: done = inShipSys && s.remaining <= s.spawned; break;
    case 6: done = s.killed + s.chased >= s.count; break;
  }
  return { done, failed };
}
// ev_oops_daily_tick 0x10021f68 for one event; st = { days, spob }.
// EV: with no MissionBit, the bit clear, or a positive Duration, the event rolls Freq each day; a
// set bit on a permanent event (Duration < 0) holds it at 2 days.
// Override (FUN_1006d70c, asm 0x1006d76c..d870) changes the gate: only an event with MissionBit -1
// rolls. Bit 0..511 set on a permanent event holds it at 2 days; MissionBit 3000+n does the same while
// bit n is clear; 1000..2999 do nothing here. Every other bit-gated event starts only when a mission
// sets its bit (applyBit, FUN_10051c90). The 1000/2000 range tests inside the roll branch are dead
// code (the branch needs MissionBit -1) and are left out.
export function oopsStep(rng, o, st, bits, firstSpob, evo = false) {
  if (st.days < 1) {
    const bit = o.MissionBit;
    const roll = evo ? bit === -1 : (bit === -1 || !bits[bit] || o.Duration >= 0);
    if (roll) {
      if (rng.rand(100) + 1 <= o.Freq) {
        if (o.Stellar < 128) { if (o.Stellar === -1 && firstSpob >= 0) { st.spob = firstSpob; st.days = o.Duration; } }
        else { st.spob = o.Stellar; st.days = o.Duration; }
      }
    } else if (!evo) st.days = 2;
    else if (o.Duration < 0 && ((bit >= 0 && bit < 1000 && bits[bit]) || (bit >= 3000 && !bits[bit - 3000]))) st.days = 2;
  } else st.days--;
  return st;
}

// ---------- per-game caches ----------
export function missionCache(game) {
  if (game._misn) return game._misn;
  const c = { qty: {}, rolls: {}, rollSpob: null };
  for (const m of Object.values(game.data.misn)) {
    c.qty[m.id] = randomizeQty(game.rng, m.CargoQty);
  }
  return (game._misn = c);
}
function ensureRolls(game) {
  const c = missionCache(game), here = game.landed ?? -2;
  if (c.rollSpob === here) return c.rolls;
  c.rollSpob = here;
  for (const m of Object.values(game.data.misn)) c.rolls[m.id] = game.rng.rand(100) + 1;
  return c.rolls;
}
export function invalidateOffers(game) { missionCache(game).rollSpob = null; }

// ---------- helpers ----------
const bitSet = (p, b) => !!p.bits[b];
const spobSys = (game, id) => game.data.spob[id]?.System ?? -1;
function adjacentOrSame(game, a, b) {
  if (a === b) return true;
  return game.data.links(a).includes(b) || game.data.links(b).includes(a);
}
// ev_spob_not_same_or_adjacent_system 0x10065d5c (EVO 0x1005e398): not the same system; then true when
// either system is out of play, else when neither links to the other.
const far = (game, cand, cur) => {
  const a = spobSys(game, cand), b = spobSys(game, cur);
  if (a === b) return false;
  if (!game.inPlay(a) || !game.inPlay(b)) return true;
  return !adjacentOrSame(game, a, b);
};
const inhabitedLandable = (game, p) => game.data.spobFlag(p, SPOB.LAND) && !game.data.spobFlag(p, SPOB.UNINHABITED);
function randomFrom(game, list) { return list.length ? list[game.rng.rand(list.length)] : null; }

// ev_mission_pick_stellar_selector 0x10051e40
// Candidates are in play and their system passes FUN_10051e9c (EVO 0x10048b80); never the current spob.
export function pickStellar(game, sel, cur) {
  const D = game.data, all = D.spobList.filter(p => p && p.id !== cur && game.spobInPlay(p.id) && game.visibleNow(p.System));
  if (sel === -1 || sel === -4) return cur;
  if (sel >= 128 && sel <= 1627) return D.spob[sel] ? sel : cur;
  let pool = [];
  if (sel === -2) pool = all.filter(p => inhabitedLandable(game, p) && !D.spobFlag(p, SPOB.STATION) && far(game, p.id, cur));
  else if (sel === -3) pool = all.filter(p => D.spobFlag(p, SPOB.UNINHABITED) && D.spobFlag(p, SPOB.LAND) && !D.spobFlag(p, SPOB.STATION) && far(game, p.id, cur));
  else if (sel >= 9999 && sel < 15000) {
    const g = idx2govt(sel - 10000);
    pool = all.filter(p => p.Govt === (g < 0 ? -1 : g) && (!D.spobFlag(p, SPOB.UNINHABITED) || (D.govtOf(g)?.Flags & 0x800)) && D.spobFlag(p, SPOB.LAND) && far(game, p.id, cur));
  } else if (sel >= 15000 && sel < 20000) {
    const g = sel - 15000 + 128;
    pool = all.filter(p => p.Govt >= 128 && p.Govt !== g && (D.govt[p.Govt].Ally === g || D.govt[g]?.Ally === p.Govt) && inhabitedLandable(game, p) && far(game, p.id, cur));
  } else if (sel >= 20000 && sel < 25000) {
    const g = sel - 20000 + 128;
    pool = all.filter(p => p.Govt !== g && inhabitedLandable(game, p) && far(game, p.id, cur));
  } else if (sel >= 25000 && sel < 30000) {
    const g = sel - 25000 + 128;
    pool = all.filter(p => p.Govt >= 128 && (D.govt[p.Govt].Enemy === g || D.govt[g]?.Enemy === p.Govt) && inhabitedLandable(game, p) && far(game, p.id, cur));
  }
  return randomFrom(game, pool)?.id ?? cur;
}

// ev_mission_pick_system_selector 0x10052d7c
// Candidates are in play and pass FUN_10051e9c (EVO 0x10049c5c), the -5 links included.
export function pickSystem(game, sel, curSys) {
  const D = game.data, all = D.systList.filter(s => s && game.visibleNow(s.id));
  if (sel >= 128 && sel <= 1127) return sel;
  let pool = [];
  if (sel === -2) pool = all;
  else if (sel === -5) pool = D.links(curSys).filter(id => game.visibleNow(id)).map(id => D.syst[id]);
  else if (sel >= 9999 && sel < 15000) { const g = idx2govt(sel - 10000); pool = all.filter(s => (s.Govt >= 128 ? s.Govt : -1) === g); }
  else if (sel >= 15000 && sel < 20000) { const g = sel - 15000 + 128; pool = all.filter(s => s.Govt >= 128 && (D.govt[s.Govt].Ally === g || D.govt[g]?.Ally === s.Govt)); }
  else if (sel >= 20000 && sel < 25000) { const g = sel - 20000 + 128; pool = all.filter(s => s.Govt !== g); }
  else if (sel >= 25000 && sel < 30000) { const g = sel - 25000 + 128; pool = all.filter(s => s.Govt >= 128 && (D.govt[s.Govt].Enemy === g || D.govt[g]?.Enemy === s.Govt)); }
  return randomFrom(game, pool)?.id ?? curSys;
}

// Spob the player is "at": the landed spob, or in flight the first nav default of the system.
function currentSpob(game) {
  if (game.landed) return game.landed;
  const S = game.data.syst[game.system];
  return [S.Nav1, S.Nav2, S.Nav3, S.Nav4].find(x => x >= 128) ?? -1;
}

export function freeCargo(game) {
  const cap = game.cargoCapacity(), capEsc = game.cargoCapacityWithEscorts?.() ?? cap;
  const ml = (game.pilot.missions ?? []).reduce((a, m) => a + (m?.active && m.loaded && m.cargoQty > 0 ? m.cargoQty : 0), 0);
  return cargoFreeSpace(cap, capEsc, game.cargoUsed(), ml);
}

// ---------- availability 0x100564ac ----------
export function available(game, m, list) {
  const p = game.pilot, inFlight = list === LIST_FLIGHT, D = game.data;
  const loc = Math.max(0, Math.min(2, m.AvailLoc));
  if (m.AvailStel < -31999 || m.AvailRandom < 1 || m.AvailLoc === -1) return false;
  if (loc === 2) { if (!inFlight) return false; }
  else { if (inFlight) return false; if (list !== LIST_COMPUTER && loc === 0) return false; if (list === LIST_COMPUTER && loc === 1) return false; }
  const cur = game.landed, curP = D.spob[cur], curG = curP ? (curP.Govt >= 128 ? curP.Govt : -1) : -1;
  // location
  const v = m.AvailStel;
  let ok = inFlight || v === -1;
  if (!ok) {
    if (v >= 128 && v < 5000) ok = cur === v;
    else if (v >= 5000 && v <= 9998) ok = D.links(game.system).includes(v - 5000 + 128);
    else if (v >= 9999 && v < 15000) ok = curG === idx2govt(v - 10000);
    else if (v >= 15000 && v < 20000) { const g = v - 15000 + 128; ok = curG !== -1 && (curG === D.govt[g]?.Ally || D.govt[curG]?.Ally === g); }
    else if (v >= 20000 && v < 30000) ok = curG !== v - 20000 + 128;
  }
  if (!ok) return false;
  // bits
  const bs = m.AvailBitSet;
  const nb = D.bitMax ?? 256;
  if (!(bs === -1 || (bs >= 0 && bs < nb && bitSet(p, bs)) || (bs >= 1000 && bs < 1000 + nb && !bitSet(p, bs - 1000)))) return false;
  const bc = m.AvailBitClr ?? -1;
  if (!(bc === -1 || (bc >= 0 && bc < nb && !bitSet(p, bc)))) return false;
  // record
  const r = m.AvailRecord, legal = p.legalIn(game.system);
  if (r !== 0) {
    if (r < -31999) {
      if (inFlight) return false;
      if (r === -32000 && !p.dominated[cur]) return false;
      if (r === -32001 && !Object.entries(p.dominated).some(([id, on]) => on && game.spobInPlay(+id))) return false;   // EVO 0x1004d8b8: in play
      if (r !== -32000 && r !== -32001) return false;
    } else if (r < 1) { if (!(legal <= r)) return false; }
    else if (!(r <= legal)) return false;
  }
  if (m.AvailRating >= 1 && !(m.AvailRating <= p.kills)) return false;
  if (D.evo && !evoShipGates(game, m)) return false;
  if (m.AvailRandom < 100 && !(ensureRolls(game)[m.id] <= m.AvailRandom)) return false;
  const qty = missionCache(game).qty[m.id];
  if (inFlight && qty >= 1 && freeCargo(game) < qty) return false;
  if (p.missions.some(s => s?.misn === m.id)) return false;
  return true;
}

// EVO-only availability gates 7 and 8 (FUN_1004d8b8). AvailShipType: 128.. this ship type, 1128.. not it,
// 2128.. ship InherentGovt is, 3128.. is not. Pilot class: the shipped code tests Flags 0x2000 twice (the
// second test was meant to be 0x4000), so any mission with 0x2000 is never offered and 0x4000 is ignored.
function evoShipGates(game, m) {
  const T = game.data.ship[game.pilot.shipType], v = m.AvailShipType ?? -1, ig = T?.InherentGovt ?? -1;
  if (v >= 128 && v <= 192 && game.pilot.shipType !== v) return false;
  if (v >= 1128 && v <= 1192 && game.pilot.shipType === v - 1000) return false;
  if (v >= 2128 && v <= 2256 && ig !== v - 2000) return false;
  if (v >= 3128 && v <= 3256 && ig === v - 3000) return false;
  if (m.Flags & 0x2000) return false;
  return true;
}

// The offers for one list, resolved (destinations picked) once per spob visit.
export function offers(game, list) {
  const c = missionCache(game); ensureRolls(game);
  const key = `${list}:${game.landed}`;
  if (c.offerKey === key && c.offers) return c.offers;
  let out = Object.values(game.data.misn).filter(m => available(game, m, list)).map(m => resolveOffer(game, m));
  if (list === LIST_BAR) out.sort((a, b) => ((b.m.Flags & 0x1000) ? 1 : 0) - ((a.m.Flags & 0x1000) ? 1 : 0));
  c.offerKey = key; c.offers = out;
  return out;
}

// ev_mission_resolve_offer 0x10051af0
export function resolveOffer(game, m) {
  const cur = currentSpob(game);
  const travel = m.TravelStel === -1 ? -1 : pickStellar(game, m.TravelStel, cur);
  const ret = m.ReturnStel === -1 ? travel : pickStellar(game, m.ReturnStel, cur);
  const cargoType = m.CargoType === 1000 ? game.rng.rand(6) : m.CargoType;
  const o = { m, travel, ret, cargoType, cargoQty: missionCache(game).qty[m.id], days: m.TimeLimit };
  o.shipName = m.ShipNameID >= 128 ? game.data.str(m.ShipNameID, game.rng.rand(game.data.strings[m.ShipNameID]?.length ?? 1)) : '';
  return o;
}

// ---------- text ----------
export function substitute(game, text, o) {
  const D = game.data, p = game.pilot;
  const tsp = D.spob[o.travel], rsp = D.spob[o.ret];
  const deadline = o.deadline ?? (o.days > 0 ? dateAfter(p.date, o.days) : null);
  return String(text ?? '')
    .replaceAll('<DST>', tsp?.name ?? '').replaceAll('<DSY>', tsp ? D.syst[tsp.System]?.name ?? '' : '')
    .replaceAll('<RST>', rsp?.name ?? '').replaceAll('<RSY>', rsp ? D.syst[rsp.System]?.name ?? '' : '')
    .replaceAll('<CT>', o.cargoType >= 0 ? D.str(4000, o.cargoType) : '').replaceAll('<CQ>', String(o.cargoQty ?? 0))
    .replaceAll('<SN>', o.shipName ?? '').replaceAll('<DL>', deadline ? fmtDate(deadline) : '')
    .replaceAll('<PN>', p.name).replaceAll('<PSN>', p.shipName ?? D.ship[p.shipType].name)   // the name the player gave the ship
    .replaceAll('<OSN>', o.osn ?? '');
}
export const fmtDate = longDate;   // <DL> goes through FUN_10065854 (0x10057960)
function dateAfter(date, days) {
  const d = { ...date };
  const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < days; i++) { const len = d.m === 2 && d.y % 4 === 0 ? 29 : ML[d.m - 1]; if (++d.d > len) { d.d = 1; if (++d.m > 12) { d.m = 1; d.y++; } } }
  return d;
}
export const offerText = (game, o) => substitute(game, game.data.descs[4000 + o.m.index] ?? o.m.name, o);
export const missionTitle = (game, o) => substitute(game, o.m.name, o);
export const descText = (game, id, o) => (id >= 128 && game.data.descs[id] ? substitute(game, game.data.descs[id], o) : null);

// ---------- accept 0x10053584 ----------
export function accept(game, o) {
  const p = game.pilot, m = o.m;
  const slot = Array.from({ length: MAX_MISSIONS }, (_, i) => i).find(i => !p.missions[i]?.active);
  if (slot == null) return { ok: false, msg: `You’re already on ${MAX_MISSIONS} missions.` };
  if (o.cargoQty > 0) {
    if (game.cargoCapacity() < o.cargoQty) return { ok: false, msg: 'Your ship doesn’t have enough cargo space to accept this mission.' };
    if (freeCargo(game) < o.cargoQty) return { ok: false, msg: 'Your ship doesn’t have enough free cargo space to accept this mission.' };
  }
  const behav = m.ShipBehav;
  let shipSys = m.ShipSyst;
  if (shipSys === -1) shipSys = game.system;
  else if (shipSys === -3) shipSys = spobSys(game, o.travel);
  else if (shipSys === -4) shipSys = spobSys(game, o.ret);
  else if (shipSys === -5 || shipSys > 9998) shipSys = pickSystem(game, shipSys, game.system);
  const s = {
    active: true, arrived: false, goalDone: false, failed: false,
    misn: m.id, travel: o.travel, ret: o.ret, cargoType: o.cargoType, cargoQty: o.cargoQty,
    pickup: m.PickupMode, dropoff: m.DropoffMode, scanGovt: m.ScanGovt, failIfScan: !!m.FailIfScan, canAbort: !!m.CanAbort,
    pay: m.PayVal, remaining: m.ShipCount, count: m.ShipCount, shipDude: m.ShipDude, goal: m.ShipGoal, behav,
    shipSys, compBit: m.CompBitSet, compBit2: m.CompBitSet2, compBit3: m.CompBitSet3 ?? -1, compBit4: m.CompBitSet4 ?? -1,
    failBit: m.FailBitSet, failBit2: m.FailBitSet2 ?? -1,
    compGovt: m.CompGovt >= 128 ? m.CompGovt : -1, compReward: m.CompGovt >= 128 ? m.CompReward : 0,
    brief: m.BriefText, quick: m.QuickBrief, loadText: m.LoadCargText, dropText: m.DropCargText, compText: m.CompText, failText: m.FailText,
    timeLeft: m.TimeLimit > 0 ? m.TimeLimit : NO_LIMIT, flags: m.Flags,
    auxCount: m.AuxShipCount >= 1 ? m.AuxShipCount : -1, auxLeft: m.AuxShipCount >= 1 ? m.AuxShipCount : -1, auxDude: m.AuxShipDude, auxSys: m.AuxShipSyst, auxSpawned: 0,
    killed: 0, boarded: 0, disabled: 0, chased: 0, loaded: m.PickupMode === 0,
    spawned: behav < 9 ? m.ShipCount : 0, hyperTimer: behav < 9 ? -1 : game.rng.rand(100) + 100, auxTimer: game.rng.rand(70) + 70,
    shipName: o.shipName, title: missionTitle(game, o),
    deadline: m.TimeLimit > 0 ? dateAfter(p.date, m.TimeLimit) : null,
  };
  if (s.timeLeft < 0) s.timeLeft = NO_LIMIT;
  if (p.landedSpob === o.travel || o.travel === -1 || game.landed === o.travel) s.arrived = true;
  p.missions[slot] = s;
  // Override StartBitSet (mïsn +0x5e, offer +0xc; FUN_1004a570, VERIFIED): 0..999 sets the bit,
  // 1000..1511 clears bit n-1000. A record shorter than 0x70 bytes has none.
  if (game.data.evo) { const b = m.StartBitSet ?? -1; if (b >= 0 && b <= 999) p.bits[b] = 1; else if (b > 999 && b < 0x5e8) p.bits[b - 1000] = 0; }
  if (m.PayVal < -30127) { const id = Math.abs(m.PayVal) - 30128 + 128; if (game.data.outf[id] && !(p.outfits[id] > 0)) { p.outfits[id] = 1; game.outfitsChanged(); } }
  missionCache(game).rolls[m.id] = 0;
  invalidateOffers(game); missionCache(game).offers = null;
  const brief = descText(game, m.BriefText, s);
  return { ok: true, slot, text: brief };
}

// Override offer refused with No (bar/person offer FUN_10050b7c item 2, VERIFIED): with a RefuseText
// (+0x58) the desc is shown, then RefuseBitSet (+0x5c) 0..511 sets the bit, 1000..1511 clears bit
// n-1000. Without a RefuseText nothing happens. Returns the text to show, or null.
export function refuse(game, o) {
  const m = o.m, p = game.pilot;
  if (!game.data.evo || (m.RefuseText ?? -1) === -1) return null;
  const b = m.RefuseBitSet ?? -1;
  const text = descText(game, m.RefuseText, o);
  if (b >= 0 && b <= 0x1ff) p.bits[b] = 1; else if (b > 999 && b < 0x5e8) p.bits[b - 1000] = 0;
  return text;
}

// ---------- goal state 0x100573bc ----------
export function liveMissionShips(game, slot) { return game.ships.filter(x => x?.alive && x.mission === slot && !isDead(x)); }
export function updateGoal(game, slot) {
  const s = game.pilot.missions[slot]; if (!s?.active) return;
  const r = goalState(s, s.goal === 3 ? liveMissionShips(game, slot).length : 0, game.system === s.shipSys || s.shipSys === -6);
  s.goalDone = r.done; if (r.failed) s.failed = true;
  if (!s.failed && s.timeLeft < 1 && s.timeLeft > NO_LIMIT && !game.landed) {
    game.beep?.(4); game.message('Time limit exceeded - mission failed.');   // FUN_100573bc: Beep4
    setFailed(game, slot);
  }
}
export function updateAll(game) { for (let i = 0; i < MAX_MISSIONS; i++) if (game.pilot.missions[i]?.active && !game.pilot.missions[i].failed) updateGoal(game, i); }

function applyBit(game, bit) {
  const p = game.pilot, nb = game.data.bitMax ?? 256;
  if (bit >= 0 && bit < nb) {
    p.bits[bit] = 1;
    for (const o of Object.values(game.data.oops)) if (o.MissionBit === bit && o.Duration > 0) game.oopsState(o.id).days = o.Duration;
  } else if (bit >= 1000 && bit < 1000 + nb) p.bits[bit - 1000] = 0;
}

// ev_mission_set_failed 0x10055564
export function setFailed(game, slot) {
  const s = game.pilot.missions[slot];
  applyBit(game, s.failBit); applyBit(game, s.failBit2 ?? -1);
  s.failed = true;
  if (s.canAbort) cleanup(game, slot);
}

// ev_mission_cleanup_slot 0x100553dc
export function cleanup(game, slot) {
  for (const x of game.ships) {
    if (!x?.alive || x.mission !== slot) continue;
    x.mission = -1;
    if (x.leader !== -1) { x.ai = game.data.ship[x.type].InherentAI; x.leader = -1; x.action = 0; }
  }
  game.pilot.missions[slot] = null;
  invalidateOffers(game); missionCache(game).offers = null;
}

// ---------- landing 0x10056e0c ----------
export function onLanding(game) {
  const p = game.pilot, texts = [];
  for (let i = 0; i < MAX_MISSIONS; i++) {
    const s = p.missions[i];
    if (!s?.active || s.failed) continue;
    updateGoal(game, i);
    cargoPickupDropoff(game, i, texts);
    if (game.landed === s.ret) {
      if (s.ret === s.travel || s.travel === -1) s.arrived = true;
      if (!s.failed) { if (s.arrived && s.goalDone) complete(game, i, texts); }
      else failAtReturn(game, i, texts);
    }
    const t = p.missions[i];
    if (t) { updateGoal(game, i); if (t.failed && t.failText === -1) cleanup(game, i); }
  }
  // failed missions waiting for their return stellar
  for (let i = 0; i < MAX_MISSIONS; i++) { const s = p.missions[i]; if (s?.active && s.failed && game.landed === s.ret) failAtReturn(game, i, texts); }
  return texts;
}

function cargoPickupDropoff(game, slot, texts) {
  const s = game.pilot.missions[slot];
  if (game.landed === s.travel) {
    s.arrived = true;
    if (s.pickup === 1 && !s.loaded) {
      if (game.cargoCapacity() < s.cargoQty) texts.push('Your ship doesn’t have enough cargo space to load this cargo.');
      else if (freeCargo(game) < s.cargoQty) texts.push('Your ship doesn’t have enough free cargo space to load this cargo.');
      else { s.loaded = true; const t = descText(game, s.loadText, s); if (t) texts.push(t); }
    }
    if (s.dropoff === 0 && s.loaded) { s.loaded = false; const t = descText(game, s.dropText, s); if (t) texts.push(t); }
  }
  if (game.landed === s.ret && s.dropoff === 1 && s.loaded) { s.loaded = false; const t = descText(game, s.dropText, s); if (t) texts.push(t); }
}

// ev_mission_complete 0x10054894
export function complete(game, slot, texts = []) {
  const p = game.pilot, s = p.missions[slot], D = game.data;
  const t = descText(game, s.compText, s); if (t) texts.push(t);
  applyBit(game, s.compBit); applyBit(game, s.compBit2); applyBit(game, s.compBit3 ?? -1); applyBit(game, s.compBit4 ?? -1);
  if (s.compGovt !== -1) {
    const C = s.compGovt;
    for (const sys of D.systList) {
      if (!sys) continue;
      const g = sys.Govt >= 128 ? sys.Govt : -1;
      if (g === C) p.legal[sys.id] = p.legalIn(sys.id) + s.compReward;
      else if (g !== -1) {
        if (C === D.govt[g].Enemy || g === D.govt[C]?.Enemy) p.legal[sys.id] = Math.trunc(p.legalIn(sys.id) - 0.5 * s.compReward);
        else if (C === D.govt[g].Ally || g === D.govt[C]?.Ally) p.legal[sys.id] = Math.trunc(p.legalIn(sys.id) + 0.5 * s.compReward);
      }
    }
  }
  if (s.pay > 0) p.credits += s.pay;
  else if (s.pay > -20000 && s.pay < -9999) { const g = Math.abs(s.pay) - 10128 + 128; for (const sys of D.systList) if (sys && sys.Govt === g && p.legalIn(sys.id) < 0) p.legal[sys.id] = 0; }
  else if (s.pay > -30000 && s.pay < -19999) { const id = Math.abs(s.pay) - 20128 + 128; if (D.outf[id]) { p.outfits[id] = (p.outfits[id] ?? 0) + 1; game.outfitsChanged(); } }
  p.missions[slot] = null;
  cleanupShips(game, slot);
  invalidateOffers(game); missionCache(game).offers = null;
}
function cleanupShips(game, slot) { for (const x of game.ships) if (x?.alive && x.mission === slot) x.mission = -1; }

// ev_mission_fail_at_return 0x1005500c
export function failAtReturn(game, slot, texts = []) {
  const p = game.pilot, s = p.missions[slot]; if (!s) return;
  applyBit(game, s.failBit); applyBit(game, s.failBit2 ?? -1);
  if (s.compGovt !== -1) for (const sys of game.data.systList) if (sys && sys.Govt === s.compGovt) p.legal[sys.id] = p.legalIn(sys.id) - Math.trunc(s.compReward / 2);
  const t = descText(game, s.failText, s); if (t) texts.push(t);
  if ((s.flags & 0x20) && s.pay < -30127) removeStartOutfit(game, s);
  cleanup(game, slot);
}
function removeStartOutfit(game, s) { const id = Math.abs(s.pay) - 30128 + 128; if (game.pilot.outfits[id] > 0) { game.pilot.outfits[id] = 0; game.outfitsChanged(); } }

// ev_mission_info_dialog_abort 0x10058378
export function abort(game, slot) {
  const p = game.pilot, s = p.missions[slot]; if (!s) return;
  if (s.flags & 0x20 && s.pay < -30127) removeStartOutfit(game, s);
  if ((s.flags & 0x40) && s.compGovt !== -1) for (const sys of game.data.systList) if (sys && sys.Govt === s.compGovt) p.legal[sys.id] = p.legalIn(sys.id) + s.compReward * -5;
  cleanup(game, slot);
}
function autoAbort(game, slot) { const s = game.pilot.missions[slot]; applyBit(game, s.compBit); applyBit(game, s.compBit2); applyBit(game, s.compBit3 ?? -1); applyBit(game, s.compBit4 ?? -1); cleanup(game, slot); }

// ---------- special ships ----------
// ev_spawn_mission_ship 0x1001b274: a system dude roll first (the slot search), then the mission dude.
function spawnMissionShip(game, dudeId, slot, aux = false) {
  const base = rollDude(game, game.system); if (!base) return null;
  const free = freeSlot(game); if (free < 0 || free >= 35) return null;
  const dude = game.data.dude[dudeId]; if (!dude) return null;
  const c = []; let acc = 0; for (const p of dude['% Prob']) c.push(acc += p);
  const r = game.rng.rand(100) + 1, j = c.findIndex((v, i) => r <= v && dude.ShipTypes[i] >= 128);
  if (j < 0) return null;
  const s = game.pilot.missions[slot];
  const ship = makeNpc(game, free, { type: dude.ShipTypes[j], ai: dude.AIType, govt: dude.Govt >= 128 ? dude.Govt : -1, x: base.x, y: base.y, aggression: base.aggression });
  ship.mission = aux ? -1 : slot;
  ship.auxOf = aux ? slot : -1;
  const b = ((s.behav % 10) + 10) % 10;
  if (b !== 0) for (const w of Object.values(ship.weapons)) w.ammo = Math.trunc(w.ammo / 1.75);
  ship.name = s.shipName || null;
  if (s.behav === 0 || s.behav === 10) { ship.target = 0; ship.missionHostile = true; }
  if (b === 1) { ship.ai = 6; ship.leader = 0; ship.strict = !!game.pilot.strict; computeStats(game.data, ship); }
  return ship;
}

// ev_system_enter_populate, mission part: called on every system entry and take-off.
export function onSystemEntry(game) {
  const p = game.pilot;
  for (let i = 0; i < MAX_MISSIONS; i++) {
    const s = p.missions[i]; if (!s?.active) continue;
    if (s.behav >= 9) { s.hyperTimer = game.rng.rand(100) + 100; s.spawned = 0; s.auxSpawned = 0; }
    s.auxTimer = game.rng.rand(70) + 70;
    if (!(s.shipSys === game.system || s.shipSys === -6) || s.remaining <= 0 || s.hyperTimer >= 0 || s.failed) continue;
    let n = s.remaining;
    if (s.shipSys === -6 && s.behav % 10 === 1) n -= liveMissionShips(game, i).length;
    for (let k = 0; k < n; k++) {
      const ship = spawnMissionShip(game, s.shipDude, i); if (!ship) continue;
      if (s.goal === 3) { ship.x = game.player.x + game.rng.rand(512) - 256; ship.y = game.player.y + game.rng.rand(512) - 256; }
      if (s.goal === 5) {
        ship.facing = ship.desired = game.rng.rand(360); ship.vx = ship.vy = 0;
        ship.pool = Math.trunc(-0.66 * ship.stats.armorMax);
      }
    }
    if (s.flags & 1) autoAbort(game, i);
  }
}

// ev_system_frame_spawns, mission part: hyper-in specials and aux ships, every step.
export function stepSpawns(game) {
  const p = game.pilot, P = game.player;
  for (let i = 0; i < MAX_MISSIONS; i++) {
    const s = p.missions[i]; if (!s?.active || s.failed) continue;
    if (s.behav >= 9 && (s.shipSys === -6 || s.shipSys === game.system)) {
      const n = s.count - s.spawned;
      if (n > 0) {
        if (s.hyperTimer > 0) s.hyperTimer--;
        else if (s.hyperTimer === 0) {
          s.hyperTimer = -1;
          for (let k = 0; k < n; k++) {
            const ship = spawnMissionShip(game, s.shipDude, i); if (!ship) continue;
            s.spawned++;
            const t = P.target >= 0 ? game.ships[P.target] : null;
            const h = t ? Math.round(Math.atan2(t.x - P.x, P.y - t.y) * 180 / Math.PI + 360) % 360 : game.rng.rand(360);
            const pos = { x: P.x, y: P.y }; addPolar(pos, h, 1098.005 - 256 + game.rng.rand(512));
            ship.x = pos.x; ship.y = pos.y;
            ship.facing = ship.desired = wrap(h + 180);
            const v = { x: 0, y: 0 }; addPolar(v, ship.facing, 50); ship.vx = v.x; ship.vy = v.y;
            ship.jump = -999; ship.state = 8;
          }
          if (s.flags & 1) { autoAbort(game, i); continue; }
        }
      }
    }
    if (s.auxTimer > 0) s.auxTimer--;
    if (s.auxTimer < 1 && s.auxDude >= 128 && s.auxSpawned < s.auxLeft && auxSystemMatch(game, s)) {
      const n = s.auxLeft - s.auxSpawned;
      for (let k = 0; k < n; k++) {
        const ship = spawnMissionShip(game, s.auxDude, i, true); if (!ship) continue;
        ship.facing = ship.desired = game.rng.rand(360);
        const pos = { x: 0, y: 0 }; addPolar(pos, wrap(ship.facing + 180), ARRIVAL_RADIUS); ship.x = pos.x; ship.y = pos.y;
        const v = { x: 0, y: 0 }; addPolar(v, ship.facing, 50); ship.vx = v.x; ship.vy = v.y;
        ship.jump = -999; ship.state = 8;
        s.auxSpawned++;
        if (!(s.flags & 0x10)) s.auxLeft--;
      }
    }
  }
}

// ev_mission_aux_system_match 0x10059ea8
function auxSystemMatch(game, s) {
  const v = s.auxSys, sys = game.system, D = game.data;
  if (v === 0) return false;
  if (v === -1 || v === -6) return true;
  if (v === -2) return spobSys(game, s.travel) === sys;
  if (v === -3) return spobSys(game, s.ret) === sys;
  if (v >= 128 && v <= 1127) return v === sys;
  if (v >= 5000 && v < 9999) return v - 5000 + 128 === sys || D.links(sys).includes(v - 5000 + 128);
  if (v >= 9999 && v < 15000) return (D.syst[sys].Govt >= 128 ? D.syst[sys].Govt : -1) === idx2govt(v - 10000);
  return false;
}

// ---------- counters from combat ----------
export function onShipKilled(game, ship) {
  const s = ship.mission >= 0 ? game.pilot.missions[ship.mission] : null; if (!s?.active) return;
  if (s.killed === 0 && !s.failed && (s.goal === 1 || ((s.goal === 2 || s.goal === 5) && !ship.plundered) || s.goal === 3)) {
    game.beep?.(2); game.message('Mission failed.'); setFailed(game, ship.mission);   // FUN_1002bbe8: Beep2
  }
  const t = game.pilot.missions[ship.mission]; if (!t) return;
  t.killed++; if (t.remaining > 0) t.remaining--;
}
export function onShipDisabled(game, ship) {
  const s = ship.mission >= 0 ? game.pilot.missions[ship.mission] : null; if (!s?.active) return;
  if (s.goal === 3 && !s.failed && s.disabled === 0) { game.beep?.(2); game.message('Mission failed.'); setFailed(game, ship.mission); }   // FUN_10017384: Beep2
  const t = game.pilot.missions[ship.mission]; if (t) t.disabled++;
}
export function onShipBoarded(game, ship) {
  const s = ship.mission >= 0 ? game.pilot.missions[ship.mission] : null;
  if (!s?.active || s.pickup !== 2) return false;
  if (freeCargo(game) < s.cargoQty) { game.message('You don’t have enough free cargo space to retrieve the cargo.'); return true; }
  s.boarded++; ship.plundered = true; s.loaded = true;
  game.message(`You retrieved the ${s.cargoType >= 0 ? game.data.str(4000, s.cargoType) : 'cargo'} from this ship.`);
  return true;
}
export function onShipJumpedOut(game, ship) {
  const s = ship.mission >= 0 ? game.pilot.missions[ship.mission] : null;
  if (s?.active && s.goal === 6 && s.shipSys !== -6) { s.chased++; if (s.remaining > 0) s.remaining--; }
}

// ev_ai_scan_player_cargo 0x10000210
export function scanPlayer(game, ship) {
  if (ship.scanned || !(ship.ai === 3 || ship.ai === 4)) return;
  const G = game.data.govtOf(ship.govt); if (!G || !G.SmugPenalty) return;
  const P = game.player; if (Math.abs(P.x - ship.x) > 180 || Math.abs(P.y - ship.y) > 180) return;
  for (let i = 0; i < MAX_MISSIONS; i++) {
    const s = game.pilot.missions[i];
    if (!s?.active || !s.loaded || s.scanGovt !== ship.govt || s.cargoType === -1) continue;
    ship.scanned = true;
    if (s.failIfScan && !s.failed) { game.message('Your ship has been scanned - mission failed.'); setFailed(game, i); }
    else { game.message('Your ship has been scanned and illegal cargo was found.'); game.legalPenalty(ship.govt, 0); }
  }
}

// ---------- daily ----------
export function dayTick(game) {
  for (const s of game.pilot.missions) if (s?.active && s.timeLeft > 0) s.timeLeft--;
}
