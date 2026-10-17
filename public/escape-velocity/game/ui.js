// Small immediate-mode UI over the canvas: hit regions, original PICT buttons, framed panels, text.
import { GREEN, DIM, FONT, FONT_SMALL } from './flight.js';

// Button PICT ids (normal, highlighted = id+1).
export const BTN = {
  LEAVE: 7000, BUY: 7002, SELL: 7004, BUY_SHIP: 7006, DONE: 7010, REFUEL: 7016, TRADE: 7018, OUTFIT: 7020,
  SHIPYARD: 7022, MINUS: 7024, PLUS: 7026, UP: 7028, DOWN: 7030, MISSIONS: 7032, ACCEPT: 7050, CANCEL: 7052,
  OKAY: 7054, HIRE: 7064, SELECT: 7072, BAR: 7090, INFO: 7116, CLEAR_ROUTE: 7118, YES: 7108, NO: 7110, LEAVE_WIDE: 7014,
  LEAVE_MID: 7008, DONE_SMALL: 7012, END_COMM: 7034, GREETINGS: 7036, GENERAL: 7038, ASSIST: 7040, BRIBE: 7042, CARGO_TAB: 7044,
  EXTRAS: 7046, MERCY: 7048, CANCEL_MID: 7074, ABORT_SMALL: 7076, CARGO_SMALL: 7078, CREDITS_SMALL: 7080, AMMO_SMALL: 7082,
  TRIBUTE: 7084, FUEL_SMALL: 7086, CAPTURE: 7088, ABORT_MISSION: 7092, GAMBLE: 7094, HOLOVID: 7096, HIRE_AN_ESCORT: 7100,
  BACK_ROOM: 7102, BET_1000: 7104, BET_5000: 7106, USE_AS_ESCORT: 7112, USE_AS_SHIP: 7114, BRIBE_WIDE: 7070,
};

export class UI {
  constructor(assets) { this.assets = assets; this.regions = []; this.mouse = { x: -1, y: -1, down: false }; this.hoverCursor = false; }
  begin() { this.regions = []; this.hoverCursor = false; }
  hit(x, y, w, h, onClick) {
    this.regions.push({ x, y, w, h, onClick });
    const over = this.mouse.x >= x && this.mouse.x < x + w && this.mouse.y >= y && this.mouse.y < y + h;
    if (over && onClick) this.hoverCursor = true;
    return over;
  }
  click(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { if (r.onClick) { r.onClick(x - r.x, y - r.y); return true; } return false; }
    }
    return false;
  }

  // Original button art: grey normally, green under the mouse; dimmed when disabled.
  button(ctx, id, x, y, onClick, enabled = true) {
    const im = this.assets.pict(id), w = im?.width ?? 120, h = im?.height ?? 25;
    const over = this.hit(x, y, w, h, enabled ? () => { this.assets.play(600); onClick(); } : null) && enabled;
    const img = over ? (this.assets.pict(id + 1) ?? im) : im;
    ctx.globalAlpha = enabled ? 1 : 0.35;
    if (img) ctx.drawImage(img, x, y); else { ctx.fillStyle = '#555555'; ctx.fillRect(x, y, w, h); }
    ctx.globalAlpha = 1;
    return w;
  }

  // A button picture centred in a dialog item rectangle.
  buttonIn(ctx, id, r, onClick, enabled = true) {
    const im = this.assets.pict(id), w = im?.width ?? r.w, h = im?.height ?? 25;
    return this.button(ctx, id, Math.round(r.x + (r.w - w) / 2), Math.round(r.y + (r.h - h) / 2), onClick, enabled);
  }
  // Image scaled to fit inside a rectangle, centred.
  fit(ctx, im, r, upscale = false) {
    if (!im) return;
    const s = Math.min(r.w / im.width, r.h / im.height, upscale ? Infinity : 1);
    const w = Math.round(im.width * s), h = Math.round(im.height * s);
    ctx.drawImage(im, Math.round(r.x + (r.w - w) / 2), Math.round(r.y + (r.h - h) / 2), w, h);
  }

  // Bevelled frame in the status-bar style.
  panel(ctx, x, y, w, h, fill = '#001c00') {
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#a8a8a8'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = fill; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  }

  text(ctx, t, x, y, color = GREEN, align = 'left', font = FONT) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  // Break text into lines no wider than w (paragraphs on \n; a word longer than w gets a line of its own).
  layout(ctx, t, w, font = FONT) {
    ctx.font = font;
    const out = [];
    for (const para of String(t ?? '').split(/\r\n|\r|\n/)) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > w && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }
  // Word-wrapped paragraphs; returns the y after the text. For boxes that must not lose text, use
  // Dialog.textIn / Dialog.textBox, which grow or scroll instead of dropping lines.
  wrap(ctx, t, x, y, w, lh = 12, color = GREEN, maxY = Infinity, font = FONT) {
    const lines = this.layout(ctx, t, w, font);
    ctx.fillStyle = color; ctx.textBaseline = 'top';
    for (const line of lines) { if (y + lh <= maxY) ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  // Selectable list row.
  row(ctx, x, y, w, h, selected, onClick) {
    const over = this.hit(x, y, w, h, onClick);
    if (selected) { ctx.fillStyle = '#006000'; ctx.fillRect(x, y, w, h); }
    else if (over) { ctx.fillStyle = '#003400'; ctx.fillRect(x, y, w, h); }
  }

  // ---- standard Mac dialogs (the title screen's New Pilot / naming / confirm dialogs use the system's
  // dBoxProc windows and controls, not EV's own art). Drawn to match the Platinum look measured in the
  // original running under Mac OS 9: white body, light bevel top-left, dark bevel bottom-right.
  macWindow(ctx, x, y, w, h) {
    const L = x - 4, T = y - 4, W = w + 6, H = h + 6;
    ctx.fillStyle = '#000'; ctx.fillRect(L - 2, T - 2, W + 4, H + 4);
    ctx.fillStyle = '#bbbbbb'; ctx.fillRect(L - 1, T - 1, W + 1, 1); ctx.fillRect(L - 1, T - 1, 1, H + 1);
    ctx.fillStyle = '#999999'; ctx.fillRect(L, T + H, W, 1); ctx.fillRect(L + W, T, 1, H);
    ctx.fillStyle = '#555555'; ctx.fillRect(L, T + H + 1, W + 1, 1); ctx.fillRect(L + W + 1, T, 1, H + 1);
    ctx.fillStyle = '#fff'; ctx.fillRect(L, T, W, H);
  }
  // Static text: TextEdit's first baseline is the item's top + 12 (the system font's ascent), lines 16 px
  // apart (orig-33/34); the stand-in's ink then starts 2 px in, as Charcoal's does.
  macText(ctx, t, r, color = '#000') {
    const lines = this.layout(ctx, t, r.w, MAC_FONT);
    ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => ctx.fillText(line, r.x + 1, r.y + 12 + 16 * i));
    return r.y + 16 * lines.length;
  }
  macButton(ctx, label, r, onClick, isDefault = false, enabled = true) {
    const over = this.hit(r.x, r.y, r.w, r.h, enabled ? onClick : null);
    const pressed = over && this.mouse.down && enabled;
    const rr = (x, y, w, h, rad, fill, stroke) => {
      ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, rad);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    if (isDefault) { rr(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6, '#aaaaaa', '#000'); }
    rr(r.x, r.y, r.w, r.h, 4, pressed ? '#444444' : '#dedede', '#000');
    if (!pressed) { ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 5, 1); ctx.fillStyle = '#777777'; ctx.fillRect(r.x + 2, r.y + r.h - 3, r.w - 4, 1); }
    ctx.font = MAC_FONT; ctx.fillStyle = !enabled ? '#7a7a7a' : pressed ? '#fff' : '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, r.x + r.w / 2, r.y + Math.round(r.h / 2) + 4); ctx.textAlign = 'left';   // cap tops as orig-33/34
  }
  macCheckbox(ctx, label, r, on, onClick) {
    this.hit(r.x, r.y, r.w, r.h, onClick);
    const bx = r.x + 2, by = r.y + Math.round((r.h - 12) / 2);
    ctx.fillStyle = '#000'; ctx.fillRect(bx, by, 12, 12);
    ctx.fillStyle = '#dedede'; ctx.fillRect(bx + 1, by + 1, 10, 10);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + 1, by + 1, 9, 1); ctx.fillRect(bx + 1, by + 1, 1, 9);
    ctx.fillStyle = '#888888'; ctx.fillRect(bx + 10, by + 2, 1, 9); ctx.fillRect(bx + 2, by + 10, 9, 1);
    if (on) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx + 3, by + 3); ctx.lineTo(bx + 9, by + 9); ctx.moveTo(bx + 9, by + 3); ctx.lineTo(bx + 3, by + 9); ctx.stroke(); }
    ctx.font = MAC_FONT; ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, bx + 16, by + 10);   // orig-33
  }
  // Edit-text item: frame 3 px outside the item rect (TextEdit's inset), text all selected at first.
  macEdit(ctx, text, r, selected, caret, onClick) {
    this.hit(r.x - 3, r.y - 3, r.w + 6, r.h + 6, onClick);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
    ctx.fillStyle = '#555555'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, 1); ctx.fillRect(r.x - 2, r.y - 2, 1, r.h + 4);
    ctx.font = MAC_FONT; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(text).width;
    if (selected && text) { ctx.fillStyle = '#ccccff'; ctx.fillRect(r.x, r.y, Math.min(r.w, w + 1), r.h); }
    ctx.fillStyle = '#000'; ctx.fillText(text, r.x, r.y + 12);
    if (caret && !selected) ctx.fillRect(r.x + Math.round(w) + 1, r.y + 1, 1, r.h - 2);
  }
}
export const MAC_FONT = '12px EVSys, Charcoal, Chicago, Tahoma, sans-serif';
export { GREEN, DIM, FONT, FONT_SMALL };
