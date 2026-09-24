// Merges data/puzzles/*.jsonl (from gen-puzzles.mjs) into public/puzzles.json:
// re-checks every move is legal, drops duplicates, and gives each puzzle a stable id.
// Run: node scripts/build-puzzles.mjs [--verify]
//   --verify re-checks every solver move with a deeper Stockfish search and drops any puzzle
//   where the answer isn't clearly the only winning move (results are cached in data/puzzles/verified.json).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const VERIFY = process.argv.includes('--verify');
const CACHE = 'data/puzzles/verified.json';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
let sf;
let buf = '';
let waiter = null;
function analyse(fen, depth = 18) {
  if (!sf) {
    sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js']);
    sf.stdout.on('data', (d) => {
      buf += d;
      if (waiter && buf.includes('bestmove')) { const w = waiter; waiter = null; const o = buf; buf = ''; w(o); }
    });
    sf.stdin.write('uci\nsetoption name MultiPV value 2\n');
  }
  return new Promise((resolve) => {
    buf = '';
    waiter = (o) => {
      const lines = [];
      for (const l of o.split('\n')) {
        if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('bound')) continue;
        const k = Number(/ multipv (\d+)/.exec(l)?.[1] ?? 1) - 1;
        const m = / score mate (-?\d+)/.exec(l);
        const mate = m ? Number(m[1]) : null;
        const cp = mate !== null ? Math.sign(mate || -1) * (100000 - Math.abs(mate)) : Number(/ score cp (-?\d+)/.exec(l)[1]);
        lines[k] = { move: l.split(' pv ')[1].trim().split(/\s+/)[0], cp, mate };
      }
      resolve(lines.filter(Boolean));
    };
    sf.stdin.write(`position fen ${fen}\ngo depth ${depth}\n`);
  });
}

/** Every solver move must still be the engine's choice (or any mate on the final move) and clearly best. */
async function verify(p) {
  const c = new Chess(p.fen);
  const mateIn = Number(p.themes.find((t) => t.startsWith('mateIn'))?.slice(6) ?? 0);
  for (let i = 0; i < p.moves.length; i++) {
    const u = p.moves[i];
    if (i % 2 === 1) {
      const last = i === p.moves.length - 1;
      const [best, second] = await analyse(c.fen());
      if (!best) return false;
      const t = new Chess(c.fen());
      t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!(last && t.isCheckmate())) {
        if (best.move !== u) return false;
        if (second) {
          if (mateIn) { if (second.mate !== null && second.mate > 0 && second.mate <= best.mate) return false; }
          else if (second.cp >= 200 || best.cp - second.cp < 200) return false;
        }
      }
    }
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  }
  return true;
}

const out = [];
const seen = new Set();
let bad = 0;
let rejected = 0;
for (const f of readdirSync('data/puzzles').filter((f) => f.endsWith('.jsonl')).sort()) {
  for (const line of readFileSync(`data/puzzles/${f}`, 'utf8').split('\n').filter(Boolean)) {
    const p = JSON.parse(line);
    const c = new Chess(p.fen);
    try {
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      bad++;
      continue;
    }
    // Same position after the opponent's move = same puzzle.
    const t = new Chess(p.fen);
    t.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
    const key = t.fen().split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const id = p.id ?? createHash('sha1').update(key).digest('hex').slice(0, 8);
    // Lichess puzzles are already verified by lichess (and rated by thousands of players).
    if (VERIFY && p.src !== 'lichess') {
      cache[id] ??= await verify(p);
      if (!cache[id]) { rejected++; continue; }
    }
    out.push({ id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes, ...(p.src ? { src: p.src } : {}) });
  }
}
out.sort((a, b) => a.rating - b.rating);
writeFileSync('public/puzzles.json', JSON.stringify(out));
const count = (t) => out.filter((p) => p.themes.includes(t)).length;
if (VERIFY) writeFileSync(CACHE, JSON.stringify(cache));
console.log(`${out.length} puzzles (${bad} illegal, ${rejected} failed deep verification)`);
console.log(`  from lichess: ${out.filter((p) => p.src === 'lichess').length}`);
for (const t of ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'backRankMate', 'fork', 'knightFork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'promotion', 'winMaterial', 'deflection', 'attraction', 'sacrifice']) console.log(`  ${t}: ${count(t)}`);
sf?.kill();
