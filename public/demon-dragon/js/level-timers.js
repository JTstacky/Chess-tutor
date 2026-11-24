// Timers owned by one level; stage removal cancels callbacks into disposed models.
(function () {
  'use strict';
  function create(clock = window) {
    const laterIds = new Set();
    const repeatIds = new Set();
    let active = true;
    return {
      later(fn, ms) {
        if (!active) return null;
        const id = clock.setTimeout(() => { laterIds.delete(id); if (active) fn(); }, ms);
        laterIds.add(id);
        return id;
      },
      repeat(fn, ms) {
        if (!active) return null;
        const id = clock.setInterval(() => { if (active) fn(); }, ms);
        repeatIds.add(id);
        return id;
      },
      stopRepeat(id) { clock.clearInterval(id); repeatIds.delete(id); },
      cancel() {
        active = false;
        for (const id of laterIds) clock.clearTimeout(id);
        for (const id of repeatIds) clock.clearInterval(id);
        laterIds.clear(); repeatIds.clear();
      },
    };
  }
  window.LevelTimers = { create };
})();
