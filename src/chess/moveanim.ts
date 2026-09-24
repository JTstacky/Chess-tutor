// How pieces move on the board: every piece type has its own little walk,
// and captures open the battle arena.
import type { Color, PieceSymbol, Square } from 'chess.js';
import type { BoardPiece } from './board';
import { playBattle, type BattleFloor } from './battle';
import { sfx, sounds, type Sfx } from './sound';
import { pieceSrc, type Theme } from './themes';
import type { Timeline } from './timeline';

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
const P = (x: number, y: number, r = 0, sx = 1, sy = sx, o = 1): Keyframe => ({
  transform: `translate(${x * 100}%, ${y * 100}%) rotate(${r}deg) scale(${sx}, ${sy})`,
  opacity: o,
});
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
  el.innerHTML = `<span>${content}</span>`;
  ctx.fxLayer.append(el);
  void ctx.tl.anim(el, frames, { duration: dur, easing: 'ease-out' }).then(() => el.remove());
}

const off = (dx: number, dy: number, r = 0, s = 1, o = 1): Keyframe => ({
  transform: `translate(${dx}em, ${dy}em) rotate(${r}deg) scale(${s})`,
  opacity: o,
});

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
    { ...P(mx, my - 1.3, -18 * lean, 1.3), offset: 0.55 },
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
  await ctx.tl.anim(ctx.board, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 180, fill: 'none' });
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

const slide: Mover = (ctx, el, a, b) => ctx.tl.anim(el, [P(a[0], a[1]), P(b[0], b[1])], { duration: 180, easing: 'ease-out' });

const MOVERS: Record<PieceSymbol, Mover> = { p: pawnHop, n: knightLeap, b: bishopGlide, r: rookRumble, q: queenTeleport, k: kingWaddle };

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
  const move = ctx.funMoves ? MOVERS[m.piece] : slide;

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
