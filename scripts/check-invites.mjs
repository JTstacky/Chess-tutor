// Integration check against isolated LOCAL accounts (8812) and relay (8810).
// Never uses production accounts. Test sessions are kept only in ignored .qa/.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from '../relay/node_modules/ws/wrapper.mjs';

const root = path.resolve(import.meta.dirname, '..'), cloud = path.resolve(root, '../ev-online/cloud');
const db = path.resolve(root, '../invite-test-db');
const sql = command => execFileSync(process.execPath, [path.join(cloud, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'ev-online', '--local', '--config', 'wrangler.retro-dev.toml', '--persist-to', db, '--command', command], { cwd: cloud, stdio: 'pipe' });
const fixtures = Array.from({ length: 11 }, (_, i) => ({ id: 910001 + i, token: randomBytes(32).toString('base64url'), tier: i === 8 ? 'basic' : i === 9 ? 'guest' : 'full', stage: i === 10 ? 'account' : 'profile' }));
const now = Date.now();
sql(fixtures.map(f => `INSERT OR REPLACE INTO accounts(id,username,username_key,pw_hash,recovery_hash,created_at,tier,approval,kind) VALUES(${f.id},'Invite fixture ${f.id}','invite fixture ${f.id}','unused','unused',${now},'${f.tier === 'guest' ? 'basic' : f.tier}','approved','${f.tier === 'guest' ? 'guest' : 'parent'}'); INSERT INTO sessions(token_hash,account_id,created_at,expires_at,stage) VALUES('${createHash('sha256').update(f.token).digest('base64')}',${f.id},${now},${now + 86400e3},'${f.stage}');`).join('\n'));
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
fs.writeFileSync(path.join(root, '.qa/invite-fixtures.json'), JSON.stringify(fixtures));
const sockets = [], checks = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const code = () => randomBytes(16).toString('hex');
async function connect(game, room, who, host = false, origin = 'http://127.0.0.1:8811') {
  const ws = new WebSocket(`ws://127.0.0.1:8810/invite/${game}/${room}${host ? '?host=1' : ''}`, ['tg-invite', ...(who ? ['tg-auth.' + who.token] : [])], { origin });
  ws.messages = []; ws.binary = [];
  ws.on('message', (raw, binary) => { if (binary) ws.binary.push(raw); else { try { ws.messages.push(JSON.parse(raw.toString())); } catch {} } });
  sockets.push(ws);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await wait(() => ws.messages.some(m => m.type === 'welcome'));
  return ws;
}
async function wait(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(30); } throw Error('Timed out waiting for relay state.'); }
const send = (ws, data) => ws.send(JSON.stringify(data));
const state = ws => ws.messages.findLast(m => m.type === 'room');
async function refused(game, who, origin) { await assert.rejects(connect(game, code(), who, true, origin)); }
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
try {
  await check('reject missing/invalid/profile-stage credentials, guest sessions and foreign origins', async () => {
    await refused('chess', null); await refused('chess', { token: 'invalid-token-with-sufficient-length' }); await refused('chess', fixtures[10]); await refused('chess', fixtures[9]); await refused('chess', fixtures[0], 'https://untrusted.example');
  });
  await check('Heroes full-account gate applies to host and invitees', async () => {
    await refused('heroes2', fixtures[8]);
    const room = code(); await connect('heroes2', room, fixtures[0], true);
    await assert.rejects(connect('heroes2', room, fixtures[8]));
  });
  await check('uncreated invite cannot be joined', async () => { await assert.rejects(connect('chess', code(), fixtures[1])); });
  let chessHost, chessGuest, chessCode;
  await check('chess seats, basic-account play and host takeover protection', async () => {
    chessCode = code(); chessHost = await connect('chess', chessCode, fixtures[0], true); chessGuest = await connect('chess', chessCode, fixtures[8], true);
    assert.equal(chessHost.messages[0].seat, 0); assert.equal(chessGuest.messages[0].seat, 1);
    await assert.rejects(connect('chess', chessCode, fixtures[2]));
    await wait(() => state(chessHost)?.players.length === 2);
    assert(!JSON.stringify(state(chessHost)).includes(String(fixtures[0].id)));
  });
  await check('chess rejects out-of-turn, illegal and duplicate/stale moves', async () => {
    send(chessGuest, { type: 'move', from: 'e7', to: 'e5', ply: 0 }); send(chessHost, { type: 'move', from: 'e2', to: 'e5', ply: 0 }); await delay(180); assert.equal(state(chessHost).moves.length, 0);
    send(chessHost, { type: 'move', from: 'e2', to: 'e4', ply: 0 }); await wait(() => state(chessGuest).moves.length === 1);
    send(chessGuest, { type: 'move', from: 'e7', to: 'e5', ply: 0 }); await delay(180); assert.equal(state(chessHost).moves.length, 1);
    send(chessGuest, { type: 'move', from: 'e7', to: 'e5', ply: 1 }); await wait(() => state(chessHost).moves.length === 2);
  });
  await check('reconnect restores seats and complete chess state; offline play pauses', async () => {
    chessGuest.close(); await wait(() => !state(chessHost).players[1].online);
    send(chessHost, { type: 'move', from: 'g1', to: 'f3', ply: 2 }); await delay(180); assert.equal(state(chessHost).moves.length, 2);
    chessGuest = await connect('chess', chessCode, fixtures[8]); assert.equal(chessGuest.messages[0].seat, 1); assert.deepEqual(state(chessGuest).moves, ['e4', 'e5']);
    const old = chessHost; chessHost = await connect('chess', chessCode, fixtures[0]); assert.equal(chessHost.messages[0].seat, 0); await wait(() => old.readyState === 3);
  });
  await check('draw agreement is between different players; game locks after result', async () => {
    send(chessHost, { type: 'draw' }); await wait(() => state(chessGuest).draw === 0);
    send(chessHost, { type: 'draw' }); await delay(100); assert.equal(state(chessHost).result, null);
    send(chessGuest, { type: 'draw' }); await wait(() => state(chessHost).result === 'Draw by agreement.');
    send(chessHost, { type: 'move', from: 'g1', to: 'f3', ply: 2 }); await delay(100); assert.equal(state(chessHost).moves.length, 2);
  });
  await check('native chess rules detect checkmate', async () => {
    const room = code(), a = await connect('chess', room, fixtures[0], true), b = await connect('chess', room, fixtures[1]);
    for (const [ply, [from, to]] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']].entries()) { send(ply % 2 ? b : a, { type: 'move', from, to, ply }); await wait(() => state(a).moves.length === ply + 1); }
    assert.equal(state(a).result, 'Black wins by checkmate.');
  });
  await check('Heroes screens and inputs go only to the active seat; six seats maximum', async () => {
    const room = code(); let a = await connect('heroes2', room, fixtures[0], true);
    const b = await connect('heroes2', room, fixtures[1]), c = await connect('heroes2', room, fixtures[2]);
    a.send(Buffer.from('frame')); await delay(100); assert.equal(b.binary.length, 0); assert.equal(c.binary.length, 0);
    send(b, { type: 'control', seat: 1 }); await delay(100); assert.equal(state(a).active, 0);
    send(a, { type: 'control', seat: 1 }); await wait(() => state(b).active === 1);
    a.send(Buffer.from('frame')); await wait(() => b.binary.length === 1); assert.equal(c.binary.length, 0);
    const input = { type: 'input', event: 'down', x: .5, y: .5, button: 0 };
    send(c, input); send(b, { ...input, x: -1 }); await delay(100); assert(!a.messages.some(m => m.type === 'input'));
    send(b, input); await wait(() => a.messages.some(m => m.type === 'input' && m.seat === 1));
    send(b, { type: 'end' }); await delay(100); assert.equal(a.readyState, 1);
    b.close(); await wait(() => state(a).active === 0);
    const again = await connect('heroes2', room, fixtures[1]); assert.equal(again.messages[0].seat, 1);
    send(a, { type: 'control', seat: 1 }); await wait(() => state(again).active === 1);
    a.close(); await wait(() => !state(again).players[0].online && state(again).active === 0);
    a = await connect('heroes2', room, fixtures[0]); assert.equal(a.messages[0].seat, 0);
    for (const f of fixtures.slice(3, 6)) await connect('heroes2', room, f);
    await assert.rejects(connect('heroes2', room, fixtures[6]));
    send(a, { type: 'end' }); await wait(() => again.readyState >= 2);
    await assert.rejects(connect('heroes2', room, fixtures[1]));
  });
  await check('legacy relay still carries existing games without protocol changes', async () => {
    const name = Array.from(randomBytes(4), b => String.fromCharCode(65 + b % 26)).join('');
    const open = async role => {
      const ws = new WebSocket(`ws://127.0.0.1:8810/legacy-test/${name}?role=${role}`, { origin: 'http://127.0.0.1:8811' }); sockets.push(ws); ws.raw = [];
      ws.on('message', raw => ws.raw.push(raw.toString())); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }); return ws;
    };
    const host = await open('host'), guest = await open('guest');
    await wait(() => host.raw.some(m => m.startsWith('+'))); const id = Number(host.raw.find(m => m.startsWith('+')).slice(1));
    guest.send('ping'); await wait(() => host.raw.includes(id + '|ping'));
    host.send(JSON.stringify([[id, 'pong']])); await wait(() => guest.raw.includes('pong'));
  });
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  fs.writeFileSync(path.join(root, '.qa/invite-api-results.json'), JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { for (const ws of sockets) ws.terminate(); }
