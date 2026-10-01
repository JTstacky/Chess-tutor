// Populates a cavern from its extracted MDT data: monsters, chests, keys, hidden
// wall stashes, falling blocks, signs, doors (with locks and destinations), the three
// kinds of platform, and the Tear marker. The "accomplished" table is applied first,
// so items already taken and doors already opened stay that way.
import { TILE, F } from '../world/tilemap.js';
import { preloadSheets, sheetNow, image, imageNow } from '../core/assets.js';

// Remastered prop art cut from art/props/cavern_props.raw.png (tools/art/cut_props.py).
// Each is drawn scaled to the object's width, bottom-aligned; missing art falls back to
// the shapes drawn below.
const PROP_ART = ['door_locked', 'door_open', 'door_lion', 'lift', 'ledge', 'crumbler'];
for (const k of PROP_ART) image(`art/props/${k}.png`);
function drawProp(key, x, bottom, w, alpha = 1) {
  const img = imageNow(`art/props/${key}.png`);
  if (!img) return false;
  const h = (img.height * w) / img.width;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, Math.round(x), Math.round(bottom - h), Math.round(w), Math.round(h));
  ctx.restore();
  return true;
}
import { ctx, text, COLORS } from '../render/screen.js';
import { audio } from '../core/audio.js';
import { Enemy, enemyDef, FRAME } from './enemies.js';

const hex = (h) => (typeof h === 'number' ? h : parseInt(h, 16));

// The item each cavern object gives, as { item } or { gold } or { almas } or { potion }.
export function contentsOf(key) {
  if (!key) return null;
  if (key.startsWith('gold_')) return { gold: Number(key.slice(5)) };
  if (key.startsWith('almas_')) return { almas: Number(key.slice(6)) };
  if (key === 'red_potion' || key === 'blue_potion') return { potion: key.split('_')[0] };
  if (key === 'empty') return {};
  const trap = /monster_kind_(\d+)/.exec(key);
  if (trap) return { trap: Number(trap[1]) };
  return { item: key };
}

export async function spawnEntities(game, world, data) {
  const worldNo = Math.min(8, data.level || 1);
  // Apply the accomplished table: remove records, open doors, drop the tear, or swap
  // to the post-boss tables.
  const removed = new Set(), altRemoved = new Set(), openDoors = new Set();
  let monsters = data.monsters, doors = data.doors, tear = data.tear;
  for (const a of data.accomplished || []) {
    if (!game.hasBit(a.condition.byte, a.condition.mask)) continue;
    for (const w of a.writes) {
      const t = w.target || {};
      if (t.header === 'tear_x') tear = null;
      else if (t.header === 'monsters_ptr') monsters = altTable(data, 'monsters') || monsters;
      else if (t.header === 'doors_ptr') doors = altTable(data, 'doors') || doors;
      else if (t.table === 'monsters' && t.fieldOffset === 0) removed.add(t.index);
      else if (t.table?.startsWith('monsters@') && t.fieldOffset === 0) altRemoved.add(t.index);
      else if (t.table?.startsWith('doors')) openDoors.add(t.index);
    }
  }
  // A boss cavern whose boss is beaten uses its post-boss tables (key or potion + exit).
  if (data.boss && game.bossBeaten(data.id)) {
    monsters = altTable(data, 'monsters') || monsters;
    doors = altTable(data, 'doors') || doors;
  }
  const alt = monsters !== data.monsters;
  const sprites = new Set();
  for (const m of monsters || []) {
    if ((alt ? altRemoved : removed).has(m.index)) continue;
    if (m.saveFlag && m.saveFlag.byte !== '0xffff' && game.hasBit(m.saveFlag.byte, m.saveFlag.mask)) continue;
    if (m.category === 'monster') {
      // Big monsters are two stacked records (head + body); spawn one 2x4 body from the head.
      if (m.bigMonster && m.kind % 2 === 1) continue;
      const def = enemyDef(game, worldNo, m.kind);
      if (m.hp) def.hp = m.hp;
      if (m.xp) def.xp = game.rulesDifficulty === 'japanese' ? def.xp : m.xp;
      if (m.contactDamage) def.dmg = m.contactDamage;
      const e = new Enemy(def, m.x, m.y, { record: m, id: `m${m.index}` });
      e.noContact = m.noContactDamage;
      world.enemies.push(e);
      sprites.add(def.sprite);
    } else {
      const p = makeSpecial(game, world, m, data);
      if (p) { p.place?.(world.map); world.props.push(p); }
    }
  }
  // Doors without a save flag (mp84's Lion seal) are remembered on the knight instead.
  const opened = new Set(game.leader?.character?.openedDoors || []);
  for (const d of doors || []) world.doors.push(new Door(d, openDoors.has(d.index) || (d.saveFlag && game.hasBit(d.saveFlag.byte, d.saveFlag.mask)) || opened.has(`${data.id}:${d.index}`)));
  for (const d of world.doors) d.stamp(world.map);
  for (const p of data.platforms?.vertical || []) world.platforms.push(new Lift(p));
  for (const p of data.platforms?.horizontal || []) world.platforms.push(new Mover(p));
  for (const p of data.platforms?.collapsing || []) world.platforms.push(new Crumbler(p));
  for (const p of world.platforms) p.stamp(world.map);
  if (tear && tear.x != null && tear.x !== 0xffff) world.tear = { x: tear.x * TILE, y: tear.y * TILE };
  world.signs = data.signs || [];
  await preloadSheets([...sprites, 'art.prop.chest', 'art.item.potion', 'art.item.almas', 'art.item.almas10', 'art.prop.tear', 'item.bronze_key', 'item.gold_key', 'item.trail_boots', 'item.family_crest', 'art.item.almas100', 'art.item.gold']);
}

function altTable(data, pointer) {
  const t = (data.alternateTables || []).find((x) => x.pointer === pointer);
  return t ? t.entries : null;
}

function makeSpecial(game, world, m, data) {
  switch (m.type) {
    case 'chest': return new Chest(m, contentsOf(m.chest?.contains || 'empty'));
    case 'breakable_block': return new Stash(m, contentsOf(m.contains));
    case 'falling_floor_block': return new FallingBlock(m);
    case 'sign': return new Sign(m, data.signs?.[m.signIndex]);
    case 'key': return new Loose(m, { item: 'key' });
    case 'lions_head_key': return new Loose(m, { item: 'lions_head_key' });
    case 'ruzeria_shoes': return new Loose(m, { item: 'ruzeria_shoes' });
    case 'blue_potion': case 'red_potion': return new Loose(m, { potion: m.type.split('_')[0] });
    default: return new Loose(m, contentsOf(m.type));
  }
}

// ---------------------------------------------------------------- props
// Common 2x2 object at a record position. `solid` props stamp their tiles.
class Prop {
  constructor(m) {
    this.rec = m;
    this.id = `o${m.index}`;
    this.tx = m.x; this.ty = m.y;
    this.x = m.x * TILE; this.y = m.y * TILE; this.w = 2 * TILE; this.h = 2 * TILE;
    this.flag = m.saveFlag && m.saveFlag.byte !== '0xffff' ? m.saveFlag : null;
    this.dead = false;
    this.t = 0;
  }
  get cx() { return this.x + this.w / 2; }
  stampSolid(map, on) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (on) map.setOverride(this.tx + i, this.ty + j, map.flags(this.tx + i, this.ty + j) | F.SOLID | F.BREAKABLE * (this.breakable ? 1 : 0));
      else map.clearOverride(this.tx + i, this.ty + j);
    }
  }
  update() {}
  draw() {}
  // Called when a hero body overlaps this prop.
  touch() {}
  // Called when a sword or spell hits it. Return true if it reacted.
  hit() { return false; }
}

class Chest extends Prop {
  constructor(m, contents) { super(m); this.contents = contents; this.open = false; }
  touch(world, hero) {
    if (this.open) return;
    this.open = true;
    audio.sfx('chest_open', { vol: 0.8 });
    world.game.propOpened(world, hero, this, this.contents);
  }
  update(dt) { this.t += dt; if (this.open && this.t > 60) this.dead = true; }
  draw(cx, cy) {
    const sh = sheetNow('art.prop.chest');
    const x = this.cx - cx, y = this.y + this.h - cy;
    if (sh) sh.draw(ctx, sh.frameAt(this.open ? 'open' : 'closed', 0), x, y, 1, this.open ? Math.max(0.35, 1 - this.t) : 1, 1.1);
    else { ctx.fillStyle = this.open ? '#6a4a2a' : '#b07a38'; ctx.fillRect(x - 20, y - 30, 40, 30); }
  }
}

// Hidden stash in a wall: solid until slashed, then releases its contents.
class Stash extends Prop {
  constructor(m, contents) { super(m); this.contents = contents; this.breakable = true; this.hp = 1; }
  place(map) { this.stampSolid(map, true); }
  hit(world, hero) {
    if (this.dead) return false;
    this.dead = true;
    this.stampSolid(world.map, false);
    world.effect('rubble', this.cx, this.y + this.h / 2, { life: 0.7 });
    audio.sfx('shield_break', { vol: 0.6 });
    world.game.propOpened(world, hero, this, this.contents);
    return true;
  }
}

// Floor block that gives way under the hero and drops down the shaft.
class FallingBlock extends Prop {
  constructor(m) { super(m); this.state = 'rest'; this.acc = 0; }
  place(map) { this.stampSolid(map, true); }
  update(dt, world) {
    this.t += dt;
    if (this.state === 'rest') {
      const onTop = world.heroes.some((h) => h.alive && h.onGround && Math.abs(world.map.nearY(h.feet, this.y) - this.y) < 4 && overlapsX(world.map, h, this));
      if (onTop) { this.state = 'shake'; this.t = 0; audio.sfx('shield_break', { vol: 0.25, rate: 1.4 }); }
    } else if (this.state === 'shake' && this.t > 0.35) {
      this.state = 'fall'; this.stampSolid(world.map, false);
    } else if (this.state === 'fall') {
      this.acc += dt;
      while (this.acc >= FRAME) {
        this.acc -= FRAME;
        const m = world.map;
        const blocked = [0, 1].some((i) => m.flags(this.tx + i, this.ty + 2) & (F.SOLID | F.ONEWAY));
        if (blocked || this.falls++ > 64) {
          this.state = 'landed'; this.x = this.tx * TILE; this.y = this.ty * TILE;
          // The knight falls faster than the block, so it can land on him: lift him onto it,
          // or, with no room above, let the block shatter rather than entomb him.
          let crush = false;
          for (const h of world.heroes) {
            if (!overlapsX(m, h, this)) continue;
            const hy = m.nearY(h.y, this.y);
            if (hy >= this.y + this.h || hy + h.h <= this.y) continue;
            const lift = this.y - h.h - hy;
            if (!m.rectSolid(h.x, h.y + lift, h.w, h.h)) { h.y += lift; h.vy = 0; h.onGround = true; h.fallStartY = h.y; }
            else crush = true;
          }
          if (crush) { this.state = 'broken'; world.effect('rubble', this.cx, this.y + this.h / 2, { life: 0.6 }); return; }
          this.stampSolid(m, true); world.effect('rubble', this.cx, this.y + this.h, { life: 0.5 }); return;
        }
        this.ty = (this.ty + 1) % m.h;
      }
      this.y = (this.ty + this.acc / FRAME) * TILE;
    }
    this.falls ||= 0;
  }
  draw(cx, cy) {
    if (this.state === 'broken') return;
    const x = this.x - cx + (this.state === 'shake' ? Math.sin(this.t * 80) * 2 : 0), y = this.y - cy;
    drawBlock(x, y, this.w, this.h, '#7a6a58', '#4a3e32');
  }
}

class Sign extends Prop {
  constructor(m, sign) { super(m); this.sign = sign; }
  draw(cx, cy, t, world) {
    const x = this.cx - cx, y = this.y - cy;
    ctx.fillStyle = '#5a3c20'; ctx.fillRect(x - 3, y + 12, 6, this.h - 12);
    ctx.fillStyle = '#b08850'; ctx.fillRect(x - 22, y, 44, 22);
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 2; ctx.strokeRect(x - 22, y, 44, 22);
    const near = world.heroes.some((h) => h.local && Math.abs(world.map.near(h.cx, this.cx) - this.cx) < 90 && Math.abs(world.map.nearY(h.y, this.y) - this.y) < 90);
    if (near && this.sign) {
      const lines = this.sign.text.split('\n');
      lines.forEach((l, i) => text(l, x, y - 16 - (lines.length - i) * 20, { size: 16, align: 'center', color: '#fff4c8', shadow: true }));
    }
  }
}

// A loose object lying in the cavern (key, shoes, potion...), picked up by touch.
class Loose extends Prop {
  constructor(m, contents) { super(m); this.contents = contents; }
  touch(world, hero) {
    if (this.dead) return;
    this.dead = true;
    world.game.propOpened(world, hero, this, this.contents);
  }
  draw(cx, cy, t) {
    const c = this.contents || {};
    const id = c.potion ? 'art.item.potion' : c.item === 'key' ? 'item.bronze_key' : c.item === 'lions_head_key' ? 'item.gold_key' : /shoes/.test(c.item) ? 'item.trail_boots' : /crest/.test(c.item) ? 'item.family_crest' : 'item.spirit_mote';
    const sh = sheetNow(id);
    const x = this.cx - cx, y = this.y + this.h - cy + Math.sin(t * 3 + this.x) * 3 - 6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 16, 2, x, y - 16, 30);
    g.addColorStop(0, 'rgba(255,230,160,0.45)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 30, y - 46, 60, 60);
    ctx.restore();
    if (sh) {
      const s = Math.min(1, 40 / Math.max(sh.fw, sh.fh)) * (sh.scale ? 1 / sh.scale : 1);
      if (c.potion === 'blue') { ctx.save(); ctx.filter = 'hue-rotate(200deg)'; }
      sh.draw(ctx, 0, x, y, 1, 1, id.startsWith('art.') ? 1 : s);
      if (c.potion === 'blue') ctx.restore();
    } else { ctx.fillStyle = '#ffe070'; ctx.fillRect(x - 8, y - 20, 16, 16); }
  }
}

function drawBlock(x, y, w, h, light, dark) {
  ctx.fillStyle = dark; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = light; ctx.fillRect(x + 2, y + 2, w - 4, h - 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 2, y + h / 2); ctx.lineTo(x + w - 2, y + h / 2); ctx.moveTo(x + w / 2, y + 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.stroke();
}

function overlapsX(map, hero, box) {
  const hx = map.near(hero.x, box.x);
  return hx + hero.w > box.x + 2 && hx < box.x + box.w - 2;
}

// ---------------------------------------------------------------- doors
// A 5x4 door frame. `enter` is the spot where Up opens it; locked doors need a Key
// (or the Lion's Head Key), which is consumed and remembered in the save.
export class Door {
  constructor(d, opened) {
    // The cavern data spells the Lion's Head lock 'lions_head_key'; the game checks 'lion'.
    if (d.lock === 'lions_head_key') d = { ...d, lock: 'lion' };
    this.d = d;
    this.id = `d${d.index}`;
    this.x = d.frame.x * TILE; this.y = d.frame.y * TILE; this.w = d.frame.w * TILE; this.h = d.frame.h * TILE;
    this.locked = d.lock !== 'none' && !opened && !d.open;
    this.dest = d.destination;
  }
  stamp(map) {
    // Door frames are passable (ids 0x49+); the frame hides whatever rock is under it.
    for (let j = 0; j < this.d.frame.h; j++) for (let i = 0; i < this.d.frame.w; i++) map.setOverride(this.d.frame.x + i, this.d.frame.y + j, F.DOOR);
  }
  // The hero stands in the doorway: centre column within a tile, feet on the sill row.
  inDoorway(map, hero) {
    const col = (map.near(hero.cx, this.x) / TILE) - (this.d.enter.heroLeftColumn + 1.5);
    const feet = map.nearY(hero.feet, this.y) / TILE - (this.d.enter.heroHeadRow + 3);
    return Math.abs(col) < 1.25 && Math.abs(feet) < 0.8;
  }
  draw(cx, cy, t) {
    const x = this.x - cx, y = this.y - cy, w = this.w, h = this.h;
    const art = this.locked ? (this.d.lock === 'lion' ? 'door_lion' : 'door_locked') : 'door_open';
    if (drawProp(art, x - w * 0.05, y + h + 2, w * 1.1)) return;
    ctx.save();
    // stone arch
    ctx.fillStyle = '#2a2230';
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h); ctx.lineTo(x + 6, y + 30); ctx.quadraticCurveTo(x + w / 2, y - 16, x + w - 6, y + 30); ctx.lineTo(x + w - 6, y + h); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a7a66'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 2; ctx.stroke();
    // inner opening
    const ix = x + 22, iw = w - 44;
    ctx.fillStyle = this.locked ? '#5a3a1e' : '#05030a';
    ctx.beginPath();
    ctx.moveTo(ix, y + h); ctx.lineTo(ix, y + 36); ctx.quadraticCurveTo(x + w / 2, y + 8, ix + iw, y + 36); ctx.lineTo(ix + iw, y + h); ctx.closePath();
    ctx.fill();
    if (this.locked) {
      ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(ix + (iw * i) / 4, y + 24); ctx.lineTo(ix + (iw * i) / 4, y + h); ctx.stroke(); }
      ctx.fillStyle = this.d.lock === 'lion' ? '#e8c050' : '#c8a060';
      ctx.fillRect(x + w / 2 - 6, y + h - 40, 12, 14);
      ctx.fillStyle = '#1a1008'; ctx.fillRect(x + w / 2 - 2, y + h - 36, 4, 7);
    } else {
      const g = ctx.createLinearGradient(0, y + 20, 0, y + h);
      g.addColorStop(0, 'rgba(120,160,255,0)'); g.addColorStop(1, `rgba(120,160,255,${0.18 + Math.sin(t * 2) * 0.06})`);
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- platforms
// All three are 3 tiles wide and stamped into the map as one-way floor, exactly as the
// original writes tiles 0x40-0x48 into the proximity map. They move a whole tile at a
// time on the original frame clock and are drawn interpolated.
class Platform {
  constructor(p) { this.p = p; this.tx = p.x; this.ty = p.y; this.ptx = p.x; this.pty = p.y; this.acc = 0; this.t = 0; }
  stamp(map, on = true) {
    for (let i = 0; i < 3; i++) {
      if (on) map.setOverride(this.tx + i, this.ty, F.ONEWAY | F.PLATFORM);
      else map.clearOverride(this.tx + i, this.ty);
    }
  }
  moveTo(map, tx, ty) { this.stamp(map, false); this.tx = tx; this.ty = ty; this.stamp(map, true); }
  riders(world) {
    const m = world.map, top = this.ty * TILE;
    return world.heroes.filter((h) => h.alive && h.state !== 'climb' && Math.abs(m.nearY(h.feet, top) - top) < 3 && overlapsX(m, h, { x: this.tx * TILE, w: 3 * TILE }));
  }
  drawAt(cx, cy, color, art) {
    const a = Math.min(1, this.acc / FRAME);
    const x = (this.ptx + (this.tx - this.ptx) * a) * TILE - cx, y = (this.pty + (this.ty - this.pty) * a) * TILE - cy;
    // Art: the walkable top sits on the tile row; the plank hangs a little below it.
    if (art && imageNow(`art/props/${art}.png`)) {
      const img = imageNow(`art/props/${art}.png`);
      const w = 3 * TILE + 8, h = (img.height * w) / img.width;
      const below = art === 'lift' ? 16 : Math.min(h, 34); // lift art has ropes above the plank
      // Moving platforms glow and carry a bright rim, like the original's yellow discs on black:
      // the plain rock slab blended into the cavern, so one sliding away read as floor vanishing.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x + 1.5 * TILE, y + 6, 4, x + 1.5 * TILE, y + 6, 2.2 * TILE);
      g.addColorStop(0, 'rgba(255,200,90,0.35)'); g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - TILE, y - TILE, 5 * TILE, 3 * TILE);
      ctx.restore();
      drawProp(art, x - 4, y + below, w);
      ctx.fillStyle = 'rgba(255,214,120,0.9)'; ctx.fillRect(x + 2, y - 1, 3 * TILE - 4, 2);
      return { x, y, art: true };
    }
    ctx.fillStyle = '#1a1208'; ctx.fillRect(x, y, 3 * TILE, 12);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, 3 * TILE - 2, 8);
    ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x + 1, y + 1, 3 * TILE - 2, 2);
    ctx.fillStyle = '#3a2a14'; for (let i = 1; i < 3; i++) ctx.fillRect(x + i * TILE - 1, y + 2, 2, 7);
    return { x, y };
  }
}

// Lift: stand on it and hold Up or Down to ride it one row per frame.
class Lift extends Platform {
  update(dt, world) {
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.ptx = this.tx; this.pty = this.ty;
      const riders = this.riders(world);
      if (!riders.length) continue;
      const inp = riders[0].input;
      const dir = inp?.down('up') ? -1 : inp?.down('down') ? 1 : 0;
      if (!dir) continue;
      const m = world.map;
      const ny = this.ty + dir;
      const clear = [0, 1, 2].every((i) => !(m.flags(this.tx + i, dir > 0 ? ny : ny - 3) & F.SOLID));
      if (!clear) continue;
      this.moveTo(m, this.tx, ((ny % m.h) + m.h) % m.h);
      for (const h of riders) { h.y += dir * TILE; h.riding = this; }
      if (this.ty !== ny) { this.pty = this.ty - dir; }
    }
  }
  draw(cx, cy) {
    const { x, y } = this.drawAt(cx, cy, '#8a6a3a', 'lift');
    ctx.strokeStyle = 'rgba(200,180,140,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y - 500); ctx.moveTo(x + 3 * TILE - 6, y); ctx.lineTo(x + 3 * TILE - 6, y - 500); ctx.stroke();
  }
}

// Horizontal mover shuttling between minX and maxX at its original speed.
class Mover extends Platform {
  constructor(p) { super(p); this.dir = p.movingLeft ? -1 : 1; this.every = p.speedCode === 0 ? 0 : p.speedCode === 1 ? 2 : 1; this.n = 0; }
  update(dt, world) {
    if (!this.every || this.p.paused) return;
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.ptx = this.tx; this.pty = this.ty;
      if (++this.n % this.every) continue;
      // Positions are measured along the range from minX, wrapping, because seven ranges
      // run through the map seam (e.g. mp51: 231 -> 11). A plain min/max test flipped those
      // every step.
      const W = world.map.w, wrap = (v) => ((v % W) + W) % W;
      const span = wrap(this.p.maxX - this.p.minX);
      let nx = this.tx + this.dir;
      if (wrap(nx - this.p.minX) > span) { this.dir = -this.dir; nx = this.tx + this.dir; }
      const riders = this.riders(world);
      const wx = wrap(nx);
      if (wx !== nx) this.ptx = wx - this.dir; // crossing the seam: keep the drawn slide one tile long
      this.moveTo(world.map, wx, this.ty);
      for (const h of riders) if (!world.map.rectSolid(h.x + this.dir * TILE, h.y, h.w, h.h)) h.x += this.dir * TILE;
    }
  }
  draw(cx, cy) { this.drawAt(cx, cy, '#a07a44', 'ledge'); }
}

// Sinker (the original's "collapsing" platform, tiles 67-69): looks like a horizontal mover but
// stays put; stood on, it sinks one row per frame until it meets rock or the knight steps off.
// It used to crumble away and re-form 6 s later, which no floor in Zeliard does. The original's
// return trip isn't documented, so an empty sinker drifts back up to its row, a row every 4 frames,
// so a route can't be left without its platform.
class Crumbler extends Platform {
  constructor(p) { super(p); this.home = p.y; this.n = 0; }
  update(dt, world) {
    this.acc += dt;
    const m = world.map;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.ptx = this.tx; this.pty = this.ty;
      const riders = this.riders(world);
      const free = (row) => [0, 1, 2].every((i) => !(m.flags(this.tx + i, row) & F.SOLID));
      if (riders.length) {
        const ny = this.ty + 1;
        if (!free(ny)) continue;
        this.moveTo(m, this.tx, ((ny % m.h) + m.h) % m.h);
        for (const h of riders) { h.y += TILE; h.riding = this; }
        if (this.ty !== ny) this.pty = this.ty - 1;
      } else if (this.ty !== this.home && ++this.n % 4 === 0) {
        const ny = this.ty - 1;
        if (!free(ny - 3)) continue;
        this.moveTo(m, this.tx, ((ny % m.h) + m.h) % m.h);
        if (this.ty !== ny) this.pty = this.ty + 1;
      }
    }
  }
  draw(cx, cy) { this.drawAt(cx, cy, '#a07a44', 'ledge'); }
}
