// Progress and settings, saved in this browser only.

export interface Settings {
  sound: boolean;
  coaching: boolean; // master switch for all coaching features
  hints: boolean;
  blunderWarnings: boolean;
  threatWarnings: boolean;
  openingNames: boolean;
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
}

const SETTINGS_KEY = 'tg-chess-settings';
const PROFILE_KEY = 'tg-chess-profile';

const defaultSettings: Settings = { sound: true, coaching: true, hints: true, blunderWarnings: true, threatWarnings: true, openingNames: true, unlockAllBots: false };
const defaultProfile: Profile = {
  name: 'Player',
  rating: 400,
  unlockedBots: ['sprout'],
  beatenBots: [],
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
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
