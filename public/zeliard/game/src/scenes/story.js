// Cutscenes: the opening story, the ending, and the Tear of Esmesanti fanfare.
// Text is the Sierra English script from data/rules/story.json; each original
// picture (.grp) maps to a remastered panel under art/story/ when one exists.
import { ctx, W, H, text, panel, COLORS, drawCover, drawContain, fade, wrap } from '../render/screen.js';
import { image } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { sheetNow } from '../core/assets.js';
import { RULES } from '../game/character.js';

// Original picture -> remastered panel file (art/story/<file>.png).
const PANELS = {
  'nec.grp': 'prologue', 'dmaou.grp': 'jashiin_wakes', 'ame.grp': 'storm', 'hime.grp': 'felicia_balcony', 'isi.grp': 'felicia_stone',
  'oui.grp': 'king_weeps', 'sei.grp': 'spirit', 'yuu1.grp': 'duke_arrives', 'yuup.grp': 'throne', 'maop.grp': 'jashiin_mist', 'yuu2.grp': 'duke_sets_out',
  'yuu3.grp': 'door_of_destiny', 'new1.grp': 'felicia_restored', 'new2.grp': 'king_and_felicia', 'himp.grp': 'farewell', 'ne80.grp': 'duke_leaves', 'seip.grp': 'spirit',
};
// waku.grp is only a frame drawn around other pictures, and yuup.grp (the Duke's
// portrait) shares the screen with the picture that matters in split scenes.
const MINOR = new Set(['yuup.grp']);
// New pictures for the original's staging, and what to show until they exist.
// Height of the picture above the text box (the box holds four lines at 19 px).
const PIC_H = 380;
const FALLBACK = { felicia_closeup: 'felicia_balcony', jashiin_eyes: 'jashiin_curse', duke_into_light: 'door_of_destiny' };
const SPEAKER = { 'Duke Garland': 'duke', 'King Felishika': 'king', Jashiin: 'jashiin' };

function pictureFor(graphic) {
  const grps = (graphic || '').match(/\w+\.grp/g) || [];
  const known = grps.filter((g) => PANELS[g]);
  const main = known.find((g) => !MINOR.has(g)) || known[0];
  return main ? PANELS[main] : null;
}

// Japanese balance: swap Sierra lines for the 1987 wording. A Japanese line that stands
// for several Sierra lines also drops the Sierra lines it covers (until the next match).
function localizeLines(lines) {
  if (!RULES.localizeLine) return lines;
  const out = [];
  let covering = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Match against this line and the ones after it by the same speaker.
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].speaker === l.speaker && lines[j + 1].text) j++;
    const jp = l.text && RULES.localizeLine(lines.slice(i, j + 1).map((x) => x.text).join(' '));
    if (jp) {
      out.push({ ...l, text: jp.text });
      // Skip the Sierra lines this match consumed.
      let used = RULES.normText(l.text).length;
      while (i + 1 <= j && used < jp.head.length) { i++; used += 1 + RULES.normText(lines[i].text).length; }
      // ...and the rest of that Sierra sentence (continuation lines start in lower case).
      while (i + 1 <= j && /^[a-z]/.test(lines[i + 1].text.trim())) i++;
      covering = jp.spans;
      continue;
    }
    if (covering && l.text) continue;
    covering = false;
    out.push(l);
  }
  return out;
}

function pagesFrom(scenes, skipPhases = []) {
  const out = [];
  let last = null;
  for (const sc of scenes || []) {
    if (skipPhases.includes(sc.phase)) continue;
    let pic = pictureFor(sc.graphic) || last;
    const g = sc.graphic || '';
    // The original's staging for each scene (100OPDMO): rain on the storm, the princess close-up,
    // Jashiin's eyes blending in over her, the talking portraits in the split frame, Jashiin's
    // portrait that scrolls away, and the closing walk through the door of destiny.
    let stage = null;
    if (sc.phase === 'story slideshow' && /palette 9/.test(g)) pic = 'desert';
    else if (g.startsWith('waku.grp frame + ame.grp')) stage = { fx: 'rain' };
    else if (g.startsWith('hime.grp (Princess')) pic = 'felicia_closeup';
    else if (/blended with the Jashiin/.test(g)) { pic = 'felicia_closeup'; stage = { fx: 'eyes_in' }; }
    else if (/Jashiin apparition/.test(g)) pic = 'jashiin_eyes';
    else if (g.startsWith('split screen: yuup')) stage = { portraits: ['duke', 'king'] };
    else if (g.startsWith('maop.grp')) stage = { portraits: ['jashiin'] };
    else if (/scrolls away/.test(g)) stage = { portraits: ['duke', 'king'], scrollAway: 'jashiin' };
    else if (g.startsWith('yuu3.grp')) { pic = 'duke_into_light'; stage = { fx: 'push' }; }
    last = pic;
    let firstPage = true;
    for (const p of sc.pages || []) {
      const lines = localizeLines(p.lines.filter((l) => l.text !== undefined));
      if (!lines.length) continue;
      // A page is one or more speakers; group consecutive lines by speaker.
      const chunks = [];
      for (const l of lines) {
        const sp = l.speaker === 'caption' || l.speaker === 'narrator' ? '' : l.speaker;
        const prev = chunks[chunks.length - 1];
        if (prev && prev.speaker === sp) prev.text += (l.speaker === 'caption' ? (l.text ? ' ' : '\n') : ' ') + l.text;
        else chunks.push({ speaker: sp, text: l.text });
      }
      out.push({ pic, chunks, caption: lines.every((l) => l.speaker === 'caption'), stage, sceneStart: firstPage });
      firstPage = false;
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
    // The copyright card, prologue, Jashiin's awakening, title and credits play before the title
    // menu (scenes/opening.js); a new game starts at the story itself.
    if (id === 'opening') this.pages = pagesFrom(st.opening?.scenes, ['title card', 'ancient-history prologue', 'title', 'staff credits', 'Jashiin attract animation']);
    else if (id === 'ending') this.pages = pagesFrom(st.ending?.scenes);
    else if (id === 'tear') {
      const n = opts.count || 1;
      this.pages = [{ pic: 'tear', chunks: [{ speaker: '', text: `Duke Garland recovered a Tear of Esmesanti. (${n} of 9)` }], tear: n }];
      if (n >= 9) this.pages.push({ pic: 'tear', chunks: [{ speaker: '', text: 'All nine Tears shine together. The way to Jashiin lies open.' }], tear: n });
    }
    this.pages = this.pages.flatMap((p) => fitPage(p));
    for (const p of this.pages) if (p.pic && !(p.pic in this.imgs)) {
      this.imgs[p.pic] = null;
      image(`art/story/${p.pic}.png`).then((im) => im || (FALLBACK[p.pic] ? image(`art/story/${FALLBACK[p.pic]}.png`) : null)).then((im) => { this.imgs[p.pic] = im; });
    }
    // Talking portraits: base, mouth open, eyes shut (art/story/talk/<who>.png, _talk.png, _blink.png; tools/art/facepatch.py).
    this.faces = {};
    for (const who of ['duke', 'king', 'jashiin']) {
      const fc = this.faces[who] = {};
      image(`art/story/talk/${who}.png`).then((im) => { fc.base = im; });
      image(`art/story/talk/${who}_talk.png`).then((im) => { fc.talk = im; });
      image(`art/story/talk/${who}_blink.png`).then((im) => { fc.blink = im; });
    }
    image('art/story/jashiin_eyes_overlay.png').then((im) => { this.eyesOverlay = im; });
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
    this.picT = (this.picT || 0) + dt;
    if (this.page.stage?.fx === 'rain' && Math.random() < dt * 0.12) { this.flash = 0.5; audio.sfx('boss_hit', { vol: 0.25, rate: 0.4 }); }
    if (this.flash > 0) this.flash -= dt;
    if (m.pressed('confirm') || m.pressed('attack') || m.pressed('jump') || (this.opts.auto && this.pageT > 4)) {
      if (this.chars < full) this.chars = full;
      else { this.prevPic = this.page.pic; this.prevPage = this.page; this.i++; this.chars = 0; this.pageT = 0; if (this.page && this.page.pic !== this.prevPic) this.picT = 0; audio.sfx('menu_move', { vol: 0.2 }); if (!this.page) this.finish(); }
    }
  }
  draw(t) {
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, W, H);
    const p = this.page || this.pages[this.pages.length - 1];
    if (!p) return;
    const img = this.imgs[p.pic];
    // The picture area: everything above the text box (whole screen for captions). Pictures are
    // shown whole (drawContain), never cropped to fill it.
    const ph = p.caption ? H : PIC_H;
    const st = p.stage || {};
    if (p.tear) this.drawTear(p.tear, t);
    else if (st.portraits) this.drawPortraits(p, st, ph);
    else {
      // Crossfade from the previous picture over 0.8 s.
      const k = Math.min(1, (this.picT || 0) / 0.8);
      const prev = this.prevPic && this.prevPic !== p.pic && !this.prevPage?.stage?.portraits ? this.imgs[this.prevPic] : null;
      if (prev && k < 1) drawContain(prev, 0, 0, W, ph);
      // The closing push-in starts from the whole picture and slowly closes in on it.
      const push = st.fx === 'push' ? Math.min(1, (this.picT || 0) / 14) : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, ph); ctx.clip();
      const r = img ? drawContain(img, -push * 60, -push * 40, W + push * 120, ph + push * 80, prev ? k : 1) : null;
      ctx.restore();
      if (!img && this.fallback) drawContain(this.fallback, 0, 0, W, ph, 0.55);
      if (st.fx === 'rain') this.drawRain(ph, t);
      if (st.fx === 'eyes_in' && r) this.drawEyesIn(r);
    }
    if (p.caption) {
      fade(0.55, '#000');
      const n = p.chunks.reduce((a, c) => a + c.text.split('\n').length + (c.speaker ? 1 : 0), 0);
      this.drawText(p, 140, Math.max(40, (H - n * 28) / 2 - 10), BOX.caption.w, BOX.caption.size, 'center');
    } else {
      const g = ctx.createLinearGradient(0, ph - 60, 0, ph);
      g.addColorStop(0, 'rgba(5,3,10,0)'); g.addColorStop(1, 'rgba(5,3,10,1)');
      ctx.fillStyle = g; ctx.fillRect(0, ph - 60, W, 60);
      panel(40, ph + 6, W - 80, H - ph - 20, { alpha: 0.95 });
      // Four lines fit at 19 px; the odd five-line page steps down a size.
      const n = p.chunks.reduce((a, c) => a + (c.speaker ? 1 : 0) + c.text.split('\n').reduce((b, l) => b + wrap(l, W - 140, 19).length, 0), 0);
      this.drawText(p, 70, ph + 22, W - 140, n > 4 ? 17 : 19, 'left');
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
  // Rain streaks over the storm (the original animates the downpour in four frames), with a
  // lightning flash now and then.
  drawRain(ph, t) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, ph); ctx.clip();
    ctx.strokeStyle = 'rgba(190,210,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 160; i++) {
      const x = ((i * 97.3 + t * 260) % (W + 120)) - 60, y = ((i * 53.1 + t * 900) % (ph + 40)) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 22);
    }
    ctx.stroke();
    if (this.flash > 0) { ctx.fillStyle = `rgba(230,235,255,${this.flash * 0.7})`; ctx.fillRect(0, 0, W, ph); }
    ctx.restore();
  }
  // Jashiin's eyes blend in over the princess (the original's palette blend).
  drawEyesIn(r) {
    const im = this.eyesOverlay;
    if (!im) return;
    const k = Math.min(1, (this.picT || 0) / 2.5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // In the dark sky over Felicia's shoulder (upper left of felicia_closeup), not on her face;
    // placed on the picture itself (r: where drawContain put it).
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    drawCover(im, r.x, r.y - r.h * 0.02, r.w * 0.62, r.w * 0.62 * 2 / 3, k * 0.9);
    ctx.restore();
  }
  // The split frame: portraits side by side in gold frames (or Jashiin's alone). The speaker
  // blinks and his mouth moves while his line is typing; a scrolling-away portrait slides off.
  drawPortraits(p, st, ph) {
    // The original's waku.grp: a crimson field inside a gold-and-blue ornate border.
    ctx.fillStyle = '#0c1440'; ctx.fillRect(0, 0, W, ph);
    ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 3; ctx.strokeRect(8, 6, W - 16, ph - 12);
    ctx.fillStyle = '#5a1010'; ctx.fillRect(20, 16, W - 40, ph - 32);
    ctx.strokeStyle = '#f0c860'; ctx.lineWidth = 2; ctx.strokeRect(20, 16, W - 40, ph - 32);
    ctx.strokeStyle = 'rgba(240,200,96,0.7)';
    for (const [cx, cy, sx, sy] of [[20, 16, 1, 1], [W - 20, 16, -1, 1], [20, ph - 16, 1, -1], [W - 20, ph - 16, -1, -1]]) {
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const r = 12 + k * 10; ctx.moveTo(cx + sx * r, cy); ctx.quadraticCurveTo(cx + sx * r, cy + sy * r, cx, cy + sy * r); }
      ctx.stroke();
    }
    const who = st.portraits;
    const speaking = SPEAKER[p.chunks[p.chunks.length - 1]?.speaker] || SPEAKER[p.chunks[0]?.speaker];
    const typing = this.chars < this.fullLen(p);
    const box = 300, gap = 70;
    const x0 = W / 2 - (who.length * box + (who.length - 1) * gap) / 2;
    if (st.scrollAway && p.sceneStart && (this.picT || 0) < 1.6) {
      const k = Math.min(1, (this.picT || 0) / 1.5);
      this.drawFace(st.scrollAway, W / 2 - box / 2, 30 - k * (box + 60), box, false);
      return;
    }
    who.forEach((w, i) => this.drawFace(w, x0 + i * (box + gap), 30, box, w === speaking && typing, !speaking || w === speaking));
  }
  drawFace(who, x, y, size, talking, lit = true) {
    const fc = this.faces[who] || {};
    const blinkCycle = (this.t + (who === 'king' ? 1.3 : who === 'jashiin' ? 2.1 : 0)) % 3.4;
    let im = fc.base;
    if (talking && fc.talk && Math.floor(this.t / 0.13) % 2 === 0) im = fc.talk;
    if (blinkCycle < 0.12 && fc.blink) im = fc.blink;
    ctx.fillStyle = '#d8a83a'; ctx.fillRect(x - 8, y - 8, size + 16, size + 16);
    ctx.fillStyle = '#5a1a10'; ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
    if (im) ctx.drawImage(im, x, y, size, size);
    if (!lit) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, size, size); }
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
