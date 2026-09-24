// Battle arena: when a piece captures another, the board opens into a little 2D stage
// and the two pieces have a cartoon battle. Every attacker/victim pair has its own
// attack, and nobody gets hurt: victims get bubbled, frogged, bounced or blown away.
import './battle.css';
import type { Color, PieceSymbol } from 'chess.js';
import { sfx, type Sfx } from './sound';
import { glowFilter, pieceSrc, type Theme } from './themes';
import type { Timeline } from './timeline';

export interface Fighter {
  el: HTMLElement; // position layer
  inner: HTMLElement; // squash / wobble layer
  flip: HTMLElement; // facing layer (holds the picture and eyes)
  type: PieceSymbol;
  color: Color;
  cx: number; // centre x of the home spot, in stage units (0..100)
  facing: 1 | -1;
}

type Mood = 'shock' | 'happy' | 'dizzy' | 'sleep' | 'angry' | null;

interface Opts {
  size?: number;
  color?: string;
  rot?: number;
  n?: number;
  dist?: number;
  dur?: number;
}

const NAMES: Record<PieceSymbol, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

// Stage layout (units are percent of the stage width; the stage is square).
const GROUND = 82;
const HEAD = 58;
const MID = 68;
const AX = 26;
const VX = 74;
const SIZE = 30;

// Where the cartoon eyes go on each piece, as % of the piece picture.
const EYES: Record<PieceSymbol, { at: [number, number][]; size: number }> = {
  p: { at: [[44, 29], [57, 29]], size: 11 },
  n: { at: [[31, 36]], size: 14 },
  b: { at: [[42, 49], [58, 49]], size: 12 },
  r: { at: [[40, 49], [60, 49]], size: 13 },
  q: { at: [[39, 50], [61, 50]], size: 13 },
  k: { at: [[33, 55], [67, 55]], size: 13 },
};

/** A transform keyframe: offset from home (x, y), rotation, scale and opacity. */
export function K(x = 0, y = 0, r = 0, sx = 1, sy = sx, o = 1): Keyframe {
  return { transform: `translate(${x}cqw, ${y}cqw) rotate(${r}deg) scale(${sx}, ${sy})`, opacity: o };
}
const at = (offset: number, k: Keyframe, easing?: string): Keyframe => ({ ...k, offset, ...(easing ? { easing } : {}) });
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Stage {
  readonly root: HTMLElement;
  readonly world: HTMLElement;
  A!: Fighter;
  V!: Fighter;

  constructor(
    readonly tl: Timeline,
    readonly theme: Theme,
  ) {
    this.root = document.createElement('div');
    this.root.className = `battle bt-${theme.id}`;
    this.world = document.createElement('div');
    this.world.className = 'bt-world';
    this.world.innerHTML = `<div class="bt-sky"></div><div class="bt-ground"></div>`;
    for (const [e, x, y, s] of theme.deco) this.prop(e, x, y, s, 'bt-deco');
    const zoom = document.createElement('div');
    zoom.className = 'bt-zoom';
    zoom.append(this.world);
    this.root.append(zoom);
  }

  fighter(type: PieceSymbol, color: Color, cx: number, facing: 1 | -1): Fighter {
    const el = document.createElement('div');
    el.className = 'bt-fighter';
    el.style.left = `${cx - SIZE / 2}cqw`;
    el.style.top = `${GROUND - SIZE}cqw`;
    const inner = document.createElement('div');
    inner.className = 'bt-inner';
    const flip = document.createElement('div');
    flip.className = 'bt-flip';
    // The knight picture looks left; the others look right (they're symmetrical, but the eyes aren't).
    const native = type === 'n' ? -1 : 1;
    flip.style.transform = `scaleX(${facing * native})`;
    const img = document.createElement('img');
    img.src = pieceSrc(this.theme, color, type);
    img.alt = '';
    img.draggable = false;
    img.style.filter = glowFilter(this.theme[color]);
    flip.append(img);
    const eyes = EYES[type];
    for (const [x, y] of eyes.at) {
      const eye = document.createElement('i');
      eye.className = 'bt-eye';
      eye.style.cssText = `left:${x}%;top:${y}%;--es:${eyes.size}%`;
      eye.innerHTML = '<b></b>';
      flip.append(eye);
    }
    // Pupils look the way the picture faces; mirroring the picture turns them round too.
    flip.style.setProperty('--look', String(native));
    inner.append(flip);
    el.append(inner);
    const pet = this.theme[color].pet;
    if (pet) {
      const p = document.createElement('span');
      p.className = 'bt-pet';
      p.textContent = pet;
      p.style[facing === 1 ? 'left' : 'right'] = '-14%';
      el.append(p);
    }
    this.world.append(el);
    return { el, inner, flip, type, color, cx, facing };
  }

  // ---- motion ----

  /** Move a fighter (offsets from its home spot). */
  go(f: Fighter, frames: Keyframe[], dur: number, easing = 'ease-in-out') {
    return this.tl.anim(f.el, frames, { duration: dur, easing });
  }

  /** Squash, stretch, wobble or tip over a fighter (pivots on its feet). */
  fx(f: Fighter, frames: Keyframe[], dur: number | KeyframeAnimationOptions, easing = 'ease-in-out') {
    const o = typeof dur === 'number' ? { duration: dur, easing } : { easing, ...dur };
    return this.tl.anim(f.inner, frames, o);
  }

  anim(el: HTMLElement, frames: Keyframe[], dur: number | KeyframeAnimationOptions, easing = 'ease-in-out') {
    const o = typeof dur === 'number' ? { duration: dur, easing } : { easing, ...dur };
    return this.tl.anim(el, frames, o);
  }

  /** Turn a fighter around. */
  turn(f: Fighter, dur = 200) {
    f.facing = f.facing === 1 ? -1 : 1;
    const to = f.type === 'n' ? -f.facing : f.facing;
    return this.tl.anim(f.flip, [{ transform: `scaleX(${-to})` }, { transform: `scaleX(${to * 0.1})` }, { transform: `scaleX(${to})` }], {
      duration: dur,
      easing: 'ease-in-out',
    });
  }

  origin(f: Fighter, o: string) {
    f.inner.style.transformOrigin = o;
  }

  mood(f: Fighter, m: Mood) {
    f.el.classList.remove('m-shock', 'm-happy', 'm-dizzy', 'm-sleep', 'm-angry');
    if (m) f.el.classList.add(`m-${m}`);
  }

  addClass(f: Fighter, cls: string) {
    f.inner.classList.add(cls);
  }

  wait(ms: number) {
    return this.tl.wait(ms);
  }

  later(ms: number, fn: () => void) {
    this.tl.later(ms, fn);
  }

  sfx(name: Sfx) {
    if (!this.tl.skipped) sfx[name]();
  }

  // ---- props and effects ----

  /** Put a prop (emoji or a styled shape) centred at stage point (x, y). */
  prop(content: string, x: number, y: number, size: number, cls = '', parent: HTMLElement = this.world): HTMLElement {
    const el = document.createElement('div');
    el.className = `bt-prop ${cls}`;
    el.style.cssText = `left:${x}cqw;top:${y}cqw;font-size:${size}cqw`;
    el.innerHTML = `<div class="bt-pc">${content}</div>`;
    parent.append(el);
    return el;
  }

  /** A prop carried by a fighter: (dx, dy) from the fighter's centre, facing its way. */
  hold(f: Fighter, content: string, dx: number, dy: number, size: number, cls = ''): HTMLElement {
    const el = this.prop(content, SIZE / 2 + dx, SIZE / 2 + dy, size, cls, f.el);
    return el;
  }

  /** A beam from (x1, y1) to (x2, y2) that shoots out from its start. */
  beam(x1: number, y1: number, x2: number, y2: number, cls: string, dur = 250, fromEnd = false): HTMLElement {
    const el = document.createElement('div');
    el.className = `bt-beam ${cls}`;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    el.style.cssText = `left:${x1}cqw;top:${y1}cqw;width:${len}cqw;transform:rotate(${ang}deg)`;
    const bar = document.createElement('div');
    bar.style.transformOrigin = fromEnd ? 'right center' : 'left center';
    el.append(bar);
    this.world.append(el);
    void this.anim(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], dur, 'ease-out');
    return el;
  }

  /** Comic-book word that pops up and fades. */
  pow(text: string, x: number, y: number, o: Opts = {}) {
    const el = this.prop('', x, y, o.size ?? 9, 'bt-pow');
    el.firstElementChild!.textContent = text;
    el.style.color = o.color ?? '#ff4757';
    const r = o.rot ?? rand(-12, 12);
    void this.anim(el, [K(0, 0, r, 0), at(0.2, K(0, -2, r, 1.25)), at(0.35, K(0, -2, r, 1)), at(0.8, K(0, -4, r, 1)), K(0, -6, r, 1, 1, 0)], o.dur ?? 900).then(() => el.remove());
  }

  /** Speech bubble above a fighter. */
  say(f: Fighter, text: string, dur = 1000) {
    this.bubble(text, f.cx + f.facing * 4, GROUND - SIZE - 6, dur);
  }

  bubble(text: string, x: number, y: number, dur = 1000) {
    const el = this.prop('', Math.max(16, Math.min(84, x)), y, 4.6, 'bt-say');
    el.firstElementChild!.textContent = text;
    void this.anim(el, [K(0, 2, 0, 0), at(0.12, K(0, 0, 0, 1.1)), at(0.2, K()), at(0.85, K()), K(0, -2, 0, 1, 1, 0)], dur).then(() => el.remove());
  }

  /** Particles flying out from a point. */
  burst(x: number, y: number, chars: string[], o: Opts = {}) {
    const n = o.n ?? 8;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = (o.dist ?? 16) * rand(0.6, 1.1);
      const el = this.prop(chars[i % chars.length], x, y, o.size ?? rand(4, 6), 'bt-fx');
      void this.anim(el, [K(0, 0, 0, 0.3), at(0.3, K(Math.cos(ang) * d * 0.6, Math.sin(ang) * d * 0.6, 90, 1)), K(Math.cos(ang) * d, Math.sin(ang) * d + 4, rand(-200, 200), 0.6, 0.6, 0)], {
        duration: o.dur ?? rand(600, 900),
        easing: 'ease-out',
      }).then(() => el.remove());
    }
  }

  /** Little clouds of dust at someone's feet. */
  dust(x: number, y = GROUND, n = 5) {
    for (let i = 0; i < n; i++) {
      const el = this.prop('', x + rand(-8, 8), y - 1, rand(4, 7), 'bt-dust');
      const dx = rand(-10, 10);
      void this.anim(el, [K(0, 0, 0, 0.3), K(dx, -rand(3, 8), 0, 1.3, 1.3, 0)], rand(500, 800), 'ease-out').then(() => el.remove());
    }
  }

  poof(x: number, y: number) {
    this.sfx('poof');
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const el = this.prop('', x + Math.cos(ang) * 4, y + Math.sin(ang) * 4, rand(9, 13), 'bt-dust bt-cloud');
      void this.anim(el, [K(0, 0, 0, 0.2), at(0.4, K(Math.cos(ang) * 6, Math.sin(ang) * 6, 0, 1)), K(Math.cos(ang) * 9, Math.sin(ang) * 9 - 3, 0, 1.1, 1.1, 0)], 900, 'ease-out').then(() => el.remove());
    }
  }

  twinkle(x: number, y: number) {
    this.sfx('ding');
    const el = this.prop('✨', x, y, 9, 'bt-fx');
    void this.anim(el, [K(0, 0, 0, 0), at(0.3, K(0, 0, 90, 1.4)), K(0, 0, 180, 0, 0, 0)], 700).then(() => el.remove());
  }

  shake(power = 1.5, dur = 350) {
    const p = power;
    void this.anim(this.world, [K(), K(-p, p * 0.5), K(p, -p * 0.5), K(-p * 0.6, 0), K(p * 0.4, p * 0.3), K()], dur, 'linear');
  }

  flash(color = '#fff', dur = 300) {
    const el = document.createElement('div');
    el.className = 'bt-flash';
    el.style.background = color;
    this.root.append(el);
    void this.anim(el, [{ opacity: 0.9 }, { opacity: 0 }], dur, 'ease-out').then(() => el.remove());
  }

  hide(f: Fighter) {
    f.el.style.visibility = 'hidden';
  }

  /** A trail of emoji flying from one point to another (notes, snowflakes, sparkles). */
  stream(chars: string[], x1: number, y1: number, x2: number, y2: number, n: number, gap: number, wave = 4, size = 5) {
    for (let i = 0; i < n; i++) {
      this.later(i * gap, () => {
        const el = this.prop(chars[i % chars.length], x1, y1, size, 'bt-fx');
        const w = (i % 2 ? 1 : -1) * wave;
        void this.anim(el, [K(0, 0, 0, 0.4), at(0.5, K((x2 - x1) / 2, (y2 - y1) / 2 + w, 20, 1)), K(x2 - x1, y2 - y1, 0, 0.9, 0.9, 0.2)], 500, 'linear').then(() => el.remove());
      });
    }
  }
}

// ---- the battles: one for every attacker/victim pair ----

type Script = (s: Stage, A: Fighter, V: Fighter) => Promise<void>;
interface Battle {
  title: string;
  run: Script;
}

const wiggle = (a: number) => [K(0, 0, -a), K(0, 0, a), K(0, 0, -a), K(0, 0, a), K(0, 0, 0)];
const spin = (n: number) => Array.from({ length: n * 2 + 1 }, (_, i) => K(0, 0, 0, i % 2 ? -1 : 1, 1));

export const BATTLES: Record<string, Battle> = {
  // ---------- Pawn: small but brave ----------
  pp: {
    title: 'Pillow Fight!',
    async run(s, A, V) {
      const pa = s.hold(A, '', 11, 0, 11, 'pillow');
      const pv = s.hold(V, '', -11, 0, 11, 'pillow');
      s.sfx('whoosh');
      await s.go(A, [K(22, 0)], 350, 'ease-in');
      for (let i = 0; i < 3; i++) {
        void s.anim(pa, [K(0, 0, 0), K(-2, -4, -70), K(2, 0, 40), K(0, 0, 0)], 300);
        if (i === 1) void s.anim(pv, [K(0, 0, 0), K(2, -4, 70), K(0, 0, -20), K(0, 0, 0)], 300);
        await s.wait(160);
        s.sfx('bonk');
        s.burst(VX - 8, HEAD + rand(-4, 4), ['🪶'], { n: 4, dist: 14 });
        void s.fx(V, [K(0, 0, 0), K(0, 0, 9), K(0, 0, 0)], 200);
        await s.wait(160);
      }
      pv.remove();
      s.mood(V, 'sleep');
      s.say(V, 'Zzz…');
      s.sfx('snore');
      await s.fx(V, [K(0, 0, 0), K(0, 0, -6), K(0, 0, 88)], 700, 'ease-in');
      s.sfx('thud');
      s.burst(VX + 10, GROUND - 6, ['🪶', '💤'], { n: 8, dist: 18 });
      void s.go(A, [K(22, 0), K(0, 0)], 400);
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 6, 0, 1, 1, 0)], 600);
    },
  },
  pn: {
    title: 'Carrot Trick!',
    async run(s, A, V) {
      const c = s.hold(A, '🥕', 13, -2, 9);
      void s.anim(c, [K(0, 0, -15), K(0, -2, 15), K(0, 0, -15)], { duration: 400, iterations: 2 });
      s.say(A, 'Want a carrot?');
      await s.wait(700);
      s.mood(V, 'happy');
      s.say(V, 'Yum!');
      s.burst(VX, HEAD - 10, ['💕'], { n: 3, dist: 8 });
      s.sfx('gallop');
      await s.go(V, [K(0, 0), K(-5, -5), K(-10, 0), K(-15, -5), K(-20, 0)], 600, 'linear');
      s.sfx('whoosh');
      s.say(A, 'Fetch!');
      await s.anim(c, [K(0, 0, 0), at(0.5, K(40, -38, 360)), K(90, -8, 720)], 650, 'linear');
      s.say(V, 'Carrot!!');
      await s.turn(V);
      s.sfx('gallop');
      s.later(300, () => s.sfx('gallop'));
      await s.go(V, [K(-20, 0), K(-8, -7), K(4, 0), K(18, -7), K(32, 0), K(48, -7), K(66, 0)], 900, 'ease-in');
    },
  },
  pb: {
    title: 'Tickle Attack!',
    async run(s, A, V) {
      s.say(A, 'Hee hee!');
      s.sfx('step');
      s.later(200, () => s.sfx('step'));
      s.later(400, () => s.sfx('step'));
      await s.go(A, [K(0, 0), K(7, -2, 0, 1, 0.92), K(14, 0), K(21, -2, 0, 1, 0.92), K(28, 0)], 700);
      const f = s.hold(A, '🪶', 13, -4, 9);
      void s.anim(f, [K(0, 0, -30), K(2, -3, 20), K(0, 0, -30)], { duration: 220, iterations: 7 });
      s.mood(V, 'happy');
      for (let i = 0; i < 3; i++) {
        s.pow(['HA', 'HA', 'HA!'][i], VX - 8 + i * 9, 40 - i * 3, { size: 6, color: '#ffb400' });
        s.sfx('laugh');
        await s.fx(V, wiggle(7), 420);
      }
      f.remove();
      s.say(V, 'Stop, it tickles!');
      void s.go(A, [K(28, 0), K(0, 0)], 500);
      s.origin(V, '50% 60%');
      s.sfx('laugh');
      await s.go(V, [K(0, 0), K(10, 0), K(55, 0)], 900, 'ease-in');
    },
  },
  pr: {
    title: 'Pea Shooter!',
    async run(s, A, V) {
      const straw = s.hold(A, '', 11, -3, 9, 'straw');
      s.say(A, 'Pew pew!');
      for (let i = 0; i < 6; i++) {
        const pea = s.prop('', AX + 17, HEAD + 3, 2.4, 'pea');
        s.sfx('pop');
        void s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.05, 0.95), K(0, 0, 0, 1, 1)], 120);
        const ty = rand(-3, 3);
        void s.anim(pea, [K(0, 0), K(VX - AX - 25, ty)], 220, 'linear').then(() => {
          s.sfx('bonk');
          void s.anim(pea, [K(VX - AX - 25, ty), K(VX - AX - 34, ty - 10, 0, 1, 1, 0)], 300, 'ease-out').then(() => pea.remove());
        });
        s.later(220, () => void s.fx(V, [K(0, 0, 0), K(0, 0, 3 + i * 1.5), K(0, 0, 0)], 200));
        await s.wait(210);
      }
      straw.remove();
      await s.wait(250);
      s.mood(V, 'shock');
      s.say(V, 'Whoa…');
      s.sfx('creak');
      await s.fx(V, [K(0, 0, 0), K(0, 0, -8), K(0, 0, 4)], 500);
      s.pow('TIMBER!', VX, 36, { color: '#8b5a2b' });
      await s.fx(V, [K(0, 0, 4), K(0, 0, 92)], 500, 'ease-in');
      s.sfx('thud');
      s.shake(2);
      s.dust(VX + 14, GROUND, 7);
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 450);
    },
  },
  pq: {
    title: 'Water Balloon!',
    async run(s, A, V) {
      const b = s.hold(A, '🎈', 10, -14, 10, 'blue');
      s.say(A, 'Catch!');
      await s.anim(b, [K(0, 0, 0), K(-3, -3, -25)], 300);
      s.sfx('whoosh');
      await s.anim(b, [K(-3, -3, -25), at(0.5, K(22, -26, 180)), K(44, -2, 360)], 600, 'linear');
      b.remove();
      s.sfx('splash');
      s.burst(VX, HEAD, ['💦', '💧'], { n: 10, dist: 20 });
      s.addClass(V, 'wet');
      s.mood(V, 'shock');
      s.say(V, 'EEEK!');
      for (let i = 0; i < 4; i++) {
        const d = s.prop('💧', VX - 7 + i * 5, MID - 4, 3.5, 'bt-fx');
        void s.anim(d, [K(0, 0, 0, 1, 1, 0), K(0, 2), K(0, 16, 0, 1, 1, 0)], { duration: 700, delay: i * 120, easing: 'ease-in' }).then(() => d.remove());
      }
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.12, 0.85), K(0, 0, 0, 0.92, 1.1), K(0, 0, 0, 1, 1)], 450);
      await s.turn(V);
      s.sfx('squeak');
      await s.go(V, [K(0, 0), K(8, -4), K(16, 0), K(26, -4), K(36, 0), K(48, -4), K(62, 0)], 900, 'linear');
    },
  },

  // ---------- Knight: kicks, leaps and charges ----------
  np: {
    title: 'Donkey Kick!',
    async run(s, A, V) {
      s.say(A, 'Hold still!');
      await s.turn(A);
      s.sfx('step');
      await s.go(A, [K(0, 0), K(18, 0)], 400);
      await s.wait(150);
      s.sfx('boing');
      void s.fx(A, [K(0, 0, 0), K(0, 0, -28), K(0, 0, 0)], 320);
      await s.wait(140);
      s.pow('BOING!', VX - 10, 46, { rot: 10 });
      s.burst(VX - 8, MID, ['💥'], { n: 3, dist: 8 });
      s.mood(V, 'shock');
      s.sfx('slideUp');
      await s.go(V, [K(0, 0, 0), K(12, -45, 300, 0.6), K(18, -70, 600, 0.25), K(20, -76, 720, 0.05, 0.05, 0)], 950, 'ease-out');
      s.twinkle(VX + 20, 10);
      void s.turn(A);
      await s.go(A, [K(18, 0), K(0, 0)], 450);
    },
  },
  nn: {
    title: 'Jousting!',
    async run(s, A, V) {
      const la = s.hold(A, '', 13, 0, 22, 'lance');
      const lv = s.hold(V, '', -13, 0, 22, 'lance lance-l');
      s.pow('CHARGE!', 50, 34, { color: '#ff7a00', rot: 0 });
      s.sfx('gallop');
      s.later(250, () => s.sfx('gallop'));
      void s.go(V, [K(0, 0), K(-8, -3), K(-16, 0)], 520, 'ease-in');
      await s.go(A, [K(0, 0), K(8, -3), K(16, 0)], 520, 'ease-in');
      s.sfx('clang');
      s.flash();
      s.shake(2);
      s.burst(50, MID - 2, ['⭐', '✨', '💥'], { n: 10, dist: 22 });
      s.pow('CLANG!', 50, 40, { color: '#ffd000' });
      void s.anim(lv, [K(0, 0, 0), K(25, -35, 300, 1, 1, 0)], 700, 'ease-out');
      void la;
      s.mood(V, 'dizzy');
      await s.go(V, [K(-16, 0, 0), K(8, -22, 200), K(56, -8, 540, 1, 1, 0.1)], 850, 'ease-out');
      await s.go(A, [K(16, 0), K(0, 0)], 400);
    },
  },
  nb: {
    title: 'Leapfrog Squash!',
    async run(s, A, V) {
      s.say(A, 'Leapfrog!');
      await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.12, 0.8)], 250);
      s.sfx('boing');
      void s.fx(A, [K(0, 0, 0, 1.12, 0.8), K(0, 0, 0, 0.9, 1.15), K(0, 0, 0, 1, 1)], 400);
      await s.go(A, [K(0, 0), at(0.55, K(26, -42, -10), 'ease-in'), K(48, -14, 0)], 650, 'ease-out');
      s.sfx('squish');
      s.pow('SQUASH!', VX, 36);
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.6, 0.14)], 140, 'ease-in');
      s.mood(V, 'dizzy');
      s.dust(VX, GROUND, 6);
      await s.go(A, [K(48, -14), at(0.5, K(24, -34), 'ease-in'), K(0, 0)], 650, 'ease-out');
      s.sfx('slideUp');
      s.say(V, 'Flat as a pancake!', 1300);
      await s.go(V, [K(0, 0, 0), K(8, -18, -20), K(0, -38, 20), K(12, -58, -25), K(6, -90, 15, 1, 1, 0)], 1400);
    },
  },
  nr: {
    title: 'Gallop Charge!',
    async run(s, A, V) {
      for (let i = 0; i < 2; i++) {
        s.sfx('step');
        s.dust(AX - 4, GROUND, 3);
        await s.fx(A, [K(0, 0, 0), K(0, 0, -10), K(0, 0, 0)], 260);
      }
      s.say(A, 'Charge!');
      s.sfx('gallop');
      await s.go(A, [K(0, 0), K(26, 0)], 320, 'ease-in');
      s.sfx('crash');
      s.shake(2);
      s.pow('CRASH!', VX - 4, 42);
      s.burst(VX, HEAD + 2, ['🧱'], { n: 4, dist: 18 });
      void s.fx(V, [K(0, 0, 0), K(0, 0, 12), K(0, 0, -6), K(0, 0, 0)], 400);
      s.mood(V, 'shock');
      await s.go(A, [K(26, 0), K(4, 0)], 350, 'ease-out');
      s.say(A, 'Again!', 700);
      await s.wait(300);
      await s.go(A, [K(4, 0), K(27, 0)], 260, 'ease-in');
      s.sfx('crash');
      s.shake(3);
      s.flash('#ffe8b0');
      s.pow('CRUMBLE!', VX, 38, { color: '#c0522d' });
      for (let i = 0; i < 8; i++) {
        const b = s.prop('🧱', VX + rand(-8, 8), HEAD + rand(-4, 12), rand(4, 6), 'bt-fx');
        const dx = rand(-10, 14);
        void s.anim(b, [K(0, 0, 0), at(0.7, K(dx, GROUND - HEAD - 8, rand(-90, 90)), 'ease-out'), K(dx * 1.1, GROUND - HEAD - 10, rand(-90, 90), 1, 1, 0)], { duration: 900, delay: i * 40, easing: 'ease-in' }).then(() => b.remove());
      }
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 8, 0, 1.1, 0.3, 0)], 450, 'ease-in');
      s.dust(VX, GROUND, 8);
      await s.go(A, [K(27, 0), K(0, 0)], 450);
    },
  },
  nq: {
    title: 'Lasso Loop!',
    async run(s, A, V) {
      const lasso = s.hold(A, '', 0, -19, 13, 'lasso');
      void s.anim(lasso.firstElementChild as HTMLElement, [{ transform: 'translate(-50%,-50%) rotateX(70deg) rotate(0deg)' }, { transform: 'translate(-50%,-50%) rotateX(70deg) rotate(360deg)' }], { duration: 300, iterations: Infinity, easing: 'linear' });
      s.say(A, 'Yee-haw!');
      s.sfx('whirl');
      await s.wait(800);
      s.sfx('whoosh');
      await s.anim(lasso, [K(0, 0), at(0.5, K(24, -14)), K(48, 10, 0, 0.9, 0.9)], 500);
      lasso.remove();
      const loop = s.hold(V, '', 0, 6, 13, 'lasso tight');
      void loop;
      s.sfx('pop');
      s.mood(V, 'shock');
      s.say(V, 'Hey!');
      await s.wait(350);
      s.say(A, 'Yank!', 600);
      void s.fx(A, [K(0, 0, 0), K(0, 0, -15), K(0, 0, 0)], 300);
      s.sfx('whirl');
      s.mood(V, 'dizzy');
      void s.fx(V, spin(6), { duration: 1100, easing: 'linear' });
      await s.go(V, [K(0, 0), K(-4, -6), K(10, -14), K(30, -30), K(60, -50, 0, 0.6, 0.6, 0)], 1100, 'ease-in');
    },
  },

  // ---------- Bishop: a wizard with spells ----------
  bp: {
    title: 'Bubble Spell!',
    async run(s, A, V) {
      const w = s.hold(A, '🪄', 12, -8, 9);
      s.say(A, 'Bubble-ooo!');
      s.sfx('sparkle');
      await s.anim(w, [K(0, 0, -20), K(0, -2, 25), K(0, 0, -20), K(0, -2, 25)], 600);
      s.stream(['✨'], AX + 16, HEAD - 6, VX, MID, 5, 70, 5);
      await s.wait(450);
      const bub = s.hold(V, '', 0, 0, 30, 'bubble');
      s.sfx('bubble');
      await s.anim(bub, [K(0, 0, 0, 0), K(0, 0, 0, 1.1), K(0, 0, 0, 1)], 400);
      s.mood(V, 'shock');
      await s.wait(350);
      s.mood(V, 'happy');
      s.say(V, 'Wheee!');
      s.sfx('slideUp');
      await s.go(V, [K(0, 0), K(-5, -20), K(5, -42), K(-4, -66), K(4, -100)], 1600, 'ease-in');
    },
  },
  bn: {
    title: 'Frog Spell!',
    async run(s, A, V) {
      const w = s.hold(A, '🪄', 12, -8, 9);
      s.say(A, 'Abraca-FROG!');
      await s.anim(w, [K(0, 0, -20), K(0, -2, 25), K(0, 0, -30)], 500);
      s.sfx('zap');
      const beam = s.beam(AX + 16, HEAD - 8, VX - 4, MID - 4, 'beam-green');
      await s.wait(350);
      beam.remove();
      s.poof(VX, MID);
      s.hide(V);
      const frog = s.prop('🐸', VX, GROUND - 6, 12);
      await s.anim(frog, [K(0, 0, 0, 0), K(0, 0, 0, 1.2), K(0, 0, 0, 1)], 350);
      s.bubble('Ribbit!', VX, 60);
      s.sfx('ribbit');
      await s.wait(600);
      s.later(300, () => s.sfx('ribbit'));
      await s.anim(frog, [K(0, 0), K(7, -12), K(14, 0), K(21, -12), K(28, 0), K(35, -12), K(44, 0)], 900, 'linear');
    },
  },
  bb: {
    title: 'Magic Duel!',
    async run(s, A, V) {
      s.hold(A, '🪄', 12, -8, 9);
      s.hold(V, '🪄', -12, -8, 9, 'flipx');
      s.pow('DUEL!', 50, 34, { color: '#9b5cff', rot: 0 });
      s.sfx('zap');
      const y = HEAD - 6;
      const x1 = AX + 17;
      const x2 = VX - 17;
      const bA = s.beam(x1, y, 50, y, 'beam-purple', 250);
      const bV = s.beam(x2, y, 50, y, 'beam-orange', 250);
      const orb = s.prop('', 50, y, 9, 'orb');
      await s.wait(250);
      // Push and pull where the beams meet, then the attacker wins.
      const dxs = [0, -5, 3, -3, 6, 2, 10];
      const times = dxs.map((_, i) => i / (dxs.length - 1));
      const fr = (dx: number) => ({ a: (50 + dx - x1) / (50 - x1), v: (x2 - 50 - dx) / (x2 - 50) });
      const barA = bA.firstElementChild as HTMLElement;
      const barV = bV.firstElementChild as HTMLElement;
      barV.style.transformOrigin = 'left center';
      s.sfx('whirl');
      void s.anim(orb, dxs.map((dx, i) => at(times[i], K(dx, 0, i * 60, 1 + (i % 2) * 0.2))), 1300);
      void s.anim(barA, dxs.map((dx, i) => ({ transform: `scaleX(${fr(dx).a})`, offset: times[i] })), 1300);
      await s.anim(barV, dxs.map((dx, i) => ({ transform: `scaleX(${Math.max(0, fr(dx).v)})`, offset: times[i] })), 1300);
      bA.remove();
      bV.remove();
      orb.remove();
      s.flash('#f3e3ff');
      s.sfx('fireworks');
      s.pow('KA-BLAM!', VX, 40, { color: '#9b5cff' });
      s.burst(VX, MID, ['🎉', '🎊', '✨'], { n: 16, dist: 30 });
      await s.go(V, [K(0, 0, 0, 1), K(0, 0, 0, 1.3, 1.3, 0)], 250);
      await s.wait(500);
    },
  },
  br: {
    title: 'Levitation!',
    async run(s, A, V) {
      const w = s.hold(A, '🪄', 12, -8, 9);
      s.say(A, 'Up, up and away!');
      void s.anim(w, [K(0, 0, -20), K(0, -3, 25), K(0, 0, -20)], { duration: 500, iterations: 2 });
      void s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1, 1.08), K(0, 0, 0, 1, 1)], 1000);
      s.addClass(V, 'glow');
      s.sfx('slideUp');
      await s.go(V, [K(0, 0, 0), K(0, -8, -5), K(0, -13, 5), K(0, -17, -4), K(0, -20, 0)], 1000);
      s.mood(V, 'shock');
      s.say(V, 'Uh oh…', 700);
      const fl = s.hold(V, '🔥', 0, 17, 9, 'flame');
      void s.anim(fl, [K(0, 0, 180, 0.8), K(0, 1, 180, 1.2), K(0, 0, 180, 0.8)], { duration: 150, iterations: 10 });
      await s.wait(350);
      s.sfx('rocket');
      await s.go(V, [K(0, -20), K(0, -115, 0, 1, 1.15)], 750, 'ease-in');
      s.sfx('fireworks');
      s.burst(VX, 12, ['🎆', '🎇', '✨'], { n: 10, dist: 18 });
      await s.wait(600);
    },
  },
  bq: {
    title: 'Shrink Ray!',
    async run(s, A, V) {
      const w = s.hold(A, '🪄', 12, -8, 9);
      s.say(A, 'Shrinky-dink!');
      await s.anim(w, [K(0, 0, -20), K(0, -2, 25), K(0, 0, -30)], 450);
      const beam = s.beam(AX + 16, HEAD - 8, VX - 3, MID - 2, 'beam-rainbow');
      s.sfx('shrink');
      s.mood(V, 'shock');
      await s.fx(V, [K(0, 0, 0, 1), K(0, 0, 0, 0.3)], 900, 'ease-in');
      beam.remove();
      s.bubble('eek!', VX, 70, 800);
      await s.turn(V, 150);
      s.sfx('squeak');
      await s.go(V, [K(0, 0), K(5, -3), K(10, 0), K(15, -3), K(20, 0), K(25, -3), K(34, 0)], 700, 'linear');
    },
  },

  // ---------- Rook: a castle full of gadgets ----------
  rp: {
    title: 'Pie Launcher!',
    async run(s, A, V) {
      const pie = s.prop('🥧', AX, GROUND - SIZE + 5, 9);
      s.say(A, 'Pie time!');
      await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.1, 0.82)], 350);
      s.sfx('boing');
      void s.fx(A, [K(0, 0, 0, 1.1, 0.82), K(0, 0, 0, 0.95, 1.1), K(0, 0, 0, 1, 1)], 300);
      await s.anim(pie, [K(0, 0, 0), at(0.5, K(24, -26, 200), 'ease-in'), K(VX - AX - 2, 8, 360)], 700, 'ease-out');
      pie.remove();
      s.sfx('splat');
      s.pow('SPLAT!', VX, 40, { color: '#fff' });
      s.burst(VX, HEAD + 2, ['⚪', '🤍'], { n: 8, dist: 12, size: 3 });
      s.hold(V, '', 0, -5, 15, 'cream');
      await s.fx(V, wiggle(5), 400);
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0), K(0, 0, -15), K(0, -6, 30), K(0, 0, 90)], 600, 'ease-in');
      s.sfx('thud');
      await s.go(V, [K(0, 0), K(40, 0, 0, 1, 1, 1), K(55, 0, 0, 1, 1, 0)], 700, 'ease-in');
    },
  },
  rn: {
    title: 'Cannon Boom!',
    async run(s, A, V) {
      const can = s.hold(A, '', 12, 2, 12, 'cannon');
      s.sfx('clunk');
      await s.anim(can, [K(-6, 0, 0, 0.2, 1), K(0, 0, 0, 1, 1)], 300);
      s.say(A, 'Ready… FIRE!', 800);
      await s.wait(600);
      s.sfx('boom');
      s.shake(2);
      s.burst(AX + 20, MID, ['💨'], { n: 4, dist: 7 });
      void s.go(A, [K(0, 0), K(-5, 0), K(0, 0)], 300);
      const ball = s.prop('', AX + 20, MID - 2, 5, 'ball');
      await s.anim(ball, [K(0, 0), K(VX - AX - 26, -2)], 250, 'linear');
      ball.remove();
      s.flash('#fff3b0');
      s.pow('BOOM!', VX, 42);
      s.burst(VX, MID, ['💥', '⭐'], { n: 6, dist: 14 });
      s.addClass(V, 'sooty');
      s.mood(V, 'shock');
      await s.wait(450);
      s.say(V, '*cough cough*');
      s.sfx('cough');
      s.burst(VX, HEAD - 10, ['💨'], { n: 3, dist: 8 });
      await s.wait(700);
      s.sfx('creak');
      await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 500, 'ease-in');
      s.sfx('thud');
      s.dust(VX + 12, GROUND, 6);
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 0, 0, 1, 1, 0)], 350);
    },
  },
  rb: {
    title: 'Battering Ram!',
    async run(s, A, V) {
      s.hold(A, '', 15, 3, 14, 'ram');
      s.say(A, 'Coming through!');
      await s.go(A, [K(0, 0), K(-8, 0)], 350);
      s.sfx('rumble');
      await s.go(A, [K(-8, 0), K(26, 0)], 280, 'ease-in');
      s.sfx('boing');
      s.pow('BOING!', VX - 6, 44);
      s.mood(V, 'dizzy');
      s.later(300, () => {
        s.sfx('bonk');
        s.pow('BONK!', 86, 38, { size: 6 });
      });
      s.later(620, () => {
        s.sfx('bonk');
        s.pow('BINK!', 70, 8, { size: 6 });
      });
      void s.go(A, [K(26, 0), K(0, 0)], 500);
      await s.go(V, [K(0, 0, 0), at(0.33, K(12, -22, 140)), at(0.66, K(-4, -50, 300)), K(-30, -100, 480)], 1000, 'linear');
    },
  },
  rr: {
    title: 'Tower Sumo!',
    async run(s, A, V) {
      s.prop('', 50, GROUND + 1, 70, 'ring');
      s.pow('SUMO!', 50, 34, { color: '#ff7a00', rot: 0 });
      s.sfx('thud');
      void s.go(A, [K(0, 0), K(0, -6), K(0, 0)], 300);
      await s.go(V, [K(0, 0), K(0, -6), K(0, 0)], 300);
      s.sfx('thud');
      s.shake(1);
      await s.wait(200);
      void s.go(A, [K(0, 0), K(15, 0)], 300, 'ease-in');
      await s.go(V, [K(0, 0), K(-15, 0)], 300, 'ease-in');
      s.sfx('clunk');
      s.mood(A, 'angry');
      s.mood(V, 'angry');
      s.sfx('rumble');
      void s.go(A, [K(15, 0), K(10, 0), K(16, 0), K(11, 0), K(15, 0)], 800);
      await s.go(V, [K(-15, 0), K(-20, 0), K(-14, 0), K(-19, 0), K(-15, 0)], 800);
      s.say(A, 'HUP!', 700);
      s.mood(V, 'shock');
      void s.go(A, [K(15, 0), K(34, 0)], 400, 'ease-in');
      await s.go(V, [K(-15, 0), K(4, 0), K(18, 0, 10)], 400, 'ease-in');
      s.sfx('slideDown');
      await s.go(V, [K(18, 0, 10), K(28, 6, 40), K(40, 45, 90, 1, 1, 0.2)], 700, 'ease-in');
      s.mood(A, 'happy');
      await s.go(A, [K(34, 0), K(0, 0)], 450);
    },
  },
  rq: {
    title: 'Mega Weight!',
    async run(s, A, V) {
      s.say(A, 'Special delivery!');
      const w1 = s.prop('10<br>TON', VX, -12, 11, 'weight');
      s.sfx('whistle');
      await s.wait(250);
      s.mood(V, 'shock');
      void s.go(V, [K(0, 0), K(-8, -12), K(-16, 0)], 350);
      await s.anim(w1, [K(0, 0), K(0, GROUND - 6 + 12)], 450, 'ease-in');
      s.sfx('thud');
      s.shake(2);
      s.dust(VX, GROUND, 5);
      s.mood(V, 'happy');
      s.say(V, 'Missed me!');
      await s.wait(700);
      const w2 = s.prop('10<br>TON', VX - 16, -12, 11, 'weight');
      s.sfx('whistle');
      await s.wait(250);
      s.mood(V, 'shock');
      await s.anim(w2, [K(0, 0), K(0, GROUND - 6 + 12)], 380, 'ease-in');
      s.sfx('squish');
      s.shake(3);
      s.pow('CLONK!', VX - 16, 38);
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.55, 0.12)], 100);
      void s.anim(w2, [K(0, GROUND - 6 + 12), K(0, -20)], 500, 'ease-in');
      await s.anim(w1, [K(0, GROUND - 6 + 12), K(0, -20)], 500, 'ease-in');
      s.sfx('whoosh');
      await s.go(V, [K(-16, 0, 0), K(-14, -8, 90), K(70, -20, 900)], 900, 'ease-in');
    },
  },

  // ---------- Queen: the most powerful piece, with super powers ----------
  qp: {
    title: 'Tornado Twirl!',
    async run(s, A, V) {
      s.say(A, 'Twirl time!');
      s.sfx('whirl');
      await s.fx(A, spin(3), { duration: 600, easing: 'linear' });
      const t = s.prop('🌪️', AX + 14, MID - 6, 20);
      void s.anim(t.firstElementChild as HTMLElement, [{ transform: 'translate(-50%,-50%) skewX(-8deg)' }, { transform: 'translate(-50%,-50%) skewX(8deg)' }], { duration: 200, iterations: Infinity, direction: 'alternate' });
      s.sfx('whoosh');
      await s.anim(t, [K(0, 0, 0, 0.2), K(VX - AX - 14, 0, 0, 1.2)], 700);
      s.mood(V, 'dizzy');
      s.say(V, 'Wheeee!');
      s.sfx('whirl');
      void s.fx(V, spin(6), { duration: 1100, easing: 'linear' });
      void s.anim(t, [K(VX - AX - 14, 0, 0, 1.2), K(VX - AX - 10, -90, 0, 1.2)], { duration: 900, delay: 300, easing: 'ease-in' });
      await s.go(V, [K(0, 0, 0, 1), K(-4, -15, 0, 0.8), K(4, -35, 0, 0.6), K(-5, -60, 0, 0.4), K(8, -100, 0, 0.2)], 1200, 'ease-in');
    },
  },
  qn: {
    title: 'Thunder Zap!',
    async run(s, A, V) {
      s.say(A, 'Thunder time!');
      await s.fx(A, [K(0, 0, 0, 1, 1), K(0, -3, 0, 1, 1.1)], 300);
      const cloud = s.prop('☁️', VX, 22, 20, 'storm');
      await s.anim(cloud, [K(0, -10, 0, 0.5, 0.5, 0), K(0, 0, 0, 1)], 400);
      s.sfx('rumble');
      await s.wait(400);
      const bolt = s.prop('⚡', VX, 44, 16);
      s.flash('#fffbe0', 200);
      s.later(160, () => s.flash('#fffbe0', 200));
      s.sfx('zap');
      s.addClass(V, 'zapped');
      s.mood(V, 'shock');
      s.pow('BZZZT!', VX, 34, { color: '#ffd000' });
      await s.fx(V, [K(-1, 0), K(1, 0), K(-1, 0), K(1, 0)], { duration: 80, iterations: 9, easing: 'linear' });
      bolt.remove();
      s.sfx('fizzle');
      s.burst(VX, MID, ['⚡', '✨'], { n: 12, dist: 24 });
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, -4, 0, 0.2, 1.3, 0)], 400);
      await s.anim(cloud, [K(0, 0, 0, 1), K(20, -10, 0, 0.6, 0.6, 0)], 500);
    },
  },
  qb: {
    title: 'Ice Blast!',
    async run(s, A, V) {
      s.say(A, 'Chill out!');
      s.sfx('freeze');
      s.stream(['❄️'], AX + 14, HEAD - 2, VX, MID - 4, 9, 70, 5, 5);
      await s.wait(500);
      const ice = s.hold(V, '', 0, 1, 26, 'icecube');
      s.addClass(V, 'frozen');
      s.mood(V, 'shock');
      await s.anim(ice, [K(0, 0, 0, 0), K(0, 0, 0, 1.08), K(0, 0, 0, 1)], 350);
      s.pow('BRRR!', VX, 36, { color: '#3ec1ff' });
      await s.wait(500);
      await s.go(A, [K(0, 0), K(22, 0)], 350);
      s.say(A, 'Flick!', 600);
      s.sfx('clang');
      void s.fx(A, [K(0, 0, 0), K(0, 0, 12), K(0, 0, 0)], 250);
      s.sfx('slideDown');
      void s.go(A, [K(22, 0), K(0, 0)], 500);
      await s.go(V, [K(0, 0), K(60, 0)], 1000, 'cubic-bezier(.3,.6,.4,1)');
    },
  },
  qr: {
    title: 'Super Punch!',
    async run(s, A, V) {
      s.say(A, 'Wind up…');
      await s.fx(A, [K(0, 0, 0), K(0, 0, -12)], 400);
      const spring = s.hold(A, '', 8, 0, 30, 'spring');
      const glove = s.hold(A, '🥊', 10, 0, 11, 'glove');
      s.sfx('boing');
      void s.fx(A, [K(0, 0, -12), K(0, 0, 4), K(0, 0, 0)], 250);
      void s.anim(spring, [{ transform: 'scaleX(0.02)' }, { transform: 'scaleX(1)' }], 170, 'ease-out');
      await s.anim(glove, [K(0, 0), K(30, 0)], 170, 'ease-out');
      s.sfx('punch');
      s.flash();
      s.shake(3);
      s.pow('POW!', VX - 4, 42, { size: 13 });
      s.mood(V, 'shock');
      void s.go(V, [K(0, 0, 0), K(42, -12, -40)], 350, 'ease-out');
      await s.wait(250);
      void s.anim(spring, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.02)' }], 250);
      await s.anim(glove, [K(30, 0), K(0, 0)], 250);
      await s.wait(350);
      s.sfx('crash');
      s.pow('CRASH!', 88, 28, { size: 6, rot: 14 });
      s.burst(96, 40, ['⭐', '💫'], { n: 5, dist: 10 });
      await s.wait(500);
    },
  },
  qq: {
    title: 'Dance-Off!',
    async run(s, A, V) {
      s.pow('DANCE-OFF!', 50, 34, { color: '#ff5fa2', rot: 0, dur: 1200 });
      s.sfx('music');
      s.stream(['🎵', '🎶'], 50, GROUND - 4, 50, 20, 6, 180, 14, 5);
      s.mood(A, 'happy');
      await s.fx(A, [K(0, 0, -10), K(0, -4, 0), K(0, 0, 10), K(0, -4, 0), K(0, 0, -10), K(0, 0, 0)], 700);
      s.mood(V, 'happy');
      await s.fx(V, [K(0, 0, 10), K(0, -4, 0), K(0, 0, -10), K(0, -4, 0), K(0, 0, 10), K(0, 0, 0)], 700);
      s.say(A, 'Ta-daa!');
      s.sfx('sparkle');
      s.burst(AX, HEAD, ['✨', '⭐'], { n: 10, dist: 16 });
      void s.go(A, [K(0, 0), K(0, -12), K(0, 0)], 600);
      await s.fx(A, spin(4), { duration: 600, easing: 'linear' });
      s.say(V, 'My turn! Whoa-oa…');
      s.mood(V, 'dizzy');
      const banana = s.prop('🍌', VX + 8, GROUND - 2, 7);
      void s.fx(V, spin(6), { duration: 700, easing: 'linear' });
      await s.go(V, [K(0, 0), K(-4, 0), K(4, 0), K(8, 0)], 700);
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0), K(0, -10, -30), K(0, 0, 95)], 450, 'ease-in');
      s.sfx('thud');
      void s.anim(banana, [K(0, 0, 0), K(-10, -20, 360, 1, 1, 0)], 600);
      await s.go(V, [K(8, 0, 0, 1, 1, 1), K(55, 0, 0, 1, 1, 0.2)], 700, 'ease-in');
    },
  },

  // ---------- King: royal orders ----------
  kp: {
    title: 'Belly Bump!',
    async run(s, A, V) {
      s.say(A, 'Make way!');
      s.sfx('royal');
      void s.fx(A, [K(0, 0, -6), K(0, 0, 6), K(0, 0, -6), K(0, 0, 6), K(0, 0, 0)], 700);
      await s.go(A, [K(0, 0), K(28, 0)], 700);
      await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.18, 0.9), K(0, 0, 0, 1, 1)], 250);
      s.sfx('boing');
      s.pow('BOING!', VX - 6, 44);
      s.mood(V, 'shock');
      s.later(350, () => s.sfx('boing'));
      s.later(650, () => s.sfx('boing'));
      void s.go(A, [K(28, 0), K(0, 0)], 600);
      await s.go(
        V,
        [K(0, 0), at(0.18, K(10, -24, 90), 'ease-in'), at(0.36, K(20, 0, 180), 'ease-out'), at(0.52, K(28, -15, 270), 'ease-in'), at(0.68, K(36, 0, 360), 'ease-out'), at(0.8, K(42, -8, 420), 'ease-in'), K(56, 0, 520, 1, 1, 0)],
        1200,
        'ease-out',
      );
    },
  },
  kn: {
    title: 'Royal Bonk!',
    async run(s, A, V) {
      const sc = s.hold(A, '', 12, -10, 14, 'sceptre');
      s.say(A, 'By royal order…');
      void s.fx(A, [K(0, 0, -6), K(0, 0, 6), K(0, 0, -6), K(0, 0, 0)], 500);
      await s.go(A, [K(0, 0), K(24, 0)], 500);
      await s.anim(sc, [K(0, 0, 0), K(-2, -2, -60)], 250);
      await s.anim(sc, [K(-2, -2, -60), K(4, 2, 80)], 120, 'ease-in');
      s.sfx('bonk');
      s.pow('BONK!', VX, 38);
      s.mood(V, 'dizzy');
      const stars = s.hold(V, '💫', 0, -18, 9);
      void s.anim(stars, [K(0, 0, 0), K(0, 0, 360)], { duration: 600, iterations: 4, easing: 'linear' });
      void s.anim(sc, [K(4, 2, 80), K(0, 0, 0)], 300);
      void s.go(A, [K(24, 0), K(0, 0)], 500);
      await s.fx(V, wiggle(12), 600);
      await s.turn(V);
      s.sfx('wobble');
      await s.go(V, [K(0, 0, 0), K(8, -2, -8), K(14, 0, 8), K(22, -2, -8), K(28, 0, 8), K(40, -2, -8), K(55, 0, 8)], 1400, 'linear');
    },
  },
  kb: {
    title: 'Royal Trapdoor!',
    async run(s, A, V) {
      const lever = s.prop('', AX + 17, GROUND - 5, 10, 'lever');
      const hole = s.prop('', VX, GROUND, 26, 'hole');
      hole.style.transform = 'scaleX(0)';
      s.say(A, 'Goodbye, Bishop!');
      await s.wait(700);
      s.sfx('clunk');
      await s.anim(lever.firstElementChild as HTMLElement, [{ transform: 'translate(-50%,-100%) rotate(-35deg)' }, { transform: 'translate(-50%,-100%) rotate(35deg)' }], 250);
      await s.anim(hole, [K(0, 0, 0, 0, 1), K(0, 0, 0, 1, 1)], 250, 'ease-out');
      s.mood(V, 'shock');
      s.say(V, 'Uh-oh!', 600);
      await s.wait(500);
      s.sfx('slideDown');
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 18, 0, 0.6, 0.6, 0)], 500, 'ease-in');
      s.pow('WHOOSH!', VX, 50, { size: 6 });
      await s.wait(250);
      s.sfx('clunk');
      await s.anim(hole, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0, 1)], 250);
    },
  },
  kr: {
    title: 'Crown Boomerang!',
    async run(s, A, V) {
      s.say(A, 'Catch, Rook!');
      const crown = s.prop('👑', AX, GROUND - SIZE + 3, 9);
      await s.anim(crown, [K(0, 0), K(0, -6)], 250);
      s.sfx('whirl');
      s.later(450, () => {
        s.sfx('bonk');
        s.pow('STRIKE!', VX, 34, { color: '#ffb400' });
        s.mood(V, 'dizzy');
        void s.fx(V, [K(0, 0, 0), K(0, 0, 18), K(0, 0, -10), K(0, 0, 92)], 600, 'ease-in');
      });
      s.later(1050, () => s.sfx('thud'));
      await s.anim(crown, [K(0, -6, 0), at(0.25, K(24, -18, 360)), at(0.45, K(VX - AX, -6, 720)), at(0.7, K(26, 14, 1080)), K(0, -6, 1440)], 1100, 'linear');
      await s.anim(crown, [K(0, -6), K(0, 0, 0, 0.5, 0.5, 0)], 200);
      s.sfx('royal');
      await s.go(V, [K(0, 0, 0), K(50, 0, 0, 1, 1, 0)], 700, 'ease-in');
    },
  },
  kq: {
    title: 'Trumpet Blast!',
    async run(s, A, V) {
      const t = s.hold(A, '🎺', 12, -5, 11, 'flipx');
      s.say(A, 'Toot toot!');
      await s.anim(t, [K(0, 0, 0), K(0, -2, -10)], 250);
      s.sfx('fanfare');
      s.stream(['🎵', '🎶'], AX + 18, HEAD - 6, VX + 10, HEAD - 2, 10, 90, 6, 6);
      s.mood(V, 'shock');
      s.say(V, 'Too loud!');
      await s.fx(V, [K(0, 0, 0), K(0, 0, 12), K(0, 0, 8), K(0, 0, 15)], 900);
      for (let i = 0; i < 4; i++) {
        const line = s.prop('', 42, HEAD - 8 + i * 6, 12, 'windline');
        void s.anim(line, [K(0, 0, 0, 0.3, 1, 0), at(0.3, K(10, 0, 0, 1, 1, 1)), K(50, 0, 0, 1, 1, 0)], { duration: 600, delay: i * 80 }).then(() => line.remove());
      }
      s.sfx('whoosh');
      await s.go(V, [K(0, 0, 0), K(20, -10, 40), K(55, -30, 160, 1, 1, 0)], 700, 'ease-in');
      await s.wait(200);
    },
  },
};

export function battleFor(attacker: PieceSymbol, victim: PieceSymbol): Battle {
  return BATTLES[attacker + victim] ?? BATTLES[`${attacker}p`];
}

export interface BattleOptions {
  theme: Theme;
  tl: Timeline;
  origin?: { x: number; y: number }; // where the arena opens from, % of the host
  beforeReveal?: () => void; // called just before the arena fades out
}

/** Play the battle for `attacker` capturing `victim` over `host`. Tap to skip. */
export async function playBattle(
  host: HTMLElement,
  attacker: { type: PieceSymbol; color: Color },
  victim: { type: PieceSymbol; color: Color },
  { theme, tl, origin = { x: 50, y: 50 }, beforeReveal }: BattleOptions,
): Promise<void> {
  const s = new Stage(tl, theme);
  const battle = battleFor(attacker.type, victim.type);
  const A = s.fighter(attacker.type, attacker.color, AX, 1);
  const V = s.fighter(victim.type, victim.color, VX, -1);
  s.A = A;
  s.V = V;
  const team = (c: Color) => (theme.id === 'classic' ? (c === 'w' ? 'White' : 'Black') : theme[c].name);
  const banner = document.createElement('div');
  banner.className = 'bt-banner';
  banner.innerHTML = `<b></b><small></small>`;
  banner.querySelector('b')!.textContent = battle.title;
  banner.querySelector('small')!.textContent = `${team(attacker.color)} ${NAMES[attacker.type]} vs ${team(victim.color)} ${NAMES[victim.type]}`;
  const skip = document.createElement('div');
  skip.className = 'bt-skip';
  skip.textContent = 'Tap to skip ⏩';
  s.root.append(banner, skip);
  s.root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    tl.skip();
  });
  host.append(s.root);

  try {
    // Open the arena from the square where the capture happens.
    const o = `${origin.x}% ${origin.y}%`;
    void s.anim(s.root, [{ clipPath: `circle(0% at ${o})` }, { clipPath: `circle(150% at ${o})` }], 450, 'ease-in');
    void s.anim(banner, [K(0, -20), K(0, 2), K(0, 0)], { duration: 450, delay: 150 });
    s.sfx('whoosh');
    void s.go(A, [K(-30, 0), K(0, 0)], 450, 'ease-out');
    await s.go(V, [K(30, 0), K(0, 0)], 450, 'ease-out');
    s.mood(V, 'shock');
    await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.05, 0.93), K(0, 0, 0, 1, 1)], 200);
    s.mood(V, null);

    await battle.run(s, A, V);

    // Victory hop.
    s.mood(A, 'happy');
    s.sfx('tada');
    s.burst(A.cx, HEAD - 6, [theme.spark, '⭐'], { n: 6, dist: 12 });
    await s.go(A, [K(0, 0), K(0, -8), K(0, 0), K(0, -5), K(0, 0)], 600);
  } finally {
    beforeReveal?.();
    await s.anim(s.root, [{ opacity: 1 }, { opacity: 0 }], 250);
    s.root.remove();
  }
}
