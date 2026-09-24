import { Chess } from 'chess.js';
import { getEngine } from './engine';

export interface Bot {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  blurb: string;
  // How the bot picks moves:
  depth?: number; // search depth for candidate moves
  multipv?: number; // how many candidate moves to consider
  temperature?: number; // centipawns; higher = more willing to pick worse moves
  randomChance?: number; // chance of playing a completely random legal move
  elo?: number; // use Stockfish's own strength limiter instead
  movetime?: number;
}

export const BOTS: Bot[] = [
  { id: 'sprout', name: 'Sprout', avatar: '🌱', rating: 250, blurb: 'Just learned how the pieces move.',
    depth: 1, multipv: 10, temperature: 400, randomChance: 0.5 },
  { id: 'pip', name: 'Pip the Pawn', avatar: '🐣', rating: 450, blurb: 'Loves pushing pawns. Often forgets about its pieces.',
    depth: 2, multipv: 8, temperature: 250, randomChance: 0.25 },
  { id: 'bella', name: 'Bella Bishop', avatar: '🐰', rating: 650, blurb: 'Knows some tricks, but leaves pieces hanging.',
    depth: 3, multipv: 6, temperature: 150, randomChance: 0.12 },
  { id: 'ned', name: 'Ned the Knight', avatar: '🦊', rating: 850, blurb: 'Watch out for forks!',
    depth: 5, multipv: 5, temperature: 90, randomChance: 0.06 },
  { id: 'rosa', name: 'Rosa Rook', avatar: '🐻', rating: 1050, blurb: 'Solid player. Punishes free pieces.',
    depth: 7, multipv: 4, temperature: 45, randomChance: 0.02 },
  { id: 'quinn', name: 'Queen Quinn', avatar: '🦁', rating: 1350, blurb: 'Club player. Knows her openings.',
    elo: 1350, movetime: 600 },
  { id: 'kasper', name: 'Kasper the King', avatar: '🐉', rating: 1800, blurb: 'Tournament strength. Very tricky.',
    elo: 1800, movetime: 800 },
  { id: 'robo', name: 'Robo Master', avatar: '🤖', rating: 2500, blurb: 'Full power computer. Good luck!',
    elo: 2500, movetime: 1000 },
];

export function botById(id: string): Bot {
  return BOTS.find((b) => b.id === id) ?? BOTS[0];
}

function randomLegalMove(fen: string): string {
  const moves = new Chess(fen).moves({ verbose: true });
  const m = moves[Math.floor(Math.random() * moves.length)];
  return m.from + m.to + (m.promotion ?? '');
}

/** Pick the bot's move in UCI notation. */
export async function botMove(bot: Bot, fen: string): Promise<string> {
  const engine = getEngine();
  const started = Date.now();
  let move: string;

  if (bot.elo) {
    const lines = await engine.analyse(fen, { movetime: bot.movetime, elo: bot.elo });
    move = lines[0]?.move ?? randomLegalMove(fen);
  } else if (Math.random() < (bot.randomChance ?? 0)) {
    move = randomLegalMove(fen);
  } else {
    const lines = await engine.analyse(fen, { depth: bot.depth, multipv: bot.multipv });
    if (lines.length === 0) {
      move = randomLegalMove(fen);
    } else {
      // Softmax over the candidate scores: weaker bots are happy to pick worse moves,
      // but they still take mate-in-one most of the time because its score is huge.
      const best = lines[0].cp;
      const t = bot.temperature ?? 50;
      const weights = lines.map((l) => Math.exp((Math.max(l.cp, best - 2000) - best) / t));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      move = lines[lines.length - 1].move;
      for (let i = 0; i < lines.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          move = lines[i].move;
          break;
        }
      }
    }
  }

  // Don't reply instantly: it feels more like a real opponent.
  const minThink = 400 + Math.random() * 500;
  const elapsed = Date.now() - started;
  if (elapsed < minThink) await new Promise((r) => setTimeout(r, minThink - elapsed));
  return move;
}
