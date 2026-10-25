import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const ROOM = /^[a-f0-9]{32}$/;
const MAX_SAVE = 4 * 1024 * 1024, PART = 64000;

export async function serviceRequest(req, env) {
  if (!env.HEROES_SERVICE_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.HEROES_SERVICE_TOKEN) return json({ error: 'Service authentication required.' }, 403);
  const url = new URL(req.url);
  if (url.pathname === '/service/heroes2/jobs') return env.HEROES_JOBS.get(env.HEROES_JOBS.idFromName('jobs')).fetch(req);
  const id = url.pathname.match(/^\/service\/heroes2\/([a-f0-9]{32})$/)?.[1];
  if (!id) return json({ error: 'Not found.' }, 404);
  const headers = new Headers(req.headers); headers.set('X-Service', '1');
  return env.INVITES.get(env.INVITES.idFromName('heroes2:' + id)).fetch(new Request(req, { headers }));
}
export async function inviteRequest(req, env) {
  const url = new URL(req.url), match = /^\/invite\/(chess|heroes2)\/([a-f0-9]{32})$/.exec(url.pathname);
  const listing = url.pathname === '/games';
  if (!match && !listing) return json({ error: 'Unknown invite.' }, 404);
  const origin = req.headers.get('Origin'), origins = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  if (!origin || !origins.some(o => origin === o || (/^http:\/\/(localhost|127\.0\.0\.1)$/.test(o) && origin.startsWith(o + ':')))) return json({ error: 'Site origin required.' }, 403);
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
  if (listing && req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!listing && req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required.' }, 426);
  const protocols = (req.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
  const token = listing ? req.headers.get('Authorization')?.replace(/^Bearer /, '') : protocols.find(s => /^tg-auth\.[a-zA-Z0-9._-]{20,300}$/.test(s))?.slice(8);
  if ((!listing && !protocols.includes('tg-invite')) || !token) return json({ error: 'Pick a profile first.' }, 401);
  let me;
  try {
    const r = await fetch((env.ACCOUNTS_API || 'https://ev-online-api.justintengyz.workers.dev') + '/api/me', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return json({ error: 'Sign in again.' }, 401); me = await r.json();
  } catch { return json({ error: 'Sign-in service unavailable.' }, 503); }
  if (me.stage !== 'profile' || !Number.isSafeInteger(me.id) || me.tier === 'guest') return json({ error: 'Choose a signed-in profile.' }, 403);
  if (listing) {
    const response = await env.HEROES_JOBS.get(env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/index', { method: 'POST', body: JSON.stringify({ op: 'list', profile: me.id }) }));
    const data = await response.json(); data.games = data.games.filter(g => g.game !== 'heroes2' || me.tier === 'full');
    const result = json(data); for (const [k, v] of Object.entries(cors)) result.headers.set(k, v); return result;
  }
  if (match[1] === 'heroes2' && me.tier !== 'full') return json({ error: 'This game needs a full account.' }, 403);
  const headers = new Headers({ Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'tg-invite', 'X-Player': String(me.id), 'X-Game': match[1] });
  return env.INVITES.get(env.INVITES.idFromName(match[1] + ':' + match[2])).fetch(new Request(url, { headers }));
}

export class HeroesJobs extends DurableObject {
  async fetch(req) {
    if (req.method === 'GET') return json({ jobs: [...(await this.ctx.storage.list({ prefix: 'job:' })).values()].filter(j => j.online > 0) });
    const job = await req.json();
    if (job.op === 'list' && Number.isSafeInteger(job.profile)) return json({ games: [...(await this.ctx.storage.list({ prefix: 'player:' + job.profile + ':' })).values()].sort((a, b) => b.updated - a.updated) });
    if (job.op === 'index') {
      if (!ROOM.test(job.id) || !['chess', 'heroes2'].includes(job.game) || !Array.isArray(job.players)) return json({}, 400);
      const key = 'game:' + job.game + ':' + job.id;
      if (!await this.ctx.storage.get(key)) {
        const all = [...(await this.ctx.storage.list({ prefix: 'game:' })).values()];
        if (all.filter(g => g.owner === job.players[0] && !g.result).length >= 20) return json({}, 409);
      }
      await this.ctx.storage.put(key, { owner: job.players[0], result: job.result || null });
      for (const [seat, profile] of job.players.entries()) await this.ctx.storage.put('player:' + profile + ':' + job.game + ':' + job.id, { id: job.id, game: job.game, seat, active: job.active, phase: job.phase, result: job.result || null, updated: Date.now() });
      return json({ ok: true });
    }
    if (!ROOM.test(job.id) || !Number.isInteger(job.owner)) return json({}, 400);
    const previous = await this.ctx.storage.get('job:' + job.id);
    if (!previous) {
      const all = [...(await this.ctx.storage.list({ prefix: 'job:' })).values()];
      if (all.filter(j => j.owner === job.owner && !j.ended).length >= 20) return json({ error: 'Finish an existing game before creating more.' }, 409);
    }
    await this.ctx.storage.put('job:' + job.id, job); return json({ ok: true });
  }
}

export class InviteRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env; this.rates = new Map(); this.serial = Promise.resolve();
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room'); await ctx.storage.deleteAlarm(); });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('~', '~'));
  }
  locked(fn) { const next = this.serial.catch(() => {}).then(async () => { await this.ready; return fn(); }); this.serial = next; return next; }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)); } catch {} }
  service() { return this.sockets().find(ws => ws.deserializeAttachment()?.service); }
  seat(ws) { return ws.deserializeAttachment()?.seat; }
  online(seat) { return this.sockets().some(ws => this.seat(ws) === seat); }
  save() { return this.ctx.storage.put('room', this.room); }
  state() {
    const r = this.room;
    return { type: 'room', game: r.game, active: r.active, generation: r.generation, phase: r.phase, capacity: r.capacity, serverOnline: r.game === 'chess' || !!this.service(), savedAt: r.checkpoint?.at || null, persistent: true, ...(r.game === 'heroes2' && r.result ? { result: r.result } : {}),
      players: r.players.map((_, seat) => ({ seat, online: this.online(seat) })), ...(r.game === 'chess' ? { moves: r.moves, result: r.result, draw: r.draw } : {}) };
  }
  broadcast() { const s = this.state(); for (const ws of this.sockets()) this.send(ws, s); }
  async job() {
    const indexed = await this.env.HEROES_JOBS.get(this.env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/index', { method: 'POST', body: JSON.stringify({ ...this.room, op: 'index' }) }));
    if (!indexed.ok) throw Error('Game quota reached.');
    if (this.room.game !== 'heroes2') return;
    const r = await this.env.HEROES_JOBS.get(this.env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/jobs', { method: 'POST', body: JSON.stringify({ id: this.room.id, owner: this.room.players[0], ended: this.room.ended, online: this.room.ended ? 0 : this.sockets().filter(ws => this.seat(ws) != null).length }) }));
    if (!r.ok) throw Error('Game quota reached.');
  }
  fetch(req) { return this.locked(() => this.handleFetch(req)); }
  async handleFetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('X-Service') === '1') {
      if (!this.room || this.room.game !== 'heroes2' || this.room.ended) return json({}, 404);
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        const parts = [];
        for (let i = 0; i < (this.room.checkpoint?.parts || 0); i++) parts.push(await this.ctx.storage.get('save:' + i));
        const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let at = 0;
        for (const p of parts) { bytes.set(new Uint8Array(p), at); at += p.byteLength; }
        let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return json({ capacity: this.room.capacity, checkpoint: this.room.checkpoint, data: btoa(data), state: this.state() });
      }
      for (const ws of this.sockets()) if (ws.deserializeAttachment()?.service) ws.close(4001, 'Service replaced.');
      const [client, server] = Object.values(new WebSocketPair()); this.ctx.acceptWebSocket(server); server.serializeAttachment({ service: true });
      // A service reconnect starts with all frames hidden, never an old turn.
      this.room.active = -1; this.room.phase = 'recovering'; this.room.generation++;
      await this.save(); this.send(server, { type: 'service-welcome', generation: this.room.generation, capacity: this.room.capacity }); this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }
    const player = Number(req.headers.get('X-Player')), game = req.headers.get('X-Game');
    if (!Number.isSafeInteger(player) || !['chess', 'heroes2'].includes(game)) return json({}, 403);
    if (!this.room) {
      if (url.searchParams.get('host') !== '1') return json({ error: 'Unknown game.' }, 404);
      const capacity = game === 'chess' ? 2 : Number(url.searchParams.get('players') || 2);
      if (!Number.isInteger(capacity) || capacity < 2 || capacity > 6) return json({}, 400);
      this.room = { id: url.pathname.split('/').at(-1), game, mode: 'server', players: [player], capacity, active: game === 'chess' ? 0 : -1, phase: 'setup', generation: 0, moves: [], result: null, draw: null, ended: false };
      try { await this.job(); await this.save(); }
      catch { this.room = undefined; return json({ error: 'Finish an existing game before creating more.' }, 409); }
    }
    if (this.room.ended) return json({ error: 'Game ended.' }, 410);
    if (this.room.mode !== 'server') return json({ error: 'Create a new persistent game.' }, 410);
    let seat = this.room.players.indexOf(player);
    if (seat < 0) { if (this.room.players.length >= this.room.capacity) return json({ error: 'Game full.' }, 409); seat = this.room.players.length; this.room.players.push(player); await this.save(); }
    for (const ws of this.sockets()) if (this.seat(ws) === seat) ws.close(4001, 'Opened elsewhere.');
    const [client, server] = Object.values(new WebSocketPair()); this.ctx.acceptWebSocket(server); server.serializeAttachment({ seat });
    this.send(server, { type: 'welcome', seat }); this.broadcast(); await this.job();
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'tg-invite' } });
  }
  webSocketMessage(ws, raw) { return this.locked(() => this.message(ws, raw)); }
  async message(ws, raw) {
    if (!this.room || this.room.ended) return;
    const trusted = ws === this.service(), seat = this.seat(ws), now = Date.now(), key = trusted ? 'service' : seat;
    let rate = this.rates.get(key); if (!rate || now - rate.at >= 1000) this.rates.set(key, rate = { at: now, n: 0, frames: 0 });
    if (++rate.n > 100) return;
    if (typeof raw !== 'string') {
      // Service stamps frames with the acknowledged native turn generation.
      if (!trusted || raw.byteLength < 9 || raw.byteLength > 200008 || ++rate.frames > 8 || this.room.active < 0) return;
      if (new DataView(raw).getUint32(0) !== this.room.generation) return;
      for (const peer of this.sockets()) if (this.seat(peer) === this.room.active) this.send(peer, raw.slice(8));
      return;
    }
    if (raw.length > (trusted ? MAX_SAVE * 1.4 : 4096)) return;
    let m; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m !== 'object') return;
    if (trusted) {
      if (m.type === 'complete') {
        this.room.ended = true; this.room.result = 'Game finished.'; this.room.phase = 'finished'; this.room.active = -1; this.room.generation++;
        await this.save(); this.broadcast(); await this.job(); this.send(ws, { type: 'ack', id: m.id });
      } else if (m.type === 'checkpoint') {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data || '') || ![0, 1, 2].includes(m.phase)) return;
        const decoded = atob(m.data); if (!decoded.length || decoded.length > MAX_SAVE) return;
        const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0)), parts = Math.ceil(bytes.length / PART);
        const checkpoint = { phase: m.phase, at: Date.now(), parts, size: bytes.length, color: m.color, humans: m.humans, revision: (this.room.checkpoint?.revision || 0) + 1 };
        await this.ctx.storage.transaction(async tx => {
          for (let i = 0; i < parts; i++) await tx.put('save:' + i, bytes.slice(i * PART, (i + 1) * PART));
          for (let i = parts; i < (this.room.checkpoint?.parts || 0); i++) await tx.delete('save:' + i);
          this.room.checkpoint = checkpoint; await tx.put('room', this.room);
        });
        this.send(ws, { type: 'ack', id: m.id, savedAt: checkpoint.at }); this.broadcast();
      } else if (m.type === 'mask') {
        this.room.active = -1; this.room.phase = 'transition'; this.room.generation++; await this.save(); this.broadcast(); this.send(ws, { type: 'ack', id: m.id, generation: this.room.generation });
      } else if (m.type === 'turn') {
        const colors = [1, 2, 4, 8, 16, 32].filter(c => m.humans & c);
        if (m.phase === 'setup') { if (this.room.checkpoint) return; this.room.active = 0; }
        else { if (colors.length !== this.room.capacity || !colors.includes(m.color)) return; this.room.active = colors.indexOf(m.color); }
        this.room.phase = m.phase; this.room.generation++; await this.save(); this.broadcast(); await this.job(); this.send(ws, { type: 'ack', id: m.id, generation: this.room.generation, active: this.room.active });
      }
      return;
    }
    if (this.room.game === 'heroes2') {
      // No browser, including the creator, may upload frames/saves, choose the
      // active player, load history, or download the complete native game.
      if (m.type === 'input' && seat === this.room.active && m.generation === this.room.generation && validInput(m) && this.service()) this.send(this.service(), { ...m, seat });
      return;
    }
    if (this.room.result || this.room.players.length < 2) return;
    const chess = new Chess(); for (const move of this.room.moves) chess.move(move); const color = seat === 0 ? 'w' : 'b';
    if (m.type === 'move' && chess.turn() === color && m.ply === this.room.moves.length) {
      if (!/^[a-h][1-8]$/.test(m.from) || !/^[a-h][1-8]$/.test(m.to) || (m.promotion && !/^[qrbn]$/.test(m.promotion))) return;
      try { this.room.moves.push(chess.move({ from: m.from, to: m.to, promotion: m.promotion }).san); } catch { this.send(ws, this.state()); return; }
      this.room.draw = null;
      if (chess.isCheckmate()) this.room.result = (color === 'w' ? 'White' : 'Black') + ' wins by checkmate.';
      else if (chess.isGameOver()) this.room.result = 'Draw.';
    } else if (m.type === 'resign') this.room.result = (color === 'w' ? 'Black' : 'White') + ' wins by resignation.';
    else if (m.type === 'draw') { if (this.room.draw != null && this.room.draw !== seat) this.room.result = 'Draw by agreement.'; else this.room.draw = seat; }
    else if (m.type === 'decline' && this.room.draw !== seat) this.room.draw = null;
    else return;
    this.room.active = chess.turn() === 'w' ? 0 : 1; await this.save(); this.broadcast(); await this.job();
  }
  webSocketClose(ws, code, reason) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {} return this.locked(async () => { if (this.room) { this.broadcast(); await this.job(); } }); }
  webSocketError(ws) { try { ws.close(1011, 'Connection lost.'); } catch {} return this.locked(async () => { if (this.room) { this.broadcast(); await this.job(); } }); }
  async alarm() { /* Games and their saved turns do not expire. */ }
}
function validInput(m) {
  if (['down', 'up', 'move'].includes(m.event)) return Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 && [0, 2].includes(m.button);
  return ['keydown', 'keyup'].includes(m.event) && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Escape|Space|Backspace|F2)$/.test(m.code) && Number.isInteger(m.keyCode) && m.keyCode >= 8 && m.keyCode <= 123 && typeof m.key === 'string' && m.key.length <= 12;
}
