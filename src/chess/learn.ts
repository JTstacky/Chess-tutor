// Learn section: branching play-along lessons, puzzles and endgame practice vs the computer.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board } from './board';
import { explainConsequence, NAMES, winPercent } from './coach';
import { getEngine } from './engine';
import { branchesOnPath, CATEGORIES, leafPaths, LESSONS, type Branch, type Lesson, type LessonMove } from './lessons';
import { sounds } from './sound';
import { profile, recordLessonExplored, recordLessonStars } from './storage';
import { confetti, showModal } from './ui';

const starsText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const pathKey = (p: number[]) => p.join('.');

function variationCount(l: Lesson) {
  return l.tree ? leafPaths(l.tree).length : 1;
}

export function learnMenu(open: (l: Lesson) => void): HTMLElement {
  const v = document.createElement('section');
  v.className = 'view setup learn';
  v.dataset.view = 'learn';
  const total = LESSONS.length * 3;
  const got = LESSONS.reduce((n, l) => n + (profile.lessonStars[l.id] ?? 0), 0);
  v.innerHTML = `<h2>📚 Learn</h2><p class="star-total">⭐ ${got} / ${total} stars</p>` +
    CATEGORIES.map((c) => `
      <h3>${c.icon} ${c.title} <small>${c.blurb}</small></h3>
      <div class="lesson-grid">
        ${LESSONS.filter((l) => l.category === c.id).map((l) => {
          const vars = variationCount(l);
          const seen = Math.min(vars, profile.lessonExplored[l.id]?.length ?? 0);
          const varText = vars > 1 ? `<span class="vars">${seen ? `${seen}/${vars}` : vars} variations</span>` : '';
          return `
          <button class="lesson-card" data-lesson="${l.id}">
            <span class="lesson-icon">${l.icon}</span>
            <b>${l.title}</b>
            <small>${l.side === 'b' ? 'Play as Black · ' : ''}${l.blurb}</small>
            ${varText}
            <span class="stars ${profile.lessonStars[l.id] ? 'got' : ''}">${starsText(profile.lessonStars[l.id] ?? 0)}</span>
          </button>`;
        }).join('')}
      </div>`).join('');
  v.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson;
    const l = LESSONS.find((x) => x.id === id);
    if (l) open(l);
  });
  return v;
}

export class LessonScreen {
  readonly el: HTMLElement;
  private board: Board;
  private lesson!: Lesson;
  private chess = new Chess();
  private path: number[] = []; // options chosen so far
  private moves: LessonMove[] = []; // all moves along the current path
  private ply = 0;
  private explored = new Set<string>();
  private mistakes = 0;
  private hints = 0;
  private hintLevel = 0;
  private busy = false;
  private token = 0;
  private done = false;
  private choosing = false;

  constructor(private onBack: () => void, private onNext: (l: Lesson) => void) {
    this.el = document.createElement('section');
    this.el.className = 'view play lesson';
    this.el.dataset.view = 'lesson';
    this.el.innerHTML = `
      <div class="board-col">
        <div class="lesson-title"><span class="t"></span><span class="progress"></span></div>
        <div class="board-host"></div>
      </div>
      <div class="side-col">
        <div class="coach"><div class="mascot">🦉</div><div class="bubble"></div></div>
        <div class="choices" hidden></div>
        <ul class="tips" hidden></ul>
        <div class="controls lesson-controls">
          <button data-act="hint"><span>💡</span>Hint</button>
          <button data-act="restart"><span>🔁</span>Restart</button>
          <button data-act="explore" hidden><span>🔀</span>More</button>
          <button data-act="back"><span>📚</span>Lessons</button>
        </div>
      </div>`;
    this.board = new Board({ onMove: (f, t, p) => void this.userMove(f, t, p), plain: true });
    this.el.querySelector('.board-host')!.append(this.board.el);
    this.el.querySelector('.lesson-controls')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'hint') void this.hint();
      if (act === 'restart') this.restart();
      if (act === 'explore') this.exploreMore();
      if (act === 'back') this.onBack();
    });
    this.el.querySelector('.choices')!.addEventListener('click', (e) => {
      const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')?.dataset.opt;
      if (opt === undefined) return;
      this.choose(opt === 'random' ? this.randomOption() : Number(opt));
    });
  }

  start(lesson: Lesson) {
    this.lesson = lesson;
    this.mistakes = 0;
    this.hints = 0;
    this.explored = new Set(profile.lessonExplored[lesson.id] ?? []);
    // Finished everything before? Start a fresh round so stars can be earned again.
    if (lesson.tree && this.explored.size >= variationCount(lesson)) this.explored.clear();
    this.el.querySelector('.t')!.textContent = `${lesson.icon} ${lesson.title}`;
    this.board.setOrientation(lesson.side);
    const tips = this.el.querySelector<HTMLElement>('.tips')!;
    tips.hidden = !lesson.practice;
    tips.innerHTML = (lesson.practice?.tips ?? []).map((t) => `<li>${t}</li>`).join('');
    this.restart();
  }

  stop() {
    this.token++;
    getEngine().cancelAll();
  }

  private reset() {
    this.token++;
    getEngine().cancelAll();
    this.hintLevel = 0;
    this.done = false;
    this.busy = false;
    this.choosing = false;
    this.board.setArrows([]);
    this.board.setMarks([]);
    this.showChoices(false);
    this.el.querySelector<HTMLElement>('[data-act="explore"]')!.hidden = true;
  }

  private restart() {
    this.reset();
    this.chess = new Chess(this.lesson.fen);
    if (this.lesson.practice) {
      this.say(this.lesson.practice.intro);
      this.render();
      return;
    }
    this.path = [];
    this.moves = [...this.lesson.tree!.moves];
    this.ply = 0;
    const intro = this.lesson.tree!.intro;
    this.say(intro ?? this.lesson.blurb);
    this.render();
    this.advance(intro ? 2200 : 1200);
  }

  // ---- tree navigation ----

  private get branches(): Branch[] {
    return branchesOnPath(this.lesson.tree!, this.path);
  }

  private unexploredUnder(prefix: number[]): number {
    const b = branchesOnPath(this.lesson.tree!, prefix).at(-1)!;
    return leafPaths(b, prefix).filter((p) => !this.explored.has(pathKey(p))).length;
  }

  private showChoice() {
    const choice = this.branches.at(-1)!.then!;
    this.choosing = true;
    this.say(`🤔 ${choice.ask}`);
    const box = this.el.querySelector<HTMLElement>('.choices')!;
    box.innerHTML =
      choice.options
        .map((o, i) => {
          const left = this.unexploredUnder([...this.path, i]);
          return `<button class="choice ${left ? '' : 'seen'}" data-opt="${i}">${left ? '' : '✅ '}${o.label}</button>`;
        })
        .join('') + `<button class="choice random" data-opt="random">🎲 Surprise me</button>`;
    this.showChoices(true);
    this.render();
  }

  private showChoices(show: boolean) {
    this.el.querySelector<HTMLElement>('.choices')!.hidden = !show;
  }

  private randomOption(): number {
    const opts = this.branches.at(-1)!.then!.options;
    const fresh = opts.map((_, i) => i).filter((i) => this.unexploredUnder([...this.path, i]) > 0);
    const pool = fresh.length ? fresh : opts.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private choose(i: number) {
    if (!this.choosing) return;
    this.choosing = false;
    this.showChoices(false);
    this.path = [...this.path, i];
    const b = this.branches.at(-1)!;
    this.moves = [...this.moves, ...b.moves];
    if (b.intro) this.say(b.intro);
    this.render();
    this.advance(b.intro ? 1800 : 400);
  }

  /** Jump back to the nearest decision point that still has unexplored variations. */
  private exploreMore() {
    let depth = this.path.length - 1;
    while (depth >= 0 && this.unexploredUnder(this.path.slice(0, depth)) === 0) depth--;
    if (depth < 0) return;
    this.reset();
    this.path = this.path.slice(0, depth);
    this.moves = this.branches.flatMap((b) => b.moves);
    this.chess = new Chess(this.lesson.fen);
    for (const m of this.moves) this.chess.move(m.san);
    this.ply = this.moves.length;
    this.showChoice();
  }

  // ---- guided moves ----

  private isMyTurn() {
    return !this.busy && !this.done && !this.choosing && this.chess.turn() === this.lesson.side;
  }

  /** Auto-play the opponent's moves until it's your turn, a choice, or the end of a variation. */
  private advance(delay = 700) {
    const m = this.moves[this.ply];
    if (!m) {
      const b = this.branches.at(-1)!;
      if (!b.then) return this.variationComplete();
      this.busy = true;
      const t = this.token;
      setTimeout(() => {
        if (t !== this.token) return;
        this.busy = false;
        this.showChoice();
      }, Math.min(delay, 1600));
      return;
    }
    if (this.chess.turn() !== this.lesson.side) {
      this.busy = true;
      this.render();
      const t = this.token;
      setTimeout(() => {
        if (t !== this.token) return;
        const mv = this.chess.move(m.san);
        this.playSound(mv);
        this.ply++;
        if (m.note) this.say(m.note);
        this.render(true);
        this.advance(m.note ? 1800 : 700);
      }, delay);
      return;
    }
    // Your move: the board is ready now; the prompt appears after time to read the last note.
    this.busy = false;
    this.render();
    const t = this.token;
    const ply = this.ply;
    setTimeout(() => {
      if (t !== this.token || ply !== this.ply) return;
      const demo = m.demo ? '🪤 ' : '';
      this.say(demo + (m.prompt ?? 'Your move! Which move do you think comes next?'));
    }, this.ply === 0 ? 0 : Math.min(delay, 1200));
  }

  private async userMove(from: Square, to: Square, promotion?: string) {
    if (this.lesson.practice) return this.practiceMove(from, to, promotion);
    if (!this.isMyTurn()) return;
    const expected = this.moves[this.ply];
    const test = new Chess(this.chess.fen());
    let mv: Move;
    try {
      mv = test.move({ from, to, promotion });
    } catch {
      return;
    }
    const bare = (san: string) => san.replace(/[+#]/g, '');
    if (bare(mv.san) === bare(expected.san) || (expected.san.endsWith('#') && test.isCheckmate())) {
      this.chess.move(mv.san);
      this.playSound(mv);
      this.ply++;
      this.hintLevel = 0;
      this.board.setArrows([]);
      this.board.setMarks([]);
      this.say(`${expected.demo ? '🪤' : '✅'} ${expected.note ?? 'Correct!'}`);
      this.render(true);
      this.advance(expected.note ? 2000 : 800);
      return;
    }
    // Wrong move: explain, then let them try again. (In a trap demo it's just "play the shown move".)
    if (expected.demo) {
      this.say(`🪤 For this demo, play ${expected.san}. ${expected.prompt ?? ''}`);
      return this.render();
    }
    this.mistakes++;
    sounds.lose();
    const handWritten = expected.wrong?.[mv.san];
    if (handWritten) {
      this.say(`🤔 ${handWritten}`);
      return this.render();
    }
    this.busy = true;
    this.render();
    this.say('Hmm, let me look at that move…');
    const t = this.token;
    const lines = await getEngine().analyse(test.fen(), { depth: 10 });
    if (t !== this.token) return;
    this.busy = false;
    const oppCp = lines[0]?.cp ?? 0;
    const opp = this.lesson.side === 'w' ? 'Black' : 'White';
    if (winPercent(oppCp) > 65) {
      const why = explainConsequence(test.fen(), lines[0], this.lesson.side, opp);
      this.say(`😬 Careful! ${why} Try another move.`);
      const r = lines[0]?.pv[0];
      if (r) this.board.setArrows([{ from: r.slice(0, 2) as Square, to: r.slice(2, 4) as Square, color: 'rgba(220,50,50,0.8)' }]);
    } else if (this.lesson.category === 'puzzles') {
      this.say('Not quite! There\'s a stronger move. Look for checks, captures and attacks.');
    } else {
      this.say(`${mv.san} is a reasonable move, but in this line we play something else. Try again!`);
    }
    this.render();
  }

  private async hint() {
    if (this.done || this.busy) return;
    if (this.choosing) {
      this.say('Pick one of the options below! Each one teaches a different way the game can go.');
      return;
    }
    this.hints++;
    this.hintLevel++;
    let uci: string | undefined;
    if (this.lesson.practice) {
      const lines = await getEngine().analyse(this.chess.fen(), { depth: 14 });
      uci = lines[0]?.move;
      this.hintLevel = 2;
    } else {
      const expected = this.moves[this.ply];
      if (!expected) return;
      const mv = new Chess(this.chess.fen()).move(expected.san);
      uci = mv.from + mv.to;
    }
    if (!uci) return;
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const piece = this.chess.get(from);
    if (this.hintLevel === 1) {
      this.board.setMarks([from]);
      this.say(`💡 Try moving your ${piece ? NAMES[piece.type] : 'piece'} on ${from}. Tap Hint again for more help.`);
    } else {
      this.board.setMarks([]);
      this.board.setArrows([{ from, to, color: 'rgba(40,180,90,0.85)' }]);
      this.say(`💡 Move your ${piece ? NAMES[piece.type] : 'piece'} from ${from} to ${to}.`);
    }
  }

  private variationComplete() {
    this.done = true;
    this.explored.add(pathKey(this.path));
    recordLessonExplored(this.lesson.id, [...this.explored]);
    const total = variationCount(this.lesson);
    this.render();
    if (this.explored.size < total) {
      sounds.win();
      const label = this.branches.slice(1).map((b) => b.label).join(' → ');
      this.say(`🎉 Variation complete${label ? `: ${label}` : ''}! You've explored ${this.explored.size} of ${total}. Tap "More" to learn another one.`);
      this.el.querySelector<HTMLElement>('[data-act="explore"]')!.hidden = false;
      return;
    }
    this.finishLesson(true, total > 1 ? `You explored all ${total} variations!` : '');
  }

  private finishLesson(success: boolean, message = '') {
    this.done = true;
    this.render();
    if (!success) {
      sounds.lose();
      showModal('Oops! 😅', message, [
        { label: 'Try again', primary: true, onClick: () => this.restart() },
        { label: 'Lessons', onClick: () => this.onBack() },
      ]);
      return;
    }
    const slips = this.mistakes + this.hints;
    const perfect = Math.max(1, Math.ceil(variationCount(this.lesson) / 2)); // allow a slip or two in big lessons
    const stars = slips === 0 ? 3 : slips <= 2 + perfect ? 2 : 1;
    recordLessonStars(this.lesson.id, stars);
    sounds.win();
    confetti();
    const idx = LESSONS.indexOf(this.lesson);
    const next = LESSONS[idx + 1];
    const praise = stars === 3 ? 'Perfect! No mistakes and no hints!' : stars === 2 ? 'Great job! Try again with fewer hints for 3 stars.' : 'You did it! Practise it again to earn more stars.';
    this.say(`🎉 ${this.lesson.title} complete!`);
    showModal(`${this.lesson.title} complete!`, `<p class="big-stars">${starsText(stars)}</p><p>${message ? message + ' ' : ''}${praise}</p>`, [
      ...(next ? [{ label: `Next: ${next.title}`, primary: true, onClick: () => this.onNext(next) }] : []),
      { label: 'Again', onClick: () => this.start(this.lesson) },
      { label: 'Lessons', onClick: () => this.onBack() },
    ]);
  }

  // ---- endgame practice vs the computer ----

  private async practiceMove(from: Square, to: Square, promotion?: string) {
    if (!this.isMyTurn()) return;
    let mv: Move;
    try {
      mv = this.chess.move({ from, to, promotion });
    } catch {
      return;
    }
    this.playSound(mv);
    this.board.setArrows([]);
    this.board.setMarks([]);
    this.render(true);
    if (this.checkPracticeEnd(mv)) return;
    this.busy = true;
    this.render();
    const t = this.token;
    const [lines] = await Promise.all([
      getEngine().analyse(this.chess.fen(), { depth: 12 }),
      new Promise((r) => setTimeout(r, 500)),
    ]);
    if (t !== this.token || !lines[0]) return;
    const reply = this.chess.move({ from: lines[0].move.slice(0, 2), to: lines[0].move.slice(2, 4), promotion: lines[0].move[4] });
    this.playSound(reply);
    this.busy = false;
    this.render(true);
    if (reply.captured) {
      return this.finishLesson(false, `Black captured your ${NAMES[reply.captured]}! Keep your pieces protected or far from the enemy king.`);
    }
    if (this.chess.isDraw()) return this.finishLesson(false, 'That\'s a draw. Try to be quicker next time!');
    this.say(this.chess.inCheck() ? 'Check!' : 'Your move!');
  }

  private checkPracticeEnd(mv: Move): boolean {
    const goal = this.lesson.practice!.goal;
    if (this.chess.isCheckmate()) {
      this.finishLesson(true, 'Checkmate!');
      return true;
    }
    if (this.chess.isStalemate()) {
      this.finishLesson(false, 'Stalemate! Black\'s king has no moves but is NOT in check, so it\'s only a draw. Always leave the king a square until you give checkmate.');
      return true;
    }
    if (this.chess.isDraw()) {
      this.finishLesson(false, 'That\'s a draw. Try to be quicker next time!');
      return true;
    }
    if (goal === 'promote' && mv.promotion) {
      const opp: Color = this.lesson.side === 'w' ? 'b' : 'w';
      const attacked = this.chess.attackers(mv.to, opp).length > 0;
      const defended = this.chess.attackers(mv.to, this.lesson.side).length > 0;
      if (attacked && !defended) {
        this.finishLesson(false, 'You made a queen, but the king can just take it! Promote when your king protects the new queen.');
      } else {
        this.finishLesson(true, `You made a ${NAMES[mv.promotion]}!`);
      }
      return true;
    }
    return false;
  }

  // ---- rendering ----

  private playSound(m: Move) {
    if (m.san.includes('+') || m.san.includes('#')) sounds.check();
    else if (m.captured) sounds.capture();
    else sounds.move();
  }

  private say(text: string) {
    this.el.querySelector('.bubble')!.textContent = text;
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
        pieces: this.chess.board().map((r) => r.map((p) => (p ? { type: p.type, color: p.color } : null))),
        lastMove: last ? { from: last.from, to: last.to } : null,
        check: king ?? null,
        dests,
        movable: this.isMyTurn() ? this.lesson.side : null,
      },
      animate ? last : null,
    );
    const progress = this.el.querySelector('.progress')!;
    if (this.lesson.practice) {
      progress.textContent = this.lesson.practice.goal === 'mate' ? 'Goal: checkmate' : 'Goal: make a queen';
    } else {
      const total = variationCount(this.lesson);
      const first = new Chess(this.lesson.fen).turn();
      const mineDone = this.moves.slice(0, this.ply).filter((_, i) => (i % 2 === 0) === (first === this.lesson.side)).length;
      progress.textContent = `${total > 1 ? `${this.explored.size}/${total} variations · ` : ''}move ${mineDone}`;
    }
    this.el.querySelector<HTMLButtonElement>('[data-act="hint"]')!.disabled = this.done;
  }
}
