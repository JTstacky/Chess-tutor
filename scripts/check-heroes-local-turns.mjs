// Isolated LOCAL relay check for on-device Heroes II turns. No production writes or real users.
// Needs the local accounts Worker (8812) and relay (8810); see docs/INVITES.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import WebSocket from '../relay/node_modules/ws/wrapper.mjs';
const f = JSON.parse(fs.readFileSync(new URL('../.qa/invite-fixtures.json', import.meta.url)));
const origin = 'http://127.0.0.1:8811', sockets = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const code = () => randomBytes(16).toString('hex');
async function wait(fn, what = 'state') { for (let i = 0; i < 200; i++) { if (fn()) return; await delay(25); } throw Error('Timeout waiting for ' + what); }
async function player(id, index, query = '') {
  const ws = new WebSocket(`ws://127.0.0.1:8810/invite/heroes2/${id}${query}`, ['tg-invite', 'tg-auth.' + f[index].token], { headers: { Origin: origin } });
  sockets.push(ws); ws.messages = []; ws.binary = [];
  ws.on('message', (raw, binary) => { if (binary) ws.binary.push(new Uint8Array(raw)); else { try { ws.messages.push(JSON.parse(raw.toString())); } catch {} } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await wait(() => ws.messages.some(m => m.type === 'welcome'), 'welcome'); return ws;
}
const state = ws => ws.messages.findLast(m => m.type === 'room');
const send = (ws, m) => ws.send(JSON.stringify(m));
function pack(head, bytes) { const h = Buffer.from(JSON.stringify(head)), out = Buffer.alloc(5 + h.length + bytes.length); out[0] = 2; out.writeUInt32BE(h.length, 1); h.copy(out, 5); Buffer.from(bytes).copy(out, 5 + h.length); return out; }
async function upload(ws, { bytes, ...head }) { const id = code(); ws.send(pack({ ...head, id }, bytes)); await wait(() => ws.messages.some(m => (m.type === 'saved' || m.type === 'refused') && m.id === id), 'save reply'); return ws.messages.find(m => m.id === id); }
async function check(name, run) { await run(); console.log('PASS ' + name); }
try {
  const room = code(), save1 = randomBytes(257000), save2 = randomBytes(150000);
  let a, b;
  await check('creator holds the game first; bot setting and away times are shared', async () => {
    a = await player(room, 0, '?host=1&players=2&bot=5');
    const s = state(a); assert.equal(s.mode, 'local'); assert.equal(s.holder, 0); assert.equal(s.botMinutes, 5); assert.equal(s.checkpointPhase, null);
    b = await player(room, 1); await wait(() => state(a).players.length === 2 && state(a).players[1].online);
    b.close(); await wait(() => state(a).players[1].online === false); assert(state(a).players[1].offlineSince > Date.now() - 5000);
    b = await player(room, 1); await wait(() => state(a).players[1].online);
  });
  await check('bad bot settings are refused', async () => { await assert.rejects(player(code(), 0, '?host=1&players=2&bot=-3')); });
  await check('only the holder may store a save; human count must match', async () => {
    assert.equal((await upload(b, { type: 'save', lease: state(b).lease, color: 2, humans: 3, phase: 1, bytes: save2 })).type, 'refused');
    assert.equal((await upload(a, { type: 'save', lease: 99, color: 1, humans: 3, phase: 1, bytes: save2 })).type, 'refused');
    assert.equal((await upload(a, { type: 'save', lease: state(a).lease, color: 1, humans: 7, phase: 1, bytes: save2 })).type, 'refused');
    assert.equal((await upload(a, { type: 'save', lease: state(a).lease, color: 1, humans: 3, phase: 1, bytes: save2 })).type, 'saved');
    send(b, { type: 'load' }); await delay(150); assert.equal(b.binary.length, 0, 'non-holder cannot download the save');
  });
  await check('battle frames go only to the viewer; input only from the controller', async () => {
    const lease = state(a).lease;
    send(a, { type: 'control', lease, viewer: 1, controller: 1 }); await wait(() => state(b).viewer === 1 && state(b).controller === 1);
    a.send(Buffer.from([1, 9, 9, 9])); await wait(() => b.binary.length === 1, 'frame'); assert.deepEqual([...b.binary[0]], [1, 9, 9, 9]);
    b.send(Buffer.from([1, 5])); await delay(100); assert.equal(a.binary.length, 0, 'viewer cannot send frames');
    send(b, { type: 'input', event: 'down', x: .5, y: .5, button: 0 }); await wait(() => a.messages.some(m => m.type === 'input' && m.seat === 1), 'input');
    send(a, { type: 'control', lease, viewer: 1, controller: -1 }); await wait(() => state(b).controller === -1);
    const before = a.messages.filter(m => m.type === 'input').length; send(b, { type: 'input', event: 'up', x: .5, y: .5, button: 0 }); await delay(120);
    assert.equal(a.messages.filter(m => m.type === 'input').length, before, 'input ignored while the holder controls');
    send(b, { type: 'control', lease, viewer: -1, controller: -1 }); await delay(100); assert.equal(state(a).viewer, 1, 'only the holder sets control');
    send(a, { type: 'control', lease, viewer: -1, controller: -1 }); await wait(() => state(a).viewer === -1);
  });
  await check('handoff passes the save and the turn; the new holder downloads exactly those bytes', async () => {
    const lease = state(a).lease;
    assert.equal((await upload(a, { type: 'handoff', lease, color: 2, humans: 3, phase: 0, bytes: save1 })).type, 'saved');
    await wait(() => state(b).holder === 1); assert.equal(state(b).lease, lease + 1); assert.equal(state(b).active, 1);
    assert.equal((await upload(a, { type: 'save', lease, color: 1, humans: 3, phase: 1, bytes: save2 })).type, 'refused', 'old holder is locked out');
    send(b, { type: 'load' }); await wait(() => b.binary.length === 2, 'save download');
    const got = b.binary[1], len = Buffer.from(got).readUInt32BE(1), head = JSON.parse(Buffer.from(got.subarray(5, 5 + len)).toString());
    assert.equal(got[0], 2); assert.equal(head.lease, lease + 1); assert.equal(head.checkpoint.phase, 0); assert.equal(head.checkpoint.color, 2);
    assert(Buffer.from(got.subarray(5 + len)).equals(save1), 'save bytes intact across 64 KB chunks');
  });
  await check('a finished turn can be picked up by another player only while its holder is away', async () => {
    const lease = state(b).lease;
    assert.equal((await upload(b, { type: 'save', lease, color: 2, humans: 3, phase: 2, bytes: save2 })).type, 'saved');
    send(a, { type: 'claim' }); await delay(150); assert.equal(state(a).holder, 1, 'holder is online: no claim');
    b.close(); await wait(() => !state(a).players[1].online);
    send(a, { type: 'claim' }); await wait(() => state(a).holder === 0); assert.equal(state(a).lease, lease + 1);
    send(a, { type: 'load' }); await wait(() => a.binary.length === 1, 'claimed save');
  });
  await check('a mid-turn save cannot be claimed', async () => {
    const lease = state(a).lease;
    assert.equal((await upload(a, { type: 'save', lease, color: 1, humans: 3, phase: 1, bytes: save2 })).type, 'saved');
    a.close(); b = await player(room, 1); await wait(() => state(b) && !state(b).players[0].online);
    send(b, { type: 'claim' }); await delay(150); assert.equal(state(b).holder, 0);
  });
  await check('the holder can finish the game', async () => {
    a = await player(room, 0); send(a, { type: 'complete', lease: state(a).lease }); await wait(() => state(b).result === 'Game finished.');
  });
} finally { for (const ws of sockets) try { ws.close(); } catch {} }
