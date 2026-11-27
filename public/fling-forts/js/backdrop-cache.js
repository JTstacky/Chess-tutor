// One opaque, screen-sized surface. The painted background is static until layout or its images change.
export function createBackdropCache(makeCanvas) {
  let canvas, key, background, ground;
  const stats = { bytes: 0, builds: 0, hits: 0 };
  return { stats, get(lay, bg, gd, paint) {
    const next = [lay.w, lay.h, lay.dpr, lay.s, lay.gy, lay.ox].join(':');
    if (canvas && key === next && background === bg && ground === gd) { stats.hits++; return canvas; }
    if (!canvas) canvas = makeCanvas();
    canvas.width = Math.round(lay.w * lay.dpr); canvas.height = Math.round(lay.h * lay.dpr);
    paint(canvas.getContext('2d', { alpha: false }));
    key = next; background = bg; ground = gd;
    stats.bytes = canvas.width * canvas.height * 4; stats.builds++; return canvas;
  } };
}
const cache = createBackdropCache(() => document.createElement('canvas'));
export const backdropCacheStats = cache.stats;
export function drawCachedBackdrop(g, lay, bg, gd, paint) {
  const canvas = cache.get(lay, bg, gd, paint);
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, 0, 0);
}
