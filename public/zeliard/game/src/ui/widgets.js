// Reusable UI: dialogue box with typewriter text and portrait, vertical menus.
import { ctx, W, H, text, panel, wrap, COLORS } from '../render/screen.js';
import { audio } from '../core/audio.js';
import { image } from '../core/assets.js';
import { RULES } from '../game/character.js';

export class Dialogue {
  // pages: array of strings or { speaker, text, portrait }
  constructor(pages, { onDone, speaker, portrait, y } = {}) {
    this.pages = pages.map((p) => (typeof p === 'string' ? { text: p, speaker, portrait } : { speaker, portrait, ...p }));
    // Japanese balance shows the Japanese edition's wording (rules.js setupText).
    if (RULES.localize) for (const p of this.pages) if (typeof p.text === 'string') p.text = RULES.localize(p.text);
    this.i = 0;
    this.chars = 0;
    this.onDone = onDone;
    this.y = y ?? H - 170;
    this.done = false;
    this.choice = 0;
    this.portraits = {};
    for (const p of this.pages) if (p.portrait) image(p.portrait).then((img) => { this.portraits[p.portrait] = img; });
  }
  get page() { return this.pages[this.i]; }
  update(dt, menu) {
    if (this.done) return;
    const full = this.page.text.length;
    const before = Math.floor(this.chars);
    this.chars = Math.min(full, this.chars + dt * 60);
    if (Math.floor(this.chars) !== before && Math.floor(this.chars) % 3 === 0) audio.sfx('menu_move', { vol: 0.08, throttle: 0.04 });
    const p = this.page;
    if (p.choices && this.chars >= full) {
      if (menu.pressed('left') || menu.pressed('up')) { this.choice = (this.choice + p.choices.length - 1) % p.choices.length; audio.sfx('menu_move', { vol: 0.4 }); }
      if (menu.pressed('right') || menu.pressed('down')) { this.choice = (this.choice + 1) % p.choices.length; audio.sfx('menu_move', { vol: 0.4 }); }
      if (menu.pressed('cancel')) this.choice = p.choices.length - 1;
      if (menu.pressed('confirm') || menu.pressed('attack') || menu.pressed('cancel')) {
        audio.sfx('menu_accept', { vol: 0.4 });
        const more = p.onChoice?.(this.choice);
        this.pages.splice(this.i + 1, 0, ...(more || []).map((x) => (typeof x === 'string' ? { text: x, speaker: p.speaker, portrait: p.portrait } : { speaker: p.speaker, portrait: p.portrait, ...x })));
        for (const q of more || []) if (q.portrait) image(q.portrait).then((img) => { this.portraits[q.portrait] = img; });
        this.choice = 0;
        if (this.i < this.pages.length - 1) { this.i++; this.chars = 0; } else { this.done = true; this.onDone?.(); }
      }
      return;
    }
    if (menu.pressed('confirm') || menu.pressed('attack') || menu.pressed('jump')) {
      if (this.chars < full) this.chars = full;
      else if (this.i < this.pages.length - 1) { this.i++; this.chars = 0; audio.sfx('menu_accept', { vol: 0.3 }); }
      else { this.done = true; audio.sfx('menu_accept', { vol: 0.3 }); this.onDone?.(); }
    }
  }
  draw() {
    const p = this.page;
    const img = p.portrait && this.portraits[p.portrait];
    const x = 60, w = W - 120, h = 150, y = this.y;
    panel(x, y, w, h);
    let tx = x + 24;
    if (img) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      const s = Math.min(118 / img.width, 118 / img.height);
      ctx.drawImage(img, x + 16, y + 16, img.width * s, img.height * s);
      ctx.restore();
      tx = x + 150;
    }
    if (p.speaker) text(p.speaker, tx, y + 16, { size: 17, color: COLORS.gold });
    const lines = wrap(p.text, x + w - 24 - tx, 18);
    let left = Math.floor(this.chars);
    let ly = y + (p.speaker ? 44 : 22);
    for (const line of lines.slice(0, 5)) {
      const shown = line.slice(0, Math.max(0, left));
      left -= line.length + 1;
      text(shown, tx, ly, { size: 18 });
      ly += 22;
    }
    if (p.choices && this.chars >= p.text.length) {
      p.choices.forEach((c, i) => {
        const cx = x + w - 60 - (p.choices.length - 1 - i) * 110;
        if (i === this.choice) { ctx.fillStyle = 'rgba(242,200,91,0.2)'; ctx.fillRect(cx - 50, y + h - 40, 100, 28); }
        text((i === this.choice ? '▶ ' : '  ') + c, cx, y + h - 36, { size: 17, align: 'center', color: i === this.choice ? '#fff4c8' : COLORS.dim });
      });
      return;
    }
    if (this.chars >= p.text.length) {
      const blink = Math.floor(performance.now() / 350) % 2;
      if (blink) text(this.i < this.pages.length - 1 ? '▼' : '■', x + w - 30, y + h - 30, { size: 14, color: COLORS.gold });
    }
  }
}

export class Menu {
  // items: [{ label, value, disabled, hint, right }]
  constructor(items, { x = W / 2 - 150, y = 200, w = 300, title, onSelect, onCancel, size = 20, center = false, rows = 9 } = {}) {
    Object.assign(this, { items, x, y, w, title, onSelect, onCancel, size, center, rows });
    this.i = Math.max(0, items.findIndex((it) => !it.disabled));
    this.scroll = 0;
  }
  update(menu) {
    const n = this.items.length;
    if (!n) { if (menu.pressed('cancel')) this.onCancel?.(); return; }
    if (menu.pressed('up')) { do { this.i = (this.i - 1 + n) % n; } while (this.items[this.i].disabled && this.items.some((x) => !x.disabled)); audio.sfx('menu_move', { vol: 0.4 }); }
    if (menu.pressed('down')) { do { this.i = (this.i + 1) % n; } while (this.items[this.i].disabled && this.items.some((x) => !x.disabled)); audio.sfx('menu_move', { vol: 0.4 }); }
    if (this.i < this.scroll) this.scroll = this.i;
    if (this.i >= this.scroll + this.rows) this.scroll = this.i - this.rows + 1;
    const it = this.items[this.i];
    if (menu.pressed('left') && it.onLeft) { it.onLeft(); audio.sfx('menu_move', { vol: 0.4 }); }
    if (menu.pressed('right') && it.onRight) { it.onRight(); audio.sfx('menu_move', { vol: 0.4 }); }
    if (menu.pressed('confirm') || menu.pressed('attack')) {
      if (it.disabled) audio.sfx('menu_cancel', { vol: 0.5 });
      else { audio.sfx('menu_accept', { vol: 0.5 }); this.onSelect?.(it, this.i); }
    } else if (menu.pressed('cancel')) { audio.sfx('menu_cancel', { vol: 0.5 }); this.onCancel?.(); }
  }
  get height() { return (this.title ? 44 : 16) + Math.min(this.rows, this.items.length) * (this.size + 12) + 12; }
  draw() {
    const { x, y, w } = this;
    panel(x, y, w, this.height);
    let yy = y + 16;
    if (this.title) { text(this.title, x + w / 2, yy, { size: 18, align: 'center', color: COLORS.gold }); yy += 30; }
    const vis = this.items.slice(this.scroll, this.scroll + this.rows);
    vis.forEach((it, k) => {
      const idx = k + this.scroll;
      const sel = idx === this.i;
      if (sel) { ctx.fillStyle = 'rgba(242,200,91,0.16)'; ctx.fillRect(x + 8, yy - 4, w - 16, this.size + 8); }
      const color = it.disabled ? '#6a6070' : sel ? '#fff4c8' : COLORS.ink;
      const lx = this.center ? x + w / 2 : x + 34;
      if (sel) text('▶', x + 14, yy + 1, { size: this.size - 4, color: COLORS.gold });
      text(it.label, lx, yy, { size: this.size, color, align: this.center ? 'center' : 'left' });
      if (it.right) text(it.right, x + w - 18, yy + 2, { size: this.size - 3, color: it.rightColor || COLORS.dim, align: 'right' });
      yy += this.size + 12;
    });
    if (this.scroll > 0) text('▲', x + w / 2, y + (this.title ? 40 : 4), { size: 12, align: 'center', color: COLORS.dim });
    if (this.scroll + this.rows < this.items.length) text('▼', x + w / 2, y + this.height - 16, { size: 12, align: 'center', color: COLORS.dim });
    const hint = this.items[this.i]?.hint;
    if (hint) {
      // Centred under the menu, but never past the screen's edges.
      const cx = x + w / 2;
      const lines = wrap(hint, Math.min(w + 200, 2 * Math.min(cx, W - cx) - 90), 15);
      lines.forEach((l, i) => text(l, cx, y + this.height + 10 + i * 18, { size: 15, align: 'center', color: COLORS.dim }));
    }
  }
}
