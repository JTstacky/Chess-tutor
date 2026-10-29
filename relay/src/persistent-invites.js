import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const ROOM = /^[a-f0-9]{32}$/;
const MAX_SAVE = 4 * 1024 * 1024, PART = 64000;

export async function serviceRequest(req, env) {
  if (!env.HEROES_SERVICE_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.HEROES_SERVICE_TOKEN) return json({ error: 'Service authentication required.' }, 403);
  const url = new URL(req.url);
  if (url.pathname.startsWith('/service/heroes2/data/')) return originalsRequest(req, env);
  if (url.pathname === '/service/heroes2/jobs') return env.HEROES_JOBS.get(env.HEROES_JOBS.idFromName('jobs')).fetch(req);
  const id = url.pathname.match(/^\/service\/heroes2\/([a-f0-9]{32})$/)?.[1];
  if (!id) return json({ error: 'Not found.' }, 404);
  const headers = new Headers(req.headers); headers.set('X-Service', '1');
  return env.INVITES.get(env.INVITES.idFromName('heroes2:' + id)).fetch(new Request(req, { headers }));
}
async function originalsRequest(req, env) {
  if (!env.HEROES_ORIGINALS) return json({ error: 'Originals not configured.' }, 503);
  const game = await env.HEROES_ORIGINALS.get('game:heroes2', 'json');
  if (!game) return json({ error: 'Originals unavailable.' }, 503);
  const path = decodeURIComponent(new URL(req.url).pathname.slice('/service/heroes2/data/'.length));
  if (path === 'manifest') return json({ files: game.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })) });
  const file = game.files.find(f => f.path === path); if (!file) return json({}, 404);
  const kv = env.HEROES_ORIGINALS;
  const body = new ReadableStream({ n: 0, async pull(controller) {
    if (this.n >= file.chunks) return controller.close();
    const bytes = await kv.get(`data:${file.sha256}:${this.n++}`, 'arrayBuffer');
    if (!bytes) return controller.error(Error('Original-data chunk missing.'));
    controller.enqueue(new Uint8Array(bytes));
  } });
  return new Response(body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store' } });
}
export async function inviteRequest(req, env) {
  const url = new URL(req.url), match = /^\/invite\/(chess|heroes2|metal-slug(?:-[2x3456])?)\/([a-f0-9]{32})$/.exec(url.pathname);
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
    const request = new Request((env.ACCOUNTS_API || 'https://ev-online-api.justintengyz.workers.dev') + '/api/me', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    const r = env.ACCOUNTS && !env.ACCOUNTS_API ? await env.ACCOUNTS.fetch(request) : await fetch(request);
    if (!r.ok) return json({ error: 'Sign in again.' }, 401); me = await r.json();
  } catch { return json({ error: 'Sign-in service unavailable.' }, 503); }
  if (me.stage !== 'profile' || !Number.isSafeInteger(me.id) || me.tier === 'guest') return json({ error: 'Choose a signed-in profile.' }, 403);
  if (listing) {
    const response = await env.HEROES_JOBS.get(env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/index', { method: 'POST', body: JSON.stringify({ op: 'list', profile: me.id }) }));
    const data = await response.json(); data.games = data.games.filter(g => g.game === 'chess' || me.tier === 'full');
    const result = json(data); for (const [k, v] of Object.entries(cors)) result.headers.set(k, v); return result;
  }
  if ((match[1] === 'heroes2' || match[1].startsWith('metal-slug')) && me.tier !== 'full') return json({ error: 'This game needs a full account.' }, 403);
  const headers = new Headers({ Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'tg-invite', 'X-Player': String(me.id), 'X-Game': match[1] });
  const rooms=match[1].startsWith('metal-slug')?env.ARCADES:env.INVITES;
  return rooms.get(rooms.idFromName(match[1] + ':' + match[2])).fetch(new Request(url, { headers }));
}

export class HeroesJobs extends DurableObject {
  async fetch(req) {
    if (req.method === 'GET') return json({ jobs: [...(await this.ctx.storage.list({ prefix: 'job:' })).values()].filter(j => j.online > 0) });
    const job = await req.json();
    if (job.op === 'list' && Number.isSafeInteger(job.profile)) return json({ games: [...(await this.ctx.storage.list({ prefix: 'player:' + job.profile + ':' })).values()].sort((a, b) => b.updated - a.updated) });
    if (job.op === 'index') {
      if (!ROOM.test(job.id) || !/^(chess|heroes2|metal-slug(?:-[2x3456])?)$/.test(job.game) || !Array.isArray(job.players)) return json({}, 400);
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
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room'); });
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
      players: r.players.map((_, seat) => ({ seat, online: this.online(seat), ...(r.mode === 'local' && !this.online(seat) ? { offlineSince: r.offlineSince?.[seat] || r.created || 0 } : {}) })), ...(r.game === 'heroes2' && r.runtimeRetryAt > Date.now() ? { runtimeRetryAt: r.runtimeRetryAt } : {}), ...(r.game === 'chess' ? { moves: r.moves, result: r.result, draw: r.draw } : {}),
      ...(r.mode === 'local' ? { mode: 'local', serverOnline: true, holder: r.holder, lease: r.lease, viewer: r.viewer ?? -1, controller: r.controller ?? -1, botMinutes: r.botMinutes ?? null, humans: r.humans || 0, checkpointPhase: r.checkpoint?.phase ?? null, now: Date.now() } : {}) };
  }
  broadcast() { const s = this.state(); for (const ws of this.sockets()) this.send(ws, s); }
  async job() {
    const indexed = await this.env.HEROES_JOBS.get(this.env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/index', { method: 'POST', body: JSON.stringify({ ...this.room, op: 'index' }) }));
    if (!indexed.ok) throw Error('Game quota reached.');
    if (this.room.game !== 'heroes2' || this.room.mode === 'local') return;
    const r = await this.env.HEROES_JOBS.get(this.env.HEROES_JOBS.idFromName('jobs')).fetch(new Request('https://internal/jobs', { method: 'POST', body: JSON.stringify({ id: this.room.id, owner: this.room.players[0], ended: this.room.ended, online: this.room.ended ? 0 : this.sockets().filter(ws => this.seat(ws) != null).length }) }));
    if (!r.ok) throw Error('Game quota reached.');
    if (this.env.HEROES_SERVER && !this.room.ended && this.sockets().some(ws => this.seat(ws) != null) && !this.service()) {
      if (this.room.runtimeRetryAt > Date.now()) { await this.ctx.storage.setAlarm(this.room.runtimeRetryAt); return; }
      // Cold starts and image rollouts can outlast the initial wake request.
      // Retry while a player is waiting; the saved game itself never expires.
      await this.ctx.storage.setAlarm(Date.now() + 20000);
      this.ctx.waitUntil(this.env.HEROES_SERVER.fetch('https://internal/wake', { method: 'POST', headers: { Authorization: 'Bearer ' + this.env.HEROES_SERVICE_TOKEN } }).then(async r => {
        if (r.status === 402) {
          const value = await r.json();
          if (!value.budgetLimited || !Number.isSafeInteger(value.retryAt) || value.retryAt <= Date.now()) throw Error('Invalid runtime allowance response.');
          await this.locked(async () => {
            this.room.runtimeRetryAt = value.retryAt; await this.save();
            await this.ctx.storage.setAlarm(value.retryAt); this.broadcast();
          });
        } else if (!r.ok) throw Error('Engine wake failed.');
      }).catch(() => {}));
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }
  fetch(req) { return this.locked(() => this.handleFetch(req)); }
  async handleFetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('X-Service') === '1') {
      if (!this.room || this.room.game !== 'heroes2' || this.room.ended || this.room.mode === 'local') return json({}, 404);
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
      delete this.room.runtimeRetryAt;
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
      if (game === 'heroes2') {
        // "wait" (default) or minutes a player may be away before the computer fights their battles.
        const bot = url.searchParams.get('bot');
        const botMinutes = bot == null || bot === 'wait' ? null : Number(bot);
        if (botMinutes != null && (!Number.isInteger(botMinutes) || botMinutes < 0 || botMinutes > 1440)) return json({}, 400);
        Object.assign(this.room, { mode: 'local', holder: 0, lease: 1, active: 0, botMinutes, created: Date.now(), offlineSince: {}, humans: 0 });
      }
      try { await this.job(); await this.save(); }
      catch { this.room = undefined; return json({ error: 'Finish an existing game before creating more.' }, 409); }
    }
    if (this.room.ended) return json({ error: 'Game ended.' }, 410);
    if (this.room.game === 'heroes2' && this.room.mode === 'server') { migrateToLocal(this.room); await this.save(); }
    if (this.room.mode !== 'server' && this.room.mode !== 'local') return json({ error: 'Create a new persistent game.' }, 410);
    let seat = this.room.players.indexOf(player);
    if (seat < 0) { if (this.room.players.length >= this.room.capacity) return json({ error: 'Game full.' }, 409); seat = this.room.players.length; this.room.players.push(player); await this.save(); }
    for (const ws of this.sockets()) if (this.seat(ws) === seat) ws.close(4001, 'Opened elsewhere.');
    const [client, server] = Object.values(new WebSocketPair()); this.ctx.acceptWebSocket(server); server.serializeAttachment({ seat });
    if (this.room.offlineSince?.[seat] != null) { delete this.room.offlineSince[seat]; await this.save(); }
    this.send(server, { type: 'welcome', seat }); this.broadcast(); await this.job();
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'tg-invite' } });
  }
  webSocketMessage(ws, raw) { return this.locked(() => this.message(ws, raw)); }
  async message(ws, raw) {
    if (!this.room || this.room.ended) return;
    const trusted = ws === this.service(), seat = this.seat(ws), now = Date.now(), key = trusted ? 'service' : seat;
    let rate = this.rates.get(key); if (!rate || now - rate.at >= 1000) this.rates.set(key, rate = { at: now, n: 0, frames: 0 });
    if (++rate.n > 100) return;
    if (this.room.mode === 'local') return this.localMessage(ws, seat, raw, rate);
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
  webSocketClose(ws, code, reason) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {} return this.locked(() => this.left(ws)); }
  webSocketError(ws) { try { ws.close(1011, 'Connection lost.'); } catch {} return this.locked(() => this.left(ws)); }
  async left(ws) {
    if (!this.room) return;
    const seat = this.seat(ws);
    if (this.room.mode === 'local' && seat != null && !this.online(seat)) { (this.room.offlineSince ||= {})[seat] = Date.now(); await this.save(); }
    this.broadcast(); await this.job();
  }
  holderSocket() { return this.sockets().find(ws => this.seat(ws) === this.room.holder); }
  async storeSave(bytes, meta) {
    const parts = Math.ceil(bytes.length / PART);
    const checkpoint = { phase: meta.phase, at: Date.now(), parts, size: bytes.length, color: meta.color, humans: meta.humans, revision: (this.room.checkpoint?.revision || 0) + 1 };
    await this.ctx.storage.transaction(async tx => {
      for (let i = 0; i < parts; i++) await tx.put('save:' + i, bytes.slice(i * PART, (i + 1) * PART));
      for (let i = parts; i < (this.room.checkpoint?.parts || 0); i++) await tx.delete('save:' + i);
      this.room.checkpoint = checkpoint; this.room.humans = meta.humans; await tx.put('room', this.room);
    });
    return checkpoint;
  }
  async readSave() {
    const parts = [];
    for (let i = 0; i < (this.room.checkpoint?.parts || 0); i++) parts.push(new Uint8Array(await this.ctx.storage.get('save:' + i)));
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
    return bytes;
  }
  // Each player's browser runs the engine for its own turns. Only the holder
  // (the seat whose browser runs the engine now, with the current lease) may
  // store saves, hand the turn on, or stream a battle to the player it involves.
  async localMessage(ws, seat, raw, rate) {
    const r = this.room, holding = seat != null && seat === r.holder;
    if (typeof raw !== 'string') {
      const view = new Uint8Array(raw);
      if (view[0] === 1) {
        // Battle frame (JPEG) for the viewing player only.
        if (!holding || raw.byteLength > 200001 || ++rate.frames > 15 || r.viewer == null || r.viewer < 0 || r.viewer === seat) return;
        for (const peer of this.sockets()) if (this.seat(peer) === r.viewer) this.send(peer, raw);
        return;
      }
      if (view[0] !== 2 || raw.byteLength < 6) return;
      const length = new DataView(raw).getUint32(1);
      if (length > 1024 || 5 + length > raw.byteLength) return;
      let head; try { head = JSON.parse(new TextDecoder().decode(view.subarray(5, 5 + length))); } catch { return; }
      const bytes = view.slice(5 + length);
      if (!holding || head?.lease !== r.lease || !bytes.length || bytes.length > MAX_SAVE || ![0, 1, 2].includes(head.phase) || !Number.isInteger(head.humans) || !Number.isInteger(head.color)) { this.send(ws, { type: 'refused', id: head?.id }); return; }
      const colors = [1, 2, 4, 8, 16, 32].filter(c => head.humans & c);
      if (colors.length !== r.capacity) { this.send(ws, { type: 'refused', id: head.id, error: 'Choose exactly ' + r.capacity + ' human players.' }); return; }
      if (head.type === 'handoff') {
        const next = colors.indexOf(head.color);
        if (head.phase !== 0 || next < 0 || next === seat) { this.send(ws, { type: 'refused', id: head.id }); return; }
        await this.storeSave(bytes, head);
        Object.assign(r, { holder: next, lease: r.lease + 1, active: next, phase: 'adventure', viewer: -1, controller: -1 }); r.generation++;
      } else if (head.type === 'save') {
        await this.storeSave(bytes, head);
        if (head.phase !== 2) { const own = colors.indexOf(head.color); if (own >= 0) r.active = own; }
        r.phase = head.phase === 2 ? 'computer' : 'adventure';
      } else return;
      await this.save(); this.send(ws, { type: 'saved', id: head.id, revision: r.checkpoint.revision }); this.broadcast(); await this.job();
      return;
    }
    if (raw.length > 4096) return;
    let m; try { m = JSON.parse(raw); } catch { return; } if (!m || typeof m !== 'object') return;
    if (m.type === 'input') {
      // Battle input from the player whose units are moving, to the holder's engine.
      if (seat === r.controller && seat === r.viewer && seat !== r.holder && validInput(m)) { const h = this.holderSocket(); if (h) this.send(h, { ...m, seat }); }
      return;
    }
    if (m.type === 'load') {
      if (!holding || !r.checkpoint) return;
      const bytes = await this.readSave(), head = new TextEncoder().encode(JSON.stringify({ type: 'save', lease: r.lease, checkpoint: r.checkpoint }));
      const out = new Uint8Array(5 + head.length + bytes.length); out[0] = 2; new DataView(out.buffer).setUint32(1, head.length); out.set(head, 5); out.set(bytes, 5 + head.length);
      this.send(ws, out.buffer); return;
    }
    if (m.type === 'claim') {
      // A finished turn (computer players still to move) can be picked up by
      // any player while the previous holder is offline.
      if (seat == null || holding || this.online(r.holder) || r.checkpoint?.phase !== 2) return;
      Object.assign(r, { holder: seat, lease: r.lease + 1, viewer: -1, controller: -1 }); r.generation++;
      await this.save(); this.broadcast(); return;
    }
    if (!holding || m.lease !== r.lease) return;
    if (m.type === 'control') {
      const ok = v => Number.isInteger(v) && v >= -1 && v < r.capacity;
      if (!ok(m.viewer) || !ok(m.controller)) return;
      r.viewer = m.viewer; r.controller = m.controller; this.broadcast(); return;
    }
    if (m.type === 'complete') {
      Object.assign(r, { ended: true, result: 'Game finished.', phase: 'finished', active: -1, viewer: -1, controller: -1 }); r.generation++;
      await this.save(); this.broadcast(); await this.job();
    }
  }
  alarm() { return this.locked(async () => { if (this.room) await this.job(); }); }
}
// Games started on the retired cloud engine continue in players' browsers from their last save.
function migrateToLocal(room) {
  const c = room.checkpoint, colors = [1, 2, 4, 8, 16, 32].filter(x => (c?.humans || 0) & x);
  const holder = c ? Math.max(0, colors.indexOf(c.color)) : 0;
  Object.assign(room, { mode: 'local', holder, lease: 1, active: holder, phase: c ? (c.phase === 2 ? 'computer' : 'adventure') : 'setup', humans: c?.humans || 0, botMinutes: null, created: room.created || Date.now(), offlineSince: {}, viewer: -1, controller: -1 });
  delete room.runtimeRetryAt; room.generation++;
}
function validInput(m) {
  if (['down', 'up', 'move'].includes(m.event)) return Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 && [0, 2].includes(m.button);
  return ['keydown', 'keyup'].includes(m.event) && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Escape|Space|Backspace|F2)$/.test(m.code) && Number.isInteger(m.keyCode) && m.keyCode >= 8 && m.keyCode <= 123 && typeof m.key === 'string' && m.key.length <= 12;
}
