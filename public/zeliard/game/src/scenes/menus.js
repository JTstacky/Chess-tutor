// Overlays: the pause menu and the inventory (spell selection, magic items, the worn
// accessory, equipment, keys, crests and Tears) — the original's 201SELCT screen.
import { ctx, W, H, text, panel, COLORS, fade } from '../render/screen.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/save.js';
import { sheetNow } from '../core/assets.js';
import { Menu } from '../ui/widgets.js';
import { RULES, maxHp, xpNeeded, swordDamage } from '../game/character.js';
import { SPELLS, SPELL_ORDER } from '../game/spells.js';

export class PauseScene {
  constructor(game, under) {
    this.game = game;
    this.under = under;
    this.overlay = true;
    audio.sfx('menu_open', { vol: 0.5 });
    this.build();
  }
  build() {
    const g = this.game;
    const vol = (k) => `${Math.round(settings.get(k) * 10)}`;
    this.menu = new Menu([
      { label: 'Resume', value: 'resume' },
      { label: 'Music volume', right: vol('music'), onLeft: () => this.adj('music', -0.1), onRight: () => this.adj('music', 0.1) },
      { label: 'Sound volume', right: vol('sfx'), onLeft: () => this.adj('sfx', -0.1), onRight: () => this.adj('sfx', 0.1) },
      { label: 'Game speed', right: `${settings.get('speed') || 1}×`, onLeft: () => this.speed(-0.25), onRight: () => this.speed(0.25), hint: 'Like the original F9 speed setting.' },
      { label: 'Save game', value: 'save', disabled: !g.locals.some((l) => l.saveSlot >= 0), hint: this.saved || 'Saves right here. Continue on the title screen brings you back to this spot.' },
      { label: 'Add a second knight (couch)', value: 'couch', disabled: g.locals.length > 1 || !!g.coop, hint: 'Player 2 uses the arrow keys + , . /  or a second gamepad.' },
      { label: 'Quit to title', value: 'quit', hint: 'Progress is kept from your last visit to a Sage.' },
    ], { title: 'Paused', w: 380, x: W / 2 - 190, y: 120, onSelect: (it) => this.pick(it.value), onCancel: () => this.close() });
  }
  adj(k, d) { settings.set(k, Math.max(0, Math.min(1, Math.round((settings.get(k) + d) * 10) / 10))); audio.setVolumes(settings.get('music'), settings.get('sfx')); this.rebuild(); }
  speed(d) { const s = Math.max(0.5, Math.min(2, (settings.get('speed') || 1) + d)); settings.set('speed', s); this.game.speed = s; this.rebuild(); }
  rebuild() { const i = this.menu.i; this.build(); this.menu.i = i; }
  async pick(v) {
    const g = this.game;
    if (v === 'resume') this.close();
    else if (v === 'save') {
      const r = g.saveHere();
      this.saved = r === 'boss' ? "You can't save while a guardian is watching." : r ? 'Saved.' : 'Could not save (browser storage is blocked or full).';
      audio.sfx(r && r !== 'boss' ? 'menu_accept' : 'menu_cancel', { vol: 0.6 });
      this.rebuild();
    }
    else if (v === 'couch') {
      const { newCharacter } = await import('../game/character.js');
      const lead = g.leader.character;
      const c = newCharacter('Knight 2', lead.difficulty);
      Object.assign(c, { level: lead.level, xp: 0, sword: lead.sword, shield: lead.shield ? 'clay_shield' : null, shieldHp: lead.shield ? 30 : 0, spellsLearned: [...lead.spellsLearned], spell: lead.spell, bits: lead.bits });
      c.hp = maxHp(c);
      const l = g.addCouchPlayer(c);
      const w = this.under.world;
      if (w) { l.hero.place(g.leader.hero.cx + 30, g.leader.hero.feet); w.addHero(l.hero); }
      else if (this.under.npcs) l.hero.place(g.leader.hero.cx + 30, g.leader.hero.feet);
      g.toast('Player 2 joined! Arrows to move, , . / to jump, attack, cast.', '#8fd0ff');
      this.close();
    } else if (v === 'quit') {
      g.coop?.close?.();
      g.coop = null;
      const { TitleScene } = await import('./title.js');
      g.transition(() => new TitleScene(g));
    }
  }
  close() { this.game.pop(); }
  update() {
    const m = this.game.menu;
    if (m.pressed('pause')) { this.close(); return; }
    this.menu.update(m);
  }
  draw(t) {
    this.under?.draw(t);
    fade(0.55, '#05030a');
    this.menu.draw();
  }
}

export class InventoryScene {
  constructor(game, under, local) {
    this.game = game;
    this.under = under;
    this.local = local;
    this.overlay = true;
    this.tab = 0; // 0 magic, 1 items, 2 gear
    this.i = 0;
    audio.sfx('menu_open', { vol: 0.5 });
  }
  get c() { return this.local.character; }
  rows() {
    const c = this.c;
    if (this.tab === 0) return SPELL_ORDER.map((id) => ({ id, label: SPELLS[id].name, have: c.spellsLearned.includes(id), right: `${c.charges[id] ?? 0}/${c.maxCharges[id] ?? 0}`, sel: c.spell === id, hint: SPELLS[id].desc ? `The Magic Spell of ${SPELLS[id].desc.replace(/^the Magic Spell of /, '').replace(/:.*/, '')}. Damage ${SPELLS[id].dmg}.` : '' }));
    if (this.tab === 1) return Array.from({ length: 5 }, (_, k) => { const id = c.items[k]; return { id, slot: k, label: id ? RULES.items[id]?.name || id : '— empty —', have: !!id, hint: id ? RULES.items[id]?.effect : '' }; });
    return c.accessories.map((id) => ({ id, label: RULES.items[id]?.name || id, have: true, sel: c.worn === id, hint: RULES.items[id]?.effect }));
  }
  update() {
    // The Items key closes the screen, except Enter, which is both P2's Items key and "use".
    const m = this.local.input.pressed('menu') && !this.game.menu.pressed('confirm') ? null : this.game.menu;
    if (!m || m.pressed('cancel') || m.pressed('pause')) { this.game.pop(); return; }
    const rows = this.rows();
    if (m.pressed('left')) { this.tab = (this.tab + 2) % 3; this.i = 0; audio.sfx('menu_move', { vol: 0.4 }); }
    if (m.pressed('right')) { this.tab = (this.tab + 1) % 3; this.i = 0; audio.sfx('menu_move', { vol: 0.4 }); }
    if (m.pressed('up') && rows.length) { this.i = (this.i + rows.length - 1) % rows.length; audio.sfx('menu_move', { vol: 0.4 }); }
    if (m.pressed('down') && rows.length) { this.i = (this.i + 1) % rows.length; audio.sfx('menu_move', { vol: 0.4 }); }
    if (m.pressed('confirm') || m.pressed('attack')) {
      const r = rows[this.i];
      if (!r || !r.have) { audio.sfx('menu_cancel', { vol: 0.4 }); return; }
      const c = this.c;
      if (this.tab === 0) { c.spell = r.id; audio.sfx('menu_accept', { vol: 0.5 }); }
      else if (this.tab === 1) {
        const world = this.under.world || null;
        if (!world && ['magia_stone', 'kioku_feather', 'sabre_oil'].includes(r.id)) { this.game.toast('That can only be used in the caverns.', '#bbb'); return; }
        if (this.game.useItem(this.local, r.slot, world)) { this.game.pop(); }
      } else { c.worn = c.worn === r.id ? null : r.id; this.game.refresh(this.local); audio.sfx('menu_accept', { vol: 0.5 }); }
    }
  }
  draw(t) {
    this.under?.draw(t);
    fade(0.6, '#05030a');
    const c = this.c;
    panel(60, 40, W - 120, H - 80);
    text(`${c.name}`, 90, 60, { size: 22, color: COLORS.gold });
    text(`Level ${c.level}   HP ${c.hp}/${maxHp(c)}   XP ${c.xp}/${xpNeeded(c)}`, 90, 92, { size: 15 });
    text(`Gold ${c.gold}   Almas ${c.almas}   Keys ${c.keys}${c.lionKeys ? `   Lion's Head Keys ${c.lionKeys}` : ''}   Tears ${c.tears}/9`, 90, 114, { size: 15, color: COLORS.dim });
    // Equipment column
    const sw = RULES.swords[c.sword], sh = RULES.shields[c.shield];
    text('Sword', 620, 60, { size: 14, color: COLORS.dim });
    text(`${sw?.name || '—'}  (${swordDamage(c)} dmg${c.sabreOil ? `, oil ×${c.sabreOil + 1}` : ''})`, 620, 78, { size: 15 });
    text('Shield', 620, 102, { size: 14, color: COLORS.dim });
    text(sh ? `${sh.name}  ${c.shieldHp}/${sh.power}` : 'none', 620, 120, { size: 15 });
    text(`Crests: ${c.crests.map((x) => RULES.items[x]?.name || x).join(', ') || '—'}`, 620, 144, { size: 13, color: COLORS.dim });
    // Tabs
    const tabs = ['Magic', 'Items', 'Wearables'];
    tabs.forEach((n, k) => {
      const x = 90 + k * 150;
      if (k === this.tab) { ctx.fillStyle = 'rgba(242,200,91,0.18)'; ctx.fillRect(x - 10, 168, 140, 30); }
      text(n, x + 60, 174, { size: 18, align: 'center', color: k === this.tab ? '#fff4c8' : COLORS.dim });
    });
    text('◀ ▶ switch   ▲▼ choose   Enter: select / use / wear   Esc: close', W / 2, H - 70, { size: 13, align: 'center', color: COLORS.dim });
    const rows = this.rows();
    if (!rows.length) text(this.tab === 2 ? 'No shoes or capes yet.' : 'Nothing here.', 120, 220, { size: 16, color: COLORS.dim });
    rows.forEach((r, k) => {
      const y = 214 + k * 30;
      if (k === this.i) { ctx.fillStyle = 'rgba(242,200,91,0.14)'; ctx.fillRect(84, y - 4, 520, 28); text('▶', 92, y, { size: 16, color: COLORS.gold }); }
      text((r.sel ? '★ ' : '') + (r.have ? r.label : this.tab === 0 ? '???' : r.label), 116, y, { size: 18, color: r.have ? (r.sel ? '#fff4c8' : COLORS.ink) : '#6a6070' });
      if (r.right && r.have) text(r.right, 590, y + 2, { size: 15, align: 'right', color: COLORS.magic });
    });
    const hint = rows[this.i]?.have ? rows[this.i].hint : '';
    if (hint) text(hint, 640, 214, { size: 14, color: COLORS.dim });
    const icon = sheetNow('hero.idle');
    if (icon) icon.draw(ctx, 0, 780, 430, 1, 1, 1.3);
  }
}
