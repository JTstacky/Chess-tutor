// Board and piece themes. Each theme has its own team for White and for Black,
// with recoloured pieces, a sidekick pet and a backdrop for the battle arena.
import type { Color, PieceSymbol } from 'chess.js';
import { PIECE_ART } from './pieceart';

export interface Team {
  name: string;
  pet: string; // sidekick that cheers in battles ('' = none)
  body: [string, string]; // gradient, top to bottom
  line: string; // outline
  detail: string; // inner lines (black-side artwork only)
  glow?: string; // soft glow around the pieces
}

export interface Theme {
  id: string;
  name: string;
  icon: string;
  light: string; // board squares
  dark: string;
  page: string; // page background while playing
  spark: string; // particle used for sparkles and trails
  deco: [emoji: string, x: number, y: number, size: number][]; // battle backdrop decorations
  w: Team;
  b: Team;
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    icon: '♟️',
    light: '#eeeed2',
    dark: '#769656',
    page: '#f4f0ff',
    spark: '✨',
    deco: [['☁️', 30, 34, 12], ['☁️', 78, 30, 9], ['🌳', 8, 70, 13], ['🌼', 93, 88, 6]],
    w: { name: 'White', pet: '', body: ['#fff', '#fff'], line: '#000', detail: '#000' },
    b: { name: 'Black', pet: '', body: ['#000', '#000'], line: '#000', detail: '#ececec' },
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    icon: '🏰',
    light: '#f7e7c6',
    dark: '#a9825a',
    page: 'linear-gradient(160deg, #f6e8ff, #ffe9d1)',
    spark: '✨',
    deco: [['🏰', 10, 62, 18], ['🌈', 80, 36, 16], ['✨', 45, 34, 6], ['🍄', 93, 88, 7]],
    w: { name: 'Unicorn Kingdom', pet: '🦄', body: ['#fffdf4', '#f3d27a'], line: '#7a4d00', detail: '#7a4d00', glow: 'rgba(255, 210, 80, 0.75)' },
    b: { name: 'Dragon Clan', pet: '🐉', body: ['#7b3aa6', '#2c0b47'], line: '#16021f', detail: '#ffa23a', glow: 'rgba(255, 110, 40, 0.6)' },
  },
  {
    id: 'space',
    name: 'Space',
    icon: '🚀',
    light: '#b8c4dc',
    dark: '#46558a',
    page: 'linear-gradient(160deg, #e3e7ff, #cfc6f7)',
    spark: '⭐',
    deco: [['🪐', 82, 36, 14], ['🌙', 14, 32, 10], ['⭐', 50, 32, 5], ['🛸', 34, 42, 7]],
    w: { name: 'Robot Squad', pet: '🤖', body: ['#ffffff', '#9fb3c9'], line: '#1d2b45', detail: '#1d2b45', glow: 'rgba(0, 220, 255, 0.8)' },
    b: { name: 'Alien Crew', pet: '👽', body: ['#4cc34c', '#135a22'], line: '#062610', detail: '#c6ff6b', glow: 'rgba(150, 255, 80, 0.7)' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    icon: '🌊',
    light: '#f4e4b4',
    dark: '#4aa3c7',
    page: 'linear-gradient(180deg, #d4f4ff, #9edcf2)',
    spark: '🫧',
    deco: [['🐠', 18, 36, 9], ['🐟', 76, 34, 8], ['🌿', 8, 72, 14], ['🐚', 92, 90, 6]],
    w: { name: 'Dolphin Reef', pet: '🐬', body: ['#f4feff', '#9ce4f4'], line: '#0b4a60', detail: '#0b4a60', glow: 'rgba(120, 230, 255, 0.7)' },
    b: { name: 'Shark Squad', pet: '🦈', body: ['#56789a', '#1b2c44'], line: '#08121e', detail: '#ff9480' },
  },
  {
    id: 'candy',
    name: 'Candy',
    icon: '🍭',
    light: '#fff0f7',
    dark: '#8fd9c0',
    page: 'linear-gradient(160deg, #ffe0f0, #e0fff4)',
    spark: '🍬',
    deco: [['🍭', 10, 64, 16], ['🍩', 82, 34, 11], ['🍬', 42, 34, 7], ['🧁', 93, 88, 8]],
    w: { name: 'Cupcake Crew', pet: '🧁', body: ['#fff7fc', '#ffb9dc'], line: '#a8286a', detail: '#a8286a', glow: 'rgba(255, 150, 210, 0.7)' },
    b: { name: 'Choco Gang', pet: '🍫', body: ['#91603f', '#44250f'], line: '#1f0e04', detail: '#ffcce6' },
  },
  {
    id: 'dino',
    name: 'Dino',
    icon: '🦕',
    light: '#eef3cf',
    dark: '#7b9b48',
    page: 'linear-gradient(160deg, #fff1cf, #dff0c0)',
    spark: '🍃',
    deco: [['🌋', 52, 58, 15], ['🌴', 9, 62, 18], ['🥚', 93, 88, 6], ['☀️', 30, 32, 10]],
    w: { name: 'Tricera-Team', pet: '🦕', body: ['#fdffec', '#c3e58d'], line: '#34520c', detail: '#34520c', glow: 'rgba(190, 255, 120, 0.6)' },
    b: { name: 'T-Rex Gang', pet: '🦖', body: ['#b8482a', '#551a0b'], line: '#260902', detail: '#ffd45a' },
  },
];

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const cache = new Map<string, string>();

/** Image URL for a piece in a theme. */
export function pieceSrc(theme: Theme, color: Color, type: PieceSymbol): string {
  if (theme.id === 'classic') return `${import.meta.env.BASE_URL}pieces/${color}${type.toUpperCase()}.svg`;
  const key = `${theme.id}${color}${type}`;
  let url = cache.get(key);
  if (!url) {
    const team = theme[color];
    const art = PIECE_ART[color + type].replace(/="([BLD])"/g, (_, k: string) =>
      `="${k === 'B' ? 'url(#g)' : k === 'L' ? team.line : team.detail}"`,
    );
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${team.body[0]}"/>` +
      `<stop offset="1" stop-color="${team.body[1]}"/></linearGradient></defs>${art}</svg>`;
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    cache.set(key, url);
  }
  return url;
}

export function glowFilter(team: Team): string {
  return team.glow ? `drop-shadow(0 0 2px ${team.glow})` : 'none';
}
