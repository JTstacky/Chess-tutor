// "Think ahead" coach: helps a young player plan. On your turn it explains the opponent's last
// move, what they're threatening, and your best candidate moves with a short look-ahead line.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAMES, threatenedPieces, VALUES } from './coach';
import { getEngine } from './engine';

export interface LineStep {
  san: string;
  uci: string;
  mine: boolean; // your move (true) or the opponent's
  text: string;
}

export interface Candidate {
  san: string;
  uci: string;
  grade: 'best' | 'good' | 'risky';
  why: string;
  line: LineStep[]; // the candidate, the likely reply, your follow-up
  mateIn: number | null;
}

export interface ThinkResult {
  last: string | null; // what the opponent's last move did
  threat: { san: string; uci: string; text: string } | null;
  candidates: Candidate[];
}

const HOME: Record<Color, Record<string, string[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'], q: ['d1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'], q: ['d8'] },
};
const CENTRE = ['d4', 'e4', 'd5', 'e5'];

function toMove(c: Chess, uci: string): Move | null {
  try {
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** Enemy pieces the piece on `sq` attacks that are worth going after. */
function targets(c: Chess, sq: Square, color: Color): { square: Square; type: PieceSymbol }[] {
  const opp: Color = color === 'w' ? 'b' : 'w';
  const me = c.get(sq);
  if (!me) return [];
  const out: { square: Square; type: PieceSymbol }[] = [];
  for (const p of c.board().flat()) {
    if (!p || p.color !== opp || p.type === 'k') continue;
    if (!c.attackers(p.square, color).includes(sq)) continue;
    const defended = c.attackers(p.square, opp).length > 0;
    if (!defended || VALUES[p.type] > VALUES[me.type]) out.push({ square: p.square, type: p.type });
  }
  return out;
}

/**
 * Describe a move in kid language, e.g. "takes the bishop on c5 and gives check".
 * `who` is "your" for your own moves or the opponent's name for theirs.
 */
export function describeMove(fenBefore: string, uci: string, who: 'you' | 'them'): string {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  const m = toMove(after, uci);
  if (!m) return '';
  const their = who === 'you' ? 'their' : 'your';
  const own = who === 'you' ? 'your' : 'their';
  const bits: string[] = [];
  if (after.isCheckmate()) return 'checkmate!';
  if (m.captured) bits.push(`takes ${their} ${NAMES[m.captured]} on ${m.to}`);
  if (m.isKingsideCastle() || m.isQueensideCastle()) bits.push(`castles, keeping the king safe`);
  if (m.promotion) bits.push(`turns a pawn into a ${NAMES[m.promotion]}`);
  // Saving a piece that was in danger.
  const danger = threatenedPieces(before, m.color).filter((t) => VALUES[t.type] >= 3);
  const stillDanger = new Set(threatenedPieces(after, m.color).map((t) => t.square as string));
  const saved = danger.find((t) => t.square === m.from || !stillDanger.has(t.square));
  if (saved && !m.captured) {
    bits.push(saved.square === m.from ? `moves ${own} ${NAMES[m.piece]} out of danger` : `protects ${own} ${NAMES[saved.type]} on ${saved.square}`);
  }
  const hits = m.piece === 'k' ? [] : targets(after, m.to, m.color).filter((t) => !targets(before, m.from, m.color).some((x) => x.square === t.square));
  if (hits.length >= 2) bits.push(`forks ${their} ${NAMES[hits[0].type]} and ${NAMES[hits[1].type]}`);
  else if (hits.length === 1) bits.push(`attacks ${their} ${NAMES[hits[0].type]} on ${hits[0].square}`);
  if (after.isCheck()) bits.push('gives check');
  if (!bits.length) {
    if (HOME[m.color][m.piece]?.includes(m.from)) bits.push(`brings a ${NAMES[m.piece]} into the game`);
    else if (m.piece === 'p' && CENTRE.includes(m.to)) bits.push('grabs the centre');
    else if (m.piece === 'p' && ['c4', 'c5', 'f4', 'f5'].includes(m.to)) bits.push('fights for the centre from the side');
    else if (m.piece === 'p') bits.push('pushes a pawn forward to gain space');
    else if (m.piece === 'k') bits.push('moves the king');
    else bits.push(`moves the ${NAMES[m.piece]} to a better square`);
  }
  return bits.slice(0, 2).join(' and ');
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** After your candidate move, would the opponent's threat still work? */
function stopsThreat(fenAfter: string, threatUci: string, mateThreat: boolean, me: Color): boolean {
  const c = new Chess(fenAfter);
  const m = toMove(c, threatUci);
  if (!m) return true; // the threat move isn't even possible any more
  if (mateThreat) return !c.isCheckmate();
  if (!m.captured) return false;
  // Capturing now just loses the capturing piece back (or more).
  return c.attackers(m.to, me).length > 0 && VALUES[m.piece] >= VALUES[m.captured];
}

/** Flip the side to move (a "null move") to see what the opponent wants to do next. */
function nullMoveFen(fen: string): string | null {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const f = parts.join(' ');
  try {
    const c = new Chess(f);
    return c.isGameOver() ? null : f;
  } catch {
    return null;
  }
}

export async function thinkAhead(fen: string, lastUci: string | null, fenBeforeLast: string | null, oppName: string): Promise<ThinkResult> {
  const c = new Chess(fen);
  const engine = getEngine();
  const lines = await engine.analyse(fen, { depth: 12, multipv: 3 });
  const best = lines[0];

  // 1. What did their last move do?
  const last = lastUci && fenBeforeLast ? describeMove(fenBeforeLast, lastUci, 'them') : null;

  // 2. What are they threatening? (Only when you're not in check: then the threat is obvious.)
  let threat: ThinkResult['threat'] = null;
  let mateThreat = false;
  const nf = !c.inCheck() ? nullMoveFen(fen) : null;
  if (nf && best) {
    const [t] = await engine.analyse(nf, { depth: 10 });
    const oppNow = -best.cp; // opponent's score if you play your best move
    if (t && t.pv[0] && (t.cp - oppNow >= 120 || (t.mate !== null && t.mate > 0))) {
      const m = new Chess(nf).move({ from: t.pv[0].slice(0, 2), to: t.pv[0].slice(2, 4), promotion: t.pv[0][4] });
      const text = t.mate !== null && t.mate > 0 && t.mate <= 3
        ? `${oppName} is threatening checkmate${t.mate === 1 ? '' : ` in ${t.mate}`}, starting with ${m.san}!`
        : `${oppName} wants to play ${m.san}, which ${describeMove(nf, t.pv[0], 'them')}.`;
      threat = { san: m.san, uci: t.pv[0], text };
      mateThreat = t.mate !== null && t.mate > 0;
    }
  }

  // 3. Your candidate moves, each with a short look-ahead.
  const candidates: Candidate[] = [];
  for (const l of lines) {
    if (!l?.pv[0]) continue;
    const loss = (best?.cp ?? 0) - l.cp;
    const grade: Candidate['grade'] = loss <= 30 ? 'best' : loss <= 120 ? 'good' : 'risky';
    const t = new Chess(fen);
    const line: LineStep[] = [];
    for (let i = 0; i < Math.min(3, l.pv.length); i++) {
      const before = t.fen();
      const m = toMove(t, l.pv[i]);
      if (!m) break;
      line.push({ san: m.san, uci: l.pv[i], mine: i % 2 === 0, text: describeMove(before, l.pv[i], i % 2 === 0 ? 'you' : 'them') });
    }
    if (!line.length) continue;
    let why = line[0].text;
    if (threat) {
      const after = new Chess(fen);
      toMove(after, l.pv[0]);
      if (stopsThreat(after.fen(), threat.uci, mateThreat, c.turn()) && !/out of danger|protects/.test(why)) {
        why = `stops ${mateThreat ? 'the checkmate threat' : `the threat (${threat.san})`}, and ${why}`;
      }
    }
    candidates.push({
      san: line[0].san,
      uci: l.pv[0],
      grade,
      why: cap(why),
      line,
      mateIn: l.mate !== null && l.mate > 0 ? l.mate : null,
    });
  }
  return { last, threat, candidates };
}

