// The seven spells the Sages teach (spells.json). Damage is a fixed table (2, 4, 8,
// 16, 32, 64, 255) that ignores level, sword and Sabre Oil. Movement follows the
// original projectile handlers: 2 tiles per frame, lifetimes in original frames, and
// only one spell effect can exist at a time.
import { TILE } from '../world/tilemap.js';
import { W, H } from '../render/screen.js';
import { FRAME } from './enemies.js';

export const SPELL_ORDER = ['espada', 'saeta', 'fuego', 'lanzar', 'rascar', 'agua', 'guerra'];
const V2 = (2 * TILE) / FRAME; // 2 tiles per frame

export const SPELLS = {
  espada: { name: 'Espada', dmg: 2, sprite: 'fx.espada', color: '#dfe8ff',
    cast: (w, h) => [{ x: h.cx + h.dir * 30, y: h.y + 24, vx: h.dir * V2, vy: 0, life: 5 * FRAME, w: 30, h: 18 }] },
  saeta: { name: 'Saeta', dmg: 4, sprite: 'fx.saeta', color: '#ffe08a', pierce: true,
    cast: (w, h) => [{ x: h.cx + h.dir * 30, y: h.y + 24, vx: h.dir * V2, vy: 0, life: 10 * FRAME, w: 32, h: 14, breaks: true }] },
  fuego: { name: 'Fuego', dmg: 8, sprite: 'fx.fuego', color: '#ff9a3a', pierce: true, rehit: 0.25,
    cast: (w, h) => [{ x: h.cx + h.dir * 30, y: h.y + 30, vx: h.dir * V2, vy: 0, life: 12 * FRAME, w: 3 * TILE, h: 3 * TILE,
      // Flies 3 frames, then drops to the floor and burns in place.
      update(p, dt, world) { if (p.t > 3 * FRAME) { p.vx = 0; p.vy = world.map.rectSolid(p.x + 8, p.y + p.h, p.w - 16, 4) ? 0 : V2 / 2; } },
      onWall(p) { p.vx = 0; } }] },
  lanzar: { name: 'Lanzar', dmg: 16, sprite: 'fx.lanzar', color: '#ff5a2a', pierce: true,
    cast: (w, h) => [{ x: h.cx + h.dir * 30, y: h.y + 24, vx: h.dir * V2, vy: 0, life: 10 * FRAME, w: 36, h: 18, breaks: true }] },
  // Four rocks across the whole view, from above the screen, ignoring walls.
  rascar: { name: 'Rascar', dmg: 32, sprite: 'fx.rascar', color: '#b89468', pierce: true, ghost: true,
    cast: (w, h, cam) => [1, 2, 3, 4].map((i) => ({ x: cam.x + ((6 * i + 2) / 36) * W * 1.15 - 40, y: cam.y - (3 + Math.floor(Math.random() * 4)) * TILE, vx: 0, vy: V2, life: 11 * FRAME * 1.4, w: 3 * TILE, h: 3 * TILE })) },
  // Three parallel jets, two rows apart.
  agua: { name: 'Agua', dmg: 64, sprite: 'fx.agua', color: '#5ac8ff', pierce: true,
    cast: (w, h) => [-2, 0, 2].map((r) => ({ x: h.cx + h.dir * 30, y: h.y + 30 + r * TILE, vx: h.dir * V2, vy: 0, life: 10 * FRAME, w: 40, h: 22 })) },
  // Screen-wide lightning: every monster in view takes 255 at once.
  guerra: { name: 'Guerra', dmg: 255, sprite: 'fx.guerra', color: '#fff3a0', instant: true },
};

export function castSpell(world, hero, character, game, cam) {
  const id = character.spell;
  if (!id || !character.spellsLearned.includes(id)) return 'none';
  const sp = SPELLS[id];
  if (world.projectiles.some((p) => p.spell && p.owner === hero.id)) return 'busy';
  hero.castT = 0.25;
  const left = character.charges[id] || 0;
  if (left <= 0) return 'empty'; // the pose plays, nothing fires
  character.charges[id] = left - 1;
  game.sfxFor?.(id);
  if (sp.instant) {
    world.effect('flash', 0, 0, { life: 0.35, color: '#fff8d0' });
    for (let i = 0; i < 4; i++) world.effect('bolt', cam.x + W * (0.15 + i * 0.23), cam.y + H * 0.8, { life: 0.4 });
    world.shake = 0.3;
    return { instant: true, dmg: sp.dmg, kind: id };
  }
  for (const p of sp.cast(world, hero, cam)) {
    world.spawnProjectile({ ...p, friendly: true, spell: true, owner: hero.id, dmg: sp.dmg, kind: id, sprite: sp.sprite, color: sp.color, pierce: sp.pierce, ghost: sp.ghost });
  }
  return 'cast';
}
