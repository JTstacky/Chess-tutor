// Isolated LOCAL relay/accounts integration. No production writes or real users.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import WebSocket from '../relay/node_modules/ws/wrapper.mjs';
const f = JSON.parse(fs.readFileSync(new URL('../.qa/invite-fixtures.json', import.meta.url)));
const secret = fs.readFileSync(new URL('../relay/.dev.vars', import.meta.url), 'utf8').match(/^HEROES_SERVICE_TOKEN=(\S+)/m)?.[1];
const origin = 'http://127.0.0.1:8811', sockets = [], results = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const code = () => randomBytes(16).toString('hex');
async function wait(fn) { for (let i = 0; i < 150; i++) { if (fn()) return; await delay(25); } throw Error('Relay state timeout'); }
async function wsOpen(url, protocols, headers = {}) {
  const ws = new WebSocket(url, protocols, { headers }); sockets.push(ws); ws.messages = []; ws.binary = [];
  ws.on('message', (raw, binary) => { if (binary) ws.binary.push(raw); else { try { ws.messages.push(JSON.parse(raw.toString())); } catch {} } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }); return ws;
}
const state = ws => ws.messages.findLast(m => m.type === 'room');
async function player(game, id, index, create = false, extra = {}) {
  const ws = await wsOpen(`ws://127.0.0.1:8810/invite/${game}/${id}${create ? '?host=1&players=2' : ''}`, ['tg-invite', 'tg-auth.' + f[index].token], { Origin: origin, ...extra });
  await wait(() => ws.messages.some(m => m.type === 'welcome')); return ws;
}
async function service(id, credential = secret) { const ws = await wsOpen('ws://127.0.0.1:8810/service/heroes2/' + id, [], { Authorization: 'Bearer ' + credential }); await wait(() => ws.messages.some(m => m.type === 'service-welcome')); return ws; }
const send = (ws, data) => ws.send(JSON.stringify(data));
async function command(ws, msg) { const id = code(); send(ws, { ...msg, id }); await wait(() => ws.messages.some(m => m.type === 'ack' && m.id === id)); return ws.messages.find(m => m.type === 'ack' && m.id === id); }
async function check(name, run) { await run(); results.push(name); console.log('PASS ' + name); }
try {
  await check('full-account/profile/origin and service-only credentials enforced', async () => {
    for (const index of [8, 9, 10]) await assert.rejects(player('heroes2', code(), index, true));
    await assert.rejects(player('chess', code(), 0, true, { Origin: 'https://other.example' }));
    await assert.rejects(service(code(), 'invalid-service-secret'));
    const response = await fetch('http://127.0.0.1:8810/service/heroes2/jobs', { headers: { Authorization: 'Bearer ' + f[0].token } }); assert.equal(response.status, 403);
  });
  let room, a, b, engine;
  await check('creator has an ordinary player seat, never a service role', async () => {
    room = code(); a = await player('heroes2', room, 0, true, { 'X-Service': '1' }); b = await player('heroes2', room, 1);
    assert.equal(a.messages[0].seat, 0); assert.equal(b.messages[0].seat, 1); assert.equal(state(a).serverOnline, false);
    assert.equal(state(a).persistent, true); assert(!('expires' in state(a)));
    engine = await service(room); await wait(() => state(a).serverOnline);
  });
  let generation;
  await check('only native service decides turns, including assigning player 2 while creator waits', async () => {
    const ack = await command(engine, { type: 'turn', color: 2, humans: 3, phase: 'adventure' }); generation = ack.generation;
    assert.equal(state(a).active, 1); send(a, { type: 'control', seat: 0 }); send(a, { type: 'turn', color: 1, humans: 3, phase: 'adventure' }); send(a, { type: 'end' }); await delay(100); assert.equal(state(a).active, 1);
  });
  await check('creator receives no opponent frames, and stale or browser-uploaded frames are refused', async () => {
    const frame = Buffer.alloc(24); frame.writeUInt32BE(generation); frame.fill(7, 8);
    engine.send(frame); await wait(() => b.binary.length === 1); assert.equal(a.binary.length, 0);
    frame.writeUInt32BE(generation - 1); engine.send(frame); a.send(frame); await delay(100); assert.equal(a.binary.length, 0); assert.equal(b.binary.length, 1);
    const input = { type: 'input', generation, event: 'down', x: .5, y: .5, button: 0 };
    send(a, input); send(b, { ...input, generation: generation - 1 }); await delay(80); assert(!engine.messages.some(m => m.type === 'input'));
    send(b, input); await wait(() => engine.messages.some(m => m.type === 'input' && m.seat === 1));
  });
  const data = randomBytes(180000).toString('base64');
  await check('server checkpoints persist atomically across multiple storage chunks; clients cannot read or replace them', async () => {
    await command(engine, { type: 'checkpoint', data, phase: 1, color: 2, humans: 3 });
    send(a, { type: 'checkpoint', data: 'ZmFrZQ==', phase: 1, color: 1, humans: 3 }); await delay(80);
    const denied = await fetch('http://127.0.0.1:8810/service/heroes2/' + room, { headers: { Authorization: 'Bearer ' + f[0].token } }); assert.equal(denied.status, 403);
    const r = await fetch('http://127.0.0.1:8810/service/heroes2/' + room, { headers: { Authorization: 'Bearer ' + secret } }); const saved = await r.json();
    assert.equal(saved.data, data); assert.equal(saved.checkpoint.parts, 3); assert.equal(saved.checkpoint.color, 2);
    assert(!JSON.stringify(state(a)).includes(data.slice(0, 100))); assert(!JSON.stringify(state(b)).includes('humans'));
  });
  await check('all players and service can leave, then reconnect to the same saved turn', async () => {
    a.close(); b.close(); engine.close(); await delay(180);
    b = await player('heroes2', room, 1); assert.equal(b.messages[0].seat, 1); assert.equal(state(b).serverOnline, false);
    const saved = await (await fetch('http://127.0.0.1:8810/service/heroes2/' + room, { headers: { Authorization: 'Bearer ' + secret } })).json(); assert.equal(saved.data, data);
    engine = await service(room); assert.equal(state(b).active, -1);
    const ack = await command(engine, { type: 'turn', color: 2, humans: 3, phase: 'adventure' }); assert.equal(ack.active, 1);
  });
  let chessId;
  await check('chess is asynchronous, rejects out-of-turn moves, and survives both players leaving', async () => {
    chessId = code(); const w = await player('chess', chessId, 0, true), k = await player('chess', chessId, 8);
    send(w, { type: 'move', from: 'e2', to: 'e4', ply: 0 }); await wait(() => state(k).moves.length === 1);
    w.close(); await wait(() => !state(k).players[0].online);
    send(k, { type: 'move', from: 'e7', to: 'e5', ply: 1 }); await wait(() => state(k).moves.length === 2); k.close(); await delay(80);
    const back = await player('chess', chessId, 0); assert.deepEqual(state(back).moves, ['e4', 'e5']);
    send(back, { type: 'move', from: 'g1', to: 'f3', ply: 2 }); await wait(() => state(back).moves.length === 3);
    send(back, { type: 'move', from: 'b1', to: 'c3', ply: 3 }); await delay(80); assert.equal(state(back).moves.length, 3);
  });
  await check('saved-game index is server-owned, profile-private, and returns each player’s own seat', async () => {
    async function mine(index) { const r = await fetch('http://127.0.0.1:8810/games', { headers: { Origin: origin, Authorization: 'Bearer ' + f[index].token } }); assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), origin); return (await r.json()).games; }
    const first = await mine(0), second = await mine(1), unrelated = await mine(2);
    assert(first.some(g => g.id === room && g.seat === 0)); assert(second.some(g => g.id === room && g.seat === 1)); assert(!unrelated.some(g => g.id === room || g.id === chessId));
    assert(first.every(g => !('players' in g) && !('data' in g) && !('owner' in g)));
  });
  await check('only the native service can finish Heroes and remove it from the active job queue', async () => {
    send(b, { type: 'complete' }); await delay(80); assert.notEqual(state(b).phase, 'finished');
    await command(engine, { type: 'complete' }); assert.equal(state(b).phase, 'finished'); assert.equal(state(b).active, -1);
    const jobs = await (await fetch('http://127.0.0.1:8810/service/heroes2/jobs', { headers: { Authorization: 'Bearer ' + secret } })).json(); assert(!jobs.jobs.some(j => j.id === room));
    await assert.rejects(player('heroes2', room, 0));
  });
  await check('existing four-letter relay still forwards guest messages', async () => {
    const host = await wsOpen('ws://127.0.0.1:8810/chess/QA' + String.fromCharCode(65 + Math.floor(Math.random()*26), 65 + Math.floor(Math.random()*26)) + '?role=host', [], { Origin: origin });
    const endpoint = host.url.replace('role=host', 'role=guest'), guest = await wsOpen(endpoint, [], { Origin: origin });
    const received = []; host.on('message', raw => received.push(raw.toString())); guest.send('persistent-regression');
    await wait(() => received.some(s => s.endsWith('|persistent-regression')));
  });
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  fs.writeFileSync(new URL('../.qa/persistent-api-results.json', import.meta.url), JSON.stringify({ passed: results.length, results }, null, 2));
} finally { for (const ws of sockets) ws.terminate(); }
