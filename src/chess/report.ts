// "Why did this opening work?" A kid-friendly report card for a position after the opening:
// development, king safety, centre control, material and the engine's opinion.
import { Chess, type Color, type Square } from 'chess.js';
import { VALUES, winPercent } from './coach';
import { getEngine } from './engine';

export interface ReportItem {
  good: boolean | null; // true = good for you, false = watch out, null = neutral
  icon: string;
  title: string;
  text: string;
}

export interface OpeningReport {
  verdict: string;
  items: ReportItem[];
  winPct: number; // your chance of winning from here, as the engine sees it
}

const CENTRE: Square[] = ['d4', 'e4', 'd5', 'e5'];
const HOME: Record<Color, Record<string, Square[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] },
};

function developed(c: Chess, color: Color): number {
  let n = 0;
  for (const t of ['n', 'b'] as const) {
    const pieces = c.findPiece({ type: t, color });
    n += pieces.filter((sq) => !HOME[color][t].includes(sq)).length;
  }
  return n;
}

function castled(c: Chess, color: Color): boolean {
  const k = c.findPiece({ type: 'k', color })[0];
  const rank = color === 'w' ? '1' : '8';
  return !!k && k[1] === rank && ['g', 'h', 'b', 'c'].includes(k[0]);
}

function centreControl(c: Chess, color: Color): number {
  let n = 0;
  for (const sq of CENTRE) {
    const p = c.get(sq);
    if (p && p.color === color) n++;
    n += c.attackers(sq, color).length;
  }
  return n;
}

function material(c: Chess, color: Color): number {
  return c.board().flat().reduce((s, p) => s + (p && p.color === color ? VALUES[p.type] : 0), 0);
}

const name = (c: Color) => (c === 'w' ? 'White' : 'Black');

export async function openingReport(fen: string, me: Color): Promise<OpeningReport> {
  const c = new Chess(fen);
  const opp: Color = me === 'w' ? 'b' : 'w';
  const items: ReportItem[] = [];

  const [dm, dt] = [developed(c, me), developed(c, opp)];
  items.push({
    good: dm > dt ? true : dm < dt ? false : null,
    icon: '♞',
    title: 'Development',
    text: dm > dt
      ? `You have ${dm} knights and bishops out, ${name(opp)} has only ${dt}. More pieces in the game means more power!`
      : dm === dt
        ? `You both have ${dm} knights and bishops out. Keep bringing pieces out before attacking.`
        : `${name(opp)} has ${dt} pieces out and you have ${dm}. Get your pieces out next!`,
  });

  const [km, kt] = [castled(c, me), castled(c, opp)];
  items.push({
    good: km && !kt ? true : !km && kt ? false : km ? true : null,
    icon: '🏰',
    title: 'King safety',
    text: km && !kt
      ? `Your king is castled and safe, but ${name(opp)}'s king is still in the middle. That's a target!`
      : km
        ? 'Your king is castled and safe behind its pawns.'
        : 'Your king hasn\'t castled yet. Castle soon to keep it safe!',
  });

  const [cm, ct] = [centreControl(c, me), centreControl(c, opp)];
  items.push({
    good: cm > ct ? true : cm < ct ? false : null,
    icon: '🎯',
    title: 'The centre',
    text: cm > ct
      ? `You control the centre more (${cm} vs ${ct}). Pieces in the middle can reach both sides of the board fast.`
      : cm === ct
        ? `The centre is shared (${cm} each). Look for a pawn break like d4 or e4 to win it.`
        : `${name(opp)} controls the centre a bit more (${ct} vs ${cm}). Try to challenge it with a pawn.`,
  });

  const diff = material(c, me) - material(c, opp);
  items.push({
    good: diff > 0 ? true : diff < 0 ? false : null,
    icon: '⚖️',
    title: 'Material',
    text: diff === 0
      ? 'Material is equal.'
      : diff > 0
        ? `You're ${diff} point${diff === 1 ? '' : 's'} ahead in material. Trade pieces to make it count!`
        : `You're ${-diff} point${diff === -1 ? '' : 's'} behind, but a gambit gives you time and activity for it.`,
  });

  const [best] = await getEngine().analyse(fen, { depth: 14 });
  const cpForMe = best ? (c.turn() === me ? best.cp : -best.cp) : 0;
  const winPct = Math.round(winPercent(cpForMe));
  const pawns = (Math.abs(cpForMe) / 100).toFixed(1);
  items.push({
    good: cpForMe > 30 ? true : cpForMe < -30 ? false : null,
    icon: '🤖',
    title: 'Computer says',
    text: Math.abs(cpForMe) > 5000
      ? cpForMe > 0 ? 'You have a winning attack!' : 'Careful, the opponent has a winning attack!'
      : cpForMe > 30
        ? `You're better by about ${pawns} pawns.`
        : cpForMe < -30
          ? `${name(opp)} is better by about ${pawns} pawns.`
          : 'The position is about equal. A great start for a real game!',
  });

  const goods = items.filter((i) => i.good === true).length;
  const bads = items.filter((i) => i.good === false).length;
  const verdict = cpForMe >= -30 && goods > bads && goods >= 2
    ? 'Why this opening worked'
    : cpForMe >= -30
      ? 'How your opening went'
      : 'What to watch out for';
  return { verdict, items, winPct };
}

export function reportHtml(r: OpeningReport, keyIdea?: string): string {
  const rows = r.items
    .map((i) => `<li class="${i.good === true ? 'good' : i.good === false ? 'bad' : ''}"><span>${i.icon}</span><div><b>${i.title}</b>${i.text}</div></li>`)
    .join('');
  return `
    ${keyIdea ? `<p class="key-idea">💡 ${keyIdea}</p>` : ''}
    <ul class="report">${rows}</ul>
    <div class="winbar"><div style="width:${r.winPct}%"></div><span>Your winning chances: ${r.winPct}%</span></div>`;
}
