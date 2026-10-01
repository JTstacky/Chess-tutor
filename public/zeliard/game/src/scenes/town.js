// A town (or Felishika's Castle): a side-scrolling street with the original building
// doors, townsfolk and edge exits from data/world/towns/<id>.json, plus the services,
// NPC lines and their save-byte conditions from data/rules/towns.json.
// Knights only walk here (no jumping or fighting, as in the original).
import { ctx, W, H, text, panel, COLORS, wrap } from '../render/screen.js';
import { loadJSON, preloadSheets, sheetNow, image, spriteIds } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { TILE } from '../world/tilemap.js';
import { Dialogue } from '../ui/widgets.js';
import { TOWNS, townByPlace } from '../game/game.js';
import { drawKnightHud } from './cavern.js';
import { evalCondition } from '../game/conditions.js';
import { RULES, maxHp } from '../game/character.js';
import { walkFrame } from '../game/hero.js';
import { drawShield, shieldOf } from '../game/shields.js';

const STREET = H - 64; // feet line
const MUSIC = { cmap: 'royal_hall', mrmp: 'lantern_overture', esmp: 'lantern_overture' };
const NPC_SPRITES = ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'c0', 'c1', 'c2', 'c3'];
// The townsfolk art was painted at one canvas size, so everyone came out about 80 px tall: the
// halberd guard's body (72 px under his spear) looked smaller than the old man's, and the boy and
// girl stood as tall as the adults. Scale each so heights read right next to the knight (84 px).
const NPC_SCALE = { b1: 1.18, c0: 1.1, a2: 1.04, c3: 1.02, b0: 0.97, b3: 0.84, a3: 0.84 };
// Two painted walk frames (contact poses) plus the standing frame as the passing pose, one frame
// per NPC_STEP px walked, with a 1 px rise on the passing pose.
const NPC_WALK = [0, 2, 1, 2], NPC_STEP = 9;
const SERVICE_LABEL = {
  weapons_and_armour_shop: 'Weapons & Armour', church: 'Church', magic_shop: 'Witchcraft Shop', bank: 'Bank', sage: 'Sage',
  inn: 'Inn', cavern_entrance: 'Labyrinth', king: 'King of Felishika', princess_chamber: "Princess's Chamber", trap_warp_to_dorado: '???',
};

export class TownScene {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.mapId = opts.mapId;
    this.t = 0;
    this.ready = false;
    this.cam = { x: 0 };
    this.load().catch((e) => { console.error(e); this.error = String(e); });
  }

  async load() {
    const g = this.game;
    this.map = await loadJSON(`data/world/towns/${this.mapId}.json`);
    const key = TOWNS[this.mapId]?.key;
    this.rules = g.data.rules.towns?.towns?.find((t) => t.id === key) || {};
    this.key = key;
    this.width = this.map.width * TILE;
    this.buildings = (this.map.doors || []).map((d) => {
      const b = this.rules.buildings?.find((x) => x.door_index === d.index) || {};
      return { ...d, service: b.service || d.kind, program: b.program, sprite: `art.town.${key}.${b.service || d.kind}` };
    });
    // Townsfolk: world positions + the rules' conditional lines.
    this.npcs = (this.map.npcs || []).map((n, i) => {
      const r = this.rules.npcs?.find((x) => x.npc_index === n.index) || {};
      return {
        n, r, x: (n.x + 1.5) * TILE, dir: n.facingLeft ? -1 : 1, home: (n.x + 1.5) * TILE, t: Math.random() * 3,
        sprite: `art.npc.${NPC_SPRITES[(n.headTile ? parseInt(n.headTile, 16) : i * 5 + this.map.width) % NPC_SPRITES.length]}`,
        ai: n.ai ?? r.ai_type ?? 7, auto: n.autoTalk || r.auto_talk,
      };
    });
    // Extra NPCs that only exist in special states (e.g. the castle's ending herald).
    for (const r of this.rules.npcs || []) {
      if (r.npc_index >= 0 || !this.lineFor(r)) continue;
      this.npcs.push({ n: { x: r.x }, r, x: (r.x + 1.5) * TILE, dir: -1, home: (r.x + 1.5) * TILE, t: 0, sprite: 'art.npc.a0', ai: 3, auto: r.auto_talk });
    }
    const bounds = this.map.patrolBounds;
    this.patrol = Array.isArray(bounds) && bounds.length >= 2 ? [bounds[0] * TILE, bounds[1] * TILE] : [2 * TILE, this.width - 2 * TILE];
    await preloadSheets([...new Set([...this.buildings.map((b) => b.sprite), `art.town.${key}.filler1`, `art.town.${key}.filler2`, ...this.npcs.map((n) => n.sprite), 'hero.walk', 'hero.idle'])]);
    this.bg = await image(`art/towns/town_${key}_bg.raw.png`);
    // Place the knights.
    let x = this.opts.x;
    if (x == null || x === 'destWidth-6') x = x === 'destWidth-6' ? this.map.width - 6 : this.map.sageRespawnX ?? 10;
    const c0 = g.leader.character;
    g.locals.forEach((l, i) => {
      const h = l.hero;
      h.state = 'idle'; h.attack = null; h.h = 70; h.castT = 0;
      // A fallen knight the party carried along wakes like a rekindled one (never at 0 HP).
      if (l.character.hp <= 0 && !h.fairy) l.character.hp = Math.ceil(maxHp(l.character) * 0.3);
      h.place((x + 1.5) * TILE + i * 34, STREET);
      h.dir = this.opts.face === 'left' ? -1 : 1;
      if (this.opts.x === 'destWidth-6' || (this.opts.face == null && x > this.map.width / 2 && this.opts.fromEdge)) h.dir = -1;
    });
    this.cam.x = this.clampCam(g.leader.hero.cx - W / 2);
    // Entering any town clears Sabre Oil; record where we are for Continue.
    for (const l of g.locals) {
      l.character.sabreOil = 0;
      l.character.location = { map: this.mapId, x };
      if (this.mapId !== 'cmap') l.character.lastTown = this.mapId;
    }
    if (this.mapId === 'mrmp' && !g.getByte('0x06')) { /* first steps in Muralla */ }
    g.save();
    audio.playMusic(MUSIC[this.mapId] || 'lantern_overture');
    this.ready = true;
    g.coop?.enterTown?.(this);
    if (this.opts.wake) {
      const sage = this.rules.sage?.name || 'the Sage';
      this.say([{ speaker: sage, text: 'Brave knight, the Spirits have carried you back to me. Rest now, and take heart.' }]);
    } else if (this.opts.feather) g.toast('The Kioku Feather carried you home.', '#bfe8ff');
  }

  clampCam(x) { return Math.max(0, Math.min(x, this.width - W)); }

  // The line an NPC says now: the last entry whose condition holds.
  lineFor(r) {
    const lines = r.lines || [];
    let pick = null;
    for (const l of lines) if (evalCondition(l.condition, this.game)) pick = l;
    return pick;
  }

  say(pages, onDone) {
    this.dialogue = new Dialogue(pages, { onDone: () => { this.dialogue = null; onDone?.(); } });
  }

  update(dt) {
    if (!this.ready) return;
    const g = this.game;
    this.t += dt;
    if (this.dialogue) { this.dialogue.update(dt, g.menu); return; }
    if (g.menu.pressed('pause')) { g.openPause(this); return; }
    for (const l of g.locals) if (l.input.pressed('menu')) { g.openInventory(this, l); return; }
    for (const n of this.npcs) this.updateNpc(n, dt);
    for (const l of g.locals) {
      const h = l.hero, inp = l.input;
      h.animT += dt;
      const move = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (move) { h.dir = move; h.x += move * 230 * dt; h.state = 'walk'; } else h.state = 'idle';
      // Townsfolk who block the path, and the special tiles listed for the bank.
      for (const n of this.npcs) if (this.npcFlags(n) & 0x40 && Math.abs(n.x - h.cx) < 44 && Math.sign(n.x - h.cx) === move) h.x -= move * 230 * dt;
      // Edges lead to the next town or a cavern.
      if (h.x < 0.5 * TILE) { if (this.leave('left')) return; h.x = 0.5 * TILE; }
      if (h.x + h.w > this.width - 0.5 * TILE) { if (this.leave('right')) return; h.x = this.width - 0.5 * TILE - h.w; }
      // Doors and talking.
      if (inp.pressed('up') || inp.pressed('attack') || inp.pressed('confirm')) {
        const npc = this.npcNear(h);
        if (npc && !inp.pressed('up')) { this.talk(npc, h); return; }
        const b = this.doorNear(h);
        if (b && inp.pressed('up')) { this.enterBuilding(b, l); return; }
        if (npc) { this.talk(npc, h); return; }
      }
      // Auto-talkers stop the knight as he reaches them.
      for (const n of this.npcs) {
        const near = Math.abs(n.x - h.cx) < 52;
        if (this.npcFlags(n) & 0x80 && near && !n.spoken) { n.spoken = true; this.talk(n, h); return; }
        if (!near && Math.abs(n.x - h.cx) > 140) n.spoken = false;
      }
    }
    const lead = g.leader.hero;
    const target = g.locals.length > 1 ? (Math.min(...g.locals.map((l) => l.hero.cx)) + Math.max(...g.locals.map((l) => l.hero.cx))) / 2 : lead.cx + lead.dir * 80;
    this.cam.x += (this.clampCam(target - W / 2) - this.cam.x) * 0.12;
  }

  updateNpc(n, dt) {
    n.t += dt;
    if (n.talking) return;
    // ai 1/2/5/6 patrol; others stand (and some turn to face the knight).
    if ([1, 2, 5, 6].includes(n.ai)) {
      const sp = n.ai === 1 || n.ai === 5 ? 34 : 22;
      n.x += n.dir * sp * dt;
      n.odo = (n.odo || 0) + sp * dt;
      n.walking = true;
      const lo = Math.max(this.patrol[0], n.home - 6 * TILE), hi = Math.min(this.patrol[1], n.home + 6 * TILE);
      if (n.x < lo) { n.x = lo; n.dir = 1; }
      if (n.x > hi) { n.x = hi; n.dir = -1; }
      if (Math.random() < dt * 0.15) n.dir = -n.dir;
    } else {
      n.walking = false;
      if (n.ai === 0 || n.ai === 3) n.dir = Math.sign(this.game.leader.hero.cx - n.x) || n.dir;
    }
  }

  npcNear(h) {
    let best = null, bd = 56;
    for (const n of this.npcs) { const d = Math.abs(n.x - h.cx); if (d < bd && this.lineFor(n.r)) { bd = d; best = n; } }
    return best;
  }
  doorNear(h) { return this.buildings.find((b) => Math.abs(h.cx / TILE - (b.x + 1.5)) <= 1.6); }

  // Current NPC flags: bit 6 blocks the street, bit 7 stops the knight and talks.
  npcFlags(n) {
    let f = parseInt(n.r.flags || n.n.flags || '0', 16) || 0;
    for (const ch of n.r.other_condition_changes || []) if (ch.field === 'flags' && evalCondition(ch.condition, this.game)) f = parseInt(ch.value, 16);
    return f;
  }

  talk(n, h) {
    const line = this.lineFor(n.r) || (n.n.text ? { text: n.n.text } : null);
    if (!line) return;
    n.talking = true;
    n.dir = Math.sign(h.cx - n.x) || n.dir;
    audio.sfx('menu_accept', { vol: 0.3 });
    const pages = scriptPages(this.game, this.localize(line.text), this);
    this.say(pages, () => { n.talking = false; });
  }
  localize(t) { return this.game.localize ? this.game.localize(t) : t; }

  async enterBuilding(b, local) {
    const g = this.game;
    audio.sfx('door_open', { vol: 0.6 });
    if (b.kind === 'cavern' || b.service === 'cavern_entrance') {
      g.setBit('0x06', 0xff); // entered the caverns (the King's script checks this)
      g.travel({ kind: 'cavern', map: b.map, x: b.heroX, headRow: b.heroHeadRow, face: b.runLeft ? 'left' : 'right' });
      return;
    }
    if (b.service === 'trap_warp_to_dorado') {
      this.say([{ text: 'The floor gives way beneath you...' }], () => g.travel({ kind: 'town', map: 'drmp', x: null }));
      return;
    }
    // The import is async and the town keeps running: a second Up (or P2) mustn't open it twice.
    if (this.entering) return;
    this.entering = true;
    try {
      const { BuildingScene } = await import('./buildings.js');
      g.push(new BuildingScene(g, this, b, local));
    } finally { this.entering = false; }
  }

  leave(edge) {
    const tr = (this.map.transitions || []).find((x) => x.edge === edge);
    if (!tr) return false;
    const g = this.game;
    if (tr.kind === 'town') {
      const dest = tr.map || townByPlace(tr.place);
      g.travel({ kind: 'town', map: dest, x: tr.arrivalHeroX ?? (edge === 'left' ? 'destWidth-6' : 4), face: edge === 'left' ? 'left' : 'right' });
    } else {
      g.setBit('0x06', 0xff);
      g.travel({ kind: 'cavern', map: tr.map, x: tr.heroX, headRow: tr.heroHeadRow, face: edge === 'left' ? 'left' : 'right' });
    }
    for (const l of g.locals) l.hero.state = 'door';
    return true;
  }

  // ------------------------------------------------------------ drawing
  draw(t) {
    if (this.error) { text('Could not load the town: ' + this.error, W / 2, H / 2, { align: 'center', color: COLORS.red }); return; }
    if (!this.ready) { text('…', W / 2, H / 2, { align: 'center' }); return; }
    const cx = Math.round(this.cam.x);
    // Painted backdrop, panned slowly across the whole street.
    if (this.bg) {
      const s = (H + 40) / this.bg.height;
      const bw = this.bg.width * s;
      const f = this.width > W ? cx / (this.width - W) : 0;
      ctx.save(); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.bg, -(bw - W) * f, -20, bw, H + 40);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2440'); g.addColorStop(1, '#3a2a30');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // Filler houses between the shops, then the shop facades at their doors.
    const fill = [sheetNow(`art.town.${this.key}.filler1`), sheetNow(`art.town.${this.key}.filler2`)];
    for (let x = 6; x < this.map.width; x += 17) {
      if (this.buildings.some((b) => Math.abs(b.x - x) < 12)) continue;
      const sh = fill[(x * 7) % 2] || fill[0];
      const sx = (x + 1.5) * TILE - cx;
      if (sh && sx > -300 && sx < W + 300) sh.draw(ctx, 0, sx, STREET + 4, 1, 0.92, 0.95);
    }
    for (const b of this.buildings) {
      const sx = (b.x + 1.5) * TILE - cx;
      if (sx < -320 || sx > W + 320) continue;
      const sh = sheetNow(b.sprite);
      if (sh) sh.draw(ctx, 0, sx, STREET + 6, 1);
      else drawFallbackHouse(sx, b);
      // Sign above the door
      const label = SERVICE_LABEL[b.service] || '';
      if (label && !sh) text(label, sx, STREET - 200 - 4, { size: 15, align: 'center', color: '#ffe9b0', shadow: true });
    }
    // Street
    ctx.fillStyle = '#2a2018'; ctx.fillRect(0, STREET, W, H - STREET);
    ctx.fillStyle = '#5a4630'; ctx.fillRect(0, STREET, W, 6);
    for (let x = -(cx % 48); x < W; x += 48) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, STREET + 14, 30, 4); ctx.fillRect(x + 22, STREET + 32, 30, 4); }
    // Townsfolk
    for (const n of this.npcs) {
      if (!this.lineFor(n.r) && !n.n.text) continue;
      const sx = n.x - cx;
      if (sx < -80 || sx > W + 80) continue;
      const sh = sheetNow(n.sprite);
      const sc = NPC_SCALE[n.sprite.slice(8)] || 1;
      if (sh && n.walking && !n.talking) { const k = Math.floor((n.odo || 0) / NPC_STEP) % 4; sh.draw(ctx, NPC_WALK[k], sx, STREET + 2 - (k % 2), n.dir, 1, sc); }
      else if (sh) sh.draw(ctx, sh.frameAt(n.talking ? 'talk' : 'idle', n.t), sx, STREET + 2, n.dir, 1, sc);
      else { ctx.fillStyle = '#c8a070'; ctx.fillRect(sx - 12, STREET - 60, 24, 60); ctx.fillStyle = '#e8c8a0'; ctx.fillRect(sx - 9, STREET - 74, 18, 16); }
    }
    // Knights
    // Co-op knights from other screens who are in this town too.
    for (const h of this.game.coop?.townKnights() || []) {
      if (h.fairy) { h.draw(cx, 0, t); continue; }
      const sh = sheetNow(h.state === 'walk' ? 'hero.walk' : 'hero.idle');
      if (sh) { const f = h.state === 'walk' ? walkFrame(h, sh) : sh.frameAt('idle', h.animT); sh.draw(ctx, f, h.cx - cx, STREET + 2, h.dir, 0.9); drawShield(ctx, h.cx - cx, STREET + 2, h.dir, 0.9, shieldOf(h), 'stand', 1, sh.torsoX(f) * sh.scale); }
      if (h.label) text(h.label, h.cx - cx, STREET - 104, { size: 13, align: 'center', color: '#8fd0ff' });
    }
    for (const l of this.game.locals) {
      const h = l.hero;
      if (h.fairy) { h.y = STREET - h.h - 30; h.draw(cx, 0, t); continue; }
      const sh = sheetNow(h.state === 'walk' ? 'hero.walk' : 'hero.idle');
      const hx = h.cx - cx;
      if (sh) { const f = h.state === 'walk' ? walkFrame(h, sh) : sh.frameAt('idle', h.animT); sh.draw(ctx, f, hx, STREET + 2, h.dir, 1); drawShield(ctx, hx, STREET + 2, h.dir, 1, shieldOf(h), 'stand', 1, sh.torsoX(f) * sh.scale); }
      if (h.label) text(h.label, hx, STREET - 104, { size: 13, align: 'center', color: '#ffd27a' });
      const b = this.doorNear(h), n = this.npcNear(h);
      if (!this.dialogue && (b || n)) text(n ? '◆ Talk' : '▲ Enter', hx, STREET - 118, { size: 14, align: 'center', color: '#fff4c8', shadow: true });
    }
    this.game.locals.forEach((l, i) => drawKnightHud(l, 12 + i * 334, 10));
    text(this.map.name || '', W - 16, 14, { size: 18, align: 'right', color: COLORS.gold, shadow: true });
    this.dialogue?.draw();
  }
}

function drawFallbackHouse(sx, b) {
  ctx.fillStyle = '#4a3a30'; ctx.fillRect(sx - 110, STREET - 190, 220, 190);
  ctx.fillStyle = '#7a3a2a'; ctx.beginPath(); ctx.moveTo(sx - 130, STREET - 190); ctx.lineTo(sx, STREET - 260); ctx.lineTo(sx + 130, STREET - 190); ctx.fill();
  ctx.fillStyle = '#120a08'; ctx.fillRect(sx - 26, STREET - 80, 52, 80);
}

// Turn an original NPC text (with its control tokens) into dialogue pages:
//   {WAIT_THEN_TEXTn} page break; {YESNO} a yes/no question (the reply follows);
//   {BUY_ASBESTOS_CAPE} the Llama cape sale; {GIVE_ELF_CREST} the Elf Crest gift.
export function scriptPages(game, raw, scene) {
  let t = String(raw).replace(/\{0\d\}|\{EXIT_TO_TEXT\d+\}/g, '').replace(/\{WAIT_THEN_TEXT\d+\}/g, '\f');
  const give = t.includes('{GIVE_ELF_CREST}');
  t = t.replace('{GIVE_ELF_CREST}', '');
  if (give) {
    for (const l of game.locals) if (!l.character.crests.includes('elf_crest')) l.character.crests.push('elf_crest');
    game.setBit('0x34', 0x80);
    game.toast('You received the Elf Crest!');
    audio.sfx('chest_open', { vol: 0.7 });
  }
  const pagesOf = (s) => s.split('\f').flatMap((x) => splitPages(x.trim())).filter((x) => x).map((x) => ({ text: x }));
  if (t.includes('{BUY_ASBESTOS_CAPE}')) {
    const [offer, no] = t.split('{BUY_ASBESTOS_CAPE}');
    const pages = pagesOf(offer.replace(/\n+$/, ''));
    const price = (game.data && RULES.capePrice) || 2500;
    pages[pages.length - 1].text = pages[pages.length - 1].text.replace('2500', String(price));
    pages[pages.length - 1].choices = ['Buy', 'No'];
    pages[pages.length - 1].onChoice = (i) => {
      if (i !== 0) return [no.trim() || 'Maybe next time.'];
      const c = game.leader.character;
      if (c.almas < price) return ["You don't have enough almas."];
      c.almas -= price;
      if (!c.accessories.includes('asbestos_cape')) c.accessories.push('asbestos_cape');
      game.setBit('0x34', 0x40);
      game.toast('You got the Asbestos Cape. Wear it in the inventory.');
      game.save();
      return ['Here you are. Take good care of it.'];
    };
    return pages;
  }
  if (t.includes('{YESNO}')) {
    const [q, reply] = t.split('{YESNO}');
    const pages = pagesOf(q);
    pages[pages.length - 1].choices = ['Yes', 'No'];
    pages[pages.length - 1].onChoice = () => [reply.trim()];
    return pages;
  }
  return pagesOf(t);
}

// Long NPC speeches become several dialogue pages.
export function splitPages(str, max = 230) {
  const out = [];
  let cur = '';
  for (const s of String(str).replace(/\n/g, ' ').split(/(?<=[.!?])\s+/)) {
    if ((cur + ' ' + s).trim().length > max && cur) { out.push(cur.trim()); cur = s; } else cur += ' ' + s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [''];
}

export { wrap, panel, spriteIds };
