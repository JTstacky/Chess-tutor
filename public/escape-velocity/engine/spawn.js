// NPC spawning (EV 1.0.5, research deep-ai-spawn §5). Governments are kept as resource ids
// (128+, -1 = independent); the original works in 0-based indices, hence the -128s below.
import { newShip, defaultWeapons, computeStats, rollSkill } from './ships.js';
import { addPolar, wrap } from './trig.js';
import { rollAfterburner } from './ai.js';

export const ARRIVAL_RADIUS = 2098.005;   // 1000 + sum(50 - 1.165k)

const cum = probs => { let s = 0; return probs.map(p => (s += p)); };
// Smallest i with roll+1 <= cum[i] and entry valid.
function pickSmallest(entries, probs, roll) {
  const c = cum(probs);
  for (let i = 0; i < 4; i++) if (roll + 1 <= c[i] && entries[i] >= 0) return i;
  return -1;
}

// EVO MissionBit gates (flët VERIFIED): -1 none, <1000 bit must be set, 1000+ the bit (n-1000) must
// be clear. EV has no gates. The düde ship slots use their own rule, dudeShip below.
export function bitGate(game, bit) {
  if (!game.data.evo || bit == null || bit < 0) return true;
  return bit < 1000 ? !!game.pilot.bits[bit] : !game.pilot.bits[bit - 1000];
}
// Which of a düde's four ship types. EV: Rand(100) against the running % Prob. Override
// (FUN_10061460, VERIFIED): a slot takes part when its MissionBit is -1, 0..511 with that bit set, or
// 1000..1511 with bit n-1000 clear (any other value never); the roll is Rand(sum of the taking-part
// slots' % Prob) against their running sum, repeated until it lands on a slot whose type exists.
export function dudeShip(game, dude) {
  const types = dude.ShipTypes.map(x => (x >= 128 ? x - 128 : -1));
  if (!game.data.evo) { const r = game.rng.rand(100); return { j: pickSmallest(types, dude['% Prob'], r), r, types }; }
  const bits = game.pilot.bits, P = dude['% Prob'];
  const on = (dude.MissionBit ?? [-1, -1, -1, -1]).map(b => b === -1 || (b >= 0 && b <= 0x1ff ? !!bits[b] : b > 999 && b < 0x5e8 && !bits[b - 1000]));
  let sum = 0; const c = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) if (on[i]) { sum += P[i]; for (let k = 0; k <= i; k++) if (on[k]) c[i] += P[k]; }
  if (sum < 1 || !types.some((t, i) => on[i] && t >= 0)) return { j: -1, r: -1, types };
  for (;;) {
    const r = game.rng.rand(sum);
    let j = -1;
    for (let i = 3; i >= 0; i--) if (r + 1 <= c[i] && on[i] && types[i] >= 0) j = i;
    if (j >= 0) return { j, r, types };
  }
}
// EVO dude-spawned ships roll a skill multiplier for acceleration and top speed.
function applySkill(game, s) {
  if (!game.data.evo) return s;
  s.skill = rollSkill(game.data, game.rng, s.type); computeStats(game.data, s); s.pool = s.stats.shieldMax;
  return s;
}

export function freeSlot(game) {
  for (let i = 1; i < 36; i++) if (!game.ships[i]?.alive) return i;
  return -1;
}

// FUN_1001a2ac, ordinary branch: one attempt. Returns the roll result (as the reference
// vectors describe it) and, unless dryRun, the created ship.
export function rollDude(game, sys) {
  const { rng, data } = game, S = data.syst[sys];
  const sd = S.DudeTypes.map(x => (x >= 128 ? x - 128 : -1));
  const r1 = rng.rand(100), di = pickSmallest(sd, S['% Prob'], r1);
  if (di < 0) return null;
  const dude = data.dude[128 + sd[di]];
  const { j: sj, r: r2, types } = dudeShip(game, dude);
  if (sj < 0) return null;
  const x = rng.rand(1500) - 750, y = rng.rand(1500) - 750;
  const aggression = rng.rand(3) ^ 2;
  return { dude: dude.id, type: 128 + types[sj], ai: dude.AIType, govt: dude.Govt >= 128 ? dude.Govt : -1, x, y, aggression, rolls: [r1, r2] };
}

export function makeNpc(game, slot, r, extra = {}) {
  const s = newShip(game.data, slot, r.type, {
    x: r.x, y: r.y, ai: r.ai, govt: r.govt, aggression: r.aggression, dude: r.dude ?? -1, credits: 10000, ...extra,
  });
  s.weapons = defaultWeapons(game.data, r.type, 1.75);
  s.facing = s.desired = game.rng.rand(360);
  if (game.data.evo) s.afterburner = rollAfterburner(game, r.type);
  game.ships[slot] = s;
  return s;
}

// Arrival from hyperspace: radius 2098 behind, 50 px/step along the facing, decelerating 1.165/step.
export function placeArrival(game, s) {
  s.facing = s.desired = game.rng.rand(360);
  const p = { x: 0, y: 0 }; addPolar(p, wrap(s.facing + 180), ARRIVAL_RADIUS);
  s.x = p.x; s.y = p.y;
  const v = { x: 0, y: 0 }; addPolar(v, s.facing, 50); s.vx = v.x; s.vy = v.y;
  s.jump = -999; s.state = 8;
}

function linkOk(game, link, sys) {
  const g = game.data.syst[sys].Govt, G = game.data.govtOf(g);
  if (link === -1) return true;
  if (link >= 128 && link < 10000) return link === sys;
  if (link >= 10000 && link < 15000) return g === link - 10000 + 128;
  if (link >= 15000 && link < 20000) return !!G && G.Ally === link - 15000 + 128;
  if (link >= 20000 && link < 25000) return g !== link - 20000 + 128;
  if (link >= 25000 && link < 30000) return !!G && G.Enemy === link - 25000 + 128;
  return false;
}

function spawnPers(game, sys) {
  const id = 128 + game.rng.rand(510), P = game.data.pers[id];
  if (!P || P.AIType <= 0 || !game.pilot.persAlive(id) || !linkOk(game, P.LinkSyst, sys)) return null;
  if (P.MissionBit >= 0 && !game.pilot.bits[P.MissionBit]) return null;
  if (game.ships.some(s => s?.alive && s.pers === id)) return null;
  const slot = freeSlot(game); if (slot < 0) return null;
  const aggr = P.Aggress < 1 ? 1 : P.Aggress > 2 ? 4 : P.Aggress;
  const s = makeNpc(game, slot, { type: P.ShipType, ai: P.AIType, govt: P.Govt >= 128 ? P.Govt : -1, x: 0, y: 0, aggression: aggr }, { pers: id, credits: P.Credits });
  computeStats(game.data, s); s.pool = s.stats.shieldMax;
  // Pers weapons modify the ship's defaults (negative counts remove copies).
  for (let i = 0; i < 4; i++) {
    const w = P.WeapType[i]; if (!(w >= 128) || !game.data.weap[w]) continue;
    const slot = s.weapons[w] ??= { count: 0, ammo: 0, reload: 0 };
    slot.count = Math.max(0, slot.count + P.WeapCount[i]); slot.ammo += Math.max(0, P.AmmoLoad[i]);
    if (slot.count === 0) delete s.weapons[w];
  }
  if (game.data.govtOf(s.govt)?.Flags & 0x800) s.pool = -Math.trunc(0.66 * s.stats.armorMax);
  return s;
}

function spawnFleet(game, sys, arrive) {
  const F = game.data.flet[128 + game.rng.rand(128)];
  if (!F || !linkOk(game, F.LinkSyst, sys) || !bitGate(game, F.MissionBit)) return null;
  const slot = freeSlot(game); if (slot < 0) return null;
  const lead = makeNpc(game, slot, { type: F.LeadShipType, ai: game.data.ship[F.LeadShipType].InherentAI, govt: F.Govt >= 128 ? F.Govt : -1,
    x: game.rng.rand(1500) - 750, y: game.rng.rand(1500) - 750, aggression: game.rng.rand(3) ^ 2 });
  if (arrive) placeArrival(game, lead);
  for (let g = 0; g < 4; g++) {
    const t = F.EscortType[g]; if (!(t >= 128)) continue;
    const n = F.Min[g] + game.rng.rand(F.Max[g] - F.Min[g] + 1);
    for (let k = 0; k < n; k++) {
      const es = freeSlot(game); if (es < 0) break;
      const e = makeNpc(game, es, { type: t, ai: 6, govt: lead.govt, x: lead.x + game.rng.rand(300) - 150, y: lead.y + game.rng.rand(300) - 150, aggression: lead.aggression }, { leader: lead.slot });
      computeStats(game.data, e);
      e.facing = e.desired = lead.facing; e.vx = lead.vx; e.vy = lead.vy;
      if (arrive) { e.jump = -999; e.state = 8; }
    }
  }
  return lead;
}

// FUN_1001ac40: 1/7 pers, else 1/7 fleet, else dude.
export function spawnOne(game, sys, arrive) {
  if (game.rng.rand(7) === 0) { const s = spawnPers(game, sys); if (s && arrive) placeArrival(game, s); return s; }
  if (game.rng.rand(7) === 0) return spawnFleet(game, sys, arrive);
  const slot = freeSlot(game); if (slot < 0) return null;
  const r = rollDude(game, sys); if (!r) return null;
  const s = applySkill(game, makeNpc(game, slot, r));
  if (arrive) placeArrival(game, s);
  return s;
}

// FUN_1001b6fc: every full step.
export function periodicSpawn(game) {
  const S = game.data.syst[game.system];
  const n = game.ships.filter(s => s?.alive && s.slot !== 0 && s.leader !== 0).length;
  if (n >= S.AvgShips || game.rng.rand(500) !== 0) return;
  const r = game.rng.rand(100) + 1, c = cum(S['% Prob']);
  if (!c.some((v, i) => r <= v && S.DudeTypes[i] >= 0)) return;
  spawnOne(game, game.system, true);
}

// FUN_10019ad0: on entering a system.
export function systemEntry(game) {
  const S = game.data.syst[game.system];
  for (let i = 0; i < S.AvgShips; i++) spawnOne(game, game.system, false);
  const d = game.pilot.defenders ??= {};
  for (const p of game.data.spobs(game.system)) d[p.id] ??= defenderCount(p.DefCount);
}

export function defenderCount(raw) {
  if (raw < 1001) return raw;
  if (raw < 10001) return Math.trunc(raw / 10) - 100;
  return Math.trunc(raw / 10) - 1000;
}

// FUN_1001fadc: a planet launches one defender (AI 3, attacks the player).
export function launchDefender(game, p, prepaid = false) {
  const d = game.pilot.defenders ??= {}, left = d[p.id] ??= defenderCount(p.DefCount);
  if ((!prepaid && left <= 0) || !(p.DefDude >= 128)) return null;
  const dude = game.data.dude[p.DefDude]; if (!dude) return null;
  const slot = freeSlot(game); if (slot < 0) return null;
  const { j, types } = dudeShip(game, dude); if (j < 0) return null;
  const s = makeNpc(game, slot, { type: 128 + types[j], ai: 3, govt: p.Govt >= 128 ? p.Govt : -1,
    x: p.xPos + game.rng.rand(80) - 40, y: p.yPos + game.rng.rand(80) - 40, aggression: 4 }, { defends: p.id, target: 0 });
  applySkill(game, s);
  if (!prepaid) d[p.id] = left - 1;
  return s;
}
