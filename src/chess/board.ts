// Touch-friendly chess board: tap-to-move and drag-and-drop, legal move dots,
// highlights, arrows and a promotion picker.
import type { Color, PieceSymbol, Square } from 'chess.js';

export interface BoardPiece {
  type: PieceSymbol;
  color: Color;
}

export interface BoardState {
  pieces: (BoardPiece | null)[][]; // chess.js board(): [rank 8 .. rank 1][file a .. h]
  lastMove?: { from: Square; to: Square } | null;
  check?: Square | null;
  dests: Map<Square, Square[]>; // legal moves for the side that may move now
  movable: Color | null; // which colour the user may move; null = board locked
}

export interface Arrow {
  from: Square;
  to: Square;
  color?: string;
}

type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface BoardOptions {
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
}

const FILES = 'abcdefgh';
const pieceUrl = (p: BoardPiece) => `${import.meta.env.BASE_URL}pieces/${p.color}${p.type.toUpperCase()}.svg`;

export class Board {
  readonly el: HTMLElement;
  private squaresEl: HTMLElement;
  private piecesEl: HTMLElement;
  private arrowsEl: SVGSVGElement;
  private orientation: Color = 'w';
  private state: BoardState = { pieces: [], dests: new Map(), movable: null };
  private selected: Square | null = null;
  private arrows: Arrow[] = [];
  private marks: Square[] = [];
  private drag: { from: Square; el: HTMLElement; startX: number; startY: number; moved: boolean; wasSelected: boolean } | null = null;
  private promoting = false;

  constructor(private opts: BoardOptions) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.squaresEl = document.createElement('div');
    this.squaresEl.className = 'squares';
    this.piecesEl = document.createElement('div');
    this.piecesEl.className = 'pieces';
    this.arrowsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowsEl.classList.add('arrows');
    this.arrowsEl.setAttribute('viewBox', '0 0 8 8');
    this.el.append(this.squaresEl, this.piecesEl, this.arrowsEl);
    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.el.addEventListener('pointercancel', () => this.cancelDrag());
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setOrientation(c: Color) {
    this.orientation = c;
    this.render();
  }

  getOrientation(): Color {
    return this.orientation;
  }

  /** Update the position. `animate` slides the piece of the last move into place. */
  setState(state: BoardState, animate = false) {
    this.state = state;
    if (this.selected && !state.dests.has(this.selected)) this.selected = null;
    this.render(animate);
  }

  /** Glowing highlight on squares (used for hints). */
  setMarks(squares: Square[]) {
    this.marks = squares;
    this.render();
  }

  setArrows(arrows: Arrow[]) {
    this.arrows = arrows;
    this.renderArrows();
  }

  // ---- geometry ----

  private squareXY(sq: Square): [number, number] {
    const file = FILES.indexOf(sq[0]);
    const rank = Number(sq[1]) - 1;
    return this.orientation === 'w' ? [file, 7 - rank] : [7 - file, rank];
  }

  private squareAt(clientX: number, clientY: number): Square | null {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const file = this.orientation === 'w' ? x : 7 - x;
    const rank = this.orientation === 'w' ? 7 - y : y;
    return `${FILES[file]}${rank + 1}` as Square;
  }

  private pieceOn(sq: Square): BoardPiece | null {
    const file = FILES.indexOf(sq[0]);
    const rank = Number(sq[1]);
    return this.state.pieces[8 - rank]?.[file] ?? null;
  }

  // ---- rendering ----

  private render(animate = false) {
    const { lastMove, check } = this.state;
    const dests = this.selected ? this.state.dests.get(this.selected) ?? [] : [];
    const sqFrag = document.createDocumentFragment();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const file = this.orientation === 'w' ? x : 7 - x;
        const rank = this.orientation === 'w' ? 7 - y : y;
        const sq = `${FILES[file]}${rank + 1}` as Square;
        const d = document.createElement('div');
        d.className = `sq ${(file + rank) % 2 === 0 ? 'dark' : 'light'}`;
        d.dataset.sq = sq;
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) d.classList.add('last');
        if (this.selected === sq) d.classList.add('selected');
        if (check === sq) d.classList.add('check');
        if (this.marks.includes(sq)) d.classList.add('mark');
        if (dests.includes(sq)) d.classList.add(this.pieceOn(sq) ? 'dest-capture' : 'dest');
        if (x === 0) d.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank + 1}</span>`);
        if (y === 7) d.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[file]}</span>`);
        sqFrag.append(d);
      }
    }
    this.squaresEl.replaceChildren(sqFrag);

    const pFrag = document.createDocumentFragment();
    let animated: { el: HTMLElement; to: [number, number] } | null = null;
    this.state.pieces.forEach((row, r) =>
      row.forEach((p, f) => {
        if (!p) return;
        const sq = `${FILES[f]}${8 - r}` as Square;
        const img = document.createElement('img');
        img.className = 'piece';
        img.src = pieceUrl(p);
        img.alt = '';
        img.draggable = false;
        img.dataset.sq = sq;
        const [x, y] = this.squareXY(sq);
        if (animate && lastMove && lastMove.to === sq) {
          const [fx, fy] = this.squareXY(lastMove.from);
          img.style.transform = `translate(${fx * 100}%, ${fy * 100}%)`;
          animated = { el: img, to: [x, y] };
        } else {
          img.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
        }
        pFrag.append(img);
      }),
    );
    this.piecesEl.replaceChildren(pFrag);
    if (animated) {
      const { el, to } = animated as { el: HTMLElement; to: [number, number] };
      void el.offsetWidth; // flush the start position so the transition runs
      el.classList.add('animating');
      el.style.transform = `translate(${to[0] * 100}%, ${to[1] * 100}%)`;
    }
    this.renderArrows();
  }

  private renderArrows() {
    const parts: string[] = [];
    this.arrows.forEach((a, i) => {
      const [x1, y1] = this.squareXY(a.from).map((v) => v + 0.5);
      const [x2, y2] = this.squareXY(a.to).map((v) => v + 0.5);
      const color = a.color ?? 'rgba(255,170,0,0.85)';
      const len = Math.hypot(x2 - x1, y2 - y1);
      // Stop the shaft short so the arrow head lands in the middle of the square.
      const ex = x2 - ((x2 - x1) / len) * 0.3;
      const ey = y2 - ((y2 - y1) / len) * 0.3;
      parts.push(
        `<marker id="ah${i}" markerWidth="4" markerHeight="4" refX="1.2" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 z" fill="${color}"/></marker>`,
        `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="0.18" stroke-linecap="round" marker-end="url(#ah${i})"/>`,
      );
    });
    this.arrowsEl.innerHTML = parts.join('');
  }

  // ---- input ----

  private canMoveFrom(sq: Square): boolean {
    const p = this.pieceOn(sq);
    return !!p && p.color === this.state.movable && (this.state.dests.get(sq)?.length ?? 0) > 0;
  }

  private onPointerDown(e: PointerEvent) {
    if (this.promoting || e.button > 0) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (!sq) return;
    e.preventDefault();

    // Tap on a highlighted destination completes the move.
    if (this.selected && this.state.dests.get(this.selected)?.includes(sq)) {
      void this.tryMove(this.selected, sq);
      return;
    }

    if (this.canMoveFrom(sq)) {
      const wasSelected = this.selected === sq;
      this.selected = sq;
      this.render();
      const el = this.piecesEl.querySelector<HTMLElement>(`.piece[data-sq="${sq}"]`);
      if (el) {
        this.drag = { from: sq, el, startX: e.clientX, startY: e.clientY, moved: false, wasSelected };
        this.el.setPointerCapture(e.pointerId);
      }
    } else if (this.selected) {
      this.selected = null;
      this.render();
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.drag) return;
    const { el, startX, startY } = this.drag;
    if (!this.drag.moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
    this.drag.moved = true;
    const r = this.el.getBoundingClientRect();
    const size = r.width / 8;
    el.classList.add('dragging');
    el.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px) scale(1.15)`;
    const over = this.squareAt(e.clientX, e.clientY);
    this.squaresEl.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'));
    if (over) this.squaresEl.querySelector(`[data-sq="${over}"]`)?.classList.add('drag-over');
  }

  private onPointerUp(e: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const target = this.squareAt(e.clientX, e.clientY);
    if (drag.moved) {
      if (target && this.state.dests.get(drag.from)?.includes(target)) {
        void this.tryMove(drag.from, target);
      } else {
        if (target !== drag.from) this.selected = null;
        this.render();
      }
    } else if (drag.wasSelected) {
      // Tapping the selected piece again deselects it.
      this.selected = null;
      this.render();
    }
  }

  private cancelDrag() {
    this.drag = null;
    this.render();
  }

  private async tryMove(from: Square, to: Square) {
    this.selected = null;
    const p = this.pieceOn(from);
    let promotion: PromotionPiece | undefined;
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
      const choice = await this.choosePromotion(p.color, to);
      if (!choice) {
        this.render();
        return;
      }
      promotion = choice;
    }
    this.opts.onMove(from, to, promotion);
  }

  private choosePromotion(color: Color, to: Square): Promise<PromotionPiece | null> {
    this.promoting = true;
    return new Promise((resolve) => {
      const [x] = this.squareXY(to);
      const box = document.createElement('div');
      box.className = 'promotion';
      const fromTop = this.squareXY(to)[1] === 0;
      box.style.left = `${x * 12.5}%`;
      box.style[fromTop ? 'top' : 'bottom'] = '0';
      const finish = (v: PromotionPiece | null) => {
        this.promoting = false;
        overlay.remove();
        resolve(v);
      };
      (['q', 'n', 'r', 'b'] as PromotionPiece[]).forEach((t) => {
        const b = document.createElement('button');
        b.innerHTML = `<img src="${pieceUrl({ type: t, color })}" alt="${t}">`;
        b.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          finish(t);
        });
        box.append(b);
      });
      const overlay = document.createElement('div');
      overlay.className = 'promotion-overlay';
      overlay.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        finish(null);
      });
      overlay.append(box);
      this.el.append(overlay);
    });
  }
}
