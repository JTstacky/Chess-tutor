// Pixel density changes only rendering resolution, never the CSS layout, touch map or simulation.
// Budget 4.2 M pixels (owner 2026-11-27: 2 M looked blurry): ordinary tablets (1280x800 at 2x), phones and desktop
// monitors up to 2560x1440 draw one canvas pixel per screen pixel; only bigger retina panels are capped, and the
// adaptive budget below still lowers resolution on devices that cannot keep up.
export const PIXEL_BUDGET = 4_200_000;
export function renderDpr(w, h, deviceDpr = 1, memory = 8, quality = 1) {
  const cap = memory <= 2 ? 1 : memory <= 4 ? 2 : 3;          // 3x phones draw at full sharpness when memory allows
  return Math.max(.5, Math.min(deviceDpr, cap, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))) * quality);
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
