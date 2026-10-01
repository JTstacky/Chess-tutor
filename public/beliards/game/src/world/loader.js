// Builds a live CavernWorld from extracted data (data/world/caverns/<id>.json) or
// from the sandbox generator used for physics tests.
import { TileMap, F, TILE } from './tilemap.js';
import { TerrainRenderer, loadTheme } from './terrain.js';
import { loadJSON, preloadSheets } from '../core/assets.js';
import { CavernWorld } from '../game/world.js';
import { Enemy } from '../game/enemies.js';
import { spawnEntities } from '../game/entities.js';

const themeCache = new Map();
async function theme(game, id) {
  const defs = game.data.themes || {};
  const key = defs[id] ? id : 'default';
  if (!themeCache.has(key)) themeCache.set(key, loadTheme(defs[key] || {}));
  return themeCache.get(key);
}

// Tile flag table for one pattern bank, from data/world/tiles.json. The rules are the
// original fight.asm collision routines (see tiles.json "rules"):
//   heroBlocks            -> SOLID (walls, ceilings and floors)
//   floorSolid only       -> ONEWAY (platform tiles; stand on them, pass through sideways)
//   rope (ids 1, 2)       -> ROPE, except the two banks where those ids are rock
//   slope tags            -> SLOPE_L / SLOPE_R (passable; the hero slides down them)
//   hazard tag            -> HAZARD (damage per cavern level unless Pirika Shoes)
//   slippery_on_level_4   -> ICE (only on cavern level 4, unless Ruzeria Shoes)
//   airflow tags          -> WIND_L / WIND_R / WIND_U
export function flagTable(game, bank, level) {
  const t = new Uint32Array(256);
  const b = game.data.tiles?.banks?.[bank];
  if (!b) { for (let i = 1; i < 256; i++) t[i] = i >= 0x40 ? 0 : F.SOLID; t[1] = t[2] = F.ROPE; return t; }
  // Unlisted ids follow is_blocking_tile: < 0x40 blocked unless passable, >= 0x49 passable.
  const passable = new Set((b.lists?.passable || []).map((h) => parseInt(h, 16)));
  for (let i = 0; i < 256; i++) t[i] = i < 0x40 && !passable.has(i) ? F.SOLID : i < 0x49 ? F.ONEWAY : 0;
  t[0] = 0;
  for (const [hex, e] of Object.entries(b.tiles || {})) {
    const id = parseInt(hex, 16);
    let f = 0;
    const tags = e.tags || [];
    if (e.heroBlocks) f |= F.SOLID;
    else if (e.floorSolid) f |= F.ONEWAY | F.PLATFORM;
    if (e.class === 'rope' && !e.heroBlocks) f |= F.ROPE;
    if (tags.includes('slope_left')) f |= F.SLOPE_L;
    if (tags.includes('slope_right')) f |= F.SLOPE_R;
    if (tags.includes('hazard')) f |= F.HAZARD;
    if (tags.includes('slippery_on_level_4') && level === 4) f |= F.ICE;
    if (tags.includes('airflow_left')) f |= F.WIND_L;
    if (tags.includes('airflow_right')) f |= F.WIND_R;
    if (tags.includes('airflow_up')) f |= F.WIND_U;
    if (e.class === 'door_frame' || e.class === 'door_sign') f |= F.DECOR;
    t[id] = f;
  }
  // Level 4: every standing surface except platforms is ice (set_zero_flag_if_slippery).
  if (level === 4) for (let i = 0; i < 0x40; i++) if (t[i] & F.SOLID) t[i] |= F.ICE;
  return t;
}

export async function loadCavernData(id) {
  return loadJSON(`data/world/caverns/${id}.json`);
}

export async function loadCavern(game, id) {
  const data = await loadCavernData(id);
  const map = new TileMap({ width: data.width, height: data.height, grid: data.grid, flags: flagTable(game, data.bank, data.level), bank: data.bank, wrap: true });
  map.level = data.level;
  const th = await theme(game, id in (game.data.themes || {}) ? id : data.bank);
  const world = new CavernWorld(game, data, map, new TerrainRenderer(map, th));
  await spawnEntities(game, world, data);
  return world;
}

// ------------------------------------------------------------ sandbox
export async function loadSandbox(game) {
  const w = 120, h = 40;
  const grid = new Uint8Array(w * h);
  const set = (x, y, v) => { if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = v; };
  for (let x = 0; x < w; x++) { for (let y = h - 4; y < h; y++) set(x, y, 3); set(x, 0, 3); set(x, 1, 3); }
  for (let y = 0; y < h; y++) { set(0, y, 3); set(1, y, 3); set(w - 1, y, 3); set(w - 2, y, 3); }
  for (let x = 12; x < 22; x++) set(x, h - 8, 3);
  for (let x = 26; x < 30; x++) for (let y = h - 4; y < h; y++) set(x, y, 0);
  for (let x = 26; x < 30; x++) set(x, h - 1, 4);
  for (let x = 26; x < 30; x++) set(x, h - 2, 5);
  for (let y = h - 20; y < h - 4; y++) set(38, y, 1);
  for (let x = 30; x < 48; x++) set(x, h - 21, 3);
  for (let i = 0; i < 6; i++) for (let x = 58 + i * 2; x < 70; x++) set(x, h - 5 - i, 3);
  for (let x = 72; x < 90; x++) set(x, h - 4, 6);
  for (let x = 92; x < 110; x += 5) set(x, h - 9 - (x % 3), 3), set(x + 1, h - 9 - (x % 3), 3);
  const flags = new Uint32Array(256);
  flags[1] = F.ROPE; flags[3] = F.SOLID; flags[4] = F.SOLID; flags[5] = F.HAZARD; flags[6] = F.SOLID | F.ICE;
  const map = new TileMap({ width: w, height: h, grid, flags, bank: 'sandbox' });
  map.level = 1;
  const th = await theme(game, 'sandbox');
  const world = new CavernWorld(game, { id: 'sandbox', name: 'Sandbox Cavern', level: 1, width: w, height: h, spawn: { x: 6 * TILE, y: (h - 4) * TILE } }, map, new TerrainRenderer(map, th));
  const { enemyDef } = await import('../game/enemies.js');
  const defs = [enemyDef(game, 1, 1), enemyDef(game, 1, 0), enemyDef(game, 1, 2), enemyDef(game, 1, 3)];
  await preloadSheets(defs.map((d) => d.sprite));
  world.enemies.push(new Enemy(defs[1], 18 * TILE, (h - 8) * TILE));
  world.enemies.push(new Enemy(defs[0], 44 * TILE, (h - 21) * TILE));
  world.enemies.push(new Enemy(defs[2], 80 * TILE, (h - 4) * TILE));
  world.enemies.push(new Enemy(defs[3], 100 * TILE, (h - 4) * TILE));
  return world;
}
