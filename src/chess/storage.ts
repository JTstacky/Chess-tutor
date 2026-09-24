// Progress and settings, saved in this browser only.

export interface Settings {
  sound: boolean;
  coaching: boolean; // master switch for all coaching features
  hints: boolean;
  blunderWarnings: boolean;
  threatWarnings: boolean;
  openingNames: boolean;
  funMoves: boolean; // each piece has its own way of moving
  battles: boolean; // captures play a battle animation
  unlockAllBots: boolean;
}

export interface Profile {
  name: string;
  rating: number;
  unlockedBots: string[]; // bot ids the player has unlocked
  beatenBots: string[];
  games: number;
  wins: number;
  losses: number;
  draws: number;
  lessonStars: Record<string, number>; // lesson id -> best stars (1-3)
  lessonExplored: Record<string, string[]>; // lesson id -> finished variations (choice paths)
  puzzleRating: number;
  puzzleStreak: number;
  puzzleBestStreak: number;
  puzzlesSolved: number;
  puzzleSeen: string[]; // recent puzzle ids, to avoid repeats
}

const SETTINGS_KEY = 'tg-chess-settings';
const PROFILE_KEY = 'tg-chess-profile';

const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaultSettings: Settings = {
  sound: true,
  coaching: true,
  hints: true,
  blunderWarnings: true,
  threatWarnings: true,
  openingNames: true,
  funMoves: !calm,
  battles: !calm,
  unlockAllBots: false,
};
const defaultProfile: Profile = {
  name: 'Player',
  rating: 400,
  unlockedBots: ['sprout'],
  beatenBots: [],
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  lessonStars: {},
  lessonExplored: {},
  puzzleRating: 600,
  puzzleStreak: 0,
  puzzleBestStreak: 0,
  puzzlesSolved: 0,
  puzzleSeen: [],
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the app still works without saving.
  }
}

export const settings: Settings = load(SETTINGS_KEY, defaultSettings);
export const profile: Profile = load(PROFILE_KEY, defaultProfile);

/** A coaching feature is on only when coaching as a whole is on too. */
export function coachingOn(feature: 'hints' | 'blunderWarnings' | 'threatWarnings' | 'openingNames'): boolean {
  return settings.coaching && settings[feature];
}

export function saveSettings() {
  save(SETTINGS_KEY, settings);
}

export function saveProfile() {
  save(PROFILE_KEY, profile);
}

export function recordLessonStars(id: string, stars: number) {
  profile.lessonStars = { ...profile.lessonStars, [id]: Math.max(stars, profile.lessonStars[id] ?? 0) };
  saveProfile();
}

export function recordLessonExplored(id: string, paths: string[]) {
  profile.lessonExplored = { ...profile.lessonExplored, [id]: paths };
  saveProfile();
}

/** Record a puzzle attempt; returns the puzzle-rating change. */
export function recordPuzzle(id: string, puzzleRating: number, solved: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzleRating - profile.puzzleRating) / 400));
  const k = profile.puzzlesSolved < 30 ? 40 : 20;
  const delta = Math.round(k * ((solved ? 1 : 0) - expected));
  profile.puzzleRating = Math.max(100, profile.puzzleRating + delta);
  if (solved) {
    profile.puzzlesSolved++;
    profile.puzzleStreak++;
    profile.puzzleBestStreak = Math.max(profile.puzzleBestStreak, profile.puzzleStreak);
  } else {
    profile.puzzleStreak = 0;
  }
  profile.puzzleSeen = [id, ...profile.puzzleSeen.filter((x) => x !== id)].slice(0, 400);
  saveProfile();
  return delta;
}

export function resetProfile() {
  Object.assign(profile, structuredClone(defaultProfile));
  saveProfile();
}

/** Elo update for a game vs a bot. score: 1 win, 0.5 draw, 0 loss. Returns the rating change. */
export function recordBotResult(botId: string, botRating: number, score: number, nextBotId?: string): number {
  const expected = 1 / (1 + 10 ** ((botRating - profile.rating) / 400));
  const k = profile.games < 20 ? 40 : 24;
  const delta = Math.round(k * (score - expected));
  profile.rating = Math.max(100, profile.rating + delta);
  profile.games++;
  if (score === 1) {
    profile.wins++;
    if (!profile.beatenBots.includes(botId)) profile.beatenBots.push(botId);
    if (nextBotId && !profile.unlockedBots.includes(nextBotId)) profile.unlockedBots.push(nextBotId);
  } else if (score === 0.5) {
    profile.draws++;
  } else {
    profile.losses++;
  }
  saveProfile();
  return delta;
}
