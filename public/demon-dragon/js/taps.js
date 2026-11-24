// Stray taps (the joystick area, the dialogue box around its buttons) move a plain line on or
// finish the typing, but never pick a choice: only a choice's own button, (A) or a gamepad does.
(function () {
  'use strict';
  // dlg: game.js's open dialogue state, or null.
  function strayTapAdvances(dlg) {
    if (!dlg || dlg.sheet || dlg.tapOnly) return false;
    return !!dlg.typing || !dlg.choices;
  }
  window.Taps = { strayTapAdvances };
})();
