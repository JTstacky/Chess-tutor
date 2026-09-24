// Board and piece themes. Each theme has its own team for White and for Black,
// drawn as characters (see characters.ts), with a sidekick pet and a backdrop for the battle arena.
import type { Color, PieceSymbol } from 'chess.js';
import { characterArt } from './characters';

export interface Team {
  name: string;
  pet: string; // sidekick that cheers in battles ('' = none)
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
    w: { name: 'White', pet: '' },
    b: { name: 'Black', pet: '' },
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
    w: { name: 'Unicorn Kingdom', pet: '🦄', glow: 'rgba(255, 210, 80, 0.75)' },
    b: { name: 'Dragon Clan', pet: '🐉', glow: 'rgba(255, 110, 40, 0.6)' },
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
    w: { name: 'Robot Squad', pet: '🤖', glow: 'rgba(0, 220, 255, 0.8)' },
    b: { name: 'Alien Crew', pet: '👽', glow: 'rgba(150, 255, 80, 0.7)' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    icon: '🌊',
    light: '#f4e4b4',
    dark: '#4aa3c7',
    page: 'linear-gradient(180deg, #d4f4ff, #9edcf2)',
    spark: '💧',
    deco: [['🐠', 18, 36, 9], ['🐟', 76, 34, 8], ['🌿', 8, 72, 14], ['🐚', 92, 90, 6]],
    w: { name: 'Dolphin Reef', pet: '🐬', glow: 'rgba(120, 230, 255, 0.7)' },
    b: { name: 'Shark Squad', pet: '🦈' },
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
    w: { name: 'Cupcake Crew', pet: '🧁', glow: 'rgba(255, 150, 210, 0.7)' },
    b: { name: 'Choco Gang', pet: '🍫' },
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
    w: { name: 'Tricera-Team', pet: '🦕', glow: 'rgba(190, 255, 120, 0.6)' },
    b: { name: 'T-Rex Gang', pet: '🦖' },
  },
];

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const cache = new Map<string, string>();

/**
 * Image URL for a piece in a theme: the classic set, or the theme's characters.
 * `eyes: false` leaves the eyes off (battles draw their own animated eyes).
 */
export function pieceSrc(theme: Theme, color: Color, type: PieceSymbol, eyes = true): string {
  const art = theme.id === 'classic' ? null : characterArt(`${theme.id}-${color}`, type, eyes);
  if (!art) return `${import.meta.env.BASE_URL}pieces/${color}${type.toUpperCase()}.svg`;
  const key = `${theme.id}${color}${type}${eyes}`;
  let url = cache.get(key);
  if (!url) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45">${art}</svg>`;
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    cache.set(key, url);
  }
  return url;
}

export function glowFilter(team: Team): string {
  return team.glow ? `drop-shadow(0 0 2px ${team.glow})` : 'none';
}
