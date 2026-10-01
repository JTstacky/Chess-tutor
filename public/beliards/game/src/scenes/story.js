// Cutscenes: the opening story, the ending, and the Tear of Esmesanti fanfare.
// Text is the Sierra English script from data/rules/story.json; each original
// picture (.grp) maps to a remastered panel under art/story/ when one exists.
import { ctx, W, H, text, panel, COLORS, drawCover, fade, wrap } from '../render/screen.js';
import { image } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { sheetNow } from '../core/assets.js';

// Original picture -> remastered panel file (art/story/<file>.png).
const PANELS = {
  'nec.grp': 'prologue', 'dmaou.grp': 'jashiin_wakes', 'ame.grp': 'storm', 'hime.grp': 'felicia_balcony', 'isi.grp': 'felicia_stone',
  'oui.grp': 'king_weeps', 'sei.grp': 'spirit', 'yuu1.grp': 'duke_arrives', 'yuup.grp': 'throne', 'maop.grp': 'jashiin_mist', 'yuu2.grp': 'duke_sets_out',
  'yuu3.grp': 'door_of_destiny', 'new1.grp': 'felicia_restored', 'new2.grp': 'king_and_felicia', 'himp.grp': 'farewell', 'ne80.grp': 'duke_leaves', 'seip.grp': 'spirit',
};
// waku.grp is only a frame drawn around other pictures, and yuup.grp (the Duke's
// portrait) shares the screen with the picture that matters in split scenes.
const MINOR = new Set(['yuup.grp']);

function pictureFor(graphic) {
  const grps = (graphic || '').match(/\w+\.grp/g) || [];
  const known = grps.filter((g) => PANELS[g]);
  const main = known.find((g) => !MINOR.has(g)) || known[0];
  return main ? PANELS[main] : null;
}

function pagesFrom(scenes, skipPhases = []) {
  const out = [];
  let last = null;
  for (const sc of scenes || []) {
    if (skipPhases.includes(sc.phase)) continue;
    let pic = pictureFor(sc.graphic) || last;
    if (sc.phase === 'story slideshow' && /palette 9/.test(sc.graphic || '')) pic = 'desert';
    if (/Jashiin apparition|blended with the Jashiin/.test(sc.graphic || '')) pic = 'jashiin_curse';
    last = pic;
    for (const p of sc.pages || []) {
      const lines = p.lines.filter((l) => l.text !== undefined);
      if (!lines.length) continue;
      // A page is one or more speakers; group consecutive lines by speaker.
      const chunks = [];
      for (const l of lines) {
        const sp = l.speaker === 'caption' || l.speaker === 'narrator' ? '' : l.speaker;
        const prev = chunks[chunks.length - 1];
        if (prev && prev.speaker === sp) prev.text += (l.speaker === 'caption' ? (l.text ? ' ' : '\n') : ' ') + l.text;
        else chunks.push({ speaker: sp, text: l.text });
      }
      out.push({ pic, chunks, caption: lines.every((l) => l.speaker === 'caption') });
    }
  }
  return out;
}

// Text boxes: captions over the whole picture, dialogue in the panel under it.
const BOX = { caption: { w: W - 280, size: 22, lines: 13 }, panel: { w: W - 140, size: 19, lines: 5 } };

// Split a page whose text would overflow its box into several pages.
function fitPage(p) {
  const box = p.caption ? BOX.caption : BOX.panel;
  const out = [];
  let cur = [], used = 0;
  const flush = () => { if (cur.length) out.push({ ...p, chunks: cur }); cur = []; used = 0; };
  for (const ch of p.chunks) {
    const lines = ch.text.split('\n').flatMap((raw) => wrap(raw, box.w, box.size));
    let i = 0;
    while (i < lines.length) {
      const head = ch.speaker ? 1 : 0;
      if (used + head + 1 > box.lines) flush();
      const room = box.lines - used - head;
      const take = lines.slice(i, i + room);
      cur.push({ speaker: ch.speaker, text: take.join('\n') });
      used += head + take.length;
      i += take.length;
    }
  }
  flush();
  return out.length ? out : [p];
}

export class StoryScene {
  constructor(game, id, done, opts = {}) {
    this.game = game;
    this.id = id;
    this.done = done;
    this.opts = opts;
    this.t = 0;
    this.i = 0;
    this.chars = 0;
    this.imgs = {};
    const st = game.data.rules.story || {};
    if (id === 'opening') this.pages = pagesFrom(st.opening?.scenes, ['title card', 'title', 'staff credits', 'Jashiin attract animation']);
    else if (id === 'ending') this.pages = pagesFrom(st.ending?.scenes);
    else if (id === 'tear') {
      const n = opts.count || 1;
      this.pages = [{ pic: 'tear', chunks: [{ speaker: '', text: `Duke Garland recovered a Tear of Esmesanti. (${n} of 9)` }], tear: n }];
      if (n >= 9) this.pages.push({ pic: 'tear', chunks: [{ speaker: '', text: 'All nine Tears shine together. The way to Jashiin lies open.' }], tear: n });
    }
    // Japanese difficulty: show the 1987 Japanese wording where the translation has it.
    if (game.data.text && game.rulesDifficulty === 'japanese') for (const p of this.pages) for (const ch of p.chunks) ch.text = game.localize?.(ch.text) || ch.text;
    this.pages = this.pages.flatMap((p) => fitPage(p));
    for (const p of this.pages) if (p.pic && !(p.pic in this.imgs)) { this.imgs[p.pic] = null; image(`art/story/${p.pic}.png`).then((im) => { this.imgs[p.pic] = im; }); }
    image('art/ui/title_keyart.png').then((i) => { this.fallback = i; });
  }
  enter() {
    audio.playMusic(this.id === 'ending' ? 'royal_hall' : this.id === 'tear' ? 'tear_fanfare' : 'lantern_overture');
    if (this.id === 'tear') audio.sfx('gem_pickup');
  }
  get page() { return this.pages[this.i]; }
  fullLen(p) { return p.chunks.reduce((a, c) => a + c.text.length, 0); }
  finish() { if (this.ended) return; this.ended = true; this.done?.(); }
  update(dt) {
    this.t += dt;
    const m = this.game.menu;
    if (!this.page) { this.finish(); return; }
    if (m.pressed('pause') || (m.pressed('cancel') && this.id !== 'tear')) { this.finish(); return; }
    const full = this.fullLen(this.page);
    this.chars = Math.min(full, this.chars + dt * 45);
    this.pageT = (this.pageT || 0) + dt;
    if (m.pressed('confirm') || m.pressed('attack') || m.pressed('jump') || (this.opts.auto && this.pageT > 4)) {
      if (this.chars < full) this.chars = full;
      else { this.i++; this.chars = 0; this.pageT = 0; audio.sfx('menu_move', { vol: 0.2 }); if (!this.page) this.finish(); }
    }
  }
  draw(t) {
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, W, H);
    const p = this.page || this.pages[this.pages.length - 1];
    if (!p) return;
    const img = this.imgs[p.pic];
    const ph = p.caption ? H : 360;
    if (p.tear) this.drawTear(p.tear, t);
    else if (img) { drawCover(img, 0, 0, W, ph); }
    else if (this.fallback) { drawCover(this.fallback, -20 + Math.sin(this.t * 0.1) * 20, 0, W + 40, ph, 0.55); }
    if (p.caption) {
      fade(0.55, '#000');
      const n = p.chunks.reduce((a, c) => a + c.text.split('\n').length + (c.speaker ? 1 : 0), 0);
      this.drawText(p, 140, Math.max(40, (H - n * 28) / 2 - 10), BOX.caption.w, BOX.caption.size, 'center');
    } else {
      const g = ctx.createLinearGradient(0, ph - 60, 0, ph);
      g.addColorStop(0, 'rgba(5,3,10,0)'); g.addColorStop(1, 'rgba(5,3,10,1)');
      ctx.fillStyle = g; ctx.fillRect(0, ph - 60, W, 60);
      panel(40, ph + 6, W - 80, H - ph - 20, { alpha: 0.95 });
      this.drawText(p, 70, ph + 24, W - 140, 19, 'left');
    }
    text(`${Math.min(this.i + 1, this.pages.length)} / ${this.pages.length}    Enter: next   Esc: skip`, W - 20, H - 18, { size: 11, align: 'right', color: COLORS.dim });
  }
  drawText(p, x, y, w, size, align) {
    let left = Math.floor(this.chars);
    let yy = y;
    for (const ch of p.chunks) {
      if (ch.speaker) { text(ch.speaker, align === 'center' ? x + w / 2 : x, yy, { size: size - 2, color: COLORS.gold, align }); yy += size + 4; }
      for (const raw of ch.text.split('\n')) {
        for (const line of wrap(raw, w, size)) {
          const shown = line.slice(0, Math.max(0, left));
          left -= line.length + 1;
          text(shown, align === 'center' ? x + w / 2 : x, yy, { size, align, color: ch.speaker ? '#fff4dc' : COLORS.ink });
          yy += size + 6;
        }
      }
      yy += 6;
    }
  }
  drawTear(n, t) {
    const sh = sheetNow('art.prop.tear');
    const g = ctx.createRadialGradient(W / 2, 200, 10, W / 2, 200, 300);
    g.addColorStop(0, 'rgba(120,200,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 400);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 - Math.PI / 2 + t * 0.2;
      const x = W / 2 + Math.cos(a) * 150, y = 190 + Math.sin(a) * 110;
      ctx.globalAlpha = i < n ? 1 : 0.18;
      if (sh) sh.draw(ctx, 0, x, y + 26, 1, 1, 0.7);
      else { ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
}
