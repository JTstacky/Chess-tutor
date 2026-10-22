// /account/: sign in, then "Who's playing?", like Netflix. A grown-up signs in once on a device; after that
// everyone picks their profile (the grown-up's or a kid's) and types its PIN if it has one. Nothing else on the
// site opens until a profile is picked. The grown-up profile manages the family: kids, PINs, its own lock.
// (Teng Games Accounts/docs/PROFILES.md; families: Escape Velocity/ev-online/docs/family-accounts.md)
import { account, mountAccountChip } from './auth.js';
import { avatarIds, avatarEl, PIN_PICTURES } from './avatars.js';

const box = document.getElementById('account');
const el = (tag, props = {}, parent) => { const e = Object.assign(document.createElement(tag), props); parent?.append(e); return e; };
const btn = (text, onclick, parent, cls = 'btn') => el('button', { className: cls, type: 'button', textContent: text, onclick }, parent);
// null (home) | 'login' | 'signup' | 'recover' | 'kid-help' | 'lock' | {code} | {pin, profile, manage, device} | {addKid} | {editKid}
// A private setup link uses the existing one-use recovery flow. Fragments never reach the server.
const setup = new URLSearchParams(location.hash.slice(1));
const setupUser = setup.get('setup'), setupCode = setup.get('recovery');
if (setupUser && setupCode) history.replaceState(null, '', location.pathname + location.search);
let view = setupUser && setupCode ? 'recover' : null;
let seq = 0;              // each render bumps it; a slow render that was overtaken stops drawing
const go = v => { view = v; render(); };
// Sign out of this device; if the playing profile's progress isn't backed up yet, ask first.
async function signOut(mode) {
  try { await account.logout(mode); chip(); go(null); }
  catch (e) {
    if (e.code !== 'unsynced') throw e;
    box.replaceChildren();
    el('h2', { textContent: 'Not backed up yet' }, box);
    el('p', { textContent: 'Some game progress on this device isn’t saved online yet (is the internet down?).' }, box);
    const row = el('div', { className: 'row' }, box);
    btn('Try again', () => signOut(), row);
    btn('Sign out, keep it on this device', () => signOut('keep'), row, 'btn ghost');
    el('p', { className: 'note', textContent: 'Kept progress is saved online the next time that profile plays here.' }, box);
    const row2 = el('div', { className: 'row' }, box);
    const del = btn('Sign out and delete it', () => { if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete it for good?'; return; } signOut('delete'); }, row2, 'btn ghost danger');
    btn('Cancel', () => go(null), row2, 'btn ghost');
  }
}

// Where to go after picking a profile: the page that sent us here (same site only), or the games.
const nextPage = (() => {
  try {
    const u = new URL(new URLSearchParams(location.search).get('next') ?? '/', location.origin);
    if (u.origin === location.origin && !u.pathname.startsWith('/account')) return u.pathname + u.search + u.hash;
  } catch { }
  return '/';
})();

async function render() {
  seq++;
  box.replaceChildren();
  box.className = 'account-panel';
  const back = document.querySelector('.back');
  if (back) back.hidden = !account.signedIn;   // the games only open once a profile is picked
  if (view?.code) return recoveryCode(view.code);
  if (view?.pin) return pinPad(view);
  if (['login', 'signup', 'recover'].includes(view)) return grownUpForm(view);
  if (view === 'kid-help') return kidHelp();
  if (view === 'lock') return lockForm();
  if (account.guest) return guestHome();
  if (account.kid) return kidHome();
  if (account.signedIn) return view?.addKid || view?.editKid ? kidForm(view.editKid) : grownUpHome();
  if (account.hasAccount) return profilePicker();
  if (account.device) return devicePicker();
  return grownUpForm('login');
}

const profilePic = (p, size) => p.avatar ? avatarEl(p.avatar, size) : Object.assign(el('span', { className: 'avatar grown', textContent: '👤', ariaHidden: 'true' }), { style: `--size:${size}px` });

// ---------- who's playing? ----------
async function profilePicker() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Who’s playing?' }, box);
  const grid = el('div', { className: 'kid-grid' }, box), my = seq;
  let list;
  try { list = await account.profiles(); }
  catch (e) { if (!account.hasAccount) return render(); el('p', { className: 'msg', textContent: e.message }, box); return; }
  if (my !== seq) return;
  for (const p of list) {
    const b = el('button', { className: 'kid', type: 'button', onclick: () => pick(p) }, grid);
    b.append(profilePic(p, 120), el('span', { className: 'kid-name', textContent: (p.pin ? '🔒 ' : '') + p.name }));
    b.setAttribute('aria-label', p.name + (p.pin ? ', has a PIN' : ''));
  }
  const grown = list.find(p => p.kind === 'parent');
  const row = el('div', { className: 'row center' }, box);
  if (grown) btn('Manage profiles', () => pick(grown, { manage: true }), row, 'btn ghost');
  btn('Sign out', () => signOut(), row, 'btn ghost');
}

async function pick(p, { manage = false } = {}) {
  if (p.pin) return go({ pin: true, profile: p, manage });
  const r = await choose(p, undefined, manage);
  if (r !== true) { go(null); box.prepend(el('p', { className: 'msg big', textContent: r.message })); }
}

// Returns true, or the error.
async function choose(p, pin, manage, device = false) {
  try {
    if (device) await account.kidLogin(p.id, pin); else await account.selectProfile(p.id, pin);
  } catch (e) { return e; }
  chip();
  if (manage) { view = null; render(); }      // "Manage profiles": stay here on the grown-up's page
  else location.assign(nextPage);             // otherwise straight on to the games (or the page that sent us)
  return true;
}

function pinPad({ profile: p, manage, device }) {
  box.classList.add('kids');
  const who = el('div', { className: 'pin-who' }, box);
  who.append(profilePic(p, 96), el('span', { className: 'kid-name', textContent: p.name }));
  const dots = el('div', { className: 'pin-dots' }, box), msg = el('p', { className: 'msg big', role: 'status' }, box);
  let pin = '';
  const draw = () => { dots.replaceChildren(...[0, 1, 2, 3].map(i => el('span', { className: i < pin.length ? 'dot on' : 'dot' }))); };
  draw();
  const pad = el('div', { className: 'pin-pad' }, box);
  const press = async d => {
    if (pin.length >= 4) return;
    pin += d; draw(); msg.textContent = '';
    if (pin.length < 4) return;
    const r = await choose(p, pin, manage, device);
    if (r === true) return;
    msg.textContent = r.status === 429 ? (p.kind === 'kid' ? 'Too many tries. Ask a grown-up.' : r.message) : r.message;
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
  addEventListener('keydown', function onKey(e) {
    if (!box.contains(pad)) return removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
  });
}

// The older way: a device a grown-up linked shows its family's kids without a sign-in.
async function devicePicker() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Who’s playing?' }, box);
  const grid = el('div', { className: 'kid-grid' }, box), my = seq;
  let kids;
  try { kids = await account.kids(); }
  catch (e) { if (!account.device) return render(); el('p', { className: 'msg', textContent: e.message }, box); return; }
  if (my !== seq) return;
  if (!kids.length) el('p', { textContent: 'No kids yet. A grown-up can add them.' }, grid);
  for (const k of kids) {
    const p = { id: k.id, name: k.nickname, avatar: k.avatar, pin: k.pin, kind: 'kid' };
    const b = el('button', { className: 'kid', type: 'button', onclick: async () => {
      if (p.pin) return go({ pin: true, profile: p, device: true });
      const r = await choose(p, undefined, false, true);
      if (r !== true) box.prepend(el('p', { className: 'msg big', textContent: r.message }));
    } }, grid);
    b.append(avatarEl(k.avatar, 120), el('span', { className: 'kid-name', textContent: k.nickname }));
  }
  btn('Grown-ups: sign in', () => go('login'), el('div', { className: 'row center' }, box), 'btn ghost');
}

function kidHome() {
  box.classList.add('kids');
  const who = el('div', { className: 'pin-who' }, box);
  who.append(avatarEl(account.avatar, 140), el('h2', { className: 'big-title', textContent: `Hi ${account.user}!` }));
  const row = el('div', { className: 'row center' }, box);
  el('a', { className: 'btn huge', href: nextPage, textContent: 'Play! ▶' }, row);
  const row2 = el('div', { className: 'row center' }, box);
  btn('Change my picture', () => { box.replaceChildren(); avatarPicker(account.avatar, async a => { await account.setAvatar(a); chip(); render(); }, () => render()); }, row2, 'btn ghost');
  btn('Switch profile', async () => { await account.leaveProfile(); chip(); go(null); }, row2, 'btn ghost');
}

function guestHome() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Playing as a guest' }, box);
  el('p', { className: 'lead', textContent: 'You can play the free games. Nothing is saved: sign in to keep your progress.' }, box);
  const row = el('div', { className: 'row center' }, box);
  el('a', { className: 'btn huge', href: nextPage, textContent: 'Play! ▶' }, row);
  btn('Sign in instead', async () => { await account.logout('delete'); chip(); go('login'); }, el('div', { className: 'row center' }, box), 'btn ghost');
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

function kidHelp() {
  box.classList.add('kids');
  el('h2', { className: 'big-title', textContent: 'Ask a grown-up' }, box);
  el('p', { className: 'lead', textContent: 'A grown-up signs in on this device once. Then you tap your picture to play.' }, box);
  el('p', { className: 'note', textContent: 'Got a code from a grown-up? Type it here.' }, box);
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
  const row = el('div', { className: 'row' }, box);
  btn('Copy', async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied ✓'; } catch { copy.textContent = 'Select and copy it'; } }, row, 'btn ghost');
  const copy = row.lastChild;
  btn('Save as a file', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([`Teng Games recovery code for ${account.accountUser}\n${code}\n`], { type: 'text/plain' })), download: 'teng-games-recovery-code.txt' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, row, 'btn ghost');
  btn('I’ve saved it ▶', () => go(null), el('div', { className: 'row' }, box));
}

function grownUpForm(mode) {
  const title = mode === 'login' ? 'Sign in to Teng Games' : mode === 'signup' ? 'Make a family account' : 'Reset your password';
  el('h2', { textContent: title }, box);
  if (mode === 'login') el('p', { className: 'note', textContent: 'Grown-ups sign in once on each device. Then everyone picks their profile.' }, box);
  if (mode === 'signup') el('p', { className: 'note', textContent: 'For grown-ups. No email or real name needed: pick a username. You add your kids’ profiles after.' }, box);
  const f = el('form', { noValidate: true }, box);
  const field = (label, type, name, auto) => { const l = el('label', { textContent: label }, f); return el('input', { type, name, autocomplete: auto, spellcheck: false, autocapitalize: 'off' }, l); };
  const user = field('Username', 'text', 'username', mode === 'signup' ? 'off' : 'username');
  if (mode === 'signup') user.maxLength = 30;
  const code = mode === 'recover' ? field('Recovery code', 'text', 'recovery', 'off') : null;
  if (mode === 'recover' && setupUser && setupCode) { user.value = setupUser; code.value = setupCode; }
  const pass = field(mode === 'login' ? 'Password' : 'New password', 'password', 'password', mode === 'login' ? 'current-password' : 'new-password');
  const pass2 = mode === 'login' ? null : field('Password again', 'password', 'password2', 'new-password');
  if (mode !== 'login') el('p', { className: 'note', textContent: 'Username: 2 to 30 letters, numbers or spaces (not an email address). Password: at least 8 characters.' }, f);
  const msg = el('p', { className: 'msg', role: 'status', ariaLive: 'assertive' }, f);
  const row = el('div', { className: 'row' }, f);
  const submit = el('button', { className: 'btn', type: 'submit', textContent: mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Make account' : 'Reset password' }, row);
  if (mode !== 'login') btn('Back', () => go('login'), row, 'btn ghost');
  if (mode === 'login') {
    el('p', { className: 'or', textContent: 'New here?' }, box);
    btn('Make a family account', () => go('signup'), el('div', { className: 'row' }, box), 'btn ghost wide');
    const p = el('p', { className: 'note' }, box);
    el('a', { className: 'link', href: '#', textContent: 'Forgot your password?', onclick: e => { e.preventDefault(); go('recover'); } }, p);
    p.append(' · ');
    el('a', { className: 'link', href: '#', textContent: 'I’m a kid', onclick: e => { e.preventDefault(); go('kid-help'); } }, p);
    const g = el('div', { className: 'row' }, box);
    const gb = btn('Play as a guest', async () => {
      gb.disabled = true;
      try { await account.guestLogin(); chip(); location.assign(nextPage); }
      catch (e2) { gb.disabled = false; msg.textContent = e2.message; }
    }, g, 'btn ghost wide');
    el('p', { className: 'note', textContent: 'Guests play the free games. Nothing is saved.' }, box);
  }
  // Check the easy things here, with the message right by the button, before asking the server.
  const problem = () => {
    const u = user.value.trim();
    if (!u) return 'Type a username.';
    if (mode !== 'login' && u.includes('@')) return 'Use a username, not an email address. We don’t need your email.';
    if (mode !== 'login' && (u.length < 2 || u.length > 30)) return 'Usernames are 2 to 30 characters.';
    if (code && !code.value.trim()) return 'Type your recovery code.';
    if (!pass.value) return 'Type a password.';
    if (mode !== 'login' && pass.value.length < 8) return 'Passwords are at least 8 characters.';
    if (pass2 && pass.value !== pass2.value) return 'The two passwords are different.';
    return null;
  };
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = problem();
    if (bad) { msg.textContent = bad; msg.scrollIntoView({ block: 'nearest' }); return; }
    submit.disabled = true; msg.textContent = mode === 'login' ? 'Signing in…' : 'One moment…';
    try {
      let j;
      if (mode === 'login') j = await account.login(user.value.trim(), pass.value);
      else if (mode === 'signup') j = await account.signup(user.value.trim(), pass.value);
      else j = await account.recover(user.value.trim(), code.value, pass.value);
      chip(); go(j.recovery ? { code: j.recovery } : null);
    } catch (err) {
      msg.textContent = err.status === 401 && mode === 'login' ? 'Wrong username or password. New here? Make a family account below.' : err.message;
      msg.scrollIntoView({ block: 'nearest' }); submit.disabled = false;
    }
  });
  user.focus();
}

async function grownUpHome() {
  const who = el('div', { className: 'pin-who' }, box);
  who.append(profilePic({ avatar: account.avatar }, 72), el('h2', { textContent: account.user }));
  const t = el('p', { className: 'tier-line' }, box);
  el('span', { className: 'tier ' + account.tier, textContent: account.full ? 'Full account' : 'Basic account' }, t);
  el('ul', {}, box).append(...(account.full
    ? ['Every game, including the private archive, for you and your kids.', 'Saves are kept online and follow you to every device.']
    : ['The free games: freeware and shareware.', 'Saves stay on the device.', 'Full accounts are by invitation: ask Justin to upgrade yours.']
  ).map(s => el('li', { textContent: s })));
  const top = el('div', { className: 'row' }, box);
  el('a', { className: 'btn', href: nextPage, textContent: 'Play ▶' }, top);
  btn('Switch profile', async () => { await account.leaveProfile(); chip(); go(null); }, top, 'btn ghost');

  let fam; const my = seq;
  const famBox = el('section', { className: 'family' }, box);
  el('h3', { textContent: 'Profiles' }, famBox);
  try { fam = await account.family(); } catch (e) { el('p', { className: 'msg', textContent: e.message }, famBox); return; }
  if (my !== seq) return;

  // the grown-up's own profile
  const me = el('div', { className: 'kid-row' }, famBox);
  me.append(profilePic({ avatar: account.avatar }, 48));
  const meInfo = el('div', { className: 'kid-info' }, me);
  el('b', { textContent: account.user + ' (you)' }, meInfo);
  el('span', { className: 'note', textContent: fam.profileLock ? 'Profile lock on' : 'No profile lock: anyone on this device can open it' }, meInfo);
  const meActs = el('div', { className: 'kid-acts' }, me);
  btn('Picture', () => { box.replaceChildren(); avatarPicker(account.avatar, async a => { await account.setAvatar(a); chip(); render(); }, () => render()); }, meActs, 'btn small ghost');
  btn(fam.profileLock ? 'Lock' : 'Add lock', () => go('lock'), meActs, 'btn small ghost');
  if (!fam.profileLock && fam.kids.length) el('p', { className: 'note warn', textContent: 'Tip: add a profile lock so your kids can’t open your profile and change theirs.' }, famBox);

  for (const k of fam.kids) {
    const row = el('div', { className: 'kid-row' }, famBox);
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
  if (fam.kids.length < 8) btn('+ Add a kid', () => go({ addKid: true }), famBox);

  // Game progress this device had from before profiles: the grown-up gives it to a profile, or deletes it.
  const legacy = await window.TGProfile?.legacy();
  if (legacy && my === seq) {
    const lb = el('section', { className: 'family' }, box);
    el('h3', { textContent: 'Older progress on this device' }, lb);
    el('p', { className: 'note', textContent: `This device has game progress from before profiles (${Object.keys(legacy).length} saved items). Whose is it?` }, lb);
    const row = el('div', { className: 'row' }, lb);
    const all = [{ id: account.profileId, name: account.user + ' (you)' }, ...fam.kids.map(k => ({ id: String(k.id), name: k.nickname }))];
    for (const p of all) btn(p.name, async () => { await window.TGProfile.giveLegacy(p.id); render(); }, row, 'btn small');
    const del = btn('Delete it', async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete it for good?'; return; }
      await window.TGProfile.dropLegacy(); render();
    }, row, 'btn small danger');
  }

  // Devices linked the older way (before sign-in + profiles). Nothing new needs linking now.
  if (fam.devices.length) {
    const devBox = el('section', { className: 'family' }, box);
    el('h3', { textContent: 'Linked devices' }, devBox);
    el('p', { className: 'note', textContent: 'These show your kids’ pictures without a sign-in. You don’t need them any more: sign in once on a device instead. Unlink any you don’t use.' }, devBox);
    for (const d of fam.devices) {
      const row = el('div', { className: 'kid-row' }, devBox);
      el('span', { className: 'emoji', textContent: '📱' }, row);
      const info = el('div', { className: 'kid-info' }, row);
      el('b', { textContent: d.label }, info);
      el('span', { className: 'note', textContent: 'Last used ' + new Date(d.last_used).toLocaleDateString() }, info);
      btn('Unlink', async () => { await account.unlinkDevice(d.id); render(); }, el('div', { className: 'kid-acts' }, row), 'btn small ghost');
    }
  }

  const out = el('div', { className: 'row' }, box);
  btn('Sign out of this device', () => signOut(), out, 'btn ghost');
}

// The grown-up profile's own PIN, so kids can't open it. Needs the account password.
function lockForm() {
  el('h2', { textContent: 'Profile lock' }, box);
  el('p', { className: 'note', textContent: 'A 4-number PIN for your profile. Kids can still pick theirs; only you can open yours and manage the family.' }, box);
  const f = el('form', { noValidate: true }, box);
  const pl = el('label', { textContent: 'New PIN (4 numbers)' }, f);
  const pin = el('input', { name: 'pin', inputMode: 'numeric', maxLength: 4, autocomplete: 'off' }, pl);
  const wl = el('label', { textContent: 'Your password' }, f);
  const pw = el('input', { name: 'password', type: 'password', autocomplete: 'current-password' }, wl);
  const msg = el('p', { className: 'msg', role: 'status' }, f);
  const row = el('div', { className: 'row' }, f);
  el('button', { className: 'btn', type: 'submit', textContent: 'Save lock' }, row);
  btn('Turn lock off', async () => {
    if (!pw.value) { msg.textContent = 'Type your password first.'; return; }
    try { await account.setProfileLock(pw.value, null); go(null); } catch (e) { msg.textContent = e.message; }
  }, row, 'btn ghost');
  btn('Cancel', () => go(null), row, 'btn ghost');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin.value)) { msg.textContent = 'A PIN is 4 numbers.'; return; }
    if (!pw.value) { msg.textContent = 'Type your password.'; return; }
    try { await account.setProfileLock(pw.value, pin.value); go(null); } catch (e2) { msg.textContent = e2.message; }
  });
  pin.focus();
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
// A game page sent us here to switch profile or apply newer progress from another device: do it, then go back.
const params = new URLSearchParams(location.search);
if ((params.has('switch') || params.has('sync')) && account.signedIn) {
  el('h2', { className: 'big-title', textContent: 'One moment…' }, box);
  account.arrive().then(() => location.replace(nextPage), e => { box.replaceChildren(); el('p', { className: 'msg big', textContent: e.message }, box); });
} else render();
account.refresh().then(() => { chip(); if (!view) render(); }, () => { if (!view) render(); });
