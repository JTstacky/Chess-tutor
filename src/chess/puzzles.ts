// Puzzle trainer: themed tactics puzzles (generated with Stockfish, see scripts/gen-puzzles.mjs),
// a puzzle rating that goes up and down, streaks, hints and explanations.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board } from './board';
import { explainConsequence, NAMES, winPercent } from './coach';
import { getEngine } from './engine';
import { sounds } from './sound';
import { profile, recordPuzzle } from './storage';
import type { Theme } from './themes';
import { confetti } from './ui';

export interface Puzzle {
  id: string;
  fen: string; // position BEFORE the opponent's move
  moves: string[]; // UCI: opponent's move, then your solution (alternating)
  rating: number;
  themes: string[];
}

interface PuzzleSet {
  id: string;
  label: string;
  match: (p: Puzzle) => boolean;
}

const has = (...t: string[]) => (p: Puzzle) => t.some((x) => p.themes.includes(x));

export const SETS: PuzzleSet[] = [
  { id: 'mix', label: '⭐ My level', match: () => true },
  { id: 'm1', label: '♚ Mate in 1', match: has('mateIn1') },
  { id: 'm2', label: '♚♚ Mate in 2+', match: has('mateIn2', 'mateIn3', 'mateIn4') },
  { id: 'fork', label: '🍴 Forks', match: has('fork', 'knightFork') },
  { id: 'pin', label: '📌 Pins & skewers', match: has('pin', 'skewer') },
  { id: 'disc', label: '💥 Discovered attacks', match: has('discoveredAttack') },
  { id: 'hang', label: '🎁 Free pieces', match: has('hangingPiece') },
  { id: 'mat', label: '💰 Win material', match: has('winMaterial') },
];

const THEME_TIPS: Record<string, string> = {
  mateIn1: 'Always check every check! Sometimes one of them is checkmate.',
  mateIn2: 'Mate in 2: a forcing first move (usually a check) that leaves only one reply, then checkmate.',
  mateIn3: 'Long mates are all about forcing moves: checks first, then captures, then threats.',
  mateIn4: 'Long mates are all about forcing moves: checks first, then captures, then threats.',
  backRankMate: 'Back-rank mate: the king is trapped behind its own pawns. Give your own king an escape square!',
  smotheredMate: 'Smothered mate: the king is boxed in by its own pieces, and a knight delivers checkmate.',
  knightFork: 'Knight fork: knights attack in a funny L-shape, so they can hit two pieces that can\'t hit back.',
  fork: 'Fork: one piece attacks two things at once. Your opponent can only save one!',
  pin: 'Pin: a piece can\'t move without exposing something more valuable behind it.',
  skewer: 'Skewer: attack a big piece, and when it moves you win the piece behind it.',
  discoveredAttack: 'Discovered attack: move one piece out of the way to unleash an attack from the piece behind it.',
  hangingPiece: 'Free piece! Before every move, check: is anything undefended? Take it!',
  promotion: 'Promotion: a pawn that reaches the end becomes a queen (or anything you want).',
  winMaterial: 'Look for checks, captures and threats: that\'s how you win material.',
};

/** The most interesting idea in the puzzle gets the tip (a fork beats "free piece"). */
function tipFor(p: Puzzle): string {
  const t = Object.keys(THEME_TIPS).find((k) => p.themes.includes(k));
  return t ? THEME_TIPS[t] : '';
}

let puzzlesCache: Puzzle[] | null = null;
async function loadPuzzles(): Promise<Puzzle[]> {
  puzzlesCache ??= await fetch(`${import.meta.env.BASE_URL}puzzles.json`).then((r) => r.json());
  return puzzlesCache!;
}

const uciOf = (m: Move) => m.from + m.to + (m.promotion ?? '');

export class PuzzleScreen {
  readonly el: HTMLElement;
  private board: Board;
  private set = SETS[0];
  private puzzle: Puzzle | null = null;
  private chess = new Chess();
  private ply = 0; // index into puzzle.moves
  private me: Color = 'w';
  private failed = false;
  private hinted = false;
  private hintLevel = 0;
  private busy = false;
  private solved = false;
  private token = 0;

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'view play puzzles';
    this.el.dataset.view = 'puzzles';
    this.el.innerHTML = `
      <div class="board-col">
        <div class="puzzle-bar">
          <span class="p-rating">🧩 You <b></b></span>
          <span class="p-streak">🔥 <b></b></span>
          <span class="p-info"></span>
        </div>
        <div class="board-host"></div>
      </div>
      <div class="side-col">
        <div class="chips puzzle-sets">${SETS.map((s) => `<button class="chip" data-set="${s.id}">${s.label}</button>`).join('')}</div>
        <div class="coach"><div class="mascot">🦉</div><div class="bubble"></div></div>
        <div class="controls puzzle-controls">
          <button data-act="hint"><span>💡</span>Hint</button>
          <button data-act="solution"><span>👀</span>Solution</button>
          <button data-act="retry"><span>🔁</span>Retry</button>
          <button data-act="next"><span>⏭️</span>Next</button>
        </div>
      </div>`;
    this.board = new Board({ onMove: (f, t, p) => void this.userMove(f, t, p), quiet: true });
    this.el.querySelector('.board-host')!.append(this.board.el);
    this.el.querySelector('.puzzle-controls')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'hint') this.hint();
      if (act === 'solution') void this.showSolution();
      if (act === 'retry' && this.puzzle) this.load(this.puzzle);
      if (act === 'next') void this.next();
    });
    this.el.querySelector('.puzzle-sets')!.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-set]')?.dataset.set;
      const s = SETS.find((x) => x.id === id);
      if (!s) return;
      this.set = s;
      localStorage.setItem('tg-chess-puzzle-set', s.id);
      void this.next();
    });
  }

  async start() {
    this.set = SETS.find((s) => s.id === localStorage.getItem('tg-chess-puzzle-set')) ?? SETS[0];
    await this.next();
  }

  stop() {
    this.token++;
    this.board.skipAnimation();
    getEngine().cancelAll();
  }

  /** Puzzles use the theme last picked for a game. */
  setTheme(theme: Theme) {
    this.board.setTheme(theme);
  }

  private async next() {
    this.say('Finding a puzzle for you…');
    const all = await loadPuzzles();
    const pool = all.filter(this.set.match);
    const seen = new Set(profile.puzzleSeen);
    const fresh = pool.filter((p) => !seen.has(p.id));
    const choices = (fresh.length ? fresh : pool).slice();
    // Pick near your rating, with a little randomness so it doesn't feel repetitive.
    const target = profile.puzzleRating + (Math.random() - 0.4) * 250;
    choices.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
    const p = choices[Math.floor(Math.random() * Math.min(8, choices.length))];
    if (!p) {
      this.say('No puzzles in this set yet. Try another one!');
      return;
    }
    this.load(p);
  }

  private load(p: Puzzle) {
    this.token++;
    this.board.skipAnimation();
    getEngine().cancelAll();
    this.puzzle = p;
    this.el.dataset.puzzle = p.id;
    this.chess = new Chess(p.fen);
    this.me = this.chess.turn() === 'w' ? 'b' : 'w';
    this.ply = 0;
    this.failed = false;
    this.hinted = false;
    this.hintLevel = 0;
    this.solved = false;
    this.busy = true;
    this.board.setOrientation(this.me);
    this.board.setArrows([]);
    this.board.setMarks([]);
    this.el.querySelectorAll<HTMLElement>('[data-set]').forEach((b) => b.classList.toggle('on', b.dataset.set === this.set.id));
    this.el.querySelector('.p-info')!.textContent = `This puzzle: ${p.rating}`;
    this.renderStats();
    this.render();
    this.say('Watch your opponent\'s move…');
    const t = this.token;
    setTimeout(() => {
      if (t !== this.token) return;
      this.playUci(p.moves[0]);
      this.ply = 1;
      this.busy = false;
      this.render(true);
      this.say(`Your turn! You're ${this.me === 'w' ? 'White' : 'Black'}. ${this.goalText()}`);
    }, 700);
  }

  private goalText(): string {
    const t = this.puzzle!.themes;
    const mate = t.find((x) => x.startsWith('mateIn'));
    if (mate) {
      const n = Number(mate.slice(6));
      return n === 1 ? 'Find the checkmate in 1!' : `Find checkmate in ${n} moves!`;
    }
    return 'Find the best move! Your opponent just made a mistake.';
  }

  private playUci(u: string): Move {
    const m = this.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (m.san.includes('+') || m.san.includes('#')) sounds.check();
    else if (m.captured) sounds.capture();
    else sounds.move();
    return m;
  }

  private isMyTurn() {
    return !!this.puzzle && !this.busy && !this.solved && this.chess.turn() === this.me;
  }

  private async userMove(from: Square, to: Square, promotion?: string) {
    if (!this.isMyTurn()) return;
    const p = this.puzzle!;
    const expected = p.moves[this.ply];
    const test = new Chess(this.chess.fen());
    let mv: Move;
    try {
      mv = test.move({ from, to, promotion });
    } catch {
      return;
    }
    const last = this.ply === p.moves.length - 1;
    if (uciOf(mv) === expected || (last && test.isCheckmate())) {
      this.playUci(uciOf(mv));
      this.ply++;
      this.hintLevel = 0;
      this.board.setArrows([]);
      this.board.setMarks([]);
      this.render(true);
      if (this.ply >= p.moves.length) return this.success();
      this.say('✅ Good move! Keep going…');
      this.busy = true;
      const t = this.token;
      // Wait for your move (and any capture battle) to finish first.
      void this.board.idle().then(() => setTimeout(() => {
        if (t !== this.token) return;
        this.playUci(p.moves[this.ply]);
        this.ply++;
        this.busy = false;
        this.render(true);
        this.say('✅ Correct! What\'s next?');
      }, 600));
      return;
    }
    // Wrong: the first mistake counts as a failed puzzle, but you can keep trying.
    if (!this.failed) {
      this.failed = true;
      recordPuzzle(p.id, p.rating, false);
      this.renderStats();
    }
    sounds.lose();
    this.render();
    this.busy = true;
    this.say('Hmm, let me look at that move…');
    const t = this.token;
    const [line] = await getEngine().analyse(test.fen(), { depth: 10 });
    if (t !== this.token) return;
    this.busy = false;
    const opp = this.me === 'w' ? 'Black' : 'White';
    if (line && winPercent(line.cp) > 60) {
      this.say(`❌ Not quite. ${explainConsequence(test.fen(), line, this.me, opp)} Try again!`);
    } else {
      this.say('❌ Not the best move. Look for checks, captures and threats. Try again!');
    }
    this.render();
  }

  private success() {
    const p = this.puzzle!;
    this.solved = true;
    const clean = !this.failed && !this.hinted;
    const delta = clean ? recordPuzzle(p.id, p.rating, true) : 0;
    this.renderStats();
    const t = this.token;
    void this.board.idle().then(() => {
      if (t !== this.token) return;
      sounds.win();
      if (clean && profile.puzzleStreak > 0 && profile.puzzleStreak % 5 === 0) confetti();
    });
    const tip = tipFor(p);
    const praise = clean
      ? `🎉 Solved! Puzzle rating ${delta >= 0 ? '+' : ''}${delta}.${profile.puzzleStreak > 1 ? ` 🔥 ${profile.puzzleStreak} in a row!` : ''}`
      : '🎉 You got there! Tap Next for another one.';
    this.say(`${praise} ${tip}`);
    this.render();
  }

  private hint() {
    if (!this.isMyTurn()) return;
    const u = this.puzzle!.moves[this.ply];
    const from = u.slice(0, 2) as Square;
    const to = u.slice(2, 4) as Square;
    this.hinted = true;
    this.hintLevel++;
    const piece = this.chess.get(from);
    if (this.hintLevel === 1) {
      this.board.setMarks([from]);
      this.say(`💡 Look at your ${piece ? NAMES[piece.type] : 'piece'} on ${from}. Tap Hint again for more.`);
    } else {
      this.board.setMarks([]);
      this.board.setArrows([{ from, to, color: 'rgba(40,180,90,0.85)' }]);
      this.say(`💡 Move your ${piece ? NAMES[piece.type] : 'piece'} from ${from} to ${to}.`);
    }
  }

  private async showSolution() {
    if (!this.puzzle || this.solved) return;
    const p = this.puzzle;
    if (!this.failed) {
      this.failed = true;
      recordPuzzle(p.id, p.rating, false);
    }
    this.busy = true;
    this.solved = true;
    const t = this.token;
    const sans: string[] = [];
    while (this.ply < p.moves.length) {
      await this.board.idle();
      await new Promise((r) => setTimeout(r, 800));
      if (t !== this.token) return;
      const u = p.moves[this.ply];
      this.board.setArrows([{ from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square, color: 'rgba(40,180,90,0.85)' }]);
      sans.push(this.playUci(u).san);
      this.ply++;
      this.render(true);
    }
    this.busy = false;
    const tip = tipFor(p);
    this.say(`👀 The solution was ${sans.join(' ')}. ${tip} Tap Next to try another!`);
    this.renderStats();
    this.render();
  }

  private say(text: string) {
    this.el.querySelector('.bubble')!.textContent = text;
  }

  private renderStats() {
    this.el.querySelector('.p-rating b')!.textContent = String(profile.puzzleRating);
    this.el.querySelector('.p-streak b')!.textContent = String(profile.puzzleStreak);
  }

  private render(animate = false) {
    const dests = new Map<Square, Square[]>();
    if (this.isMyTurn()) {
      for (const m of this.chess.moves({ verbose: true })) {
        const list = dests.get(m.from) ?? [];
        if (!list.includes(m.to)) list.push(m.to);
        dests.set(m.from, list);
      }
    }
    const last = this.chess.history({ verbose: true }).at(-1);
    const king = this.chess.inCheck() ? this.chess.findPiece({ type: 'k', color: this.chess.turn() })[0] : null;
    this.board.setState(
      {
        pieces: this.chess.board().map((r) => r.map((x) => (x ? { type: x.type, color: x.color } : null))),
        lastMove: last ? { from: last.from, to: last.to } : null,
        check: king ?? null,
        dests,
        movable: this.isMyTurn() ? this.me : null,
      },
      animate ? last : null,
    );
    const btn = (a: string) => this.el.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;
    btn('hint').disabled = !this.isMyTurn();
    btn('solution').disabled = this.solved || !this.puzzle;
    btn('next').classList.toggle('pulse', this.solved);
  }
}
