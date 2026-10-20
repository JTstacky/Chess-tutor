// /account/: sign in, create an account, recover a password, see your account's tier, sign out.
import { account, mountAccountChip } from './auth.js';

const box = document.getElementById('account');
const el = (tag, props = {}, parent) => { const e = Object.assign(document.createElement(tag), props); parent?.append(e); return e; };
let mode = null;      // null | 'login' | 'signup' | 'recover' | { code }

function render() {
  box.replaceChildren();
  if (mode?.code) {
    el('h2', { textContent: 'Your recovery code' }, box);
    el('p', { textContent: 'Write it down or save it somewhere safe. It is the only way back into your account if you forget your password, and it won’t be shown again.' }, box);
    el('div', { className: 'code', textContent: mode.code }, box);
    el('button', { className: 'btn', textContent: 'I’ve saved it', onclick: () => { mode = null; render(); } }, box);
    return;
  }
  if (account.signedIn) {
    el('h2', { textContent: 'Signed in as ' + account.user }, box);
    const t = el('p', { className: 'tier-line' }, box);
    el('span', { className: 'tier ' + account.tier, textContent: account.full ? 'Full account' : 'Basic account' }, t);
    el('ul', {}, box).append(...(account.full
      ? ['Every game, including the private archive.', 'Your saves are kept online and follow you to every device.']
      : ['The free games: freeware and shareware.', 'Your saves stay on this device.', 'Full accounts are by invitation: ask Justin to upgrade yours.']
    ).map(s => el('li', { textContent: s })));
    el('p', { className: 'note', textContent: 'One account for the whole site, including Escape Velocity’s pilots.' }, box);
    el('button', { className: 'btn ghost', textContent: 'Sign out', onclick: async () => { await account.logout(); render(); } }, box);
    return;
  }
  if (!mode) {
    el('h2', { textContent: 'Your Teng Games account' }, box);
    el('p', { textContent: 'One account for the whole site. New accounts are basic: the free games, with saves on your device. Full accounts get every game and saves on every device.' }, box);
    const row = el('div', { className: 'row' }, box);
    el('button', { className: 'btn', textContent: 'Sign in', onclick: () => { mode = 'login'; render(); } }, row);
    el('button', { className: 'btn ghost', textContent: 'Create account', onclick: () => { mode = 'signup'; render(); } }, row);
    return;
  }
  el('h2', { textContent: mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password' }, box);
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
  const go = el('button', { className: 'btn', type: 'submit', textContent: mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password' }, row);
  el('button', { className: 'btn ghost', type: 'button', textContent: 'Cancel', onclick: () => { mode = null; render(); } }, row);
  if (mode === 'login') el('a', { className: 'link', href: '#', textContent: 'Forgot your password? Use your recovery code.', onclick: e => { e.preventDefault(); mode = 'recover'; render(); } }, el('p', { className: 'note' }, f));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (pass2 && pass.value !== pass2.value) { msg.textContent = 'The two passwords differ.'; return; }
    go.disabled = true; msg.textContent = mode === 'login' ? 'Signing in…' : 'One moment…';
    try {
      let shown = null;
      if (mode === 'login') await account.login(user.value.trim(), pass.value);
      else if (mode === 'signup') shown = await account.signup(user.value.trim(), pass.value);
      else shown = await account.recover(user.value.trim(), code.value, pass.value);
      mode = shown ? { code: shown } : null;
      render(); chip();
    } catch (err) { msg.textContent = err.message; go.disabled = false; }
  });
  user.focus();
}

const header = document.querySelector('.site-header');
const chip = () => { header.querySelector('.account-chip')?.remove(); mountAccountChip(header); };
chip();
render();
account.refresh().then(render, render);
