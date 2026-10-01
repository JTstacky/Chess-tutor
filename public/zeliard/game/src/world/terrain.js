// Draws a TileMap with painted materials instead of the original 8×8 patterns:
// solid tiles are filled with a seamless material texture, exposed tops get a cap
// strip (moss, snow, gilt...), exposed undersides a hanging fringe, and edges an
// outline — cached per 16×16-tile chunk. Themes live in data/themes.json.
import { TILE, F } from './tilemap.js';
import { image } from '../core/assets.js';

const CH = 16; // tiles per chunk side
const CPX = CH * TILE;

async function cropTo(src, rect, w, h) {
  const img = await image(src);
  if (!img) return null;
  const c = document.createElement('canvas');
  const r = rect || [0, 0, img.width, img.height];
  c.width = w || r[2];
  c.height = h || r[3];
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
  return c;
}

export async function loadTheme(def) {
  const t = { ...def };
  const scale = def.textureScale || 1;
  if (def.fill) {
    const f = def.fill;
    t.fillImg = await cropTo(f.src, f.rect, f.size && f.size * scale, f.size && f.size * scale);
  }
  if (def.top) t.topImg = await cropTo(def.top.src, def.top.rect, def.top.w, def.top.h);
  if (def.bottom) t.bottomImg = await cropTo(def.bottom.src, def.bottom.rect, def.bottom.w, def.bottom.h);
  if (def.rope) t.ropeImg = await cropTo(def.rope.src, def.rope.rect, def.rope.w, def.rope.h);
  if (def.hazard) t.hazardImg = await cropTo(def.hazard.src, def.hazard.rect, def.hazard.w, def.hazard.h);
  if (def.breakable) t.breakImg = await cropTo(def.breakable.src, def.breakable.rect, TILE, TILE);
  t.bgImgs = [];
  for (const b of def.bg || []) t.bgImgs.push({ ...b, img: await image(b.src) });
  return t;
}

export class TerrainRenderer {
  constructor(map, theme) {
    this.map = map;
    this.theme = theme;
    this.chunks = new Map();
    this.version = map.version;
    this.pattern = null;
  }

  invalidateAll() { this.chunks.clear(); }

  chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c && c.version === this.map.version) return c.canvas;
    const canvas = c ? c.canvas : document.createElement('canvas');
    canvas.width = CPX;
    canvas.height = CPX;
    this.render(canvas.getContext('2d'), cx * CH, cy * CH);
    this.chunks.set(key, { canvas, version: this.map.version });
    return canvas;
  }

  render(g, tx0, ty0) {
    const m = this.map, th = this.theme;
    g.clearRect(0, 0, CPX, CPX);
    g.imageSmoothingEnabled = false;
    const solid = (x, y) => (m.flags(x, y) & F.SOLID) !== 0 && !(m.flags(x, y) & F.ONEWAY);
    const ox = tx0 * TILE, oy = ty0 * TILE;
    // 1) material fill with softened outer corners
    if (th.fillImg && !this.pattern) this.pattern = g.createPattern(th.fillImg, 'repeat');
    const pat = th.fillImg ? g.createPattern(th.fillImg, 'repeat') : null;
    if (pat && pat.setTransform) pat.setTransform(new DOMMatrix().translate(-ox % th.fillImg.width, -oy % th.fillImg.height));
    g.fillStyle = pat || th.fillColor || '#4a3a2c';
    const R = 7;
    g.beginPath();
    for (let y = ty0 - 1; y <= ty0 + CH; y++) {
      for (let x = tx0 - 1; x <= tx0 + CH; x++) {
        if (!solid(x, y)) continue;
        const px = x * TILE - ox, py = y * TILE - oy;
        const up = solid(x, y - 1), dn = solid(x, y + 1), lf = solid(x - 1, y), rt = solid(x + 1, y);
        const rTL = !up && !lf ? R : 0, rTR = !up && !rt ? R : 0, rBL = !dn && !lf ? R : 0, rBR = !dn && !rt ? R : 0;
        g.moveTo(px + rTL, py);
        g.lineTo(px + TILE - rTR, py);
        if (rTR) g.quadraticCurveTo(px + TILE, py, px + TILE, py + rTR);
        g.lineTo(px + TILE, py + TILE - rBR);
        if (rBR) g.quadraticCurveTo(px + TILE, py + TILE, px + TILE - rBR, py + TILE);
        g.lineTo(px + rBL, py + TILE);
        if (rBL) g.quadraticCurveTo(px, py + TILE, px, py + TILE - rBL);
        g.lineTo(px, py + rTL);
        if (rTL) g.quadraticCurveTo(px, py, px + rTL, py);
        g.closePath();
      }
    }
    g.fill();
    // 2) depth shading: darken tiles by distance from open air so thick rock reads as mass
    g.fillStyle = th.deepShade || 'rgba(8,4,16,0.35)';
    for (let y = ty0; y < ty0 + CH; y++) {
      for (let x = tx0; x < tx0 + CH; x++) {
        if (!solid(x, y)) continue;
        let exposed = false;
        for (let dy = -2; dy <= 2 && !exposed; dy++) for (let dx = -2; dx <= 2; dx++) if (!solid(x + dx, y + dy)) { exposed = true; break; }
        if (!exposed) g.fillRect(x * TILE - ox, y * TILE - oy, TILE, TILE);
      }
    }
    // 3) edge light and shadow, then outline
    for (let y = ty0 - 1; y <= ty0 + CH; y++) {
      for (let x = tx0 - 1; x <= tx0 + CH; x++) {
        if (!solid(x, y)) continue;
        const px = x * TILE - ox, py = y * TILE - oy;
        if (!solid(x, y - 1)) { g.fillStyle = th.topLight || 'rgba(255,236,190,0.18)'; g.fillRect(px, py, TILE, 5); }
        if (!solid(x, y + 1)) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, py + TILE - 6, TILE, 6); }
        if (!solid(x - 1, y)) { g.fillStyle = 'rgba(255,236,190,0.08)'; g.fillRect(px, py, 4, TILE); }
        if (!solid(x + 1, y)) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + TILE - 4, py, 4, TILE); }
      }
    }
    g.strokeStyle = th.outline || 'rgba(10,6,14,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    for (let y = ty0 - 1; y <= ty0 + CH; y++) {
      for (let x = tx0 - 1; x <= tx0 + CH; x++) {
        if (!solid(x, y)) continue;
        const px = x * TILE - ox, py = y * TILE - oy;
        if (!solid(x, y - 1)) { g.moveTo(px, py + 1); g.lineTo(px + TILE, py + 1); }
        if (!solid(x, y + 1)) { g.moveTo(px, py + TILE - 1); g.lineTo(px + TILE, py + TILE - 1); }
        if (!solid(x - 1, y)) { g.moveTo(px + 1, py); g.lineTo(px + 1, py + TILE); }
        if (!solid(x + 1, y)) { g.moveTo(px + TILE - 1, py); g.lineTo(px + TILE - 1, py + TILE); }
      }
    }
    g.stroke();
    // 4) cap strips on exposed tops, fringe on exposed undersides
    for (let y = ty0 - 1; y <= ty0 + CH; y++) {
      for (let x = tx0 - 1; x <= tx0 + CH; x++) {
        if (!solid(x, y)) continue;
        const px = x * TILE - ox, py = y * TILE - oy;
        if (th.topImg && !solid(x, y - 1)) {
          const s = th.topImg, sw = TILE, srcX = ((x * TILE) % s.width + s.width) % s.width;
          const oh = th.top.overhang ?? Math.round(s.height * 0.4);
          g.drawImage(s, srcX, 0, Math.min(sw, s.width - srcX), s.height, px, py - oh, Math.min(sw, s.width - srcX), s.height);
          if (s.width - srcX < sw) g.drawImage(s, 0, 0, sw - (s.width - srcX), s.height, px + (s.width - srcX), py - oh, sw - (s.width - srcX), s.height);
        }
        if (th.bottomImg && !solid(x, y + 1)) {
          const s = th.bottomImg, srcX = ((x * TILE) % s.width + s.width) % s.width;
          const oh = th.bottom.overhang ?? Math.round(s.height * 0.35);
          const w1 = Math.min(TILE, s.width - srcX);
          g.drawImage(s, srcX, 0, w1, s.height, px, py + TILE - oh, w1, s.height);
          if (w1 < TILE) g.drawImage(s, 0, 0, TILE - w1, s.height, px + w1, py + TILE - oh, TILE - w1, s.height);
        }
      }
    }
    // 5) special tiles
    for (let y = ty0; y < ty0 + CH; y++) {
      for (let x = tx0; x < tx0 + CH; x++) {
        const f = m.flags(x, y);
        const px = x * TILE - ox, py = y * TILE - oy;
        if (f & F.ROPE) this.drawRope(g, px, py, x, y);
        if (f & F.HAZARD && !(f & F.SOLID)) this.drawHazard(g, px, py, x, y);
        if (f & F.ONEWAY) this.drawLedge(g, px, py, x, y);
        if (f & F.ICE && f & F.SOLID && !solid(x, y - 1)) { g.fillStyle = 'rgba(200,240,255,0.55)'; g.fillRect(px, py, TILE, 4); }
        if (f & F.WATER) { g.fillStyle = 'rgba(40,110,200,0.35)'; g.fillRect(px, py, TILE, TILE); }
        if (f & F.BREAKABLE && f & F.SOLID) this.drawCracks(g, px, py, x, y);
      }
    }
  }

  drawRope(g, px, py, x, y) {
    const th = this.theme;
    if (th.ropeImg) {
      const s = th.ropeImg;
      const sy = ((y * TILE) % s.height + s.height) % s.height;
      const h1 = Math.min(TILE, s.height - sy);
      g.drawImage(s, 0, sy, s.width, h1, px + (TILE - s.width) / 2, py, s.width, h1);
      if (h1 < TILE) g.drawImage(s, 0, 0, s.width, TILE - h1, px + (TILE - s.width) / 2, py + h1, s.width, TILE - h1);
      return;
    }
    const cx = px + TILE / 2;
    g.fillStyle = '#3a2410';
    g.fillRect(cx - 3, py, 6, TILE);
    g.fillStyle = '#b98a4a';
    g.fillRect(cx - 2, py, 4, TILE);
    g.fillStyle = '#e4bf7a';
    for (let i = 0; i < TILE; i += 6) g.fillRect(cx - 2, py + i + ((y * 3) % 6), 2, 3);
  }

  drawHazard(g, px, py, x, y) {
    const th = this.theme;
    if (th.hazardImg) { g.drawImage(th.hazardImg, px, py, TILE, TILE); return; }
    g.fillStyle = th.hazardColor || '#c8c2b8';
    const n = 3;
    for (let i = 0; i < n; i++) {
      const bx = px + (i * TILE) / n;
      g.beginPath();
      g.moveTo(bx, py + TILE);
      g.lineTo(bx + TILE / n / 2, py + 6);
      g.lineTo(bx + TILE / n, py + TILE);
      g.fill();
    }
    g.fillStyle = 'rgba(120,20,20,0.5)';
    g.fillRect(px, py + TILE - 3, TILE, 3);
  }

  drawLedge(g, px, py) {
    g.fillStyle = '#2a1a0e';
    g.fillRect(px, py, TILE, 8);
    g.fillStyle = this.theme.ledgeColor || '#9a7448';
    g.fillRect(px, py, TILE, 5);
    g.fillStyle = 'rgba(255,240,200,0.3)';
    g.fillRect(px, py, TILE, 1);
  }

  drawCracks(g, px, py, x, y) {
    if (this.theme.breakImg) { g.drawImage(this.theme.breakImg, px, py); return; }
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    const s = (x * 7 + y * 13) % 5;
    g.moveTo(px + 4 + s, py + 3);
    g.lineTo(px + 11, py + 11 + s);
    g.lineTo(px + 8, py + 20);
    g.moveTo(px + 11, py + 11 + s);
    g.lineTo(px + 19, py + 14);
    g.stroke();
  }

  drawBackground(ctx, camX, camY, W, H) {
    const th = this.theme;
    ctx.fillStyle = th.bgColor || '#07050c';
    ctx.fillRect(0, 0, W, H);
    for (const b of th.bgImgs) {
      if (!b.img) continue;
      const p = b.parallax ?? 0.25;
      const s = Math.max(H / b.img.height, W / b.img.width) * (b.scale || 1.25);
      const iw = b.img.width * s, ih = b.img.height * s;
      const mapW = this.map.w * TILE, mapH = this.map.h * TILE;
      // Slide across the image as the camera crosses the map, so no tiling seams show.
      // (clamped: past the wrap seam the camera leaves 0..map size, which bared the image edge)
      const fx = mapW > W ? Math.max(0, Math.min(1, camX / (mapW - W))) : 0.5;
      const fy = mapH > H ? Math.max(0, Math.min(1, camY / (mapH - H))) : 0.5;
      const x = -(iw - W) * (b.lockX ? 0.5 : fx * Math.min(1, p * 4));
      const y = -(ih - H) * (b.lockY ? 0.5 : fy);
      ctx.save();
      ctx.globalAlpha = b.alpha ?? 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(b.img, x, y, iw, ih);
      ctx.restore();
    }
    if (th.bgShade) { ctx.fillStyle = th.bgShade; ctx.fillRect(0, 0, W, H); }
  }

  // Caverns wrap in both axes, so a view near an edge shows the far side of the map there.
  // Draw every copy of the map the view touches, clipping each copy's last chunk row/column at
  // the true map edge (sizes like 52 or 196 tiles aren't multiples of the chunk). Drawing only
  // the in-bounds chunks left floors missing whenever the camera looked across the seam, e.g.
  // Peligro's exit door at the bottom row, whose floor is row 1 at the top.
  draw(ctx, camX, camY, W, H) {
    const m = this.map, mw = m.w * TILE, mh = m.h * TILE;
    const nx = Math.ceil(m.w / CH), ny = Math.ceil(m.h / CH);
    const kx0 = m.wrap ? Math.floor(camX / mw) : 0, kx1 = m.wrap ? Math.floor((camX + W) / mw) : 0;
    const ky0 = m.wrap ? Math.floor(camY / mh) : 0, ky1 = m.wrap ? Math.floor((camY + H) / mh) : 0;
    const used = new Set();
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const lx = camX - kx * mw, ly = camY - ky * mh; // the camera inside this copy
        const cx0 = Math.max(0, Math.floor(lx / CPX)), cx1 = Math.min(nx - 1, Math.floor((lx + W) / CPX));
        const cy0 = Math.max(0, Math.floor(ly / CPX)), cy1 = Math.min(ny - 1, Math.floor((ly + H) / CPX));
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const sw = Math.min(CPX, mw - cx * CPX), sh = Math.min(CPX, mh - cy * CPX);
            ctx.drawImage(this.chunk(cx, cy), 0, 0, sw, sh, Math.round(cx * CPX - lx), Math.round(cy * CPX - ly), sw, sh);
            used.add(cx + ',' + cy);
          }
        }
      }
    }
    // Evict chunks not on screen to bound memory on the 240-wide caverns.
    if (this.chunks.size > 80) for (const key of this.chunks.keys()) if (!used.has(key)) this.chunks.delete(key);
  }
}
