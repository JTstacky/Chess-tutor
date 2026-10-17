// Touch controls (RECONSTRUCTED: the original is keyboard-only, see docs/re-gaps.md #63).
// A DOM layer over the page, shown in flight once the player has touched the screen. It produces
// the same engine commands as the keyboard (engine/input.js), so nothing in the engine knows about
// touch. Layout:
// - left thumb: a floating stick anywhere on the left. Point it where the ship should face; push
//   past half-way to thrust.
// - right thumb: FIRE, with secondary, target, land, jump and the rest arced around it. Buttons for
//   things the ship can't do (no secondary, afterburner, cloak; nothing to board) are hidden.
// - top-left: menu, pause, map, info, missions, hail (a column down the left edge on small landscape phones).
// - menu: the rarer commands (jettison, escorts, nav, cloak, self-destruct, art).
// - tapping a ship on the playfield targets it.
// - off the flight layer, dragging a finger scrolls lists and text like the mouse wheel.
// - off the flight layer, the top dialog's buttons (Buy, Sell, Done, Leave...) are repeated as big buttons in the
//   free strip beside or below the picture, and a tap near a small button on the picture counts as hitting it
//   (UI.click slop). The original screens themselves are drawn unchanged.
// The clusters sit in the free space beside (landscape) or below (portrait) the 4:3 game picture when
// there is room, otherwise over the playfield, never over the status bar.
import { CMD } from '../engine/input.js';
import { wrap } from '../engine/trig.js';
import { MOD } from '../engine/data.js';
import { hasOutfit, isDisabled } from '../engine/ships.js';
import { VIEW_W, VIEW_H, BAR_BLOCK } from './flight.js';

const CSS = `
#tc { position: fixed; inset: 0; z-index: 2; pointer-events: none; display: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; touch-action: none; font: 600 12px Geneva, Verdana, sans-serif; }
#tc .pad { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
#tc .b { position: absolute; box-sizing: border-box; border-radius: 50%; display: none; align-items: center; justify-content: center;
  pointer-events: auto; touch-action: none; color: #d0ffd0; background: rgba(0, 120, 0, 0.32); border: 2px solid rgba(110, 255, 110, 0.55);
  text-align: center; line-height: 1.05; letter-spacing: 0.02em; text-shadow: 0 1px 2px #000; }
#tc .b.on { background: rgba(40, 200, 40, 0.6); border-color: #a0ffa0; color: #fff; }
#tc .b.red { background: rgba(150, 0, 0, 0.4); border-color: rgba(255, 110, 110, 0.7); color: #ffd0d0; }
#tc .b.red.on { background: rgba(230, 30, 30, 0.7); }
#tc .b.small { background: rgba(0, 60, 20, 0.45); }
#tc .stick, #tc .knob { position: absolute; border-radius: 50%; pointer-events: none; display: none; box-sizing: border-box; }
#tc .stick { border: 2px solid rgba(110, 255, 110, 0.45); background: rgba(0, 80, 0, 0.18); }
#tc .knob { background: rgba(110, 255, 110, 0.45); border: 2px solid rgba(190, 255, 190, 0.7); }
#tc .knob.thrust { background: rgba(255, 200, 80, 0.6); border-color: #ffe0a0; }
#tc .menu { position: absolute; inset: 0; pointer-events: auto; display: none; background: rgba(0, 0, 0, 0.55); align-items: center; justify-content: center; }
#tc .menu .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; width: min(92vw, 640px); max-height: 88vh;
  overflow-y: auto; padding: 12px; box-sizing: border-box; background: #021; border: 1px solid #0a4; border-radius: 6px; }
#tc .menu h3 { grid-column: 1 / -1; margin: 4px 0 0; color: #8f8; font: 600 12px Geneva, Verdana, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
#tc .menu button { min-height: 46px; background: #133; color: #dfd; border: 1px solid #286; border-radius: 4px; font: 600 14px Geneva, Verdana, sans-serif;
  touch-action: none; }
#tc .menu button.on { background: #2a6a2a; }
#tc .menu button.red { background: #411; border-color: #a44; color: #fdd; }
@media (max-height: 440px) { #tc .menu h3 { display: none; } #tc .menu button { min-height: 40px; } #tc .menu .grid { gap: 6px; padding: 8px; } }
#tc .menu button.close { grid-column: 1 / -1; background: #021; position: sticky; top: -12px; z-index: 1; }
#tcdock { position: fixed; z-index: 2; display: none; gap: 8px; box-sizing: border-box; padding: 8px; overflow-y: auto; user-select: none;
  -webkit-user-select: none; touch-action: manipulation; }
#tcdock.col { flex-direction: column; justify-content: center; }
#tcdock.row { flex-wrap: wrap; align-content: center; justify-content: center; }
#tcdock button { min-height: 46px; padding: 4px 10px; background: #133; color: #efe; border: 1px solid #3a8; border-radius: 6px;
  font: 600 15px Geneva, Verdana, sans-serif; touch-action: manipulation; }
#tcdock.row button { flex: 1 1 110px; max-width: 200px; }
#tcdock button.on { background: #2a6a2a; }
#tcdock button:disabled { opacity: 0.35; }
`;

// Right cluster, measured from its bottom-right corner in units of u (x leftwards, y upwards):
// [centre x, centre y, radius].
const RIGHT = {
  fire: [1.0, 0.95, 0.75], eject: [1.0, 0.95, 0.75],
  sec: [2.5, 0.6, 0.5], wpn: [2.62, 1.55, 0.36],
  tgt: [0.8, 2.35, 0.55], ab: [1.85, 2.2, 0.46], cloak: [2.78, 2.55, 0.4],
  land: [0.72, 3.5, 0.48], jump: [1.82, 3.3, 0.48], board: [2.82, 3.5, 0.44],
  auto: [0.72, 4.55, 0.4], rev: [1.8, 4.35, 0.4], hail: [2.85, 4.55, 0.4],
};
const RIGHT_W = 3.3, RIGHT_H = 5.0;
// Full-screen layout in landscape: the same buttons in a wide, low arc under the status bar.
const WIDE = {
  fire: [1.0, 1.0, 0.85], eject: [1.0, 1.0, 0.85],
  sec: [2.6, 0.7, 0.55], wpn: [3.6, 0.55, 0.38], ab: [4.55, 0.7, 0.48], hail: [5.55, 0.75, 0.45],
  tgt: [2.3, 2.05, 0.55], land: [0.85, 2.75, 0.5], jump: [3.4, 1.75, 0.5], board: [4.45, 2.2, 0.46],
  auto: [2.0, 3.2, 0.42], rev: [3.05, 3.05, 0.42], cloak: [4.2, 3.1, 0.42],
};
const WIDE_W = 6.0, WIDE_H = 3.65;
const TOP = ['menu', 'pause', 'map', 'info', 'msn'];

export class Touch {
  constructor(app) {
    this.app = app; this.active = false;
    this.pressed = new Set();       // commands to press on the next engine step
    this.holds = new Map();         // pointerId -> held command
    this.stick = null; this.tap = new Map(); this.lastTgt = 0; this.ctx = {};
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    const root = this.root = el('div'); root.id = 'tc'; document.body.append(root);
    this.pad = el('div', 'pad', root);
    this.stickEl = el('div', 'stick', root); this.knobEl = el('div', 'knob', root);
    this.b = {};
    const def = (id, label, o = {}) => { const b = this.b[id] = el('div', 'b' + (o.cls ? ' ' + o.cls : ''), root); b.innerHTML = label; b.dataset.id = id; Object.assign(b, { def: o }); this.bindButton(b); };
    def('fire', 'FIRE', { held: CMD.FIRE_PRIMARY });
    def('eject', 'EJECT', { cmd: CMD.EJECT, cls: 'red' });
    def('sec', 'SEC', { held: CMD.FIRE_SECONDARY });
    def('wpn', 'NEXT<br>WPN', { cmd: CMD.SELECT_SECONDARY });
    def('tgt', 'TGT', { fn: () => this.target() });
    def('ab', 'BURN', { held: CMD.AFTERBURNER });
    def('board', 'BOARD', { cmd: CMD.BOARD });
    def('cloak', 'CLOAK', { cmd: CMD.CLOAK });
    def('land', 'LAND', { cmd: CMD.LAND });
    def('jump', 'JUMP', { fn: () => this.press(this.app.game.navSys < 0 ? CMD.MAP : CMD.JUMP) });
    def('auto', 'AUTO', { held: CMD.AUTOPILOT });
    def('rev', 'REV', { held: CMD.REVERSE });
    def('menu', '&#9776;', { fn: () => this.openMenu(), cls: 'small' });
    def('pause', 'II', { fn: () => { this.app.paused = !this.app.paused; this.app.last = performance.now(); }, cls: 'small' });
    def('map', 'MAP', { cmd: CMD.MAP, cls: 'small' });
    def('info', 'INFO', { cmd: CMD.PLAYER_INFO, cls: 'small' });
    def('msn', 'MSN', { cmd: CMD.MISSION_INFO, cls: 'small' });
    def('hail', 'HAIL', { cmd: CMD.COMMUNICATE, cls: 'small' });
    this.menu = el('div', 'menu', root);
    this.menu.addEventListener('pointerdown', e => { if (e.target === this.menu) this.closeMenu(); });
    this.bindPad();
    this.dockEl = el('div', '', document.body); this.dockEl.id = 'tcdock'; this.dockSig = ''; this.dockList = [];
    // The first touch anywhere turns the layer on; a mouse or pen never does.
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !this.active) { this.active = true; this.layout(); } }, true);
    // Off the flight layer (spaceport, dialogs, map) a finger dragged up or down scrolls like the mouse wheel.
    const cv = app.canvas; let drag = null;
    cv.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') drag = { id: e.pointerId, y: app.toLogical(e).y }; });
    cv.addEventListener('pointermove', e => {
      if (drag?.id !== e.pointerId) return;
      const q = app.toLogical(e), notch = 16;
      while (Math.abs(q.y - drag.y) >= notch) { const dir = q.y < drag.y ? 1 : -1; drag.y -= dir * notch; app.wheel(dir, q); }
    });
    const end = e => { if (drag?.id === e.pointerId) drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    addEventListener('resize', () => this.layout());
    addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
  }

  // ---------- input ----------
  press(c) { this.pressed.add(c); }
  buzz() { try { navigator.vibrate?.(8); } catch { } }
  bindButton(b) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId);
      const o = b.def; b.classList.add('on'); this.buzz(); this.app.assets?.unlock();
      if (o.held) this.holds.set(e.pointerId, o.held);
      if (o.cmd) this.press(o.cmd);
      o.fn?.();
    });
    const up = e => { b.classList.remove('on'); this.holds.delete(e.pointerId); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPad() {
    const p = this.pad;
    p.addEventListener('pointerdown', e => {
      e.preventDefault(); p.setPointerCapture?.(e.pointerId); this.app.assets?.unlock();
      this.tap.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      if (!this.stick && e.clientX < this.split) {
        const r = this.stickR;
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        Object.assign(this.stickEl.style, { display: 'block', width: 2 * r + 'px', height: 2 * r + 'px' });
        this.moveStick();
      }
    });
    p.addEventListener('pointermove', e => {
      const s = this.stick; if (s?.id !== e.pointerId) return;
      s.x = e.clientX; s.y = e.clientY;
      // the base follows a thumb that slides past its rim
      const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy), R = this.stickR * 1.25;
      if (m > R) { s.ox = s.x - dx * R / m; s.oy = s.y - dy * R / m; }
      this.moveStick();
    });
    const up = e => {
      const t = this.tap.get(e.pointerId); this.tap.delete(e.pointerId);
      if (this.stick?.id === e.pointerId) { this.stick = null; this.stickEl.style.display = this.knobEl.style.display = 'none'; }
      if (e.type === 'pointerup' && t && performance.now() - t.t < 300 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 14) this.tapShip(e);
    };
    p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
  }
  moveStick() {
    const s = this.stick, r = this.stickR, k = 0.42 * r;
    Object.assign(this.stickEl.style, { left: s.ox - r + 'px', top: s.oy - r + 'px' });
    const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy), c = Math.min(1, r / Math.max(m, 1));
    Object.assign(this.knobEl.style, { display: 'block', width: 2 * k + 'px', height: 2 * k + 'px', left: s.ox + dx * c - k + 'px', top: s.oy + dy * c - k + 'px' });
    this.knobEl.classList.toggle('thrust', m > 0.55 * r);
  }
  // TGT: the nearest ship; tapped again within 1.5 s, the next one (R, then Tab).
  target() {
    const now = performance.now(), P = this.app.game?.player;
    this.press(now - this.lastTgt < 1500 && P?.target >= 0 ? CMD.TARGET_SELECT : CMD.CLOSEST_TARGET);
    this.lastTgt = now;
  }
  // A tap on a ship in the playfield targets it.
  tapShip(e) {
    const g = this.app.game, P = g?.player; if (!P) return;
    const v = this.app.flight?.view ?? { w: VIEW_W, h: VIEW_H }, cv = this.app.canvas;
    const q = this.app.toCanvas(e); if (q.x < 0 || q.x >= v.w || q.y < 0 || q.y >= v.h) return;
    const ox = v.w / 2 - P.x, oy = v.h / 2 - P.y, scale = cv.getBoundingClientRect().width / cv.width || 1;
    let best = -1, bd = Infinity;
    for (const t of g.ships) {
      if (!g.targetable(t)) continue;
      const sp = g.data.sprite(t.type);
      const r = Math.max(sp?.w ?? 24, sp?.h ?? 24) / 2 + 22 / scale, d = Math.hypot(t.x + ox - q.x, t.y + oy - q.y);
      if (d < r && d < bd) { bd = d; best = t.slot; }
    }
    if (best >= 0 && best !== P.target) { this.pickSlot = best; this.buzz(); }
  }

  // Merge touch state into one engine step of input.
  apply(input) {
    if (!this.active) return;
    for (const c of this.pressed) { input.pressed.add(c); input.held.add(c); }
    this.pressed.clear();
    for (const c of this.holds.values()) input.held.add(c);
    const g = this.app.game, P = g?.player, s = this.stick;
    if (this.pickSlot != null) {
      const t = g?.ships[this.pickSlot];
      if (P && g.targetable(t)) { P.target = t.slot; g.emit({ type: 'sound', id: 150 }); }   // as the target keys (game.closestTarget)
      this.pickSlot = null;
    }
    if (!P || !s) return;
    const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy), r = this.stickR;
    if (m < 0.18 * r) return;
    if (m > 0.55 * r) input.held.add(CMD.ACCELERATE);
    // AUTO and REV steer by themselves; the stick is then only the throttle
    if (input.held.has(CMD.AUTOPILOT) || input.held.has(CMD.REVERSE)) return;
    const want = wrap(Math.round(Math.atan2(dx, -dy) * 180 / Math.PI));
    const diff = wrap(want - P.facing), turn = Math.max(1, P.stats.turn);
    if (diff > turn / 2 && diff < 180) input.held.add(CMD.RIGHT);
    else if (diff >= 180 && 360 - diff > turn / 2) input.held.add(CMD.LEFT);
  }

  // ---------- layout ----------
  layout() {
    if (!this.active) return;
    if (this.app.full) return this.layoutFull();
    const W = innerWidth, H = innerHeight, main = this.app.canvas.parentElement;
    let c = this.app.canvas.getBoundingClientRect();
    let u = Math.round(Math.max(44, Math.min(74, Math.min(W, H) * 0.13)));
    // Neither side strip holds the cluster but both together do: move the game picture to the left edge.
    const spare = W - c.width, needW = (RIGHT_W + 0.15) * 40;
    const toLeft = spare / 2 < (RIGHT_W + 0.15) * u && spare >= needW && H - c.height < RIGHT_H * u;
    if (main && main.style.justifyContent !== (toLeft ? 'flex-start' : '')) { main.style.justifyContent = toLeft ? 'flex-start' : ''; c = this.app.canvas.getBoundingClientRect(); }
    const side = W - c.right, below = H - c.bottom;
    // a side strip a little too narrow for the cluster: shrink the buttons to fit it (not below 40 px)
    if (side < (RIGHT_W + 0.15) * u && side >= (RIGHT_W + 0.15) * 40 && below < RIGHT_H * u) u = Math.floor(side / (RIGHT_W + 0.15));
    this.u = u;
    this.canvasScale = c.width / this.app.canvas.width || 1;
    const fieldR = c.left + c.width * VIEW_W / 640;     // right edge of the playfield: the status bar stays clear
    // right cluster: in the free strip right of or below the game when it fits, else over the playfield
    let ax = W - 0.15 * u, ay = H - 0.15 * u;
    if (side < (RIGHT_W + 0.15) * u && below < RIGHT_H * u) ax = Math.min(ax, fieldR - 0.1 * u);
    const place = (b, x, y, r) => Object.assign(b.style, { left: x - r + 'px', top: y - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', fontSize: Math.round(Math.max(11, r * 0.42)) + 'px' });
    for (const [id, [x, y, r]] of Object.entries(RIGHT)) place(this.b[id], ax - x * u, ay - y * u, r * u);
    // top-left: in the left strip (two or more columns) when it is wide enough, else one row
    // (with no strip: one column down the left edge in landscape, one row along the top in portrait)
    const r = 0.42 * u, step = 1.0 * u, top = TOP.filter(id => this.b[id].shown !== false);
    const cols = c.left > 2.1 * u ? Math.max(2, Math.min(top.length, Math.floor((c.left - 0.1 * u) / step))) : W > H ? 1 : top.length;
    top.forEach((id, i) => place(this.b[id], 0.12 * u + r + (i % cols) * step, 0.12 * u + r + Math.floor(i / cols) * step, r));
    this.topBottom = 0.12 * u + Math.ceil(top.length / cols) * step;
    this.split = Math.min(W * 0.5, ax - RIGHT_W * u);
    this.stickR = Math.round(1.05 * u);
    this.barRect = { left: fieldR, top: c.top, right: c.right, bottom: c.bottom };
  }
  // Full-screen layout: the canvas fills the window and the status bar is in its top-right corner
  // (flight.js BAR_PARTS). Every button is on the right: the action cluster under the bar, and the small
  // buttons in the space left of the bar (landscape) or in a row under it (portrait). The left half is the stick's.
  layoutFull() {
    const W = innerWidth, H = innerHeight, main = this.app.canvas.parentElement;
    if (main && main.style.justifyContent) main.style.justifyContent = '';
    const c = this.app.canvas.getBoundingClientRect();
    const k = Math.min(c.width, c.height) / 480;   // CSS px per canvas px in flight (480 on the short side)
    const bar = this.barRect = { left: c.right - BAR_BLOCK.w * k, top: c.top, right: c.right, bottom: c.top + BAR_BLOCK.h * k };
    const wide = W > H, L = wide ? WIDE : RIGHT, LW = wide ? WIDE_W : RIGHT_W, LH = wide ? WIDE_H : RIGHT_H;
    const place = (b, x, y, r) => Object.assign(b.style, { left: x - r + 'px', top: y - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px', fontSize: Math.round(Math.max(11, r * 0.42)) + 'px' });
    const top = TOP.filter(id => this.b[id].shown !== false);
    let u, us;
    if (wide) {
      u = Math.floor(Math.max(40, Math.min(84, (H - bar.bottom - 8) / (LH + 0.15), W * 0.55 / (LW + 0.15))));
      us = Math.round(Math.min(56, Math.max(40, u * 0.8)));
    } else {
      us = Math.round(Math.min(56, Math.max(40, W * 0.13)));
      u = Math.floor(Math.max(40, Math.min(84, W * 0.17, (H - bar.bottom - us * 1.3) / (LH + 0.15))));
    }
    this.u = u; this.canvasScale = k;
    const ax = c.right - 0.15 * u, ay = c.bottom - 0.15 * u;
    for (const [id, [x, y, r]] of Object.entries(L)) place(this.b[id], ax - x * u, ay - y * u, r * u);
    for (const id of Object.keys(this.b)) if (!(id in L) && !TOP.includes(id)) this.b[id].style.left = '-999px';
    const r = 0.44 * us, step = us;
    if (wide) {
      // a grid right to left from the bar's left edge, as many rows as fit above the cluster
      const clusterTop = ay - LH * u, rows = Math.max(1, Math.floor((clusterTop - c.top - 0.1 * us) / step));
      top.forEach((id, i) => place(this.b[id], bar.left - 0.1 * us - r - Math.floor(i / rows) * step, c.top + 0.1 * us + r + (i % rows) * step, r));
    } else top.forEach((id, i) => place(this.b[id], c.right - 0.1 * us - r - i * step, bar.bottom + 0.15 * us + r, r));
    this.topBottom = wide ? bar.bottom : bar.bottom + 0.2 * us + step;
    this.split = Math.min(W * 0.5, ax - LW * u);
    this.stickR = Math.round(1.1 * u);
  }

  // Called every frame: show the layer in flight only, and only the buttons that do something now.
  update() {
    const a = this.app, g = a.game, P = g?.player;
    const flying = this.active && a.screen?.flight && P && !a.dialogs.length && !a.anim;
    this.root.style.display = flying ? 'block' : 'none';
    const sh = document.getElementById('show'); if (sh && this.active) sh.style.visibility = flying ? 'hidden' : '';   // the key-list button is no use in touch flight
    if (!flying) {
      this.holds.clear(); this.stick = null; this.stickEl.style.display = this.knobEl.style.display = 'none'; if (this.menuOpen) this.closeMenu();
      if (this.active) {
        const key = `${innerWidth}x${innerHeight}:${+this.app.full}`;
        if (!this.layoutFor?.startsWith(key)) { this.layoutFor = key; this.layout(); }
      }
      this.dock();
      return;
    }
    this.dock(true);
    const D = g.data, own = g.pilot.outfits, dying = P.death > 0, paused = a.paused;
    const T = P.target >= 0 ? g.ships[P.target] : null;
    const show = {
      fire: !dying, eject: dying && hasOutfit(D, own, MOD.POD),
      sec: !dying && Object.keys(P.weapons).some(id => D.weap[id]?.MiscFlags & 2),
      tgt: !dying, ab: !dying && hasOutfit(D, own, MOD.AFTERBURNER), board: !dying && !!T?.alive && isDisabled(T),
      cloak: !dying && hasOutfit(D, own, MOD.CLOAK), land: !dying, jump: !dying,
      auto: !dying && !!g.navTargetPos(P), rev: !dying,
      menu: true, pause: true, map: true, info: true, msn: g.pilot.missions.some(Boolean), hail: !dying,
    };
    show.wpn = show.sec;
    for (const [id, b] of Object.entries(this.b)) {
      const on = paused ? id === 'pause' : show[id];
      if (b.shown !== on) { b.shown = on; b.style.display = on ? 'flex' : 'none'; }
    }
    // re-place when the window or the set of top buttons changes (hidden ones leave no gap)
    const key = `${innerWidth}x${innerHeight}:${+this.app.full}:${TOP.map(id => +!!this.b[id].shown).join('')}`;
    if (this.layoutFor !== key) { this.layoutFor = key; this.layout(); }
    this.b.pause.innerHTML = paused ? '&#9654;' : 'II';
    this.pad.style.display = paused ? 'none' : 'block';
  }

  // Tap slop for UI.click, in canvas pixels: about 22 screen px at the current scale, at most 16.
  slop() {
    const f = this.app.frameRect(), k = f.width / (this.app.frameSize?.[0] ?? 640) || 1;   // CSS px per screen px
    return Math.round(Math.min(16, Math.max(6, 22 / k)));
  }

  // ---------- big-button panel for shops and dialogs ----------
  dock(hide = false) {
    const D = this.dockEl, ui = this.app.ui;
    const strip = hide || !this.active || !ui ? null : this.dockStrip();
    const top = strip ? ui.topLayer() : 0;
    const list = strip ? ui.buttons.filter(b => b.label && b.at > top).sort((a, b) => a.y - b.y || a.x - b.x) : [];
    if (!list.length) { if (D.style.display !== 'none') { D.style.display = 'none'; this.dockSig = ''; } return; }
    this.dockList = list;
    const sig = strip.key + '|' + list.map(b => b.label + (b.enabled ? '' : '~')).join('|');
    if (sig === this.dockSig) return;
    this.dockSig = sig;
    D.className = strip.col ? 'col' : 'row';
    Object.assign(D.style, { display: 'flex', left: strip.x + 'px', top: strip.y + 'px', width: strip.w + 'px', height: strip.h + 'px' });
    D.innerHTML = '';
    list.forEach((b, i) => {
      const e = el('button', '', D); e.textContent = b.label; e.disabled = !b.enabled;
      e.addEventListener('pointerdown', ev => { ev.preventDefault(); e.classList.add('on'); this.buzz(); this.app.assets?.unlock(); });
      const up = ev => {
        e.classList.remove('on'); if (ev.type !== 'pointerup') return;
        const cur = this.dockList[i];   // the closures change every frame: take this frame's
        if (cur && cur.label === b.label && cur.enabled) { cur.onClick?.(); this.app.canvas.focus(); }
      };
      e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up); e.addEventListener('pointerleave', () => e.classList.remove('on'));
    });
  }
  // The largest free strip around the game picture, or null when there is none worth using (a tablet's
  // picture is big enough to tap directly).
  dockStrip() {
    const W = innerWidth, H = innerHeight, c = this.app.frameRect();
    const opts = [
      { col: true, x: c.right, y: 0, w: W - c.right, h: H },
      { col: true, x: 0, y: 0, w: c.left, h: H },
      { col: false, x: 0, y: c.bottom, w: W, h: H - c.bottom },
      { col: false, x: 0, y: 0, w: W, h: c.top },
    ].filter(o => o.col ? o.w >= 120 : o.h >= 110);
    if (!opts.length) return null;
    const o = opts.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (o.col) o.w = Math.min(o.w, 260), o.x = o.x === 0 ? c.left - o.w : o.x;
    else o.h = Math.min(o.h, 220), o.y = o.y === 0 ? c.top - o.h : o.y;
    o.key = [o.x, o.y, o.w, o.h].map(Math.round).join(',');
    return o;
  }

  // ---------- menu ----------
  openMenu() {
    const a = this.app, g = a.game, P = g.player, D = g.data, own = g.pilot.outfits;
    const m = this.menu; m.innerHTML = ''; this.menuOpen = true; m.style.display = 'flex';
    const grid = el('div', 'grid', m);
    const head = t => { el('h3', '', grid).textContent = t; };
    const item = (label, act, o = {}) => {
      const b = el('button', o.cls ?? '', grid); b.textContent = label;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); b.setPointerCapture?.(e.pointerId); this.buzz(); b.classList.add('on');
        if (o.held) { this.holds.set(e.pointerId, o.held); return; }
        act(); if (!o.stay) this.closeMenu();
      });
      const up = e => { b.classList.remove('on'); this.holds.delete(e.pointerId); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    };
    const cmd = c => () => this.press(c);
    item('Close ✕', () => { }, { cls: 'close' });   // first and sticky, so it is reachable on a short screen
    head('Navigation');
    item('Next system', () => { if (g.navMode !== 3) this.press(CMD.HYPER_MODE); this.press(CMD.HYPER_SELECT); });
    item('Nearest planet', cmd(CMD.NAV_NEAREST));
    item('Hail planet', cmd(CMD.HAIL_PLANET));
    item('Nav off', cmd(CMD.NAV_OFF));
    head('Weapons');
    item('Next target', cmd(CMD.TARGET_SELECT));
    if (Object.keys(P.weapons).some(id => D.weap[id]?.MiscFlags & 2)) item('Weapons safe', cmd(CMD.WEAPON_SAFETY));
    if (hasOutfit(D, own, MOD.CLOAK)) item('Cloak', cmd(CMD.CLOAK));
    if (g.hasEscorts()) {
      head('Escorts');
      item('Attack my target', cmd(CMD.RETARGET));
      item('Formation', cmd(CMD.RECALL));
      item('Hold position', cmd(CMD.HOLD));
      item('Recall fighters', cmd(CMD.RECALL_FIGHTERS));
    }
    const cargo = g.pilot.cargo.some(n => n > 0) || Object.values(g.pilot.junk ?? {}).some(n => n > 0);
    const missionCargo = g.pilot.missions.some(x => x?.active && x.loaded && x.cargoType != null && x.cargoType !== -1);
    if (cargo || missionCargo) {
      head('Cargo');
      if (cargo) item('Jettison cargo', cmd(CMD.JETTISON_NONMISSION));
      if (missionCargo) item('Jettison all, mission cargo too', cmd(CMD.JETTISON), { cls: 'red' });
    }
    head('Ship');
    item('Self-destruct (hold)', null, { held: CMD.DESTRUCT, cls: 'red' });
    item(`Art: ${a.art === 'hd' ? 'HD' : 'Original'}`, () => a.setArt(a.art === 'hd' ? 'original' : 'hd'));
    item(`Layout: ${a.full ? 'Full screen' : 'Classic'}`, () => a.setLayout(a.full ? 'classic' : 'full'));
    if (document.fullscreenEnabled) item(document.fullscreenElement ? 'Leave full screen' : 'Full screen',
      () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { }));
    item('Credits', () => globalThis.evCredits?.(true));
  }
  closeMenu() { this.menuOpen = false; this.menu.style.display = 'none'; this.menu.innerHTML = ''; for (const [k, c] of this.holds) if (c === CMD.DESTRUCT) this.holds.delete(k); }
}

function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; }
