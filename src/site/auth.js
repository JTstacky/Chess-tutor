// The tenggames.com.au account: one sign-in for the whole site. Escape Velocity's pilot screen and the Retro
// Archive use the same session (same localStorage keys, same Worker), so signing in anywhere signs in everywhere.
//
// Tiers: 'basic' (every new sign-up: the free games, saves stay on the device) and 'full' (every game, including
// the private archive, with saves synced to every device). Only Justin upgrades accounts, by hand.
// Families: a grown-up account manages kid profiles; kids sign in on a linked device with their picture and an
// optional PIN. A kid has the parent's tier. (Escape Velocity/ev-online/docs/family-accounts.md)
//
// The Worker lives in the EV project (Escape Velocity/ev-online/cloud, docs/cloud.md there).
import { avatarEl } from './avatars.js';
const LIVE_API = 'https://ev-online-api.justintengyz.workers.dev';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// ?api= only works when the site itself runs locally, so a link can't send a password somewhere else.
export const API = (LOCAL && new URLSearchParams(location.search).get('api')) || LIVE_API;
const TOKEN_KEY = 'evonline.session', USER_KEY = 'evonline.user', TIER_KEY = 'evonline.tier';
const KIND_KEY = 'tenggames.kind', AVATAR_KEY = 'tenggames.avatar', DEVICE_KEY = 'tenggames.device';

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } };

export const account = {
  get token() { return read(TOKEN_KEY); },
  get user() { return read(USER_KEY); },
  get tier() { return read(TIER_KEY) === 'full' ? 'full' : 'basic'; },
  get kind() { return read(KIND_KEY) === 'kid' ? 'kid' : 'parent'; },
  get avatar() { return read(AVATAR_KEY); },
  get signedIn() { return !!this.token; },
  get full() { return this.signedIn && this.tier === 'full'; },
  get kid() { return this.signedIn && this.kind === 'kid'; },
  // This browser is linked to a family, so the kid picker shows here.
  get device() { return read(DEVICE_KEY); },
  set device(t) { write(DEVICE_KEY, t); },

  remember(j) {
    write(TOKEN_KEY, j.token ?? this.token); write(USER_KEY, j.username); write(TIER_KEY, j.tier === 'full' ? 'full' : 'basic');
    write(KIND_KEY, j.kind === 'kid' ? 'kid' : 'parent'); write(AVATAR_KEY, j.avatar ?? null);
  },
  forget() { for (const k of [TOKEN_KEY, USER_KEY, TIER_KEY, KIND_KEY, AVATAR_KEY]) write(k, null); },

  async req(method, path, body, { device = false } = {}) {
    let r;
    const token = this.token, headers = { 'Content-Type': 'application/json' };
    if (token && !device) headers.Authorization = 'Bearer ' + token;
    if (device && this.device) headers['X-Device'] = this.device;
    try { r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw Object.assign(new Error('Can’t reach the server. Check your connection.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch { }
    if (r.status === 401 && !device && path !== '/api/login' && path !== '/api/recover') this.forget();
    if (r.status === 401 && device) this.device = null;     // the device was unlinked
    if (!r.ok) throw Object.assign(new Error(j.error ?? `Server error (${r.status}).`), { status: r.status });
    return j;
  },
  async signup(username, password) { const j = await this.req('POST', '/api/signup', { username, password }); this.remember(j); return j.recovery; },
  async login(username, password) { const j = await this.req('POST', '/api/login', { username, password }); this.remember(j); },
  async recover(username, recovery, password) { const j = await this.req('POST', '/api/recover', { username, recovery, password }); this.remember(j); return j.recovery; },
  async logout() { try { await this.req('POST', '/api/logout'); } catch { } this.forget(); },
  // The tier can change on the server (an upgrade), so pages check it again when they open.
  async refresh() { if (!this.signedIn) return; const j = await this.req('GET', '/api/me'); this.remember(j); },

  // families
  family() { return this.req('GET', '/api/family'); },
  addKid(kid) { return this.req('POST', '/api/family/kids', kid); },
  editKid(id, changes) { return this.req('PUT', `/api/family/kids/${id}`, changes); },
  deleteKid(id) { return this.req('DELETE', `/api/family/kids/${id}`); },
  async linkThisDevice(label) { const j = await this.req('POST', '/api/family/devices', { label }); this.device = j.deviceToken; },
  linkCode() { return this.req('POST', '/api/family/link-code'); },
  unlinkDevice(id) { return this.req('DELETE', `/api/family/devices/${id}`); },
  async linkWithCode(code, label) { const j = await this.req('POST', '/api/device/link', { code, label }); this.device = j.deviceToken; },
  async kids() { return (await this.req('GET', '/api/device/kids', null, { device: true })).kids; },
  async kidLogin(kid, pin) { const j = await this.req('POST', '/api/device/kid-login', { kid, pin }, { device: true }); this.remember(j); },
  async setAvatar(avatar) { await this.req('PUT', '/api/me/avatar', { avatar }); write(AVATAR_KEY, avatar); },
};

// The account chip in the site header: "Sign in", or the name (with a kid's picture) and tier.
export function mountAccountChip(header) {
  const a = document.createElement('a');
  a.className = 'account-chip';
  a.href = '/account/';
  const draw = () => {
    a.replaceChildren();
    if (!account.signedIn) { a.textContent = account.device ? 'Who’s playing?' : 'Sign in'; return; }
    const name = document.createElement('b'); name.textContent = account.user;
    if (account.kid && account.avatar) a.append(avatarEl(account.avatar, 30), ' ', name);
    else {
      const tier = document.createElement('span'); tier.className = 'tier ' + account.tier; tier.textContent = account.full ? 'Full' : 'Basic';
      a.append('👤 ', name, ' ', tier);
    }
  };
  draw();
  header.append(a);
  account.refresh().then(draw, draw);
}
