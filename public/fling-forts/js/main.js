import { KO } from './tuning.js';
// main.js — boot, menus, fixed-step loop, sound.
import * as S from './sim.js';
import { createAI, pickRace } from './ai.js';
import { computeLayout, draw, loadArt, loadGroup, worldToScreen, buttons, PICK, PAUSE, art as viewArt, noteEvent, preStep, postStep } from './view.js';
import { sound, unlockAudio, music, musicState } from './sfx.js';
viewArt.onSound = (kind, x) => { if (game.state === 'play') sound(kind, x); };      // shots and hits are heard when they are first drawn
import { attachInput, blockBrowserGestures, PULL_MAX } from './input.js';
import { createOnline } from './online.js';
import { renderDpr, createRenderBudget } from './render-budget.js';

const canvas = document.getElementById('game');
// The backdrop covers every pixel; an opaque surface avoids needless full-screen alpha compositing.
const g = canvas.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
const renderBudget = createRenderBudget();

const ui = { armed: [null, null], aims: new Map(), aimOf: [null, null], kick: [0, 0], toast: [null, null], shake: 0, aiLevel: 'normal', pick: null, menu: true, topY: 700, races: ['fantasy', 'pirates'], pauseHold: 0, held: null };
const game = {
  s: S.createGame(), ui, lay: null, ai: null, state: 'menu', clock: 0,
  now: () => game.clock,
  playing: () => game.state === 'play',
  pause, sound, unlockAudio, pickChanged, act: S, online: null,
};

// ---------- screens ----------
function show(id) { for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id; ui.menu = id === 'menu' || id === 'help' || id === 'guide'; }
/** Menu -> race pick: each player chooses on their own side; solo: the computer picks at once. */
function pick(mode, level = ui.aiLevel) {
  leaveOnline();
  ui.aiLevel = level;
  game.s = S.createGame({ mode, seed: 1 });
  ui.pick = { mode, level, race: [null, null], ready: [false, false] };
  if (mode === 'solo') { ui.pick.race[1] = pickRace((Math.random() * 1e6) | 0); ui.pick.ready[1] = true; }
  game.state = 'pick'; ui.aims.clear(); show(null); unlockAudio();
}
function pickChanged() {
  const pk = ui.pick;
  if (!pk) return;
  if (game.online) {
    const p = game.online.side;
    game.online.cmd('pick', { race: pk.race[p] });
    game.online.cmd('ready', { on: pk.ready[p] });
    if (pk.race[p]) loadGroup(pk.race[p]);
    return;
  }
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
function pause() { if (game.state !== 'play') return; game.state = 'paused'; ui.aims.clear(); quitArmed = 0; $('btn-quit').textContent = 'Quit to menu (tap twice)'; $('btn-restart').hidden = !!game.online; show('pause'); }
function resume() {
  game.state = 'play'; last = performance.now();
  const wait = game.s && game.s.phase === 'over' ? (ui.overAt || 0) - performance.now() : 0;
  show(game.s && game.s.phase === 'over' && wait <= 0 ? 'over' : null);
  if (wait > 0) setTimeout(() => { if (game.s.phase === 'over' && game.state === 'play') show('over'); }, wait);   // the knockout still plays out first
}
function toMenu() { leaveOnline(); game.state = 'menu'; ui.pick = null; show('menu'); }

const HOST_CHECKPOINT_KEY = 'fling-forts:host-room';
const profileId = () => { try { return localStorage.getItem('tenggames.profileId'); } catch { return null; } };
const savedHost = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(HOST_CHECKPOINT_KEY));
    return value && value.data?.v === 1 && /^[A-Z0-9]{4,8}$/.test(value.code) &&
      /^[a-f0-9]{64}$/.test(value.hostToken) && value.profileId === profileId() &&
      Date.now() - value.at < 10 * 60_000 ? value : null;
  } catch { return null; }
};
const clearHost = () => { try { sessionStorage.removeItem(HOST_CHECKPOINT_KEY); } catch {} };

const online = createOnline({
  checkpoint(value) { try { sessionStorage.setItem(HOST_CHECKPOINT_KEY, JSON.stringify({ ...value, profileId: profileId() })); } catch {} },
  status(s) { $('online-status').textContent = s === 'reconnecting' ? 'Reconnecting…' : s === 'open' ? 'Connected' : s === 'failed' ? 'Connection failed' : 'Connecting…'; },
  lobby(o) { $('online-code').textContent = o.code || ''; $('online-status').textContent = o.peers === 2 ? 'Both players connected' : 'Share this code with a friend'; if (!o.isHost && o.code) { const u = new URL(location.href); u.searchParams.set('room', o.code); history.replaceState(null, '', u); } },
  stage(stage, o) {
    if (stage === 'pick') { game.state = 'pick'; ui.pick = { mode: 'online', race: o.pick?.race || [null, null], ready: o.pick?.ready || [false, false] }; show(null); resize(); }
    if (stage === 'play') { game.state = 'play'; ui.pick = null; ui.aims.clear(); show(o.cur?.phase === 'over' ? 'over' : null); resize(); }
  },
  error(message) { if (message.startsWith('Saved room could not be reopened:')) clearHost(); $('online-status').textContent = message; if (game.state !== 'menu') { game.state = 'menu'; show('online'); } },
});
function leaveOnline() { if (game.online) { online.leave(); clearHost(); game.online = null; game.act = S; const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } }
function enterOnline() { game.online = online; game.act = online.act; show('online'); }

let level = 'normal', quitArmed = 0;
for (const b of document.querySelectorAll('[data-level]')) b.addEventListener('click', () => { level = b.dataset.level; for (const o of document.querySelectorAll('[data-level]')) o.classList.toggle('on', o === b); });
$('btn-2p').addEventListener('click', () => pick('2p'));
$('btn-solo').addEventListener('click', () => pick('solo', level));
$('btn-online').addEventListener('click', enterOnline);
$('btn-host').addEventListener('click', () => { clearHost(); enterOnline(); online.host(); });
$('btn-join').addEventListener('click', () => { clearHost(); enterOnline(); online.join($('join-code').value); });
$('btn-online-back').addEventListener('click', toMenu);
$('btn-help').addEventListener('click', () => show('help'));
$('btn-help-back').addEventListener('click', () => show('menu'));
// the Guidebook (js/guide.js) is fetched only when it is first opened, so the menu's own load stays as it was
$('btn-guide').addEventListener('click', async () => { unlockAudio(); const m = await import('./guide.js'); m.openGuide(() => show('menu')); show('guide'); });
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => start(game.s.mode, ui.aiLevel));
// quitting throws the match away, so a single stray tap must not do it
$('btn-quit').addEventListener('click', () => { if (quitArmed && performance.now() - quitArmed < 2500) toMenu(); else { quitArmed = performance.now(); $('btn-quit').textContent = 'Tap again to quit'; } });
$('btn-rematch').addEventListener('click', () => { if (game.online) { game.online.cmd('rematch', { races: false }); show(null); } else start(game.s.mode, ui.aiLevel); });
$('btn-over-menu').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden && !game.online) pause(); });

// ---------- loop ----------
function resize() {
  const was = game.lay;
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = renderDpr(w, h, window.devicePixelRatio || 1, navigator.deviceMemory || 8, renderBudget.quality);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  game.lay = computeLayout(w, h, dpr, layoutView(), safeInsets());
  // the world-to-screen mapping changed (rotate, resize): drags in progress would jump, so drop them
  if (was && (Math.abs(was.s - game.lay.s) > 1e-6 || Math.abs(was.ox - game.lay.ox) > 0.5 || Math.abs(was.gy - game.lay.gy) > 0.5)) { ui.aims.clear(); ui.held = null; }
  // A phone's rotation cover must not conceal a live solo/local battle that keeps playing underneath.
  if (w <= 520 && h > w && game.state === 'play' && !game.online) pause();
  placeFullscreen();
}
// left/right safe-area insets (notched phones in landscape), read from a hidden probe styled with env()
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(safeProbe);
function safeInsets() { const cs = getComputedStyle(safeProbe); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; }
// the race-pick screen needs the tall view for its cards; a match zooms in on the forts
const layoutView = () => (game.state === 'pick' ? 'pick' : 'play');

// ---------- full-screen button (owner feedback 2026-11-25) ----------
// A plain page button: next to the pause button during a match, top-right corner on the menus. Hidden where the
// browser has no full-screen mode (iPhone Safari), and on the race-pick screen where its cards fill the top.
const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsBtn = document.createElement('button');
fsBtn.id = 'btn-fullscreen'; fsBtn.type = 'button'; fsBtn.setAttribute('aria-label', 'Full screen');
fsBtn.style.cssText = 'position:fixed;z-index:50;width:44px;height:44px;padding:0;border:0;border-radius:12px;' +
  'background:rgba(40,24,10,0.72);color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,0.85);font:700 24px/44px system-ui,sans-serif;touch-action:manipulation;cursor:pointer;';
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
// coming back to the app: re-check the icon and put the button back, even before the next frame runs
const fsBack = () => { if (document.hidden) return; fsIcon(); resize(); placeFullscreen(true); };
for (const ev of ['visibilitychange', 'pageshow', 'focus']) (ev === 'visibilitychange' ? document : window).addEventListener(ev, fsBack);
if (fsOK) { fsIcon(); document.body.appendChild(fsBtn); }
let fsAt = '';
function placeFullscreen(force = false) {
  if (!fsOK || !game.lay) return;
  let at;
  if (game.state === 'pick') at = 'none';
  else if (game.state === 'play' || game.state === 'paused') {   // paused too: leaving the app pauses the match, and in the corner it vanished on the right player's panel (owner bug 2026-11-26)
    const lay = game.lay, c = worldToScreen(lay, PAUSE.x, PAUSE.y);
    const sz = 44;
    at = `${Math.round(c.x + PAUSE.r * lay.s + 8)},${Math.round(c.y - sz / 2)},${sz}`;
  } else at = 'corner';
  if (at === fsAt && !force) return;
  fsAt = at;
  if (at === 'none') { fsBtn.style.display = 'none'; return; }
  fsBtn.style.display = '';
  if (at === 'corner') Object.assign(fsBtn.style, { left: '', top: 'calc(10px + env(safe-area-inset-top))', right: 'calc(10px + env(safe-area-inset-right))', width: '44px', height: '44px', lineHeight: '44px', fontSize: '24px', borderRadius: '12px' });
  else { const [x, y, sz] = at.split(',').map(Number); Object.assign(fsBtn.style, { left: x + 'px', top: Math.max(4, y) + 'px', right: '', width: sz + 'px', height: sz + 'px', lineHeight: sz + 'px', fontSize: Math.round(sz * 0.55) + 'px', borderRadius: (sz >= 44 ? 12 : sz / 2) + 'px' }); }
}
window.addEventListener('resize', resize);
resize();

function handleEvents() {
  for (const e of S.takeEvents(game.s)) {
    noteEvent(e, game.s);                      // one-off effects in the view
    switch (e.type) {
      case 'fire': sound('fire', e.x ?? S.fortSpan(e.p ?? 0)[0]); break;
      case 'impact': sound(e.ammo === 'boulder' ? 'boom' : 'impact', e.x); if (e.hit) ui.shake = Math.min(1, ui.shake + 0.2); break;
      case 'block-broken': case 'crush': sound('block', e.x); ui.shake = Math.min(1, ui.shake + 0.35); ui.hitstop = Math.max(ui.hitstop || 0, 0.06); break;
      case 'king-hit': if (e.dmg > 3) { sound('king', e.x); ui.shake = Math.min(1, ui.shake + 0.3); } break;
      case 'shield-hit': sound('shield', e.x); break;
      case 'fort-hit': sound('fortHit', e.x); break;
      case 'fort-guarded': sound('guarded', e.x); break;
      case 'fort-down': sound('fortDown', e.x); break;
      case 'chief-down': if (!sound('chiefDown_' + game.s.players[e.p].race, e.x)) sound('chiefDown', e.x); break;      // each race's own voice, the plain one until the pack has it
      case 'chief-up': sound('chiefUp', e.x); break;
      case 'tower-shot': sound('shot_arrow', e.x); break;
      case 'crate-land': sound('coin', e.x); break;
      case 'bonus-drop': sound('bonus', e.x); break;
      case 'king-strike': if (!sound((e.air ? 'strike_air_' : 'strike_') + game.s.players[e.p].race, e.x)) sound('impact', e.x); ui.shake = Math.min(1, ui.shake + 0.1); break;   // air: the chief's anti-air weapon sound (art lane, sfx.js aliases)
      case 'build': sound('build', e.x); break;
      case 'send': if (!sound('send_' + game.s.players[e.p].race, e.x)) sound('send', e.x); break;
      case 'boom': case 'destroyed': sound('boom', e.x); break;
      case 'loot': sound('coin', e.x); sound('bonus', e.x); ui.toast[e.p] = { text: `Mine smashed! +${e.gold} gold`, until: game.clock + 1.8 }; break;
      case 'bonus': sound('bonus'); ui.toast[e.p] = { text: S.BONUS[e.kind].name + '!', until: game.clock + 1.8 }; break;
      case 'sudden': sound('sudden'); break;
      case 'tier': sound('tier'); break;
      case 'power': sound('build', e.x); sound('coin', e.x); break;
      case 'ult': if (!sound('ult_' + game.s.players[e.p].race, e.x)) sound('ult', e.x); break;
      case 'hero': sound('build'); break;
      case 'round-end': ui.armed = [null, null]; ui.aims.clear(); ui.held = null;
        if (e.winner >= 0) { ui.slowmo = KO.slow; ui.cam = { x: e.x, y: e.y, at: performance.now() / 1000, dur: KO.cam, zoom: KO.zoom }; sound('ko', e.x); }
        break;
      case 'round-start': ui.cam = null; sound('roundStart'); ui.tickAt = null; ui.aims.clear(); ui.held = null; break;
      case 'bounty': if (S.UNIT[e.kind]?.air) sound('flyerDown', e.x); else if (!sound('die_' + String(e.kind).split('_')[0], e.x)) sound('die', e.x); break;
      case 'match-end': sound('win'); ui.overAt = performance.now() + KO.over * 1000; setTimeout(() => { if (game.s.phase === 'over' && game.state === 'play') show('over'); }, KO.over * 1000); break;   // after the knockout   // if paused meanwhile, resume() shows it
    }
  }
}
let input = null;
function advance(dt) {
  game.clock += dt;
  if (input) input.tick();
  if (game.state !== 'play') return;
  if (game.online) { const s = game.online.view(dt); if (s) { game.s = s; handleEvents(); } return; }
  if (game.ai) game.ai.update(game.s, dt);
  preStep(game.s);                             // for the fling shot damage numbers
  S.step(game.s, dt);
  handleEvents();
  postStep(game.s);
  ui.kick = ui.kick.map((k) => Math.max(0, k - dt * 4));
  ui.shake = Math.max(0, ui.shake - dt * 2.5);
}
let last = performance.now(), acc = 0;
function frame(t) {
  if (renderBudget.sample(t - last, game.state === 'play' && !document.hidden)) resize();
  // game feel: a few frames of hit-stop when a block breaks, slow motion on the winning hit (both players alike)
  let real = Math.min(0.25, (t - last) / 1000); last = t;
  if (ui.hitstop > 0) { ui.hitstop -= real; real = 0; } else if (ui.slowmo > 0) { ui.slowmo -= real; real *= KO.rate; }
  acc += real;
  if (game.online?.stage === 'pick' && game.online.pick && ui.pick) { ui.pick.race = game.online.pick.race.slice(); ui.pick.ready = game.online.pick.ready.slice(); }
  // countdown tick over the last five seconds of a round or of sudden death
  if (game.state === 'play' && game.s && (game.s.phase === 'play' || game.s.phase === 'sudden') && game.s.clock <= 5.0) {
    const sec = Math.ceil(game.s.clock); if (sec !== ui.tickAt && sec > 0) { ui.tickAt = sec; sound('tick'); }
  }
  while (acc >= S.DT) { advance(S.DT); acc -= S.DT; }
  // background music: full in a round, faster in sudden death, quiet in menus, on pause and between rounds
  music(game.state === 'play' && game.s ? (game.s.phase === 'sudden' ? 'sudden' : game.s.phase === 'play' ? 'play' : 'low') : 'low');
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
const resumeCode = new URL(location.href).searchParams.get('room');
if (resumeCode && /^[A-Z0-9]{4,8}$/i.test(resumeCode)) { enterOnline(); $('join-code').value = resumeCode.toUpperCase(); online.join(resumeCode); }
else { const saved = savedHost(); if (saved) { enterOnline(); online.host(saved); } }
loadArt().then(() => { window.RR.artReady = true; });
requestAnimationFrame(frame);

// test hook (read by the tools)
window.RR = {
  game, ui, start, pick, online, S, artReady: false, PULL_MAX, buttons, PICK, PAUSE,
  musicState, unlockAudio,
  advance: (secs) => { for (let i = 0; i < secs * 60; i++) advance(S.DT); },
  toScreen: (x, y) => worldToScreen(game.lay, x, y),
  demo: (secs, seed = 5) => {
    const a = createAI(0, 'normal', seed), b = game.ai || createAI(1, 'normal', seed + 1);
    for (let i = 0; i < secs * 60 && game.s.phase !== 'over'; i++) { a.update(game.s, S.DT); if (!game.ai) b.update(game.s, S.DT); advance(S.DT); }
  },
};
