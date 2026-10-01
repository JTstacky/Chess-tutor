// Title screen and front-end menus: new game (slot, name, difficulty), continue,
// co-op (host / join / couch / same-PC), options and credits.
import { ctx, W, H, text, panel, COLORS, drawCover, fade } from '../render/screen.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { image } from '../core/assets.js';
import { listSlots, loadSlot, settings, deleteSlot, exportSaves, importSaves } from '../core/save.js';
import { Menu } from '../ui/widgets.js';
import { newCharacter } from '../game/character.js';
import { fmt } from '../core/util.js';

const DIFF_HINT = {
  english: 'The 1990 Sierra English release balance. Recommended.',
  japanese: 'The original 1987 Japanese balance: harsher damage and prices, and death returns you to the last town you visited.',
};

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.stack = [];
    image('art/ui/title_keyart.png').then((i) => { this.bg = i; });
    image('art/ui/logo.png').then((i) => { this.logo = i; });
    this.showMain();
  }
  enter() { audio.playMusic('lantern_overture'); }

  setMenu(m) { this.menu = m; }

  showMain() {
    const hasSave = listSlots().some(Boolean);
    this.pressStart = !this.started;
    this.setMenu(new Menu([
      { label: 'New Game', value: 'new' },
      { label: 'Continue', value: 'continue', disabled: !hasSave },
      { label: 'Co-op', value: 'coop', hint: 'Play with friends online, or two knights on one keyboard.' },
      { label: 'Options', value: 'options' },
      { label: 'Credits', value: 'credits' },
    ], { y: 330, w: 260, x: W / 2 - 130, center: true, onSelect: (it) => this.pick(it.value) }));
  }

  slotItems(forNew) {
    return listSlots().map((s, i) => ({
      label: s ? `${i + 1}. ${s.name}` : `${i + 1}. — empty —`,
      right: s ? `Lv ${s.level}  ${s.difficulty === 'japanese' ? 'JP' : 'EN'}  ${fmt((s.playTime || 0) / 60)}m` : '',
      value: i,
      disabled: !forNew && !s,
    }));
  }

  pick(v) {
    const g = this.game;
    if (v === 'new') {
      this.setMenu(new Menu(this.slotItems(true), {
        title: 'Choose a save slot', w: 420, x: W / 2 - 210, y: 280,
        onSelect: (it) => this.nameEntry(it.value), onCancel: () => this.showMain(),
      }));
    } else if (v === 'continue') {
      this.setMenu(new Menu(this.slotItems(false), {
        title: 'Continue', w: 420, x: W / 2 - 210, y: 280,
        onSelect: (it) => g.continueGame(loadSlot(it.value), it.value), onCancel: () => this.showMain(),
      }));
    } else if (v === 'coop') {
      this.setMenu(new Menu([
        { label: 'Host an online game', value: 'host', hint: 'Friends join with a 4-letter room code. Your world, their knights.' },
        { label: 'Join an online game', value: 'join', hint: 'Enter a friend\'s room code. Bring one of your own knights, or join as the Spirit of Esmesanti.' },
        { label: 'Couch co-op (2 players)', value: 'couch', hint: 'P1: WASD + Space/J/K.   P2: Arrows + , . /   (gamepads work too)' },
        { label: 'Two windows on this PC', value: 'local', hint: 'Open the game in a second window and choose "Join" there with the same code.' },
      ], { title: 'Co-op', w: 380, x: W / 2 - 190, y: 290, onSelect: (it) => g.openCoop(this, it.value), onCancel: () => this.showMain() }));
    } else if (v === 'options') this.options();
    else if (v === 'credits') this.credits = 0;
  }

  nameEntry(slot) {
    const existing = loadSlot(slot);
    this.naming = { slot, name: settings.get('name') || 'Duke', overwrite: !!existing };
    input.textCapture = (e) => {
      const n = this.naming;
      if (!n) return;
      if (e.code === 'Backspace') n.name = n.name.slice(0, -1);
      else if (e.code === 'Enter') { input.textCapture = null; if (n.name.trim()) this.chooseDifficulty(n.slot, n.name.trim()); }
      else if (e.code === 'Escape') { input.textCapture = null; this.naming = null; this.showMain(); }
      else if (e.key.length === 1 && n.name.length < 10 && /[\w .'-]/.test(e.key)) n.name += e.key;
    };
    this.menu = null;
  }

  chooseDifficulty(slot, name) {
    this.naming = null;
    settings.set('name', name);
    this.setMenu(new Menu([
      { label: 'English (Sierra, 1990)', value: 'english', hint: DIFF_HINT.english },
      { label: 'Japanese (Game Arts, 1987)', value: 'japanese', hint: DIFF_HINT.japanese },
    ], {
      title: 'Balance', w: 420, x: W / 2 - 210, y: 300,
      onSelect: (it) => {
        const c = newCharacter(name, it.value);
        if (loadSlot(slot)) deleteSlot(slot);
        this.game.beginNewGame(c, slot);
      },
      onCancel: () => this.showMain(),
    }));
  }

  options() {
    const g = this.game;
    const vol = (k) => `${Math.round(settings.get(k) * 10)}`;
    const items = [
      { label: 'Music volume', right: vol('music'), onLeft: () => this.adj('music', -0.1), onRight: () => this.adj('music', 0.1) },
      { label: 'Sound volume', right: vol('sfx'), onLeft: () => this.adj('sfx', -0.1), onRight: () => this.adj('sfx', 0.1) },
      { label: 'Game speed', right: `${settings.get('speed') || 1}×`, onLeft: () => this.adjSpeed(-0.25), onRight: () => this.adjSpeed(0.25), hint: 'Like the original F9 speed control.' },
      { label: 'Controls', value: 'controls' },
      { label: 'Back up saves to a file', value: 'export', hint: this.saveNote || 'Downloads your three save slots as a .json file.' },
      { label: 'Restore saves from a file', value: 'import', hint: 'Replaces the slots that are in the file.' },
      { label: 'Back', value: 'back' },
    ];
    this.setMenu(new Menu(items, {
      title: 'Options', w: 420, x: W / 2 - 210, y: 250,
      onSelect: (it) => {
        if (it.value === 'back') this.showMain();
        else if (it.value === 'controls') this.controls = true;
        else if (it.value === 'export') { const n = exportSaves(); this.saveNote = `Backed up ${n} knight${n === 1 ? '' : 's'}.`; this.reopenOptions(); }
        else if (it.value === 'import') importSaves().then((n) => { this.saveNote = n ? `Restored ${n} knight${n === 1 ? '' : 's'}.` : 'Nothing restored.'; this.reopenOptions(); }, (e) => { this.saveNote = e.message; this.reopenOptions(); });
      },
      onCancel: () => this.showMain(),
    }));
    this.optionsOpen = true;
  }
  reopenOptions() { const i = this.menu?.i ?? 0; this.options(); this.menu.i = i; }
  adj(k, d) { settings.set(k, Math.max(0, Math.min(1, Math.round((settings.get(k) + d) * 10) / 10))); audio.setVolumes(settings.get('music'), settings.get('sfx')); const i = this.menu.i; this.options(); this.menu.i = i; }
  adjSpeed(d) { const s = Math.max(0.5, Math.min(2, (settings.get('speed') || 1) + d)); settings.set('speed', s); this.game.speed = s; const i = this.menu.i; this.options(); this.menu.i = i; }

  update(dt) {
    this.t += dt;
    const m = this.game.menu;
    if (this.credits != null) { this.credits += dt; if (m.pressed('confirm') || m.pressed('cancel')) this.credits = null; return; }
    if (this.controls) { if (m.pressed('confirm') || m.pressed('cancel')) this.controls = false; return; }
    if (this.pressStart) {
      if (m.pressed('confirm') || m.pressed('attack') || m.pressed('jump') || m.pressed('pause')) { this.pressStart = false; this.started = true; audio.sfx('menu_accept'); }
      return;
    }
    if (this.naming) return;
    this.menu?.update(m);
  }

  draw(t) {
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, W, H);
    if (this.bg) {
      const drift = Math.sin(this.t * 0.05) * 20;
      drawCover(this.bg, -30 + drift, -20, W + 60, H + 40);
      fade(0.15);
    }
    // falling sand motes, as in Zeliard's opening
    ctx.fillStyle = 'rgba(230,200,150,0.5)';
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5 + this.t * (18 + (i % 5) * 6)) % W;
      const y = (i * 91.3 + this.t * (40 + (i % 7) * 9)) % H;
      ctx.fillRect(x, y, 2, 2);
    }
    if (this.logo) {
      const s = Math.min(560 / this.logo.width, 250 / this.logo.height);
      ctx.save(); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.logo, W / 2 - (this.logo.width * s) / 2, 40, this.logo.width * s, this.logo.height * s);
      ctx.restore();
    } else {
      text('BELIARDS', W / 2, 90, { size: 64, align: 'center', color: '#e8423a', weight: 700 });
      text('A ZELIARD REMAKE', W / 2, 170, { size: 20, align: 'center', color: COLORS.gold });
    }
    if (this.credits != null) return this.drawCredits();
    if (this.controls) return this.drawControls();
    if (this.pressStart) {
      if (Math.floor(this.t * 2) % 2 === 0) text('PRESS ENTER', W / 2, 380, { size: 24, align: 'center', color: COLORS.ink });
      text('Zeliard © 1987 Game Arts · English edition 1990 Sierra On-Line. Fan remake.', W / 2, H - 28, { size: 12, align: 'center', color: COLORS.dim });
      return;
    }
    if (this.naming) {
      panel(W / 2 - 220, 300, 440, 120);
      text('Name your knight', W / 2, 318, { size: 18, align: 'center', color: COLORS.gold });
      const caret = Math.floor(this.t * 2) % 2 ? '_' : ' ';
      text(this.naming.name + caret, W / 2, 352, { size: 26, align: 'center' });
      text('Type a name, Enter to confirm, Esc to go back', W / 2, 394, { size: 13, align: 'center', color: COLORS.dim });
      return;
    }
    this.menu?.draw();
  }

  drawControls() {
    panel(140, 220, W - 280, 280);
    const rows = [
      ['Move / climb', 'Arrows or WASD'], ['Jump', 'Z, Space or L'], ['Sword', 'X or J   (Up+Sword = overhead, Down = crouch slash,'],
      ['', '         Down+Sword in the air = downward thrust)'], ['Magic', 'C or K'], ['Enter doors / talk', 'Up'],
      ['Inventory', 'Enter, I or Tab'], ['Pause', 'Esc or P'], ['Gamepad', 'A jump · X sword · B magic · Y items · Start pause'],
    ];
    rows.forEach(([a, b], i) => { text(a, 170, 240 + i * 27, { size: 16, color: COLORS.gold }); text(b, 360, 240 + i * 27, { size: 16 }); });
  }

  drawCredits() {
    panel(140, 220, W - 280, 280);
    const lines = [
      'Beliards — a fan remake of Zeliard',
      'Original game: Game Arts (1987) · English release: Sierra On-Line (1990)',
      'Remastered art: OpenAI Codex image model, directed for this remake',
      'Code: Claude (Anthropic) · Music & sound: synthesised for Beliards',
      'Level data and rules extracted from the Sierra DOS release',
      'Japanese text translated from the original 1987 versions',
      'Reverse-engineering references: nolanvenhola/zeliard, thedragonheir/Zeliard',
      'Font: Pixelify Sans (SIL Open Font License)',
    ];
    lines.forEach((l, i) => text(l, W / 2, 244 + i * 30, { size: i === 0 ? 20 : 15, align: 'center', color: i === 0 ? COLORS.gold : COLORS.ink }));
  }
}
