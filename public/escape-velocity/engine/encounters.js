// Hailing, bribes, tribute, boarding and capture.
// Ship hail: FUN_1000ee74 (dialog loop), ev_comm_info_text 0x10012204 (greeting), draw proc
// FUN_100103b4; planet hail: FUN_10010904, draw proc FUN_10011bec; price haggling: FUN_10012a14;
// plunder: FUN_100131c0 with booty from FUN_1001437c; capture choice: FUN_1004a40c. Replies come from
// STR# 3000/3001 (ships) and STR# 3002 (planets) in groups of five, one variant picked per hail.
import { SPOB } from './data.js';
import { isDisabled, isDead, computeStats } from './ships.js';
import { launchDefender, defenderCount } from './spawn.js';
import { available, resolveOffer, LIST_FLIGHT, offerText } from './missions.js';
import { hostileToPlayer, friendlyToPlayer, shipsHostile } from './ai.js';

const lines = (game, table) => game.data.strings[table] ?? [];

// FUN_100130f8: reply n of a ship (STR# 3000 entry 5n+v, or STR# 3001 from n = 38 on).
export function shipText(game, v, n) {
  return n < 38 ? (lines(game, 3000)[5 * n + v] ?? '') : (lines(game, 3001)[5 * (n - 38) + v] ?? '');
}
// FUN_10013178: reply n of a planet (STR# 3002 entry 5n+v).
export function planetText(game, v, n) { return lines(game, 3002)[5 * n + v] ?? ''; }

const live = s => s?.alive && !isDisabled(s) && !isDead(s);

// FUN_1000712c: is this ship fighting the player or the player's escorts? (engine/ai.js)
export const attackingPlayer = (game, s) => hostileToPlayer(game, s);
const anyAttackingPlayer = game => game.ships.some(s => s && s.slot > 0 && attackingPlayer(game, s));

// FUN_100077b4: would this ship do the player a favour? (engine/ai.js)
export const friendly = (game, s) => friendlyToPlayer(game, s);

// ---------- ships ----------
// The hail key (FUN_10038f8c): no comm with a ship that is jumping, disabled, of a govt with flag 0x400,
// of ship type index 63, or a bounty hunter ("No response." in the status bar). A pers ship with a
// LinkMission (pers Flags 0x200 clear) that is available offers the mission instead of opening comms.
export function hailShip(game, ship) {
  const D = game.data, T = D.ship[ship.type], G = D.govtOf(ship.govt), P = ship.pers >= 128 ? D.pers[ship.pers] : null;
  if (ship.jump > 0 || (G && (G.Flags & 0x400)) || T.index === 0x3f || isDisabled(ship) || ship.pers === 0x1ff)
    return { unhailable: true, text: 'No response.', name: T.name, opts: [] };
  if (P && P.LinkMission >= 128 && !(P.Flags & 0x200)) {
    const m = D.misn[P.LinkMission];
    if (m && available(game, m, LIST_FLIGHT)) {
      const offer = resolveOffer(game, m); offer.osn = P.name;
      return { ship: ship.slot, offer, offerText: offerText(game, offer), text: offerText(game, offer), name: P.name, opts: ['mission'] };
    }
  }
  const rng = game.rng, credits = game.pilot.credits;
  const v = rng.rand(5);
  let mood = (rng.rand(41) + 80) * 0.01;
  if (rng.rand(5) === 0) mood -= 0.5; else if (rng.rand(5) === 0) mood += 0.5;
  let price = Math.trunc(mood * (rng.rand(Math.max(1, Math.trunc(credits * 5e-7))) * 1000 + 3000));
  if (G && (G.Flags & 0x8000)) price = Math.trunc(mood * (rng.rand(Math.max(1, Math.trunc(credits * 1e-4))) * 1000 + 10000));
  if (0.333 * credits < price) price = Math.trunc(0.333 * credits);
  price = Math.min(900000, Math.max(1000, Math.trunc(price / 1000) * 1000));
  const gi = G ? G.index : -1, ti = T.index;
  const typeName = ship.govt < 0 ? D.str(5006, ti) : D.str(6002, ti), govtName = gi >= 0 ? D.str(6001, gi) : '';
  const m = ship.mission >= 0 ? game.pilot.missions[ship.mission] : null;
  const missionEscort = !!(m?.active && ((m.behav % 10) + 10) % 10 === 1);
  const h = { ship: ship.slot, v, mood, price, xeno: !!(G && (G.Flags & 1)), missionEscort, released: false, typeName, govtName,
    name: P ? P.name : ship.name || T.name, hostile: false, opts: [] };
  h.greeting = greeting(game, ship, v);
  let n = 0;
  if (m) {
    if (m.active) {
      if (m.goal === 0) n = 2;
      if (m.goal === 3) n = 8;
      if (m.behav === 0) n = 2;
      if (m.behav === 1) n = 4;
    }
  } else if (attackingPlayer(game, ship)) n = 2;
  else if (ship.leader === 0) n = ship.ai === 5 ? 5 : ship.ai === 6 ? 4 : 0;
  else n = friendly(game, ship) ? 0 : 2;
  h.text = shipText(game, v, n) + (m?.active && m.goal === 3 && n === 8 ? `${game.pilot.shipName ?? ''}.` : '');
  return refresh(game, h);
}
function refresh(game, h) {
  const s = game.ships[h.ship];
  h.hostile = !!s && attackingPlayer(game, s);
  h.escort = !!s && s.leader === 0 && s.ai === 6 && !h.missionEscort;
  return h;
}

// ev_comm_info_text 0x10012204: what "Greetings" gets from a friendly ship.
function greeting(game, s, v) {
  const D = game.data, G = D.govtOf(s.govt), table = 7000 + (G ? G.index : -1);
  let t = D.strings[table]?.[s.ai <= 2 ? v : v + 5] ?? '';
  if (t[0] === '*' || t[1] === '*' || t.length < 3) t = shipText(game, v, 9);
  const dude = s.dude >= 128 ? D.dude[s.dude] : null, P = s.pers >= 128 ? D.pers[s.pers] : null;
  let k = -1;
  const info = dude?.InfoTypes ?? 0;
  if (info >= 1000 && info < 7128) {
    const bits = Math.trunc(info / 1000);
    for (;;) {
      k = game.rng.rand(3);
      if ((k === 0 && [1, 3, 5, 7].includes(bits)) || (k === 1 && [2, 3, 6, 7].includes(bits)) || (k === 2 && [4, 6, 7].includes(bits))) break;
    }
  }
  if (P && (P.Flags & 0x8000) && !(P.CommQuote >= 1)) k = 1;
  // k 0 (a price tip, FUN_1000ee74 l.7990-8008): Rand(6) a commodity and Rand(1500) a spob index until
  // the spob exists, is in play, trades or can be landed on (flags & 3) and has that commodity at a low
  // or high price. Nothing is written with it in 1.0.5 (no text), but the draws happen. Capped in case
  // no spob qualifies.
  if (k === 0) {
    for (let n = 0; n < 100000; n++) {
      const c = game.rng.rand(6), i = game.rng.rand(0x5dc), P = D.spobList[i];
      if (!P || !game.spobInPlay(P.id) || !(P.Flags & 3)) continue;
      const nib = (P.Flags >>> (28 - 4 * c)) & 0xf, lvl = nib & 1 ? 1 : nib & 2 ? 2 : nib & 4 ? 4 : 0;
      if (lvl === 1 || lvl === 4) break;
    }
  }
  // k 1 (l.8010-8060): with one price event running (days > 1) that one, with more Rand(128) over the
  // event slots until a running one comes up. "The last time I was on <spob>, the price of
  // <commodity>" + Rand(3) " was really / pretty / very " + "low." or "high.".
  if (k === 1) {
    const slot = i => { const o = D.oops[128 + i]; return o && (game.pilot.oops[o.id]?.days ?? 0) > 1 ? o : null; };
    let n = 0, o = null;
    for (let i = 0; i < 0x80; i++) if (slot(i)) { n++; if (!o) o = slot(i); }
    if (n > 1) { do o = slot(game.rng.rand(0x80)); while (!o); }
    const sp = o ? D.spob[game.pilot.oops[o.id].spob] : null;
    if (o && sp) {
      const how = [' was really ', ' was pretty ', ' was very '][game.rng.rand(3)];
      t = `The last time I was on ${sp.name}, the price of ${D.str(4000, o.Commodity)}${how}${o.PriceDelta < 0 ? 'low.' : 'high.'}`;
    }
  }
  if (k === 2) { const q = D.strings[7500 + (info % 1000)] ?? []; if (q.length) t = q[game.rng.rand(q.length)]; }
  if (P && P.CommQuote >= 1 && D.strings[7100]?.[P.CommQuote - 1]) t = D.strings[7100][P.CommQuote - 1];
  return t;
}

// Item 2 ("Request Assistance" / "Beg For Mercy" / "Release From Servitude") and item 3 ("Greetings").
// Returns { pay } when the ship names a price: the caller runs the haggle (haggleStart / haggleLower)
// and then calls shipPaid with 1 (accepted) or 0 (refused).
export function shipComm(game, h, item) {
  const s = game.ships[h.ship], p = game.player, say = n => { h.text = shipText(game, h.v, n); };
  refresh(game, h);
  if (!s?.alive || isDisabled(s)) { say(1); return h; }
  if (item === 3) {
    if (h.hostile || !friendly(game, s)) say(13); else h.text = h.greeting;
    return h;
  }
  if (h.escort) { h.released = true; say(38); return h; }
  const moodText = n => say(h.mood < 0.8 ? 23 : h.mood <= 1.2 ? n : 24);
  if (!h.hostile) {
    if (!friendly(game, s) || h.xeno) { say(19); return h; }
    const busy = (s.target === s.slot) || ![0, 1, 2, 7].includes(s.state);
    if (busy) { say(s.ai < 5 ? 16 : 22); return h; }
    if (!anyAttackingPlayer(game)) {
      if (p.fuel >= 100) say(14);
      else if (h.xeno) say(19);
      else if (s.ai >= 5) say(25);
      else { moodText(28); h.pay = 'refuel'; }
      return h;
    }
    // FUN_10007d1c: some other live ship hostile to the player (712c) that this ship would fight (7de8).
    const foe = game.ships.find(t => t && t.alive && t.slot > 0 && t !== s && attackingPlayer(game, t) && shipsHostile(game, s, t));
    if (!foe || h.xeno) say(19);
    else if (s.ai === 1) say(17);
    else if (s.ai === 2 && !(s.slot % 3 === 0 && s.govt < 0)) say(17);
    else if (s.ai <= 4) { moodText(18); h.pay = 'help'; }
    else { say(29); helpAgainst(game, s, true); }
    return h;
  }
  const m = s.mission >= 0 ? game.pilot.missions[s.mission] : null;
  if (m?.active && m.behav % 10 === 0) say(19);
  else if (s.defends !== -1 || s.pers === 0x1fe || s.ai < 3) say(19);
  else { moodText(18); h.pay = 'bribe'; }
  return h;
}
// FUN_10010164: the price is checked against your credits after the haggle.
export function shipPaid(game, h, accepted, price) {
  const s = game.ships[h.ship], kind = h.pay, say = n => { h.text = shipText(game, h.v, n); };
  h.pay = null;
  if (game.pilot.credits < price) { say(12); return h; }
  if (!accepted) {
    h.price += 1000;
    if (kind === 'bribe') { say(30); if (s) { s.state = 4; s.target = 0; s.bribed = false; } }
    else say(31);
    return h;
  }
  game.pilot.credits -= price;
  if (kind === 'bribe') { say(20); if (s) { s.ai = 1; s.target = -1; s.bribed = true; s.missionHostile = false; s.grudge = 0; leave(s); } }
  else if (kind === 'refuel') {
    say(29);
    // FUN_10008d28: grudge (+0x56) and jump counter (+0x52) cleared, the player as target, AI state 9,
    // action 0, delay (+0x50) -1; the ship flies over and transfers fuel one unit per AI turn up to
    // 100 (ai.js stateToAction).
    if (s) { s.grudge = 0; s.jump = 0; s.target = 0; s.state = 9; s.action = 0; s.delay = -1; }
  } else { say(29); helpAgainst(game, s, false); }
  return h;
}
function leave(s) { s.target = -1; s.action = 3; s.state = 2; }
// FUN_10008afc (paid help: a random ship in this system attacking the player) / FUN_100086a8 (an escort
// or mission escort helping for free).
function helpAgainst(game, s, free) {
  const c = game.ships.filter(t => t && t.slot > 0 && t !== s && live(t) && (free ? attackingPlayer(game, t) : t.target === 0));
  if (!c.length) { s.target = -1; return; }
  s.target = c[game.rng.rand(c.length)].slot; s.state = 4;
}
// Closing the dialog after "Release From Servitude": the escort leaves you (FUN_1000ee74 tail).
export function shipCommClosed(game, h) {
  const s = game.ships[h.ship];
  if (!h.released || !s?.alive) return;
  s.leader = -1; s.ai = game.data.ship[s.type].InherentAI; s.hired = false; leave(s);
}

// FUN_10012a14 mode 2 ("Pay me / Pay us N credits.", Accept Price / Lower Price): one roll of
// Rand(100) <= 50 at the start decides whether the first Lower Price works (x0.75, rounded down to
// 100s); after one cut, or with a failed roll, Lower Price ends the talk as a refusal.
export function haggleStart(game, price) { return { price, chance: game.rng.rand(100) <= 50 }; }
export function haggleLower(n) {
  if (!n.chance) return false;
  n.price = Math.trunc(Math.trunc(n.price * 0.75) * 0.01) * 100; n.chance = false;
  return true;
}

// After a pers mission offer is accepted (deep-missions §3).
export function persAccepted(game, slot) {
  const ship = game.ships[slot]; if (!ship) return;
  const P = game.data.pers[ship.pers];
  if (P.Flags & 0x100) game.pilot.persDead[ship.pers] = true;
  if (P.Flags & 0x800) { ship.action = 3; ship.target = -1; }
}

// ---------- planets ----------
// FUN_10010904. An uninhabited spob (flag 0x20) gives no dialog, only a sound.
export function hailPlanet(game, spob) {
  const D = game.data, p = game.pilot, P = D.spob[spob], G = D.govtOf(P.Govt);
  if (D.spobFlag(P, SPOB.UNINHABITED)) return { spob, name: P.name, unhailable: true, text: 'No response.', opts: [] };
  const v = game.rng.rand(5), price = planetBribeAmount(game, P);
  const denied = p.legalIn(game.system) < P.MinCoolness;
  if (game.attitude == null || game.attitude < 0) game.attitude = game.rng.rand(100);
  let willing = game.attitude > 30 && (!G || (G.Flags & 0x4000));
  if (G && (G.Flags & 0x8000)) willing = true;
  const h = { spob, name: P.name, v, price, denied, willing: !!willing, asked: false, opts: [] };
  h.text = !denied || p.dominated[P.id] ? `${planetText(game, v, 0)}${P.name}.` : shipText(game, v, 2);
  return h;
}

// Bribe to land 0x10010904 (VERIFIED formula).
export function planetBribeAmount(game, P) {
  const cash = game.pilot.credits, G = game.data.govtOf(P.Govt);
  const n = Math.max(1, Math.trunc(cash * 1e-6));
  let b = game.rng.rand(n) * 1000 + 3000;
  if (G && (G.Flags & 0x8000)) b = Math.trunc(b * 1.5);
  if (0.333 * cash < b) b = Math.trunc(0.333 * cash);
  b = Math.trunc(b / 1000) * 1000; b = Math.min(b, 900000); b = Math.max(b, 1000);
  return b;
}

// Item 2: "Greetings" (landing allowed or dominated) or "Offer Bribe" (forbidden). Returns h; h.pay is
// set when the planet names its price (haggle, then planetPaid).
export function planetComm(game, h, item) {
  const D = game.data, p = game.pilot, P = D.spob[h.spob], say = n => { h.text = planetText(game, h.v, n); };
  h.text = shipText(game, h.v, 1);
  if (item === 3) return demandTribute(game, h);
  if (!h.denied || p.dominated[P.id]) { if (!h.denied) h.text = shipText(game, h.v, 9); else say(4); return h; }
  if (!h.willing) { say(9); return h; }
  say(8); h.pay = 'bribe';
  return h;
}
export function planetPaid(game, h, accepted, price) {
  const D = game.data, p = game.pilot, P = D.spob[h.spob], say = n => { h.text = planetText(game, h.v, n); };
  h.pay = null;
  if (p.credits < price) { say(4); return h; }
  if (!accepted) { h.willing = false; game.attitude = 0; h.price += 1000; say(6); return h; }
  // FUN_10010904 l.7535: the clearance counter [10079694] = 0x2ef and its spob [10079690] = the nav
  // stellar, the ship's +0x50 delay = 0. The counter then runs on as for any clearance and lapses at 0x7ff.
  p.credits -= price; game.navSpob = P.id; game.landCounter = 0x2ef; if (game.player) game.player.delay = 0;
  game.message(`${p.shipName ?? ''}, you are ${D.spobFlag(P, SPOB.STATION) ? 'cleared to dock' : 'cleared to land'}. Commence final approach.`, 'msg', 0xfa);
  h.close = true;
  return h;
}

// Item 3: "Demand Tribute", or "Release From Servitude" on a dominated spob (FUN_10010904, asm
// 0x10011284-0x10011848). A pilot under 12,800 kills only earns the legal penalty and a laugh.
export function demandTribute(game, h) {
  const p = game.pilot, D = game.data, P = D.spob[h.spob], station = D.spobFlag(P, SPOB.STATION);
  const say = n => { h.text = planetText(game, h.v, n); };
  if (p.dominated[P.id]) {
    h.text = D.strings[3002]?.[station ? 36 : 35] ?? '';
    p.dominated[P.id] = false; p.defenders[P.id] = defenderCount(P.DefCount);
    if (p.legalIn(game.system) >= P.MinCoolness) p.legal[game.system] = P.MinCoolness - 1;
    return h;
  }
  h.denied = true;
  if (p.legalIn(game.system) >= P.MinCoolness) p.legal[game.system] = P.MinCoolness - 1;
  game.legalPenalty(P.Govt, 3);
  if (p.kills < 12800) { say(1); h.asked = true; return h; }
  for (let i = 0; i < 5; i++) game.legalPenalty(P.Govt, 3);
  const left = p.defenders[P.id] ?? defenderCount(P.DefCount);
  const up = game.ships.some(s => s?.alive && s.defends === P.id && !isDead(s));
  if (!h.asked && left < 1 && !up) {
    h.text = D.strings[3002]?.[station ? 26 : 25] ?? '';
    p.dominated[P.id] = true;
  } else {
    say(2);
    if (!up) {
      let rest = left, n;
      if (P.DefCount < 1001) { n = rest; rest = 0; }
      else { n = P.DefCount % 10; rest -= n; if (rest < 0) { n += rest; rest = 0; } }
      p.defenders[P.id] = rest;
      for (let i = 0; i < n; i++) launchDefender(game, P, true);
    }
  }
  h.asked = true;
  return h;
}

// ---------- boarding (0x1001437c, 0x100131c0) ----------
export function boardState(game, ship) {
  if (ship.board) return ship.board;
  const D = game.data, T = D.ship[ship.type], dude = D.dude[ship.dude], booty = dude ? dude.Booty : 0, P = ship.pers >= 128 ? D.pers[ship.pers] : null;
  const b = { slot: ship.slot, trip: 15 + game.rng.rand(26) };
  // credits
  let credits = -1;
  if (!(booty & 0x40)) {
    if (P) { const x = 0.5 * Math.trunc(P.Credits / 1000); credits = x <= 2 ? Math.trunc(1000 * x) : Math.trunc(1000 * (x + game.rng.rand(Math.trunc(x)))); }
  } else {
    const x = 0.025 * Math.trunc(T.Cost / 1000);
    credits = x <= 2 ? Math.trunc(1000 * x) : Math.trunc(1000 * (x + game.rng.rand(Math.trunc(x))));
    if (credits < 1000) credits = 1000;
  }
  b.credits = credits >= 1 ? credits : 0;
  // cargo: a random commodity allowed by the booty bits
  b.cargo = null;
  if (booty & 0x3f) {
    let c; do c = game.rng.rand(7); while (c > 5 || !(booty & (1 << c)));
    const h = Math.abs(T.Holds), amt = Math.trunc(h / 2) + game.rng.rand(Math.max(1, Math.trunc(h / 2)));
    if (amt > 0) b.cargo = { type: c, qty: amt };
  }
  const ammoW = Object.entries(ship.weapons).filter(([id, w]) => D.weap[id].AmmoType >= 0 && w.ammo > 0 && D.weap[id].Guidance !== 99);
  b.ammo = ammoW.length ? (() => { const [id, w] = ammoW[game.rng.rand(ammoW.length)]; return { wid: +id, qty: w.ammo }; })() : null;
  b.fuel = Math.trunc(game.rng.rand(Math.max(1, Math.trunc(ship.fuel / 10)))) * 10;
  b.odds = captureOdds(game, ship);   // DAT_1007f66e, rolled once on boarding
  b.armed = false;
  return (ship.board = b);
}

function crewFor(game) {
  const D = game.data;
  let total = Math.max(1, D.ship[game.pilot.shipType].Crew);
  // Escorts count when they are not mission ships (EV +0x97c, EVO +0xa7e == -1; l.8848-8862).
  for (const e of game.ships) if (e?.alive && e.ai === 6 && e.leader === 0 && !(e.mission >= 0) && D.ship[e.type].Crew >= 10 && D.ship[e.type].InherentAI > 2) total = Math.trunc(total + 0.1 * D.ship[e.type].Crew);
  // Override (FUN_10014ae8, VERIFIED): plus ModVal x count of every ModType 25 outfit
  // (UE Marine Gear) the player owns, in either modifier slot.
  if (D.evo) total += modSum(D, game.pilot.outfits, 25);
  return total;
}
// Override sums ModVal x count over both modifier pairs for one ModType (FUN_10060974 for 24, the
// loop at the end of FUN_10014ae8 for 25).
export function modSum(D, outfits, type) {
  let n = 0;
  for (const [id, c] of Object.entries(outfits ?? {})) {
    const o = D.outf[id]; if (!o || !(c > 0)) continue;
    if (o.ModType === type) n += o.ModVal * c;
    if (o.ModType2 === type) n += o.ModVal2 * c;
  }
  return n;
}
export function captureOdds(game, ship, roll = game.rng.rand(21)) {
  const tc = Math.max(1, game.data.ship[ship.type].Crew);
  const base = Math.trunc(100 * (crewFor(game) / (15 * tc)));
  return Math.max(1, Math.min(75, base + (10 - roll)));
}

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// FUN_100131c0, one click in the plunder dialog. item: 1 Abort, 2 Cargo, 3 Credits, 4 Ammo, 6 Fuel,
// 7 Capture. What you take is reported in the status bar (FUN_1001c7dc, 0xf0 ticks), not in the
// dialog. A take multiplies the self-destruct chance (cargo and ammo x2, credits x1.25, fuel x1.5)
// and arms it: the next click, unless it is Abort, first rolls Rand(100) <= chance and on a hit the
// ship blows up. A button with nothing behind it only plays a sound.
// Returns { text, close, destroyed, choose } (choose: the capture worked; ask escort or own ship).
export function plunder(game, ship, what) {
  const item = { abort: 1, cargo: 2, credits: 3, ammo: 4, fuel: 6, capture: 7 }[what] ?? what;
  const b = boardState(game, ship), p = game.pilot, D = game.data, P = game.player;
  const say = t => { game.message(t, 'msg', 0xf0); return t; };
  if (item === 1) { b.armed = false; return { close: true, text: '' }; }
  if (b.armed && game.rng.rand(100) <= b.trip) {
    ship.pool = -(ship.stats.armorMax + 1); ship.death = 0; game.startDeath(ship);
    return { text: say('Oops! You tripped this ship’s security self-destruct mechanism.'), close: true, destroyed: true };
  }
  b.armed = false;
  let text = '';
  if (item === 2) {
    if (!b.cargo) return { text: '', sound: true };
    const n = Math.min(b.cargo.qty, game.cargoCapacity() - game.cargoUsed());
    if (n < 1) text = say('You couldn’t store any of the cargo you salvaged from this ship.');
    else { p.cargo[b.cargo.type] += n; text = say(`You salvaged ${n} tons of ${D.str(4000, b.cargo.type)} from this ship.`); }
    b.cargo = null; b.trip = Math.trunc(b.trip * 2); b.armed = true;
  } else if (item === 3) {
    if (!(b.credits > 0)) return { text: '', sound: true };
    p.credits += b.credits; b.credits = 0; text = say('You stole all the credits from this ship.');
    b.trip = Math.trunc(b.trip * 1.25); b.armed = true;
  } else if (item === 4) {
    const o = b.ammo && Object.values(D.outf).find(x => x.ModType === 3 && x.ModVal === b.ammo.wid);
    if (!b.ammo || !o) return { text: '', sound: true };
    const w = p.weapons[b.ammo.wid] ??= { count: 0, ammo: 0 };
    let n = 0;
    while (n < b.ammo.qty && (w.ammo ?? 0) < o.Max) { w.ammo = (w.ammo ?? 0) + 1; n++; }
    if (game.player.weapons[b.ammo.wid]) game.player.weapons[b.ammo.wid].ammo = w.ammo;
    if (n < 1) text = say('You couldn’t store any of the ammo you salvaged from this ship.');
    else text = say(`You salvaged ${NUMBER_WORDS[n] ?? n} ${D.str(n < 2 ? 5004 : 5005, o.index)} from this ship.`);
    b.ammo = null; b.trip = Math.trunc(b.trip * 2); b.armed = true;
  } else if (item === 6) {
    if (!(b.fuel > 0)) return { text: '', sound: true };
    const n = Math.min(b.fuel, P.stats.fuelMax - P.fuel);
    if (n < 1) text = say('You couldn’t store any of the fuel you transferred from this ship.');
    else { P.fuel += n; text = say(P.fuel < P.stats.fuelMax ? 'You transferred all of this ship’s fuel to your tanks.' : 'You filled your tanks with fuel from this ship.'); }
    b.fuel = 0; b.trip = Math.trunc(b.trip * 1.5); b.armed = true;
  } else if (item === 7) return capture(game, ship);
  return { text };
}

// Capture (item 7): a govt with flag 0x800 can't be taken (odds -1). Rand(100) > odds fails and ends the
// boarding; one success in ten trips the self-destruct; otherwise you need a free escort place (fewer
// than 6 non-mission escorts, FUN_10065b30) and then choose escort or own ship (DLOG 1018).
export function capture(game, ship) {
  const b = boardState(game, ship), G = game.data.govtOf(ship.govt), say = t => { game.message(t, 'msg', 0xf0); return t; };
  const odds = G && (G.Flags & 0x800) ? -1 : b.odds;
  if (odds < game.rng.rand(100) || odds < 1) return { text: say('Your attempt to capture this ship was unsuccessful.'), close: true };
  if (game.rng.rand(10) === 0) {
    ship.pool = -32000; ship.death = 0; game.startDeath(ship);
    return { text: say(' Oops! You tripped this ship’s security self-destruct mechanism.'), close: true, destroyed: true };
  }
  const n = game.ships.filter(s => s?.alive && s.leader === 0 && s.ai === 6 && !(s.mission >= 0)).length;
  if (n >= 6) return { text: say('You already have your maximum number of escorts.'), close: true };
  return { text: '', close: true, choose: true };
}
// "Use As Escort": the ship joins with empty shields.
export function captureAsEscort(game, ship) {
  ship.ai = 6; ship.leader = 0; ship.hired = false; ship.govt = -1; ship.pers = -1; ship.target = -1;
  ship.mission = -1; ship.plundered = true; ship.facing = game.rng.rand(360);
  computeStats(game.data, ship); ship.pool = 0;
  game.message('You assigned this ship to your fleet of escorts.', 'msg', 0xf0);
}
