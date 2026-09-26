// Drawn stand-ins for the emoji the battles and moves use as particles, props and scenery.
// Emoji are glossy clip-art that differs on every device and clashes with the flat cartoon
// characters; these share the characters' look: flat colour, a darker outline of the same
// hue, round corners and one soft highlight. Sized in em, like the other props.

import { EGG, UFO } from './props';

const svg = (vb: string, w: number, h: number, body: string) =>
  `<svg viewBox="${vb}" width="${w}em" height="${h}em" style="display:block;overflow:visible">${body}</svg>`;

// Outlined shape: `paint-order` puts the outline behind the fill, so it stays crisp and chunky.
const o = (stroke: string, w = 1.4) => `stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"`;
const shine = (cx: number, cy: number, rx: number, ry: number, rot = -30) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="0.7"/>`;

const STAR_PATH = 'M12 2.2 L14.88 8.84 L22.08 9.52 L16.66 14.31 L18.23 21.38 L12 17.7 L5.77 21.38 L7.34 14.31 L1.92 9.52 L9.12 8.84Z';
const HEART_PATH = 'M12 21 C5 16 2 12.5 2 8.6 C2 5.5 4.4 3.2 7.3 3.2 C9.3 3.2 11 4.3 12 6 C13 4.3 14.7 3.2 16.7 3.2 C19.6 3.2 22 5.5 22 8.6 C22 12.5 19 16 12 21Z';
const DROP_PATH = 'M12 2.5 C12 2.5 5 10.8 5 15.2 A7 7 0 0 0 19 15.2 C19 10.8 12 2.5 12 2.5Z';

const sparkle = (cx: number, cy: number, r: number) => {
  const k = r * 0.2;
  return `M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
};

// Several circles merged into one outlined blob (clouds, puffs): outlines first, fills on top.
const blob = (circles: [number, number, number][], fill: string, stroke: string, w = 1.6) =>
  `<g fill="${stroke}" stroke="${stroke}" stroke-width="${w * 2}">${circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>` +
  `<g fill="${fill}">${circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;

const SPARKLE = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="${sparkle(10.5, 13, 9.5)}" fill="#ffe36e" ${o('#e3a008', 1.3)}/>
  <path d="${sparkle(19.5, 4.8, 3.6)}" fill="#ffe36e" ${o('#e3a008', 1)}/>
  <circle cx="10.5" cy="13" r="1.6" fill="#fff"/>`,
);

const STAR = svg('0 0 24 24', 1, 1, `<path d="${STAR_PATH}" fill="#ffd43b" ${o('#d98e04', 1.6)}/>${shine(9, 9.5, 2.2, 1.2)}`);

const GLOW_STAR = svg(
  '0 0 24 24',
  1,
  1,
  `<circle cx="12" cy="12.5" r="11.5" fill="#fff4b8" opacity="0.55"/><path d="${STAR_PATH}" fill="#ffd43b" ${o('#d98e04', 1.6)}/>${shine(9, 9.5, 2.2, 1.2)}`,
);

const DIZZY = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M3 17 C6 22 16 22 20 15" fill="none" stroke="#ffcf33" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
  <path d="M8 21 C11 22.5 15 21.6 17 19" fill="none" stroke="#fff3b0" stroke-width="1.2" stroke-linecap="round"/>
  <g transform="translate(6 1) scale(0.62)"><path d="${STAR_PATH}" fill="#ffd43b" ${o('#d98e04', 2.2)}/></g>`,
);

const PUFF = svg(
  '0 0 28 20',
  1.4,
  1,
  `<path d="M1 7.5h5 M0 11.5h4 M2 15.5h5" stroke="#c3cedb" stroke-width="1.4" stroke-linecap="round"/>
  ${blob([[16, 10.5, 6], [22.5, 12, 4.4], [10.5, 12.2, 4.3], [18, 6.5, 3.8]], '#fff', '#c3cedb', 0.9)}`,
);

const IMPACT = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M12 0.6 L13.8 5.86 L18.16 2.41 L16.84 7.81 L22.37 7.26 L18.33 11.09 L23.28 13.62 L17.82 14.66 L20.62 19.47 L15.46 17.38 L15.21 22.94 L12 18.4 L8.79 22.94 L8.54 17.38 L3.38 19.47 L6.18 14.66 L0.72 13.62 L5.67 11.09 L1.63 7.26 L7.16 7.81 L5.84 2.41 L10.2 5.86Z" fill="#ffb31a" ${o('#e0561b', 1.2)}/>
  <path d="M14.46 5.23 L14.44 9.09 L18.24 8.4 L15.74 11.34 L19.09 13.25 L15.29 13.9 L16.63 17.52 L13.3 15.57 L12 19.2 L10.7 15.57 L7.37 17.52 L8.71 13.9 L4.91 13.25 L8.26 11.34 L5.76 8.4 L9.56 9.09 L9.54 5.23 L12 8.2Z" fill="#fff1a8"/>`,
);

const DROP = svg('0 0 24 24', 1, 1, `<path d="${DROP_PATH}" fill="#5cc8f5" ${o('#1f86c7', 1.4)}/>${shine(9.6, 14.5, 1.3, 2.4, 20)}`);

const DROPS = svg(
  '0 0 24 24',
  1,
  1,
  `<g transform="translate(-1 3) scale(0.62) rotate(-20 12 12)"><path d="${DROP_PATH}" fill="#5cc8f5" ${o('#1f86c7', 2)}/></g>
  <g transform="translate(9 -1) scale(0.7) rotate(15 12 12)"><path d="${DROP_PATH}" fill="#5cc8f5" ${o('#1f86c7', 2)}/>${shine(9.6, 14.5, 1.3, 2.4, 20)}</g>`,
);

const NOTE = svg(
  '0 0 20 24',
  0.83,
  1,
  `<g ${o('#fff', 2.2)}><ellipse cx="7" cy="18.6" rx="4.4" ry="3.3" transform="rotate(-22 7 18.6)" fill="#5a3fd0"/>
  <path d="M10.6 18 V3.5 C13 6.5 17.5 7.5 16.5 12.5 C16 9.8 13.6 9 10.6 8.6" fill="#5a3fd0"/></g>`,
);

const NOTES = svg(
  '0 0 26 24',
  1.08,
  1,
  `<g fill="#5a3fd0" ${o('#fff', 2.2)}><path d="M8.2 18.5 V5 L22.5 2 V16" fill="none" stroke="#5a3fd0" stroke-width="2.2"/>
  <path d="M8.2 5 L22.5 2 V6 L8.2 9Z"/>
  <ellipse cx="5.2" cy="19" rx="3.8" ry="2.9" transform="rotate(-22 5.2 19)"/>
  <ellipse cx="19.5" cy="16.5" rx="3.8" ry="2.9" transform="rotate(-22 19.5 16.5)"/></g>`,
);

const SNOWFLAKE = svg(
  '0 0 24 24',
  1,
  1,
  (() => {
    const arm = 'M12 12 V2.5 M12 6 L9.4 3.8 M12 6 L14.6 3.8 M12 9 L9.8 7.4 M12 9 L14.2 7.4';
    const arms = [0, 60, 120, 180, 240, 300].map((a) => `<path d="${arm}" transform="rotate(${a} 12 12)"/>`).join('');
    return `<g fill="none" stroke="#7fb7e3" stroke-width="3.2" stroke-linecap="round">${arms}</g><g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round">${arms}</g>`;
  })(),
);

const ZZZ = svg(
  '0 0 24 24',
  1,
  1,
  (() => {
    const z = (x: number, y: number, s: number) => `<path d="M${x} ${y} h${s} l${-s} ${s * 1.1} h${s}" transform="rotate(-12 ${x} ${y})"/>`;
    const zs = z(2, 12, 8) + z(12, 5, 6) + z(19, 0.5, 4);
    return `<g fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round">${zs}</g><g fill="none" stroke="#6f8cff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${zs}</g>`;
  })(),
);

const FEATHER = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M20.5 2.5 C12 3 5.5 9.5 5 18 L8.5 17.5 C9 16 11 14.5 13 14 C11.5 13.4 11 13 10.6 12.4 C13 12.2 15.5 11 17 9 C15.4 8.8 14.6 8.4 14 7.8 C17 7 19.4 5.4 20.5 2.5Z" fill="#fff" ${o('#aab4c3', 1.1)}/>
  <path d="M3 21.5 L16.5 6.5" stroke="#aab4c3" stroke-width="1.1" stroke-linecap="round"/>`,
);

const FLAME = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M12 1.8 C13.5 6 19.5 9 19.5 15 A7.5 7.5 0 0 1 4.5 15 C4.5 11.5 6.5 9.5 8 8.2 C8 10.5 9 12 10.2 12.4 C9.6 8 11 4.5 12 1.8Z" fill="#ff7a1a" ${o('#c7380b', 1.3)}/>
  <path d="M12.2 10.5 C13 13 16 14.2 16 17 A4 4 0 0 1 8 17 C8 15.2 9.2 14.2 10 13.6 C10.4 15 11 15.6 11.6 15.6 C11.3 13.8 11.6 12 12.2 10.5Z" fill="#ffd84a"/>`,
);

const BOLT = svg('0 0 24 24', 1, 1, `<path d="M14.5 1.5 L4.5 13.5 H11 L8.5 22.5 L19.5 9.5 H13 Z" fill="#ffe14d" ${o('#d48806', 1.4)}/>${shine(12.4, 6.8, 0.9, 2.4, 40)}`);

const HEART = svg('0 0 24 24', 1, 1, `<path d="${HEART_PATH}" fill="#ff5d8f" ${o('#c4185a', 1.4)}/>${shine(7.2, 8, 2, 1.3)}`);

const HEARTS = svg(
  '0 0 24 24',
  1,
  1,
  `<g transform="translate(9 0) scale(0.6)"><path d="${HEART_PATH}" fill="#ff8fb3" ${o('#c4185a', 2.2)}/></g>
  <g transform="translate(0 6) scale(0.72)"><path d="${HEART_PATH}" fill="#ff5d8f" ${o('#c4185a', 2)}/>${shine(7.2, 8, 2, 1.3)}</g>`,
);

const STREAMER = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M3 20 C6 14 2 11 7 8 S9 3 14 2" fill="none" stroke="#7a2d5a" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M3 20 C6 14 2 11 7 8 S9 3 14 2" fill="none" stroke="#ff6fa8" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M14 21 C16 16 13 14 17 11 S19 7 22 6" fill="none" stroke="#7a5a00" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M14 21 C16 16 13 14 17 11 S19 7 22 6" fill="none" stroke="#ffd43b" stroke-width="2.4" stroke-linecap="round"/>`,
);

const CONFETTI = svg(
  '0 0 24 24',
  1,
  1,
  `<rect x="3" y="4" width="5" height="7" rx="1" transform="rotate(-25 5.5 7.5)" fill="#4dabf7" ${o('#1c6fb8', 1)}/>
  <rect x="14" y="2" width="5" height="7" rx="1" transform="rotate(30 16.5 5.5)" fill="#ffd43b" ${o('#c98a00', 1)}/>
  <rect x="9" y="14" width="5" height="7" rx="1" transform="rotate(12 11.5 17.5)" fill="#ff6fa8" ${o('#b8235f', 1)}/>
  <circle cx="19.5" cy="17" r="2.4" fill="#69db7c" ${o('#2b8a3e', 1)}/>`,
);

const CLOUD = svg('0 0 32 20', 1.6, 1, blob([[10, 13, 5.6], [16.5, 9.5, 7], [23.5, 12.5, 5.4], [16, 14.5, 5]], '#fff', '#c9d6e6', 0.8));

const RAIN = svg(
  '0 0 32 26',
  1.23,
  1,
  `${blob([[10, 11, 5.6], [16.5, 7.5, 7], [23.5, 10.5, 5.4], [16, 12.5, 5]], '#b8c4d4', '#7d8ea5', 0.8)}
  <path d="M10 20 l-1.4 3.6 M16.5 20 l-1.4 3.6 M23 20 l-1.4 3.6" stroke="#4fa8e8" stroke-width="1.8" stroke-linecap="round"/>`,
);

const RAINBOW = svg(
  '0 0 32 18',
  1.78,
  1,
  ['#ff5a5f', '#ff9f1c', '#ffd43b', '#51cf66', '#4dabf7', '#9775fa']
    .map((c, i) => `<path d="M${3 + i * 1.9} 17 A${13 - i * 1.9} ${13 - i * 1.9} 0 0 1 ${29 - i * 1.9} 17" fill="none" stroke="${c}" stroke-width="2"/>`)
    .join('') + blob([[3.5, 16.2, 2.6], [7, 16.6, 2.2], [25, 16.6, 2.2], [28.5, 16.2, 2.6]], '#fff', '#d5deea', 0.6),
);

const WAND = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M3.5 21 L16 8.5" stroke="#1d1733" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M13.2 11.3 L16 8.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <path d="${sparkle(19.2, 5, 4.4)}" fill="#ffe36e" ${o('#e3a008', 1)}/>
  <circle cx="13" cy="3" r="1" fill="#ffe36e"/><circle cx="22" cy="11" r="0.9" fill="#ffe36e"/>`,
);

const CROWN = svg(
  '0 0 24 20',
  1.2,
  1,
  `<path d="M3 16.5 L2 5.5 L7.5 10 L12 3 L16.5 10 L22 5.5 L21 16.5Z" fill="#ffd43b" ${o('#c98a00', 1.4)}/>
  <rect x="3" y="15.5" width="18" height="3.2" rx="1" fill="#f5b700" ${o('#c98a00', 1.2)}/>
  <circle cx="2" cy="5.3" r="1.5" fill="#ffd43b" ${o('#c98a00', 1)}/><circle cx="12" cy="2.8" r="1.5" fill="#ffd43b" ${o('#c98a00', 1)}/><circle cx="22" cy="5.3" r="1.5" fill="#ffd43b" ${o('#c98a00', 1)}/>
  <circle cx="12" cy="12" r="1.7" fill="#e8364f"/><circle cx="7" cy="13.4" r="1.2" fill="#4dabf7"/><circle cx="17" cy="13.4" r="1.2" fill="#4dabf7"/>`,
);

const CARROT = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M7 6.5 C4 4 3.5 2 4.5 1 M7 6.5 C6.5 3 8 1.5 9.5 1.5 M7 6.5 C5 6 2.5 6.5 1.5 8" fill="none" stroke="#2f9e44" stroke-width="2" stroke-linecap="round"/>
  <path d="M5.5 7 C8 4.5 11.5 5 13.5 7.5 L22 21.5 L7.5 11.5 C5 9.8 4.6 8 5.5 7Z" fill="#ff8a1f" ${o('#c2560a', 1.3)}/>
  <path d="M10 8.8 l1.8 -1 M13 12 l1.8 -1 M16 15.5 l1.6 -0.9 M9 11 l1.5 -0.4" stroke="#c2560a" stroke-width="1" stroke-linecap="round"/>`,
);

const BALLOON = svg(
  '0 0 20 30',
  0.67,
  1,
  `<path d="M10 20.5 C9 23 11.5 25 9.5 29.5" fill="none" stroke="#8a8f98" stroke-width="0.9" stroke-linecap="round"/>
  <ellipse cx="10" cy="10.5" rx="8.2" ry="9.6" fill="#ff5a5f" ${o('#b8222a', 1.3)}/>
  <path d="M8.6 20.2 L10 21.8 L11.4 20.2Z" fill="#ff5a5f" ${o('#b8222a', 1)}/>${shine(6.6, 6.5, 1.8, 3, 20)}`,
);

const LEAF = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M3 21 C3 10 10 3 21.5 2.5 C21 14 14 21 3 21Z" fill="#69c35a" ${o('#2f7d32', 1.3)}/>
  <path d="M3 21 C8 15 12 11 17.5 6.5" fill="none" stroke="#2f7d32" stroke-width="1.1" stroke-linecap="round"/>`,
);

const CANDY = svg(
  '0 0 30 18',
  1.67,
  1,
  `<path d="M8 9 L1.5 3 L2.5 15Z M22 9 L28.5 3 L27.5 15Z" fill="#ff8fc7" ${o('#c2257a', 1.2)}/>
  <circle cx="15" cy="9" r="7" fill="#ff5fa2" ${o('#c2257a', 1.3)}/>
  <path d="M10 5 C13 8 13 11 10.5 13.5 M15 2.2 C18.5 6 18.5 12 15 15.8 M19.8 4.6 C22 8 21.5 11 19.8 13.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>`,
);

const BRICK = svg(
  '0 0 24 14',
  1.7,
  1,
  `<rect x="1" y="1" width="22" height="12" rx="1.6" fill="#e0703e" ${o('#8f3a17', 1.2)}/>
  <path d="M1.5 7 H22.5 M9 1.5 V7 M15.5 7 V12.5" stroke="#f3b18e" stroke-width="0.9"/>`,
);

const GEAR = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M18.83 9.74 L22.01 10.05 L22.01 13.95 L18.83 14.26 L18.43 15.23 L20.46 17.7 L17.7 20.46 L15.23 18.43 L14.26 18.83 L13.95 22.01 L10.05 22.01 L9.74 18.83 L8.77 18.43 L6.3 20.46 L3.54 17.7 L5.57 15.23 L5.17 14.26 L1.99 13.95 L1.99 10.05 L5.17 9.74 L5.57 8.77 L3.54 6.3 L6.3 3.54 L8.77 5.57 L9.74 5.17 L10.05 1.99 L13.95 1.99 L14.26 5.17 L15.23 5.57 L17.7 3.54 L20.46 6.3 L18.43 8.77Z" fill="#b8c2cc" ${o('#56616d', 1.2)}/>
  <circle cx="12" cy="12" r="3.4" fill="#56616d"/>`,
);

const NUT = svg('0 0 24 24', 1, 1, `<path d="M12 2 L20.7 7 V17 L12 22 L3.3 17 V7Z" fill="#b8c2cc" ${o('#56616d', 1.3)}/><circle cx="12" cy="12" r="4" fill="#56616d"/>`);

const WHEAT = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M4 22 L16 6" stroke="#b7862f" stroke-width="1.4" stroke-linecap="round"/>
  ${[0, 1, 2, 3].map((i) => `<ellipse cx="${15 - i * 2.4}" cy="${6 + i * 3.2}" rx="1.6" ry="3" transform="rotate(40 ${15 - i * 2.4} ${6 + i * 3.2})" fill="#f2c94c" ${o('#b7862f', 0.9)}/><ellipse cx="${19 - i * 2.4}" cy="${9 + i * 3.2}" rx="1.6" ry="3" transform="rotate(-50 ${19 - i * 2.4} ${9 + i * 3.2})" fill="#f2c94c" ${o('#b7862f', 0.9)}/>`).join('')}
  <ellipse cx="17.8" cy="3.8" rx="1.5" ry="2.8" transform="rotate(40 17.8 3.8)" fill="#f2c94c" ${o('#b7862f', 0.9)}/>`,
);

const CUP = svg(
  '0 0 24 22',
  1.1,
  1,
  `<path d="M3 7 H18 V13 A7.5 7.5 0 0 1 3 13Z" fill="#fff" ${o('#8d99ae', 1.3)}/>
  <path d="M18 9 C22.5 8.5 22.5 14.5 17.5 14.5" fill="none" stroke="#8d99ae" stroke-width="1.6"/>
  <ellipse cx="10.5" cy="7.4" rx="6.8" ry="1.3" fill="#9c5b2e"/>
  <path d="M8 4.5 C7 3 9 2 8 0.5 M12.5 4.5 C11.5 3 13.5 2 12.5 0.5" fill="none" stroke="#c9d3df" stroke-width="1" stroke-linecap="round"/>
  <ellipse cx="10.5" cy="21" rx="9" ry="1" fill="#8d99ae" opacity="0.5"/>`,
);

const FROG = svg(
  '0 0 28 24',
  1.17,
  1,
  `<ellipse cx="14" cy="16" rx="11.5" ry="7.2" fill="#6cc24a" ${o('#2f7d32', 1.4)}/>
  <ellipse cx="14" cy="18.5" rx="7" ry="3.8" fill="#b9e6a0"/>
  <circle cx="8.2" cy="8.2" r="4.4" fill="#6cc24a" ${o('#2f7d32', 1.4)}/><circle cx="19.8" cy="8.2" r="4.4" fill="#6cc24a" ${o('#2f7d32', 1.4)}/>
  <circle cx="8.2" cy="8" r="2.6" fill="#fff"/><circle cx="19.8" cy="8" r="2.6" fill="#fff"/>
  <circle cx="8.8" cy="8.3" r="1.3" fill="#1d2b1a"/><circle cx="20.4" cy="8.3" r="1.3" fill="#1d2b1a"/>
  <path d="M9 14.5 C12 17 16 17 19 14.5" fill="none" stroke="#2f7d32" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="6" cy="14" r="1.2" fill="#ff8fa3" opacity="0.7"/><circle cx="22" cy="14" r="1.2" fill="#ff8fa3" opacity="0.7"/>`,
);

const PIE = svg(
  '0 0 28 16',
  1.75,
  1,
  `<path d="M2 7 H26 L23.5 14.5 H4.5Z" fill="#d9a066" ${o('#8a5a2b', 1.3)}/>
  <path d="M5 7 L6.5 14 M10 7 L10.8 14 M14 7 V14 M18 7 L17.2 14 M23 7 L21.5 14" stroke="#b97a3f" stroke-width="0.9"/>
  ${blob([[5, 6, 3], [10, 4.8, 3.6], [15, 4.4, 3.8], [20, 4.8, 3.6], [24, 6, 2.8]], '#fff', '#dfe4ea', 0.6)}
  <circle cx="15" cy="1.2" r="1.7" fill="#e8364f"/>`,
);

const TORNADO = svg(
  '0 0 24 30',
  0.8,
  1,
  `${[[2, 22, 3.2], [4, 17.5, 5.5], [6.5, 13, 9], [9.5, 8.5, 12.5], [12, 4, 16]]
    .map(([x, y, w]) => `<path d="M${x} ${y} C${x + w * 0.2} ${y - 2.2} ${x + w * 0.8} ${y - 2.2} ${x + w} ${y}" fill="none" stroke="#9aa9bb" stroke-width="3.2" stroke-linecap="round"/><path d="M${x} ${y} C${x + w * 0.2} ${y - 2.2} ${x + w * 0.8} ${y - 2.2} ${x + w} ${y}" fill="none" stroke="#dde5ee" stroke-width="1.6" stroke-linecap="round"/>`)
    .join('')}
  <path d="M3.5 26 C3.5 24 4 23.5 5 23" fill="none" stroke="#9aa9bb" stroke-width="2.6" stroke-linecap="round"/>`,
);

const BANANA = svg(
  '0 0 28 16',
  1.75,
  1,
  `<path d="M3 5 C6 14 20 16 26 7 C22 10 9 10 5 3Z" fill="#ffd43b" ${o('#c98a00', 1.3)}/>
  <path d="M3 5 L1.6 3.4 M26 7 L27 8.5" stroke="#6b4a1e" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M7 8 C11 11.5 18 12 23 9" fill="none" stroke="#fff3b0" stroke-width="1" stroke-linecap="round"/>`,
);

const FIREWORK = (a: string, b: string) =>
  svg(
    '0 0 24 24',
    1,
    1,
    `${Array.from({ length: 10 }, (_, i) => {
      const ang = (i / 10) * Math.PI * 2;
      const [c, sn] = [Math.cos(ang), Math.sin(ang)];
      return `<path d="M${(12 + c * 4).toFixed(1)} ${(12 + sn * 4).toFixed(1)} L${(12 + c * 10).toFixed(1)} ${(12 + sn * 10).toFixed(1)}" stroke="${i % 2 ? a : b}" stroke-width="1.8" stroke-linecap="round"/><circle cx="${(12 + c * 11.3).toFixed(1)}" cy="${(12 + sn * 11.3).toFixed(1)}" r="1" fill="${i % 2 ? a : b}"/>`;
    }).join('')}<circle cx="12" cy="12" r="2" fill="#fff"/>`,
  );

const CREAM = svg('0 0 24 24', 1, 1, blob([[12, 12, 7], [6, 9, 3.4], [18, 15, 3.4], [16, 6.5, 2.6], [7, 17, 2.4]], '#fff', '#d6dde6', 0.7));

const CHERRY = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M7.5 15 C8.5 9 12 5 16.5 2 M16.5 15 C16 10 16.2 6 16.5 2" fill="none" stroke="#4d8a2a" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M16.5 2 C19.5 1 22 3 22 5 C19 5.5 17.5 4 16.5 2Z" fill="#69c35a"/>
  <circle cx="7" cy="17.5" r="4.6" fill="#e8364f" ${o('#9c1b2e', 1.2)}/><circle cx="16.5" cy="17.5" r="4.6" fill="#e8364f" ${o('#9c1b2e', 1.2)}/>
  ${shine(5.5, 16, 1.2, 0.8)}${shine(15, 16, 1.2, 0.8)}`,
);

// ---- scenery (behind the fight, so no heavy outlines: they sit back in the haze) ----

const TREE = svg(
  '0 0 24 28',
  0.86,
  1,
  `<rect x="10.2" y="16" width="3.6" height="11" rx="1.2" fill="#8a5a33"/>
  ${blob([[12, 9.5, 7], [6.5, 14, 5], [17.5, 14, 5], [12, 16, 5.5]], '#5fbf4a', '#469a36', 0.6)}
  <circle cx="9" cy="8" r="2.2" fill="#8ad670"/>`,
);

const FLOWER = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M12 13 V23" stroke="#3d9a3a" stroke-width="1.6"/>
  ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="5.5" rx="3" ry="4.2" transform="rotate(${a} 12 10)" fill="#ffe066" ${o('#e0a100', 0.8)}/>`).join('')}
  <circle cx="12" cy="10" r="2.8" fill="#f08c00"/>`,
);

const CASTLE = svg(
  '0 0 32 30',
  1.07,
  1,
  `<path d="M4 29 V12 h3 v-3 h2 v3 h2 v-3 h2 v3 h1 V9 h1 V5 h2 v4 h1 v3 h1 v-3 h2 v3 h2 v-3 h2 v3 h3 V29Z" fill="#c9b8ec"/>
  <path d="M5.5 12 L9 4 L12.5 12Z M19.5 12 L23 4 L26.5 12Z" fill="#9b7fd9"/>
  <path d="M16 5 L16 0.8 L20 2.2 L16 3.6" fill="#ff8fc7"/>
  <path d="M13 29 V22 a3 3 0 0 1 6 0 V29Z" fill="#8a6cc9"/>
  <rect x="8" y="16" width="2.4" height="3.6" rx="1.2" fill="#8a6cc9"/><rect x="21.6" y="16" width="2.4" height="3.6" rx="1.2" fill="#8a6cc9"/>`,
);

const MUSHROOM = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M9 13 h6 l1 9 h-8Z" fill="#fff4e0" ${o('#c9a27a', 1)}/>
  <path d="M2 14 C2 6 7 2.5 12 2.5 S22 6 22 14Z" fill="#ff5a5f" ${o('#b8222a', 1.2)}/>
  <circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="15.5" cy="7" r="1.6" fill="#fff"/><circle cx="18" cy="11.5" r="1.3" fill="#fff"/><circle cx="5.5" cy="12" r="1.1" fill="#fff"/>`,
);

const PLANET = svg(
  '0 0 32 24',
  1.33,
  1,
  `<path d="M3 16 C0 20 8 20.5 16 17.5 S32 9.5 29 6.5" fill="none" stroke="#ffd8a8" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
  <circle cx="16" cy="12" r="8.5" fill="#f4a261"/>
  <path d="M8.5 9.5 C12 11 20 11 23.8 9.2 M8 14 C12 15.5 20 15.5 24 13.8" stroke="#e76f51" stroke-width="1.6" fill="none" opacity="0.6"/>
  <path d="M3 16 C6 13.5 10 12.6 12.5 12.3 M19.5 11.6 C23.5 10.8 27.5 8.6 29 6.5" fill="none" stroke="#ffd8a8" stroke-width="2.2" stroke-linecap="round"/>
  ${shine(12, 7.5, 2.2, 1.2)}`,
);

const MOON = svg('0 0 24 24', 1, 1, `<path d="M15 2.5 A9.5 9.5 0 1 0 21.5 17 A8 8 0 0 1 15 2.5Z" fill="#fff3b0"/><circle cx="9" cy="14" r="1.6" fill="#f1dc85"/><circle cx="12.5" cy="18.5" r="1" fill="#f1dc85"/>`);

const SUN = svg(
  '0 0 24 24',
  1,
  1,
  `${Array.from({ length: 12 }, (_, i) => `<path d="M12 1.2 L13.2 4 H10.8Z" transform="rotate(${i * 30} 12 12)" fill="#ffc53d"/>`).join('')}
  <circle cx="12" cy="12" r="6.8" fill="#ffd84d"/><circle cx="12" cy="12" r="5" fill="#ffe477"/>`,
);

const fish = (body: string, fin: string) =>
  svg(
    '0 0 28 18',
    1.56,
    1,
    `<path d="M22 9 L27.5 3.5 V14.5Z" fill="${fin}"/>
    <ellipse cx="13" cy="9" rx="10" ry="6.5" fill="${body}"/>
    <path d="M10 2.8 L14 0.8 L16 3.2Z" fill="${fin}"/>
    <path d="M13 3.5 C11 6 11 12 13 14.5" fill="none" stroke="${fin}" stroke-width="1.4" opacity="0.7"/>
    <circle cx="7.5" cy="7.6" r="1.7" fill="#fff"/><circle cx="7.2" cy="7.6" r="0.9" fill="#1d2b3a"/>`,
  );

const SEAWEED = svg(
  '0 0 20 30',
  0.67,
  1,
  `<path d="M6 30 C2 24 9 20 5 14 S8 5 6 1" fill="none" stroke="#2f9e6e" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M13 30 C17 25 10 21 14 15 S12 8 15 5" fill="none" stroke="#40c08a" stroke-width="2.8" stroke-linecap="round"/>`,
);

const SHELL = svg(
  '0 0 24 22',
  1.1,
  1,
  `<path d="M12 20.5 C5 20.5 1.5 15 2 10 C3 4 8 1.5 12 1.5 S21 4 22 10 C22.5 15 19 20.5 12 20.5Z" fill="#ffc9b9"/>
  <path d="M12 20 L12 3 M12 20 L6 4.5 M12 20 L18 4.5 M12 20 L2.8 9 M12 20 L21.2 9" stroke="#f08f7a" stroke-width="1.1" stroke-linecap="round"/>
  <rect x="9" y="18.5" width="6" height="3" rx="1.2" fill="#f5a28f"/>`,
);

const LOLLIPOP = svg(
  '0 0 24 32',
  0.75,
  1,
  `<rect x="11" y="14" width="2" height="17.5" rx="1" fill="#f1f3f5"/>
  <circle cx="12" cy="11" r="9.5" fill="#ff8fc7"/>
  <path d="M12 11 m0 -7 a7 7 0 1 1 -6.3 4 M12 11 m0 -4 a4 4 0 1 0 3.6 2.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
);

const DONUT = svg(
  '0 0 24 24',
  1,
  1,
  `<circle cx="12" cy="12" r="10" fill="#e8b27a"/>
  <path d="M12 3.5 C17.5 3.5 20.5 7 20.5 11 C19 12.5 18.5 11 17 12.5 C15.5 14 14 12 12.5 13.8 C11 15.4 9.5 13 8 14.5 C6.5 16 5 13.5 3.6 12.8 C3.2 7.5 6.5 3.5 12 3.5Z" fill="#ff8fc7"/>
  <circle cx="12" cy="11.5" r="3.2" fill="var(--hole, #fde2ef)"/>
  <path d="M8 6.5 l1.2 0.6 M15 5.8 l-0.4 1.3 M17.5 9.5 l1.2 -0.3 M6 10 l0.6 -1.1" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>`,
);

const CUPCAKE = svg(
  '0 0 24 24',
  1,
  1,
  `<path d="M4.5 12.5 H19.5 L17.5 22.5 H6.5Z" fill="#74c0fc"/>
  <path d="M8.5 12.5 L9.3 22.5 M12 12.5 V22.5 M15.5 12.5 L14.7 22.5" stroke="#4dabf7" stroke-width="1"/>
  ${blob([[7.5, 11.5, 3.6], [12, 9.5, 4.8], [16.5, 11.5, 3.6], [12, 5.5, 3]], '#fff0f6', '#fcc2d7', 0.5)}
  <circle cx="12" cy="2.6" r="2" fill="#e8364f"/>`,
);

const VOLCANO = svg(
  '0 0 32 24',
  1.33,
  1,
  `<path d="M1 24 L11.5 6 H20.5 L31 24Z" fill="#8d6e63"/>
  <path d="M11.5 6 H20.5 L19.5 8 L17.5 12.5 L16 9.5 L14 13 L12.4 8Z" fill="#ff7a1a"/>
  ${blob([[13, 3, 2.4], [17, 1.8, 2.8], [20.5, 3.2, 2]], '#d9cfc9', '#d9cfc9', 0.1)}`,
);

const PALM = svg(
  '0 0 28 32',
  0.88,
  1,
  `<path d="M14.5 31.5 C14 24 13 16 15.5 9" fill="none" stroke="#a47148" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M15.5 9 C11 5 5 5.5 1.5 9.5 C6 8 10 8.5 15.5 9Z M15.5 9 C20 5 25.5 5.5 27 10 C22.5 8 19.5 8.5 15.5 9Z M15.5 9 C13 4 13.5 1 16.5 0.5 C15.5 3.5 16 6 15.5 9Z M15.5 9 C11.5 10 7.5 13.5 7 17 C10 13 12.5 11.5 15.5 9Z M15.5 9 C19.5 10 23 13 23.5 16.5 C20.5 13 18.5 11.5 15.5 9Z" fill="#51b05a"/>`,
);

// Emoji → drawing. Anything not listed stays an emoji.
const GLYPHS: Record<string, string> = {
  '✨': SPARKLE,
  '⭐': STAR,
  '🌟': GLOW_STAR,
  '💫': DIZZY,
  '💨': PUFF,
  '💥': IMPACT,
  '💧': DROP,
  '💦': DROPS,
  '🎵': NOTE,
  '🎶': NOTES,
  '❄': SNOWFLAKE,
  '💤': ZZZ,
  '🪶': FEATHER,
  '🔥': FLAME,
  '⚡': BOLT,
  '💖': HEART,
  '💗': HEART,
  '❤': HEART,
  '💕': HEARTS,
  '🎉': STREAMER,
  '🎊': CONFETTI,
  '☁': CLOUD,
  '🌧': RAIN,
  '🌈': RAINBOW,
  '🪄': WAND,
  '👑': CROWN,
  '🥕': CARROT,
  '🎈': BALLOON,
  '🍃': LEAF,
  '🍬': CANDY,
  '🧱': BRICK,
  '⚙': GEAR,
  '🔩': NUT,
  '🌾': WHEAT,
  '☕': CUP,
  '🌳': TREE,
  '🌼': FLOWER,
  '🏰': CASTLE,
  '🍄': MUSHROOM,
  '🪐': PLANET,
  '🌙': MOON,
  '☀': SUN,
  '🐠': fish('#ffa94d', '#f76707'),
  '🐟': fish('#74c0fc', '#339af0'),
  '🌿': SEAWEED,
  '🐚': SHELL,
  '🍭': LOLLIPOP,
  '🍩': DONUT,
  '🧁': CUPCAKE,
  '🌋': VOLCANO,
  '🌴': PALM,
  '🐸': FROG,
  '🥧': PIE,
  '🌪': TORNADO,
  '🍌': BANANA,
  '🎆': FIREWORK('#ff6fa8', '#ffd43b'),
  '🎇': FIREWORK('#74c0fc', '#fff3b0'),
  '⚪': CREAM,
  '🤍': CREAM,
  '🍒': CHERRY,
  '🛸': UFO,
  '🥚': EGG,
};

/** The drawing for an emoji, or the emoji itself if there isn't one. */
export function glyph(content: string): string {
  if (!content || content.length > 4) return content;
  return GLYPHS[content.replace(/️/g, '')] ?? content;
}
