// online-game.js — Fling Forts as a game for the shared Teng Games room (js/engine/server/room.js).
// The host's browser runs this in its Web Worker: it is the only place the rules run, so every shot,
// collision and troop fight is computed once and both screens draw the same result. Guests send
// orders ({t:'cmd', k, ...}, checked by engine/server/validate.js) and draw the snapshots.
// Pure module (no DOM): node tests drive it through the real room and snapshot codec.
import { createGame, rng, step, fire, setAmmo, build, autoBuild, send, upgradePower, ultimate, DT } from './sim.js';

const r2 = (v) => Math.round(v * 100) / 100;
const SKIP = new Set(['rand', 'fx', 'events', 'sent']);

/** Plain JSON copy of the rules state: numbers rounded so unchanged values stay identical for the delta codec. */
export function packState(s) {
  const out = {};
  for (const k in s) {
    if (SKIP.has(k)) continue;
    const v = s[k];
    if (typeof v === 'function') continue;
    out[k] = pack(v);
  }
  return out;
}
function pack(v) {
  if (typeof v === 'number') return r2(v);
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) { if (k === '-' || SKIP.has(k)) continue; const x = v[k]; if (typeof x !== 'function') o[k] = pack(x); } return o; }
  return v;
}

export class FlingGame {
  constructor(room, settings = {}) {
    this.room = room;
    this.mode = 'fling';
    this.mapInfo = { v: 1 };
    this.events = [];
    this.over = false;            // matches end in place with a rematch, so the room never kicks back to its lobby
    this.seed = settings.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.toPick();
  }

  toPick() { this.stage = 'pick'; this.pick = { race: [null, null], ready: [false, false] }; this.s = null; }

  sideOf(id) { const p = this.room.players.get(id); return p ? p.slot : -1; }

  /** Both seats filled and connected (bots don't exist in Fling Forts online). */
  bothHere() {
    const seats = [false, false];
    for (const p of this.room.players.values()) if (p.slot < 2 && this.room.isConnected(p.id)) seats[p.slot] = true;
    return seats[0] && seats[1];
  }

  begin(races) {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    this.s = createGame({ mode: 'online', seed: this.seed, races });
    this.stage = 'play';
    this.events.push({ k: 'start', races });
  }

  command(id, m) {
    const p = this.sideOf(id);
    if (p !== 0 && p !== 1) return;
    if (m.k === 'rematch') {
      if (this.stage !== 'play' || this.s?.phase !== 'over') return;
      if (m.races || !this.s) this.toPick(); else this.begin(this.s.races);
      return;
    }
    if (this.stage === 'pick') {
      if (m.k === 'pick' && !this.pick.ready[p]) this.pick.race[p] = m.race;
      else if (m.k === 'ready' && this.pick.race[p]) this.pick.ready[p] = !!m.on;
      if (this.pick.ready[0] && this.pick.ready[1]) this.begin(this.pick.race.slice());
      return;
    }
    const s = this.s;
    if (!s || this.paused()) return;
    switch (m.k) {
      case 'ammo': setAmmo(s, p, m.a); break;
      case 'fire': fire(s, p, m.dx, m.dy, m.power); break;
      case 'build': build(s, p, m.b, m.x); break;
      case 'autobuild': autoBuild(s, p, m.b); break;
      case 'send': send(s, p, m.u, m.x); break;
      case 'power': upgradePower(s, p); break;
      case 'ult': ultimate(s, p); break;
    }
  }

  paused() { return !this.bothHere(); }

  tick(dt) {
    if (this.stage !== 'play' || this.paused()) return;
    // the room ticks at 60 Hz = the rules' fixed step
    for (let n = Math.max(1, Math.round(dt / DT)); n > 0; n--) step(this.s, DT);
    // one-shot things go out as events (delivered exactly once, in order); the state carries the rest
    for (const f of this.s.fx) if (!f.sent) { f.sent = true; const c = { ...f }; delete c.sent; this.events.push({ k: 'fx', f: pack(c) }); }
    const evs = this.s.events;
    if (evs.length) { for (const e of evs) this.events.push({ k: 'e', e: pack(e) }); this.s.events = []; }
  }

  snapshot(id) {
    return {
      side: this.sideOf(id),
      stage: this.stage,
      wait: this.paused() ? 1 : 0,
      pick: this.pick ? { race: this.pick.race.slice(), ready: this.pick.ready.slice() } : null,
      st: this.s ? packState(this.s) : null,
    };
  }

  onLeave() { /* the match pauses (paused()) until the seat's token reconnects */ }

  checkpoint() {
    return { v: 1, seed: this.seed, stage: this.stage, pick: this.pick, events: this.events,
      state: this.s ? { ...this.s, rand: undefined } : null,
      rngState: this.s?.rand.getState() ?? null };
  }

  static restore(room, data) {
    if (data?.v !== 1 || !['pick', 'play'].includes(data.stage)) throw Error('Invalid Fling Forts checkpoint');
    const game = new FlingGame(room, { seed: data.seed });
    game.stage = data.stage;
    game.pick = data.pick;
    game.s = data.state;
    if (game.s) {
      if (!Number.isInteger(data.rngState)) throw Error('Missing RNG checkpoint');
      game.s.rand = rng(game.s.seed);
      game.s.rand.setState(data.rngState);
    }
    game.events = Array.isArray(data.events) ? data.events : [];
    return game;
  }
}

export const gameDef = { id: 'fling-forts', title: 'Fling Forts', options: {}, defaults: {}, Game: FlingGame };
