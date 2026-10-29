// GET /turn: short-lived Cloudflare TURN credentials for the real-time games.
//
// Players who can't connect directly (mobile data, school or office wifi)
// relay through turn.cloudflare.com, which runs in the nearest Cloudflare data
// centre (Perth for Perth players) instead of overseas free relays.
// Needs two Worker secrets from the Cloudflare dashboard (Realtime > TURN):
//   TURN_KEY_ID, TURN_KEY_API_TOKEN
// Without them it returns no servers and games use direct connections plus
// the Durable Object relay, as before. Only signed-in profiles on allowed
// pages get credentials, so strangers can't spend the TURN allowance.
const TTL = 4 * 60 * 60; // a long session; credentials are also cached per profile
const cache = new Map(); // profile id -> { at, iceServers }

function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store' };
}
function reply(origin, status, value) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });
}

export async function turnRequest(req, env) {
  const origin = req.headers.get('Origin'), origins = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  if (!origin || !origins.some(o => origin === o || (/^http:\/\/(localhost|127\.0\.0\.1)$/.test(o) && origin.startsWith(o + ':')))) return new Response('Origin not allowed', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'GET') return reply(origin, 405, { error: 'GET only.' });
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token || !/^[a-zA-Z0-9._-]{20,300}$/.test(token)) return reply(origin, 401, { error: 'Pick a profile first.' });
  let me;
  try {
    const request = new Request((env.ACCOUNTS_API || 'https://ev-online-api.justintengyz.workers.dev') + '/api/me', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
    const r = env.ACCOUNTS && !env.ACCOUNTS_API ? await env.ACCOUNTS.fetch(request) : await fetch(request);
    if (!r.ok) return reply(origin, 401, { error: 'Sign in again.' });
    me = await r.json();
  } catch { return reply(origin, 503, { error: 'Sign-in service unavailable.' }); }
  if (me.stage !== 'profile' || !Number.isSafeInteger(me.id)) return reply(origin, 403, { error: 'Choose a profile.' });
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return reply(origin, 200, { iceServers: [], ttl: 0 });
  const hit = cache.get(me.id);
  if (hit && Date.now() - hit.at < (TTL - 3600) * 1000) return reply(origin, 200, { iceServers: hit.iceServers, ttl: TTL - Math.round((Date.now() - hit.at) / 1000) });
  try {
    const r = await fetch(`${env.TURN_API_BASE || 'https://rtc.live.cloudflare.com'}/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: TTL }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return reply(origin, 200, { iceServers: [], ttl: 0 });
    const list = (await r.json()).iceServers;
    // Browsers refuse port 53, so drop those addresses.
    const iceServers = (Array.isArray(list) ? list : [list]).filter(Boolean).map(s => ({ ...s, urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
    if (cache.size > 5000) cache.clear();
    cache.set(me.id, { at: Date.now(), iceServers });
    return reply(origin, 200, { iceServers, ttl: TTL });
  } catch { return reply(origin, 200, { iceServers: [], ttl: 0 }); }
}
