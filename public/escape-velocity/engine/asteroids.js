// Asteroids (EV 1.0.5). Ten slots (the 0x2a-byte table at [10079790]): position, velocity, size,
// spin frame and direction, and a damage counter. They are scenery that blocks shots: ships fly
// through them, shots and missiles explode on them, beams wear them down. The field lives around the
// player: an asteroid that drifts more than half a screen (plus its own size) off the playfield
// reappears on the other side, and missing ones come back from the corners.
//   FUN_1001e520 init on arrival, FUN_1001e770 spawn, FUN_1001eda4 sprite move proc,
//   FUN_1001f59c shot collision, the asteroid loop of the beam step 0x1002dd40.
export const MAX_ROIDS = 10;
// PTR_DAT_10079740: half the playfield, 0.5 * (screen width - 0x90) and 0.5 * screen height.
const HALF_W = 248, HALF_H = 240;
export const ROID_SMALL = 800, ROID_BIG = 801;          // spïn: 24 px x 20 frames, 32 px x 30 frames

export function newRoids() {
  return Array.from({ length: MAX_ROIDS }, () => ({ active: false, sprite: false, x: 0, y: 0, vx: 0, vy: 0, big: false, frame: 0, dir: 1, hp: 0 }));
}

const count = game => game.data.syst[game.system]?.Asteroids ?? 0;

// FUN_1001e770: fill one free slot if fewer than the system's Asteroids are in play. Near the player
// (edge 0, the arrival fill) or at a corner of the 0.7 * (half screen + 128) box with a velocity
// pointing back in (edge 1, every frame).
export function spawnRoid(game, edge) {
  const N = count(game), P = game.player, rng = game.rng;
  if (N < 1 || !P) return;
  const R = game.roids;
  if (R.filter(r => r.active || r.sprite).length >= N) return;
  const r = R.find(x => !x.active && !x.sprite); if (!r) return;
  r.active = true; r.sprite = false;
  const sx = HALF_W + 128, sy = HALF_H + 128;
  if (!edge) {
    r.x = P.x + rng.rand(sx) - 0.5 * sx; r.y = P.y + rng.rand(sy) - 0.5 * sy;
    r.vx = 0.01 * (rng.rand(400) - 200); r.vy = 0.01 * (rng.rand(400) - 200);
  } else {
    const d = 0.7 * Math.max(sx, sy);
    if (rng.rand(2) === 0) { r.x = P.x + d; r.vx = -0.01 * rng.rand(200); } else { r.x = P.x - d; r.vx = 0.01 * rng.rand(200); }
    if (rng.rand(2) === 0) { r.y = P.y + d; r.vy = -0.01 * rng.rand(200); } else { r.y = P.y - d; r.vy = 0.01 * rng.rand(200); }
  }
  r.frame = rng.rand(20);
  r.big = rng.rand(6) === 0;
  r.dir = rng.rand(2) === 0 ? 1 : -1;
  r.hp = r.big ? 1000 : 350;
}

// FUN_1001e520, on hyperspace arrival and when a pilot enters the ship: with no asteroids in the
// system only the clear flag is raised. Otherwise fill up to the count (slots still held by the last
// system's asteroids count as taken, so those come back later from the corners), then give all ten
// slots a fresh position and velocity near the player.
export function initRoids(game) {
  if (count(game) < 1) { game.roidClear = true; return; }
  for (let i = 0; i < count(game); i++) spawnRoid(game, 0);
  const P = game.player, rng = game.rng, sx = HALF_W + 128, sy = HALF_H + 128;
  for (const r of game.roids) {
    r.x = P.x + rng.rand(sx) - 0.5 * sx; r.y = P.y + rng.rand(sy) - 0.5 * sy;
    r.vx = 0.01 * (rng.rand(400) - 200); r.vy = 0.01 * (rng.rand(400) - 200);
  }
}

// FUN_10015440 (start of the frame): an active asteroid without a sprite gets one.
export function syncRoids(game) {
  for (const r of game.roids) { if (!r.active) r.sprite = false; else if (!r.sprite) r.sprite = true; }
}

// FUN_1001eda4, each sprite's move proc. The clear flag (set on take-off, arrival and new games,
// [10079758]) removes every asteroid that has a sprite; it is lowered at the end of the frame. A
// damage counter below -31999 also removes it (nothing else does). Small ones turn a frame every
// 4th game frame (20 frames), big ones every 8th (30 frames).
export function stepRoids(game) {
  const P = game.player;
  for (const r of game.roids) {
    if (!r.sprite) continue;
    if (!r.active || r.hp < -31999 || game.roidClear) { r.active = false; r.sprite = false; continue; }
    r.x += r.vx; r.y += r.vy;
    const n = r.big ? 30 : 20;
    if (game.frame % (r.big ? 8 : 4) === 0) r.frame += r.dir;
    if (r.frame < 0) r.frame += n;
    if (r.frame > n - 1) r.frame -= n;
    if (!P) continue;
    const half = r.big ? 16 : 12;
    // sprite left/top in screen coordinates, as shorts
    const left = Math.trunc(HALF_W + (r.x - P.x) - half), top = Math.trunc(HALF_H + (r.y - P.y) - half);
    if (left > 2 * HALF_W) r.x = P.x - HALF_W - half;
    if (left < -2 * half) r.x = half + P.x + HALF_W;
    if (top > 2 * HALF_H) r.y = P.y - HALF_H - half;
    if (top < -2 * half) r.y = half + P.y + HALF_H;
  }
}

export function roidSize(r) { return r.big ? 32 : 24; }

// The sprite engine's rectangle test between a shot (its graphic grown by ProxRadius) and an asteroid.
export function shotHitsRoid(shot, r) {
  const s = roidSize(r);
  return r.sprite && r.active && Math.abs(r.x - shot.x) * 2 < s + shot.w && Math.abs(r.y - shot.y) * 2 < s + shot.h;
}
