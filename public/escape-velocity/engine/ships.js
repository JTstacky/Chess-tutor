// Ship instances and their derived stats (EV 1.0.5 stat getters, research deep-physics §2).
// A ship is a plain object so the whole world can be serialised for saves and network state.
import { MOD } from './data.js';

export const POD_TYPE = 191;          // ship id 0x3f+128: escape pod, invulnerable
export const NO_SHIP = -1;
// The speed scale S (DAT_1007f8c0, 1.0..3.0 from the CPU calibration 0x1005d1e4, or (v + 50)/100 from the
// Game Speed slider). Like the original it is one global: positions move by velocity x S each frame,
// turn rates are trunc(turn x S) (FUN_100622b0), shield-regen periods trunc(period / S) >= 1
// (FUN_10061fe0) and shot lifetimes trunc(Count / S) (FUN_1001d914). Frame-counter timers don't scale.
export const SPEED = { S: 1 };

// Sum ModVal*count over owned outfits of one ModType (player only; NPCs own no outfits).
// Override outfits carry a second pair (ModType2/ModVal2); every EVO getter loops both.
export function outfitSum(data, outfits, modType) {
  let s = 0;
  for (const [id, n] of Object.entries(outfits ?? {})) {
    const o = data.outf[id]; if (!o || n <= 0) continue;
    if (o.ModType === modType) s += o.ModVal * n;
    if (o.ModType2 === modType) s += o.ModVal2 * n;
  }
  return s;
}
export const hasOutfit = (data, outfits, modType) =>
  Object.entries(outfits ?? {}).some(([id, n]) => n > 0 && (data.outf[id]?.ModType === modType || data.outf[id]?.ModType2 === modType));
// ModVals of the owned outfits of one ModType (for bit-field mods such as EVO jammers).
export const outfitVals = (data, outfits, modType) => {
  const v = [];
  for (const [id, n] of Object.entries(outfits ?? {})) {
    const o = data.outf[id]; if (!o || n <= 0) continue;
    if (o.ModType === modType) v.push(o.ModVal);
    if (o.ModType2 === modType) v.push(o.ModVal2);
  }
  return v;
};
// EVO skill multiplier FUN_100616c8: 0.01*(100 - SkillVar + Rand(2*SkillVar+1)), SkillVar default 10.
export function rollSkill(data, rng, type) {
  if (!data.evo) return 1;
  const v = data.ship[type]?.SkillVar > 0 ? data.ship[type].SkillVar : 10;
  return Math.fround(0.01 * (100 - v + rng.rand(2 * v + 1)));
}

// Recompute the cached stats of a ship. `o` is the outfit table for the player, else null.
// Override getters (deep-03): no 1.75/1.25 speed factors; NPC accel/speed x skill; the player and
// the player's escorts get x1.5 top speed unless the pilot chose Strict play.
export function computeStats(data, s, outfits = null) {
  const T = data.ship[s.type], o = t => (s.slot === 0 ? outfitSum(data, outfits, t) : 0);
  const held = s.tractored, special = s.pers === 0x1ff;
  let shield = T.Shield < 0 ? T.Shield * -5 : T.Shield;
  if (s.slot === 0) shield += o(MOD.SHIELD);
  else if (s.pers >= 128 && data.pers[s.pers]) shield = Math.trunc(shield * data.pers[s.pers].ShieldMod / 100);
  let interval = T.ShieldRe;
  if (s.slot === 0) interval += o(MOD.RECHARGE); else if (s.leader !== 0) interval = Math.trunc(interval * 0.65);
  let turn = T.Maneuver;
  if (s.slot === 0) turn += o(MOD.TURN); else if (held) turn = Math.trunc(turn * 0.333);
  if (special && turn < 6) turn += 1;
  let accel = T.Accel / 10000, speed = T.Speed / 100;
  if (data.evo) {
    const skill = s.skill ?? 1;
    if (s.slot === 0) accel = (accel + o(MOD.ACCEL) / 10000) * 2; else accel *= skill * (held ? 0.333 : 2);
    if (s.slot === 0) speed += o(MOD.SPEED) / 100; else speed *= skill * (held ? 0.333 : 1);
    if (special) { accel *= 2; speed *= 2; }
    if ((s.slot === 0 || s.leader === 0) && !s.strict) speed *= 1.5;
  } else {
    if (s.slot === 0) accel = (accel + o(MOD.ACCEL) / 10000) * 2; else if (held) accel *= 0.333; else accel *= 2;
    if (s.slot === 0) speed = (speed + o(MOD.SPEED) / 100) * 1.75;
    else if (held) speed *= 0.333; else if (s.leader !== 0) speed *= 1.25;
    if (special) { accel *= 2; speed *= 2; }
  }
  const S = SPEED.S;
  turn = Math.trunc(turn * S);
  if (data.evo && T.Maneuver > 0 && turn < 1) turn = 1;                // FUN_1005a27c floor, after x S
  s.stats = {
    shieldMax: shield, armorMax: T.Armor + o(MOD.ARMOR), interval: Math.max(1, Math.trunc(interval / S)),
    turn, accel, speed, baseSpeed: T.Speed / 100, fuelMax: T.Fuel + o(MOD.FUEL),
    holds: Math.abs(T.Holds) + o(MOD.CARGO), mass: T.Mass, crew: Math.max(1, T.Crew),
    jumpDays: Math.max(1, (T.Mass >= 100 ? 2 : 1) + (T.Mass >= 200 ? 1 : 0) + o(MOD.JUMPDAYS)),
    jumpDist: Math.max(0, 1000 + o(MOD.JUMPDIST)),
  };
  return s.stats;
}

// Weapon slots keyed by weapon id: { count, ammo, reload }. Defaults come from the ship type.
export function defaultWeapons(data, type, ammoScale = 1) {
  const T = data.ship[type], w = {};
  for (let i = 0; i < 4; i++) {
    const id = T.WeapType[i];
    if (id >= 128 && data.weap[id] && T.WeapCount[i] > 0) {
      const slot = w[id] ??= { count: 0, ammo: 0, reload: 0 };
      slot.count += T.WeapCount[i];
      slot.ammo += Math.trunc(Math.max(0, T.AmmoLoad[i]) * (data.weap[id].Guidance === 99 ? 1 : ammoScale));
    }
  }
  return w;
}

export function newShip(data, slot, type, init = {}) {
  const s = {
    slot, type, alive: true,
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, desired: 0,
    pool: 0, fuel: 0, govt: -1, ai: 1, state: 0, action: 0, target: -1, dest: -1, landedAt: -2, inspected: -1,
    leader: -1, aggression: 0, pers: -1, dude: -1, credits: 10000, defends: -1,
    delay: 0, jump: 0, jumpTicks: 0, death: 0, grudge: 0, tractored: false, fire: false,
    weapons: {}, selected: -1, mount: 0, disabledSeen: false, plundered: false, threat: 0,
    thrust: 0, cap: 0, jumpStart: 0,
    ...init,
  };
  computeStats(data, s);
  s.pool = s.stats.shieldMax; s.fuel = s.stats.fuelMax;
  return s;
}

export const isDisabled = s => s.slot !== 0 && s.defends === -1 && s.pool < 0 && s.pool * 100 < -33.333 * s.stats.armorMax;
export const isDead = s => s.death > 0 || (s.pool < 0 && s.pool < -s.stats.armorMax);
