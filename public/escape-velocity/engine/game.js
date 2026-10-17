// The EV 1.0.5 flight engine: one star system around the player, stepped at a fixed 60 steps/s:
// one step per 60 Hz tick, the cap of the original's main loop, which a machine at S = 1 always hits
// (re-gaps #29/#61; the emulator turns the Shuttlecraft 240 deg/s = 4 deg x 60).
// Deterministic and DOM-free: input commands in, world state and events out. The browser runs it
// for single player; a server can run the same class per system for multiplayer.
import { EvRandom } from './rng.js';
import { addPolar, bearing, thrustLimited, boxClamp, wrap } from './trig.js';
import { CMD } from './input.js';
import { SPOB, MOD } from './data.js';
import { Pilot, markNebulae } from './pilot.js';
import { newShip, defaultWeapons, computeStats, isDead, isDisabled, hasOutfit, outfitSum, POD_TYPE, SPEED } from './ships.js';
import { stepShots, stepBeams, fireWeapon, explode, spriteSize } from './combat.js';
import { think, npcStep, rally, provoke, escortOrder, hostileToPlayer, attackingPlayer, friendlyToPlayer, ST } from './ai.js';
import { systemEntry, periodicSpawn, launchDefender } from './spawn.js';
import * as M from './missions.js';
import { newRoids, initRoids, spawnRoid, syncRoids, stepRoids } from './asteroids.js';
import { cargoCapacity, cargoUsed } from './spaceport.js';

export const STEPS_PER_SECOND = 60;
const FRAME_WRAP = 0x400;
// Departure (0x10031bb4 l.20762-20774): once the counter is >= 30 and a ready flag is set. The flag is
// set by snd 128's completion callback (FUN_10030588; 92695 samples at 11127 Hz = 500 ticks), or, when
// the sound didn't play (no Sound Manager), once the counter is > 30 and more than 0x1d2 ticks passed.
// No preference turns sound off, so in practice it is the sound's end.
const JUMP_SOUND_TICKS = 500, JUMP_FALLBACK_TICKS = 0x1d2;
const LAND_CLEARED = 750, LAND_EXPIRE = 0x7ff;

export class Game {
  constructor(data, pilotJson, { seed = (Date.now() >>> 0) || 1, speed = 1 } = {}) {
    this.data = data;
    SPEED.S = speed;                      // Game Speed (#29)
    this.rng = new EvRandom(seed);
    this.pilot = new Pilot(pilotJson);
    this.frame = 0;
    this.ships = new Array(36).fill(null);
    this.shots = []; this.beams = [];
    this.events = [];
    this.system = this.pilot.system;
    this.landed = this.pilot.spob >= 128 ? this.pilot.spob : null;
    this.navSys = -1;                     // hyperspace destination (nav mode 3)
    this.navMode = -1;                    // player +0x24: -1 off, 2 stellar, 3 hyperspace
    this.route = [];                      // map route: list of system ids
    this.navSpob = -1;                    // selected stellar (L)
    this.landCounter = -1;
    this.thinker = 35;
    this.steps = 0;                       // for TickCount (60 Hz, one tick a step)
    this.defenders = new Map();
    this.abLimit = 0;
    this.prevSystem = -1;
    this.gameOver = false;
    this.deadTicks = -1;                  // counts up after the player's ship is gone
    this.tutorial = 0x7fff;               // PTR_DAT_10079920: -3 new pilot, -1 after a takeoff, >=2 done
    const p = this.pilot;
    p.missions ??= []; while (p.missions.length < M.MAX_MISSIONS) p.missions.push(null);
    p.bits ??= []; p.oops ??= {}; p.defenders ??= {}; p.persDead ??= {}; p.dominated ??= {}; p.junk ??= {}; p.escorts ??= [];
    this.podDrift = 0;
    this.roids = newRoids(); this.roidClear = false;
    this.boxes = []; this.boxClear = false;            // jettisoned cargo boxes and their clear flag [10079760]   // asteroid slots and the clear flag [10079758]
    this.sysVis = {}; this.updateVisibility();         // the pilot load / New Pilot pass (EVO 0x10042f9c, 0x10045b9c)
  }

  // ---------- system visibility (sÿst VisBit, re-gaps #54) ----------
  // FUN_10024c38 (EVO; EV 1.0.5 FUN_10031934 has the same test with 256 bits and no side effects): a
  // system is in play (syst +0x72, EV +0x6a) when its VisBit is negative, bit n is set (0..n-1) or bit
  // n-1000 is clear (1000..); any other value hides it. A spob is in play (+0x1f) when its system is.
  // Run only where the original runs it: Enter Ship, the pilot load, arrival by hyperspace, the
  // spaceport's entry and the escape-pod rescue; bits set in between wait for the next pass.
  // EVO extras, per system: one that leaves play clears the hyperspace target when the mode is
  // hyperspace and the target's link slot (+0x2c, 0..15) equals the system's index (the original
  // compares a slot with a system index; kept), and cuts the map route from that system on. One in play
  // takes the highest explored level of any other system at the same x,y (Override's twin systems).
  updateVisibility() {
    const D = this.data, p = this.pilot, prev = this.sysVis, vis = {};
    for (const S of D.systList) if (S) vis[S.id] = D.visBitOn(p.bits, S.VisBit, false);
    this.sysVis = vis;
    if (!D.evo) return;
    for (const S of D.systList) {
      if (!S) continue;
      if (!vis[S.id]) {
        if (!prev[S.id]) continue;
        const cur = D.syst[this.system];
        const slot = cur ? [...Array(16)].findIndex((_, i) => cur['Con' + (i + 1)] === this.navSys) : -1;
        if (this.navMode === 3 && this.navSys >= 0 && slot === S.index) this.navSys = -1;
        const k = this.route.indexOf(S.id);
        if (k >= 0) this.route.length = k;
      } else {
        for (const T of D.systList) {
          if (T && T !== S && T.xPos === S.xPos && T.yPos === S.yPos && (p.explored[S.id] ?? 0) < (p.explored[T.id] ?? 0)) p.explored[S.id] = p.explored[T.id];
        }
      }
    }
  }
  inPlay(sysId) { return !!this.sysVis[sysId]; }
  spobInPlay(id) { const P = this.data.spob[id]; return !!P && !!this.sysVis[P.System]; }
  // FUN_10051e9c (EVO): in play and the VisBit still passes on the current bits; values outside both
  // ranges pass here (the pass above hides them). The mission destination pickers use it.
  visibleNow(sysId) { const S = this.data.syst[sysId]; return !!S && !!this.sysVis[sysId] && this.data.visBitOn(this.pilot.bits, S.VisBit, true); }

  // ---------- shared helpers used by the other engine modules ----------
  cargoCapacity() { return cargoCapacity(this); }
  cargoUsed() { return cargoUsed(this); }
  // 0x10066c70: escort freighters (inherent AI < 3) in formation add their holds.
  cargoCapacityWithEscorts() {
    let c = cargoCapacity(this);
    for (const e of this.ships) if (e?.alive && e.leader === 0 && e.ai === 6 && !(e.mission >= 0) && !isDisabled(e) && this.data.ship[e.type].InherentAI < 3) c += Math.abs(this.data.ship[e.type].Holds);
    return c;
  }
  oopsState(id) { return (this.pilot.oops[id] ??= { days: 0, spob: -1 }); }
  // Weapons = the ship's defaults plus weapon outfits; ammo is kept.
  outfitsChanged() {
    const p = this.pilot, T = this.data.ship[p.shipType], w = {};
    for (let i = 0; i < 4; i++) { const id = T.WeapType[i]; if (id >= 128 && T.WeapCount[i] > 0) (w[id] ??= { count: 0, ammo: 0 }).count += T.WeapCount[i]; }
    for (const [id, n] of Object.entries(p.outfits)) { const o = this.data.outf[id]; if (n > 0 && o.ModType === MOD.WEAPON && o.ModVal >= 128) (w[o.ModVal] ??= { count: 0, ammo: 0 }).count += n; }
    for (const id of Object.keys(w)) w[id].ammo = p.weapons[id]?.ammo ?? 0;
    for (const [id, x] of Object.entries(p.weapons)) if (!w[id] && x.ammo > 0) w[id] = { count: 0, ammo: x.ammo };
    p.weapons = w;
    const s = this.player;
    if (s) {
      computeStats(this.data, s, p.outfits);
      for (const [id, x] of Object.entries(w)) { const cur = s.weapons[id]; s.weapons[id] = { count: x.count, ammo: x.ammo, reload: cur?.reload ?? 0 }; }
      for (const id of Object.keys(s.weapons)) if (!w[id]) delete s.weapons[id];
    }
  }
  onShipKilled(s) { M.onShipKilled(this, s); }
  onShipDisabled(s) { M.onShipDisabled(this, s); }
  onShipJumpedOut(s) { M.onShipJumpedOut(this, s); }
  missionFailed(i) { M.setFailed(this, i); }
  provoke(T, attacker, mass, energy, direct) { provoke(this, T, attacker, mass, energy, direct); }
  tickCount() { return this.steps; }

  // ---------- events and messages ----------
  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  // FUN_1001c7dc(text, ticks): ticks is how long the message stays (the original passes 0xf0 to 0x200).
  // FUN_1001c7dc keeps one message and its tick count [100794d0], counted down each frame by FUN_1002dc64;
  // distress calls and pers quotes wait until it has run out.
  message(text, kind = 'msg', ticks = 0xf0) { this.msgTicks = ticks; this.emit({ type: 'msg', text, kind, ticks }); }
  beep(n) { this.emit({ type: 'sound', id: 149 + n }); }   // the Beep1-5 table at [1007950c] (snd 150-154)
  get player() { return this.ships[0]; }

  // ---------- player ship ----------
  buildPlayer() {
    const p = this.pilot, s = newShip(this.data, 0, p.shipType, { leader: -1, govt: -1, ai: 0, strict: !!p.strict });
    computeStats(this.data, s, p.outfits);
    s.weapons = {};
    for (const [id, w] of Object.entries(p.weapons)) if (w.count > 0) s.weapons[id] = { count: w.count, ammo: w.ammo, reload: 0 };
    s.pool = s.stats.shieldMax;
    s.fuel = Math.min(p.fuel, s.stats.fuelMax);
    s.selected = -1;
    this.abLimit = s.stats.speed;
    return s;
  }
  // Copy ship-side consumables back into the pilot record.
  syncPilot() {
    const s = this.player, p = this.pilot;
    if (!s) return;
    p.fuel = Math.max(0, Math.trunc(s.fuel));
    for (const [id, w] of Object.entries(s.weapons)) if (p.weapons[id]) p.weapons[id].ammo = w.ammo;
    p.system = this.system;
  }
  refreshPlayerStats() {
    const s = this.player; if (!s) return;
    computeStats(this.data, s, this.pilot.outfits);
  }

  // ---------- leaving and arriving ----------
  // Take off from the spob we are landed on.
  launch() {
    const P = this.data.spob[this.landed];
    this.placePlayer(P ? P.xPos : 50, P ? P.yPos : 50, this.rng.rand(36) * 10);
    if (this.tutorial < 3) this.tutorial = -1;          // 0x10031bb4 l.19813: next hint is the hyperspace one
    this.roidClear = true; this.boxClear = true;        // l.19866: the field refills from the corners
    this.emit({ type: 'launch' });
    this.emit({ type: 'sound', id: 390 });
  }
  // Enter Ship from the title screen: the original never starts a session on the ground. A pilot read
  // from its file starts at the centre of the stellar it last landed on, facing Rand(360) (load
  // 0x10028234). A brand-new pilot starts at (50,50) facing 0 (0x1005bf28) with the tutorial armed
  // (state -3, FUN_1004ef64).
  enterSpace() {
    const p = this.pilot, P = this.data.spob[p.spob];
    if (P) { this.system = P.System; p.system = P.System; }
    if (p.fresh) { delete p.fresh; this.placePlayer(50, 50, 0); this.tutorial = -3; }
    else this.placePlayer(P ? P.xPos : 50, P ? P.yPos : 50, this.rng.rand(360));
    initRoids(this); this.roidClear = true; this.boxClear = true;             // FUN_1004c448/FUN_1004c8d8: FUN_1001e520, then the clear flag
    this.updateVisibility();                                                  // main loop entry (EVO 0x100621a8)
  }
  placePlayer(x, y, facing) {
    this.ships.fill(null); this.shots.length = 0; this.beams.length = 0;
    const s = this.buildPlayer();
    this.ships[0] = s;
    s.x = x; s.y = y; s.facing = s.desired = facing;
    this.landed = null; this.landCounter = -1; this.navSpob = -1;
    this.frame = 0xfff1 % (FRAME_WRAP + 1);
    systemEntry(this);
    this.restoreEscorts(s);
    M.onSystemEntry(this);
    this.attitude = -1; this.tributeAsked = new Set();
  }

  // Tutorial hints (0x10031bb4 l.21778-21832, asm 0x10038a40-0x10038dac), checked when the frame
  // counter is a multiple of 60 and the state is below 2. Distances are squared, from the system centre.
  stepTutorial(s) {
    if (this.tutorial >= 2 || this.frame % 60 !== 0) return;
    const D = this.data, nav1 = D.syst[this.system]?.Nav1, P = nav1 >= 128 ? D.spob[nav1] : null;
    // Key names come from the player's key map (STR# 129); ours are fixed: L land, M map, J jump.
    if (this.tutorial === -3) {
      const dock = D.spobFlag(P ?? {}, SPOB.STATION) && D.engineStrings?.tutDock1;   // Override only
      if (P) this.message(D.msg(dock ? 'tutDock1' : 'tutLand1') + P.name + D.msg('tutLand2') + 'L' + D.msg('tutLand3'), 'msg', 0x200);
      this.tutorial = -2;
    }
    if (this.tutorial === -1) {
      if (P) this.message(D.msg('tutJump1') + 'M' + D.msg('tutJump2') + 'J' + D.msg('tutJump3'), 'msg', 0x200);
      this.tutorial = 0;
    }
    const d2 = s.x * s.x + s.y * s.y;
    if (d2 > 2000000 && this.tutorial <= 0) { this.message(D.msg('tutorialFar'), 'msg', 0x200); this.tutorial = 1; }
    else if (d2 > 5000000 && this.tutorial === 1) { this.message(D.msg('tutorialTooFar'), 'msg', 0x200); this.tutorial = 2; }
  }

  restoreEscorts(s) {
    for (const e of this.pilot.escorts) {
      const slot = this.ships.findIndex((x, i) => i > 0 && !x?.alive); if (slot < 0) break;
      const ship = newShip(this.data, slot, e.type, { leader: 0, ai: 6, govt: -1, x: s.x + this.rng.rand(100) - 50, y: s.y + this.rng.rand(100) - 50, hired: e.hired, strict: !!this.pilot.strict });
      computeStats(this.data, ship);
      ship.weapons = defaultWeapons(this.data, e.type);
      ship.facing = ship.desired = s.facing; ship.vx = s.vx; ship.vy = s.vy;
      this.ships[slot] = ship;
    }
  }

  removeShip(s) { s.alive = false; if (this.ships[s.slot] === s) this.ships[s.slot] = null; if (this.player?.target === s.slot) this.player.target = -1; }

  startDeath(s) {
    if (s.death > 0) return;
    s.death = this.data.ship[s.type].DeathDelay * (s.slot === 0 ? 3 : 1);
    s.deathMax = s.death;
    if (s.slot === 0) this.message('Your ship is breaking up!');
    this.emit({ type: 'sound', id: 302, x: s.x, y: s.y });
  }

  // FUN_1001ff04 (Override FUN_1006b3e0, same rule): each living ship's +0x978 is the damage already
  // flying at it, 0.5 * (MassDmg + EnergyDmg) per live shot aimed at it (+0x24 target, +0x2c state 0:
  // homing on a ship, not an asteroid or decoy), truncated to a short after each shot.
  incomingDamage() {
    for (const s of this.ships) {
      if (!s?.alive) continue;
      s.threat = 0;
      for (const sh of this.shots) {
        if (sh.life > 0 && sh.target === s.slot && sh.state === 0) {
          const W = this.data.weap[sh.wid];
          s.threat = Math.trunc(s.threat + 0.5 * ((W?.MassDmg ?? 0) + (W?.EnergyDmg ?? 0))) << 16 >> 16;
        }
      }
    }
  }

  // ---------- the step ----------
  step(input) {
    if (this.landed || this.gameOver) return;
    this.frame = this.frame >= FRAME_WRAP ? 0 : this.frame + 1;
    this.steps++;
    if ((this.msgTicks ?? -1) > -1) this.msgTicks--;    // FUN_1002dc64
    syncRoids(this);                                 // FUN_10015440
    const P = this.player;
    // After the ship is gone the world runs on until its death counter reaches -0xef, then the game
    // returns to the title (0x10031bb4 l.19240-19247). A strict pilot's file is deleted then.
    if (this.deadTicks >= 0) {
      if (++this.deadTicks >= 0xf0) {
        this.gameOver = true;
        this.emit({ type: 'playerDied', deleteFile: !!this.pilot.strict && P.type !== POD_TYPE });
        return;
      }
    } else {
      this.stepPlayer(P, input);
      if (!this.player) return;                      // jumped: the world was rebuilt this step
      this.stepTutorial(this.player);
    }
    this.incomingDamage();                           // FUN_1001ff04 (Override FUN_1006b3e0)
    spawnRoid(this, 1);                              // FUN_10015bc4: FUN_1001e770(1) every frame
    periodicSpawn(this);
    M.stepSpawns(this);
    M.updateAll(this);
    this.stepDefenders();
    // AI (FUN_10015bc4): on even frames one ship with an AI type thinks, round robin, and every ship
    // arriving from hyperspace (state 8) thinks as well.
    if (this.frame % 2 === 0) {
      const thinks = s => s?.alive && s.ai > 0;
      if (this.ships.some((s, i) => i > 0 && thinks(s))) {
        do { this.thinker = this.thinker >= 35 || this.thinker < 1 ? 1 : this.thinker + 1; } while (!thinks(this.ships[this.thinker]));
        think(this, this.ships[this.thinker]);
      }
      for (let i = 1; i < 36; i++) {
        const s = this.ships[i];
        if (i !== this.thinker && thinks(s) && s.state === ST.ARRIVE) think(this, s);
      }
    }
    for (let i = 1; i < 36; i++) {
      const s = this.ships[i];
      if (!s?.alive) continue;
      npcStep(this, s);
      if (s.alive) this.persQuote(s);
      if (s.alive && s.death > 0) this.stepDeath(s);
    }
    stepRoids(this);
    this.stepBoxes();
    stepShots(this);
    stepBeams(this);
    if (P.alive && P.death > 0) this.stepDeath(P);
    this.roidClear = false; this.boxClear = false;   // main loop 0x10015874
  }

  // FUN_10018054 l.10184-10273: a living pers ship with a HailQuote may speak it (FUN_100232ec: Beep5,
  // STR# 7101, 420 ticks), 1 step in 140 while no message is up, the player isn't jumping or cloaked
  // and the ship is neither dead nor leaving (FUN_10008edc). Pers Flags: 0x20 only while disabled
  // (otherwise only while not), 0x10 never, 0x4 only with a grudge, 0x8 only if friendly, 0x400 only
  // while its LinkMission is available, 0x800 not while it heads out (state 2), 0x1000/0x2000/0x4000
  // not when the player's ship type's InherentAI is 1 / 2 / above 2, 0x80 once only.
  persQuote(s) {
    const D = this.data, Pr = s.pers >= 128 ? D.pers[s.pers] : null, P = this.player;
    if (!Pr || !(Pr.HailQuote >= 0) || !this.pilot.persAlive(s.pers) || !P || P.jump > 0 || this.pilot.cloaked) return;
    if (isDead(s)) return;
    const leaving = [2, 0xb, 3].includes(s.state) && (s.action === 4 || s.action === 0xd);
    if (leaving) return;
    const F = Pr.Flags, pai = D.ship[P.type]?.InherentAI ?? 0;
    let ok = isDisabled(s) ? !!(F & 0x20) : !(F & 0x20);
    if (F & 0x10) ok = false;
    if ((F & 4) && !this.pilot.persGrudge?.[s.pers]) ok = false;
    if ((F & 8) && !friendlyToPlayer(this, s)) ok = false;
    if (Pr.LinkMission >= 128 && (F & 0x400) && !(D.misn[Pr.LinkMission] && M.available(this, D.misn[Pr.LinkMission], M.LIST_FLIGHT))) ok = false;
    if ((F & 0x800) && s.state === 2) ok = false;
    if ((F & 0x1000) && pai === 1) ok = false;
    if ((F & 0x2000) && pai === 2) ok = false;
    if ((F & 0x4000) && pai > 2) ok = false;
    if ((F & 0x80) && s.quoted) ok = false;
    if (!ok) return;
    if (this.rng.rand(0x8c) !== 0 || (this.msgTicks ?? -1) >= 1) return;
    this.beep(5);
    const text = M.substitute(this, D.str(7101, Pr.HailQuote - 1), { osn: Pr.name });
    this.message(text, 'msg', 0x1a4);
    s.quoted = true;
  }
  stepDeath(s) {
    s.death--;
    const r = s.death, chance = r < 20 ? 1 : r < 40 ? 2 : r < 60 ? 4 : 8;
    if (this.rng.rand(chance) === 0) {
      const sz = spriteSize(this, s);
      explode(this, this.rng.rand(3) === 0 ? 1 : 0, s.x + this.rng.rand(sz.w) - sz.w / 2, s.y + this.rng.rand(sz.h) - sz.h / 2);
    }
    if (s.slot !== 0 && s.pers >= 128 && r === Math.trunc(0.5 * s.deathMax) && (this.data.pers[s.pers].Flags & 2)) {
      const G = this.data.govtOf(s.govt);
      if (!G || !(G.Flags & 0x100)) this.spawnPod(s);
    }
    if (s.death <= 0) {
      explode(this, 2, s.x, s.y);
      this.emit({ type: 'sound', id: 303, x: s.x, y: s.y });
      if (s.pers >= 128) this.pilot.persDead[s.pers] = true;
      if (s.slot === 0) { s.alive = false; this.deadTicks = 0; }
      else this.removeShip(s);
    }
  }

  // Eject in the escape pod (0x10031bb4 l.21488-21575): the wreck stays behind, the player drifts.
  ejectPlayer() {
    const s = this.player, slot = this.ships.findIndex((x, i) => i > 0 && !x?.alive);
    if (slot > 0) { const w = { ...s, slot, wreckOfPlayer: true, leader: -1, ai: 1, weapons: {} }; this.ships[slot] = w; }
    const p = this.pilot;
    p.outfits = {}; p.weapons = {}; p.cargo = [0, 0, 0, 0, 0, 0]; p.junk = {};
    for (let i = 0; i < M.MAX_MISSIONS; i++) if (p.missions[i]) M.cleanup(this, i);
    s.type = POD_TYPE; s.death = 0; s.weapons = {}; s.selected = -1; s.target = -1;
    computeStats(this.data, s); s.pool = s.stats.shieldMax;
    this.podDrift = 0x1a4;                 // l.21576; the jump sound is stopped and the jump cancelled
    s.jump = 0; s.jumpCount = 0; s.jumpTicks = 0;
    this.message('You eject in your escape pod!');
    this.emit({ type: 'sound', id: 360 });
  }
  // The pod's drift runs out (0x10031bb4 l.19276-19366): one of two notices (by whether the cash covers
  // a Shuttlecraft; nothing is charged), then the ship is reset by 0x1005bf28(0): a Shuttlecraft at
  // (50,50) in the first system, nothing aboard, missions and escorts gone, credits kept. The ship gets
  // the type's name plus four random digits 0-8. Play goes on in space; a strict pilot is saved here.
  // 30 days pass and the legal records reset (l.19318-19366).
  podRescued() {
    const p = this.pilot, D = this.data, T = D.ship[128];
    const text = D.msg(p.credits < T.Cost ? 'rescuedPoor' : 'rescued');
    for (let i = 0; i < M.MAX_MISSIONS; i++) if (p.missions[i]) M.cleanup(this, i);
    p.shipType = 128; p.outfits = {}; p.weapons = {}; p.cargo = [0, 0, 0, 0, 0, 0]; p.junk = {}; p.escorts = [];
    for (let i = 0; i < 4; i++) {
      const id = T.WeapType[i];
      if (id >= 128 && T.WeapCount[i] > 0) p.weapons[id] = { count: T.WeapCount[i], ammo: Math.max(0, T.AmmoLoad[i]) };
    }
    p.fuel = T.Fuel; p.cloaked = false; this.podDrift = 0;
    let name = T.name + ' ';
    for (let i = 0; i < 4; i++) name += this.rng.rand(9);
    p.shipName = name;
    const first = D.systList.find(Boolean);
    this.system = p.system = first.id; this.navSys = -1; this.route = []; this.navMode = -1; this.destructTimer = -1;   // 0x1005bf28
    this.tutorial = 0x7fff;
    this.placePlayer(50, 50, 0);
    // Then 30 calls of the daily tick FUN_10063e7c (the drift took "days"), and every system's legal
    // record goes back to its govt's initial record (0 where the system has no govt).
    for (let i = 0; i < 30; i++) this.dayTick();
    this.updateVisibility();                            // EVO 0x10027830: after the 30 daily ticks
    p.legal = {};
    for (const s of D.systList) if (s && s.Govt >= 128) p.legal[s.id] = D.govt[s.Govt]?.InitialRec ?? 0;
    this.emit({ type: 'ui', what: 'notice', text });
    if (p.strict) {
      const nav = [first.Nav1, first.Nav2, first.Nav3, first.Nav4].find(n => n >= 128 && D.spob[n]);
      this.emit({ type: 'autosave', spob: nav ?? -1 });
    }
  }

  spawnPod(s) {
    const slot = this.ships.findIndex((x, i) => i > 0 && !x?.alive); if (slot < 0) return;
    const pod = newShip(this.data, slot, POD_TYPE, { x: s.x, y: s.y, facing: s.facing, desired: s.facing, ai: 1, govt: s.govt, delay: 1000 });
    this.ships[slot] = pod;
    this.emit({ type: 'sound', id: 360, x: s.x, y: s.y });
  }

  stepDefenders() {
    for (const p of this.data.spobs(this.system)) {
      if (!this.defenseAlert?.has(p.id)) continue;
      const max = p.DefCount % 10 || 1;
      const up = this.ships.filter(s => s?.alive && s.defends === p.id).length;
      if (up < max && !launchDefender(this, p)) this.defenseAlert.delete(p.id);
    }
  }

  // ---------- player step 0x10031bb4 ----------
  stepPlayer(s, input) {
    const held = input.held, pressed = input.pressed, st = s.stats;
    for (const w of Object.values(s.weapons)) if (w.reload > 0) w.reload--;
    if (s.delay > 0) s.delay--;
    const dying = s.death > 0;
    const pod = hasOutfit(this.data, this.pilot.outfits, MOD.POD);
    if (dying && pod && s.death > 1 && (pressed.has(CMD.EJECT) ||
      (hasOutfit(this.data, this.pilot.outfits, MOD.AUTOEJECT) && (s.death <= 0.5 * s.deathMax || s.death < 31)))) { this.ejectPlayer(); return; }
    // The pod drifts 0x1a4 steps (l.19276-19286): no control, full thrust along its facing, then rescue.
    if (this.podDrift > 0) {
      s.desired = s.facing;
      const v = { x: s.vx, y: s.vy }; thrustLimited(v, s.facing, st.accel, st.speed); s.vx = v.x; s.vy = v.y;
      s.x += s.vx * SPEED.S; s.y += s.vy * SPEED.S;
      if (--this.podDrift === 0) this.podRescued();
      return;
    }
    s.desired = s.facing;
    this.navKeys(s, held);
    if (!dying) this.commands(s, pressed);
    this.selfDestruct(s, held, dying);
    this.cloakStep(s);
    if (!dying && held.has(CMD.REVERSE) && (Math.abs(s.vx) >= 0.05 || Math.abs(s.vy) >= 0.05))
      s.desired = wrap(bearing(0, 0, 100 * s.vx, 100 * s.vy) + 180);
    if (!dying && held.has(CMD.AUTOPILOT)) {
      const t = this.navTargetPos(s); if (t) s.desired = bearing(s.x, s.y, t.x, t.y);
    }
    this.jumpSteer(s, pressed);
    // turn
    if (s.desired === s.facing) {
      if (s.jump <= 0 && !dying) {
        if (held.has(CMD.LEFT)) s.facing = wrap(s.facing - st.turn);
        if (held.has(CMD.RIGHT)) s.facing = wrap(s.facing + st.turn);
      }
    } else {
      const diff = s.desired - s.facing;
      if (st.turn <= Math.abs(diff)) s.facing = wrap(s.facing + (wrap(diff) <= 180 ? st.turn : -st.turn));
    }
    // thrust
    if (!dying && held.has(CMD.ACCELERATE) && s.delay <= 0 && s.jump <= 0) {
      const v = { x: s.vx, y: s.vy }; thrustLimited(v, s.facing, st.accel, st.speed); s.vx = v.x; s.vy = v.y;
    }
    // shield regen (also repairs armor)
    if (s.pool < st.shieldMax && !isDead(s) && this.frame % st.interval === 0) {
      s.pool = Math.trunc(s.pool + 0.01 * st.shieldMax);
      if (s.pool > st.shieldMax) s.pool = Math.trunc(st.shieldMax);
    }
    this.jumpCreep(s);
    // velocity box, integrate, bounds
    { const v = { x: s.vx, y: s.vy }; boxClamp(v, this.abLimit); s.vx = v.x; s.vy = v.y; }
    s.x += s.vx * SPEED.S; s.y += s.vy * SPEED.S;
    if (Math.abs(s.y) > 20000) { const v = { x: s.vx, y: s.vy }; thrustLimited(v, bearing(s.x, s.y, 0, 0), 1.1 * st.accel, 0.1 * st.speed); s.vx = v.x; s.vy = v.y; }
    s.x = Math.max(-20256, Math.min(20256, s.x)); s.y = Math.max(-20256, Math.min(20256, s.y));
    // afterburner
    if (!dying && held.has(CMD.AFTERBURNER) && hasOutfit(this.data, this.pilot.outfits, MOD.AFTERBURNER) && s.jump <= 0 && s.fuel > 0 && s.delay <= 0) {
      this.abLimit = 1.8 * st.speed;
      const v = { x: s.vx, y: s.vy }; addPolar(v, s.facing, 2.75 * st.accel); s.vx = v.x; s.vy = v.y;
      if (this.frame % 4 === 0) s.fuel = Math.max(0, s.fuel - 5);
      s.afterburning = true;
    } else {
      s.afterburning = false;
      if (this.abLimit > st.speed) this.abLimit -= 0.4 * st.accel;
      if (this.abLimit < st.speed) this.abLimit = st.speed;
    }
    // ramscoop: one roll per outfit type
    if (s.fuel < st.fuelMax) for (const [id, n] of Object.entries(this.pilot.outfits)) {
      const o = this.data.outf[id];
      if (n > 0 && o.ModType === MOD.RAMSCOOP && this.rng.rand(o.ModVal) === 0) s.fuel++;
    }
    this.pilot.credits = Math.max(0, Math.min(0x5fffffff, this.pilot.credits));
    // weapons
    if (!dying && s.jump < 1 && s.delay < 1 && !this.pilot.cloaked) {
      if (input.held.has(CMD.FIRE_PRIMARY))
        for (const id of Object.keys(s.weapons)) if (!(this.data.weap[id].MiscFlags & 2)) fireWeapon(this, s, +id);
      if (input.held.has(CMD.FIRE_SECONDARY) && s.selected >= 0) fireWeapon(this, s, s.selected);
    }
    this.landingTraffic(s);
    if (this.jumpArrive) { const d = this.jumpArrive; this.jumpArrive = null; this.arrive(d); }
  }

  navTargetPos(s) {
    if (s.target >= 0 && this.ships[s.target]?.alive) return this.ships[s.target];
    const p = this.data.spob[this.navSpob];
    return p ? { x: p.xPos, y: p.yPos } : null;
  }

  // Self-destruct (0x10031bb4 l.21634-21673, DAT_1007fb62). Command-D (Command plus the slot-26 key)
  // starts a 360-step countdown unless the ship is disabled or dying: Beep4 and "Self-destruct sequence
  // initiated." Every 30 steps from 300 down, Beep3 and "Self-destruct N second(s)." At 0, if Command-D
  // is still held, Beep1 and "Have a nice day." and the pool drops to -32000 (+0x66 = 0xffff8300);
  // otherwise Beep1 and "Self-destruct sequence cancelled."
  selfDestruct(s, held, dying) {
    const keys = held.has(CMD.DESTRUCT);
    if (this.destructTimer === undefined) this.destructTimer = -1;
    if (keys && this.destructTimer < 0 && !isDisabled(s) && !dying) {
      this.beep(4); this.message('Self-destruct sequence initiated.', 'msg', 0x28);
      this.destructTimer = 0x168;
    }
    if (this.destructTimer > 0) {
      this.destructTimer--;
      const t = this.destructTimer;
      if (t % 30 === 0 && t < 0x12d) {
        const n = t / 30;
        this.beep(3); this.message('Self-destruct ' + n + ' second' + (t > 30 ? 's' : '') + '.', 'msg', 0x28);
      }
    }
    if (this.destructTimer === 0) {
      this.beep(1);
      if (keys) { this.message('Have a nice day.', 'msg', 0x28); s.pool = -32000; }
      else this.message('Self-destruct sequence cancelled.', 'msg', 0x28);
      this.destructTimer = -1;
    }
  }

  // The stellar keys (0x10031bb4 l.19473-19527), read while the jump counter is < 1: keys 1-4 and the
  // key record's slots +0x3a..+0x40 (F1-F4) pick Nav1-4 of this system, F5 or Command-5 the nearest
  // landable stellar (FUN_100618d4); the last one tested wins. Edge-triggered over all of them
  // ([1007a82e]); a stellar of this system becomes the nav target (mode 2) with Beep1 and the landing
  // clearance is dropped. navKey keeps the key's value (local_3ec) for the escort orders.
  navKeys(s, held) {
    this.navKey = -1;
    if (s.jump >= 1) return;
    [CMD.NAV1, CMD.NAV2, CMD.NAV3, CMD.NAV4].forEach((c, i) => { if (held.has(c)) this.navKey = i; });
    if (held.has(CMD.NAV_NEAREST)) this.navKey = 5;
    if (this.navKey === -1) { this.navLatch = false; return; }
    if (this.navLatch) return;
    this.navLatch = true;
    const S = this.data.syst[this.system];
    const id = this.navKey === 5 ? this.nearestLandable(s) : S?.['Nav' + (this.navKey + 1)] ?? -1;
    if (id >= 128 && this.data.spob[id]?.System === this.system) {
      this.beep(1); this.navSpob = id; this.navMode = 2; this.landCounter = -1;
    }
  }

  // Pressed-key commands.
  commands(s, pressed) {
    for (const c of pressed) switch (c) {
      case CMD.TARGET_SELECT: this.cycleTarget(s); break;
      case CMD.CLOSEST_TARGET: this.closestTarget(s); break;
      case CMD.LAND: this.landKey(s); break;
      case CMD.HYPER_SELECT: if (s.jump <= 0 && this.navMode === 3) this.cycleHyper(); break;
      case CMD.JUMP: this.jumpKey(s); break;
      // l.19410-19432: Nav Off (mode -1) and Hyper Mode (mode 3, no destination yet) play Beep1 and
      // drop the landing clearance; neither works while jumping.
      case CMD.NAV_OFF: if (s.jump > 0) break; this.beep(1); this.navMode = -1; this.navSys = -1; this.navSpob = -1; this.landCounter = -1; break;   // +0x24/+0x26 only: the map route stays
      case CMD.HYPER_MODE:
        if (s.jump > 0) break;
        this.beep(1); this.landCounter = -1;
        // FUN_1003e9d4: the map's destination becomes the target again when it is a link from here
        if (this.navMode !== 3) { this.navMode = 3; this.navSys = this.route.length && this.data.links(this.system).includes(this.route[0]) ? this.route[0] : -1; }
        break;
      case CMD.SELECT_SECONDARY: this.cycleSecondary(s); break;
      case CMD.WEAPON_SAFETY: s.selected = -1; break;
      // Escort orders (0x10031bb4 l.21227-21308): a message only when some ship took the order.
      case CMD.RETARGET: if (escortOrder(this, 'attack')) this.message(this.data.msg('fightersEngage'), 'msg', 0x78); break;
      case CMD.RECALL: if (escortOrder(this, 'formation')) this.message(this.data.msg('escortsFormation'), 'msg', 0x78); break;
      case CMD.RECALL_FIGHTERS: if (escortOrder(this, 'recallFighters')) this.message(this.data.msg('fightersReturn'), 'msg', 0x78); break;
      case CMD.HOLD: if (escortOrder(this, 'hold')) this.message(this.data.msg('escortsHold'), 'msg', 0x78); break;
      case CMD.BOARD: this.boardKey(s); break;
      case CMD.MISSION_INFO: if (!this.pilot.missions.some(Boolean)) this.message(this.data.msg('noMissions')); else this.emit({ type: 'ui', what: CMD.MISSION_INFO }); break;
      case CMD.COMMUNICATE: this.hailKey(s, false); break;
      case CMD.HAIL_PLANET: this.hailKey(s, true); break;
      case CMD.CLOAK: if (s.jump <= 0) this.toggleCloak(s); break;
      case CMD.JETTISON: this.jettison(s, true); break;
      case CMD.JETTISON_NONMISSION: this.jettison(s, false); break;
      case CMD.EJECT: break;
      default: this.emit({ type: 'ui', what: c });
    }
  }
  // Take a captured ship as your own (DLOG 1018 "Use As My Ship"). Your old hull is left behind.
  swapToShip(slot) {
    const x = this.ships[slot], s = this.player, p = this.pilot; if (!x?.alive || !s) return;
    const T = this.data.ship[x.type];
    p.shipType = x.type;
    for (const [id, n] of Object.entries(p.outfits)) if (n > 0 && !(this.data.outf[id].Flags & 4)) delete p.outfits[id];
    p.weapons = {}; this.outfitsChanged();
    for (const [id, w] of Object.entries(x.weapons)) if (p.weapons[id]) p.weapons[id].ammo = w.ammo;
    s.type = x.type; computeStats(this.data, s, p.outfits);
    s.weapons = {}; for (const [id, w] of Object.entries(p.weapons)) s.weapons[id] = { count: w.count, ammo: w.ammo, reload: 0 };
    s.pool = Math.max(x.pool, 0); s.fuel = Math.min(x.fuel, s.stats.fuelMax); s.x = x.x; s.y = x.y; s.vx = x.vx; s.vy = x.vy;
    this.abLimit = s.stats.speed;
    this.removeShip(x);
    if (Math.abs(T.Holds) < this.cargoUsed()) { let over = this.cargoUsed() - Math.abs(T.Holds); for (let i = 5; i >= 0 && over > 0; i--) { const n = Math.min(over, p.cargo[i]); p.cargo[i] -= n; over -= n; } }
  }
  // The hail key, ev_player_hail_target 0x10038f8c. Beep4 (snd 153) and nothing else while cloaked,
  // dying or jumping. With no ship targeted, or with Option held, the nav stellar is hailed: one that
  // can't be landed on or is uninhabited gives "No response."; with no stellar selected there is only
  // the beep. A targeted ship that is jumping can't be hailed ("No response." if it is disabled), nor can
  // one of a govt with flag 0x400, of ship type index 63, disabled, or the pers 0x1ff.
  hailKey(s, option) {
    const D = this.data, beep = () => this.emit({ type: 'sound', id: 153 });
    const noResponse = () => { beep(); this.message(D.msg('noResponse'), 'msg', 0xf0); };
    if (this.pilot.cloaked || isDead(s) || s.jump > 0) { beep(); return; }
    const t = s.target >= 0 ? this.ships[s.target] : null;
    if (!t?.alive || option) {
      if (this.navMode !== 2 || this.navSpob < 0) { beep(); return; }   // EVO 0x1002ef00: mode 2 with a stellar
      const P = D.spob[this.navSpob];
      if (!P || !this.spobInPlay(P.id) || !D.spobFlag(P, SPOB.LAND) || D.spobFlag(P, SPOB.UNINHABITED)) { noResponse(); return; }
      this.emit({ type: 'ui', what: 'hailPlanet', spob: this.navSpob });
      return;
    }
    if (t.jump > 0) { if (isDisabled(t)) noResponse(); else { beep(); this.message(D.msg('hailJumping'), 'msg', 0xf0); } return; }
    const G = D.govtOf(t.govt);
    if ((G && (G.Flags & 0x400)) || D.ship[t.type].index === 0x3f || isDisabled(t) || t.pers === 0x1ff) { noResponse(); return; }
    this.emit({ type: 'ui', what: 'hailShip', slot: t.slot });
  }
  // The cloak key (0x10031bb4 l.21728-21749, edge-triggered, ignored while dying or jumping): Beep4
  // without a Cloaking Device or, to cloak, with an empty tank; otherwise FUN_10064de4 cloaks (snd 341
  // "Cloak On") or FUN_10064f20 decloaks (snd 340 "Cloak Off").
  toggleCloak(s) {
    if (!hasOutfit(this.data, this.pilot.outfits, MOD.CLOAK)) { this.emit({ type: 'sound', id: 153 }); return; }
    if (this.pilot.cloaked) { this.uncloak(); return; }
    if (s.fuel < 1) { this.emit({ type: 'sound', id: 153 }); return; }
    this.pilot.cloaked = true;
    if (s.pool > 0) s.pool = 0;                          // FUN_10064de4: cloaking drops the shields
    this.emit({ type: 'sound', id: 341 });
  }
  uncloak() {
    if (!this.pilot.cloaked) return;
    this.pilot.cloaked = false;
    this.emit({ type: 'sound', id: 340 });
  }
  // While cloaked (l.21751-21760): out of fuel decloaks, else one unit is burnt every 8th frame. The
  // cloak also drops when the ship starts to break up (l.21121), when hyperspace starts (l.20692 and
  // l.20710) and when a shot hits the player (FUN_10016420 l.9643); beams don't.
  cloakStep(s) {
    if (!this.pilot.cloaked) return;
    if (s.death > 0 || s.fuel < 1) { this.uncloak(); return; }
    if (this.frame % 8 === 0) s.fuel--;
  }
  // FUN_1001d104 (the jettison key, l.21623-21631; with Option held only non-mission cargo): all six
  // commodities and all junk go overboard; with mission cargo too, each loaded mission's cargo is
  // dumped and the mission fails ("Mission failed.", ev_mission_set_failed). Beep5 when anything went.
  // Boxes (FUN_1001d5a8, at most 12 per ship, one per 5 tons) come out of the player and, for their
  // share of the hold, of escort freighters flying in formation.
  jettison(s, withMission) {
    const p = this.pilot, D = this.data;
    let failed = false;
    let goods = p.cargo.reduce((a, n) => a + n, 0);
    for (const [id, n] of Object.entries(p.junk ?? {})) if (n > 0) { goods += n; p.junk[id] = 0; }
    let total = goods, mine = goods;
    if (withMission) for (let i = 0; i < M.MAX_MISSIONS; i++) {
      const m = p.missions[i];
      if (!m?.active || !m.loaded || m.cargoType == null || m.cargoType === -1) continue;
      total += m.cargoQty ?? 0; mine += m.cargoQty ?? 0;
      m.loaded = false;
      M.setFailed(this, i);
      this.message(D.msg('missionFailed'), 'msg', 0xf0);
      failed = true;
      if (total === 0) { total = 1; mine++; }
    }
    const cap = this.cargoCapacityWithEscorts();
    for (const x of this.ships) {
      if (!x?.alive) continue;
      let share;
      if (x.slot === 0) share = mine;
      else if (x.leader === 0 && x.ai === 6 && !(x.mission >= 0) && D.ship[x.type].InherentAI <= 2) share = Math.abs(D.ship[x.type].Holds) / Math.max(1, cap) * goods;
      else continue;
      if (!(share > 0)) continue;
      let n = Math.trunc(share / 5); if (n < 1) n++; if (n > 12) n = 12;
      for (let k = 0; k < n; k++) this.spawnBox(x);
    }
    p.cargo = [0, 0, 0, 0, 0, 0];
    if (total > 0) {
      this.emit({ type: 'sound', id: 154 });
      if (!failed) this.message(D.msg(withMission ? 'cargoJettisoned' : 'nonMissionJettisoned'), 'msg', 0xf0);
    }
  }
  // FUN_1001d5a8: 16 box slots. Half the ship's sprite width behind it, the ship's velocity plus
  // (Rand(40) + 30) / 100 toward facing + 180 + Rand(30) - Rand(15); lives Rand(90) + 180 frames,
  // spins 1 or 2 frames a step either way (move proc FUN_1002ca60).
  spawnBox(x) {
    const k = this.boxes.findIndex(b => b.life < -1); if (k < 0 && this.boxes.length >= 16) return;
    const rng = this.rng, b = { x: x.x, y: x.y, vx: x.vx, vy: x.vy };
    b.life = rng.rand(90) + 180;
    b.frame = rng.rand(36);
    b.spin = [-2, -1, 1, 2][rng.rand(4)];
    addPolar(b, wrap(x.facing + 180), Math.trunc(0.5 * spriteSize(this, x).w));
    const sp = (rng.rand(40) + 30) / 100, ang = (x.facing + rng.rand(30) + 180 - rng.rand(15)) % 360;
    const v = { x: b.vx, y: b.vy }; addPolar(v, ang, sp); b.vx = v.x; b.vy = v.y;
    if (k < 0) this.boxes.push(b); else this.boxes[k] = b;
  }
  stepBoxes() {
    for (const b of this.boxes) {
      if (b.life < -1) continue;
      if (--b.life < 0 || this.boxClear) { b.life = -2; continue; }
      b.frame = ((b.frame + b.spin) % 36 + 36) % 36;
      b.x += b.vx * SPEED.S; b.y += b.vy * SPEED.S;
    }
  }

  hasEscorts() { return this.ships.some(x => x?.alive && x.leader === 0); }

  targetable(t) { return t?.alive && t.slot !== 0 && t.jump === 0 && !(t.death > 0); }
  cycleTarget(s) {
    for (let k = 1; k <= 36; k++) {
      const i = ((s.target < 0 ? 0 : s.target) + k) % 36;
      if (this.targetable(this.ships[i])) { s.target = i; this.emit({ type: 'sound', id: 150 }); return; }
    }
    s.target = -1;
  }
  closestTarget(s) {
    let best = -1, bd = Infinity;
    for (const t of this.ships) if (this.targetable(t)) {
      const d = (t.x - s.x) ** 2 + (t.y - s.y) ** 2; if (d < bd) { bd = d; best = t.slot; }
    }
    if (best >= 0) { s.target = best; this.emit({ type: 'sound', id: 150 }); }
  }
  cycleSecondary(s) {
    const list = Object.keys(s.weapons).map(Number).filter(id => this.data.weap[id].MiscFlags & 2).sort((a, b) => a - b);
    if (!list.length) { s.selected = -1; return; }
    const i = list.indexOf(s.selected);
    s.selected = i < 0 ? list[0] : i + 1 < list.length ? list[i + 1] : -1;
  }
  // Only links in play are offered (EVO 0x10027830: the slot walk skips -1 and hidden systems); with
  // none the target is cleared.
  cycleHyper() {
    this.beep(3);                                       // l.19441: Beep3
    const links = this.data.links(this.system).filter(id => this.inPlay(id));
    if (!links.length) { this.navSys = -1; this.route = []; return; }
    const i = links.indexOf(this.navSys);
    this.navSys = links[(i + 1) % links.length];
    this.route = [this.navSys];
  }
  // Called by the map UI.
  setRoute(route) { this.route = route.slice(); this.navSys = route[0] ?? -1; if (this.navSys >= 0) this.navMode = 3; }

  // ---------- landing ----------
  // FUN_100618d4: the nearest of the system's Nav1-4 that is in play and can be landed on (-1 if none).
  nearestLandable(s) {
    const D = this.data, S = D.syst[this.system]; let best = -1, bd = -1;
    for (const id of [S.Nav1, S.Nav2, S.Nav3, S.Nav4]) {
      const P = D.spob[id];
      if (!P || !this.spobInPlay(id) || !D.spobFlag(P, SPOB.LAND)) continue;
      const d = (s.x - P.xPos) ** 2 + (s.y - P.yPos) ** 2;
      if (d < bd || bd < 0) { best = id; bd = d; }
    }
    return best;
  }
  // l.19580-19600: without a stellar selected (mode not 2 or none) the nearest landable one is taken; a
  // stellar that can't be landed on, is in another system or is out of play gets the denial.
  landKey(s) {
    if (this.navMode !== 2 || this.navSpob < 0) {
      const n = this.nearestLandable(s);
      if (n >= 0) { this.navSpob = n; this.landCounter = -1; this.navMode = 2; }   // l.19524/19588
    }
    if (this.navMode !== 2 || this.navSpob < 0) return;
    const P = this.data.spob[this.navSpob], station = this.data.spobFlag(P, SPOB.STATION);
    // l.19590: a cloaked ship can select a landable stellar but nothing else happens.
    if (this.pilot.cloaked && this.data.spobFlag(P, SPOB.LAND)) return;
    if (this.landCounter < 0 || this.landCounter > LAND_EXPIRE) {
      // First press: request permission.
      if (!this.data.spobFlag(P, SPOB.LAND) || P.System !== this.system || !this.spobInPlay(P.id)) { this.message(this.data.msg(station ? 'dockDenied' : 'landDenied') + ' ' + this.data.msg('unableTo') + this.data.msg(station ? 'dockAt' : 'landOn') + P.name + this.data.msg('theSep') + this.data.msg(station ? 'stationUnstable' : 'planetHostile')); return; }
      if (this.data.spobFlag(P, SPOB.UNINHABITED)) { this.landCounter = LAND_CLEARED; return; }
      const ok = P.Govt < 128 || this.pilot.legalIn(this.system) >= P.MinCoolness || this.pilot.dominated[P.id] || this.isMissionSpob(P.id);
      if (!ok) { this.message(this.data.msg(station ? 'dockDenied' : 'landDenied')); this.emit({ type: 'sound', id: 152 }); return; }
      if (Math.abs(P.xPos - s.x) < 250 && Math.abs(P.yPos - s.y) < 250) this.landCounter = LAND_CLEARED - 1;
      else {
        this.landCounter = 0;
        const head = this.rng.rand(2) === 0 ? this.data.msg(station ? 'dockRequest' : 'landRequest') : P.name + (station ? ' ' + this.data.msg('dockmasterReads') : this.data.msg('trafficReads'));
        this.message(head + this.data.msg('beginApproach'));
      }
      return;
    }
    // Later presses: try to land.
    const R = Math.max(75, Math.trunc(1.75 * (this.data.sprite(300 + P.Type)?.w ?? 0) / 2));
    if (this.landCounter < LAND_CLEARED || s.delay > 0) return;
    if (Math.abs(P.xPos - s.x) >= R || Math.abs(P.yPos - s.y) >= R) { this.message(this.data.msg(station ? 'landTooFarStation' : 'landTooFarPlanet')); return; }
    if (Math.abs(s.vx) > 0.75 || Math.abs(s.vy) > 0.75) { this.message(this.data.msg(station ? 'landTooFastStation' : 'landTooFastPlanet')); return; }
    this.landOn(P);
  }
  isMissionSpob(id) { return this.pilot.missions.some(m => m?.active && (m.travel === id || m.ret === id)); }

  // Per-step clearance counter (0x10031bb4 l.19990-20160).
  landingTraffic(s) {
    if (this.navSpob < 0 || this.landCounter < 0) return;
    const P = this.data.spob[this.navSpob];
    if (!P || P.System !== this.system) { this.navSpob = -1; this.landCounter = -1; return; }
    if (this.landCounter >= LAND_CLEARED - 1) this.landCounter++;
    if (Math.abs(P.xPos - s.x) < 250 && Math.abs(P.yPos - s.y) < 250 && this.landCounter < LAND_CLEARED) this.landCounter = LAND_CLEARED;
    if (this.landCounter === LAND_CLEARED) {
      const station = this.data.spobFlag(P, SPOB.STATION), word = station ? 'dock' : 'land';
      if (this.data.spobFlag(P, SPOB.UNINHABITED)) { this.message(this.data.msg('noResponse')); }
      else {
        // PTR_DAT_10079504 is the ship's name (the second New Pilot dialog), not the pilot's.
        const r = this.rng.rand(3), n = this.pilot.shipName ?? this.pilot.name;
        let t = r === 0 ? `Cleared to ${word}, ${n}. ` : r === 1 ? `${n}, you’re cleared to ${word}. ` : `You are cleared to ${word}. `;
        t += this.rng.rand(2) === 0 ? 'Commence final approach.' : `Welcome to ${P.name}.`;
        this.message(t);
      }
    }
    if (this.landCounter > LAND_EXPIRE) { this.landCounter = -1; this.navSpob = -1; }
  }

  landOn(P, rescued = false) {
    const s = this.player;
    // fighters return to their bays
    for (const f of this.ships) if (f?.alive && f.leader === 0 && f.ai === 5 && f.carrierBay != null && s.weapons[f.carrierBay]) s.weapons[f.carrierBay].ammo++;
    this.syncPilot();
    this.landed = P.id;
    this.pilot.spob = P.id;
    this.landingTexts = rescued ? [this.rescueText] : M.onLanding(this);
    this.updateVisibility();                            // the spaceport's entry (EVO 0x10036e74)
    this.pilot.spob = P.id;
    this.pilot.explored[this.system] = 2;
    markNebulae(this.data, this.pilot, this.system);
    if (hasOutfit(this.data, this.pilot.outfits, MOD.AUTOREFUEL)) {
      const n = Math.max(0, Math.min(s.stats.fuelMax - this.pilot.fuel, this.pilot.credits));
      this.pilot.fuel += n; this.pilot.credits -= n;
    }
    this.pilot.escorts = rescued ? [] : this.ships.filter(x => x?.alive && x.leader === 0 && x.ai === 6 && !isDisabled(x) && !(x.mission >= 0)).map(x => ({ type: x.type, hired: !!x.hired }));
    this.pilot.cloaked = false; this.podDrift = 0;
    this.landed = P.id;
    this.ships.fill(null); this.shots.length = 0; this.beams.length = 0;
    this.emit({ type: 'landed', spob: P.id });
  }

  // ---------- hyperspace ----------
  jumpKey(s) {
    if (s.jump > 0) return;
    if (this.navSys < 0) { this.message(this.data.msg('jumpNoDest')); return; }
    if (s.fuel < 100) { this.message(this.data.msg('jumpNoFuel')); return; }
    if (s.x * s.x + s.y * s.y <= s.stats.jumpDist ** 2) { this.message(this.data.msg('jumpTooClose')); return; }
    s.jump = 1; s.jumpCount = 0; s.jumpTicks = 0; this.uncloak();
  }
  jumpSteer(s) {
    if (s.jump <= 0) return;
    if (s.x * s.x + s.y * s.y <= s.stats.jumpDist ** 2) { s.jump = 0; this.message(this.data.msg('jumpTooClose')); return; }
    const stopped = Math.abs(Math.trunc(s.vx)) < 2 && Math.abs(Math.trunc(s.vy)) < 2;
    if (!stopped) {
      if (s.jump < 2) {
        s.desired = wrap(bearing(0, 0, 100 * s.vx, 100 * s.vy) + 180);
        if (Math.abs(s.facing - s.desired) <= s.stats.turn) { const v = { x: s.vx, y: s.vy }; addPolar(v, s.facing, s.stats.accel); s.vx = v.x; s.vy = v.y; }
      }
    } else {
      if (s.jump < 2) { s.jump = 2; s.jumpTicks = 0; this.uncloak(); this.emit({ type: 'sound', id: 128 }); }
      s.jumpCount++; s.vx *= 0.98; s.vy *= 0.98;
    }
    if (s.jump >= 2) {
      const A = this.data.syst[this.system], B = this.data.syst[this.navSys];
      s.desired = bearing(A.xPos, A.yPos, B.xPos, B.yPos);
    }
  }
  jumpCreep(s) {
    if (s.jump < 2) return;
    s.jumpTicks += 1;
    const d = s.jumpTicks / 4.6 - 50;
    if (Math.abs(s.facing - s.desired) <= s.stats.turn && d > 0) addPolar(s, s.facing, d);
    if (s.jumpCount >= 30 && (this.soundOff ? s.jumpCount > 30 && s.jumpTicks > JUMP_FALLBACK_TICKS : s.jumpTicks >= JUMP_SOUND_TICKS)) this.jumpArrive = this.navSys;
  }

  arrive(dest) {
    const s = this.player, from = this.system, A = this.data.syst[from], B = this.data.syst[dest];
    const escorts = this.ships.filter(x => x?.alive && x.leader === 0 && !isDisabled(x) && !isDead(x));
    this.ships.fill(null); this.shots.length = 0; this.beams.length = 0;
    this.prevSystem = from; this.system = dest; this.pilot.system = dest;
    this.pilot.explored[dest] = Math.max(1, this.pilot.explored[dest] ?? 0);
    markNebulae(this.data, this.pilot, dest);   // FUN_1006494c at 0x10035ca8
    this.updateVisibility();                    // EVO 0x10027830: right after the nebula pass
    const bin = bearing(A.xPos, A.yPos, B.xPos, B.yPos);
    s.x = 0; s.y = 0; addPolar(s, wrap(bin + 180), 1350);
    s.vx = 0; s.vy = 0; { const v = { x: 0, y: 0 }; addPolar(v, s.facing, s.stats.speed); s.vx = v.x; s.vy = v.y; }
    s.jump = 0; s.jumpCount = 0; s.jumpTicks = 0; s.target = -1;
    s.fuel -= 100;
    this.tutorial = 0x7fff;                          // 0x10031bb4 l.20697: the first jump ends the hints
    this.ships[0] = s;
    // l.20817 clears the mode and the targets. Then FUN_1003e948 drops the route's first system only when
    // it is the one arrived in (a jump elsewhere keeps the route), and FUN_1003e9d4 puts the ship back in
    // hyperspace mode with the route's next system as the target when it is a link from here.
    if (this.route[0] === dest) this.route.shift();
    this.navSys = -1; this.navMode = -1;
    if (this.route.length && this.data.links(dest).includes(this.route[0])) { this.navMode = 3; this.navSys = this.route[0]; }
    this.navSpob = -1; this.landCounter = -1; this.defenseAlert = new Set();
    this.attitude = -1; this.tributeAsked = new Set();
    this.roidClear = true; this.boxClear = true; initRoids(this);   // l.20924-20926
    systemEntry(this);
    for (const e of escorts) {
      const slot = this.ships.findIndex((x, i) => i > 0 && !x?.alive); if (slot < 0) break;
      e.slot = slot; e.x = s.x + this.rng.rand(140) - 70; e.y = s.y + this.rng.rand(140) - 70; e.vx = s.vx; e.vy = s.vy;
      e.facing = e.desired = s.facing; e.jump = 0; e.state = ST.IDLE; e.action = 0; e.target = -1; e.dest = -1; e.delay = 0; e.thrust = 0; e.cap = 0;
      this.ships[slot] = e;
    }
    M.onSystemEntry(this);
    for (let i = 0; i < s.stats.jumpDays; i++) this.dayTick();
    this.payEscorts();
    const lead = ['entering', 'jumpingInto', 'arrivingIn'][this.rng.rand(3)];
    const n = this.data.spobs(dest).length;
    this.message(this.data.msg(lead) + B.name + this.data.msg('systemOn') + this.pilot.dateString() + '.' + (n ? '' : this.data.msg('noStellar')));
    if (B.Message >= 128) this.message(this.data.str(1000, B.Message - 128), 'buoy');
    this.emit({ type: 'sound', id: 130 });
    this.emit({ type: 'arrived', system: dest });
  }

  dayTick() {
    this.pilot.advanceDay();
    M.dayTick(this);
    this.oopsDaily();
    // Dominated spobs count only while in play (EVO 0x1005c438, income 0x1006c044).
    for (const [id, on] of Object.entries(this.pilot.dominated)) {
      if (!on || !this.spobInPlay(+id)) continue;
      const P = this.data.spob[id], cap = P.DefCount <= 1000 ? P.DefCount : P.DefCount % 1000;
      if ((this.pilot.defenders[id] ?? 0) < cap && this.rng.rand(450) === 0) this.pilot.defenders[id] = (this.pilot.defenders[id] ?? 0) + 1;
    }
    for (const id of Object.keys(this.pilot.dominated)) if (this.pilot.dominated[id] && this.spobInPlay(+id)) this.pilot.credits += (this.data.spob[id]?.TechLevel ?? 0) * 1000;
  }
  // ev_oops_daily_tick 0x10021f68
  oopsDaily() {
    const first = this.data.spobList.find(p => p && this.spobInPlay(p.id))?.id ?? -1;   // Stellar -1: the first spob in play (EVO 0x1006d70c)
    for (const o of Object.values(this.data.oops)) M.oopsStep(this.rng, o, this.oopsState(o.id), this.pilot.bits, first, !!this.data.evo);
  }
  payEscorts() {
    for (const e of this.ships) {
      if (!e?.alive || e.leader !== 0 || !e.hired) continue;
      const wage = Math.trunc(0.01 * this.data.ship[e.type].Cost);
      if (this.pilot.credits < wage) { this.removeShip(e); this.message('Due to lack of pay, some of your escorts have defected.'); }
      else this.pilot.credits -= wage;
    }
  }

  // ---------- boarding (credits only for now) ----------
  boardKey(s) {
    if (this.pilot.cloaked) return;                      // l.20166: no boarding while cloaked
    const t = this.ships[s.target];
    if (!t?.alive || !isDisabled(t) || t.plundered || t.death > 0 || t.type === POD_TYPE) { this.message(this.data.msg('cantBoard')); return; }
    const sz = spriteSize(this, t);
    if (Math.abs(t.x - s.x) > sz.w || Math.abs(t.y - s.y) > sz.h) { this.message(this.data.msg('boardTooFar')); return; }
    if (Math.abs(t.vx - s.vx) > 1 || Math.abs(t.vy - s.vy) > 1) { this.message(this.data.msg('boardTooFast')); return; }
    if (M.onShipBoarded(this, t)) return;
    if (!(t.mission >= 0) && t.defends === -1) this.legalPenalty(t.govt, 2);
    this.emit({ type: 'ui', what: 'board', slot: t.slot });
  }

  // ---------- legal record ----------
  // ev_legal_propagate 0x10064098 from the current system, kind 0 smuggle, 1 disable, 2 board, 3 kill.
  legalPenalty(victimGovt, kind) {
    const pen = g => { const G = this.data.govtOf(g) ?? this.data.govtList[0]; return [G.SmugPenalty, G.DisabPenalty, G.BoardPenalty, G.KillPenalty, G.ShootPenalty][kind]; };
    const xeno = g => (g >= 128 ? this.data.govtOf(g).Flags & 1 : 0), nosy = g => (g >= 128 ? this.data.govtOf(g).Flags & 2 : 0);
    const V = victimGovt >= 128 ? victimGovt : -1, seen = new Set();
    const visit = sys => {
      seen.add(sys);
      const G = this.data.syst[sys].Govt >= 128 ? this.data.syst[sys].Govt : -1;
      let d;
      if (G === -1) d = V === -1 ? 0.5 * pen(128) : xeno(V) ? -0.5 * pen(V) : 0.25 * pen(V);
      else if (V === G) d = pen(G);
      else if (V === -1) d = xeno(G) ? -0.5 * pen(G) : nosy(G) ? 0.5 * pen(G) : 0;
      else {
        const gv = this.data.govtOf(V), gs = this.data.govtOf(G);
        const ally = gv.Ally === G || V === gs.Ally, enemy = gv.Enemy === G || V === gs.Enemy;
        if (ally || !xeno(V)) d = enemy || xeno(G) ? -0.5 * pen(G) : ally ? pen(V) : 0.5 * pen(V);
        else d = -0.5 * pen(G);
      }
      if (d >= 1 || d <= -1) {
        this.pilot.legal[sys] = Math.max(-32000, Math.min(32000, Math.trunc(this.pilot.legalIn(sys) - d)));
        for (const l of this.data.links(sys)) if (!seen.has(l)) visit(l);
      }
    };
    visit(this.system);
  }

  // A hit by the player: the victim's side rallies (FUN_10007ff8), and planets of its govt launch.
  attackNotice(T) {
    if (T.slot === 0 || !this.player) return;
    rally(this, T, this.player);
    if (T.leader === 0) return;
    for (const p of this.data.spobs(this.system)) if (p.Govt >= 128 && p.Govt === T.govt && p.DefCount > 0) (this.defenseAlert ??= new Set()).add(p.id);
  }

  // ---------- views for the UI ----------
  // FUN_1000712c (target brackets) and FUN_10007078 (radar red, 0x10063224).
  hostileToPlayer(s) { return !!s && s.slot !== 0 && hostileToPlayer(this, s); }
  attackingPlayer(s) { return !!s && s.slot !== 0 && attackingPlayer(this, s); }
}
