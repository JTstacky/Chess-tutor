import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';

const LIFE = 24 * 3600e3;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// This namespace is separate from the legacy four-letter-code relay.
export async function inviteRequest(req, env) {
  const url = new URL(req.url), match = /^\/invite\/(chess|heroes2)\/([a-f0-9]{32})$/.exec(url.pathname);
  if (!match) return json({ error: 'Unknown invite.' }, 404);
  const origins = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const origin = req.headers.get('Origin');
  if (!origin || !origins.some(o => origin === o || (/^http:\/\/(localhost|127\.0\.0\.1)$/.test(o) && origin.startsWith(o + ':')))) return json({ error: 'Site origin required.' }, 403);
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
  const protocols = (req.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
  const token = protocols.find(s => /^tg-auth\.[a-zA-Z0-9._-]{20,300}$/.test(s))?.slice(8);
  if (!protocols.includes('tg-invite') || !token) return json({ error: 'Sign in and pick a profile first.' }, 401);
  let me;
  try {
    const response = await fetch((env.ACCOUNTS_API || 'https://ev-online-api.justintengyz.workers.dev') + '/api/me', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return json({ error: 'Sign in again.' }, 401);
    me = await response.json();
  } catch { return json({ error: 'Sign-in service unavailable.' }, 503); }
  if (me.stage !== 'profile' || !Number.isSafeInteger(me.id) || me.tier === 'guest') return json({ error: 'Choose a signed-in profile.' }, 403);
  if (match[1] === 'heroes2' && me.tier !== 'full') return json({ error: 'This game needs a full account.' }, 403);
  // Only trusted account identity travels into the object. Never forward the token.
  const headers = new Headers({ Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'tg-invite', 'X-Player': String(me.id), 'X-Game': match[1] });
  return env.INVITES.get(env.INVITES.idFromName(match[1] + ':' + match[2])).fetch(new Request(url, { headers }));
}

export class InviteRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room'); });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('~', '~'));
    this.rates = new Map();
  }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  send(ws, data) { try { ws.send(typeof data === 'string' || data instanceof ArrayBuffer ? data : JSON.stringify(data)); } catch {} }
  broadcast(data) { for (const ws of this.sockets()) this.send(ws, data); }
  async save() { await this.ctx.storage.put('room', this.room); }
  seat(ws) { return ws.deserializeAttachment()?.seat; }
  online(seat) { return this.sockets().some(ws => this.seat(ws) === seat); }
  state() {
    return { type: 'room', game: this.room.game, active: this.room.active, expires: this.room.expires,
      players: this.room.players.map((_, seat) => ({ seat, online: this.online(seat) })),
      ...(this.room.game === 'chess' ? { moves: this.room.moves, result: this.room.result, draw: this.room.draw } : {}) };
  }
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url), player = Number(req.headers.get('X-Player')), game = req.headers.get('X-Game');
    if (!Number.isSafeInteger(player) || !['chess', 'heroes2'].includes(game)) return json({ error: 'Forbidden.' }, 403);
    if (!this.room) {
      if (url.searchParams.get('host') !== '1') return json({ error: 'Invite expired or host has not started.' }, 404);
      this.room = { game, players: [player], active: 0, moves: [], result: null, draw: null, expires: Date.now() + LIFE, ended: false };
      await this.save();
      await this.ctx.storage.setAlarm(this.room.expires);
    }
    if (this.room.ended || Date.now() >= this.room.expires) return json({ error: 'Invite has ended.' }, 410);
    let seat = this.room.players.indexOf(player);
    if (seat < 0) {
      if (this.room.players.length >= (game === 'chess' ? 2 : 6)) return json({ error: 'This game is full.' }, 409);
      seat = this.room.players.length;
      this.room.players.push(player);
      await this.save();
    }
    // A profile reconnects to its own seat. It cannot acquire the host seat via ?host=1.
    for (const ws of this.sockets()) if (this.seat(ws) === seat) ws.close(4001, 'Opened on another tab.');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat });
    this.send(server, { type: 'welcome', seat });
    this.broadcast(this.state());
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'tg-invite' } });
  }
  async webSocketMessage(ws, raw) {
    await this.ready;
    if (!this.room || this.room.ended || Date.now() >= this.room.expires) { ws.close(4410, 'Invite ended.'); return; }
    const seat = this.seat(ws), now = Date.now();
    let rate = this.rates.get(seat);
    if (!rate || now - rate.at >= 1000) this.rates.set(seat, rate = { at: now, count: 0, frames: 0 });
    if (++rate.count > 100) return;
    if (typeof raw !== 'string') {
      if (seat !== 0 || this.room.game !== 'heroes2' || raw.byteLength > 200000 || ++rate.frames > 8) return;
      for (const peer of this.sockets()) if (this.seat(peer) === this.room.active && this.room.active !== 0) this.send(peer, raw);
      return;
    }
    if (raw.length > 4096) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'end' && seat === 0) {
      this.room.ended = true; await this.save();
      for (const peer of this.sockets()) peer.close(4410, 'Host ended the invite.');
      return;
    }
    if (this.room.game === 'heroes2') {
      if (msg.type === 'control' && seat === 0 && Number.isInteger(msg.seat) && msg.seat >= 0 && msg.seat < this.room.players.length && this.online(msg.seat)) {
        this.room.active = msg.seat; await this.save(); this.broadcast(this.state());
      } else if (msg.type === 'input' && seat === this.room.active && seat !== 0 && validInput(msg)) {
        for (const peer of this.sockets()) if (this.seat(peer) === 0) this.send(peer, { ...msg, seat });
      }
      return;
    }
    if (!this.online(0) || !this.online(1) || this.room.result) return;
    const chess = new Chess();
    for (const move of this.room.moves) chess.move(move);
    const color = seat === 0 ? 'w' : 'b';
    if (msg.type === 'move' && chess.turn() === color && msg.ply === this.room.moves.length) {
      if (!/^[a-h][1-8]$/.test(msg.from) || !/^[a-h][1-8]$/.test(msg.to) || (msg.promotion && !/^[qrbn]$/.test(msg.promotion))) return;
      try {
        const move = chess.move({ from: msg.from, to: msg.to, promotion: msg.promotion });
        this.room.moves.push(move.san); this.room.draw = null;
        if (chess.isCheckmate()) this.room.result = (color === 'w' ? 'White' : 'Black') + ' wins by checkmate.';
        else if (chess.isGameOver()) this.room.result = 'Draw: ' + (chess.isStalemate() ? 'stalemate.' : chess.isThreefoldRepetition() ? 'threefold repetition.' : chess.isInsufficientMaterial() ? 'insufficient material.' : 'fifty-move rule.');
      } catch { this.send(ws, this.state()); return; }
    } else if (msg.type === 'resign') this.room.result = (color === 'w' ? 'Black' : 'White') + ' wins by resignation.';
    else if (msg.type === 'draw') {
      if (this.room.draw !== null && this.room.draw !== seat) this.room.result = 'Draw by agreement.';
      else this.room.draw = seat;
    } else if (msg.type === 'decline') this.room.draw = null;
    else return;
    await this.save(); this.broadcast(this.state());
  }
  async webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {}
    await this.disconnected(ws);
  }
  async webSocketError(ws) { await this.disconnected(ws); }
  async disconnected(ws) {
    await this.ready;
    if (!this.room) return;
    if (this.room.game === 'heroes2' && (this.seat(ws) === 0 || this.seat(ws) === this.room.active) && !this.online(this.seat(ws))) { this.room.active = 0; await this.save(); }
    this.broadcast(this.state());
  }
  async alarm() {
    for (const ws of this.sockets()) ws.close(4410, 'Invite expired.');
    if (this.room) { this.room.ended = true; this.room.moves = []; this.room.players = []; await this.save(); }
  }
}

function validInput(m) {
  if (['down', 'up', 'move'].includes(m.event)) return Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 && [0, 2].includes(m.button);
  return ['keydown', 'keyup'].includes(m.event) && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Escape|Space|Backspace|F[2-9])$/.test(m.code) && Number.isInteger(m.keyCode) && m.keyCode >= 8 && m.keyCode <= 123 && typeof m.key === 'string' && m.key.length <= 12;
}
