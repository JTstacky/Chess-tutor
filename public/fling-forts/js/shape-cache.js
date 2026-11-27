// Repeated small vector shapes must not run colour filters on the full scene target.
// Paint the same paths/filter on small surfaces; retain subpixel health changes to 1/8 display pixel.
export function createShapeCache(makeCanvas, budget = 4 * 1024 ** 2) {
  const entries = new Map(), stats = { bytes: 0, builds: 0, hits: 0 };
  return { stats, get(key, w, h, scale, filter, paint) {
    const width = Math.ceil(w * scale), height = Math.ceil(h * scale), bytes = width * height * 4;
    key = `${key}:${width}:${height}:${scale}:${filter}`;
    if (entries.has(key)) { const entry = entries.get(key); entries.delete(key); entries.set(key, entry); stats.hits++; return entry; }
    while (entries.size && stats.bytes + bytes > budget) {
      const first = entries.keys().next().value, old = entries.get(first); entries.delete(first);
      stats.bytes -= old.bytes; old.canvas.width = old.canvas.height = 0;
    }
    const canvas = makeCanvas(width, height), c = canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0); c.filter = filter; paint(c);
    const entry = { canvas, bytes, w: width / scale, h: height / scale };
    if (bytes <= budget) { entries.set(key, entry); stats.bytes += bytes; }
    stats.builds++; return entry;
  } };
}
const cache = createShapeCache((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
export const shapeCacheStats = cache.stats;
const resolution = scale => Math.min(4, Math.max(.5, Math.ceil(scale * 2 * 4) / 4));
function paintCached(g, key, x, y, w, h, scale, paint) {
  const filter = g.filter, entry = cache.get(key, w, h, resolution(scale), filter, paint);
  if (filter !== 'none') g.filter = 'none';
  g.drawImage(entry.canvas, x, y, entry.w, entry.h);
  if (filter !== 'none') g.filter = filter;
}
export function drawGroundMarker(g, x, y, r, air, col, scale) {
  const rx = r * (air ? .9 : 1.15), ry = r * (air ? .24 : .34), pad = 2;
  paintCached(g, `ground:${r}:${air}:${col.main}:${col.dark}`, x - rx - pad, y - ry - pad, (rx + pad) * 2, (ry + pad) * 2, scale, c => {
    c.beginPath(); c.ellipse(rx + pad, ry + pad, rx, ry, 0, 0, 7); c.fillStyle = col.main;
    c.globalAlpha = air ? .35 : .8; c.fill();
    if (!air) { c.lineWidth = 2; c.strokeStyle = col.dark; c.stroke(); }
  });
}
export function drawVictoryMarker(g, x, y, r, air, col, scale) {
  const rx=r*1.1, ry=r*.3, pad=2;
  paintCached(g, `victory:${r}:${air}:${col}`, x-rx-pad, y-ry-pad, (rx+pad)*2, (ry+pad)*2, scale, c=>{
    c.beginPath();c.ellipse(rx+pad,ry+pad,rx,ry,0,0,7);c.fillStyle=col;c.globalAlpha=air?.35:.8;c.fill();
  });
}
export function drawAirMarker(g, x, y, col, scale) {
  if (g.filter === 'none') {
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); return;
  }
  paintCached(g, `air-marker:${col}`, x - 7, y - 7, 14, 14, scale, c => {
    c.beginPath(); c.arc(7, 7, 5, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
  });
}
export function drawHealthBar(g, x, y, w, h, frac, col, back, scale) {
  if (g.globalAlpha !== 1 || g.globalCompositeOperation !== 'source-over') {
    g.beginPath(); g.roundRect(x - w / 2, -y - h, w, h, h / 2); g.fillStyle = back; g.fill();
    if (frac > 0) { g.beginPath(); g.roundRect(x - w / 2 + 1.5, -y - h + 1.5, Math.max(h - 3, (w - 3) * Math.min(1, frac)), h - 3, (h - 3) / 2); g.fillStyle = col; g.fill(); } return;
  }
  const res = resolution(scale), fw = frac > 0 ? Math.round(Math.max(h - 3, (w - 3) * Math.min(1, frac)) * res * 4) / (res * 4) : 0;
  paintCached(g, `bar:${w}:${h}:${fw}:${col}:${back}`, x - w / 2 - 1, -y - h - 1, w + 2, h + 2, scale, c => {
    c.beginPath(); c.roundRect(1, 1, w, h, h / 2); c.fillStyle = back; c.fill();
    if (fw > 0) { c.beginPath(); c.roundRect(2.5, 2.5, fw, h - 3, (h - 3) / 2); c.fillStyle = col; c.fill(); }
  });
}
