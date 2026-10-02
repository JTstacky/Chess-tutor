// The game object: scene stack, local players, the rules hooks the cavern calls into,
// travel between towns and caverns, and (when a co-op session is running) the bridge
// to the network layer.
import { ctx, W, H, text, fade } from '../render/screen.js';
import { input, InputState } from '../core/input.js';
import { audio } from '../core/audio.js';
import { loadJSON } from '../core/assets.js';
import { settings, saveSlot } from '../core/save.js';
import { params } from '../core/util.js';
import { RULES, newCharacter, migrate, maxHp, swordDamage, addXp, derived, shieldTier, setBit, hasBit, getByte, refillSpells, isTester, TESTER_GOLD } from './character.js';
import { applyRules } from './rules.js';
import { Hero } from './hero.js';
import { castSpell, SPELLS } from './spells.js';
import { TitleScene } from '../scenes/title.js';
import { CavernScene } from '../scenes/cavern.js';
import { TownScene } from '../scenes/town.js';
import { StoryScene } from '../scenes/story.js';
import { OpeningScene } from '../scenes/opening.js';
import { PauseScene, InventoryScene } from '../scenes/menus.js';
import { TILE } from '../world/tilemap.js';
import { FRAME } from './enemies.js';

// Town place ids <-> map ids <-> rules town keys.
export const TOWNS = {
  cmap: { place: 0x80, key: 'felishika_castle', short: 'castle' },
  mrmp: { place: 0x81, key: 'muralla' }, stmp: { place: 0x82, key: 'satono' }, bsmp: { place: 0x83, key: 'bosque' },
  hlmp: { place: 0x84, key: 'helada' }, tmmp: { place: 0x85, key: 'tumba' }, drmp: { place: 0x86, key: 'dorado' },
  llmp: { place: 0x87, key: 'llama' }, prmp: { place: 0x88, key: 'pureza' }, esmp: { place: 0x89, key: 'esco' },
};
export const townByPlace = (p) => Object.keys(TOWNS).find((k) => TOWNS[k].place === (typeof p === 'string' ? parseInt(p, 16) : p));
export const townKey = (mapId) => TOWNS[mapId]?.key;

export class Game {
  constructor() {
    this.scenes = [];
    this.locals = []; // { slot, character, input, hero, saveSlot }
    this.debug = params.has('debug');
    this.speed = settings.get('speed') || 1;
    this.coop = null;
    this.toasts = [];
    this.time = 0;
  }

  async init() {
    const [world, tiles, physics, themes, enemies, bosses, items, spells, progression, towns, story, japanese, text] = await Promise.all([
      loadJSON('data/world/world.json', null), loadJSON('data/world/tiles.json', null), loadJSON('data/world/physics.json', null),
      loadJSON('data/themes.json', {}), loadJSON('data/rules/enemies.json', null), loadJSON('data/rules/bosses.json', null),
      loadJSON('data/rules/items.json', null), loadJSON('data/rules/spells.json', null), loadJSON('data/rules/progression.json', null),
      loadJSON('data/rules/towns.json', null), loadJSON('data/rules/story.json', null), loadJSON('data/rules/japanese_balance.json', null),
      loadJSON('data/text/ja_en.json', []),
    ]);
    this.data = { world, tiles, physics, themes, text, rules: { enemies, bosses, items, spells, progression, towns, story, japanese } };
    applyRules(this.data, 'english');
    const diff = params.get('jp') != null ? 'japanese' : 'english';
    if (params.has('sandbox')) {
      this.startSolo(this.testCharacter(diff), -1);
      this.replace(new CavernScene(this, { sandbox: true }));
    } else if (params.get('map')) {
      this.startSolo(this.testCharacter(diff), -1);
      this.replace(new CavernScene(this, { mapId: params.get('map'), x: params.has('x') ? Number(params.get('x')) : null, y: params.has('y') ? Number(params.get('y')) : null }));
    } else if (params.get('town')) {
      this.startSolo(this.testCharacter(diff), -1);
      this.replace(new TownScene(this, { mapId: params.get('town'), x: params.has('x') ? Number(params.get('x')) : null }));
    } else if (params.has('nointro')) {
      this.replace(new TitleScene(this));
    } else {
      // The original's attract sequence (copyright, prologue, Jashiin, title, credits), then the menu.
      this.replace(new OpeningScene(this, () => this.transition(() => new TitleScene(this))));
    }
  }

  // Debug character for ?map= / ?town= links: optional ?level= ?sword= ?gold= ?spells.
  testCharacter(diff) {
    applyRules(this.data, diff);
    const c = newCharacter('Duke', diff);
    if (params.has('level')) c.level = Number(params.get('level'));
    c.hp = maxHp(c);
    if (params.get('sword')) c.sword = params.get('sword');
    c.shield = params.get('shield') || 'clay_shield';
    c.shieldHp = RULES.shields[c.shield]?.power || 30;
    c.gold = Number(params.get('gold') || 1000);
    if (params.has('spells')) { c.spellsLearned = ['espada', 'saeta', 'fuego', 'lanzar', 'rascar', 'agua', 'guerra']; c.spell = 'espada'; }
    if (params.get('keys')) c.keys = Number(params.get('keys'));
    return c;
  }

  get rulesDifficulty() { return RULES.difficulty; }
  // Japanese balance: Japanese-edition names and lines (see rules.js setupText).
  localize(t) { return RULES.localize ? RULES.localize(t) : t; }

  // ------------------------------------------------------------ scenes
  get scene() { return this.scenes[this.scenes.length - 1]; }
  push(s) { this.scenes.push(s); s.enter?.(); }
  pop() { const s = this.scenes.pop(); s?.exit?.(); this.scene?.resume?.(); return s; }
  replace(s) { while (this.scenes.length) { const x = this.scenes.pop(); x.exit?.(); } this.push(s); }
  transition(makeScene, { color = '#000', dur = 0.35 } = {}) {
    if (this.fading) return;
    this.fading = { t: 0, dur, color, makeScene, phase: 'out' };
  }

  // ------------------------------------------------------------ players
  startSolo(character, slot) {
    character = migrate(character);
    applyRules(this.data, character.difficulty || 'english');
    this.locals = [this.makeLocal(0, character, slot)];
    input.couch = false;
  }
  makeLocal(i, character, slot) {
    if (character.hp == null || character.hp > maxHp(character)) character.hp = maxHp(character);
    const hero = new Hero({ slot: i, name: character.name, stats: derived(character), local: true });
    hero.character = character;
    const l = { slot: i, character, input: new InputState(), hero, saveSlot: slot, regenT: 0, heatT: 0, healPulse: 0 };
    hero.input = l.input;
    return l;
  }
  addCouchPlayer(character) {
    const i = this.locals.length;
    const l = this.makeLocal(i, character, -1);
    l.hero.label = `P${i + 1}`;
    this.locals[0].hero.label = 'P1';
    this.locals.push(l);
    input.couch = this.locals.length > 1;
    return l;
  }
  get leader() { return this.locals[0]; }
  refresh(local) { local.hero.stats = derived(local.character); }

  beginNewGame(character, slot) {
    this.startSolo(character, slot);
    character.location = { map: 'cmap', x: 20 };
    this.save();
    this.transition(() => new StoryScene(this, 'opening', () => this.transition(() => new TownScene(this, { mapId: 'cmap', x: 20 }))));
  }
  continueGame(character, slot) {
    this.startSolo(character, slot);
    const c = this.leader.character;
    const loc = c.location || { map: c.lastSage || 'mrmp' };
    if (loc.kind === 'cavern' && loc.map && !TOWNS[loc.map]) {
      this.transition(() => new CavernScene(this, { mapId: loc.map, left: loc.x, headRow: loc.headRow, face: loc.face }));
      return;
    }
    this.transition(() => (TOWNS[loc.map] ? new TownScene(this, { mapId: loc.map, x: loc.x }) : new TownScene(this, { mapId: c.lastSage || 'mrmp' })));
  }

  // Remember where the party is (town street or cavern spot) and write every save slot.
  saveHere() {
    const s = this.scenes.find((x) => x.world || x.npcs);
    const h = this.leader?.hero;
    if (!s || !h) return false;
    let loc;
    if (s.world) {
      if (s.world.boss && !s.world.boss.dead) return 'boss';
      loc = { kind: 'cavern', map: s.world.id, x: Math.floor(h.x / TILE), headRow: Math.floor(h.y / TILE), face: h.dir < 0 ? 'left' : 'right' };
    } else loc = { kind: 'town', map: s.mapId, x: Math.max(1, Math.round(h.cx / TILE - 1.5)) };
    for (const l of this.locals) l.character.location = loc;
    return this.save();
  }

  // Saves every knight that came from a save slot (couch knights keep their own).
  save(local) {
    for (const s of this.scenes) s.minimap?.store(); // explored cavern ground goes in the save too
    const one = (l) => (!l || l.saveSlot == null || l.saveSlot < 0 ? false : saveSlot(l.saveSlot, l.character));
    if (local) return one(local);
    let ok = false;
    for (const l of this.locals) ok = one(l) || ok;
    return ok;
  }

  // ------------------------------------------------------------ travel
  // Go to a town or cavern. dest: { kind, map, x (left col / town x), headRow, face }.
  travel(dest) {
    if (!dest || !dest.map) return;
    // Mid-fade a new scene can't start. Don't announce a move that won't happen (the host
    // would send the party one way and go another); a guest following the host waits for
    // the fade to end and then goes.
    if (this.fading) { if (this.coop?.following) this.queuedTravel = dest; return; }
    // Co-op guests ask the host to lead the party instead of leaving on their own.
    if (this.coop && this.coop.onTravel(dest) === false) return;
    if (dest.kind === 'town' || TOWNS[dest.map]) {
      this.transition(() => new TownScene(this, { mapId: dest.map, x: dest.x, face: dest.face, feather: dest.feather }));
    } else {
      this.transition(() => new CavernScene(this, { mapId: dest.map, left: dest.x, headRow: dest.headRow, face: dest.face }));
    }
  }

  // ------------------------------------------------------------ save bits (world flags)
  hasBit(byte, mask) { return this.locals.some((l) => hasBit(l.character, byte, mask)); }
  getByte(byte) { return this.locals.reduce((v, l) => v | getByte(l.character, byte), 0); }
  setBit(byte, mask, fromNet = false) {
    for (const l of this.locals) setBit(l.character, byte, mask);
    if (!fromNet) this.coop?.broadcastBit(byte, mask);
  }
  bossBeaten(mapId) { return this.locals.some((l) => (l.character.bossesBeaten || []).includes(mapId)); }

  // ------------------------------------------------------------ combat hooks
  localByHero(hero) { return this.locals.find((l) => l.hero === hero); }

  heroHitsEnemy(world, hero, enemy) {
    const local = this.localByHero(hero);
    if (!local) return;
    const thrust = hero.attack?.kind === 'thrust';
    const dmg = swordDamage(local.character, thrust);
    const dir = world.map.near(enemy.cx, hero.cx) > hero.cx ? 1 : -1;
    if (this.coop && !this.coop.isHost) { this.coop.reportHit(world, enemy.id, dmg, dir, thrust ? 'thrust' : 'sword'); world.effect('hit', enemy.cx, enemy.cy, { dmg }); enemy.hitFlash = 0.15; return; }
    world.damageEnemy(enemy, dmg, hero.id, dir, thrust ? 'thrust' : 'sword');
  }

  heroHitsBoss(world, hero) {
    const local = this.localByHero(hero);
    if (!local || !world.boss) return;
    const thrust = hero.attack?.kind === 'thrust';
    const dmg = swordDamage(local.character, thrust);
    if (this.coop && !this.coop.isHost) { this.coop.reportBossHit(world, dmg, 'sword', local.character.sword); return; }
    world.boss.damage(dmg, 'sword', world, hero.id, { sword: local.character.sword, hero });
  }
  spellHitsBoss(world, p) {
    if (this.coop && !this.coop.isHost && p.owner) { this.coop.reportBossHit(world, p.dmg, p.kind); return; }
    world.boss.damage(p.dmg, p.kind, world, p.owner, { spell: p.kind, box: p });
  }

  onEnemyKilled(world, enemy, ownerId) {
    const xp = enemy.def.xp || 0;
    // Co-op: every knight in the cavern shares the experience of a kill.
    for (const h of world.heroes) {
      const l = this.localByHero(h);
      if (l && xp) addXp(l.character, xp);
    }
    if (this.coop?.isHost) this.coop.onKill(world, enemy, xp);
  }

  claimPickup(world, hero, k) {
    const local = this.localByHero(hero);
    if (this.coop && !this.coop.isHost) { this.coop.requestPickup(world, k.id); return; }
    k.dead = true;
    if (!local) { this.coop?.grantPickupToRemote(world, hero, k); return; }
    this.applyPickup(world, local, k);
  }

  applyPickup(world, local, k) {
    const c = local.character;
    if (k.kind === 'almas') {
      c.almas = Math.min(65535, c.almas + k.value);
      audio.sfx('spirit_pickup', { vol: 0.5, rate: k.value >= 100 ? 0.8 : k.value >= 10 ? 0.9 : 1.1 });
      world?.effect('text', k.x + 8, k.y, { text: `+${k.value}`, color: '#8fe3ff', life: 0.7 });
    } else if (k.kind === 'gold') {
      c.gold = Math.min(16777215, c.gold + k.value);
      audio.sfx('coin_pickup', { vol: 0.6 });
      world?.effect('text', k.x + 8, k.y, { text: `+${k.value} G`, color: '#f2c85b', life: 0.7 });
    } else if (k.kind === 'potion') {
      this.heal(local, k.potion === 'blue' ? 'full' : 80, world ?? true); // picked up in a cavern: pulse
      world?.effect('text', k.x + 8, k.y, { text: k.potion === 'blue' ? 'Full health!' : '+80', color: '#ff8a8a', life: 0.9 });
    }
  }

  // Potions heal as a pulse: +8 HP per original frame (red: 10 frames = 80 HP).
  // Outside a cavern (no world ticking the pulse) the healing is applied at once.
  heal(local, amount, world) {
    if (!world) { const c = local.character; c.hp = amount === 'full' ? maxHp(c) : Math.min(maxHp(c), c.hp + amount); }
    else local.healPulse += amount === 'full' ? 9999 : amount;
    audio.sfx('potion', { vol: 0.6 });
  }

  // Something in the cavern gave up its contents (chest, wall stash, loose item).
  propOpened(world, hero, prop, contents) {
    const local = hero ? this.localByHero(hero) : this.leader;
    if (prop.flag) this.setBit(prop.flag.byte, prop.flag.mask);
    if (hero) this.coop?.onPropTaken(world, prop);
    if (!contents) return;
    const at = { x: prop.x + prop.w / 2 - 10, y: prop.y, w: 20, h: 20, vx: 0, vy: -200, t: 0, life: 14 };
    // Loot ids: 's' = the host's (or solo) chest, sent in snapshots; 'g' = a guest's own chest,
    // which only that guest sees and collects without asking the host.
    const lid = `${this.coop && !this.coop.isHost ? 'g' : 's'}${prop.id}`;
    if (contents.trap != null) {
      import('./enemies.js').then(({ Enemy, enemyDef }) => {
        const def = enemyDef(this, world.level, contents.trap);
        const drop = { blue_potion: 9, red_potion: 8 }[contents.drop]; // DROP_CODES in enemies.js
        world.enemies.push(new Enemy(def, prop.tx, prop.ty - 2, { id: `trap${prop.id}`, record: drop ? { dropOnDeath: drop } : undefined }));
      });
      this.toast('It was a trap!', '#e0584f');
      return;
    }
    if (contents.gold) { if (local) this.applyPickup(world, local, { kind: 'gold', value: contents.gold, x: at.x, y: at.y }); return; }
    if (contents.almas) { world.pickups.push({ ...at, id: lid, kind: 'almas', value: contents.almas }); return; }
    if (contents.potion) { world.pickups.push({ ...at, id: lid, kind: 'potion', potion: contents.potion }); return; }
    if (contents.item && local) this.giveItem(local, contents.item, world, prop);
    else if (contents.item === undefined && !contents.gold) this.toast('It was empty.', '#bbb');
  }

  giveItem(local, id, world, where) {
    const c = local.character;
    const def = RULES.items[id] || { name: id.replace(/_/g, ' ') };
    if (id === 'key') c.keys++;
    else if (id === 'lions_head_key') c.lionKeys++;
    else if (def.type === 'accessory' || /shoes|cape/.test(id)) { if (!c.accessories.includes(id)) c.accessories.push(id); if (!c.worn) c.worn = id; }
    else if (/crest/.test(id)) { if (!c.crests.includes(id)) c.crests.push(id); }
    else if (RULES.swords[id]) { c.sword = id; }
    else if (RULES.shields[id]) { c.shield = id; c.shieldHp = RULES.shields[id].power; }
    else if (def.type === 'consumable') { if (c.items.length < 5) c.items.push(id); else { this.toast("You can't carry any more.", '#e0584f'); return; } }
    audio.sfx('chest_open', { vol: 0.7 });
    const name = id === 'key' ? 'a Key' : def.name || id;
    this.toast(`You found ${name}!`);
    if (where && world) world.effect('text', where.x + where.w / 2, where.y - 10, { text: def.name || 'Key', color: '#f4ead0', life: 1.4 });
    this.refresh(local);
    this.coop?.onItem?.(id);
  }

  // Damage to a knight (enemies.json mechanics):
  //  - contact while facing the attacker with a shield: (d>>1) >> ((tier+1)>>1), taken by
  //    both HP and shield HP (Japanese: a flat half); otherwise full damage;
  //  - projectiles are blocked outright by a shield when facing them, not swinging and
  //    not on a rope (lower shields only at the height they cover); vertical ones never.
  heroHurt(world, hero, dmg, fromX, source, proj) {
    const local = this.localByHero(hero);
    if (!local || hero.iframes > 0 || !hero.alive) return;
    const c = local.character;
    const facing = (fromX > hero.cx ? 1 : -1) === hero.dir;
    let taken = dmg, shielded = false;
    const tier = shieldTier(c);
    if (source === 'projectile' && proj) {
      const vertical = Math.abs(proj.vy) > Math.abs(proj.vx) * 2;
      const swinging = hero.attack && hero.attack.kind !== 'thrust';
      const py = proj.y + proj.h / 2;
      const crouch = hero.state === 'crouch';
      // Below the Honor Shield a shield covers one row (sub_846F): the chest row standing, the
      // lowest row crouching. Shots at the head or legs get past it.
      const row = Math.floor((hero.feet - py) / TILE); // 0 = feet row, 1 = chest, 2 = head
      const covered = tier >= 4 || (crouch ? row === 0 : row === 1);
      if (tier && facing && !vertical && !swinging && hero.state !== 'climb' && covered) {
        audio.sfx('shield_block', { vol: 0.7 });
        world.effect('clink', proj.x + proj.w / 2, proj.y + proj.h / 2);
        hero.blockT = 0.3;
        return 'blocked';
      }
    } else if (source === 'contact' && tier && facing) {
      shielded = true;
      hero.blockT = 0.3;
      taken = RULES.jp?.flatShieldHalf ? dmg >> 1 : (dmg >> 1) >> ((tier + 1) >> 1);
      c.shieldHp -= taken;
      audio.sfx('shield_block', { vol: 0.6 });
      if (c.shieldHp <= 0) {
        this.toast('Shield broken.', '#e0584f');
        c.shield = null;
        c.shieldHp = 0;
        audio.sfx('shield_break');
      }
    }
    c.hp = Math.max(isTester(c) ? 1 : 0, c.hp - taken);
    local.regenT = 0;
    hero.knock(fromX, source === 'hazard' ? 0.5 : 1, world.map, shielded);
    world.heroHurtThisFrameNext = true;
    // The original plays only the shield clang for a hit taken on the shield (sound 8, not 9).
    if (!shielded) audio.sfx('player_hurt', { vol: 0.8 });
    world.effect('hit', hero.cx, hero.y + 20, { dmg: taken, color: shielded ? '#a8c8ff' : '#ff9a8a' });
    if (c.hp <= 0) this.heroDown(world, local);
    return 'hurt';
  }

  // Hazard tiles: damage per cavern level, once per original frame of contact.
  hazardHit(world, hero) {
    const l = this.localByHero(hero);
    if (!l || hero.iframes > 0) return;
    const dmg = RULES.hazardByLevel[Math.max(0, Math.min(8, world.level - 1))] || 1;
    this.heroHurt(world, hero, dmg, hero.cx - hero.dir * 10, 'hazard');
    hero.iframes = Math.max(FRAME * 2, 0.12);
  }

  // Per-frame upkeep for local knights in a cavern: heal pulses, regeneration, heat.
  upkeep(world, dt) {
    for (const l of this.locals) {
      const c = l.character, h = l.hero;
      if (!h.alive) continue;
      l.tick = (l.tick || 0) + dt;
      while (l.tick >= FRAME) {
        l.tick -= FRAME;
        if (l.healPulse > 0) {
          const add = Math.min(8, l.healPulse);
          c.hp = Math.min(maxHp(c), c.hp + add);
          l.healPulse = c.hp >= maxHp(c) ? 0 : l.healPulse - add;
        }
        // DOS: +2 HP every 16 frames in caverns (none in the Japanese versions).
        if (!RULES.jp?.noRegen && c.hp < maxHp(c) && ++l.regenT >= 16) { l.regenT = 0; c.hp = Math.min(maxHp(c) + 1, c.hp + 2); }
        // Level 7 heat without the Asbestos Cape.
        if (world.level === 7 && !h.stats.heatProof) {
          if (++l.heatT >= RULES.heat.every) {
            l.heatT = 0;
            c.hp = Math.max(isTester(c) ? 1 : 0, c.hp - RULES.heat.dmg);
            this.toast("It's too hot !!", '#ff8a4a');
            world.effect('hit', h.cx, h.y + 10, { dmg: RULES.heat.dmg, color: '#ffb070' });
            if (c.hp <= 0) this.heroDown(world, l);
          }
        } else if (!RULES.heat.global) l.heatT = 0;
      }
    }
  }

  heroDown(world, local) {
    const hero = local.hero;
    const livingAllies = world.heroes.filter((h) => h !== hero && h.alive);
    if ((this.coop || this.locals.length > 1) && livingAllies.length) {
      // Co-op: become a spirit that an ally can rekindle by touch.
      hero.state = 'spirit';
      hero.spiritT = 30;
      hero.iframes = 0;
      this.toast(`${local.character.name} has fallen! Touch their spirit to rekindle it.`, '#8fe3ff');
      this.coop?.onSpirit?.(hero);
      return;
    }
    hero.state = 'dead';
    hero.stateT = 0;
    audio.sfx('player_defeat');
    this.scene.onHeroDefeated?.(local);
  }

  spiritTick(world, hero) {
    if (hero.fairy) return;
    for (const h of world.heroes) {
      if (h === hero || !h.alive) continue;
      if (Math.abs(world.map.near(h.cx, hero.cx) - hero.cx) < 44 && Math.abs(world.map.nearY(h.y, hero.y) - hero.y) < 64) {
        const l = this.localByHero(hero);
        hero.state = 'fall';
        hero.iframes = 2;
        if (l) l.character.hp = Math.ceil(maxHp(l.character) * 0.3);
        world.effect('text', hero.cx, hero.y, { text: 'Rekindled!', color: '#8fe3ff', life: 1.4 });
        audio.sfx('level_up', { vol: 0.6 });
        this.coop?.onRevive(hero);
        return;
      }
    }
    if (hero.spiritT <= 0) {
      const l = this.localByHero(hero);
      if (l) { hero.state = 'dead'; this.scene.onHeroDefeated?.(l); }
    }
  }

  // Death penalties, then wake at the Sage (DOS: always Muralla; Japanese: the last Sage).
  onDefeat() {
    for (const l of this.locals) {
      const c = l.character;
      // In couch co-op a knight still standing escapes the penalty; a spirit has fallen too.
      if (l.hero.state !== 'dead' && l.hero.state !== 'spirit' && this.locals.length > 1) continue;
      c.deaths++;
      c.gold = 0;
      if (RULES.jp) { c.almas = 0; c.xp = Math.floor(c.xp / 2); }
      else { c.almas = Math.floor(c.almas / 2); c.xp = Math.min(65535, c.xp + ((127 - 2 * c.level) & 0xff)); }
      c.hp = maxHp(c);
      c.sabreOil = 0;
      l.hero.state = 'idle';
    }
    // A guest who falls alone pays the penalty but goes back to the party rather than to a
    // Sage on their own (where their next door would drag the host out of the cavern).
    if (this.coop && !this.coop.isHost) {
      this.toast('The Spirits carry you back to your party.', '#8fe3ff');
      this.coop.toHost({ t: 'rejoin' });
      return;
    }
    const c = this.leader.character;
    const town = RULES.jp?.respawnAtLastSage ? c.lastSage || 'mrmp' : 'mrmp';
    const sx = this.data.world?.townExits?.find((t) => t.town === town)?.sageRespawnX;
    // The host's world goes with them, so the whole party retreats to the Sage.
    if (this.coop?.isHost) this.coop.all({ t: 'travel', dest: { kind: 'town', map: town, x: sx } });
    this.transition(() => new TownScene(this, { mapId: town, x: sx, wake: true }), { color: '#000', dur: 0.8 });
  }

  // ------------------------------------------------------------ magic and items
  castSpell(world, hero) {
    const l = this.localByHero(hero);
    if (!l) return;
    const cam = this.scene.lastCam || { x: hero.cx - W / 2, y: hero.y - H / 2 };
    const r = castSpell(world, hero, l.character, this, cam);
    if (r === 'none') { this.toast('No spell selected. Choose one in the inventory.', '#bbb'); return; }
    if (r === 'empty') { audio.sfx('menu_cancel', { vol: 0.4 }); return; }
    if (r?.instant) {
      // Guerra: every monster in view takes 255 once.
      for (const e of world.enemies) {
        if (e.dead || e.hidden) continue;
        const ex = world.map.near(e.cx, cam.x + W / 2), ey = world.map.nearY(e.cy, cam.y + H / 2);
        if (ex > cam.x - 24 && ex < cam.x + W + 24 && ey > cam.y - TILE && ey < cam.y + H) world.damageEnemy(e, r.dmg, hero.id, 1, 'guerra');
      }
      if (world.boss && !world.boss.dead) {
        if (this.coop && !this.coop.isHost) this.coop.reportBossHit(world, r.dmg, 'guerra');
        else world.boss.damage(r.dmg, 'guerra', world, hero.id, { spell: 'guerra' });
      }
    }
    this.coop?.onLocalCast(world, hero);
  }
  sfxFor(id) {
    const map = { espada: 'spell_blade', saeta: 'spell_arrow', fuego: 'spell_fire', lanzar: 'spell_lance', rascar: 'spell_stone', agua: 'spell_water', guerra: 'spell_nova' };
    audio.sfx(map[id] || 'spell_blade');
  }

  // Use a consumable from slot i (inventory, in a cavern).
  useItem(local, i, world) {
    const c = local.character;
    const id = c.items[i];
    if (!id) return false;
    const consume = () => c.items.splice(i, 1);
    switch (id) {
      case 'kenko_potion': consume(); this.heal(local, 80, world); break;
      case 'juuen_fruit': consume(); this.heal(local, 'full', world); break;
      case 'elixir_of_kashi': if (!c.spell) return false; consume(); c.charges[c.spell] = c.maxCharges[c.spell]; audio.sfx('potion'); break;
      case 'chikara_powder': consume(); refillSpells(c); audio.sfx('potion'); break;
      case 'holy_water_of_acero': {
        if (!c.shield) { this.toast('You have no shield.', '#bbb'); return false; }
        consume();
        const max = RULES.shields[c.shield].power;
        c.shieldHp = RULES.jp?.holyWaterFull ? max : Math.min(max, c.shieldHp + RULES.holyWater[shieldTier(c) - 1]);
        audio.sfx('potion');
        break;
      }
      case 'sabre_oil': consume(); c.sabreOil = (c.sabreOil || 0) + 1; this.toast(`Your sword gleams (×${c.sabreOil + 1}).`); audio.sfx('potion'); break;
      case 'magia_stone': if (!world) return false; consume(); world.addMagia?.(local.hero, RULES.jp?.magiaFixed || Math.min(255, (c.level + 1) * 4)); break;
      case 'kioku_feather': {
        if (!world) return false;
        // In co-op only the host can fly home, and the whole party goes (via travel()).
        if (this.coop && !this.coop.isHost) { this.toast('Only the party leader can use the Kioku Feather.', '#bbb'); return false; }
        consume();
        this.travel({ kind: 'town', map: RULES.jp ? c.lastSage || 'mrmp' : 'mrmp', x: null, feather: true }); // not 'wake': that plays the death lines
        break;
      }
      default: return false;
    }
    return true;
  }

  // ------------------------------------------------------------ menus
  openPause(scene) { this.push(new PauseScene(this, scene)); }
  openInventory(scene, local) { this.push(new InventoryScene(this, scene, local)); }
  async openCoop(fromScene, mode) {
    const { CoopLobby } = await import('../scenes/lobby.js');
    this.push(new CoopLobby(this, fromScene, mode));
  }

  toast(msg, color = '#f4ead0') { this.toasts.push({ msg, color, t: 0 }); if (this.toasts.length > 4) this.toasts.shift(); }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.time += dt;
    this.menu ||= new InputState();
    this.menu.set(input.menuFrame());
    for (const l of this.locals) l.input.set(input.frameFor(l.slot, this.locals.length));
    for (const l of this.locals) if (isTester(l.character) && l.character.gold !== TESTER_GOLD) l.character.gold = TESTER_GOLD;
    input.flushTaps();
    if (this.fading) {
      const f = this.fading;
      f.t += dt;
      if (f.phase === 'out' && f.t >= f.dur) {
        const s = f.makeScene();
        if (s) this.replace(s);
        f.phase = 'in';
        f.t = 0;
      } else if (f.phase === 'in' && f.t >= f.dur) {
        this.fading = null;
        const q = this.queuedTravel;
        if (q) { this.queuedTravel = null; this.coop?.follow(q); }
      }
    }
    if (!this.fading || this.fading.phase === 'in') this.scene?.update(dt);
    this.coop?.update(dt);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 3.2);
    for (const l of this.locals) { l.character.playTime += dt; l.input.endFrame(); }
    this.menu.endFrame();
  }

  draw(t) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const top = this.scenes.length - 1;
    // Draw from the last opaque scene upward so overlays sit on what's beneath.
    let start = top;
    while (start > 0 && this.scenes[start].overlay) start--;
    for (let i = start; i <= top; i++) this.scenes[i].draw(t);
    let y = 92;
    for (const toast of this.toasts) {
      const a = Math.min(1, toast.t * 4, (3.2 - toast.t) * 2);
      text(toast.msg, W / 2, y, { size: 18, align: 'center', color: toast.color, alpha: a, shadow: true });
      y += 24;
    }
    this.coop?.drawStatus?.();
    if (this.fading) {
      const f = this.fading;
      fade(f.phase === 'out' ? f.t / f.dur : 1 - f.t / f.dur, f.color);
    }
  }
}

export { SPELLS };
