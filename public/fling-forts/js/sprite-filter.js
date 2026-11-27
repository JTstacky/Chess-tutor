// Apply colour filters on sprite-sized surfaces. Canvas filters on the full game target can
// allocate a viewport-sized intermediate for every hurt troop in a crowded battle.
// Bounded LRU: continuous hit brightness must never create an unbounded pose cache.
export const FILTER_BYTES = 16 * 1024 * 1024;
export function createSpriteFilterCache(makeCanvas, budget = FILTER_BYTES) {
  const ids = new WeakMap(), entries = new Map(); let nextId = 0, bytes = 0;
  const stats = { builds: 0, hits: 0, bytes: 0, entries: 0 };
  return {
    stats,
    get(source, filter, pixelHeight = Infinity) {
      if (!filter || filter === 'none') return source;
      if (!ids.has(source)) ids.set(source, ++nextId);
      const scale = Math.min(1, 384 / Math.max(source.width, source.height), pixelHeight / source.height);
      const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale)), size = w * h * 4;
      const key = `${ids.get(source)}:${w}:${h}:${filter}`;
      if (entries.has(key)) { const e = entries.get(key); entries.delete(key); entries.set(key, e); stats.hits++; return e.canvas; }
      while (entries.size && bytes + size > budget) {
        const first = entries.keys().next().value, old = entries.get(first);
        entries.delete(first); bytes -= old.size;
        old.canvas.width = old.canvas.height = 0;
      }
      const canvas = makeCanvas(w, h), g = canvas.getContext('2d');
      g.filter = filter; g.drawImage(source, 0, 0, w, h);
      entries.set(key, { canvas, size }); bytes += size;
      stats.builds++; stats.bytes = bytes; stats.entries = entries.size;
      return canvas;
    },
  };
}
const cache = createSpriteFilterCache((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
export const filterStats = cache.stats;
export const filteredSprite = (source, filter, pixelHeight) => cache.get(source, filter, pixelHeight);
