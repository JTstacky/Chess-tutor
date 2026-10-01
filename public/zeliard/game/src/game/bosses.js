// The ten guardians (data/rules/bosses.json). Each runs on the original frame clock
// with its arena position, size, movement range, damage scaling (weak points,
// sword/spell gates), contact damage and attacks taken from the boss modules; the
// behaviour is a compact port of each module's phases. On death the arena reloads
// with its post-boss tables (reward object + exit door), as load_place_and_reinit does.
import { TILE } from '../world/tilemap.js';
import { random } from '../core/util.js';
import { sheetNow, preloadSheets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { ctx, W, text, bar, COLORS, panel } from '../render/screen.js';
import { RULES, addXp } from './character.js';
import { FRAME } from './enemies.js';

const TPS = TILE / FRAME;
const SWORD_NUM = { training_sword: 1, wise_mans_sword: 2, spirit_sword: 3, knights_sword: 4, illumination_sword: 5, enchantment_sword: 6 };
const SPELL_SRC = { espada: 2, saeta: 3, fuego: 4, lanzar: 5, rascar: 6, agua: 7, guerra: 8, magia: 9 };

// Arena, body (tiles) and rules per boss. `weak` is a sub-rect of the body (tiles).
export const BOSSES = {
  mp1d: { id: 'cangrejo', name: 'Cangrejo', hp: 150, xp: 120, x: 43, y: 12, tw: 10, th: 6, range: [16, 49], contact: 6, weak: [2, 4, 6, 2],
    dmg: (d, src, weak) => d * (weak ? 8 : 4), ai: 'crab', flag: ['0x00', 0xff] },
  mp2d: { id: 'pulpo', name: 'Pulpo', hp: 250, xp: 200, x: 36, y: 16, tw: 7, th: 8, contact: 10, weak: [1, 5, 5, 3],
    dmg: (d, src, weak) => d * (weak ? 4 : 2), ai: 'octopus', flag: ['0x08', 0xff] },
  mp3d: { id: 'pollo', name: 'Pollo', hp: 500, xp: 500, x: 46, y: 18, tw: 9, th: 8, range: [13, 48], contact: 18, weak: [0, 0, 3, 3], weakContact: 56,
    dmg: (d, src, weak) => d * (weak ? 8 : RULES.jp ? 1 : 2), ai: 'chicken', flag: ['0x10', 0xff] },
  mp4d: { id: 'agar', name: 'Agar', hp: 500, xp: 1000, x: 48, y: 12, tw: 8, th: 6, range: [17, 50], contact: 30,
    dmg: (d, src) => (src === 4 ? Math.floor(d / 2) * 4 : Math.floor(d / 2)), ai: 'agar', shot: 80, flag: ['0x18', 0xff] },
  mp5d: { id: 'vista', name: 'Vista', hp: 700, xp: 3000, x: 48, y: 11, tw: 14, th: 12, range: [9, 49], contact: 30,
    dmg: (d, src, weak, ctx) => Math.floor(d / 8) * (src === 1 && SWORD_NUM[ctx.sword] >= 4 ? 32 : 1), ai: 'vista', flag: ['0x20', 0xff] },
  mp6d: { id: 'tarso', name: 'Tarso', hp: 640, xp: 6000, x: 38, y: 7, tw: 8, th: 10, range: [14, 50], contact: 160,
    dmg: (d, src) => (src === 1 ? d * 2 : src === 9 ? d : Math.floor(d / 8)), ai: 'tarso', flag: ['0x28', 0xff] },
  mp73: { id: 'paguro', name: 'Paguro', hp: 600, xp: 3000, x: 48, y: 12, tw: 8, th: 6, range: [17, 50], contact: 30, noTear: true,
    dmg: (d, src) => (RULES.jp && src === 4 ? Math.floor(d / 2) * 2 : Math.floor(d / 2)), ai: 'agar', shot: 120, flag: ['0x30', 0xff] },
  mp7d: { id: 'dragon', name: 'Dragon', hp: 800, xp: 12000, x: 30, y: 8, tw: 29, th: 10, range: [15, 30], contact: 30, weak: [0, 0, 8, 6], jpWeak: [25, 0, 4, 10], weakContact: 40,
    // DOS: half from the sword, an eighth from anything else, head doubles. Japanese: 1/8, tail 1/2.
    dmg: (d, src, weak) => (RULES.jp ? (weak ? d >> 1 : d >> 3) : ((src === 1 ? d >> 1 : d >> 3) * (weak ? 2 : 1))), ai: 'dragon', flag: ['0x32', 0xff] },
  mp8d: { id: 'alguien', name: 'Alguien', hp: 800, xp: 30000, x: 42, y: 0, tw: 13, th: 13, range: [10, 51], contact: 40,
    dmg: (d, src) => (RULES.jp ? d >> 3 : d), ai: 'alguien', flag: ['0x3a', 0x01] },
  mpa0: { id: 'jashiin', name: 'Jashiin', hp: 800, xp: 10000, x: 48, y: 9, tw: 6, th: 9, range: [15, 53], contact: 80, final: true,
    dmg: (d, src) => { const sw = RULES.jp ? d >> 2 : d >> 1; return src === 1 ? sw : RULES.jp ? d >> 4 : d >> 2; }, ai: 'jashiin', flag: ['0x47', 0xff] },
};

export async function spawnBoss(game, world) {
  const id = world.id;
  if (id === 'mp90') { world.intro = new JashiinIntro(game, world); return; }
  const def = BOSSES[id];
  if (!def || game.bossBeaten(id)) return;
  await preloadSheets([`art.boss.${def.id}`]);
  world.boss = new Boss(game, world, def);
  // The arena has no doors while the guardian lives.
  world.doors = [];
}

class Boss {
  constructor(game, world, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.hp = def.hp;
    this.maxHp = def.hp;
    if (RULES.jp && def.id === 'jashiin') this.regen = 120;
    this.tx = def.x; this.ty = def.y; this.ptx = this.tx; this.pty = this.ty;
    this.w = def.tw * TILE; this.h = def.th * TILE;
    this.x = this.tx * TILE; this.y = this.ty * TILE;
    this.dir = -1;
    this.acc = 0; this.f = 0; this.st = 'idle'; this.n = 0;
    this.flash = 0; this.dead = false; this.deathT = 0;
    this.parts = []; // extra hazards (flames, breath) as boxes with damage
    this.pose = 0;
    this.contactDmg = def.contact;
    audio.playMusic('boss_theme');
  }
  get cx() { return this.x + this.w / 2; }
  body() { const m = 0.12; return { x: this.x + this.w * m, y: this.y + this.h * m, w: this.w * (1 - 2 * m), h: this.h * (1 - m) }; }
  weakBox() {
    const k = (RULES.jp && this.def.jpWeak) || this.def.weak;
    if (!k) return null;
    const [wx, wy, ww, wh] = k;
    // The art faces left; mirror the weak spot when facing right.
    const x = this.dir < 0 ? wx : this.def.tw - wx - ww;
    return { x: (this.tx + x) * TILE, y: (this.ty + wy) * TILE, w: ww * TILE, h: wh * TILE };
  }
  hitTest(box) { return !this.dead && !this.hidden && overlap(box, this.body()); }
  touches(hb) {
    if (this.dead || this.dying || this.hidden) return null;
    for (const p of this.parts) if (overlap(hb, p)) return { dmg: p.dmg };
    if (!overlap(hb, this.body())) return null;
    const wk = this.weakBox();
    return { dmg: wk && this.def.weakContact && overlap(hb, wk) ? this.def.weakContact : this.contactDmg };
  }

  // A hit from the sword (src 1), a spell (2..8) or the Magia Stone (9).
  damage(d, kind, world, ownerId, info = {}) {
    if (this.dead || this.dying || this.hurtT > 0) return;
    const src = kind === 'sword' || kind === 'thrust' ? 1 : SPELL_SRC[kind] || 2;
    const hero = info.hero;
    const sb = hero?.swordBox?.();
    const wk = this.weakBox();
    const weak = !!(wk && (sb ? overlap(sb, wk) : info.box && overlap(info.box, wk)));
    let v = this.def.dmg(d, src, weak, { sword: info.sword });
    v = Math.max(0, Math.min(65535, Math.floor(v)));
    world.effect(v ? 'hit' : 'clink', hero ? hero.cx + hero.dir * 50 : this.cx, (hero ? hero.y + 30 : this.y + this.h / 2), { dmg: v || undefined, color: weak ? '#ffe070' : undefined });
    if (!v) { audio.sfx('shield_block', { vol: 0.6 }); if (!this.warned) { this.warned = true; this.game.toast(`${this.def.name} seems unharmed...`, '#c0c0c0'); } return; }
    this.hp -= v;
    this.flash = 0.18;
    this.hurtT = FRAME * 2;
    audio.sfx('boss_hit', { vol: 0.8 });
    this.onHit?.(world, hero);
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    this.hp = 0;
    this.dying = true;
    this.deathT = 0;
    this.parts = [];
    world.projectiles = world.projectiles.filter((p) => p.friendly);
    audio.sfx('boss_defeat');
    world.shake = 1.2;
  }

  async finish(world) {
    const g = this.game, d = this.def;
    this.dead = true;
    const almas = RULES.jp ? 0 : RULES.bossAlmas?.[d.id] ?? 0;
    for (const h of world.heroes) {
      const l = g.localByHero(h);
      if (!l) continue;
      addXp(l.character, d.xp);
      l.character.almas = Math.min(65535, l.character.almas + almas);
      (l.character.bossesBeaten ||= []).includes(world.id) || l.character.bossesBeaten.push(world.id);
    }
    g.setBit(d.flag[0], d.flag[1]);
    // Jashiin's fall is the victory: save byte 0x49 is what the King's "post victory" speech
    // and the Princess's chamber (the ending) check for.
    if (d.final) g.setBit('0x49', 0xff);
    g.toast(`${d.name} is defeated! +${d.xp} XP${almas ? `, +${almas} almas` : ''}`, COLORS.gold);
    g.coop?.onBossDefeated?.(world.id);
    // Reload the arena's objects with the post-boss tables; the exit door appears where you stand.
    const { spawnEntities } = await import('./entities.js');
    world.props = [];
    world.doors = [];
    await spawnEntities(g, world, world.data);
    const lead = g.leader.hero;
    for (const door of world.doors) {
      const left = Math.round(lead.x / TILE) + (lead.dir > 0 ? 3 : -4);
      const dx = left - door.d.enter.heroLeftColumn;
      door.d = { ...door.d, frame: { ...door.d.frame, x: door.d.frame.x + dx }, enter: { ...door.d.enter, heroLeftColumn: left } };
      door.x = door.d.frame.x * TILE;
      door.stamp(world.map);
    }
    world.bossDone = !d.noTear;
    world.tearDoor = !d.noTear;
    world.boss = null;
    audio.playMusic(world.data.music || 'moss_crypt');
    g.save();
  }

  update(dt, world) {
    if (this.dead) return;
    if (this.flash > 0) this.flash -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.dying) {
      this.deathT += dt;
      if (Math.random() < dt * 14) world.effect('poof', this.x + random() * this.w, this.y + random() * this.h, { life: 0.5 });
      if (this.deathT > 3.4 && !this.finishing) { this.finishing = true; this.finish(world); }
      return;
    }
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.ptx = this.tx; this.pty = this.ty;
      this.f++;
      const hero = world.nearestHero(this);
      AI[this.def.ai]?.(this, world, hero);
      for (const p of this.parts) { p.age = (p.age || 0) + 1; p.step?.(p); }
      this.parts = this.parts.filter((p) => p.age < (p.life || 1e9));
      if (this.regen && this.f % 64 === 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 1);
    }
    const a = Math.min(1, this.acc / FRAME);
    this.x = (this.ptx + (this.tx - this.ptx) * a) * TILE;
    this.y = (this.pty + (this.ty - this.pty) * a) * TILE;
  }

  // Helpers used by the behaviours (tile units).
  heroCol(hero) { return hero ? hero.cx / TILE : this.tx; }
  clampX() { const r = this.def.range; if (r) this.tx = Math.max(r[0], Math.min(r[1], this.tx)); }
  shoot(world, x, y, vx, vy, dmg, opts = {}) {
    world.spawnProjectile({ x: x * TILE, y: y * TILE, vx: vx * TPS, vy: vy * TPS, dmg, life: (opts.steps || 50) * FRAME, w: opts.w || 22, h: opts.h || 22, color: opts.color || '#ffb060', color2: '#fff', ghost: opts.ghost, gravity: opts.gravity, from: 'boss', kind: opts.kind || 'boss' });
  }

  draw(cx, cy, t) {
    if (this.dead) return;
    const sh = sheetNow(`art.boss.${this.def.id}`);
    const x = this.x + this.w / 2 - cx, y = this.y + this.h - cy;
    let alpha = this.hidden ? 0.15 : 1;
    if (this.dying) alpha = Math.max(0, 1 - Math.max(0, this.deathT - 1.6) / 1.8);
    if (this.dying && Math.floor(this.deathT * 16) % 2 && this.deathT < 1.6) alpha *= 0.4;
    if (sh) {
      const pose = `p${this.pose}`;
      const f = sh.anims[pose] ? sh.anims[pose][0] : sh.frameAt('idle', t);
      sh.draw(ctx, f, x, y, this.dir, alpha);
      if (this.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; sh.draw(ctx, f, x, y, this.dir, Math.min(1, this.flash * 5)); ctx.restore(); }
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.flash > 0 ? '#fff' : '#803050';
      ctx.fillRect(x - this.w / 2, y - this.h, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    // Breath / flame parts
    for (const p of this.parts) {
      if (!p.draw) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy, 2, p.x + p.w / 2 - cx, p.y + p.h / 2 - cy, Math.max(p.w, p.h) * 0.7);
      g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, p.color || '#ff7020'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - cx - 10, p.y - cy - 10, p.w + 20, p.h + 20);
      ctx.restore();
    }
    if (this.game.debug) { const b = this.body(); ctx.strokeStyle = '#f0f'; ctx.strokeRect(b.x - cx, b.y - cy, b.w, b.h); const wk = this.weakBox(); if (wk) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(wk.x - cx, wk.y - cy, wk.w, wk.h); } }
  }
  drawHud() {
    if (this.dead) return;
    panel(W / 2 - 220, 486, 440, 44, { alpha: 0.9 });
    text(this.def.name, W / 2 - 200, 495, { size: 16, color: COLORS.red });
    bar(W / 2 - 110, 500, 310, 12, this.hp / this.maxHp, '#c03a3a', { segments: 20 });
  }
}

function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

// ---------------------------------------------------------------- behaviours
const AI = {
  // Walks the floor two frames a column; hops and drips acid; shoved back by hits.
  crab(b, world, hero) {
    if (b.st === 'jump') {
      const arc = [-1, -1, -1, 0, 0, 1, 1, 1];
      b.ty += arc[b.n] || 0;
      if (b.n === 4) b.shoot(world, b.tx + 4.5, b.ty + 4, 0, 1, 6, { steps: 8, color: '#9fe060', w: 18, h: 22 });
      if (++b.n >= arc.length) { b.st = 'walk'; b.n = 0; }
      b.pose = 2;
      return;
    }
    b.pose = b.f % 4 < 2 ? 0 : 1;
    if (b.f % 2 === 0) { b.tx += b.dir; if (b.tx <= b.def.range[0] || b.tx >= b.def.range[1]) b.dir = -b.dir; b.clampX(); }
    if (random() < 1 / 24) { b.st = 'jump'; b.n = 0; }
    b.onHit = (w, h) => { if (h) { b.tx += h.cx / TILE > b.tx + 5 ? -2 : 2; b.clampX(); } };
  },
  // Stationary; flinches when hit; after two flinches spits poison leftwards.
  octopus(b, world, hero) {
    b.pose = b.flinch > 0 ? 3 : (b.f >> 2) % 2;
    if (b.flinch > 0) b.flinch--;
    b.onHit = () => { if (!b.flinch) { b.stage = (b.stage || 0) + 1; b.flinch = 16; audio.sfx('boss_hurt', { vol: 0.5 }); } };
    if ((b.stage || 0) >= 2 && !b.flinch && b.f % 40 === 0) {
      b.pose = 2;
      for (let i = 0; i < 4; i++) b.shoot(world, b.tx + 3 - i * 0.8, b.ty + 4.5, -1, 0, 10, { steps: 24, color: '#a060ff' });
    }
  },
  // Stalks at 12 columns, shoots its beak, flaps up and swoops at the knight.
  chicken(b, world, hero) {
    const hc = b.heroCol(hero);
    if (b.st === 'glide') {
      b.ty = Math.max(14, b.ty - 1);
      if (b.ty <= 14) { b.tx += Math.sign(hc - (b.tx + 4)) || -1; b.clampX(); }
      b.pose = 2;
      if (++b.n > 26 || (Math.abs(hc - (b.tx + 4)) < 2 && b.n > 10)) { b.st = 'land'; b.n = 0; }
      return;
    }
    if (b.st === 'land') { b.ty = Math.min(18, b.ty + 1); b.pose = 3; if (b.ty >= 18) b.st = 'stalk'; return; }
    b.pose = (b.f >> 1) % 2;
    if (b.f % 2 === 0) { const gap = b.tx - hc; if (gap > 12) b.tx--; else if (gap < 12) b.tx++; b.clampX(); }
    if (random() < 1 / 16) b.shoot(world, b.tx + 0.5, b.ty + 3.5, -1, 0, 40, { color: '#ffe080', w: 20, h: 12 });
    if (random() < 1 / 40 || b.tx >= b.def.range[1]) { b.st = 'glide'; b.n = 0; }
    b.onHit = () => { if (b.st === 'glide') { b.st = 'land'; } else if (b.tx < 48) b.tx++; };
  },
  // Agar / Paguro: slithers toward the knight, hops, and fires spheres both ways.
  agar(b, world, hero) {
    const hc = b.heroCol(hero);
    b.pose = (b.f >> 1) % 4 < 2 ? 0 : 1;
    if (b.st === 'jump') { const arc = [-1, -1, 0, 1, 1]; b.ty += arc[b.n]; b.pose = 2; if (++b.n >= arc.length) { b.st = 'slither'; b.n = 0; } return; }
    const ph = b.f % 16;
    if (ph === 0 && hc < b.tx + 4) b.tx--;
    if (ph === 8 && hc > b.tx + 4) b.tx++;
    b.clampX();
    if (random() < 1 / 16) { b.st = 'jump'; b.n = 0; }
    if (b.f % 20 === 10) {
      b.pose = 3;
      if (hc < b.tx + 4) b.shoot(world, b.tx + 1, b.ty + 3.5, -1, 0, b.def.shot, { color: '#80f0ff' });
      else b.shoot(world, b.tx + 7, b.ty + 3.5, 1, 0, b.def.shot, { color: '#80f0ff' });
    }
    b.onHit = (w, h) => { if (h) { b.tx += h.cx / TILE < b.tx + 4 ? 2 : -2; b.clampX(); } };
  },
  // Cruises wall to wall; altitude low only in the corners; drops green spit in pairs.
  vista(b, world) {
    b.tx += b.dir;
    if (b.tx <= 9 || b.tx >= 49) b.dir = -b.dir;
    b.clampX();
    const x = b.tx;
    b.ty = x < 14 ? 12 - (x - 9) : x > 44 ? 7 + (x - 44) : 7;
    b.pose = (b.f >> 1) % 2;
    b.mouth = ((b.mouth || 0) + 1) % 8;
    if (b.mouth === 4) { b.pose = 2; b.shoot(world, b.tx + 6, b.ty + 11, 0, 1, 80, { color: '#90ff60', w: 16, h: 22 }); b.shoot(world, b.tx + 7.5, b.ty + 9.5, 0, 1, 80, { color: '#90ff60', w: 16, h: 22 }); }
  },
  // Advances on the knight, throws rocks that bounce and roll; hits push him back.
  tarso(b, world, hero) {
    const step = b.f % 8;
    b.pose = (b.f >> 1) % 2;
    if (b.retreat > 0) { b.retreat--; if (step % 2 === 0) b.tx++; b.clampX(); return; }
    if ([2, 5, 6, 7, 0].includes(step)) b.tx--;
    if (step === 7) b.tx--;
    b.clampX();
    if (b.tx <= 14) b.retreat = 20;
    if (b.f % 24 === 6) {
      b.pose = 2;
      world.spawnProjectile({ x: (b.tx + 1) * TILE, y: b.ty * TILE + 30, vx: -TPS * 0.9, vy: -TPS * 0.6, gravity: TPS * 3, dmg: 80, life: 80 * FRAME, w: 40, h: 40, color: '#a08060', color2: '#e0d0b0',
        onWall(p) { if (p.vy > 0) { p.vy = -Math.abs(p.vy) * 0.55; p.y -= 4; p.bounces = (p.bounces || 0) + 1; } else p.vx = -Math.abs(p.vx); if (p.bounces > 3) p.vy = 0; }, kind: 'rock' });
    }
    b.onHit = () => { if (b.tx < 47) b.retreat = 20; };
  },
  // Stalks from the right, breathes fire along the floor; retreats when struck on the head.
  dragon(b, world, hero) {
    const hc = b.heroCol(hero);
    b.pose = (b.f >> 1) % 2;
    if (b.retreat > 0) { b.retreat--; b.tx++; b.clampX(); b.parts = []; return; }
    if (b.breath > 0) {
      b.breath--;
      b.pose = 2;
      const len = Math.min(14, 14 - b.breath);
      b.parts = [{ x: (b.tx - len) * TILE, y: (b.ty + 4) * TILE, w: len * TILE, h: 2 * TILE, dmg: 40, draw: true, color: '#ff6010', life: 2, age: 0 }];
      if (b.breath === 0) b.parts = [];
      return;
    }
    if (b.f % 4 === 0 && hc < b.tx - 2) b.tx--;
    b.clampX();
    if (b.f % 30 === 15) b.breath = 18;
    if (b.f % 50 === 25) b.shoot(world, b.tx, b.ty + 3, -1, 0, RULES.jp ? 80 : 120, { color: '#ff8030', w: 30, h: 20 });
    b.onHit = (w, h) => { if (h && b.weakBox() && overlap(h.swordBox() || {}, b.weakBox())) b.retreat = 7; };
  },
  // Sweeps the room at two tiles a frame, swooping low near the walls, breathing fire.
  alguien(b, world, hero) {
    b.tx += 2 * b.dir;
    if (b.tx <= 10) { b.tx = 10; b.dir = 1; }
    if (b.tx >= 51) { b.tx = 51; b.dir = -1; }
    const i = Math.floor((b.tx - 10) / 2);
    const prof = b.dir > 0 ? [-4, -4, -3, -2, -1, -1, 0, 0, 0] : [];
    b.ty = b.dir > 0 ? (prof[i] ?? 1) + 2 : (i > 11 ? [0, 0, 0, -1, -1, -2, -3, -4, -4][Math.min(8, 20 - i)] ?? 1 : 1) + 2;
    b.pose = b.f % 3;
    if (b.f % 3 === 0) audio.sfx('wing_flap', { vol: 0.3, throttle: 0.2 });
    if (b.f % 26 < 8) {
      const hx = b.dir > 0 ? b.tx + 13 : b.tx - 8;
      b.parts = [{ x: hx * TILE, y: (b.ty + 6) * TILE, w: 8 * TILE, h: 2 * TILE, dmg: 80, draw: true, color: '#ff40a0', life: 2, age: 0 }];
    } else b.parts = [];
  },
  // Vanishes and reappears near the knight, hurling fireballs and lightning; below 200
  // HP he stays visible on the ground and attacks relentlessly.
  jashiin(b, world, hero) {
    const hc = b.heroCol(hero);
    const grounded = b.hp < 200;
    b.dir = hc > b.tx + 3 ? 1 : -1;
    if (!grounded) {
      b.cycle = ((b.cycle || 0) + 1) % 60;
      b.hidden = b.cycle > 44;
      if (b.cycle === 0) { b.tx = Math.max(15, Math.min(53, Math.round(hc + (random() < 0.5 ? -9 : 6)))); b.ptx = b.tx; }
      b.pose = b.hidden ? 3 : (b.f >> 2) % 2;
    } else { b.hidden = false; b.pose = (b.f >> 1) % 2; if (b.f % 3 === 0) { b.tx += b.dir; b.clampX(); } }
    if (!b.hidden && b.f % (grounded ? 14 : 22) === 6) {
      b.pose = 2;
      const fx = b.dir > 0 ? b.tx + 5 : b.tx;
      b.shoot(world, fx, b.ty + 4, b.dir, 0.33, 80, { steps: 11, color: '#ff5030', w: 26, h: 26 });
    }
    if (!b.hidden && b.f % (grounded ? 20 : 33) === 16) {
      const bx = b.dir > 0 ? b.tx + 7 : b.tx - 1;
      b.shoot(world, bx, b.ty + 4, b.dir * 1.5, 0, 80, { steps: 16, color: '#a0c8ff', w: 34, h: 12, ghost: true });
    }
  },
};

// MP90: Jashiin appears, speaks three lines, and the real battle (MPA0) begins.
class JashiinIntro {
  constructor(game, world) {
    this.game = game; this.world = world; this.t = 0;
    this.lines = [[0.8, 'Finally, you reached me.'], [3.4, 'I enjoyed your show.'], [6.0, "Come on!  I'll kill you."]];
    world.boss = { dead: false, update: (dt) => this.update(dt), draw: (cx, cy, t) => this.draw(cx, cy, t), hitTest: () => false, touches: () => null, damage() {}, x: 20 * TILE, y: 9 * TILE, w: 6 * TILE, h: 9 * TILE, cx: 23 * TILE, drawHud: () => this.hud() };
    for (const h of world.heroes) h.frozen = true;
    preloadSheets(['art.boss.jashiin']);
  }
  update(dt) {
    this.t += dt;
    if (this.t > 8.8 && !this.went) {
      this.went = true;
      for (const h of this.world.heroes) h.frozen = false;
      const g = this.game, lead = g.leader.hero;
      g.travel({ kind: 'cavern', map: 'mpa0', x: 12, headRow: Math.round(lead.y / TILE) });
    }
  }
  draw(cx, cy, t) {
    const sh = sheetNow('art.boss.jashiin');
    const a = Math.min(1, Math.max(0, (this.t - 1.5) / 2));
    if (sh) sh.draw(ctx, sh.anims.p0?.[0] ?? 0, 30 * TILE - cx, 18 * TILE - cy, -1, a);
  }
  hud() {
    const cur = this.lines.filter(([at]) => this.t >= at).pop();
    if (cur) { panel(W / 2 - 260, 420, 520, 60); text(cur[1], W / 2, 440, { size: 20, align: 'center', color: '#ff8a8a' }); }
  }
}
