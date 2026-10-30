const buttons = [
  ["End turn", "e", "KeyE", 69],
  ["Next hero", "h", "KeyH", 72],
  ["Spellbook", "c", "KeyC", 67],
  ["Kingdom", "k", "KeyK", 75],
  ["Save", "s", "KeyS", 83],
  ["Load", "l", "KeyL", 76],
  ["Options", "o", "KeyO", 79],
  ["Right-click", null, null, null],
  ["Zoom in", "+", "NumpadAdd", 107],
  ["Zoom out", "-", "NumpadSubtract", 109],
  ["Fit", null, null, null],
  ["Fullscreen", null, null, null],
  ["Sound on", null, null, null],
];
function sendKey(canvas, key, code, keyCode) {
  for (const type of ["keydown", "keyup"]) {
    const event = new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(event, {
      keyCode: { get: () => keyCode },
      which: { get: () => keyCode },
    });
    canvas.dispatchEvent(event);
  }
}
function rightClick(canvas, x, y) {
  const common = {
    bubbles: true,
    cancelable: true,
    button: 2,
    buttons: 2,
    clientX: x,
    clientY: y,
  };
  canvas.dispatchEvent(new MouseEvent("mousemove", { ...common, buttons: 0 }));
  for (const type of ["mousedown", "mouseup", "contextmenu"]) {
    const event = new MouseEvent(type, {
      ...common,
      buttons: type === "mousedown" ? 2 : 0,
    });
    canvas.dispatchEvent(event);
  }
}
function leftEvent(canvas, type, x, y) {
  if (type === "mousedown")
    canvas.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true, cancelable: true, button: 0, buttons: 0,
      clientX: x, clientY: y,
    }));
  canvas.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX: x,
      clientY: y,
    }),
  );
}
export function setupTouch(canvas, { getAudio = () => null } = {}) {
  const bar = document.getElementById("touch-bar"),
    toggle = document.getElementById("controls-toggle");
  const game = document.getElementById("game");
  let rightNext = false,
    timer,
    start,
    longPressed = false,
    dragging = false,
    soundOn = false;
  for (const [label, key, code, keyCode] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label === "Fit" ? "Actual size" : label;
    button.setAttribute("aria-label", button.textContent);
    if (label === "Right-click") button.id = "right-click-mode";
    button.addEventListener("click", async () => {
      if (key) sendKey(canvas, key, code, keyCode);
      else if (label === "Right-click") {
        rightNext = !rightNext;
        button.setAttribute("aria-pressed", String(rightNext));
      } else if (label === "Fit") {
        game.style.setProperty("--actual-width", `${canvas.width}px`);
        game.style.setProperty("--actual-height", `${canvas.height}px`);
        const actual = game.classList.toggle("actual-size");
        button.textContent = actual ? "Fit" : "Actual size";
        button.setAttribute("aria-label", button.textContent);
      } else if (label === "Fullscreen") {
        const el = document.getElementById("game");
        if (!document.fullscreenElement) await el.requestFullscreen?.();
        else await document.exitFullscreen?.();
      } else if (label === "Sound on") {
        // Go by the context's real state: SDL also resumes it on the first tap.
        const audio = getAudio();
        if (audio) {
          if (audio.state === "running") await audio.suspend?.();
          else await audio.resume?.();
          soundOn = audio.state === "running";
          button.textContent = soundOn ? "Sound off" : "Sound on";
          button.setAttribute("aria-label", button.textContent);
        }
      }
      canvas.focus();
    });
    bar.append(button);
  }
  toggle.addEventListener("click", () => {
    const shown = bar.classList.toggle("shown");
    toggle.setAttribute(
      "aria-label",
      shown ? "Hide game controls" : "Show game controls",
    );
  });
  // SDL also listens to touch events. Pointer gestures below are the sole input path.
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    canvas.addEventListener(
      type,
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  }
  let suppressUntil = 0;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" || !e.isTrusted) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      start = { x: e.clientX, y: e.clientY };
      longPressed = false;
      dragging = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        longPressed = true;
        rightClick(canvas, start.x, start.y);
      }, 500);
    },
    true,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!start || e.pointerType === "mouse" || !e.isTrusted) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
        clearTimeout(timer);
        if (!dragging && !longPressed && !rightNext) {
          dragging = true;
          leftEvent(canvas, "mousedown", start.x, start.y);
        }
        if (dragging) leftEvent(canvas, "mousemove", e.clientX, e.clientY);
      }
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"])
    canvas.addEventListener(
      type,
      (e) => {
        if (!start || e.pointerType === "mouse" || !e.isTrusted) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        clearTimeout(timer);
        suppressUntil = performance.now() + 700;
        if (type === "pointerup" && rightNext && !longPressed) {
          rightClick(canvas, e.clientX, e.clientY);
          rightNext = false;
          document
            .getElementById("right-click-mode")
            .setAttribute("aria-pressed", "false");
          longPressed = true;
        } else if (dragging) leftEvent(canvas, "mouseup", e.clientX, e.clientY);
        else if (type === "pointerup" && !longPressed) {
          leftEvent(canvas, "mousedown", e.clientX, e.clientY);
          leftEvent(canvas, "mouseup", e.clientX, e.clientY);
          leftEvent(canvas, "click", e.clientX, e.clientY);
        }
        start = null;
      },
      true,
    );
  // Capture suppresses the compatibility left click after a long press or right-click-mode tap.
  for (const type of ["mousedown", "mouseup", "click"])
    canvas.addEventListener(
      type,
      (e) => {
        if (e.isTrusted && performance.now() < suppressUntil) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
}
