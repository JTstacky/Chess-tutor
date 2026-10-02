// The cavern minimap: a small map in the top-right corner that follows the knight, showing only
// what the party has seen (fog of war). Tap / click it (or press M) to open the whole cavern;
// walking or any action folds it away again. Explored ground is remembered per knight in the
// save (character.explored[mapId], a bitset of 2x2-tile cells).
import { ctx, canvas, W, H, text, panel, fade, COLORS } from '../render/screen.js';
import { TILE, F } from '../world/tilemap.js';
import { settings } from '../core/save.js';
import { input } from '../core/input.js';
import { isTester } from '../game/character.js';

const CELL = 2;            // tiles per fog cell (each side)
const MINI = { w: 216, h: 126, scale: 3 }; // the corner map: 72 x 42 tiles around the knight
const MARGIN = 10;

export const minimapOn = () => settings.get('minimap') !== false;

let active = null; // the minimap of the cavern on screen, for pointer hits
let hooked = false;
function hookPointer() {
  if (hooked) return;
  hooked = true;
  // Capture phase on the canvas itself runs before touch.js's "tap confirms" listener, so a tap
  // on the map only works the map.
  canvas.addEventListener('pointerdown', (e) => {
    const m = active;
    if (!m || !m.visible()) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (m.expanded || m.hit(x, y)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      m.toggle();
    }
  }, { capture: true });
}

export class Minimap {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    const m = world.map;
    this.map = m;
    this.cw = Math.ceil(m.w / CELL);
    this.ch = Math.ceil(m.h / CELL);
    this.bits = new Uint8Array(Math.ceil((this.cw * this.ch) / 8));
    // Everything any knight on this screen has already seen here.
    for (const l of game.locals) this.merge(l.character.explored?.[world.id]);
    this.expanded = false;
    this.dirty = false;
    this.saveT = 0;
    this.version = -1;
    this.rebuildT = 0;
    this.terrain = document.createElement('canvas'); // the whole cavern, 1 px per tile
    this.seen = document.createElement('canvas');    // the explored part of it
    this.terrain.width = this.seen.width = m.w;
    this.terrain.height = this.seen.height = m.h;
    this.mapSeen = input.mapAt || 0; // an M pressed before this cavern doesn't count
    this.rect = { x: W - MINI.w - MARGIN, y: MARGIN, w: MINI.w, h: MINI.h };
    // The testing knight sees the whole cavern.
    if (game.locals.some((l) => isTester(l.character))) { this.bits.fill(255); this.dirty = true; }
    this.avoidT = 0;
    active = this;
    hookPointer();
  }

  visible() { return minimapOn() && this.game.scene?.minimap === this; }
  hit(x, y) { const r = this.rect; return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  toggle() { this.expanded = !this.expanded; }

  // ---------------------------------------------------------------- explored cells
  merge(b64) {
    if (!b64) return;
    try {
      const s = atob(b64);
      for (let i = 0; i < Math.min(s.length, this.bits.length); i++) this.bits[i] |= s.charCodeAt(i);
    } catch { /* an old or damaged entry: start fresh */ }
  }
  encode() { let s = ''; for (const b of this.bits) s += String.fromCharCode(b); return btoa(s); }
  has(cx, cy) { const i = cy * this.cw + cx; return (this.bits[i >> 3] >> (i & 7)) & 1; }
  explored() { let n = 0; for (const b of this.bits) for (let v = b; v; v &= v - 1) n++; return n / (this.cw * this.ch); }

  // Mark the cells inside a camera view as seen (the view wraps with the cavern).
  reveal(cam) {
    const m = this.map;
    let x0 = Math.floor(cam.x / TILE / CELL), x1 = Math.floor((cam.x + W - 1) / TILE / CELL);
    let y0 = Math.floor(cam.y / TILE / CELL), y1 = Math.floor((cam.y + H - 1) / TILE / CELL);
    if (!m.wrap) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.cw - 1, x1); y1 = Math.min(this.ch - 1, y1); }
    const g = this.seen.getContext('2d');
    for (let cy = y0; cy <= y1; cy++) {
      const yy = ((cy % this.ch) + this.ch) % this.ch;
      for (let cx = x0; cx <= x1; cx++) {
        const xx = ((cx % this.cw) + this.cw) % this.cw;
        const i = yy * this.cw + xx;
        if ((this.bits[i >> 3] >> (i & 7)) & 1) continue;
        this.bits[i >> 3] |= 1 << (i & 7);
        this.dirty = true;
        if (this.version >= 0) g.drawImage(this.terrain, xx * CELL, yy * CELL, CELL, CELL, xx * CELL, yy * CELL, CELL, CELL);
      }
    }
  }

  // ---------------------------------------------------------------- picture
  paintTerrain() {
    const m = this.map, w = m.w, h = m.h;
    const g = this.terrain.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const solid = (x, y) => (m.flags(x, y) & F.SOLID) !== 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const f = m.flags(x, y);
        let c;
        if (f & F.SOLID) {
          // Rock, with its faces that touch open air picked out.
          const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
          c = f & F.ICE ? (edge ? [190, 228, 245] : [96, 140, 170]) : f & F.BREAKABLE ? (edge ? [196, 150, 98] : [130, 96, 64]) : edge ? [176, 150, 116] : [92, 74, 60];
        } else if (f & F.DOOR) c = [40, 30, 22];
        else if (f & F.HAZARD) c = [214, 70, 52];
        else if (f & F.WATER) c = [44, 96, 176];
        else if (f & F.SAND) c = [196, 168, 104];
        else if (f & F.ROPE) c = [126, 112, 84];
        else if (f & (F.ONEWAY | F.PLATFORM)) c = [200, 176, 130];
        else c = [24, 28, 44]; // open cave
        const k = (y * w + x) * 4;
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // Re-copy every explored cell.
    const s = this.seen.getContext('2d');
    s.clearRect(0, 0, w, h);
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) {
      if (this.has(cx, cy)) s.drawImage(this.terrain, cx * CELL, cy * CELL, CELL, CELL, cx * CELL, cy * CELL, CELL, CELL);
    }
    this.version = m.version;
  }

  update(dt, cam) {
    if (!cam) return;
    this.rebuildT -= dt;
    if (this.version < 0 || (this.map.version !== this.version && this.rebuildT <= 0)) { this.paintTerrain(); this.rebuildT = 0.5; }
    this.reveal(cam);
    if (input.mapAt > (this.mapSeen || 0) && performance.now() - input.mapAt < 400) { this.mapSeen = input.mapAt; if (minimapOn()) this.toggle(); }
    // Walking or any action folds the big map away.
    if (this.expanded) {
      for (const l of this.game.locals) {
        const f = l.input;
        if (['left', 'right', 'up', 'down'].some((a) => f.down(a)) || ['jump', 'attack', 'magic', 'menu'].some((a) => f.pressed(a))) { this.expanded = false; break; }
      }
    }
    this.saveT += dt;
    if (this.dirty && this.saveT > 2) this.store();
  }
  // Write the explored cells into every local knight's save data.
  store() {
    if (!this.dirty) return;
    const s = this.encode();
    for (const l of this.game.locals) (l.character.explored ||= {})[this.world.id] = s;
    this.dirty = false;
    this.saveT = 0;
  }

  // Keep clear of the touch controls' Items pill when it is laid over the picture.
  place() {
    this.avoidT -= 1;
    if (this.avoidT > 0) return;
    this.avoidT = 30;
    let y = MARGIN;
    const host = document.getElementById('touch');
    if (host?.classList.contains('on') && host.classList.contains('overlay')) {
      const r = canvas.getBoundingClientRect();
      for (const el of host.querySelectorAll('.tc-pill')) {
        const p = el.getBoundingClientRect();
        if (!p.width) continue;
        const px0 = (p.left - r.left) * W / r.width, px1 = (p.right - r.left) * W / r.width;
        if (px1 > W - MINI.w - MARGIN && px0 < W) y = Math.max(y, (p.bottom - r.top) * H / r.height + 8);
      }
    }
    this.rect.y = Math.round(y);
  }

  // Markers: every knight in the cavern (local ones gold, others blue), doors already seen.
  markers(ox, oy, s, clip) {
    const m = this.map, t = performance.now() / 1000;
    for (const d of this.world.doors) {
      const tx = d.x / TILE, ty = d.y / TILE;
      if (!this.has(Math.floor((tx + 1) / CELL) % this.cw, Math.floor((ty + 1) / CELL) % this.ch)) continue;
      for (const [wx, wy] of this.images(tx, ty, ox, oy, s, clip)) {
        ctx.fillStyle = d.locked ? '#c0703a' : d.dest?.kind === 'town' ? '#7fe08a' : '#c8b8ff';
        ctx.fillRect(wx, wy, Math.max(3, (d.w / TILE) * s), Math.max(3, (d.h / TILE) * s));
      }
    }
    const locals = new Set(this.game.locals.map((l) => l.hero));
    for (const h of this.world.heroes) {
      if (h.state === 'dead') continue;
      const mine = locals.has(h);
      for (const [wx, wy] of this.images(h.cx / TILE, (h.y + h.h / 2) / TILE, ox, oy, s, clip)) {
        const r = Math.max(3, s * 1.2);
        const pulse = mine ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
        ctx.fillStyle = `rgba(255,240,180,${0.25 + 0.25 * pulse})`;
        ctx.beginPath(); ctx.arc(wx, wy, r + 3 + pulse * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = mine ? (h === this.game.leader.hero ? '#ffd23f' : '#ff9a3f') : '#8fd0ff';
        ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a0f05'; ctx.lineWidth = 1.5; ctx.stroke();
        // Which way he faces.
        ctx.fillStyle = '#1a0f05';
        ctx.beginPath(); ctx.moveTo(wx + h.dir * (r + 1), wy); ctx.lineTo(wx + h.dir * (r - 3), wy - 2.5); ctx.lineTo(wx + h.dir * (r - 3), wy + 2.5); ctx.fill();
      }
    }
  }
  // Screen spots of a map point (tile units) in a view; a wrapping cavern repeats every period.
  images(tx, ty, ox, oy, s, clip) {
    const m = this.map, out = [];
    const rx = m.wrap ? [-1, 0, 1] : [0], ry = m.wrap ? [-1, 0, 1] : [0];
    for (const kx of rx) for (const ky of ry) {
      const x = ox + (tx + kx * m.w) * s, y = oy + (ty + ky * m.h) * s;
      if (x >= clip.x - 4 && x <= clip.x + clip.w + 4 && y >= clip.y - 4 && y <= clip.y + clip.h + 4) out.push([x, y]);
    }
    return out;
  }
  blit(ox, oy, s, clip) {
    const m = this.map;
    const rx = m.wrap ? [-1, 0, 1] : [0], ry = m.wrap ? [-1, 0, 1] : [0];
    for (const kx of rx) for (const ky of ry) ctx.drawImage(this.seen, ox + kx * m.w * s, oy + ky * m.h * s, m.w * s, m.h * s);
  }

  draw() {
    if (!minimapOn() || this.version < 0) return;
    const lead = this.game.leader.hero;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Slightly see-through, so the cavern behind still shows.
    ctx.globalAlpha = this.expanded ? 0.94 : 0.8;
    if (this.expanded) this.drawBig(lead);
    else this.drawMini(lead);
    ctx.restore();
  }

  drawMini(lead) {
    this.place();
    const r = this.rect, s = MINI.scale;
    panel(r.x - 3, r.y - 3, r.w + 6, r.h + 6, { alpha: 0.85 });
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.fillStyle = 'rgba(4,3,8,0.75)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    // Centred on the leader.
    const ox = Math.round(r.x + r.w / 2 - (lead.cx / TILE) * s), oy = Math.round(r.y + r.h / 2 - ((lead.y + lead.h / 2) / TILE) * s);
    this.blit(ox, oy, s, r);
    this.markers(ox, oy, s, r);
    ctx.restore();
    text(input.isTouch ? 'tap' : 'M', r.x + r.w - 4, r.y + r.h - 15, { size: 11, align: 'right', color: 'rgba(255,240,200,0.55)' });
  }

  drawBig(lead) {
    const m = this.map;
    fade(0.55, '#05030a');
    const maxW = W - 80, maxH = H - 130;
    let s = Math.min(maxW / m.w, maxH / m.h);
    if (s >= 1) s = Math.floor(s * 2) / 2;
    const bw = m.w * s, bh = m.h * s;
    const r = { x: Math.round((W - bw) / 2), y: Math.round(70 + (maxH - bh) / 2), w: bw, h: bh };
    panel(r.x - 12, r.y - 44, r.w + 24, r.h + 80, { alpha: 0.95 });
    text(this.world.data.name || 'Cavern', r.x, r.y - 34, { size: 20, color: COLORS.gold });
    text(`${Math.round(this.explored() * 100)}% explored`, r.x + r.w, r.y - 30, { size: 14, align: 'right', color: COLORS.dim });
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.fillStyle = '#05040a'; ctx.fillRect(r.x, r.y, r.w, r.h);
    // A wrapping cavern is shown with the knight in the middle, as it is to him.
    let ox = r.x, oy = r.y;
    if (m.wrap) {
      ox = r.x + r.w / 2 - (lead.cx / TILE) * s;
      oy = r.y + r.h / 2 - ((lead.y + lead.h / 2) / TILE) * s;
      ox = r.x + ((((ox - r.x) % r.w) + r.w) % r.w) - r.w; // keep the repeat lined up
      oy = r.y + ((((oy - r.y) % r.h) + r.h) % r.h) - r.h;
    }
    this.blit(ox, oy, s, r);
    this.markers(ox, oy, s, r);
    ctx.restore();
    const legend = [['#ffd23f', 'You'], ['#c8b8ff', 'Door'], ['#7fe08a', 'Way out'], ['#c0703a', 'Locked']];
    let lx = r.x;
    for (const [c, n] of legend) { ctx.fillStyle = c; ctx.fillRect(lx, r.y + r.h + 14, 10, 10); text(n, lx + 15, r.y + r.h + 10, { size: 13, color: COLORS.dim }); lx += 30 + n.length * 8; }
    text(input.isTouch ? 'Tap to close · moving closes it' : 'Click or M to close · moving closes it', r.x + r.w, r.y + r.h + 10, { size: 13, align: 'right', color: COLORS.dim });
  }
}
