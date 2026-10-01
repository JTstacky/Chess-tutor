// Boot: load data, fonts and art, then hand control to the scene stack.
import { ctx, W, H, fit } from './render/screen.js';
import { input } from './core/input.js';
import { setupTouch } from './ui/touch.js';
import { audio } from './core/audio.js';
import { loadSpriteDefs, preloadSheets, spriteIds, loadJSON, setRemap } from './core/assets.js';
import { settings } from './core/save.js';
import { params } from './core/util.js';
import { Game } from './game/game.js';

const bootEl = document.getElementById('boot');

async function boot() {
  try { await document.fonts.load("16px 'Beliards'"); } catch { /* fall back to monospace */ }
  setRemap(await loadJSON('data/web_assets.json', {}));
  await loadSpriteDefs('data/sprites.json');
  const audioManifest = await loadJSON('../assets/audio/manifest.json', []);
  const am = {};
  for (const a of audioManifest) am[a.id] = `../${a.path}`;
  // Names the code uses that share a sound in the pack.
  const ALIAS = {
    boss_theme: 'guardian_battle', boss_defeat: 'boss_roar', boss_hit: 'sword_hit', boss_hurt: 'sword_hit',
    door_unlock: 'door_open', heal: 'potion_use', potion: 'potion_use', inn_rest: 'rest_at_the_inn', menu_open: 'menu_accept',
    anvil: 'shield_block', wing_flap: 'jump',
    bramble_gallery: 'fungal_woodland', frost_vault: 'glacial_vault', bone_ossuary: 'ash_catacomb', gilded_deep: 'golden_tomb',
    ember_works: 'molten_foundry', abyss_throne: 'star_abyss', royal_hall: 'dawn_returns', tear_fanfare: 'save_bell',
  };
  for (const [k, v] of Object.entries(ALIAS)) if (!am[k] && am[v]) am[k] = am[v];
  audio.setManifest(am);
  audio.setVolumes(settings.get('music'), settings.get('sfx'));
  await preloadSheets([...spriteIds('hero.'), ...spriteIds('item.'), ...spriteIds('fx.'), ...spriteIds('prop.')]);

  const game = new Game();
  window.game = game; // handy for debugging and the headless test scripts
  await game.init();
  bootEl.classList.add('gone');
  setupTouch();
  const unlock = () => audio.unlock();
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchstart', unlock);

  // Fixed 60 Hz simulation, rendered on every animation frame.
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  // maxDt/maxSteps cap a long frame; a hidden tab ticks ~1/s, so it may catch up further.
  function advance(now, maxDt = 0.1, maxSteps = 8) {
    const dt = Math.min(maxDt, (now - last) / 1000);
    last = now;
    acc += dt * (game.speed || 1);
    let steps = 0;
    while (acc >= STEP && steps < maxSteps) {
      game.update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === maxSteps) acc = 0;
  }
  function frame(now) {
    advance(now);
    game.draw(now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // A hidden tab gets no animation frames. In co-op the others depend on this window
  // (the host runs the monsters), so keep simulating on a timer while hidden.
  setInterval(() => { if (document.hidden && game.coop) advance(performance.now(), 1.2, 72); }, 1000 / 30);
  // Headless tests can step the simulation deterministically.
  window.__step = (seconds) => { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) game.update(STEP); game.draw(performance.now() / 1000); };
}

boot().catch((e) => {
  console.error(e);
  bootEl.textContent = 'Failed to start: ' + e.message;
});
