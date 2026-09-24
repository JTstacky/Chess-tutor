"use strict";
// pixelart.js — a tiny procedural pixel-art painter. Everything that is not a
// character sprite (trees, rocks, tents, crystals...) is painted here at texel
// resolution and drawn scaled up with smoothing off, so the whole world shares
// one pixel grid with the ground.

class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
  }
  px(x, y, color) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 1, 1);
  }
  rect(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  line(x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 400; i++) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // soft contact shadow under a prop
  shadow(cx, cy, rx, ry) {
    const c = this.ctx;
    c.fillStyle = "rgba(10,14,24,0.28)";
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))));
      if (half > 0) c.fillRect((cx - half) | 0, (cy + y) | 0, half * 2, 1);
    }
  }
  newMask() { return new Uint8Array(this.w * this.h); }
  maskEllipse(m, cx, cy, rx, ry, seed, wobble) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const wob = wobble ? (vnoise(x / 3.1, y / 3.1, seed) - 0.5) * wobble : 0;
      if (dx * dx + dy * dy <= 1 + wob) m[y * this.w + x] = 1;
    }
  }
  maskPoly(m, pts) {
    let minY = 1e9, maxY = -1e9;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      if (y < 0 || y >= this.h) continue;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const ya = a[1], yb = b[1], yc = y + 0.5;
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(a[0] + ((yc - ya) / (yb - ya)) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) if (x >= 0 && x < this.w) m[y * this.w + x] = 1;
      }
    }
  }
  maskRect(m, x, y, w, h) {
    for (let j = y | 0; j < (y + h | 0); j++) for (let i = x | 0; i < (x + w | 0); i++) {
      if (i >= 0 && j >= 0 && i < this.w && j < this.h) m[j * this.w + i] = 1;
    }
  }
  // Paint a mask as a lit volume. pal = [outline, shadow, mid, light, highlight].
  // Light comes from the upper left; `grain` adds leafy/rocky dither.
  shade(m, pal, seed, grain, flat) {
    let x0 = this.w, x1 = 0, y0 = this.h, y1 = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m[y * this.w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : m[y * this.w + x]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m[y * this.w + x]) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      if (edge) { this.px(x, y, pal[0]); continue; }
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      let t = flat ? -nx * 0.8 - ny * 0.25 : -nx * 0.5 - ny * 0.8;
      t += (hash2(x, y, seed) - 0.5) * (grain || 0) + (vnoise(x / 2.6, y / 2.6, seed + 7) - 0.5) * (grain || 0) * 1.4;
      // rim: the pixel just inside the lower-right outline goes to shadow
      if (!at(x + 2, y) || !at(x, y + 2)) t -= 0.35;
      const c = t > 0.62 ? pal[4] : t > 0.18 ? pal[3] : t > -0.32 ? pal[2] : pal[1];
      this.px(x, y, c);
    }
  }
}

const PropArt = {
  cache: {},
  // returns { canvas, ax, ay } — ax/ay = anchor (ground contact) in texels
  get(kind, variant) {
    const hue = this.NO_HUE[kind] ? 0 : World.hue | 0, key = kind + ":" + variant + ":" + hue;
    if (!this.cache[key]) {
      const art = this.paint(kind, variant);
      if (hue) art.canvas = World.hueShift(art.canvas);
      this.cache[key] = art;
    }
    return this.cache[key];
  },

  NO_HUE: { rocket: 1, rocketfly: 1, tent: 1, banner: 1, campfire: 1, crate: 1, stump: 1 },   // what the poacher brought along

  PAL: {
    oak:    ["#16301c", "#235c2a", "#34873a", "#52b04a", "#8ad862"],
    oak2:   ["#1a3318", "#3a6a22", "#5a9030", "#84b83c", "#b8dc5a"],
    willow: ["#12302c", "#1e5a4a", "#2e8466", "#48ac80", "#7ed4a0"],
    pine:   ["#0e2622", "#16463a", "#1f6a4c", "#2f8c5c", "#58b478"],
    snow:   ["#5a7896", "#9ab8d4", "#d4e6f4", "#eef6fc", "#ffffff"],
    trunk:  ["#2a1a12", "#4a2e1c", "#6e4628", "#8e6236", "#aa7c48"],
    rock:   ["#23262e", "#4a5160", "#6e7788", "#939eae", "#bcc6d2"],
    sand:   ["#4a3218", "#8a6232", "#b88a4a", "#d8ae68", "#f0d08c"],
    obsid:  ["#08080c", "#1a1822", "#2c2a3a", "#464460", "#7a78a0"],
    cactus: ["#123018", "#1f6a34", "#2f9444", "#4cb85a", "#86dc7c"],
    bush:   ["#16301c", "#2a6a2e", "#3e9440", "#60b852", "#98dc70"],
    ice:    ["#2a5a8a", "#58a0d8", "#8cccf0", "#c4ecff", "#ffffff"],
    void:   ["#14081e", "#3a1a5c", "#6a2e9c", "#a050dc", "#e0a0ff"],
    dead:   ["#1e1612", "#3a2c22", "#584434", "#786048", "#988062"],
    cloth:  ["#3a1414", "#7a2424", "#b03a30", "#d85a40", "#f08a60"],
    canvas: ["#3a3020", "#8a7a58", "#b8a67a", "#d8c89a", "#f0e4c0"],
    shroom: ["#2a0a1e", "#7a1e4a", "#b83068", "#e05a8a", "#ffa0c0"],
    bone:   ["#3a3630", "#8a8474", "#bab4a0", "#dcd6c4", "#f6f2e6"],
  },

  paint(kind, v) {
    const P = this.PAL;
    const seed = v * 131 + kind.length * 17;
    const r = (n) => hash2(n, v, seed);
    let p;
    switch (kind) {
      case "oak": case "oak2": case "willow": {
        p = new Painter(40, 50);
        const cx = 20, base = 46;
        p.shadow(cx, base, 12, 4);
        const tr = p.newMask();
        p.maskRect(tr, cx - 2, base - 16, 5, 16);
        p.maskRect(tr, cx - 3, base - 3, 7, 3);
        p.shade(tr, P.trunk, seed, 0.3, true);
        const m = p.newMask();
        const topY = 17 + (r(1) * 3 | 0);
        p.maskEllipse(m, cx, topY, 13 + r(2) * 2, 12, seed, 0.35);
        p.maskEllipse(m, cx - 8, topY + 6, 9, 8, seed + 1, 0.35);
        p.maskEllipse(m, cx + 8, topY + 5, 9, 8, seed + 2, 0.35);
        if (kind === "willow") { p.maskEllipse(m, cx - 10, topY + 12, 5, 9, seed + 3, 0.3); p.maskEllipse(m, cx + 10, topY + 12, 5, 9, seed + 4, 0.3); }
        p.shade(m, P[kind], seed, 0.55);
        return { canvas: p.canvas, ax: cx, ay: base, solid: 0, tall: true };
      }
      case "pine": case "snowpine": {
        p = new Painter(32, 54);
        const cx = 16, base = 50;
        p.shadow(cx, base, 9, 3);
        const tr = p.newMask(); p.maskRect(tr, cx - 2, base - 8, 4, 8); p.shade(tr, P.trunk, seed, 0.3, true);
        const tiers = [[base - 6, 12], [base - 17, 10], [base - 27, 8], [base - 36, 5]];
        for (let i = 0; i < tiers.length; i++) {
          const [by, hw] = tiers[i];
          const m = p.newMask();
          p.maskPoly(m, [[cx - hw, by], [cx + hw, by], [cx + 1, by - 14], [cx - 1, by - 14]]);
          p.shade(m, P.pine, seed + i, 0.45);
          if (kind === "snowpine") {
            const s = p.newMask();
            p.maskPoly(s, [[cx - hw * 0.55, by - 6], [cx + hw * 0.4, by - 7], [cx + 1, by - 14], [cx - 1, by - 14]]);
            p.shade(s, P.snow, seed + i + 9, 0.2);
          }
        }
        return { canvas: p.canvas, ax: cx, ay: base, solid: 0, tall: true };
      }
      case "bush": case "snowbush": case "drybush": {
        p = new Painter(24, 18);
        p.shadow(12, 15, 9, 3);
        const m = p.newMask();
        p.maskEllipse(m, 12, 10, 8 + r(1) * 2, 6, seed, 0.4);
        p.maskEllipse(m, 7, 12, 5, 4, seed + 1, 0.3);
        p.maskEllipse(m, 17, 12, 5, 4, seed + 2, 0.3);
        p.shade(m, kind === "snowbush" ? P.snow : kind === "drybush" ? P.dead : P.bush, seed, 0.5);
        if (kind === "bush" && v % 2 === 0) for (let i = 0; i < 4; i++) p.px(6 + r(i + 5) * 12, 6 + r(i + 9) * 7, i % 2 ? "#ff6a7a" : "#ffd84a");
        return { canvas: p.canvas, ax: 12, ay: 15, solid: 0 };
      }
      case "rock": case "sandrock": case "obsidian": case "snowrock": case "mossrock": {
        const big = v % 3 === 0;
        p = new Painter(30, 26);
        const cx = 15, base = 22;
        p.shadow(cx, base, big ? 12 : 9, 3);
        const m = p.newMask();
        p.maskEllipse(m, cx, base - (big ? 8 : 6), big ? 11 : 8, big ? 9 : 6, seed, 0.25);
        p.maskEllipse(m, cx + (big ? 6 : 4), base - 4, 6, 4, seed + 1, 0.2);
        const pal = kind === "sandrock" ? P.sand : kind === "obsidian" ? P.obsid : P.rock;
        p.shade(m, pal, seed, 0.35);
        p.line(cx - 2, base - 10, cx + 1, base - 5, pal[1]);
        if (kind === "snowrock") { const s = p.newMask(); p.maskEllipse(s, cx - 1, base - (big ? 14 : 10), big ? 8 : 6, 3, seed + 3, 0.3); p.shade(s, P.snow, seed, 0.15); }
        if (kind === "mossrock") { const s = p.newMask(); p.maskEllipse(s, cx - 2, base - (big ? 14 : 10), big ? 7 : 5, 3, seed + 3, 0.4); p.shade(s, P.bush, seed, 0.4); }
        if (kind === "obsidian") { p.px(cx - 3, base - 9, "#ff7a2a"); p.px(cx - 2, base - 8, "#ffb84a"); p.px(cx + 3, base - 5, "#ff5a1a"); }
        return { canvas: p.canvas, ax: cx, ay: base, solid: big ? 12 : 9 };
      }
      case "cactus": {
        p = new Painter(24, 36);
        const cx = 12, base = 32;
        p.shadow(cx, base, 7, 2);
        const m = p.newMask();
        p.maskRect(m, cx - 3, base - 24, 6, 24); p.maskEllipse(m, cx, base - 24, 3, 3, seed, 0);
        const ly = base - 12 - (r(1) * 5 | 0), ry = base - 16 - (r(2) * 5 | 0);
        p.maskRect(m, cx - 9, ly, 7, 3); p.maskRect(m, cx - 9, ly - 7, 3, 8);
        p.maskRect(m, cx + 3, ry, 7, 3); p.maskRect(m, cx + 7, ry - 8, 3, 9);
        p.shade(m, P.cactus, seed, 0.2, true);
        if (v % 2) { p.px(cx, base - 27, "#ff7ab0"); p.px(cx - 1, base - 27, "#ffb0d0"); }
        return { canvas: p.canvas, ax: cx, ay: base, solid: 0, tall: true };
      }
      case "deadtree": case "chartree": case "rifttree": {
        p = new Painter(36, 46);
        const cx = 18, base = 42;
        p.shadow(cx, base, 8, 3);
        const pal = kind === "chartree" ? ["#0c0a0a", "#1e1816", "#302622", "#463830", "#5e4c40"] : kind === "rifttree" ? P.void : P.dead;
        const tr = p.newMask();
        p.maskPoly(tr, [[cx - 3, base], [cx + 3, base], [cx + 1, base - 26], [cx - 2, base - 26]]);
        p.shade(tr, pal, seed, 0.3, true);
        const br = (x0, y0, x1, y1) => { p.line(x0, y0, x1, y1, pal[2]); p.line(x0, y0 + 1, x1, y1 + 1, pal[0]); };
        br(cx, base - 22, cx - 10, base - 32 - r(1) * 4); br(cx - 6, base - 28, cx - 12, base - 38);
        br(cx, base - 25, cx + 10, base - 34 - r(2) * 4); br(cx + 6, base - 30, cx + 8, base - 40);
        br(cx, base - 26, cx + 1, base - 40);
        if (kind === "chartree") { p.px(cx + 1, base - 8, "#ff6a1a"); p.px(cx, base - 14, "#ffa83a"); }
        if (kind === "rifttree") for (let i = 0; i < 5; i++) p.px(cx - 11 + r(i + 3) * 22, base - 40 + r(i + 8) * 10, "#e0a0ff");
        return { canvas: p.canvas, ax: cx, ay: base, solid: 0, tall: true };
      }
      case "crystal": case "icecrystal": {
        p = new Painter(30, 40);
        const cx = 15, base = 36, pal = kind === "crystal" ? P.void : P.ice;
        p.shadow(cx, base, 10, 3);
        const shard = (x, w, h, lean) => {
          const l = p.newMask(), rr = p.newMask();
          p.maskPoly(l, [[x - w, base], [x, base], [x + lean, base - h], [x - w * 0.6 + lean, base - h * 0.8]]);
          p.maskPoly(rr, [[x, base], [x + w, base], [x + w * 0.6 + lean, base - h * 0.8], [x + lean, base - h]]);
          p.shade(rr, [pal[0], pal[1], pal[1], pal[2], pal[2]], seed, 0.1, true);
          p.shade(l, [pal[0], pal[2], pal[3], pal[4], pal[4]], seed, 0.1, true);
        };
        shard(cx - 7, 4, 16 + r(1) * 5, -2); shard(cx + 7, 4, 13 + r(2) * 5, 2); shard(cx, 5, 26 + r(3) * 6, 0);
        return { canvas: p.canvas, ax: cx, ay: base, solid: 9, glow: kind === "crystal" ? "#b060ff" : "#9fe0ff" };
      }
      case "reeds": {
        p = new Painter(20, 24);
        for (let i = 0; i < 6; i++) {
          const x = 3 + i * 2.6 + r(i) * 2, h = 12 + r(i + 7) * 8;
          p.line(x, 22, x + (r(i + 3) - 0.5) * 4, 22 - h, i % 2 ? "#4c8a3a" : "#2e6a30");
          if (i % 2 === 0) p.rect(x + (r(i + 3) - 0.5) * 4 - 0.5, 22 - h - 3, 2, 4, "#6e4628");
        }
        return { canvas: p.canvas, ax: 10, ay: 22, solid: 0 };
      }
      case "shroom": case "glowshroom": {
        p = new Painter(18, 18);
        p.shadow(9, 15, 6, 2);
        const glow = kind === "glowshroom";
        const st = p.newMask(); p.maskRect(st, 7, 8, 4, 7); p.shade(st, P.bone, seed, 0.1, true);
        const cap = p.newMask(); p.maskEllipse(cap, 9, 7, 7, 4.5, seed, 0.1);
        p.shade(cap, glow ? P.void : P.shroom, seed, 0.15);
        p.px(6, 6, glow ? "#f0d0ff" : "#ffe8f0"); p.px(11, 5, glow ? "#f0d0ff" : "#ffe8f0"); p.px(9, 8, glow ? "#f0d0ff" : "#ffe8f0");
        return { canvas: p.canvas, ax: 9, ay: 15, solid: 0, glow: glow ? "#c070ff" : null };
      }
      case "bones": {
        p = new Painter(26, 16);
        p.shadow(13, 13, 10, 2);
        for (let i = 0; i < 5; i++) { const x = 5 + i * 4; p.line(x, 12, x + 1, 5 + Math.abs(i - 2) * 1.5, P.bone[3]); p.px(x + 1, 4 + Math.abs(i - 2) * 1.5, P.bone[4]); }
        p.line(3, 12, 23, 12, P.bone[2]);
        const sk = p.newMask(); p.maskEllipse(sk, 22, 9, 3.5, 3, seed, 0); p.shade(sk, P.bone, seed, 0.1);
        p.px(22, 9, "#1a1a1a");
        return { canvas: p.canvas, ax: 13, ay: 13, solid: 0 };
      }
      case "stump": {
        p = new Painter(20, 16);
        p.shadow(10, 13, 8, 2);
        const m = p.newMask(); p.maskRect(m, 5, 6, 10, 7); p.maskEllipse(m, 10, 12, 6, 2, seed, 0);
        p.shade(m, P.trunk, seed, 0.3, true);
        const t = p.newMask(); p.maskEllipse(t, 10, 6, 5.5, 2.5, seed, 0); p.shade(t, ["#4a2e1c", "#aa7c48", "#c89a5e", "#dcb478", "#f0d098"], seed, 0.2);
        return { canvas: p.canvas, ax: 10, ay: 13, solid: 6 };
      }
      case "pillar": case "brokenpillar": {
        p = new Painter(22, 46);
        const cx = 11, base = 42, h = kind === "pillar" ? 34 : 18 + (v % 3) * 4;
        p.shadow(cx, base, 9, 3);
        const m = p.newMask();
        p.maskRect(m, cx - 5, base - h, 10, h); p.maskRect(m, cx - 7, base - 4, 14, 4);
        if (kind === "pillar") p.maskRect(m, cx - 7, base - h - 3, 14, 4);
        else p.maskPoly(m, [[cx - 5, base - h], [cx + 5, base - h], [cx + 5, base - h - 2], [cx, base - h - 6], [cx - 5, base - h - 1]]);
        p.shade(m, P.rock, seed, 0.3, true);
        const rune = ["#7be0ff", "#ffd84a", "#ff7ab0", "#b0ff7a"][v % 4];
        p.px(cx - 1, base - h * 0.6, rune); p.px(cx, base - h * 0.6 + 1, rune); p.px(cx - 1, base - h * 0.6 + 2, rune); p.px(cx + 1, base - h * 0.6 - 1, rune);
        return { canvas: p.canvas, ax: cx, ay: base, solid: 9, glow: rune };
      }
      case "tent": {
        p = new Painter(56, 44);
        const cx = 28, base = 40;
        p.shadow(cx, base, 24, 4);
        const l = p.newMask(), rr = p.newMask();
        p.maskPoly(l, [[cx - 24, base], [cx, base], [cx, base - 30]]);
        p.maskPoly(rr, [[cx, base], [cx + 24, base], [cx, base - 30]]);
        p.shade(rr, [P.canvas[0], P.canvas[1], P.canvas[1], P.canvas[2], P.canvas[2]], seed, 0.15, true);
        p.shade(l, [P.canvas[0], P.canvas[2], P.canvas[3], P.canvas[4], P.canvas[4]], seed, 0.15, true);
        const door = p.newMask(); p.maskPoly(door, [[cx - 6, base], [cx + 6, base], [cx, base - 16]]);
        p.shade(door, ["#1a120c", "#2a1e14", "#2a1e14", "#3a2a1c", "#3a2a1c"], seed, 0);
        p.line(cx, base - 30, cx, base - 36, "#4a2e1c");
        p.rect(cx + 1, base - 36, 6, 4, "#d85a40"); p.rect(cx + 1, base - 36, 6, 1, "#f08a60");
        return { canvas: p.canvas, ax: cx, ay: base, solid: 18 };
      }
      case "banner": {
        p = new Painter(18, 44);
        p.shadow(6, 40, 5, 2);
        p.rect(5, 4, 2, 36, "#6e4628"); p.rect(5, 4, 1, 36, "#8e6236"); p.rect(4, 2, 4, 3, "#ffd84a");
        const m = p.newMask(); p.maskPoly(m, [[7, 6], [17, 6], [17, 22], [12, 18], [7, 22]]);
        p.shade(m, P.cloth, seed, 0.1, true);
        p.px(11, 10, "#ffd84a"); p.px(12, 11, "#ffd84a"); p.px(11, 12, "#ffd84a"); p.px(10, 11, "#ffd84a");
        return { canvas: p.canvas, ax: 6, ay: 40, solid: 3 };
      }
      case "campfire": {
        p = new Painter(20, 14);
        p.shadow(10, 10, 9, 3);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const m = p.newMask(); p.maskEllipse(m, 10 + Math.cos(a) * 7, 9 + Math.sin(a) * 3, 2, 1.6, seed + i, 0); p.shade(m, P.rock, seed + i, 0.2); }
        p.line(6, 10, 14, 7, "#4a2e1c"); p.line(6, 7, 14, 10, "#6e4628");
        return { canvas: p.canvas, ax: 10, ay: 10, solid: 8, fire: true };
      }
      case "rocket": case "rocketfly": {
        // the poacher's ship: a dented retro rocket on three struts. "rocketfly" = struts folded, no shadow.
        p = new Painter(48, 96);
        const cx = 24, base = 90, fly = kind === "rocketfly";
        const HULL = ["#2a2e3a", "#7a8496", "#aab4c4", "#d8e0ea", "#ffffff"], RED = ["#2a0808", "#7a1818", "#b82a22", "#e04a34", "#ff8a60"], DK = ["#08090e", "#1a1e2a", "#2c3242", "#444c60", "#687288"];
        if (!fly) p.shadow(cx, base, 20, 4);
        let m;
        // fins (behind the hull)
        for (const sx of [-1, 1]) { m = p.newMask(); p.maskPoly(m, [[cx + sx * 8, base - 34], [cx + sx * 20, base - 10], [cx + sx * 20, base - 2], [cx + sx * 8, base - 12]]); p.shade(m, RED, seed + 1, 0.12, true); }
        // landing struts
        if (!fly) for (const sx of [-1, 1]) { p.line(cx + sx * 7, base - 10, cx + sx * 15, base, "#444c60"); p.rect(cx + sx * 15 - 2, base - 1, 5, 2, "#1a1e2a"); }
        // engine bell
        m = p.newMask(); p.maskPoly(m, [[cx - 6, base - 12], [cx + 6, base - 12], [cx + 8, base - 4], [cx - 8, base - 4]]); p.shade(m, DK, seed + 2, 0.15, true);
        // hull
        m = p.newMask(); p.maskEllipse(m, cx, base - 44, 11, 34, seed, 0); p.maskRect(m, cx - 10, base - 44, 20, 32); p.shade(m, HULL, seed + 3, 0.12);
        // nose cone
        m = p.newMask(); p.maskPoly(m, [[cx - 9, base - 62], [cx + 9, base - 62], [cx + 4, base - 78], [cx, base - 86], [cx - 4, base - 78]]); p.shade(m, RED, seed + 4, 0.1);
        p.rect(cx - 10, base - 62, 20, 2, "#1a1e2a");
        // porthole
        m = p.newMask(); p.maskEllipse(m, cx, base - 50, 5, 5, seed, 0); p.shade(m, DK, seed + 5, 0);
        m = p.newMask(); p.maskEllipse(m, cx, base - 50, 3.4, 3.4, seed, 0); p.shade(m, ["#0a2a3a", "#1a6a8a", "#3aa8c8", "#7be0ff", "#d8f8ff"], seed + 6, 0.1);
        // hazard band + poacher's skull mark + centre fin
        for (let i = 0; i < 10; i++) p.rect(cx - 10 + i * 2, base - 16, 2, 3, i % 2 ? "#1a1e2a" : "#ffd84a");
        p.rect(cx - 3, base - 38, 6, 5, "#1a1e2a"); p.rect(cx - 2, base - 33, 4, 2, "#1a1e2a"); p.px(cx - 2, base - 36, "#ffffff"); p.px(cx + 1, base - 36, "#ffffff");
        m = p.newMask(); p.maskPoly(m, [[cx - 1, base - 30], [cx + 1, base - 30], [cx + 2, base - 4], [cx - 2, base - 4]]); p.shade(m, RED, seed + 7, 0.1, true);
        // rivets and a few dents
        for (let i = 0; i < 6; i++) p.px(cx - 8 + r(i + 2) * 16, base - 58 + r(i + 11) * 38, "#7a8496");
        return { canvas: p.canvas, ax: cx, ay: base, solid: fly ? 0 : 20, tall: true };
      }
      case "crate": {
        p = new Painter(16, 16);
        p.shadow(8, 13, 7, 2);
        const m = p.newMask(); p.maskRect(m, 2, 3, 12, 11); p.shade(m, P.trunk, seed, 0.2, true);
        p.line(3, 4, 12, 12, "#4a2e1c"); p.rect(2, 3, 12, 1, "#aa7c48");
        return { canvas: p.canvas, ax: 8, ay: 13, solid: 7 };
      }
    }
    p = new Painter(4, 4);
    return { canvas: p.canvas, ax: 2, ay: 2, solid: 0 };
  },
};
