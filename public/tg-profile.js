// Teng Games profiles: each profile's game progress, on every page of the site.
// Load it FIRST in <head>, as a plain script:  <script src="/tg-profile.js"></script>
// (Teng Games Accounts/docs/PROFILES.md)
//
// Every game on the site keeps its progress in localStorage, which one browser shares between everyone. So:
// 1. No sign-in: the page is hidden and the visitor goes to /account/ (and comes back after).
// 2. Only the playing profile's game data is in localStorage. The others' is put aside in IndexedDB on this
//    device. Switching happens on /account/, never under a running game: a game page that finds the wrong
//    profile's data (another tab switched) goes to /account/ to switch, then comes back.
// 3. Each profile's game data is backed up online (/api/state) and merged key by key with the last synced copy,
//    so two devices playing different games both keep their progress. Newer progress from another device is
//    applied on /account/, before any game runs.
// 4. Guests keep nothing. Signing out backs up first and won't wipe anything that isn't backed up.
// Site keys (evonline.*, tenggames.*, tg.*) are never touched.
(function () {
  'use strict';
  // HTTP pages cannot call the secure account API. Upgrade before reading storage or showing a form.
  if (location.protocol === 'http:' && /^(www\.)?tenggames\.com\.au$/.test(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  // Site-wide settings (tg.settings, one per device; the Settings menu in tg-controller.js changes them).
  // They must hook audio and vibration here, before any game script creates its sound graph.
  var TG = window.TGSettings = { volume: 1, vibration: true, setVolume: null, setVibration: null };
  try {
    var saved = JSON.parse(window.localStorage.getItem('tg.settings')) || {};
    if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) TG.volume = saved.volume;
    TG.vibration = saved.vibration !== false;
  } catch (e) {}
  (function () {
    var refs = [], Ref = window.WeakRef;
    var track = function (o) { if (Ref) refs.push(new Ref(o)); };
    var each = function (fn) { refs = refs.filter(function (r) { var o = r.deref(); if (o) fn(o); return !!o; }); };
    // Web Audio: whatever a game connects to the speakers goes through one gain node per audio context.
    var AN = window.AudioNode, AD = window.AudioDestinationNode, Offline = window.OfflineAudioContext;
    if (AN && AD) {
      var connect = AN.prototype.connect, disconnect = AN.prototype.disconnect, gains = new WeakMap();
      var live = function (dest) { return dest instanceof AD && !(Offline && dest.context instanceof Offline); };
      AN.prototype.connect = function (dest) {
        var args = Array.prototype.slice.call(arguments);
        if (live(dest)) {
          var g = gains.get(dest);
          if (!g) { g = dest.context.createGain(); g.gain.value = TG.volume; g.tgMaster = true; connect.call(g, dest); gains.set(dest, g); track(g); }
          if (this !== g) args[0] = g;
        }
        return connect.apply(this, args);
      };
      AN.prototype.disconnect = function (dest) {
        var args = Array.prototype.slice.call(arguments);
        if (live(dest) && gains.has(dest) && !this.tgMaster) args[0] = gains.get(dest);
        return disconnect.apply(this, args);
      };
    }
    // <audio>/<video>: the game's own volume, times the site volume.
    var HM = window.HTMLMediaElement, vd = HM && Object.getOwnPropertyDescriptor(HM.prototype, 'volume'), raw = new WeakMap();
    if (vd && vd.set) {
      Object.defineProperty(HM.prototype, 'volume', { configurable: true, enumerable: vd.enumerable,
        get: function () { return raw.has(this) ? raw.get(this) : vd.get.call(this); },
        set: function (v) {
          if (!(v >= 0 && v <= 1)) return vd.set.call(this, v);   // keep the browser's own error
          if (!raw.has(this)) track(this);
          raw.set(this, v); vd.set.call(this, v * TG.volume);
        } });
      var play = HM.prototype.play;
      HM.prototype.play = function () { if (!raw.has(this)) this.volume = vd.get.call(this); return play.apply(this, arguments); };
    }
    TG.setVolume = function (v) {
      TG.volume = Math.max(0, Math.min(1, v));
      each(function (o) { if (o.tgMaster) o.gain.value = TG.volume; else if (raw.has(o)) vd.set.call(o, raw.get(o) * TG.volume); });
    };
    var vibrate = navigator.vibrate;
    if (vibrate) navigator.vibrate = function () { return TG.vibration ? vibrate.apply(navigator, arguments) : false; };
    TG.setVibration = function (on) { TG.vibration = !!on; if (!on && vibrate) vibrate.call(navigator, 0); };
  })();
  // Arcane Arena and Hammerguy's Party share an engine, and with it the sound keys aa-muted/aa-volume.
  // Give Hammerguy's its own, so muting one game no longer mutes the other.
  if (/^\/hammerguys-party\//.test(location.pathname) && window.Storage) {
    var own = { 'aa-muted': 'hp-muted', 'aa-volume': 'hp-volume' }, SP = Storage.prototype;
    ['getItem', 'setItem', 'removeItem'].forEach(function (m) {
      var f = SP[m];
      SP[m] = function (k) { var args = Array.prototype.slice.call(arguments); if (Object.prototype.hasOwnProperty.call(own, k)) args[0] = own[k]; return f.apply(this, args); };
    });
  }
  // Shared controller controls are independent of account storage and game builds.
  var controllerScript = document.createElement('script');
  controllerScript.src = '/tg-controller.js'; controllerScript.defer = true;
  document.head.appendChild(controllerScript);
  var API = 'https://ev-online-api.justintengyz.workers.dev';
  var SITE_KEY = /^(evonline\.|tenggames\.|tg\.)/;
  var OWNER = 'tg.owner', OWNER_ACCOUNT = 'tg.owner.account', PARTIAL = 'tg.partial';
  var PID = 'tenggames.profileId', TOKEN = 'evonline.session';
  var ls;
  try { ls = window.localStorage; ls.getItem(OWNER); } catch (e) { return; }   // storage blocked: nothing to keep apart

  var get = function (k) { try { return ls.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { if (v == null) ls.removeItem(k); else ls.setItem(k, v); return true; } catch (e) { return false; } };
  var accountTag = function () { return (get('tenggames.account.user') || '').trim().toLowerCase(); };

  // ---------- this device's game data ----------
  function gameKeys() {
    var out = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k != null && !SITE_KEY.test(k)) out.push(k); }
    return out;
  }
  function snapshot() { var o = {}, ks = gameKeys(); for (var i = 0; i < ks.length; i++) o[ks[i]] = get(ks[i]); return o; }
  function clearGames() { var ks = gameKeys(); for (var i = 0; i < ks.length; i++) set(ks[i], null); }
  // Write every key; true only if all of them made it (a full localStorage refuses some).
  function loadAll(o) { var ok = true; for (var k in o) if (!SITE_KEY.test(k) && !(set(k, o[k]) && get(k) === o[k])) ok = false; return ok; }
  function same(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (!(ka[i] in b) || a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }

  // ---------- the vault: IndexedDB, one record per profile ----------
  // {owner, account, data (its games while another profile plays, else null), base (last synced copy), rev}
  var dbp = null;
  function vdb() {
    if (!dbp) dbp = new Promise(function (ok, no) {
      var r = indexedDB.open('tg-vault', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('profiles', { keyPath: 'owner' }); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return vdb().then(function (db) {
      return new Promise(function (ok, no) {
        var t = db.transaction('profiles', mode), r = fn(t.objectStore('profiles')), out;
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { ok(out); }; t.onerror = t.onabort = function () { no(t.error); };
      });
    });
  }
  var vget = function (owner) { return tx('readonly', function (st) { return st.get(owner); }); };
  var vput = function (rec) { return tx('readwrite', function (st) { st.put(rec); }); };
  var vdel = function (owner) { return tx('readwrite', function (st) { st.delete(owner); }); };
  var vall = function () { return tx('readonly', function (st) { return st.getAll(); }); };

  // ---------- switching (only where no game runs: /account/) ----------
  // Make this device's game data belong to 'next' ('' = nobody, 'guest', or a profile id). Returns false, and
  // changes nothing, if the current data couldn't be put aside safely.
  async function switchTo(next) {
    var owner = get(OWNER);
    if (owner === next) return true;
    var cur = snapshot(), any = Object.keys(cur).length > 0;
    try {
      if ((owner === null || owner === '') && any) {   // progress from before profiles: kept for a grown-up to give away
        var old = await vget('legacy');
        var all = Object.assign({}, old && old.data || {}, cur);
        await vput({ owner: 'legacy', account: null, data: all, base: null, rev: 0 });
        var lb = await vget('legacy');
        if (!lb || !same(lb.data, all)) return false;
      } else if (owner && owner !== 'guest') {         // put the last profile's games aside
        var rec = (await vget(owner)) || { owner: owner, base: null, rev: 0 };
        rec.data = cur; rec.account = rec.account || get(OWNER_ACCOUNT) || accountTag();
        await vput(rec);
        var back = await vget(owner);
        if (!back || !same(back.data || {}, cur)) return false;
      }
    } catch (e) { return false; }                      // couldn't put it aside: keep everything as it is
    clearGames(); set(PARTIAL, null); set(OWNER, '');
    if (next && next !== 'guest') {
      var mine = null;
      try { mine = await vget(next); } catch (e) { }
      if (mine && mine.data) {
        if (loadAll(mine.data)) { mine.data = null; try { await vput(mine); } catch (e) { } }
        else set(PARTIAL, '1');                        // the device is full: never back up a partial copy
      }
    }
    set(OWNER, next); set(OWNER_ACCOUNT, next && next !== 'guest' ? accountTag() : null);
    return true;
  }

  // ---------- online copy: a key-by-key merge with the last synced copy ----------
  function req(method, path, body, headers) {
    var h = headers || {}; h.Authorization = 'Bearer ' + get(TOKEN);
    return fetch(API + path, { method: method, headers: h, body: body, keepalive: !!(body && body.byteLength < 60000) });
  }
  var zip = typeof CompressionStream === 'function';
  async function pack(o) {
    var text = JSON.stringify(o);
    if (!zip) return new TextEncoder().encode(text);   // older browsers: plain JSON
    return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  }
  async function unpack(buf) {
    if (buf[0] === 0x7b) return JSON.parse(new TextDecoder().decode(buf));
    return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  // Keys this device changed since the last sync win; everything else follows the online copy.
  function merge(local, base, server) {
    var out = {}, k, changed = function (k) { return (k in local) !== (k in base) || local[k] !== base[k]; };
    for (k in server) if (!changed(k)) out[k] = server[k];
    for (k in local) if (changed(k)) out[k] = local[k];
    // deleted here since the sync (and not changed online): stays deleted
    for (k in base) if (!(k in local) && k in out && server[k] === base[k]) delete out[k];
    return out;
  }

  var loaded = { token: get(TOKEN), profile: get(PID), owner: get(OWNER) };
  var identityOk = function () { return get(TOKEN) === loaded.token && get(PID) === loaded.profile && get(OWNER) === loaded.owner; };
  var canSync = function () {
    var p = get(PID);
    return !!get(TOKEN) && !!p && p !== 'guest' && get(OWNER) === p && !get(PARTIAL) && typeof indexedDB !== 'undefined';
  };

  // Sync this profile with its online copy.
  //   running (a game page): upload this device's changes; if the online copy has changes for this device, leave
  //     the running game alone and return 'newer' (the page then applies them on /account/).
  //   apply (/account/): merge both ways. Returns 'applied' when this device's game data changed.
  async function sync(mode) {
    if (!canSync() || (mode === 'running' && !identityOk())) return 'off';
    var owner = get(OWNER), rec = null;
    try { rec = await vget(owner); } catch (e) { }
    rec = rec || { owner: owner, data: null, base: null, rev: 0, account: accountTag() };
    var base = rec.base || {}, local = snapshot(), applied = false;
    for (var attempt = 0; attempt < 3; attempt++) {
      var r = await req('GET', '/api/state');
      if (r.status === 401) return 'signed-out';
      if (!r.ok && r.status !== 204) return 'off';
      var rev = +(r.headers.get('X-Rev') || 0);
      var server = r.status === 204 ? {} : await unpack(new Uint8Array(await r.arrayBuffer()));
      var merged = rev === (rec.rev || 0) ? local : merge(local, base, server);
      if (!same(merged, local)) {
        if (mode === 'running') return 'newer';
        clearGames();
        if (!loadAll(merged)) { set(PARTIAL, '1'); return 'off'; }
        local = merged; applied = true;
      }
      if (mode === 'running' && !identityOk()) return 'off';
      if (!same(merged, server) || (rev === 0 && Object.keys(merged).length)) {
        var w = await req('PUT', '/api/state', await pack(merged), { 'Content-Type': 'application/octet-stream', 'X-Rev': String(rev) });
        if (w.status === 409) continue;                // saved somewhere else meanwhile: merge again
        if (!w.ok) return 'off';
        rev = (await w.json()).rev;
      }
      rec.base = merged; rec.rev = rev; rec.data = null;
      try { await vput(rec); } catch (e) { }
      return applied ? 'applied' : 'saved';
    }
    return 'off';
  }

  // Is this device's copy of the playing profile's games backed up online?
  async function backedUp() {
    var p = get(OWNER);
    if (!p || p === 'guest') return true;
    var rec = null;
    try { rec = await vget(p); } catch (e) { }
    return !!rec && !!rec.base && same(rec.base, snapshot());
  }

  window.TGProfile = {
    owner: function () { return get(OWNER); },
    switchTo: switchTo,
    sync: function () { return sync('apply'); },
    backedUp: backedUp,
    // Progress from before profiles on this device, for the grown-up to give to a profile or delete.
    legacy: async function () { try { var r = await vget('legacy'); return r && r.data && Object.keys(r.data).length ? r.data : null; } catch (e) { return null; } },
    giveLegacy: async function (owner) {
      var l = await vget('legacy'); if (!l || !l.data) return;
      if (owner === get(OWNER)) { for (var k in l.data) if (get(k) === null) set(k, l.data[k]); }
      else {
        var rec = (await vget(owner)) || { owner: owner, base: null, rev: 0, account: accountTag(), data: null };
        rec.data = rec.data || {};
        for (var k2 in l.data) if (!(k2 in rec.data)) rec.data[k2] = l.data[k2];
        await vput(rec);
      }
      await vdel('legacy');
    },
    dropLegacy: function () { return vdel('legacy'); },
    // Signing out of this device. Returns false (and wipes nothing) if the playing profile's progress isn't
    // backed up, unless force. Otherwise nobody's game data stays behind on the device.
    // mode: undefined = only if everything is backed up (returns false otherwise, changing nothing);
    // 'keep' = sign out, but keep progress that isn't backed up yet on this device (it uploads the next time
    // that profile plays here); 'delete' = sign out and delete it.
    // A guest leaving only wipes the guest's games; the family's set-aside games stay for them.
    signOut: async function (mode) {
      var owner = get(OWNER), tag = get(OWNER_ACCOUNT) || accountTag();
      if (owner && owner !== 'guest') { try { await sync('apply'); } catch (e) { } }
      var unsaved = function (r) { return r.data && !(r.base && same(r.base, r.data)); };
      var mineOf = async function () {
        var all = []; try { all = await vall(); } catch (e) { }
        return owner === 'guest' ? [] : all.filter(function (r) { return r.owner !== 'legacy' && r.account && r.account === tag; });
      };
      var mine = await mineOf();
      if (!mode && (mine.some(unsaved) || !(await backedUp()))) return false;
      if (mode === 'keep' && owner && owner !== 'guest') {
        if (!(await switchTo(''))) return false;        // put the playing profile's games aside first
        mine = await mineOf();
      }
      clearGames(); set(PARTIAL, null); set(OWNER, ''); set(OWNER_ACCOUNT, null);
      for (var i = 0; i < mine.length; i++) {
        if (mode === 'keep' && unsaved(mine[i])) continue;
        try { await vdel(mine[i].owner); } catch (e) { }
      }
      return true;
    },
    // A different family signed in on this device: other families' set-aside games go.
    forgetOtherAccounts: async function (tag) {
      var all = []; try { all = await vall(); } catch (e) { }
      for (var i = 0; i < all.length; i++) if (all[i].owner !== 'legacy' && all[i].account && all[i].account !== tag) { try { await vdel(all[i].owner); } catch (e) { } }
    },
  };

  // ---------- on every page ----------
  var here = location.pathname + location.search + location.hash;
  var onAccount = /^\/account(\/|$)/.test(location.pathname);
  function goAccount(extra) {
    document.documentElement.style.visibility = 'hidden';
    location.replace('/account/?' + (extra ? extra + '&' : '') + 'next=' + encodeURIComponent(here));
  }
  if (onAccount) return;                               // the account page switches and syncs itself
  if (!get(TOKEN)) { document.documentElement.style.visibility = 'hidden'; location.replace('/account/' + (here !== '/' ? '?next=' + encodeURIComponent(here) : '')); return; }
  var pid = get(PID);
  // Guests don't see the Retro Archive at all (Justin, 2026-10-23): the home page hides it (data-tg-guest, site.css,
  // retro-catalog.js) and any /retro/ address goes back to the home page.
  if (pid === 'guest' || get('evonline.tier') === 'guest') {
    document.documentElement.setAttribute('data-tg-guest', '');
    if (/^\/retro(\/|$)/.test(location.pathname)) { document.documentElement.style.visibility = 'hidden'; location.replace('/'); return; }
  }
  if (pid && get(OWNER) !== pid) { goAccount('switch=1'); return; }   // another tab switched profile: switch there, come back

  // Another tab switching profile or signing out while this game runs: stop and reload, so nothing mixes.
  addEventListener('storage', function (e) {
    if (e.key === null || e.key === OWNER || e.key === PID || e.key === TOKEN) { document.documentElement.style.visibility = 'hidden'; location.reload(); }
  });

  function start() {
    // still signed in? An ended session (a guest's after a day) goes back to sign-in.
    fetch(API + '/api/me', { headers: { Authorization: 'Bearer ' + get(TOKEN) } }).then(function (r) {
      if (r.status === 401) { set(TOKEN, null); goAccount(); }
    }, function () { });
    if (!canSync()) return;
    var key = 'tg.applied:' + here;
    var tick = function () {
      sync('running').then(function (r) {
        // another device has newer progress for this profile: apply it on /account/ and come back (once per page)
        if (r === 'newer' && !sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); goAccount('sync=1'); }
        else if (r === 'saved') sessionStorage.removeItem(key);
      }, function () { });
    };
    tick();
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sync('running').catch(function () { }); });
    addEventListener('pagehide', function () { sync('running').catch(function () { }); });
  }

  if (pid) { start(); return; }
  // Signed in, but no profile id here: a sign-in from before profiles (or a game's own sign-in). Leave this
  // device's games exactly as they are while we ask the server who it is.
  fetch(API + '/api/me', { headers: { Authorization: 'Bearer ' + get(TOKEN) } }).then(function (r) {
    if (r.status === 401) { set(TOKEN, null); goAccount(); return null; }
    return r.ok ? r.json() : null;
  }).then(function (j) {
    if (!j || j.stage !== 'profile') return;
    var id = j.kind === 'guest' ? 'guest' : String(j.id);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
    set(PID, id); loaded.profile = id;
    var owner = get(OWNER);
    if (owner === null || owner === '') { set(OWNER, id); loaded.owner = id; start(); }   // the games here are this profile's
    else if (owner !== id) goAccount('switch=1');                                         // another profile's were here
    else start();
  }, function () { });
})();
