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
  // Heroes turn rules (on-device turns) are covered by check-heroes-local-turns.mjs.
  let room, a, b;
  await check('Heroes creator and guest get ordinary player seats', async () => {
    room = code(); a = await player('heroes2', room, 0, true, { 'X-Service': '1' }); b = await player('heroes2', room, 1);
    assert.equal(a.messages[0].seat, 0); assert.equal(b.messages[0].seat, 1); assert.equal(state(a).mode, 'local'); assert.equal(state(a).persistent, true);
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
  await check('existing four-letter relay still forwards guest messages', async () => {
    const host = await wsOpen('ws://127.0.0.1:8810/chess/QA' + String.fromCharCode(65 + Math.floor(Math.random()*26), 65 + Math.floor(Math.random()*26)) + '?role=host', [], { Origin: origin });
    const endpoint = host.url.replace('role=host', 'role=guest'), guest = await wsOpen(endpoint, [], { Origin: origin });
    const received = []; host.on('message', raw => received.push(raw.toString())); guest.send('persistent-regression');
    await wait(() => received.some(s => s.endsWith('|persistent-regression')));
  });
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  fs.writeFileSync(new URL('../.qa/persistent-api-results.json', import.meta.url), JSON.stringify({ passed: results.length, results }, null, 2));
} finally { for (const ws of sockets) ws.terminate(); }
