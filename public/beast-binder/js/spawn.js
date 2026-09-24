"use strict";
// spawn.js — the director: wild packs around the player, Titans in their lairs,
// and the hunters (ranger squads, then whole warbands) that come for you as
// your renown grows.

const Director = {
  packTimer: 0, threatTimer: 80, cullTimer: 0, titanRoar: 0,
  titans: {},          // regionIndex -> live titan unit

  reset() { this.packTimer = 0; this.threatTimer = 80; this.cullTimer = 0; this.titans = {}; },

  rollSpecies(region, rnd, maxTier) {
    let total = 0;
    const w = [];
    for (const sp of SPECIES) {
      let v = region.tiers[sp.tier - 1] || 0;
      if (sp.tier > (maxTier || 5)) v = 0;
      v *= sp.types.some((t) => region.types.indexOf(t) >= 0) ? 6 : 0.45;
      w.push(v); total += v;
    }
    let roll = rnd() * total;
    for (let i = 0; i < SPECIES.length; i++) { roll -= w[i]; if (roll <= 0) return SPECIES[i]; }
    return SPECIES[0];
  },

  levelAt(x, y, region) {
    const T = CONFIG.tile;
    const campD = Math.hypot(x - CAMP.tx * T, y - CAMP.ty * T);
    if (campD < 800) return 1 + (Math.random() < 0.35 ? 1 : 0);
    const n = vnoise(x / 1100, y / 1100, World.seed + 60) * 0.7 + Math.random() * 0.3;
    // the meadow ramps up with distance from camp so the first steps stay gentle
    const ramp = region.id === "meadow" ? clamp((campD - 700) / 1500, 0.1, 1) : 1;
    return Math.max(1, Math.round(lerp(region.lvl[0], region.lvl[1], n * ramp)));
  },

  spawnPack(x, y, opts) {
    opts = opts || {};
    const ri = World.regionIndexAt(x, y), region = REGIONS[ri];
    const rnd = Math.random;
    const T = CONFIG.tile;
    const nearCamp = Math.hypot(x - CAMP.tx * T, y - CAMP.ty * T) < 800;
    const sp = opts.species || this.rollSpecies(region, rnd, nearCamp ? 1 : 5);
    let size = opts.size || Math.round(lerp(region.pack[0], region.pack[1], Math.random() * Math.random() + Math.random() * 0.4));
    // the wilds answer a bigger horde with bigger packs — and now and then a great herd
    let herd = false;
    if (!opts.size) {
      size = Math.round(size * (1 + Math.min(Game.army.length, 120) / (ri === 0 ? 50 : 28)));
      if (!nearCamp && Game.army.length >= 6 && Math.random() < 0.1) { size = Math.round(size * 2.2) + 3; herd = true; }
      size = Math.min(size, 32);
    }
    if (nearCamp) size = Math.min(size, 1 + (Math.random() < 0.4 ? 1 : 0));
    if (sp.tier >= 4) size = Math.max(1, Math.round(size * 0.4));
    else if (sp.tier === 3) size = Math.max(1, Math.round(size * 0.65));
    const level = opts.level || this.levelAt(x, y, region);
    const pack = { members: [] };
    // elites (see AFFIXES): most Alphas past the meadow, the odd pack beast — none until the binder has a pack
    const elites = !nearCamp && Game.stats.bound >= 3;
    for (let i = 0; i < size; i++) {
      const alpha = i === 0 && size >= 3;
      const eliteP = !elites ? 0 : alpha ? (ri === 0 ? 0.3 : 0.55) : opts.hunter ? 0.015 : ri === 0 ? 0.02 : 0.045;
      const affix = Math.random() < eliteP ? AFFIX_IDS[(Math.random() * AFFIX_IDS.length) | 0] : null;
      const u = makeBeast(sp.id, level + (alpha ? 2 : 0) + ((Math.random() * 2) | 0), {
        alpha, stars: alpha && ri >= 2 ? 1 : 0, aggressive: !!opts.aggressive || ri >= 1 || sp.tier >= 3 || alpha, hunter: !!opts.hunter, aggro: !!opts.hunter, affix,
      });
      if (alpha) u.name = (herd ? "Great Alpha " : "Alpha ") + sp.name;
      if (affix) u.name = AFFIXES[affix].name + " " + u.name;
      if (alpha && herd) { u.stars = Math.max(u.stars, 1) + 1; recalcUnit(u); u.hp = u.maxHp; }
      const a = Math.random() * TAU, d = i === 0 ? 0 : 26 + Math.random() * (60 + size * 5);
      const pos = World.findLand(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd, 120) || { x, y };
      if (World.solidAt(pos.x, pos.y, u.crossWater)) continue;
      u.x = pos.x; u.y = pos.y; u.homeX = pos.x; u.homeY = pos.y;
      u.pack = pack; u.shade = opts.shade || null;
      pack.members.push(u);
      Game.hostiles.push(u);
    }
    return pack;
  },

  // the world should already be alive when the player arrives (new game / load)
  seedAround(p) {
    for (let i = 0; i < 40 && Game.hostiles.length < 26 + Game.army.length; i++) {
      const a = Math.random() * TAU, d = 330 + Math.random() * 1100;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x < 80 || y < 80 || x > World.size - 80 || y > World.size - 80) continue;
      if (World.solidAt(x, y, false) || World.siteDist(x, y) < 300) continue;
      let crowded = false;
      for (const h of Game.hostiles) if (dist2(h.x, h.y, x, y) < 200 * 200) { crowded = true; break; }
      if (!crowded) this.spawnPack(x, y);
    }
  },

  update(dt) {
    const p = Game.player;
    if (p.hp <= 0) return;
    // ---- ambient packs
    this.packTimer -= dt;
    if (this.packTimer <= 0) {
      this.packTimer = 0.4;
      let near = 0;
      for (const h of Game.hostiles) if (!h.hunter && dist2(h.x, h.y, p.x, p.y) < 1700 * 1700) near++;
      const want = Math.min(230, 22 + Game.rankIndex * 5 + Math.round(Game.army.length * 0.6));
      // only the local count gates spawning (a distant warband must not leave the land around you empty);
      // the global number is just a safety valve
      if (near < want && Game.hostiles.length < 560) {
        const viewR = Math.hypot(Game.view.x1 - Game.view.x0, Game.view.y1 - Game.view.y0) / 2;
        for (let tries = 0; tries < 6; tries++) {
          // bias spawns toward where the binder is heading so the road ahead is never empty
          const a = (p.moveX || p.moveY) && Math.random() < 0.55 ? Math.atan2(p.moveY, p.moveX) + (Math.random() - 0.5) * 1.6 : Math.random() * TAU;
          const d = viewR + 90 + Math.random() * 520;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (x < 80 || y < 80 || x > World.size - 80 || y > World.size - 80) continue;
          if (World.solidAt(x, y, false) || (World.cellAt(x, y) & F_ROAD)) continue;
          if (World.siteDist(x, y) < 330) continue;
          let crowded = false;
          for (const h of Game.hostiles) if (dist2(h.x, h.y, x, y) < 230 * 230) { crowded = true; break; }
          if (crowded) continue;
          this.spawnPack(x, y);
          break;
        }
      }
    }
    // ---- cull far-away wilds
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 2;
      for (const h of Game.hostiles) if (!h.titan && !h.hunter && !h.dazed && dist2(h.x, h.y, p.x, p.y) > 2500 * 2500) h.removed = true;
    }
    this.updateTitans(dt);
    this.updateThreats(dt);
  },

  // ---------------------------------------------------------------- titans
  updateTitans(dt) {
    const p = Game.player, T = CONFIG.tile;
    for (let ri = 0; ri < REGIONS.length; ri++) {
      const r = REGIONS[ri], lx = r.lair[0] * T, ly = r.lair[1] * T;
      let t = this.titans[ri];
      if (t && (t.removed || t.team === 0)) { t = null; delete this.titans[ri]; }
      const d2p = dist2(p.x, p.y, lx, ly);
      if (!t && d2p < 1250 * 1250 && Game.time >= (Game.titanRespawn[ri] || 0)) {
        t = makeBeast(r.titan, r.titanLvl, { titan: true, aggressive: true, name: r.titanName, regionIndex: ri });
        t.x = lx; t.y = ly; t.homeX = lx; t.homeY = ly; t.roarT = 6;
        this.titans[ri] = t;
        Game.hostiles.push(t);
        const guards = 4 + ri * 3;
        for (let i = 0; i < guards; i += 4) {
          const a = (i / guards) * TAU;
          this.spawnPack(lx + Math.cos(a) * 130, ly + Math.sin(a) * 110, { size: Math.min(4, guards - i) + 1, level: Math.max(1, r.titanLvl - 4), aggressive: true });
        }
      }
      if (!t) continue;
      if (d2p > 2600 * 2600 && !t.dazed) { t.removed = true; delete this.titans[ri]; continue; }
      // announce once the fight actually starts
      if (t.aggro && !t.announced) {
        t.announced = true;
        // a Titan braces for the horde that woke it: the bigger your army, the longer the siege
        const brace = 1 + Math.min(Game.army.length, 120) / 40;
        t.maxHp = Math.round(t.maxHp * brace); t.hp = Math.round(t.hp * brace);
        UI.banner("TITAN AWAKENED", r.titanName + "  ·  Lv " + t.level, "#ff6a5a");
        SFX.play("roar"); FX.addShake(8);
      }
      // the fight is over once the binder is gone (fled, fell, or beaconed home): the Titan settles and mends
      if (t.aggro && !t.dazed && (Game.player.hp <= 0 || dist2(p.x, p.y, t.x, t.y) > 1150 * 1150)) {
        let near = false;
        for (const a of Game.army) if (a.hp > 0 && dist2(a.x, a.y, t.x, t.y) < 800 * 800) { near = true; break; }
        if (!near) { t.aggro = false; t.target = null; t.tAtk = null; t.hp = t.maxHp; }
      }
      if (t.aggro && !t.dazed && t.hp > 0) {
        t.roarT -= dt;
        if (t.roarT <= 0) {
          t.roarT = 11;
          let minions = 0;
          for (const h of Game.hostiles) if (h.summoned === t.uid && h.hp > 0) minions++;
          if (minions < 14 + ri * 3) {
            FX.ring(t.x, t.y, t.r, 260, TYPES[t.sp.types[0]].color, 0.8, 5);
            SFX.play("roar", 0.6);
            const pack = this.spawnPack(t.x + (Math.random() - 0.5) * 200, t.y + (Math.random() - 0.5) * 160, { size: 3 + ri, level: Math.max(1, r.titanLvl - 5), aggressive: true, hunter: true });
            for (const m of pack.members) m.summoned = t.uid;
          }
        }
      }
    }
  },

  activeTitan() {
    for (const k in this.titans) { const t = this.titans[k]; if (t && t.aggro && t.hp > 0 && !t.removed) return t; }
    return null;
  },

  // ---------------------------------------------------------------- hunters
  updateThreats(dt) {
    if (Game.rankIndex < 1) return;
    const p = Game.player, T = CONFIG.tile;
    if (Math.hypot(p.x - CAMP.tx * T, p.y - CAMP.ty * T) < 520) return;   // the camp is safe
    if (this.activeTitan()) return;
    let hunters = 0;
    for (const h of Game.hostiles) if (h.hunter && !h.summoned && h.hp > 0 && !h.dazed) hunters++;
    if (hunters > 0) return;
    this.threatTimer -= dt;
    if (this.threatTimer > 0) return;
    const rank = Game.rankIndex;
    this.threatTimer = 95 - Math.min(35, rank * 3) + Math.random() * 25;
    const a = Math.random() * TAU;
    let pos = null;
    for (let i = 0; i < 12 && !pos; i++) {
      const aa = a + i * 0.5, d = 900;
      const x = p.x + Math.cos(aa) * d, y = p.y + Math.sin(aa) * d;
      if (x > 100 && y > 100 && x < World.size - 100 && y < World.size - 100 && !World.solidAt(x, y, false)) pos = { x, y };
    }
    if (!pos) { this.threatTimer = 10; return; }
    const warband = rank >= 4 && Math.random() < 0.6;
    const endless = Game.victory ? 1.5 : 1;
    if (warband) {
      const n = Math.min(240, Math.round((6 + rank * 3 + Game.army.length * 0.7) * endless));
      const lvl = Math.max(2, Math.round(Game.avgArmyLevel() * 0.95));
      for (let i = 0; i < n; i += 6) {
        this.spawnPack(pos.x + (Math.random() - 0.5) * 220, pos.y + (Math.random() - 0.5) * 220, { size: Math.min(6, n - i), level: lvl, hunter: true, aggressive: true, shade: "#ff2a3a" });
      }
      this.spawnRangers(pos, 1 + (rank / 4 | 0), rank, ["brute"]);
      UI.banner("WARBAND SIGHTED", n + " war-beasts march on you", "#ff5a5a");
    } else {
      const n = Math.min(22, Math.round((2 + rank * 1.3) * endless));
      const kinds = ["striker", "rifleman", "striker", "rifleman"];
      if (rank >= 2) kinds.push("grenadier");
      if (rank >= 3) kinds.push("brute");
      this.spawnRangers(pos, n, rank, kinds);
      UI.banner("RANGERS INBOUND", n + " hunters are tracking your horde", "#ffb03a");
    }
    SFX.play("warn");
  },

  spawnRangers(pos, n, rank, kinds) {
    for (let i = 0; i < n; i++) {
      const u = makeRanger(kinds[(Math.random() * kinds.length) | 0], rank);
      const spot = World.findLand(pos.x + (Math.random() - 0.5) * 160, pos.y + (Math.random() - 0.5) * 160, Math.random, 160) || pos;
      u.x = spot.x; u.y = spot.y; u.homeX = u.x; u.homeY = u.y;
      Game.hostiles.push(u);
    }
  },
};
