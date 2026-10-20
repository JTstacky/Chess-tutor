// /account/: who's playing. Kids tap their picture (and a PIN, if they have one) on a device their family has
// linked. Grown-ups sign in with a password and manage the family: kids, PINs and linked devices.
// (Escape Velocity/ev-online/docs/family-accounts.md)
import { account, mountAccountChip } from './auth.js';
import { avatarIds, avatarEl, PIN_PICTURES } from './avatars.js';

const box = document.getElementById('account');
const el = (tag, props = {}, parent) => { const e = Object.assign(document.createElement(tag), props); parent?.append(e); return e; };
const btn = (text, onclick, parent, cls = 'btn') => el('button', { className: cls, type: 'button', textContent: text, onclick }, parent);
let view = null;          // null (home) | 'login' | 'signup' | 'recover' | 'kid-help' | {code} | {kid} | {addKid} | {editKid}
let pickerKids = null;    // cached for the picker
let seq = 0;              // each render bumps it; a slow render that was overtaken stops drawing
const go = v => { view = v; render(); };

async function render() {
  seq++;
  box.replaceChildren();
  box.className = 'account-panel';
  if (view?.code) return recoveryCode(view.code);
  if (view?.kid) return pinPad(view.kid);
  if (['login', 'signup', 'recover'].includes(view)) return grownUpForm(view);
  if (view === 'kid-help') return kidHelp();
  if (account.kid) return kidHome();
  if (account.signedIn) return view?.addKid || view?.editKid ? kidForm(view.editKid) : grownUpHome();
  if (account.device) return picker();
  return welcome();
}

// ---------- kids ----------
async function picker() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Who’s playing?' }, box);
  const grid = el('div', { className: 'kid-grid' }, box), my = seq;
  try { pickerKids = await account.kids(); }
  catch (e) { if (!account.device) return render(); el('p', { className: 'msg', textContent: e.message }, box); }
  if (my !== seq) return;
  if (pickerKids && !pickerKids.length) el('p', { textContent: 'No kids yet. A grown-up can add them.' }, grid);
  for (const k of pickerKids ?? []) {
    const b = el('button', { className: 'kid', type: 'button', onclick: () => k.pin ? go({ kid: k }) : kidSignIn(k) }, grid);
    b.append(avatarEl(k.avatar, 120), el('span', { className: 'kid-name', textContent: k.nickname }));
  }
  btn('Grown-ups', () => go('login'), el('div', { className: 'row center' }, box), 'btn ghost');
}

async function kidSignIn(k, pin) {
  try { await account.kidLogin(k.id, pin); view = null; chip(); render(); return true; }
  catch (e) { return e; }
}

function pinPad(k) {
  box.classList.add('kids');
  const who = el('div', { className: 'pin-who' }, box);
  who.append(avatarEl(k.avatar, 96), el('span', { className: 'kid-name', textContent: k.nickname }));
  const dots = el('div', { className: 'pin-dots' }, box), msg = el('p', { className: 'msg big', role: 'status' }, box);
  let pin = '';
  const draw = () => { dots.replaceChildren(...[0, 1, 2, 3].map(i => el('span', { className: i < pin.length ? 'dot on' : 'dot' }))); };
  draw();
  const pad = el('div', { className: 'pin-pad' }, box);
  const press = async d => {
    if (pin.length >= 4) return;
    pin += d; draw(); msg.textContent = '';
    if (pin.length < 4) return;
    const r = await kidSignIn(k, pin);
    if (r === true) return;
    msg.textContent = r.status === 429 ? 'Too many tries. Ask a grown-up.' : r.message;
    dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); pin = ''; draw(); }, 500);
  };
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9]) key(d);
  btn('↩', () => go(null), pad, 'pin-key small').setAttribute('aria-label', 'Back');
  key(0);
  btn('⌫', () => { pin = pin.slice(0, -1); draw(); }, pad, 'pin-key small').setAttribute('aria-label', 'Delete');
  function key(d) {
    const b = el('button', { className: 'pin-key', type: 'button', onclick: () => press(String(d)) }, pad);
    b.append(el('span', { className: 'pic', textContent: PIN_PICTURES[d] }), el('span', { className: 'num', textContent: String(d) }));
    b.setAttribute('aria-label', String(d));
  }
}

function kidHome() {
  box.classList.add('kids');
  const who = el('div', { className: 'pin-who' }, box);
  who.append(avatarEl(account.avatar, 140), el('h2', { className: 'big-title', textContent: `Hi ${account.user}!` }));
  const row = el('div', { className: 'row center' }, box);
  el('a', { className: 'btn huge', href: '/', textContent: 'Play! ▶' }, row);
  const row2 = el('div', { className: 'row center' }, box);
  btn('Change my picture', () => { box.replaceChildren(); avatarPicker(account.avatar, async a => { await account.setAvatar(a); chip(); render(); }, () => render()); }, row2, 'btn ghost');
  btn(`Not ${account.user}? Switch`, async () => { await account.logout(); chip(); go(null); }, row2, 'btn ghost');
}

function avatarPicker(current, onPick, onCancel, parent = box) {
  el('h2', { textContent: 'Pick a picture' }, parent);
  const grid = el('div', { className: 'avatar-grid' }, parent);
  for (const id of avatarIds) {
    const b = el('button', { type: 'button', className: 'avatar-pick' + (id === current ? ' on' : ''), onclick: () => onPick(id) }, grid);
    b.append(avatarEl(id, 64)); b.setAttribute('aria-label', id);
  }
  if (onCancel) btn('Cancel', onCancel, el('div', { className: 'row center' }, parent), 'btn ghost');
}

function welcome() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Welcome!' }, box);
  const row = el('div', { className: 'choice' }, box);
  const k = btn('', () => go('kid-help'), row, 'btn choice-btn');
  k.append(el('span', { className: 'emoji', textContent: '🧒' }), 'I’m a kid');
  const g = btn('', () => go('login'), row, 'btn choice-btn ghost');
  g.append(el('span', { className: 'emoji', textContent: '🧑' }), 'I’m a grown-up');
}

function kidHelp() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Ask a grown-up' }, box);
  el('p', { className: 'lead', textContent: 'A grown-up can set up this device so you can tap your picture to play. Got a code from them? Type it here.' }, box);
  const f = el('form', { className: 'code-form' }, box);
  const input = el('input', { name: 'code', maxLength: 6, autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, placeholder: 'CODE', 'aria-label': 'Code' }, f);
  const msg = el('p', { className: 'msg big', role: 'status' }, f);
  const row = el('div', { className: 'row center' }, f);
  el('button', { className: 'btn huge', type: 'submit', textContent: 'Go ▶' }, row);
  btn('Back', () => go(null), row, 'btn ghost');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await account.linkWithCode(input.value, deviceName()); chip(); go(null); }
    catch (err) { msg.textContent = err.message; }
  });
}
const deviceName = () => /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android device' : 'Computer';

// ---------- grown-ups ----------
function recoveryCode(code) {
  el('h2', { textContent: 'Your recovery code' }, box);
  el('p', { textContent: 'Write it down or save it somewhere safe. It is the only way back into your account if you forget your password, and it won’t be shown again.' }, box);
  el('div', { className: 'code', textContent: code }, box);
  btn('I’ve saved it', () => go(null), box);
}

function grownUpForm(mode) {
  el('h2', { textContent: mode === 'login' ? 'Grown-ups: sign in' : mode === 'signup' ? 'Make a family account' : 'Reset your password' }, box);
  if (mode === 'signup') el('p', { className: 'note', textContent: 'For grown-ups. No email or real name needed: pick a username. You can add your kids after.' }, box);
  const f = el('form', {}, box);
  const field = (label, type, name, auto) => { const l = el('label', { textContent: label }, f); return el('input', { type, name, autocomplete: auto, spellcheck: false, autocapitalize: 'off', required: true }, l); };
  const user = field('Username', 'text', 'username', 'username');
  if (mode === 'signup') user.maxLength = 20;
  const code = mode === 'recover' ? field('Recovery code', 'text', 'recovery', 'off') : null;
  const pass = field(mode === 'login' ? 'Password' : 'New password', 'password', 'password', mode === 'login' ? 'current-password' : 'new-password');
  const pass2 = mode === 'login' ? null : field('Password again', 'password', 'password2', 'new-password');
  if (mode !== 'login') el('p', { className: 'note', textContent: 'Usernames: 3 to 20 letters, digits, _ . or -. Passwords: at least 10 characters.' }, f);
  const msg = el('p', { className: 'msg', role: 'status' }, f);
  const row = el('div', { className: 'row' }, f);
  const submit = el('button', { className: 'btn', type: 'submit', textContent: mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Make account' : 'Reset password' }, row);
  btn('Cancel', () => go(null), row, 'btn ghost');
  if (mode === 'login') {
    const p = el('p', { className: 'note' }, f);
    el('a', { className: 'link', href: '#', textContent: 'New here? Make a family account.', onclick: e => { e.preventDefault(); go('signup'); } }, p);
    p.append(' · ');
    el('a', { className: 'link', href: '#', textContent: 'Forgot your password?', onclick: e => { e.preventDefault(); go('recover'); } }, p);
  }
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (pass2 && pass.value !== pass2.value) { msg.textContent = 'The two passwords differ.'; return; }
    submit.disabled = true; msg.textContent = mode === 'login' ? 'Signing in…' : 'One moment…';
    try {
      let shown = null;
      if (mode === 'login') await account.login(user.value.trim(), pass.value);
      else if (mode === 'signup') shown = await account.signup(user.value.trim(), pass.value);
      else shown = await account.recover(user.value.trim(), code.value, pass.value);
      chip(); go(shown ? { code: shown } : null);
    } catch (err) { msg.textContent = err.message; submit.disabled = false; }
  });
  user.focus();
}

async function grownUpHome() {
  el('h2', { textContent: 'Signed in as ' + account.user }, box);
  const t = el('p', { className: 'tier-line' }, box);
  el('span', { className: 'tier ' + account.tier, textContent: account.full ? 'Full account' : 'Basic account' }, t);
  el('ul', {}, box).append(...(account.full
    ? ['Every game, including the private archive, for you and your kids.', 'Saves are kept online and follow you to every device.']
    : ['The free games: freeware and shareware.', 'Saves stay on the device.', 'Full accounts are by invitation: ask Justin to upgrade yours.']
  ).map(s => el('li', { textContent: s })));

  const famBox = el('section', { className: 'family' }, box);
  el('h3', { textContent: 'Your kids' }, famBox);
  let fam; const my = seq;
  try { fam = await account.family(); } catch (e) { el('p', { className: 'msg', textContent: e.message }, famBox); return; }
  if (my !== seq) return;
  const list = el('div', { className: 'kid-list' }, famBox);
  if (!fam.kids.length) el('p', { className: 'note', textContent: 'No kids yet. Add one: they’ll sign in by tapping their picture.' }, list);
  for (const k of fam.kids) {
    const row = el('div', { className: 'kid-row' }, list);
    row.append(avatarEl(k.avatar, 48));
    const info = el('div', { className: 'kid-info' }, row);
    el('b', { textContent: k.nickname }, info);
    el('span', { className: 'note', textContent: (k.pin ? 'PIN' : 'No PIN') + (k.locked ? ' · locked: too many wrong tries' : '') }, info);
    const acts = el('div', { className: 'kid-acts' }, row);
    btn('Edit', () => go({ editKid: k }), acts, 'btn small ghost');
    const del = btn('Delete', async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = `Delete ${k.nickname} and their saves?`; return; }
      await account.deleteKid(k.id); render();
    }, acts, 'btn small danger');
  }
  btn('+ Add a kid', () => go({ addKid: true }), famBox);

  const devBox = el('section', { className: 'family' }, box);
  el('h3', { textContent: 'Devices your kids use' }, devBox);
  el('p', { className: 'note', textContent: 'Kids can only sign in on these. On a linked device they tap their picture, so nobody else can try their PIN.' }, devBox);
  for (const d of fam.devices) {
    const row = el('div', { className: 'kid-row' }, devBox);
    el('span', { className: 'emoji', textContent: '📱' }, row);
    const info = el('div', { className: 'kid-info' }, row);
    el('b', { textContent: d.label }, info);
    el('span', { className: 'note', textContent: 'Last used ' + new Date(d.last_used).toLocaleDateString() }, info);
    btn('Unlink', async () => { await account.unlinkDevice(d.id); render(); }, el('div', { className: 'kid-acts' }, row), 'btn small ghost');
  }
  const drow = el('div', { className: 'row' }, devBox);
  if (!account.device) btn('My kids use this device', async () => { await account.linkThisDevice(deviceName()); render(); }, drow);
  const codeBtn = btn('Link another device', async () => {
    const j = await account.linkCode();
    codeBtn.replaceWith(Object.assign(el('div', { className: 'code' }), { textContent: j.code }));
    el('p', { className: 'note', textContent: 'On the kid’s device, open tenggames.com.au/account, tap “I’m a kid” and type this code. It works once, for 10 minutes.' }, devBox);
  }, drow, 'btn ghost');

  const out = el('div', { className: 'row' }, box);
  btn('Sign out', async () => { await account.logout(); chip(); go(null); }, out, 'btn ghost');
}

function kidForm(kid) {
  el('h2', { textContent: kid ? `Edit ${kid.nickname}` : 'Add a kid' }, box);
  const f = el('form', {}, box);
  const l = el('label', { textContent: 'Nickname' }, f);
  const nick = el('input', { name: 'nickname', maxLength: 16, required: true, value: kid?.nickname ?? '', autocomplete: 'off' }, l);
  el('p', { className: 'note', textContent: 'A first name or a made-up name, not a full name. Only your family sees it.' }, f);
  let avatar = kid?.avatar ?? null;
  const picks = el('div', {}, f);
  const drawPicks = () => { picks.replaceChildren(); avatarPicker(avatar, a => { avatar = a; drawPicks(); }, null, picks); };
  drawPicks();
  const pl = el('label', { textContent: kid ? 'New PIN (4 numbers; leave empty to keep the current one)' : 'PIN (4 numbers, optional)' }, f);
  const pin = el('input', { name: 'pin', inputMode: 'numeric', pattern: '\\d{4}', maxLength: 4, autocomplete: 'off' }, pl);
  el('p', { className: 'note', textContent: 'Each number on the kid’s keypad also has a picture (1 = 🐱, 2 = 🚀, 3 = ⭐ …), so they can remember four pictures instead. Without a PIN they just tap their picture.' }, f);
  let removePin = false;
  if (kid?.pin) { const c = el('label', { className: 'check' }, f); const cb = el('input', { type: 'checkbox' }, c); c.append(' Remove the PIN'); cb.onchange = () => { removePin = cb.checked; }; }
  const msg = el('p', { className: 'msg', role: 'status' }, f);
  const row = el('div', { className: 'row' }, f);
  el('button', { className: 'btn', type: 'submit', textContent: kid ? 'Save' : 'Add' }, row);
  btn('Cancel', () => go(null), row, 'btn ghost');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!avatar) { msg.textContent = 'Pick a picture.'; return; }
    if (pin.value && !/^\d{4}$/.test(pin.value)) { msg.textContent = 'A PIN is 4 numbers.'; return; }
    try {
      if (kid) {
        const changes = { nickname: nick.value, avatar };
        if (removePin) changes.pin = null; else if (pin.value) changes.pin = pin.value;
        await account.editKid(kid.id, changes);
      } else await account.addKid({ nickname: nick.value, avatar, ...(pin.value ? { pin: pin.value } : {}) });
      go(null);
    } catch (err) { msg.textContent = err.message; }
  });
  nick.focus();
}

const header = document.querySelector('.site-header');
const chip = () => { header.querySelector('.account-chip')?.remove(); mountAccountChip(header); };
chip();
render();
account.refresh().then(() => { chip(); if (!view) render(); }, () => { });
