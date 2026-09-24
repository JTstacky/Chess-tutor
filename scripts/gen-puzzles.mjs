// Generates tactics puzzles with Stockfish, the same way lichess does: play lots of
// imperfect games, find the moments where one side blunders and the other has exactly one
// clearly winning reply, then keep that line as a puzzle.
//
// Usage: node scripts/gen-puzzles.mjs <seed> <minutes> <out.jsonl> [--varied]
// Then:  node scripts/build-puzzles.mjs   (merges data/puzzles/*.jsonl -> public/puzzles.json)
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const [seedArg = '1', minutesArg = '10', out = 'data/puzzles/out.jsonl'] = process.argv.slice(2);
const deadline = Date.now() + Number(minutesArg) * 60_000;
const VARIED = process.argv.includes('--varied');

// Small deterministic PRNG so runs with different seeds explore different games.
let seed = Number(seedArg) * 2654435761 >>> 0;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

// ---- engine ----
const sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js']);
let buf = '';
let waiter = null;
sf.stdout.on('data', (d) => {
  buf += d;
  if (waiter && buf.includes('bestmove')) { const w = waiter; waiter = null; const o = buf; buf = ''; w(o); }
});
const send = (c) => sf.stdin.write(c + '\n');
const MATE = 100000;
function analyse(fen, { depth = 12, multipv = 1 } = {}) {
  return new Promise((resolve) => {
    buf = '';
    waiter = (outp) => {
      const lines = [];
      for (const l of outp.split('\n')) {
        if (!l.startsWith('info') || !l.includes(' pv ') || l.includes(' upperbound') || l.includes(' lowerbound')) continue;
        const k = Number(/ multipv (\d+)/.exec(l)?.[1] ?? 1) - 1;
        const mate = / score mate (-?\d+)/.exec(l);
        const m = mate ? Number(mate[1]) : null;
        const cp = m !== null ? Math.sign(m || -1) * (MATE - Math.abs(m)) : Number(/ score cp (-?\d+)/.exec(l)[1]);
        lines[k] = { pv: l.split(' pv ')[1].trim().split(/\s+/), cp, mate: m };
      }
      resolve(lines.filter(Boolean));
    };
    send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}
send('uci');

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const material = (c, color) => c.board().flat().reduce((s, p) => s + (p && p.color === color ? VALUE[p.type] : 0), 0);
const uciMove = (c, u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// ---- game generation ----
const openings = Object.keys(JSON.parse(readFileSync('public/openings.json', 'utf8')));

async function playGame() {
  const c = new Chess(pick(openings) + ' 0 1');
  const fens = [c.fen()];
  const ucis = [];
  const evals = []; // quick eval of fens[i] for the side to move
  for (let ply = 0; ply < 70 && !c.isGameOver(); ply++) {
    const lines = await analyse(c.fen(), { depth: 6, multipv: 4 });
    if (!lines.length) break;
    evals.push(lines[0].cp);
    let u;
    if (rand() < 0.12) {
      const m = pick(c.moves({ verbose: true }));
      u = m.from + m.to + (m.promotion ?? '');
    } else {
      const ok = lines.filter((l) => l.cp >= lines[0].cp - 120);
      u = pick(ok.length ? ok : lines).pv[0];
    }
    uciMove(c, u);
    ucis.push(u);
    fens.push(c.fen());
  }
  if (!c.isGameOver()) evals.push((await analyse(c.fen(), { depth: 6 }))[0]?.cp ?? 0);
  return { fens, ucis, evals };
}

// ---- puzzle extraction ----
const seen = new Set();

/** Is `best` clearly better than `second` for the side to move? */
function unique(best, second) {
  if (!second) return true;
  if (best.mate !== null && best.mate > 0) return !(second.mate !== null && second.mate > 0 && second.mate <= best.mate + 1);
  return second.cp < 200 && best.cp - second.cp >= 250;
}

async function tryPuzzle(fenBefore, blunder, fen) {
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (seen.has(key)) return null;
  const c0 = new Chess(fen);
  if (c0.isGameOver()) return null;
  const [best, second] = await analyse(fen, { depth: 14, multipv: 2 });
  if (!best) return null;
  const isMate = best.mate !== null && best.mate > 0 && best.mate <= 4;
  if (!isMate && (best.cp < 300 || best.cp > 3000)) return null;
  if (!unique(best, second)) return null;
  // Before the blunder the solver must not have been winning already.
  const [pre] = await analyse(fenBefore, { depth: 12 });
  if (!pre || -pre.cp > 150) return null;

  const me = c0.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const c = new Chess(fen);
  const line = [];
  if (isMate) {
    const n = best.mate * 2 - 1;
    if (best.pv.length < n) return null;
    for (let i = 0; i < n; i++) {
      if (i > 0 && i % 2 === 0 && i < n - 1) {
        // Every non-final solver move must also be the only good one.
        const [b, s] = await analyse(c.fen(), { depth: 14, multipv: 2 });
        if (!b || b.pv[0] !== best.pv[i] || !unique(b, s)) return null;
      }
      uciMove(c, best.pv[i]);
      line.push(best.pv[i]);
    }
    if (!c.isCheckmate()) return null;
  } else {
    const start = material(c, me) - material(c, opp);
    let found = 0;
    for (const k of [1, 3, 5]) {
      if (best.pv.length < k + 1) break;
      const t = new Chess(fen);
      for (let i = 0; i <= k; i++) uciMove(t, best.pv[i]);
      const gainAfterReply = material(t, me) - material(t, opp) - start;
      if (gainAfterReply >= 2) { found = k; break; }
    }
    if (!found) return null;
    for (let i = 0; i < found; i++) {
      if (i > 0 && i % 2 === 0) {
        const [b, s] = await analyse(c.fen(), { depth: 14, multipv: 2 });
        if (!b || b.pv[0] !== best.pv[i] || !unique(b, s)) return null;
      }
      uciMove(c, best.pv[i]);
      line.push(best.pv[i]);
    }
  }
  seen.add(key);
  const themes = detectThemes(fen, line, isMate ? best.mate : 0);
  return { fen: fenBefore, moves: [blunder, ...line], themes, rating: rateIt(themes, line.length), eval: best.cp };
}

// ---- themes ----
function attackedTargets(c, sq, color) {
  // enemy pieces attacked by the piece on sq
  const opp = color === 'w' ? 'b' : 'w';
  const out = [];
  for (const p of c.board().flat()) {
    if (!p || p.color !== opp) continue;
    if (c.attackers(p.square, color).includes(sq)) out.push(p);
  }
  return out;
}

function detectThemes(fen, line, mateIn) {
  const themes = [];
  const c = new Chess(fen);
  const me = c.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const moves = [];
  for (const u of line) moves.push(uciMove(c, u));
  if (mateIn) {
    themes.push(`mateIn${mateIn}`);
    const last = moves[moves.length - 1];
    const kingSq = c.findPiece({ type: 'k', color: opp })[0];
    if ((last.piece === 'r' || last.piece === 'q') && kingSq && (kingSq[1] === '1' || kingSq[1] === '8') && last.to[1] === kingSq[1]) themes.push('backRankMate');
    if (last.piece === 'n') themes.push('smotheredMate');
  }
  if (moves.some((m) => m.promotion)) themes.push('promotion');
  // Look at the first solver move for classic motifs.
  const t = new Chess(fen);
  const before = new Chess(fen);
  const first = uciMove(t, line[0]);
  if (first.captured && line.length === 1 && before.attackers(first.to, opp).length === 0) themes.push('hangingPiece');
  const targets = attackedTargets(t, first.to, me).filter((p) => p.type === 'k' || VALUE[p.type] > VALUE[first.piece] || t.attackers(p.square, opp).length === 0);
  if (targets.length >= 2 && first.piece !== 'k') themes.push(first.piece === 'n' ? 'knightFork' : 'fork');
  // Discovered attack: after the move, another of my pieces now attacks something big that it didn't before.
  for (const p of t.board().flat()) {
    if (!p || p.color !== me || p.square === first.to || !'brq'.includes(p.type)) continue;
    const now = attackedTargets(t, p.square, me).filter((x) => x.type === 'k' || VALUE[x.type] >= 5).map((x) => x.square);
    const was = attackedTargets(before, p.square, me).map((x) => x.square);
    if (now.some((sq) => !was.includes(sq))) { themes.push('discoveredAttack'); break; }
  }
  // Pin / skewer along the line from the moved slider.
  if ('brq'.includes(first.piece)) {
    const dirs = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
    const ds = first.piece === 'q' ? [...dirs.b, ...dirs.r] : dirs[first.piece];
    const f0 = first.to.charCodeAt(0) - 97;
    const r0 = Number(first.to[1]) - 1;
    for (const [df, dr] of ds) {
      const hits = [];
      for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8 && hits.length < 2; f += df, r += dr) {
        const p = t.get(`${String.fromCharCode(97 + f)}${r + 1}`);
        if (p) { if (p.color !== opp) break; hits.push(p); }
      }
      if (hits.length === 2) {
        const [front, back] = hits;
        const v = (p) => (p.type === 'k' ? 100 : VALUE[p.type]);
        if (v(back) > v(front) && v(back) >= 5) themes.push('pin');
        else if (v(front) > v(back) && v(front) >= 5 && v(back) >= 3) themes.push('skewer');
      }
    }
  }
  if (!mateIn) themes.push('winMaterial');
  return [...new Set(themes)];
}

function rateIt(themes, plies) {
  const moves = Math.ceil(plies / 2);
  if (themes.includes('mateIn1')) return 500 + Math.round(rand() * 250);
  if (themes.includes('mateIn2')) return 950 + Math.round(rand() * 250);
  if (themes.includes('mateIn3')) return 1300 + Math.round(rand() * 250);
  if (themes.includes('mateIn4')) return 1600 + Math.round(rand() * 250);
  let r = themes.includes('hangingPiece') ? 600 : 850;
  r += (moves - 1) * 250;
  if (themes.includes('discoveredAttack') || themes.includes('skewer')) r += 100;
  return r + Math.round(rand() * 200);
}

// ---- main loop ----
let count = 0;
while (Date.now() < deadline) {
  const { fens, ucis, evals } = await playGame();
  for (let i = 2; i < fens.length && Date.now() < deadline; i++) {
    // Cheap filter: only look closely where the last move threw away at least 2 pawns' worth.
    const before = -(evals[i - 1] ?? 0);
    const after = evals[i];
    if (after === undefined || after < 200 || after - before < 200) continue;
    const p = await tryPuzzle(fens[i - 1], ucis[i - 1], fens[i]);
    // With --varied, keep only a few plain "free piece" puzzles (we have lots already).
    const plain = p && p.themes.every((t) => t === 'hangingPiece' || t === 'winMaterial');
    if (p && VARIED && plain && rand() < 0.8) continue;
    if (p) {
      appendFileSync(out, JSON.stringify(p) + '\n');
      count++;
    }
  }
}
console.log(`seed ${seedArg}: ${count} puzzles`);
send('quit');
process.exit(0);
