// Multiplayer sessions. The host's browser owns the world (monsters, loot, doors,
// bosses); every player owns their own knight's movement. Messages are small JSON
// objects over a transport:
//   PeerTransport      — WebRTC data channels via the public PeerJS broker (works on static hosting)
//   BroadcastTransport — two windows of the same browser (LAN parties on one PC, and the tests)
// A room code is 4 letters; the host's peer id is derived from it.

const PEER_PREFIX = 'beliards-zeliard-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

class Emitter {
  constructor() { this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }
}

// ---------------------------------------------------------------- transports
class BroadcastTransport extends Emitter {
  constructor(room, isHost) {
    super();
    this.room = room;
    this.isHost = isHost;
    this.id = isHost ? 'host' : `g${Math.random().toString(36).slice(2, 8)}`;
    this.ch = new BroadcastChannel(`beliards-room-${room}`);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (m.to && m.to !== this.id) return;
      if (m.from === this.id) return;
      if (m.kind === 'open' && this.isHost) { this.emit('peer', m.from); this.send(m.from, { t: '_ack' }); return; }
      if (m.kind === 'close') { this.emit('leave', m.from); return; }
      if (m.kind === 'msg') {
        if (m.data.t === '_ack') { this.emit('ready'); return; }
        this.emit('message', m.from, m.data);
      }
    };
  }
  async start() {
    if (!this.isHost) {
      this.ch.postMessage({ kind: 'open', from: this.id, to: 'host' });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('No host answered in this browser.')), 4000);
        this.on('ready', () => { clearTimeout(t); resolve(); });
      });
    }
    window.addEventListener('beforeunload', () => this.ch.postMessage({ kind: 'close', from: this.id }));
    return this.id;
  }
  send(to, data) { this.ch.postMessage({ kind: 'msg', from: this.id, to, data }); }
  close() { this.ch.postMessage({ kind: 'close', from: this.id }); this.ch.close(); }
}

let peerLib = null;
function loadPeerJS() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.Peer) { resolve(window.Peer); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = () => resolve(window.Peer);
    s.onerror = () => { peerLib = null; reject(new Error('Could not load the networking library (offline?).')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

class PeerTransport extends Emitter {
  constructor(room, isHost) {
    super();
    this.room = room;
    this.isHost = isHost;
    this.conns = new Map();
  }
  async start() {
    const Peer = await loadPeerJS();
    const wantId = this.isHost ? PEER_PREFIX + this.room.toLowerCase() : undefined;
    this.peer = new Peer(wantId, { debug: 0 });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out reaching the matchmaking server.')), 12000);
      this.peer.on('open', () => { clearTimeout(t); resolve(); });
      this.peer.on('error', (e) => {
        clearTimeout(t);
        if (e.type === 'unavailable-id') reject(new Error('That room code is taken — try again.'));
        else if (e.type === 'peer-unavailable') reject(new Error('No room with that code.'));
        else reject(new Error(e.message || String(e.type)));
      });
    });
    this.id = this.peer.id;
    if (this.isHost) {
      this.peer.on('connection', (c) => this.adopt(c));
    } else {
      const c = this.peer.connect(PEER_PREFIX + this.room.toLowerCase(), { reliable: true, serialization: 'json' });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('No room with that code (or the host is offline).')), 12000);
        c.on('open', () => { clearTimeout(t); resolve(); });
        c.on('error', (e) => { clearTimeout(t); reject(e); });
        this.peer.on('error', (e) => { clearTimeout(t); reject(new Error(e.type === 'peer-unavailable' ? 'No room with that code.' : e.message)); });
      });
      this.adopt(c, 'host');
    }
    return this.id;
  }
  adopt(c, asId) {
    const id = asId || c.peer;
    this.conns.set(id, c);
    const hello = () => { if (this.isHost) this.emit('peer', id); };
    if (c.open) hello(); else c.on('open', hello);
    c.on('data', (d) => this.emit('message', id, d));
    c.on('close', () => { this.conns.delete(id); this.emit('leave', id); });
    c.on('error', () => { this.conns.delete(id); this.emit('leave', id); });
  }
  send(to, data) {
    const c = this.conns.get(to);
    if (c && c.open) c.send(data);
  }
  close() { try { this.peer?.destroy(); } catch { /* already closed */ } }
}

// ---------------------------------------------------------------- session
export class Session extends Emitter {
  constructor({ room, isHost, transport = 'peer' }) {
    super();
    this.room = room;
    this.isHost = isHost;
    this.kind = transport;
    this.t = transport === 'local' ? new BroadcastTransport(room, isHost) : new PeerTransport(room, isHost);
    this.peers = new Set();
    this.myId = null;
    this.stats = { sent: 0, recv: 0 };
    this.t.on('peer', (id) => { this.peers.add(id); this.emit('join', id); });
    this.t.on('leave', (id) => { this.peers.delete(id); this.emit('leave', id); });
    this.t.on('message', (from, data) => { this.stats.recv++; this.emit('message', from, data); });
  }
  async start() {
    this.myId = await this.t.start();
    if (!this.isHost) this.peers.add('host');
    return this.myId;
  }
  send(to, data) { this.stats.sent++; this.t.send(to, data); }
  broadcast(data, except) { for (const p of this.peers) if (p !== except) this.send(p, data); }
  toHost(data) { this.send('host', data); }
  close() { this.t.close(); }
}
