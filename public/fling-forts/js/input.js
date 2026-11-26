// input.js — multi-touch: every pointer belongs to the side of the screen where it went down (left player /
// right player), tracked by pointerId, so both can drag and tap at the same time. Also blocks the browser's
// own touch gestures.
import { powerCost, upgradePower, autoBuild, freeSlots, slotCount as S_COUNT, W, AMMO, BUILD, UNIT, launch, fire, setAmmo, build, send, placeOk, costFor, shotCost, gateX, isOpen, unlockAt, heroOk, ultReady, ultimate } from './sim.js';
import { screenToWorld, buttonAt, keyFor, pickHit, PAUSE } from './view.js';

export const PULL_MAX = 300;      // world units of pull for full power
const TAP_SLOP = 26;              // a press that moves less than this is a tap
const NAME_HOLD = 0.35;           // seconds a finger rests on a control-strip button before its name shows (ui.held)
const PAUSE_HOLD = 0.35;          // seconds the pause button must be held, so a stray touch cannot pause the match

export function blockBrowserGestures(doc = document) {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  const opts = { passive: false };
  const notUi = (fn) => (e) => { if (!(e.target.closest && e.target.closest('button, a, input, label'))) fn(e); };
  doc.addEventListener('touchstart', notUi(stop), opts);
  // menus that are taller than the screen (Help on a small phone) still scroll: the page blocks every browser drag, so
  // a one-finger drag inside a scrollable panel scrolls it by hand
  let panel = null, lastY = 0;
  const scroller = (el) => { for (let n = el; n && n !== doc.body; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n; return null; };
  doc.addEventListener('touchstart', (e) => { panel = e.touches.length === 1 && e.target.closest ? scroller(e.target) : null; if (panel) lastY = e.touches[0].clientY; }, opts);
  doc.addEventListener('touchmove', (e) => { stop(e); if (panel && e.touches.length === 1) { const y = e.touches[0].clientY; panel.scrollTop += lastY - y; lastY = y; } }, opts);
  doc.addEventListener('touchend', notUi(stop), opts);
  for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) doc.addEventListener(t, stop, opts);
  doc.addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, opts);
  doc.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) stop(e); });
}

export function attachInput(canvas, game) {
  const { ui } = game;
  const toast = (p, text) => { ui.toast[p] = { text, until: game.now() + 1.6 }; };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return screenToWorld(game.lay, e.clientX - r.left, e.clientY - r.top); };

  function aimFrom(a) {
    const dx = a.sx - a.x, dy = a.sy - a.y;            // pull back to fling forward
    const len = Math.hypot(dx, dy);
    if (!launch(a.p, dx, dy, 0.5)) return null;
    return { dx, dy, power: Math.min(1, len / PULL_MAX), len };
  }

  function pressButton(p, b) {
    const s = game.s, pl = s.players[p], key = keyFor(s, p, b);
    if (!key) return;
    const clock = (t) => { const w = Math.ceil(t); return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`; };
    if (b.kind === 'power') {
      const c = powerCost(s, p);
      if (c == null) return toast(p, 'Fling shot power is at its top level');
      if (pl.gold < c) return toast(p, `Power level ${(pl.power || 0) + 1} needs ${c} gold`);
      if (upgradePower(s, p)) { game.sound('click'); toast(p, `Fling shot power: level ${pl.power}`); }
      return;
    }
    if (b.kind === 'ult') {
      if (pl.ultUsed) return toast(p, 'Ultimate used this round');
      if (!ultReady(s, p)) return toast(p, `Ultimate charging: ${Math.floor(pl.ult * 100)}%`);
      ultimate(s, p); return;
    }
    if (!isOpen(s, p, key)) return toast(p, `Unlocks in ${clock(Math.max(0, unlockAt(s, p, key) - s.roundT))}`);
    const cost = costFor(s, p, key);
    if (b.kind === 'hero') {
      if (pl.heroCd > 0) return toast(p, `Hero back in ${Math.ceil(pl.heroCd)} s`);
      if (!heroOk(s, p)) return toast(p, 'Your hero is already out');
      if (pl.gold < cost) return toast(p, `${UNIT[key].name} needs ${cost} gold`);
      send(s, p, key, gateX(p)); return;
    }
    if (b.kind === 'ammo') {
      const free = key !== 'stone' && pl.freeShots > 0;
      if (!free && pl.gold < cost) return toast(p, `${AMMO[key].name} needs ${cost} gold`);
      setAmmo(s, p, key); ui.armed[p] = null; game.sound('click');
      return;
    }
    if (pl.gold < cost) return toast(p, `${(BUILD[key] || UNIT[key]).name} needs ${cost} gold`);
    if (b.kind === 'unit') { if (send(s, p, key, gateX(p))) ui.armed[p] = null; return; }       // troops march out of the gate at once
    if (key === 'shield') {
      if (s.phase === 'sudden') return toast(p, 'No shields in sudden death');
      if (!build(s, p, 'shield', 0)) toast(p, 'Your shield is already up');
      return;
    }
    if (key === 'vault') { if (!build(s, p, 'vault', 0)) toast(p, 'Your vault is already built'); return; }
    if (!freeSlots(s, p)) return toast(p, `All ${S_COUNT(s, p)} building spots are full`);
    // one tap builds (owner, 2026-11-25): no second tap on the ground
    ui.armed[p] = null;
    if (autoBuild(s, p, key)) game.sound('click'); else toast(p, `No room for another ${BUILD[key].name.toLowerCase()}`);
  }

  function place(p, x) {
    const s = game.s, k = ui.armed[p];
    if (!k) return;
    if (build(s, p, k, x)) { ui.armed[p] = null; return; }
    if (s.players[p].gold < costFor(s, p, k)) { toast(p, 'Not enough gold'); ui.armed[p] = null; }
    else if (!placeOk(s, p, k, x)) toast(p, 'Not there: tap the bright strip');
  }

  function down(e) {
    e.preventDefault();
    const w = pos(e), p = w.x < W / 2 ? 0 : 1;
    if (game.state === 'pick') {                                   // both players choose at once
      if (game.s.mode === 'solo' && p === 1) return;
      const hit = pickHit(p, w.x, w.y);
      if (hit?.race && !ui.pick.ready[p]) { ui.pick.race[p] = hit.race; game.sound('click'); }
      else if (hit?.ready && ui.pick.race[p]) { ui.pick.ready[p] = !ui.pick.ready[p]; game.sound('click'); game.pickChanged(); }
      return;
    }
    if (!game.playing()) return;
    const live = game.s.phase === 'play' || game.s.phase === 'sudden';
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (Math.hypot(w.x - PAUSE.x, w.y - PAUSE.y) < PAUSE.r + 10) { ui.aims.set(e.pointerId, { p, kind: 'pause', at: game.now() }); ui.pauseHold = game.now(); return; }
    if (game.s.mode === 'solo' && p === 1) return;                 // the computer's side
    if (!live) return;                                             // between rounds: nothing to aim or buy
    if (w.y < 0) {                                                 // the control strip under the ground
      const b = buttonAt(p, w.x, w.y);
      if (b) pressButton(p, b);
      ui.aims.set(e.pointerId, { p, kind: 'button', b, at: game.now() });
      return;
    }
    game.unlockAudio();
    ui.aims.set(e.pointerId, { p, kind: 'field', sx: w.x, sy: w.y, x: w.x, y: w.y, moved: false, aim: null });
  }

  function move(e) {
    const a = ui.aims.get(e.pointerId);
    if (a && a.kind === 'pause') { const w = pos(e); if (Math.hypot(w.x - PAUSE.x, w.y - PAUSE.y) > PAUSE.r + 18) { ui.aims.delete(e.pointerId); ui.pauseHold = 0; } return; }
    if (!a || a.kind !== 'field') return;
    e.preventDefault();
    const w = pos(e);
    a.x = w.x; a.y = w.y;
    if (!a.moved && Math.hypot(a.x - a.sx, a.y - a.sy) > TAP_SLOP) a.moved = true;
    a.aim = a.moved ? aimFrom(a) : null;
  }

  function up(e) {
    const a = ui.aims.get(e.pointerId);
    if (!a) return;
    ui.aims.delete(e.pointerId);
    if (a.kind === 'button') { clearHeld(a); return; }
    if (a.kind === 'pause') { ui.pauseHold = 0; const w = pos(e); if (Math.hypot(w.x - PAUSE.x, w.y - PAUSE.y) < PAUSE.r + 18) game.pause(); return; }   // a tap pauses (owner: holding was not obvious); sliding off cancels
    if (a.kind !== 'field' || !game.playing()) return;
    e.preventDefault();
    if (!a.moved) { place(a.p, a.sx); return; }
    const aim = aimFrom(a);
    if (!aim || aim.power < 0.05) return;
    const s = game.s, pl = s.players[a.p];
    if (pl.reload > 0) { toast(a.p, 'Reloading…'); return; }
    if (pl.gold < shotCost(s, a.p)) { setAmmo(s, a.p, 'stone'); toast(a.p, 'Out of gold: stones loaded'); return; }
    if (fire(s, a.p, aim.dx, aim.dy, aim.power)) ui.kick[a.p] = 1;
  }
  function cancel(e) { const a = ui.aims.get(e.pointerId); if (a?.kind === 'pause') ui.pauseHold = 0; if (a?.kind === 'button') clearHeld(a); ui.aims.delete(e.pointerId); }
  // a finger resting on a control-strip button: ui.held = { p, key, b } so view.js can show the button's name (phones show no names)
  function clearHeld(a) { if (ui.held && ui.held.aim === a) ui.held = null; }

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', move, { passive: false });
  canvas.addEventListener('pointerup', up, { passive: false });
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  return {
    /** called every frame: the pause button only works when held */
    tick() {
      if (ui.held && ![...ui.aims.values()].includes(ui.held.aim)) ui.held = null;   // touches cleared (pause, new match)
      for (const a of ui.aims.values()) if (a.kind === 'button' && a.b && !ui.held && game.now() - a.at > NAME_HOLD) ui.held = { p: a.p, key: keyFor(game.s, a.p, a.b), slot: a.b.key, b: a.b, aim: a };
      for (const a of ui.aims.values()) if (a.kind === 'pause' && game.now() - a.at > PAUSE_HOLD) { ui.pauseHold = 0; game.pause(); return; } },
  };
}
