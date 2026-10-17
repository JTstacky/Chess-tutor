// Pilot screen: one panel to pick, create, delete and launch pilots, like an MMO's character select.
// It replaces the title screen's Mac dialogs (New Pilot DLOG 3100, the ship-name DLOG 3001, the replace
// question DLOG 3002 and the Standard File "Open Pilot" picker). RECONSTRUCTED: docs/re-gaps.md #64.
// It is a DOM overlay over the title art, with real <input> fields, so phone keyboards work. Pilots are
// still the browser's local saves (app.saves). The title screen's Enter Ship, Set Prefs, Quit and About are
// unchanged.
import { combatRating, shortDate, DEFAULT_PILOT_NAMES, DEFAULT_SHIP_NAMES } from '../engine/pilot.js';

const CSS = `
#pilots { position: fixed; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.6);
  font: 14px/1.4 Geneva, Verdana, sans-serif; color: #cfc; -webkit-tap-highlight-color: transparent; }
#pilots .pp { box-sizing: border-box; width: min(96vw, 760px); max-height: 94vh; overflow-y: auto; padding: 12px 14px 14px; background: #021;
  border: 1px solid #0a4; border-radius: 6px; }
#pilots header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
#pilots h2 { margin: 0; font-size: 17px; color: #fff; } #pilots h3 { margin: 0 0 6px; font-size: 13px; color: #8f8; text-transform: uppercase; letter-spacing: .08em; }
#pilots .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 600px) { #pilots .cols { grid-template-columns: 1fr; } }
#pilots ul { list-style: none; margin: 0 0 8px; padding: 0; max-height: 46vh; overflow-y: auto; border: 1px solid #0a4; border-radius: 4px; background: #010; }
#pilots li { padding: 7px 10px; min-height: 44px; box-sizing: border-box; border-bottom: 1px solid #063; cursor: pointer; }
#pilots li:last-child { border-bottom: 0; }
#pilots li.sel { background: #0a4a1a; } #pilots li b { color: #fff; font-size: 15px; } #pilots li small { display: block; color: #9c9; }
#pilots li .dead { color: #f88; margin-left: 6px; }
#pilots .empty { padding: 12px 10px; color: #9c9; }
#pilots button { min-height: 44px; padding: 0 16px; background: #133; color: #efe; border: 1px solid #3a8; border-radius: 5px; font: 600 15px Geneva, Verdana, sans-serif;
  cursor: pointer; touch-action: manipulation; }
#pilots button:disabled { opacity: .35; cursor: default; }
#pilots button.go { background: #1d6a2d; border-color: #6e6; } #pilots button.red { background: #411; border-color: #a44; color: #fdd; }
#pilots .row { display: flex; gap: 8px; flex-wrap: wrap; } #pilots .row button { flex: 1 1 auto; }
#pilots label { display: block; margin: 0 0 8px; color: #9c9; font-size: 13px; }
#pilots input[type=text] { display: block; box-sizing: border-box; width: 100%; min-height: 40px; margin-top: 3px; padding: 6px 8px; background: #000; color: #fff;
  border: 1px solid #3a8; border-radius: 4px; font: 16px Geneva, Verdana, sans-serif; }
#pilots .check { display: flex; gap: 8px; align-items: flex-start; color: #cfc; }
#pilots .check input { width: 22px; height: 22px; margin: 0; flex: none; }
#pilots .note { font-size: 12px; color: #9c9; margin: 0 0 8px; }
#pilots .confirm { margin: 0 0 8px; padding: 8px; border: 1px solid #a44; border-radius: 4px; background: #200; color: #fdd; }
#pilots .confirm p { margin: 0 0 8px; }
#pilots .msg { min-height: 1.2em; color: #fd8; font-size: 13px; margin: 0 0 6px; }
`;

const el = (tag, props = {}, parent) => { const e = Object.assign(document.createElement(tag), props); parent?.append(e); return e; };

export class PilotPanel {
  // mode 'new' starts in the create form, 'open' (or anything else) on the list. onClose runs when it closes;
  // onLaunch when the player launches the selected pilot (the title screen's Enter Ship).
  constructor(app, mode, { onClose, onLaunch, owner } = {}) {
    this.app = app; this.onClose = onClose; this.onLaunch = onLaunch; this.confirm = null; this.owner = owner;
    if (!document.getElementById('pilots-css')) document.head.append(el('style', { id: 'pilots-css', textContent: CSS }));
    this.sel = app.pilot?.name ?? app.saves.list()[0]?.name ?? null;
    this.build();
    if (mode === 'new' || !app.saves.list().length) this.focusNew(); else this.root.querySelector('.launch')?.focus();
    // closes itself when its title screen is no longer the one showing (a pilot launched some other way)
    const watch = () => { if (!this.root) return; if (this.owner && this.app.screen !== this.owner) this.close(); else requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
  }

  build() {
    const root = this.root = el('div', { id: 'pilots' }, document.body);
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Pilots');
    root.addEventListener('pointerdown', e => { if (e.target === root) this.close(); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelOrClose(); }
    });
    const pp = el('div', { className: 'pp' }, root);
    const head = el('header', {}, pp);
    el('h2', { textContent: 'Pilots' }, head);
    el('button', { textContent: 'Close ✕', onclick: () => this.close() }, head);
    // ACCOUNT LOGIN SLOT (docs/mmo-accounts.md). When the online server exists, a username + password form
    // (with sign-up and the one-time recovery code) goes here, above the columns. The list below then shows
    // the account's server-side pilots (up to MAX_PILOTS = 3) instead of app.saves, and Create/Delete call the
    // server. Single-player keeps using the local saves as now.
    const cols = el('div', { className: 'cols' }, pp);

    const left = el('section', {}, cols);
    el('h3', { textContent: 'Your pilots' }, left);
    this.list = el('ul', {}, left);
    this.leftConfirm = el('div', {}, left);
    const row = el('div', { className: 'row' }, left);
    this.launchBtn = el('button', { className: 'go launch', textContent: 'Launch ▶', onclick: () => this.launch() }, row);
    this.deleteBtn = el('button', { className: 'red', textContent: 'Delete', onclick: () => this.askDelete() }, row);

    const right = el('section', {}, cols);
    el('h3', { textContent: 'New pilot' }, right);
    const form = this.form = el('form', { autocomplete: 'off' }, right);
    form.addEventListener('submit', e => { e.preventDefault(); this.create(); });
    const lab1 = el('label', { textContent: 'Pilot name' }, form);
    this.nameIn = el('input', { type: 'text', maxLength: 31, autocapitalize: 'words', spellcheck: false, name: 'pilot' }, lab1);
    const lab2 = el('label', { textContent: 'Ship name' }, form);
    this.shipIn = el('input', { type: 'text', maxLength: 31, autocapitalize: 'words', spellcheck: false, name: 'ship' }, lab2);
    const chk = el('label', { className: 'check' }, form);
    this.strictIn = el('input', { type: 'checkbox', name: 'strict' }, chk);
    el('span', { textContent: 'Strict Play' }, chk);
    // the caption beside the original's Strict Play box (PICT 129)
    el('p', { className: 'note', textContent: 'If you check this box, when you’re dead, you’re dead: the pilot file is deleted when your ship is destroyed.' }, form);
    this.rightConfirm = el('div', {}, form);
    this.msg = el('p', { className: 'msg' }, form);
    this.createBtn = el('button', { className: 'go', type: 'submit', textContent: 'Create pilot' }, form);
    for (const i of [this.nameIn, this.shipIn]) i.addEventListener('input', () => this.refresh());
    this.nameIn.value = pick(DEFAULT_PILOT_NAMES); this.shipIn.value = pick(DEFAULT_SHIP_NAMES);
    this.refresh();
  }

  refresh() {
    const app = this.app, D = app.data, list = app.saves.list();
    if (this.sel && !list.some(p => p.name === this.sel)) this.sel = list[0]?.name ?? null;
    this.list.replaceChildren();
    if (!list.length) el('li', { className: 'empty', textContent: 'No pilots yet. Create one on the right.' }, this.list);
    for (const p of list) {
      const li = el('li', { className: p.name === this.sel ? 'sel' : '' }, this.list);
      li.dataset.name = p.name;
      el('b', { textContent: p.name }, li);
      if (this.killed(p.name)) el('span', { className: 'dead', textContent: 'killed' }, li);
      if (p.strict) el('span', { className: 'dead', textContent: 'strict', style: 'color:#fd8' }, li);
      el('small', { textContent: `${p.shipName ?? ''} – ${D.ship[p.shipType]?.name ?? ''}` }, li);
      el('small', { textContent: `${(p.credits ?? 0).toLocaleString('en-US')} cr · ${combatRating(D, p.kills ?? 0)} · ${p.date ? shortDate(p.date) : ''}` }, li);
      li.addEventListener('click', () => { this.select(p.name); });
      li.addEventListener('dblclick', () => { this.select(p.name); this.launch(); });
    }
    const has = !!this.sel;
    this.launchBtn.disabled = !has || this.killed(this.sel);
    this.deleteBtn.disabled = !has;
    this.createBtn.disabled = !this.nameIn.value.trim() || !this.shipIn.value.trim();
  }
  killed(name) { return !!(this.app.pilot?.killed && this.app.pilot.name === name); }

  // Picking a pilot loads it, as Open Pilot did (the title's pilot box shows it). The current pilot is not
  // reloaded unless it is dead, so a pilot created just now keeps its "fresh" start (tutorial at 50,50); a
  // killed pilot that isn't strict comes back from its last save, as in the original.
  select(name) {
    this.sel = name; this.clearConfirm();
    if (this.app.pilot?.name !== name || this.app.pilot?.killed) this.app.loadPilot(name);
    this.refresh();
  }
  launch() {
    if (!this.sel || this.killed(this.sel)) return;
    if (this.app.pilot?.name !== this.sel) this.app.loadPilot(this.sel);
    this.close(); this.onLaunch?.();
  }

  askDelete() {
    const name = this.sel; if (!name) return;
    this.showConfirm(this.leftConfirm, `Delete the pilot “${name}”? This can’t be undone.`, 'Delete', () => {
      this.app.saves.remove(name);
      if (this.app.pilot?.name === name) this.app.pilot = null;
      this.sel = null; this.refresh();
    });
  }

  // FUN_1004ef64's checks: a name is required (31 characters at most), and an existing pilot of that name is
  // only replaced after a yes (DLOG 3002). The ship name defaults to a random STR# 128 name.
  create() {
    const name = this.nameIn.value.trim().slice(0, 31), ship = this.shipIn.value.trim().slice(0, 31), strict = this.strictIn.checked;
    if (!name) { this.msg.textContent = 'Enter a pilot name.'; this.nameIn.focus(); return; }
    if (!ship) { this.msg.textContent = 'Enter a ship name.'; this.shipIn.focus(); return; }
    const make = () => {
      this.app.newPilot(name, strict, ship);
      this.sel = name; this.msg.textContent = `${name} is ready. Press Launch to fly.`;
      this.nameIn.value = pick(DEFAULT_PILOT_NAMES); this.shipIn.value = pick(DEFAULT_SHIP_NAMES); this.strictIn.checked = false;
      this.refresh(); this.launchBtn.focus();
    };
    if (this.app.saves.get(name)) this.showConfirm(this.rightConfirm, `A pilot named “${name}” already exists. Replace it with this new pilot?`, 'Replace', make);
    else make();
  }

  showConfirm(where, text, yesLabel, yes) {
    this.clearConfirm();
    const box = el('div', { className: 'confirm' }, where);
    el('p', { textContent: text }, box);
    const row = el('div', { className: 'row' }, box);
    el('button', { type: 'button', className: 'red', textContent: yesLabel, onclick: () => { this.clearConfirm(); yes(); } }, row);
    el('button', { type: 'button', textContent: 'Cancel', onclick: () => this.clearConfirm() }, row).focus();
    this.confirm = box;
  }
  clearConfirm() { this.confirm?.remove(); this.confirm = null; }
  cancelOrClose() { if (this.confirm) this.clearConfirm(); else this.close(); }

  focusNew() { this.nameIn.focus(); this.nameIn.select(); }

  // The title screen forwards keys that reach the game (not those typed into the fields).
  key(e) {
    if (e.key === 'Escape') this.cancelOrClose();
    else if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') this.launch();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = this.app.saves.list(), i = list.findIndex(p => p.name === this.sel);
      const j = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      if (list[j]) this.select(list[j].name);
    }
    return true;
  }
  // Drawn on the canvas each frame by the title screen: only a blocker, so the title's cells don't react
  // under the panel.
  draw(ctx, ui) { ui.hit(0, 0, 832, 624, () => { }); }
  close() { if (!this.root) return; this.root.remove(); this.root = null; this.onClose?.(); this.app.canvas?.focus(); }
  get open() { return !!this.root; }
}

function pick(a) { return a[Math.floor(Math.random() * Math.min(3, a.length))] ?? a[0]; }
