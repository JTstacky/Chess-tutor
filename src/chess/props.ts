// Hand-drawn props for the battles (SVG, sized in em so a prop's font-size sets its size).
// Drawn rather than emoji so they look the same on every device and point the right way:
// everything that aims faces right (towards the victim).

const svg = (vb: string, w: number, h: number, body: string) =>
  `<svg viewBox="${vb}" width="${w}em" height="${h}em" style="display:block;overflow:visible">${body}</svg>`;

const grad = (id: string, top: string, bottom: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`;

export const SLINGSHOT = svg(
  '0 0 20 30',
  0.67,
  1,
  `${grad('ss-w', '#c98b4f', '#7a4a1e')}
  <path d="M8.5 29 V17 L3 4 M11.5 29 V17 L17 4" stroke="#5a3210" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8.5 29 V17 L3 4 M11.5 29 V17 L17 4" stroke="url(#ss-w)" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 24 h4 M8 26.5 h4" stroke="#e8c07a" stroke-width="1"/>`,
);

export const BAND = svg('0 0 20 10', 1, 0.5, `<path d="M1 1 Q10 9 19 1" stroke="#e8455a" stroke-width="1.6" fill="none"/><rect x="7.5" y="4" width="5" height="3.4" rx="1" fill="#8a4b20"/>`);

export const PEBBLE = svg('0 0 10 10', 1, 1, `<ellipse cx="5" cy="5.4" rx="4.4" ry="3.8" fill="#9aa0a6" stroke="#4a4f55" stroke-width="0.8"/><ellipse cx="3.6" cy="4" rx="1.3" ry="0.8" fill="#d6dade"/>`);

export const POGO = svg(
  '0 0 16 40',
  0.4,
  1,
  `${grad('pg-r', '#ff7a7a', '#c81e1e')}
  <rect x="7" y="0" width="2" height="31" fill="#b8c2cc" stroke="#4a5560" stroke-width="0.6"/>
  <rect x="1" y="3" width="14" height="3" rx="1.5" fill="#333"/>
  <rect x="1" y="20" width="14" height="2.6" rx="1.2" fill="url(#pg-r)" stroke="#6b0f0f" stroke-width="0.6"/>
  <path d="M8 31 l-3 2 6 2 -6 2 3 2" stroke="#4a5560" stroke-width="1.1" fill="none"/>
  <rect x="5.5" y="38" width="5" height="2" rx="1" fill="#222"/>`,
);

export const SNOWBALL = svg('0 0 12 12', 1, 1, `<circle cx="6" cy="6" r="5.2" fill="#fff" stroke="#9cc6e0" stroke-width="0.8"/><path d="M3 5 q1 -1 2 0 M6.5 8 q1 -1 2 0" stroke="#cfe6f5" stroke-width="0.8" fill="none"/><circle cx="4" cy="3.6" r="1" fill="#fff"/>`);

export const HORSESHOE = svg(
  '0 0 24 24',
  1,
  1,
  `${grad('hs', '#e9eef3', '#8f9ba8')}
  <path d="M5 21 L3.5 12 C2.5 5 21.5 5 20.5 12 L19 21 L15 21 L16.2 12.5 C16.8 9 7.2 9 7.8 12.5 L9 21 Z" fill="url(#hs)" stroke="#3d4751" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="5.2" cy="14" r="0.8" fill="#3d4751"/><circle cx="18.8" cy="14" r="0.8" fill="#3d4751"/><circle cx="7.4" cy="8.4" r="0.8" fill="#3d4751"/><circle cx="16.6" cy="8.4" r="0.8" fill="#3d4751"/>`,
);

export const HAY_BALE = svg(
  '0 0 30 22',
  1.36,
  1,
  `${grad('hay', '#ffe28a', '#d9a520')}
  <rect x="1" y="2" width="28" height="19" rx="5" fill="url(#hay)" stroke="#8a6410" stroke-width="1"/>
  <path d="M4 7 l3 -2 M9 14 l4 -2 M17 6 l3 -2 M21 16 l4 -2 M6 17 l2 -3 M14 9 l3 1" stroke="#b8860b" stroke-width="0.9"/>
  <path d="M10 2.5 V20.5 M20 2.5 V20.5" stroke="#b5462a" stroke-width="1.6"/>
  <path d="M1 8 l-2 -1 M1 13 l-2 1 M29 9 l2 -1 M29 14 l2 1" stroke="#d9a520" stroke-width="1"/>`,
);

export const METEOR = svg(
  '0 0 30 30',
  1,
  1,
  `${grad('mt', '#a0856a', '#5a4230')}
  <path d="M20 10 L2 28 L8 26 L4 30 L14 22 Z" fill="#ffb13b" opacity="0.9"/>
  <path d="M20 10 L6 26 L12 22 Z" fill="#ffe14d"/>
  <circle cx="21" cy="9" r="7" fill="url(#mt)" stroke="#3a2a1c" stroke-width="1"/>
  <circle cx="19" cy="7" r="1.6" fill="#3a2a1c" opacity="0.6"/><circle cx="23.5" cy="11" r="1.2" fill="#3a2a1c" opacity="0.6"/><circle cx="22" cy="5.5" r="0.8" fill="#3a2a1c" opacity="0.6"/>`,
);

export const BEE = svg(
  '0 0 22 16',
  1.37,
  1,
  `<ellipse cx="9" cy="3.5" rx="4" ry="3" fill="#e8f7ff" stroke="#6aa6c8" stroke-width="0.6" opacity="0.9"/>
  <ellipse cx="13" cy="3.2" rx="3.4" ry="2.6" fill="#e8f7ff" stroke="#6aa6c8" stroke-width="0.6" opacity="0.9"/>
  <ellipse cx="11" cy="10" rx="8" ry="5.4" fill="#ffd23f" stroke="#2b1d00" stroke-width="0.8"/>
  <path d="M8 5 q-1.2 5 0 10 M11.5 4.7 q-1.2 5.3 0 10.6 M15 5.4 q-1 4.6 0 9.2" stroke="#2b1d00" stroke-width="1.8" fill="none"/>
  <circle cx="18" cy="9" r="1" fill="#2b1d00"/><path d="M17 12 q1.5 1 2.5 -0.5" stroke="#2b1d00" stroke-width="0.6" fill="none"/>
  <path d="M3 10 L0.5 10.4" stroke="#2b1d00" stroke-width="1"/>`,
);

export const MAGIC_HAND = svg(
  '0 0 40 30',
  1.33,
  1,
  `<defs><radialGradient id="mh"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b98cff"/></radialGradient></defs>
  <g opacity="0.85" stroke="#7b4dff" stroke-width="1" stroke-linejoin="round" fill="url(#mh)">
  <path d="M2 18 C2 12 8 10 14 11 L31 11 C34 11 34 15 31 15 L22 15 L33 15.5 C36 16 36 20 33 20 L22 20 L31 20.5 C34 21 34 25 31 25 L21 25 L27 25.5 C30 26 30 29.5 27 29.5 L14 29.5 C6 29.5 2 25 2 18 Z"/>
  <path d="M14 11 C15 6 20 4 23 6 C24 8 20 9 19 11 Z"/></g>
  <path d="M6 16 q2 -2 5 -1" stroke="#fff" stroke-width="1" fill="none"/>`,
);

export const SPIRAL = svg(
  '0 0 30 30',
  1,
  1,
  `<circle cx="15" cy="15" r="14" fill="#fff" stroke="#2b2250" stroke-width="1"/>
  <path d="M15 15 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a3 3 0 1 1 3 3 a4.5 4.5 0 1 1 -4.5 -4.5 a6 6 0 1 1 6 6 a7.5 7.5 0 1 1 -7.5 -7.5 a9 9 0 1 1 9 9 a10.5 10.5 0 1 1 -10.5 -10.5" fill="none" stroke="#7b2cbf" stroke-width="1.8"/>`,
);

export const SNOW_GLOBE = svg(
  '0 0 30 34',
  0.88,
  1,
  `<defs><radialGradient id="sg" cx="0.35" cy="0.3"><stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/><stop offset="1" stop-color="#a8dcff" stop-opacity="0.35"/></radialGradient></defs>
  ${grad('sgb', '#c07a4a', '#6d3a18')}
  <circle cx="15" cy="14" r="13" fill="url(#sg)" stroke="#6aa6c8" stroke-width="1"/>
  <ellipse cx="15" cy="23" rx="10" ry="2.4" fill="#fff" opacity="0.85"/>
  <path d="M4 27 H26 L24 33 H6 Z" fill="url(#sgb)" stroke="#3d1c08" stroke-width="1" stroke-linejoin="round"/>
  <path d="M8 29.5 h14" stroke="#ffd45a" stroke-width="1"/>
  <ellipse cx="9.5" cy="8" rx="3" ry="1.6" fill="#fff" opacity="0.7" transform="rotate(-35 9.5 8)"/>`,
);

export const FLAMES = svg(
  '0 0 24 26',
  0.92,
  1,
  `<path d="M12 26 C4 20 2 12 6 3 C7 9 9 10 10 6 C11 10 13 11 14 4 C16 10 18 11 19 6 C23 13 20 21 12 26 Z" fill="#ff7a1a"/>
  <path d="M12 23 C7 19 6 14 8.5 9 C9.5 13 11 13 12 9.5 C13 13 14.5 13 15.5 9.5 C18 14 16.5 19 12 23 Z" fill="#ffd23f"/>`,
);

export const CATAPULT = svg(
  '0 0 44 30',
  1.47,
  1,
  `${grad('cp', '#b07a45', '#6d4320')}
  <rect x="2" y="21" width="34" height="4" rx="1.5" fill="url(#cp)" stroke="#3d220c" stroke-width="0.8"/>
  <circle cx="8" cy="26" r="3.4" fill="#5a3a1e" stroke="#2b1a08" stroke-width="0.8"/><circle cx="8" cy="26" r="1" fill="#c9a26b"/>
  <circle cx="30" cy="26" r="3.4" fill="#5a3a1e" stroke="#2b1a08" stroke-width="0.8"/><circle cx="30" cy="26" r="1" fill="#c9a26b"/>
  <path d="M19 21 L23 10 L27 21" fill="none" stroke="#6d4320" stroke-width="2.2" stroke-linejoin="round"/>`,
);

export const CATAPULT_ARM = svg(
  '0 0 30 8',
  1,
  0.27,
  `<rect x="0" y="2.5" width="24" height="2.6" rx="1.2" fill="#8a5a2b" stroke="#3d220c" stroke-width="0.6"/>
  <path d="M22 2 Q26 -1 29.5 2 Q27 7 22 5.5 Z" fill="#6d4320" stroke="#3d220c" stroke-width="0.6"/>`,
);

export const BOULDER = svg('0 0 20 18', 1.11, 1, `${grad('bd', '#b3b3b3', '#6b6b6b')}<path d="M3 13 C0 8 3 2 9 1.5 C15 1 20 5 19 11 C18.5 16 13 17.5 8.5 17 C5.5 16.7 4 15 3 13 Z" fill="url(#bd)" stroke="#3a3a3a" stroke-width="1"/><path d="M6 6 q2 -2 4 -1 M12 12 l2 1 M7 13 l1.5 -1" stroke="#555" stroke-width="0.8" fill="none"/>`);

export const DRAWBRIDGE = svg(
  '0 0 12 40',
  0.3,
  1,
  `${grad('db', '#b07a45', '#7a4a1e')}
  <rect x="1" y="1" width="10" height="38" rx="1" fill="url(#db)" stroke="#3d220c" stroke-width="0.8"/>
  <path d="M1 7 h10 M1 13 h10 M1 19 h10 M1 25 h10 M1 31 h10" stroke="#5a3210" stroke-width="0.6"/>
  <circle cx="3" cy="4" r="0.6" fill="#333"/><circle cx="9" cy="4" r="0.6" fill="#333"/><circle cx="3" cy="36" r="0.6" fill="#333"/><circle cx="9" cy="36" r="0.6" fill="#333"/>`,
);

export const BRICK = svg('0 0 20 10', 2, 1, `${grad('bk', '#e0643c', '#a53a1a')}<rect x="0.5" y="0.5" width="19" height="9" rx="1" fill="url(#bk)" stroke="#5c1c08" stroke-width="0.8"/><path d="M3 3 h3 M12 6 h4" stroke="#ff9a7a" stroke-width="0.7"/>`);

export const FIREWORK = svg(
  '0 0 12 30',
  0.4,
  1,
  `${grad('fw', '#ff6fae', '#b5176b')}
  <path d="M6 0 L10 7 H2 Z" fill="#ffd23f" stroke="#7a5500" stroke-width="0.6"/>
  <rect x="2" y="7" width="8" height="14" fill="url(#fw)" stroke="#5c0a33" stroke-width="0.6"/>
  <path d="M2 11 h8 M2 16 h8" stroke="#fff" stroke-width="1"/>
  <path d="M6 21 V30" stroke="#8a5a2b" stroke-width="1"/>`,
);

export const MIRROR = svg(
  '0 0 26 36',
  0.72,
  1,
  `${grad('mr', '#ffe98a', '#c99a14')}
  <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f7ff"/><stop offset="0.5" stop-color="#9ed3f0"/><stop offset="1" stop-color="#d8f0ff"/></linearGradient></defs>
  <ellipse cx="13" cy="15" rx="12" ry="14" fill="url(#mr)" stroke="#7a5500" stroke-width="1"/>
  <ellipse cx="13" cy="15" rx="9" ry="11" fill="url(#mg)" stroke="#7a5500" stroke-width="0.6"/>
  <path d="M7 10 l4 -4 M8 14 l6 -6" stroke="#fff" stroke-width="1.2" opacity="0.8"/>
  <path d="M10 29 h6 l-1 6 h-4 Z" fill="url(#mr)" stroke="#7a5500" stroke-width="0.8"/>
  <circle cx="13" cy="2" r="1.6" fill="#ff5fa2" stroke="#7a5500" stroke-width="0.5"/>`,
);

export const STAR_WAND = svg(
  '0 0 20 40',
  0.5,
  1,
  `${grad('sw', '#fff6a8', '#ffc21a')}
  <rect x="9" y="14" width="2.2" height="26" rx="1" fill="#ff8fc8" stroke="#a8286a" stroke-width="0.6"/>
  <path d="M10 1 L12.6 7.4 L19.4 7.8 L14.2 12.2 L15.9 18.8 L10 15.1 L4.1 18.8 L5.8 12.2 L0.6 7.8 L7.4 7.4 Z" fill="url(#sw)" stroke="#b8860b" stroke-width="0.9" stroke-linejoin="round"/>`,
);

export const GUARD = svg(
  '0 0 20 36',
  0.56,
  1,
  `<rect x="4" y="1" width="12" height="11" rx="5" fill="#222"/>
  <circle cx="10" cy="14" r="4.4" fill="#ffe0c2" stroke="#6b3f1f" stroke-width="0.6"/>
  <circle cx="8.4" cy="13.6" r="0.7" fill="#222"/><circle cx="11.6" cy="13.6" r="0.7" fill="#222"/>
  <path d="M8.6 15.8 q1.4 1 2.8 0" stroke="#6b3f1f" stroke-width="0.6" fill="none"/>
  <rect x="5" y="18" width="10" height="10" rx="2" fill="#d62828" stroke="#6b0f0f" stroke-width="0.6"/>
  <path d="M10 18 v10 M5 22 h10" stroke="#ffd45a" stroke-width="0.8"/>
  <rect x="5.4" y="28" width="3.6" height="7" fill="#1d3557"/><rect x="11" y="28" width="3.6" height="7" fill="#1d3557"/>
  <rect x="16" y="6" width="3" height="18" rx="1.4" fill="#fff" stroke="#999" stroke-width="0.5"/>`,
);

export const THRONE = svg(
  '0 0 30 36',
  0.83,
  1,
  `${grad('th', '#ffe98a', '#c99a14')}${grad('thc', '#e04b6a', '#8a1030')}
  <path d="M4 34 V6 L8 1 L12 5 L15 0 L18 5 L22 1 L26 6 V34" fill="url(#th)" stroke="#7a5500" stroke-width="1" stroke-linejoin="round"/>
  <rect x="7" y="8" width="16" height="16" rx="2" fill="url(#thc)"/>
  <rect x="2" y="22" width="26" height="6" rx="2" fill="url(#thc)" stroke="#5c0a1f" stroke-width="0.8"/>
  <rect x="3" y="28" width="3" height="7" fill="#c99a14"/><rect x="24" y="28" width="3" height="7" fill="#c99a14"/>
  <circle cx="15" cy="5" r="1.4" fill="#3ec1ff"/>`,
);

export const CAKE = svg(
  '0 0 26 22',
  1.18,
  1,
  `<path d="M2 10 L24 6 V19 L2 21 Z" fill="#f7d9a8" stroke="#8a5a2b" stroke-width="0.8"/>
  <path d="M2 14 L24 11.5" stroke="#e8455a" stroke-width="2"/>
  <path d="M2 10 L24 6 L22 3 L1 8 Z" fill="#fff5fb" stroke="#d9a0c0" stroke-width="0.8"/>
  <path d="M5 9.5 q1 3 2 0 M11 8.5 q1 3 2 0 M17 7.5 q1 3 2 0" fill="#fff5fb" stroke="#d9a0c0" stroke-width="0.6"/>
  <circle cx="13" cy="4" r="2" fill="#e8173c"/><path d="M13 2 q1 -2 3 -2" stroke="#2f6b25" stroke-width="0.6" fill="none"/>`,
);

export const TOY_SWORD = svg(
  '0 0 40 12',
  1,
  0.3,
  `<path d="M12 4 H37 L40 6 L37 8 H12 Z" fill="#dfe8f0" stroke="#5a6570" stroke-width="0.8" stroke-linejoin="round"/>
  <path d="M13 6 H36" stroke="#fff" stroke-width="0.8"/>
  <rect x="9" y="0" width="3" height="12" rx="1.2" fill="#ffd45a" stroke="#7a5500" stroke-width="0.6"/>
  <rect x="1" y="4.4" width="8" height="3.2" rx="1.4" fill="#8a1030"/>
  <circle cx="1.6" cy="6" r="1.6" fill="#ffd45a"/>`,
);

export const WHITE_FLAG = svg(
  '0 0 26 34',
  0.76,
  1,
  `<rect x="2" y="1" width="1.6" height="33" rx="0.8" fill="#8a5a2b"/>
  <path d="M3.6 2 C9 0 13 5 18 3 C21 2 23 2 25 3 V16 C23 15 21 15 18 16 C13 18 9 13 3.6 15 Z" fill="#fff" stroke="#9aa0a6" stroke-width="0.8"/>`,
);

export const BALLOONS = svg(
  '0 0 30 40',
  0.75,
  1,
  `<path d="M8 17 L15 39 M15 16 L15 39 M22 17 L15 39" stroke="#666" stroke-width="0.5" fill="none"/>
  <ellipse cx="8" cy="10" rx="6" ry="7.4" fill="#ff5a6e"/><ellipse cx="22" cy="10" rx="6" ry="7.4" fill="#3ec1ff"/><ellipse cx="15" cy="8" rx="6" ry="7.4" fill="#ffd23f"/>
  <ellipse cx="6" cy="7" rx="1.4" ry="2.2" fill="#fff" opacity="0.6"/><ellipse cx="13" cy="5" rx="1.4" ry="2.2" fill="#fff" opacity="0.6"/><ellipse cx="20" cy="7" rx="1.4" ry="2.2" fill="#fff" opacity="0.6"/>`,
);

export const PILLOW_STRETCHER = svg(
  '0 0 40 8',
  1,
  0.2,
  `<rect x="0" y="2" width="40" height="3" rx="1.5" fill="#8a5a2b"/><rect x="4" y="0" width="32" height="4" rx="2" fill="#fff" stroke="#e89ac2" stroke-width="0.6"/>`,
);
