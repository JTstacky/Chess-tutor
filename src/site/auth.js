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
// The playing profile's id ('guest' for guests). /tg-profile.js keeps each profile's game data apart by it, and
// the Retro Archive keys its local saves by it. Don't rename it.
const PROFILE_KEY = 'tenggames.profileId';
// /tg-profile.js (loaded first on every page) puts each profile's game data in place; absent if storage is blocked.
const vault = () => window.TGProfile;

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } };
const PROFILE_KEYS = [TOKEN_KEY, USER_KEY, TIER_KEY, KIND_KEY, AVATAR_KEY, PROFILE_KEY];

export const account = {
  // the profile that is playing
  get token() { return read(TOKEN_KEY); },
  get user() { return read(USER_KEY); },
  get tier() { const t = read(TIER_KEY); return t === 'full' || t === 'guest' ? t : 'basic'; },
  get kind() { const k = read(KIND_KEY); return k === 'kid' || k === 'guest' ? k : 'parent'; },
  get guest() { return this.signedIn && this.kind === 'guest'; },
  get profileId() { return read(PROFILE_KEY); },
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
    write(TOKEN_KEY, j.token ?? this.token); write(USER_KEY, j.username);
    write(TIER_KEY, j.tier === 'full' || j.tier === 'guest' ? j.tier : 'basic');
    write(KIND_KEY, j.kind === 'kid' || j.kind === 'guest' ? j.kind : 'parent'); write(AVATAR_KEY, j.avatar ?? null);
    if (j.kind === 'guest') write(PROFILE_KEY, 'guest'); else if (j.id != null) write(PROFILE_KEY, String(j.id));
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
    try { await vault()?.signOut(); } catch { }        // back up this profile's games, leave none behind
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
    await this.flush();
    const j = await this.req('POST', '/api/profiles/select', { id, pin }, { as: 'account' });
    this.remember(j); await this.arrive(); return j;
  },
  // Play as a guest: no account, no saves, the free games only.
  async guestLogin() { await this.flush(); const j = await this.req('POST', '/api/guest', null, { as: 'none' }); this.remember(j); await this.arrive(); return j; },
  // before leaving a profile: back its games up online
  async flush() { if (this.signedIn && !this.guest) try { await vault()?.syncUp(); } catch { } },
  // after picking one: its games on this device, then the newest online copy
  async arrive() { const v = vault(); if (!v) return; v.switchTo(this.profileId ?? ''); try { await v.syncDown(); } catch { } },
  async leaveProfile() {
    if (!this.hasAccount && !this.device) return this.logout();   // a guest or old-style sign-in: just end it
    await this.flush();
    if (this.hasAccount) { try { await this.req('POST', '/api/profiles/leave'); } catch { } }
    else { try { await this.req('POST', '/api/logout'); } catch { } }   // an old linked-device kid session
    this.forgetProfile(); vault()?.switchTo('');
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
  async kidLogin(kid, pin) { await this.flush(); const j = await this.req('POST', '/api/device/kid-login', { kid, pin }, { as: 'device' }); this.remember(j); await this.arrive(); },
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
    if (account.guest) { a.append(' '); const t = document.createElement('span'); t.className = 'tier basic'; t.textContent = 'Guest'; a.append(t); return; }
    if (!account.kid) {
      const tier = document.createElement('span'); tier.className = 'tier ' + account.tier; tier.textContent = account.full ? 'Full' : 'Basic';
      a.append(' ', tier);
    }
  };
  draw();
  header.append(a);
  account.refresh().then(draw, draw);
}
