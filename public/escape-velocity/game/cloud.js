// Online accounts and pilot saves (docs/cloud.md): the client of cloud/src/index.js.
// CloudSaves has the same list/get/put/remove/last interface as the local Saves (main.js), over a cache of
// the account's pilots for this game, so the rest of the game doesn't care where a pilot lives. put() updates
// the cache at once and uploads in the background, one request at a time per pilot, newest sheet wins.
//
// The session token is kept in localStorage and sent as a Bearer header. (docs/mmo-accounts.md planned an
// httpOnly cookie, but the API is on a different site from the game, where browsers block such cookies.)

// The Worker's address. ?api=<url> overrides it only when the game itself runs locally, so a link can't send
// a player's password somewhere else.
const LIVE_API = 'https://ev-online-api.justintengyz.workers.dev';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = (LOCAL && new URLSearchParams(location.search).get('api')) || LIVE_API;
// One account for the whole of tenggames.com.au: the site's account page and the Retro Archive use these keys too.
const TOKEN_KEY = 'evonline.session', USER_KEY = 'evonline.user', TIER_KEY = 'evonline.tier';

export class CloudError extends Error { constructor(status, message) { super(message); this.status = status; } }

export class CloudSaves {
  constructor(game) {
    this.game = game; this.online = true;
    this.pilots = new Map();      // name -> { id, rev, data, saving, dirty }
    this.lastKey = `evonline.${game}.cloudLast`;
    this.status = '';             // shown in the pilot panel
    this.onConflict = null;       // (name) => void: another device saved this pilot since we loaded it
    try { this.token = localStorage.getItem(TOKEN_KEY); this.user = localStorage.getItem(USER_KEY); this.tier = localStorage.getItem(TIER_KEY) ?? 'basic'; } catch { }
    addEventListener('pagehide', () => this.flushNow());
  }
  get signedIn() { return !!this.token; }
  // Online pilots are for full accounts. A basic account (every new sign-up, until Justin upgrades it) keeps
  // its pilots in this browser, like playing signed out.
  get full() { return this.signedIn && this.tier === 'full'; }
  // The tier can change on the server at any time (an upgrade), so it is checked again on start.
  async refreshTier() { const j = await this.req('GET', '/api/me'); this.remember(this.token, j.username, j.tier); }

  async req(method, path, body) {
    let r;
    try {
      r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw new CloudError(0, 'Can’t reach the server. Check your connection.'); }
    let j = {}; try { j = await r.json(); } catch { }
    if (r.status === 401 && path !== '/api/login' && path !== '/api/recover') this.forget();
    if (!r.ok) { const e = new CloudError(r.status, j.error ?? `Server error (${r.status}).`); e.body = j; throw e; }
    return j;
  }
  remember(token, user, tier = 'basic') {
    this.token = token; this.user = user; this.tier = tier === 'full' ? 'full' : 'basic';
    try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, user); localStorage.setItem(TIER_KEY, this.tier); } catch { }
  }
  forget() {
    this.token = null; this.user = null; this.tier = 'basic'; this.pilots.clear();
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(TIER_KEY); } catch { }
  }

  async signup(username, password) { const j = await this.req('POST', '/api/signup', { username, password }); this.remember(j.token, j.username, j.tier); if (this.full) await this.load(); return j.recovery; }
  async login(username, password) { const j = await this.req('POST', '/api/login', { username, password }); this.remember(j.token, j.username, j.tier); if (this.full) await this.load(); }
  async recover(username, recovery, password) { const j = await this.req('POST', '/api/recover', { username, recovery, password }); this.remember(j.token, j.username, j.tier); if (this.full) await this.load(); return j.recovery; }
  async logout() { await this.flush(); try { await this.req('POST', '/api/logout'); } catch { } this.forget(); }

  async load() {
    const j = await this.req('GET', `/api/pilots?game=${this.game}`);
    this.pilots = new Map(j.pilots.map(p => [p.name, { id: p.id, rev: p.rev, data: { ...p.data, savedAt: p.saved_at } }]));
    this.used = j.used; this.max = j.max; this.status = '';
  }

  // the Saves interface
  list() { return [...this.pilots.values()].map(p => p.data).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)); }
  get(name) { const p = this.pilots.get(name); return p ? structuredClone(p.data) : null; }
  last() { try { return this.get(localStorage.getItem(this.lastKey)) ?? this.list()[0] ?? null; } catch { return this.list()[0] ?? null; } }
  put(sheet) {
    const p = this.pilots.get(sheet.name); if (!p || p.conflict) return;
    p.data = { ...sheet, savedAt: Date.now() }; p.dirty = true;
    try { localStorage.setItem(this.lastKey, sheet.name); } catch { }
    this.upload(p);
  }
  async remove(name) {
    const p = this.pilots.get(name); if (!p) return;
    this.pilots.delete(name);
    try { await this.req('DELETE', `/api/pilots/${p.id}`); this.used = Math.max(0, (this.used ?? 1) - 1); } catch (e) { this.status = e.message; }
  }
  // A new pilot is created on the server first, so a taken name or a full account is refused before play.
  async create(sheet) {
    const j = await this.req('POST', '/api/pilots', { game: this.game, data: sheet });
    this.pilots.set(sheet.name, { id: j.id, rev: j.rev, data: { ...sheet, savedAt: Date.now() } });
    this.used = (this.used ?? 0) + 1;
    try { localStorage.setItem(this.lastKey, sheet.name); } catch { }
  }

  async upload(p) {
    if (p.saving || !p.dirty) return;
    p.saving = true; p.dirty = false;
    const { savedAt, ...data } = p.data;
    try {
      const j = await this.req('PUT', `/api/pilots/${p.id}`, { rev: p.rev, data });
      p.rev = j.rev; this.status = '';
    } catch (e) {
      if (e.status === 409) { p.conflict = true; p.rev = e.body.rev; p.data = { ...e.body.data, savedAt: Date.now() }; this.onConflict?.(data.name); }
      else if (e.status !== 401) { p.dirty = true; this.status = 'Not saved online yet: ' + e.message; setTimeout(() => this.upload(p), 30e3); }
    } finally { p.saving = false; }
    if (p.dirty && !p.conflict) this.upload(p);
  }
  async flush() { for (const p of this.pilots.values()) { while (p.saving) await new Promise(r => setTimeout(r, 50)); if (p.dirty) await this.upload(p); } }
  // On leaving the page: the newest unsent sheet goes out with keepalive, which outlives the page.
  flushNow() {
    for (const p of this.pilots.values()) {
      if (!p.dirty || p.conflict || !this.token) continue;
      const { savedAt, ...data } = p.data;
      try { fetch(API + `/api/pilots/${p.id}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token }, body: JSON.stringify({ rev: p.rev, data }) }); } catch { }
    }
  }
}
