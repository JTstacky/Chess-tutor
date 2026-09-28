// Teng Games multiplayer relay.
//
// The games are peer-to-peer: the host's browser runs the match and the
// other players connect straight to it over WebRTC. On some networks (mobile
// data, "carrier-grade" NAT, school or office wifi) a direct connection
// can't be made, so both sides fall back to this relay: a WebSocket per
// player, all in one Durable Object per game code, which forwards messages
// between the host and its guests. It never looks inside them.
//
//   wss://<relay>/<game>/<CODE>?role=host    the hosting player (one per code)
//   wss://<relay>/<game>/<CODE>?role=guest   everyone else
//
// Guest → relay: any text message; the host receives it as "<id>|<message>".
// Host → relay:  a JSON array [[id, message], …] delivers to guests (one
//                frame per tick however many guests), "x|<id>" disconnects
//                a guest. The host is told "+<id>" / "-<id>" as guests come
//                and go. "~" is a heartbeat, answered without waking the room.
// Close codes:   4404 no game with that code · 4409 code already hosted ·
//                4410 the host left · 4403 origin not allowed.

import { DurableObject } from 'cloudflare:workers';

const PATH = /^\/([a-z0-9-]{1,48})\/([A-Za-z]{4})\/?$/;

function allowed(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*') || !origin) return true;
  return list.some((o) => origin === o || (o.startsWith('http://') && (origin === o || origin.startsWith(`${o}:`))));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'tenggames-relay' }), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    const m = PATH.exec(url.pathname);
    if (!m) return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(`${m[1]}:${m[2].toUpperCase()}`));
    if (!allowed(req.headers.get('Origin'), env)) return reject(4403, 'origin not allowed');
    return room.fetch(req);
  },
};

// Accepts the socket just to close it with a reason the browser can read.
function reject(code, reason) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Heartbeats are answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('~', '~'));
  }

  host() {
    return this.ctx.getWebSockets('host')[0] || null;
  }

  guest(id) {
    for (const ws of this.ctx.getWebSockets('guest')) if (ws.deserializeAttachment()?.id === id) return ws;
    return null;
  }

  async fetch(req) {
    const role = new URL(req.url).searchParams.get('role');
    if (role === 'host') {
      if (this.host()) return reject(4409, 'code already hosted');
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['host']);
      return new Response(null, { status: 101, webSocket: client });
    }
    const host = this.host();
    if (!host) return reject(4404, 'no game with that code');
    const id = ((await this.ctx.storage.get('n')) || 0) + 1;
    await this.ctx.storage.put('n', id);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ['guest']);
    server.serializeAttachment({ id });
    host.send(`+${id}`);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string') return;
    if (this.ctx.getTags(ws).includes('host')) {
      if (msg[0] === '[') {
        let list;
        try {
          list = JSON.parse(msg);
        } catch {
          return;
        }
        for (const [id, data] of list) {
          try {
            this.guest(id)?.send(data);
          } catch {}
        }
      } else if (msg.startsWith('x|')) {
        try {
          this.guest(+msg.slice(2))?.close(4000, 'removed by host');
        } catch {}
      }
      return;
    }
    const id = ws.deserializeAttachment()?.id;
    try {
      this.host()?.send(`${id}|${msg}`);
    } catch {}
  }

  webSocketClose(ws, code, reason) {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
  }

  webSocketError(ws) {
    this.gone(ws);
  }

  gone(ws) {
    if (this.ctx.getTags(ws).includes('host')) {
      // The host's browser runs the game: without it the game is over.
      for (const g of this.ctx.getWebSockets('guest')) {
        try {
          g.close(4410, 'the host left');
        } catch {}
      }
      this.ctx.storage.deleteAll();
    } else {
      const id = ws.deserializeAttachment()?.id;
      try {
        this.host()?.send(`-${id}`);
      } catch {}
    }
  }
}
