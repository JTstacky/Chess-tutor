// A tiny helper for scripted animations that can be skipped: tapping the board
// finishes every running animation at once and makes all pending waits return.

export class Timeline {
  skipped = false;
  private running = new Set<Animation>();
  private wakers = new Set<() => void>();

  /** Run a Web Animation that holds its end state. Resolves when it finishes (or is skipped). */
  anim(el: Element, frames: Keyframe[], opts: number | KeyframeAnimationOptions): Promise<void> {
    const o: KeyframeAnimationOptions = typeof opts === 'number' ? { duration: opts } : opts;
    const a = el.animate(frames, { fill: 'forwards', easing: 'ease-in-out', ...o });
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
