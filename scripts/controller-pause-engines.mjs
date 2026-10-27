// Site-owned integration for vendored retro builds. Run after refreshing games,
// before packaging: source game publishers may replace these hashed bundles.
// Patches are idempotent, guarded, and don't change game files or save data.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const assets = fileURLToPath(new URL('../public/retro/assets/', import.meta.url));
// These loose game files are also overwritten by their upstream publishers.
// Keep the site integration reproducible without rebuilding unrelated games.
function ensure(file, marker, before, after) {
  const path=fileURLToPath(new URL('../'+file,import.meta.url));
  const source=readFileSync(path,'utf8');
  if(source.includes(marker))return;
  if(!source.includes(before))throw Error(`Review pause integration after updating ${file}`);
  writeFileSync(path,source.replace(before,after));
}
ensure('public/demon-dragon/js/gfx.js','if (window.TGController?.paused) return;', '    last = now;', '    last = now;\n    if (window.TGController?.paused) return;');
ensure('public/demon-dragon/js/game.js','tg-input-reset', "  window.addEventListener('blur', () => clearInput());", "  window.addEventListener('blur', () => clearInput());\n  window.addEventListener('tg-input-reset', () => clearInput());");
ensure('public/demon-dragon/js/game.js','if (window.TGController?.paused) return;', '  function press(btn) {', '  function press(btn) {\n    if (window.TGController?.paused) return;');
ensure('public/zeliard/game/src/scenes/menus.js',"value: 'controller'", "      { label: 'Resume', value: 'resume' },", "      { label: 'Resume', value: 'resume' },\n      { label: 'Controller settings', value: 'controller' },");
// The shared Settings page (sound, screen, controller) has the same name in every game.
ensure('public/zeliard/game/src/scenes/menus.js',"{ label: 'Settings', value: 'controller' }", "{ label: 'Controller settings', value: 'controller' }", "{ label: 'Settings', value: 'controller' }");
ensure('public/zeliard/game/src/scenes/menus.js',"v === 'controller'", "    if (v === 'resume') this.close();", "    if (v === 'resume') this.close();\n    else if (v === 'controller') window.TGController?.openSettings();");
ensure('public/escape-velocity/game/touch.js','window.TGController.openPause()', "def('pause', 'II', { fn: () => { this.app.paused = !this.app.paused; this.app.last = performance.now(); }, cls: 'small' });", "def('pause', 'II', { fn: () => { if (window.TGController) window.TGController.openPause(); else { this.app.paused = !this.app.paused; this.app.last = performance.now(); } }, cls: 'small' });");
// Site rule: /tg-profile.js is the first element in <head> of every game page. It keeps progress per
// profile, loads the shared controller and Settings, and applies the site volume. A game publisher that
// replaces its page without it (Mission Mars, 27 Oct) gets it back here.
const PROFILE_TAG = '<script src="/tg-profile.js"></script>';
const profileFirst = html => /<head[^>]*>\s*<script src=["']?\/tg-profile\.js["']?\s*><\/script>/i.test(html);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const gamePages = [];
for (const dir of readdirSync(publicDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
  for (const page of ['index.html', 'game/index.html']) gamePages.push(join(publicDir, dir.name, page));
}
for (const dir of readdirSync(join(publicDir, 'retro', 'web'))) gamePages.push(join(publicDir, 'retro', 'web', dir, 'index.html'));
let restored = 0;
for (const page of gamePages) {
  let html;
  try { html = readFileSync(page, 'utf8'); } catch { continue; }
  if (!/<head[^>]*>/i.test(html) || profileFirst(html)) continue;
  html = html.replace(/<script src=["']?\/tg-profile\.js["']?\s*><\/script>\s*/gi, '').replace(/<head[^>]*>/i, m => `${m}${html.includes('\r\n') ? '\r\n' : '\n'}${PROFILE_TAG}`);
  writeFileSync(page, html);
  console.log('Restored the profile script first in <head>: ' + page.slice(publicDir.length));
  restored++;
}
for (const page of gamePages) {
  let html;
  try { html = readFileSync(page, 'utf8'); } catch { continue; }
  if (/<head[^>]*>/i.test(html) && !profileFirst(html)) throw Error('Profile script not first in <head>: ' + page);
}

let changed = 0;
for (const name of readdirSync(assets).filter(n => n.endsWith('.js'))) {
  const file = join(assets, name);
  let source = readFileSync(file, 'utf8');
  // Also cover a loop whose initialization finishes while the menu is open.
  const guarded = source.replace(/runIter\((\w+)\)\{(?!if\(window\.TGController)/g, '$&if(window.TGController?.paused)return;');
  if (source.includes('/* tg-pause-engine */')) {
    if(source!==guarded){writeFileSync(file,guarded);changed++;}
    continue;
  }
  const original = source;
  source = guarded;
  // Emscripten main-loop engines: only resume a loop which we actually paused.
  source = source.replace(/(\w+)\.pauseMainLoop=(\w+)\.pause/g, (m, mod, loop) =>
    `${m},${mod}.tgPause=()=>{const running=!!${loop}.func&&!!${loop}.scheduler;if(running)${loop}.pause();return()=>{if(running)${loop}.resume();}}`);
  // Stack-switching engines run their own loop, so suspend their frame/sleep
  // continuations too. Covers both JSPI and Asyncify, without a busy wait.
  source = source.replace(/\.handleAsync\(async\(\)=>\{/g, '$&await window.TGController?.waitForResume();');
  source = source.replace(/\.handleSleep\((\w+)=>(\w+)\(\1,(\w+)\)\)/g,
    (m, wake, sleep, delay) => `.handleSleep(${wake}=>${sleep}(()=>{if(window.TGController)window.TGController.afterResume(${wake});else ${wake}();},${delay}))`);
  if (name.startsWith('web-zzt-')) {
    let found = false;
    source = source.replace(/function (\w+)\((\w+)\)\{if\(!([\w$]+)\)return;let (\w+)=\3\._zoo_web_frame\(\2\);/,
      (m, frame) => { found = true; return m.replace('{if', `{if(window.TGController?.paused){requestAnimationFrame(${frame});return;}if`); });
    if (!found) throw Error(`Review ZZT's frame adapter after updating ${name}`);
  }
  if (name.startsWith('web-tim-')) {
    let found = false;
    source = source.replace(/function (\w+)\((\w+)\)\{requestAnimationFrame\(\1\);let (\w+)=Math.min\(250,\2-\((\w+)\|\|\2\)\);if\(\4=\2,(\w+)\.screen===`play`&&\(\5\.running\?(\w+)=\2:/,
      (m, frame, now, dt, last, state, second) => { found = true; return m.replace(`requestAnimationFrame(${frame});`, `requestAnimationFrame(${frame});if(window.TGController?.paused){${last}=${now};${second}=${now};return;}`); });
    if (!found) throw Error(`Review TIM's frame adapter after updating ${name}`);
  }
  if (source !== original) {
    writeFileSync(file, '/* tg-pause-engine */\n' + source);
    changed++;
  }
}
console.log(`Retro pause adapters: ${changed} bundle(s) updated`);
