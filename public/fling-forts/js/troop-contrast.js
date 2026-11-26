// A16: flat cartoon ink, cached once per decoded pose; no frame-time filters or extra downloads.
export const CONTRAST_KINDS = new Set([
  'fantasy_archer', 'fantasy_dancer', 'aliens_trooper', 'robots_laser',
  'monsters_bats', 'undead_ghost', 'pirates_parrots', 'elementals_gale', 'beastfolk_shaman', 'steampunk_gyro',
]);
const CACHE = new WeakMap();
export const contrastStats = { builds: 0, pixels: 0 };
export function prepareTroopContrast(im) {
  let frame = CACHE.get(im); if (frame) return frame;
  // A fixed 128-pixel working height preserves interior paint while capping cache memory.
  const h = 128, w = Math.max(1, Math.round(h * im.width / im.height)), pad = 5;
  const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
  const m = mask.getContext('2d'); m.drawImage(im, 0, 0, w, h);
  m.globalCompositeOperation = 'source-in'; m.fillStyle = '#fff'; m.fillRect(0, 0, w, h);
  const canvas = document.createElement('canvas'); canvas.width = w + pad * 2; canvas.height = h + pad * 2;
  const g = canvas.getContext('2d');
  // A narrow warm outer edge separates dark silhouettes from grass; brown ink stays dominant.
  for (const [r, colour] of [[3, '#f4dfad'], [1.8, '#302419']]) {
    const layer = document.createElement('canvas'); layer.width = canvas.width; layer.height = canvas.height;
    const c = layer.getContext('2d');
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.drawImage(mask, pad + Math.cos(a) * r, pad + Math.sin(a) * r); }
    c.globalCompositeOperation = 'source-in'; c.fillStyle = colour; c.fillRect(0, 0, layer.width, layer.height);
    g.drawImage(layer, 0, 0);
  }
  g.drawImage(im, pad, pad, w, h);
  frame = { canvas, pad, w, h }; CACHE.set(im, frame);
  contrastStats.builds++; contrastStats.pixels += canvas.width * canvas.height;
  return frame;
}
export function drawTroopContrast(g, im, w, h, anchorY) {
  const f = prepareTroopContrast(im), px = f.pad * w / f.w, py = f.pad * h / f.h;
  g.drawImage(f.canvas, -w / 2 - px, -h * anchorY - py, w + px * 2, h + py * 2);
}

// Rotor animation keeps its original normalized cut regions and fractional blade blend.
// A same-bounds source lets it sample the outlined paint without moving any rotor geometry.
export function rotorContrastSource(im) {
  const f = prepareTroopContrast(im);
  if (!f.rotor) {
    f.rotor = document.createElement('canvas'); f.rotor.width = f.w; f.rotor.height = f.h;
    f.rotor.getContext('2d').drawImage(f.canvas, -f.pad, -f.pad);
    contrastStats.pixels += f.w * f.h;
  }
  return f.rotor;
}
