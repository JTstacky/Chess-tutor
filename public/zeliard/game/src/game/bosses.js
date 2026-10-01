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
  mp3d: { id: 'pollo', name: 'Pollo', hp: 500, xp: 500, x: 46, y: 18, tw: 9, th: 8, range: [13, 48], contact: 18, weak: [0, 0, 3, 3], weakContact: 56, jpContact: 20, jpWeakContact: 64,
    dmg: (d, src, weak) => d * (weak ? 8 : RULES.jp ? 1 : 2), ai: 'chicken', flag: ['0x10', 0xff] },
  mp4d: { id: 'agar', name: 'Agar', hp: 500, xp: 1000, x: 48, y: 12, tw: 8, th: 6, range: [17, 50], contact: 30,
    dmg: (d, src) => (src === 4 ? Math.floor(d / 2) * 4 : Math.floor(d / 2)), ai: 'agar', shot: 80, flag: ['0x18', 0xff] },
  mp5d: { id: 'vista', name: 'Vista', hp: 700, xp: 3000, x: 48, y: 11, tw: 14, th: 12, range: [9, 49], contact: 30,
    dmg: (d, src, weak, ctx) => Math.floor(d / 8) * (src === 1 && SWORD_NUM[ctx.sword] >= 4 ? 32 : 1), ai: 'vista', flag: ['0x20', 0xff] },
  mp6d: { id: 'tarso', name: 'Tarso', hp: 640, xp: 6000, x: 38, y: 7, tw: 8, th: 10, range: [14, 50], contact: 160,
    dmg: (d, src) => (src === 1 ? d * 2 : src === 9 ? d : Math.floor(d / 8)), ai: 'tarso', flag: ['0x28', 0xff] },
  mp73: { id: 'paguro', name: 'Paguro', hp: 600, xp: 3000, x: 48, y: 12, tw: 8, th: 6, range: [17, 50], contact: 30, noTear: true,
    dmg: (d, src) => (RULES.jp && src === 4 ? Math.floor(d / 2) * 2 : Math.floor(d / 2)), ai: 'agar', shot: 120, flag: ['0x30', 0xff] },
  // The original body is 29 x 10 with the head at x; the remastered art is drawn 34 long (head to
  // tail tip), so the box runs 34 and x still marks the head end.
  mp7d: { id: 'dragon', name: 'Dragon', hp: 800, xp: 12000, x: 30, y: 8, tw: 34, th: 10, range: [15, 30], contact: 30, weak: [0, 6, 4, 4], jpWeak: [30, 0, 4, 10], weakContact: 40,
    // DOS: half from the sword, an eighth from anything else, head doubles. Japanese: 1/8, tail 1/2.
    dmg: (d, src, weak) => (RULES.jp ? (weak ? d >> 1 : d >> 3) : ((src === 1 ? d >> 1 : d >> 3) * (weak ? 2 : 1))), ai: 'dragon', flag: ['0x32', 0xff] },
  // Japanese: sword and spells 1/8, the tail 1/4; its breath hurts twice as much.
  mp8d: { id: 'alguien', name: 'Alguien', hp: 800, xp: 30000, x: 42, y: 0, tw: 13, th: 13, range: [10, 51], contact: 40, jpWeak: [2, 10, 9, 3],
    dmg: (d, src, weak) => (RULES.jp ? (weak ? d >> 2 : d >> 3) : d), ai: 'alguien', flag: ['0x3a', 0x01] },
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
    this.tx = def.x; this.ty = def.y; this.ptx = this.tx; this.pty = this.ty;
    this.w = def.tw * TILE; this.h = def.th * TILE;
    this.x = this.tx * TILE; this.y = this.ty * TILE;
    this.dir = -1;
    this.acc = 0; this.f = 0; this.st = 'idle'; this.n = 0;
    this.flash = 0; this.dead = false; this.deathT = 0;
    this.parts = []; // extra hazards (flames, breath) as boxes with damage
    this.pose = 0;
    this.contactDmg = (RULES.jp && def.jpContact) || def.contact;
    this.weakContact = (RULES.jp && def.jpWeakContact) || def.weakContact;
    audio.playMusic('boss_theme');
  }
  get cx() { return this.x + this.w / 2; }
  body() { const m = 0.12; return { x: this.x + this.w * m, y: this.y + this.h * m, w: this.w * (1 - 2 * m), h: this.h * (1 - m) }; }
  weakBox() {
    // A behaviour can move the weak spot with the pose (the Dragon's head), in tiles of the body.
    const k = (RULES.jp && this.def.jpWeak) || this.weakRect || this.def.weak;
    if (!k) return null;
    const [wx, wy, ww, wh] = k;
    // The art faces left; mirror the weak spot when facing right.
    const x = this.dir < 0 ? wx : this.def.tw - wx - ww;
    return { x: (this.tx + x) * TILE, y: (this.ty + wy) * TILE, w: ww * TILE, h: wh * TILE };
  }
  // hidden: not there at all; ghost: drawn while blinking in or out, but can't hurt or be hit.
  hitTest(box) { return !this.dead && !this.hidden && !this.ghost && overlap(box, this.body()); }
  touches(hb) {
    if (this.dead || this.dying) return null;
    for (const p of this.parts) if (p.dmg && overlap(hb, p)) return { dmg: p.dmg };
    if (this.hidden || this.ghost || !overlap(hb, this.body())) return null;
    const wk = this.weakBox();
    return { dmg: wk && this.weakContact && overlap(hb, wk) ? this.weakContact : this.contactDmg };
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
    // The original takes at most one hit per frame and has no invulnerability after it.
    this.hurtT = FRAME;
    audio.sfx('boss_hit', { vol: 0.8 });
    this.onHit?.(world, hero, weak);
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
    if (this.hidden && !this.dying) { this.drawParts(cx, cy); return; }
    let alpha = this.ghost ? 0.45 : 1;
    if (this.dying) alpha = Math.max(0, 1 - Math.max(0, this.deathT - 1.6) / 1.8);
    if (this.dying && Math.floor(this.deathT * 16) % 2 && this.deathT < 1.6) alpha *= 0.4;
    if (sh) {
      const pose = `p${this.pose}`;
      const f = this.def.poseFrames ? this.def.poseFrames[this.pose] : sh.anims[pose] ? sh.anims[pose][0] : sh.frameAt('idle', t);
      sh.draw(ctx, f, x, y, this.dir, alpha);
      if (this.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; sh.draw(ctx, f, x, y, this.dir, Math.min(1, this.flash * 5)); ctx.restore(); }
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.flash > 0 ? '#fff' : '#803050';
      ctx.fillRect(x - this.w / 2, y - this.h, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    this.drawParts(cx, cy);
    if (this.game.debug) { const b = this.body(); ctx.strokeStyle = '#f0f'; ctx.strokeRect(b.x - cx, b.y - cy, b.w, b.h); const wk = this.weakBox(); if (wk) { ctx.strokeStyle = '#ff0'; ctx.strokeRect(wk.x - cx, wk.y - cy, wk.w, wk.h); } }
  }
  // Breath, flames, rocks and fireballs. Their look is plain data (look/color/r) so co-op guests,
  // who get the parts as a snapshot without functions, draw them too.
  drawParts(cx, cy) {
    for (const p of this.parts) {
      if (p.look === 'rock') rockPaint(p.x - cx, p.y - cy, p);
      else if (p.color) glowPaint(p.color, p.r)(p.x - cx, p.y - cy, p);
    }
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
// Ports of each boss module's state machine (data/rules/bosses.json cites the code). All counts
// are original frames (FRAME); positions are tiles; `hc` is the knight's centre column.
const T = TILE;
const toward = (b, hc, centre) => (b.tx + centre < hc ? 1 : -1);
// A boss-cell hazard (acid, rock, fireball, lightning): contact damage, moved by `step` each frame.
const cell = (x, y, dmg, o = {}) => ({ x: x * T, y: y * T, w: (o.w || 2) * T, h: (o.h || 2) * T, dmg, age: 0, ...o });
const glowPaint = (color, r = 0.75) => (x, y, p) => {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cx = x + p.w / 2, cy = y + p.h / 2, g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(p.w, p.h) * r);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.45, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - p.w, y - p.h, p.w * 3, p.h * 3);
  ctx.restore();
};
const rockPaint = (x, y, p) => {
  if (p.shatter) { ctx.fillStyle = '#8a7058'; for (let i = 0; i < 6; i++) ctx.fillRect(x + ((i * 17) % p.w), y + p.h - 8 - ((i * 7) % 14), 7, 7); return; }
  const r = p.w / 2;
  ctx.fillStyle = '#5a4634'; ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a08060'; ctx.beginPath(); ctx.arc(x + r - 4, y + r - 4, r - 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8c4a0'; ctx.fillRect(x + r - 10, y + r - 12, 8, 5);
};

const AI = {
  // Cangrejo (crab.asm): patrols a column every 2 frames; each frame a 1/8 chance to crouch
  // (7 frames), then leaps 13 columns toward the knight (up 5, level 3, down 5) dropping acid on
  // the 4th step, recoils 4 frames and turns round. Every damaging hit shoves it 2 columns away.
  crab(b, world, hero) {
    const hc = b.heroCol(hero);
    b.onHit = (w, h) => { if (h) { b.tx += h.cx / T > b.tx + 5 ? -2 : 2; b.clampX(); } };
    if (b.st === 'crouch') {
      b.pose = 2;
      if (++b.n >= 7) { b.st = 'jump'; b.n = 0; b.jdir = toward(b, hc, 5); }
      return;
    }
    if (b.st === 'jump') {
      b.ty += b.n < 5 ? -1 : b.n < 8 ? 0 : 1;
      b.tx += b.jdir; b.clampX();
      if (b.n === 3) {
        audio.sfx('slime', { vol: 0.5 });
        // Acid droplet: falls a row a frame for 7 frames, then splashes for 2.
        b.parts.push(cell(b.tx + 4, b.ty + 3, 6, { w: 1, h: 1.5, life: 9, step(p) { if (p.age <= 7) p.y += T; }, color: '#9fe060', r: 0.9 }));
      }
      b.pose = 3;
      if (++b.n >= 13) { b.st = 'recoil'; b.n = 0; }
      return;
    }
    if (b.st === 'recoil') {
      b.pose = b.n < 3 ? 2 : 0;
      if (++b.n >= 4) { b.st = 'walk'; b.dir = -b.dir; }
      return;
    }
    b.pose = b.f % 4 < 2 ? 0 : 1;
    if (b.f % 2 === 0) { b.tx += b.dir; if (b.tx <= b.def.range[0] || b.tx >= b.def.range[1]) b.dir = -b.dir; b.clampX(); }
    if (random() < 1 / 8) { b.st = 'crouch'; b.n = 0; }
  },

  // Pulpo (TAKO): sits still and harmless until struck. Each hit outside a flinch starts a
  // 16-frame flinch; after the second the front arms are gone and it spits: a 4-frame wind-up,
  // then 4 columns of poison sliding left a column a frame for 24 frames, then the next wind-up.
  octopus(b, world) {
    b.onHit = () => { if (!b.flinch) { b.stage = Math.min(2, (b.stage || 0) + 1); b.flinch = 16; audio.sfx('boss_hurt', { vol: 0.5 }); } };
    if (b.flinch > 0) { b.flinch--; b.pose = b.flinch % 2 ? 3 : 0; return; }
    b.pose = (b.f >> 2) % 2;
    if ((b.stage || 0) < 2) return;
    if (b.parts.length) return; // the spit is still travelling
    b.wind = (b.wind || 0) + 1;
    b.pose = b.wind % 2 ? 2 : 0;
    if (b.wind >= 4) {
      b.wind = 0; b.pose = 2;
      audio.sfx('slime', { vol: 0.6 });
      for (let i = 0; i < 4; i++) b.parts.push(cell(b.tx + 3 - i, b.ty + 4.5, 10, { w: 1, h: 1.2, life: 24, step(p) { p.x -= T; }, color: '#a060ff', r: 0.9 }));
    }
  },

  // Pollo (TORI): keeps 12 columns from the knight, stepping every 2 frames. 1/16 a frame it
  // bobs its head (6 frames) and fires its beak. Holding at 12 (1/32 a frame), cornered, or hit
  // while x >= 20 it flaps 4 times, glides up and left for up to 15 frames, then lands a row
  // every 2 frames drifting left. A hit on the ground steps it right; a hit in the air lands it.
  chicken(b, world, hero) {
    const H = Math.round(b.heroCol(hero)) - 1; // the knight's left column
    b.onHit = () => {
      b.flinchT = 4;
      if (b.st === 'glide') { b.st = 'land'; b.n = 0; return; }
      if (b.st === 'stalk' || b.st === 'shoot' || !b.st) { if (b.tx < 48) b.tx++; if (b.tx >= 20) { b.st = 'flap'; b.n = 0; } }
    };
    if (b.flinchT > 0) b.flinchT--;
    if (b.st === 'shoot') {
      b.pose = 1;
      if (++b.n >= 6) { b.shoot(world, b.tx + 0.5, b.ty + 3.5, -1, 0, 40, { color: '#ffe080', w: 20, h: 12 }); b.st = 'stalk'; }
      return;
    }
    if (b.st === 'flap') {
      b.pose = (b.n / 3 | 0) % 2 ? 2 : 0;
      if (b.n % 3 === 0) audio.sfx('wing_flap', { vol: 0.4 });
      if (++b.n >= 12) { b.st = 'glide'; b.n = 0; }
      return;
    }
    if (b.st === 'glide') {
      b.pose = 2;
      b.ty = Math.max(14, b.ty - 1);
      if (b.tx >= 17) b.tx--;
      if (b.n % 4 === 0) audio.sfx('wing_flap', { vol: 0.3 });
      if (++b.n >= 15 || b.tx < 17) { b.st = 'land'; b.n = 0; }
      return;
    }
    if (b.st === 'land') {
      b.pose = 3;
      if (++b.n % 2 === 0) { b.ty = Math.min(18, b.ty + 1); if (b.tx >= 13) b.tx--; }
      if (b.ty >= 18) b.st = 'stalk';
      return;
    }
    b.st = 'stalk';
    b.pose = b.flinchT > 0 ? 3 : (b.f >> 1) % 2;
    if (b.f % 2 === 0) {
      const gap = b.tx - H;
      if (gap > 12) { if (b.tx >= 13) b.tx--; }
      else if (gap < 12) { if (b.tx < 48) b.tx++; else { b.st = 'flap'; b.n = 0; return; } }
      else if (random() < 1 / 32) { b.st = 'flap'; b.n = 0; return; }
    }
    if (random() < 1 / 16) { b.st = 'shoot'; b.n = 0; }
  },

  // Agar (ZELA) and Paguro (ZEL2): a 16-frame slither (phase every 2 frames) creeping toward
  // the knight; 1/16 a frame a crouch and a 10-step leap that stops once the body is over him;
  // spheres fired to his side (armed on phase 2/6 half the time, released on phase 4/0). Every
  // hit shoves it 2 columns away.
  agar(b, world, hero) {
    const hc = b.heroCol(hero);
    const crouch = b.id === 'paguro' ? 4 : 3;
    b.onHit = (w, h) => { if (h) { b.tx += h.cx / T < b.tx + 4 ? 2 : -2; b.clampX(); } };
    if (b.st === 'crouch') { b.pose = 2; if (++b.n >= crouch) { b.st = 'air'; b.n = 0; b.jdir = toward(b, hc, 4); } return; }
    if (b.st === 'air') {
      // Rise 1; rise+step x3; step x2; fall+step x3; fall and land.
      const dy = [-1, -1, -1, -1, 0, 0, 1, 1, 1, 1][b.n], dx = b.n >= 1 && b.n <= 8;
      b.ty += dy;
      if (dx && Math.round(b.tx + 4) !== Math.round(hc)) { b.tx += b.jdir; b.clampX(); }
      b.pose = 2;
      if (++b.n >= 10) { b.st = 'landing'; b.n = 0; }
      return;
    }
    if (b.st === 'landing') { b.pose = 2; if (++b.n >= 4) { b.st = 'slither'; b.n = 0; } return; }
    b.st = 'slither';
    const ph = (b.f >> 1) % 8, left = hc < b.tx + 4;
    b.pose = (ph >> 1) % 2;
    // Agar steps on both frames of its phase (2 columns a cycle); Paguro once (1 per 16 frames).
    const stepNow = b.id === 'paguro' ? b.f % 2 === 0 : true;
    if (stepNow && ph === 0 && left) b.tx--;
    if (stepNow && ph === 4 && !left) b.tx++;
    b.clampX();
    if (b.armed) {
      b.pose = 3;
      if (b.armed === 'L' && ph === 4) { b.shoot(world, b.tx + 1, b.ty + 3, -1, 0, b.def.shot, { color: '#80f0ff' }); b.armed = null; }
      else if (b.armed === 'R' && ph === 0) { b.shoot(world, b.tx + 7, b.ty + 3, 1, 0, b.def.shot, { color: '#80f0ff' }); b.armed = null; }
      return;
    }
    if (random() < 1 / 16) { b.st = 'crouch'; b.n = 0; return; }
    if (random() < 0.5) { if (left && ph === 2) b.armed = 'L'; else if (!left && ph === 6) b.armed = 'R'; }
  },

  // Vista (MEDA): cruises a column a frame between the walls, its altitude from the table (low
  // only in the corners), spitting a pair of drops every 8 frames. At cruise height with the
  // knight under its belly it dives: waits 3 frames, drops to row 11, climbs back.
  vista(b, world, hero) {
    const hc = b.heroCol(hero);
    b.mouth = ((b.mouth || 0) + 1) % 8;
    if (b.mouth === 4) { b.pose = 2; b.shoot(world, b.tx + 6, b.ty + 11, 0, 1, 80, { color: '#90ff60', w: 16, h: 22 }); b.shoot(world, b.tx + 7.5, b.ty + 9.5, 0, 1, 80, { color: '#90ff60', w: 16, h: 22 }); }
    else b.pose = (b.f >> 1) % 2;
    if (b.st === 'dive') {
      b.n++;
      if (b.n > 3 && !b.rising) { b.ty++; if (b.ty >= 11) b.rising = true; }
      else if (b.rising) { b.ty--; if (b.ty <= 7) { b.st = 'cruise'; b.rising = false; } }
      return;
    }
    b.tx += b.dir;
    if (b.tx <= 9 || b.tx >= 49) b.dir = -b.dir;
    b.clampX();
    const x = b.tx;
    b.ty = x < 14 ? 12 - (x - 9) : x > 44 ? 7 + (x - 44) : 7;
    if (b.ty === 7 && hc > b.tx + 5 && hc <= b.tx + 7) { b.st = 'dive'; b.n = 0; b.rising = false; }
  },

  // Tarso (LEGA): an 8-frame walk stepping left on frames 2,5,6,7(x2),0. At the left wall it
  // backs off for up to 60 frames (to x 50); a hit backs it off 20. On walk frame 6, half the
  // time, with no rock out and x >= 20 it throws a boulder (3 frames) and stands while the rock
  // makes its first 13 moves: thrown, drops, bounces twice, rolls left, shatters at x < 18.
  tarso(b, world) {
    const ROCK = [[-1, 0], [-1, 0], [-1, 1], [0, 2], [-1, 2], [0, 2], [-1, 2], [-1, -2], [-1, 0], [-1, 2], [-1, -1], [-1, 0], [-1, 1]];
    b.onHit = () => { if (b.tx < 47) { b.retreat = 20; b.st = 'walk'; } };
    const rock = b.parts.find((p) => p.rock);
    if (b.st === 'throw') {
      b.pose = 2;
      if (b.n === 0) {
        audio.sfx('stomp', { vol: 0.7 });
        b.parts.push(cell(b.tx + 3, b.ty - 1, 80, { rock: true, look: 'rock', life: 999,
          step(p) {
            if (p.shatter) { if (++p.shatter > 3) p.age = p.life; return; }
            const [dx, dy] = ROCK[p.age - 1] || [-1, 0];
            p.x += dx * T; p.y += dy * T;
            if ([9, 12, 15].includes(p.age)) audio.sfx('stomp', { vol: 0.35 });
            if (p.x / T < 18) { p.shatter = 1; p.dmg = 0; }
          } }));
      }
      if (++b.n >= 3) { b.st = 'hold'; }
      return;
    }
    if (b.st === 'hold') { b.pose = 0; if (!rock || rock.age >= 13) b.st = 'walk'; return; }
    b.st = 'walk';
    b.wf = ((b.wf || 0) + (b.retreat > 0 ? 7 : 1)) % 8; // the walk runs backwards in retreat
    b.pose = (b.wf >> 1) % 2;
    if (b.retreat > 0) {
      b.retreat--;
      if ([7, 6, 3, 1].includes(b.wf)) b.tx++;
      b.clampX();
      if (b.tx >= 50) b.retreat = 0;
      return;
    }
    if ([2, 5, 6, 7, 0].includes(b.wf)) b.tx--;
    if (b.wf === 7) b.tx--;
    b.clampX();
    if (b.tx <= 14) { b.retreat = 60; return; }
    if (b.wf === 6 && random() < 0.5 && !rock && b.tx >= 20) { b.st = 'throw'; b.n = 0; }
  },

  // Dragon (DRGN): walks left a tile every 2 frames to x 15. Its head follows the knight: low at
  // the snout when he is in front, raised when he is under the head, mid when under the body.
  // In those poses 1/4 a frame it chews for 6 frames and breathes for 10: a jet along the floor
  // in front, or an arc down onto the ground under the head (shifted 4 under the body). A head
  // hit cancels the breath, slams the head down (the "chomp") and backs it up 7 tiles; a body
  // hit backs it all the way to x 30.
  dragon(b, world, hero) {
    const H = Math.round(b.heroCol(hero)) - 1;
    const HEAD = { low: [0, 6, 4, 4], high: [2, 0, 5, 5], mid: [4, 2, 5, 5] };
    b.onHit = (w, h, weak) => {
      // The reaction is to a head hit (in the Japanese version the damage bonus is on the tail).
      const r = HEAD[b.head || 'low'], hx = b.dir < 0 ? r[0] : b.def.tw - r[0] - r[2];
      const head = { x: (b.tx + hx) * T, y: (b.ty + r[1]) * T, w: r[2] * T, h: r[3] * T };
      const sb = h?.swordBox?.();
      if (sb ? overlap(sb, head) : weak && !RULES.jp) {
        audio.sfx('boss_hurt', { vol: 0.6 });
        b.st = 'react'; b.n = 0; b.parts = []; b.retreat = 7;
        b.script = b.head === 'low' ? ['mid', 'low', 'mid', 'low', 'low', 'mid', 'mid'] : ['low', 'low', 'low', 'mid', 'mid', 'mid', 'mid'];
      } else if (!(b.retreat > 0)) b.retreat = Infinity; // back up to x 30
    };
    const walk = () => {
      if (b.f % 2) return;
      if (b.retreat > 0) { b.tx++; b.retreat--; if (b.tx >= 30) b.retreat = 0; }
      else if (b.st === 'idle') b.tx--;
      b.clampX();
    };
    b.st ||= 'idle';
    if (b.st === 'react') {
      b.head = b.script[b.n];
      walk();
      if (++b.n >= b.script.length) b.st = 'idle';
    } else if (b.st === 'chew') {
      b.n++;
      if (b.n >= 6) { b.st = 'flame'; b.n = 0; audio.sfx('fire_cast', { vol: 0.7 }); }
    } else if (b.st === 'flame') {
      const n = b.n++, dmgJet = RULES.jp ? 80 : 120;
      const paint = { color: '#ff6010', r: 0.6 };
      if (b.head === 'low') {
        const len = [2, 6, 10][Math.min(2, n)];
        b.parts = [cell(b.tx - len, b.ty + 6, dmgJet, { w: len, h: 2, life: 2, ...paint })];
      } else {
        const sx = b.head === 'mid' ? 4 : 0;
        b.parts = [cell(b.tx + sx - 1, b.ty + 5, 40, { w: 3, h: 3, life: 2, ...paint }), cell(b.tx + sx - 5, b.ty + 8, 80, { w: 7, h: 2, life: 2, ...paint })];
      }
      if (b.n >= 10) { b.st = 'idle'; b.parts = []; }
    } else {
      walk();
      b.head = H < b.tx ? 'low' : H < b.tx + 5 ? 'high' : 'mid';
      if (!(b.retreat > 0) && random() < 1 / 4) { b.st = 'chew'; b.n = 0; }
    }
    b.weakRect = HEAD[b.head];
    // Frames: 0 head low, 1 head up (chewing), 2 breathing low, 3 rearing.
    b.pose = b.st === 'flame' ? (b.head === 'low' ? 2 : 3) : b.st === 'chew' ? (b.n % 2 ? 1 : b.head === 'low' ? 0 : 3) : b.head === 'low' ? 0 : b.head === 'high' ? 3 : 1;
  },

  // Alguien (AKMA): sweeps 2 tiles a frame, its height from the per-column profile. At a wall it
  // rises off the top of the screen, turns, and breathes on the way back: a diagonal line of
  // flame growing a cell a frame to 7 (steep) or 8 (shallow) and shrinking away again.
  alguien(b, world, hero) {
    const hc = b.heroCol(hero), dmg = RULES.jp ? 160 : 80;
    b.pose = b.f % 3 === 0 ? 0 : 1;
    if (b.f % 3 === 0) audio.sfx('wing_flap', { vol: 0.3, throttle: 0.2 });
    if (b.st === 'rise') {
      b.ty -= 2; b.pose = 3;
      if (b.ty <= -1) {
        b.dir = -b.dir; b.st = 'sweep';
        b.breath = { len: 0, grow: true, steep: b.dir > 0 ? hc < 40 : hc >= 20 };
        audio.sfx('fire_cast', { vol: 0.6 });
      }
      b.parts = [];
      return;
    }
    const nx = b.tx + 2 * b.dir;
    if (nx < 10 || nx > 51) { b.st = 'rise'; return; }
    b.tx = nx;
    const i = Math.floor((b.tx - 10) / 2);
    const prof = b.dir > 0 ? [-4, -4, -3, -2, -1, -1, 0, 0, 0] : [];
    b.ty = b.dir > 0 ? (prof[i] ?? 1) + 2 : (i > 11 ? [0, 0, 0, -1, -1, -2, -3, -4, -4][Math.min(8, 20 - i)] ?? 1 : 1) + 2;
    const br = b.breath;
    b.parts = [];
    if (br) {
      const max = br.steep ? 7 : 8;
      br.len += br.grow ? 1 : -1;
      if (br.len >= max) br.grow = false;
      if (br.len <= 0) b.breath = null;
      else {
        b.pose = 2;
        const paint = { color: '#ff7a20', r: 0.75 };
        for (let k = 1; k <= br.len; k++) {
          const x = b.dir < 0 ? (br.steep ? b.tx + 1 - 2 * k : b.tx - 2 * k) : (br.steep ? b.tx + 10 + 2 * k : b.tx + 11 + 2 * k);
          const y = b.ty + 9 + (br.steep ? 2 * k : k);
          b.parts.push(cell(x, y, dmg, { life: 2, ...paint }));
        }
      }
    }
  },

  // Jashiin (MAO2). Above 200 HP he appears beside the knight (12 left or 8 right), blinks in for
  // 5 frames, stands solid for 5 (the only time he can be hurt) casting a fireball or lightning,
  // blinks out for 6, and waits until the spell is spent. A hit that leaves him under 200 drops
  // him into the open: he keeps about 8 tiles off, leaps over the knight when cornered, attacks
  // 1/16 a frame when holding still, and heals 80 HP (Japanese 120) every 32 frames; back at full
  // health he returns to blinking.
  jashiin(b, world, hero) {
    const hc = b.heroCol(hero), H = Math.round(hc) - 1;
    const heal = RULES.jp ? 120 : 80;
    const cast = (kind) => {
      audio.sfx('fire_cast', { vol: 0.6 });
      const d = b.dir;
      if (kind === 0) b.parts.push(cell(d > 0 ? b.tx + 5 : b.tx, b.ty + 4, 80, { life: 11, color: '#ff5030', r: 0.8, step(p) { if (p.age <= 9) p.x += d * T; if (p.age <= 3) p.y += T; } }));
      else b.parts.push(cell(d > 0 ? b.tx + 7 : b.tx - 1, b.ty + 4, 80, { w: 2.5, h: 1.2, life: 999, color: '#a0c8ff', r: 0.8,
        step(p) { if (p.age <= 3) p.y += T; else p.x += d * T; const c = p.x / T; if (c < 16 || c > 56) p.age = p.life; } }));
    };
    b.onHit = () => { if (b.hp > 0 && b.hp < 200 && b.mode !== 'open') { b.mode = 'open'; b.hidden = false; b.ghost = false; b.n = 0; b.held = 0; b.healT = 0; b.leap = null; } };
    if (b.mode === 'open') {
      b.hidden = false; b.ghost = false;
      if (++b.healT >= 32) {
        b.healT = 0;
        audio.sfx('spell_recharge', { vol: 0.6 });
        if (b.hp + heal >= b.maxHp) { b.hp = b.maxHp; b.mode = 'phase'; b.n = 11; return; }
        b.hp += heal;
      }
      if (b.leap) {
        // 2 crouch, 3 rising 2 rows, 3 hovering, 3 falling 2 rows, 2 landing; 2 tiles a frame in the air.
        const n = b.leap.n++;
        if (n >= 2 && n < 5) b.ty -= 2; else if (n >= 8 && n < 11) b.ty += 2;
        if (n >= 2 && n < 10) { b.tx += 2 * b.leap.dir; b.clampX(); }
        b.pose = n < 2 || n >= 11 ? 3 : 0;
        if (n >= 13) { b.ty = b.def.y; b.dir = b.leap.dir; b.leap = null; }
        return;
      }
      if (b.atk) { b.pose = b.atk.n >= 2 ? 1 : 0; if (++b.atk.n === 5) { cast(0); b.atk = null; } return; }
      b.dir = hc > b.tx + 3 ? 1 : -1;
      const gap = Math.abs(hc - (b.tx + 3));
      const step = b.f % 2 ? 2 : 1;
      if (gap < 10) {
        const away = -b.dir, nx = b.tx + away * step;
        if (nx < 15 || nx > 53) { b.leap = { n: 0, dir: b.dir }; return; } // cornered: leap over him
        b.tx = nx; b.held = 0;
      } else if (gap > 12) { b.tx += b.dir * step; b.clampX(); b.held = 0; }
      else b.held = (b.held || 0) + 1;
      b.pose = 0;
      if (b.held >= 2 && random() < 1 / 16) b.atk = { n: 0 };
      return;
    }
    b.mode = 'phase';
    b.n = b.n || 0;
    if (b.n === 0) {
      if (b.parts.length) { b.hidden = true; return; } // the last spell is still out
      const right = random() < 0.5;
      let x = right ? H + 8 : H - 12;
      if (x < 16 || x > 52) x = right ? H - 12 : H + 8;
      b.tx = b.ptx = Math.max(15, Math.min(53, x)); b.ty = b.pty = b.def.y;
      b.dir = b.tx < hc ? 1 : -1;
      b.kind = random() < 0.5 ? 0 : 1;
    }
    b.n++;
    if (b.n <= 5) { b.hidden = b.n % 2 === 1; b.ghost = !b.hidden; b.pose = 3; if (!b.hidden) audio.sfx('teleport', { vol: 0.3, throttle: 0.1 }); }
    else if (b.n <= 10) { b.hidden = false; b.ghost = false; b.pose = b.n >= 8 ? (b.kind ? 2 : 1) : 0; if (b.n === 10) cast(b.kind); }
    else if (b.n <= 16) { b.hidden = b.n % 2 === 1; b.ghost = !b.hidden; b.pose = 3; }
    else { b.hidden = true; b.ghost = false; b.n = 0; }
  },
};

// MP90: Jashiin appears, speaks three lines, and the real battle (MPA0) begins.
class JashiinIntro {
  constructor(game, world) {
    this.game = game; this.world = world; this.t = 0;
    // MAO1's script, in original frames: each line shows from its frame to the clear, then he
    // materialises and the fight loads at frame 134 (about 11.3 s).
    const fr = (n) => n * FRAME;
    this.lines = [[fr(10), fr(41), 'Finally, you reached me.'], [fr(52), fr(82), 'I enjoyed your show.'], [fr(89), fr(120), "Come on!  I'll kill you."]];
    this.end = fr(134);
    world.boss = { dead: false, update: (dt) => this.update(dt), draw: (cx, cy, t) => this.draw(cx, cy, t), hitTest: () => false, touches: () => null, damage() {}, x: 20 * TILE, y: 9 * TILE, w: 6 * TILE, h: 9 * TILE, cx: 23 * TILE, drawHud: () => this.hud() };
    for (const h of world.heroes) h.frozen = true;
    preloadSheets(['art.boss.jashiin']);
  }
  update(dt) {
    this.t += dt;
    if (this.t > this.end && !this.went) {
      this.went = true;
      for (const h of this.world.heroes) h.frozen = false;
      const g = this.game, lead = g.leader.hero;
      g.travel({ kind: 'cavern', map: 'mpa0', x: 12, headRow: Math.round(lead.y / TILE) });
    }
  }
  draw(cx, cy, t) {
    const sh = sheetNow('art.boss.jashiin');
    const a = Math.min(1, Math.max(0, (this.t - 43 * FRAME) / (9 * FRAME))); // materialises on frames 43-51
    if (sh) sh.draw(ctx, sh.anims.p0?.[0] ?? 0, 30 * TILE - cx, 18 * TILE - cy, -1, a);
  }
  hud() {
    const cur = this.lines.find(([at, till]) => this.t >= at && this.t < till);
    if (cur) { panel(W / 2 - 260, 420, 520, 60); text(cur[2], W / 2, 440, { size: 20, align: 'center', color: '#ff8a8a' }); }
  }
}
