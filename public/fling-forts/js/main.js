// main.js — boot, menus, fixed-step loop, sound.
import * as S from './sim.js';
import { createAI, pickRace } from './ai.js';
import { computeLayout, draw, loadArt, worldToScreen, buttons, PICK, PAUSE } from './view.js';
import { sound, unlockAudio } from './sfx.js';
import { attachInput, blockBrowserGestures, PULL_MAX } from './input.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const ui = { armed: [null, null], aims: new Map(), aimOf: [null, null], kick: [0, 0], toast: [null, null], shake: 0, aiLevel: 'normal', pick: null, menu: true, topY: 700, races: ['fantasy', 'pirates'], pauseHold: 0 };
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
  if (pk && pk.ready[0] && pk.ready[1]) setTimeout(() => { if (game.state === 'pick' && pk.ready[0] && pk.ready[1]) start(pk.mode, pk.level, undefined, pk.race); }, 450);
}
function start(mode, level = ui.aiLevel, seed = (Math.random() * 1e9) | 0, races = ui.races) {
  ui.races = races.slice(); ui.pick = null;
  game.s = S.createGame({ mode, seed, races });
  ui.aiLevel = level;
  game.ai = mode === 'solo' ? createAI(1, level, seed ^ 0x5eed) : null;
  ui.armed = [null, null]; ui.aims.clear(); ui.toast = [null, null]; ui.kick = [0, 0];
  game.state = 'play'; show(null); unlockAudio();
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
  game.lay = computeLayout(w, h, dpr);
}
window.addEventListener('resize', resize);
resize();

function handleEvents() {
  for (const e of S.takeEvents(game.s)) {
    switch (e.type) {
      case 'fire': sound('fire'); break;
      case 'impact': sound(e.ammo === 'boulder' ? 'boom' : 'impact'); if (e.hit) ui.shake = Math.min(1, ui.shake + 0.2); break;
      case 'block-broken': case 'crush': sound('block'); ui.shake = Math.min(1, ui.shake + 0.35); break;
      case 'king-hit': if (e.dmg > 3) { sound('king'); ui.shake = Math.min(1, ui.shake + 0.3); } break;
      case 'shield-hit': sound('shield'); break;
      case 'build': case 'send': sound('build'); break;
      case 'boom': case 'destroyed': sound('boom'); break;
      case 'bonus': sound('bonus'); ui.toast[e.p] = { text: S.BONUS[e.kind].name + '!', until: game.clock + 1.8 }; break;
      case 'sudden': sound('sudden'); break;
      case 'round-end': ui.armed = [null, null]; break;
      case 'match-end': sound('win'); setTimeout(() => { if (game.s.phase === 'over' && game.state === 'play') show('over'); }, 1400); break;
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
  acc += Math.min(0.25, (t - last) / 1000); last = t;
  while (acc >= S.DT) { advance(S.DT); acc -= S.DT; }
  ui.aimOf = [null, null];
  for (const a of ui.aims.values()) if (a.kind === 'field' && a.aim) ui.aimOf[a.p] = a.aim;
  draw(g, game.lay, game.s, ui, game.clock);
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
