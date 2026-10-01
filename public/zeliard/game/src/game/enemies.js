// Cavern monsters. Numbers (HP, contact damage, XP, drops) come from the original
// per-world EAI tables in data/rules/enemies.json; movement is a port of each type's
// state machine, simplified, running on the original 11.83 Hz tile grid. Drawn
// positions are interpolated between ticks so they glide instead of snapping.
// Only the host simulates AI; guests draw puppets from snapshots.
import { TILE, F } from '../world/tilemap.js';
import { sign, random } from '../core/util.js';
import { sheetNow } from '../core/assets.js';
import { ctx } from '../render/screen.js';

export const FRAME = 1 / 11.83; // one original game frame at the default speed
const TPS = TILE / FRAME; // 1 tile per frame in px/s
const MBLOCK = F.SOLID | F.ONEWAY;

let seq = 0;

// ---------------------------------------------------------------- definitions
// Behaviour archetype and parameters per world/type (see enemies.json behaviour notes).
const AI = {
  1: { 0: { ai: 'bat' }, 1: { ai: 'crawler', every: 4 }, 2: { ai: 'hopper', near: 8 }, 3: { ai: 'runner', every: 1, sight: 6 } },
  2: {
    0: { ai: 'keeper', big: true, shot: { kind: 'axe', dmg: 8, arc: true, range: 12, every: 14 } },
    2: { ai: 'ooze', every: 20 }, 3: { ai: 'hopper', near: 8, shot: { kind: 'spit', dmg: 20, range: 6, every: 24 } },
    4: { ai: 'bat' }, 5: { ai: 'bat' },
  },
  3: {
    0: { ai: 'ceilingWalker' }, 1: { ai: 'hopper', near: 99, pause: 2, arc: 4 },
    2: { ai: 'burrower', shot: { kind: 'spit', dmg: 40, range: 15 } }, 3: { ai: 'charger', rows: 6, cols: 10, run: 20 },
  },
  4: {
    0: { ai: 'dasher', every: 2, dash: 2, rows: 1 }, 1: { ai: 'crawler', every: 4, rowChase: true },
    2: { ai: 'icicle' }, 3: { ai: 'icicle' }, 4: { ai: 'wallFollower' },
  },
  5: {
    0: { ai: 'chaser', big: true, every: 8, shot: { kind: 'spit', dmg: 40, range: 20, every: 20 } },
    2: { ai: 'crawler', every: 4, rowChase: true }, 3: { ai: 'dasher', every: 2, dash: 2, rows: 2, untilWall: true },
    4: { ai: 'spider' },
  },
  6: {
    0: { ai: 'phantom', big: true, shot: { kind: 'kiss', dmg: 20, range: 20 } },
    2: { ai: 'waveFlyer', every: 1 }, 3: { ai: 'dasher', every: 2, dash: 2, rows: 8 }, 4: { ai: 'icicle' },
  },
  7: {
    0: { ai: 'keeper', big: true, shot: { kind: 'arrow', dmg: 40, range: 20, every: 12 } },
    2: { ai: 'chaser', big: true, every: 4, shot: { kind: 'fireball', dmg: 40, range: 20, every: 12 } },
    4: { ai: 'runner', every: 0.5, sight: 12 },
  },
  8: {
    0: { ai: 'hoverCharger', big: true }, 2: { ai: 'dasher', every: 2, dash: 1, rows: 5 },
    3: { ai: 'spitter', shot: { kind: 'spit', dmg: 80, range: 18, every: 18 } }, 4: { ai: 'waveFlyer', every: 2 },
  },
};

const DROP_CODES = { 0: null, 1: null, 4: { almas: 1 }, 5: { almas: 10 }, 8: { potion: 'red' }, 9: { potion: 'blue' }, 11: { almas: 100 } };

function num(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') { const n = Object.values(v).find((x) => typeof x === 'number'); return n ?? 0; }
  return 0;
}

// Merged definition for world/type: rules numbers + AI archetype + sprite id.
export function enemyDef(game, world, type) {
  const w = game.data.rules.enemies?.worlds?.find((x) => x.world === world);
  const r = w?.enemies?.find((e) => e.type_id === type) || {};
  const ai = AI[world]?.[type] || { ai: 'crawler', every: 4 };
  const big = !!ai.big;
  const jp = game.rulesDifficulty === 'japanese' ? game.data.rules.japanese?.enemies : null;
  let xp = num(r.xp ?? w?.tables?.xp_A008?.[type]);
  let dmg = num(r.contact_damage ?? w?.tables?.contact_A010?.[type]);
  let hp = r.hp == null ? null : num(r.hp);
  if (jp) {
    const known = { '2:5': { xp: 100 }, '4:4': { hp: 12 }, '8:4': { xp: 30 }, '8:2': { xp: 30, dmg: 160 }, '8:3': { xp: 30 }, '8:0': { xp: 30, hp: 127 } }[`${world}:${type}`];
    if (known) { xp = known.xp ?? xp; hp = known.hp ?? hp; dmg = known.dmg ?? dmg; }
    else xp = world === 8 ? 30 : Math.max(1, Math.floor(xp / 2));
  }
  return {
    id: `w${world}t${type}`, world, type, name: r.name || `Monster ${world}-${type}`,
    hp, dmg, xp, drops: r.drops?.codes || w?.tables?.drop_descriptors?.[type] || [0, 0, 0, 0],
    tw: 2, th: big ? 4 : 2, ...ai,
    invulnerable: hp == null,
    sprite: `art.enemy.w${world}.t${type}`,
  };
}

// ---------------------------------------------------------------- monster
export class Enemy {
  // tx, ty: top-left tile (the original record position).
  constructor(def, tx, ty, opts = {}) {
    this.id = opts.id ?? `e${++seq}`;
    this.kind = 'enemy';
    this.def = def;
    this.tw = def.tw; this.th = def.th;
    this.tx = tx; this.ty = ty;
    this.home = { tx, ty };
    this.ptx = tx; this.pty = ty; // previous tick, for interpolation
    this.w = this.tw * TILE; this.h = this.th * TILE;
    this.x = tx * TILE; this.y = ty * TILE;
    this.dir = opts.dir || (random() < 0.5 ? -1 : 1);
    this.hp = def.hp ?? 255;
    this.maxHp = this.hp;
    this.st = 0; // state index for the AI
    this.n = 0; // generic counter
    this.cool = Math.floor(random() * 8);
    this.acc = random() * FRAME;
    this.hitFlash = 0;
    this.dead = false;
    this.deathT = 0;
    this.hidden = false;
    this.record = opts.record; // original monster record (drops, respawn)
    this.animT = random();
    this.frames = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }
  hurtBox() { return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 6 }; }

  update(dt, world) {
    this.animT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.dead) { this.deathT += dt; return; }
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.ptx = this.tx; this.pty = this.ty;
      this.frames++;
      if (this.attackT > 0) this.attackT--;
      const fn = AIS[this.def.ai] || AIS.crawler;
      fn(this, world, world.nearestHero(this));
      // Keep the record inside the wrapped map, carrying the interpolation origin along.
      const m = world.map;
      if (m.wrap) {
        const wx = Math.floor(this.tx / m.w) * m.w, wy = Math.floor(this.ty / m.h) * m.h;
        if (wx || wy) { this.tx -= wx; this.ptx -= wx; this.ty -= wy; this.pty -= wy; }
      }
    }
    const a = Math.min(1, this.acc / FRAME);
    // Interpolate along the short way (a tick never moves more than 3 tiles).
    this.x = (this.ptx + (this.tx - this.ptx) * a) * TILE;
    this.y = (this.pty + (this.ty - this.pty) * a) * TILE;
  }

  // ------------------------------------------------ tile helpers
  free(world, x, y) {
    const m = world.map;
    for (let j = 0; j < this.th; j++) for (let i = 0; i < this.tw; i++) if (m.flags(x + i, y + j) & MBLOCK) return false;
    // Monsters occupy their cells: they don't walk through each other.
    for (const o of world.enemies) {
      if (o === this || o.dead || o.hidden) continue;
      const dx = m.wrap ? ((o.tx - x) % m.w + m.w + m.w / 2) % m.w - m.w / 2 : o.tx - x;
      const dy = m.wrap ? ((o.ty - y) % m.h + m.h + m.h / 2) % m.h - m.h / 2 : o.ty - y;
      if (dx < this.tw && -dx < o.tw && dy < this.th && -dy < o.th) return false;
    }
    return true;
  }
  floorAt(world, x, y = this.ty) {
    const m = world.map;
    for (let i = 0; i < this.tw; i++) if (m.flags(x + i, y + this.th) & MBLOCK) return true;
    return false;
  }
  fullFloorAt(world, x, y = this.ty) {
    const m = world.map;
    for (let i = 0; i < this.tw; i++) if (!(m.flags(x + i, y + this.th) & MBLOCK)) return false;
    return true;
  }
  ceilingAt(world, x, y = this.ty) {
    const m = world.map;
    for (let i = 0; i < this.tw; i++) if (m.flags(x + i, y - 1) & MBLOCK) return true;
    return false;
  }
  step(world, dx, dy) {
    if (!this.free(world, this.tx + dx, this.ty + dy)) return false;
    this.tx += dx; this.ty += dy;
    if (dx) this.dir = sign(dx);
    return true;
  }
  fall(world) {
    if (this.floorAt(world, this.tx)) return false;
    return this.step(world, 0, 1);
  }
  // Hero offset in tiles from this monster's top-left (wrapped), plus row of hero's feet.
  rel(world, hero) {
    if (!hero) return null;
    const m = world.map;
    const hx = m.near(hero.cx, this.cx) / TILE, hy = m.nearY(hero.y, this.cy) / TILE;
    const dx = hx - (this.tx + this.tw / 2), dy = (hy + hero.h / TILE) - (this.ty + this.th); // feet vs feet
    return { dx, dy, adx: Math.abs(dx), ady: Math.abs(dy), side: sign(dx) || this.dir, headDy: hy - this.ty };
  }
  shoot(world, hero, shot, dir = this.dir, opt = {}) {
    if (!shot) return;
    const speed = (opt.speed || 1) * TPS;
    const p = {
      kind: shot.kind, from: this.id, dmg: shot.dmg, x: this.cx + dir * this.w * 0.35, y: this.y + (this.th > 2 ? TILE * 1.2 : TILE * 0.8),
      vx: dir * speed, vy: 0, life: (shot.range || 10) / (opt.speed || 1) * FRAME, w: 16, h: 16,
      sprite: `fx.enemy.${shot.kind}`, color: { axe: '#d8c090', spit: '#9fe070', kiss: '#ff7ab0', arrow: '#e0d0a0', fireball: '#6ab0ff' }[shot.kind],
    };
    if (shot.arc) { p.vy = -TPS * 0.9; p.gravity = TPS * 3.2; p.spin = true; }
    if (opt.vy) p.vy = opt.vy;
    world.spawnProjectile(p);
    this.attackT = 4;
  }

  // ------------------------------------------------ drawing
  draw(camX, camY, t) {
    if (this.hidden && !this.dead) return;
    const d = this.def;
    const sh = sheetNow(d.sprite);
    const x = this.cx - camX, y = this.feet - camY;
    let alpha = this.fade ?? 1;
    if (this.dead) alpha = Math.max(0, 1 - this.deathT * 2.5);
    const flipY = this.upsideDown;
    if (sh) {
      const moving = this.tx !== this.ptx || this.ty !== this.pty;
      const anim = this.dead && sh.anims.defeat ? 'defeat' : this.attackT > 0 && sh.anims.attack ? 'attack' : moving && sh.anims.move ? 'move' : sh.anims.idle ? 'idle' : 'default';
      const f = this.dead ? sh.frameOnce(anim, this.deathT) : sh.frameAt(anim, this.animT);
      ctx.save();
      if (flipY) { ctx.translate(x, y - this.h / 2); ctx.scale(1, -1); ctx.translate(-x, -(y - this.h / 2)); }
      sh.draw(ctx, f, x, y, this.dir, alpha, this.def.scale || 1);
      if (this.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        sh.draw(ctx, f, x, y, this.dir, Math.min(1, this.hitFlash * 6), this.def.scale || 1);
      }
      ctx.restore();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.hitFlash > 0 ? '#fff' : ['#b04070', '#70b040', '#4070b0', '#b0a040', '#a050c0', '#40b0a0', '#c06040', '#6060c0'][d.world % 8];
      ctx.fillRect(x - this.w / 2 + 3, y - this.h + 3, this.w - 6, this.h - 6);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- behaviours
// Each runs once per original frame. `every` = frames per tile of movement.
const tick = (e, every) => every <= 1 || e.frames % Math.round(every) === 0;

const AIS = {
  // Hang on the ceiling; dive at the hero one tile a frame; fly back up after a hit.
  bat(e, world, hero) {
    const r = e.rel(world, hero);
    if (e.st === 0) { // hang
      e.step(world, 0, -1);
      if (e.n > 0) { e.n--; return; }
      if (r && ((r.dx >= 0 && r.dx <= 9) || (r.dx < 0 && r.dx >= -6)) && r.dy > -2) { e.st = 1; e.n = 3; }
    } else if (e.st === 1) { // windup
      if (--e.n <= 0) e.st = 2;
    } else if (e.st === 2) { // dive
      if (!r) { e.st = 3; return; }
      const dy = r.headDy < -3 ? -1 : r.headDy > 1 ? 1 : 0;
      const dx = r.adx < 1 ? 0 : r.side;
      if (dx && dy && e.step(world, dx, dy)) return;
      if (dx && e.step(world, dx, 0)) return;
      if (!e.step(world, 0, 1)) e.st = 3;
      if (world.heroHurtThisFrame) e.st = 3;
    } else { // return
      if (!e.step(world, e.dir, -1)) { if (!e.step(world, 0, -1)) { e.st = 0; e.n = 7; } else e.dir = -e.dir; }
    }
    if (e.st === 2 && world.heroHurtThisFrame) e.st = 3;
  },
  // Slow floor crawler toward the hero's column (or patrolling when rowChase and not level).
  crawler(e, world, hero) {
    if (e.fall(world)) return;
    if (!tick(e, e.def.every)) return;
    const r = e.rel(world, hero);
    if (r && (!e.def.rowChase || r.ady < 2) && r.adx < 20) e.dir = r.side;
    if (r && r.adx < 0.6 && !e.def.rowChase) return;
    if (!e.fullFloorAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0)) e.dir = -e.dir;
  },
  // Short 3-tile hops; eager when the hero is close in front.
  hopper(e, world, hero) {
    const r = e.rel(world, hero);
    const arc = [[1, -1], [1, -1], [1, 1], [0, 1]];
    if (e.st > 0) { // mid-hop
      const [dx, dy] = arc[4 - e.st];
      if (!e.step(world, dx * e.dir, dy)) { if (dy < 0) e.step(world, dx * e.dir, 0); }
      e.st--;
      return;
    }
    if (e.fall(world)) return;
    if (e.n > 0) { e.n--; return; }
    const eager = r && r.ady < (e.def.near || 8) && (e.def.near > 50 || r.side === e.dir);
    if (r) e.dir = r.side;
    if (e.def.shot && r && r.ady < 2 && r.adx < (e.def.shot.range || 6) + 2 && e.cool-- <= 0) {
      e.cool = e.def.shot.every || 20; e.shoot(world, hero, e.def.shot); e.n = 6; return;
    }
    if (!e.free(world, e.tx + e.dir, e.ty - 1)) e.dir = -e.dir;
    e.st = 4;
    e.n = eager ? (e.def.pause || 0) : 8;
  },
  // Fast floor runner that turns toward a nearby hero, hops gaps and vaults walls.
  runner(e, world, hero) {
    if (e.st > 0) { // jumping
      e.step(world, e.dir, e.st > 2 ? -1 : 0) || e.step(world, 0, e.st > 2 ? -1 : 0);
      e.st--;
      return;
    }
    if (e.fall(world)) { e.step(world, e.dir, 0); return; }
    if (e.n > 0) { e.n--; return; }
    const r = e.rel(world, hero);
    if (r && r.ady < (e.def.sight || 6)) e.dir = r.side;
    const steps = e.def.every < 1 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
      if (!e.step(world, e.dir, 0)) {
        if (e.free(world, e.tx, e.ty - 3)) { e.st = 4; } else e.dir = -e.dir;
        break;
      }
      if (!e.floorAt(world, e.tx + e.dir) && e.floorAt(world, e.tx + e.dir * 3)) { e.st = 3; break; }
    }
    if (random() < 0.02) e.n = 6;
  },
  // Keeps 7-10 tiles from the hero and lobs/throws at that range.
  keeper(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (!r || r.ady > 6) { if (tick(e, 2) && (!e.fullFloorAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0))) e.dir = -e.dir; return; }
    e.dir = r.side;
    const want = r.adx < 7 ? -r.side : r.adx > 10 ? r.side : 0;
    if (want && e.fullFloorAt(world, e.tx + want)) { e.step(world, want, 0); e.dir = r.side; }
    if (--e.cool <= 0 && r.adx <= 12) { e.cool = e.def.shot.every || 14; e.shoot(world, hero, e.def.shot, r.side, { speed: 1 }); }
  },
  // Blob that sits, then oozes one tile left or right, never off a ledge.
  ooze(e, world) {
    if (e.fall(world)) return;
    if (!tick(e, e.def.every)) return;
    const d = random() < 0.5 ? -1 : 1;
    if (e.fullFloorAt(world, e.tx + d)) e.step(world, d, 0);
  },
  // Crawls upside-down along the ceiling, drops near the hero, hops around the floor, climbs back.
  ceilingWalker(e, world, hero) {
    const r = e.rel(world, hero);
    if (e.st === 0) { // ceiling
      e.upsideDown = true;
      if (!e.ceilingAt(world, e.tx)) { if (!e.step(world, 0, -1)) e.st = 1; return; }
      if (r && r.adx < 2 && r.dy > 0) { e.st = 1; return; }
      if (tick(e, 2) && (!e.ceilingAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0))) { e.dir = -e.dir; if (++e.n > 3) { e.st = 1; e.n = 0; } }
    } else if (e.st === 1) { // falling
      e.upsideDown = false;
      if (!e.fall(world)) { e.st = 2; e.n = 16; }
    } else if (e.st === 2) { // floor walk
      if (e.fall(world)) return;
      if (r) e.dir = r.side;
      if (tick(e, 2)) e.step(world, e.dir, 0);
      if (--e.n <= 0) e.st = 3;
    } else { // climb back up
      if (!e.step(world, 0, -1)) { e.st = 0; e.n = 0; }
    }
  },
  // Burrowed under the slime; surfaces near the hero, looks around, spits once, burrows.
  burrower(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (e.st === 0) {
      e.hidden = true; e.invuln = true;
      if (r && r.ady < 4) e.dir = r.side;
      if (tick(e, 2) && (!e.fullFloorAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0))) e.dir = -e.dir;
      if (r && r.adx < 8 && r.ady < 4) { e.st = 1; e.n = 10; }
    } else if (e.st === 1) {
      e.hidden = false; e.invuln = false;
      if (e.n % 3 === 0) e.dir = -e.dir;
      if (e.n === 4 && r) { e.dir = r.side; e.shoot(world, hero, e.def.shot, r.side); }
      if (--e.n <= 0) { e.st = 0; }
    }
  },
  // Waits facing the hero; charges 1 tile/frame for a fixed distance when he is in front.
  charger(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (e.st === 0) {
      if (r && r.adx < 30) e.dir = r.side;
      if (r && r.ady < e.def.rows && r.adx < e.def.cols) { e.st = 1; e.n = e.def.run; }
    } else {
      if (!e.step(world, e.dir, 0) || --e.n <= 0) { e.st = 0; }
    }
  },
  // Patrols slowly; when the hero is level and ahead, dashes fast.
  dasher(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (e.st === 1) {
      for (let i = 0; i < e.def.dash; i++) if (!e.step(world, e.dir, 0)) { e.st = 0; e.n = 6; if (!e.def.untilWall) e.dir = -e.dir; break; }
      if (!e.def.untilWall && r && (r.side !== e.dir || r.ady >= e.def.rows + 1)) e.st = 0;
      return;
    }
    if (e.n > 0) { e.n--; return; }
    if (r && r.ady < e.def.rows && r.side === e.dir && r.adx < 16) { e.st = 1; return; }
    if (tick(e, e.def.every) && (!e.fullFloorAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0))) e.dir = -e.dir;
  },
  // Hangs from the ceiling; drops when the hero passes below and shatters on landing.
  icicle(e, world, hero) {
    const r = e.rel(world, hero);
    if (e.st === 0) {
      if (r && r.adx < 2 && r.dy > 0 && random() < 0.6) e.st = 1;
    } else if (!e.step(world, 0, 1)) {
      world.effect('shatter', e.cx, e.feet, { life: 0.5 });
      e.dead = true; e.deathT = 0.3; e.silent = true;
      world.scheduleRespawn(e, 90);
    }
  },
  // Crawls around the outline of blocks, hugging the wall (left-hand rule).
  wallFollower(e, world) {
    // Directions: 0 right, 1 down, 2 left, 3 up. Keep the wall on the "inside".
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    if (e.n === 0 && e.st === 0) { e.st = 0; e.n = 1; e.wd = 0; }
    const d = e.wd;
    const rightTurn = (d + 1) % 4, leftTurn = (d + 3) % 4;
    // Prefer turning toward the wall, then straight, then away.
    for (const nd of [rightTurn, d, leftTurn, (d + 2) % 4]) {
      if (e.step(world, D[nd][0], D[nd][1])) { e.wd = nd; if (D[nd][0]) e.dir = D[nd][0]; return; }
    }
  },
  // Big slow walker that closes on the hero and shoots when level and facing him.
  chaser(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (r && r.adx < 24) e.dir = r.side;
    if (tick(e, e.def.every) && (!e.fullFloorAt(world, e.tx + e.dir) || !e.step(world, e.dir, 0)) && !r) e.dir = -e.dir;
    if (r && Math.abs(r.headDy - 1) < 2 && r.adx < 18 && --e.cool <= 0) { e.cool = e.def.shot.every; e.shoot(world, hero, e.def.shot, r.side); }
  },
  // Clings to the ceiling tracking the hero; drops on him, then climbs back.
  spider(e, world, hero) {
    const r = e.rel(world, hero);
    if (e.st === 0) {
      e.step(world, 0, -1);
      if (r && r.dy > 0 && r.adx < 1) { e.st = 1; return; }
      if (r && r.adx < 14 && tick(e, 2)) { e.dir = r.side; if (e.ceilingAt(world, e.tx + e.dir)) e.step(world, e.dir, 0); }
    } else if (e.st === 1) {
      if (!e.step(world, 0, 1) || !e.step(world, 0, 1)) e.st = 2;
    } else if (!e.step(world, e.dir, -1) && !e.step(world, 0, -1)) e.st = 0;
  },
  // Wanders unseen; appears in front of the hero, blows one kiss, fades away.
  phantom(e, world, hero) {
    const r = e.rel(world, hero);
    e.fall(world);
    if (e.st === 0) {
      e.hidden = true; e.invuln = true; e.noContact = true;
      if (r) e.dir = r.side;
      if (tick(e, 1) && !e.step(world, e.dir, 0)) e.dir = -e.dir;
      if (r && r.adx < 7 && r.adx > 3 && r.ady < 3 && random() < 0.25) { e.st = 1; e.n = 16; }
    } else {
      e.hidden = false; e.invuln = false; e.noContact = false;
      if (r) e.dir = r.side;
      if (e.n === 10) e.shoot(world, hero, e.def.shot, e.dir, { speed: 1 });
      if (--e.n <= 0) e.st = 0;
    }
  },
  // Flies (no gravity) toward the hero's height while bobbing along a wave.
  waveFlyer(e, world, hero) {
    if (!tick(e, e.def.every)) return;
    const r = e.rel(world, hero);
    const wave = [0, -1, -1, 0, 1, 1][e.frames % 6];
    let dy = wave;
    if (r) { if (r.headDy < -1) dy = -1; else if (r.headDy > 1) dy = 1; }
    if (!e.step(world, e.dir, 0)) e.dir = -e.dir;
    e.step(world, 0, dy);
    if (r && r.adx > 12 && random() < 0.1) e.dir = r.side;
  },
  // Hovers at its spawn height and charges horizontally at the hero.
  hoverCharger(e, world, hero) {
    const r = e.rel(world, hero);
    if (r && r.adx < 20 && Math.abs(r.headDy) < 5) e.dir = r.side;
    if (!e.step(world, e.dir, 0)) e.dir = -e.dir;
  },
  // Almost stationary; occasionally shuffles; spits when the hero is within 5 rows.
  spitter(e, world, hero) {
    if (e.fall(world)) return;
    const r = e.rel(world, hero);
    if (random() < 0.03) { const d = random() < 0.5 ? -1 : 1; if (e.fullFloorAt(world, e.tx + d)) e.step(world, d, 0); }
    if (r && r.ady < 5 && r.adx < 18 && --e.cool <= 0) { e.cool = e.def.shot.every; e.dir = r.side; e.shoot(world, hero, e.def.shot, r.side); }
  },
};

// Pick the item dropped by a defeated monster: the record's preset code if non-zero,
// otherwise descriptor[rng & 3]; a downward thrust forces descriptor[0].
export function rollDrop(e, thrust, japanese) {
  const preset = e.record?.dropOnDeath;
  let code = preset && preset !== 0 ? preset : e.def.drops[thrust ? 0 : Math.floor(random() * 4)] ?? 0;
  if (japanese) {
    if (code && random() < 0.5 && code !== 9) code = 0;
    if (code === 11) return { code, almas: 50 };
  }
  return { code, ...(DROP_CODES[code] || {}) };
}

export { AIS };
