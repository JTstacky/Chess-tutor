// Theme characters: every team draws its pieces as its own creatures (robots, aliens, dragons…).
// Each piece type keeps the headgear that makes it easy to recognise on the board:
// King = crown with a cross, Queen = crown with balls, Rook = castle battlements,
// Bishop = pointed mitre, Knight = a horse-like head, Pawn = small and bare-headed.
import type { PieceSymbol } from 'chess.js';

type Draw = (l: Layout, t: PieceSymbol, eyes: boolean) => string;

export interface CharacterStyle {
  skin: [string, string]; // head (and body for creatures), top to bottom
  body: [string, string]; // outfit or torso
  line: string;
  accent: string; // crowns, trims
  accent2: string; // second trim colour
  head?: Draw; // head shape (default: circle)
  face?: Draw; // eyes and mouth (default: cartoon eyes and a smile)
  behind?: Draw; // drawn behind the head and body (wings, frills, fins)
  extras?: Draw; // drawn on top of the head (ears, horns, antennae)
  bodyExtras?: Draw; // decoration on the body
  hatColor?: string;
  knight: (eyes: boolean) => string; // the knight is drawn whole
}

export interface Layout {
  cx: number;
  hy: number; // head centre
  hr: number; // head radius
  top: number; // top of the body
  w1: number; // body width at the top
  w2: number; // body width at the bottom
}

const CX = 22.5;
const BOTTOM = 39;
export const LAYOUT: Record<Exclude<PieceSymbol, 'n'>, Layout> = {
  p: { cx: CX, hy: 23.8, hr: 8, top: 30, w1: 12, w2: 22 },
  b: { cx: CX, hy: 22.5, hr: 8, top: 28.5, w1: 13, w2: 25 },
  r: { cx: CX, hy: 22.2, hr: 8.3, top: 28, w1: 23, w2: 26 },
  q: { cx: CX, hy: 22.2, hr: 8.3, top: 28.5, w1: 14, w2: 30 },
  k: { cx: CX, hy: 22.5, hr: 8.6, top: 29, w1: 15, w2: 30 },
};

/** Where the eyes are (for the googly eyes in battles), in % of the picture. */
export function characterEyes(t: PieceSymbol): { at: [number, number][]; size: number } {
  if (t === 'n') return { at: [[32, 35]], size: 12 };
  const l = LAYOUT[t];
  const dx = l.hr * 0.4;
  const y = ((l.hy - l.hr * 0.05) / 45) * 100;
  return { at: [[((l.cx - dx) / 45) * 100, y], [((l.cx + dx) / 45) * 100, y]], size: ((l.hr * 0.62) / 45) * 100 };
}

const f = (n: number) => +n.toFixed(2);

// ---- shared parts ----

function eyePair(l: Layout, eyes: boolean, iris = '#1b1b2f', white = '#fff', stroke = '#1b1b2f'): string {
  if (!eyes) return '';
  const dx = l.hr * 0.4;
  const y = l.hy - l.hr * 0.05;
  const r = l.hr * 0.3;
  return [-1, 1]
    .map((s) => {
      const x = l.cx + s * dx;
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${white}" stroke="${stroke}" stroke-width="0.6"/>` +
        `<circle cx="${f(x + r * 0.15)}" cy="${f(y + r * 0.1)}" r="${f(r * 0.55)}" fill="${iris}"/>` +
        `<circle cx="${f(x + r * 0.35)}" cy="${f(y - r * 0.2)}" r="${f(r * 0.2)}" fill="#fff"/>`;
    })
    .join('');
}

function smile(l: Layout, color: string, wide = 1): string {
  const y = l.hy + l.hr * 0.42;
  const w = l.hr * 0.38 * wide;
  return `<path d="M${f(l.cx - w)} ${f(y)} Q${l.cx} ${f(y + l.hr * 0.35)} ${f(l.cx + w)} ${f(y)}" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round"/>`;
}

function cheeks(l: Layout, color = 'rgba(255,120,150,0.45)'): string {
  const y = l.hy + l.hr * 0.3;
  return [-1, 1].map((s) => `<ellipse cx="${f(l.cx + s * l.hr * 0.66)}" cy="${f(y)}" rx="${f(l.hr * 0.18)}" ry="${f(l.hr * 0.12)}" fill="${color}"/>`).join('');
}

const defaultFace: Draw = (l, _t, eyes) => eyePair(l, eyes) + smile(l, '#3a2230') + cheeks(l);

function bodyPath(l: Layout, t: PieceSymbol): string {
  const { cx, top, w1, w2 } = l;
  if (t === 'r') {
    // A tower: straight sides.
    return `M${f(cx - w1 / 2)} ${top} L${f(cx - w2 / 2)} ${BOTTOM} H${f(cx + w2 / 2)} L${f(cx + w1 / 2)} ${top} Z`;
  }
  const mid = (top + BOTTOM) / 2;
  return `M${f(cx - w1 / 2)} ${top} Q${f(cx - w1 / 2 - 1)} ${f(mid)} ${f(cx - w2 / 2)} ${BOTTOM} H${f(cx + w2 / 2)} Q${f(cx + w1 / 2 + 1)} ${f(mid)} ${f(cx + w1 / 2)} ${top} Z`;
}

function base(l: Layout, s: CharacterStyle): string {
  const w = l.w2 + 3;
  return `<rect x="${f(l.cx - w / 2)}" y="${BOTTOM - 1}" width="${f(w)}" height="4" rx="2" fill="${s.body[1]}" stroke="${s.line}" stroke-width="1.2"/>`;
}

function rookBricks(l: Layout, color: string): string {
  const rows = [31, 34.5];
  return rows
    .map((y, i) => {
      const half = l.w1 / 2 + ((y - l.top) / (BOTTOM - l.top)) * ((l.w2 - l.w1) / 2);
      let d = `M${f(l.cx - half + 0.6)} ${y} H${f(l.cx + half - 0.6)}`;
      for (let x = l.cx - half + (i % 2 ? 3 : 5.5); x < l.cx + half - 1; x += 5) d += ` M${f(x)} ${y} V${f(y + 3.5)}`;
      return `<path d="${d}" stroke="${color}" stroke-width="0.7" fill="none" opacity="0.7"/>`;
    })
    .join('');
}

/** The headgear that says which piece this is. */
function hat(l: Layout, t: PieceSymbol, s: CharacterStyle): string {
  const top = l.hy - l.hr; // top of the head
  const b = top + 2.2; // hat sits over the top of the head
  const k = t === 'b' ? 1.05 : 1.12;
  return `<g transform="translate(${l.cx} ${f(b)}) scale(${k}) translate(${-l.cx} ${f(-b)})">${hatShape(l, t, s, b)}</g>`;
}

function hatShape(l: Layout, t: PieceSymbol, s: CharacterStyle, b: number): string {
  const c = s.hatColor ?? s.accent;
  const line = `stroke="${s.line}" stroke-width="1" stroke-linejoin="round"`;
  const cx = l.cx;
  switch (t) {
    case 'k':
      return (
        `<path d="M${cx - 6.5} ${b} L${cx - 7.2} ${f(b - 6)} L${cx - 3.6} ${f(b - 3)} L${cx} ${f(b - 7)} L${cx + 3.6} ${f(b - 3)} L${cx + 7.2} ${f(b - 6)} L${cx + 6.5} ${b} Z" fill="${c}" ${line}/>` +
        `<path d="M${cx} ${f(b - 7)} V${f(b - 13.2)} M${cx - 2.6} ${f(b - 10.8)} H${cx + 2.6}" stroke="${s.line}" stroke-width="3.4" stroke-linecap="round"/>` +
        `<path d="M${cx} ${f(b - 7.2)} V${f(b - 13.2)} M${cx - 2.6} ${f(b - 10.8)} H${cx + 2.6}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>` +
        `<circle cx="${cx}" cy="${f(b - 1.6)}" r="1" fill="${s.accent2}"/>`
      );
    case 'q':
      return (
        `<path d="M${cx - 6.8} ${b} L${cx - 8} ${f(b - 5.2)} L${cx - 4.2} ${f(b - 2.4)} L${cx - 2.4} ${f(b - 7)} L${cx} ${f(b - 3)} L${cx + 2.4} ${f(b - 7)} L${cx + 4.2} ${f(b - 2.4)} L${cx + 8} ${f(b - 5.2)} L${cx + 6.8} ${b} Z" fill="${c}" ${line}/>` +
        [[-8, 5.2], [-2.4, 7], [2.4, 7], [8, 5.2]].map(([x, h]) => `<circle cx="${cx + x}" cy="${f(b - h - 0.9)}" r="1.35" fill="${s.accent2}" ${line}/>`).join('')
      );
    case 'r':
      return (
        `<path d="M${cx - 7.4} ${b + 0.6} V${f(b - 5)} H${cx - 4.6} V${f(b - 3)} H${cx - 1.4} V${f(b - 5)} H${cx + 1.4} V${f(b - 3)} H${cx + 4.6} V${f(b - 5)} H${cx + 7.4} V${b + 0.6} Z" fill="${c}" ${line}/>` +
        `<path d="M${cx - 7} ${f(b - 1)} H${cx + 7}" stroke="${s.line}" stroke-width="0.6" opacity="0.6"/>`
      );
    case 'b':
      return (
        `<path d="M${cx - 5.6} ${b + 0.4} C${cx - 6.4} ${f(b - 5)} ${cx - 2.5} ${f(b - 9.5)} ${cx} ${f(b - 11.5)} C${cx + 2.5} ${f(b - 9.5)} ${cx + 6.4} ${f(b - 5)} ${cx + 5.6} ${b + 0.4} Z" fill="${c}" ${line}/>` +
        `<path d="M${cx + 1.6} ${f(b - 8.6)} L${cx - 1.8} ${f(b - 4)}" stroke="${s.line}" stroke-width="1" stroke-linecap="round"/>` +
        `<circle cx="${cx}" cy="${f(b - 12.6)}" r="1.4" fill="${s.accent2}" ${line}/>`
      );
    default:
      return '';
  }
}

/** Build a whole character piece (not knights). */
function figure(s: CharacterStyle, t: Exclude<PieceSymbol, 'n'>, eyes: boolean): string {
  const l = LAYOUT[t];
  const head = s.head ? s.head(l, t, eyes) : `<circle cx="${l.cx}" cy="${l.hy}" r="${l.hr}" fill="url(#skin)" stroke="${s.line}" stroke-width="1.3"/>`;
  return (
    (s.behind?.(l, t, eyes) ?? '') +
    base(l, s) +
    `<path d="${bodyPath(l, t)}" fill="url(#body)" stroke="${s.line}" stroke-width="1.3" stroke-linejoin="round"/>` +
    (t === 'r' ? rookBricks(l, s.line) : '') +
    (s.bodyExtras?.(l, t, eyes) ?? '') +
    head +
    (s.face ?? defaultFace)(l, t, eyes) +
    (s.extras?.(l, t, eyes) ?? '') +
    hat(l, t, s)
  );
}

// ---- knights: a horse-like head built on the classic knight outline ----

const HORSE_NECK = 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21';
const HORSE_HEAD =
  'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3';

function horse(s: CharacterStyle, eyes: boolean, opts: { behind?: string; front?: string; under?: string; eye?: string } = {}): string {
  const eye = !eyes
    ? ''
    : opts.eye ??
      `<circle cx="14.4" cy="15.8" r="2.5" fill="#fff" stroke="#1b1b2f" stroke-width="0.6"/><circle cx="13.9" cy="16" r="1.35" fill="#1b1b2f"/><circle cx="13.5" cy="15.4" r="0.5" fill="#fff"/>`;
  return (
    (opts.behind ?? '') +
    `<rect x="12.5" y="38" width="28" height="4" rx="2" fill="${s.body[1]}" stroke="${s.line}" stroke-width="1.2"/>` +
    `<path d="${HORSE_NECK}" fill="url(#body)" stroke="${s.line}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="${HORSE_HEAD}" fill="url(#skin)" stroke="${s.line}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<circle cx="8.8" cy="25.6" r="0.7" fill="${s.line}"/>` +
    (opts.under ?? '') +
    eye +
    (opts.front ?? '')
  );
}

const sprinkles = (pts: [number, number, number][], colors = ['#ff5a8a', '#ffd23f', '#3ec1ff', '#7ae582', '#b57bff']) =>
  pts.map(([x, y, r], i) => `<rect x="${x}" y="${y}" width="2.2" height="0.8" rx="0.4" fill="${colors[i % colors.length]}" transform="rotate(${r} ${x + 1.1} ${y + 0.4})"/>`).join('');

// ---- the teams ----

export const STYLES: Record<string, CharacterStyle> = {
  // Fantasy: a fairy-tale court with a unicorn knight…
  'fantasy-w': {
    skin: ['#ffe7d1', '#f6c9a6'],
    body: ['#fffaf0', '#f3d27a'],
    line: '#7a4d00',
    accent: '#ffcc33',
    accent2: '#ff6fae',
    behind: (l) => `<path d="M${l.cx - l.hr - 0.4} ${l.hy + 1} Q${l.cx - l.hr - 1} ${l.hy + 8} ${l.cx - l.hr + 2} ${l.hy + 9} M${l.cx + l.hr + 0.4} ${l.hy + 1} Q${l.cx + l.hr + 1} ${l.hy + 8} ${l.cx + l.hr - 2} ${l.hy + 9}" stroke="#f2b632" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    extras: (l, t) =>
      // golden hair fringe, pointy elf ears, and a leaf cap for the pawn
      `<path d="M${l.cx - l.hr + 0.8} ${l.hy - 2} Q${l.cx} ${l.hy - l.hr - 2.5} ${l.cx + l.hr - 0.8} ${l.hy - 2} Q${l.cx} ${l.hy - l.hr + 2} ${l.cx - l.hr + 0.8} ${l.hy - 2} Z" fill="#f7c23a" stroke="#7a4d00" stroke-width="0.8"/>` +
      [-1, 1].map((sd) => `<path d="M${l.cx + sd * (l.hr - 0.6)} ${l.hy - 1} L${l.cx + sd * (l.hr + 3)} ${l.hy - 4.5} L${l.cx + sd * (l.hr - 0.2)} ${l.hy + 2}" fill="#f6c9a6" stroke="#7a4d00" stroke-width="0.8" stroke-linejoin="round"/>`).join('') +
      (t === 'p' ? `<path d="M${l.cx - 6} ${l.hy - 4} Q${l.cx - 2} ${l.hy - 14} ${l.cx + 5} ${l.hy - 12} Q${l.cx + 2} ${l.hy - 9} ${l.cx + 6} ${l.hy - 4} Z" fill="#7ad36b" stroke="#2f6b25" stroke-width="0.9"/>` : ''),
    bodyExtras: (l, t) => (t === 'r' ? '' : `<path d="M${l.cx} ${l.top + 3.2} l1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#ffcc33" stroke="#7a4d00" stroke-width="0.5"/>`),
    knight: (eyes) =>
      horse(STYLES['fantasy-w'], eyes, {
        behind: `<path d="M22 9.5c8 .5 15 7 16.5 20" stroke="#ff8fc8" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M22.5 11c7 .8 12.5 6.5 14 16" stroke="#b28dff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
        front: `<path d="M12.2 11.2 L8.4 1.4 L15.6 9.6 Z" fill="#ffd84d" stroke="#7a4d00" stroke-width="0.9" stroke-linejoin="round"/><path d="M10.2 6.2 l2.6 -.8 M11.3 8.8 l2.3 -.9" stroke="#b57b00" stroke-width="0.6"/>`,
      }),
  },
  // …against little purple dragons.
  'fantasy-b': {
    skin: ['#a86ad8', '#5b2a86'],
    body: ['#6a2c91', '#2c0b47'],
    line: '#16021f',
    accent: '#ffa23a',
    accent2: '#ff4d6d',
    behind: (l, t) => {
      // bat wings behind the shoulders
      const y = l.top + 1;
      const w = t === 'p' ? 7 : 9;
      return [-1, 1]
        .map((sd) => {
          const x = l.cx + sd * (l.w1 / 2 - 1);
          const tip = l.cx + sd * (l.w1 / 2 + w);
          return `<path d="M${x} ${y} Q${f((x + tip) / 2)} ${y - 7} ${tip} ${y - 4} Q${tip - sd * 1.5} ${y + 1} ${f(tip - sd * 3)} ${y + 1} Q${f(tip - sd * 4)} ${y + 3.5} ${f(x + sd * 1)} ${y + 5} Z" fill="#7b3aa6" stroke="#16021f" stroke-width="1" stroke-linejoin="round"/>`;
        })
        .join('');
    },
    face: (l, _t, eyes) =>
      eyePair(l, eyes, '#1b1b2f', '#fff6c2') +
      `<ellipse cx="${l.cx}" cy="${l.hy + l.hr * 0.45}" rx="${l.hr * 0.55}" ry="${l.hr * 0.32}" fill="#c89be6" stroke="#16021f" stroke-width="0.6"/>` +
      `<circle cx="${l.cx - 1.2}" cy="${l.hy + l.hr * 0.42}" r="0.45" fill="#16021f"/><circle cx="${l.cx + 1.2}" cy="${l.hy + l.hr * 0.42}" r="0.45" fill="#16021f"/>`,
    extras: (l) =>
      [-1, 1].map((sd) => `<path d="M${l.cx + sd * l.hr * 0.55} ${l.hy - l.hr * 0.75} Q${l.cx + sd * (l.hr + 2.5)} ${l.hy - l.hr - 2} ${l.cx + sd * (l.hr + 1.5)} ${l.hy - l.hr - 4.5} Q${l.cx + sd * (l.hr - 0.5)} ${l.hy - l.hr - 0.5} ${l.cx + sd * l.hr * 0.9} ${l.hy - l.hr * 0.35} Z" fill="#ffa23a" stroke="#16021f" stroke-width="0.8" stroke-linejoin="round"/>`).join(''),
    bodyExtras: (l, t) =>
      t === 'r' ? '' : `<path d="M${l.cx - 3.2} ${l.top + 2} Q${l.cx} ${BOTTOM + 1} ${l.cx + 3.2} ${l.top + 2}" fill="#ffb454" stroke="#16021f" stroke-width="0.8"/><path d="M${l.cx - 2.6} ${l.top + 5} H${l.cx + 2.6} M${l.cx - 2.2} ${l.top + 7.5} H${l.cx + 2.2} M${l.cx - 1.6} ${l.top + 10} H${l.cx + 1.6}" stroke="#16021f" stroke-width="0.5"/>`,
    knight: (eyes) =>
      horse(STYLES['fantasy-b'], eyes, {
        behind: [[23, 9.6], [28.4, 11.8], [32.6, 15.4], [35.6, 20.4], [37.3, 26]].map(([x, y]) => `<path d="M${x - 2} ${y} L${x + 1.5} ${y - 4.5} L${x + 2.6} ${y + 1.4} Z" fill="#ffa23a" stroke="#16021f" stroke-width="0.8" stroke-linejoin="round"/>`).join(''),
        front: `<path d="M16.5 8.8 Q18 3 23.5 2.5 Q19.5 5 19.4 9.4 Z" fill="#ffa23a" stroke="#16021f" stroke-width="0.8"/><path d="M13.6 9.6 Q13.5 4.5 17.5 2.4 Q15.6 5.8 16 9.2 Z" fill="#ffa23a" stroke="#16021f" stroke-width="0.8"/><path d="M6 27 l1.2 1.6 1.2 -1.4" stroke="#fff" stroke-width="0.7" fill="none"/>`,
      }),
  },
  // Space: shiny robots…
  'space-w': {
    skin: ['#ffffff', '#b8c6d8'],
    body: ['#e8eef7', '#8fa3bd'],
    line: '#1d2b45',
    accent: '#28d7ff',
    accent2: '#ff5a6e',
    hatColor: '#ffd84d',
    head: (l) => `<rect x="${l.cx - l.hr}" y="${l.hy - l.hr * 0.9}" width="${l.hr * 2}" height="${l.hr * 1.8}" rx="2.6" fill="url(#skin)" stroke="#1d2b45" stroke-width="1.3"/>`,
    face: (l, _t, eyes) =>
      `<rect x="${f(l.cx - l.hr * 0.8)}" y="${f(l.hy - l.hr * 0.4)}" width="${f(l.hr * 1.6)}" height="${f(l.hr * 0.7)}" rx="${f(l.hr * 0.35)}" fill="#16233d"/>` +
      (eyes ? [-1, 1].map((sd) => `<circle cx="${f(l.cx + sd * l.hr * 0.4)}" cy="${f(l.hy - l.hr * 0.05)}" r="${f(l.hr * 0.2)}" fill="#28d7ff"/>`).join('') : '') +
      `<path d="M${f(l.cx - 2.2)} ${f(l.hy + l.hr * 0.55)} H${f(l.cx + 2.2)} M${f(l.cx - 2.2)} ${f(l.hy + l.hr * 0.55 + 1.1)} H${f(l.cx + 2.2)}" stroke="#1d2b45" stroke-width="0.6"/>`,
    extras: (l, t) =>
      [-1, 1].map((sd) => `<rect x="${f(l.cx + sd * (l.hr + 0.9) - 1.1)}" y="${l.hy - 2}" width="2.2" height="4" rx="1" fill="#28d7ff" stroke="#1d2b45" stroke-width="0.7"/>`).join('') +
      (t === 'p' ? `<path d="M${l.cx} ${f(l.hy - l.hr * 0.9)} V${f(l.hy - l.hr - 4)}" stroke="#1d2b45" stroke-width="1"/><circle cx="${l.cx}" cy="${f(l.hy - l.hr - 4.8)}" r="1.5" fill="#ff5a6e" stroke="#1d2b45" stroke-width="0.7"/>` : ''),
    bodyExtras: (l, t) =>
      t === 'r' ? '' : `<rect x="${l.cx - 3}" y="${l.top + 2.5}" width="6" height="4.2" rx="1" fill="#16233d"/><circle cx="${l.cx - 1.4}" cy="${l.top + 4.6}" r="0.8" fill="#ff5a6e"/><circle cx="${l.cx + 1.4}" cy="${l.top + 4.6}" r="0.8" fill="#7cff8a"/>`,
    knight: (eyes) =>
      horse(STYLES['space-w'], eyes, {
        under: `<rect x="11.2" y="14.2" width="6.2" height="3.4" rx="1.6" fill="#16233d"/>`,
        eye: `<circle cx="13.3" cy="15.9" r="1" fill="#28d7ff"/>`,
        front: `<path d="M18.2 8.6 L20.2 2.6" stroke="#1d2b45" stroke-width="1"/><circle cx="20.4" cy="2" r="1.3" fill="#ff5a6e" stroke="#1d2b45" stroke-width="0.6"/><circle cx="17" cy="22.8" r="1" fill="#9fb3c9" stroke="#1d2b45" stroke-width="0.6"/><path d="M25 16 c4 .5 9 5 10 12 M26.5 24 c3 1 5.5 5 6 10" stroke="#8fa3bd" stroke-width="0.8" fill="none"/>`,
      }),
  },
  // …against friendly green aliens.
  'space-b': {
    skin: ['#6fe06f', '#2c9a38'],
    body: ['#3b2d6e', '#1b1440'],
    line: '#062610',
    accent: '#c6ff6b',
    accent2: '#ff7ae0',
    head: (l) => `<path d="M${l.cx} ${f(l.hy + l.hr)} C${f(l.cx - l.hr * 0.9)} ${f(l.hy + l.hr * 0.9)} ${f(l.cx - l.hr * 1.3)} ${f(l.hy - l.hr * 0.2)} ${f(l.cx - l.hr * 1.05)} ${f(l.hy - l.hr * 0.6)} C${f(l.cx - l.hr * 0.7)} ${f(l.hy - l.hr * 1.2)} ${f(l.cx + l.hr * 0.7)} ${f(l.hy - l.hr * 1.2)} ${f(l.cx + l.hr * 1.05)} ${f(l.hy - l.hr * 0.6)} C${f(l.cx + l.hr * 1.3)} ${f(l.hy - l.hr * 0.2)} ${f(l.cx + l.hr * 0.9)} ${f(l.hy + l.hr * 0.9)} ${l.cx} ${f(l.hy + l.hr)} Z" fill="url(#skin)" stroke="#062610" stroke-width="1.3"/>`,
    face: (l, _t, eyes) =>
      (eyes
        ? [-1, 1].map((sd) => `<ellipse cx="${f(l.cx + sd * l.hr * 0.42)}" cy="${f(l.hy - l.hr * 0.05)}" rx="${f(l.hr * 0.3)}" ry="${f(l.hr * 0.4)}" fill="#0b0b1a" transform="rotate(${sd * -25} ${f(l.cx + sd * l.hr * 0.42)} ${f(l.hy - l.hr * 0.05)})"/><circle cx="${f(l.cx + sd * l.hr * 0.42 + 0.5)}" cy="${f(l.hy - l.hr * 0.2)}" r="0.7" fill="#fff"/>`).join('')
        : '') + smile(l, '#062610', 0.6),
    extras: (l) =>
      [-1, 1].map((sd) => `<path d="M${f(l.cx + sd * l.hr * 0.75)} ${f(l.hy - l.hr * 0.75)} Q${f(l.cx + sd * (l.hr + 1.5))} ${f(l.hy - l.hr - 2)} ${f(l.cx + sd * (l.hr + 3))} ${f(l.hy - l.hr - 3.5)}" stroke="#062610" stroke-width="1" fill="none"/><circle cx="${f(l.cx + sd * (l.hr + 3.2))}" cy="${f(l.hy - l.hr - 3.8)}" r="1.4" fill="#c6ff6b" stroke="#062610" stroke-width="0.6"/>`).join(''),
    bodyExtras: (l, t) => (t === 'r' ? '' : `<path d="M${l.cx - 4} ${l.top + 4} H${l.cx + 4}" stroke="#c6ff6b" stroke-width="1.2"/><circle cx="${l.cx}" cy="${l.top + 4}" r="1.3" fill="#ff7ae0" stroke="#062610" stroke-width="0.5"/>`),
    knight: (eyes) =>
      horse(STYLES['space-b'], eyes, {
        eye: `<ellipse cx="14" cy="16" rx="2.2" ry="3" fill="#0b0b1a" transform="rotate(25 14 16)"/><circle cx="14.6" cy="15" r="0.7" fill="#fff"/>`,
        front: `<path d="M16 9 Q14 4 11 2.5 M19.5 8.6 Q20.5 3.5 24 1.8" stroke="#062610" stroke-width="1" fill="none"/><circle cx="10.6" cy="2.3" r="1.4" fill="#c6ff6b" stroke="#062610" stroke-width="0.6"/><circle cx="24.4" cy="1.8" r="1.4" fill="#c6ff6b" stroke="#062610" stroke-width="0.6"/><circle cx="28" cy="22" r="1.2" fill="#c6ff6b" opacity="0.7"/><circle cx="31" cy="28" r="1.6" fill="#c6ff6b" opacity="0.7"/>`,
      }),
  },
  // Ocean: reef fish folk with a seahorse knight…
  'ocean-w': {
    skin: ['#e6fbff', '#8fdcf0'],
    body: ['#bff0ff', '#3fb5d8'],
    line: '#0b4a60',
    accent: '#ffb347',
    accent2: '#ff6f91',
    extras: (l) =>
      [-1, 1].map((sd) => `<path d="M${f(l.cx + sd * (l.hr - 0.8))} ${f(l.hy - 1.5)} Q${f(l.cx + sd * (l.hr + 4))} ${f(l.hy - 4)} ${f(l.cx + sd * (l.hr + 3.5))} ${f(l.hy + 2.5)} Q${f(l.cx + sd * (l.hr + 1))} ${f(l.hy + 1)} ${f(l.cx + sd * (l.hr - 0.6))} ${f(l.hy + 2)} Z" fill="#ffb347" stroke="#0b4a60" stroke-width="0.8" stroke-linejoin="round"/>`).join(''),
    bodyExtras: (l, t) =>
      t === 'r'
        ? `<path d="M${l.cx - 4} ${l.top + 3} l1.5 -2 1.5 2 M${l.cx + 1} ${l.top + 3} l1.5 -2 1.5 2" stroke="#0b4a60" stroke-width="0.6" fill="none"/>`
        : [0, 1, 2].map((r) => [-1, 0, 1].slice(0, 3 - (r === 2 ? 1 : 0)).map((c) => `<path d="M${f(l.cx + c * 3 - 1.5 + (r % 2) * 1.5)} ${l.top + 3 + r * 3} q1.5 2 3 0" stroke="#0b4a60" stroke-width="0.6" fill="none" opacity="0.7"/>`).join('')).join(''),
    knight: (eyes) =>
      horse(STYLES['ocean-w'], eyes, {
        behind: `<path d="M26 14 Q35 13 37 20 Q33 19 34 24 Q30 21 28.5 25 Z" fill="#ffb347" stroke="#0b4a60" stroke-width="0.9" stroke-linejoin="round"/>`,
        front: `<path d="M17.5 8.2 l1.2 -3.6 1 3.4 1.6 -3 .6 3.6" fill="#ffb347" stroke="#0b4a60" stroke-width="0.7" stroke-linejoin="round"/><path d="M20 30 q3 -1 5 1 M19 34 q3 -1 5 1" stroke="#0b4a60" stroke-width="0.6" fill="none" opacity="0.7"/><circle cx="5.5" cy="12" r="1.3" fill="none" stroke="#3fb5d8" stroke-width="0.6"/><circle cx="3.8" cy="8.5" r="0.9" fill="none" stroke="#3fb5d8" stroke-width="0.6"/>`,
      }),
  },
  // …against grinning (but friendly) sharks.
  'ocean-b': {
    skin: ['#8fb0d2', '#3d5b7e'],
    body: ['#355275', '#162841'],
    line: '#08121e',
    accent: '#ff9480',
    accent2: '#ffe066',
    behind: (l) => `<path d="M${f(l.cx - l.hr * 0.8)} ${f(l.hy - l.hr * 0.6)} Q${f(l.cx - l.hr * 1.5)} ${f(l.hy - l.hr * 0.9)} ${f(l.cx - l.hr * 1.75)} ${f(l.hy - l.hr * 1.2)} Q${f(l.cx - l.hr * 1.5)} ${f(l.hy - l.hr * 0.3)} ${f(l.cx - l.hr * 0.9)} ${f(l.hy + l.hr * 0.1)} Z" fill="#3d5b7e" stroke="#08121e" stroke-width="1" stroke-linejoin="round"/>`,
    face: (l, _t, eyes) =>
      `<path d="M${f(l.cx - l.hr * 0.85)} ${f(l.hy + l.hr * 0.15)} Q${l.cx} ${f(l.hy + l.hr * 1.25)} ${f(l.cx + l.hr * 0.85)} ${f(l.hy + l.hr * 0.15)} Z" fill="#eef6ff" stroke="#08121e" stroke-width="0.6"/>` +
      eyePair(l, eyes) +
      `<path d="M${f(l.cx - l.hr * 0.55)} ${f(l.hy + l.hr * 0.42)} Q${l.cx} ${f(l.hy + l.hr * 0.8)} ${f(l.cx + l.hr * 0.55)} ${f(l.hy + l.hr * 0.42)}" fill="#fff" stroke="#08121e" stroke-width="0.8"/>` +
      [-2, -0.7, 0.7, 2].map((x) => `<path d="M${f(l.cx + x - 0.5)} ${f(l.hy + l.hr * 0.5)} l0.5 1 0.5 -1" fill="#08121e"/>`).join(''),
    bodyExtras: (l, t) => (t === 'r' ? '' : `<path d="M${l.cx - 3} ${l.top + 1.5} Q${l.cx} ${BOTTOM + 1} ${l.cx + 3} ${l.top + 1.5}" fill="#eef6ff" stroke="#08121e" stroke-width="0.6"/>`) + [-1, 1].map((sd) => `<path d="M${f(l.cx + sd * (l.w1 / 2 - 1.8))} ${l.top + 2.5} l${sd * 0.6} 3 M${f(l.cx + sd * (l.w1 / 2 - 0.6))} ${l.top + 2} l${sd * 0.6} 3" stroke="#08121e" stroke-width="0.6"/>`).join(''),
    knight: (eyes) =>
      horse(STYLES['ocean-b'], eyes, {
        behind: `<path d="M27 15 L36 4 L35 21 Z" fill="#3d5b7e" stroke="#08121e" stroke-width="1" stroke-linejoin="round"/>`,
        front: `<path d="M5.8 26.2 L10 25 M6.5 27.2 l.8 1.2 .8 -1.1 .8 1.1 .8 -1.2" stroke="#fff" stroke-width="0.8" fill="none"/><path d="M19.5 22 q-1 2 0 4 M21.5 21 q-1 2 0 4" stroke="#08121e" stroke-width="0.7" fill="none"/>`,
      }),
  },
  // Candy: cupcakes…
  'candy-w': {
    skin: ['#ffe1f0', '#ffb3d6'],
    body: ['#fff7fc', '#ffc2e0'],
    line: '#a8286a',
    accent: '#ffd23f',
    accent2: '#ff3b6b',
    head: (l) => {
      const { cx, hy, hr } = l;
      // a swirl of frosting
      return `<path d="M${f(cx - hr * 1.05)} ${f(hy + hr * 0.55)} Q${f(cx - hr * 1.35)} ${f(hy - hr * 0.2)} ${f(cx - hr * 0.7)} ${f(hy - hr * 0.55)} Q${f(cx - hr * 0.5)} ${f(hy - hr * 1.15)} ${cx} ${f(hy - hr * 1.05)} Q${f(cx + hr * 0.5)} ${f(hy - hr * 1.15)} ${f(cx + hr * 0.7)} ${f(hy - hr * 0.55)} Q${f(cx + hr * 1.35)} ${f(hy - hr * 0.2)} ${f(cx + hr * 1.05)} ${f(hy + hr * 0.55)} Q${cx} ${f(hy + hr * 1.25)} ${f(cx - hr * 1.05)} ${f(hy + hr * 0.55)} Z" fill="url(#skin)" stroke="#a8286a" stroke-width="1.2"/>`;
    },
    extras: (l, t) =>
      sprinkles([[l.cx - 6, l.hy - 4, 30], [l.cx + 4, l.hy - 5, -40], [l.cx - 7.5, l.hy + 2, 70], [l.cx + 5.5, l.hy + 2.5, -10]]) +
      (t === 'p' ? `<path d="M${l.cx} ${f(l.hy - l.hr - 0.5)} q1 -3 3.5 -4" stroke="#2f6b25" stroke-width="0.8" fill="none"/><circle cx="${l.cx}" cy="${f(l.hy - l.hr - 1.2)}" r="2.2" fill="#ff3b6b" stroke="#a8286a" stroke-width="0.7"/>` : ''),
    bodyExtras: (l) => [-2, -1, 0, 1, 2].map((i) => `<path d="M${f(l.cx + i * (l.w1 / 5))} ${l.top + 0.5} L${f(l.cx + i * (l.w2 / 5))} ${BOTTOM - 0.5}" stroke="#e89ac2" stroke-width="0.8"/>`).join(''),
    knight: (eyes) =>
      horse(STYLES['candy-w'], eyes, {
        behind: `<path d="M21 9 q3 -2 5 0 q3 -1 4 2 q3 0 3.5 3 q3 1 2.5 4 q2.5 2 1 4.5 q2 2.5 0 5 q1.5 2.5 -1 4" stroke="#ff8fc8" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        front: sprinkles([[26, 20, 30], [30, 27, -20], [23, 31, 60], [32, 34, 10], [19, 36, -40]]),
      }),
  },
  // …against chocolate bonbons.
  'candy-b': {
    skin: ['#9a6a47', '#5a3319'],
    body: ['#7a4a2a', '#3f200d'],
    line: '#1f0e04',
    accent: '#ffcce6',
    accent2: '#ff5fa2',
    extras: (l) =>
      `<path d="M${f(l.cx - l.hr * 0.9)} ${f(l.hy - l.hr * 0.3)} q${f(l.hr * 0.3)} ${f(-l.hr * 0.45)} ${f(l.hr * 0.6)} 0 t${f(l.hr * 0.6)} 0 t${f(l.hr * 0.6)} 0" stroke="#ffcce6" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
    face: (l, _t, eyes) => eyePair(l, eyes) + smile(l, '#ffcce6') + cheeks(l, 'rgba(255,150,190,0.5)'),
    bodyExtras: (l) => [-2, -1, 0, 1, 2].map((i) => `<path d="M${f(l.cx + i * (l.w1 / 5))} ${l.top + 0.5} L${f(l.cx + i * (l.w2 / 5))} ${BOTTOM - 0.5}" stroke="#2a1405" stroke-width="0.8"/>`).join(''),
    knight: (eyes) =>
      horse(STYLES['candy-b'], eyes, {
        front: `<path d="M18 8.6 q2 -.8 4 1.2 q1 3 2 0 q2 1 3 2 q.5 3 1.8 .5 q2 1.5 3 3.5" stroke="#ffcce6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 20 q1.5 -1.4 3 0 q1.5 1.2 3 0" stroke="#ffcce6" stroke-width="1" fill="none"/>`,
      }),
  },
  // Dino: triceratops…
  'dino-w': {
    skin: ['#f4ffd6', '#b7e27a'],
    body: ['#dff5b0', '#8cc44a'],
    line: '#34520c',
    accent: '#ffd35a',
    accent2: '#ff8a3d',
    behind: (l) => {
      const r = l.hr * 1.5;
      return `<path d="M${f(l.cx - r)} ${f(l.hy + 1)} A${f(r)} ${f(r)} 0 0 1 ${f(l.cx + r)} ${f(l.hy + 1)} Z" fill="#ffd35a" stroke="#34520c" stroke-width="1.1"/>` +
        [-0.75, -0.3, 0.3, 0.75].map((a) => `<circle cx="${f(l.cx + Math.sin(a) * r * 0.82)}" cy="${f(l.hy + 1 - Math.cos(a) * r * 0.82)}" r="0.9" fill="#ff8a3d"/>`).join('');
    },
    extras: (l) =>
      `<path d="M${l.cx - 0.9} ${f(l.hy + l.hr * 0.25)} L${l.cx} ${f(l.hy - l.hr * 0.12)} L${l.cx + 0.9} ${f(l.hy + l.hr * 0.25)} Z" fill="#fffbe6" stroke="#34520c" stroke-width="0.5"/>` +
      [-1, 1].map((sd) => `<path d="M${f(l.cx + sd * l.hr * 0.65)} ${f(l.hy - l.hr * 0.55)} L${f(l.cx + sd * l.hr * 0.95)} ${f(l.hy - l.hr * 1.1)} L${f(l.cx + sd * l.hr * 0.35)} ${f(l.hy - l.hr * 0.7)} Z" fill="#fffbe6" stroke="#34520c" stroke-width="0.5"/>`).join(''),
    face: (l, _t, eyes) => eyePair(l, eyes) + smile(l, '#34520c', 1.2),
    bodyExtras: (l, t) => (t === 'r' ? '' : [0, 1, 2].map((i) => `<path d="M${f(l.cx - 2.6 + i * 0.4)} ${l.top + 3 + i * 2.8} H${f(l.cx + 2.6 - i * 0.4)}" stroke="#6f9a2c" stroke-width="0.9" stroke-linecap="round"/>`).join('')),
    knight: (eyes) =>
      horse(STYLES['dino-w'], eyes, {
        behind: `<path d="M17 12 A11 11 0 0 1 36 17 L25 20 Z" fill="#ffd35a" stroke="#34520c" stroke-width="1"/><circle cx="24" cy="9" r="0.9" fill="#ff8a3d"/><circle cx="30" cy="10.5" r="0.9" fill="#ff8a3d"/><circle cx="34" cy="14" r="0.9" fill="#ff8a3d"/>`,
        front: `<path d="M8.8 21 L6.5 16.5 L10.6 19.6 Z M15.6 11 L14.5 5.5 L17.8 10.2 Z" fill="#fffbe6" stroke="#34520c" stroke-width="0.6" stroke-linejoin="round"/>`,
      }),
  },
  // …against toothy T-rexes.
  'dino-b': {
    skin: ['#d4643f', '#7a2512'],
    body: ['#a8452a', '#551a0b'],
    line: '#260902',
    accent: '#ffd45a',
    accent2: '#7ae582',
    head: (l) => `<rect x="${f(l.cx - l.hr * 1.08)}" y="${f(l.hy - l.hr * 0.95)}" width="${f(l.hr * 2.16)}" height="${f(l.hr * 1.9)}" rx="${f(l.hr * 0.75)}" fill="url(#skin)" stroke="#260902" stroke-width="1.3"/>`,
    behind: (l) => [0, 1, 2].map((i) => `<path d="M${f(l.cx + l.hr * 0.5 + i * 2)} ${f(l.hy - l.hr * 0.9 + i * 2.6)} l3 -1.2 -1 3.2 Z" fill="#ffd45a" stroke="#260902" stroke-width="0.6" stroke-linejoin="round"/>`).join(''),
    face: (l, _t, eyes) =>
      eyePair(l, eyes, '#1b1b2f', '#fff6c2') +
      `<path d="M${f(l.cx - l.hr * 0.75)} ${f(l.hy + l.hr * 0.35)} Q${l.cx} ${f(l.hy + l.hr * 0.95)} ${f(l.cx + l.hr * 0.75)} ${f(l.hy + l.hr * 0.35)} Z" fill="#fff" stroke="#260902" stroke-width="0.7"/>` +
      `<path d="M${f(l.cx - l.hr * 0.4)} ${f(l.hy + l.hr * 0.4)} v1 M${l.cx} ${f(l.hy + l.hr * 0.42)} v1.2 M${f(l.cx + l.hr * 0.4)} ${f(l.hy + l.hr * 0.4)} v1" stroke="#260902" stroke-width="0.5"/>`,
    bodyExtras: (l, t) =>
      (t === 'r' ? '' : `<path d="M${l.cx - 3} ${l.top + 1.5} Q${l.cx} ${BOTTOM + 1} ${l.cx + 3} ${l.top + 1.5}" fill="#e8a070" stroke="#260902" stroke-width="0.6"/>`) +
      [-1, 1].map((sd) => `<path d="M${f(l.cx + sd * (l.w1 / 2 - 0.5))} ${l.top + 3} q${sd * 2.5} 0.5 ${sd * 2.8} 2.5" stroke="#260902" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M${f(l.cx + sd * (l.w1 / 2 - 0.5))} ${l.top + 3} q${sd * 2.5} 0.5 ${sd * 2.8} 2.5" stroke="#b8482a" stroke-width="1.1" fill="none" stroke-linecap="round"/>`).join(''),
    knight: (eyes) =>
      horse(STYLES['dino-b'], eyes, {
        behind: [[23, 9.6], [28.4, 11.8], [32.6, 15.4], [35.6, 20.4]].map(([x, y]) => `<path d="M${x - 2} ${y} L${x + 1} ${y - 3.5} L${x + 2.4} ${y + 1.2} Z" fill="#ffd45a" stroke="#260902" stroke-width="0.7" stroke-linejoin="round"/>`).join(''),
        front: `<path d="M5.6 26 L11.5 24.2" stroke="#260902" stroke-width="0.8"/><path d="M6.4 26.4 l.6 1.4 .7 -1.3 .7 1.3 .7 -1.4 .7 1.3 .6 -1.3" stroke="#fff" stroke-width="0.8" fill="none"/>`,
      }),
  },
};

/** SVG markup (without the outer <svg>) for a themed piece. */
export function characterArt(styleId: string, t: PieceSymbol, eyes = true): string | null {
  const s = STYLES[styleId];
  if (!s) return null;
  const defs =
    `<defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.skin[0]}"/><stop offset="1" stop-color="${s.skin[1]}"/></linearGradient>` +
    `<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.body[0]}"/><stop offset="1" stop-color="${s.body[1]}"/></linearGradient></defs>`;
  return defs + (t === 'n' ? s.knight(eyes) : figure(s, t, eyes));
}
