// The tenggames.com.au account: one sign-in for the whole site. Escape Velocity's pilot screen and the Retro
// Archive use the same session (same localStorage keys, same Worker), so signing in anywhere signs in everywhere.
//
// Tiers: 'basic' (every new sign-up: the free games, saves stay on the device) and 'full' (every game, including
// the private archive, with saves synced to every device). Only Justin upgrades accounts, by hand.
//
// The Worker lives in the EV project (Escape Velocity/ev-online/cloud, docs/cloud.md there).
const LIVE_API = 'https://ev-online-api.justintengyz.workers.dev';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// ?api= only works when the site itself runs locally, so a link can't send a password somewhere else.
export const API = (LOCAL && new URLSearchParams(location.search).get('api')) || LIVE_API;
const TOKEN_KEY = 'evonline.session', USER_KEY = 'evonline.user', TIER_KEY = 'evonline.tier';

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } };

export const account = {
  get token() { return read(TOKEN_KEY); },
  get user() { return read(USER_KEY); },
  get tier() { return read(TIER_KEY) === 'full' ? 'full' : 'basic'; },
  get signedIn() { return !!this.token; },
  get full() { return this.signedIn && this.tier === 'full'; },

  remember(token, user, tier) { write(TOKEN_KEY, token); write(USER_KEY, user); write(TIER_KEY, tier === 'full' ? 'full' : 'basic'); },
  forget() { write(TOKEN_KEY, null); write(USER_KEY, null); write(TIER_KEY, null); },

  async req(method, path, body) {
    let r;
    const token = this.token;
    try {
      r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw new Error('Can’t reach the server. Check your connection.'); }
    let j = {}; try { j = await r.json(); } catch { }
    if (r.status === 401 && path !== '/api/login' && path !== '/api/recover') this.forget();
    if (!r.ok) throw new Error(j.error ?? `Server error (${r.status}).`);
    return j;
  },
  async signup(username, password) { const j = await this.req('POST', '/api/signup', { username, password }); this.remember(j.token, j.username, j.tier); return j.recovery; },
  async login(username, password) { const j = await this.req('POST', '/api/login', { username, password }); this.remember(j.token, j.username, j.tier); },
  async recover(username, recovery, password) { const j = await this.req('POST', '/api/recover', { username, recovery, password }); this.remember(j.token, j.username, j.tier); return j.recovery; },
  async logout() { try { await this.req('POST', '/api/logout'); } catch { } this.forget(); },
  // The tier can change on the server (an upgrade), so pages check it again when they open.
  async refresh() { if (!this.signedIn) return; const j = await this.req('GET', '/api/me'); this.remember(this.token, j.username, j.tier); },
};

// The account chip in the site header: "Sign in", or the username and tier, linking to the account page.
export function mountAccountChip(header) {
  const a = document.createElement('a');
  a.className = 'account-chip';
  a.href = '/account/';
  const draw = () => {
    a.replaceChildren();
    if (!account.signedIn) { a.textContent = 'Sign in'; return; }
    const name = document.createElement('b'); name.textContent = account.user;
    const tier = document.createElement('span'); tier.className = 'tier ' + account.tier; tier.textContent = account.full ? 'Full' : 'Basic';
    a.append('👤 ', name, ' ', tier);
  };
  draw();
  header.append(a);
  account.refresh().then(draw, draw);
}
