// Turns engine output into kid-friendly coaching: move grades, consequence explanations
// ("you lose your knight in 2 moves"), threat warnings and opening names.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { EngineLine } from './engine';

export const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Chance of winning (0-100) for the side whose score this is. Same curve lichess uses. */
export function winPercent(cp: number): number {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export type Grade = 'brilliant' | 'best' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder';

export const GRADE_INFO: Record<Grade, { icon: string; label: string; color: string }> = {
  brilliant: { icon: '‼', label: 'Brilliant', color: '#1bada6' },
  best: { icon: '★', label: 'Best', color: '#5c9e31' },
  good: { icon: '✓', label: 'Good', color: '#77a854' },
  book: { icon: '📖', label: 'Book', color: '#a88865' },
  inaccuracy: { icon: '?!', label: 'Inaccuracy', color: '#e0a800' },
  mistake: { icon: '?', label: 'Mistake', color: '#e58f2a' },
  blunder: { icon: '??', label: 'Blunder', color: '#d23c3c' },
};

/** Grade a move from the win% it threw away. */
export function gradeMove(winLoss: number, isBest: boolean): Grade {
  if (isBest || winLoss <= 2) return 'best';
  if (winLoss < 6) return 'good';
  if (winLoss < 12) return 'inaccuracy';
  if (winLoss < 22) return 'mistake';
  return 'blunder';
}

/** Per-move accuracy (0-100) from win% lost, as chess.com/lichess estimate it. */
export function moveAccuracy(winLoss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669));
}

export function uciToMove(fen: string, uci: string): Move | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

function material(c: Chess, color: Color): number {
  let sum = 0;
  for (const p of c.board().flat()) if (p && p.color === color) sum += VALUES[p.type];
  return sum;
}

function pieceWord(value: number): string {
  if (value >= 9) return 'your queen';
  if (value >= 5) return 'a rook';
  if (value >= 3) return 'a piece';
  if (value >= 2) return 'two pawns';
  return 'a pawn';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Explain what goes wrong after `me` plays into `fenAfter`.
 * `reply` is the engine's best line for the opponent in that position.
 */
export function explainConsequence(fenAfter: string, reply: EngineLine | undefined, me: Color, oppName: string): string {
  if (!reply) return '';
  if (reply.mate !== null && reply.mate > 0) {
    const first = uciToMove(fenAfter, reply.pv[0]);
    return reply.mate === 1
      ? `${oppName} can checkmate you right away with ${first?.san ?? 'their next move'}!`
      : `${oppName} can force checkmate in ${plural(reply.mate, 'move')}! It starts with ${first?.san}.`;
  }
  // Play out the opponent's best line and see how much material you end up losing.
  const c = new Chess(fenAfter);
  const opp: Color = me === 'w' ? 'b' : 'w';
  const startDiff = material(c, me) - material(c, opp);
  let worst = 0;
  let worstPly = 0;
  let firstLoss: Move | null = null;
  for (let i = 0; i < Math.min(reply.pv.length, 8); i++) {
    let m: Move;
    try {
      m = c.move({ from: reply.pv[i].slice(0, 2), to: reply.pv[i].slice(2, 4), promotion: reply.pv[i][4] });
    } catch {
      break;
    }
    if (m.captured && m.color === opp && !firstLoss) firstLoss = m;
    // Only count positions after the opponent's move and your recapture (even ply counts).
    if (i % 2 === 1 || i === reply.pv.length - 1) {
      const loss = startDiff - (material(c, me) - material(c, opp));
      if (loss > worst) {
        worst = loss;
        worstPly = i + 1;
      }
    }
  }
  if (worst >= 1 && firstLoss) {
    const moves = Math.ceil(worstPly / 2);
    const lost = firstLoss.captured && VALUES[firstLoss.captured] >= worst ? `your ${NAMES[firstLoss.captured]}` : pieceWord(worst);
    const how = `${oppName} can play ${firstLoss.san}, taking your ${NAMES[firstLoss.captured!]} on ${firstLoss.to}`;
    return moves <= 1 ? `${how}. You'd lose ${lost}!` : `${how}. You'd lose ${lost} within ${plural(moves, 'move')}.`;
  }
  const first = uciToMove(fenAfter, reply.pv[0]);
  return first ? `This gives ${oppName} a strong reply: ${first.san}.` : '';
}

/** Short description of why the engine's move is good. */
export function explainBest(fen: string, best: EngineLine | undefined): string {
  if (!best) return '';
  const m = uciToMove(fen, best.move);
  if (!m) return '';
  if (best.mate !== null && best.mate > 0) {
    return best.mate === 1 ? `${m.san} is checkmate!` : `${m.san} starts a checkmate in ${best.mate}!`;
  }
  if (m.captured) return `${m.san} wins the ${NAMES[m.captured]} on ${m.to}.`;
  if (m.san.includes('+')) return `${m.san} gives check.`;
  return `A better move was ${m.san}.`;
}

/** Pieces of `color` that can be taken for free or by something cheaper. */
export interface Threat {
  square: Square;
  type: PieceSymbol;
  from: Square; // the cheapest attacker
  by: PieceSymbol;
}

export function threatenedPieces(c: Chess, color: Color): Threat[] {
  const opp: Color = color === 'w' ? 'b' : 'w';
  const out: Threat[] = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const attackers = c
        .attackers(p.square, opp)
        .map((sq) => ({ sq, type: c.get(sq)!.type }))
        .sort((a, b) => VALUES[a.type] - VALUES[b.type]);
      if (attackers.length === 0) continue;
      const cheapest = attackers[0];
      const defended = c.attackers(p.square, color).length > 0;
      if (!defended || VALUES[cheapest.type] < VALUES[p.type]) {
        out.push({ square: p.square, type: p.type, from: cheapest.sq, by: cheapest.type });
      }
    }
  }
  return out.sort((a, b) => VALUES[b.type] - VALUES[a.type]);
}

// ---- opening names ----

let openings: Record<string, [string, string]> | null = null;
let loading: Promise<void> | null = null;

export function loadOpenings(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r) => r.json())
    .then((d) => {
      openings = d;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function openingFor(fen: string): { eco: string; name: string } | null {
  const hit = openings?.[positionKey(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : null;
}

/** Name of the deepest known opening reached in a game (by list of FENs after each ply). */
export function openingOfGame(fens: string[]): { eco: string; name: string; ply: number } | null {
  let found: { eco: string; name: string; ply: number } | null = null;
  fens.forEach((f, i) => {
    const o = openingFor(f);
    if (o) found = { ...o, ply: i + 1 };
  });
  return found;
}
