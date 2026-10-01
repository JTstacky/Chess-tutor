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
    ctx.drawImage(this.img, sx, sy, this.fw, this.fh, -this.ax * s, -this.ay * s, this.fw * s, this.fh * s);
    ctx.restore();
  }
  frameAt(anim, t) {
    const seq = this.anims[anim] || this.anims.default || [0];
    return seq[Math.floor(t * this.fps) % seq.length];
  }
  frameOnce(anim, t) {
    const seq = this.anims[anim] || this.anims.default || [0];
    return seq[Math.min(seq.length - 1, Math.floor(t * this.fps))];
  }
  length(anim) { return (this.anims[anim] || this.anims.default || [0]).length / this.fps; }
}

const sheets = new Map();
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
