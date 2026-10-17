// Spaceport services (EV 1.0.5, research deep-economy-save §3-6). Each function takes the Game
// and returns { ok, msg } so a UI (or a server handling a client request) can report the result.
import { markNebulae } from './pilot.js';
import { SPOB, MOD } from './data.js';
import { outfitSum, computeStats } from './ships.js';

const BASE = data => (data.strings[4004] ?? ['120', '240', '600', '420', '180', '360']).map(Number);
export const COMMODITY_COUNT = 6;

function priceScale(game, P) {
  let f = 1.25;
  if (P.Govt >= 128 && game.pilot.legalIn(P.System) < 0) f = 1.1;
  if (game.pilot.dominated[P.id]) f = 1.5;
  return f;
}

// [{ name, level: 'Low'|'Med'|'High', price }] or null when not traded.
export function commodityPrices(game, P) {
  const base = BASE(game.data), f = priceScale(game, P), out = [];
  for (let i = 0; i < COMMODITY_COUNT; i++) {
    const nib = (P.Flags >>> (28 - 4 * i)) & 0xf;
    const lvl = nib & 1 ? 1 : nib & 2 ? 2 : nib & 4 ? 4 : 0;
    if (!lvl) { out.push(null); continue; }
    let price = Math.max(5, lvl === 1 ? Math.trunc(base[i] / f) : lvl === 2 ? base[i] : Math.trunc(f * base[i]));
    let event = 0;
    // Active price events (oops) at this spob replace the price with base + delta.
    for (const o of Object.values(game.data.oops)) {
      const st = game.pilot.oops?.[o.id];
      if (st && st.days > 0 && st.spob === P.id && o.Commodity === i) { price = Math.max(5, base[i] + o.PriceDelta); event = Math.sign(o.PriceDelta); }
    }
    out.push({ i, name: game.data.str(4000, i), level: lvl === 1 ? 'Low' : lvl === 2 ? 'Med' : 'High', price, event });
  }
  return out;
}

// Junk (special cargo): bought cheaply where it is sold (SoldAt) and sold dear where it is wanted (BoughtAt).
export function junkPrices(game, P) {
  const f = priceScale(game, P), out = [];
  for (const j of Object.values(game.data.junk)) {
    if (j.SoldAt === P.id) out.push({ j, price: Math.trunc(j.BasePrice / f), buy: true, sell: false });
    else if (j.BoughtAt === P.id) out.push({ j, price: Math.trunc(f * j.BasePrice), buy: false, sell: true });
  }
  return out;
}
export function buyJunk(game, P, id, step = 10) {
  const r = junkPrices(game, P).find(x => x.j.id === id && x.buy); if (!r) return { ok: false };
  const free = cargoCapacity(game) - cargoUsed(game), q = Math.max(0, Math.min(step, free, Math.floor(game.pilot.credits / Math.max(1, r.price))));
  if (q <= 0) return { ok: false, msg: free <= 0 ? 'Your cargo hold is full.' : 'You can’t afford any more.' };
  game.pilot.junk[id] = (game.pilot.junk[id] ?? 0) + q; game.pilot.credits -= q * r.price;
  return { ok: true };
}
export function sellJunk(game, P, id, step = 10) {
  const r = junkPrices(game, P).find(x => x.j.id === id && x.sell), own = game.pilot.junk[id] ?? 0; if (!r || own <= 0) return { ok: false };
  const n = own % step === 0 ? step : own % step;
  game.pilot.junk[id] = own - n; game.pilot.credits += n * r.price;
  return { ok: true };
}

export const cargoCapacity = game => game.data.ship[game.pilot.shipType].Holds + outfitSum(game.data, game.pilot.outfits, MOD.CARGO);
export const cargoUsed = game => game.pilot.cargo.reduce((a, b) => a + b, 0) + Object.values(game.pilot.junk ?? {}).reduce((a, b) => a + b, 0)
  + (game.pilot.missions ?? []).reduce((a, m) => a + (m?.active && m.loaded && m.cargoQty > 0 ? m.cargoQty : 0), 0);

export function buyCommodity(game, P, i, step = 10) {
  const c = commodityPrices(game, P)[i]; if (!c) return { ok: false };
  const free = cargoCapacity(game) - cargoUsed(game);
  const q = Math.max(0, Math.min(step, free, Math.floor(game.pilot.credits / c.price)));
  if (q <= 0) return { ok: false, msg: free <= 0 ? 'Your cargo hold is full.' : 'You can’t afford any more.' };
  game.pilot.cargo[i] += q; game.pilot.credits -= q * c.price;
  return { ok: true };
}
export function sellCommodity(game, P, i, step = 10) {
  const c = commodityPrices(game, P)[i], own = game.pilot.cargo[i]; if (!c || own <= 0) return { ok: false };
  const n = own % step === 0 ? step : own % step;
  game.pilot.cargo[i] -= n; game.pilot.credits += n * c.price;
  return { ok: true };
}

export function maxFuel(game) { return game.data.ship[game.pilot.shipType].Fuel + outfitSum(game.data, game.pilot.outfits, MOD.FUEL); }
export function refuelCost(game) { return game.pilot.dominated[game.landed] ? 0 : Math.max(0, maxFuel(game) - game.pilot.fuel); }
export function refuel(game) {
  let n = maxFuel(game) - game.pilot.fuel;
  if (n <= 0) return { ok: false };
  if (!game.pilot.dominated[game.landed]) { n = Math.min(n, game.pilot.credits); game.pilot.credits -= n; }
  game.pilot.fuel += n;
  return { ok: n > 0 };
}

// Tech discount and rounding 0x1004a914 (also used for ships, trade-ins and escorts).
export function discountPrice(cost, itemTech, spobTech) {
  if (itemTech < 6 && spobTech < 6 && itemTech < spobTech && cost >= 100) cost = Math.trunc(cost * 0.01 * (100 - 3 * (spobTech - itemTech)));
  if (cost >= 100001) cost = Math.trunc(cost / 1000) * 1000;
  else if (cost >= 10001) cost = Math.trunc(cost / 100) * 100;
  else if (cost > 100) cost = Math.trunc(cost / 10) * 10;
  return cost;
}
const techOk = (P, tech) => Math.max(1, P.TechLevel) >= tech || [P.SpecialTech1, P.SpecialTech2, P.SpecialTech3].includes(tech);
const bitOk = (game, bit) => {
  const nb = game.data.bitMax ?? 256;
  if (bit >= 0 && bit < nb) return !!game.pilot.bits[bit];
  if (game.data.evo && bit >= 1000 && bit < 1000 + nb) return !game.pilot.bits[bit - 1000];
  return true;
};

export function outfitsFor(game, P) {
  return Object.values(game.data.outf)
    .filter(o => techOk(P, o.TechLevel) && bitOk(game, o.MissionBit))
    .map(o => ({ o, price: discountPrice(o.Cost, o.TechLevel, Math.max(1, P.TechLevel)), owned: game.pilot.outfits[o.id] ?? 0 }));
}

export function freeMass(game) {
  let m = game.data.ship[game.pilot.shipType].FreeMass;
  for (const [id, n] of Object.entries(game.pilot.outfits)) if (n > 0) m -= game.data.outf[id].Mass * n;
  return m;
}
const gunCount = (game, cls) => Object.entries(game.pilot.outfits).reduce((a, [id, n]) => a + ((game.data.outf[id].Flags & cls) && n > 0 ? n : 0), 0);

export function canBuyOutfit(game, P, o, price) {
  const owned = game.pilot.outfits[o.id] ?? 0, T = game.data.ship[game.pilot.shipType];
  if (owned >= o.Max && o.ModType !== MOD.AMMO) return 'You can’t carry any more of these.';
  if ((o.Flags & 1) && gunCount(game, 1) >= T.MaxGun) return 'You have no more room for guns.';
  if ((o.Flags & 2) && gunCount(game, 2) >= T.MaxTur) return 'You have no more room for turrets.';
  if (o.Mass >= 1 && o.Mass > freeMass(game)) return 'You don’t have enough free space for that.';
  // ev_outfit_can_buy 0x10043b68 has no launcher test for ammunition: the running original offers Buy
  // for Missiles on a ship without a rack (orig-84).
  if (o.ModType === MOD.AMMO && o.ModVal >= 128 && (game.pilot.weapons[o.ModVal]?.ammo ?? 0) >= o.Max) return 'You can’t carry any more of these.';
  if (o.ModType === MOD.CARGO && o.ModVal < 0 && Math.abs(o.ModVal) >= cargoCapacity(game) - cargoUsed(game)) return 'You need to empty your cargo hold first.';
  if (game.pilot.credits < price) return 'You can’t afford that.';
  return null;
}

// EVO second modifier pair and ModType 26 (alter mission bit), outfitter FUN_10037ee4 (VERIFIED): a
// purchase sets bit n (n < 1000) or clears bit n-1000; the sell branch never touches the bits.
function evoSecondary(game, o, sold) {
  if (!game.data.evo) return;
  for (const [t, v] of [[o.ModType, o.ModVal], [o.ModType2, o.ModVal2]]) {
    if (t === 26 && v >= 0 && !sold) { if (v < 1000) game.pilot.bits[v] = 1; else game.pilot.bits[v - 1000] = 0; }
    if (!sold && t === MOD.MAP && t !== o.ModType) exploreRadius(game, game.data.spob[game.landed]?.System ?? game.system, v);
  }
}

export function buyOutfit(game, P, id, visit) {
  const o = game.data.outf[id], price = discountPrice(o.Cost, o.TechLevel, Math.max(1, P.TechLevel));
  const why = canBuyOutfit(game, P, o, price); if (why) return { ok: false, msg: why };
  game.pilot.credits -= price; visit.outfitted = true;
  evoSecondary(game, o, false);
  if (o.ModType === MOD.MAP) { exploreRadius(game, P.System, o.ModVal); return { ok: true }; }
  if (o.ModType === MOD.CLEAN) { for (const s of game.data.systList) if (s && game.inPlay(s.id) && (o.ModVal === -1 || s.Govt === o.ModVal) && game.pilot.legalIn(s.id) < 0) game.pilot.legal[s.id] = 0; return { ok: true }; }
  if (o.ModType === MOD.AMMO) { const w = game.pilot.weapons[o.ModVal] ??= { count: 0, ammo: 0 }; w.ammo = (w.ammo ?? 0) + 1; game.pilot.outfits[id] = (game.pilot.outfits[id] ?? 0) + 1; return { ok: true }; }
  game.pilot.outfits[id] = (game.pilot.outfits[id] ?? 0) + 1;
  if (o.ModType === MOD.WEAPON && o.ModVal >= 128) { const w = game.pilot.weapons[o.ModVal] ??= { count: 0, ammo: 0 }; w.count++; }
  visit.bought[id] = (visit.bought[id] ?? 0) + 1;
  return { ok: true };
}

export function sellOutfit(game, P, id, visit) {
  const o = game.data.outf[id], own = game.pilot.outfits[id] ?? 0;
  if (own <= 0 || [MOD.CARGO, MOD.ACCEL, MOD.SPEED, MOD.TURN, MOD.MAP].includes(o.ModType)) return { ok: false };
  if (o.ModType === MOD.AMMO) { const w = game.pilot.weapons[o.ModVal]; if (!w || w.ammo <= 0) return { ok: false }; w.ammo--; }
  const price = discountPrice(o.Cost, o.TechLevel, Math.max(1, P.TechLevel));
  const fresh = (visit.bought[id] ?? 0) > 0;
  game.pilot.credits += fresh ? price : Math.trunc(0.8 * price);
  if (fresh) visit.bought[id]--;
  game.pilot.outfits[id] = own - 1;
  evoSecondary(game, o, true);
  if (o.ModType === MOD.WEAPON && game.pilot.weapons[o.ModVal]) { const w = game.pilot.weapons[o.ModVal]; w.count--; if (w.count <= 0) delete game.pilot.weapons[o.ModVal]; }
  if (o.ModType === MOD.CARGO) clampCargo(game);
  return { ok: true };
}
function clampCargo(game) {
  let over = cargoUsed(game) - cargoCapacity(game);
  for (let i = COMMODITY_COUNT - 1; i >= 0 && over > 0; i--) { const n = Math.min(over, game.pilot.cargo[i]); game.pilot.cargo[i] -= n; over -= n; }
}

// The map outfit's walk (EVO 0x1005cdc8, EV 0x100647ec): depth first in link-slot order with one
// visited flag per system, so a system first reached by a long path isn't walked again from a shorter
// one (kept). Each visited system is explored (level 2) and its nebulae marked; only links in play
// are followed.
export function exploreRadius(game, from, jumps) {
  const seen = new Set();
  const walk = (s, depth) => {
    if (depth > jumps || seen.has(s)) return;
    seen.add(s);
    markNebulae(game.data, game.pilot, s);
    game.pilot.explored[s] = Math.max(2, game.pilot.explored[s] ?? 0);
    for (const l of game.data.links(s)) if (game.inPlay(l)) walk(l, depth + 1);
  };
  walk(from, 0);
}

// ---------- shipyard ----------
export function shipsFor(game, P, hire = false) {
  return Object.values(game.data.ship).filter(T => T.id !== 191 && techOk(P, T.TechLevel) && bitOk(game, T.MissionBit) && !(hire && T.MissionBit >= 0))
    .map(T => ({ T, price: discountPrice(T.Cost, T.TechLevel, Math.max(1, P.TechLevel)) }));
}
export function tradeIn(game) {
  let v = Math.trunc(0.25 * game.data.ship[game.pilot.shipType].Cost);
  for (const [id, n] of Object.entries(game.pilot.outfits)) { const o = game.data.outf[id]; if (n > 0 && !(o.Flags & 4)) v = Math.trunc(v + 0.95 * (o.Cost * n)); }
  return v;
}
export function shipNetPrice(game, P, T) {
  const tech = Math.max(1, P.TechLevel), cur = game.data.ship[game.pilot.shipType];
  const price = discountPrice(T.Cost, T.TechLevel, tech);
  const t = discountPrice(discountPrice(tradeIn(game), cur.TechLevel, tech), cur.TechLevel, tech);   // applied twice, as the original
  return { price, tradeIn: t, net: Math.max(price - t, 0) };
}
export function buyShip(game, P, id, visit) {
  const T = game.data.ship[id], { price, tradeIn: t, net } = shipNetPrice(game, P, T);
  if (game.pilot.credits < net) return { ok: false, msg: 'You can’t afford that ship.' };
  game.pilot.credits += t; game.pilot.credits -= price;
  game.pilot.shipType = id;
  for (const [oid, n] of Object.entries(game.pilot.outfits)) if (n > 0 && !(game.data.outf[oid].Flags & 4)) delete game.pilot.outfits[oid];
  game.pilot.weapons = {};
  for (let i = 0; i < 4; i++) { const w = T.WeapType[i]; if (w >= 128 && T.WeapCount[i] > 0) { const x = game.pilot.weapons[w] ??= { count: 0, ammo: 0 }; x.count += T.WeapCount[i]; x.ammo += Math.max(0, T.AmmoLoad[i]); } }
  game.pilot.fuel = T.Fuel;
  clampCargo(game);
  visit.boughtShip = true;
  return { ok: true };
}
export function hireEscort(game, P, id) {
  // 0x10044928: enabled while credits >= trunc(price / 10); the charge is trunc(credits - price * 0.1)
  const T = game.data.ship[id], full = discountPrice(T.Cost, T.TechLevel, Math.max(1, P.TechLevel)), price = Math.trunc(0.1 * full);
  if (game.pilot.credits < price) return { ok: false, msg: 'You can’t afford to hire that escort.' };
  if (game.pilot.escorts.length >= 35) return { ok: false };
  game.pilot.credits = Math.trunc(game.pilot.credits - 0.1 * full); game.pilot.escorts.push({ type: id, hired: true });
  return { ok: true };
}

// Leaving the spaceport: days pass for outfitting (1) and a ship purchase (4), then launch.
export function takeOff(game, visit = {}) {
  if (visit.outfitted) game.dayTick();
  if (visit.boughtShip) for (let i = 0; i < 4; i++) game.dayTick();
  game.pilot.fuel = Math.min(game.pilot.fuel, maxFuel(game));
  game.launch();
}

export const newVisit = () => ({ outfitted: false, boughtShip: false, bought: {} });
export const spobHas = (game, P, bit) => game.data.spobFlag(P, bit);
export { SPOB };
