// Keyboard -> engine commands. The 31 configurable keys are the original's (Prefs, DLOG 4001):
// slot i of the dialog is the command PREF_SLOTS[i] and holds a key number in the game's own encoding,
// the one FUN_10067290 tests against the KeyMap: n -> word n >> 4, bit n & 15 of the big-endian
// 16-bit words, i.e. Mac virtual key code (n & 8 ? 0 : 8) + 16 * (n >> 4) + (n & 7). STR# 129 names
// key n at index n + 1. Defaults are FUN_1005ccf0's table, read into dialog order by FUN_10063a0c.
// Jettison, Eject and Destruct also need Command (the ⌘ marks on PICT 132; l.21623 tests key 0x3f).
// Touch/gamepad layers feed the same held/pressed sets.
import { CMD } from '../engine/input.js';

export const PREF_SLOTS = [
  CMD.ACCELERATE, CMD.REVERSE, CMD.RIGHT, CMD.LEFT, CMD.AFTERBURNER, CMD.AUTOPILOT, CMD.HYPER_MODE, CMD.HYPER_SELECT, CMD.JUMP, CMD.NAV_OFF,
  CMD.RETARGET, CMD.RECALL, CMD.HOLD,
  CMD.FIRE_PRIMARY, CMD.FIRE_SECONDARY, CMD.SELECT_SECONDARY, CMD.WEAPON_SAFETY, CMD.TARGET_SELECT, CMD.CLOSEST_TARGET,
  CMD.PAUSE, CMD.ACKNOWLEDGE, CMD.COMMUNICATE, CMD.LAND, CMD.JETTISON, CMD.BOARD, CMD.EJECT, CMD.DESTRUCT, CMD.MAP,
  CMD.PLAYER_INFO, CMD.MISSION_INFO, CMD.CLOAK,
];
export const COMMAND_SLOTS = new Set([23, 25, 26]);
// FUN_1005ccf0 via FUN_10063a0c: Up, Down, Right, Left, Z, A, H, \, J, ~, F, C, V, Space, Shift, W, S,
// Tab, R, Escape, Return, Y, L, K, B, E, D, M, P, I, U.
export const DEFAULT_KEYS = [0x76, 0x75, 0x74, 0x73, 0x0e, 0x08, 0x0c, 0x22, 0x2e, 0x3a, 0x0b, 0x00, 0x01, 0x39, 0x30, 0x05, 0x09,
  0x38, 0x07, 0x3d, 0x2c, 0x18, 0x2d, 0x20, 0x03, 0x06, 0x0a, 0x26, 0x2b, 0x2a, 0x28];

// Mac virtual key code -> KeyboardEvent.code (US layout).
const MAC = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyH', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'IntlBackslash', 'KeyB', 'KeyQ', 'KeyW', 'KeyE', 'KeyR',
  'KeyY', 'KeyT', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit6', 'Digit5', 'Equal', 'Digit9', 'Digit7', 'Minus', 'Digit8', 'Digit0', 'BracketRight', 'KeyO',
  'KeyU', 'BracketLeft', 'KeyI', 'KeyP', 'Enter', 'KeyL', 'KeyJ', 'Quote', 'KeyK', 'Semicolon', 'Backslash', 'Comma', 'Slash', 'KeyN', 'KeyM', 'Period',
  'Tab', 'Space', 'Backquote', 'Backspace', null, 'Escape', 'MetaRight', 'MetaLeft', 'ShiftLeft', 'CapsLock', 'AltLeft', 'ControlLeft', 'ShiftRight', 'AltRight', 'ControlRight', 'Fn',
  'F17', 'NumpadDecimal', null, 'NumpadMultiply', null, 'NumpadAdd', null, 'NumLock', null, null, null, 'NumpadDivide', 'NumpadEnter', null, 'NumpadSubtract', 'F18',
  'F19', 'NumpadEqual', 'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', null, 'Numpad8', 'Numpad9', null, null, null,
  'F5', 'F6', 'F7', 'F3', 'F8', 'F9', null, 'F11', null, 'F13', 'F16', 'F14', null, 'F10', null, 'F12',
  null, 'F15', 'Insert', 'Home', 'PageUp', 'Delete', 'F4', 'End', 'F2', 'PageDown', 'F1', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', null];
// Keys outside the Prefs dialog that the player step tests directly (l.19473-19500): 1-4 (key numbers
// 0x1a-0x1d) and the key record's +0x3a..+0x40 (defaults 0x72, 0x70, 0x6b, 0x7e = F1-F4) pick Nav1-4;
// F5 (0x68), or Command (0x3f) with 5 (0x1f), the nearest landable stellar.
const FIXED = { Digit1: CMD.NAV1, Digit2: CMD.NAV2, Digit3: CMD.NAV3, Digit4: CMD.NAV4, F1: CMD.NAV1, F2: CMD.NAV2, F3: CMD.NAV3, F4: CMD.NAV4, F5: CMD.NAV_NEAREST };
export const macCode = n => ((n & 8) ? 0 : 8) + 16 * (n >> 4) + (n & 7);
export const keyCode = n => MAC[macCode(n)] ?? null;
// The Mac KeyMap has one bit per key: both Shift, Option, Control and Command keys read as the left one.
const SAME = { ShiftRight: 'ShiftLeft', AltRight: 'AltLeft', ControlRight: 'ControlLeft', MetaRight: 'MetaLeft' };
export function keyNumber(code) {
  code = SAME[code] ?? code;
  for (let n = 0; n < 128; n++) if (keyCode(n) === code) return n;
  return -1;
}

export class Keyboard {
  constructor(target = window, keys = DEFAULT_KEYS) {
    this.down = new Set(); this.pressedCmds = new Set(); this.listeners = [];
    this.setKeys(keys);
    target.addEventListener('keydown', e => {
      if (e.target?.tagName === 'INPUT') return;
      for (const f of this.listeners) if (f(e) === true) { e.preventDefault(); return; }
      const cmds = this.commands(e.code, e.metaKey || e.ctrlKey);
      if (cmds.length || e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space' || e.metaKey || e.ctrlKey) e.preventDefault();
      for (let c of cmds) {
        if (c === CMD.RECALL && e.altKey) c = CMD.RECALL_FIGHTERS;   // Option + recall: fighters to the bay
        if (c === CMD.COMMUNICATE && e.altKey) c = CMD.HAIL_PLANET;   // Option + hail: the nav stellar (0x10038f8c)
        if (c === CMD.JETTISON && e.altKey) c = CMD.JETTISON_NONMISSION;   // Option: keep mission cargo (l.21625)
        if (!this.down.has(e.code)) this.pressedCmds.add(c);
      }
      this.down.add(e.code);
      this.cmdDown = e.metaKey || e.ctrlKey;
    });
    target.addEventListener('keyup', e => { this.down.delete(e.code); this.cmdDown = e.metaKey || e.ctrlKey; });
    target.addEventListener('blur', () => this.down.clear());
  }
  // keys: 31 key numbers in dialog order.
  setKeys(keys) {
    this.keys = keys.slice();
    this.byCode = new Map();
    keys.forEach((n, i) => { const c = keyCode(n); if (!c) return; if (!this.byCode.has(c)) this.byCode.set(c, []); this.byCode.get(c).push(i); });
  }
  commands(code, command) {
    const slots = this.byCode.get(SAME[code] ?? code) ?? [];
    const cmds = slots.filter(i => !COMMAND_SLOTS.has(i) || command).map(i => PREF_SLOTS[i]);
    if (FIXED[code]) cmds.push(FIXED[code]);
    if (code === 'Digit5' && command) cmds.push(CMD.NAV_NEAREST);
    return cmds;
  }
  onKey(f) { this.listeners.push(f); }
  // One engine step of input. Pressed commands are consumed.
  take() {
    const held = new Set();
    for (const k of this.down) for (const c of this.commands(k, this.cmdDown)) held.add(c);
    const pressed = this.pressedCmds; this.pressedCmds = new Set();
    for (const c of pressed) held.add(c);
    return { held, pressed };
  }
  clear() { this.down.clear(); this.pressedCmds.clear(); }
}
