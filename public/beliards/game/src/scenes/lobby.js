// Co-op lobby (an overlay on the title screen).
//   host  — pick a knight, open a room online; friends join with its 4-letter code
//   join  — type a code, then bring a saved knight, a new squire, or come as the
//           Spirit of Esmesanti (a fairy who blesses knights and dazzles monsters)
//   couch — two knights on one keyboard / two gamepads
//   local — the same as host/join, but between two windows of this browser
import { W, text, panel, COLORS, fade } from '../render/screen.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { listSlots, loadSlot, deleteSlot, settings } from '../core/save.js';
import { Menu } from '../ui/widgets.js';
import { newCharacter, maxHp } from '../game/character.js';
import { Session, makeRoomCode } from '../net/net.js';
import { Coop, joinParty } from '../net/coop.js';

const DIFF = [
  { label: 'English (Sierra, 1990)', value: 'english', hint: 'The Sierra English release balance. Recommended.' },
  { label: 'Japanese (Game Arts, 1987)', value: 'japanese', hint: 'The original Japanese balance: harsher, and death returns you to the last Sage.' },
];

export class CoopLobby {
  constructor(game, under, mode) {
    this.game = game;
    this.under = under;
    this.overlay = true;
    this.t = 0;
    this.transport = mode === 'local' ? 'local' : 'peer';
    this.msg = null; // { title, lines, onOk }
    if (mode === 'host') this.hostFlow();
    else if (mode === 'join') this.joinFlow();
    else if (mode === 'couch') this.couchFlow();
    else this.localFlow();
  }

  close() { input.textCapture = null; this.game.pop(); }
  setMenu(m) { this.menu = m; this.msg = null; }
  say(title, lines, onOk) { this.menu = null; this.msg = { title, lines, onOk }; }

  // ------------------------------------------------------------ knight choice
  // cb({ character, slot, isNew }) — a saved knight continues; an empty slot starts a new one.
  pickKnight(title, cb, { exclude = -1, extras = [], allowNew = true, newName } = {}) {
    const items = listSlots().map((s, i) => ({
      label: s ? `${i + 1}. ${s.name}` : `${i + 1}. — new knight —`,
      right: s ? `Lv ${s.level}  ${s.difficulty === 'japanese' ? 'JP' : 'EN'}` : '',
      value: i,
      disabled: i === exclude || (!s && !allowNew),
    }));
    this.setMenu(new Menu([...items, ...extras], {
      title, w: 440, x: W / 2 - 220, y: 200,
      onCancel: () => this.close(),
      onSelect: (it) => {
        if (typeof it.value !== 'number') { it.pick(); return; }
        const saved = loadSlot(it.value);
        if (saved) { cb({ character: saved, slot: it.value, isNew: false }); return; }
        this.setMenu(new Menu(DIFF, {
          title: 'Balance', w: 420, x: W / 2 - 210, y: 240, onCancel: () => this.close(),
          onSelect: (d) => {
            if (loadSlot(it.value)) deleteSlot(it.value);
            cb({ character: newCharacter(newName || settings.get('name') || 'Duke', d.value), slot: it.value, isNew: true });
          },
        }));
      },
    }));
  }

  start(pick) {
    const g = this.game;
    input.textCapture = null;
    if (pick.isNew) g.beginNewGame(pick.character, pick.slot);
    else g.continueGame(pick.character, pick.slot);
  }

  // ------------------------------------------------------------ host
  hostFlow() {
    this.pickKnight(this.transport === 'local' ? 'Host on this PC — your knight' : 'Host online — your knight', (pick) => this.openRoom(pick));
  }
  async openRoom(pick) {
    const g = this.game;
    this.say('Opening a room…', [this.transport === 'local' ? 'Setting up a room for another window of this browser.' : 'Reaching the matchmaking server.']);
    let session;
    try {
      for (let tries = 0; ; tries++) {
        session = new Session({ room: makeRoomCode(), isHost: true, transport: this.transport });
        try { await session.start(); break; } catch (e) { session.close(); if (tries >= 2 || !/taken/.test(e.message)) throw e; }
      }
    } catch (e) {
      this.say('Could not open a room', [e.message || String(e), '', 'Press Enter to go back.'], () => this.close());
      return;
    }
    g.coop = new Coop(g, session);
    this.say(`Room code: ${session.room}`, [
      this.transport === 'local' ? 'In another window of this browser, choose Co-op → Two windows on this PC → Join,' : 'Give this code to your friends. They choose Co-op → Join an online game',
      'and type the code. They can join at any time while you play.',
      '', 'Press Enter to set out.',
    ], () => this.start(pick));
    audio.sfx('menu_accept');
  }

  // ------------------------------------------------------------ join
  joinFlow() {
    this.code = '';
    this.menu = null;
    this.msg = null;
    this.typing = true;
    input.textCapture = (e) => {
      if (!this.typing) return;
      if (e.code === 'Backspace') this.code = this.code.slice(0, -1);
      else if (e.code === 'Escape') this.close();
      else if (e.code === 'Enter') { if (this.code.length === 4) { this.typing = false; input.textCapture = null; this.chooseGuest(); } }
      else if (/^[a-zA-Z]$/.test(e.key) && this.code.length < 4) this.code += e.key.toUpperCase();
    };
  }
  chooseGuest() {
    const extras = [
      { label: 'A new squire', value: 'squire', hint: 'A fresh level-1 knight just for this adventure (not saved).', pick: () => this.connect({ character: this.squire(), slot: -1 }) },
      { label: 'The Spirit of Esmesanti', value: 'fairy', hint: 'Fly as a fairy: Sword blesses a knight (+40 HP), Magic dazzles nearby monsters. Can\'t fall.', pick: () => this.connect({ character: newCharacter('Esmesanti', 'english'), slot: -1 }, true) },
    ];
    this.pickKnight(`Join room ${this.code} — who are you?`, (pick) => this.connect(pick), { extras, allowNew: false });
  }
  squire() {
    const c = newCharacter(settings.get('name') || 'Squire', 'english');
    c.shield = 'clay_shield';
    c.shieldHp = 30;
    c.hp = maxHp(c);
    return c;
  }
  async connect(pick, fairy = false) {
    this.say(`Joining room ${this.code}…`, ['Looking for the host.']);
    const session = new Session({ room: this.code, isHost: false, transport: this.transport });
    try {
      await session.start();
      input.textCapture = null;
      await joinParty(this.game, session, pick.character, pick.slot, { fairy });
    } catch (e) {
      session.close();
      this.game.coop = null;
      this.say('Could not join', [e.message || String(e), '', 'Press Enter to go back.'], () => this.close());
    }
  }

  // ------------------------------------------------------------ couch
  couchFlow() {
    this.pickKnight('Couch co-op — Player 1 (WASD + Space/J/K)', (p1) => {
      const extras = [{ label: 'A squire at Player 1\'s level', value: 'squire', hint: 'Not saved: a companion knight for this session.', pick: () => this.startCouch(p1, null) }];
      this.pickKnight('Player 2 (Arrows + , . /)', (p2) => this.startCouch(p1, p2), { exclude: p1.slot, extras, newName: 'Knight 2' });
    });
  }
  startCouch(p1, p2) {
    const g = this.game;
    this.start(p1);
    let c, slot = -1;
    if (p2) { c = p2.character; slot = p2.slot; }
    else {
      const lead = p1.character;
      c = newCharacter('Knight 2', lead.difficulty);
      Object.assign(c, { level: lead.level, sword: lead.sword, shield: 'clay_shield', shieldHp: 30, spellsLearned: [...(lead.spellsLearned || [])], spell: lead.spell });
      c.hp = maxHp(c);
    }
    const l = g.addCouchPlayer(c);
    l.saveSlot = slot;
    g.toast('Two knights! P2: Arrows to move, , . / to jump, attack, cast.', '#8fd0ff');
  }

  // ------------------------------------------------------------ two windows
  localFlow() {
    this.setMenu(new Menu([
      { label: 'Host in this window', value: 'host', hint: 'Then open the game in another window and join with the code.' },
      { label: 'Join from this window', value: 'join', hint: 'Type the code shown in the hosting window.' },
    ], { title: 'Two windows on this PC', w: 380, x: W / 2 - 190, y: 260, onCancel: () => this.close(), onSelect: (it) => (it.value === 'host' ? this.hostFlow() : this.joinFlow()) }));
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.t += dt;
    const m = this.game.menu;
    if (this.typing) return;
    if (this.msg) {
      if (this.msg.onOk && (m.pressed('confirm') || m.pressed('attack'))) { audio.sfx('menu_accept', { vol: 0.5 }); const f = this.msg.onOk; this.msg.onOk = null; f(); }
      else if (m.pressed('cancel') && this.msg.onOk) { this.game.coop?.close(); this.game.coop = null; this.close(); }
      return;
    }
    this.menu?.update(m);
  }

  draw() {
    fade(0.6, '#05030a');
    if (this.typing) {
      panel(W / 2 - 220, 220, 440, 140);
      text('Room code', W / 2, 238, { size: 18, align: 'center', color: COLORS.gold });
      const caret = Math.floor(this.t * 2) % 2 ? '_' : ' ';
      text((this.code + caret).padEnd(4, ' ').split('').join(' '), W / 2, 274, { size: 34, align: 'center' });
      text('Type the 4 letters, Enter to join, Esc to go back', W / 2, 330, { size: 13, align: 'center', color: COLORS.dim });
      return;
    }
    if (this.msg) {
      const n = this.msg.lines.length;
      panel(W / 2 - 300, 190, 600, 70 + n * 22);
      text(this.msg.title, W / 2, 206, { size: 22, align: 'center', color: COLORS.gold });
      this.msg.lines.forEach((l, i) => text(l, W / 2, 244 + i * 22, { size: 15, align: 'center' }));
      return;
    }
    this.menu?.draw();
  }
}
