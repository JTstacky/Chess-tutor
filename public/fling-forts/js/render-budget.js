// Pixel density changes only rendering resolution, never the CSS layout, touch map or simulation.
export function renderDpr(w, h, deviceDpr = 1, memory = 8, quality = 1) {
  const cap = memory <= 2 ? 1 : 2;
  return Math.max(.5, Math.min(deviceDpr, cap, Math.sqrt(2_000_000 / Math.max(1, w * h))) * quality);
}
export function createRenderBudget() {
  let elapsed = 0, frames = 0, slow = 0, quality = 1, warmup = 2000;
  return {
    get quality() { return quality; },
    sample(ms, active = true) {
      if (!active || ms <= 0 || ms > 500) { elapsed = frames = slow = 0; return false; }
      if (warmup > 0) { warmup -= ms; return false; }
      elapsed += ms; frames++; if (ms > 28) slow++;
      if (elapsed < 1500 || frames < 8) return false;
      const reduce = slow / frames > .35 && quality > .5;
      elapsed = frames = slow = 0;
      if (reduce) quality = Math.max(.5, quality - .125);
      return reduce;
    },
  };
}
