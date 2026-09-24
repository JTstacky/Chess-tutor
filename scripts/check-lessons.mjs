// Validates src/chess/lessons.ts: every move legal, every "wrong" move legal, and Stockfish
// agrees your moves are sound (puzzles: best or equally winning; openings: no big mistakes).
// Run: node --experimental-strip-types scripts/check-lessons.mjs
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { LESSONS } from '../src/chess/lessons.ts';

const sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js']);
let buf = '';
let waiter = null;
sf.stdout.on('data', (d) => {
  buf += d;
  if (waiter && buf.includes('bestmove')) { const w = waiter; waiter = null; w(buf); buf = ''; }
});
const send = (c) => sf.stdin.write(c + '\n');
function analyse(fen, depth = 14) {
  return new Promise((resolve) => {
    buf = '';
    waiter = (out) => {
      const infos = out.split('\n').filter((l) => l.startsWith('info') && l.includes(' pv '));
      const last = infos[infos.length - 1] ?? '';
      const mate = / score mate (-?\d+)/.exec(last);
      const cp = mate ? Math.sign(Number(mate[1])) * (100000 - Math.abs(Number(mate[1]))) : Number(/ score cp (-?\d+)/.exec(last)?.[1] ?? 0);
      resolve({ cp, best: / bestmove (\S+)/.exec(out)?.[1] ?? /bestmove (\S+)/.exec(out)?.[1] });
    };
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}
send('uci');

let problems = 0;
const fail = (msg) => { problems++; console.log('  ✗ ' + msg); };
for (const l of LESSONS) {
  console.log(`${l.category}/${l.id}`);
  const start = l.fen ?? new Chess().fen();
  try { new Chess(start); } catch (e) { fail('bad fen ' + e.message); continue; }
  if (l.practice) {
    const c = new Chess(start);
    if (c.turn() !== l.side) fail('practice: side to move is not the student');
    continue;
  }
  for (const line of l.lines ?? []) {
    const c = new Chess(start);
    for (const [i, m] of line.moves.entries()) {
      const fen = c.fen();
      const mine = c.turn() === l.side;
      for (const w of Object.keys(m.wrong ?? {})) {
        try { new Chess(fen).move(w); } catch { fail(`${line.title} #${i + 1}: wrong move ${w} is illegal`); }
      }
      let mv;
      try { mv = c.move(m.san); } catch { fail(`${line.title} #${i + 1}: ${m.san} is illegal`); break; }
      if (mv.san !== m.san) fail(`${line.title} #${i + 1}: write ${m.san} as ${mv.san}`);
      if (!mine) continue;
      if (!m.prompt && l.category === 'puzzles') fail(`${line.title}: ${m.san} has no prompt`);
      const before = await analyse(fen);
      const after = await analyse(c.fen());
      const loss = before.cp - -after.cp;
      const limit = l.category === 'puzzles' ? 60 : 120;
      const mateKept = before.cp > 90000 && -after.cp > 90000;
      if (loss > limit && !mateKept && !c.isCheckmate()) {
        fail(`${line.title} #${i + 1}: ${mv.san} loses ${loss}cp (engine prefers ${before.best}, eval ${before.cp})`);
      }
    }
  }
}
send('quit');
console.log(problems ? `\n${problems} problem(s)` : '\nAll lessons OK');
process.exit(problems ? 1 : 0);
