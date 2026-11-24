// Sample every action button once so simultaneous presses do not spill into later frames.
(function () {
  'use strict';
  const ACTIONS = [0, 1, 2, 3, 4, 5, 9, 12, 13, 14, 15];
  function sample(buttons, previous) {
    const edges = {};
    for (const i of ACTIONS) {
      const down = !!buttons[i]?.pressed;
      edges[i] = down && !previous[i];
      previous[i] = down;
    }
    return edges;
  }
  window.PadEdges = { sample };
})();
