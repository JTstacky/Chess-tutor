// Input: keyboard (two layouts), gamepads and touch, mapped onto per-player action
// frames. The simulation only ever sees `InputFrame`s, which is also what the
// network sends, so local, couch and online players are all driven the same way.

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'magic', 'menu', 'pause', 'confirm', 'cancel'];

// Solo play accepts both layouts on player 1. In couch co-op layout A is player 1
// and layout B is player 2. The original's keys: arrows move, Up jumps (and climbs,
// opens doors, rides lifts), Down crouches, Space swings the sword, Alt casts; Up/Down +
// Space give the overhead swing and the downward stab. W/S work the same as Up/Down.
const LAYOUT_A = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Space: 'attack', KeyJ: 'attack', KeyK: 'magic', KeyL: 'jump', KeyI: 'menu', Tab: 'menu',
  Escape: 'pause', KeyP: 'pause',
};
const LAYOUT_B = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  AltLeft: 'magic', AltRight: 'magic', ControlRight: 'attack',
  KeyZ: 'jump', KeyX: 'attack', KeyC: 'magic', Enter: 'menu', ShiftRight: 'jump',
  Comma: 'jump', Period: 'attack', Slash: 'magic', Backspace: 'pause',
};
// Menu navigation keys (any layout) — confirm/cancel are separate from game actions.
const MENU_KEYS = { Enter: 'confirm', Space: 'confirm', KeyZ: 'confirm', KeyJ: 'confirm', Escape: 'cancel', KeyX: 'cancel', KeyK: 'cancel', Backspace: 'cancel' };

export function emptyFrame() {
  const f = {};
  for (const a of ACTIONS) f[a] = false;
  return f;
}

export class InputState {
  constructor() {
    this.held = emptyFrame();
    this.prev = emptyFrame();
  }
  set(frame) { for (const a of ACTIONS) this.held[a] = !!frame[a]; }
  pressed(a) { return this.held[a] && !this.prev[a]; }
  released(a) { return !this.held[a] && this.prev[a]; }
  down(a) { return this.held[a]; }
  endFrame() { for (const a of ACTIONS) this.prev[a] = this.held[a]; }
}

class Input {
  constructor() {
    this.keys = new Set();
    this.taps = new Set();
    this.couch = false; // couch co-op: split keyboard layouts between P1 and P2
    this.touchFrame = emptyFrame();
    this.anyKeyListeners = [];
    this.lastDevice = 'keyboard';
    this.textCapture = null; // when set, printable keys are routed here (name entry, room codes)
    window.addEventListener('keydown', (e) => {
      if (this.textCapture) {
        this.textCapture(e);
        // Keys the prompt used are not game keys too: an Enter that submits a name must not
        // also confirm the menu that opens next frame.
        if (e.key.length === 1 || ['Backspace', 'Enter', 'NumpadEnter', 'Escape'].includes(e.code)) { e.preventDefault(); return; }
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'AltLeft', 'AltRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const l of this.anyKeyListeners) l(e);
      if (e.code === 'KeyM' && !e.repeat) this.mapAt = performance.now(); // the minimap's key
      this.keys.add(e.code);
      this.taps.add(e.code); // latched until the next frame so quick taps are never lost
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); // don't focus the browser menu
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  gamepads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return pads;
  }

  padFrame(pad) {
    const f = emptyFrame();
    const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    f.left = b(14) || ax < -0.4;
    f.right = b(15) || ax > 0.4;
    f.up = b(12) || ay < -0.5;
    f.down = b(13) || ay > 0.5;
    f.jump = b(0);
    f.attack = b(2) || b(7);
    f.magic = b(1) || b(6);
    f.menu = b(3) || b(8);
    f.pause = b(9);
    f.confirm = b(0);
    f.cancel = b(1);
    if (Object.values(f).some(Boolean)) this.lastDevice = 'gamepad';
    return f;
  }

  // Call once per simulation step after all frames were read.
  flushTaps() { this.taps.clear(); this.tapConfirm = false; }

  keyboardFrame(layouts) {
    const f = emptyFrame();
    for (const code of new Set([...this.keys, ...this.taps])) {
      for (const layout of layouts) {
        const a = layout[code];
        if (a) f[a] = true;
      }
    }
    return f;
  }

  menuFrame() {
    // Navigation for menus: arrows/WASD plus confirm/cancel from every device.
    const f = this.keyboardFrame([LAYOUT_A, LAYOUT_B]);
    // In menus Enter is "confirm", not P2's "items" key (that closed screens and maxed amounts).
    if (this.keys.has('Enter') || this.taps.has('Enter')) f.menu = false;
    for (const code of new Set([...this.keys, ...this.taps])) { const a = MENU_KEYS[code]; if (a) f[a] = true; }
    for (const pad of this.gamepads()) {
      const p = this.padFrame(pad);
      for (const k in p) f[k] = f[k] || p[k];
    }
    for (const k in this.touchFrame) f[k] = f[k] || this.touchFrame[k];
    if (this.tapConfirm) f.confirm = true; // a tap on the picture (touch screens)
    return f;
  }

  // Frame for local player `slot` (0-based among local players).
  frameFor(slot, localCount) {
    let f;
    if (!this.couch || localCount <= 1) {
      f = slot === 0 ? this.keyboardFrame([LAYOUT_A, LAYOUT_B]) : emptyFrame();
    } else {
      f = slot === 0 ? this.keyboardFrame([LAYOUT_A]) : slot === 1 ? this.keyboardFrame([LAYOUT_B]) : emptyFrame();
    }
    // Gamepads: in solo, any pad drives P1; in couch mode pad N drives the player after the keyboard ones.
    const pads = this.gamepads();
    if (!this.couch || localCount <= 1) {
      if (slot === 0) for (const pad of pads) merge(f, this.padFrame(pad));
    } else {
      const kbPlayers = 2;
      const padIndex = slot - kbPlayers;
      if (padIndex >= 0 && pads[padIndex]) merge(f, this.padFrame(pads[padIndex]));
      // Pads can also double for keyboard players when there are exactly as many pads as players.
      if (pads.length >= localCount && pads[slot]) merge(f, this.padFrame(pads[slot]));
    }
    if (slot === 0) merge(f, this.touchFrame);
    return f;
  }
}

function merge(into, from) { for (const k in from) into[k] = into[k] || from[k]; }

export const input = new Input();
// Touch controls live in ui/touch.js.
