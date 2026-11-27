// One small surface per control slot. Static paint (rounded frames, art, labels) is reused;
// reload bars and touch feedback still draw every frame. No simulation state is cached.
const slots = new Map();
export const controlCacheStats = { builds: 0, hits: 0, bytes: 0 };
export function drawCachedControl(g, lay, b, slot, state, paint) {
  const scale = lay.s * lay.dpr, pad = 5 * b.h / 60;
  const w = Math.ceil((b.w + pad * 2) * scale), h = Math.ceil((b.h + pad * 2) * scale);
  const key = `${scale}:${b.w}:${b.h}:${state}`;
  let entry = slots.get(slot);
  if (!entry) { entry = { canvas: document.createElement('canvas'), key: null }; slots.set(slot, entry); }
  if (entry.key !== key) {
    controlCacheStats.bytes -= entry.bytes || 0;
    entry.canvas.width = w; entry.canvas.height = h; entry.bytes = w * h * 4;
    controlCacheStats.bytes += entry.bytes;
    const c = entry.canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, (pad - b.x) * scale, (pad + b.y) * scale);
    paint(c); entry.key = key; controlCacheStats.builds++;
  } else controlCacheStats.hits++;
  g.drawImage(entry.canvas, b.x - pad, -b.y - pad, w / scale, h / scale);
}
