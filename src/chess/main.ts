import './style.css';
import type { Color, PieceSymbol } from 'chess.js';
import { battleFor, playBattle } from './battle';
import { BOTS, botById } from './bots';
import { loadOpenings } from './coach';
import { getEngine } from './engine';
import { LessonScreen, learnMenu } from './learn';
import type { Lesson } from './lessons';
import { PlayScreen, TIME_CONTROLS, type GameConfig } from './play';
import { profile, resetProfile, saveProfile, saveSettings, settings } from './storage';
import { pieceSrc, themeById, THEMES } from './themes';
import { Timeline } from './timeline';
import { confirmDialog, showModal } from './ui';

const app = document.getElementById('app')!;
const backBtn = document.getElementById('back') as HTMLButtonElement;
const play = new PlayScreen(() => show(homeView()));
play.el.dataset.view = 'play';
const lesson = new LessonScreen(() => show(learnView()), (l) => openLesson(l));

// Start loading the engine in the background so the first bot move is quick.
getEngine();
void loadOpenings();

let current: HTMLElement | null = null;
let arenaTl: Timeline | null = null; // battle playing in the arena
function show(view: HTMLElement) {
  if (current === play.el && view !== play.el) play.stop();
  if (current === lesson.el && view !== lesson.el) lesson.stop();
  arenaTl?.skip();
  current = view;
  app.replaceChildren(view);
  backBtn.hidden = view.dataset.view === 'home';
  window.scrollTo(0, 0);
}

backBtn.addEventListener('click', async () => {
  if (current === play.el && !(await confirmDialog('Leave game?', 'Go back to the menu? This game will end.', 'Leave'))) return;
  show(current === lesson.el ? learnView() : homeView());
});
document.getElementById('settings-btn')!.addEventListener('click', openSettings);

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function homeView(): HTMLElement {
  const v = el(`
    <section class="view home" data-view="home">
      <div class="hero">
        <div class="hero-mascot">🦉</div>
        <div>
          <h1>Hoot's Chess Club</h1>
          <p>Hi <b class="player-name"></b>! Ready to play?</p>
          <p class="rating-pill">⭐ Rating <b>${profile.rating}</b> · ${profile.wins} wins</p>
        </div>
      </div>
      <div class="menu-grid">
        <button class="menu-card c1" data-go="bots"><span>🤖</span><b>Play a Bot</b><small>Beat bots to unlock tougher ones</small></button>
        <button class="menu-card c2" data-go="friend"><span>👫</span><b>Play a Friend</b><small>Two players, one device</small></button>
        <button class="menu-card c3" data-go="learn"><span>📚</span><b>Learn</b><small>Openings, gambits, traps, puzzles</small></button>
        <button class="menu-card c4" data-go="progress"><span>🏆</span><b>My Progress</b><small>Rating, wins and badges</small></button>
        <button class="menu-card c5" data-go="arena"><span>⚔️</span><b>Battle Arena</b><small>Watch the pieces battle</small></button>
      </div>
    </section>`);
  v.querySelector('.player-name')!.textContent = profile.name;
  v.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'bots') show(botSetupView());
    if (go === 'friend') show(friendSetupView());
    if (go === 'learn') show(learnView());
    if (go === 'progress') show(progressView());
    if (go === 'arena') show(arenaView());
  });
  return v;
}

function timeChips(selected: number): string {
  return TIME_CONTROLS.map(
    (t, i) => `<button class="chip ${i === selected ? 'on' : ''}" data-time="${i}">${t.label}</button>`,
  ).join('');
}

function wireChips(v: HTMLElement, attr: string, onPick: (value: string) => void) {
  v.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((b) =>
    b.addEventListener('click', () => {
      v.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(b.dataset[attr]!);
    }),
  );
}

let lastBotId = localStorage.getItem('tg-chess-last-bot') ?? 'sprout';
let lastTime = 0;
let lastColor: Color | 'random' = 'w';
let lastTheme = themeById(localStorage.getItem('tg-chess-theme') ?? undefined).id;

function themeCards(selected: string, attr = 'theme'): string {
  return THEMES.map((t) => {
    const teams = t.id === 'classic' ? 'White vs Black' : `${t.w.pet} ${t.w.name} vs ${t.b.pet} ${t.b.name}`;
    return `<button class="theme-card ${t.id === selected ? 'on' : ''}" data-${attr}="${t.id}" style="--l:${t.light};--d:${t.dark}">
      <span class="theme-preview"><img src="${pieceSrc(t, 'w', 'k')}" alt=""><img src="${pieceSrc(t, 'b', 'k')}" alt=""></span>
      <b>${t.icon} ${t.name}</b><small>${teams}</small>
    </button>`;
  }).join('');
}

function wireThemes(v: HTMLElement) {
  wireChips(v, 'theme', (id) => {
    lastTheme = id;
    localStorage.setItem('tg-chess-theme', id);
  });
}

function botSetupView(): HTMLElement {
  const unlocked = (id: string) => settings.unlockAllBots || profile.unlockedBots.includes(id);
  if (!unlocked(lastBotId)) lastBotId = 'sprout';
  const v = el(`
    <section class="view setup" data-view="bots">
      <h2>Choose your opponent</h2>
      <div class="bot-grid">
        ${BOTS.map((b) => {
          const locked = !unlocked(b.id);
          const beaten = profile.beatenBots.includes(b.id);
          return `<button class="bot-card ${b.id === lastBotId ? 'on' : ''} ${locked ? 'locked' : ''}" data-bot="${b.id}" ${locked ? 'disabled' : ''}>
            <span class="bot-avatar">${locked ? '🔒' : b.avatar}</span>
            <b>${b.name}</b><small>${b.rating}</small>
            ${beaten ? '<span class="badge">✔ Beaten</span>' : ''}
          </button>`;
        }).join('')}
      </div>
      <p class="bot-blurb"></p>
      <h3>Play as</h3>
      <div class="chips">
        <button class="chip ${lastColor === 'w' ? 'on' : ''}" data-color="w">⚪ White</button>
        <button class="chip ${lastColor === 'random' ? 'on' : ''}" data-color="random">🎲 Random</button>
        <button class="chip ${lastColor === 'b' ? 'on' : ''}" data-color="b">⚫ Black</button>
      </div>
      <h3>Clock</h3>
      <div class="chips">${timeChips(lastTime)}</div>
      <h3>Theme</h3>
      <div class="theme-grid">${themeCards(lastTheme)}</div>
      <button class="btn primary big start">Play!</button>
    </section>`);
  const blurb = v.querySelector('.bot-blurb')!;
  const setBlurb = () => {
    const b = botById(lastBotId);
    blurb.textContent = `${b.avatar} ${b.name}: ${b.blurb}`;
  };
  setBlurb();
  wireChips(v, 'bot', (id) => {
    lastBotId = id;
    localStorage.setItem('tg-chess-last-bot', id);
    setBlurb();
  });
  wireChips(v, 'color', (c) => (lastColor = c as Color | 'random'));
  wireChips(v, 'time', (i) => (lastTime = Number(i)));
  wireThemes(v);
  v.querySelector('.start')!.addEventListener('click', () => {
    const color: Color = lastColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : lastColor;
    startGame({ mode: 'bot', bot: botById(lastBotId), playerColor: color, time: TIME_CONTROLS[lastTime], theme: lastTheme });
  });
  return v;
}

function friendSetupView(): HTMLElement {
  const v = el(`
    <section class="view setup" data-view="friend">
      <h2>Play a Friend</h2>
      <p>Take turns on the same device. White moves first!</p>
      <h3>Clock</h3>
      <div class="chips">${timeChips(lastTime)}</div>
      <h3>Theme</h3>
      <div class="theme-grid">${themeCards(lastTheme)}</div>
      <button class="btn primary big start">Start game</button>
    </section>`);
  wireChips(v, 'time', (i) => (lastTime = Number(i)));
  wireThemes(v);
  v.querySelector('.start')!.addEventListener('click', () =>
    startGame({ mode: 'friend', playerColor: 'w', time: TIME_CONTROLS[lastTime], theme: lastTheme }),
  );
  return v;
}

function startGame(cfg: GameConfig) {
  show(play.el);
  play.start(cfg);
}

const PIECE_ORDER: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

/** Pick any two pieces and watch their battle. */
function arenaView(): HTMLElement {
  let attacker: PieceSymbol = 'n';
  let victim: PieceSymbol = 'q';
  let side: Color = 'w';
  const v = el(`
    <section class="view setup arena" data-view="arena">
      <h2>⚔️ Battle Arena</h2>
      <p>Every piece has its own attack for every other piece. That's 30 different battles! In a game, a battle happens whenever one piece captures another.</p>
      <div class="arena-wrap">
        <div class="arena-stage"></div>
        <div class="arena-controls">
          <h3>Attacker</h3>
          <div class="piece-picks" data-role="a"></div>
          <h3>Target</h3>
          <div class="piece-picks" data-role="v"></div>
          <div class="chips side-chips">
            <button class="chip on" data-side="w">White attacks</button>
            <button class="chip" data-side="b">Black attacks</button>
          </div>
          <div class="arena-buttons">
            <button class="btn primary fight">⚔️ Fight!</button>
            <button class="btn surprise">🎲 Surprise me</button>
          </div>
        </div>
      </div>
      <h3>Theme</h3>
      <div class="theme-grid">${themeCards(lastTheme)}</div>
    </section>`);
  const stage = v.querySelector<HTMLElement>('.arena-stage')!;
  const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

  const render = () => {
    const theme = themeById(lastTheme);
    stage.style.setProperty('--l', theme.light);
    stage.style.setProperty('--d', theme.dark);
    const pick = (role: 'a' | 'v', color: Color, chosen: PieceSymbol) =>
      PIECE_ORDER.filter((t) => role === 'a' || t !== 'k')
        .map((t) => `<button class="piece-pick ${t === chosen ? 'on' : ''}" data-piece="${t}" title="${PIECE_NAMES[t]}"><img src="${pieceSrc(theme, color, t)}" alt="${PIECE_NAMES[t]}"></button>`)
        .join('');
    v.querySelector('[data-role="a"]')!.innerHTML = pick('a', side, attacker);
    v.querySelector('[data-role="v"]')!.innerHTML = pick('v', other(side), victim);
    if (!arenaTl || arenaTl.skipped) {
      stage.innerHTML = `<div class="arena-idle">
        <img src="${pieceSrc(theme, side, attacker)}" alt=""><b>VS</b><img src="${pieceSrc(theme, other(side), victim)}" alt="">
        <p>${battleFor(attacker, victim).title}</p></div>`;
    }
  };

  const fight = async () => {
    arenaTl?.skip();
    const tl = new Timeline();
    arenaTl = tl;
    stage.querySelector('.arena-idle')?.remove();
    await playBattle(stage, { type: attacker, color: side }, { type: victim, color: other(side) }, { theme: themeById(lastTheme), tl });
    if (arenaTl === tl) {
      arenaTl = null;
      render();
    }
  };

  v.querySelectorAll<HTMLElement>('.piece-picks').forEach((row) =>
    row.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-piece]')?.dataset.piece as PieceSymbol | undefined;
      if (!t) return;
      if (row.dataset.role === 'a') attacker = t;
      else victim = t;
      render();
    }),
  );
  wireChips(v, 'side', (c) => {
    side = c as Color;
    render();
  });
  v.querySelectorAll<HTMLElement>('[data-theme]').forEach((b) =>
    b.addEventListener('click', () => {
      v.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      lastTheme = b.dataset.theme!;
      localStorage.setItem('tg-chess-theme', lastTheme);
      render();
    }),
  );
  v.querySelector('.fight')!.addEventListener('click', () => void fight());
  v.querySelector('.surprise')!.addEventListener('click', () => {
    attacker = PIECE_ORDER[Math.floor(Math.random() * 6)];
    victim = PIECE_ORDER[Math.floor(Math.random() * 5)];
    side = Math.random() < 0.5 ? 'w' : 'b';
    v.querySelectorAll('[data-side]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.side === side));
    render();
    void fight();
  });
  render();
  return v;
}

function learnView(): HTMLElement {
  return learnMenu(openLesson);
}

function openLesson(l: Lesson) {
  show(lesson.el);
  lesson.start(l);
}

function progressView(): HTMLElement {
  const v = el(`
    <section class="view setup" data-view="progress">
      <h2>🏆 My Progress</h2>
      <div class="stats">
        <div><b>${profile.rating}</b><small>Rating</small></div>
        <div><b>${profile.games}</b><small>Games</small></div>
        <div><b>${profile.wins}</b><small>Wins</small></div>
        <div><b>${profile.draws}</b><small>Draws</small></div>
        <div><b>${profile.losses}</b><small>Losses</small></div>
        <div><b>${Object.values(profile.lessonStars).reduce((a, b) => a + b, 0)}</b><small>Lesson ⭐</small></div>
      </div>
      <h3>Bot ladder</h3>
      <div class="ladder">
        ${BOTS.map((b) => {
          const beaten = profile.beatenBots.includes(b.id);
          const open = profile.unlockedBots.includes(b.id);
          return `<div class="rung ${beaten ? 'beaten' : open ? 'open' : ''}"><span>${open || beaten ? b.avatar : '🔒'}</span>${b.name}<small>${beaten ? '⭐ Beaten!' : open ? 'Unlocked' : 'Locked'}</small></div>`;
        }).join('')}
      </div>
      <h3>Your name</h3>
      <input class="name-input" maxlength="20" />
    </section>`);
  const input = v.querySelector<HTMLInputElement>('.name-input')!;
  input.value = profile.name;
  input.addEventListener('change', () => {
    profile.name = input.value.trim() || 'Player';
    saveProfile();
  });
  return v;
}

function openSettings() {
  const row = (key: keyof typeof settings, label: string, sub = '') =>
    `<label class="toggle"><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  const m = showModal(
    '⚙️ Settings',
    `${row('sound', 'Sounds')}
     ${row('funMoves', 'Fun piece moves', 'Every piece has its own way of moving')}
     ${row('battles', 'Capture battles', 'Pieces have a cartoon battle when one captures another. Tap to skip.')}
     ${row('coaching', 'Coaching', 'Hoot gives tips and help during games')}
     ${row('hints', 'Hint button', 'Shows the best move when you ask')}
     ${row('blunderWarnings', 'Blunder warnings', '"Are you sure?" before a move that loses a piece or the game')}
     ${row('threatWarnings', 'Danger alerts', 'Tells you when one of your pieces is under attack')}
     ${row('openingNames', 'Opening names', 'Shows which opening you are playing')}
     <h3>For grown-ups</h3>
     ${row('unlockAllBots', 'Unlock all bots')}
     <button class="btn danger reset">Reset all progress</button>`,
    [{ label: 'Done', primary: true, onClick: refreshCurrent }],
  );
  m.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((i) =>
    i.addEventListener('change', () => {
      (settings as unknown as Record<string, boolean>)[i.dataset.key!] = i.checked;
      saveSettings();
    }),
  );
  m.querySelector('.reset')!.addEventListener('click', async () => {
    m.remove();
    if (await confirmDialog('Reset progress?', 'This clears your rating, wins and unlocked bots on this device.', 'Reset')) {
      resetProfile();
      show(homeView());
    }
  });
}

function refreshCurrent() {
  // Re-render menu screens so setting changes (like unlocking bots) show straight away.
  const name = current?.dataset.view;
  if (name === 'home') show(homeView());
  else if (name === 'bots') show(botSetupView());
  else if (name === 'progress') show(progressView());
}

show(homeView());
