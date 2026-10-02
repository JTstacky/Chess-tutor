// The attract sequence that plays before the title, in the original's order (100OPDMO,
// data/rules/story.json "opening"): the copyright card, the ancient-history prologue rolling up
// over the necklace (which starts as a dark blue silhouette and turns to gold, its gems lighting
// up), Jashiin's awakening (his face built up out of the dark, the eyes opening, the fanged mouth
// speaking), the title logo with its colour rotation, and the staff credits. Enter skips to the
// next part; Esc (or the pause key) goes straight to the title menu.
import { ctx, W, H, text, COLORS, drawCover } from '../render/screen.js';
import { image } from '../core/assets.js';
import { audio } from '../core/audio.js';

// Original pacing: each prologue/credits line is drawn in 10 frames of 1Ch PIT ticks
// (236.70 Hz), about 1.18 s a line.
const LINE = 10 * 0x1c / 236.7;
const PHASES = ['card', 'prologue', 'jashiin', 'title', 'credits'];

const lines = (scenes, phase) => (scenes.find((s) => s.phase === phase)?.pages || []).flatMap((p) => p.lines.map((l) => l.text ?? ''));

export class OpeningScene {
  constructor(game, done) {
    this.game = game;
    this.done = done;
    this.k = 0;
    this.t = 0;
    const sc = game.data.rules.story?.opening?.scenes || [];
    this.copyright = lines(sc, 'title card');
    this.prologue = lines(sc, 'ancient-history prologue');
    this.beware = ['Beware, for I shall wake', 'from my sleep of 2,000 years', 'and once again reign over the world.'];
    this.credits = [...lines(sc, 'staff credits'), '', '', '-- THIS REMAKE --', '', 'A fan remake for tenggames.com.au', 'Remastered art, music and code made with', 'OpenAI image models and Claude', '', 'Based on the original\'s code and data,', 'with thanks to the Zeliard', 'reverse-engineering project'];
    this.img = {};
    for (const [k, f] of Object.entries({ logo: 'art/ui/logo.png', necklace: 'art/story/prologue.png', face: 'art/story/jashiin_face.png', open: 'art/story/jashiin_face_open.png', roar: 'art/story/jashiin_face_roar.png' })) {
      image(f).then((i) => { this.img[k] = i; }).catch(() => {});
    }
  }
  get phase() { return PHASES[this.k]; }
  enter() {}
  next() {
    this.k++;
    this.t = 0;
    if (this.phase === 'title') audio.playMusic('lantern_overture');
    if (!this.phase) this.done?.();
  }
  length() {
    switch (this.phase) {
      case 'card': return 4.5;
      case 'prologue': return this.prologue.length * LINE + 6;
      case 'jashiin': return 15;
      case 'title': return 7;
      case 'credits': return this.credits.length * LINE + 9;
    }
    return 0;
  }
  update(dt) {
    this.t += dt;
    const m = this.game.menu;
    if (m.pressed('pause') || m.pressed('cancel')) { this.k = PHASES.length - 1; this.next(); return; }
    if (m.pressed('confirm') || m.pressed('attack') || m.pressed('jump') || this.t >= this.length()) { this.next(); return; }
    if (this.phase === 'jashiin') {
      if (!this.rumbled && this.t > 5) { this.rumbled = true; audio.sfx('boss_roar', { vol: 0.6, rate: 0.7 }); }
    }
  }
  draw(t) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const f = this[`draw_${this.phase}`];
    if (f) f.call(this, t);
    if (this.phase && this.phase !== 'card') text('Enter: next    Esc: skip to title', W - 16, H - 18, { size: 11, align: 'right', color: 'rgba(160,150,140,0.5)' });
  }

  // 1. Copyright lines appear on black, then the logo fades in; cleared without an exit fade.
  draw_card() {
    const a = Math.min(1, this.t / 0.6);
    this.copyright.forEach((l, i) => text(l, W / 2, 360 + i * 26, { size: 16, align: 'center', color: COLORS.ink, alpha: a }));
    text('Fan remake · not affiliated with Game Arts or Sierra', W / 2, 360 + this.copyright.length * 26 + 14, { size: 11, align: 'center', color: COLORS.dim, alpha: a });
    const lg = this.img.logo;
    if (lg && this.t > 1) {
      const s = Math.min(520 / lg.width, 230 / lg.height);
      ctx.save(); ctx.globalAlpha = Math.min(1, (this.t - 1) / 1.2);
      ctx.drawImage(lg, W / 2 - (lg.width * s) / 2, 90, lg.width * s, lg.height * s);
      ctx.restore();
    }
  }

  // 2. The prologue rolls up over the necklace: a blue silhouette that turns to gold, gems lit last.
  draw_prologue() {
    const n = this.prologue.length, end = n * LINE;
    const u = Math.min(1, this.t / end);
    const out = Math.max(0, (this.t - end - 2) / 3); // the 120-frame fade at the end
    const nk = this.img.necklace;
    if (nk) {
      ctx.save();
      ctx.globalAlpha = 1 - out;
      // Blue silhouette -> gold: draw the necklace, then wash it with deep blue that thins out.
      drawCover(nk, -20, -10 - u * 30, W + 40, H + 60);
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = `rgba(20,40,170,${Math.max(0, 1 - u * 1.6)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(0,0,10,${0.55 - u * 0.25})`;
      ctx.fillRect(0, 0, W, H);
      // Gems catch the light once the gold is in.
      if (u > 0.6) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          const ph = (this.t * 0.9 + i * 0.37) % 3;
          if (ph > 0.5) continue;
          const x = W * (0.29 + i * 0.053), y = H * (0.47 + Math.sin((i / 8) * Math.PI) * 0.1) - u * 20;
          const r = 14 * Math.sin((ph / 0.5) * Math.PI) * (u - 0.6) * 2.5;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
          g.addColorStop(0, 'rgba(255,255,230,0.9)'); g.addColorStop(1, 'rgba(255,220,150,0)');
          ctx.fillStyle = g; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
          ctx.fillStyle = 'rgba(255,255,240,0.8)';
          ctx.fillRect(x - r, y - 0.5, r * 2, 1); ctx.fillRect(x - 0.5, y - r, 1, r * 2);
        }
      }
      ctx.restore();
    }
    // A soft dark column behind the text so it reads over the jewels.
    const col = ctx.createLinearGradient(W / 2 - 330, 0, W / 2 + 330, 0);
    col.addColorStop(0, 'rgba(0,0,8,0)'); col.addColorStop(0.2, 'rgba(0,0,8,0.62)'); col.addColorStop(0.8, 'rgba(0,0,8,0.62)'); col.addColorStop(1, 'rgba(0,0,8,0)');
    ctx.fillStyle = col; ctx.fillRect(W / 2 - 330, 0, 660, H);
    // Lines enter at the bottom and roll up; each is drawn in over its 1.18 s.
    const shown = this.t / LINE;
    for (let i = 0; i < n && i < shown; i++) {
      const y = H - 70 - (shown - i) * 30;
      if (y < 30) continue;
      const a = Math.min(1, (shown - i) * 1.5) * Math.min(1, (y - 30) / 60) * (1 - out);
      text(this.prologue[i], W / 2, y, { size: 20, align: 'center', color: '#f2e6c8', alpha: a });
    }
  }

  // 3. Jashiin wakes: his face assembles out of the dark, the eyes open with a flare, and he
  // speaks the three strips, his mouth working as each line appears.
  draw_jashiin() {
    const T = this.t;
    const face = this.img.face, open = this.img.open, roar = this.img.roar;
    const shake = T > 5 && T < 5.6 ? (Math.random() - 0.5) * 8 : 0;
    const fadeOut = Math.max(0, (T - 13.5) / 1.5);
    ctx.save();
    ctx.translate(shake, shake * 0.5);
    if (face) {
      // Build-up: horizontal bands of the face appear in a staggered order, brightening.
      const build = Math.min(1, T / 3.2);
      const bands = 12;
      for (let b = 0; b < bands; b++) {
        const order = [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0, 11][b];
        const a = Math.max(0, Math.min(1, build * bands - order * 0.75)) * (1 - fadeOut);
        if (a <= 0) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, (b * H) / bands, W, H / bands + 1); ctx.clip();
        let img = face;
        if (T > 5 && open) img = open;
        // Speaking: the mouth opens and closes while each strip is being spoken.
        const strip = this.stripAt(T);
        if (strip && roar && Math.floor((T - strip.t0) / 0.16) % 2 === 0 && T - strip.t0 < 1.6) img = roar;
        drawCover(img, W * 0.08, -46, W * 0.84, W * 0.84 * 2 / 3, a); // a little smaller and higher: room for his words under the chin
        ctx.restore();
      }
      // The eyes flare as they open.
      if (T > 5 && T < 6.2) {
        const k = 1 - (T - 5) / 1.2;
        ctx.globalCompositeOperation = 'lighter';
        for (const ex of [0.357, 0.66]) {
          const g = ctx.createRadialGradient(W * ex, 122, 0, W * ex, 122, 160);
          g.addColorStop(0, `rgba(255,60,40,${0.8 * k})`); g.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(W * ex - 160, 122 - 160, 320, 320);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
    if (T > this.strips()[0].t0) {
      const g = ctx.createLinearGradient(0, H - 100, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, `rgba(0,0,0,${0.85 * (1 - fadeOut)})`); g.addColorStop(1, `rgba(0,0,0,${0.95 * (1 - fadeOut)})`);
      ctx.fillStyle = g; ctx.fillRect(0, H - 100, W, 100);
    }
    for (const [i, s] of this.strips().entries()) {
      if (T < s.t0) continue;
      const chars = Math.floor((T - s.t0) * 28);
      text(this.beware[i].slice(0, chars), W / 2, H - 92 + i * 26, { size: 20, align: 'center', color: '#ff9c8a', alpha: 1 - fadeOut });
    }
  }
  strips() { return [{ t0: 6.4 }, { t0: 8.6 }, { t0: 10.8 }]; }
  stripAt(T) { return this.strips().filter((s) => T >= s.t0).pop(); }

  // 4. The title: the logo in a gold frame with the original's colour rotation, done as a
  // band of shifting colour that sweeps through the letters.
  draw_title(t) {
    const lg = this.img.logo;
    const a = Math.min(1, this.t / 1);
    frame(40, 30, W - 80, H - 60, a);
    if (!lg) { text('ZELIARD', W / 2, 200, { size: 72, align: 'center', color: '#e8423a' }); return; }
    const s = Math.min(640 / lg.width, 290 / lg.height);
    const w = lg.width * s, h = lg.height * s, x = W / 2 - w / 2, y = H / 2 - h / 2 - 20;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(lg, x, y, w, h);
    // Colour rotation: a hue-cycled copy of the logo shows through a moving diagonal band.
    const band = ((this.t * 0.45) % 1.6) - 0.3;
    const c = colourBuffer(lg, w, h, (this.t * 140) % 360);
    if (c) {
      const m = maskBand(c, band);
      ctx.globalAlpha = a * 0.85;
      ctx.drawImage(m, x, y, w, h);
    }
    ctx.restore();
    if (this.t > 1.5 && Math.floor(this.t * 2) % 2 === 0) text('A fan remake', W / 2, y + h + 26, { size: 14, align: 'center', color: COLORS.gold });
  }

  // 5. Staff credits roll up on black, as in the original, with this remake's lines at the end.
  draw_credits() {
    const n = this.credits.length;
    const shown = this.t / LINE;
    const out = Math.max(0, (this.t - n * LINE - 6) / 3);
    for (let i = 0; i < n && i < shown; i++) {
      const y = H - 60 - (shown - i) * 30;
      if (y < 20) continue;
      const l = this.credits[i];
      const head = /^--|^ZELIARD$|^Fantasy/.test(l);
      const a = Math.min(1, (shown - i) * 1.5) * Math.min(1, (y - 20) / 50) * (1 - out);
      text(l.replace(/\s{2,}/g, '   '), W / 2, y, { size: head ? 22 : 18, align: 'center', color: head ? COLORS.gold : '#e8e0d0', alpha: a });
    }
  }
}

// Gold double frame with corner flourishes (the original's ornate border).
function frame(x, y, w, h, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#2a1206'; ctx.fillRect(x, y, w, h);
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  g.addColorStop(0, '#5a2a14'); g.addColorStop(1, '#1a0904');
  ctx.fillStyle = g; ctx.fillRect(x + 10, y + 10, w - 20, h - 20);
  ctx.strokeStyle = '#d8a83a'; ctx.lineWidth = 4; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.strokeStyle = '#8a5a1a'; ctx.lineWidth = 2; ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
  ctx.strokeStyle = '#f0c860'; ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [[x + 12, y + 12, 1, 1], [x + w - 12, y + 12, -1, 1], [x + 12, y + h - 12, 1, -1], [x + w - 12, y + h - 12, -1, -1]]) {
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const r = 14 + k * 12;
      ctx.moveTo(cx + sx * r, cy); ctx.quadraticCurveTo(cx + sx * r, cy + sy * r, cx, cy + sy * r);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Offscreen helpers for the colour rotation.
let cbuf = null, cmask = null;
function colourBuffer(img, w, h, hue) {
  try {
    cbuf ||= document.createElement('canvas');
    cbuf.width = Math.ceil(w); cbuf.height = Math.ceil(h);
    const g = cbuf.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.filter = `hue-rotate(${hue}deg) saturate(1.6) brightness(1.15)`;
    g.drawImage(img, 0, 0, w, h);
    g.filter = 'none';
    return cbuf;
  } catch { return null; }
}
function maskBand(src, band) {
  cmask ||= document.createElement('canvas');
  cmask.width = src.width; cmask.height = src.height;
  const g = cmask.getContext('2d');
  g.clearRect(0, 0, src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, src.width, src.height * 0.4);
  const p = (v) => Math.max(0, Math.min(1, v));
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(p(band - 0.15), 'rgba(0,0,0,0)');
  gr.addColorStop(p(band), 'rgba(0,0,0,1)');
  gr.addColorStop(p(band + 0.15), 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, src.width, src.height);
  g.globalCompositeOperation = 'source-over';
  return cmask;
}
