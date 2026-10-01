// Tile grid + collision queries for caverns and towns. The grid is the original
// Zeliard layout (one byte per 8×8 original tile, 64 rows for caverns); each tile
// id maps to a set of flags taken from data/world/tiles.json. Caverns wrap in both
// axes (x modulo width, y modulo 64), exactly like the original proximity map.
import { b64ToBytes } from '../core/util.js';

export const TILE = 24; // screen pixels per original 8×8 tile

export const F = {
  SOLID: 1, ROPE: 2, SLOPE_L: 4, SLOPE_R: 8, ICE: 16, HAZARD: 32, BREAKABLE: 64,
  DOOR: 128, WATER: 256, PLATFORM: 512, ONEWAY: 1024, DECOR: 2048, SAND: 4096, WIND_L: 8192, WIND_R: 16384,
  WIND_U: 32768,
};

const mod = (a, n) => ((a % n) + n) % n;

export class TileMap {
  constructor({ width, height, grid, flags, bank, wrap = false }) {
    this.w = width;
    this.h = height;
    this.bank = bank;
    this.wrap = wrap;
    this.pw = width * TILE; // pixel period of the wrap
    this.ph = height * TILE;
    this.grid = typeof grid === 'string' ? b64ToBytes(grid) : grid; // row-major tile ids
    this.flagsById = flags; // Uint32Array(256)
    this.dyn = new Uint32Array(width * height); // runtime flags: broken walls, platforms, blocks
    this.version = 0; // bumps when tiles change so the renderer can refresh chunks
  }
  index(tx, ty) {
    if (this.wrap) return mod(ty, this.h) * this.w + mod(tx, this.w);
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return -1;
    return ty * this.w + tx;
  }
  id(tx, ty) {
    const i = this.index(tx, ty);
    return i < 0 ? -1 : this.grid[i];
  }
  flags(tx, ty) {
    const i = this.index(tx, ty);
    if (i < 0) return ty < 0 ? 0 : F.SOLID; // outside a non-wrapping map: walls and floor
    const dyn = this.dyn[i];
    if (dyn & 0x80000000) return dyn & 0x7fffffff; // override
    return this.flagsById[this.grid[i]] | dyn;
  }
  setOverride(tx, ty, flags) {
    const i = this.index(tx, ty);
    if (i < 0) return;
    this.dyn[i] = (0x80000000 | flags) >>> 0;
    this.version++;
  }
  clearOverride(tx, ty) {
    const i = this.index(tx, ty);
    if (i < 0) return;
    this.dyn[i] = 0;
    this.version++;
  }
  setTile(tx, ty, id) {
    const i = this.index(tx, ty);
    if (i < 0) return;
    this.grid[i] = id;
    this.version++;
  }
  clearTile(tx, ty) { this.setOverride(tx, ty, 0); }
  solid(tx, ty) { return (this.flags(tx, ty) & F.SOLID) !== 0; }
  is(tx, ty, f) { return (this.flags(tx, ty) & f) !== 0; }

  // Shift x by whole map periods so it lies nearest to ref (wrapping maps only).
  near(x, ref) { return this.wrap ? x - Math.round((x - ref) / this.pw) * this.pw : x; }
  nearY(y, ref) { return this.wrap ? y - Math.round((y - ref) / this.ph) * this.ph : y; }
  // A copy of box moved to the wrapped image nearest to the reference box.
  rel(box, ref) {
    if (!this.wrap) return box;
    const x = this.near(box.x, ref.x), y = this.nearY(box.y, ref.y);
    return x === box.x && y === box.y ? box : { ...box, x, y };
  }
  // Bring a body back into [0, period) and report the shift applied.
  normalize(body) {
    if (!this.wrap) return [0, 0];
    let sx = 0, sy = 0;
    if (body.x < 0) sx = this.pw; else if (body.x >= this.pw) sx = -this.pw;
    if (body.y < 0) sy = this.ph; else if (body.y >= this.ph) sy = -this.ph;
    body.x += sx; body.y += sy;
    return [sx, sy];
  }

  // True if any tile overlapping the pixel rect has flag f.
  rectHas(x, y, w, h, f) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.flags(tx, ty) & f) return true;
    return false;
  }
  rectSolid(x, y, w, h) { return this.rectHas(x, y, w, h, F.SOLID); }

  // Move an axis-aligned box by (dx, dy) against solid tiles. Returns collision info.
  // Horizontal first, then vertical. `stepUp` lets walkers climb small bumps; slopes
  // are walked as stairs (the original moves on the tile grid, so a slope tile is one
  // tile of rise per tile of run).
  move(body, dx, dy, { stepUp = 0, oneway = true } = {}) {
    const hit = { left: false, right: false, up: false, down: false };
    // Sub-step large moves so fast bodies never tunnel through a single tile.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.45)));
    const sx = dx / steps, sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      if (sx) this.moveX(body, sx, stepUp, hit);
      if (sy) { this.moveY(body, sy, oneway, hit); if (hit.up || hit.down) { for (let r = s + 1; r < steps; r++) if (sx) this.moveX(body, sx, stepUp, hit); break; } }
    }
    return hit;
  }
  moveX(body, dx, stepUp, hit) {
    const nx = body.x + dx;
    if (!this.rectSolid(nx, body.y, body.w, body.h)) { body.x = nx; return; }
    if (stepUp && body.onGround) {
      for (let s = 1; s <= stepUp; s++) {
        if (!this.rectSolid(nx, body.y - s, body.w, body.h)) { body.x = nx; body.y -= s; return; }
      }
    }
    if (dx > 0) { body.x = Math.floor((nx + body.w) / TILE) * TILE - body.w - 0.001; hit.right = true; }
    else { body.x = (Math.floor(nx / TILE) + 1) * TILE + 0.001; hit.left = true; }
  }
  moveY(body, dy, oneway, hit) {
    const ny = body.y + dy;
    let blocked = this.rectSolid(body.x, ny, body.w, body.h);
    if (!blocked && dy > 0 && oneway && !body.dropThrough) {
      // One-way ledges (platform tiles) only block from above.
      const footOld = body.y + body.h, footNew = ny + body.h;
      const tyNew = Math.floor((footNew - 0.001) / TILE);
      if (Math.floor((footOld - 0.001) / TILE) < tyNew && this.rectHas(body.x, tyNew * TILE, body.w, 1, F.ONEWAY)) blocked = true;
    }
    if (!blocked) body.y = ny;
    else if (dy > 0) { body.y = Math.floor((ny + body.h) / TILE) * TILE - body.h; hit.down = true; }
    else { body.y = (Math.floor(ny / TILE) + 1) * TILE + 0.001; hit.up = true; }
  }

  groundBelow(body) {
    const y = body.y + body.h + 1;
    if (this.rectSolid(body.x, y - 1, body.w, 2)) return true;
    const ty = Math.floor(y / TILE);
    return Math.abs(ty * TILE - (body.y + body.h)) < 1.5 && this.rectHas(body.x, ty * TILE, body.w, 1, F.ONEWAY);
  }
}
