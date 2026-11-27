// A charging badge changes tint every frame. Repaint its small surface in place rather than
// filling a pose-history LRU with thousands of colours that will never be used again.
export function createLiveFilterCache(makeCanvas, maxSlots = 4) {
  const slots = new Map(), stats = { bytes: 0, builds: 0, hits: 0, entries: 0 };
  return { stats, get(slot, source, filter, pixelHeight = Infinity) {
    if (!filter || filter === 'none') return source;
    const scale = Math.min(1, 384 / Math.max(source.width, source.height), pixelHeight / source.height);
    const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    let entry = slots.get(slot);
    if (!entry) {
      if (slots.size >= maxSlots) { const first = slots.keys().next().value, old = slots.get(first); slots.delete(first); stats.bytes -= old.bytes; old.canvas.width = old.canvas.height = 0; }
      entry = { canvas: makeCanvas(), bytes: 0 }; slots.set(slot, entry); stats.entries = slots.size;
    }
    slots.delete(slot); slots.set(slot, entry);
    if (entry.source === source && entry.filter === filter && entry.w === w && entry.h === h) { stats.hits++; return entry.canvas; }
    if (entry.w !== w || entry.h !== h) {
      stats.bytes -= entry.bytes; entry.canvas.width = w; entry.canvas.height = h;
      entry.bytes = w * h * 4; stats.bytes += entry.bytes;
    }
    const g = entry.canvas.getContext('2d'); g.clearRect(0, 0, w, h); g.filter = filter; g.drawImage(source, 0, 0, w, h);
    Object.assign(entry, { source, filter, w, h }); stats.builds++; return entry.canvas;
  } };
}
const cache = createLiveFilterCache(() => document.createElement('canvas'));
export const liveFilterStats = cache.stats;
export const liveFilteredSprite = (...args) => cache.get(...args);
