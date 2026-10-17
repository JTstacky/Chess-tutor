// Screens and dialogs. Dialogs use the original DLOG/DITL rectangles from the game's resource
// fork (bundle.ui[id]); which button picture sits in which item is listed in docs/re-gaps.md.
import { UI, BTN, GREEN, DIM, FONT, FONT_SMALL } from './ui.js';
import { SPOB, MOD } from '../engine/data.js';
import * as port from '../engine/spaceport.js';
import * as M from '../engine/missions.js';
import * as E from '../engine/encounters.js';
import { Pilot, legalLabel, combatRating, shortDate, DEFAULT_PILOT_NAMES, DEFAULT_SHIP_NAMES } from '../engine/pilot.js';
import { isDisabled, isDead } from '../engine/ships.js';
import { PrefsDialog, AboutScroll, OpenPilotDialog } from './prefs.js';
import { CMD } from '../engine/input.js';

export const BIG = '12px EVGeneva, Geneva, Tahoma, Arial, sans-serif';
export const EVFONT = '12px EVUI, Geneva, Tahoma, Arial, sans-serif';
const YELLOW = '#e0e000', WHITE = '#ffffff';
const MENU_CELLS = [  // lit-label cells of PICT 8002 and where they sit on PICT 8000 (matched by pixel search)
  { id: 'new', c: 0, r: 0, x: 249, y: 316 }, { id: 'enter', c: 1, r: 0, x: 499, y: 313 },
  { id: 'open', c: 0, r: 1, x: 249, y: 386 }, { id: 'prefs', c: 1, r: 1, x: 499, y: 383 },
  { id: 'quit', c: 0, r: 2, x: 249, y: 455 }, { id: 'about', c: 1, r: 2, x: 499, y: 452 },
];
const cr = n => `${Math.round(n).toLocaleString('en-US')}`;

// Where the original puts a game dialog (DLOGs are positioned 0x280a, centred on the screen, then
// FUN_10060758 moves them; asm 0x10060758-0x10060a7c). gr is the right edge of the playfield
// (screen right - 0x95, i.e. left of the status bar). Checked in the running original: the spaceport
// (609x323) lands at (0,47), the commodity exchange (322x220) at (87,130).
export function placeDialog(w, h, SW = 640, SH = 480) {
  let x = Math.trunc((SW - w) / 2), y = Math.trunc((SH - h) / 2);
  const gr = SW - 0x95;
  if (x + w > gr) x = x > x + w - gr ? x - (x + w - gr) : 0;            // 1: pull it out from under the bar
  if (x >= 5 && x + w <= gr) x = Math.trunc((x + (gr - (x + w)) + 5) / 2); // 2: centre it in the playfield
  if (y + h > 0x172 && x + w > gr) y -= y + h - 0x172;                   // 3: a wide one may not cover the cargo box
  return { x, y };
}

// ---------------------------------------------------------------- dialog base
export class Dialog {
  constructor(app, id, { modal = true } = {}) {
    this.app = app; this.L = app.data.ui[id] ?? { w: 400, h: 300, items: {} };
    this.w = this.L.w; this.h = this.L.h;
    Object.assign(this, placeDialog(this.w, this.h));
    this.size = [640, 480]; this.modal = modal;
  }
  get game() { return this.app.game; }
  get data() { return this.app.data; }
  // Item rectangle, after any growth of an overflowing text item: that item gets taller and every
  // item that starts below it moves down by the same amount.
  r(n) {
    const i = this.L.items[n]; if (!i) return { x: this.x, y: this.y, w: 0, h: 0 };
    const g = this.grow ?? { by: 0 }, dy = g.by && n !== g.item && i.y >= g.at ? g.by : 0;
    return { x: this.x + i.x, y: this.y + i.y + dy, w: i.w, h: i.h + (n === g.item ? g.by : 0) };
  }
  // The draw procs paint the window black and FrameRect its port in grey (seen on the spaceport,
  // commodity exchange, mission computer, bar and hire dialogs of the running original). The window
  // itself (a plain box) has a 1 px black outline just outside the port: measured on orig-76/77, the
  // grey port frame at x 87 / y 130 has black at x 86 / y 129, and at 609 between the spaceport and
  // the status bar.
  frame(ctx, ui) {
    this.applyGrowth();
    if (this.modal) ui.hit(0, 0, 640, 480, () => { });
    ctx.fillStyle = '#000'; ctx.fillRect(this.x - 1, this.y - 1, this.w + 2, this.h + 2);
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1; ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.w - 1, this.h - 1);
  }
  // The DITL rectangles were sized for the Mac's 9-point Geneva; our text can need more room. Text
  // items report the growth they want while drawing; it's applied at the next frame, keeping the
  // dialog centred and on screen (at most 470 px tall). Whatever still doesn't fit scrolls.
  applyGrowth() {
    this.baseY ??= this.y;
    const want = this.want ?? { by: 0 }; this.want = { by: 0 };
    if (want.by !== (this.grow?.by ?? 0) || want.item !== this.grow?.item) {
      this.grow = want; this.h = this.L.h + want.by; this.y = this.baseY - Math.floor(want.by / 2);
    }
  }
  textIn(ctx, ui, n, text, color = GREEN, lh = 12, font = FONT) {
    const i = this.L.items[n]; if (!i) return;
    const lines = ui.layout(ctx, text, i.w - 4, font), over = lines.length * lh + 2 - i.h;
    if (over > 0) {
      const by = Math.min(over, Math.max(0, 470 - this.L.h));
      if (by > (this.want?.by ?? 0)) this.want = { by, item: n, at: i.y + i.h };
    }
    this.textBox(ctx, ui, n, this.r(n), lines, color, lh, font);
  }
  // Draw pre-laid-out lines into r; if they don't fit, they scroll (mouse wheel over the box, or the
  // arrows at its right edge), so no text is ever silently cut off.
  // `base` (optional) puts the first line's baseline at r.y + base and the text at r.x + 1, the way
  // TETextBox sets Geneva 9 (measured: baseline top + 10, 12 px lines).
  textBox(ctx, ui, key, r, lines, color = GREEN, lh = 12, font = FONT, base) {
    // TETextBox wraps at the box width (measured with the Geneva 9 metrics on orig-82..91: the
    // outfit and ship descriptions break as in the original only for widths 248..250 of 250).
    if (typeof lines === 'string') lines = ui.layout(ctx, lines, base ? r.w : r.w - 4, font);
    const fit = Math.max(1, Math.floor((r.h - 2) / lh)), hidden = Math.max(0, lines.length - fit);
    this.scrolls ??= {}; this.boxes ??= {};
    const s = this.scrolls[key] = Math.max(0, Math.min(this.scrolls[key] ?? 0, hidden));
    this.boxes[key] = hidden ? { ...r, max: hidden } : null;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = base ? 'alphabetic' : 'top';
    lines.slice(s, s + fit).forEach((line, k) => base ? ctx.fillText(line, r.x + 1, r.y + base + k * lh) : ctx.fillText(line, r.x + 2, r.y + 2 + k * lh));
    ctx.restore();
    if (!hidden) return;
    const ax = r.x + r.w - 9;
    const arrow = (y, up, on) => {
      ctx.fillStyle = on ? YELLOW : DIM; ctx.beginPath();
      if (up) { ctx.moveTo(ax, y + 6); ctx.lineTo(ax + 8, y + 6); ctx.lineTo(ax + 4, y); }
      else { ctx.moveTo(ax, y); ctx.lineTo(ax + 8, y); ctx.lineTo(ax + 4, y + 6); }
      ctx.fill();
    };
    arrow(r.y + 1, true, s > 0); arrow(r.y + r.h - 7, false, s < hidden);
    ui.hit(ax - 4, r.y, 16, 12, () => (this.scrolls[key] = s - 1));
    ui.hit(ax - 4, r.y + r.h - 12, 16, 12, () => (this.scrolls[key] = s + 1));
  }
  // Mouse wheel: scroll the overflowing text box under the pointer. Returns true if it did.
  wheel(dir, p) {
    for (const [key, b] of Object.entries(this.boxes ?? {})) {
      if (b && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) { this.scrolls[key] = Math.max(0, Math.min(b.max, (this.scrolls[key] ?? 0) + dir)); return true; }
    }
    return false;
  }
  close() { this.app.closeDialog(this); }
  key(e) { if (e.key === 'Escape' || e.key === 'Enter') { this.onDefault?.() ?? this.close(); return true; } return true; }
  // The landed dialogs' filters test the Prefs keys for Map (key record +0x12), Player Info (+0x38) and
  // Mission Info (+0x56), in that order, and return an item that opens that screen over the dialog
  // (spaceport FUN_10041518, trade FUN_1003f58c, outfitter FUN_10042a94: map and mission info only,
  // shipyard FUN_10044e2c: items 3/4/11, ship info FUN_10046200, mission computer FUN_100556b4, mission
  // offer FUN_10059b34, mission info FUN_10058b20: the map only).
  infoKey(e, { map = true, info = true, missions = true } = {}) {
    const cmds = this.app.keyboard?.commands(e.code, e.metaKey || e.ctrlKey) ?? [];
    let d = null;
    if (map && cmds.includes(CMD.MAP)) d = new MapDialog(this.app);
    else if (info && cmds.includes(CMD.PLAYER_INFO)) d = new InfoDialog(this.app);
    else if (missions && cmds.includes(CMD.MISSION_INFO)) d = new MissionInfoDialog(this.app);
    if (!d) return false;
    this.app.openDialog(d);
    return true;
  }
}

// The five interface sounds (FUN_1005b2e4 loads snd 150-154 into the table at [1007950c]; names from
// the resource file). The dialogs play Beep2 as they open or act, Beep3 as they close, Beep4 to
// refuse, and Beep5 when a comm channel opens.
export const BEEP = { BEEP1: 150, OPEN: 151, CLOSE: 152, REFUSE: 153, COMM: 154 };
const beep = (app, id) => app.assets.play(id);

// Text box with an Okay button (DLOG 3003 "Desc Dialog").
export class NoticeDialog extends Dialog {
  constructor(app, text, then) { super(app, 3003); this.text = text; this.then = then; }
  draw(ctx, ui) {
    this.frame(ctx, ui);
    this.textBox(ctx, ui, 't', this.r(3), this.text ?? '', WHITE, 12, FONT, 10);  // white TETextBox in the item (draw proc FUN_100481d0)
    ui.buttonIn(ctx, BTN.OKAY, this.r(1), () => this.onDefault());
  }
  onDefault() { this.close(); this.then?.(); return true; }
}

// Two-choice dialog (DLOG 1008 "Negotiation").
export class ConfirmDialog extends Dialog {
  constructor(app, text, yes, no) { super(app, 1008); this.text = text; this.yes = yes; this.no = no; }
  draw(ctx, ui) {
    this.frame(ctx, ui);
    this.textIn(ctx, ui, 3, this.text);
    ui.buttonIn(ctx, BTN.YES, this.r(1), () => { this.close(); this.yes?.(); });
    ui.buttonIn(ctx, BTN.NO, this.r(2), () => { this.close(); this.no?.(); });
  }
  onDefault() { this.close(); this.no?.(); return true; }
}

// ---------------------------------------------------------------- title
// PICT 8000 is 832x624. On a 640x480 screen the original shows its centre (offset 96,72); the
// coordinates below are in the 832x624 picture, so 640x480 positions get TX/TY added.
const TX = 96, TY = 72;
// Measured in the running original and converted back through the emulator's display gamma (it shows
// 0x99 as 179, 0x88 as 165, 0x44 as 102, 0xcc as 218): all colours here are framebuffer values.
const LABEL_GREEN = '#009900', VALUE_GREEN = '#00ff00';
export class TitleScreen {
  constructor(app) { this.app = app; this.size = [832, 624]; this.dialog = null; this.edit = ''; this.sel = true; this.note = ''; }
  draw(ctx, ui) {
    const A = this.app.assets, bg = A.pict(8000), lit = A.pict(8002);
    if (bg) ctx.drawImage(bg, 0, 0);
    const pilot = this.app.pilot;
    for (const m of MENU_CELLS) {
      const enabled = m.id !== 'enter' || (!!pilot && !pilot.killed);
      const over = !this.dialog && ui.hit(m.x, m.y, 87, 59, () => this.menu(m.id));
      if (over && enabled && lit) ctx.drawImage(lit, m.c * 87, m.r * 59, 87, 59, m.x, m.y, 87, 59);
    }
    this.drawPilotBox(ctx);
    if (this.note) ui.text(ctx, this.note, 416, 600, '#c0c0c0', 'center');
    if (this.dialog) this.drawDialog(ctx, ui);
  }
  // FUN_1004cf20 (asm 0x1004cf20-0x1004d444): rect (277,266)-(369,446) of the 640x480 screen, Geneva 9.
  // Labels at the rect's left edge, values 5 px in; baselines at top + 12, 24, 39, 51, 66, 78, 93, 105,
  // 117, 132, 144, 159, 171. No pilot: "No Pilot File Loaded" centred at mid - 0x14. A dead ship
  // (0x10061e5c): the pilot's name at mid - 12 and "has been killed" at mid, centred.
  drawPilotBox(ctx) {
    const p = this.app.pilot, D = this.app.data;
    const L = 277 + TX, T = 266 + TY, R = 369 + TX, B = 446 + TY, mid = (T + B) >> 1;
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    const at = (t, dx, dy, c) => { ctx.fillStyle = c; ctx.fillText(t, L + dx, T + dy); };
    const centre = (t, y) => { ctx.fillStyle = LABEL_GREEN; ctx.textAlign = 'center'; ctx.fillText(t, (L + R) / 2, y); ctx.textAlign = 'left'; };
    if (!p) centre('No Pilot File Loaded', mid - 0x14);
    else if (p.killed) { centre(p.name, mid - 12); centre('has been killed', mid); }
    else {
      const sys = D.syst[p.system] ?? D.syst[D.spob[p.spob]?.System];
      const rows = [['Pilot Name:', 12], [p.name, 24, 1], ['Ship Name:', 39], [p.shipName ?? '', 51, 1],
        ['Ship Type:', 66], [D.ship[p.shipType]?.name ?? '', 78, 1], ['Legal status in', 93], [`${sys?.name ?? ''} system:`, 105],
        [sys ? legalLabel(D, new Pilot(p), sys.id) : "", 117, 1], ['Combat Rating:', 132], [combatRating(D, p.kills), 144, 1],
        ['Current Date:', 159], [shortDate(p.date), 171, 1]];
      for (const [t, dy, value] of rows) at(t, value ? 5 : 0, dy, value ? VALUE_GREEN : LABEL_GREEN);
    }
    ctx.restore();
  }
  menu(id) {
    const app = this.app; app.assets.unlock(); if (app.prefs?.music !== false) app.assets.music(30000);   // pref byte 0: Intro Music
    // DITL 3100: the name field starts with a random STR# 128 pilot name, all of it selected.
    if (id === 'new') { this.dialog = 'new'; this.edit = DEFAULT_PILOT_NAMES[Math.floor(Math.random() * 3)]; this.sel = true; this.strict = false; this.focusName(); }
    else if (id === 'open') { this.dialog = 'open'; this.panel = new OpenPilotDialog(app, () => this.closePanel()); }
    // FUN_1004c8d8 item 1: Beep4 with no pilot loaded; otherwise Beep2, then a dead pilot only gets the
    // system beep and a live one enters the ship.
    else if (id === 'enter') { if (!app.pilot) beep(app, BEEP.REFUSE); else { beep(app, BEEP.OPEN); if (!app.pilot.killed) app.enterShip(); } }
    else if (id === 'quit') this.note = 'Close the browser tab to quit.';
    else if (id === 'prefs') { this.dialog = 'prefs'; this.panel = new PrefsDialog(app, () => this.closePanel()); }
    else if (id === 'about') { app.assets.stopMusic(); this.dialog = 'about'; this.panel = new AboutScroll(app, () => this.closePanel()); }
  }
  closePanel() { this.dialog = null; this.panel = null; }
  // Standard Mac dialogs (proc 1, positioned 0x280a: centred on the screen) for New Pilot (DLOG 3100),
  // the ship's name (DLOG 3001, text from 0x1007ce8f + STR# 5002) and the replace question (DLOG 3002).
  macDialog(ctx, ui, id) {
    // Centred as measured on orig-33 (DLOG 3100, 268x145 at (185,167)) and orig-34 (DLOG 3001, 343x138 at
    // (148,170)): ceil((screen - size) / 2) - 1 on both axes.
    const L = this.app.data.ui[id], x = TX + Math.ceil((640 - L.w) / 2) - 1, y = TY + Math.ceil((480 - L.h) / 2) - 1;
    ui.hit(0, 0, 832, 624, () => { });
    ui.macWindow(ctx, x, y, L.w, L.h);
    const r = n => { const i = L.items[n]; return { x: x + i.x, y: y + i.y, w: i.w, h: i.h }; };
    const icon = this.app.assets.pict(130); if (icon && L.items[4]) ctx.drawImage(icon, r(4).x, r(4).y);
    return r;
  }
  drawDialog(ctx, ui) {
    const app = this.app, D = app.data, caret = Math.floor(performance.now() / 500) % 2 === 0;
    if (this.dialog === 'new') {
      const r = this.macDialog(ctx, ui, 3100);
      ui.macText(ctx, 'Enter your name, pilot:', r(3));
      ui.macEdit(ctx, this.edit, r(5), this.sel, caret, () => { this.sel = false; this.focusName(); });
      ui.macCheckbox(ctx, 'Strict Play', r(2), this.strict, () => (this.strict = !this.strict));
      const cap = app.assets.pict(129); if (cap) ctx.drawImage(cap, r(7).x, r(7).y);   // "If you check this box, when you're dead, you're dead..."
      ui.macButton(ctx, 'OK', r(1), () => this.confirmName(), true, this.edit.trim().length > 0);
      ui.macButton(ctx, 'Cancel', r(6), () => (this.dialog = null));
    } else if (this.dialog === 'replace') {
      const r = this.macDialog(ctx, ui, 3002);
      ui.macText(ctx, 'A pilot file by that name already exists. Is it okay to replace it with this new pilot?', r(3));
      ui.macButton(ctx, 'OK', r(1), () => this.askShipName(), true);
      ui.macButton(ctx, 'Cancel', r(5), () => (this.dialog = null));
    } else if (this.dialog === 'ship') {
      const r = this.macDialog(ctx, ui, 3001);
      ui.macText(ctx, `Now, please christen your brand-new ${D.str(5002, 0)}:`, r(3));
      ui.macEdit(ctx, this.edit, r(5), this.sel, caret, () => { this.sel = false; this.focusName(); });
      ui.macButton(ctx, 'OK', r(1), () => this.createPilot(), true, this.edit.trim().length > 0);
      ui.macButton(ctx, 'Cancel', r(6), () => (this.dialog = null));
    } else this.drawOther(ctx, ui);
  }
  drawOther(ctx, ui) { this.panel?.draw(ctx, ui); }
  key(e) {
    if (this.panel) return this.panel.key(e);
    if (this.dialog === 'new' || this.dialog === 'ship') {
      const ok = () => (this.dialog === 'new' ? this.confirmName() : this.createPilot());
      if (e.key === 'Enter') { if (this.edit.trim()) ok(); }
      else if (e.key === 'Escape') this.dialog = null;
      else if (e.key === 'Backspace') { this.edit = this.sel ? '' : this.edit.slice(0, -1); this.sel = false; }
      else if (e.key.length === 1) { if (this.sel) this.edit = ''; this.sel = false; if (this.edit.length < 31) this.edit += e.key; }
      return true;
    }
    if (this.dialog === 'replace') { if (e.key === 'Enter') this.askShipName(); else if (e.key === 'Escape') this.dialog = null; return true; }
    if (e.key === 'Escape' && this.dialog) { this.dialog = null; return true; }
    if (!this.dialog && e.key === 'Enter') { this.menu('enter'); return true; }
    return false;
  }
  // A hidden text field, so phones show their keyboard for the name.
  focusName() {
    const el = document.getElementById('kbd'); if (!el) return;
    el.value = this.edit; el.oninput = () => { this.edit = el.value.slice(0, 31); this.sel = false; };
    el.onkeydown = e => { if (e.key === 'Enter' && this.edit.trim()) { el.blur(); this.key(e); } else if (e.key === 'Escape') { el.blur(); this.dialog = null; } };
    el.focus();
  }
  // FUN_1004ef64: pilot name, then (if a file of that name exists) the replace question, then the
  // ship's name, defaulting to a random STR# 128 ship name. The new pilot is saved and shown here.
  confirmName() {
    this.pilotName = this.edit.trim(); this.pilotStrict = !!this.strict;
    if (this.app.saves.get(this.pilotName)) this.dialog = 'replace'; else this.askShipName();
  }
  askShipName() { this.dialog = 'ship'; this.edit = DEFAULT_SHIP_NAMES[Math.floor(Math.random() * 3)]; this.sel = true; this.focusName(); }
  createPilot() { this.app.newPilot(this.pilotName, this.pilotStrict, this.edit.trim()); this.dialog = null; }
}

// ---------------------------------------------------------------- spaceport (DLOG 1000)
export class SpaceportScreen extends Dialog {
  constructor(app) {
    super(app, 1000, { modal: false });
    this.visit = port.newVisit();
    const texts = app.game.landingTexts ?? []; app.game.landingTexts = null;
    for (const t of texts.reverse()) app.openDialog(new NoticeDialog(app, t));
  }
  get P() { return this.game.data.spob[this.game.landed]; }
  // CustSndID >= 128 (0x10040c64): the spaceport's filter (FUN_10041518, counter [100799f4]) plays it at
  // priority 10 on the first idle pass and then again after 0x200 + Rand(0x200) more; a click on the
  // picture (item 5) plays it too, and leaving stops it. Idle passes are counted as 60 Hz ticks.
  ambient(click) {
    const id = this.P?.CustSndID; if (!(id >= 128)) return;
    const A = this.app.assets, now = performance.now();
    if (click) { A.stopLoop('spobsnd'); A.play(id, { key: 'spobsnd' }); return; }
    this.sndWait = (this.sndWait ?? 0) - (this.sndLast ? (now - this.sndLast) * 0.06 : 1); this.sndLast = now;
    if (this.sndWait < 1) { A.stopLoop('spobsnd'); A.play(id, { key: 'spobsnd' }); this.sndWait = 0x200 + Math.floor(Math.random() * 0x200); }
  }
  draw(ctx, ui) {
    const g = this.game, D = g.data, P = this.P, A = this.app.assets;
    // The dialog opens over the last flight frame (playfield and status bar stay visible behind it).
    if (this.app.backdrop) ctx.drawImage(this.app.backdrop, 0, 0); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 480); }
    this.frame(ctx, ui);
    // ev_spaceport_main 0x10040c64: PICT CustPicID when it is >= 128, else 10000 + the spob's type.
    ui.fit(ctx, A.pict(P.CustPicID >= 128 ? P.CustPicID : 10000 + P.Type), this.r(5));
    ui.hit(this.r(5).x, this.r(5).y, this.r(5).w, this.r(5).h, () => this.ambient(true));
    if (!this.app.dialogs.length) this.ambient(false); else this.sndLast = 0;
    // FUN_100418f8 (the DLOG 1000 draw proc) sets the description in all of item 6 with TETextBox in
    // Geneva 9, white (TextFont 3, TextSize 9 at 0x10041b6c; VERIFIED). Nothing else is drawn there:
    // no name, credits or date (checked in the running original, re-gaps #35).
    this.textBox(ctx, ui, 'desc', this.r(6), D.descs[P.id] ?? '', WHITE, 12, FONT, 10);  // orig-76: baseline r.y + 10, x + 1
    // FUN_1000c99c draws only the buttons that apply; the others are not drawn at all.
    const has = b => D.spobFlag(P, b);
    if (g.pilot.credits > 0 && !has(SPOB.UNINHABITED) && g.pilot.fuel < port.maxFuel(g))
      ui.buttonIn(ctx, BTN.REFUEL, this.r(4), () => { port.refuel(g); this.app.save(); });
    if (has(SPOB.TRADE)) ui.buttonIn(ctx, BTN.TRADE, this.r(7), () => this.app.openDialog(new TradeDialog(this.app, this)));
    if (has(SPOB.OUTFIT)) ui.buttonIn(ctx, BTN.OUTFIT, this.r(8), () => this.app.openDialog(new OutfitDialog(this.app, this)));
    if (has(SPOB.SHIPYARD)) ui.buttonIn(ctx, BTN.SHIPYARD, this.r(9), () => this.app.openDialog(new ShipyardDialog(this.app, this)));
    const comp = !has(SPOB.UNINHABITED), bar = has(SPOB.BAR);
    if (comp) ui.buttonIn(ctx, BTN.MISSIONS, this.r(bar ? 10 : 13), () => this.app.openDialog(new MissionDialog(this.app, M.LIST_COMPUTER)));
    if (bar) ui.buttonIn(ctx, BTN.BAR, this.r(comp ? 11 : 13), () => this.openBar());
    ui.buttonIn(ctx, BTN.LEAVE_WIDE, this.r(12), () => this.leave());
  }
  openBar() {
    const app = this.app, offers = M.offers(this.game, M.LIST_BAR);
    app.openDialog(new BarDialog(app));
    for (const o of offers.slice().reverse()) app.openDialog(new SingleMissionDialog(app, o));
  }
  leave() { this.app.assets.stopLoop('spobsnd'); this.app.save(); port.takeOff(this.game, this.visit); this.app.takeOff(); }
  // FUN_10041518: the info keys first (map item 3, player info 2, mission info 0xe), then the typed
  // character: Return or Enter leave (0xc), r/f refuel (4), c/e/t trade (7), o outfitter (8), s shipyard
  // (9), n mission computer (10), b bar (0xb); Escape does nothing. ev_spaceport_main 0x10040c64 then
  // checks each item's spob flag; refuel needs an inhabited spob.
  key(e) {
    if (this.infoKey(e)) return true;
    const k = e.key.toLowerCase(), has = b => this.game.data.spobFlag(this.P, b);
    if (e.key === 'Enter') this.leave();
    else if (k === 'c' || k === 'e' || k === 't') { if (has(SPOB.TRADE)) this.app.openDialog(new TradeDialog(this.app, this)); }
    else if (k === 'o') { if (has(SPOB.OUTFIT)) this.app.openDialog(new OutfitDialog(this.app, this)); }
    else if (k === 's') { if (has(SPOB.SHIPYARD)) this.app.openDialog(new ShipyardDialog(this.app, this)); }
    else if (k === 'n') { if (!has(SPOB.UNINHABITED)) this.app.openDialog(new MissionDialog(this.app, M.LIST_COMPUTER)); }
    else if (k === 'b') { if (has(SPOB.BAR)) this.openBar(); }
    else if (k === 'r' || k === 'f') { if (!has(SPOB.UNINHABITED)) { port.refuel(this.game); this.app.save(); } }
    else return false;
    return true;
  }
}

// ---------------------------------------------------------------- commodity exchange (DLOG 1001)
export class TradeDialog extends Dialog {
  constructor(app, port_) { super(app, 1001); this.sel = null; this.note = ''; }
  // Rows 0-5 are the six commodities (a blank row where this spob doesn't trade one), rows 6-7 the
  // junk this spob buys (shown "High") and sells ("Low").
  rows() {
    const g = this.game, P = g.data.spob[g.landed], prices = port.commodityPrices(g, P), junk = port.junkPrices(g, P);
    const rows = prices.map((c, i) => c && { key: 'c' + i, name: c.name, price: c.price, lvl: c.level, own: g.pilot.cargo[i], c });
    while (rows.length < 6) rows.push(null);
    const j = (x, lvl) => x && { key: 'j' + x.j.id, name: x.j.name, price: x.price, lvl, own: g.pilot.junk[x.j.id] ?? 0, j: x };
    rows.push(j(junk.find(x => x.sell), 'High'), j(junk.find(x => x.buy), 'Low'));
    return rows;
  }
  // FUN_1003fbcc (asm): Geneva 9. Header (item 3) in light grey: "Commodity:" at +6, "In Hold:" (or
  // "In Fleet:" when escort freighters add hold) at +77, "Price:" at +127, baselines at top + 12. Rows
  // (items 4-11) in white at top + 10: name at +6, the hold right-aligned at +100, Low/Med/High at
  // +127, the price right-aligned at +190; the selected row is filled green inside a 1 px inset.
  // Item 12 lists other cargo, item 15 a price-change headline. Buy / Sell are drawn only when possible.
  draw(ctx, ui) {
    const g = this.game, D = g.data, P = D.spob[g.landed], rows = this.rows();
    if (this.sel && !rows.some(r => r?.key === this.sel)) this.sel = null;
    this.sel ??= rows.find(Boolean)?.key ?? null;
    this.frame(ctx, ui);
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    const LINE = '#444444', HEAD = '#cccccc';
    const h = this.r(3);
    ctx.strokeStyle = LINE; ctx.strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
    ctx.fillStyle = HEAD;
    ctx.fillText('Commodity:', h.x + 6, h.y + 12);
    ctx.fillText(g.cargoCapacityWithEscorts() > port.cargoCapacity(g) ? 'In Fleet:' : 'In Hold:', h.x + 77, h.y + 12);
    ctx.fillText('Price:', h.x + 127, h.y + 12);
    const right = (t, x, y) => ctx.fillText(t, x - ctx.measureText(t).width, y);
    rows.forEach((row, i) => {
      const r = this.r(4 + i);
      ui.hit(r.x, r.y, r.w, r.h, row ? () => { this.sel = row.key; this.note = ''; } : null);
      if (row && this.sel === row.key) { ctx.fillStyle = '#006600'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
      ctx.fillStyle = LINE;                                   // the list's side lines, top and bottom
      ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      if (i === 0) ctx.fillRect(r.x, r.y, r.w, 1);
      if (i === rows.length - 1) ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      if (!row) return;
      ctx.fillStyle = WHITE;
      ctx.fillText(row.name, r.x + 6, r.y + 10);
      if (row.own > 0) right(String(row.own), r.x + 100, r.y + 10);
      ctx.fillText(row.lvl, r.x + 127, r.y + 10);
      right(String(row.price), r.x + 190, r.y + 10);
    });
    // item 12 (0x10040380..0x100408d0), only when there is other cargo: loaded mission cargo (the total
    // tons once, then each cargo name once) and junk held that this spob doesn't trade (names only).
    // "Other cargo: 5 tons of Food, Medical, and Spice" -- ", " between names, "," + " and " before the
    // last of three or more, no closing period. TETextBox in the item inset (5,3), inverted (white on
    // black), then the item framed in -0xc7c. (Checked against the running original: orig-77..80 show no
    // box without other cargo.)
    const o = this.r(12), J = new Set(rows.slice(6).filter(Boolean).map(r => r.j.j.id));
    const ms = (g.pilot.missions ?? []).filter(m => m?.active && m.loaded && m.cargoType >= 0);
    const names = [...new Set(ms.map(m => D.str(4001, m.cargoType) ?? ''))];
    for (const [id, n] of Object.entries(g.pilot.junk ?? {})) if (n > 0 && !J.has(+id)) names.push(D.junk[id]?.name ?? '');
    if (names.length) {
      const tonsAboard = ms.reduce((a, m) => a + (m.cargoQty ?? 0), 0);
      let t = 'Other cargo: ' + (tonsAboard > 0 ? `${tonsAboard}${tonsAboard === 1 ? ' ton' : ' tons'} of ` : '');
      names.forEach((nm, k) => { t += nm; if (k < names.length - 2) t += ', '; if (k === names.length - 2) t += (names.length > 2 ? ',' : '') + ' and '; });
      this.textBox(ctx, ui, 'other', { x: o.x + 5, y: o.y + 3, w: o.w - 10, h: o.h - 6 }, t, WHITE, 12, FONT, 10);
      ctx.strokeStyle = LINE; ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
    }
    // item 15: "<spob> has raised|lowered the price of <commodity>." for a price event here (0x10040a20),
    // TETextBox Geneva 9 on the item, inverted
    const ev = rows.slice(0, 6).find(r => r?.c.event);
    if (ev) this.textBox(ctx, ui, 'news', this.r(15), `${P.name} has ${ev.c.event > 0 ? 'raised' : 'lowered'} the price of ${D.str(4001, ev.c.i)}.`, WHITE, 12, FONT, 10);
    const row = rows.find(r => r?.key === this.sel), step = this.app.shift ? 100 : 10;
    // Buy only while one ton is affordable and the hold has room (FUN_1006310c), Sell while some is
    // aboard (FUN_10063194). Item 1 is the small Leave (PICT 7000), as in the running original (orig-77).
    const canBuy = !!row && (row.c || row.j?.buy) && g.pilot.credits >= row.price && port.cargoCapacity(g) > port.cargoUsed(g);
    const canSell = !!row && row.own > 0 && (row.c || row.j?.sell);
    if (canBuy) ui.buttonIn(ctx, BTN.BUY, this.r(13), () => this.buy(row, step));
    if (canSell) ui.buttonIn(ctx, BTN.SELL, this.r(14), () => this.sell(row, step));
    ui.buttonIn(ctx, BTN.LEAVE, this.r(1), () => { this.app.save(); this.close(); });
  }
  buy(row, step) { const g = this.game, P = g.data.spob[g.landed]; const r = row.c ? port.buyCommodity(g, P, row.c.i, step) : port.buyJunk(g, P, row.j.j.id, step); this.note = r.msg ?? ''; }
  sell(row, step) { const g = this.game, P = g.data.spob[g.landed]; row.c ? port.sellCommodity(g, P, row.c.i, step) : port.sellJunk(g, P, row.j.j.id, step); }
  // 0x1003f58c: Return leaves, Tab / arrow keys move the selection, B buys, S sells.
  key(e) {
    if (this.infoKey(e)) return true;   // FUN_1003f58c: items 2, 0x10, 0x11
    const rows = this.rows().filter(Boolean), i = rows.findIndex(r => r.key === this.sel), k = e.key.toLowerCase();
    const row = rows[i], step = e.shiftKey ? 100 : 10;
    if (e.key === 'Enter' || e.key === 'Escape') { this.app.save(); this.close(); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) this.sel = rows[(i + 1) % rows.length]?.key ?? null;
    else if (e.key === 'ArrowUp' || e.key === 'Tab') this.sel = rows[(i - 1 + rows.length) % rows.length]?.key ?? null;
    else if (k === 'b' && row) this.buy(row, step);
    else if (k === 's' && row) this.sell(row, step);
    else return false;
    return true;
  }
}

// ---------------------------------------------------------------- icon grid shared by outfitter and shipyard
// FUN_10047750 lays out 20 cells over item 5, four across: cell i spans (left + col*83, top + row*54) to
// (left + 1 + (col+1)*83, top + 1 + (row+1)*54), i.e. 84x55 with shared edges. Each icon is a 32x32
// square of the icon sheet (PICT 5100 ships / 6100 outfits, 8 icons a row by index; PICT 5101+i /
// 6101+i, if present, replace one) drawn at (cx-16, cy-24). The draw procs (0x100455ac shipyard,
// 0x10043174 outfitter; Geneva 9) put the name in white centred at bottom-6, frame each cell in
// (0,0,68) and the selected one in (0,255,0); the outfitter adds the owned count in white, right-
// aligned 3 px in, baseline top+12. Clicks map to col = (x-left)/84, row = (y-top)/55 (the original's
// divisors). The labels are the short names of STR# 5000 (outfits: "Torp. Launcher", "Ext. Fuel Tank")
// and STR# 5001 (ships), as the running original shows them (orig-81, orig-87). Colours are framebuffer values (the emulator shots are gamma-brightened:
// (0,0,102) shown is (0,0,68)). Measured against the running original's hire screen (orig-50/51).
const GRID_FRAME = '#000044', GRID_SEL = '#00ff00';
function gridCell(r5, slot) { const c = slot % 4, w = Math.floor(slot / 4); return { x: r5.x + c * 83, y: r5.y + w * 54, w: 84, h: 55 }; }
function drawGrid(dlg, ctx, ui, items, sheetId, iconOverride, label, count) {
  const A = dlg.app.assets, r5 = dlg.r(5), sheet = A.pict(sheetId);
  dlg.scroll = Math.max(0, Math.min(dlg.scroll, Math.max(0, items.length - 20)));
  ctx.font = FONT; ctx.textBaseline = 'alphabetic';
  const shown = items.slice(dlg.scroll, dlg.scroll + 20);
  shown.forEach((it, slot) => {
    const c = gridCell(r5, slot), cx = c.x + (c.w >> 1), cy = c.y + (c.h >> 1), k = it.index;
    const own = A.pict(iconOverride + k);
    if (own) ctx.drawImage(own, cx - 16, cy - 24, 32, 32);
    else if (sheet) ctx.drawImage(sheet, (k % 8) * 32, (k >> 3) * 32, 32, 32, cx - 16, cy - 24, 32, 32);
    ctx.fillStyle = WHITE;
    const n = count?.(it) ?? 0;
    if (n > 0) { const t = String(n); ctx.fillText(t, c.x + c.w - 3 - Math.round(ctx.measureText(t).width), c.y + 12); }
    const name = label(it), w = Math.round(ctx.measureText(name).width);
    ctx.fillText(name, cx - (w >> 1), c.y + c.h - 6);
    ctx.strokeStyle = GRID_FRAME; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
  });
  const si = shown.findIndex(it => it.key === dlg.sel);
  if (si >= 0) { const c = gridCell(r5, si); ctx.strokeStyle = GRID_SEL; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1); }
  ui.hit(r5.x, r5.y, r5.w, r5.h, (px, py) => {
    const col = Math.trunc(px / 84), row = Math.trunc(py / 55);
    if (col < 0 || col > 3 || row < 0 || row > 4) return;
    const it = items[dlg.scroll + row * 4 + col], prev = dlg.sel, now = performance.now();
    dlg.sel = it ? it.key : null;
    if (it && it.key === prev && now - (dlg.lastClick ?? 0) <= 250) dlg.doubleClick?.(it);   // 15 ticks
    dlg.lastClick = now;
  });
  // the scroll arrows move four (one row) at a time and drop the selection (0x10044b58 / 0x10044bb0)
  return { up: dlg.scroll >= 4, down: dlg.scroll < items.length - 20 };
}
// Item 8: the selected item's PICT stretched to the 100x100 item (DrawPicture); without one, a white
// frame with "No Picture" / "Available" centred at top + 44 / + 56.
function drawItemPict(dlg, ctx, im) {
  const r = dlg.r(8);
  if (im) { ctx.drawImage(im, r.x, r.y, r.w, r.h); return; }
  ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = WHITE; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.font = FONT; ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('No Picture', r.x + r.w / 2, r.y + 0x2c); ctx.fillText('Available', r.x + r.w / 2, r.y + 0x38); ctx.textAlign = 'left';
}
// Item 9 rows: label at the item's left, value at +70 (0x46), in white.
function priceRows(dlg, ctx, rows) {
  const r = dlg.r(9); ctx.font = FONT; ctx.fillStyle = WHITE; ctx.textBaseline = 'alphabetic';
  for (const [label, value, dy] of rows) { ctx.fillText(label, r.x, r.y + dy); ctx.fillText(value, r.x + 0x46, r.y + dy); }
}
const tons = n => `${cr(n)} ton${n === 1 ? '' : 's'}`;
// Option x5, Command x10 (ev_key_down_live 0x32 / 0x3f, KeyMap bits of key codes 0x3a / 0x37). In the
// browser Alt stands for Option and Ctrl or Meta for Command.
const MODS = { alt: false, cmd: false };
if (typeof addEventListener === 'function') for (const t of ['keydown', 'keyup']) addEventListener(t, e => { MODS.alt = e.altKey; MODS.cmd = e.ctrlKey || e.metaKey; });
const multiple = () => (MODS.alt ? 5 : 1) * (MODS.cmd ? 10 : 1);

// ---------------------------------------------------------------- outfitters (DLOG 1002)
// ev_outfitter_screen 0x10041c34, draw proc 0x10043174, filter 0x10042a94, buttons FUN_1000c424.
// Item 1 Leave (PICT 7000), 7 Buy (7002, only while ev_outfit_can_buy), 4 Sell (7004, only while one is
// owned and it isn't cargo space, accel, speed, turn or a map: ModType 2/7/8/9/16), 10/11 scroll (7028
// / 7030, only when there is somewhere to go). Item 6 is desc 3000 + index (TETextBox, white), item 8
// PICT 6000 + index (6001 + index from index 100 on). Item 9: "Item Price:", "You Have:", then for an
// item with mass "Item Mass:" / "Available:" (free mass, never below 0), and at top + 96 why it
// can't be bought (ev_outfit_slot_or_max_blocked 0x10062dfc, else not enough free mass). Item 3 shows
// "x5" / "x10" / "x50" while a modifier multiplies a purchase. Return leaves. Compared with the running
// original at New Britain (orig-81..86, re-gaps #61).
export class OutfitDialog extends Dialog {
  constructor(app, sp) { super(app, 1002); this.sp = sp; this.sel = null; this.scroll = 0; }
  items() { const g = this.game; return port.outfitsFor(g, g.data.spob[g.landed]).map(x => ({ ...x, key: x.o.id, index: x.o.index })); }
  owned(o) { const g = this.game; return o.ModType === MOD.AMMO ? g.pilot.weapons[o.ModVal]?.ammo ?? 0 : g.pilot.outfits[o.id] ?? 0; }
  // ev_outfit_slot_or_max_blocked: at the maximum, or a gun / turret with every mount taken
  blocked(o) {
    const g = this.game, T = g.data.ship[g.pilot.shipType], n = cls => Object.entries(g.pilot.outfits).reduce((a, [id, k]) => a + (g.data.outf[id].Flags === cls ? k : 0), 0);
    return this.owned(o) >= o.Max || (o.Flags === 1 && n(1) >= T.MaxGun) || (o.Flags === 2 && n(2) >= T.MaxTur);
  }
  canBuy(it) { const g = this.game; return !port.canBuyOutfit(g, g.data.spob[g.landed], it.o, it.price); }
  canSell(it) { return this.owned(it.o) > 0 && ![MOD.CARGO, MOD.ACCEL, MOD.SPEED, MOD.TURN, MOD.MAP].includes(it.o.ModType); }
  draw(ctx, ui) {
    const g = this.game, D = g.data, A = this.app.assets, items = this.items();
    this.frame(ctx, ui);
    const nav = drawGrid(this, ctx, ui, items, 6100, 6101, it => this.data.str(5000, it.o.index) || it.o.name, it => this.owned(it.o));
    const it = items.find(x => x.key === this.sel), buy = !!it && this.canBuy(it), sell = !!it && this.canSell(it);
    const n = multiple();
    if (it && n > 1 && (buy || sell)) { const r3 = this.r(3); ctx.font = FONT; ctx.fillStyle = WHITE; ctx.fillText('x' + n, r3.x, r3.y + r3.h); }
    if (it) {
      const o = it.o, free = Math.max(0, port.freeMass(g));
      drawItemPict(this, ctx, A.pict(o.index < 100 ? 6000 + o.index : 6001 + o.index));
      const rows = [['Item Price:', `${cr(it.price)} cr`, 12], ['You Have:', `${cr(g.pilot.credits)} cr`, 24]];
      if (o.Mass > 0) rows.push(['Item Mass:', tons(o.Mass), 48], ['Available:', tons(free), 60]);
      priceRows(this, ctx, rows);
      const owned = this.owned(o) > 0, r9 = this.r(9);
      let why = null;
      if (this.blocked(o)) why = owned ? 'Can’t have any more!' : 'Can’t have any of this item!';
      else if (o.Mass > 0 && o.Mass > port.freeMass(g)) why = owned ? 'Can’t hold any more!' : 'Can’t hold any of this item!';
      if (why) ctx.fillText(why, r9.x, r9.y + 0x60);
      this.textBox(ctx, ui, 'desc', this.r(6), D.descs[3000 + o.index] ?? '', WHITE, 12, FONT, 10);
    }
    ui.buttonIn(ctx, BTN.LEAVE, this.r(1), () => this.leave());
    if (buy) ui.buttonIn(ctx, BTN.BUY, this.r(7), () => this.trade(it, true));
    if (sell) ui.buttonIn(ctx, BTN.SELL, this.r(4), () => this.trade(it, false));
    if (nav.up) ui.buttonIn(ctx, BTN.UP, this.r(10), () => { this.scroll -= 4; this.sel = null; });
    if (nav.down) ui.buttonIn(ctx, BTN.DOWN, this.r(11), () => { this.scroll += 4; this.sel = null; });
  }
  // 0x10041f60: the purchase repeats (x5 / x10) while ev_outfit_can_buy still allows it
  trade(it, buying) {
    const g = this.game, P = g.data.spob[g.landed];
    for (let i = multiple(); i > 0; i--) {
      if (buying ? !this.canBuy(it) : !this.canSell(it)) break;
      (buying ? port.buyOutfit : port.sellOutfit)(g, P, it.o.id, this.sp.visit);
    }
    g.outfitsChanged(); this.app.save();
  }
  leave() { this.app.save(); this.close(); }
  key(e) { if (this.infoKey(e, { info: false })) return true; if (e.key === 'Enter') this.leave(); return true; }   // FUN_10042a94: map (2), mission info (0xd)
}

// ---------------------------------------------------------------- shipyard and hiring (DLOG 1004)
// ev_shipyard_screen 0x10043fc0 serves both the shipyard and the bar's Hire An Escort (r3 = 1), with
// draw proc 0x100455ac, filter 0x10044e2c and buttons FUN_1000bf20. Shipyard: item 1 Buy Ship (7006),
// item 7 Leave (7008); hiring: Select (7072) and Cancel (7074). Item 1 shows only while affordable
// (buy: credits >= max(0, price - trade-in); hire: credits >= price / 10), Info (item 10) always, the
// arrows (12/13) only when they can scroll. Item 6 is desc 2000 + index (hiring: 2100 + index), item 8
// PICT 5000 + index. Item 9 (white): shipyard "Ship Price:", "Trade-In:", "Final Price:", "You Have:"
// at top + 12 / 24 / 48 / 72, nothing when the selection is your own type; hiring "Hiring Price:" and
// "You Have:" at + 12 / 36. Buying asks for the new ship's name (DLOG 3001, "Please name your new
// <STR# 5002 name>: ", default "<name> NNN") and closes the shipyard; hiring takes price / 10 and
// closes. A double click or Info opens the ship info (FUN_10045fd0). Return leaves. The hire screen was
// checked against the running original (orig-50/51); buy mode follows the same code.
export class ShipyardDialog extends Dialog {
  constructor(app, sp, { hire = false } = {}) { super(app, 1004); this.sp = sp; this.hire = hire; this.sel = null; this.scroll = 0; }
  items() { const g = this.game; return port.shipsFor(g, g.data.spob[g.landed], this.hire).map(x => ({ ...x, key: x.T.id, index: x.T.index })); }
  cost(it) { return this.hire ? Math.trunc(0.1 * it.price) : port.shipNetPrice(this.game, this.game.data.spob[this.game.landed], it.T).net; }
  draw(ctx, ui) {
    const g = this.game, D = g.data, P = D.spob[g.landed], A = this.app.assets, items = this.items();
    this.frame(ctx, ui);
    const nav = drawGrid(this, ctx, ui, items, 5100, 5101, it => this.data.str(5001, it.T.index) || it.T.name);
    const it = items.find(x => x.key === this.sel), T = it?.T, ok = !!it && g.pilot.credits >= this.cost(it);
    if (it) {
      drawItemPict(this, ctx, A.pict(5000 + T.index));
      if (this.hire) priceRows(this, ctx, [['Hiring Price:', `${cr(Math.trunc(0.1 * it.price))} cr`, 12], ['You Have:', `${cr(g.pilot.credits)} cr`, 36]]);
      else if (T.id !== g.pilot.shipType) {
        const n = port.shipNetPrice(g, P, T);
        priceRows(this, ctx, [['Ship Price:', `${cr(n.price)} cr`, 12], ['Trade-In:', `${cr(n.tradeIn)} cr`, 24], ['Final Price:', `${cr(n.net)} cr`, 48], ['You Have:', `${cr(g.pilot.credits)} cr`, 72]]);
      }
      this.textBox(ctx, ui, 'desc', this.r(6), D.descs[(this.hire ? 2100 : 2000) + T.index] ?? '', WHITE, 12, FONT, 10);
    }
    if (ok) ui.buttonIn(ctx, this.hire ? BTN.SELECT : BTN.BUY_SHIP, this.r(1), () => this.choose(it));
    ui.buttonIn(ctx, this.hire ? BTN.CANCEL_MID : BTN.LEAVE_MID, this.r(7), () => this.leave());
    ui.buttonIn(ctx, BTN.INFO, this.r(10), () => { if (it) this.app.openDialog(new ShipInfoDialog(this.app, T)); });
    if (nav.up) ui.buttonIn(ctx, BTN.UP, this.r(12), () => { this.scroll -= 4; this.sel = null; });
    if (nav.down) ui.buttonIn(ctx, BTN.DOWN, this.r(13), () => { this.scroll += 4; this.sel = null; });
  }
  doubleClick(it) { this.app.openDialog(new ShipInfoDialog(this.app, it.T)); }
  choose(it) {
    const g = this.game, P = g.data.spob[g.landed];
    if (this.hire) { port.hireEscort(g, P, it.T.id); this.app.save(); this.close(); return; }
    const long = g.data.str(5002, it.T.index) || it.T.name;
    const def = `${it.T.name} ${[0, 1, 2].map(() => g.rng.rand(9) + 1).join('')}`;
    this.app.openDialog(new ShipNameDialog(this.app, `Please name your new ${long}: `, def, name => {
      const r = port.buyShip(g, P, it.T.id, this.sp.visit);
      if (r.ok) { g.pilot.shipName = name; g.outfitsChanged(); }
      this.app.save(); this.close();
    }));
  }
  leave() { this.app.save(); this.close(); }
  key(e) { if (this.infoKey(e)) return true; if (e.key === 'Enter') this.leave(); return true; }   // FUN_10044e2c: items 3/4/11
}
// The bar's Hire An Escort is the shipyard screen in hire mode (0x10009c34: ev_shipyard_screen(1)).
export class EscortDialog extends ShipyardDialog {
  constructor(app) { super(app, null, { hire: true }); }
}

// FUN_10047bd4: the system dialog DLOG 3001 (the one the title screen christens a new pilot's ship
// with): prompt in item 3, the name in item 5 (at most 20 characters; a longer one beeps), OK the
// default. Drawn with the title screen's Platinum widgets.
export class ShipNameDialog {
  constructor(app, prompt, name, done, cancel = null) { this.app = app; this.prompt = prompt; this.edit = name; this.sel = true; this.done = done; this.cancel = cancel; }
  draw(ctx, ui) {
    const L = this.app.data.ui[3001], x = Math.ceil((640 - L.w) / 2) - 1, y = Math.ceil((480 - L.h) / 2) - 1;
    const r = n => { const i = L.items[n]; return { x: x + i.x, y: y + i.y, w: i.w, h: i.h }; };
    ui.hit(0, 0, 640, 480, () => { });
    ui.macWindow(ctx, x, y, L.w, L.h);
    const icon = this.app.assets.pict(130); if (icon && L.items[4]) ctx.drawImage(icon, r(4).x, r(4).y);
    ui.macText(ctx, this.prompt, r(3));
    ui.macEdit(ctx, this.edit, r(5), this.sel, Math.floor(performance.now() / 500) % 2 === 0, () => (this.sel = false));
    ui.macButton(ctx, 'OK', r(1), () => this.ok(), true, this.edit.trim().length > 0);
    ui.macButton(ctx, 'Cancel', r(6), () => this.quit());
  }
  quit() { this.app.closeDialog(this); this.cancel?.(); }
  ok() { if (!this.edit.trim()) return; this.app.closeDialog(this); this.done(this.edit.trim()); }
  key(e) {
    if (e.key === 'Enter') this.ok();
    else if (e.key === 'Escape') this.quit();
    else if (e.key === 'Backspace') { this.edit = this.sel ? '' : this.edit.slice(0, -1); this.sel = false; }
    else if (e.key.length === 1) { if (this.sel) this.edit = ''; this.sel = false; if (this.edit.length < 20) this.edit += e.key; }
    return true;
  }
}

// ---------------------------------------------------------------- ship info (DLOG 1005)
// FUN_10045fd0 / draw proc FUN_1004646c (asm), checked against the running original (orig-52): black
// window framed grey; item 3 the ship's name in Times 18, white, centred, baseline top + 18; item 5 in
// Geneva 9 with grey (#888888) labels at the left and white values at +45, 12 px rows: Speed, Accel,
// Turn, Shields, Armor, Guns, Turrets, Space, Cargo, Fuel; Length / Mass / Crew in a second column
// (labels +100, values +138) beside Space / Cargo / Fuel. "Standard weapons:" at + 144 (white), one
// line per weapon type 15 px in from + 156. Item 1 is the Done picture (7010).
const RATING = ['N/A', 'Terrible', 'Poor', 'Average', 'Good', 'Very Good', 'Excellent'];
export class ShipInfoDialog extends Dialog {
  constructor(app, T) { super(app, 1005); this.T = T; }
  rows() {
    const T = this.T, a = T.Accel / 10000;
    const accel = a > 0.073 ? 6 : a > 0.055 ? 5 : a > 0.038 ? 4 : a > 0.025 ? 3 : a > 0.013 ? 2 : a > 0 ? 1 : 0;
    const turn = T.Maneuver <= 0 ? 0 : Math.min(6, T.Maneuver);
    const shield = T.Shield < 0 ? T.Shield * -5 : T.Shield, s = n => (n === 1 ? '' : 's');
    const max = n => (n > 0 ? `Maximum of ${n}` : 'None');
    return [['Speed:', String(Math.trunc(T.Speed))], ['Accel:', RATING[accel]], ['Turn:', RATING[turn]],
      ['Shields:', shield > 0 ? cr(Math.trunc(0.1 * shield)) : 'None'], ['Armor:', T.Armor > 0 ? cr(Math.trunc(0.1 * T.Armor)) : 'None'],
      ['Guns:', max(T.MaxGun)], ['Turrets:', max(T.MaxTur)], ['Space:', `${T.FreeMass} ton${s(T.FreeMass)}`],
      ['Cargo:', `${Math.abs(T.Holds)} ton${s(Math.abs(T.Holds))}`], ['Fuel:', `${Math.trunc(T.Fuel / 100)} jump${T.Fuel > 100 ? 's' : ''}`]];
  }
  // One line per weapon id (ascending): "<count> <gun outfit>[s]" plus " + <ammo> <ammo outfit>[s]";
  // a fighter bay (guidance 99) shows only "<ammo> <ammo outfit>[s]".
  weapons() {
    const T = this.T, D = this.data, by = new Map();
    T.WeapType.forEach((w, i) => { if (w >= 128 && T.WeapCount[i] > 0) { const x = by.get(w) ?? { n: 0, ammo: 0 }; x.n += T.WeapCount[i]; x.ammo += Math.max(0, T.AmmoLoad[i]); by.set(w, x); } });
    const outf = (type, w) => Object.values(D.outf).find(o => o.ModType === type && o.ModVal === w)?.name ?? '';
    return [...by.entries()].sort((p, q) => p[0] - q[0]).map(([w, x]) => {
      const ammo = `${x.ammo} ${outf(MOD.AMMO, w)}${x.ammo > 1 ? 's' : ''}`;
      if (D.weap[w]?.Guidance === 99) return ammo;
      return `${x.n} ${outf(MOD.WEAPON, w)}${x.n > 1 ? 's' : ''}` + (x.ammo > 0 ? ` + ${ammo}` : '');
    });
  }
  draw(ctx, ui) {
    const T = this.T;
    this.frame(ctx, ui);
    const t = this.r(3); ctx.font = TITLE_FONT; ctx.fillStyle = WHITE; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.fillText(T.name, t.x + t.w / 2, t.y + 18); ctx.textAlign = 'left';
    const r = this.r(5), GREY = '#888888';
    ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.font = FONT;
    const pair = (label, value, x, vx, y) => { ctx.fillStyle = GREY; ctx.fillText(label, r.x + x, r.y + y); ctx.fillStyle = WHITE; ctx.fillText(value, r.x + vx, r.y + y); };
    this.rows().forEach(([l, v], i) => pair(l, v, 0, 45, 12 + i * 12));
    const s = n => (n === 1 ? '' : 's');
    pair('Length:', `${T.Length} m`, 100, 138, 0x60); pair('Mass:', `${T.Mass} ton${s(T.Mass)}`, 100, 138, 0x6c); pair('Crew:', String(Math.max(1, T.Crew)), 100, 138, 0x78);
    const w = this.weapons(); ctx.fillStyle = WHITE;
    ctx.fillText(w.length ? 'Standard weapons:' : 'No standard weapons', r.x, r.y + 0x90);
    w.forEach((line, i) => ctx.fillText(line, r.x + 15, r.y + 0x9c + i * 12));
    ui.buttonIn(ctx, BTN.DONE, this.r(1), () => this.close());
  }
  key(e) { if (this.infoKey(e)) return true; if (e.key === 'Enter' || e.key === 'Escape') this.close(); return true; }   // FUN_10046200: items 4/2/6
}

// ---------------------------------------------------------------- mission computer (DLOG 1006)
// FUN_10055f00 (asm), checked against the running original: Geneva 9 throughout. Item 8 is the header
// "The following missions are available here:" in light grey (baseline top + 12). Items 2+3 are a List
// Manager list with a Platinum scroll bar, framed in grey 2 px outside; rows are 12 px, white text at
// +4 / baseline +10, the selected row filled (0,0x88,0). Item 5 is the title in Times 18 white
// (baseline top + 14), item 4 the briefing in white. The short date sits grey at the port's bottom left.
export class MissionDialog extends Dialog {
  constructor(app, list) { super(app, 1006); this.list = list; this.sel = 0; this.top = 0; }
  draw(ctx, ui) {
    const g = this.game, offers = M.offers(g, this.list);
    if (this.sel >= offers.length) this.sel = offers.length ? 0 : -1;
    this.frame(ctx, ui);
    const GREY = '#444444';
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    const t = this.r(8); ctx.fillStyle = '#cccccc'; ctx.fillText('The following missions are available here:', t.x, t.y + 12);
    const L = this.r(2), S = this.r(3), rows = Math.floor(L.h / 12);
    ctx.strokeStyle = GREY; ctx.lineWidth = 1; ctx.strokeRect(L.x - 1.5, L.y - 1.5, L.w + S.w + 3, L.h + 3);
    this.top = Math.max(0, Math.min(this.top, offers.length - rows));
    ctx.save(); ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
    offers.slice(this.top, this.top + rows).forEach((o, k) => {
      const i = this.top + k, y = L.y + k * 12;
      ui.hit(L.x, y, L.w, 12, () => (this.sel = i));
      if (this.sel === i) { ctx.fillStyle = '#008800'; ctx.fillRect(L.x, y, L.w, 12); }
      ctx.fillStyle = WHITE; ctx.fillText(M.missionTitle(g, o), L.x + 4, y + 10);
    });
    ctx.restore();
    this.scrollBar(ctx, ui, S, offers.length, rows);
    const o = offers[this.sel];
    if (o) {
      const T = this.r(5); ctx.font = TITLE_FONT; ctx.fillStyle = WHITE; ctx.fillText(M.missionTitle(g, o), T.x + 1, T.y + 14);
      this.textBox(ctx, ui, 'desc', this.r(4), M.offerText(g, o), WHITE, 12, FONT, 10);
    }
    ctx.font = FONT; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = GREY; ctx.fillText(shortDate(g.pilot.date), this.x + 5, this.y + this.h - 6);
    if (o) ui.buttonIn(ctx, BTN.ACCEPT, this.r(1), () => acceptOffer(this.app, o));
    ui.buttonIn(ctx, BTN.LEAVE_MID, this.r(7), () => this.close());
  }
  // Platinum scroll bar (Mac OS 9, arrows together at the bottom): light track; greyed out when the
  // list fits, as in the original's Levo screenshot. The enabled look (thumb, black arrows) is drawn
  // from the same system appearance, not measured (re-gaps).
  scrollBar(ctx, ui, S, n, rows) {
    const on = n > rows, X = S.x, Y = S.y - 1, W = S.w, H = S.h + 1, ab = Y + H - 30;
    ctx.fillStyle = '#000'; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(X + 1, Y + 1, W - 2, H - 2);
    ctx.fillStyle = '#555555'; ctx.fillRect(X + 1, Y, W - 2, 1); ctx.fillRect(X + 1, ab, W - 2, 1);
    ctx.fillStyle = '#888888'; ctx.fillRect(X + 1, ab + 15, W - 2, 1);
    const tri = (cy, up) => {
      ctx.fillStyle = on ? '#000' : '#888888'; ctx.beginPath();
      const cx = X + W / 2;
      if (up) { ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx + 4, cy + 2); ctx.lineTo(cx, cy - 2); }
      else { ctx.moveTo(cx - 4, cy - 2); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx, cy + 2); }
      ctx.fill();
    };
    tri(ab + 8, true); tri(ab + 22, false);
    if (!on) return;
    const span = ab - Y - 2, th = Math.max(16, Math.round(span * rows / n)), ty = Y + 1 + Math.round((span - th) * this.top / (n - rows));
    ctx.fillStyle = '#9c9cce'; ctx.fillRect(X + 1, ty, W - 2, th);
    ctx.fillStyle = '#000'; ctx.fillRect(X + 1, ty, W - 2, 1); ctx.fillRect(X + 1, ty + th - 1, W - 2, 1);
    ui.hit(X, ab, W, 15, () => (this.top -= 1));
    ui.hit(X, ab + 15, W, 16, () => (this.top += 1));
  }
  wheel(dir, p) { const L = this.r(2); if (p.x >= L.x && p.x < L.x + L.w + this.r(3).w && p.y >= L.y && p.y < L.y + L.h) { this.top += dir; return true; } return super.wheel(dir, p); }
  key(e) {
    if (this.infoKey(e)) return true;   // FUN_100556b4
    const n = M.offers(this.game, this.list).length;
    if (e.key === 'ArrowDown') { this.sel = Math.min(n - 1, this.sel + 1); this.top = Math.max(this.top, this.sel - 11); }
    else if (e.key === 'ArrowUp') { this.sel = Math.max(0, this.sel - 1); this.top = Math.min(this.top, this.sel); }
    else return super.key(e);
    return true;
  }
}
const TITLE_FONT = '18px EVTimes, Times, "Times New Roman", serif';
export function acceptOffer(app, o, after) {
  const r = M.accept(app.game, o);
  if (!r.ok) { app.openDialog(new NoticeDialog(app, r.msg)); return false; }
  app.save();
  if (r.text) app.openDialog(new NoticeDialog(app, r.text));
  after?.();
  return true;
}

// One offer at a time, as the bar does (DLOG 1016).
export class SingleMissionDialog extends Dialog {
  constructor(app, offer, { onAccept } = {}) { super(app, 1016); this.o = offer; this.onAccept = onAccept; }
  key(e) { return this.infoKey(e) || super.key(e); }   // FUN_10059b34
  draw(ctx, ui) {
    const g = this.game, o = this.o;
    this.frame(ctx, ui);
    this.textBox(ctx, ui, 'offer', this.r(3), M.offerText(g, o), WHITE, 12, FONT, 10);  // white Geneva 9, as in the original (orig-42)
    if (o.m.Flags & 4) ui.buttonIn(ctx, BTN.OKAY, this.r(6), () => this.accept());
    else {
      ui.buttonIn(ctx, BTN.YES, this.r(1), () => this.accept());
      ui.buttonIn(ctx, BTN.NO, this.r(2), () => this.refuse());
    }
  }
  accept() { this.close(); acceptOffer(this.app, this.o, this.onAccept); }
  refuse() { this.close(); const t = M.refuse(this.game, this.o); if (t) this.app.openDialog(new NoticeDialog(this.app, t)); }
  onDefault() { if (this.o.m.Flags & 4) this.accept(); else this.refuse(); return true; }
}

// ---------------------------------------------------------------- bar (DLOG 1013), news (1014), slots (1015)
// 0x10009abc / draw proc FUN_10009ec0: black window framed grey, item 7 holds the spob's bar desc
// (10000 + spob index) in Geneva 9 white (TETextBox, then InvertRect). Gamble opens the slots only
// with 1,000 credits or more (else a sound only); Hire An Escort only while fewer than 6 hired escorts
// fly with you (FUN_10065b30). Checked against the running original (Levo Bar & Grill).
export class BarDialog extends Dialog {
  constructor(app) {
    super(app, 1013);
    const D = app.data, g = app.game;
    this.text = D.descs[10000 + D.spob[g.landed].index] ?? '';
    this.news = newsItems(g);
  }
  draw(ctx, ui) {
    this.frame(ctx, ui);
    this.textBox(ctx, ui, 'bar', this.r(7), this.text, WHITE, 12, FONT, 10);
    ui.buttonIn(ctx, BTN.HIRE_AN_ESCORT, this.r(5), () => this.hire());
    ui.buttonIn(ctx, BTN.GAMBLE, this.r(2), () => this.gamble());
    ui.buttonIn(ctx, BTN.HOLOVID, this.r(3), () => this.app.openDialog(new NewsDialog(this.app, this.news)));
    ui.buttonIn(ctx, BTN.LEAVE_MID, this.r(1), () => this.close());
  }
  hire() { if (this.game.pilot.escorts.filter(e => e.hired).length < 6) this.app.openDialog(new EscortDialog(this.app)); }
  gamble() { if (this.game.pilot.credits >= 1000) this.app.openDialog(new SlotDialog(this.app)); else beep(this.app, BEEP.REFUSE); }
}

// FUN_1000a03c: PICT 9000 fills the window; draw proc FUN_1000a20c sets two TETextBoxes in Geneva 9,
// white (InvertRect): the commercial in (L+15, T+140, R-15, T+180), the news in (L+15, T+170, R-15,
// B-18), so the second erases the first's third line. It waits for a click, Return or Space
// (ev_key_down_live 0x2c / 0x39 are KeyMap bits for key codes 0x24 and 0x31); Esc does nothing.
// Checked against the running original (orig-44: baselines at top + 150 and top + 180).
export class NewsDialog extends Dialog {
  constructor(app, news) { super(app, 1014); this.news = news ?? newsItems(app.game); beep(app, BEEP.OPEN); }
  close() { beep(this.app, BEEP.CLOSE); super.close(); }
  draw(ctx, ui) {
    const A = this.app.assets, L = this.x, T = this.y, R = L + this.w, B = T + this.h;
    if (this.modal) ui.hit(0, 0, 640, 480, () => this.close());
    ctx.fillStyle = '#000'; ctx.fillRect(L, T, this.w, this.h);
    const bg = A.pict(9000); if (bg) ctx.drawImage(bg, L, T);
    const box = (key, r, text) => { ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h); this.textBox(ctx, ui, key, r, text, WHITE, 12, FONT, 10); };
    box('ad', { x: L + 15, y: T + 140, w: R - 15 - (L + 15), h: 40 }, this.news.ad);
    box('news', { x: L + 15, y: T + 170, w: R - 15 - (L + 15), h: B - 18 - (T + 170) }, this.news.news);
  }
  key(e) { if (e.key === 'Enter' || e.key === ' ') this.close(); return true; }
}
// ev_bar_news 0x1000a3c8, run once as the bar opens. The commercial is a random STR# 8100 entry. The
// news: a random active event (days > 1) at this spob or galaxy-wide (Stellar -2); failing that, half
// the time any active event. Its text is STR resource 6000 + index, else STR# 8102 entry index + 1,
// else (an event with a spob) "Today’s Top News: <event name> has raised|lowered the price of
// <commodity> on <spob>." With no event: a random STR# 8101 entry, else "No news to report".
export function newsItems(g) {
  const D = g.data, any = id => D.strings[id]?.length ? D.str(id, g.rng.rand(D.strings[id].length)) : '';
  const act = Object.values(D.oops).filter(o => (g.pilot.oops[o.id]?.days ?? 0) > 1);
  const here = act.filter(o => g.pilot.oops[o.id].spob === g.landed || o.Stellar === -2);
  const pick = here.length ? here[g.rng.rand(here.length)] : (act.length && g.rng.rand(2) === 0 ? act[g.rng.rand(act.length)] : null);
  let news;
  if (!pick) news = any(8101) || 'No news to report';
  else {
    const t = D.strings[8102]?.[pick.index] ?? '', sp = D.spob[g.pilot.oops[pick.id].spob];
    if (t.length > 1) news = t;
    else if (sp) news = `Today’s Top News: ${pick.name} has ${pick.PriceDelta > 0 ? 'raised' : 'lowered'} the price of ${D.str(4000, pick.Commodity)} on ${sp.name}.`;
    else news = '';
  }
  return { ad: any(8100), news };
}

// ev_bar_slot_machine 0x1000a920 (asm): one bet per visit. A click on item 4 bets 1,000, item 5 5,000
// (with too little money only a sound plays); a click anywhere else leaves. Each reel starts at a
// random symbol (PICT 9001: six 64 px symbols, drawn twice for the wrap) with a run of 200-399 steps:
// 8 px a step while the run is >= 100, then 8 * run / 100, then 1 px until it stops on a symbol.
// FUN_1000b4f8 copies each reel into its item and frames it white. A pair pays 1.3x the bet, three of
// a kind 3x (the bet was already taken). The result replaces the bet buttons (items 4 and 5, Geneva 9,
// white) and the next click leaves. One step per frame is assumed (re-gaps).
export class SlotDialog extends Dialog {
  constructor(app) {
    super(app, 1015);
    const g = app.game;
    this.pos = [0, 1, 2].map(() => g.rng.rand(6) * 64); this.run = [0, 0, 0]; this.msg = null; this.spinning = false;
  }
  draw(ctx, ui) {
    const g = this.game, A = this.app.assets, im = A.pict(9001);
    if (this.spinning) this.step();
    this.frame(ctx, ui);
    ui.hit(0, 0, 640, 480, () => { if (!this.spinning) this.close(); });
    for (let i = 0; i < 3; i++) {
      const r = this.r(1 + i), p = this.pos[i];
      ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
      if (im) {
        const h1 = Math.min(64, 384 - p);
        ctx.drawImage(im, 0, p, 64, h1, r.x, r.y, 64, h1);
        if (h1 < 64) ctx.drawImage(im, 0, 0, 64, 64 - h1, r.x, r.y + h1, 64, 64 - h1);
      }
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    const a = this.r(4), b = this.r(5);
    if (this.msg != null) {
      const u = { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
      this.textBox(ctx, ui, 'msg', u, this.msg, WHITE, 12, FONT, 10);
    } else if (!this.spinning) {
      ui.buttonIn(ctx, BTN.BET_1000, a, () => this.bet(1000));
      ui.buttonIn(ctx, BTN.BET_5000, b, () => this.bet(5000));
    }
  }
  bet(n) {
    const g = this.game;
    if (g.pilot.credits < n) { beep(this.app, BEEP.REFUSE); return; }
    g.pilot.credits -= n; this.stake = n; this.spinning = true;
    this.run = [0, 1, 2].map(() => g.rng.rand(200) + 200);
  }
  step() {
    let done = true;
    for (let i = 0; i < 3; i++) {
      const c = this.run[i];
      if (c <= 0 && this.pos[i] % 64 <= 1) continue;
      if (c >= 100) this.pos[i] -= 8; else if (c > 1) this.pos[i] = Math.trunc(this.pos[i] - 8 * (c / 100)); else this.pos[i] -= 1;
      if (this.pos[i] < 0) this.pos[i] += 384;
      this.run[i] = c - 1; done = false;
    }
    if (done) this.settle();
  }
  settle() {
    const g = this.game, n = this.stake, count = [0, 0, 0, 0, 0, 0];
    for (const p of this.pos) count[Math.max(0, Math.min(5, p >> 6))]++;
    this.spinning = false;
    this.msg = g.data.strings[8152]?.length ? g.data.str(8152, g.rng.rand(3)) : '';
    const best = Math.max(...count), win = best === 2 ? Math.trunc(n * 1.3) : best === 3 ? Math.trunc(n * 3.0) : 0;
    if (win) {
      g.pilot.credits += win;
      const r = win % 1000;
      this.msg = `Congratulations - you win ${Math.trunc(win / 1000)},${String(r).padStart(3, '0')} credits!`;
    }
    this.app.save();
  }
  key() { return true; }
}

// ---------------------------------------------------------------- flight dialogs
// Colours of the comm draw procs (runtime RGB slots; framebuffer values): r2-0xc76 frame / labels,
// r2-0xc7c text-box and picture frames, r2-0xc58 bright green, ForeColor 0xcd red (QuickDraw redColor).
const C_FRAME = '#888888', C_BOX = '#444444', C_GREEN = '#00ff00', C_RED = '#dd0806';
const BTN_RELEASE = 7068, BTN_ACCEPT_PRICE = 7060, BTN_LOWER_PRICE = 7062;
// The comm text item: painted black, TETextBox in the item inset (4,2) in white, framed in C_BOX.
function commText(dlg, ctx, ui, r, text) {
  ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
  dlg.textBox(ctx, ui, 'comm', { x: r.x + 4, y: r.y + 2, w: r.w - 8, h: r.h - 4 }, text ?? '', WHITE, 12, FONT, 10);
  ctx.strokeStyle = C_BOX; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function label(ctx, t, x, y, color) { ctx.font = FONT; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(t, x, y); return x + ctx.measureText(t).width; }
// TextFace(bold) on a bitmap font, as QuickDraw does it: each glyph drawn again 1 px to the right and
// every advance 1 px wider (FUN_100103b4 / FUN_10011bec set style 1 for the Hostile/Forbidden status).
function boldLabel(ctx, t, x, y, color) {
  ctx.font = FONT; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = color;
  for (const ch of t) { ctx.fillText(ch, x, y); ctx.fillText(ch, x + 1, y); x += ctx.measureText(ch).width + 1; }
  return x;
}

// Hailing a ship (DLOG 1007): FUN_1000ee74, draw proc FUN_100103b4, buttons FUN_1000d360, keys
// FUN_10010238 (Return / Enter / e: item 1, r: item 2, g: item 3; a click outside the buttons does
// nothing). Item 1 End Communication, item 2 Beg For Mercy while the ship fights you, else Release From
// Servitude for your own escort, else Request Assistance; item 3 Greetings. Item 11: PICT 5300 + ship
// type scaled into the item, framed 5/2 px outside. Item 12: "Alignment & Type:" / "Class: " and
// "Status: " lines. Item 10: the reply.
export class ShipCommDialog extends Dialog {
  constructor(app, slot) {
    super(app, 1007);
    const g = app.game;
    this.h0 = E.hailShip(g, g.ships[slot]);
    if (this.h0.unhailable) { g.message(this.h0.text, 'msg', 0xf0); queueMicrotask(() => this.app.closeDialog(this)); return; }
    beep(app, BEEP.COMM);
    if (this.h0.offer) queueMicrotask(() => {
      this.app.closeDialog(this);
      app.openDialog(new SingleMissionDialog(app, this.h0.offer, { onAccept: () => E.persAccepted(g, this.h0.ship) }));
    });
  }
  draw(ctx, ui) {
    const g = this.game, D = g.data, A = this.app.assets, h = this.h0, ship = g.ships[h.ship];
    if (h.unhailable || h.offer) return;
    this.frame(ctx, ui);
    const hostile = !!ship && E.attackingPlayer(g, ship);
    ui.buttonIn(ctx, BTN.END_COMM, this.r(1), () => this.item(1));
    ui.buttonIn(ctx, hostile ? BTN.MERCY : h.escort ? BTN_RELEASE : BTN.ASSIST, this.r(2), () => this.item(2));
    ui.buttonIn(ctx, BTN.GREETINGS, this.r(3), () => this.item(3));
    const pr = this.r(11), im = ship && A.pict(5300 + D.ship[ship.type].index);
    if (im) ctx.drawImage(im, pr.x, pr.y, pr.w, pr.h);
    ctx.strokeStyle = C_BOX; ctx.lineWidth = 1; ctx.strokeRect(pr.x - 4.5, pr.y - 1.5, pr.w + 9, pr.h + 3);
    const r = this.r(12);
    ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (ship?.pers === 0x1ff) { label(ctx, 'Alignment & Type:', r.x, r.y + 12, C_FRAME); label(ctx, 'Ambrosia Mascot', r.x + 5, r.y + 25, WHITE); }
    else if (ship && ship.govt >= 0) { label(ctx, 'Alignment & Type:', r.x, r.y + 12, C_FRAME); label(ctx, `${h.govtName} ${h.typeName}`, r.x + 5, r.y + 25, WHITE); }
    else label(ctx, h.typeName, label(ctx, 'Class: ', r.x, r.y + 12, C_FRAME), r.y + 12, WHITE);
    if (hostile) boldLabel(ctx, 'Hostile', label(ctx, 'Status: ', r.x, r.y + 37, C_FRAME), r.y + 37, C_RED);
    else if (ship?.leader === 0 && !h.released) label(ctx, ship.hired ? 'Hired Escort' : 'Escort', label(ctx, 'Status: ', r.x, r.y + 37, C_FRAME), r.y + 37, C_GREEN);
    commText(this, ctx, ui, this.r(10), h.text);
  }
  close() { beep(this.app, BEEP.CLOSE); super.close(); }
  item(n) {
    const g = this.game, h = this.h0;
    if (n === 1) { E.shipCommClosed(g, h); this.close(); return; }
    beep(this.app, BEEP.OPEN);
    E.shipComm(g, h, n);
    if (h.pay) this.app.openDialog(new HaggleDialog(this.app, h.price, true, (ok, price) => { E.shipPaid(g, h, ok, price); this.app.save(); }));
  }
  key(e) {
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' || k === 'e') this.item(1); else if (k === 'r') this.item(2); else if (k === 'g') this.item(3);
    return true;
  }
}

// Price haggling (DLOG 1008 "Negotiation"), FUN_10012a14 in mode 2 with draw proc FUN_10012f0c: item 3
// framed in C_BOX with "Pay me N credits." while the player has a target ship (player +0x2a != -1,
// asm 0x10013024), else "Pay us N credits.", in white at (left+4, top+12): a planet bribed with a ship
// targeted says "Pay me" (the running original, orig-102). Item 1 Accept Price, item 2 Lower Price;
// Return accepts.
export class HaggleDialog extends Dialog {
  constructor(app, price, ship, done) { super(app, 1008); this.n = E.haggleStart(app.game, price); this.ship = ship; this.done = done; }
  draw(ctx, ui) {
    this.frame(ctx, ui);
    const r = this.r(3);
    ctx.strokeStyle = C_BOX; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    label(ctx, `${(this.game.player?.target ?? -1) >= 0 ? 'Pay me ' : 'Pay us '}${cr(this.n.price)} credits.`, r.x + 4, r.y + 12, WHITE);
    ui.buttonIn(ctx, BTN_ACCEPT_PRICE, this.r(1), () => this.finish(true));
    ui.buttonIn(ctx, BTN_LOWER_PRICE, this.r(2), () => { if (!E.haggleLower(this.n)) this.finish(false); });
  }
  finish(ok) { this.close(); this.done(ok, this.n.price); }
  key(e) { if (e.key === 'Enter') this.finish(true); return true; }
}

// Hailing a planet (DLOG 1009): FUN_10010904, draw proc FUN_10011bec, buttons FUN_1000d630, keys
// FUN_100119b0. Item 1 End Communication; item 2 Offer Bribe where landing is forbidden, else
// Greetings; item 3 Release From Servitude on a dominated spob, else Demand Tribute. Item 5: the spob
// sprite, centred across (and, for spob types above 23, also down) the 80 px item, framed 5 px outside.
// Item 6: name (white), STR# 1100 class line, and "Status: Dominated / Forbidden / Hostile".
export class PlanetCommDialog extends Dialog {
  constructor(app, spob) {
    super(app, 1009);
    this.h0 = E.hailPlanet(app.game, spob);
    if (this.h0.unhailable) { beep(app, BEEP.REFUSE); queueMicrotask(() => this.app.closeDialog(this)); return; }
    beep(app, BEEP.COMM);
  }
  draw(ctx, ui) {
    const g = this.game, D = g.data, A = this.app.assets, h = this.h0, P = D.spob[h.spob], p = g.pilot;
    if (h.unhailable) return;
    this.frame(ctx, ui);
    const dom = !!p.dominated[P.id];
    ui.buttonIn(ctx, BTN.END_COMM, this.r(1), () => this.item(1));
    ui.buttonIn(ctx, h.denied ? BTN.BRIBE : BTN.GREETINGS, this.r(2), () => this.item(2));
    ui.buttonIn(ctx, dom ? BTN_RELEASE : BTN.TRIBUTE, this.r(3), () => this.item(3));
    commText(this, ctx, ui, this.r(4), h.text);
    const r = this.r(5), sp = D.sprites[300 + P.Type];
    if (sp) A.sprite(ctx, 300 + P.Type, 0, r.x + 40, P.Type <= 23 ? r.y + sp.h / 2 : r.y + 40);
    ctx.strokeStyle = C_BOX; ctx.lineWidth = 1; ctx.strokeRect(r.x - 4.5, r.y - 4.5, r.w + 9, r.h + 9);
    const t = this.r(6);
    label(ctx, P.name, t.x, t.y + 12, WHITE);
    label(ctx, D.str(1100, P.index) ?? '', t.x, t.y + 26, C_FRAME);
    if (dom) label(ctx, 'Dominated', label(ctx, 'Status: ', t.x, t.y + 42, C_FRAME), t.y + 42, C_GREEN);
    else if (h.denied) {
      const x = label(ctx, 'Status: ', t.x, t.y + 42, C_FRAME), legal = p.legalIn(g.system);
      boldLabel(ctx, legal >= 0 ? 'Forbidden' : 'Hostile', x, t.y + 42, legal >= 0 ? '#ff6600' : C_RED);
    }
  }
  close() { beep(this.app, BEEP.CLOSE); super.close(); }
  item(n) {
    const g = this.game, h = this.h0;
    if (n === 1) { this.close(); return; }
    beep(this.app, BEEP.OPEN);
    E.planetComm(g, h, n);
    if (h.pay) this.app.openDialog(new HaggleDialog(this.app, h.price, false, (ok, price) => { beep(this.app, BEEP.OPEN); E.planetPaid(g, h, ok, price); this.app.save(); if (h.close) this.close(); }));
  }
  key(e) {
    const k = e.key.toLowerCase(), h = this.h0, dom = !!this.game.pilot.dominated[h.spob];
    if (e.key === 'Enter' || k === 'e') this.item(1);
    else if (((k === 'o' || k === 'b') && h.denied) || (k === 'g' && !h.denied)) this.item(2);
    else if (((k === 'd' || k === 't') && !dom) || (k === 'r' && dom)) this.item(3);
    return true;
  }
}

// Boarding a disabled ship (DLOG 1011): FUN_100131c0, draw proc FUN_10014d54 (Geneva 9), buttons
// FUN_1000e670. Items 1 Abort, 2 Cargo, 3 Credits, 4 Ammo, 6 Fuel, 7 Capture Ship, all always drawn.
// Item 5: "Select what to plunder from this ship:" then Cargo / Credits / Ammo / Fuel and Capture Odds,
// values in white at +50 ("None" in the frame grey). What you take is told in the status bar.
const C_PLUNDER_LABEL = '#cccccc';   // r2-0xc70: runtime colour, not measured (re-gaps)
export class PlunderDialog extends Dialog {
  constructor(app, slot) { super(app, 1011); this.slot = slot; }
  draw(ctx, ui) {
    const g = this.game, D = g.data, ship = g.ships[this.slot];
    if (!ship?.alive) { this.close(); return; }
    const b = E.boardState(g, ship);
    this.frame(ctx, ui);
    const r = this.r(5), L = C_PLUNDER_LABEL, none = (x, y) => label(ctx, 'None', x, y, C_FRAME);
    ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
    label(ctx, 'Select what to plunder from this ship:', r.x, r.y + 12, L);
    label(ctx, 'Cargo:', r.x, r.y + 28, L); label(ctx, 'Credits:', r.x, r.y + 42, L); label(ctx, 'Ammo:', r.x, r.y + 56, L);
    if (b.cargo) label(ctx, `${b.cargo.qty} ton${b.cargo.qty > 1 ? 's' : ''} of ${D.str(4000, b.cargo.type)}`, r.x + 50, r.y + 28, WHITE); else none(r.x + 50, r.y + 28);
    if (b.credits > 0) label(ctx, cr(b.credits), r.x + 50, r.y + 42, WHITE); else none(r.x + 50, r.y + 42);
    const o = b.ammo && Object.values(D.outf).find(x => x.ModType === 3 && x.ModVal === b.ammo.wid);
    if (b.ammo) label(ctx, `${b.ammo.qty} ${o?.name ?? ''}${b.ammo.qty > 1 ? 's' : ''}`, r.x + 50, r.y + 56, WHITE); else none(r.x + 50, r.y + 56);
    label(ctx, 'Fuel: ', r.x + 1, r.y + 70, L);
    if (b.fuel > 0) label(ctx, cr(b.fuel), r.x + 50, r.y + 70, WHITE); else none(r.x + 50, r.y + 70);
    label(ctx, 'Capture Odds: ', r.x + 120, r.y + 70, L);
    label(ctx, `${b.odds}%`, r.x + 195, r.y + 70, WHITE);
    const take = n => {
      const res = E.plunder(g, ship, n); this.app.save();
      // FUN_100131c0: Beep3 when something is taken (or on Abort), Beep4 when there is nothing to take,
      // the capture fails or the escorts are full; the self-destruct plays neither.
      if (res.sound || (n === 7 && !res.choose && !res.destroyed)) beep(this.app, BEEP.REFUSE);
      else if (!res.destroyed) beep(this.app, BEEP.CLOSE);
      if (res.close) this.close();
      if (res.choose) this.app.openDialog(new CaptureDialog(this.app, this.slot));
    };
    [[1, BTN.ABORT_SMALL], [2, BTN.CARGO_SMALL], [3, BTN.CREDITS_SMALL], [4, BTN.AMMO_SMALL], [6, BTN.FUEL_SMALL], [7, BTN.CAPTURE]]
      .forEach(([n, id]) => ui.buttonIn(ctx, id, this.r(n), () => take(n)));
  }
  key() { return true; }
}

// After a capture (DLOG 1018): FUN_1004a40c, draw proc FUN_1004a768. Item 3 holds the question in white
// (TETextBox), item 1 Use As My Ship (key m), item 2 Use As Escort (key e).
export class CaptureDialog extends Dialog {
  constructor(app, slot) { super(app, 1018); this.slot = slot; }
  draw(ctx, ui) {
    this.frame(ctx, ui);
    this.textBox(ctx, ui, 'q', this.r(3), 'Do you want to use this ship as an escort to yours, or would you rather trade places with its captain and use it as your own?', WHITE, 12, FONT, 10);
    ui.buttonIn(ctx, BTN.USE_AS_SHIP, this.r(1), () => this.pick(1));
    ui.buttonIn(ctx, BTN.USE_AS_ESCORT, this.r(2), () => this.pick(2));
  }
  // "Use As My Ship" then asks "Now rename this captured ship:" (FUN_10047bd4 at l.8635, default the
  // ship type's name, at most 20 characters). OK names the ship and swaps (FUN_10021624); Cancel keeps
  // your old ship with the message "You decided not to capture this ship after all." (0x1007b484).
  pick(n) {
    const g = this.game, ship = g.ships[this.slot];
    beep(this.app, BEEP.OPEN);
    this.close();
    if (!ship?.alive) return;
    if (n === 2) { E.captureAsEscort(g, ship); this.app.save(); return; }
    this.app.openDialog(new ShipNameDialog(this.app, 'Now rename this captured ship:', g.data.ship[ship.type].name, name => {
      if (!ship.alive) return;
      g.pilot.shipName = name; g.swapToShip(this.slot); this.app.save();
    }, () => g.message('You decided not to capture this ship after all.', 'msg', 0xf0)));
  }
  key(e) { const k = e.key.toLowerCase(); if (k === 'm') this.pick(1); else if (k === 'e') this.pick(2); return true; }
}

// Active missions (DLOG 1012), 0x10058378 with draw proc FUN_10059124 (asm): Geneva 9. Header
// "Currently active missions:" at item 3's bottom left in the frame grey; the short date right-aligned
// 5 px from the port's right on the same baseline, in the list-frame grey. Item 2 is a List Manager list
// (ev_mission_active_list_fill 0x100516xx): each active slot's title, with "• " in front when the
// mission has failed (slot +3), first row selected. Item 4 is the quick brief (TETextBox, white).
// Colours and the list's row look are taken from the mission computer measured in the original.
export class MissionInfoDialog extends Dialog {
  key(e) { return this.infoKey(e, { info: false, missions: false }) || super.key(e); }   // FUN_10058b20: the map only
  constructor(app) { super(app, 1012); this.sel = 0; beep(app, BEEP.OPEN); }
  close() { beep(this.app, BEEP.CLOSE); super.close(); }
  draw(ctx, ui) {
    const g = this.game, list = g.pilot.missions.map((m, i) => ({ m, i })).filter(x => x.m?.active);
    if (this.sel >= list.length) this.sel = 0;
    this.frame(ctx, ui);
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    const t = this.r(3), base = t.y + t.h, date = shortDate(g.pilot.date);
    ctx.fillStyle = '#888888'; ctx.fillText('Currently active missions:', t.x, base);
    ctx.fillStyle = '#444444'; ctx.fillText(date, this.x + this.w - ctx.measureText(date).width - 5, base);
    const L = this.r(2);
    ctx.strokeStyle = '#444444'; ctx.lineWidth = 1; ctx.strokeRect(L.x - 1.5, L.y - 1.5, L.w + 3, L.h + 3);
    ctx.save(); ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
    list.forEach((x, k) => {
      const y = L.y + k * 12;
      ui.hit(L.x, y, L.w, 12, () => (this.sel = k));
      if (this.sel === k) { ctx.fillStyle = '#008800'; ctx.fillRect(L.x, y, L.w, 12); }
      ctx.fillStyle = WHITE; ctx.fillText((x.m.failed ? '• ' : '') + x.m.title, L.x + 4, y + 10);
    });
    ctx.restore();
    const x = list[this.sel];
    if (x) {
      const s = x.m;
      this.textBox(ctx, ui, 'quick', this.r(4), M.descText(g, s.quick, s) ?? s.title, WHITE, 12, FONT, 10);
      ui.buttonIn(ctx, BTN.ABORT_MISSION, this.r(5), () => this.app.openDialog(new ConfirmDialog(this.app, 'Are you sure you want to abort this mission?', () => { M.abort(g, x.i); this.sel = 0; this.app.save(); })), s.canAbort);
    }
    ui.buttonIn(ctx, BTN.DONE, this.r(1), () => this.close());
  }
}

// Player info (DLOG 1017): FUN_10048300 runs it, FUN_10048598 filters events, FUN_100487a8 draws
// (asm; checked against orig-59/60/61). Geneva 9 in item 6: labels in r2-0xc70 (#cccccc), values white,
// rows at top + 12 + 16n; left labels at +5 / values +0x50, right labels +0xcd / values +0x118. Items
// 2-4 are the General / Cargo / Extras tabs (tab = item - 1); FUN_1000e174 draws the current tab's
// lit picture. Tab / shift-Tab cycle the tabs; Return or Enter is Done. Nothing else closes it.
const NUM_WORDS = ['', 'one', 'two', 'three', 'four', 'five'];
const INFO_LABEL = '#cccccc';
// "a, b, and c" joins as the two TETextBox tabs build them (0x100499..., 0x1004a1b8).
export class InfoDialog extends Dialog {
  constructor(app) { super(app, 1017); this.tab = 1; }
  draw(ctx, ui) {
    const g = this.game, D = g.data, p = g.pilot, A = this.app.assets;
    this.frame(ctx, ui);
    const r = this.r(6), L = r.x, T = r.y;
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    const put = (t, x, y, c) => { ctx.fillStyle = c; ctx.fillText(t, x, y); return ctx.measureText(t).width; };
    const centred = (t, y) => { ctx.fillStyle = INFO_LABEL; ctx.fillText(t, Math.trunc((L + L + r.w) / 2) - Math.trunc(ctx.measureText(t).width / 2), y); };
    if (this.tab === 1) this.general(put, L, T);
    else if (this.tab === 2) this.cargo(ctx, ui, put, centred, r);
    else if (this.tab === 3) this.extras(ctx, ui, put, centred, r);
    // tab pictures: the selected one lit (id + 1), the others normal (hover lights them too)
    [BTN.GENERAL, BTN.CARGO_TAB, BTN.EXTRAS].forEach((id, i) => {
      if (this.tab === i + 1) { const im = A.pict(id + 1), b = this.r(2 + i); ui.hit(b.x, b.y, b.w, b.h, () => { }); if (im) ctx.drawImage(im, b.x + Math.round((b.w - im.width) / 2), b.y + Math.round((b.h - im.height) / 2)); }
      else ui.buttonIn(ctx, id, this.r(2 + i), () => (this.tab = i + 1));
    });
    ui.buttonIn(ctx, BTN.DONE_SMALL, this.r(1), () => this.close());
  }
  general(put, L, T) {
    const g = this.game, D = g.data, p = g.pilot, P = g.player, st = P.stats, y = n => T + 12 + 16 * n;
    const pair = (lab, val, n, right = false) => { put(lab, L + (right ? 0xcd : 5), y(n), INFO_LABEL); if (val != null) put(val, L + (right ? 0x118 : 0x50), y(n), WHITE); };
    pair('Pilot Name:', p.name, 0);
    pair('Current Date:', p.dateString(), 1);
    pair('System:', D.syst[g.system].name, 2);
    pair('Legal Status:', inhabited(D, g.system) ? legalLabel(D, p, g.system) : 'N/A', 3);   // FUN_10065c9c
    pair('Combat Rating:', combatRating(D, p.kills), 4);
    pair('Ship Name:', p.shipName ?? '', 0, true);
    pair('Ship Class:', D.ship[p.shipType].name, 1, true);
    pair('Turn Rate:', `${st.turn * 30}°/sec`, 2, true);                     // ev_ship_turn_rate * 30
    pair('Accel Rate:', String(Math.trunc(2500 * st.accel)), 3, true);             // ev_ship_accel * 2500.0
    pair('Max Speed:', String(Math.trunc(57.143 * st.speed)), 4, true);            // ev_ship_max_speed * 57.143
    pair('Credits:', cr(p.credits), 5, true);
    // shield value +0x66: >= 0 shield left, negative = armour lost
    if (P.pool >= 0) pair('Shield Status:', `${Math.trunc(100 * P.pool / st.shieldMax)}%`, 5);
    else pair('Armor Status:', isDead(P) ? 'Failed' : `${Math.trunc(100 * (P.pool + st.armorMax) / st.armorMax)}%`, 5);
    const fuel = P.fuel ?? p.fuel, jumps = Math.trunc(fuel / 100);
    let f = `${Math.trunc(100 * fuel / st.fuelMax)}%`;
    if (jumps > 0) f += `  (${jumps} jump${jumps > 1 ? 's' : ''}${fuel % 100 > 0 ? ' plus maneuvering fuel' : ''})`;
    else if (fuel > 0) f += '  (maneuvering fuel only)';
    pair('Fuel Status:', f, 6);
    // escort wages: hired escorts flying with you, 1% of the ship's cost each (summed with truncation)
    let wages = 0;
    for (const e of g.ships) if (e?.alive && e.slot > 0 && e.leader === 0 && e.hired && !(e.mission >= 0)) wages = Math.trunc(wages + 0.01 * D.ship[e.type].Cost);
    let row = 7;
    const perDay = (lab, n) => { let x = L + 5 + put(lab, L + 5, y(row), INFO_LABEL); x += put(cr(n), x, y(row), WHITE); x += put(' credits', x, y(row), WHITE); put(' per day', x, y(row), INFO_LABEL); row++; };
    if (wages > 0) perDay('Escort Payments:  ', wages);
    let tribute = 0;
    for (const [id, on] of Object.entries(p.dominated ?? {})) if (on && D.spob[id] && g.spobInPlay(+id)) tribute += D.spob[id].TechLevel * 1000;
    if (tribute > 0) perDay('Tribute Received:  ', tribute);
  }
  cargo(ctx, ui, put, centred, r) {
    const g = this.game, D = g.data, p = g.pilot, amt = new Map();
    p.cargo.forEach((n, i) => { if (n > 0) amt.set(i, (amt.get(i) ?? 0) + n); });
    for (const m of p.missions ?? []) if (m?.active && m.loaded && m.cargoType >= 0) amt.set(m.cargoType, (amt.get(m.cargoType) ?? 0) + (m.cargoQty ?? 0));
    const items = [...amt.entries()].sort((a, b) => a[0] - b[0]).map(([i, n]) => [n, D.str(4001, i)]);
    for (const j of Object.values(D.junk).sort((a, b) => a.index - b.index)) { const n = p.junk?.[j.id] ?? 0; if (n > 0) items.push([n, D.str(4006, j.index)]); }
    const cap = port.cargoCapacity(g), capF = g.cargoCapacityWithEscorts(), fleet = capF > cap;
    if (!items.length) { centred(fleet ? 'You don’t have any cargo aboard your fleet’s ships' : 'You don’t have any cargo aboard your ship', r.y + 0x37); return; }
    put(fleet ? 'Current cargo aboard your fleet’s ships:' : 'Current cargo aboard your ship:', r.x + 5, r.y + 12, INFO_LABEL);
    let s = '';
    items.forEach(([n, name], k) => {
      if (n > 0) s += (n > 5 ? String(n) : NUM_WORDS[n]) + (n === 1 ? ' ton' : ' tons') + ' of ';
      s += name;
      if (k < items.length - 2) s += ', ';
      if (k === items.length - 2) s += (items.length >= 3 ? ',' : '') + ' and ';
    });
    this.infoText(ctx, ui, r, s);
    const free = Math.max(0, capF - port.cargoUsed(g));
    if (capF - port.cargoUsed(g) <= 0) return;
    const y = r.y + r.h - 0xe;
    let x = r.x + 5 + put(fleet ? 'Free cargo space in fleet: ' : 'Free cargo space: ', r.x + 5, y, INFO_LABEL);
    x += put(`${free} ton${free > 1 ? 's' : ''}`, x, y, WHITE);
    if (!fleet) return;
    const own = Math.max(0, cap - port.cargoUsed(g));                                // ev_cargo_free_display
    if (own !== free && own > 0) put(` (${own} ton${own > 1 ? 's' : ''} free in your ship)`, x, y, WHITE);
    else if (own === 0) put(' (none free in your ship)', x, y, WHITE);
  }
  extras(ctx, ui, put, centred, r) {
    const g = this.game, D = g.data, p = g.pilot;
    const items = Object.entries(p.outfits ?? {}).filter(([id, n]) => n > 0 && D.outf[id]).map(([id, n]) => [n, D.outf[id].index]).sort((a, b) => a[1] - b[1]);
    if (!items.length) { centred('You don’t have any extras on your ship', r.y + 0x37); return; }
    put('Current extras for your ship:', r.x + 5, r.y + 12, INFO_LABEL);
    let s = '';
    items.forEach(([n, i], k) => {
      const one = D.str(5004, i);
      s += n === 1 ? ('aeiou'.includes(one.charAt(0).toLowerCase()) ? 'an ' : 'a ') : n === 2 ? 'two ' : n === 3 ? 'three ' : `${n} `;
      s += n > 1 ? D.str(5005, i) : one;
      if (k + 1 < items.length - 1) s += ', ';
      if (k + 1 === items.length - 1) s += ', and ';
    });
    this.infoText(ctx, ui, r, s);
    const y = r.y + r.h - 0xe;
    const x = r.x + 5 + put('Ship trade-in value: ', r.x + 5, y, INFO_LABEL);
    put(`${cr(port.tradeIn(g))} credits`, x, y, WHITE);
  }
  // TETextBox in item 6 inset 10, then top + 10, bottom - 10, right - 5; first letter upper-cased, "." added.
  infoText(ctx, ui, r, s) {
    const box = { x: r.x + 10, y: r.y + 20, w: r.w - 25, h: r.h - 40 };
    this.textBox(ctx, ui, 'info' + this.tab, box, s.charAt(0).toUpperCase() + s.slice(1) + '.', WHITE, 12, FONT, 10);
  }
  key(e) {
    if (e.key === 'Tab') { this.tab += e.shiftKey ? -1 : 1; if (this.tab > 3) this.tab = 1; if (this.tab < 1) this.tab = 3; }
    else if (e.key === 'Enter') this.close();
    return true;
  }
}
// FUN_10065c9c: the system has a nav-default spob that isn't uninhabited.
function navSpobs(D, sys) { const S = D.syst[sys]; return [S.Nav1, S.Nav2, S.Nav3, S.Nav4].map(id => (id >= 0 ? D.spob[id] ?? null : null)); }
function inhabited(D, sys) { return navSpobs(D, sys).some(P => P && !D.spobFlag(P, SPOB.UNINHABITED)); }

// ---------------------------------------------------------------- galaxy map (DLOG 2000)
// 0x10039f68 runs it, FUN_1003e260 filters its events, FUN_1003b348 draws it (asm; checked against
// orig-56/57/58/68/69). Colours are the real framebuffer values of the r2-0xc.. slots FUN_1005afb8 sets.
const MAP = {
  GREY: '#444444', FRAME: '#888888', LABEL: '#cccccc', NAV: 'rgb(0,153,0)', ROUTE: 'rgb(0,255,0)',
  BLUE: '#0000dd', ORANGE: 'rgb(255,102,0)', RED: '#dd0000', CYAN: 'rgb(0,153,255)',
};
const sysLinks = S => Array.from({ length: 16 }, (_, i) => S[`Con${i + 1}`] ?? -1);
export class MapDialog extends Dialog {
  constructor(app) {
    super(app, 2000);
    // the scale [10079984] (1.0 at first) and the centre [1007980c] are kept between openings
    app.mapScale ||= 1;
    if (!app.mapCentre) { const s = this.data.syst[this.game.system]; app.mapCentre = { x: s.xPos, y: s.yPos }; }
    // the system shown in the panes [10079954]: the hyperspace destination if set, else the current one
    this.sel = this.game.navSys >= 0 ? this.game.navSys : this.game.system;
    this.drag = null;
    this.onUp = () => { this.drag = null; };
    addEventListener('pointerup', this.onUp);
  }
  close() { removeEventListener('pointerup', this.onUp); super.close(); }
  level(id) { return this.game.pilot.explored[id] ?? 0; }
  // Only systems in play (sÿst VisBit, EVO 0x100314d0 / 0x10030014) are drawn, linked or clicked.
  exists(id) { return id >= 0 && !!this.data.syst[id] && this.game.inPlay(id); }
  // [10079964]: each active mission marks its travel spob's system, or its return spob's once it has
  // arrived; a mission with slot flag 0x2 is not marked
  missionSystems() {
    const D = this.data, out = new Set();
    for (const m of this.game.pilot.missions ?? []) {
      if (!m?.active || (m.flags & 2)) continue;
      const g = this.game;   // a mark needs its spob in play
      let s = m.travel >= 0 && g.spobInPlay(m.travel) ? D.spob[m.travel].System : -1;
      if (m.arrived && m.ret >= 0 && m.ret !== m.travel && D.spob[m.ret] && g.spobInPlay(m.ret)) s = D.spob[m.ret].System;
      if (s >= 0) out.add(s);
    }
    return out;
  }
  linkedToExplored(id) { return sysLinks(this.data.syst[id]).some(l => this.exists(l) && this.level(l) > 0); }
  // FUN_10063420: the ring colour of a system's dot
  dotColour(id) {
    const D = this.data, p = this.game.pilot;
    if (this.level(id) <= 0) return MAP.GREY;
    if (!inhabited(D, id)) return MAP.LABEL;
    let c = MAP.BLUE, dom = false;
    for (const P of navSpobs(D, id).slice(0, 3)) {
      if (!P || D.spobFlag(P, SPOB.UNINHABITED) || !D.spobFlag(P, SPOB.LAND)) continue;
      const rec = p.legalIn(id);
      if (rec < P.MinCoolness) c = rec >= 0 ? (c === MAP.RED ? c : MAP.ORANGE) : MAP.RED;
      if (p.dominated?.[P.id]) dom = true;
    }
    return dom ? MAP.ROUTE : c;
  }
  draw(ctx, ui) {
    const g = this.game, D = this.data, app = this.app, sc = app.mapScale, C = app.mapCentre;
    this.frame(ctx, ui);
    const R = this.r(3), ox = R.x + Math.trunc(R.w / 2), oy = R.y + Math.trunc(R.h / 2);
    if (this.drag) {   // dragging empty map space scrolls it
      C.x = Math.trunc(this.drag.cx - sc * (ui.mouse.x - this.drag.mx));
      C.y = Math.trunc(this.drag.cy - sc * (ui.mouse.y - this.drag.my));
    }
    const SX = id => Math.trunc(ox + D.syst[id].xPos / sc - C.x / sc), SY = id => Math.trunc(oy + D.syst[id].yPos / sc - C.y / sc);
    ctx.fillStyle = '#000'; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.save(); ctx.beginPath(); ctx.rect(R.x + 1, R.y + 1, R.w - 2, R.h - 2); ctx.clip();
    // nebulae: PICT 9500 + 3 * index + (0 zoomed out, 1 at 1:1, 2 zoomed in), stretched to the map
    const zi = sc > 1 ? 0 : sc === 1 ? 1 : 2;
    // only nebulae the pilot has seen (FUN_1006494c sets the record's byte +8; the draw loop skips the rest)
    for (const n of Object.values(D.nebu ?? {}).sort((a, b) => a.index - b.index).slice(0, 4).filter(n => g.pilot.nebulae?.[n.index])) {
      const im = app.assets.pict(9500 + 3 * n.index + zi);
      if (im) ctx.drawImage(im, Math.trunc(ox + n.XPos / sc - C.x / sc), Math.trunc(oy + n.YPos / sc - C.y / sc), Math.trunc(n.XSize / sc), Math.trunc(n.YSize / sc));
    }
    const line = (a, b, colour, w = 1) => {
      const o = w === 2 ? 1 : 0.5;   // QuickDraw's pen hangs right and down
      ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.beginPath();
      ctx.moveTo(SX(a) + o, SY(a) + o); ctx.lineTo(SX(b) + o, SY(b) + o); ctx.stroke();
    };
    // links: the current system's first (dark green to the hyperspace destination), then the route
    // (2 px bright green), then every explored system's links not drawn yet, over the route
    const drawn = new Set([g.system]);
    for (const l of sysLinks(D.syst[g.system])) if (this.exists(l)) line(g.system, l, l === g.navSys ? MAP.NAV : MAP.GREY);
    const path = [g.system, ...g.route];
    for (let i = 0; i + 1 < path.length; i++) if (this.exists(path[i]) && this.exists(path[i + 1])) line(path[i], path[i + 1], MAP.ROUTE, 2);
    for (const s of D.systList) {
      if (!s || !this.exists(s.id) || this.level(s.id) <= 0) continue;
      for (const l of sysLinks(s)) if (this.exists(l) && !drawn.has(l)) line(s.id, l, MAP.GREY);
      drawn.add(s.id);
    }
    ctx.lineWidth = 1;
    // dots: a black 8 px oval ringed in the status colour, the current system's centre cyan, and the
    // mission CIcon 15000 at the top left (8 px of it when the scale is 1 or more)
    const marks = this.missionSystems();
    const icon = app.assets.image((D.picts[9500] ?? '').replace(/^pict\//, 'icons/').replace(/PICT_\d+\.png$/, 'cicn_15000.png'));
    for (const s of D.systList) {
      if (!s || !this.exists(s.id) || !(s.id === g.system || marks.has(s.id) || this.linkedToExplored(s.id))) continue;
      const x = SX(s.id), y = SY(s.id);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = this.dotColour(s.id); ctx.beginPath(); ctx.ellipse(x, y, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      if (s.id === g.system) { ctx.fillStyle = MAP.CYAN; ctx.beginPath(); ctx.ellipse(x, y, 2, 2, 0, 0, Math.PI * 2); ctx.fill(); }
      if (icon && marks.has(s.id)) { const o = sc >= 1 ? 8 : 0; ctx.drawImage(icon, 0, 0, 16 - o, 16 - o, x - 16 + o, y - 16 + o, 16 - o, 16 - o); }
    }
    // corner brackets (6 px out, 3 px ticks) round the pane system
    if (this.exists(this.sel)) {
      const x = SX(this.sel), y = SY(this.sel), Lf = x - 6, Tp = y - 6, Rt = x + 6, Bt = y + 6;
      ctx.fillStyle = MAP.ROUTE;
      for (const yy of [Tp, Bt - 1]) { ctx.fillRect(Lf + 1, yy, 3, 1); ctx.fillRect(Rt - 4, yy, 3, 1); }
      for (const xx of [Lf, Rt - 1]) { ctx.fillRect(xx, Tp + 1, 1, 3); ctx.fillRect(xx, Bt - 4, 1, 3); }
    }
    // explored systems' names, white at +7/+4, while the scale is 1.75 or less (7 pt above 1)
    if (sc <= 1.75) {
      ctx.font = sc > 1 ? FONT_SMALL : FONT; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = WHITE;
      for (const s of D.systList) if (s && this.exists(s.id) && this.level(s.id) > 0) ctx.fillText(s.name, SX(s.id) + 7, SY(s.id) + 4);
    }
    ctx.restore();
    ctx.strokeStyle = MAP.GREY; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    ui.hit(R.x, R.y, R.w, R.h, (mx, my) => this.click(R.x + mx, R.y + my, SX, SY, marks));
    this.drawPanes(ctx);
    ctx.strokeStyle = MAP.FRAME; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    // zoom out while the scale is under 2, zoom in while over 0.5, Clear Route while there is a route
    if (sc < 2) ui.buttonIn(ctx, BTN.MINUS, this.r(4), () => this.zoom(1.5));
    if (sc > 0.5) ui.buttonIn(ctx, BTN.PLUS, this.r(5), () => this.zoom(0.75));
    if (g.route.length) ui.buttonIn(ctx, BTN.CLEAR_ROUTE, this.r(8), () => { g.route = []; });
    ui.buttonIn(ctx, BTN.DONE_SMALL, this.r(1), () => this.close());
  }
  zoom(f) { const sc = this.app.mapScale; if (f > 1 ? sc < 2 : sc > 0.5) this.app.mapScale = sc * f; }
  // The first eligible system within 10 px. A plain click shows it in the panes, and makes it the
  // hyperspace destination if it links to the current system (no pathfinding). A shift-click appends
  // it to the route if it links to the route's last system (not unexplored to unexplored); clicking
  // the last waypoint again removes it. A click on empty space drags the map.
  click(mx, my, SX, SY, marks) {
    const g = this.game, D = this.data;
    let hit = -1;
    for (const s of D.systList) {
      if (!s || !this.exists(s.id)) continue;
      const x = SX(s.id), y = SY(s.id);
      if (mx < x - 10 || mx >= x + 10 || my < y - 10 || my >= y + 10) continue;
      if (this.level(s.id) > 0 || marks.has(s.id) || s.id === this.sel || this.linkedToExplored(s.id)) { hit = s.id; break; }
    }
    if (hit < 0) { this.drag = { mx, my, cx: this.app.mapCentre.x, cy: this.app.mapCentre.y }; return; }
    if (this.app.shift) {
      const last = g.route.length ? g.route.at(-1) : g.system;
      if (g.route.length && hit === last) { g.route.pop(); return; }
      if (!sysLinks(D.syst[last]).includes(hit)) return;
      if (g.route.length && this.level(last) <= 0 && this.level(hit) <= 0) return;
      g.setRoute([...g.route, hit]);
      return;
    }
    this.sel = hit;
    if (sysLinks(D.syst[g.system]).includes(hit)) { g.navSys = hit; g.route = [hit]; g.navMode = 3; }   // l.22494
  }
  drawPanes(ctx) {
    const g = this.game, D = this.data, p = g.pilot, id = this.sel, S = D.syst[id], lv = this.level(id);
    const B = this.r(2), Rp = this.r(6);
    const box = r => { ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = MAP.GREY; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); };
    ctx.font = FONT; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const put = (t, x, y, c = WHITE) => { ctx.fillStyle = c; ctx.fillText(t, x, y); return ctx.measureText(t).width; };
    const ports = navSpobs(D, id).filter(P => P && !D.spobFlag(P, SPOB.UNINHABITED) && D.spobFlag(P, SPOB.LAND));
    // bottom pane (item 2), merged into the right pane by a black line along its top
    box(B);
    ctx.fillStyle = '#000'; ctx.fillRect(Rp.x + 1, B.y, Rp.w - 3, 1);
    put('Ports:', B.x + 10, B.y + 12, MAP.LABEL);
    if (lv <= 0) put('<Unknown>', B.x + 45, B.y + 12);
    else if (!ports.length) put('None', B.x + 45, B.y + 12);
    else {
      let x = B.x + 45, y = B.y + 12, acc = 0;
      ports.forEach((P, k) => {
        const w = ctx.measureText(P.name).width;
        if (B.x + w + acc + 45 > B.x + B.w - 20) { x = B.x + 45; y = B.y + 24; acc = 0; }
        const n = put(P.name + (k < ports.length - 1 ? ', ' : ''), x, y); x += n; acc += n;
      });
    }
    put('Navigation Hazards:', B.x + 10, B.y + 36, MAP.LABEL);
    let hz = '<Unknown>';
    if (lv > 0) {
      const a = S.Asteroids ?? 0, n = S.Interference ?? 0;
      hz = '';
      if (a > 0) hz += (a <= 3 ? 'Sparse ' : a <= 6 ? 'Moderate ' : 'Dense ') + 'asteroid field' + (n > 0 ? ', ' : '');
      if (n > 0) hz += (n <= 33 ? 'Light ' : n <= 66 ? 'Moderate ' : 'Heavy ') + 'sensor interference';
      if (!hz) hz = 'None';
    }
    put(hz, B.x + 110, B.y + 36);
    const d = p.date, ds = `${d.m}/${d.d}/${String(d.y % 100).padStart(2, '0')}`;
    put(ds, B.x + B.w - ctx.measureText(ds).width - 5, B.y + 36, MAP.GREY);
    // right pane (item 6)
    box(Rp);
    ctx.fillStyle = '#000'; ctx.fillRect(Rp.x + 1, Rp.y + Rp.h - 1, Rp.w - 3, 1);
    const L = Rp.x, T = Rp.y;
    put(g.navSys >= 0 ? 'Destination System:' : id === g.system ? 'Current System:' : 'Selected System:', L + 10, T + 12, MAP.LABEL);
    if (lv <= 0) { put('<Unknown>', L + 15, T + 26); return; }
    put(S.name, L + 15, T + 26);
    if (!inhabited(D, id)) { put('Uninhabited System', L + 10, T + 75); return; }
    put('Government:', L + 10, T + 75, MAP.LABEL);
    put(S.Govt >= 128 && D.govt[S.Govt] ? D.govt[S.Govt].name : 'Independent', L + 15, T + 88);
    put('Legal Status:', L + 10, T + 119, MAP.LABEL);
    put(legalLabel(D, p, id), L + 15, T + 132);
    put('Goods Traded:', L + 10, T + 155, MAP.LABEL);
    if (lv < 2) put('<Unknown>', L + 15, T + 168);
    else {
      const goods = [0, 1, 2, 3, 4, 5].filter(c => ports.some(P => D.spobFlag(P, SPOB.TRADE) && ((P.Flags >>> (28 - 4 * c)) & 0xf)));
      goods.forEach((c, k) => put(D.str(4000, c), L + 15, T + 168 + 12 * k));
      if (!goods.length) put('None', L + 15, T + 168);
    }
    put('Services:', L + 10, T + 250, MAP.LABEL);
    const svc = [[SPOB.TRADE, 'Trading'], [SPOB.OUTFIT, 'Outfitting'], [SPOB.SHIPYARD, 'Shipyard']].filter(([f]) => ports.some(P => D.spobFlag(P, f)));
    if (svc.length) { if (lv < 2) put('<Unknown>', L + 15, T + 263); else svc.forEach(([, t], k) => put(t, L + 15, T + 263 + 12 * k)); }
    else put(lv >= 2 ? 'None Available' : '<Unknown>', L + 15, T + 262);
  }
  // FUN_1003e260: Return / Enter = Done; Tab or \ cycles the hyperspace destination through the
  // current system's first five link slots; C centres on the current system; - / + zoom; the arrow
  // keys scroll 10 map units. Escape and M do nothing here.
  key(e) {
    const g = this.game, D = this.data, k = e.key.length === 1 ? e.key.toLowerCase() : e.key, C = this.app.mapCentre;
    if (k === 'Enter') this.close();
    else if (k === 'Tab' || k === '\\') {
      const links = sysLinks(D.syst[g.system]).slice(0, 5);
      if (links.some(l => this.exists(l))) {
        let i = links.indexOf(g.navSys);
        do i = (i + 1) % 5; while (!this.exists(links[i]));
        g.navSys = links[i]; g.route = [links[i]]; this.sel = links[i]; g.navMode = 3;
      }
    } else if (k === 'c') { beep(this.app, BEEP.COMM); const s = D.syst[g.system]; C.x = s.xPos; C.y = s.yPos; }   // Beep5
    else if (k === '-') this.zoom(1.5);
    else if (k === '+' || k === '=') this.zoom(0.75);
    else if (k === 'ArrowLeft') C.x -= 10;
    else if (k === 'ArrowRight') C.x += 10;
    else if (k === 'ArrowUp') C.y -= 10;
    else if (k === 'ArrowDown') C.y += 10;
    return true;
  }
}
