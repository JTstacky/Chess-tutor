// Runs inside the hosting player's Web Worker: the same room + game code the
// Node server uses, with connections relayed from the page (the host's own
// client is connection "local"; everyone else is a WebRTC data channel or a
// relayed WebSocket). Snapshots to other players are compressed here (see
// shared/snapcodec.js), off the page's main thread.

import { createHub } from '../server/hub.js';
import { Room } from '../server/room.js';
import { SnapEncoder } from '../shared/snapcodec.js';

export function runHostWorker(gameDef) {
  let code = null;
  const hub = createHub(gameDef, { makeCode: () => code });
  const conns = new Map();
  let checkpointTimer = null;
  const postCheckpoint = () => {
    const room = hub.rooms.get(code);
    if (room) self.postMessage({ type: 'checkpoint', data: room.checkpoint() });
  };
  const checkpointSoon = () => {
    if (checkpointTimer) return;
    checkpointTimer = setTimeout(() => { checkpointTimer = null; postCheckpoint(); }, 100);
  };

  self.onmessage = (e) => {
    const m = e.data;
    switch (m.type) {
      case 'init':
        code = m.code;
        if (m.checkpoint) {
          try {
            if (m.checkpoint.code !== code) throw Error('Room code mismatch');
            const restored = Room.restore(m.checkpoint, (room) => hub.rooms.delete(room.code), gameDef);
            hub.rooms.set(code, restored);
          } catch (err) { self.postMessage({ type: 'restoreFailed', text: String(err?.message || err) }); }
        }
        break;
      case 'open': {
        const conn = {
          readyState: 1,
          // The host's own page: no network, so it gets a snapshot every tick.
          fast: !!m.local,
          send: (data) => self.postMessage({ type: 'send', conn: m.conn, data }),
          close: () => {
            conn.readyState = 3;
            self.postMessage({ type: 'close', conn: m.conn });
          },
        };
        if (!m.local) {
          // Snapshots are sent as deltas. Until the page reports a lossy
          // channel, the connection is reliable and every snapshot sent
          // counts as received. `busy`: the page's send buffer is backed up,
          // so snapshots are skipped (their events wait for the next one).
          const enc = new SnapEncoder();
          conn.enc = enc;
          conn.busy = false;
          conn.snap = (s) => {
            if (conn.busy) return enc.hold(s.ev);
            const { data, full } = enc.encode(s);
            // Whole snapshots go reliably: the next ones build on them.
            self.postMessage({ type: 'send', conn: m.conn, data, lossy: !enc.ackOnSend && !full });
          };
          conn.ack = (s) => enc.ack(s);
        }
        // Only the host's own browser may create the room.
        conns.set(m.conn, { conn, h: hub.connect(conn, { canCreate: !!m.local }) });
        break;
      }
      case 'message':
        conns.get(m.conn)?.h.message(m.data);
        checkpointSoon();
        break;
      case 'lossy': {
        // The page opened (or lost) a lossy channel to this player: from now
        // on only acknowledged snapshots are used as baselines.
        const c = conns.get(m.conn)?.conn;
        if (c?.enc) c.enc.ackOnSend = !m.on;
        break;
      }
      case 'busy': {
        const c = conns.get(m.conn)?.conn;
        if (c) c.busy = m.on;
        break;
      }
      case 'closed': {
        const c = conns.get(m.conn);
        if (c) {
          c.conn.readyState = 3;
          c.h.close();
          conns.delete(m.conn);
        }
        break;
      }
    }
  };

  setInterval(() => hub.sweep(), 10000);
  setInterval(postCheckpoint, 1000);
}
