// Merges data/puzzles/*.jsonl (from gen-puzzles.mjs) into public/puzzles.json:
// re-checks every move is legal, drops duplicates, and gives each puzzle a stable id.
// Run: node scripts/build-puzzles.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const out = [];
const seen = new Set();
let bad = 0;
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
    const id = createHash('sha1').update(key).digest('hex').slice(0, 8);
    out.push({ id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes });
  }
}
out.sort((a, b) => a.rating - b.rating);
writeFileSync('public/puzzles.json', JSON.stringify(out));
const count = (t) => out.filter((p) => p.themes.includes(t)).length;
console.log(`${out.length} puzzles (${bad} bad dropped)`);
for (const t of ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'backRankMate', 'fork', 'knightFork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'promotion', 'winMaterial']) console.log(`  ${t}: ${count(t)}`);
