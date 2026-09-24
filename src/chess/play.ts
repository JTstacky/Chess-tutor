// The game screen: vs a bot or pass-and-play, with clocks, takeback, hints, draw and resign.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board, type BoardState } from './board';
import { BOTS, botMove, type Bot } from './bots';
import { getEngine } from './engine';
import { sounds } from './sound';
import { profile, recordBotResult, settings } from './storage';
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
        <div class="controls">
          <button data-act="undo" title="Take back"><span>↶</span>Take back</button>
          <button data-act="hint" title="Hint"><span>💡</span>Hint</button>
          <button data-act="flip" title="Flip board"><span>🔄</span>Flip</button>
          <button data-act="draw" title="Offer draw"><span>🤝</span>Draw</button>
          <button data-act="resign" title="Resign"><span>🏳️</span>Resign</button>
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
    getEngine().cancelAll();
    this.chess = new Chess();
    this.result = null;
    this.viewPly = null;
    this.botThinking = false;
    this.hintsUsed = 0;
    this.flagWarned = { w: false, b: false };
    const ms = cfg.time.minutes * 60_000;
    this.clocks = { w: ms, b: ms };
    this.clockHistory = [{ ...this.clocks }];
    this.stopClock();
    this.board.setArrows([]);
    this.board.setOrientation(cfg.playerColor);
    this.el.classList.toggle('no-clock', cfg.time.minutes === 0);
    this.el.querySelector<HTMLElement>('[data-act="hint"]')!.hidden =
      !(settings.coaching && settings.hints && cfg.mode === 'bot');
    this.el.querySelector<HTMLElement>('[data-act="draw"]')!.hidden = false;
    this.refresh(false);
    if (cfg.mode === 'bot' && cfg.playerColor === 'b') {
      this.say(`${cfg.bot!.name} plays first. You're Black!`);
      void this.playBot();
    } else if (cfg.mode === 'bot') {
      this.say(`You're White, so you move first. Good luck against ${cfg.bot!.name}!`);
    } else {
      this.say('Pass and play! White moves first. Hand the device over after each move.');
    }
  }

  stop() {
    this.gameId++;
    this.stopClock();
    getEngine().cancelAll();
  }

  // ---- moves ----

  private isUsersTurn(): boolean {
    if (this.result || this.viewPly !== null) return false;
    if (this.cfg.mode === 'friend') return true;
    return !this.botThinking && this.chess.turn() === this.cfg.playerColor;
  }

  private userMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') {
    if (!this.isUsersTurn()) return;
    this.makeMove({ from, to, promotion });
    if (!this.result && this.cfg.mode === 'bot') void this.playBot();
  }

  private makeMove(m: { from: string; to: string; promotion?: string }): Move | null {
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
    if (this.chess.isCheck()) sounds.check();
    else if (move.captured) sounds.capture();
    else sounds.move();
    this.checkGameOver();
    this.refresh(true);
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
    // Ignore stale answers after a takeback, new game or leaving the screen.
    if (id !== this.gameId || ply !== this.chess.history().length || this.result) return;
    this.botThinking = false;
    this.makeMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }

  private commentOnMove(move: Move) {
    const botGame = this.cfg.mode === 'bot';
    const yourTurn = !botGame || this.chess.turn() === this.cfg.playerColor;
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
      if (score === 1) {
        sounds.win();
        confetti();
      } else if (score === 0.5) sounds.draw();
      else sounds.lose();
    } else {
      title = result.winner ? `${colorName(result.winner)} wins! 🎉` : 'Draw 🤝';
      if (result.winner) {
        sounds.win();
        confetti();
      } else sounds.draw();
    }
    this.say(title.replace(/<[^>]+>/g, ''));
    showModal(title, body, [
      { label: 'Play again', primary: true, onClick: () => this.start(this.cfg) },
      { label: 'Look at the game', onClick: () => {} },
      { label: 'Menu', onClick: () => this.onExit() },
    ]);
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
      if (history - plies < (this.cfg.playerColor === 'b' ? 1 : 0)) return;
    } else if (history === 0) return;
    this.gameId++; // invalidates any bot search in progress
    getEngine().cancelAll();
    this.botThinking = false;
    for (let i = 0; i < plies; i++) {
      this.chess.undo();
      this.clockHistory.pop();
    }
    this.clocks = { ...this.clockHistory[this.clockHistory.length - 1] };
    if (this.chess.history().length === 0) this.stopClock();
    this.viewPly = null;
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
    let pos = this.chess;
    let lastMove: Move | undefined = this.chess.history({ verbose: true })[total - 1];
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
    this.board.setState(state, animate);
    this.el.classList.toggle('viewing-history', viewing);
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
        name = colorName(color);
        avatar = color === 'w' ? '⚪' : '⚫';
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

  private renderMoves() {
    const list = this.el.querySelector('.moves')!;
    const sans = this.chess.history();
    const current = this.viewPly ?? sans.length;
    const parts: string[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      const cell = (ply: number) =>
        sans[ply - 1] ? `<span data-ply="${ply}" class="${ply === current ? 'cur' : ''}">${sans[ply - 1]}</span>` : '';
      parts.push(`<li><em>${i / 2 + 1}.</em>${cell(i + 1)}${cell(i + 2)}</li>`);
    }
    list.innerHTML = parts.join('');
    list.querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private renderButtons() {
    const total = this.chess.history().length;
    const btn = (a: string) => this.el.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;
    const minPly = this.cfg.mode === 'bot' && this.cfg.playerColor === 'b' ? 1 : 0;
    btn('undo').disabled = !!this.result || total <= minPly || (this.cfg.mode === 'bot' && !this.botThinking && total - 2 < minPly);
    btn('hint').disabled = !this.isUsersTurn();
    btn('draw').disabled = !!this.result || total < 2 || this.botThinking;
    btn('resign').disabled = !!this.result;
    const nav = (n: string) => this.el.querySelector<HTMLButtonElement>(`[data-nav="${n}"]`)!;
    const cur = this.viewPly ?? total;
    nav('start').disabled = nav('prev').disabled = cur === 0;
    nav('next').disabled = nav('end').disabled = cur >= total;
  }
}

// ---- helpers ----

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
