// Touch controls: a d-pad on the left, Sword / Jump / Magic on the right, Pause and Items
// pills at the top. Sized from the window and placed in the black bars beside the game
// when they are wide enough (a phone held sideways), otherwise laid over the corners.
// Every finger is tracked on its own, so walking while attacking and jumping works, and a
// finger can slide from one action button to another.
// Text prompts (knight name, room code) get the phone's keyboard through a real <input>.
import { input, emptyFrame } from '../core/input.js';
import { canvas } from '../render/screen.js';
import { params } from '../core/util.js';

const ICON = {
  attack: '<svg viewBox="0 0 24 24"><path d="M19 3l2 2-9.5 9.5-2-2z" fill="currentColor"/><path d="M8 13.5l2.5 2.5-1.6 1.6-.9-.9-3 3-1.6-1.6 3-3-.9-.9z" fill="currentColor"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4.5v8h-5v-8H5z" fill="currentColor"/></svg>',
  magic: '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" fill="currentColor"/></svg>',
};

const TEMPLATE = `
  <div class="tc-dpad" data-role="dpad">
    <i class="tc-arrow up"></i><i class="tc-arrow right"></i><i class="tc-arrow down"></i><i class="tc-arrow left"></i>
    <div class="tc-knob"></div>
  </div>
  <div class="tc-cluster">
    <div class="tc-btn magic" data-a="magic">${ICON.magic}<span>Magic</span></div>
    <div class="tc-btn attack" data-a="attack">${ICON.attack}<span>Sword</span></div>
    <div class="tc-btn jump" data-a="jump">${ICON.jump}<span>Jump</span></div>
  </div>
  <div class="tc-pill pause" data-a="pause"><i class="tc-bars"></i><span>Pause</span></div>
  <div class="tc-pill menu" data-a="menu"><span>Items</span></div>
  <input class="tc-text" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Type here">
`;

export function setupTouch() {
  const host = document.getElementById('touch');
  const forced = params.has('touch');
  if (!forced && !('ontouchstart' in window) && !navigator.maxTouchPoints) return;
  input.isTouch = true;
  host.classList.add('on');
  host.innerHTML = TEMPLATE;
  const dpad = host.querySelector('.tc-dpad'), knob = host.querySelector('.tc-knob');
  const cluster = host.querySelector('.tc-cluster');
  const field = host.querySelector('.tc-text');
  const controls = [...host.querySelectorAll('[data-a]')];

  // ---------------------------------------------------------------- layout
  let D = 120;
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight, r = canvas.getBoundingClientRect();
    const gut = Math.min(r.left, vw - r.right);
    D = Math.min(vh * 0.44, 176);
    const side = gut >= D * 0.8;
    if (side) D = Math.min(D, gut - 12);
    D = Math.round(Math.max(D, 96));
    const m = side ? Math.max(6, (gut - D) / 2) : 14;
    host.classList.toggle('overlay', !side);
    host.style.setProperty('--d', `${D}px`);
    const bottom = Math.max(14, vh * 0.1);
    Object.assign(dpad.style, { left: `${m}px`, bottom: `${bottom}px`, width: `${D}px`, height: `${D}px` });
    Object.assign(cluster.style, { right: `${m}px`, bottom: `${bottom}px`, width: `${D}px`, height: `${D}px` });
    const pw = Math.min(D, 110), top = Math.max(10, vh * 0.05);
    const pills = host.querySelectorAll('.tc-pill');
    Object.assign(pills[0].style, { left: `${m + (D - pw) / 2}px`, top: `${top}px`, width: `${pw}px` });
    Object.assign(pills[1].style, { right: `${m + (D - pw) / 2}px`, top: `${top}px`, width: `${pw}px` });
  }
  window.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('resize', layout);
  layout();
  setTimeout(layout, 300); // after the canvas has been sized

  // ---------------------------------------------------------------- fingers
  const fingers = new Map(); // pointerId -> { kind: 'dpad' | 'btn' | 'none', acts: [] }
  const capture = (code) => { if (input.textCapture) input.textCapture({ code, key: code }); };

  function dpadActs(x, y) {
    const r = dpad.getBoundingClientRect();
    let dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    const dead = r.width * 0.16, acts = [];
    // Horizontal is generous, vertical needs a clear push so walking never opens doors.
    if (Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.5) acts.push(dx < 0 ? 'left' : 'right');
    if (Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.75) acts.push(dy < 0 ? 'up' : 'down');
    const len = Math.hypot(dx, dy), max = r.width * 0.3;
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    return acts;
  }

  function sync() {
    const f = emptyFrame();
    for (const p of fingers.values()) for (const a of p.acts) f[a] = true;
    if (f.attack || f.jump) f.confirm = true;
    if (f.pause) f.cancel = true;
    Object.assign(input.touchFrame, f);
    for (const el of controls) el.classList.toggle('held', !!f[el.dataset.a]);
    for (const a of ['up', 'down', 'left', 'right']) dpad.querySelector(`.tc-arrow.${a}`).classList.toggle('held', f[a]);
    if (![...fingers.values()].some((p) => p.kind === 'dpad')) knob.style.transform = '';
  }

  function buttonAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el?.closest?.('.tc-btn');
  }

  host.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-a], [data-role]');
    if (!t) return;
    e.preventDefault();
    const a = t.dataset.a;
    // While a text prompt is open the buttons answer it instead of playing.
    if (input.textCapture && a) {
      if (a === 'attack' || a === 'jump') { field.blur(); capture('Enter'); }
      else if (a === 'pause') { field.blur(); capture('Escape'); }
      fingers.set(e.pointerId, { kind: 'none', acts: [] });
      return;
    }
    if (t.dataset.role === 'dpad') fingers.set(e.pointerId, { kind: 'dpad', acts: dpadActs(e.clientX, e.clientY) });
    else fingers.set(e.pointerId, { kind: t.classList.contains('tc-btn') ? 'btn' : 'pill', acts: [a] });
    navigator.vibrate?.(8);
    sync();
  });
  host.addEventListener('pointermove', (e) => {
    const p = fingers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'dpad') p.acts = dpadActs(e.clientX, e.clientY);
    else if (p.kind === 'btn') {
      const b = buttonAt(e.clientX, e.clientY);
      if (b && b.dataset.a !== p.acts[0]) { p.acts = [b.dataset.a]; navigator.vibrate?.(6); }
    } else return;
    sync();
  });
  const lift = (e) => { if (fingers.delete(e.pointerId)) sync(); };
  host.addEventListener('pointerup', lift);
  host.addEventListener('pointercancel', lift);
  host.addEventListener('lostpointercapture', lift);
  window.addEventListener('blur', () => { fingers.clear(); sync(); });
  host.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- taps on the picture
  // Tapping the game confirms (start, dialogue, menus) or, in a text prompt, opens the keyboard.
  let shadow = '';
  const current = () => (input.textValue ? input.textValue() : field.value);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && !forced) return;
    if (input.textCapture) {
      // No compatibility mousedown: it would focus the canvas and close the keyboard again.
      e.preventDefault();
      field.value = shadow = current();
      host.classList.add('typing');
      field.focus();
      return;
    }
    input.tapConfirm = true;
  });
  canvas.addEventListener('mousedown', (e) => { if (document.activeElement === field) e.preventDefault(); });
  field.addEventListener('input', () => {
    const nv = field.value;
    let i = 0;
    while (i < shadow.length && i < nv.length && shadow[i] === nv[i]) i++;
    for (let k = i; k < shadow.length; k++) capture('Backspace');
    for (const ch of nv.slice(i)) if (input.textCapture) input.textCapture({ code: /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : '', key: ch });
    field.value = shadow = current();
  });
  field.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the window handler would type the letter a second time
    if (e.key === 'Enter') { e.preventDefault(); field.blur(); capture('Enter'); }
    else if (e.key === 'Escape') { field.blur(); capture('Escape'); }
  });
  field.addEventListener('blur', () => host.classList.remove('typing'));
  // Close the keyboard when the prompt ends some other way.
  setInterval(() => { if (!input.textCapture && document.activeElement === field) field.blur(); }, 250);
}
