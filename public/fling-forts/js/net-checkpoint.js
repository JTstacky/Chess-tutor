// Recovery is opt-in in the site's relay.json. Never send account credentials to a query override.
export const RECOVERY_PATH = '/checkpoints/v1/tenggames-fling-forts/';
export const CHECKPOINT_RULES = 'fling-forts-1';
let configPromise;
export function recoveryConfig() {
  if (!configPromise) configPromise = (async () => {
    if (new URLSearchParams(location.search).has('relay')) return null;
    try {
      const r = await fetch('/relay.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const c = await r.json(), u = new URL(c.url);
      const local = location.hostname === '127.0.0.1' && u.hostname === '127.0.0.1';
      if (c.checkpoints !== 1 || !(u.protocol === 'wss:' || local && u.protocol === 'ws:') || u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
      return { ws: u.origin, http: u.origin.replace(/^ws/, 'http') };
    } catch { return null; }
  })();
  return configPromise;
}
export function recoverySession() { try { return localStorage.getItem('evonline.session'); } catch { return null; } }
export async function claimRoom(config, code, mode) {
  const token = recoverySession();
  if (!token) throw Error('Sign in to the same player profile to save or recover a room.');
  const res = await fetch(`${config.http}${RECOVERY_PATH}${code}/claim`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  const result = await res.json();
  if (!res.ok) { const e = Error(result.error || 'Room recovery failed.'); e.status = res.status; throw e; }
  if (!/^[a-f0-9]{64}$/.test(result.ticket || '') || result.code !== code || result.leaseMs !== 20000 || result.saveMs !== 5000 ||
      result.resume && result.resume.rules !== CHECKPOINT_RULES) throw Error('The saved room needs a different game version.');
  return result;
}
