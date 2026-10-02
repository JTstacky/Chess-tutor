// The 960×540 game canvas, scaled to fit the window, plus text / panel helpers.
import { wrapText } from '../core/util.js';

export const W = 960;
export const H = 540;
export const canvas = document.getElementById('screen');
export const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

export function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  // Integer scaling keeps pixels square when the window allows it.
  const scale = s >= 2 ? Math.floor(s) : s;
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}
window.addEventListener('resize', fit);
fit();

export const FONT = "'Beliards', monospace";
export const COLORS = {
  ink: '#f4ead0', dim: '#a89a78', gold: '#f2c85b', red: '#e0584f', blue: '#5fa8e8', green: '#7fd06a',
  panel: 'rgba(14, 10, 24, 0.92)', panelEdge: '#c9a55a', panelEdge2: '#5a4526', shadow: 'rgba(0,0,0,0.75)',
  almas: '#8fe3ff', magic: '#b28cff',
};

export function text(str, x, y, { size = 16, color = COLORS.ink, align = 'left', baseline = 'top', shadow = true, weight = 400, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = COLORS.shadow;
    ctx.fillText(str, Math.round(x) + Math.max(1, size / 12), Math.round(y) + Math.max(1, size / 12));
  }
  ctx.fillStyle = color;
  ctx.fillText(str, Math.round(x), Math.round(y));
  ctx.restore();
}

export function measure(str, size = 16, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(str).width;
}

export function wrap(str, maxWidth, size = 16) {
  ctx.font = `400 ${size}px ${FONT}`;
  return wrapText(ctx, str, maxWidth);
}

// Ornamented panel: dark fill, gold double edge, corner studs.
export function panel(x, y, w, h, { fill = COLORS.panel, edge = COLORS.panelEdge, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLORS.panelEdge2;
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(201,165,90,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  ctx.fillStyle = edge;
  for (const [cx, cy] of [[x, y], [x + w - 6, y], [x, y + h - 6], [x + w - 6, y + h - 6]]) ctx.fillRect(cx, cy, 6, 6);
  ctx.restore();
}

export function bar(x, y, w, h, frac, color, { back = '#1b1320', edge = '#000', segments = 0, label } = {}) {
  ctx.fillStyle = edge;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, fw, Math.max(1, Math.floor(h / 3)));
  if (segments) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < segments; i++) ctx.fillRect(x + Math.round((w * i) / segments), y, 1, h);
  }
  if (label) text(label, x + 4, y + h / 2, { size: Math.min(14, h), baseline: 'middle' });
}

export function fade(alpha, color = '#000') {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Fit the whole of an image inside a rectangle (nothing cropped) and return where it went. With
// `backdrop`, the margins are filled with a dark, blurred copy of the same picture, cover-fitted,
// so a 3:2 painting on the 16:9 screen reads as one image rather than a boxed one. The blur is a
// small blurred copy, made once per image, so it costs nothing per frame.
const blurred = new WeakMap();
export function drawContain(img, x, y, w, h, alpha = 1, backdrop = true) {
  if (!img) return null;
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  const r = { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
  if (backdrop && (dw < w - 1 || dh < h - 1)) {
    let b = blurred.get(img);
    if (!b) {
      b = document.createElement('canvas'); b.width = 240; b.height = Math.max(1, Math.round(240 * img.height / img.width));
      const g = b.getContext('2d'); g.imageSmoothingEnabled = true; g.filter = 'blur(6px)';
      g.drawImage(img, -12, -12, b.width + 24, b.height + 24); // overscan: no dark rim from the blur
      blurred.set(img, b);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    drawCover(b, x, y, w, h, alpha * 0.45);
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(backdrop ? feathered(img, dw, dh, dw < w - 1, dh < h - 1) : img, r.x, r.y, r.w, r.h);
  ctx.restore();
  return r;
}
// A copy of the picture at about its shown size whose edges fade out over 36 px, so it melts into
// the blurred backdrop instead of ending in a hard line. Made once per image (and side set).
const soft = new WeakMap();
function feathered(img, dw, dh, sides, ends) {
  if (!sides && !ends) return img;
  const key = `${sides}${ends}`;
  let c = soft.get(img)?.[key];
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.round(dw); c.height = Math.round(dh);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out';
  const F = 36;
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  };
  if (sides) { edge(0, 0, F, 0, 0, 0, F, c.height); edge(c.width, 0, c.width - F, 0, c.width - F, 0, F, c.height); }
  if (ends) { edge(0, 0, 0, F, 0, 0, c.width, F); edge(0, c.height, 0, c.height - F, 0, c.height - F, c.width, F); }
  soft.set(img, { ...(soft.get(img) || {}), [key]: c });
  return c;
}

// Cover-fit an image into a rectangle (used for backgrounds and cutscene panels).
export function drawCover(img, x, y, w, h, alpha = 1) {
  if (!img) return;
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
