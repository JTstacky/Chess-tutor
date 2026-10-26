import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function waitingRoom(budgetLimited = false) {
  let alarm = null, attempts = 0;
  const pending = [], sockets = [{ readyState: 1, deserializeAttachment: () => ({ seat: 0 }) }];
  const room = { id: 'a'.repeat(32), game: 'heroes2', players: [1], ended: false };
  const ctx = { storage: { get: async () => room, put: async () => {}, setAlarm: async at => { alarm = at; }, deleteAlarm: async () => { alarm = null; } },
    blockConcurrencyWhile: fn => fn(), setWebSocketAutoResponse() {}, getWebSockets: () => sockets, waitUntil: promise => pending.push(promise) };
  const env = { HEROES_SERVICE_TOKEN: 'fixture-only', HEROES_SERVER: { fetch: async () => { attempts++; return budgetLimited ? Response.json({ budgetLimited: true, retryAt: Date.now() + 86400000 }, { status: 402 }) : new Response(null, { status: 503 }); } },
    HEROES_JOBS: { idFromName: n => n, get: () => ({ fetch: async () => Response.json({ ok: true }) }) } };
  class DurableObject { constructor(ctx) { this.ctx = ctx; } }
  const context = vm.createContext({ DurableObject, Request, Response, Headers, URL, AbortSignal, WebSocketRequestResponsePair: class {} });
  const source = fs.readFileSync(new URL('../src/persistent-invites.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
  vm.runInContext(source + '\nglobalThis.InviteRoom = InviteRoom;', context);
  const instance = new context.InviteRoom(ctx, env);
  return { instance, sockets, pending, alarm: () => alarm, attempts: () => attempts };
}

test('failed cold start retries after an alarm while a player waits', async () => {
  const f = waitingRoom(); await f.instance.job(); await Promise.all(f.pending);
  assert.equal(f.attempts(), 1); assert.ok(f.alarm() > Date.now());
  await f.instance.alarm(); await Promise.all(f.pending);
  assert.equal(f.attempts(), 2); assert.ok(f.alarm() > Date.now());
});

test('exhausted runtime allowance stops wake retries and informs players without deleting saves', async () => {
  const f = waitingRoom(true); await f.instance.job(); await Promise.all(f.pending);
  assert.equal(f.attempts(), 1); assert.ok(f.instance.state().runtimeRetryAt > Date.now());
  assert.equal(f.alarm(), f.instance.room.runtimeRetryAt);
  await f.instance.alarm(); await Promise.all(f.pending); assert.equal(f.attempts(), 1);
  f.instance.room.runtimeRetryAt = Date.now() - 1;
  await f.instance.alarm(); await Promise.all(f.pending); assert.equal(f.attempts(), 2);
  assert.equal(f.instance.room.id, 'a'.repeat(32));
});

test('native connection or last player leaving ends wake retries without deleting the game', async () => {
  for (const connected of [true, false]) {
    const f = waitingRoom(); await f.instance.job();
    if (connected) f.sockets.push({ readyState: 1, deserializeAttachment: () => ({ service: true }) });
    else f.sockets.length = 0;
    await f.instance.alarm(); await Promise.all(f.pending);
    assert.equal(f.attempts(), 1); assert.equal(f.alarm(), null);
    assert.equal(f.instance.room.id, 'a'.repeat(32));
  }
});
