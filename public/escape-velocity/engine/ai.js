// NPC behaviour, EV 1.0.5 (research deep-ai-spawn, and the asm; docs/re-gaps.md #1-#5).
// One ship thinks per even frame (FUN_10015bc4): FUN_1000001c runs the routine of its AI type, which
// sets the state (+0x972); FUN_10001d78 turns the state into an action (+0x974); the action executor
// FUN_10003650 sets the desired heading (+0x22), the thrust (+0x97e), a speed cap (+0x986) and the
// fire flag (+0x6d) with the selected weapon (+0x2c). Those stay set until the ship's next turn, and
// npcStep (the NPC part of FUN_10018054) applies them every step.
// Original quirks kept on purpose: heading errors are raw differences (359 vs 1 is 358, not 2), box
// tests use coordinates cut to 16 bits, and FUN_10060dfc ("distance squared") is the difference of
// the two ships' squared distances from the system centre.
import { addPolar, bearing, thrustLimited, wrap } from './trig.js';
import { isDisabled, isDead, SPEED } from './ships.js';
import { fireWeapon, leadAim } from './combat.js';

export const ACT = { IDLE: 0, BRAKE: 1, TO_SPOB: 2, OUTWARD: 3, JUMP: 4, FLEE: 5, ATTACK: 6, MISSILES: 7, DOCK: 8, APPROACH_FAR: 9,
  ARRIVE: 0xa, APPROACH: 0xb, FORMATION: 0xc, FOLLOW_JUMP: 0xd, RETREAT_FIRE: 0xe, PLUNDER: 0xf,
  JINK: 16, BOOST: 17 };                               // 16/17 exist only in Override
// States (+0x972). The names follow the original's debug strings at 0x1007af8a where they align.
export const ST = { IDLE: 0, GO_SPOB: 1, LEAVE: 2, FLEE: 3, ATTACK: 4, RETURN: 5, HOLD: 6, INSPECT: 7, ARRIVE: 8,
  REFUEL: 9, FOLLOW: 10, FOLLOW_JUMP: 0xb, FORMATION: 0xc, HIJACK: 0xd };
const POD_INDEX = 0x3f;

// EVO FUN_1006115c: a roll that grows with the player's combat rating.
export const ratingRoll = game => game.rng.rand(1344) + 256 <= game.pilot.kills;
// EVO FUN_100610c0: ship Flags 0x40 always has an afterburner, 0x20 only on a rating roll.
export function rollAfterburner(game, type) {
  const f = game.data.ship[type]?.Flags ?? 0;
  return !!(f & 0x40) || (!!(f & 0x20) && ratingRoll(game));
}

// ---------- small helpers ----------
const i16 = v => (Math.trunc(v) << 16) >> 16;                 // (short)(int)v
const sabs = v => Math.abs(i16(v));                            // |(short)(int)v| as the asm compares it
const shipAt = (game, i) => (i >= 0 && i < 36 ? game.ships[i] : null);
const active = (game, i) => !!shipAt(game, i)?.alive;
const typeIndex = (game, s) => game.data.ship[s.type]?.index ?? -1;
const inherentAI = (game, s) => game.data.ship[s.type]?.InherentAI ?? 1;
const maneuver = (game, s) => game.data.ship[s.type]?.Maneuver ?? 0;   // shïp +2, raw
const govt = (game, g) => game.data.govtOf(g);
const turn = s => Math.trunc(s.stats.turn);                    // FUN_100622b0
const aimed = (s, k) => Math.abs(s.desired - s.facing) < k;    // raw heading difference
const accelOf = s => s.stats.accel;                            // FUN_10062400
const speedOf = s => s.stats.speed;                            // FUN_10062548
const cloaked = game => !!game.pilot.cloaked;
const sysGovt = game => game.data.syst[game.system]?.Govt ?? -1;
const legal = game => game.pilot.legalIn(game.system);
const mission = (game, s) => (s.mission >= 0 ? game.pilot.missions[s.mission] : null);
const missionActive = (game, s) => !!mission(game, s)?.active;
// FUN_10060dfc(a, b): |a|^2 - |b|^2 with 16-bit coordinates.
const dist2diff = (a, b) => { const ax = i16(a.x), ay = i16(a.y), bx = i16(b.x), by = i16(b.y); return ax * ax + ay * ay - (bx * bx + by * by); };
const fromCentre2 = s => Math.abs(dist2diff(s, { x: 0, y: 0 }));
// TickCount (60 Hz) for the hyperspace timers; one tick per step.
const ticks = game => game.tickCount?.() ?? (game.steps ?? 0);
// Is ship s in one of the states 7, 9, 10, 11, 5, 12 (busy with something other than fighting)?
const busy = s => [7, 9, 10, 11, 5, 12].includes(s.state);

// ---------- governments ----------
// FUN_10007de8, government part. Ids are resource ids (-1 independent).
export function hostile(data, a, b) {
  if (a < 0 || b < 0 || a === b) return false;
  const A = data.govtOf(a), B = data.govtOf(b);
  if (!A || !B) return false;
  if (A.Enemy === b || B.Enemy === a) return true;
  if ((B.Flags & 1) && b !== A.Ally && a !== B.Ally) return true;
  for (const K of data.govtList) {
    if (!K) continue;
    if ((K.Ally === a || K.id === A.Ally) && K.Enemy === b) return true;
  }
  return false;
}
// FUN_10007de8: would ship a fight ship b?
export function shipsHostile(game, a, b) {
  if (!a || !b || a.slot === b.slot || !a.alive || !b.alive || b.pers === 0x1ff) return false;
  return hostile(game.data, a.govt, b.govt);
}

// The legal-record test of FUN_100063d0 (and the hail code): does govt g attack the player here?
export function attackByRecord(data, g, S, legalRec) {
  const gs = data.govtOf(g);
  if (!gs) return false;
  if (g === S) return legalRec < -gs.CrimeTol;
  if (!(S >= 128)) return !!(gs.Flags & 2) && legalRec < gs.CrimeTol * -2;
  const gsys = data.govtOf(S);
  if (gs.Enemy === S || gsys.Enemy === g || (gsys.Flags & 1)) return gs.CrimeTol < legalRec;
  if (gs.Ally === S || gsys.Ally === g) return legalRec < 1.5 * -gs.CrimeTol;
  return !!(gs.Flags & 2) && legalRec < gs.CrimeTol * -2;
}

// FUN_10007078: is this ship attacking the player right now? (Also the radar's red.)
export function attackingPlayer(game, s) {
  return !!s?.alive && s.delay < 1 && !isDisabled(s) && s.target === 0 && !busy(s);
}
// FUN_1000712c: is this ship fighting the player or the player's escorts? (The HUD's hostile.)
export function hostileToPlayer(game, s) {
  if (!s?.alive || isDisabled(s) || s.leader === 0 || s.target === -1) return false;
  if (s.defends !== -1) return true;
  if (s.delay < 1 && !busy(s) && (s.target === 0 || shipAt(game, s.target)?.leader === 0)) return true;
  for (let j = 1; j < 36; j++) {
    const e = game.ships[j];
    if (!e?.alive || e.leader !== s.slot || e.delay >= 1 || isDisabled(e)) continue;
    if (busy(s)) continue;
    if (e.target === 0 || (e.target !== -1 && shipAt(game, e.target)?.leader === 0)) return true;
  }
  return false;
}
// FUN_100074b0(a, b): is ship b attacking ship a?
function attacking(game, a, b) {
  if (!b?.alive || isDisabled(b) || b.leader === a.slot) return false;
  if (b.target === a.slot && !busy(b)) return true;
  for (let j = 1; j < 36; j++) {
    const e = game.ships[j];
    if (e?.alive && e.leader === b.slot && b.target === j && j !== b.slot && !busy(b)) return true;
  }
  return false;
}
// FUN_100077b4: would this ship help the player (distress calls, hails)?
export function friendlyToPlayer(game, s) {
  if (hostileToPlayer(game, s)) return false;
  if (s.leader === 0) return true;
  const D = game.data;
  if (!(s.mission >= 0)) {
    if (s.govt === -1) return true;
    const G = D.govtOf(s.govt), S = sysGovt(game), L = legal(game), GS = D.govtOf(S);
    if (!G) return true;
    if (G.Flags & 1) {
      if (s.govt === S) { if (GS.CrimeTol < L) return true; }
      else if (!(S >= 128)) { if (D.govtList[0].CrimeTol < L) return false; }        // the original reads govt 128 here
      else if (GS.CrimeTol < L) return false;
    }
    if (!(S >= 128)) return !(G.Flags & 2) || -G.CrimeTol <= L;
    if (s.govt === GS.Ally || G.Ally === S) return -GS.CrimeTol <= L;
    if (s.govt === GS.Enemy || G.Enemy === S) return L < -GS.CrimeTol;
    return !(G.Flags & 2) || -GS.CrimeTol <= L;
  }
  const m = mission(game, s);
  if (!m?.active) return false;
  if (m.goal !== 3 && m.goal !== 4) return false;
  return m.behav === 1 || m.behav === 11;
}

// ---------- targeting ----------
// FUN_100085ac: turn on the player.
function targetPlayer(game, s) { s.state = ST.ATTACK; s.dest = -1; s.target = 0; }
// FUN_10008500: start leaving the system.
export function beginLeave(game, s) { s.state = ST.LEAVE; s.jump = 1; s.target = -1; s.jumpStart = ticks(game); }

// FUN_100086a8: a random ship that is attacking the player.
function pickPlayerThreat(game, s) {
  const ok = i => i !== s.slot && i !== 0 && active(game, i) && !isDisabled(game.ships[i]) && !isDead(game.ships[i]) && attackingPlayer(game, game.ships[i]);
  let n = 0; for (let i = 1; i < 36; i++) if (ok(i)) n++;
  if (n < 1) { s.target = -1; return; }
  for (let k = 0; k < 10000; k++) {
    const i = game.rng.rand(0x23) + 1;
    if (ok(i)) { s.dest = -1; s.target = i; s.state = ST.ATTACK; return; }
  }
}
// FUN_1000886c: a random ship that is attacking this ship's leader.
function pickLeaderThreat(game, s) {
  const L = shipAt(game, s.leader);
  const ok = i => {
    const x = game.ships[i];
    if (i === s.slot || i === s.leader || !x?.alive || isDisabled(x)) return false;
    if (i === 0) return !!L && hostileToPlayer(game, L);
    if (s.leader === 0) return hostileToPlayer(game, x);
    return !!L && attacking(game, L, x);
  };
  let n = 0; for (let i = 0; i < 36; i++) if (ok(i)) n++;
  if (n < 1) { s.target = -1; return; }
  for (let k = 0; k < 10000; k++) {
    const i = game.rng.rand(0x24);
    if (ok(i)) { s.dest = -1; s.target = i; s.state = ST.ATTACK; return; }
  }
}
// FUN_100063d0: choose a target.
function pickTarget(game, s) {
  const D = game.data, P = game.ships[0];
  if (s.target !== -1 && active(game, s.target)) return;
  if (s.pers !== -1) {
    if (s.pers === 0x1fe) { targetPlayer(game, s); return; }
    if ((D.pers[s.pers]?.Flags & 1) && game.pilot.persGrudge?.[s.pers]) { targetPlayer(game, s); return; }
  }
  const m = mission(game, s);
  if (m?.active) {
    const b = m.behav;
    if ((b === 0 || b === 10) && !cloaked(game)) { targetPlayer(game, s); return; }
    if (b === 1 || b === 11) {
      if (s.target === 0) s.target = -1;
      if (s.target !== -1) return;
      pickPlayerThreat(game, s);
      if (s.target !== -1) return;
      s.state = ST.FORMATION; s.dest = 0; return;
    }
  }
  if (s.govt !== -1) {
    const G = govt(game, s.govt);
    if (!(G.Flags & 1)) {
      if (s.target === -1) {
        const box = i16(s.aggression * 600);
        const near = Math.abs(s.x - P.x) <= box && Math.abs(s.y - P.y) <= box && !cloaked(game) && !isDead(P);
        if (near && !(G.Flags & 0x40) && attackByRecord(D, s.govt, sysGovt(game), legal(game))) { targetPlayer(game, s); return; }
        const ig = D.ship[P.type]?.InherentGovt ?? -1, IG = D.govtOf(ig);
        if (s.target === -1 && s.leader !== 0 && !(s.mission >= 0) && !(s.auxOf >= 0) && IG
          && (G.Enemy === ig || s.govt === IG.Enemy) && game.rng.rand(0x32) === 0 && !isDead(P)) { targetPlayer(game, s); return; }
      }
    } else {
      // Xenophobes: any ship they are hostile to, the player by the record.
      const S = sysGovt(game);
      const want = i => {
        const x = game.ships[i];
        if (i !== 0 && (i === s.slot || !x?.alive || isDisabled(x) || x.leader === s.slot || x.defends !== -1 || x.pers === 0x1ff || typeIndex(game, x) === POD_INDEX)) return false;
        if (!x || isDead(x) || typeIndex(game, x) === POD_INDEX) return false;
        if (i === 0) return !cloaked(game) && !(G.Flags & 0x40) && (s.govt !== S || legal(game) < 1);
        return shipsHostile(game, s, x);
      };
      let n = 0; for (let i = 0; i < 36; i++) if (want(i)) n++;
      if (n > 0) {
        for (let k = 0; k < 10000 && s.target === -1; k++) {
          const i = game.rng.rand(0x24);
          if (want(i)) { s.target = i; if (i === 0) targetPlayer(game, s); return; }
        }
      }
    }
    for (let i = 1; i < 36; i++) {
      const x = game.ships[i];
      if (i !== s.slot && x?.alive && !isDisabled(x) && shipsHostile(game, s, x)) { s.target = i; return; }
    }
  }
  if (s.ai === 6) {
    const lead = shipAt(game, s.leader)?.slot ?? -1;
    const ok = i => i !== s.slot && i !== lead && active(game, i) && attackingPlayer(game, game.ships[i]);
    let n = 0; for (let i = 1; i < 36; i++) if (ok(i)) n++;
    if (n > 0) for (let k = 0; k < 10000; k++) {
      const i = game.rng.rand(0x24);
      if (ok(i)) { s.target = i; s.state = ST.ATTACK; return; }
    }
  }
}

// FUN_10009728: a pirate govt (flag 0x1000) goes for an unarmed, unplundered trader to board it.
function checkHijack(game, s) {
  const t = shipAt(game, s.target), G = govt(game, s.govt);
  if (s.target > 0 && G && (G.Flags & 0x1000) && t && t.ai < 3 && !(t.mission >= 0) && !t.plundered) s.state = ST.HIJACK;
}
// FUN_100054ac: has this ship already landed here (or is there nothing to land on)?
function doneHere(game, s) {
  const S = game.data.syst[game.system], nav = [S.Nav1, S.Nav2, S.Nav3, S.Nav4].filter(n => n >= 128);
  return nav.length === 0 || nav.includes(s.landedAt);
}
// FUN_1000519c: pick a random landable, inhabited stellar whose govt isn't at war with ours.
function chooseSpob(game, s) {
  const D = game.data, S = D.syst[game.system], nav = [S.Nav1, S.Nav2, S.Nav3, S.Nav4];
  const G = govt(game, s.govt);
  const ok = nav.map(id => {
    const p = id >= 128 ? D.spob[id] : null;
    if (!p) return false;
    const enemy = !!G && p.Govt >= 128 && (G.Enemy === p.Govt || s.govt === D.govtOf(p.Govt)?.Enemy);
    return D.spobFlag(p, 1) && !D.spobFlag(p, 0x20) && !enemy;
  });
  if (!ok.some(Boolean)) return;
  let i; do { i = game.rng.rand(4); } while (!ok[i]);
  s.state = ST.GO_SPOB; s.dest = nav[i];
}
// Traders and warships without anything to do: go somewhere to land, or leave.
function landOrLeave(game, s) {
  if (!doneHere(game, s)) { s.dest = -1; chooseSpob(game, s); if (s.dest === -1) beginLeave(game, s); }
  else beginLeave(game, s);
}
// FUN_10009450: a fleeing ship that would help the player calls for help.
function distress(game, s) {
  if (s.pers !== -1 || (game.msgTicks ?? -1) >= 1) return;
  const P = game.ships[0];
  if (!friendlyToPlayer(game, s) || attacking(game, s, P) || isDead(P)) return;
  const D = game.data, m = mission(game, s);
  const name = m?.shipName ? m.shipName : D.ship[s.type].name;
  const help = D.strings[5003] ?? [];
  const line = help[game.rng.rand(0x14)] ?? '';
  game.beep?.(5);
  game.message(`${name}: ${line}`, 'msg', 0xf0);
}

// ---------- AI types ----------
// FUN_100004d4 (1, wimpy trader) and FUN_100005d4 (2, brave trader).
function aiTrader(game, s, brave) {
  if (isDisabled(s) || s.state === ST.REFUEL) return;
  if (s.state === ST.IDLE) landOrLeave(game, s);
  if (s.grudge > 0 && s.target !== -1) {
    const t = shipAt(game, s.target);
    if (brave && t && sabs(s.x - t.x) < 0x4e3 && sabs(s.y - t.y) < 0x4e3) { if (s.jump < 1) s.state = ST.ATTACK; }
    else if (s.leader === 0) { s.state = ST.FOLLOW; s.dest = 0; }
    else s.state = ST.FLEE;
  }
  if (s.state === ST.FLEE) distress(game, s);
  else if (brave && s.state === ST.ATTACK && s.target > 0 && shipAt(game, s.target)?.ai > 2) distress(game, s);
}

// The govt flags 4 (always attacks the player) and 0x40 (never does), FUN_100007dc / FUN_10000f24.
function govtStance(game, s) {
  const G = govt(game, s.govt);
  if (!G || s.jump <= -900 || s.jump >= 1) return;
  if (!(G.Flags & 4)) { if ((G.Flags & 0x40) && attackingPlayer(game, s)) { s.target = -1; s.state = ST.IDLE; } }
  else if (!attackingPlayer(game, s)) { targetPlayer(game, s); s.target = 0; s.grudge = 1; }
}
const fight = (game, s) => { s.state = ST.ATTACK; checkHijack(game, s); };

// FUN_100007dc (3, warship).
function aiWarship(game, s) {
  if (isDisabled(s) || s.state === ST.REFUEL) return;
  const D = game.data;
  govtStance(game, s);
  if (s.state === ST.IDLE) {
    if (s.target === -1) {
      if (s.jump < 1) {
        pickTarget(game, s);
        if (s.target === -1) landOrLeave(game, s); else fight(game, s);
      }
    } else if (s.jump < 1 && s.state !== ST.INSPECT) fight(game, s);
  }
  if (s.grudge > 0 && s.target !== -1 && s.jump < 1 && s.state !== ST.INSPECT && s.state !== ST.FLEE) fight(game, s);
  if (s.state === ST.GO_SPOB || s.state === ST.LEAVE) {
    if (s.target === -1) {
      pickTarget(game, s);
      if (s.target === -1) {
        let n = 0;
        for (let i = 1; i < 36; i++) { const x = game.ships[i]; if (x?.alive && x.leader === s.slot && x.ai === 5 && x.defends === -1 && !isDisabled(x)) n++; }
        if (n > 0) s.state = ST.HOLD;                       // wait for the fighters
      } else if (s.jump < 1) fight(game, s);
    } else if (s.jump < 1 && s.state !== ST.INSPECT) fight(game, s);
  }
  if (s.state === ST.HOLD) {
    s.target = -1; pickTarget(game, s);
    if (s.target === -1) {
      let n = 0;
      for (let i = 1; i < 36; i++) { const x = game.ships[i]; if (x?.alive && x.leader === s.slot && x.defends === -1 && !isDisabled(x)) n++; }
      if (n === 0) s.state = ST.IDLE;
    }
  }
  if (s.grudge > 0 && s.target !== -1 && s.jump < 1) {
    const G = govt(game, s.govt);
    if (G && s.pool <= 0.25 * s.stats.shieldMax && (G.Flags & 0x100)) s.state = ST.FLEE;
    if (s.state === ST.LEAVE) fight(game, s);
    else if (s.state !== ST.INSPECT && s.state !== ST.FLEE && s.state !== ST.FOLLOW_JUMP) fight(game, s);
  }
  if (s.target !== -1 && s.state !== ST.INSPECT) {
    if (s.jump < 1) fight(game, s);
    let thr = -0x7fff;
    if (s.pers === -1) {
      if (s.aggression === 1) thr = Math.trunc(0.3 * s.stats.shieldMax);
      if (s.aggression === 2) thr = Math.trunc(0.15 * s.stats.shieldMax);
    } else thr = Math.trunc(0.01 * (D.pers[s.pers]?.Coward ?? 0) * s.stats.shieldMax);
    const G = govt(game, s.govt);
    if (s.pool < thr && s.leader === -1 && G && (G.Flags & 0x10) && ![ST.LEAVE, ST.FLEE, ST.FOLLOW_JUMP].includes(s.state)) s.state = ST.FLEE;
  }
}

// FUN_10000f24 (4, interceptor): picks a ship to inspect, or patrols to the first stellar.
// The unregistered-copy bounty hunter (pers 0x1ff) is not part of this game.
function aiInterceptor(game, s) {
  if (isDisabled(s) || s.pers === 0x1ff || s.state === ST.REFUEL) return;
  govtStance(game, s);
  if (s.grudge > 0 && s.target !== -1 && s.state !== ST.INSPECT && s.state !== ST.REFUEL && s.jump < 1) s.state = ST.ATTACK;
  if (s.inspected >= 0 && !active(game, s.inspected)) s.inspected = -1;
  if ((s.state === ST.IDLE || s.state === ST.GO_SPOB) && s.delay < 1) {
    if (s.target === -1) {
      pickTarget(game, s);
      if (s.target !== -1 && s.jump < 1) s.state = ST.ATTACK;
    } else if (s.jump < 1 && active(game, s.target) && s.grudge > 0) s.state = ST.ATTACK;
    if (s.target === -1) {
      const ok = i => {
        const x = game.ships[i];
        return i !== s.slot && x?.alive && i !== s.inspected && x.ai !== 4 && (i !== 0 || !cloaked(game));
      };
      let n = 0; for (let i = 0; i < 36; i++) if (ok(i)) n++;
      if (n > 0) for (let k = 0; k < 10000 && s.target === -1; k++) {
        const i = game.rng.rand(0x24);
        if (!ok(i)) continue;
        s.target = s.inspected = i; s.state = ST.INSPECT;
        if (i === 0) {
          const smuggling = game.pilot.missions.some(m => m?.active && m.loaded && m.scanGovt !== -1 && m.scanGovt === s.govt);
          if (smuggling) {
            const D = game.data, end = [', prepare to be scanned.', ', prepare for a cargo inspection.', ', hold position for a cargo inspection.'][game.rng.rand(3)];
            game.beep?.(5);
            game.message(`${D.ship[s.type].name}: ${game.pilot.shipName}${end}`, 'msg', 400);
          }
        }
      }
    }
    if (s.target === -1 && s.state === ST.IDLE) {
      s.landedAt = -2;
      const nav1 = game.data.syst[game.system].Nav1;
      if (!(nav1 >= 128)) s.state = ST.HOLD; else { s.dest = nav1; s.state = ST.GO_SPOB; }
    }
  }
}

// FUN_10001584 (5, fighter from a carrier bay).
function aiFighter(game, s) {
  if (!isDisabled(s)) {
    if (s.target >= 0 && s.target !== s.leader) {
      s.state = ST.ATTACK;
      if (s.leader !== -1 && shipAt(game, s.leader)?.leader === 0) {
        s.target = -1; s.state = ST.IDLE; s.action = ACT.IDLE;
        pickPlayerThreat(game, s);
        if (s.target === -1) pickLeaderThreat(game, s);
        if (s.target === -1) { s.target = s.leader; s.state = ST.RETURN; }
      }
    }
    if (s.target === -1 && s.state !== ST.HOLD && s.state !== ST.RETURN && s.leader !== -1 && s.defends === -1) {
      const L = shipAt(game, s.leader);
      if (L?.target === -1 && s.leader !== 0) { s.state = ST.RETURN; s.dest = s.leader; }
      else if (s.leader === 0) { s.state = ST.FOLLOW; s.dest = 0; }
      else if (L?.ai === 3 && s.slot !== L.target) { s.state = ST.ATTACK; s.target = L.target; }
    }
    if (shipAt(game, s.leader)?.jump > 0) s.state = ST.FOLLOW_JUMP;
  } else if (s.leader === -1 || s.defends !== -1) s.state = ST.HOLD;
  else { s.state = ST.RETURN; s.action = ACT.IDLE; s.dest = s.leader; }
}

// FUN_100017c8 (6, escort).
function aiEscort(game, s) {
  const L = shipAt(game, s.leader);
  if (s.leader === -1 || !L?.alive || isDisabled(L)) {
    s.leader = -1; s.ai = inherentAI(game, s); s.state = ST.IDLE; s.action = ACT.IDLE;
    return;
  }
  if (s.leader !== 0 && departing(L)) {
    for (let i = 1; i < 36; i++) {
      const x = game.ships[i];
      if (x && hostileToPlayer(game, x) && x.leader !== 0) { s.state = ST.ATTACK; s.target = x.slot; return; }
    }
    return;
  }
  const armed = inherentAI(game, s) > 2;
  if ((s.target === -1 || s.state === ST.IDLE || s.state === ST.FOLLOW) && (s.state === ST.FOLLOW || s.state === ST.FORMATION) && armed && s.delay < 1) {
    if (s.target === -1 || s.target === s.leader) s.grudge = 0;
    if (s.leader === 0) pickPlayerThreat(game, s); else pickLeaderThreat(game, s);
  }
  if (s.grudge > 0 && s.target !== -1 && s.target !== s.leader) {
    if (!armed) {
      const t = shipAt(game, s.target);
      if (t && sabs(s.x - t.x) < 0xfb && sabs(s.y - t.y) < 0xfb) {
        if (inherentAI(game, s) === 1 && ![ST.LEAVE, ST.FLEE, ST.FOLLOW_JUMP].includes(s.state)) s.state = ST.FLEE;
        if (inherentAI(game, s) === 2) s.state = ST.ATTACK;
      } else { s.grudge = 0; s.state = ST.FOLLOW; s.dest = s.leader; s.target = -1; }
    } else {
      s.state = ST.ATTACK;
      if (L.leader === 0) { s.target = -1; s.state = ST.IDLE; s.action = ACT.IDLE; }
    }
  }
  if (s.target === -1 && s.state !== ST.HOLD && s.state !== ST.FOLLOW_JUMP) { s.state = ST.FOLLOW; s.dest = s.leader; }
  // The player's escorts look for a ship attacking the player, then go back to following: they
  // only fight once hit themselves (grudge, set by FUN_10017384).
  if (s.state === ST.FOLLOW && s.leader === 0) { pickPlayerThreat(game, s); s.state = ST.FOLLOW; s.dest = 0; }
}

// FUN_10001c00: a planet's defense ship goes for the player (or keeps an escort of the player).
function aiDefender(game, s) {
  s.delay = 0; s.dest = -1; s.state = ST.ATTACK;
  if (s.target === -1) s.target = 0;
  else if (s.target !== 0 && shipAt(game, s.target)?.leader !== 0) s.target = 0;
}

// FUN_10008edc: is the ship counting down to a hyperjump?
const departing = s => [ST.LEAVE, ST.FOLLOW_JUMP, ST.FLEE].includes(s.state) && (s.action === ACT.JUMP || s.action === ACT.FOLLOW_JUMP);

// ---------- FUN_1000001c: one ship's AI turn ----------
export function think(game, s) {
  if (!s.alive) return;
  if (typeIndex(game, s) === POD_INDEX) {                    // escape pod: straight ahead until its timer runs out
    s.thrust = accelOf(s); s.cap = speedOf(s); s.desired = s.facing;
    if (--s.delay < 0) game.removeShip(s);
    return;
  }
  if (s.mission >= 0 && !missionActive(game, s)) {
    s.mission = -1;
    if (s.leader !== -1) { s.ai = inherentAI(game, s); s.leader = -1; beginLeave(game, s); }
  }
  if (s.jump < -900) s.state = ST.ARRIVE;
  else if (s.action !== ACT.JUMP && s.action !== ACT.FOLLOW_JUMP) {
    if (s.defends === -1) {
      switch (s.ai) {
        case 1: aiTrader(game, s, false); break;
        case 2: aiTrader(game, s, true); break;
        case 3: aiWarship(game, s); break;
        case 4: aiInterceptor(game, s); break;
        case 5: aiFighter(game, s); break;
        case 6: aiEscort(game, s); break;
      }
    } else aiDefender(game, s);
  }
  stateToAction(game, s);
  execute(game, s);
}

// ---------- FUN_10001d78: state -> action ----------
function stateToAction(game, s) {
  const D = game.data, P = game.ships[0];
  if (s.delay > 0 && s.state !== ST.FOLLOW) return;
  if (s.target !== -1 && !active(game, s.target)) s.target = -1;
  if (s.state !== ST.FOLLOW_JUMP && s.state !== ST.LEAVE && s.state !== ST.FLEE) s.jump = 0;
  if (s.jump > 0) s.state = s.leader === 0 ? ST.FOLLOW_JUMP : s.target === -1 ? ST.LEAVE : ST.FLEE;
  if (s.mission >= 0 && s.state !== ST.ARRIVE && s.state !== ST.FOLLOW_JUMP) {
    let b = mission(game, s)?.behav ?? -1;
    while (b > 8) b -= 10;
    if (b === 1) {
      if (!missionActive(game, s) || isDisabled(s)) { s.ai = inherentAI(game, s); s.leader = -1; }
      else { s.ai = 6; s.leader = 0; }
    }
    if (b === 0) targetPlayer(game, s);
  }
  if (s.target === 0 && cloaked(game)) {
    if (s.ai > 2) { s.state = ST.HOLD; s.action = ACT.BRAKE; s.jump = 0; s.dest = -1; return; }
    beginLeave(game, s);
  }
  // 1: fly to a stellar and land on it (stop over it, then wait 300-499 ticks).
  if (s.state === ST.GO_SPOB && s.dest !== -1) {
    s.jump = 0;
    const p = D.spob[s.dest];
    const r = i16((8 - turn(s)) * 32);
    if (p && sabs(p.xPos - s.x) <= r && sabs(p.yPos - s.y) <= r) {
      if (Math.abs(s.vx) < 0.35 && Math.abs(s.vy) < 0.35) {
        s.vx = s.vy = 0; s.landedAt = s.dest; s.action = ACT.IDLE; s.state = ST.IDLE;
        s.delay = game.rng.rand(200) + 300;
      } else s.action = ACT.BRAKE;
    } else s.action = ACT.TO_SPOB;
  }
  // 2: leave: out to 1000 px, stop, jump.
  if (s.state === ST.LEAVE) {
    if (fromCentre2(s) <= 1e6) s.action = ACT.OUTWARD;
    else s.action = Math.abs(s.vx) < 0.7 && Math.abs(s.vy) < 0.7 ? ACT.JUMP : ACT.BRAKE;
  }
  if (s.state === ST.FOLLOW_JUMP) { s.dest = shipAt(game, s.leader)?.dest ?? -1; s.action = ACT.FOLLOW_JUMP; }
  // 3: flee from the target, then leave.
  if (s.state === ST.FLEE) {
    if (s.jump < 1) {
      if (s.target === -1) { s.state = ST.IDLE; s.grudge = 0; }
      else {
        const t = game.ships[s.target];
        if (sabs(s.x - t.x) < 0xfb && sabs(s.y - t.y) < 0xfb && s.action !== ACT.JUMP) { if (s.jump < 1) s.action = ACT.FLEE; }
        else if (fromCentre2(s) <= 1e6) s.action = ACT.OUTWARD;
        else s.action = Math.abs(s.vx) < 0.35 && Math.abs(s.vy) < 0.35 ? ACT.JUMP : ACT.BRAKE;
      }
    } else if (fromCentre2(s) <= 1e6) { s.jump = 0; s.action = ACT.OUTWARD; }
    else s.action = ACT.JUMP;
  }
  // 4 attack and 13 hijack (board a disabled trader).
  if (s.state === ST.ATTACK || s.state === ST.HIJACK) {
    const hijack = s.state === ST.HIJACK;
    s.jump = 0;
    if (s.target === -1 || s.delay > 0) s.state = ST.IDLE;
    else {
      if (s.leader !== -1) {
        const reset = () => { s.state = ST.IDLE; s.action = ACT.IDLE; s.target = -1; };
        const t = game.ships[s.target], tl = t?.leader ?? -1;
        if (s.target === s.leader || s.leader === tl) { reset(); return; }
        const TL = shipAt(game, tl);
        if (TL && TL.leader !== -1) {
          if (tl === TL.leader) { reset(); return; }
          const SL = shipAt(game, s.leader);
          if (SL && SL.leader !== -1 && shipAt(game, SL.leader)?.leader === TL.leader) { reset(); return; }
        }
      }
      if (s.leader === s.target && s.defends === -1) { s.grudge = 0; s.target = -1; s.state = ST.IDLE; }
      const t = shipAt(game, s.target);
      if (!hijack) {
        if (!t?.alive || isDead(t)) { s.target = -1; s.grudge = 0; s.state = ST.IDLE; }
        else {
          if (Math.abs(s.x - t.x) > 200 || Math.abs(s.y - t.y) > 200) farAttack(game, s);
          else s.action = ACT.ATTACK;
          if (!isDisabled(s)) launchBay(game, s);
        }
      } else if (!t?.alive) { s.target = -1; s.dest = -1; s.grudge = 0; s.state = ST.IDLE; }
      else if (!isDisabled(t)) {
        s.dest = -1;
        if (Math.abs(s.x - t.x) <= 200 && Math.abs(s.y - t.y) <= 200) s.action = ACT.ATTACK;
        else farAttack(game, s);
      } else if (!t.plundered) {
        s.dest = s.target;
        const r = i16((10 - maneuver(game, s)) * 30);
        const dx = Math.abs(s.x - t.x), dy = Math.abs(s.y - t.y);
        if (dx <= r && dy <= r) s.action = ACT.PLUNDER;
        else if (dx <= i16(r * 2) && dy <= i16(r * 2)) s.action = ACT.APPROACH;
        else s.action = ACT.APPROACH_FAR;
      } else { s.state = ST.IDLE; s.action = ACT.IDLE; s.target = -1; s.dest = -1; }
    }
  }
  // 5: go back to the leader (fighters dock).
  if (s.state === ST.RETURN && s.leader !== -1 && s.defends === -1) {
    s.dest = s.leader;
    const L = game.ships[s.leader], r = i16((10 - maneuver(game, s)) * 50);
    s.action = L && Math.abs(s.x - L.x) <= r && Math.abs(s.y - L.y) <= r ? ACT.DOCK : ACT.APPROACH;
    if (s.leader === 0 && cloaked(game)) s.action = ACT.BRAKE;
  }
  // 10: follow the leader.
  if (s.state === ST.FOLLOW && s.leader !== -1 && s.defends === -1) {
    s.dest = s.leader;
    const r = i16((10 - maneuver(game, s)) * 30);
    if (s.leader === 0 && cloaked(game)) s.action = ACT.BRAKE;
    else s.action = boxAction(game.ships[s.leader], s, r, i16(r * 2));
  }
  // 12: formation with the player (a mission escort).
  if (s.state === ST.FORMATION) {
    s.jump = 0; s.dest = 0; s.target = -1;
    if (P.jump < 1) {
      if (!cloaked(game)) s.action = boxAction(P, s, i16((10 - maneuver(game, s)) * 30), i16((10 - maneuver(game, s)) * 60));
      else s.action = ACT.BRAKE;
    } else s.state = ST.FOLLOW_JUMP;
  }
  if (s.state === ST.HOLD) { s.jump = 0; s.action = ACT.BRAKE; }
  // 7: come alongside and inspect.
  if (s.state === ST.INSPECT) {
    if (s.target === -1 || s.delay > 0) s.state = ST.IDLE;
    else if (!active(game, s.target)) { s.target = -1; s.state = ST.IDLE; }
    else {
      const t = game.ships[s.target];
      if (Math.abs(s.x - t.x) <= 180 && Math.abs(s.y - t.y) <= 180) {
        if (s.target === 0) {
          if (Math.abs(s.vx - P.vx) >= 0.35 || Math.abs(s.vy - P.vy) >= 0.35) { s.dest = 0; s.action = ACT.FORMATION; }
          else { s.dest = -1; s.target = -1; s.state = ST.IDLE; s.action = ACT.IDLE; scanPlayer(game, s); }
        } else { s.state = ST.IDLE; s.target = -1; }
      } else s.action = ACT.APPROACH_FAR;
    }
  }
  if (s.state === ST.ARRIVE) { s.jump = -999; s.action = ACT.ARRIVE; }
  // 9: come alongside and give fuel, one unit per turn.
  if (s.state === ST.REFUEL && s.target !== -1) {
    s.action = ACT.APPROACH;
    const t = game.ships[s.target];
    if (t && Math.abs(s.x - t.x) <= 180 && Math.abs(s.y - t.y) <= 180) {
      if (Math.abs(s.vx) < 0.35 && Math.abs(s.vy) < 0.35) {
        s.vx = s.vy = 0;
        if (t.fuel < 100) t.fuel++;
        else {
          if (s.target === 0) { game.beep?.(2); game.message(`${D.ship[s.type].name}: Fuel transfer complete, ${game.pilot.shipName}.`, 'msg', 0xf0); }
          s.state = ST.IDLE; s.action = ACT.IDLE; s.target = -1; s.dest = -1;
        }
      } else s.action = ACT.BRAKE;
    }
  }
  if (s.state === ST.IDLE) s.action = ACT.IDLE;
}
// Within r of the leader: keep formation; within r2: close in; else head for it.
function boxAction(L, s, r, r2) {
  if (!L) return ACT.APPROACH_FAR;
  const dx = Math.abs(s.x - L.x), dy = Math.abs(s.y - L.y);
  if (dx <= r && dy <= r) return ACT.FORMATION;
  if (dx <= r2 && dy <= r2) return ACT.APPROACH;
  return ACT.APPROACH_FAR;
}
// Beyond 200 px: missiles, or (with a faster target running from us) the retreat-and-fire move.
function farAttack(game, s) {
  if (!retreatFire(game, s)) s.action = ACT.MISSILES;
  else if (s.ai < 3) { s.state = ST.FLEE; s.action = ACT.FLEE; }
  else s.action = ACT.RETREAT_FIRE;
}
// FUN_10008fb4: a big ship (type +0x178, read as Mass, >= 100) whose target is the player or a
// fleeing ship moving away from it, and that is no faster than the target (or has a missile in reach
// and is slower), backs off and fires instead of chasing.
function retreatFire(game, s) {
  const D = game.data, t = shipAt(game, s.target);
  if (!t?.alive) return false;
  if (!(t.slot === 0 || t.state === ST.FLEE)) return false;
  if ((D.ship[s.type].Mass ?? 0) < 100) return false;
  const rvx = t.vx - s.vx, rvy = t.vy - s.vy;
  if (Math.abs(rvx) <= 0.35 && Math.abs(rvy) <= 0.35) return false;
  if (Math.abs(bearing(0, 0, rvx, rvy) - bearing(t.x, t.y, s.x, s.y)) < 90) return false;
  const d = Math.abs(dist2diff(s, t));
  let w = -1;
  for (const [id, x] of Object.entries(s.weapons)) {
    const W = D.weap[id];
    if (x.count < 1 || !(x.ammo > 0 || W.AmmoType < 0)) continue;
    if (!((W.Guidance === 1 && turn(t) <= 3) || W.Guidance === 2)) continue;
    if (!canUse(s, W, x)) continue;
    const r = 1.75 * (W.Speed / 100) * W.Count;
    if (r * r >= 0.8 * d) { w = +id; break; }
  }
  const mine = D.ship[s.type].Speed, theirs = D.ship[t.type].Speed;
  return w === -1 ? mine <= theirs : mine < theirs;
}

// FUN_10000210: the inspection. A ship of a govt with a smuggling penalty that scans the player
// carrying a mission's illegal cargo either fails the mission or calls out the smuggling, and attacks.
function scanPlayer(game, s) {
  if (!(s.ai === 3 || s.ai === 4) || s.govt === -1) return;
  const G = govt(game, s.govt), P = game.ships[0];
  if (!G?.SmugPenalty) return;
  for (let i = 0; i < 8; i++) {
    const m = game.pilot.missions[i];
    if (!m?.active || m.scanGovt !== s.govt || !m.loaded || m.cargoType === -1) continue;
    if (Math.abs(s.x - P.x) > 180 || Math.abs(s.y - P.y) > 180) continue;
    if (m.failIfScan && !m.scanned) {
      m.scanned = true;
      game.beep?.(2);
      game.message('Your ship has been scanned - mission failed.', 'msg', 400);
      game.missionFailed?.(i);
    } else { game.beep?.(5); game.message(`${game.pilot.shipName}, your attempt to smuggle illegal cargo through this system has been detected.`, 'msg', 400); }
    s.target = 0; s.dest = -1; s.state = ST.ATTACK;
    return;
  }
}

// ---------- weapon choice (they only set the selected weapon and the fire flag) ----------
const canUse = (s, W, x) => W.AmmoType >= 0 ? x.ammo > 0 : W.AmmoType < -999 ? s.fuel >= Math.abs(W.AmmoType) - 1000 : true;
// FUN_1000559c: turrets (3, 4; 7 and 8 within 45 degrees of the nose or tail).
function selectTurret(game, s) {
  const t = shipAt(game, s.target);
  if (!t?.alive) return;
  const best = [0, 0], idx = [-1, -1];
  for (const [id, x] of Object.entries(s.weapons)) {
    const W = game.data.weap[id], g = W.Guidance;
    if (x.count < 1 || ![3, 4, 7, 8].includes(g)) continue;
    let ok = true;
    if (g === 7 || g === 8) {
      const b = bearing(s.x, s.y, t.x, t.y);
      const off = g === 7 ? Math.abs(b - s.facing) % 360 : Math.abs(b - (s.facing + 180) % 360) % 360;
      ok = off < 0x2e;
    }
    if (!ok || !canUse(s, W, x)) continue;
    [W.MassDmg, W.EnergyDmg].forEach((v, k) => { v = Math.max(1, v); if (best[k] < v) { best[k] = v; idx[k] = +id; } });
  }
  const pick = t.pool >= 0 ? idx[1] : idx[0];
  if (pick !== -1) { s.selected = pick; s.fire = true; }
}
// FUN_100058b8: a homing weapon that reaches (1: only at targets turning 3 or less).
function selectHoming(game, s) {
  const t = shipAt(game, s.target);
  if (!t?.alive || doomed(t)) return;
  const d = Math.abs(dist2diff(s, t));
  for (const [id, x] of Object.entries(s.weapons)) {
    const W = game.data.weap[id];
    if (x.count < 1 || !(x.ammo > 0 || W.AmmoType < 0)) continue;
    if (!((W.Guidance === 1 && turn(t) <= 3) || W.Guidance === 2)) continue;
    if (!canUse(s, W, x)) continue;
    const r = 1.75 * (W.Speed / 100) * W.Count;
    if (r * r >= 0.95 * d) { s.selected = +id; s.fire = true; return; }
  }
}
// FUN_1001fe38 (Override FUN_1006b314): enough damage is already on its way (+0x978, FUN_1001ff04):
// 1.05 * pool <= incoming, or -1.05 * pool <= incoming once the shields are gone. Literal: a ship at
// pool 0 counts as doomed.
const doomed = t => (t.pool < 0 ? -1.05 * t.pool : 1.05 * t.pool) <= (t.threat ?? 0);
// FUN_10005af4: guns (-1, 0, 6), best damage for the target's state; blast weapons not at close range.
function selectGun(game, s) {
  const t = shipAt(game, s.target);
  if (!t?.alive) return;
  const best = [0, 0], idx = [-1, -1];
  for (const [id, x] of Object.entries(s.weapons)) {
    const W = game.data.weap[id], g = W.Guidance;
    if (x.count < 1 || ![-1, 0, 6].includes(g) || x.reload >= 1 || !canUse(s, W, x)) continue;
    const ammoOk = (x.ammo > 0 && W.AmmoType > -1000) || (W.AmmoType < -999 && Math.abs(W.AmmoType) - 1000 <= s.fuel) || W.AmmoType === -1;
    if (!ammoOk) continue;
    [W.MassDmg, W.EnergyDmg].forEach((v, k) => {
      v = Math.max(1, v);
      if (g === 6 && W.BlastRadius > 0) {
        if (!(1.5 * W.BlastRadius <= Math.abs(s.x - t.x) && 1.5 * W.BlastRadius <= Math.abs(s.y - t.y))) return;
      }
      if (best[k] < v) { best[k] = v; idx[k] = +id; }
    });
  }
  const pick = t.pool >= 0 ? idx[1] : idx[0];
  if (pick >= 0) s.selected = pick;
  if (s.selected !== -1) s.fire = true;
}
// FUN_10005f18: launch one fighter from the first loaded bay.
function launchBay(game, s) {
  const t = shipAt(game, s.target);
  if (!t?.alive) return;
  for (const [id, x] of Object.entries(s.weapons)) {
    const W = game.data.weap[id];
    if (x.count < 1 || x.ammo < 1 || W.Guidance !== 99) continue;
    if (x.reload > 0) return;
    s.selected = +id;
    fireWeapon(game, s, +id);
    return;
  }
}
// FUN_10009688: the player's escorts fire their turrets at their target whatever they are doing.
function escortTurrets(game, s) {
  if (s.leader === 0 && s.ai === 6 && s.target !== -1) {
    if (!active(game, s.target)) s.target = -1; else selectTurret(game, s);
  }
}

// ---------- FUN_10003650: the action executor ----------
function execute(game, s) {
  const D = game.data;
  s.thrust = 0; s.fire = false;
  if (s.cap >= 0) s.cap = speedOf(s);
  const crippled = isDisabled(s);
  s.desired = s.facing;
  const t = shipAt(game, s.target);
  const turnOk = k => aimed(s, k);
  const go = (accel = accelOf(s), cap = 0) => { s.thrust = accel; s.cap = cap; };
  if (s.action === ACT.IDLE) escortTurrets(game, s);
  // 1: brake: turn against the motion and thrust; the last bit is damped away.
  if (s.action === ACT.BRAKE && !crippled) {
    if (Math.abs(s.vx) >= 0.35 || Math.abs(s.vy) >= 0.35) {
      s.desired = wrap(bearing(0, 0, 100 * s.vx, 100 * s.vy) + 180);
      if (turnOk(turn(s) + 1)) {
        if (Math.abs(s.vx) >= 1.75 || Math.abs(s.vy) >= 1.75) s.thrust = accelOf(s);
        else { s.thrust = 0.5 * accelOf(s); s.vx *= 0.94; s.vy *= 0.94; }
      }
    } else { s.vx *= 0.95; s.vy *= 0.95; s.action = ACT.IDLE; }
    escortTurrets(game, s);
  }
  // 2: to a stellar, at half speed inside 500 px.
  if (s.action === ACT.TO_SPOB && s.dest !== -1 && !crippled) {
    const p = D.spob[s.dest];
    if (p) {
      s.desired = bearing(s.x, s.y, p.xPos, p.yPos);
      if (turnOk(turn(s) + 1)) {
        if (Math.abs(s.x - p.xPos) < 500 && Math.abs(s.y - p.yPos) < 500) go(accelOf(s), 0.5 * speedOf(s));
        else go();
      }
    }
  }
  // 3: straight out from the system centre.
  if (s.action === ACT.OUTWARD && !crippled) {
    s.desired = bearing(0, 0, s.x, s.y);
    if (turnOk(turn(s) + 1)) go();
  }
  // 4: hyperjump: face out, count, and leave 465 ticks after the start.
  if (s.action === ACT.JUMP && !crippled) {
    s.desired = bearing(0, 0, s.x, s.y);
    if (s.jump < 1) { s.jump = 1; s.jumpStart = ticks(game); }
    s.jump++;
    if (ticks(game) - s.jumpStart > 0x1d1) {
      game.onShipJumpedOut?.(s);
      game.emit({ type: 'npcJump', slot: s.slot });
      game.removeShip(s);
      return;
    }
  }
  // 13: follow the leader into hyperspace: its heading, braking.
  if (s.action === ACT.FOLLOW_JUMP && !crippled) {
    const L = shipAt(game, s.leader);
    s.dest = L?.dest ?? -1;
    if (L) s.desired = L.facing;
    if (s.jump === 0) s.jumpStart = ticks(game);
    s.vx *= 0.95; s.vy *= 0.95;
    s.thrust = 0; s.cap = -1;
    s.jump++;
  }
  // 5: run directly away from the target (fleeing ships still use turrets).
  if (s.action === ACT.FLEE && t && !crippled) {
    s.desired = bearing(t.x, t.y, s.x, s.y);
    if (turnOk(turn(s) + 1)) go();
    if (s.state === ST.FLEE) selectTurret(game, s);
  }
  // 6: close attack: lead with unguided guns, ram through, fire when within three turns of aim.
  if (s.action === ACT.ATTACK && t && !crippled) {
    const W = s.selected !== -1 ? D.weap[s.selected] : null;
    s.desired = W && W.Guidance === -1 ? leadAim(s, t, W.Speed / 100) : bearing(s.x, s.y, t.x, t.y);
    selectTurret(game, s);
    if (turnOk(turn(s) + 1)) go();
    if (turnOk(turn(s) * 3)) selectGun(game, s);
    // Override: the jink and afterburner entries follow the action-6 body (0x10003f1c..0x10004210),
    // and the new action runs in the same step.
    if (game.data.evo) evoManoeuvre(game, s, t);
  }
  // 7: head at the target and fire missiles when aligned.
  if (s.action === ACT.MISSILES && t && !crippled) {
    s.desired = bearing(s.x, s.y, t.x, t.y);
    if (turnOk(turn(s) + 1)) { go(); selectHoming(game, s); }
  }
  // 15: board: match the target's velocity, sit on it while plundering, then pull away.
  if (s.action === ACT.PLUNDER && s.dest !== -1 && !crippled) plunderApproach(game, s);
  // 14: back away from the target while firing turrets, fighters and missiles.
  if (s.action === ACT.RETREAT_FIRE && t && !crippled) {
    if (Math.abs(s.vx) >= 0.35 || Math.abs(s.vy) >= 0.35) {
      s.desired = wrap(bearing(0, 0, 100 * s.vx, 100 * s.vy) + 180);
      if (turnOk(turn(s) + 1)) s.thrust = accelOf(s);
    } else { s.vx *= 0.95; s.vy *= 0.95; s.desired = bearing(s.x, s.y, t.x, t.y); }
    selectTurret(game, s); launchBay(game, s); selectHoming(game, s);
  }
  // 11 and 9: head for a ship; 11 slows to half speed inside 180 px. Near it (360 px) the heading
  // corrects the velocity towards it when the course is off by more than 15 degrees.
  if ((s.action === ACT.APPROACH || s.action === ACT.APPROACH_FAR) && (s.target !== -1 || s.dest !== -1) && !crippled) {
    const ref = shipAt(game, s.target >= 0 ? s.target : s.dest);
    if (ref) {
      const b = bearing(s.x, s.y, ref.x, ref.y);
      if (Math.abs(s.x - ref.x) > 360 || Math.abs(s.y - ref.y) > 360) s.desired = b;
      else {
        const vb = bearing(0, 0, 100 * s.vx, 100 * s.vy);
        if (Math.abs(vb - b) > 0xf) {
          const want = { x: 0, y: 0 }; addPolar(want, b, speedOf(s));
          const ex = want.x - s.vx, ey = want.y - s.vy;
          if (Math.abs(ex) > 0.35 || Math.abs(ey) > 0.35) s.desired = bearing(0, 0, ex, ey);
        }
      }
      if (turnOk(turn(s) + 1)) {
        s.thrust = accelOf(s);
        s.cap = s.action === ACT.APPROACH && Math.abs(s.x - ref.x) <= 180 && Math.abs(s.y - ref.y) <= 180 ? 0.5 * speedOf(s) : 0;
      }
    }
    escortTurrets(game, s);
  }
  // 12: formation: match the leader's velocity (at 0.66 thrust), then take its course.
  if (s.action === ACT.FORMATION && s.dest !== -1 && !crippled) {
    const L = shipAt(game, s.dest);
    if (L) {
      let dvx = s.vx - L.vx, dvy = s.vy - L.vy;
      if (Math.abs(dvx) >= 0.525 || Math.abs(dvy) >= 0.525) {
        s.desired = wrap(bearing(0, 0, 100 * dvx, 100 * dvy) + 180);
        if (turnOk(turn(s) + 1)) go(0.66 * accelOf(s), 0);
        if (Math.abs(dvx) <= 1.75 || Math.abs(dvy) <= 1.75) { dvx *= 0.95; dvy *= 0.95; s.vx = dvx + L.vx; s.vy = dvy + L.vy; }
      } else {
        s.vx = L.vx; s.vy = L.vy;
        s.desired = bearing(0, 0, 100 * s.vx, 100 * s.vy);
      }
    }
    escortTurrets(game, s);
  }
  // 8: dock with the carrier (inside its half-size box): the bay gets the fighter back.
  if (s.action === ACT.DOCK) {
    const L = shipAt(game, s.dest);
    if (s.dest === -1 || isDead(s)) { s.state = ST.IDLE; s.action = ACT.IDLE; }
    else if (!L?.alive) { s.ai = 3; s.state = ST.IDLE; }
    else {
      if (!crippled) {
        s.desired = bearing(s.x, s.y, L.x, L.y);
        if (turnOk(turn(s) + 1)) go();
      }
      // Inside the carrier's frame height on both axes, a bay that launches this ship type takes it back.
      const h = game.data.sprite(L.type)?.h ?? 32;
      if (Math.abs(L.x - s.x) <= h && Math.abs(L.y - s.y) <= h) {
        for (const [id, x] of Object.entries(L.weapons)) {
          const W = D.weap[id];
          if (W.AmmoType !== s.type || W.Guidance !== 99) continue;
          x.ammo++;
          if (L.slot === 0 && game.pilot.weapons[id]) game.pilot.weapons[id].ammo = x.ammo;
          game.removeShip(s);
          return;
        }
      }
    }
  }
  // 10: arriving from hyperspace: npcStep runs the deceleration.
  if (s.action === ACT.ARRIVE) {
    if (s.cap >= 0) s.cap = -50;
    s.thrust = -1.165;
  }
  // Override: jink and afterburner runs (final-behaviour-closure, 10004040..).
  // Action 16 (0x10004210): steer for the stored jink heading at 1.5x thrust, turrets inside the
  // 165 px box, back to action 6 once within 3 turns of that heading (FUN_10061064).
  if (s.action === ACT.JINK && t && !crippled) {
    s.desired = s.jinkHeading; go(1.5 * accelOf(s), 0);
    if (Math.abs(Math.trunc(t.x - s.x)) < 165 && Math.abs(Math.trunc(t.y - s.y)) < 165) selectTurret(game, s);
    if (angleDiff(s.facing, s.jinkHeading) < 3 * turn(s)) s.action = ACT.ATTACK;
  }
  // Action 17 (0x10004318): 2.75x thrust and a 1.8x speed cap whatever the heading; inside the box
  // (< 165) turrets, and guns when within 3 turns; outside, homing weapons when within 3 turns. Back to
  // action 6 inside the box (<= 165) or on Rand(100) == 0.
  if (s.action === ACT.BOOST && t && !crippled) {
    go(2.75 * accelOf(s), 1.8 * speedOf(s));
    s.desired = bearing(s.x, s.y, t.x, t.y);
    const ax = Math.abs(Math.trunc(s.x - t.x)), ay = Math.abs(Math.trunc(s.y - t.y));
    if (ax < 165 && ay < 165) { selectTurret(game, s); if (turnOk(3 * turn(s))) selectGun(game, s); }
    else if (turnOk(3 * turn(s))) selectHoming(game, s);
    if ((ax <= 165 && ay <= 165) || game.rng.rand(100) === 0) s.action = ACT.ATTACK;
  }
}
// Override's angle difference FUN_10061064: |a - b|, taken as 360 - |a - b| when exactly one of the
// two is >= 180. Right across 0/360, but two headings either side of 180 come out far apart; kept.
const angleDiff = (a, b) => { const d = Math.abs(a - b); return (a >= 180) !== (b >= 180) ? 360 - d : d; };

// Action 15 body (0x10003fb4..0x10004490).
function plunderApproach(game, s) {
  const T = shipAt(game, s.dest);
  if (!T) return;
  let dvx = s.vx - T.vx, dvy = s.vy - T.vy;
  if (Math.abs(dvx) >= 0.525 || Math.abs(dvy) >= 0.525) {
    s.desired = wrap(bearing(0, 0, 100 * dvx, 100 * dvy) + 180);
    if (aimed(s, turn(s) + 1)) { s.thrust = accelOf(s); s.cap = 0; }
    if (Math.abs(dvx) <= 1.75 || Math.abs(dvy) <= 1.75) { dvx *= 0.95; dvy *= 0.95; s.vx = dvx + T.vx; s.vy = dvy + T.vy; }
    return;
  }
  s.desired = T.facing;
  const pull = () => { const v = { x: s.vx, y: s.vy }; addPolar(v, s.facing, accelOf(s)); s.vx = v.x; s.vy = v.y; };
  if (Math.abs(s.x - T.x) <= 3 && Math.abs(s.y - T.y) <= 3) {
    if (!T.plundered) { T.plundered = true; s.delay = game.rng.rand(0x96) + 300; s.vx = T.vx; s.vy = T.vy; }
    else if (s.delay <= 0) { s.target = -1; s.dest = -1; s.state = ST.IDLE; s.action = ACT.IDLE; }
    if (s.delay > 0 && s.delay <= 100) pull();
    else { s.vx = T.vx; s.vy = T.vy; }
  } else if (s.delay > 0 && s.delay <= 100) pull();
  else {
    s.vx = T.vx; s.vy = T.vy;
    const v = { x: s.vx, y: s.vy }; addPolar(v, bearing(s.x, s.y, T.x, T.y), 0.1 * speedOf(s)); s.vx = v.x; s.vy = v.y;
  }
}

// Override's entries into jink (16) and afterburner boost (17), after the action-6 body
// (0x10003f1c..0x10004210, VERIFIED). Jink: first (target not the player and Rand(2) == 0) or the
// rating roll FUN_1006115c, then InherentAI >= 3, Mass < 200, |dx| and |dy| (truncated) < 123, our
// facing within 30 of the bearing to the target and the target's facing within 30 of the bearing
// back to us (both by FUN_10061064). The heading is facing +135 for an even slot, -135 for an odd
// one. Boost (whether or not the jink was entered): afterburner, |dx| and |dy| > 82 and our facing
// within 30 of the bearing.
function evoManoeuvre(game, s, t) {
  const T = game.data.ship[s.type];
  const ax = () => Math.abs(Math.trunc(s.x - t.x)), ay = () => Math.abs(Math.trunc(s.y - t.y));
  if (((t.slot !== 0 && game.rng.rand(2) === 0) || ratingRoll(game)) && T.InherentAI >= 3 && T.Mass < 200 && ax() < 123 && ay() < 123) {
    const toT = bearing(s.x, s.y, t.x, t.y);
    if (angleDiff(s.facing, toT) <= 30 && angleDiff(t.facing, (toT + 180) % 360) <= 30) {
      s.action = ACT.JINK;
      s.jinkHeading = wrap(s.facing + (s.slot % 2 === 0 ? 135 : -135));
    }
  }
  if (s.afterburner && ax() > 82 && ay() > 82 && angleDiff(s.facing, bearing(s.x, s.y, t.x, t.y)) <= 30) s.action = ACT.BOOST;
}

// ---------- npcStep: the NPC part of FUN_10018054, every step ----------
export function npcStep(game, s) {
  const P = game.ships[0];
  if (s.target !== -1 && !active(game, s.target)) s.target = -1;
  for (const w of Object.values(s.weapons)) if (w.reload > 0) w.reload--;
  const crippled = isDisabled(s);
  if (crippled) { s.vx *= 0.995; s.vy *= 0.995; }
  if (s.tractored && P) {
    const k = 0.25 * P.stats.accel;
    for (const [a, b] of [['vx', P.vx], ['vy', P.vy]]) {
      if (b + k < s[a]) s[a] -= k;
      if (s[a] < b - k) s[a] += k;
      if (Math.abs(s[a] - b) < k) s[a] = b;
    }
  }
  s.x += s.vx * SPEED.S; s.y += s.vy * SPEED.S;
  if (!crippled) {
    if (s.delay < 1) {
      const t = turn(s);
      if (t < Math.abs(s.desired - s.facing)) s.facing = wrap(s.facing + (wrap(s.desired - s.facing) < 0xb5 ? t : -t));
      else s.facing = s.desired;
    }
    if (s.pool < s.stats.shieldMax && s.stats.interval > 0 && game.frame % s.stats.interval === 0) s.pool = Math.trunc(s.pool + 0.01 * s.stats.shieldMax);
  }
  s.facing = wrap(s.facing);
  // Hyperjump departure: aligned, braking, then creeping out ever faster.
  if (s.jump > 0 && !crippled && Math.abs(s.facing - s.desired) <= turn(s)) {
    if (departing(s)) {
      s.vx *= 0.95; s.vy *= 0.95;
      const d = (ticks(game) - s.jumpStart) / 4.6 - 50;
      if (d > 0) addPolar(s, s.facing, d);
    } else s.jump = 0;
  }
  if (s.delay < 1 || typeIndex(game, s) === POD_INDEX) {
    if (s.thrust !== 0) {
      if (s.cap === 0) { const v = { x: s.vx, y: s.vy }; thrustLimited(v, s.facing, s.thrust, speedOf(s)); s.vx = v.x; s.vy = v.y; }
      else if (s.cap > 0) { const v = { x: s.vx, y: s.vy }; thrustLimited(v, s.facing, s.thrust, s.cap); s.vx = v.x; s.vy = v.y; }
      else {
        // Arrival from hyperspace: speed |cap| along the heading, cap rising by 1.165 a step.
        const v = { x: 0, y: 0 }; addPolar(v, s.facing, Math.abs(s.cap)); s.vx = v.x; s.vy = v.y;
        s.cap += Math.abs(s.thrust);
        const L = s.leader >= 0 && s.leader < 36 ? game.ships[s.leader] : null;
        const m = L ? Math.min(speedOf(s), speedOf(L)) : speedOf(s);
        if (s.cap >= -m) {
          if (s.state !== ST.REFUEL) { s.state = ST.IDLE; s.action = ACT.IDLE; }
          s.dest = -1; s.jump = 0; s.thrust = 0; s.cap = 0;
          if (s.leader === -1) s.delay = game.rng.rand(0x1e) + 0x3c;
        }
      }
    }
    if (s.fire && s.selected !== -1 && s.weapons[s.selected] && s.weapons[s.selected].reload < 1) {
      const g = game.data.weap[s.selected]?.Guidance;
      if (g !== 99 && g !== 5) fireWeapon(game, s, s.selected);
    }
  } else s.delay--;
  s.tractored = false;
}

// ---------- reactions ----------
// FUN_10007ff8(victim, attacker): when the player hits a ship, idle warships and interceptors that
// side with the victim turn on the attacker. One ship hostile to the victim stops the whole rally.
export function rally(game, V, A) {
  const D = game.data, gV = V.govt, GV = D.govtOf(gV), GA = D.govtOf(A.govt);
  if (V.pers === 0x1ff || A.pers === 0x1fe || (GV && (GV.Flags & 0x800))) return;
  for (let i = 1; i < 36; i++) {
    const x = game.ships[i];
    if (!x?.alive || !(x.ai === 3 || x.ai === 4) || x.state === ST.ATTACK) continue;
    let b = x.pers !== 0x1ff;
    if (shipsHostile(game, x, V)) return;
    const GX = D.govtOf(x.govt);
    if (GX && GV) {
      b = GV.Enemy !== x.govt && gV !== GX.Enemy && b;
      if ((GV.Flags & 1) && gV !== x.govt) b = false;
      const kin = (gV === GX.Ally && GX.Ally !== -1) || (GV.Ally === x.govt && GV.Ally !== -1) || gV === x.govt;
      if (!(GX.Flags & 2) && !kin) b = false;
      if (A.govt === GX.Ally && GX.Ally !== -1) b = false;
      if (GA && GA.Ally === x.govt && GA.Ally !== -1) b = false;
    }
    if (GX && !GV && !(GX.Flags & 2)) b = false;
    if (GV && ((GV.Flags & 0x800) || (GV.Flags & 0x20))) b = false;
    if (!GX && GV && (GV.Flags & 1)) b = false;
    if (b) { x.state = ST.ATTACK; x.target = A.slot; }
  }
}

// The reaction part of ev_ship_apply_damage 0x10017384: does the victim turn on its attacker?
// `a` is the attacker's slot; `direct` is the hit flag the shot and beam code pass.
export function provoke(game, V, a, mass, energy, direct) {
  if (!direct || !(V.ai > 0) || a < 0) return;
  const D = game.data, A = game.ships[a], P = game.ships[0];
  if (!A) return;
  if (!(a !== V.slot || A.defends !== -1 || V.defends !== -1)) return;
  let b;
  if (V.defends === -1 && A.defends === -1) {
    b = V.govt !== A.govt;
    if (V.leader !== -1) {
      b = a !== V.leader || b;
      if (A.leader !== -1 && V.leader !== A.leader) b = true;
    }
    const byPlayer = a === 0 || A.leader === 0;
    if (V.govt === -1) { if (byPlayer) b = true; }
    else {
      const G = D.govtOf(V.govt);
      if (sysGovt(game) >= 128 && byPlayer && P.target !== V.slot && 2 * G.CrimeTol <= legal(game)) b = false;
      if (V.govt === A.govt) b = false;
    }
    if (V.leader !== -1 && V.leader === A.leader && A.defends !== -1) b = false;
    if (b) {
      if (a === 0) {
        if (P.target !== -1) {
          if (V.slot === P.target) b = true;
          else if (!shipsHostile(game, V, shipAt(game, P.target))) { if (game.rng.rand(0x32) !== 0) b = false; }
          else b = false;
        }
      } else if (V.slot !== A.target) b = false;
      if (b && V.govt !== -1 && a === 0 && D.govtOf(V.govt).ShootPenalty < 1 && game.rng.rand(0x19) !== 0) b = false;
    }
    if (A.leader === 0 && A.ai === 5 && V.target === 0 && Math.abs(V.x - P.x) <= 320 && Math.abs(V.y - P.y) <= 320) b = false;
    if (V.leader === A.leader && V.leader !== -1) b = false;
    if (V.jump > 0) b = false;
    const l78 = V.leader !== -1 ? shipAt(game, V.leader)?.leader ?? -1 : -1;
    const l76 = A.leader !== -1 && a !== 0 ? shipAt(game, A.leader)?.leader ?? -1 : -1;
    if (l78 === l76 && l78 !== -1) b = false;
  } else b = V.defends === -1 || A.defends === -1;
  if (!b) return;
  if (V.defends === -1) { V.grudge = i16(V.grudge + mass + energy); V.target = a; }
  else { V.grudge = i16(V.grudge + (mass + energy) * 30); V.target = 0; }
  if (a === 0) targetPlayer(game, V);
  if (V.delay > 20) V.delay = 20;
  if (a === 0 && V.defends === -1) {
    if (V.pers !== -1 && (D.pers[V.pers]?.Flags & 1)) (game.pilot.persGrudge ??= {})[V.pers] = 1;   // pers +0x1a3, saved in the pilot file (+0xfbc)
    if (V.state === ST.REFUEL) { V.dest = -1; V.target = -1; V.delay = 0; V.state = ST.IDLE; V.action = ACT.IDLE; }
    V.target = 0;
  }
}

// ---------- the player's escort orders (0x10031bb4 l.21227-21308) ----------
// Returns the message to show, or null when no ship took the order.
export function escortOrder(game, order) {
  const P = game.ships[0];
  let n = 0;
  for (let i = 1; i < 36; i++) {
    const e = game.ships[i];
    if (!e?.alive || e.leader !== 0 || !(e.jump > -900 && e.jump < 1)) continue;
    if (i === (game.navKey ?? -1)) continue;   // local_3ec: the stellar key held this step (0-3, 5) names a slot
    if (order === 'recallFighters' && e.state !== ST.RETURN && e.ai === 5) { e.target = -3; e.state = ST.RETURN; n++; }
    if (order === 'formation' && e.state !== ST.FOLLOW) {
      e.target = -1; e.dest = e.leader;
      e.state = e.ai === 5 ? ST.FOLLOW : e.leader === 0 ? ST.FORMATION : ST.FOLLOW;
      for (let j = 1; j < 36; j++) { const f = game.ships[j]; if (f?.alive && j !== e.slot && f.leader === e.slot && f.ai === 5) { f.target = -3; f.state = ST.RETURN; } }
      if (e.ai === 6) e.delay = game.rng.rand(0x96) + 100;
      n++;
    }
    if (order === 'attack' && e.state !== ST.ATTACK && e.ai === 5 && P.target !== -1 && P.target !== 0 && shipAt(game, P.target)?.leader !== 0) {
      e.state = ST.ATTACK; e.target = P.target; n++;
    }
    if (order === 'hold' && e.state !== ST.HOLD) { e.state = ST.HOLD; e.target = -1; e.dest = -1; n++; }
  }
  return n > 0;
}
