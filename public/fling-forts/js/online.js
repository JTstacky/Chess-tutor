// online.js — the browser side of online play, on the shared Teng Games engine (js/engine/client/net.js):
// the host's page runs the room in a Web Worker (js/host-worker.js); guests connect straight over WebRTC
// (PeerJS) or through the site relay (/relay.json) when a direct link can't be made. Nobody but the
// host runs the rules: this module only sends orders and turns snapshots into a state the view can draw,
// interpolated one snapshot behind so movement stays smooth at 30 snapshots a second.
import { Net } from './engine/client/net.js';
import { placeOk, costFor, shotCost, gateX, autoBuild, freeSlots, BUILD } from './sim.js';

export const PREFIX = 'tenggames-fling-forts';
const LERP = ['units', 'projectiles', 'bonuses'];

export function createOnline(hooks) {
  let net = null;
  const o = {
    active: false, side: 0, code: null, isHost: false, stage: null, wait: false, peers: 0,
    cur: null, prev: null, tCur: 0, tPrev: 0, fx: [], events: [],
    pick: null, tk: 0,
    keep: 0, hist: [],      // tests: keep the last N snapshots' {tk, st} to compare screens
  };

  function connect(hello, resume = null) {
    leave(true);
    o.active = true; o.cur = o.prev = null; o.fx = []; o.events = []; o.stage = null; o.code = hello.code || null;
    net = new Net(onMessage, (s) => { o.reconnecting = s === 'reconnecting' || s === 'closed'; hooks.status?.(s); }, {
      p2p: { prefix: PREFIX, resume, onCheckpoint: hooks.checkpoint,
        createWorker: () => new Worker(new URL('./host-worker.js', import.meta.url), { type: 'module' }) },
    });
    net.connect(hello);
    o.isHost = hello.t === 'create';
  }
  o.host = (resume = null) => connect({ t: 'create', name: 'Red' }, resume);
  o.join = (code) => connect({ t: 'join', code: String(code).trim().toUpperCase(), name: 'Blue' });
  function leave(quiet) {
    net?.close(); net = null;
    if (o.active && !quiet) hooks.left?.();
    o.active = false; o.stage = null;
  }
  o.leave = () => leave(false);
  o.cmd = (k, m = {}) => net?.send({ t: 'cmd', k, ...m });

  function onMessage(m) {
    switch (m.t) {
      case 'welcome': o.code = m.code; hooks.lobby?.(o); break;
      case 'lobby':
        o.peers = m.players.filter((p) => p.connected).length;
        hooks.lobby?.(o);
        // the creator starts the match as soon as the second seat is filled
        if (net?.isHost && !m.inGame && m.players.length === 2) net.send({ t: 'start' });
        break;
      case 'snap': onSnap(m); break;
      case 'error': hooks.error?.(m.text, !!m.fatal); if (m.fatal) leave(true); break;
      case 'hostLeft': leave(true); hooks.error?.('The other player closed the game.', true); break;
      case 'connectionLost': leave(true); hooks.error?.('Connection lost.', true); break;
      case 'kicked': leave(true); hooks.error?.('Removed from the game.', true); break;
    }
  }

  function onSnap(m) {
    const now = performance.now() / 1000;
    for (const e of m.ev || []) {
      if (e.k === 'fx') o.fx.push({ ...e.f });
      else if (e.k === 'e') o.events.push(e.e);
    }
    o.side = m.side; o.wait = !!m.wait; o.tk = m.tk;
    if (o.keep && m.st) { o.hist.push({ tk: m.tk, st: m.st }); if (o.hist.length > o.keep) o.hist.shift(); }
    o.pick = m.pick;
    const stage = m.stage;
    const rematch = stage === 'play' && o.stage === 'play' && o.cur?.phase === 'over' && m.st?.phase === 'play';
    if (m.st) {
      if (o.cur && o.cur.round === m.st.round && stage === o.stage) { o.prev = o.cur; o.tPrev = o.tCur; }
      else { o.prev = null; }
      o.cur = m.st; o.tCur = now;
    } else { o.cur = o.prev = null; }
    if (stage !== o.stage || rematch) { o.stage = stage; if (stage === 'play') o.fx.length = 0; hooks.stage?.(stage, o); }
  }

  /** The state to draw this frame: the newest snapshot, positions blended from the one before. */
  o.view = (dt) => {
    for (const f of o.fx) f.t += dt;
    o.fx = o.fx.filter((f) => f.t < f.ttl);
    const cur = o.cur;
    if (!cur) return null;
    const s = { ...cur, fx: o.fx, events: o.events, mode: 'online' };
    o.events = [];
    const prev = o.prev;
    if (prev && o.tCur > o.tPrev) {
      const a = Math.min(1, (performance.now() / 1000 - o.tCur) / (o.tCur - o.tPrev));
      for (const key of LERP) {
        const before = new Map(prev[key].map((e) => [e.id, e]));
        s[key] = cur[key].map((e) => {
          const b = before.get(e.id);
          if (!b) return e;
          const c = { ...e, x: b.x + (e.x - b.x) * a, y: b.y + (e.y - b.y) * a };
          if (e.z != null && b.z != null) c.z = b.z + (e.z - b.z) * a;
          return c;
        });
      }
    }
    return s;
  };

  /** Orders for input.js: same signatures as the sim's, sent to the host instead of run here. */
  o.act = {
    setAmmo(s, p, kind) { s.players[p].ammo = kind; o.cmd('ammo', { a: kind }); return true; },
    fire(s, p, dx, dy, power) { const h = Math.hypot(dx, dy) || 1; o.cmd('fire', { dx: dx / h, dy: dy / h, power: Math.max(0, Math.min(1, power)) }); return s.players[p].gold >= shotCost(s, p); },
    build(s, p, kind, x) { if (!placeOk(s, p, kind, x) || s.players[p].gold < costFor(s, p, kind)) return false; o.cmd('build', { b: kind, x }); return true; },
    send(s, p, kind, x = gateX(p)) { if (s.players[p].gold < costFor(s, p, kind)) return false; o.cmd('send', { u: kind, x }); return true; },
    autoBuild(s, p, kind) { if (!BUILD[kind] || !freeSlots(s, p)) return false; o.cmd('autobuild', { b: kind }); return true; },
    upgradePower() { o.cmd('power'); return true; },
    ultimate() { o.cmd('ult'); return true; },
  };
  return o;
}
