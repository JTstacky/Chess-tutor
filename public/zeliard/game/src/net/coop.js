// Co-op bridge between the Session (net.js) and the game.
//
// The host's browser is the authority for the cavern: monsters, their shots, loot and
// guardians. Every player moves their own knight and checks their own damage, so
// play feels local on each screen. Guests report sword and spell hits, ask for loot,
// and follow the host between towns and caverns (a guest walking through a door asks
// the host to lead the party there).
//
// Messages (JSON):
//   hello {name, fairy}            guest -> host on connect
//   welcome {diff, dest, slot}     host -> guest: rules, where the party is, cloak colour
//   h {list, map}                  each peer's knights (host relays guests' to the others)
//   snap {map, en, pr, pk, boss}   host -> guests, 15 times a second
//   hit / bhit                     guest -> host: sword or spell damage to a monster / guardian
//   pick {map, id} / grant {k}     guest asks for a pickup; host hands it over
//   kill {map, xp}                 host -> guests: shared experience
//   bit {byte, mask}               a save flag changed (doors, chests, guardians, story)
//   prop {map, id} / door {map, id}  a chest/stash/loose item was taken, a lock was opened
//   travel {dest} / go {dest}      host leads the party / guest asks the host to go
//   boss {map}                     the guardian fell (everyone gets XP, flag and the exit)
//   bless {to} / dazzle {map,x,y}  the Spirit of Esmesanti's two powers
//   bye                            leaving
import { W, H, text, panel, COLORS } from '../render/screen.js';
import { audio } from '../core/audio.js';
import { TILE } from '../world/tilemap.js';
import { Hero } from '../game/hero.js';
import { addXp, maxHp } from '../game/character.js';
import { applyRules } from '../game/rules.js';
import { Enemy, enemyDef } from '../game/enemies.js';

const SNAP_DT = 1 / 15;
const HERO_DT = 1 / 20;
const BLESS_COOL = 4, DAZZLE_COOL = 8;

// JSON-safe copy of the plain fields of an object (drops functions, Sets, objects).
function plain(o, skip = {}) {
  const r = {};
  for (const k in o) {
    if (skip[k]) continue;
    const v = o[k];
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') r[k] = v;
  }
  return r;
}

export class Coop {
  constructor(game, session, { fairy = false } = {}) {
    this.game = game;
    this.s = session;
    this.isHost = session.isHost;
    this.room = session.room;
    this.fairy = fairy;
    this.remotes = new Map(); // key "peer:heroId" -> { hero, map, peer, tx, ty }
    this.names = new Map(); // peer -> name
    this.slots = new Map(); // peer -> cloak colour (host assigns)
    this.nextSlot = 1;
    this.snapT = 0;
    this.heroT = 0;
    this.snap = null;
    this.snapAge = 0;
    this.asked = new Set(); // pickups this guest already asked for
    this.consumed = new Set(); // monster shots that already hit this guest
    this.cool = { bless: 0, dazzle: 0 };
    this.status = '';
    session.on('message', (from, m) => this.onMessage(from, m));
    session.on('join', (id) => { if (this.isHost) this.game.toast('A knight is joining...', '#8fd0ff'); this.lastJoin = id; });
    session.on('leave', (id) => this.onLeave(id));
  }

  close() {
    try { this.s.broadcast({ t: 'bye' }); } catch { /* closed */ }
    this.s.close();
    this.dropRemotes(() => true);
  }

  // ------------------------------------------------------------ where we are
  get scene() {
    const sc = this.game.scenes;
    for (let i = sc.length - 1; i >= 0; i--) if (sc[i].world || sc[i].npcs) return sc[i];
    return null;
  }
  get world() { const s = this.scene; return s?.ready ? s.world || null : null; }
  get town() { const s = this.scene; return s?.ready && s.npcs ? s : null; }
  get mapId() { const s = this.scene; return s?.world?.id || s?.mapId || null; }

  // Where to put a knight joining the leader right now.
  partyDest() {
    const lead = this.game.leader?.hero;
    const w = this.world, t = this.town;
    if (w && lead) return { kind: 'cavern', map: w.id, x: Math.floor(lead.x / TILE), headRow: Math.floor(lead.y / TILE), face: lead.dir < 0 ? 'left' : 'right' };
    if (t && lead) return { kind: 'town', map: t.mapId, x: Math.max(1, Math.round(lead.cx / TILE - 1.5)) };
    const loc = this.game.leader?.character.location;
    return { kind: 'town', map: loc?.map || 'mrmp', x: loc?.x };
  }

  // ------------------------------------------------------------ messages
  send(to, m) { this.s.send(to, m); }
  toHost(m) { this.s.toHost(m); }
  all(m, except) { this.s.broadcast(m, except); }

  onMessage(from, m) {
    const g = this.game;
    switch (m.t) {
      case 'hello': {
        if (!this.isHost) return;
        this.names.set(from, m.name);
        const slot = this.nextSlot++;
        this.slots.set(from, slot);
        this.send(from, { t: 'welcome', diff: g.rulesDifficulty, dest: this.partyDest(), slot, host: g.leader?.character.name, bits: g.leader?.character.bits });
        g.toast(`${m.name}${m.fairy ? ' (the Spirit of Esmesanti)' : ''} joined the party!`, '#8fd0ff');
        audio.sfx('menu_accept');
        break;
      }
      case 'welcome': this.onWelcome?.(m); break;
      case 'h': {
        this.onHeroes(from, m);
        if (this.isHost) this.all({ ...m, via: from }, from);
        break;
      }
      case 'snap': if (!this.isHost) { this.snap = m; this.snapAge = 0; this.applySnap(m); } break;
      case 'hit': {
        const w = this.world;
        if (!this.isHost || !w || w.id !== m.map) return;
        const e = w.enemies.find((x) => x.id === m.id);
        if (e) w.damageEnemy(e, m.dmg, `${from}:${m.hero}`, m.dir, m.kind);
        break;
      }
      case 'bhit': {
        const w = this.world;
        if (!this.isHost || !w || w.id !== m.map || !w.boss) return;
        w.boss.damage(m.dmg, m.kind, w, `${from}:${m.hero}`, { sword: m.sword, box: m.box, spell: m.kind !== 'sword' && m.kind !== 'thrust' ? m.kind : undefined });
        break;
      }
      case 'pick': {
        const w = this.world;
        if (!this.isHost || !w || w.id !== m.map) return;
        const k = w.pickups.find((x) => x.id === m.id && !x.dead);
        if (!k) return;
        k.dead = true;
        this.send(from, { t: 'grant', map: m.map, k: plain(k) });
        break;
      }
      case 'grant': {
        const l = this.game.leader;
        if (l) g.applyPickup(this.world, l, m.k);
        break;
      }
      case 'kill': {
        const w = this.world;
        if (!w || w.id !== m.map || !m.xp) return;
        for (const l of g.locals) if (w.heroes.includes(l.hero)) addXp(l.character, m.xp);
        break;
      }
      case 'bit': g.setBit(m.byte, m.mask, true); if (this.isHost) this.all(m, from); break;
      case 'prop': {
        this.markProp(m);
        if (this.isHost) this.all(m, from);
        break;
      }
      case 'door': {
        const w = this.world;
        const d = w && w.id === m.map && w.doors.find((x) => x.id === m.id);
        if (d && d.locked) { d.locked = false; audio.sfx('door_unlock', { vol: 0.5 }); }
        if (this.isHost) this.all(m, from);
        break;
      }
      case 'travel': if (!this.isHost) this.follow(m.dest); break;
      case 'go': if (this.isHost) { g.toast(`${this.names.get(from) || 'A knight'} leads the way.`, '#8fd0ff'); this.lead(m.dest); } break;
      case 'boss': {
        const w = this.world;
        if (!this.isHost && w && w.id === m.map && w.boss && !w.boss.dead && !w.boss.finishing) {
          w.boss.finishing = true;
          w.boss.dying = true;
          w.boss.finish(w);
        }
        break;
      }
      case 'bless': this.routeBless(m); break;
      case 'dazzle': {
        const w = this.world;
        if (!w || w.id !== m.map) return;
        w.effect('flash', 0, 0, { color: '#cfefff', life: 0.25 });
        if (this.isHost) {
          for (const e of w.enemies) {
            if (e.dead) continue;
            const dx = w.map.near(e.cx, m.x) - m.x, dy = w.map.nearY(e.cy, m.y) - m.y;
            if (dx * dx + dy * dy < 200 * 200) { e.acc -= 2.0; e.hitFlash = 0.3; w.effect('spark', e.cx, e.cy); }
          }
          this.all(m, from);
        }
        break;
      }
      case 'bye': this.onLeave(from); break;
    }
  }

  onLeave(id) {
    const name = this.names.get(id);
    this.dropRemotes((r) => r.peer === id || r.via === id);
    if (!this.isHost && id === 'host') {
      this.game.toast('The host has left. You are on your own now.', '#e0584f');
      if (this.world) this.world.puppet = false;
      this.s.close();
      this.game.coop = null;
      return;
    }
    if (name) this.game.toast(`${name} left the party.`, '#c0b0a0');
  }

  dropRemotes(pred) {
    for (const [k, r] of this.remotes) {
      if (!pred(r)) continue;
      this.world?.removeHero(r.hero);
      this.remotes.delete(k);
    }
  }

  // ------------------------------------------------------------ knights
  sendHeroes() {
    const g = this.game;
    const list = g.locals.map((l) => {
      const h = l.hero, c = l.character;
      return {
        id: h.id, name: c.name, x: Math.round(h.x), y: Math.round(h.y), h: h.h, dir: h.dir, state: h.state,
        ground: h.onGround, atk: h.attack ? [h.attack.kind, +h.attack.t.toFixed(3)] : null, cast: +h.castT.toFixed(2),
        ifr: h.iframes > 0 ? 1 : 0, fl: +h.flash.toFixed(2), fairy: !!h.fairy, hp: c.hp, mhp: maxHp(c), lv: c.level, slot: h.slot,
      };
    });
    const m = { t: 'h', map: this.mapId, list };
    if (this.isHost) this.all(m); else this.toHost(m);
  }

  onHeroes(from, m) {
    const peer = m.via || from;
    for (const d of m.list) {
      const key = `${peer}:${d.id}`;
      let r = this.remotes.get(key);
      if (!r) {
        const hero = new Hero({ id: key, name: d.name, slot: 1, local: false });
        hero.label = d.name;
        r = { hero, peer, via: from, key };
        this.remotes.set(key, r);
      }
      const h = r.hero;
      r.map = m.map;
      r.seen = 0;
      r.tx = d.x; r.ty = d.y;
      if (r.fresh !== false) { h.x = d.x; h.y = d.y; r.fresh = false; }
      h.h = d.h; h.dir = d.dir; h.state = d.state; h.onGround = d.ground; h.fairy = d.fairy;
      h.castT = d.cast; h.flash = d.fl; h.iframes = d.ifr ? 0.1 : 0;
      h.attack = d.atk ? { kind: d.atk[0], t: d.atk[1], hits: new Set() } : null;
      h.slot = this.isHost ? this.slots.get(peer) ?? 1 : d.slot ?? 1;
      h.label = d.fairy ? `${d.name} ✦` : `${d.name}  ${d.hp}/${d.mhp}`;
      h.netHp = d.hp;
    }
    // Knights this peer no longer has (a couch player left).
    for (const [k, r] of this.remotes) if (r.peer === peer && !m.list.some((d) => `${peer}:${d.id}` === k)) { this.world?.removeHero(r.hero); this.remotes.delete(k); }
    this.placeRemotes();
  }

  // Put each remote knight into the current cavern when they are in the same one.
  placeRemotes() {
    const w = this.world, here = this.mapId;
    for (const r of this.remotes.values()) {
      if (!w) continue;
      if (r.map === here) { if (!w.heroes.includes(r.hero)) { w.addHero(r.hero); r.hero.x = r.tx; r.hero.y = r.ty; } }
      else w.removeHero(r.hero);
    }
  }

  // ------------------------------------------------------------ scene hooks
  enterWorld(w) {
    this.snap = null;
    this.asked.clear();
    this.consumed.clear();
    for (const r of this.remotes.values()) r.fresh = true;
    this.placeRemotes();
    if (!this.isHost) {
      // The host's monsters replace ours as soon as the first snapshot lands.
      w.puppet = true;
    }
  }
  enterTown() { this.snap = null; }

  onTravel(dest) {
    if (this.following) return true;
    if (this.isHost) { this.all({ t: 'travel', dest }); return true; }
    this.toHost({ t: 'go', dest });
    return false;
  }
  lead(dest) { this.game.travel(dest); }

  // Follow the host. Leaving a guardian's lair through its exit still collects the Tear.
  follow(dest) {
    const g = this.game;
    const w = this.world;
    this.following = true;
    const go = () => { this.following = true; g.travel(dest); this.following = false; };
    if (w && w.tearDoor && !w.tearClaimed) {
      w.tearDoor = false;
      w.tearClaimed = true;
      for (const l of g.locals) l.character.tears = Math.min(9, (l.character.tears || 0) + 1);
      g.save();
      const n = g.leader.character.tears;
      import('../scenes/story.js').then(({ StoryScene }) => g.transition(() => new StoryScene(g, 'tear', go, { count: n })));
      this.following = false;
      return;
    }
    go();
  }

  broadcastBit(byte, mask) { const m = { t: 'bit', byte, mask }; if (this.isHost) this.all(m); else this.toHost(m); }
  onPropTaken(world, prop) { const m = { t: 'prop', map: world.id, id: prop.id }; if (this.isHost) this.all(m); else this.toHost(m); }
  onDoorUnlock(world, door) { const m = { t: 'door', map: world.id, id: door.id }; if (this.isHost) this.all(m); else this.toHost(m); }

  markProp(m) {
    const w = this.world;
    const o = w && w.id === m.map && w.props.find((x) => x.id === m.id);
    if (!o) return;
    if ('open' in o) { o.open = true; o.t = 0; }
    else if (!o.dead) {
      o.dead = true;
      if (o.breakable) { o.stampSolid(w.map, false); w.effect('rubble', o.cx, o.y + o.h / 2, { life: 0.7 }); }
    }
  }

  // ------------------------------------------------------------ guest -> host reports
  reportHit(world, id, dmg, dir, kind) {
    const hero = this.game.leader?.hero;
    this.toHost({ t: 'hit', map: world.id, id, dmg, dir, kind, hero: hero?.id });
  }
  reportBossHit(world, dmg, kind, sword) {
    const hero = this.game.leader?.hero;
    const box = hero?.swordBox?.();
    this.toHost({ t: 'bhit', map: world.id, dmg, kind, sword, box: box ? plain(box) : undefined, hero: hero?.id });
    world.effect('hit', world.boss ? world.boss.cx : hero.cx, hero.y + 30, {});
  }
  requestPickup(world, id) {
    if (id.startsWith('s')) {
      // Loot from a chest this guest opened is theirs straight away.
      const k = world.pickups.find((x) => x.id === id);
      if (k) { k.dead = true; this.game.applyPickup(world, this.game.leader, k); }
      return;
    }
    if (this.asked.has(id)) return;
    this.asked.add(id);
    this.toHost({ t: 'pick', map: world.id, id });
  }
  grantPickupToRemote() { /* remote knights collect on their own screens and ask */ }

  // ------------------------------------------------------------ host -> guest events
  onKill(world, enemy, xp) { this.all({ t: 'kill', map: world.id, xp }); }
  onBossDefeated(mapId) { if (this.isHost) this.all({ t: 'boss', map: mapId }); }
  onLocalCast() {}
  onSpirit() {}
  onRevive() {}
  onItem() {}
  onLevel() {}

  // ------------------------------------------------------------ snapshots
  makeSnap(w) {
    const en = w.enemies.map((e) => ({
      id: e.id, d: e.def.id, tw: e.tw, th: e.th, tx: +e.tx.toFixed(2), ty: +e.ty.toFixed(2), dir: e.dir, hp: e.hp,
      dead: e.dead ? 1 : 0, dt: e.dead ? +e.deathT.toFixed(2) : 0, hid: e.hidden ? 1 : 0, at: e.attackT || 0,
      up: e.upsideDown ? 1 : 0, fade: e.fade, fl: e.hitFlash > 0 ? 1 : 0, nc: e.noContact ? 1 : 0, inv: e.invuln ? 1 : 0,
    }));
    const pr = w.projectiles.filter((p) => !p.friendly).map((p) => plain(p));
    const pk = w.pickups.filter((k) => !k.dead).map((k) => plain(k));
    let boss = null;
    if (w.boss) {
      const b = w.boss;
      boss = { ...plain(b, { acc: 1 }), parts: b.parts.map((p) => plain(p)) };
    }
    return { t: 'snap', map: w.id, en, pr, pk, boss };
  }

  applySnap(m) {
    const w = this.world;
    if (!w || w.id !== m.map) return;
    const g = this.game;
    // Monsters: update by id, create any we lack (respawns, traps), drop the rest.
    const byId = new Map(w.enemies.map((e) => [e.id, e]));
    const next = [];
    for (const s of m.en) {
      let e = byId.get(s.id);
      if (!e) {
        const [, wd, td] = /^w(\d+)t(\d+)$/.exec(s.d) || [];
        const def = { ...enemyDef(g, Number(wd ?? w.level), Number(td ?? 1)), tw: s.tw, th: s.th };
        e = new Enemy(def, s.tx, s.ty, { id: s.id, dir: s.dir });
      }
      // Interpolate from where it is drawn now to the new spot (the short way round).
      const cx = e.x / TILE, cy = e.y / TILE;
      e.ptx = Math.abs(s.tx - cx) > w.map.w / 2 ? s.tx : cx;
      e.pty = Math.abs(s.ty - cy) > w.map.h / 2 ? s.ty : cy;
      e.tx = s.tx; e.ty = s.ty; e.lerpT = 0;
      e.dir = s.dir; e.hp = s.hp; e.hidden = !!s.hid; e.attackT = s.at; e.upsideDown = !!s.up; e.fade = s.fade;
      e.noContact = !!s.nc; e.invuln = !!s.inv;
      if (s.fl && !(e.hitFlash > 0)) e.hitFlash = 0.15;
      if (s.dead && !e.dead) { e.dead = true; e.deathT = s.dt; w.effect('poof', e.cx, e.cy, { life: 0.5 }); }
      next.push(e);
    }
    w.enemies = next;
    // Monster shots (ours are simulated locally).
    const mine = w.projectiles.filter((p) => p.friendly);
    w.projectiles = mine.concat(m.pr.filter((p) => !this.consumed.has(p.id)));
    // Loot: the host's list, plus anything our own chests dropped.
    const ours = w.pickups.filter((k) => k.id.startsWith('s') && !k.dead && !m.pk.some((x) => x.id === k.id));
    w.pickups = m.pk.map((k) => ({ ...k, claimed: this.asked.has(k.id) })).concat(ours);
    // Guardian
    if (m.boss && w.boss) {
      const b = w.boss;
      const cx = b.x / TILE, cy = b.y / TILE;
      const parts = m.boss.parts;
      Object.assign(b, m.boss);
      b.parts = parts;
      b.ptx = cx; b.pty = cy; b.lerpT = 0;
    }
  }

  // Guest side of the cavern each frame: our spells, effects, props and platforms run
  // here; monsters glide toward their last reported spots.
  puppetWorld(w, dt) {
    w.time += dt;
    if (w.shake > 0) w.shake -= dt;
    const a = (o) => { o.lerpT = (o.lerpT || 0) + dt; const k = Math.min(1, o.lerpT / SNAP_DT); o.x = (o.ptx + (o.tx - o.ptx) * k) * TILE; o.y = (o.pty + (o.ty - o.pty) * k) * TILE; };
    for (const e of w.enemies) {
      e.animT += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.dead) e.deathT += dt;
      a(e);
    }
    w.enemies = w.enemies.filter((e) => !(e.dead && e.deathT > 0.6));
    if (w.boss) {
      const b = w.boss;
      if (b.flash > 0) b.flash -= dt;
      if (b.ptx != null) a(b);
      if (b.dying) b.deathT += dt;
    }
    for (const p of w.platforms) p.update?.(dt, w);
    for (const p of w.props) p.update?.(dt, w);
    w.props = w.props.filter((p) => !p.dead || p.lingers);
    for (const p of w.projectiles) {
      p.t = (p.t || 0) + dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.friendly) continue;
      p.update?.(p, dt, w);
      if (p.t > p.life) p.dead = true;
      if (!p.ghost && w.map.rectSolid(p.x + 3, p.y + 3, p.w - 6, p.h - 6)) {
        if (p.onWall) p.onWall(p, w);
        else { p.dead = true; w.effect('spark', p.x + p.w / 2, p.y + p.h / 2); }
      }
      if (!p.dead) w.projectileHits(p);
    }
    // A monster shot that hit (or was blocked by) us stays gone even if the host still has it.
    for (const p of w.projectiles) if (p.dead && !p.friendly) this.consumed.add(p.id);
    w.projectiles = w.projectiles.filter((p) => !p.dead);
    for (const k of w.pickups) k.t = (k.t || 0) + dt;
    for (const fx of w.effects) fx.t += dt;
    w.effects = w.effects.filter((fx) => fx.t < fx.life);
  }

  // ------------------------------------------------------------ the Spirit of Esmesanti
  fairyPowers(dt) {
    const g = this.game, w = this.world;
    this.cool.bless = Math.max(0, this.cool.bless - dt);
    this.cool.dazzle = Math.max(0, this.cool.dazzle - dt);
    for (const l of g.locals) {
      const h = l.hero;
      if (!h.fairy) continue;
      h.state = 'spirit';
      h.spiritT = 999;
      l.character.hp = maxHp(l.character);
      if (!w) continue;
      if (l.input.pressed('attack') && this.cool.bless <= 0) {
        // Bless the nearest knight within reach: +40 HP.
        let best = null, bd = 140;
        for (const o of w.heroes) {
          if (o === h || !o.alive || o.fairy) continue;
          const d = Math.hypot(w.map.near(o.cx, h.cx) - h.cx, w.map.nearY(o.y + 30, h.y) - h.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          this.cool.bless = BLESS_COOL;
          const key = this.remoteKey(best);
          w.effect('text', best.cx, best.y - 10, { text: '✦', color: '#bff0ff', life: 0.8 });
          audio.sfx('potion', { vol: 0.5 });
          if (key) this.routeBless({ t: 'bless', to: key });
        }
      }
      if (l.input.pressed('magic') && this.cool.dazzle <= 0) {
        this.cool.dazzle = DAZZLE_COOL;
        audio.sfx('spell_nova', { vol: 0.6 });
        const m = { t: 'dazzle', map: w.id, x: h.cx, y: h.y + 20 };
        if (this.isHost) this.onMessage('host', m); else { this.toHost(m); w.effect('flash', 0, 0, { color: '#cfefff', life: 0.25 }); }
      }
    }
  }
  // Knight keys are "peer:heroId" (the host's own knights are "host:..."). A blessing
  // heals the knight on its owner's screen; the host forwards it there.
  get me() { return this.isHost ? 'host' : this.s.myId; }
  routeBless(m) {
    const peer = m.to.slice(0, m.to.indexOf(':'));
    if (peer !== this.me) { if (this.isHost) this.send(peer, m); else this.toHost(m); return; }
    const id = m.to.slice(peer.length + 1);
    const l = this.game.locals.find((x) => x.hero.id === id);
    if (!l || !l.hero.alive) return;
    this.game.heal(l, 40);
    this.world?.effect('text', l.hero.cx, l.hero.y - 10, { text: 'Blessed! +40', color: '#bff0ff', life: 1.2 });
  }
  // "peer:heroId" for a knight on some screen (our own couch knights use our own id).
  remoteKey(h) {
    for (const [k, r] of this.remotes) if (r.hero === h) return k;
    const l = this.game.locals.find((x) => x.hero === h);
    return l ? `${this.me}:${h.id}` : null;
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.heroT += dt;
    this.snapT += dt;
    this.snapAge += dt;
    if (this.heroT >= HERO_DT) { this.heroT = 0; this.sendHeroes(); }
    const w = this.world;
    if (this.isHost && w && this.s.peers.size && this.snapT >= SNAP_DT) { this.snapT = 0; this.all(this.makeSnap(w)); }
    // Remote knights glide toward their reported spots (wrapping the short way).
    for (const r of this.remotes.values()) {
      r.seen = (r.seen || 0) + dt;
      const h = r.hero;
      if (r.tx == null) continue;
      const tx = w ? w.map.near(r.tx, h.x) : r.tx, ty = w ? w.map.nearY(r.ty, h.y) : r.ty;
      const k = Math.min(1, dt * 14);
      h.x += (tx - h.x) * k;
      h.y += (ty - h.y) * k;
      h.animT += dt;
      if (h.attack) h.attack.t += dt;
      if (w) w.map.normalize(h);
    }
    this.fairyPowers(dt);
  }

  // Remote knights in a town (drawn by the town scene at street level).
  townKnights() {
    const here = this.mapId;
    return [...this.remotes.values()].filter((r) => r.map === here).map((r) => r.hero);
  }

  drawStatus() {
    const n = this.s.peers.size + 1;
    const label = `${this.isHost ? 'Hosting' : 'Joined'} ${this.s.kind === 'local' ? 'on this PC' : 'online'} · Room ${this.room} · ${n} player${n === 1 ? '' : 's'}`;
    panel(W - 330, H - 34, 320, 26, { alpha: 0.7 });
    text(label, W - 170, H - 29, { size: 13, align: 'center', color: '#8fd0ff' });
    if (this.fairy) {
      const b = this.cool.bless > 0 ? `${Math.ceil(this.cool.bless)}s` : 'ready';
      const d = this.cool.dazzle > 0 ? `${Math.ceil(this.cool.dazzle)}s` : 'ready';
      panel(10, H - 34, 420, 26, { alpha: 0.7 });
      text(`Sword: Bless a knight (${b})   Magic: Dazzle monsters (${d})`, 220, H - 29, { size: 13, align: 'center', color: '#bff0ff' });
    }
  }
}

// Start a guest's session: say hello, wait for the host's welcome, then join the party.
export async function joinParty(game, session, character, slot, { fairy = false } = {}) {
  const coop = new Coop(game, session, { fairy });
  const welcome = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The host did not answer.')), 8000);
    coop.onWelcome = (m) => { clearTimeout(t); resolve(m); };
    session.toHost({ t: 'hello', name: character.name, fairy });
  });
  coop.onWelcome = null;
  game.startSolo(character, slot);
  applyRules(game.data, welcome.diff || 'english');
  const l = game.leader;
  l.hero.slot = welcome.slot || 1;
  if (fairy) { l.hero.fairy = true; l.hero.state = 'spirit'; l.hero.label = `${character.name} ✦`; }
  // Share the host's story progress (doors opened, guardians beaten) for this session.
  if (welcome.bits && fairy) l.character.bits = { ...welcome.bits };
  game.coop = coop;
  coop.following = true;
  game.travel(welcome.dest);
  coop.following = false;
  return coop;
}

export { SNAP_DT };
