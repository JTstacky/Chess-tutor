// The title screen's Preferences (DLOG 4001, FUN_1004d884 / filter FUN_1004dfd8 / draw FUN_1004e2d4),
// Game Speed (DLOG 4002, FUN_1004e5d0 / draw FUN_1004e8e4), About (FUN_1004bacc / scroller
// FUN_1004b0a8) and Open Pilot (StandardGetFile, an OS dialog: RECONSTRUCTED, docs/re-gaps.md).
import { MAC_FONT, FONT } from './ui.js';
import { DEFAULT_KEYS, PREF_SLOTS, keyNumber } from './keys.js';

const STORE = 'evonline.prefs';
// Pref record (+0 intro music, +1 the byte the dialog keeps but never shows, +4 volume 0-8; keys at
// +0x2c..; speed S in DAT_1007f8c0). Defaults: FUN_1005ccf0 keys, volume 3, music on, S = 1.
export function loadPrefs(evo) {
  const p = { keys: DEFAULT_KEYS.slice(), volume: 3, music: true, speed: 1, quickdraw: false, movies: true };
  try {
    const v = JSON.parse(localStorage.getItem(STORE + (evo ? '.evo' : '')));
    if (v) {
      if (Array.isArray(v.keys) && v.keys.length === PREF_SLOTS.length) p.keys = v.keys.map(n => n | 0);
      for (const k of ['volume', 'speed']) if (typeof v[k] === 'number') p[k] = v[k];
      for (const k of ['music', 'quickdraw', 'movies']) if (typeof v[k] === 'boolean') p[k] = v[k];
    }
  } catch { }
  return p;
}
export function savePrefs(p, evo) { try { localStorage.setItem(STORE + (evo ? '.evo' : ''), JSON.stringify(p)); } catch { } }
// FUN_1006d76c: steps above 7 play at 7; output volume (v << 8) / 7 of 0x100.
export const volumeGain = v => Math.trunc(Math.max(0, Math.min(7, v)) * 256 / 7) / 256;

// FUN_10063c34: slot i's key may not equal another slot's key, ignoring Jettison (23), Eject (25) and
// Destruct (26) on the first pass; then it may not equal the key of slot 23, 25 or 26 (24 excepted).
// Those three are Command combinations, so they may share a key with a plain command but not with
// each other. Returns the first slot in conflict, or -1.
export function keyConflict(keys) {
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) if (keys[i] === keys[j] && j !== i && j !== 23 && j !== 25 && j !== 26) return i;
    for (let j = 23; j <= 26; j++) if (keys[i] === keys[j] && j !== i && j !== 24) return i;
  }
  return -1;
}
// FUN_100638f0 never takes these key numbers.
const NOT_KEYS = new Set([0x1a, 0x1b, 0x1c, 0x1d, 0x77, 0x31, 0x72, 0x70, 0x7e, 0x6b, 0x68]);
// The click-and-hold popup (EV only): Shift, Control, Option, Command.
const MODIFIERS = [['Shift', 0x30], ['Control', 0x33], ['Option', 0x32], ['Command', 0x3f]];

const TX = 96, TY = 72;
// proc-1 windows positioned 0x280a: centred on the 640x480 screen (the title canvas has a margin).
function place(L) { return { x: TX + Math.ceil((640 - L.w) / 2) - 1, y: TY + Math.ceil((480 - L.h) / 2) - 1 }; }

export class PrefsDialog {
  constructor(app, onClose) {
    this.app = app; this.onClose = onClose; this.L = app.data.ui[4001];
    Object.assign(this, place(this.L));
    const P = app.prefs;
    this.keys = P.keys.slice(); this.sel = 0; this.volume = P.volume; this.music = P.music;
    this.speed = Math.trunc(100 * P.speed - 50);   // DAT_1007aa80 * S + DAT_1007aa88
    this.quickdraw = P.quickdraw; this.movies = P.movies;
    this.pressed = null; this.popup = null; this.speedDialog = null;
    app.assets.preloadPicts?.([132, 134, 135, 136, 137, 400, 401]);
  }
  r(n) { const i = this.L.items[n]; return { x: this.x + i.x, y: this.y + i.y, w: i.w, h: i.h }; }
  keyName(n) { return this.app.data.appStrings?.[129]?.[n] || 'Unknown'; }
  draw(ctx, ui) {
    const A = this.app.assets, D = this.app.data, evo = D.evo;
    ui.hit(0, 0, 832, 624, () => { });
    ui.macWindow(ctx, this.x, this.y, this.L.w, this.L.h);
    const pic = A.pict(132), p = this.r(34);
    if (pic) ctx.drawImage(pic, p.x, p.y);
    ctx.font = MAC_FONT; ctx.textBaseline = 'alphabetic';
    for (let i = 3; i <= 33; i++) {
      const r = this.r(i), slot = i - 3, on = slot === this.sel;
      if (on) {
        ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.fillStyle = '#000'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      } else {
        ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.clip();
      ctx.fillStyle = on ? '#fff' : '#000'; ctx.fillText(this.keyName(this.keys[slot]), r.x + 5, r.y + 15);
      ctx.restore();
      ui.hit(r.x, r.y, r.w, r.h, () => {
        // FUN_1004dfd8: a press on the selected box held past the double-click time opens the popup.
        if (slot === this.sel && !evo) { this.holdStart = performance.now(); ui.up = () => { this.holdStart = null; }; }
        this.sel = slot;
      });
    }
    if (this.holdStart && ui.mouse.down && performance.now() - this.holdStart > 500 && !this.popup) {
      this.popup = { x: ui.mouse.x, y: ui.mouse.y };
      ui.up = () => {
        const k = this.popupItem(ui); if (k >= 0) this.keys[this.sel] = MODIFIERS[k][1];
        this.popup = null; this.holdStart = null;
      };
    }
    ui.macText(ctx, 'Sound Volume:', this.r(36));
    ui.macText(ctx, D.appStrings?.[136]?.[this.volume] ?? '', this.r(37));
    const now = performance.now();
    const arrow = (item, up, normal, down) => {
      const r = this.r(item), img = A.pict(this.pressed?.item === item && now < this.pressed.until ? down : normal);
      if (img) ctx.drawImage(img, r.x, r.y);
      ui.hit(r.x, r.y, r.w, r.h, () => this.stepVolume(item, up));
    };
    arrow(39, true, 134, 136); arrow(38, false, 135, 137);
    ui.macCheckbox(ctx, 'Intro Music', this.r(40), this.music, () => (this.music = !this.music));
    if (evo) {
      ui.macCheckbox(ctx, this.L.items[2].text, this.r(2), this.quickdraw, () => (this.quickdraw = !this.quickdraw));
      ui.macCheckbox(ctx, this.L.items[41].text, this.r(41), this.movies, () => (this.movies = !this.movies));
    }
    ui.macButton(ctx, 'Game Speed…', this.r(42), () => (this.speedDialog = new SpeedDialog(this)));
    ui.macButton(ctx, 'Cancel', this.r(35), () => this.close(false));
    ui.macButton(ctx, 'OK', this.r(1), () => this.ok(), true);
    if (this.popup) this.drawPopup(ctx, ui);
    if (this.speedDialog) this.speedDialog.draw(ctx, ui);
  }
  popupItem(ui) {
    const p = this.popup, w = 90, h = 16;
    const { x, y } = ui.mouse;
    if (x < p.x || x >= p.x + w) return -1;
    const i = Math.floor((y - p.y - 2) / h);
    return i >= 0 && i < MODIFIERS.length ? i : -1;
  }
  drawPopup(ctx, ui) {
    const p = this.popup, w = 90, h = 16, k = this.popupItem(ui);
    ctx.fillStyle = '#000'; ctx.fillRect(p.x - 1, p.y - 1, w + 3, MODIFIERS.length * h + 7);
    ctx.fillStyle = '#dedede'; ctx.fillRect(p.x, p.y, w, MODIFIERS.length * h + 4);
    ctx.font = MAC_FONT; ctx.textBaseline = 'alphabetic';
    MODIFIERS.forEach(([t], i) => {
      if (i === k) { ctx.fillStyle = '#000'; ctx.fillRect(p.x, p.y + 2 + i * h, w, h); }
      ctx.fillStyle = i === k ? '#fff' : '#000'; ctx.fillText(t, p.x + 14, p.y + 2 + i * h + 12);
    });
  }
  // Items 39 (up) and 38 (down): the pressed picture for a moment, then one step and Beep5 (the
  // new volume), or the system beep at either end.
  stepVolume(item, up) {
    this.pressed = { item, until: performance.now() + 133 };
    const v = this.volume + (up ? 1 : -1);
    if (v < 0 || v > 8) { this.app.sysBeep?.(); return; }
    this.volume = v; this.app.applyVolume(v); this.app.assets.play(154);
  }
  ok() {
    const bad = keyConflict(this.keys);
    if (bad >= 0) { this.sel = bad; this.app.sysBeep?.(); return; }
    const P = this.app.prefs;
    P.keys = this.keys.slice(); P.volume = this.volume; P.music = this.music; P.speed = (this.speed + 50) / 100;
    P.quickdraw = this.quickdraw; P.movies = this.movies;
    this.close(true);
  }
  close(saved) {
    const app = this.app;
    if (saved) app.savePrefs();
    app.applyVolume(app.prefs.volume);   // FUN_1006d76c(DAT_1007f690): Cancel puts the volume back
    if (!app.prefs.music) app.assets.stopMusic();   // FUN_1004b828(0)
    this.onClose();
  }
  key(e) {
    if (this.speedDialog) return this.speedDialog.key(e);
    if (this.popup) return true;
    const n = keyNumber(e.code);
    if (n < 0 || NOT_KEYS.has(n) || e.repeat) return true;
    this.keys[this.sel] = n; this.sel = (this.sel + 1) % PREF_SLOTS.length;
    return true;
  }
}

// DLOG 4002: the slider in item 4, val 0..175 = mouse x - left - 5; the speed is (val + 50)%.
class SpeedDialog {
  constructor(prefs) {
    this.prefs = prefs; this.L = prefs.app.data.ui[4002]; this.old = prefs.speed;
    Object.assign(this, place(this.L));
  }
  r(n) { const i = this.L.items[n]; return { x: this.x + i.x, y: this.y + i.y, w: i.w, h: i.h }; }
  draw(ctx, ui) {
    const P = this.prefs, A = P.app.assets, s = this.r(4);
    ui.hit(0, 0, 832, 624, () => { });
    ui.macWindow(ctx, this.x, this.y, this.L.w, this.L.h);
    if (this.drag && ui.mouse.down) P.speed = Math.max(0, Math.min(0xaf, Math.trunc(ui.mouse.x - s.x - 5)));
    else this.drag = false;
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.font = FONT; ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText('Game Speed:', s.x, s.y + s.h - 25);
    ctx.textAlign = 'right'; ctx.fillText(P.speed + 50 + '%', s.x + s.w, s.y + s.h - 25); ctx.textAlign = 'left';
    const track = A.pict(400), thumb = A.pict(401);
    if (track) ctx.drawImage(track, s.x, s.y + s.h - 11, s.w, 5);
    if (thumb) ctx.drawImage(thumb, s.x + P.speed, s.y + s.h - 17);
    ui.hit(s.x, s.y, s.w, s.h, (mx) => { this.drag = true; P.speed = Math.max(0, Math.min(0xaf, Math.trunc(mx - 5))); });
    ui.macButton(ctx, 'Cancel', this.r(2), () => { P.speed = this.old; P.speedDialog = null; });
    ui.macButton(ctx, 'OK', this.r(1), () => (P.speedDialog = null), true);
  }
  key(e) {
    if (e.key === 'Enter') this.prefs.speedDialog = null;
    else if (e.key === 'Escape') { this.prefs.speed = this.old; this.prefs.speedDialog = null; }
    return true;
  }
}

// FUN_1004b0a8: STR# 20001 in Times 24 on black, lines 30 px apart in a box as wide as the widest line
// plus 16 and 320 tall, centred on the screen and moved 10 px left; text at the box's left + 10. The
// list rises 1 px per pass, a pass every 2 ticks (4 with Down held, no wait with Up). A line shows
// once its baseline is above the box bottom, fading in over 32 px (grey 65535 * d / 32), and fades out
// over the 32 px above top + 24. A click, Return or Space ends it, as does the end of the list. The
// <REG> line is three spaces and the registered name: no registration here, so blank (RECONSTRUCTED).
export class AboutScroll {
  constructor(app, onClose) {
    this.app = app; this.onClose = onClose;
    this.lines = (app.data.appStrings?.[20001] ?? []).slice(0, 0x80).map(s => s === '<REG>' ? '   ' : s);
    this.font = '24px EVTimes, Times, "Times New Roman", serif';
    this.pos = 0; this.acc = 0; this.last = performance.now();
    if (app.prefs.music) app.assets.musicSeq?.([30001, 30002]);   // FUN_1004b900
    else app.assets.stopMusic();
  }
  draw(ctx, ui) {
    const W = 832, H = 624;
    ui.hit(0, 0, W, H, () => this.end());
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.font = this.font;
    if (this.maxW === undefined) this.maxW = Math.max(0x20, ...this.lines.map(s => Math.trunc(ctx.measureText(s).width)));
    const cx = W >> 1, cy = H >> 1;
    const top = cy - 0xa0, bottom = cy + 0xa0, left = cx - (this.maxW >> 1) - 8 - 10;
    const now = performance.now(), down = this.app.keyboard.down;
    const ticks = down.has('ArrowDown') ? 4 : down.has('ArrowUp') ? 0.5 : 2;
    this.acc += (now - this.last) * 60 / 1000; this.last = now;
    while (this.acc >= ticks) { this.acc -= ticks; this.pos++; }
    if (this.pos > this.lines.length * 30 + (bottom - top)) { this.end(); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, (this.maxW >> 1) * 2 + 16, bottom - top); ctx.clip();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    this.lines.forEach((s, i) => {
      const y = bottom - this.pos + i * 30;
      if (y < top || y > bottom + 24) return;
      let g = 0xffff, show = true;
      if (Math.abs(y - bottom) < 0x21) { if (y < bottom) g = Math.trunc(65535 * Math.abs(y - bottom) * 0.03125); else show = false; }
      if (Math.abs(y - (top + 24)) < 0x21) { if (y > top + 24) g = Math.trunc(65535 * (y - top - 24) * 0.03125); else show = false; }
      if (!show) return;
      const c = Math.min(255, g >> 8);
      ctx.fillStyle = `rgb(${c},${c},${c})`; ctx.fillText(s, left + 10, y);
    });
    ctx.restore();
  }
  end() {
    if (this.done) return; this.done = true;
    const app = this.app;
    app.assets.stopMusic();   // FUN_1004b9d8
    if (app.prefs.music) app.assets.music(30000);
    this.onClose();
  }
  key(e) { if (e.key === 'Enter' || e.key === ' ') this.end(); return true; }
}

// "Open Pilot" is the system's StandardGetFile (FUN_10027ee8), so it is drawn as a Platinum Standard
// File dialog listing the browser's saved pilots: folder popup, list, Cancel and Open. RECONSTRUCTED.
export class OpenPilotDialog {
  constructor(app, onClose) {
    this.app = app; this.onClose = onClose; this.sel = 0; this.scroll = 0;
    this.w = 344; this.h = 216;
    Object.assign(this, place({ w: this.w, h: this.h }));
  }
  draw(ctx, ui) {
    const app = this.app, x = this.x, y = this.y, list = app.saves.list();
    ui.hit(0, 0, 832, 624, () => { });
    ui.macWindow(ctx, x, y, this.w, this.h);
    ctx.font = MAC_FONT; ctx.textBaseline = 'alphabetic';
    // folder popup
    const pr = { x: x + 14, y: y + 10, w: 188, h: 20 };
    ctx.fillStyle = '#dedede'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    ctx.fillStyle = '#000'; ctx.fillText('Pilots', pr.x + 8, pr.y + 15);
    ctx.beginPath(); ctx.moveTo(pr.x + pr.w - 16, pr.y + 8); ctx.lineTo(pr.x + pr.w - 6, pr.y + 8); ctx.lineTo(pr.x + pr.w - 11, pr.y + 13); ctx.fill();
    // file list
    const lr = { x: x + 14, y: y + 38, w: 204, h: 162 }, rows = Math.floor((lr.h - 2) / 16);
    ctx.fillStyle = '#fff'; ctx.fillRect(lr.x, lr.y, lr.w, lr.h);
    ctx.strokeRect(lr.x + 0.5, lr.y + 0.5, lr.w - 1, lr.h - 1);
    ctx.fillStyle = '#dedede'; ctx.fillRect(lr.x + lr.w - 16, lr.y + 1, 15, lr.h - 2);
    ctx.fillStyle = '#000'; ctx.fillRect(lr.x + lr.w - 16, lr.y + 1, 1, lr.h - 2);
    this.sel = Math.min(this.sel, Math.max(0, list.length - 1));
    this.scroll = Math.max(0, Math.min(this.scroll, list.length - rows));
    ctx.save(); ctx.beginPath(); ctx.rect(lr.x + 1, lr.y + 1, lr.w - 18, lr.h - 2); ctx.clip();
    list.slice(this.scroll, this.scroll + rows).forEach((p, k) => {
      const i = this.scroll + k, ry = lr.y + 1 + k * 16;
      if (i === this.sel) { ctx.fillStyle = '#000'; ctx.fillRect(lr.x + 1, ry, lr.w - 18, 16); }
      ctx.fillStyle = i === this.sel ? '#fff' : '#000'; ctx.fillText(p.name, lr.x + 22, ry + 12);
      ui.hit(lr.x + 1, ry, lr.w - 18, 16, () => {
        const t = performance.now();
        if (this.sel === i && t - (this.clickAt ?? 0) < 500) this.open(list);
        this.sel = i; this.clickAt = t;
      });
    });
    ctx.restore();
    const bx = x + this.w - 98;
    ui.macButton(ctx, 'Cancel', { x: bx, y: y + this.h - 64, w: 70, h: 20 }, () => this.onClose());
    ui.macButton(ctx, 'Open', { x: bx, y: y + this.h - 32, w: 70, h: 20 }, () => this.open(list), true, list.length > 0);
  }
  open(list) { const p = list[this.sel]; if (!p) return; this.app.loadPilot(p.name); this.onClose(); }
  key(e) {
    const n = this.app.saves.list().length;
    if (e.key === 'Escape') this.onClose();
    else if (e.key === 'Enter') this.open(this.app.saves.list());
    else if (e.key === 'ArrowDown') { this.sel = Math.min(n - 1, this.sel + 1); if (this.sel >= this.scroll + 10) this.scroll++; }
    else if (e.key === 'ArrowUp') { this.sel = Math.max(0, this.sel - 1); if (this.sel < this.scroll) this.scroll--; }
    return true;
  }
}
