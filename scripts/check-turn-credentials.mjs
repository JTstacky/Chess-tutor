// LOCAL check for GET /turn (relay/src/turn.js). Run the relay with
// --var TURN_KEY_ID:test-key --var TURN_KEY_API_TOKEN:test-token --var TURN_API_BASE:http://127.0.0.1:8816
// and a mock credential API on 8816. No production calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const f = JSON.parse(fs.readFileSync(new URL('../.qa/invite-fixtures.json', import.meta.url)));
const url = 'http://127.0.0.1:8810/turn', origin = 'http://127.0.0.1:8814';
const get = (headers = {}) => fetch(url, { headers: { Origin: origin, ...headers } });
async function check(name, run) { await run(); console.log('PASS ' + name); }
await check('other sites are refused', async () => { assert.equal((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status, 403); });
await check('CORS preflight is answered for the site', async () => { const r = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } }); assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), origin); });
await check('no credentials without a signed-in profile', async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await get({ Authorization: 'Bearer ' + 'x'.repeat(40) })).status, 401);
  assert.equal((await get({ Authorization: 'Bearer ' + f[10].token })).status, 403, 'account stage without a profile');
});
let first;
await check('a signed-in profile gets TURN servers; browser-blocked port 53 is removed', async () => {
  const r = await get({ Authorization: 'Bearer ' + f[0].token }); assert.equal(r.status, 200); first = await r.json();
  const urls = first.iceServers.flatMap(s => s.urls);
  assert(urls.includes('turns:turn.cloudflare.com:443?transport=tcp')); assert(!urls.some(u => /:53(\?|$)/.test(u))); assert(first.ttl > 3600);
});
await check('credentials are cached per profile, new ones for another profile', async () => {
  const calls = Number(await (await fetch('http://127.0.0.1:8816/calls')).text());
  const again = await (await get({ Authorization: 'Bearer ' + f[0].token })).json();
  assert.deepEqual(again.iceServers, first.iceServers);
  const other = await (await get({ Authorization: 'Bearer ' + f[1].token })).json();
  assert.notDeepEqual(other.iceServers, first.iceServers);
  assert.equal(Number(await (await fetch('http://127.0.0.1:8816/calls')).text()), calls + 1);
});
