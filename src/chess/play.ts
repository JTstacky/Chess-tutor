// The game screen: vs a bot or pass-and-play, with clocks, takeback, hints, draw and resign.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board, type Arrow, type BoardState } from './board';
import { BOTS, botMove, type Bot } from './bots';
import {
  explainConsequence,
  GRADE_INFO,
  NAMES,
  openingFor,
  threatenedPieces,
  winPercent,
} from './coach';
import { getEngine, type EngineLine } from './engine';
import { reviewGame, type GameReview } from './review';
import { sounds } from './sound';
import { coachingOn, profile, recordBotResult } from './storage';
import { themeById, THEMES, type Theme } from './themes';
import { confirmDialog, confetti, showModal } from './ui';

export interface TimeControl {
  label: string;
  minutes: number; // 0 = no clock
  increment: number; // seconds
}

export const TIME_CONTROLS: TimeControl[] = [
  { label: 'No clock', minutes: 0, increment: 0 },
  { label: '1 min', minutes: 1, increment: 0 },
  { label: '3 | 2', minutes: 3, increment: 2 },
  { label: '5 min', minutes: 5, increment: 0 },
  { label: '10 min', minutes: 10, increment: 0 },
  { label: '15 | 10', minutes: 15, increment: 10 },
  { label: '30 min', minutes: 30, increment: 0 },
];

export interface GameConfig {
  mode: 'bot' | 'friend';
  bot?: Bot;
  playerColor: Color; // for bot games; in friend mode this is just the starting orientation
  time: TimeControl;
  theme?: string;
  startMoves?: string[]; // SAN moves already played (e.g. continuing a lesson)
  from?: string; // where those moves came from, e.g. "Italian Game"
}

interface Result {
  winner: Color | null;
  reason: string;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_ICONS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export class PlayScreen {
  readonly el: HTMLElement;
  private board: Board;
  private chess = new Chess();
  private cfg!: GameConfig;
  private theme: Theme = THEMES[0];
  private clocks: { w: number; b: number } = { w: 0, b: 0 };
  private clockHistory: { w: number; b: number }[] = [];
  private tickTimer: number | undefined;
  private lastTick = 0;
  private result: Result | null = null;
  private viewPly: number | null = null; // null = following the live game
  private gameId = 0;
  private botThinking = false;
  private hintsUsed = 0;
  private flagWarned = { w: false, b: false };
  private checking = false; // blunder check in progress
  private tentative: Chess | null = null; // position shown while checking a move
  private pre: { fen: string; lines: Promise<EngineLine[]> } | null = null;
  private openingName = '';
  private review: GameReview | null = null;
  private reviewing = false;

  constructor(private onExit: () => void) {
    this.el = document.createElement('section');
    this.el.className = 'view play';
    this.el.innerHTML = `
      <div class="board-col">
        <div class="player-bar" data-side="top">
          <div class="who"><span class="avatar"></span><span class="pname"></span><span class="captured"></span></div>
          <div class="clock"></div>
        </div>
        <div class="board-host"></div>
        <div class="player-bar" data-side="bottom">
          <div class="who"><span class="avatar"></span><span class="pname"></span><span class="captured"></span></div>
          <div class="clock"></div>
        </div>
      </div>
      <div class="side-col">
        <div class="coach"><div class="mascot">🦉</div><div class="bubble"></div></div>
        <div class="opening" hidden></div>
        <div class="controls">
          <button data-act="undo" title="Take back"><span>↶</span>Take back</button>
          <button data-act="hint" title="Hint"><span>💡</span>Hint</button>
          <button data-act="flip" title="Flip board"><span>🔄</span>Flip</button>
          <button data-act="draw" title="Offer draw"><span>🤝</span>Draw</button>
          <button data-act="resign" title="Resign"><span>🏳️</span>Resign</button>
          <button data-act="review" title="Review game" hidden><span>⭐</span>Review</button>
          <button data-act="new" title="New game"><span>✨</span>New</button>
        </div>
        <ol class="moves"></ol>
        <div class="nav">
          <button data-nav="start" aria-label="First move">⏮</button>
          <button data-nav="prev" aria-label="Previous move">◀</button>
          <button data-nav="next" aria-label="Next move">▶</button>
          <button data-nav="end" aria-label="Latest move">⏭</button>
        </div>
      </div>`;
    this.board = new Board({ onMove: (from, to, promo) => this.userMove(from, to, promo) });
    this.el.querySelector('.board-host')!.append(this.board.el);
    this.el.querySelector('.controls')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act) void this.action(act);
    });
    this.el.querySelector('.nav')!.addEventListener('click', (e) => {
      const nav = (e.target as HTMLElement).closest('button')?.dataset.nav;
      if (nav) this.navigate(nav);
    });
    this.el.querySelector('.moves')!.addEventListener('click', (e) => {
      const ply = (e.target as HTMLElement).closest<HTMLElement>('[data-ply]')?.dataset.ply;
      if (ply) this.setView(Number(ply));
    });
    document.addEventListener('keydown', (e) => {
      if (!this.el.isConnected || document.querySelector('.modal')) return;
      if (e.key === 'ArrowLeft') this.navigate('prev');
      else if (e.key === 'ArrowRight') this.navigate('next');
    });
  }

  start(cfg: GameConfig) {
    this.cfg = cfg;
    this.gameId++;
    this.board.skipAnimation();
    getEngine().cancelAll();
    this.theme = themeById(cfg.theme);
    this.board.setTheme(this.theme);
    document.body.style.background = this.theme.page;
    this.chess = new Chess();
    for (const san of cfg.startMoves ?? []) this.chess.move(san);
    this.result = null;
    this.viewPly = null;
    this.botThinking = false;
    this.hintsUsed = 0;
    this.flagWarned = { w: false, b: false };
    this.checking = false;
    this.tentative = null;
    this.pre = null;
    this.openingName = '';
    this.review = null;
    this.reviewing = false;
    const ms = cfg.time.minutes * 60_000;
    this.clocks = { w: ms, b: ms };
    this.clockHistory = Array.from({ length: this.chess.history().length + 1 }, () => ({ ...this.clocks }));
    this.stopClock();
    this.board.setArrows([]);
    this.board.setOrientation(cfg.playerColor);
    this.el.classList.toggle('no-clock', cfg.time.minutes === 0);
    this.el.querySelector<HTMLElement>('[data-act="hint"]')!.hidden = !(coachingOn('hints') && cfg.mode === 'bot');
    this.refresh(false);
    if (cfg.startMoves?.length) {
      this.openingName = openingOfMoves(this.chess)?.name ?? '';
      this.renderOpening();
      const botTurn = cfg.mode === 'bot' && this.chess.turn() !== cfg.playerColor;
      this.say(`Let's keep playing your ${cfg.from ?? 'opening'}! ${botTurn ? `${cfg.bot!.name} is thinking…` : 'Your move.'}`);
      if (botTurn) void this.playBot();
    } else if (cfg.mode === 'bot' && cfg.playerColor === 'b') {
      this.say(`${cfg.bot!.name} plays first. You're Black!`);
      void this.playBot();
    } else if (cfg.mode === 'bot') {
      this.say(`You're White, so you move first. Good luck against ${cfg.bot!.name}!`);
    } else {
      this.say('Pass and play! White moves first. Hand the device over after each move.');
    }
  }

  /** Moves that can't be taken back: the bot's first move, or the lesson moves you continued from. */
  private get basePly(): number {
    const start = this.cfg.startMoves?.length ?? 0;
    if (this.cfg.mode !== 'bot') return start;
    // The first position you can return to must be your turn.
    return start % 2 === (this.cfg.playerColor === 'w' ? 0 : 1) ? start : start + 1;
  }

  stop() {
    this.gameId++;
    this.stopClock();
    this.board.skipAnimation();
    getEngine().cancelAll();
    document.body.style.background = '';
  }

  // ---- moves ----

  private isUsersTurn(): boolean {
    if (this.result || this.viewPly !== null || this.checking) return false;
    if (this.cfg.mode === 'friend') return true;
    return !this.botThinking && this.chess.turn() === this.cfg.playerColor;
  }

  private async userMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') {
    if (!this.isUsersTurn()) return;
    let shown = false;
    if (this.cfg.mode === 'bot' && coachingOn('blunderWarnings')) {
      const check = await this.blunderCheck(from, to, promotion);
      if (check === 'no') return;
      shown = check === 'shown';
    }
    const move = this.makeMove({ from, to, promotion }, shown);
    if (move && !this.result && this.cfg.mode === 'bot') void this.playBot();
  }

  /**
   * Before a move goes through, check whether it throws the game away. The move is shown
   * (and animated) while the engine checks it. Returns 'no' to cancel the move, 'shown' when
   * the board already shows it, or 'play' to play it normally.
   */
  private async blunderCheck(from: Square, to: Square, promotion?: string): Promise<'no' | 'shown' | 'play'> {
    const id = this.gameId;
    const fen = this.chess.fen();
    const test = new Chess(fen);
    try {
      test.move({ from, to, promotion });
    } catch {
      return 'no';
    }
    if (test.isGameOver()) return 'play';
    this.checking = true;
    this.tentative = test;
    this.refresh(true);
    const before = await (this.pre?.fen === fen ? this.pre.lines : getEngine().analyse(fen, { depth: 10 }));
    const after = await getEngine().analyse(test.fen(), { depth: 10 });
    await this.board.idle();
    if (id !== this.gameId) return 'no';
    const beforeWin = before[0] ? winPercent(before[0].cp) : 50;
    const afterWin = after[0] ? 100 - winPercent(after[0].cp) : 50;
    // Only warn about real blunders, and not when you're still winning easily anyway.
    if (!before[0] || !after[0] || beforeWin - afterWin < 20 || afterWin > 85) {
      this.checking = false;
      this.tentative = null;
      return 'shown';
    }
    // Keep showing the move on the board while asking, so the red arrow makes sense.
    const why = explainConsequence(test.fen(), after[0], this.cfg.playerColor, this.cfg.bot!.name) ||
      'This move makes your position a lot worse.';
    const threat = after[0].pv[0];
    if (threat) this.board.setArrows([{ from: threat.slice(0, 2) as Square, to: threat.slice(2, 4) as Square, color: 'rgba(220,50,50,0.85)' }]);
    const go = !(await confirmDialog('🤔 Are you sure?', `${why} Do you want to try a different move?`, 'Let me rethink', 'Play it anyway'));
    this.board.setArrows([]);
    if (id !== this.gameId) return 'no';
    this.checking = false;
    this.tentative = null;
    if (!go) this.refresh(false);
    if (!go) this.say('Good thinking! Look for a safer move. Check what your opponent can capture.');
    return go ? 'shown' : 'no';
  }

  /** Play a move. `shown` means the board already shows (and has animated) it. */
  private makeMove(m: { from: string; to: string; promotion?: string }, shown = false): Move | null {
    let move: Move;
    try {
      move = this.chess.move(m);
    } catch {
      return null;
    }
    const mover = move.color;
    if (this.cfg.time.minutes > 0) {
      if (this.chess.history().length > 1) this.clocks[mover] += this.cfg.time.increment * 1000;
      this.startClock();
    }
    this.clockHistory.push({ ...this.clocks });
    this.board.setArrows([]);
    // The board plays the move and capture sounds as the pieces land.
    const id = this.gameId;
    const ply = this.chess.history().length;
    void this.board.idle().then(() => {
      if (id === this.gameId && ply === this.chess.history().length && this.chess.isCheck()) sounds.check();
    });
    this.refresh(!shown);
    this.checkGameOver();
    if (!this.result) this.commentOnMove(move);
    return move;
  }

  private async playBot() {
    const id = this.gameId;
    const ply = this.chess.history().length;
    this.botThinking = true;
    this.refresh(false);
    this.say(`${this.cfg.bot!.name} is thinking…`);
    const uci = await botMove(this.cfg.bot!, this.chess.fen());
    await this.board.idle(); // let your move (and any battle) finish first
    // Ignore stale answers after a takeback, new game or leaving the screen.
    if (id !== this.gameId || ply !== this.chess.history().length || this.result) return;
    this.botThinking = false;
    this.makeMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }

  private commentOnMove(move: Move) {
    const botGame = this.cfg.mode === 'bot';
    const yourTurn = !botGame || this.chess.turn() === this.cfg.playerColor;
    if (this.announceOpening()) return;
    if (yourTurn && !this.chess.isCheck() && coachingOn('threatWarnings')) {
      const t = threatenedPieces(this.chess, this.chess.turn())[0];
      if (t && VALUE_OF[t.type] >= 3) {
        const who = botGame ? 'your' : `${colorName(this.chess.turn())}'s`;
        this.say(`Watch out! ${cap(who)} ${NAMES[t.type]} on ${t.square} is under attack by a ${NAMES[t.by]}.`);
        this.board.setArrows([{ from: t.from, to: t.square, color: 'rgba(220,50,50,0.8)' }]);
        return;
      }
    }
    if (this.chess.isCheck()) {
      this.say(yourTurn ? `Check! Your king is under attack. Move it, block, or capture the attacker.` : `Check! Nice one!`);
    } else if (move.captured && botGame && move.color === this.cfg.playerColor) {
      this.say(`You captured a ${pieceName(move.captured)}! Your move went well. Now it's ${this.cfg.bot!.name}'s turn.`);
    } else if (move.captured && botGame) {
      this.say(`${this.cfg.bot!.name} took your ${pieceName(move.captured)}. Can you take something back?`);
    } else if (botGame) {
      this.say(yourTurn ? 'Your move!' : `${this.cfg.bot!.name} is thinking…`);
    } else {
      this.say(`${colorName(this.chess.turn())} to move.`);
    }
  }

  /** Show the opening's name; returns true if Hoot announced a new one. */
  private announceOpening(): boolean {
    if (!coachingOn('openingNames')) return false;
    const o = openingFor(this.chess.fen());
    if (!o || o.name === this.openingName) return false;
    const family = (n: string) => n.split(':')[0];
    const isNew = family(o.name) !== family(this.openingName);
    this.openingName = o.name;
    this.renderOpening();
    if (!isNew) return false;
    const botGame = this.cfg.mode === 'bot';
    const yourTurn = !botGame || this.chess.turn() === this.cfg.playerColor;
    this.say(`📖 This is the ${family(o.name)}!${yourTurn ? ' Your move.' : ''}`);
    return true;
  }

  private renderOpening() {
    const el = this.el.querySelector<HTMLElement>('.opening')!;
    el.hidden = !this.openingName || !coachingOn('openingNames');
    el.textContent = `📖 ${this.openingName}`;
  }

  // ---- game end ----

  private checkGameOver() {
    const c = this.chess;
    if (c.isCheckmate()) this.finish({ winner: c.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' });
    else if (c.isStalemate()) this.finish({ winner: null, reason: 'stalemate' });
    else if (c.isInsufficientMaterial()) this.finish({ winner: null, reason: 'not enough pieces to checkmate' });
    else if (c.isThreefoldRepetition()) this.finish({ winner: null, reason: 'the same position three times' });
    else if (c.isDrawByFiftyMoves()) this.finish({ winner: null, reason: 'the 50-move rule' });
  }

  private finish(result: Result) {
    if (this.result) return;
    this.result = result;
    this.stopClock();
    this.botThinking = false;
    getEngine().cancelAll();
    this.refresh(false);

    let title: string;
    let body = `By ${result.reason}.`;
    let celebrate: 'win' | 'lose' | 'draw';
    if (this.cfg.mode === 'bot') {
      const bot = this.cfg.bot!;
      const score = result.winner === null ? 0.5 : result.winner === this.cfg.playerColor ? 1 : 0;
      const idx = BOTS.indexOf(bot);
      const next = BOTS[idx + 1];
      const newlyUnlocked = score === 1 && next && !profile.unlockedBots.includes(next.id);
      const delta = recordBotResult(bot.id, bot.rating, score, next?.id);
      title = score === 1 ? `You beat ${bot.name}! 🎉` : score === 0.5 ? 'Draw 🤝' : `${bot.name} won this time`;
      body += ` Your rating: <b>${profile.rating}</b> (${delta >= 0 ? '+' : ''}${delta}).`;
      if (newlyUnlocked) body += `<br><br>🔓 You unlocked <b>${next.avatar} ${next.name}</b>!`;
      if (score === 0) body += '<br><br>Every game makes you stronger. Try again!';
      celebrate = score === 1 ? 'win' : score === 0.5 ? 'draw' : 'lose';
    } else {
      title = result.winner ? `${this.sideName(result.winner)} wins! 🎉` : 'Draw 🤝';
      celebrate = result.winner ? 'win' : 'draw';
    }
    this.say(title.replace(/<[^>]+>/g, ''));
    // Let the last move (and its battle) finish before the result pops up.
    const id = this.gameId;
    void this.board.idle().then(() => {
      if (id !== this.gameId) return;
      sounds[celebrate]();
      if (celebrate === 'win') confetti();
      showModal(title, body, [
        { label: '⭐ Review game', primary: true, onClick: () => void this.startReview() },
        { label: 'Play again', onClick: () => this.start(this.cfg) },
        { label: 'Menu', onClick: () => this.onExit() },
      ]);
    });
  }

  // ---- review ----

  private async startReview() {
    if (!this.result || this.reviewing) return;
    if (this.review) return this.showReviewSummary();
    const id = this.gameId;
    this.reviewing = true;
    this.renderButtons();
    const names: Record<Color, string> =
      this.cfg.mode === 'bot'
        ? this.cfg.playerColor === 'w'
          ? { w: 'you', b: this.cfg.bot!.name }
          : { w: this.cfg.bot!.name, b: 'you' }
        : { w: 'White', b: 'Black' };
    const review = await reviewGame(
      this.chess.history({ verbose: true }),
      names,
      (done, total) => this.say(`🔍 Hoot is looking at your game… ${Math.round((done / total) * 100)}%`),
      () => id !== this.gameId,
    );
    this.reviewing = false;
    if (!review || id !== this.gameId) return;
    this.review = review;
    // Jump to your first big mistake so you can learn from it straight away.
    const mine = (m: { color: Color }) => this.cfg.mode === 'friend' || m.color === this.cfg.playerColor;
    const firstMistake = review.moves.find((m) => mine(m) && (m.grade === 'blunder' || m.grade === 'mistake'));
    this.setView(firstMistake ? firstMistake.ply : this.chess.history().length);
    this.showReviewSummary();
  }

  private showReviewSummary() {
    const r = this.review!;
    const sides: Color[] = this.cfg.mode === 'bot' ? [this.cfg.playerColor] : ['w', 'b'];
    const grades = ['brilliant', 'best', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'] as const;
    const table = sides
      .map((c) => {
        const who = this.cfg.mode === 'bot' ? 'Your' : `${colorName(c)}'s`;
        const rows = grades
          .map((g) => `<tr><td style="color:${GRADE_INFO[g].color}">${GRADE_INFO[g].icon}</td><td>${GRADE_INFO[g].label}</td><td>${r.counts[c][g] ?? 0}</td></tr>`)
          .join('');
        return `<p class="accuracy">${who} accuracy: <b>${r.accuracy[c]}%</b></p><table class="grades">${rows}</table>`;
      })
      .join('');
    showModal('⭐ Game review', `${table}<p>Use ◀ ▶ to step through the game. Hoot explains each move, and the green arrow shows the best move.</p>`, [
      { label: 'Got it!', primary: true },
    ]);
  }

  private showReviewMove(ply: number) {
    const m = this.review?.moves[ply - 1];
    const arrows: Arrow[] = [];
    if (!m) {
      this.say('This is the start of the game. Press ▶ to go through the moves.');
    } else {
      const g = GRADE_INFO[m.grade];
      const who = this.cfg.mode === 'bot' ? (m.color === this.cfg.playerColor ? 'You' : this.cfg.bot!.name) : colorName(m.color);
      this.say(`${g.icon} ${who} played ${m.san}: ${g.label}. ${m.comment}`.trim());
      const bad = m.grade === 'inaccuracy' || m.grade === 'mistake' || m.grade === 'blunder';
      if (bad && m.arrowUci) {
        arrows.push({ from: m.arrowUci.slice(0, 2) as Square, to: m.arrowUci.slice(2, 4) as Square, color: 'rgba(40,180,90,0.85)' });
      }
    }
    this.board.setArrows(arrows);
  }

  // ---- buttons ----

  private async action(act: string) {
    switch (act) {
      case 'undo':
        return this.takeback();
      case 'hint':
        return this.hint();
      case 'flip':
        this.board.setOrientation(this.board.getOrientation() === 'w' ? 'b' : 'w');
        return this.refresh(false);
      case 'draw':
        return this.offerDraw();
      case 'review':
        return this.startReview();
      case 'resign':
        if (this.result) return;
        if (await confirmDialog('Resign?', 'Are you sure you want to give up this game?', 'Resign')) {
          const loser = this.cfg.mode === 'bot' ? this.cfg.playerColor : this.chess.turn();
          this.finish({ winner: loser === 'w' ? 'b' : 'w', reason: `${colorName(loser)} resigning` });
        }
        return;
      case 'new':
        if (!this.result && this.chess.history().length > 0 &&
            !(await confirmDialog('New game?', 'This game is not finished yet. Start a new one anyway?', 'New game'))) return;
        this.stop();
        return this.onExit();
    }
  }

  private takeback() {
    if (this.result) return;
    const history = this.chess.history().length;
    let plies = 1;
    if (this.cfg.mode === 'bot') {
      if (this.botThinking) {
        plies = 1; // take back your own move while the bot is still thinking
      } else {
        plies = 2;
      }
      // Never undo the bot's opening move when you're Black.
      if (history - plies < this.basePly) return;
    } else if (history <= this.basePly) return;
    this.gameId++; // invalidates any bot search in progress
    this.board.skipAnimation();
    getEngine().cancelAll();
    this.botThinking = false;
    for (let i = 0; i < plies; i++) {
      this.chess.undo();
      this.clockHistory.pop();
    }
    this.clocks = { ...this.clockHistory[this.clockHistory.length - 1] };
    if (this.chess.history().length === 0) this.stopClock();
    this.viewPly = null;
    this.pre = null;
    this.openingName = '';
    for (let i = this.chess.history().length; i >= 0 && !this.openingName; i--) {
      const c = new Chess();
      this.chess.history().slice(0, i).forEach((san) => c.move(san));
      this.openingName = openingFor(c.fen())?.name ?? '';
    }
    this.renderOpening();
    this.board.setArrows([]);
    this.refresh(false);
    this.say('Move taken back. Have another think!');
  }

  private async hint() {
    if (!this.isUsersTurn()) return;
    const id = this.gameId;
    const ply = this.chess.history().length;
    this.say('Let me think…');
    const lines = await getEngine().analyse(this.chess.fen(), { depth: 12 });
    if (id !== this.gameId || ply !== this.chess.history().length || !lines[0]) return;
    const uci = lines[0].move;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const piece = this.chess.get(from);
    this.hintsUsed++;
    this.board.setArrows([{ from, to, color: 'rgba(40,180,90,0.85)' }]);
    this.say(`Try moving your ${piece ? pieceName(piece.type) : 'piece'} from ${from} to ${to}.`);
  }

  private async offerDraw() {
    if (this.result) return;
    if (this.cfg.mode === 'friend') {
      const other = colorName(this.chess.turn() === 'w' ? 'b' : 'w');
      if (await confirmDialog('Draw offer', `${colorName(this.chess.turn())} offers a draw. ${other}, do you accept?`, 'Accept draw', 'No thanks')) {
        this.finish({ winner: null, reason: 'agreement' });
      }
      return;
    }
    if (this.botThinking) return;
    const id = this.gameId;
    this.say(`${this.cfg.bot!.name} is thinking about your draw offer…`);
    const lines = await getEngine().analyse(this.chess.fen(), { depth: 10 });
    if (id !== this.gameId || this.result) return;
    // Score from the bot's point of view (it's the user's turn, so flip the sign).
    const botScore = -(lines[0]?.cp ?? 0);
    const moves = this.chess.history().length;
    if (botScore < -150 || (Math.abs(botScore) <= 60 && moves >= 40)) {
      this.finish({ winner: null, reason: 'agreement' });
    } else {
      this.say(`${this.cfg.bot!.name} says: "No thanks, let's keep playing!"`);
    }
  }

  // ---- move list navigation ----

  private navigate(nav: string) {
    const total = this.chess.history().length;
    const cur = this.viewPly ?? total;
    const target = nav === 'start' ? 0 : nav === 'prev' ? cur - 1 : nav === 'next' ? cur + 1 : total;
    this.setView(Math.max(0, Math.min(total, target)));
  }

  private setView(ply: number) {
    const total = this.chess.history().length;
    this.viewPly = ply >= total ? null : ply;
    this.refresh(false);
  }

  // ---- clocks ----

  private startClock() {
    if (this.tickTimer !== undefined) return;
    this.lastTick = performance.now();
    this.tickTimer = window.setInterval(() => this.tick(), 100);
  }

  private stopClock() {
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private tick() {
    const now = performance.now();
    if (this.board.isBusy()) {
      // Clocks pause while a move or battle is animating.
      this.lastTick = now;
      return;
    }
    const side = this.chess.turn();
    this.clocks[side] -= now - this.lastTick;
    this.lastTick = now;
    if (this.clocks[side] < 10_000 && !this.flagWarned[side]) {
      this.flagWarned[side] = true;
      sounds.lowTime();
    }
    if (this.clocks[side] <= 0) {
      this.clocks[side] = 0;
      const other = side === 'w' ? 'b' : 'w';
      // You can't win on time if you couldn't possibly checkmate.
      if (onlyKingOrMinor(this.chess, other)) this.finish({ winner: null, reason: 'time out with not enough pieces to win' });
      else this.finish({ winner: other, reason: `${colorName(side)} running out of time` });
    }
    this.renderClocks();
  }

  private renderClocks() {
    const bottom = this.board.getOrientation();
    const top: Color = bottom === 'w' ? 'b' : 'w';
    const running = this.tickTimer !== undefined && !this.result;
    for (const [side, color] of [['top', top], ['bottom', bottom]] as const) {
      const el = this.el.querySelector<HTMLElement>(`[data-side="${side}"] .clock`)!;
      const ms = this.clocks[color];
      el.textContent = formatClock(ms);
      el.classList.toggle('active', running && this.chess.turn() === color);
      el.classList.toggle('low', ms < 20_000);
    }
  }

  // ---- rendering ----

  private say(text: string) {
    this.el.querySelector('.bubble')!.textContent = text;
  }

  private refresh(animate: boolean) {
    const total = this.chess.history().length;
    const viewing = this.viewPly !== null;
    let pos = this.tentative ?? this.chess;
    let lastMove: Move | undefined = pos.history({ verbose: true }).at(-1);
    if (viewing) {
      const moves = this.chess.history({ verbose: true }).slice(0, this.viewPly!);
      pos = new Chess();
      moves.forEach((m) => pos.move(m.san));
      lastMove = moves[moves.length - 1];
    }
    const dests = new Map<Square, Square[]>();
    if (this.isUsersTurn()) {
      for (const m of pos.moves({ verbose: true })) {
        const list = dests.get(m.from) ?? [];
        if (!list.includes(m.to)) list.push(m.to);
        dests.set(m.from, list);
      }
    }
    const state: BoardState = {
      pieces: pos.board().map((row) => row.map((p) => (p ? { type: p.type, color: p.color } : null))),
      lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
      check: pos.inCheck() ? findKing(pos, pos.turn()) : null,
      dests,
      movable: this.isUsersTurn() ? pos.turn() : null,
    };
    this.board.setState(state, animate && !viewing && lastMove ? lastMove : null);
    this.el.classList.toggle('viewing-history', viewing && !this.review);
    if (this.review) this.showReviewMove(this.viewPly ?? total);
    // Start analysing as soon as it's your turn so the blunder check is quick.
    if (this.cfg.mode === 'bot' && coachingOn('blunderWarnings') && this.isUsersTurn() && this.pre?.fen !== pos.fen()) {
      this.pre = { fen: pos.fen(), lines: getEngine().analyse(pos.fen(), { depth: 10 }) };
    }
    this.renderPlayers(pos);
    this.renderMoves();
    this.renderClocks();
    this.renderButtons();
  }

  private renderPlayers(pos: Chess) {
    const bottom = this.board.getOrientation();
    const top: Color = bottom === 'w' ? 'b' : 'w';
    const material = materialCount(pos);
    for (const [side, color] of [['top', top], ['bottom', bottom]] as const) {
      const bar = this.el.querySelector(`[data-side="${side}"]`)!;
      let name: string;
      let avatar: string;
      if (this.cfg.mode === 'bot' && color !== this.cfg.playerColor) {
        name = `${this.cfg.bot!.name} (${this.cfg.bot!.rating})`;
        avatar = this.cfg.bot!.avatar;
      } else if (this.cfg.mode === 'bot') {
        name = `${profile.name} (${profile.rating})`;
        avatar = '🙂';
      } else {
        name = this.sideName(color);
        avatar = this.theme[color].pet || (color === 'w' ? '⚪' : '⚫');
      }
      bar.querySelector('.avatar')!.textContent = avatar;
      bar.querySelector('.pname')!.textContent = name;
      const other: Color = color === 'w' ? 'b' : 'w';
      const taken = material.captured[other]; // opponent pieces this side has taken
      const diff = material.score[color] - material.score[other];
      bar.querySelector('.captured')!.textContent = taken.map((t) => PIECE_ICONS[t]).join('') + (diff > 0 ? ` +${diff}` : '');
      bar.classList.toggle('to-move', !this.result && pos.turn() === color);
    }
  }

  /** "White", or the theme's team name in pass-and-play. */
  private sideName(c: Color): string {
    return this.theme.id === 'classic' ? colorName(c) : `${this.theme[c].name} (${colorName(c)})`;
  }

  private renderMoves() {
    const list = this.el.querySelector<HTMLElement>('.moves')!;
    const sans = this.chess.history();
    const current = this.viewPly ?? sans.length;
    const parts: string[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      const cell = (ply: number) => {
        if (!sans[ply - 1]) return '';
        const g = this.review?.moves[ply - 1]?.grade;
        const icon = g ? `<i style="color:${GRADE_INFO[g].color}">${GRADE_INFO[g].icon}</i>` : '';
        return `<span data-ply="${ply}" class="${ply === current ? 'cur' : ''}">${sans[ply - 1]}${icon}</span>`;
      };
      parts.push(`<li><em>${i / 2 + 1}.</em>${cell(i + 1)}${cell(i + 2)}</li>`);
    }
    list.innerHTML = parts.join('');
    // Scroll only the move list itself (scrollIntoView would also scroll the page and move the board).
    const cur = list.querySelector<HTMLElement>('.cur');
    if (cur) {
      const top = cur.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + cur.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + cur.offsetHeight - list.clientHeight;
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }

  private renderButtons() {
    const total = this.chess.history().length;
    const btn = (a: string) => this.el.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;
    const minPly = this.basePly;
    btn('undo').disabled = !!this.result || total <= minPly || (this.cfg.mode === 'bot' && !this.botThinking && total - 2 < minPly);
    btn('hint').disabled = !this.isUsersTurn();
    btn('draw').disabled = !!this.result || total < 2 || this.botThinking;
    btn('resign').disabled = !!this.result;
    btn('review').hidden = !this.result;
    btn('draw').hidden = btn('resign').hidden = !!this.result;
    btn('review').disabled = this.reviewing;
    const nav = (n: string) => this.el.querySelector<HTMLButtonElement>(`[data-nav="${n}"]`)!;
    const cur = this.viewPly ?? total;
    nav('start').disabled = nav('prev').disabled = cur === 0;
    nav('next').disabled = nav('end').disabled = cur >= total;
  }
}

// ---- helpers ----

const VALUE_OF = PIECE_VALUES;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function pieceName(t: string): string {
  return { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[t] ?? 'piece';
}

function findKing(c: Chess, color: Color): Square | null {
  return c.findPiece({ type: 'k', color })[0] ?? null;
}

function onlyKingOrMinor(c: Chess, color: Color): boolean {
  const pieces = c.board().flat().filter((p) => p && p.color === color && p.type !== 'k');
  return pieces.length === 0 || (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b'));
}

function materialCount(c: Chess) {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const onBoard = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number>, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number> };
  const score = { w: 0, b: 0 };
  for (const p of c.board().flat()) {
    if (!p || p.type === 'k') continue;
    onBoard[p.color][p.type]++;
    score[p.color] += PIECE_VALUES[p.type];
  }
  const captured: Record<Color, string[]> = { w: [], b: [] };
  for (const color of ['w', 'b'] as Color[]) {
    for (const t of ['p', 'n', 'b', 'r', 'q']) {
      for (let i = onBoard[color][t]; i < start[t]; i++) captured[color].push(t);
    }
  }
  return { score, captured };
}

function formatClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** The deepest named opening reached in a game. */
function openingOfMoves(c: Chess): { name: string } | null {
  const t = new Chess();
  let found: { name: string } | null = null;
  for (const san of c.history()) {
    t.move(san);
    found = openingFor(t.fen()) ?? found;
  }
  return found;
}
