import './style.css';
import type { Color } from 'chess.js';
import { BOTS, botById } from './bots';
import { getEngine } from './engine';
import { PlayScreen, TIME_CONTROLS, type GameConfig } from './play';
import { profile, resetProfile, saveProfile, saveSettings, settings } from './storage';
import { confirmDialog, showModal } from './ui';

const app = document.getElementById('app')!;
const backBtn = document.getElementById('back') as HTMLButtonElement;
const play = new PlayScreen(() => show(homeView()));
play.el.dataset.view = 'play';

// Start loading the engine in the background so the first bot move is quick.
getEngine();

let current: HTMLElement | null = null;
function show(view: HTMLElement) {
  if (current === play.el && view !== play.el) play.stop();
  current = view;
  app.replaceChildren(view);
  backBtn.hidden = view.dataset.view === 'home';
  window.scrollTo(0, 0);
}

backBtn.addEventListener('click', async () => {
  if (current === play.el && !(await confirmDialog('Leave game?', 'Go back to the menu? This game will end.', 'Leave'))) return;
  show(homeView());
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
        <button class="menu-card c3" data-go="learn"><span>📚</span><b>Learn</b><small>Openings, gambits, traps and puzzles</small></button>
        <button class="menu-card c4" data-go="progress"><span>🏆</span><b>My Progress</b><small>Rating, wins and badges</small></button>
      </div>
    </section>`);
  v.querySelector('.player-name')!.textContent = profile.name;
  v.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'bots') show(botSetupView());
    if (go === 'friend') show(friendSetupView());
    if (go === 'learn') show(learnView());
    if (go === 'progress') show(progressView());
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
  v.querySelector('.start')!.addEventListener('click', () => {
    const color: Color = lastColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : lastColor;
    startGame({ mode: 'bot', bot: botById(lastBotId), playerColor: color, time: TIME_CONTROLS[lastTime] });
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
      <button class="btn primary big start">Start game</button>
    </section>`);
  wireChips(v, 'time', (i) => (lastTime = Number(i)));
  v.querySelector('.start')!.addEventListener('click', () =>
    startGame({ mode: 'friend', playerColor: 'w', time: TIME_CONTROLS[lastTime] }),
  );
  return v;
}

function startGame(cfg: GameConfig) {
  show(play.el);
  play.start(cfg);
}

function learnView(): HTMLElement {
  return el(`
    <section class="view setup" data-view="learn">
      <h2>📚 Learn</h2>
      <div class="coming-soon">
        <div class="hero-mascot">🦉</div>
        <p><b>Coming soon!</b> Hoot is getting lessons ready:</p>
        <ul>
          <li>♟ Openings: Italian Game, London System, Queen's Gambit…</li>
          <li>⚔️ Gambits and traps: Fried Liver, Scholar's Mate and how to stop it…</li>
          <li>🧩 Puzzles: forks, pins, skewers, mate in 1</li>
          <li>👑 Basics and endgames</li>
        </ul>
      </div>
    </section>`);
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
     ${row('coaching', 'Coaching', 'Hoot gives tips and help during games')}
     ${row('hints', 'Hint button', 'Shows the best move when you ask')}
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
