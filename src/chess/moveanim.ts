// How pieces move on the board: every piece type has its own little walk,
// and captures open the battle arena.
import type { Color, PieceSymbol, Square } from 'chess.js';
import type { BoardPiece } from './board';
import { playBattle, type BattleFloor } from './battle';
import { sfx, sounds, type Sfx } from './sound';
import { pieceSrc, type Theme } from './themes';
import { glyph } from './glyphs';
import { tagged, type Timeline } from './timeline';

export interface MoveInfo {
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: string;
  before: string; // FEN before the move
}

export interface MoveContext {
  tl: Timeline;
  board: HTMLElement;
  fxLayer: HTMLElement;
  theme: Theme;
  funMoves: boolean;
  battles: boolean;
  arena: boolean; // battles in the cartoon arena instead of on the board
  sounds: boolean; // play the plain move and capture sounds
  squares: HTMLElement; // the board's squares (copied to stand the battle on)
  xy: (sq: Square) => [number, number]; // board grid position (0..7), orientation aware
  pieceEl: (sq: Square) => HTMLElement | null;
}

type Pt = [number, number];

/** Board pieces from the placement part of a FEN. */
export function fenPieces(fen: string): (BoardPiece | null)[][] {
  return fen.split(' ')[0].split('/').map((row) => {
    const out: (BoardPiece | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push({ type: ch.toLowerCase() as PieceSymbol, color: ch === ch.toUpperCase() ? 'w' : 'b' });
    }
    return out;
  });
}


/** Sound effects stay quiet once the animation has been skipped. */
const snd = (ctx: MoveContext, name: Sfx) => {
  if (ctx.sounds && !ctx.tl.skipped) sfx[name]();
};

/** A board piece transform: position in squares, plus rotation and scale. */
const buildP = ([x, y, r, sx, sy, o]: number[]): Keyframe => ({
  transform: `translate(${x * 100}%, ${y * 100}%) rotate(${r}deg) scale(${sx}, ${sy})`,
  opacity: Math.max(0, Math.min(1, o)),
});
const P = (x: number, y: number, r = 0, sx = 1, sy = sx, o = 1): Keyframe => tagged([x, y, r, sx, sy, o], buildP);
const xyOf = ([x, y]: Pt) => ({ x, y });
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A particle on the board (emoji or dust), at square coordinates. */
function particle(ctx: MoveContext, content: string, at: Pt, frames: Keyframe[], dur: number, size = 0.45, cls = '') {
  const el = document.createElement('div');
  el.className = `fx-p ${cls}`;
  el.style.left = `${(at[0] + 0.5) * 12.5}%`;
  el.style.top = `${(at[1] + 0.5) * 12.5}%`;
  el.style.fontSize = `${(ctx.board.clientWidth / 8) * size}px`;
  el.innerHTML = `<span>${glyph(content)}</span>`;
  ctx.fxLayer.append(el);
  void ctx.tl.anim(el, frames, { duration: dur, easing: 'ease-out' }).then(() => el.remove());
}

const buildOff = ([dx, dy, r, s, o]: number[]): Keyframe => ({
  transform: `translate(${dx}em, ${dy}em) rotate(${r}deg) scale(${s})`,
  opacity: Math.max(0, Math.min(1, o)),
});
const off = (dx: number, dy: number, r = 0, s = 1, o = 1): Keyframe => tagged([dx, dy, r, s, o], buildOff);

function sparkles(ctx: MoveContext, at: Pt, n = 6, char = ctx.theme.spark) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    particle(ctx, char, at, [off(0, 0, 0, 0.3), off(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 120, 1, 0)], 600, 0.32);
  }
}

function dust(ctx: MoveContext, at: Pt, n = 4) {
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 0.7;
    particle(ctx, '', [at[0], at[1] + 0.35], [off(0, 0, 0, 0.3), off(dx, -0.4, 0, 1.2, 0)], 500, 0.3, 'fx-dust');
  }
}

// ---- one walk per piece ----

type Mover = (ctx: MoveContext, el: HTMLElement, a: Pt, b: Pt) => Promise<void>;

/** Pawn: brave little hops, two per square. */
const pawnHop: Mover = (ctx, el, a, b) => {
  const hops = Math.max(2, Math.round(dist(a, b) * 2));
  const frames: Keyframe[] = [];
  for (let i = 0; i <= hops; i++) {
    const [x, y] = lerp(a, b, i / hops);
    frames.push({ ...P(x, y, 0, 1.08, 0.9), offset: i / hops });
    if (i < hops) {
      const [mx, my] = lerp(a, b, (i + 0.5) / hops);
      frames.push({ ...P(mx, my - 0.25, 0, 0.94, 1.08), offset: (i + 0.5) / hops });
    }
  }
  frames[frames.length - 1] = { ...P(b[0], b[1]), offset: 1 };
  const dur = hops * 150;
  for (let i = 0; i < hops; i++) ctx.tl.later(i * 150, () => sfx.hop());
  return ctx.tl.anim(el, frames, { duration: dur, easing: 'linear' });
};

/** Knight: a big galloping leap through the air. */
const knightLeap: Mover = async (ctx, el, a, b) => {
  const [mx, my] = lerp(a, b, 0.5);
  const lean = b[0] >= a[0] ? 1 : -1;
  snd(ctx, 'gallop');
  await ctx.tl.anim(el, [
    { ...P(a[0], a[1]), offset: 0 },
    { ...P(a[0], a[1] + 0.05, 0, 1.12, 0.84), offset: 0.14 },
    { ...P(mx, my - 0.5, -14 * lean, 1.45), offset: 0.55 },
    { ...P(b[0], b[1], 8 * lean, 1.12, 0.86), offset: 0.88 },
    { ...P(b[0], b[1]), offset: 1 },
  ], { duration: 620, easing: 'ease-in-out' });
  snd(ctx, 'thud');
  dust(ctx, b);
};

/** Bishop: a magical glide that leaves sparkles behind. */
const bishopGlide: Mover = async (ctx, el, a, b) => {
  const d = dist(a, b);
  const dur = 300 + d * 100;
  const [mx, my] = lerp(a, b, 0.5);
  snd(ctx, 'glide');
  const steps = Math.max(2, Math.round(d * 2));
  for (let i = 0; i < steps; i++) {
    ctx.tl.later((i / steps) * dur, () => {
      const p = lerp(a, b, i / steps);
      particle(ctx, ctx.theme.spark, [p[0], p[1] + 0.1], [off(0, 0, 0, 0.6), off(0, 0.4, 90, 1.1, 0)], 700, 0.28);
    });
  }
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(mx, my - 0.18, b[0] > a[0] ? 10 : -10, 1.08), offset: 0.5 }, P(b[0], b[1])], { duration: dur, easing: 'ease-in-out' });
};

/** Rook: revs up like a tank, zooms in a straight line and lands with a THUD. */
const rookRumble: Mover = async (ctx, el, a, b) => {
  const horizontal = a[1] === b[1];
  const [sx, sy] = horizontal ? [1.18, 0.88] : [0.88, 1.15];
  snd(ctx, 'rumble');
  await ctx.tl.anim(el, [P(a[0], a[1]), P(a[0] - 0.03, a[1]), P(a[0] + 0.03, a[1]), P(a[0] - 0.03, a[1]), P(a[0], a[1])], { duration: 220, easing: 'linear' });
  const [nx, ny] = lerp(a, b, 0.85);
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(nx, ny, 0, sx, sy), offset: 0.8 }, P(b[0], b[1])], { duration: 180 + dist(a, b) * 45, easing: 'ease-in' });
  snd(ctx, 'thud');
  dust(ctx, b, 5);
  void ctx.tl.anim(el, [P(b[0], b[1], 0, 1.1, 0.88), P(b[0], b[1])], { duration: 180, easing: 'ease-out' });
};

/** Queen: vanishes in a twirl and pops up where she wants to be. */
const queenTeleport: Mover = async (ctx, el, a, b) => {
  snd(ctx, 'teleport');
  sparkles(ctx, a, 6);
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(a[0], a[1] - 0.15, 180, 1.15), offset: 0.35 }, P(a[0], a[1], 540, 0, 0)], { duration: 300, easing: 'ease-in' });
  await ctx.tl.anim(el, [P(b[0], b[1], 0, 0, 0, 0)], { duration: 70 });
  snd(ctx, 'appear');
  sparkles(ctx, b, 8);
  await ctx.tl.anim(el, [P(b[0], b[1], -360, 0, 0), { ...P(b[0], b[1], -40, 1.3), offset: 0.7 }, P(b[0], b[1])], { duration: 300, easing: 'ease-out' });
};

/** King: a slow, royal waddle. */
const kingWaddle: Mover = (ctx, el, a, b) => {
  const steps = Math.max(3, Math.round(dist(a, b) * 3));
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = lerp(a, b, i / steps);
    const r = i === 0 || i === steps ? 0 : i % 2 ? 11 : -11;
    frames.push(P(x, y - (i % 2 ? 0.08 : 0), r));
  }
  snd(ctx, 'royal');
  return ctx.tl.anim(el, frames, { duration: steps * 170, easing: 'ease-in-out' });
};

// ---- second and third walks, picked at random so moves don't get boring ----

/** Pawn: marches like a toy soldier, rocking left and right. */
const pawnMarch: Mover = (ctx, el, a, b) => {
  const steps = Math.max(3, Math.round(dist(a, b) * 3));
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = lerp(a, b, i / steps);
    const r = i === 0 || i === steps ? 0 : i % 2 ? 8 : -8;
    frames.push(P(x, y - (i % 2 ? 0.06 : 0), r));
  }
  for (let i = 0; i < steps; i++) ctx.tl.later(i * 130, () => snd(ctx, 'step'));
  return ctx.tl.anim(el, frames, { duration: steps * 130, easing: 'linear' });
};

/** Pawn: one happy skip that ends in a twirl. */
const pawnSkip: Mover = async (ctx, el, a, b) => {
  const [mx, my] = lerp(a, b, 0.5);
  snd(ctx, 'hop');
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(mx, my - 0.35, 0, 1.22), offset: 0.5 }, { ...P(b[0], b[1], 0, 1.1, 0.9), offset: 0.8 }, P(b[0], b[1])], { duration: 460, easing: 'ease-in-out' });
  snd(ctx, 'pop');
  sparkles(ctx, b, 5);
  await ctx.tl.anim(el, [P(b[0], b[1], 0), P(b[0], b[1], 360)], { duration: 300, easing: 'ease-out' });
};

/** Knight: trots along the actual L of its move, with little gallop bounces. */
const knightTrot: Mover = async (ctx, el, a, b) => {
  const corner: Pt = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) ? [a[0], b[1]] : [b[0], a[1]];
  const leg = (p: Pt, q: Pt, n: number): Keyframe[] =>
    Array.from({ length: n * 2 + 1 }, (_, i) => {
      const [x, y] = lerp(p, q, i / (n * 2));
      return P(x, y - (i % 2 ? 0.2 : 0), i % 2 ? -6 : 0);
    });
  snd(ctx, 'gallop');
  await ctx.tl.anim(el, leg(a, corner, Math.max(1, Math.round(dist(a, corner) * 1.5))), { duration: 380, easing: 'linear' });
  dust(ctx, corner, 3);
  snd(ctx, 'gallop');
  await ctx.tl.anim(el, leg(corner, b, Math.max(1, Math.round(dist(corner, b) * 1.5))), { duration: 280, easing: 'linear' });
  snd(ctx, 'thud');
};

/** Knight: a showy leap with a full somersault. */
const knightFlip: Mover = async (ctx, el, a, b) => {
  const [mx, my] = lerp(a, b, 0.5);
  const dir = b[0] >= a[0] ? -1 : 1;
  snd(ctx, 'whoosh');
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(mx, my - 0.55, dir * 180, 1.4), offset: 0.5 }, { ...P(b[0], b[1], dir * 360, 1.1, 0.88), offset: 0.88 }, P(b[0], b[1], dir * 360)], { duration: 640, easing: 'ease-in-out' });
  snd(ctx, 'thud');
  dust(ctx, b);
  sparkles(ctx, b, 4, '⭐');
};

/** Bishop: ice-skates there in graceful swerves. */
const bishopSkate: Mover = async (ctx, el, a, b) => {
  const d = dist(a, b);
  const n = Math.max(2, Math.round(d * 1.5));
  const [nx, ny] = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  const frames: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const [x, y] = lerp(a, b, i / n);
    const w = i === 0 || i === n ? 0 : (i % 2 ? 0.22 : -0.22);
    frames.push(P(x + nx * w, y + ny * w, w * 60));
  }
  snd(ctx, 'glide');
  for (let i = 0; i < n * 2; i++) {
    ctx.tl.later(i * 80, () => {
      const p = lerp(a, b, i / (n * 2));
      particle(ctx, '❄️', [p[0], p[1] + 0.3], [off(0, 0, 0, 0.5), off(0, 0.2, 0, 0.8, 0)], 500, 0.2);
    });
  }
  await ctx.tl.anim(el, frames, { duration: 260 + d * 110, easing: 'ease-in-out' });
};

/** Bishop: floats up by magic and drifts down onto the square. */
const bishopFloat: Mover = async (ctx, el, a, b) => {
  snd(ctx, 'sparkle');
  await ctx.tl.anim(el, [P(a[0], a[1]), P(a[0], a[1] - 0.25, 0, 1.2)], { duration: 250, easing: 'ease-out' });
  await ctx.tl.anim(el, [P(a[0], a[1] - 0.25, 0, 1.2), P(b[0], b[1] - 0.25, 0, 1.2)], { duration: 200 + dist(a, b) * 90, easing: 'ease-in-out' });
  await ctx.tl.anim(el, [P(b[0], b[1] - 0.25, 0, 1.2), P(b[0], b[1])], { duration: 220, easing: 'ease-in' });
  sparkles(ctx, b, 8);
};

/** Rook: tips over and rolls end over end like a barrel. */
const rookRoll: Mover = async (ctx, el, a, b) => {
  const d = dist(a, b);
  const dir = b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? 1 : -1;
  snd(ctx, 'rumble');
  const turns = Math.max(1, Math.round(d)) * 90 * dir;
  await ctx.tl.anim(el, [P(a[0], a[1], 0), { ...P(lerp(a, b, 0.5)[0], lerp(a, b, 0.5)[1] - 0.1, turns / 2), offset: 0.5 }, P(b[0], b[1], turns)], { duration: 200 + d * 110, easing: 'ease-in-out' });
  await ctx.tl.anim(el, [P(b[0], b[1], turns), P(b[0], b[1], Math.round(turns / 360) * 360)], { duration: 160, easing: 'ease-out' });
  snd(ctx, 'thud');
  dust(ctx, b, 5);
};

/** Rook: giant stomps, one square at a time. The board shakes on every stomp. */
const rookStomp: Mover = async (ctx, el, a, b) => {
  const n = Math.max(1, Math.round(dist(a, b)));
  let p = a;
  for (let i = 1; i <= n; i++) {
    const q = lerp(a, b, i / n);
    await ctx.tl.anim(el, [P(p[0], p[1], 0, 1, 1), { ...P((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.35, 0, 0.95, 1.08), offset: 0.5 }, P(q[0], q[1], 0, 1.12, 0.86)], { duration: 170, easing: 'ease-in' });
    snd(ctx, 'thud');
    dust(ctx, q, 2);
    void ctx.tl.anim(ctx.board, [{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }], { duration: 110, fill: 'none' });
    p = q;
  }
  await ctx.tl.anim(el, [P(b[0], b[1], 0, 1.12, 0.86), P(b[0], b[1])], { duration: 120, easing: 'ease-out' });
};

/** Queen: flies in a big swoop, leaving a trail of hearts. */
const queenSwoop: Mover = async (ctx, el, a, b) => {
  const d = dist(a, b);
  const dur = 380 + d * 70;
  const [mx, my] = lerp(a, b, 0.5);
  const lean = b[0] >= a[0] ? 12 : -12;
  snd(ctx, 'whoosh');
  const n = Math.max(3, Math.round(d * 2));
  for (let i = 0; i < n; i++) {
    ctx.tl.later((i / n) * dur, () => {
      const t = i / n;
      const [x, y] = lerp(a, b, t);
      particle(ctx, '💖', [x, y - Math.sin(t * Math.PI) * (0.6 + d * 0.15)], [off(0, 0, 0, 0.6), off(0, 0.3, 0, 0.9, 0)], 600, 0.25);
    });
  }
  await ctx.tl.anim(el, [P(a[0], a[1]), { ...P(mx, my - 0.3 - d * 0.06, lean, 1.3), offset: 0.5 }, P(b[0], b[1])], { duration: dur, easing: 'ease-in-out' });
  snd(ctx, 'appear');
};

/** Queen: dashes there so fast she leaves afterimages behind. */
const queenDash: Mover = async (ctx, el, a, b) => {
  const img = el as HTMLImageElement;
  snd(ctx, 'teleport');
  const n = Math.max(3, Math.round(dist(a, b) * 1.5));
  for (let i = 0; i < n; i++) {
    const [x, y] = lerp(a, b, i / n);
    const ghost = img.cloneNode() as HTMLImageElement;
    ghost.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    ghost.style.zIndex = '4';
    ghost.style.opacity = '0';
    ctx.fxLayer.append(ghost);
    ctx.tl.later(i * 25, () => void ctx.tl.anim(ghost, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 350, easing: 'ease-out' }).then(() => ghost.remove()));
  }
  await ctx.tl.anim(el, [P(a[0], a[1], 0, 1, 1), { ...P(lerp(a, b, 0.8)[0], lerp(a, b, 0.8)[1], 0, 1.25, 0.85), offset: 0.7 }, P(b[0], b[1])], { duration: 180 + dist(a, b) * 25, easing: 'ease-in' });
  sparkles(ctx, b, 5);
};

/** King: a red carpet rolls out first, then he waddles along it. */
const kingCarpet: Mover = async (ctx, el, a, b) => {
  const carpet = document.createElement('div');
  carpet.className = 'fx-carpet';
  const len = dist(a, b);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  carpet.style.left = `${(a[0] + 0.5) * 12.5}%`;
  carpet.style.top = `${(a[1] + 0.5) * 12.5}%`;
  carpet.style.width = `${len * 12.5}%`;
  carpet.style.transform = `rotate(${ang}deg)`;
  ctx.squares.append(carpet); // under the pieces
  snd(ctx, 'fanfare');
  await ctx.tl.anim(carpet, [{ transform: `rotate(${ang}deg) scaleX(0)` }, { transform: `rotate(${ang}deg) scaleX(1)` }], { duration: 350, easing: 'ease-out' });
  await kingWaddle(ctx, el, a, b);
  void ctx.tl.anim(carpet, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(() => carpet.remove());
};

/** King: bouncy royal hops. */
const kingBounce: Mover = async (ctx, el, a, b) => {
  const hops = Math.max(2, Math.round(dist(a, b) * 2));
  const frames: Keyframe[] = [];
  for (let i = 0; i <= hops; i++) {
    const [x, y] = lerp(a, b, i / hops);
    frames.push({ ...P(x, y, 0, 1.12, 0.86), offset: i / hops });
    if (i < hops) {
      const [mx, my] = lerp(a, b, (i + 0.5) / hops);
      frames.push({ ...P(mx, my - 0.35, 0, 0.94, 1.1), offset: (i + 0.5) / hops });
    }
  }
  frames[frames.length - 1] = { ...P(b[0], b[1]), offset: 1 };
  for (let i = 0; i < hops; i++) ctx.tl.later(i * 200, () => snd(ctx, 'boing'));
  await ctx.tl.anim(el, frames, { duration: hops * 200, easing: 'linear' });
  sparkles(ctx, b, 4, '👑');
};

const slide: Mover = (ctx, el, a, b) => ctx.tl.anim(el, [P(a[0], a[1]), P(b[0], b[1])], { duration: 180, easing: 'ease-out' });

const MOVERS: Record<PieceSymbol, Mover[]> = {
  p: [pawnHop, pawnMarch, pawnSkip],
  n: [knightLeap, knightTrot, knightFlip],
  b: [bishopGlide, bishopSkate, bishopFloat],
  r: [rookRumble, rookRoll, rookStomp],
  q: [queenTeleport, queenSwoop, queenDash],
  k: [kingWaddle, kingCarpet, kingBounce],
};
const pickMover = (t: PieceSymbol) => MOVERS[t][Math.floor(Math.random() * MOVERS[t].length)];

/** Animate a move from the position before it. The board re-renders the final position afterwards. */
export async function animateMove(ctx: MoveContext, m: MoveInfo): Promise<void> {
  const el = ctx.pieceEl(m.from);
  if (!el) return;
  el.style.zIndex = '5';
  const a = ctx.xy(m.from);
  const b = ctx.xy(m.to);
  const capSq = (m.flags.includes('e') ? m.to[0] + m.from[1] : m.to) as Square;
  const victimEl = m.captured ? ctx.pieceEl(capSq) : null;
  const battle = !!m.captured && ctx.battles;
  const move = ctx.funMoves ? pickMover(m.piece) : slide;

  // In a battle the attacker stops just short of its target, then the arena opens.
  let dest = b;
  if (battle) {
    const d = dist(a, b);
    dest = lerp(a, b, Math.max(0, (d - 0.5) / d));
  }
  const moves = [move(ctx, el, a, dest)];

  // Castling: the rook moves too.
  if (m.flags.includes('k') || m.flags.includes('q')) {
    const rank = m.from[1];
    const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
    const rookEl = ctx.pieceEl(`${rf}${rank}` as Square);
    if (rookEl) moves.push((ctx.funMoves ? rookRumble : slide)(ctx, rookEl, ctx.xy(`${rf}${rank}` as Square), ctx.xy(`${rt}${rank}` as Square)));
  }
  await Promise.all(moves);

  if (battle) {
    const origin = { x: (b[0] + 0.5) * 12.5, y: (b[1] + 0.5) * 12.5 };
    const floor: BattleFloor = {
      squares: ctx.squares.cloneNode(true) as HTMLElement,
      target: ctx.xy(capSq),
      attackerTo: b,
      pieces: fenPieces(m.before).flatMap((row, r) =>
        row.flatMap((p, fi): BattleFloor['pieces'] => {
          if (!p) return [];
          const sq = `${'abcdefgh'[fi]}${8 - r}` as Square;
          if (sq === m.from) return [{ ...p, x: dest[0], y: dest[1], role: 'a' }];
          return [{ ...p, ...xyOf(ctx.xy(sq)), role: sq === capSq ? 'v' : undefined }];
        }),
      ),
    };
    await playBattle(
      ctx.board,
      { type: m.piece, color: m.color },
      { type: m.captured!, color: m.color === 'w' ? 'b' : 'w' },
      {
        theme: ctx.theme,
        tl: ctx.tl,
        origin,
        floor: ctx.arena ? undefined : floor,
        beforeReveal: () => {
          victimEl?.remove();
          void ctx.tl.anim(el, [P(b[0], b[1])], 1);
        },
      },
    );
  } else if (m.captured) {
    if (ctx.sounds && !ctx.tl.skipped) sounds.capture();
    if (victimEl) {
      const v = ctx.xy(capSq);
      sparkles(ctx, v, 6);
      void ctx.tl.anim(victimEl, [P(v[0], v[1]), P(v[0], v[1], 90, 1.4, 1.4, 0)], { duration: 250, easing: 'ease-out' });
    }
  } else if (!ctx.funMoves && ctx.sounds && !ctx.tl.skipped) {
    sounds.move();
  }

  if (m.promotion) {
    // Sparkle, and the pawn turns into its new piece.
    snd(ctx, 'tada');
    sparkles(ctx, b, 10, '⭐');
    (el as HTMLImageElement).src = pieceSrc(ctx.theme, m.color, m.promotion);
    await ctx.tl.anim(el, [P(b[0], b[1], 0, 0.3), { ...P(b[0], b[1], 20, 1.45), offset: 0.6 }, P(b[0], b[1])], { duration: 450, easing: 'ease-out' });
  }
}
