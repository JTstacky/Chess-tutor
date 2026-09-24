// Learn section: guided play-along lessons, puzzles and endgame practice vs the computer.
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { Board } from './board';
import { explainConsequence, NAMES, winPercent } from './coach';
import { getEngine } from './engine';
import { CATEGORIES, LESSONS, type Lesson } from './lessons';
import { sounds } from './sound';
import { profile, recordLessonStars } from './storage';
import { confetti, showModal } from './ui';

const starsText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

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
        ${LESSONS.filter((l) => l.category === c.id).map((l) => `
          <button class="lesson-card" data-lesson="${l.id}">
            <span class="lesson-icon">${l.icon}</span>
            <b>${l.title}</b>
            <small>${l.side === 'b' ? 'Play as Black · ' : ''}${l.blurb}</small>
            <span class="stars ${profile.lessonStars[l.id] ? 'got' : ''}">${starsText(profile.lessonStars[l.id] ?? 0)}</span>
          </button>`).join('')}
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
  private lineIdx = 0;
  private ply = 0;
  private mistakes = 0;
  private hints = 0;
  private hintLevel = 0;
  private busy = false;
  private token = 0;
  private done = false;

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
        <ul class="tips" hidden></ul>
        <div class="controls lesson-controls">
          <button data-act="hint"><span>💡</span>Hint</button>
          <button data-act="restart"><span>🔁</span>Restart</button>
          <button data-act="next" hidden><span>➡️</span>Next</button>
          <button data-act="back"><span>📚</span>Lessons</button>
        </div>
      </div>`;
    this.board = new Board({ onMove: (f, t, p) => void this.userMove(f, t, p) });
    this.el.querySelector('.board-host')!.append(this.board.el);
    this.el.querySelector('.lesson-controls')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'hint') void this.hint();
      if (act === 'restart') this.start(this.lesson, this.lineIdx);
      if (act === 'next') this.startLine(this.lineIdx + 1);
      if (act === 'back') this.onBack();
    });
  }

  start(lesson: Lesson, lineIdx = 0) {
    this.lesson = lesson;
    if (lineIdx === 0) {
      this.mistakes = 0;
      this.hints = 0;
    }
    this.el.querySelector('.t')!.textContent = `${lesson.icon} ${lesson.title}`;
    this.board.setOrientation(lesson.side);
    const tips = this.el.querySelector<HTMLElement>('.tips')!;
    tips.hidden = !lesson.practice;
    tips.innerHTML = (lesson.practice?.tips ?? []).map((t) => `<li>${t}</li>`).join('');
    this.startLine(lineIdx);
  }

  stop() {
    this.token++;
    getEngine().cancelAll();
  }

  private get lines() {
    return this.lesson.lines ?? [];
  }

  private startLine(i: number) {
    this.token++;
    getEngine().cancelAll();
    this.lineIdx = i;
    this.ply = 0;
    this.hintLevel = 0;
    this.done = false;
    this.busy = false;
    this.chess = new Chess(this.lesson.fen);
    this.board.setArrows([]);
    this.board.setMarks([]);
    this.el.querySelector<HTMLElement>('[data-act="next"]')!.hidden = true;
    if (this.lesson.practice) {
      this.say(this.lesson.practice.intro);
      this.render();
      return;
    }
    const line = this.lines[i];
    this.say(line.intro ?? this.lesson.blurb);
    this.render();
    this.advance(line.intro ? 2200 : 1200);
  }

  // ---- guided lines ----

  private isMyTurn() {
    return !this.busy && !this.done && this.chess.turn() === this.lesson.side;
  }

  /** Auto-play the opponent's moves until it's your turn. */
  private advance(delay = 700) {
    const line = this.lines[this.lineIdx];
    const m = line.moves[this.ply];
    if (!m) return this.lineComplete();
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
      this.say(m.prompt ?? 'Your move! Which move do you think comes next?');
    }, this.ply === 0 ? 0 : Math.min(delay, 1200));
  }

  private async userMove(from: Square, to: Square, promotion?: string) {
    if (this.lesson.practice) return this.practiceMove(from, to, promotion);
    if (!this.isMyTurn()) return;
    const expected = this.lines[this.lineIdx].moves[this.ply];
    const test = new Chess(this.chess.fen());
    let mv: Move;
    try {
      mv = test.move({ from, to, promotion });
    } catch {
      return;
    }
    const expectedMate = expected.san.endsWith('#');
    const bare = (san: string) => san.replace(/[+#]/g, '');
    if (bare(mv.san) === bare(expected.san) || (expectedMate && test.isCheckmate())) {
      this.chess.move(mv.san);
      this.playSound(mv);
      this.ply++;
      this.hintLevel = 0;
      this.board.setArrows([]);
      this.board.setMarks([]);
      this.say(`✅ ${expected.note ?? 'Correct!'}`);
      this.render(true);
      this.advance(expected.note ? 2000 : 800);
      return;
    }
    // Wrong move: explain, then let them try again.
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
      this.say(`${mv.san} is a reasonable move, but in the ${this.lesson.title} we play something else here. Try again!`);
    }
    this.render();
  }

  private async hint() {
    if (this.done || this.busy) return;
    this.hints++;
    this.hintLevel++;
    let uci: string | undefined;
    if (this.lesson.practice) {
      const lines = await getEngine().analyse(this.chess.fen(), { depth: 14 });
      uci = lines[0]?.move;
      this.hintLevel = 2;
    } else {
      const expected = this.lines[this.lineIdx].moves[this.ply];
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

  private lineComplete() {
    this.done = true;
    this.render();
    if (this.lineIdx + 1 < this.lines.length) {
      sounds.win();
      const next = this.lines[this.lineIdx + 1];
      this.say(`🎉 Line complete! Next: "${next.title}". Tap Next when you're ready.`);
      this.el.querySelector<HTMLElement>('[data-act="next"]')!.hidden = false;
      return;
    }
    this.finishLesson(true);
  }

  private finishLesson(success: boolean, message = '') {
    this.done = true;
    this.render();
    if (!success) {
      sounds.lose();
      showModal('Oops! 😅', message, [
        { label: 'Try again', primary: true, onClick: () => this.start(this.lesson) },
        { label: 'Lessons', onClick: () => this.onBack() },
      ]);
      return;
    }
    const slips = this.mistakes + this.hints;
    const stars = slips === 0 ? 3 : slips <= 3 ? 2 : 1;
    recordLessonStars(this.lesson.id, stars);
    sounds.win();
    confetti();
    const idx = LESSONS.indexOf(this.lesson);
    const next = LESSONS[idx + 1];
    const praise = stars === 3 ? 'Perfect! No mistakes and no hints!' : stars === 2 ? 'Great job! Try again with no hints for 3 stars.' : 'You did it! Practise it again to earn more stars.';
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
      animate,
    );
    const progress = this.el.querySelector('.progress')!;
    if (this.lesson.practice) {
      progress.textContent = this.lesson.practice.goal === 'mate' ? 'Goal: checkmate' : 'Goal: make a queen';
    } else {
      const line = this.lines[this.lineIdx];
      const mine = line.moves.filter((_, i) => this.isStudentPly(i)).length;
      const doneMine = line.moves.slice(0, this.ply).filter((_, i) => this.isStudentPly(i)).length;
      progress.textContent = `${this.lines.length > 1 ? `Part ${this.lineIdx + 1}/${this.lines.length} · ` : ''}${doneMine}/${mine} moves`;
    }
    this.el.querySelector<HTMLButtonElement>('[data-act="hint"]')!.disabled = this.done;
  }

  private isStudentPly(i: number): boolean {
    const first = new Chess(this.lesson.fen).turn();
    const color = i % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
    return color === this.lesson.side;
  }
}
