// The tenggames.com.au account: one sign-in for the whole site, with profiles like Netflix.
//
//   1. A grown-up signs in (username + password). That gives an *account* session, kept in this browser,
//      which can only list and pick profiles.
//   2. Everyone then picks a profile on "Who's playing?": the grown-up's own or a kid's, each with an optional
//      4-digit (or 4-picture) PIN. That gives the *profile* session the games use.
//   3. "Switch profile" goes back to the picker; "Sign out" ends both on this device.
//
// The profile session lives in the same localStorage keys as before ('evonline.session', 'evonline.tier'),
// because Escape Velocity and the Retro Archive pages read them directly. Don't rename them.
// Tiers: 'basic' (the free games, saves on the device) and 'full' (every game, online saves); a kid has the
// grown-up's tier. Only Justin upgrades accounts, by hand.
//
// The Worker lives in the EV project (Escape Velocity/ev-online/cloud); profiles: Teng Games Accounts/docs/PROFILES.md.
import { avatarEl } from './avatars.js';
// Behind the site gate (after a Cloudflare move) the API is on the site's own domain: build with VITE_TG_API=""
// so sign-in can set the HttpOnly cookie the gate checks. Until then, the workers.dev address.
const LIVE_API = import.meta.env?.VITE_TG_API ?? 'https://ev-online-api.justintengyz.workers.dev';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// ?api= only works when the site itself runs locally, so a link can't send a password somewhere else.
export const API = (LOCAL && new URLSearchParams(location.search).get('api')) || LIVE_API;
const TOKEN_KEY = 'evonline.session', USER_KEY = 'evonline.user', TIER_KEY = 'evonline.tier';
const KIND_KEY = 'tenggames.kind', AVATAR_KEY = 'tenggames.avatar', DEVICE_KEY = 'tenggames.device';
const ACCOUNT_KEY = 'tenggames.account', ACCOUNT_USER_KEY = 'tenggames.account.user';

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } };
const PROFILE_KEYS = [TOKEN_KEY, USER_KEY, TIER_KEY, KIND_KEY, AVATAR_KEY];

export const account = {
  // the profile that is playing
  get token() { return read(TOKEN_KEY); },
  get user() { return read(USER_KEY); },
  get tier() { return read(TIER_KEY) === 'full' ? 'full' : 'basic'; },
  get kind() { return read(KIND_KEY) === 'kid' ? 'kid' : 'parent'; },
  get avatar() { return read(AVATAR_KEY); },
  get signedIn() { return !!this.token; },          // a profile is picked: the site is open
  get full() { return this.signedIn && this.tier === 'full'; },
  get kid() { return this.signedIn && this.kind === 'kid'; },
  // the grown-up's account on this browser (signed in, maybe no profile picked yet)
  get accountToken() { return read(ACCOUNT_KEY); },
  get accountUser() { return read(ACCOUNT_USER_KEY); },
  get hasAccount() { return !!this.accountToken; },
  // Older way for kids: this browser is linked to a family, so the kid picker shows here without a sign-in.
  get device() { return read(DEVICE_KEY); },
  set device(t) { write(DEVICE_KEY, t); },

  remember(j) {
    write(TOKEN_KEY, j.token ?? this.token); write(USER_KEY, j.username); write(TIER_KEY, j.tier === 'full' ? 'full' : 'basic');
    write(KIND_KEY, j.kind === 'kid' ? 'kid' : 'parent'); write(AVATAR_KEY, j.avatar ?? null);
  },
  rememberAccount(j) { write(ACCOUNT_KEY, j.accountToken); write(ACCOUNT_USER_KEY, j.username); this.forgetProfile(); },
  forgetProfile() { for (const k of PROFILE_KEYS) write(k, null); },
  forget() { this.forgetProfile(); write(ACCOUNT_KEY, null); write(ACCOUNT_USER_KEY, null); },

  // as: 'profile' (default), 'account' (the account session) or 'device' (the old linked-device header)
  async req(method, path, body, { as = 'profile' } = {}) {
    let r;
    const headers = { 'Content-Type': 'application/json' };
    const token = as === 'account' ? this.accountToken : as === 'profile' ? this.token : null;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (as === 'device' && this.device) headers['X-Device'] = this.device;
    try { r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw Object.assign(new Error('Can’t reach the server. Check your connection.'), { status: 0 }); }
    let j = {}; try { j = await r.json(); } catch { }
    if (r.status === 401 && !['/api/login', '/api/recover', '/api/signup'].includes(path)) {
      if (as === 'account') this.forget();               // the account session ended: back to sign-in
      else if (as === 'profile') this.forgetProfile();   // the profile ended: back to the picker (if the account is still here)
      else this.device = null;                           // the device was unlinked
    }
    if (!r.ok) throw Object.assign(new Error(j.error ?? `Server error (${r.status}).`), { status: r.status });
    return j;
  },
  async signup(username, password) { const j = await this.req('POST', '/api/signup', { username, password, profiles: true }); this.rememberAccount(j); return j; },
  async login(username, password) { const j = await this.req('POST', '/api/login', { username, password, profiles: true }); this.rememberAccount(j); return j; },
  async recover(username, recovery, password) { const j = await this.req('POST', '/api/recover', { username, recovery, password, profiles: true }); this.rememberAccount(j); return j; },
  // Sign out of the account on this device: every profile picked here ends too.
  async logout() {
    const as = this.signedIn ? 'profile' : this.hasAccount ? 'account' : null;
    if (as) try { await this.req('POST', '/api/logout', null, { as }); } catch { }
    this.forget();
  },
  // The tier can change on the server (an upgrade), so pages check it again when they open.
  async refresh() {
    if (this.signedIn) { const j = await this.req('GET', '/api/me'); this.remember(j); }
    else if (this.hasAccount) await this.req('GET', '/api/me', null, { as: 'account' });
  },

  // profiles
  async profiles() { return (await this.req('GET', '/api/profiles', null, { as: this.hasAccount ? 'account' : 'profile' })).profiles; },
  async selectProfile(id, pin) {
    const j = await this.req('POST', '/api/profiles/select', { id, pin }, { as: 'account' });
    this.remember(j); return j;
  },
  async leaveProfile() {
    if (!this.hasAccount) return this.logout();          // an old linked-device kid session: just end it
    try { await this.req('POST', '/api/profiles/leave'); } catch { }
    this.forgetProfile();
  },
  setProfileLock(password, pin) { return this.req('PUT', '/api/profile-lock', { password, pin }); },

  // families
  family() { return this.req('GET', '/api/family'); },
  addKid(kid) { return this.req('POST', '/api/family/kids', kid); },
  editKid(id, changes) { return this.req('PUT', `/api/family/kids/${id}`, changes); },
  deleteKid(id) { return this.req('DELETE', `/api/family/kids/${id}`); },
  async linkThisDevice(label) { const j = await this.req('POST', '/api/family/devices', { label }); this.device = j.deviceToken; },
  linkCode() { return this.req('POST', '/api/family/link-code'); },
  unlinkDevice(id) { return this.req('DELETE', `/api/family/devices/${id}`); },
  async linkWithCode(code, label) { const j = await this.req('POST', '/api/device/link', { code, label }, { as: 'none' }); this.device = j.deviceToken; },
  async kids() { return (await this.req('GET', '/api/device/kids', null, { as: 'device' })).kids; },
  async kidLogin(kid, pin) { const j = await this.req('POST', '/api/device/kid-login', { kid, pin }, { as: 'device' }); this.remember(j); },
  async setAvatar(avatar) { await this.req('PUT', '/api/me/avatar', { avatar }); write(AVATAR_KEY, avatar); },
};

// A page that needs a picked profile sends everyone else to sign in (and back here afterwards).
// This only steers people in the browser; the real lock is the site gate on the server (docs/PROFILES.md).
export function requireProfile() {
  if (account.signedIn) return true;
  const next = location.pathname + location.search + location.hash;
  location.replace('/account/' + (next && next !== '/' ? '?next=' + encodeURIComponent(next) : ''));
  return false;
}

// The account chip in the site header: "Sign in", or the playing profile's picture and name.
export function mountAccountChip(header) {
  const a = document.createElement('a');
  a.className = 'account-chip';
  a.href = '/account/';
  const draw = () => {
    a.replaceChildren();
    if (!account.signedIn) { a.textContent = account.hasAccount || account.device ? 'Who’s playing?' : 'Sign in'; return; }
    const name = document.createElement('b'); name.textContent = account.user;
    a.append(account.avatar ? avatarEl(account.avatar, 30) : '👤 ', ' ', name);
    if (!account.kid) {
      const tier = document.createElement('span'); tier.className = 'tier ' + account.tier; tier.textContent = account.full ? 'Full' : 'Basic';
      a.append(' ', tier);
    }
  };
  draw();
  header.append(a);
  account.refresh().then(draw, draw);
}
