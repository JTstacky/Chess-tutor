// Post-game review: analyse every position, grade each move and explain the big mistakes.
import { Chess, type Color, type Move } from 'chess.js';
import {
  explainBest,
  explainConsequence,
  gradeMove,
  moveAccuracy,
  NAMES,
  openingFor,
  uciToMove,
  VALUES,
  winPercent,
  type Grade,
} from './coach';
import { getEngine, type EngineLine } from './engine';

export interface MoveReview {
  ply: number; // 1-based
  san: string;
  color: Color;
  grade: Grade;
  winLoss: number;
  bestSan: string | null;
  bestUci: string | null;
  arrowUci: string | null; // green arrow in review: the better move, or how to punish the bot's mistake
  comment: string;
}

export interface GameReview {
  moves: MoveReview[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Partial<Record<Grade, number>>>;
}

const DEPTH = 11;

/** Score for the side to move in `c`, handling finished games. */
function terminalScore(c: Chess): EngineLine | null {
  if (c.isCheckmate()) return { move: '', pv: [], cp: -100000, mate: 0 };
  if (c.isDraw() || c.isStalemate()) return { move: '', pv: [], cp: 0, mate: null };
  return null;
}

export async function reviewGame(
  moves: Move[],
  names: Record<Color, string>,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<GameReview | null> {
  const engine = getEngine();
  const c = new Chess();
  const fens = [c.fen()];
  for (const m of moves) {
    c.move(m.san);
    fens.push(c.fen());
  }
  // lines[i] = best line for the side to move in fens[i]
  const lines: (EngineLine | undefined)[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (isCancelled()) return null;
    const pos = new Chess(fens[i]);
    lines[i] = terminalScore(pos) ?? (await engine.analyse(fens[i], { depth: DEPTH }))[0];
    onProgress(i + 1, fens.length);
  }
  if (isCancelled()) return null;

  const out: MoveReview[] = [];
  const acc: Record<Color, number[]> = { w: [], b: [] };
  const counts: GameReview['counts'] = { w: {}, b: {} };
  let inBook = true;
  moves.forEach((m, i) => {
    const before = lines[i];
    const after = lines[i + 1];
    const beforeWin = winPercent(before?.cp ?? 0);
    const afterWin = 100 - winPercent(after?.cp ?? 0); // after is from the opponent's side
    const winLoss = Math.max(0, beforeWin - afterWin);
    const bestUci = before?.move || null;
    const isBest = bestUci === m.from + m.to + (m.promotion ?? '');
    inBook = inBook && !!openingFor(fens[i + 1]);
    let grade: Grade = inBook ? 'book' : gradeMove(winLoss, isBest);
    if (!inBook && isBrilliant(fens[i], m, winLoss, afterWin)) grade = 'brilliant';
    const opp = names[m.color === 'w' ? 'b' : 'w'];
    let comment = '';
    const bad = grade === 'blunder' || grade === 'mistake' || grade === 'inaccuracy';
    if (bad && opp === 'you') {
      const punish = after?.move ? uciToMove(fens[i + 1], after.move)?.san : null;
      comment = punish ? `A mistake by ${names[m.color]}! You could punish it with ${punish}.` : '';
    } else if (bad) {
      const why = explainConsequence(fens[i + 1], after, m.color, opp);
      const better = explainBest(fens[i], before);
      comment = [why, better].filter(Boolean).join(' ');
    } else if (grade === 'brilliant') {
      comment = `Brilliant! Giving up material here is actually the best move.`;
    } else if (grade === 'book') {
      comment = `A known opening move${openingFor(fens[i + 1]) ? ` (${openingFor(fens[i + 1])!.name})` : ''}.`;
    } else if (m.captured) {
      comment = `Nice, you won a ${NAMES[m.captured]}.`;
    }
    const bestSan = bestUci ? uciToMove(fens[i], bestUci)?.san ?? null : null;
    const arrowUci = opp === 'you' ? after?.move || null : bestUci;
    out.push({ ply: i + 1, san: m.san, color: m.color, grade, winLoss, bestSan, bestUci, arrowUci, comment });
    acc[m.color].push(moveAccuracy(grade === 'book' ? 0 : winLoss));
    counts[m.color][grade] = (counts[m.color][grade] ?? 0) + 1;
  });
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  return { moves: out, accuracy: { w: avg(acc.w), b: avg(acc.b) }, counts };
}

/** A near-best move that leaves a piece where it can be taken for less, while the position stays fine. */
function isBrilliant(fenBefore: string, m: Move, winLoss: number, afterWin: number): boolean {
  if (winLoss > 2 || afterWin < 45 || m.piece === 'p' || m.piece === 'k') return false;
  const c = new Chess(fenBefore);
  c.move(m.san);
  const opp: Color = m.color === 'w' ? 'b' : 'w';
  const attackers = c.attackers(m.to, opp).map((sq) => VALUES[c.get(sq)!.type]);
  if (attackers.length === 0) return false;
  const defended = c.attackers(m.to, m.color).length > 0;
  const gain = m.captured ? VALUES[m.captured] : 0;
  return (!defended || Math.min(...attackers) < VALUES[m.piece]) && VALUES[m.piece] - gain >= 3;
}
