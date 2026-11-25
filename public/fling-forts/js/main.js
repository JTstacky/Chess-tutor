// main.js — boot, menus, fixed-step loop, sound.
import * as S from './sim.js';
import { createAI, pickRace } from './ai.js';
import { computeLayout, draw, loadArt, loadGroup, worldToScreen, buttons, PICK, PAUSE } from './view.js';
import { sound, unlockAudio } from './sfx.js';
import { attachInput, blockBrowserGestures, PULL_MAX } from './input.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const ui = { armed: [null, null], aims: new Map(), aimOf: [null, null], kick: [0, 0], toast: [null, null], shake: 0, aiLevel: 'normal', pick: null, menu: true, topY: 700, races: ['fantasy', 'pirates'], pauseHold: 0, held: null };
const game = {
  s: S.createGame(), ui, lay: null, ai: null, state: 'menu', clock: 0,
  now: () => game.clock,
  playing: () => game.state === 'play',
  pause, sound, unlockAudio, pickChanged,
};

// ---------- screens ----------
function show(id) { for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id; ui.menu = id === 'menu' || id === 'help'; }
/** Menu -> race pick: each player chooses on their own side; solo: the computer picks at once. */
function pick(mode, level = ui.aiLevel) {
  ui.aiLevel = level;
  game.s = S.createGame({ mode, seed: 1 });
  ui.pick = { mode, level, race: [null, null], ready: [false, false] };
  if (mode === 'solo') { ui.pick.race[1] = pickRace((Math.random() * 1e6) | 0); ui.pick.ready[1] = true; }
  game.state = 'pick'; ui.aims.clear(); show(null); unlockAudio();
}
function pickChanged() {
  const pk = ui.pick;
  if (!pk) return;
  for (const r of pk.race) if (r) loadGroup(r);            // fetch a race's sprites as soon as its card is chosen
  // both ready: start once both races' sprites are in (or after 4 s on a very slow line; fallbacks cover the rest)
  if (pk.ready[0] && pk.ready[1]) {
    const go = () => { if (game.state === 'pick' && ui.pick === pk && pk.ready[0] && pk.ready[1]) start(pk.mode, pk.level, undefined, pk.race); };
    Promise.race([Promise.all([...pk.race.map((r) => loadGroup(r)), new Promise((ok) => setTimeout(ok, 450))]), new Promise((ok) => setTimeout(ok, 4000))]).then(go);
  }
}
function start(mode, level = ui.aiLevel, seed = (Math.random() * 1e9) | 0, races = ui.races) {
  ui.races = races.slice(); ui.pick = null;
  game.s = S.createGame({ mode, seed, races });
  ui.aiLevel = level;
  game.ai = mode === 'solo' ? createAI(1, level, seed ^ 0x5eed) : null;
  ui.armed = [null, null]; ui.aims.clear(); ui.toast = [null, null]; ui.kick = [0, 0];
  game.state = 'play'; show(null); unlockAudio(); sound('roundStart'); ui.tickAt = null;
}
function pause() { if (game.state !== 'play') return; game.state = 'paused'; ui.aims.clear(); quitArmed = 0; $('btn-quit').textContent = 'Quit to menu (tap twice)'; show('pause'); }
function resume() { game.state = 'play'; show(null); last = performance.now(); }
function toMenu() { game.state = 'menu'; ui.pick = null; show('menu'); }

let level = 'normal', quitArmed = 0;
for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { level = b.dataset.level; for (const o of document.querySelectorAll('[data-level]')) o.classList.toggle('on', o === b); });
$('btn-2p').addEventListener('click', () => pick('2p'));
$('btn-solo').addEventListener('click', () => pick('solo', level));
$('btn-help').addEventListener('click', () => show('help'));
$('btn-help-back').addEventListener('click', () => show('menu'));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => start(game.s.mode, ui.aiLevel));
// quitting throws the match away, so a single stray tap must not do it
$('btn-quit').addEventListener('click', () => { if (performance.now() - quitArmed < 2500) toMenu(); else { quitArmed = performance.now(); $('btn-quit').textContent = 'Tap again to quit'; } });
$('btn-rematch').addEventListener('click', () => start(game.s.mode, ui.aiLevel));
$('btn-over-menu').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- loop ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  game.lay = computeLayout(w, h, dpr, layoutView());
  placeFullscreen();
}
// the race-pick screen needs the tall view for its cards; a match zooms in on the forts
const layoutView = () => (game.state === 'pick' ? 'pick' : 'play');

// ---------- full-screen button (owner feedback 2026-11-25) ----------
// A plain page button: next to the pause button during a match, top-right corner on the menus. Hidden where the
// browser has no full-screen mode (iPhone Safari), and on the race-pick screen where its cards fill the top.
const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsBtn = document.createElement('button');
fsBtn.id = 'btn-fullscreen'; fsBtn.type = 'button'; fsBtn.setAttribute('aria-label', 'Full screen');
fsBtn.style.cssText = 'position:fixed;z-index:50;width:44px;height:44px;padding:0;border:0;border-radius:12px;' +
  'background:rgba(40,24,10,0.62);color:#fff;font:700 24px/44px system-ui,sans-serif;touch-action:manipulation;cursor:pointer;';
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsIcon = () => { fsBtn.textContent = isFull() ? '✕' : '⛶'; fsBtn.title = isFull() ? 'Leave full screen' : 'Full screen'; };
fsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
fsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const el = document.documentElement;
  if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
});
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { fsIcon(); setTimeout(resize, 50); });
if (fsOK) { fsIcon(); document.body.appendChild(fsBtn); }
let fsAt = '';
function placeFullscreen() {
  if (!fsOK || !game.lay) return;
  let at;
  if (game.state === 'pick') at = 'none';
  else if (game.state === 'play') {
    const lay = game.lay, c = worldToScreen(lay, PAUSE.x, PAUSE.y);
    at = `${Math.round(c.x + PAUSE.r * lay.s + 10)},${Math.round(c.y - 22)}`;
  } else at = 'corner';
  if (at === fsAt) return;
  fsAt = at;
  if (at === 'none') { fsBtn.style.display = 'none'; return; }
  fsBtn.style.display = '';
  if (at === 'corner') Object.assign(fsBtn.style, { left: '', top: 'calc(10px + env(safe-area-inset-top))', right: 'calc(10px + env(safe-area-inset-right))' });
  else { const [x, y] = at.split(',').map(Number); Object.assign(fsBtn.style, { left: x + 'px', top: Math.max(4, y) + 'px', right: '' }); }
}
window.addEventListener('resize', resize);
resize();

function handleEvents() {
  for (const e of S.takeEvents(game.s)) {
    switch (e.type) {
      case 'fire': sound('fire'); break;
      case 'impact': sound(e.ammo === 'boulder' ? 'boom' : 'impact'); if (e.hit) ui.shake = Math.min(1, ui.shake + 0.2); break;
      case 'block-broken': case 'crush': sound('block'); ui.shake = Math.min(1, ui.shake + 0.35); ui.hitstop = Math.max(ui.hitstop || 0, 0.06); break;
      case 'king-hit': if (e.dmg > 3) { sound('king'); ui.shake = Math.min(1, ui.shake + 0.3); } break;
      case 'shield-hit': sound('shield'); break;
      case 'king-strike': if (!sound('strike_' + game.s.players[e.p].race)) sound('impact'); ui.shake = Math.min(1, ui.shake + 0.1); break;
      case 'build': case 'send': sound('build'); break;
      case 'boom': case 'destroyed': sound('boom'); break;
      case 'bonus': sound('bonus'); ui.toast[e.p] = { text: S.BONUS[e.kind].name + '!', until: game.clock + 1.8 }; break;
      case 'sudden': sound('sudden'); break;
      case 'round-end': ui.armed = [null, null]; break;
      case 'round-start': sound('roundStart'); ui.tickAt = null; break;
      case 'bounty': sound(S.UNIT[e.kind]?.air ? 'flyerDown' : 'die'); break;
      case 'match-end': ui.slowmo = 0.9; sound('win'); setTimeout(() => { if (game.s.phase === 'over' && game.state === 'play') show('over'); }, 1400); break;
    }
  }
}
let input = null;
function advance(dt) {
  game.clock += dt;
  if (input) input.tick();
  if (game.state !== 'play') return;
  if (game.ai) game.ai.update(game.s, dt);
  S.step(game.s, dt);
  handleEvents();
  ui.kick = ui.kick.map((k) => Math.max(0, k - dt * 4));
  ui.shake = Math.max(0, ui.shake - dt * 2.5);
}
let last = performance.now(), acc = 0;
function frame(t) {
  // game feel: a few frames of hit-stop when a block breaks, slow motion on the winning hit (both players alike)
  let real = Math.min(0.25, (t - last) / 1000); last = t;
  if (ui.hitstop > 0) { ui.hitstop -= real; real = 0; } else if (ui.slowmo > 0) { ui.slowmo -= real; real *= 0.3; }
  acc += real;
  // countdown tick over the last five seconds of a round or of sudden death
  if (game.state === 'play' && game.s && (game.s.phase === 'play' || game.s.phase === 'sudden') && game.s.clock <= 5.0) {
    const sec = Math.ceil(game.s.clock); if (sec !== ui.tickAt && sec > 0) { ui.tickAt = sec; sound('tick'); }
  }
  while (acc >= S.DT) { advance(S.DT); acc -= S.DT; }
  ui.aimOf = [null, null];
  for (const a of ui.aims.values()) if (a.kind === 'field' && a.aim) ui.aimOf[a.p] = a.aim;
  if (game.lay.view !== layoutView()) resize();
  draw(g, game.lay, game.s, ui, game.clock);
  placeFullscreen();
  requestAnimationFrame(frame);
}
blockBrowserGestures();
input = attachInput(canvas, game);
show('menu');
loadArt().then(() => { window.RR.artReady = true; });
requestAnimationFrame(frame);

// test hook (read by the tools)
window.RR = {
  game, start, pick, S, artReady: false, PULL_MAX, buttons, PICK, PAUSE,
  advance: (secs) => { for (let i = 0; i < secs * 60; i++) advance(S.DT); },
  toScreen: (x, y) => worldToScreen(game.lay, x, y),
  demo: (secs, seed = 5) => {
    const a = createAI(0, 'normal', seed), b = game.ai || createAI(1, 'normal', seed + 1);
    for (let i = 0; i < secs * 60 && game.s.phase !== 'over'; i++) { a.update(game.s, S.DT); if (!game.ai) b.update(game.s, S.DT); advance(S.DT); }
  },
};
