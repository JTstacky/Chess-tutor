// Live updates for the published site and the home-screen app. There is no service worker, and the
// host caches every file for 10 minutes, so a copy left open (or reopened from the home screen
// within that window) would keep running the old build, or a mix of old and new files.
//
// tools/publish_site.mjs stamps the page with window.ZELIARD_BUILD and writes game/version.json:
// { build, files: { "game/src/x.js": hash, ... } } (paths from the site root). This checks that
// file (never cached) at launch, when the app comes back to the front, and every 10 minutes. When
// the build has moved on it re-downloads the changed files into the browser cache, then reloads,
// but only on the opening or title screen, so nobody loses a run in a cavern; until then a toast
// says an update is waiting. Running from the dev server (no stamp) does nothing.
const KEY = 'beliards.files';
const ONCE = 'beliards.reloadedFor';
const TEXT = /\.(js|json|html|webmanifest|css)$/;

let pending = null; // the newer version.json, fetched and ready to apply
let busy = false, told = false;

const store = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const url = (rel) => new URL(`../${rel}`, document.baseURI).href;

async function check() {
  if (!window.ZELIARD_BUILD || busy || pending) return;
  let v;
  try { v = await (await fetch(new URL('version.json', document.baseURI), { cache: 'no-store' })).json(); } catch { return; }
  if (!v || !v.build || !v.files) return;
  if (v.build === window.ZELIARD_BUILD) { store.set(KEY, v.files); return; } // up to date: remember what this build is
  if (store.get(ONCE, sessionStorage) === v.build) return; // already reloaded for it once (host still propagating)
  pending = v;
}

// Pull every file that differs from the build we last ran into the HTTP cache, so the reload gets
// new copies rather than 10-minute-old ones. With nothing remembered (first run of the update
// code), refresh all code and data: they're small, and a mix of old and new code is what breaks.
async function apply(game) {
  const v = pending;
  busy = true;
  const old = store.get(KEY) || {};
  const have = Object.keys(old).length > 0;
  const changed = Object.keys(v.files).filter((f) => (have ? old[f] !== v.files[f] : TEXT.test(f)));
  changed.push('game/', 'game/index.html');
  game?.toast?.('Updating Zeliard…', '#8fe3ff');
  let i = 0;
  const worker = async () => { while (i < changed.length) { const f = changed[i++]; try { await fetch(url(f), { cache: 'reload' }); } catch { /* offline: the reload still tries */ } } };
  await Promise.all(Array.from({ length: 6 }, worker));
  store.set(KEY, v.files);
  store.set(ONCE, v.build, sessionStorage);
  location.reload();
}

const safe = (game) => { const n = game.scene?.constructor?.name; return n === 'OpeningScene' || n === 'TitleScene'; };

export function watchForUpdates(game) {
  if (!window.ZELIARD_BUILD) return;
  check();
  setInterval(check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  // Apply at a safe moment; checked twice a second, which is plenty.
  setInterval(() => {
    if (!pending || busy) return;
    if (safe(game) && !game.coop) apply(game);
    else if (!told) { told = true; game.toast?.('A new version is ready. It loads when you return to the title screen.', '#8fe3ff'); }
  }, 500);
}
