// Lines are written for the touch buttons. With a mouse and keyboard they name the keys instead.
(function () {
  'use strict';
  function forKeys(text) {
    return text
      .replace(/the joystick/g, 'the arrow keys or WASD')
      .replace(/top button \(or Q\)|top button or Q/g, 'Q key')
      .replace(/The top button/g, 'Q')
      .replace(/\(A\)/g, '(Z)')
      .replace(/\(B\)/g, '(X)');
  }
  window.Prompts = { forKeys };
})();
