// A tiny helper for scripted animations that can be skipped: tapping the board
// finishes every running animation at once and makes all pending waits return.

/**
 * Keyframes made by a helper can carry their numbers (x, y, rotation, scale…) under this key,
 * plus a way to rebuild a keyframe from them. Paths through three or more such keyframes are
 * resampled along a smooth curve, so motion flows through each waypoint instead of changing
 * speed and direction with a jolt there (the old Flash "tween" look).
 */
export const CHANNELS = Symbol('channels');
export interface Channels {
  v: number[];
  build: (v: number[]) => Keyframe;
}
export type SmoothKeyframe = Keyframe & { [CHANNELS]?: Channels };

/** Tag a keyframe with the numbers it was built from. */
export function tagged(v: number[], build: (v: number[]) => Keyframe): SmoothKeyframe {
  return { ...build(v), [CHANNELS]: { v, build } };
}

// Snappier curves than the CSS keywords: quick to start, soft to settle.
const CURVES: Record<string, string> = {
  ease: 'cubic-bezier(0.33, 0, 0.2, 1)',
  'ease-in-out': 'cubic-bezier(0.62, 0, 0.32, 1)',
  'ease-out': 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  'ease-in': 'cubic-bezier(0.42, 0, 0.84, 0.36)',
};

/** Monotone cubic (Fritsch–Carlson) through the points: no overshoot, and flat at every peak. */
function monotone(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Resample a path of tagged keyframes along a smooth curve (or leave it as it is). */
export function smoothPath(frames: SmoothKeyframe[], duration: number): Keyframe[] {
  if (frames.length < 3) return frames;
  if (frames.some((f) => !f[CHANNELS] || f.easing !== undefined || f.composite !== undefined)) return frames;
  // Offsets as the browser would space them: missing ones spread evenly between known ones.
  const offs = frames.map((f) => (typeof f.offset === 'number' ? f.offset : null));
  offs[0] ??= 0;
  offs[offs.length - 1] ??= 1;
  for (let i = 1; i < offs.length - 1; i++) {
    if (offs[i] !== null) continue;
    let j = i;
    while (offs[j] === null) j++;
    const a = offs[i - 1]!;
    const b = offs[j]!;
    for (let k = i; k < j; k++) offs[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  const xs = offs as number[];
  for (let i = 1; i < xs.length; i++) if (!(xs[i] > xs[i - 1])) return frames; // a deliberate jump
  const build = frames[0][CHANNELS]!.build;
  const width = frames[0][CHANNELS]!.v.length;
  const curves = Array.from({ length: width }, (_, c) => monotone(xs, frames.map((f) => f[CHANNELS]!.v[c] ?? 0)));
  const n = Math.min(48, Math.max(10, Math.ceil(duration / 22), frames.length * 3));
  const out: Keyframe[] = [];
  for (let k = 0; k <= n; k++) {
    const x = k / n;
    out.push({ ...build(curves.map((f) => f(x))), offset: x });
  }
  return out;
}

export class Timeline {
  skipped = false;
  private running = new Set<Animation>();
  private wakers = new Set<() => void>();

  /** Run a Web Animation that holds its end state. Resolves when it finishes (or is skipped). */
  anim(el: Element, frames: Keyframe[], opts: number | KeyframeAnimationOptions): Promise<void> {
    const o: KeyframeAnimationOptions = { fill: 'forwards', easing: 'ease-in-out', ...(typeof opts === 'number' ? { duration: opts } : opts) };
    o.easing = CURVES[o.easing!] ?? o.easing;
    const a = el.animate(smoothPath(frames, Number(o.duration) || 0), o);
    this.running.add(a);
    if (this.skipped) this.end(a);
    return a.finished.then(
      () => void this.running.delete(a),
      () => void this.running.delete(a),
    );
  }

  wait(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  /** Run `fn` after `ms`, unless the timeline was skipped by then. */
  later(ms: number, fn: () => void) {
    void this.wait(ms).then(() => {
      if (!this.skipped) fn();
    });
  }

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.running.forEach((a) => this.end(a));
    [...this.wakers].forEach((w) => w());
  }

  private end(a: Animation) {
    try {
      a.finish();
    } catch {
      a.cancel(); // endless animations can't finish
    }
  }
}
