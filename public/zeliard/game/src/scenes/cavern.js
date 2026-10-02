// Cavern play: runs the CavernWorld, the local knights, the camera(s) and the HUD.
// Couch co-op uses a shared camera that keeps both knights on screen.
import { ctx, W, H, text, panel, bar, COLORS, fade } from '../render/screen.js';
import { TILE, F } from '../world/tilemap.js';
import { loadCavern, loadSandbox } from '../world/loader.js';
import { maxHp, RULES } from '../game/character.js';
import { SPELLS } from '../game/spells.js';
import { audio } from '../core/audio.js';
import { sheetNow } from '../core/assets.js';
import { Minimap } from '../ui/minimap.js';

const MUSIC = { mus1: 'moss_crypt', mus2: 'moss_crypt', mus3: 'bramble_gallery', mus4: 'frost_vault', mus5: 'bone_ossuary', mus6: 'gilded_deep', mus7: 'ember_works', mus8: 'abyss_throne' };

export class CavernScene {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.world = null;
    this.ready = false;
    this.t = 0;
    this.cam = { x: 0, y: 0 };
    this.nameT = 0;
    this.load().catch((e) => { console.error(e); this.error = String(e); });
  }

  async load() {
    const g = this.game, o = this.opts;
    this.world = o.sandbox ? await loadSandbox(g) : await loadCavern(g, o.mapId);
    const w = this.world;
    let i = 0;
    for (const l of g.locals) {
      const h = l.hero;
      h.state = 'idle';
      h.attack = null;
      // A fallen knight the party carried along wakes like a rekindled one (never at 0 HP).
      if (l.character.hp <= 0 && !h.fairy) l.character.hp = Math.ceil(maxHp(l.character) * 0.3);
      if (o.left != null) h.placeTiles(o.left, o.headRow);
      else if (o.x != null) h.place(o.x * TILE, (o.y ?? 10) * TILE);
      else if (w.data.spawn) h.place(w.data.spawn.x, w.data.spawn.y);
      else {
        // Default: in front of the first door back to a town, else where a door from
        // another map arrives (world.json edges).
        const d = w.doors.find((x) => x.dest?.kind === 'town') || w.doors[0];
        const e = (g.data.world?.edges || []).find((x) => x.to === w.id && x.toHeadRow != null);
        if (d) h.placeTiles(d.d.enter.heroLeftColumn, d.d.enter.heroHeadRow);
        else if (e) h.placeTiles(e.toX, e.toHeadRow);
        else h.placeTiles(4, 4);
      }
      h.x += i * 30;
      h.dir = o.face === 'left' ? -1 : 1;
      h.cam = null;
      h.fallStartY = h.y;
      w.addHero(h);
      i++;
    }
    // Autosave at the cavern mouth so Continue brings the party back here.
    const lh = g.leader.hero;
    const at = { kind: 'cavern', map: w.id, x: Math.floor(lh.x / TILE), headRow: Math.floor(lh.y / TILE), face: lh.dir < 0 ? 'left' : 'right' };
    if (!w.data.boss && !o.sandbox) { for (const l of g.locals) l.character.location = at; g.save(); }
    g.coop?.enterWorld(w);
    this.world.data.music = MUSIC[w.data.descriptor?.music] || 'moss_crypt';
    audio.playMusic(this.world.data.music);
    if (w.data.boss) {
      const { spawnBoss } = await import('../game/bosses.js');
      await spawnBoss(g, w);
    }
    this.minimap = new Minimap(g, w);
    this.ready = true;
    this.nameT = 0;
  }
  exit() { this.minimap?.store(); }

  update(dt) {
    if (!this.ready) return;
    const g = this.game, w = this.world;
    this.t += dt;
    this.nameT += dt;
    if (g.menu.pressed('pause')) { g.openPause(this); return; }
    for (const l of g.locals) {
      if (l.input.pressed('menu') && l.hero.alive) { g.openInventory(this, l); return; }
    }
    // Local knights
    for (const l of g.locals) {
      const h = l.hero;
      h.update(dt, l.input, w);
      w.resolveSword(h);
      w.checkHeroDamage(h);
      w.collectPickups(h);
      if (l.input.pressed('up') && h.alive && h.onGround && h.state !== 'climb') this.tryDoor(l);
      this.keepFree(h, w, dt);
      // Couch player 2 shares the leader's camera: off screen for a moment, he rejoins the leader.
      if (l !== g.locals[0] && h.alive && h.state !== 'door' && this.offCamera(h)) {
        if ((h.offCamT = (h.offCamT || 0) + dt) > 0.75) { this.rejoin(h, g.locals[0].hero, w); h.offCamT = 0; }
      } else h.offCamT = 0;
      // Keep the knight inside the wrapped map, shifting its camera by the same amount.
      // Couch co-op shares one camera (h.cam === this.cam) that follows the leader, so only
      // the leader's wrap moves it, once; solo moves the knight's own camera.
      const [sx, sy] = w.map.normalize(h);
      if (sx || sy) {
        h.fallStartY += sy;
        if (g.locals.length === 1) { if (h.cam) { h.cam.x += sx; h.cam.y += sy; } }
        else if (g.locals[0] === l) { this.cam.x += sx; this.cam.y += sy; }
      }
    }
    g.upkeep(w, dt);
    this.minimap?.update(dt, this.lastCam);
    // World
    if (!g.coop || g.coop.isHost) w.simulate(dt);
    else g.coop.puppetWorld(w, dt);
    if (this.defeatT != null) {
      this.defeatT += dt;
      if (this.defeatT > 2.5) { this.defeatT = null; g.onDefeat(); }
    }
  }

  // Never stranded: remember the last place each knight stood on solid ground, and if he ever
  // ends up inside rock (a platform, a falling block, anything) for more than a moment, move
  // him to the nearest open spot, or back to that safe place.
  keepFree(h, w, dt) {
    if (!h.alive || h.state === 'door' || h.state === 'spirit') { h.embedT = 0; return; }
    const m = w.map;
    if (m.rectSolid(h.x, h.y, h.w, h.h)) {
      if ((h.embedT = (h.embedT || 0) + dt) > 0.15) { this.unstick(h, w, false); h.embedT = 0; }
      return;
    }
    h.embedT = 0;
    // On rock (platforms are one-way, not solid, so a ride never counts), standing up.
    if (h.onGround && h.state !== 'crouch' && m.rectSolid(h.x + 2, h.y + h.h, h.w - 4, 2)) h.safe = { cx: h.cx, feet: h.feet };
  }
  // Move a knight out of rock: the nearest spot (within 4 tiles) where he fits with ground under
  // him, else his last safe place. toSafe (the pause menu's Unstuck) tries the safe place first.
  unstick(h, w, toSafe = true) {
    const m = w.map, T = 24;
    const fits = (cx, feet) => !m.rectSolid(cx - h.w / 2, feet - h.h, h.w, h.h) && m.rectHas(cx - h.w / 2 + 2, feet, h.w - 4, 2, F.SOLID | F.ONEWAY);
    let best = toSafe && h.safe && fits(h.safe.cx, h.safe.feet) ? h.safe : null;
    if (!best) {
      for (let r = 1; r <= 4 * T && !best; r += 4) {
        for (const [dx, dy] of [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
          const cx = h.cx + dx, feet = Math.round((h.feet + dy) / T) * T;
          if (fits(cx, feet)) { best = { cx, feet }; break; }
        }
      }
    }
    best ||= h.safe && fits(h.safe.cx, h.safe.feet) ? h.safe : null;
    if (!best) return false;
    h.rescues = (h.rescues || 0) + 1;
    h.place(best.cx, best.feet);
    h.vx = 0; h.vy = 0; h.fallStartY = h.y; h.riding = null;
    if (h.state === 'climb' || h.state === 'hurt') h.state = 'idle';
    if (toSafe) this.game.toast('Back on solid ground.', '#8fe3ff');
    return true;
  }
  offCamera(h) {
    const c = this.cam;
    return !c || h.cx < c.x - 24 || h.cx > c.x + W + 24 || h.feet < c.y - 24 || h.y > c.y + H + 24;
  }
  // Put a straying couch knight back beside the leader (a free spot next to him, else on him).
  rejoin(h, lead, w) {
    const m = w.map;
    for (const dx of [-30, 30, -54, 54, 0]) {
      const cx = lead.cx + dx;
      if (!m.rectSolid(cx - h.w / 2, lead.feet - h.h, h.w, h.h)) { h.place(cx, lead.feet); break; }
    }
    h.vx = 0; h.vy = 0; h.fallStartY = h.y; h.riding = null;
    if (h.state === 'climb') h.state = 'idle';
  }

  tryDoor(l) {
    const g = this.game, w = this.world, h = l.hero, c = l.character;
    const door = w.doorAt(h);
    if (!door) return;
    if (door.locked) {
      const lion = door.d.lock === 'lion';
      const have = lion ? c.lionKeys : c.keys;
      if (have <= 0) { g.toast(lion ? "It is sealed. A Lion's Head Key would open it." : 'The door is locked. You need a Key.', '#e0c080'); audio.sfx('menu_cancel', { vol: 0.5 }); return; }
      if (lion) c.lionKeys--; else c.keys--;
      door.locked = false;
      if (door.d.saveFlag) g.setBit(door.d.saveFlag.byte, door.d.saveFlag.mask);
      else for (const k of g.locals) { const od = (k.character.openedDoors ||= []); const key = `${w.id}:${door.d.index}`; if (!od.includes(key)) od.push(key); }
      g.coop?.onDoorUnlock(w, door);
      audio.sfx('door_unlock', { vol: 0.8 });
      g.toast('The door opened.');
      g.save();
      return;
    }
    const d = door.dest;
    if (!d) return;
    audio.sfx('door_open', { vol: 0.7 });
    h.state = 'door';
    let dest = d.kind === 'town' ? { kind: 'town', map: d.map, x: d.x } : { kind: 'cavern', map: d.map, x: d.x, headRow: d.headRow, face: door.d.runLeftOnArrival ? 'left' : 'right' };
    // After Jashiin the exit door (which the data points back into his arena) takes the
    // knights home to the King, who is waiting with the nine Tears' news.
    if (w.id === 'mpa0' && g.hasBit('0x49', 0xff)) dest = { kind: 'town', map: 'cmap', x: 46 };
    // Leaving a guardian's lair through its exit door collects that cavern's Tear of Esmesanti.
    if (this.world.tearDoor && !this.world.tearClaimed) {
      this.world.tearDoor = false;
      this.world.tearClaimed = true;
      for (const l of g.locals) l.character.tears = Math.min(9, (l.character.tears || 0) + 1);
      if (door.d.saveFlag) g.setBit(door.d.saveFlag.byte, door.d.saveFlag.mask);
      g.save();
      const n = g.leader.character.tears;
      import('./story.js').then(({ StoryScene }) => g.transition(() => new StoryScene(g, 'tear', () => g.travel(dest), { count: n })));
      return;
    }
    g.travel(dest);
  }

  onHeroDefeated() { if (this.defeatT == null) this.defeatT = 0; }

  camera() {
    const g = this.game, w = this.world;
    if (g.locals.length === 1) return w.camera(g.locals[0].hero);
    // Shared camera: centre on the living knights (positions taken near the leader).
    const lead = g.locals[0].hero;
    const hs = g.locals.map((l) => l.hero).filter((h) => h.state !== 'dead');
    const xs = hs.map((h) => w.map.near(h.cx, lead.cx)), ys = hs.map((h) => w.map.nearY(h.y + h.h / 2, lead.y));
    const tx = (Math.min(...xs) + Math.max(...xs)) / 2 - W / 2;
    const ty = (Math.min(...ys) + Math.max(...ys)) / 2 - H / 2;
    this.cam.x += (tx - this.cam.x) * 0.12;
    this.cam.y += (ty - this.cam.y) * 0.12;
    for (const h of hs) h.cam = this.cam;
    return this.cam;
  }

  draw(t) {
    if (this.error) { text('Could not load the cavern: ' + this.error, W / 2, H / 2, { align: 'center', size: 16, color: COLORS.red }); return; }
    if (!this.ready) { text('Entering the cavern…', W / 2, H / 2, { align: 'center', size: 20 }); return; }
    const cam = this.camera();
    this.lastCam = cam;
    this.game.scene === this && (this.game.lastCam = cam);
    this.world.draw(cam, t);
    this.drawHud(t);
    if (this.nameT < 3.5 && this.world.data.name) {
      const a = Math.min(1, this.nameT * 2, (3.5 - this.nameT) * 1.5);
      text(this.world.data.name, W / 2, 112, { size: 30, align: 'center', color: COLORS.gold, alpha: a, weight: 700, shadow: true });
    }
    // Door prompt
    for (const l of this.game.locals) {
      const d = this.world.doorAt(l.hero);
      if (d && l.hero.alive) {
        const [cx, cy] = this.world.view(l.hero, this.cam.x === 0 && this.game.locals.length === 1 ? l.hero.cam.x : cam.x, cam.y);
        text(d.locked ? (d.d.lock === 'lion' ? '▲ Lion seal' : '▲ Locked') : '▲ Enter', l.hero.cx - cx, l.hero.y - cy - 34, { size: 14, align: 'center', color: '#fff4c8', shadow: true });
      }
    }
    this.minimap?.draw();
    if (this.defeatT != null) fade((this.defeatT / 2.5) * 0.9, '#200');
  }

  drawHud() {
    const g = this.game;
    g.locals.forEach((l, i) => drawKnightHud(l, 12 + i * 334, 10));
    if (this.world.boss) this.world.boss.drawHud?.();
  }
}

export function drawKnightHud(l, x, y) {
  const c = l.character;
  if (l.hero.fairy) {
    panel(x, y, 322, 52, { alpha: 0.88 });
    text(`${c.name} ✦`, x + 14, y + 9, { size: 15, color: '#bff0ff' });
    text('the Spirit of Esmesanti', x + 14, y + 29, { size: 13, color: COLORS.dim });
    return;
  }
  panel(x, y, 322, 74, { alpha: 0.88 });
  text(c.name, x + 14, y + 9, { size: 15, color: COLORS.gold });
  text(`Lv ${c.level}`, x + 120, y + 9, { size: 15 });
  text(`XP ${c.xp}`, x + 308, y + 10, { size: 13, align: 'right', color: COLORS.dim });
  const mh = maxHp(c);
  bar(x + 14, y + 32, 196, 10, Math.min(1, c.hp / mh), '#d8423a', { segments: 10 });
  text(`${c.hp}/${mh}`, x + 218, y + 29, { size: 13 });
  const sh = RULES.shields[c.shield];
  if (sh) { bar(x + 14, y + 50, 96, 6, c.shieldHp / sh.power, '#6fa8dc'); text(String(c.shieldHp), x + 114, y + 46, { size: 11, color: '#9fc8ec' }); }
  else text('NO SHIELD', x + 14, y + 46, { size: 11, color: COLORS.red });
  const al = sheetNow('art.item.almas');
  if (al) al.draw(ctx, 0, x + 150, y + 64, 1, 1, 0.75);
  text(`${c.almas}`, x + 160, y + 48, { size: 13, color: COLORS.almas });
  text(`${c.gold} G`, x + 204, y + 48, { size: 13, color: COLORS.gold });
  if (c.keys) text(`Keys ${c.keys}`, x + 190, y + 10, { size: 13, color: '#e0c080' });
  if (c.spell) text(`${SPELLS[c.spell]?.name || c.spell} ${c.charges[c.spell] ?? 0}`, x + 308, y + 48, { size: 12, color: COLORS.magic, align: 'right' });
}
