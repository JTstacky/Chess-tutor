// Isolated LOCAL relay check for turn games (docs/TURN-GAMES.md), using the
// Heroes II registration. No production writes or real users.
// Needs the local accounts Worker (8812) and relay (8810); see docs/INVITES.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import WebSocket from '../relay/node_modules/ws/wrapper.mjs';
const f = JSON.parse(fs.readFileSync(new URL('../.qa/invite-fixtures.json', import.meta.url)));
const origin = 'http://127.0.0.1:8811', sockets = [], PART = 512000;
const delay = ms => new Promise(r => setTimeout(r, ms));
const code = () => randomBytes(16).toString('hex');
async function wait(fn, what = 'state') { for (let i = 0; i < 400; i++) { if (fn()) return; await delay(25); } throw Error('Timeout waiting for ' + what); }
async function player(id, index, query = '') {
  const ws = new WebSocket(`ws://127.0.0.1:8810/invite/heroes2/${id}${query}`, ['tg-invite', 'tg-auth.' + f[index].token], { headers: { Origin: origin } });
  sockets.push(ws); ws.messages = []; ws.binary = [];
  ws.on('message', (raw, binary) => { if (binary) ws.binary.push(new Uint8Array(raw)); else { try { ws.messages.push(JSON.parse(raw.toString())); } catch {} } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); ws.once('unexpected-response', (_, res) => reject(Error('HTTP ' + res.statusCode))); });
  await wait(() => ws.messages.some(m => m.type === 'welcome'), 'welcome'); return ws;
}
const state = ws => ws.messages.findLast(m => m.type === 'room');
const send = (ws, m) => ws.send(JSON.stringify(m));
function pack(head, bytes) { const h = Buffer.from(JSON.stringify(head)), out = Buffer.alloc(5 + h.length + bytes.length); out[0] = 2; out.writeUInt32BE(h.length, 1); h.copy(out, 5); Buffer.from(bytes).copy(out, 5 + h.length); return out; }
// Sends a save in parts, waiting for each acknowledgement; returns the final reply.
async function upload(ws, { bytes, ...head }) {
  const id = code(), parts = Math.max(1, Math.ceil(bytes.length / PART));
  for (let part = 0; part < parts; part++) {
    const seen = ws.messages.length;
    ws.send(pack({ ...head, id, part, parts: head.parts ?? parts, size: head.size ?? bytes.length }, bytes.subarray(part * PART, (part + 1) * PART)));
    await wait(() => ws.messages.slice(seen).some(m => ['part', 'saved', 'refused'].includes(m.type) && m.id === id), 'save reply');
    const reply = ws.messages.slice(seen).find(m => m.id === id);
    if (reply.type !== 'part') return reply;
  }
}
// Downloads the holder's save and reassembles its parts.
async function download(ws) {
  const start = ws.binary.length; send(ws, { type: 'load' });
  let head;
  await wait(() => { const got = ws.binary.slice(start); if (!got.length) return false; head = header(got.at(-1)); return got.length === head.parts; }, 'save download');
  const parts = ws.binary.slice(start).map(b => Buffer.from(b.subarray(5 + Buffer.from(b).readUInt32BE(1))));
  return { head, bytes: Buffer.concat(parts) };
}
const header = b => JSON.parse(Buffer.from(b.subarray(5, 5 + Buffer.from(b).readUInt32BE(1))).toString());
async function check(name, run) { await run(); console.log('PASS ' + name); }
try {
  const room = code(), big = randomBytes(3 * 1024 * 1024 + 12345), small = randomBytes(150000);
  let a, b;
  await check('creator holds the match first; away-bot minutes and away times are shared', async () => {
    a = await player(room, 0, '?host=1&players=2&bot=5');
    const s = state(a); assert.equal(s.mode, 'local'); assert.equal(s.holder, 0); assert.equal(s.botMinutes, 5); assert.equal(s.checkpointPhase, null);
    b = await player(room, 1); await wait(() => state(a).players.length === 2 && state(a).players[1].online);
    b.close(); await wait(() => state(a).players[1].online === false); assert(state(a).players[1].offlineSince > Date.now() - 5000);
    b = await player(room, 1); await wait(() => state(a).players[1].online);
  });
  await check('match settings are validated: away-bot minutes and seat count within the game range', async () => {
    await assert.rejects(player(code(), 0, '?host=1&players=2&bot=-3'));
    await assert.rejects(player(code(), 0, '?host=1&players=7'));
  });
  await check('only profiles allowed the game files can join (basic tier is refused Heroes II files)', async () => {
    await assert.rejects(player(code(), 8, '?host=1&players=2'), /403/);
  });
  await check('only the holder may store a save; the per-game size limit applies', async () => {
    assert.equal((await upload(b, { type: 'save', lease: state(b).lease, phase: 1, seat: 1, bytes: small })).type, 'refused');
    assert.equal((await upload(a, { type: 'save', lease: 99, phase: 1, seat: 0, bytes: small })).type, 'refused');
    assert.equal((await upload(a, { type: 'save', lease: state(a).lease, phase: 1, seat: 0, size: 5 * 1024 * 1024, bytes: small })).type, 'refused', 'over maxSave');
    assert.equal((await upload(a, { type: 'save', lease: state(a).lease, phase: 1, seat: 0, meta: { x: 'y'.repeat(1100) }, bytes: small })).type, 'refused', 'meta too large');
    assert.equal((await upload(a, { type: 'save', lease: state(a).lease, phase: 1, seat: 0, meta: { color: 1 }, bytes: small })).type, 'saved');
    send(b, { type: 'load' }); await delay(150); assert.equal(b.binary.length, 0, 'non-holder cannot download the save');
  });
  await check('a multi-part save (3 MB) round-trips intact; an interrupted upload leaves the old save', async () => {
    const lease = state(a).lease, id = code();
    a.send(pack({ type: 'save', id, lease, phase: 1, seat: 0, part: 0, parts: 7, size: big.length }, big.subarray(0, PART)));
    await wait(() => a.messages.some(m => m.type === 'part' && m.id === id), 'first part ack');
    a.send(pack({ type: 'save', id, lease, phase: 1, seat: 0, part: 2, parts: 7, size: big.length }, big.subarray(2 * PART, 3 * PART)));
    await wait(() => a.messages.some(m => m.type === 'refused' && m.id === id), 'out-of-order refusal');
    assert((await download(a)).bytes.equals(small), 'old save kept after the broken upload');
    assert.equal((await upload(a, { type: 'save', lease, phase: 1, seat: 0, meta: { color: 1 }, bytes: big })).type, 'saved');
    const got = await download(a); assert(got.bytes.equals(big)); assert.equal(got.head.parts, 7); assert.deepEqual(got.head.checkpoint.meta, { color: 1 });
  });
  await check('streamed frames go only to the viewer; input only from the controller', async () => {
    const lease = state(a).lease, before = b.binary.length;
    send(a, { type: 'control', lease, viewer: 1, controller: 1 }); await wait(() => state(b).viewer === 1 && state(b).controller === 1);
    a.send(Buffer.from([1, 9, 9, 9])); await wait(() => b.binary.length === before + 1, 'frame'); assert.deepEqual([...b.binary.at(-1)], [1, 9, 9, 9]);
    const aBefore = a.binary.length; b.send(Buffer.from([1, 5])); await delay(100); assert.equal(a.binary.length, aBefore, 'viewer cannot send frames');
    send(b, { type: 'input', event: 'down', x: .5, y: .5, button: 0 }); await wait(() => a.messages.some(m => m.type === 'input' && m.seat === 1), 'input');
    send(a, { type: 'control', lease, viewer: 1, controller: -1 }); await wait(() => state(b).controller === -1);
    const n = a.messages.filter(m => m.type === 'input').length; send(b, { type: 'input', event: 'up', x: .5, y: .5, button: 0 }); await delay(120);
    assert.equal(a.messages.filter(m => m.type === 'input').length, n, 'input ignored while the holder controls');
    send(b, { type: 'control', lease, viewer: -1, controller: -1 }); await delay(100); assert.equal(state(a).viewer, 1, 'only the holder sets control');
    send(a, { type: 'control', lease, viewer: -1, controller: -1 }); await wait(() => state(a).viewer === -1);
  });
  await check('handoff passes the save, turn order and turn; the next seat is told it is their turn', async () => {
    const lease = state(a).lease;
    assert.equal((await upload(a, { type: 'handoff', lease, phase: 0, seat: 1, next: 0, bytes: small })).type, 'refused', 'cannot hand to yourself');
    assert.equal((await upload(a, { type: 'handoff', lease, phase: 0, seat: 1, next: 1, order: [0, 1], meta: { color: 2 }, bytes: small })).type, 'saved');
    await wait(() => state(b).holder === 1); assert.equal(state(b).lease, lease + 1); assert.equal(state(b).active, 1); assert.deepEqual(state(b).order, [0, 1]);
    assert(state(b).turnSince > Date.now() - 5000); assert(b.messages.some(m => m.type === 'your-turn' && m.game === 'heroes2' && m.id === room));
    assert.equal((await upload(a, { type: 'save', lease, phase: 1, seat: 0, bytes: small })).type, 'refused', 'old holder is locked out');
    const got = await download(b); assert(got.bytes.equals(small)); assert.equal(got.head.lease, lease + 1); assert.equal(got.head.checkpoint.seat, 1);
  });
  await check('saved-games list shows whose turn it is', async () => {
    const list = async i => (await (await fetch('http://127.0.0.1:8810/games', { headers: { Origin: origin, Authorization: 'Bearer ' + f[i].token } })).json()).games.find(g => g.id === room);
    assert.equal((await list(1)).yourTurn, true); assert.equal((await list(0)).yourTurn, false);
  });
  await check('a finished turn can be picked up by another seat only while its holder is away', async () => {
    const lease = state(b).lease;
    assert.equal((await upload(b, { type: 'save', lease, phase: 2, seat: -1, bytes: small })).type, 'saved');
    send(a, { type: 'claim' }); await delay(150); assert.equal(state(a).holder, 1, 'holder is online: no claim');
    b.close(); await wait(() => !state(a).players[1].online);
    send(a, { type: 'claim' }); await wait(() => state(a).holder === 0); assert.equal(state(a).lease, lease + 1);
    assert((await download(a)).bytes.equals(small));
  });
  await check('a mid-turn save cannot be claimed', async () => {
    const lease = state(a).lease;
    assert.equal((await upload(a, { type: 'save', lease, phase: 1, seat: 0, bytes: small })).type, 'saved');
    a.close(); b = await player(room, 1); await wait(() => state(b) && !state(b).players[0].online);
    send(b, { type: 'claim' }); await delay(150); assert.equal(state(b).holder, 0);
  });
  await check('the holder can end the match with a result', async () => {
    a = await player(room, 0); send(a, { type: 'complete', lease: state(a).lease, result: 'Blue wins.' }); await wait(() => state(b).result === 'Blue wins.');
  });
} finally { for (const ws of sockets) try { ws.close(); } catch {} }
