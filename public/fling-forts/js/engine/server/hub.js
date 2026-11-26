// Connection hub: turns incoming connections into room members. Shared by
// the Node WebSocket server and the in-browser host used for peer-to-peer
// games, so both run exactly the same room and game code.
//
// A connection is anything with send(string), close() and readyState (1 =
// open), which a `ws` WebSocket already is.

import { Room } from './room.js';
import { validMessage } from './validate.js';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode() {
  const bytes = new Uint8Array(4);
  // Rejection sampling avoids modulo bias while keeping four-letter codes.
  let code = '';
  while (code.length < 4) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) if (b < Math.floor(256 / CODE_LETTERS.length) * CODE_LETTERS.length && code.length < 4) code += CODE_LETTERS[b % CODE_LETTERS.length];
  }
  return code;
}

// options.makeCode: () => code for new rooms (p2p hosts use their fixed code)
export function createHub(gameDef, { makeCode, maxRooms = Infinity, allowCreate = () => true, allowJoin = () => true } = {}) {
  const rooms = new Map();

  function newCode() {
    if (makeCode) return makeCode();
    let code;
    do code = randomCode();
    while (rooms.has(code));
    return code;
  }

  // Returns handlers for one connection. `canCreate` is false for remote
  // peers in a p2p game — only the hosting browser may create the room.
  function connect(conn, { canCreate = true, ip } = {}) {
    let room = null;
    let player = null;
    const fail = (text) => conn.send(JSON.stringify({ t: 'error', text }));

    return {
      message(raw) {
        // A rejoin replaces the socket for this seat. Ignore any messages
        // still queued on the old connection after the handoff.
        if (player && player.ws !== conn) return;
        // "a<seq>": the player has snapshot <seq> (shared/snapcodec.js).
        if (typeof raw === 'string' && /^a\d{1,10}$/.test(raw)) return conn.ack?.(+raw.slice(1));
        let m;
        try {
          m = JSON.parse(raw);
        } catch {
          return;
        }
        if (!validMessage(m, gameDef.options)) return fail('Invalid message.');
        if (!player) {
          if (m.t !== 'create' && m.t !== 'join') return fail('Join a room first.');
          const name = m.name.trim();
          const token = m.token;
          if (m.t === 'create' && canCreate) {
            if (rooms.size >= maxRooms || !allowCreate(ip)) return fail('Room limit reached.');
            const code = newCode();
            room = rooms.get(code) || new Room(code, (r) => rooms.delete(r.code), gameDef);
            rooms.set(code, room);
          } else if (m.t === 'join') {
            if (!allowJoin(ip)) return fail('Too many join attempts.');
            room = rooms.get(m.code.toUpperCase());
            if (!room) return fail('No game with that code.');
          } else return;
          const res = room.join(conn, name, token);
          if (res.error) {
            room = null;
            return fail(res.error);
          }
          player = res;
          return;
        }
        room.handle(player, m);
      },
      close() {
        if (room && player && player.ws === conn) room.leave(player);
      },
    };
  }

  // Lobbies everyone has left are closed after a grace period.
  function sweep() {
    for (const room of rooms.values()) {
      if (!room.game && room.emptySince && Date.now() - room.emptySince > 30_000) room.close();
      if (!room.game && room.players.size === 0) rooms.delete(room.code);
    }
  }

  return { connect, rooms, sweep };
}
