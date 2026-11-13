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
  ["Keyboard", null, null, null],
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
// VCMI shows right-click info popups only while the right button is held, so a long press holds
// the right button down until the finger lifts.
function rightDown(canvas, x, y) {
  const common = { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y };
  canvas.dispatchEvent(new MouseEvent("mousemove", { ...common, buttons: 0 }));
  canvas.dispatchEvent(new MouseEvent("mousedown", { ...common, buttons: 2 }));
}
function rightUp(canvas, x, y) {
  const common = { bubbles: true, cancelable: true, button: 2, buttons: 0, clientX: x, clientY: y };
  canvas.dispatchEvent(new MouseEvent("mouseup", common));
  canvas.dispatchEvent(new MouseEvent("contextmenu", common));
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
// The game draws its own text fields on the canvas, which never brings up a phone's on-screen keyboard.
// The Keyboard button focuses a hidden text box instead and passes what is typed on to the game as the
// key presses SDL reads (keypress for letters, Backspace and Enter as keys). Android keyboards report
// most keys as keyCode 229 and only say what changed through input events, hence the translation.
const SENTINEL = " ";
function sendChar(canvas, ch) {
  const code = ch.charCodeAt(0);
  const event = new KeyboardEvent("keypress", { key: ch, bubbles: true, cancelable: true });
  Object.defineProperties(event, { charCode: { get: () => code }, keyCode: { get: () => code }, which: { get: () => code } });
  canvas.dispatchEvent(event);
}
export function setupTextSink(canvas, sink) {
  let nativeKey = false;
  sink.value = SENTINEL;
  // A key with a real key code (a hardware keyboard) also reaches SDL by itself.
  sink.addEventListener("keydown", (e) => { nativeKey = e.keyCode !== 229 && !e.isComposing; });
  sink.addEventListener("input", (e) => {
    if (nativeKey) nativeKey = false;
    else if (e.inputType === "deleteContentBackward") sendKey(canvas, "Backspace", "Backspace", 8);
    else if (e.inputType === "insertLineBreak") sendKey(canvas, "Enter", "Enter", 13);
    else for (const ch of e.data ?? "") sendChar(canvas, ch);
    sink.value = SENTINEL;
  });
}
export function setupTouch(canvas, { getAudio = () => null } = {}) {
  const bar = document.getElementById("touch-bar"),
    toggle = document.getElementById("controls-toggle");
  const game = document.getElementById("game");
  const sink = document.createElement("input");
  Object.assign(sink, { type: "text", id: "text-sink", autocomplete: "off", spellcheck: false, enterKeyHint: "done" });
  sink.setAttribute("autocapitalize", "off");
  sink.setAttribute("aria-label", "Type in the game");
  game.append(sink);
  setupTextSink(canvas, sink);
  let rightNext = false,
    timer,
    start,
    activePointer = null,
    multiTouch = false,
    longPressed = false,
    rightHeld = false,
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
      } else if (label === "Keyboard") {
        // Keep focus on the hidden box so the on-screen keyboard stays up while typing.
        if (document.activeElement === sink) sink.blur();
        else { sink.focus(); return; }
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
    // Keep the Sound label true to the real state (sound starts by itself on the first tap).
    if (label === "Sound on") setInterval(() => {
      const audio = getAudio();
      if (!audio || button.disabled) return;
      const running = audio.state === "running";
      if (running === soundOn) return;
      soundOn = running;
      button.textContent = soundOn ? "Sound off" : "Sound on";
      button.setAttribute("aria-label", button.textContent);
    }, 1000);
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
  const pointers = new Set();
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" || !e.isTrusted) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        // A second finger cancels the first gesture. Never turn its release into
        // a tap on an unrelated battle target, and release any held SDL button.
        multiTouch = true;
        clearTimeout(timer);
        if (rightHeld) rightUp(canvas, start.x, start.y);
        else if (dragging) leftEvent(canvas, "mouseup", e.clientX, e.clientY);
        rightHeld = dragging = false;
        start = activePointer = null;
        suppressUntil = performance.now() + 700;
        return;
      }
      if (multiTouch) return;
      activePointer = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      longPressed = false;
      dragging = false;
      clearTimeout(timer);
      if (rightNext) {
        // Right-click mode: this touch is a held right button.
        longPressed = rightHeld = true;
        rightDown(canvas, start.x, start.y);
        return;
      }
      timer = setTimeout(() => {
        longPressed = rightHeld = true;
        rightDown(canvas, start.x, start.y);
      }, 500);
    },
    true,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!start || multiTouch || e.pointerId !== activePointer || e.pointerType === "mouse" || !e.isTrusted) return;
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
        if (!pointers.has(e.pointerId) || e.pointerType === "mouse" || !e.isTrusted) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        pointers.delete(e.pointerId);
        clearTimeout(timer);
        suppressUntil = performance.now() + 700;
        if (multiTouch) {
          if (!pointers.size) multiTouch = false;
          return;
        }
        if (!start || e.pointerId !== activePointer) return;
        if (rightHeld) {
          rightUp(canvas, start.x, start.y);
          rightHeld = false;
          if (rightNext) {
            rightNext = false;
            document
              .getElementById("right-click-mode")
              .setAttribute("aria-pressed", "false");
          }
        } else if (dragging) leftEvent(canvas, "mouseup", e.clientX, e.clientY);
        else if (type === "pointerup" && !longPressed) {
          leftEvent(canvas, "mousedown", e.clientX, e.clientY);
          leftEvent(canvas, "mouseup", e.clientX, e.clientY);
          leftEvent(canvas, "click", e.clientX, e.clientY);
        }
        start = activePointer = null;
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
