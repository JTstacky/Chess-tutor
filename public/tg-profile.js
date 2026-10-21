// Teng Games profiles: each profile's game progress, on every page of the site.
// Load it FIRST in <head>, as a plain script:  <script src="/tg-profile.js"></script>
// (Teng Games Accounts/docs/PROFILES.md)
//
// 1. No profile picked yet: the page is hidden and the visitor goes to /account/ to sign in (then comes back).
// 2. Every game on the site keeps its progress in localStorage, which one browser shares between everyone. This
//    keeps it per profile: when the playing profile changes, the last profile's game data is put aside on this
//    device and the new profile's is put back, before the game's own scripts run.
// 3. Each profile's game data is also backed up online (one gzipped copy per profile), so it follows the
//    profile to every device. Newest copy wins. Guests save nothing: their data is wiped when they leave.
// Site keys (evonline.*, tenggames.*, tg.*) are never touched.
(function () {
  'use strict';
  var API = 'https://ev-online-api.justintengyz.workers.dev';
  var SITE_KEY = /^(evonline\.|tenggames\.|tg\.)/;
  var OWNER = 'tg.owner', META = 'tg.sync', STASH = 'tg.vault.';
  var ls;
  try { ls = window.localStorage; ls.getItem(OWNER); } catch (e) { return; }   // storage blocked: nothing to keep apart

  var get = function (k) { try { return ls.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { if (v == null) ls.removeItem(k); else ls.setItem(k, v); return true; } catch (e) { return false; } };
  var token = function () { return get('evonline.session'); };
  var current = function () { return token() ? (get('tenggames.profileId') || '') : ''; };

  function gameKeys() {
    var out = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k != null && !SITE_KEY.test(k)) out.push(k); }
    return out;
  }
  function snapshot() {
    var o = {}, ks = gameKeys().sort();
    for (var i = 0; i < ks.length; i++) o[ks[i]] = get(ks[i]);
    return o;
  }
  function clearGames() { var ks = gameKeys(); for (var i = 0; i < ks.length; i++) set(ks[i], null); }
  function load(o) { for (var k in o) if (!SITE_KEY.test(k)) set(k, o[k]); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }
  function meta() { try { return JSON.parse(get(META)) || {}; } catch (e) { return {}; } }
  function stash(owner) {
    var data = JSON.stringify({ data: snapshot(), meta: meta() });
    if (!set(STASH + owner, data)) set(STASH + owner, null);   // full: the online copy still has it
  }
  function unstash(owner) {
    var s = null; try { s = JSON.parse(get(STASH + owner)); } catch (e) { }
    set(STASH + owner, null);
    return s;
  }

  // Make the game data on this device belong to 'next' ('' = nobody signed in, 'guest', or a profile id).
  function switchTo(next) {
    var owner = get(OWNER);
    if (owner === next) return;
    if (owner === null) { if (gameKeys().length) stash('legacy'); }      // progress from before profiles
    else if (owner && owner !== 'guest') stash(owner);                    // put the last profile's games aside
    clearGames(); set(META, null);                                        // guests keep nothing
    if (next && next !== 'guest') {
      var mine = unstash(next);
      if (mine) { load(mine.data); set(META, JSON.stringify(mine.meta || {})); }
      var legacy = unstash('legacy');                                     // the first profile picked here adopts it
      if (legacy) for (var k in legacy.data) if (get(k) === null) set(k, legacy.data[k]);
    }
    set(OWNER, next);
  }

  function req(method, path, body, headers) {
    var h = headers || {}; h.Authorization = 'Bearer ' + token();
    return fetch(API + path, { method: method, headers: h, body: body, keepalive: !!(body && body.byteLength < 60000) });
  }
  async function gzip(text) {
    var s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function gunzip(buf) {
    var s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(s).text();
  }
  var canSync = function () { var p = current(); return !!p && p !== 'guest' && get(OWNER) === p && typeof CompressionStream === 'function'; };
  function state() { var text = JSON.stringify(snapshot()), m = meta(); return { text: text, h: hash(text), m: m, dirty: m.hash !== hash(text) }; }

  // Upload this profile's games if they changed since the last sync.
  async function up() {
    if (!canSync()) return 'off';
    var s = state();
    if (!s.dirty) return 'same';
    var r = await req('PUT', '/api/state', await gzip(s.text), { 'Content-Type': 'application/octet-stream', 'X-Rev': String(s.m.rev || 0) });
    if (r.status === 409) return down();          // saved somewhere else since: sort it out, then try again
    if (!r.ok) return 'off';
    var j = await r.json();
    set(META, JSON.stringify({ rev: j.rev, hash: s.h }));
    return 'saved';
  }
  // Fetch the online copy. The newer of it and this device's copy wins. Returns 'applied' when the games' data
  // on this device changed.
  async function down() {
    if (!canSync()) return 'off';
    var r = await req('GET', '/api/state');
    if (!r.ok && r.status !== 204) return 'off';
    var rev = +(r.headers.get('X-Rev') || 0), at = +(r.headers.get('X-Saved-At') || 0), s = state();
    if (rev === (s.m.rev || 0)) return s.dirty ? up() : 'same';
    var server = r.status === 204 ? {} : JSON.parse(await gunzip(new Uint8Array(await r.arrayBuffer())));
    if (!s.m.rev && s.dirty) {
      // the first sync of this profile on this device: keep the games only this device has, then upload
      var local = JSON.parse(s.text);
      for (var k in local) if (!(k in server)) server[k] = local[k];
      clearGames(); load(server);
      set(META, JSON.stringify({ rev: rev, hash: 'merged' }));
      await up();
      return 'applied';
    }
    if (!s.dirty || (s.m.changed || 0) <= at) {     // the online copy is newer
      clearGames(); load(server);
      set(META, JSON.stringify({ rev: rev, hash: hash(JSON.stringify(snapshot())) }));
      return 'applied';
    }
    set(META, JSON.stringify({ rev: rev, hash: 'local-newer', changed: s.m.changed }));   // this device is newer
    return up();
  }
  // one sync at a time
  var busy = null;
  function once(fn) { if (!busy) busy = fn().finally(function () { busy = null; }); return busy; }
  var syncUp = function () { return once(up); }, syncDown = function () { return once(down); };

  // Note when the games first changed after the last sync, so the newer copy wins a conflict.
  function noteChange() { var s = state(); if (s.dirty && !s.m.changed) { s.m.changed = Date.now(); set(META, JSON.stringify(s.m)); } }

  window.TGProfile = {
    switchTo: switchTo, syncUp: syncUp, syncDown: syncDown,
    owner: function () { return get(OWNER); },
    // signing out of a device: back up, then leave nobody's games behind
    signOut: async function () {
      try { await syncUp(); } catch (e) { }
      clearGames(); set(META, null); set(OWNER, '');
      for (var i = ls.length - 1; i >= 0; i--) { var k = ls.key(i); if (k && k.indexOf(STASH) === 0) set(k, null); }
    },
  };

  // ---- on every page ----
  var onAccount = /^\/account(\/|$)/.test(location.pathname);
  if (!token() && !onAccount) {
    document.documentElement.style.visibility = 'hidden';
    var next = location.pathname + location.search + location.hash;
    location.replace('/account/' + (next && next !== '/' ? '?next=' + encodeURIComponent(next) : ''));
    return;
  }
  if (onAccount) return;               // the account page drives switching itself
  switchTo(current());
  if (!canSync()) return;
  syncDown().then(function (r) {
    // another device saved newer progress: start the game again with it (once)
    if (r === 'applied' && !sessionStorage.getItem('tg.reloaded')) { sessionStorage.setItem('tg.reloaded', '1'); location.reload(); }
  }, function () { });
  setInterval(function () { noteChange(); syncUp().catch(function () { }); }, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { noteChange(); syncUp().catch(function () { }); } });
  addEventListener('pagehide', function () { noteChange(); syncUp().catch(function () { }); });
})();
