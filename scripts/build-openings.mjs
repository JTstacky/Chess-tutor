// Builds public/openings.json (position -> [ECO, name]) from the lichess chess-openings TSVs in data/.
// Source: https://github.com/lichess-org/chess-openings (CC0). Run: node scripts/build-openings.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const out = {};
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(`data/${f}.tsv`, 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    for (const san of pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/)) chess.move(san);
    // Key on placement, side to move, castling and en passant so transpositions match.
    out[chess.fen().split(' ').slice(0, 4).join(' ')] = [eco, name];
  }
}
writeFileSync('public/openings.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'positions');
