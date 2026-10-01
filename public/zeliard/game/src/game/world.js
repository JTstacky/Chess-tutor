// One live cavern: tile map, terrain renderer, monsters, projectiles, pickups,
// props (chests, stashes, blocks), platforms and doors, plus every knight in it.
// The host (or solo player) runs `simulate`; guests run `puppet` and only move
// their own knight, reporting hits and pickups to the host as events.
// Caverns wrap in both axes, so every interaction goes through map.rel/near.
import { TILE, F } from '../world/tilemap.js';
import { overlap, random } from '../core/util.js';
import { audio } from '../core/audio.js';
import { sheetNow } from '../core/assets.js';
import { ctx, W, H } from '../render/screen.js';
import { FRAME, rollDrop, Enemy } from './enemies.js';

let pseq = 0;

export class CavernWorld {
  constructor(game, data, map, terrain) {
    this.game = game;
    this.data = data; // parsed cavern json
    this.id = data.id;
    this.level = data.level || 1;
    this.map = map;
    this.terrain = terrain;
    this.heroes = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.props = [];
    this.platforms = [];
    this.doors = [];
    this.effects = [];
    this.respawns = [];
    this.signs = [];
    this.tear = null;
    this.boss = null;
    this.time = 0;
    this.shake = 0;
    this.frameAcc = 0;
    this.heroHurtThisFrame = false;
  }

  nearestHero(e) {
    let best = null, bd = Infinity;
    for (const h of this.heroes) {
      if (!h.alive) continue;
      const d = Math.abs(this.map.near(h.cx, e.cx) - e.cx) + Math.abs(this.map.nearY(h.y, e.y) - e.y) * 1.5;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  // Is a world point on (or near) any knight's screen?
  onScreen(x, y, margin = 80) {
    return this.heroes.some((h) => {
      const c = h.cam || { x: h.cx - W / 2, y: h.y - H / 2 };
      const nx = this.map.near(x, c.x + W / 2), ny = this.map.nearY(y, c.y + H / 2);
      return nx > c.x - margin && nx < c.x + W + margin && ny > c.y - margin && ny < c.y + H + margin;
    });
  }

  castSpell(h) { this.game.castSpell(this, h); }
  hazardHit(h, dmg) { this.game.hazardHit(this, h, dmg); }
  spiritTick(h) { this.game.spiritTick(this, h); }

  addHero(h) { if (!this.heroes.includes(h)) this.heroes.push(h); }
  removeHero(h) { this.heroes = this.heroes.filter((x) => x !== h); }

  spawnProjectile(p) {
    const proj = { id: `p${++pseq}`, w: p.w || 14, h: p.h || 14, life: p.life || 4, t: 0, ...p };
    proj.x -= proj.w / 2; proj.y -= proj.h / 2;
    this.projectiles.push(proj);
    return proj;
  }

  // Magia Stone: four spirits circle the knight; each strikes what it touches, 80 times.
  addMagia(hero, dmg) {
    audio.sfx('spell_nova', { vol: 0.7 });
    this.effect('flash', 0, 0, { color: '#bfe8ff', life: 0.3 });
    for (let i = 0; i < 4; i++) {
      const p = this.spawnProjectile({
        kind: 'magia', friendly: true, pierce: true, ghost: true, owner: hero.id, dmg, x: hero.cx, y: hero.y + hero.h / 2,
        vx: 0, vy: 0, w: 22, h: 22, life: 40, color: '#bfe8ff', color2: '#ffffff', charges: 80, seen: 0, clearT: 0,
        update: (q, dt) => {
          const a = this.time * 3.2 + (i * Math.PI) / 2;
          q.x = hero.cx + Math.cos(a) * 62 - q.w / 2;
          q.y = hero.y + hero.h / 2 + Math.sin(a) * 50 - q.h / 2;
          q.vx = -Math.sin(a); // projectileHits takes knock direction from vx
          const n = q.hit ? q.hit.size : 0;
          if (n > q.seen) { q.charges -= n - q.seen; q.seen = n; }
          // The same monster can be struck again after a moment.
          q.clearT += dt;
          if (q.clearT > 0.5) { q.clearT = 0; q.hit = null; q.seen = 0; }
          if (q.charges <= 0 || !hero.alive) q.dead = true;
        },
      });
      p.x = hero.cx; p.y = hero.y;
    }
  }

  effect(kind, x, y, opts = {}) { this.effects.push({ kind, x, y, t: 0, life: opts.life || 0.4, ...opts }); }

  scheduleRespawn(e, frames = 0) {
    if (!e.record) return;
    this.respawns.push({ rec: e.record, def: e.def, id: e.id, wait: Math.max(frames * FRAME, 2) });
  }

  // Drop from a defeated monster (drop codes: 0 respawns, 4/5/11 almas, 8/9 potions).
  dropLoot(e, thrust) {
    const drop = rollDrop(e, thrust, this.game.rulesDifficulty === 'japanese');
    if (drop.code === 0) this.scheduleRespawn(e);
    const base = { x: e.cx - 10, y: e.y + e.h - 26, w: 20, h: 20, vx: 0, vy: -160, t: 0, life: 12 };
    if (drop.almas) this.pickups.push({ ...base, id: `a${++pseq}`, kind: 'almas', value: drop.almas });
    if (drop.potion) this.pickups.push({ ...base, id: `q${++pseq}`, kind: 'potion', potion: drop.potion, life: 20 });
  }

  // ------------------------------------------------------------ authoritative
  simulate(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake -= dt;
    const map = this.map;
    this.frameAcc += dt;
    while (this.frameAcc >= FRAME) { this.frameAcc -= FRAME; this.heroHurtThisFrame = this.heroHurtThisFrameNext; this.heroHurtThisFrameNext = false; }
    for (const e of this.enemies) e.update(dt, this);
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deathT > 0.6));
    // Respawn monsters whose records came back, once their home is off-screen.
    for (const r of this.respawns) {
      r.wait -= dt;
      if (r.wait > 0 || this.onScreen(r.rec.x * TILE, r.rec.y * TILE, 120)) continue;
      r.done = true;
      this.enemies.push(new Enemy(r.def, r.rec.x, r.rec.y, { record: r.rec, id: r.id }));
    }
    this.respawns = this.respawns.filter((r) => !r.done);
    if (this.boss) this.boss.update(dt, this);
    for (const p of this.platforms) p.update?.(dt, this);
    for (const p of this.props) p.update?.(dt, this);
    this.props = this.props.filter((p) => !p.dead || p.lingers);
    // Projectiles
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.homing && p.target) {
        const tgt = p.target;
        const dx = map.near(tgt.cx, p.x) - (p.x + p.w / 2), dy = map.nearY(tgt.y + tgt.h / 2, p.y) - (p.y + p.h / 2);
        const d = Math.hypot(dx, dy) || 1, sp = Math.hypot(p.vx, p.vy);
        p.vx += ((dx / d) * sp - p.vx) * Math.min(1, dt * p.homing);
        p.vy += ((dy / d) * sp - p.vy) * Math.min(1, dt * p.homing);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.update?.(p, dt, this);
      if (p.t > p.life) p.dead = true;
      if (!p.ghost && map.rectSolid(p.x + 3, p.y + 3, p.w - 6, p.h - 6)) {
        if (p.onWall) p.onWall(p, this);
        else { p.dead = true; this.effect('spark', p.x + p.w / 2, p.y + p.h / 2); }
      }
      if (p.friendly && !p.dead) this.projectileHits(p);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    // Pickups bounce and settle.
    for (const k of this.pickups) {
      k.t += dt;
      if (k.vy !== undefined && !k.static) {
        k.vy = Math.min(k.vy + 1200 * dt, 500);
        const hit = map.move(k, (k.vx || 0) * dt, k.vy * dt);
        if (hit.down) { k.vy = -k.vy * 0.3; k.vx = 0; if (Math.abs(k.vy) < 60) k.vy = 0; }
      }
      if (k.life && k.t > k.life) k.dead = true;
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < fx.life);
  }

  projectileHits(p) {
    const box = p;
    for (const e of this.enemies) {
      if (e.dead || e.hidden || (p.hit && p.hit.has(e.id))) continue;
      if (overlap(this.map.rel(box, e), e.hurtBox())) {
        (p.hit ||= new Set()).add(e.id);
        this.damageEnemy(e, p.dmg, p.owner, p.vx >= 0 ? 1 : -1, p.kind);
        if (!p.pierce) { p.dead = true; return; }
      }
    }
    if (this.boss && !this.boss.dead && !(p.hit && p.hit.has('boss')) && this.boss.hitTest(this.map.rel(box, this.boss))) {
      (p.hit ||= new Set()).add('boss');
      this.game.spellHitsBoss(this, p);
      if (!p.pierce) p.dead = true;
    }
    for (const o of this.props) if (!o.dead && o.hit && overlap(this.map.rel(box, o), o) && p.breaks) o.hit(this, null);
  }

  // A knight's sword swing against monsters, the boss and hidden wall stashes.
  resolveSword(hero) {
    const box = hero.swordBox();
    if (!box) return;
    for (const e of this.enemies) {
      if (e.dead || e.hidden || hero.attack.hits.has(e.id)) continue;
      if (overlap(this.map.rel(box, e), e.hurtBox())) {
        hero.attack.hits.add(e.id);
        if (hero.attack.kind === 'thrust') hero.bounce();
        this.game.heroHitsEnemy(this, hero, e);
      }
    }
    if (this.boss && !this.boss.dead && !hero.attack.hits.has('boss') && this.boss.hitTest(this.map.rel(box, this.boss))) {
      hero.attack.hits.add('boss');
      if (hero.attack.kind === 'thrust') hero.bounce();
      this.game.heroHitsBoss(this, hero);
    }
    for (const o of this.props) {
      if (o.dead || !o.hit || hero.attack.hits.has(o.id)) continue;
      if (overlap(this.map.rel(box, o), o)) { hero.attack.hits.add(o.id); o.hit(this, hero); }
    }
  }

  damageEnemy(e, dmg, ownerId, dir, kind) {
    if (e.dead) return;
    // Co-op guest: the host owns the monsters; show the hit and tell the host.
    const coop = this.game.coop;
    if (this.puppet && coop && !coop.isHost) { coop.reportHit(this, e.id, dmg, dir, kind); e.hitFlash = 0.15; this.effect('hit', e.cx, e.cy, { dmg }); return; }
    if (e.invuln || e.def.invulnerable) { this.effect('clink', e.cx, e.cy); audio.sfx('shield_block', { vol: 0.5 }); return; }
    // Monster HP is one byte: hp <= damage kills.
    e.hp -= dmg;
    e.hitFlash = 0.15;
    this.effect('hit', e.cx, e.cy, { dmg });
    audio.sfx('sword_hit', { vol: 0.8 });
    if (e.hp <= 0) this.killEnemy(e, ownerId, kind === 'thrust');
  }

  killEnemy(e, ownerId, thrust) {
    e.dead = true;
    e.deathT = 0;
    this.dropLoot(e, thrust);
    audio.sfx('enemy_defeat', { vol: 0.8 });
    this.effect('poof', e.cx, e.cy, { life: 0.5 });
    this.game.onEnemyKilled(this, e, ownerId);
  }

  // Contact + projectile damage against a local knight (each peer checks its own).
  checkHeroDamage(hero) {
    if (!hero.alive || hero.iframes > 0) return;
    const hb = hero.hurtBox();
    for (const e of this.enemies) {
      if (e.dead || e.hidden || e.noContact || !e.def.dmg) continue;
      const box = e.hurtBox();
      if (overlap(this.map.rel(hb, box), box)) { this.game.heroHurt(this, hero, e.def.dmg, this.map.near(e.cx, hero.cx), 'contact'); return; }
    }
    if (this.boss && !this.boss.dead) {
      const hit = this.boss.touches(this.map.rel(hb, this.boss));
      if (hit) { this.game.heroHurt(this, hero, hit.dmg ?? this.boss.contactDmg, this.map.near(this.boss.cx, hero.cx), 'contact'); return; }
    }
    for (const p of this.projectiles) {
      if (p.friendly || p.dead) continue;
      if (overlap(this.map.rel(hb, p), p)) {
        const r = this.game.heroHurt(this, hero, p.dmg || 10, this.map.near(p.x + p.w / 2, hero.cx), 'projectile', p);
        if (!p.pierce || r === 'blocked') p.dead = true;
        return;
      }
    }
  }

  collectPickups(hero) {
    if (!hero.alive) return;
    const hb = hero.hurtBox();
    for (const k of this.pickups) {
      if (k.dead || k.claimed) continue;
      const near = { x: hb.x - 10, y: hb.y - 10, w: hb.w + 20, h: hb.h + 20 };
      if (overlap(this.map.rel(near, k), k)) { k.claimed = true; this.game.claimPickup(this, hero, k); }
    }
    for (const o of this.props) {
      if (o.dead || !o.touch) continue;
      if (overlap(this.map.rel(hb, o), o)) o.touch(this, hero);
    }
  }

  doorAt(hero) { return this.doors.find((d) => d.inDoorway(this.map, hero)); }

  // ------------------------------------------------------------ drawing
  camera(hero) {
    const lookAhead = hero.dir * 60;
    const tx = hero.cx + lookAhead - W / 2, ty = hero.y + hero.h / 2 - H / 2 + 10;
    if (!hero.cam) hero.cam = { x: tx, y: ty };
    hero.cam.x += (tx - hero.cam.x) * 0.14;
    hero.cam.y += (ty - hero.cam.y) * 0.16;
    if (!this.map.wrap) {
      const mw = this.map.w * TILE, mh = this.map.h * TILE;
      hero.cam.x = Math.max(0, Math.min(hero.cam.x, Math.max(0, mw - W)));
      hero.cam.y = Math.max(0, Math.min(hero.cam.y, Math.max(0, mh - H)));
    }
    return hero.cam;
  }

  // Screen-relative camera for an object at world x/y (picks the nearest wrap image).
  view(obj, cx, cy) {
    const m = this.map;
    return [cx - (m.near(obj.x, cx + W / 2) - obj.x), cy - (m.nearY(obj.y, cy + H / 2) - obj.y)];
  }

  draw(cam, t) {
    let cx = Math.round(cam.x), cy = Math.round(cam.y);
    if (this.shake > 0) { cx += Math.round((random() - 0.5) * 8); cy += Math.round((random() - 0.5) * 8); }
    this.terrain.drawBackground(ctx, cx, cy, W, H);
    for (const d of this.doors) d.draw(...this.view(d, cx, cy), t);
    this.terrain.draw(ctx, cx, cy, W, H);
    if (this.tear) this.drawTear(...this.view(this.tear, cx, cy), t);
    for (const p of this.platforms) { const px = { x: p.tx * TILE, y: p.ty * TILE }; p.draw(...this.view(px, cx, cy), t); }
    for (const o of this.props) o.draw(...this.view(o, cx, cy), t, this);
    for (const k of this.pickups) drawPickup(k, ...this.view(k, cx, cy), t);
    if (this.boss) this.boss.draw(...this.view(this.boss, cx, cy), t, this);
    for (const e of this.enemies) {
      const [ex, ey] = this.view(e, cx, cy);
      if (e.x + e.w > ex - 64 && e.x < ex + W + 64 && e.y + e.h > ey - 64 && e.y < ey + H + 64) e.draw(ex, ey, t);
    }
    for (const h of this.heroes) h.draw(...this.view(h, cx, cy), t);
    for (const p of this.projectiles) drawProjectile(p, ...this.view(p, cx, cy), t);
    for (const fx of this.effects) drawEffect(fx, ...this.view(fx, cx, cy));
    this.drawWind(cx, cy, t);
    if (this.game.debug) this.drawDebug(cx, cy);
  }

  // Airflow tiles: streaks drifting along the draught.
  drawWind(cx, cy, t) {
    const m = this.map;
    const x0 = Math.floor(cx / TILE), y0 = Math.floor(cy / TILE);
    ctx.save();
    ctx.strokeStyle = 'rgba(210,235,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = y0; y <= y0 + H / TILE + 1; y++) for (let x = x0; x <= x0 + W / TILE + 1; x++) {
      const f = m.flags(x, y);
      if (!(f & (F.WIND_L | F.WIND_R | F.WIND_U))) continue;
      const seed = (x * 13 + y * 7) % 10;
      const k = ((t * 3 + seed / 10) % 1);
      const px = x * TILE - cx, py = y * TILE - cy;
      if (f & F.WIND_U) { const yy = py + TILE - k * TILE; ctx.moveTo(px + 6 + seed, yy); ctx.lineTo(px + 6 + seed, yy - 8); }
      else { const d = f & F.WIND_L ? -1 : 1; const xx = px + (d > 0 ? k : 1 - k) * TILE; ctx.moveTo(xx, py + 6 + seed); ctx.lineTo(xx - d * 10, py + 6 + seed); }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawTear(cx, cy, t) {
    const sh = sheetNow('art.prop.tear');
    const x = this.tear.x + TILE - cx, y = this.tear.y - cy + Math.sin(t * 2) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 2, x, y, 46);
    g.addColorStop(0, 'rgba(160,220,255,0.55)'); g.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 46, y - 46, 92, 92);
    ctx.restore();
    if (sh) sh.draw(ctx, 0, x, y + 24, 1, 0.95, 0.8);
  }

  drawDebug(cx, cy) {
    ctx.strokeStyle = '#0f0';
    for (const e of this.enemies) { const [ex, ey] = this.view(e, cx, cy); const b = e.hurtBox(); ctx.strokeRect(b.x - ex, b.y - ey, b.w, b.h); }
    for (const h of this.heroes) {
      const [hx, hy] = this.view(h, cx, cy);
      const b = h.hurtBox(); ctx.strokeStyle = '#ff0'; ctx.strokeRect(b.x - hx, b.y - hy, b.w, b.h);
      const s = h.swordBox(); if (s) { ctx.strokeStyle = '#f00'; ctx.strokeRect(s.x - hx, s.y - hy, s.w, s.h); }
    }
    ctx.strokeStyle = '#0ff';
    for (const d of this.doors) { const [dx, dy] = this.view(d, cx, cy); ctx.strokeRect((d.d.enter.heroLeftColumn) * TILE - dx, d.d.enter.heroHeadRow * TILE - dy, 3 * TILE, 3 * TILE); }
  }
}

const PICKUP_ART = { almas: 'art.item.almas', gold: 'art.item.gold', potion: 'art.item.potion' };

function drawPickup(k, cx, cy, t) {
  const x = k.x + k.w / 2 - cx, y = k.y + k.h - cy;
  if (k.life && k.t > k.life - 3 && Math.floor(t * 10) % 2) return;
  const id = k.kind === 'almas' ? (k.value >= 100 ? 'art.item.almas100' : k.value >= 10 ? 'art.item.almas10' : 'art.item.almas') : PICKUP_ART[k.kind];
  const sh = sheetNow(id);
  const bob = Math.sin(t * 4 + k.x) * 2;
  if (sh) {
    ctx.save();
    if (k.potion === 'blue') ctx.filter = 'hue-rotate(200deg) saturate(1.3)';
    sh.draw(ctx, 0, x, y + bob, 1, 1, 1);
    ctx.restore();
    return;
  }
  ctx.fillStyle = k.kind === 'almas' ? '#8fe3ff' : k.kind === 'gold' ? '#f2c85b' : k.potion === 'blue' ? '#5aa0ff' : '#ff5a5a';
  ctx.beginPath();
  ctx.arc(x, y - 8 + bob, k.kind === 'almas' && k.value >= 10 ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawProjectile(p, cx, cy, t) {
  const x = p.x + p.w / 2 - cx, y = p.y + p.h / 2 - cy;
  if (p.draw) { p.draw(p, x, y, t); return; }
  const sh = p.sprite && sheetNow(p.sprite);
  if (sh) {
    const dir = p.vx < 0 ? -1 : 1;
    ctx.save();
    if (p.spin) { ctx.translate(x, y); ctx.rotate(p.t * 14 * dir); ctx.translate(-x, -y); }
    sh.draw(ctx, sh.frameAt('default', p.t), x, y + sh.fh * (p.spriteScale || 1) * 0.5, dir, 1, p.spriteScale || 1);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = Math.max(p.w, p.h) * 0.8;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, p.color2 || '#fff');
  g.addColorStop(0.4, p.color || (p.friendly ? '#7fd0ff' : '#ff7a4a'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (p.spin) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.rotate(p.t * 14);
    ctx.fillStyle = p.color || '#ddd'; ctx.fillRect(-7, -2, 14, 4); ctx.fillRect(-2, -7, 4, 14);
  }
  ctx.restore();
}

function drawEffect(fx, cx, cy) {
  const x = fx.x - cx, y = fx.y - cy, k = fx.t / fx.life;
  ctx.save();
  if (fx.kind === 'hit' || fx.kind === 'spark' || fx.kind === 'clink') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = fx.kind === 'clink' ? '#cfe8ff' : '#ffe9a8';
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + fx.x;
      const r0 = 6 + k * 14, r1 = 12 + k * 26;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
    if (fx.dmg) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1 - k * k;
      ctx.font = "700 16px 'Beliards', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(String(fx.dmg), x + 1, y - 18 - k * 20 + 1);
      ctx.fillStyle = fx.color || '#fff4c8';
      ctx.fillText(String(fx.dmg), x, y - 18 - k * 20);
    }
  } else if (fx.kind === 'poof' || fx.kind === 'rubble' || fx.kind === 'shatter') {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = fx.kind === 'rubble' ? '#7a6048' : fx.kind === 'shatter' ? '#cfefff' : '#e8dcc8';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * k * 30, y + Math.sin(a) * k * 30 + (fx.kind !== 'poof' ? k * k * 40 : 0), 5 * (1 - k) + 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (fx.kind === 'text') {
    ctx.globalAlpha = 1 - k * k;
    ctx.font = "700 15px 'Beliards', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(fx.text, x + 1, y - k * 30 + 1);
    ctx.fillStyle = fx.color || '#8fe3ff';
    ctx.fillText(fx.text, x, y - k * 30);
  } else if (fx.kind === 'flash') {
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.fillStyle = fx.color || '#fff';
    ctx.fillRect(0, 0, W, H);
  } else if (fx.kind === 'bolt') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#d8f0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let bx = x, by = y - 400;
    ctx.moveTo(bx, by);
    while (by < y) { by += 30; bx += (Math.sin(by * 12.9 + fx.x) * 18); ctx.lineTo(bx, by); }
    ctx.stroke();
  }
  ctx.restore();
}
