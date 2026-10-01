// Asset loading and sprite sheets. Art is described in data/sprites.json so the
// remastered Codex art can replace the old asset-pack art without code changes.

const images = new Map();
const json = new Map();
// The published site swaps big lossless images for compressed copies
// (data/web_assets.json, written by tools/publish_site.mjs); absent in development.
let remap = {};
export function setRemap(m) { remap = m || {}; }

export function loadImage(url) {
  if (images.has(url)) return images.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('missing image', url); resolve(null); };
    img.src = remap[url] || url;
  });
  images.set(url, p);
  return p;
}

export async function loadJSON(url, fallback) {
  if (json.has(url)) return json.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }).catch((e) => {
    if (fallback !== undefined) return fallback;
    throw e;
  });
  json.set(url, p);
  return p;
}

// A horizontal strip / grid of equal frames with a shared anchor (feet point).
export class Sheet {
  constructor(img, def) {
    this.img = img;
    this.fw = def.fw || def.frameWidth || (img ? img.height : 0);
    this.fh = def.fh || def.frameHeight || (img ? img.height : 0);
    this.cols = def.cols || (img ? Math.max(1, Math.floor(img.width / this.fw)) : 1);
    this.count = def.frames || this.cols * (img ? Math.max(1, Math.floor(img.height / this.fh)) : 1);
    this.ax = def.ax ?? this.fw / 2;
    this.ay = def.ay ?? this.fh;
    this.scale = def.scale || 1;
    this.fps = def.fps || 8;
    this.anims = def.anims || { default: [...Array(this.count).keys()] };
    this.faces = def.faces || 1; // 1 = art faces right, -1 = art faces left
    this.dx = null; // per-frame x correction (see steady())
  }
  // The painted frames don't keep the body in one place: the knight's walk lurches ~25 px forward
  // on its passing frames and his idle sways 11 px. Measure where each frame's head and torso sit
  // and shift the frame so they stay over the anchor; the feet still move, the body doesn't jump.
  // whole: measure the whole figure (monsters have no torso to go by). only: frames to correct
  // (the rest keep their painted offset, e.g. a lunge).
  steady(whole = false, only = null) {
    if (!this.img || this.dx) return this;
    try {
      const c = document.createElement('canvas'); c.width = this.img.width; c.height = this.img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(this.img, 0, 0);
      const fw = this.fw, fh = this.fh;
      this.dx = [];
      for (let f = 0; f < this.count; f++) {
        const ox = (f % this.cols) * fw, oy = Math.floor(f / this.cols) * fh;
        const a = g.getImageData(ox, oy, fw, fh).data;
        let top = -1;
        for (let y = 0; y < fh && top < 0; y++) for (let x = 0; x < fw; x++) if (a[(y * fw + x) * 4 + 3] > 40) { top = y; break; }
        let s = 0, n = 0;
        // Head and torso: from just below the top (skipping plumes and raised staffs) to half the height.
        const y0 = whole ? top : top + Math.round((this.ay - top) * 0.1), y1 = whole ? fh : top + Math.round((this.ay - top) * 0.55);
        for (let y = Math.max(0, y0); y < Math.min(fh, y1); y++) for (let x = 0; x < fw; x++) if (a[(y * fw + x) * 4 + 3] > 40) { s += x; n++; }
        this.dx.push(top < 0 || !n ? 0 : Math.round(this.ax - s / n));
      }
      if (only) {
        // Keep the corrected frames' common offset out, so they line up with each other and with
        // the frames left alone, rather than all jumping to the anchor.
        const m = only.reduce((a, i) => a + this.dx[i], 0) / only.length;
        this.dx = this.dx.map((d, i) => only.includes(i) ? Math.round(d - m) : 0);
      }
    } catch { this.dx = null; }
    return this;
  }
  // Where frame `i`'s head and torso sit, in frame px from the anchor (facing as painted), plus
  // its steadying shift: what a held shield lines up with. Measured once per frame.
  torsoX(i) {
    if (!this.img) return 0;
    const f = ((i % this.count) + this.count) % this.count;
    this.torso ||= [];
    if (this.torso[f] == null) {
      try {
        const c = document.createElement('canvas'); c.width = this.fw; c.height = this.fh;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(this.img, (f % this.cols) * this.fw, Math.floor(f / this.cols) * this.fh, this.fw, this.fh, 0, 0, this.fw, this.fh);
        const a = g.getImageData(0, 0, this.fw, this.fh).data;
        let top = -1;
        for (let y = 0; y < this.fh && top < 0; y++) for (let x = 0; x < this.fw; x++) if (a[(y * this.fw + x) * 4 + 3] > 40) { top = y; break; }
        let s = 0, n = 0;
        const y0 = top + Math.round((this.ay - top) * 0.25), y1 = top + Math.round((this.ay - top) * 0.55);
        // The crimson tunic: the cape trailing behind and the sword out front don't count.
        for (let y = Math.max(0, y0); y < Math.min(this.fh, y1); y++) for (let x = 0; x < this.fw; x++) {
          const p = (y * this.fw + x) * 4;
          if (a[p + 3] > 40 && a[p] > 140 && a[p + 1] < 90 && a[p + 2] < 90) { s += x; n++; }
        }
        this.torso[f] = top < 0 || n < 20 ? 0 : s / n - this.ax;
      } catch { this.torso[f] = 0; }
    }
    return this.torso[f] + (this.dx ? this.dx[f] || 0 : 0);
  }
  // Draw frame `i` with its anchor at (x, y). dir: 1 right, -1 left.
  draw(ctx, i, x, y, dir = 1, alpha = 1, scale = 1) {
    if (!this.img) return;
    const f = ((i % this.count) + this.count) % this.count;
    const sx = (f % this.cols) * this.fw;
    const sy = Math.floor(f / this.cols) * this.fh;
    const s = this.scale * scale;
    const flip = dir * this.faces < 0;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    const dx = this.dx ? this.dx[f] : 0;
    ctx.drawImage(this.img, sx, sy, this.fw, this.fh, (dx - this.ax) * s, -this.ay * s, this.fw * s, this.fh * s);
    ctx.restore();
  }
  frameAt(anim, t) {
    const seq = this.anims[anim] || this.anims.default || [0];
    return seq[Math.floor(t * this.fps) % seq.length];
  }
  // Walk cycles driven by distance covered, so the feet keep pace with the ground (`per` px a frame).
  frameByDist(anim, d, per) {
    const seq = this.anims[anim] || this.anims.default || [0];
    return seq[Math.floor(Math.max(0, d) / per) % seq.length];
  }
  frameOnce(anim, t) {
    const seq = this.anims[anim] || this.anims.default || [0];
    return seq[Math.min(seq.length - 1, Math.floor(t * this.fps))];
  }
  length(anim) { return (this.anims[anim] || this.anims.default || [0]).length / this.fps; }
}

const sheets = new Map();
// Character sheets whose frames are re-centred on the body (Sheet.steady).
const STEADY = /^(hero\.(walk|idle|town)|art\.npc\.)/;
let spriteDefs = {};

export async function loadSpriteDefs(url) {
  spriteDefs = await loadJSON(url);
  return spriteDefs;
}

// Resolve a sprite id (e.g. "hero.walk") to a loaded Sheet. Missing art resolves to
// null so callers can draw a placeholder instead of crashing.
export async function sheet(id) {
  if (sheets.has(id)) return sheets.get(id);
  const def = spriteDefs[id];
  if (!def) { sheets.set(id, null); return null; }
  const img = await loadImage(def.src);
  const s = img ? new Sheet(img, def) : null;
  if (s && STEADY.test(id)) s.steady();
  else if (s && id.startsWith('art.enemy.')) s.steady(true, [...new Set([...(s.anims.move || []), ...(s.anims.idle || [])])]);
  sheets.set(id, s);
  return s;
}
export function sheetNow(id) { return sheets.get(id) || null; }
export function spriteIds(prefix) { return Object.keys(spriteDefs).filter((k) => k.startsWith(prefix)); }
export async function preloadSheets(ids) { await Promise.all(ids.map(sheet)); }
export function imageNow(url) {
  const p = images.get(url);
  return p && p.done ? p.value : null;
}

// Cache resolved images synchronously once loaded.
export async function image(url) {
  const img = await loadImage(url);
  const p = images.get(url);
  if (p) { p.done = true; p.value = img; }
  return img;
}
