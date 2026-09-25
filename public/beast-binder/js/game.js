"use strict";
// game.js — state, progression, camera, the frame loop and rendering.

const SAVE_KEY = "beastbinder.save.v2";

// The planets of the poaching run, in order. Past the list they are generated.
const PLANETS = [
  { name: "Verdance", hue: 0 }, { name: "Kharos IV", hue: 150 }, { name: "Nyx-9", hue: 255 },
  { name: "Ossuary Prime", hue: 40 }, { name: "Halcyon Drift", hue: 305 }, { name: "Thule Gamma", hue: 200 },
];
// each world has its own map names; the first keeps the ones in REGIONS
const REGION_NAMES = [null,
  ["Amethyst Steppe", "Rustwater Fens", "Ochre Wastes", "Pale Spires", "The Kiln", "Null Hollow"],
  ["Gloomgrass Flats", "Inkmere", "The Salt Pans", "Glasswind Heights", "Emberfields", "The Quiet Dark"]];
const REGION_NAMES_0 = REGIONS.map((r) => r.name);
function nameRegions(planet) { const set = REGION_NAMES[planet % REGION_NAMES.length]; REGIONS.forEach((r, i) => { r.name = set ? set[i] : REGION_NAMES_0[i]; }); }
function planetInfo(i) { return PLANETS[i] || { name: "Uncharted-" + (i + 1), hue: (i * 137) % 360 }; }

const Game = {
  state: "title",          // title | play | panel | boon | dead | cut (rocket cutscene) | base (the hangar)
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  time: 0, lastTs: 0, fps: 60,
  cam: { x: 0, y: 0 }, zoom: 1.4, userZoom: 1, view: { x0: 0, y0: 0, x1: 0, y1: 0 },
  player: null, army: [], reserve: [], hostiles: [], projectiles: [], netMarks: [],
  renown: 0, essence: 0, rankIndex: 0, upgrades: {}, seen: {}, sighted: {},
  titansDefeated: {}, titanRespawn: {}, victory: false,
  stats: { bound: 0, defeated: 0, fused: 0, deaths: 0 },
  settings: { muted: false, autoFuse: true, autoFill: true },
  hornT: 0, chargeT: 0, rally: { x: 0, y: 0 }, formationSpread: 1,
  deadT: 0, saveT: 10, lastRegion: -1, firstFrame: true,
  timeScale: 1,            // >1 only from tools/playtest.mjs, to fast-forward a bot run
  ambient: [],
  zones: [], herdDx: 0, herdDy: 0, herdIdle: 0,
  // what survives the trip between planets
  meta: { planet: 0, credits: 0, materials: 0, forge: {}, ship: {}, hybrids: {}, crew: 0, cleared: 0 },

  // Binder level / boons / frenzy / gems — the moment-to-moment reward loops
  binderLevel: 1, binderXp: 0, boons: {}, pendingBoons: 0, frenzy: 0, frenzyT: 0, frenzyBest: 0, gems: [],
  // horde stance, elemental resonance of the marching horde, and bullet-time after a perfect dodge
  stanceId: "swarm", resonance: {}, slowT: 0,

  upg(id) { return this.upgrades[id] || 0; },
  stance() { return STANCES[this.stanceId] || STANCES.swarm; },
  // the effect size of a resonance (0 when the horde has not got it)
  res(id) { const l = this.resonance[id] || 0; return l ? RES_BY_ID[id].v[l - 1] : 0; },
  calcResonance() {
    const n = this.army.length, before = this.resonance, out = {};
    if (n >= 2) {
      for (const R of RESONANCE) {
        let c = 0;
        for (const u of this.army) if (u.sp.types.some((t) => R.types.indexOf(t) >= 0)) c++;
        const l = c >= 4 && c >= n * 0.5 ? 2 : c >= 2 && c >= n * 0.25 ? 1 : 0;
        if (l) out[R.id] = l;
      }
    }
    this.resonance = out;
    if (this.state === "play" && this.time > 1) {
      for (const id in out) if (out[id] > (before[id] || 0)) {
        const R = RES_BY_ID[id];
        UI.toast("Resonance " + (out[id] === 2 ? "II" : "I") + " — " + R.name + ": " + R.desc(R.v[out[id] - 1]));
        SFX.play("boon", 0.5);
      }
    }
  },
  setStance(id) {
    if (!STANCES[id] || id === this.stanceId) return;
    this.stanceId = id;
    const S = STANCES[id], p = this.player;
    FX.ring(p.x, p.y, id === "guard" ? 200 : 30, id === "guard" ? 40 : 260, S.color, 0.5, 4);
    for (const u of this.army) { u.retarget = 0; u.arrived = false; if (id === "guard") u.target = null; }
    UI.toast("Stance: " + S.name.toUpperCase() + " — " + S.desc);
    SFX.play("ui"); UI.dirtyHud = true;
  },
  forge(id) { return this.meta.forge[id] || 0; },
  shipUpg(id) { return this.meta.ship[id] || 0; },
  planet() { return planetInfo(this.meta.planet); },
  planetMult() { return 1 + 0.8 * this.meta.planet; },
  // what the Bindframe can walk through: 1 water, 2 rock ridges too, 3 the deep chasm too
  playerPass() { const t = this.mechTier(); return t >= 4 ? 3 : t >= 3 ? 2 : t >= 2 ? 1 : 0; },
  cores() { let n = 0; for (let i = 0; i < REGIONS.length; i++) if (this.titansDefeated[i]) n++; return n; },
  fuelled() { return this.cores() >= REGIONS.length; },
  rocketPos() { return { x: CAMP.tx * CONFIG.tile + 10, y: CAMP.ty * CONFIG.tile - 120 }; },
  rocketAway() { return this.state === "cut" || this.state === "base"; },
  atCamp() { const T = CONFIG.tile, p = this.player; return dist2(p.x, p.y, CAMP.tx * T, CAMP.ty * T) < 300 * 300; },
  nearRocket() { const r = this.rocketPos(), p = this.player; return dist2(p.x, p.y, r.x, r.y + 30) < 130 * 130; },
  boon(id) { return this.boons[id] || 0; },
  mechTier() { return Math.min(MECH_TIERS.length - 1, this.cores()); },
  rankLimit() { return CONFIG.rankCapAtCores[Math.min(this.cores(), CONFIG.rankCapAtCores.length - 1)]; },
  rankLocked() { const n = CONFIG.ranks[this.rankIndex + 1]; return !!n && this.rankIndex >= this.rankLimit() && this.renown >= n.renown; },
  armyCap() { return CONFIG.ranks[this.rankIndex].cap + 2 * this.upg("command") + 3 * this.boon("warlord") + this.meta.crew; },
  binderXpNeed(l) { return Math.round(30 + l * 22 + l * l * 3); },
  frenzyMult() { return 1 + Math.min(this.frenzy, 100) / 100; },
  // the higher the frenzy, the shorter the window to keep it alive
  frenzyWindow() { return Math.max(1.6, 4 - this.frenzy / 50) + 1.5 * this.boon("combo"); },
  boonCount() { let n = 0; for (const k in this.boons) n += this.boons[k]; return n; },
  // the wilds rise to meet a Binder who keeps getting stronger
  threat() { return this.boonCount() * 0.014 + this.mechTier() * 0.1; },

  addXp(n) {
    this.binderXp += n * (1 + 0.15 * this.boon("scholar")) * (1 + this.res("normal"));
    while (this.binderXp >= this.binderXpNeed(this.binderLevel)) {
      this.binderXp -= this.binderXpNeed(this.binderLevel);
      this.binderLevel++; this.pendingBoons++;
      const p = this.player;
      this.recalcPlayer(); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
      FX.ring(p.x, p.y, 10, 180, "#9dffb0", 0.7, 5); FX.burst(p.x, p.y - 30, "#9dffb0", 24, 220, 0.8, 4);
      FX.text(p.x, p.y - Mech.height(this.mechTier()) - 26, "LEVEL " + this.binderLevel + "!", "#9dffb0", 1.6, 20);
      SFX.play("level");
    }
    UI.dirtyHud = true;
  },

  // every kill or bind feeds the Frenzy: a decaying combo that multiplies XP and essence
  onKill(x, y) {
    this.frenzy++; this.frenzyT = this.frenzyWindow();
    if (this.frenzy > this.frenzyBest) this.frenzyBest = this.frenzy;
    const marks = { 10: "RAMPAGE!", 25: "STAMPEDE!", 50: "ONSLAUGHT!", 100: "CATACLYSM!", 200: "EXTINCTION EVENT!" };
    if (marks[this.frenzy]) {
      const p = this.player;
      FX.text(p.x, p.y - Mech.height(this.mechTier()) - 44, marks[this.frenzy] + "  ×" + this.frenzyMult().toFixed(1), "#ff8a3a", 1.8, 22);
      FX.ring(p.x, p.y, 20, 260, "#ff8a3a", 0.6, 5); FX.addShake(4); SFX.play("rank", 0.6, 1.4);
    }
  },

  dropGems(x, y, value) {
    value = Math.round(value * (1 + 0.2 * this.boon("greed")) * this.frenzyMult() * (1 + this.res("normal")));
    if (value <= 0) return;
    if (this.gems.length > 260 || !this.onScreen(x, y)) { this.essence += value; UI.dirtyHud = true; return; }
    const n = value >= 40 ? 3 : value >= 8 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 60 + Math.random() * 110;
      this.gems.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, v: Math.ceil(value / n), t: 0, big: value / n >= 25 });
    }
  },

  updateGems(dt) {
    const p = this.player, pull = (150 + p.r * 4) * (1 + 0.3 * this.boon("magnet"));
    let w = 0;
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      g.t += dt;
      const dx = p.x - g.x, dy = p.y - 16 - g.y, d = Math.hypot(dx, dy) || 1;
      if (g.t > 0.35 && (d < pull || g.homing || g.t > 9)) {
        g.homing = true;
        const sp = 260 + g.t * 500;
        g.vx = (dx / d) * sp; g.vy = (dy / d) * sp;
      } else { g.vx *= 1 - dt * 4; g.vy *= 1 - dt * 4; }
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.homing && d < 22 + p.r) {
        this.essence += g.v; UI.dirtyHud = true;
        this.gemChain = (this.time - (this.gemT || 0) < 0.4) ? Math.min(14, (this.gemChain || 0) + 1) : 0; this.gemT = this.time;
        SFX.play("gem", 0.6, 1 + this.gemChain * 0.07);
        continue;
      }
      this.gems[w++] = g;
    }
    this.gems.length = w;
  },
  activeCount() { return this.army.length; },
  rank() { return CONFIG.ranks[this.rankIndex]; },
  avgArmyLevel() { if (!this.army.length) return 1; let s = 0; for (const u of this.army) s += u.level; return s / this.army.length; },

  // ---------------------------------------------------------------- boot
  init() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    // If the browser runs short of memory it can throw away every canvas backing store: the cached
    // ground chunks and sprite surfaces all come back blank, so the world looks like it vanished.
    // Chrome fires these events on the 2D context; take them as "repaint everything from scratch".
    // save()/restore() are counted so the entity loop can unwind an entity that leaked a save (and so a
    // stray restore can never pop past the frame's own state).
    const cv = this.ctx, _save = cv.save.bind(cv), _restore = cv.restore.bind(cv);
    this._depth = 0;
    cv.save = () => { this._depth++; _save(); };
    cv.restore = () => { if (this._depth > 0) { this._depth--; _restore(); } };
    this.canvas.addEventListener("contextlost", (e) => { e.preventDefault(); });
    this.canvas.addEventListener("contextrestored", () => this.dropCaches("the canvas was restored"));
    Input.init(this.canvas);
    UI.init();
    Bestiary.init();
    if (Input.isMobile()) Input.enableTouch();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.loadSettings();
    this.newWorld();
    this.state = "title";
    UI.showTitle(this.hasSave());
    requestAnimationFrame((ts) => this.frame(ts));
  },

  resize() {
    // a phone's canvas is repainted at 1.5x at most: pixel art stays crisp and the fill cost stays sane
    this.dpr = Math.min(Input.touch ? 1.5 : 2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + "px"; this.canvas.style.height = this.H + "px";
    if (UI.el.hud) UI.layoutPad();
  },

  // a fresh planet. Everything earned on the last one is gone except Game.meta and whoever rode the rocket.
  newWorld() {
    const seed = 20260919 + this.meta.planet * 7919;
    this.seed = seed;
    World.init(seed, this.planet().hue);
    nameRegions(this.meta.planet);
    this.zones = []; this.herdDx = 0; this.herdDy = 0; this.herdIdle = 0;
    this.player = createPlayer();
    this.army = []; this.reserve = []; this.hostiles = []; this.projectiles = []; this.netMarks = [];
    this.renown = 0; this.essence = 0; this.rankIndex = 0; this.upgrades = {}; this.seen = {}; this.sighted = {};
    this.titansDefeated = {}; this.titanRespawn = {}; this.victory = false;
    this.stats = { bound: 0, defeated: 0, fused: 0, deaths: 0 };
    this.binderLevel = 1; this.binderXp = 0; this.boons = {}; this.pendingBoons = 0; this.frenzy = 0; this.frenzyT = 0; this.frenzyBest = 0; this.gems = [];
    this.recallAt = 0; this.recallFrom = null;
    this.resonance = {}; this.slowT = 0;
    this.hornT = 0; this.chargeT = 0; this.time = 0; this.lastRegion = -1; this.lastBindT = -9; this.bindCombo = 0;
    Director.reset(); FX.reset();
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.firstFrame = true;
  },

  startNew() {
    for (const id in this.meta.hybrids) delete SPECIES_BY_ID[id];
    this.meta = { planet: 0, credits: 0, materials: 0, forge: {}, ship: {}, hybrids: {}, crew: 0, cleared: 0 };
    this.newWorld();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
    this.begin();
    Voyage.startLanding(true);
  },

  continueGame() {
    const ok = this.load();
    if (!ok) this.newWorld();
    this.begin();
    if (ok === "base") Base.open();
  },

  // the rocket has landed somewhere new: keep the crew and the meta, reset the rest
  nextPlanet(crew) {
    this.meta.planet++; this.meta.cleared++; this.meta.crew = crew.length;
    this.newWorld();
    const p = this.player;
    for (const u of crew) { u.down = 0; u.target = null; u.benchedByPlayer = false; u.x = p.x; u.y = p.y; recalcUnit(u); u.hp = u.maxHp; this.army.push(u); this.seen[u.sp.id] = true; }
    this.essence = 150 * this.shipUpg("stash");
    this.begin();
    this.save();
    Voyage.startLanding(false);
  },

  begin() {
    this.state = "play";
    this.recalcPlayer(); this.player.hp = this.player.maxHp;
    this.afterRosterChange();
    Director.seedAround(this.player);
    UI.hideTitle(); UI.refreshAll();
  },

  // ---------------------------------------------------------------- progression
  recalcPlayer() {
    const p = this.player, C = CONFIG.player;
    const ratio = p.hp / p.maxHp;
    const M = CONFIG.mech[this.mechTier()];
    p.maxHp = Math.round((C.baseHp + C.hpPerRank * this.rankIndex + 6 * (this.binderLevel - 1)) * M.hp * (1 + 0.15 * this.boon("bulwark")) * (1 + 0.1 * this.forge("plating")));
    p.hp = Math.max(1, Math.round(p.maxHp * ratio));
    p.r = M.radius;
  },

  addRenown(n, quiet) {
    this.renown += Math.round(n * (1 + 0.06 * this.boon("fame")));
    const ranks = CONFIG.ranks;
    let up = false;
    const lockedBefore = this.rankLocked();
    const limit = Math.min(ranks.length - 1, this.rankLimit());
    while (this.rankIndex < limit && this.renown >= ranks[this.rankIndex + 1].renown) { this.rankIndex++; up = true; }
    if (up) {
      const r = this.rank(), p = this.player;
      this.recalcPlayer(); p.hp = p.maxHp;
      if (!quiet) {
        UI.banner("RANK UP — " + r.name.toUpperCase(), "Your horde can now hold " + this.armyCap() + " beasts", "#7be0ff");
        SFX.play("rank");
        FX.ring(p.x, p.y, 10, 320, "#7be0ff", 1, 5);
      }
      this.afterRosterChange();
    }
    if (!quiet && !lockedBefore && this.rankLocked()) UI.toast("Your frame can command no more beasts — fell a Titan and forge its core into a bigger one");
    UI.dirtyHud = true;
  },

  // direct essence (releases, refunds). Combat rewards arrive as gems via dropGems().
  addEssence(n) { this.essence += n; UI.dirtyHud = true; },

  shareXp(amount) {
    amount *= (1 + (this.frenzyMult() - 1) * 0.5) * (1 + 0.15 * this.boon("scholar")) * (1 + this.res("normal"));
    const n = this.army.length;
    if (!n) return;
    const share = amount / (1 + n * 0.05), cap = levelCap();
    let shown = 0;
    for (const u of this.army) {
      if (u.down || u.level >= cap) continue;
      u.xp += share;
      let leveled = false;
      while (u.xp >= xpNeed(u.level) && u.level < cap) { u.xp -= xpNeed(u.level); u.level++; leveled = true; }
      if (leveled) {
        recalcUnit(u); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
        if (shown++ < 3 && this.onScreen(u.x, u.y)) { FX.text(u.x, u.y - u.r * 2.4 - 14, "Lv " + u.level, "#9dffb0", 1, 12); FX.burst(u.x, u.y - u.r, "#9dffb0", 6, 80, 0.5, 3); }
        UI.dirtyArmy = true;
      }
    }
    if (shown) SFX.play("level");
  },

  buyUpgrade(id) {
    const def = CONFIG.upgrades.find((u) => u.id === id), lvl = this.upg(id);
    if (!def || lvl >= def.max) return false;
    // upgrades are fitted in the ship's workshop, not in the field
    if (!this.atCamp()) { UI.toast("Upgrades are fitted at your ship — return to camp"); SFX.play("fail"); return false; }
    const cost = Math.round(def.base * Math.pow(def.grow, lvl));
    if (this.essence < cost) { SFX.play("fail"); return false; }
    this.essence -= cost; this.upgrades[id] = lvl + 1;
    for (const u of this.army) recalcUnit(u);
    for (const u of this.reserve) recalcUnit(u);
    SFX.play("buy");
    this.afterRosterChange(); this.save();
    return true;
  },
  // three boons to choose from, weighted, never one that is already maxed
  rollBoons() {
    const pool = CONFIG.boons.filter((b) => this.boon(b.id) < b.max);
    const out = [];
    while (out.length < 3 && pool.length) {
      let total = 0; for (const b of pool) total += b.w;
      let r = Math.random() * total, pick = pool[0];
      for (const b of pool) { r -= b.w; if (r <= 0) { pick = b; break; } }
      out.push(pick); pool.splice(pool.indexOf(pick), 1);
    }
    while (out.length < 3) out.push({ id: "_essence", name: "Essence Cache", desc: "+" + (60 + this.binderLevel * 10) + " essence", rarity: "common", max: 1 });
    return out;
  },
  takeBoon(b) {
    if (b.id === "_essence") this.essence += 60 + this.binderLevel * 10;
    else this.boons[b.id] = this.boon(b.id) + 1;
    this.pendingBoons = Math.max(0, this.pendingBoons - 1);
    this.recalcPlayer();
    if (b.id === "warlord") this.afterRosterChange();
    SFX.play("buy"); this.save();
  },
  upgradeCost(id) { const def = CONFIG.upgrades.find((u) => u.id === id); return Math.round(def.base * Math.pow(def.grow, this.upg(id))); },

  onTitanDefeated(t) {
    const ri = t.regionIndex;
    const first = !this.titansDefeated[ri];
    this.titansDefeated[ri] = (this.titansDefeated[ri] || 0) + 1;
    this.titanRespawn[ri] = this.time + 480;
    SFX.play("victory");
    if (first) {
      // its core is what the rocket runs on
      const n = this.cores(), p = this.player;
      UI.banner("TITAN CORE SEIZED  " + n + "/" + REGIONS.length, this.fuelled() ? "The rocket is fuelled — get back to your ship. And net " + t.name + " first!" : "Net " + t.name + " before it recovers — a Titan sells for a fortune", "#ffd84a");
      FX.beam(t.x, t.y - t.r, p.x, p.y - 30, "#ffd84a", 1.2, 8); FX.pillar(t.x, t.y, t.r, "#ffd84a", 0.9); SFX.play("core");
      // the core is forged straight into the Bindframe — a bigger frame, and with it the right to a bigger horde
      const mech = Math.max(1, this.mechTier()), M = MECH_TIERS[mech], capBefore = this.armyCap();
      this.recalcPlayer(); p.hp = p.maxHp; p.invuln = Math.max(p.invuln, 1.5);
      this.addRenown(0, true);
      for (let i = 0; i < 3; i++) FX.ring(p.x, p.y, 10, 260 + i * 120, M.accent, 0.8 + i * 0.25, 6);
      FX.burst(p.x, p.y - 40, M.accent, 60, 380, 1.2, 5); FX.burst(p.x, p.y - 40, "#ffffff", 30, 260, 0.9, 4);
      FX.addShake(12); SFX.play("bigHit");
      UI.banner("CORE " + n + "/" + REGIONS.length + " — BINDFRAME FORGED: " + M.name.toUpperCase(), M.unlock + (this.armyCap() > capBefore ? " · horde of " + this.armyCap() : " · higher ranks unlocked") + (this.fuelled() ? " · the rocket is fuelled!" : " · net " + t.name + "!"), M.accent);
      if (this.fuelled()) this.victory = true;
    } else UI.banner("TITAN FELLED", "Bind " + t.name + " with your net before it recovers!", "#ffd84a");
    this.save();
  },

  // ---------------------------------------------------------------- roster
  toReserve(u) {
    u.down = 0; u.hp = u.maxHp; u.target = null;
    this.reserve.push(u);
    if (this.reserve.length > CONFIG.reserveMax) {
      // the Den is full: the weakest beast is released for essence
      let wi = 0;
      for (let i = 1; i < this.reserve.length; i++) if (!this.reserve[i].titan && unitPower(this.reserve[i]) < unitPower(this.reserve[wi])) wi = i;
      const w = this.reserve.splice(wi, 1)[0];
      this.addEssence(5 + w.level * 2);
    }
  },

  deploy(u) {
    const i = this.reserve.indexOf(u);
    if (i < 0 || this.army.length >= this.armyCap()) return false;
    this.reserve.splice(i, 1);
    const p = this.player, a = Math.random() * TAU;
    u.x = p.x + Math.cos(a) * 60; u.y = p.y + Math.sin(a) * 50; u.spawnT = 0.5; u.down = 0; u.hp = u.maxHp; u.target = null;
    this.army.push(u);
    return true;
  },

  bench(u) {
    const i = this.army.indexOf(u);
    if (i < 0) return;
    this.army.splice(i, 1);
    this.toReserve(u);
  },

  autoFuse() {
    let fusedAny = false;
    for (let guard = 0; guard < 200; guard++) {
      const groups = {};
      for (const u of this.army.concat(this.reserve)) {
        if (u.titan || u.stars >= 5) continue;
        const k = u.sp.id + ":" + u.stars;
        (groups[k] = groups[k] || []).push(u);
      }
      let did = false;
      for (const k in groups) {
        const g = groups[k];
        if (g.length < 3) continue;
        // keep the most experienced one (preferring a beast already marching)
        g.sort((a, b) => (b.level - a.level) || (this.army.indexOf(b) >= 0) - (this.army.indexOf(a) >= 0));
        const keep = g[0], eat = [g[g.length - 1], g[g.length - 2]];
        for (const e of eat) {
          let i = this.army.indexOf(e); if (i >= 0) this.army.splice(i, 1);
          i = this.reserve.indexOf(e); if (i >= 0) this.reserve.splice(i, 1);
          if (this.onScreen(e.x, e.y) && this.army.indexOf(keep) >= 0) FX.beam(e.x, e.y - e.r, keep.x, keep.y - keep.r, "#ffd84a", 0.5);
        }
        keep.stars++; keep.level = Math.min(levelCap() + 5, keep.level + 1);
        recalcUnit(keep); keep.hp = keep.maxHp; keep.down = 0;
        this.stats.fused++;
        if (this.army.indexOf(keep) >= 0) {
          FX.ring(keep.x, keep.y, 8, 90, "#ffd84a", 0.7, 4); FX.burst(keep.x, keep.y - keep.r, "#ffd84a", 20, 160, 0.8, 4);
          FX.text(keep.x, keep.y - keep.r * 2.4 - 20, keep.sp.name + " fused to " + "★".repeat(keep.stars) + "!", "#ffd84a", 1.6, 14);
        } else UI.toast(keep.sp.name + " fused to " + "★".repeat(keep.stars) + " in the Den");
        SFX.play("fuse");
        did = true; fusedAny = true;
        break;
      }
      if (!did) break;
    }
    return fusedAny;
  },

  afterRosterChange() {
    if (this.settings.autoFuse) this.autoFuse();
    if (this.settings.autoFill) {
      // respect manual benching: only auto-deploy beasts the player did not send away
      while (this.army.length < this.armyCap()) {
        let best = null;
        for (const u of this.reserve) if (!u.benchedByPlayer && (!best || unitPower(u) > unitPower(best))) best = u;
        if (!best || !this.deploy(best)) break;
      }
    }
    this.calcResonance();
    // formation slots: small beasts inside, giants on the rim
    const order = this.army.slice().sort((a, b) => a.r - b.r);
    for (let i = 0; i < order.length; i++) order[i].slot = i;
    let sum = 0; for (const u of this.army) sum += u.r;
    this.formationSpread = this.army.length ? clamp(sum / this.army.length / 10, 1, 2.6) : 1;
    UI.dirtyArmy = true; UI.dirtyHud = true;
  },

  // ---------------------------------------------------------------- actions
  onKey(code) {
    SFX.unlock();
    if (this.state === "title") {
      if (code === "Enter" || code === "Space") { if (this.hasSave()) this.continueGame(); else this.startNew(); }
      return;
    }
    if (this.state === "boon") { const i = ["Digit1", "Digit2", "Digit3"].indexOf(code); if (i >= 0) UI.pickBoon(i); return; }
    if (this.state === "cut") { if (code === "Enter" || code === "Space" || code === "Escape") Voyage.skip(); return; }
    if (this.state === "base") { if (code === "Escape") Base.dismiss(); return; }
    if (code === "Escape" || code === "KeyP") { UI.togglePanel(UI.openPanel ? UI.openPanel : "pause"); return; }
    if (code === "Tab" || code === "KeyM") { UI.togglePanel("horde"); return; }
    if (code === "KeyU" || code === "KeyB") { UI.togglePanel("upgrades"); return; }
    if (this.state !== "play") return;
    const p = this.player;
    // Q / E strafe (held, read in Input.moveVec); 1 · 2 · 3 set the horde's stance
    const st = { Digit1: "swarm", Digit2: "guard", Digit3: "hunt", Numpad1: "swarm", Numpad2: "guard", Numpad3: "hunt" }[code];
    if (st) { this.setStance(st); return; }
    if (code === "Stance") { const ids = Object.keys(STANCES); this.setStance(ids[(ids.indexOf(this.stanceId) + 1) % ids.length]); return; }
    if (code === "Net" || code === "Space") PlayerCtl.net(p);
    else if (code === "ShiftLeft" || code === "ShiftRight") PlayerCtl.dash(p);
    else if (code === "KeyC" || code === "KeyX") PlayerCtl.stomp(p);
    else if (code === "KeyG") this.charge();
    else if (code === "KeyR") this.recall();
    else if (code === "KeyF") this.horn();
    else if (code === "Enter" || code === "KeyL") this.tryLaunch();
    else if (code === "KeyH") this.recallToShip();
  },

  // the ship's beacon yanks the binder and the horde home. An emergency exit and a shopping trip — on a long cooldown.
  recallWait() { return Math.max(0, Math.ceil((this.recallAt || 0) - this.time)); },
  recallToShip() {
    if (this.state !== "play") return false;
    const p = this.player;
    if (this.atCamp()) {
      // the beacon is a round trip: from the ship it throws you back to where it caught you
      const b = this.recallFrom;
      if (!b) { UI.toast("You are already at your ship"); return false; }
      this.recallFrom = null;
      FX.pillar(p.x, p.y, 40, "#7dffb0", 0.6); SFX.play("warp");
      p.x = b.x; p.y = b.y; p.invuln = 2; this.cam.x = p.x; this.cam.y = p.y;
      for (const u of this.army) { u.x = p.x + (Math.random() - 0.5) * 160; u.y = p.y + (Math.random() - 0.5) * 120; u.target = null; }
      FX.pillar(p.x, p.y, 40, "#7dffb0", 0.6); FX.ring(p.x, p.y, 10, 200, "#7dffb0", 0.6, 4);
      UI.toast("The beacon throws you back to the hunt");
      return true;
    }
    const wait = this.recallWait();
    if (wait > 0) { UI.toast("The recall beacon recharges in " + wait + "s"); SFX.play("fail"); return false; }
    if (Director.activeTitan()) { UI.toast("The beacon cannot lock on this close to a Titan"); SFX.play("fail"); return false; }
    this.recallAt = this.time + 200; this.recallFrom = { x: p.x, y: p.y };
    FX.pillar(p.x, p.y, 40, "#7dffb0", 0.6); FX.ring(p.x, p.y, 200, 10, "#7dffb0", 0.5, 4); SFX.play("warp");
    this.respawn();
    FX.pillar(p.x, p.y, 40, "#7dffb0", 0.6); FX.ring(p.x, p.y, 10, 200, "#7dffb0", 0.6, 4);
    UI.toast("The ship's beacon pulls you home — press H here to be thrown back");
    return true;
  },

  tryLaunch() {
    if (this.state !== "play" || !this.nearRocket()) return;
    if (!this.fuelled()) { UI.toast("The rocket needs " + (REGIONS.length - this.cores()) + " more Titan core(s) before it can fly"); SFX.play("fail"); return; }
    Voyage.startLaunch();
  },

  charge() {
    const p = this.player;
    if (!this.army.length) { UI.toast("You have no beasts to command yet"); return; }
    if (p.chargeCd > 0) return;
    let tx = p.aimX, ty = p.aimY;
    if (Input.touch && Input.aim.id === null) { tx = p.x + Math.cos(p.aim) * 320; ty = p.y + Math.sin(p.aim) * 320; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, 620);
    this.rally.x = p.x + (dx / d) * m; this.rally.y = p.y + (dy / d) * m;
    this.chargeT = CONFIG.player.chargeTime;
    FX.ring(this.rally.x, this.rally.y, 120, 20, "#ffb03a", 0.5, 4);
    SFX.play("charge");
    for (const u of this.army) { u.retarget = 0; u.arrived = false; }
  },

  recall() {
    if (this.chargeT > 0) { this.chargeT = 0; SFX.play("ui"); }
    for (const u of this.army) { u.target = null; u.retarget = 0.8; u.arrived = false; }
    FX.ring(this.player.x, this.player.y, 160, 30, "#5ad0ff", 0.4, 3);
  },

  horn() {
    const p = this.player;
    if (p.hornCd > 0) return;
    if (!this.army.length) { UI.toast("The horn calls, but no horde answers"); return; }
    p.hornCd = CONFIG.player.hornCd * Math.pow(0.85, this.boon("horn")); this.hornT = CONFIG.player.hornTime + 2 * this.boon("horn");
    p.hornCdMax = p.hornCd;
    FX.ring(p.x, p.y, 20, 420, "#ffd84a", 0.9, 6); FX.addShake(4);
    SFX.play("horn");
    UI.toast("WAR HORN — the horde surges!");
  },

  netRadius() { return CONFIG.player.netRadius * (1 + 0.12 * this.upg("net")) * (1 + this.rankIndex * 0.05) * (1 + this.res("psychic")); },
  netLanded(x, y) {
    const radius = this.netRadius();
    this.netMarks.push({ x, y, r: radius, life: 0.5 });
    FX.ring(x, y, radius * 0.3, radius, "#e8f6ff", 0.3, 3);
    let any = false;
    for (const h of this.hostiles.slice()) {
      if (h.removed || h.kind !== "beast" || h.team !== 1) continue;
      if (dist2(h.x, h.y, x, y) > (radius + h.r) * (radius + h.r)) continue;
      any = true;
      if (h.ward > 0 && !h.dazed && !h.cowed) {
        // a warded elite: the net is spent tearing its ward apart, and leaves it reeling
        h.ward = 0; h.stunT = Math.max(h.stunT || 0, 1.4); provoke(h);
        FX.text(h.x, h.y - h.r * 2.4 - 10, "WARD SHATTERED!", AFFIXES.warded.color, 1.3, 15);
        FX.ring(h.x, h.y - h.r, 6, h.r * 3 + 30, AFFIXES.warded.color, 0.45, 4); FX.burst(h.x, h.y - h.r, "#ffffff", 16, 200, 0.5, 4);
        SFX.play("chink", 0.8, 0.7); continue;
      }
      const c = bindChance(h);
      if (c <= 0) { FX.text(h.x, h.y - h.r * 2.4 - 10, "Too mighty — fell it first!", "#ffb03a", 1.2, 12); continue; }
      if (Math.random() < c) bindBeast(h);
      else {
        FX.text(h.x, h.y - h.r * 2.4 - 10, h.hp / h.maxHp > 0.6 ? "Broke free — weaken it!" : "Broke free!", "#ffd84a", 1, 12);
        provoke(h); SFX.play("fail");
      }
    }
    if (!any) FX.burst(x, y, "#9fb4cc", 6, 60, 0.3, 3);
  },

  playerDied() {
    if (this.state === "dead") return;
    this.state = "dead"; this.deadT = 3.2; this.stats.deaths++;
    const lost = Math.round(this.essence * 0.2);
    this.essence -= lost;
    FX.burst(this.player.x, this.player.y - 20, "#ff6a6a", 30, 200, 1, 5); FX.addShake(10);
    UI.banner("YOU FELL", lost ? "The wilds claim " + lost + "◆ essence. Your horde drags you back to camp." : "Your horde drags you back to camp.", "#ff6a6a");
    SFX.play("down");
  },

  respawn() {
    const p = this.player, T = CONFIG.tile;
    p.x = CAMP.tx * T; p.y = CAMP.ty * T + 60; p.hp = p.maxHp; p.invuln = 2;
    this.chargeT = 0;
    for (const u of this.army) { u.down = 0; u.hp = u.maxHp; u.target = null; u.x = p.x + (Math.random() - 0.5) * 160; u.y = p.y + (Math.random() - 0.5) * 120; }
    for (const h of this.hostiles) { if (h.hunter) h.removed = true; if (h.titan && h.team !== 0 && !h.dazed) { h.aggro = false; h.target = null; h.tAtk = null; h.hp = h.maxHp; } }
    this.projectiles.length = 0;
    this.cam.x = p.x; this.cam.y = p.y;
    this.state = "play";
    this.save();
  },

  // ---------------------------------------------------------------- save / load
  packUnit(u) { return { s: u.sp.id, l: u.level, x: Math.round(u.xp), st: u.stars, t: u.titan ? 1 : 0, n: u.titan ? u.name : undefined, b: u.benchedByPlayer ? 1 : 0, g: u.gen || 0, ri: u.titan ? u.regionIndex : undefined, a: u.affix || undefined }; },
  unpackUnit(d) {
    if (!SPECIES_BY_ID[d.s]) return null;
    const u = makeBeast(d.s, d.l, { team: 0, stars: d.st, titan: !!d.t, name: d.n, gen: d.g || 0, regionIndex: d.ri, affix: AFFIXES[d.a] ? d.a : null });
    u.xp = d.x || 0; u.benchedByPlayer = !!d.b;
    return u;
  },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  save() {
    if (this.state === "title" || this.state === "cut") return;
    const p = this.player;
    const data = { v: 2, seed: this.seed, meta: this.meta, base: this.state === "base" ? 1 : 0, px: Math.round(p.x), py: Math.round(p.y), renown: this.renown, essence: this.essence, upgrades: this.upgrades,
      blv: this.binderLevel, bxp: Math.round(this.binderXp), boons: this.boons, pend: this.pendingBoons, fbest: this.frenzyBest,
      seen: this.seen, sighted: this.sighted, titans: this.titansDefeated, victory: this.victory, stats: this.stats, time: Math.round(this.time),
      recall: Math.round(this.recallWait()), stance: this.stanceId,
      army: this.army.map((u) => this.packUnit(u)), reserve: this.reserve.map((u) => this.packUnit(u)) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); localStorage.setItem(SAVE_KEY + ".settings", JSON.stringify(this.settings)); } catch (e) { /* storage full or blocked */ }
  },
  loadSettings() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SAVE_KEY + ".settings") || "{}")); } catch (e) { /* ignore */ }
    SFX.muted = !!this.settings.muted;
  },
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { d = null; }
    if (!d || d.v !== 2) return false;
    for (const id in this.meta.hybrids) delete SPECIES_BY_ID[id];
    this.meta = Object.assign({ planet: 0, credits: 0, materials: 0, forge: {}, ship: {}, hybrids: {}, crew: 0, cleared: 0 }, d.meta || {});
    for (const id in this.meta.hybrids) SPECIES_BY_ID[id] = this.meta.hybrids[id];
    this.newWorld();
    this.renown = d.renown || 0; this.essence = d.essence || 0; this.upgrades = d.upgrades || {}; this.seen = d.seen || {}; this.sighted = d.sighted || {};
    this.titansDefeated = d.titans || {}; this.victory = !!d.victory; this.stats = Object.assign(this.stats, d.stats || {}); this.time = d.time || 0;
    this.binderLevel = d.blv || 1; this.binderXp = d.bxp || 0; this.boons = d.boons || {}; this.pendingBoons = d.pend || 0; this.frenzyBest = d.fbest || 0;
    this.recallAt = this.time + (d.recall || 0);
    this.stanceId = STANCES[d.stance] ? d.stance : "swarm";
    this.rankIndex = 0;
    while (this.rankIndex < Math.min(CONFIG.ranks.length - 1, this.rankLimit()) && this.renown >= CONFIG.ranks[this.rankIndex + 1].renown) this.rankIndex++;
    const p = this.player;
    p.x = d.px || p.x; p.y = d.py || p.y;
    if (World.solidAt(p.x, p.y, this.playerPass())) { p.x = CAMP.tx * CONFIG.tile; p.y = CAMP.ty * CONFIG.tile + 60; }
    for (const e of d.army || []) { const u = this.unpackUnit(e); if (u) { const a = Math.random() * TAU; u.x = p.x + Math.cos(a) * 70; u.y = p.y + Math.sin(a) * 60; this.army.push(u); } }
    for (const e of d.reserve || []) { const u = this.unpackUnit(e); if (u) this.reserve.push(u); }
    while (this.army.length > this.armyCap()) this.reserve.push(this.army.pop());
    this.cam.x = p.x; this.cam.y = p.y;
    return d.base ? "base" : true;
  },

  // ---------------------------------------------------------------- camera helpers
  // throw away every cached surface and let it repaint. Used after a canvas restore, and it is also
  // the one honest thing to do if we ever notice the world has gone blank.
  dropCaches(why) {
    World.chunks.clear(); World.chunkQueue.length = 0;
    Sprites.tintCache.clear();
    TitanAnim.woundCache.clear();
    Mech.cache = {}; Mech.regaliaCache = {}; Mech.backCache = {};
    PropArt.cache = {};
    this.firstFrame = true;
    if (why) console.warn("BeastBinder: dropped cached canvases —", why);
  },

  // A draw failure is a bug, not something to hide: say it once per distinct cause, with enough about
  // the entity to find it, and put it on screen the first time so it gets reported rather than lived with.
  drawErrors: new Set(),
  reportDrawError(e, err) {
    const msg = String((err && err.message) || err);
    const key = (e && e.sp ? e.sp.id : e && e.kind) + "|" + msg;
    if (this.drawErrors.has(key)) return;
    this.drawErrors.add(key);
    const what = e && e.prop ? "prop " + e.kind : e === this.player ? "the player" : (e && e.sp ? e.sp.id : "?") + (e && e.titan ? " (titan)" : "");
    console.error("BeastBinder: could not draw " + what, { entity: e, error: err });
    if (typeof UI !== "undefined" && UI.toast) UI.toast("DRAW ERROR: " + what + " — " + msg);
  },

  screenToWorld(sx, sy) { return { x: this.view.x0 + sx / this.zoom, y: this.view.y0 + sy / this.zoom }; },
  onScreen(x, y) { return x > this.view.x0 - 40 && x < this.view.x1 + 40 && y > this.view.y0 - 40 && y < this.view.y1 + 80; },

  updateCamera(dt) {
    const p = this.player;
    // the bigger the horde, the wider the lens
    const k = clamp(Math.sqrt(this.army.length / 320), 0, 1);
    const titan = Director.activeTitan() ? 1.12 : 1;
    // ...and a towering Bindframe needs head-room too — but less and less of it: as the horde
    // grows the frame claims more of the screen while the beasts shrink into a sea around it
    Mech.update(this.firstFrame ? 1 : dt, this.army.length);
    const mechH = Mech.height(this.mechTier());
    const base = Math.max(lerp(560, 1650, k), mechH * lerp(5, 3.1, k));
    // small screens see less of the world rather than shrinking everything to ants
    const wantH = Math.max(base * titan * clamp(this.H / 700, 0.66, 1), mechH * 2.7) / this.userZoom;
    let z = this.H / wantH;
    z = Math.min(z, this.W / (wantH * 0.62));          // portrait phones: keep a usable width
    this.zoom = this.firstFrame ? z : lerp(this.zoom, z, 1 - Math.pow(0.04, dt));
    let tx = p.x, ty = p.y - Mech.height(this.mechTier()) * 0.35;
    if (this.state === "cut") { const r = this.rocketPos(); tx = r.x; ty = r.y - 90 - Math.min(Voyage.z, 520) * 0.55; }
    else if (this.state === "title") { tx = CAMP.tx * CONFIG.tile + Math.sin(this.time * 0.13) * 260; ty = CAMP.ty * CONFIG.tile - 140 + Math.cos(this.time * 0.1) * 130; }
    else if (!Input.touch && Input.mouse.has) { tx += (Input.mouse.x - this.W / 2) / this.zoom * 0.12; ty += (Input.mouse.y - this.H / 2) / this.zoom * 0.12; }
    const f = this.firstFrame ? 1 : 1 - Math.pow(0.002, dt);
    this.cam.x = lerp(this.cam.x, tx, f); this.cam.y = lerp(this.cam.y, ty, f);
    const hw = this.W / this.zoom / 2, hh = this.H / this.zoom / 2;
    this.cam.x = clamp(this.cam.x, hw, World.size - hw); this.cam.y = clamp(this.cam.y, hh, World.size - hh);
    const sx = (Math.random() - 0.5) * FX.shake, sy = (Math.random() - 0.5) * FX.shake;
    this.view.x0 = this.cam.x - hw + sx; this.view.y0 = this.cam.y - hh + sy;
    this.view.x1 = this.view.x0 + hw * 2; this.view.y1 = this.view.y0 + hh * 2;
  },

  // ---------------------------------------------------------------- frame
  frame(ts) {
    // clamp BOTH ways: after a pause lastTs is reset with performance.now(), which can be a hair later
    // than the next frame's timestamp — a negative dt ran every timer backwards
    const rdt = clamp((ts - this.lastTs) / 1000 || 0.016, 0, 0.05);
    this.lastTs = ts;
    // a perfect dodge buys a heartbeat of bullet-time: the world crawls, the camera and HUD do not
    let dt = rdt;
    if (this.slowT > 0) { this.slowT -= rdt; if (this.state === "play") dt = rdt * 0.3; }
    this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.05);
    try {
      if (this.state === "play" || this.state === "dead") { for (let i = 0; i < this.timeScale && (this.state === "play" || this.state === "dead"); i++) this.update(dt); }
      else if (this.state === "title") this.time += dt;
      else if (this.state === "cut") { this.time += dt; Voyage.update(dt); FX.update(dt); }
      if (this.state !== "base") SFX.ambience(REGIONS[World.regionIndexAt(this.cam.x, this.cam.y)].id, this.heat(), dt);
      this.updateCamera(rdt);
      this.render();
      UI.update(rdt);
    } catch (e) {
      console.error(e);
    }
    this.firstFrame = false;
    requestAnimationFrame((t) => this.frame(t));
  },

  // how hot the fight is, 0..1 — drives the score
  heat() {
    if (this.state !== "play") return 0;
    let n = 0; for (const h of this.hostiles) if (h.aggro && !h.dazed && this.onScreen(h.x, h.y)) n += h.titan ? 12 : h.alpha ? 3 : 1;
    return clamp(n / 14, 0, 1);
  },

  update(dt) {
    this.time += dt;
    const p = this.player;
    // the herd trails behind the way the binder has been heading, and relaxes once they stop
    this.herdIdle = p.moving ? 0 : this.herdIdle + dt;
    this.herdDx = lerp(this.herdDx, p.moveX || 0, Math.min(1, dt * 1.6)); this.herdDy = lerp(this.herdDy, p.moveY || 0, Math.min(1, dt * 1.6));
    if (this.state === "dead") { this.deadT -= dt; if (this.deadT <= 0) this.respawn(); }
    else PlayerCtl.update(p, dt);
    if (this.hornT > 0) this.hornT -= dt;
    if (this.chargeT > 0) this.chargeT -= dt;

    // camp: a safe hearth that mends everyone
    const T = CONFIG.tile, campD2 = dist2(p.x, p.y, CAMP.tx * T, CAMP.ty * T);
    const atCamp = campD2 < 260 * 260;
    UI.setPrompt(this.state !== "play" ? null : this.nearRocket() ? (this.fuelled() ? "LAUNCH  ·  Enter" : "Rocket: " + this.cores() + "/" + REGIONS.length + " Titan cores") : atCamp && this.recallFrom ? "H  ·  beacon back to the hunt" : null, this.fuelled() && this.nearRocket());
    if (atCamp && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2 * dt);

    // grid
    Grid.clear();
    for (const u of this.army) if (!u.down) Grid.insert(u);
    for (const h of this.hostiles) if (!h.removed) Grid.insert(h);

    for (const u of this.army) {
      if (u.down > 0) {
        u.down -= dt * (atCamp ? 5 : 1);
        if (u.down <= 0) {
          u.down = 0; u.hp = u.maxHp; u.spawnT = 0.5;
          const a = Math.random() * TAU; u.x = p.x + Math.cos(a) * 50; u.y = p.y + Math.sin(a) * 40;
          FX.burst(u.x, u.y - u.r, "#9dffb0", 8, 90, 0.5, 3); UI.dirtyArmy = true;
        }
        continue;
      }
      if (atCamp && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25 * dt);
      updateUnit(u, dt);
    }
    for (const h of this.hostiles) if (!h.removed) updateUnit(h, dt);
    separateUnits(this.army); separateUnits(this.hostiles);
    updateProjectiles(dt);
    updateZones(dt);

    // sweep removed hostiles
    let w = 0;
    for (let i = 0; i < this.hostiles.length; i++) { const h = this.hostiles[i]; if (!h.removed && h.team === 1) this.hostiles[w++] = h; }
    this.hostiles.length = w;
    w = 0;
    for (const m of this.netMarks) { m.life -= dt; if (m.life > 0) this.netMarks[w++] = m; }
    this.netMarks.length = w;

    if (this.state === "play") Director.update(dt);
    FX.update(dt);
    this.updateGems(dt);
    if (this.frenzyT > 0) { this.frenzyT -= dt; if (this.frenzyT <= 0) this.frenzy = 0; }
    // a level was earned: pause for the boon pick (never mid-death)
    if (this.pendingBoons > 0 && this.state === "play") UI.showBoons();

    // region toast
    const ri = World.regionIndexAt(p.x, p.y);
    if (ri !== this.lastRegion) {
      if (this.lastRegion >= 0 || this.time > 1) UI.regionToast(REGIONS[ri]);
      this.lastRegion = ri;
    }
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 15; this.save(); }
  },

  // ---------------------------------------------------------------- render
  render() {
    const ctx = this.ctx, z = this.zoom * this.dpr, v = this.view;
    while (this._depth > 0) ctx.restore();          // never inherit a save left behind by the last frame
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1c4a8c"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z, -Math.round(v.x0 * z), -Math.round(v.y0 * z));

    World.drawGround(ctx, v, this.firstFrame ? 99 : 2);
    World.drawLiquidFx(ctx, v, this.time);

    const p = this.player, time = this.time;
    // ground decals
    if (this.state !== "title") {
      const T = CONFIG.tile;
      ctx.globalAlpha = 0.1 + Math.sin(time * 2) * 0.03; ctx.fillStyle = "#ffd88a";
      ctx.beginPath(); ctx.ellipse(CAMP.tx * T, CAMP.ty * T, 200, 160, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      if (this.chargeT > 0) {
        const r = this.rally, pulse = Math.sin(time * 6) * 4;
        ctx.strokeStyle = "#ffb03a"; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, 46 + pulse, 36 + pulse * 0.8, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const m of this.netMarks) {
        ctx.globalAlpha = m.life * 1.6; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * 0.8, 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          const o = (i / 3) * m.r, hw = Math.sqrt(Math.max(0, m.r * m.r - o * o));
          ctx.beginPath(); ctx.moveTo(m.x - hw, m.y + o * 0.8); ctx.lineTo(m.x + hw, m.y + o * 0.8); ctx.moveTo(m.x + o, m.y - hw * 0.8); ctx.lineTo(m.x + o, m.y + hw * 0.8); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // net aim reticle (desktop, or a thumb aiming on touch) — plus a crosshair under the thumb
      const thumb = Input.aim.id !== null;
      if (thumb && this.state === "play") {
        ctx.globalAlpha = 0.75; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.aimX, p.aimY, 14, 0, TAU); ctx.moveTo(p.aimX - 22, p.aimY); ctx.lineTo(p.aimX - 8, p.aimY); ctx.moveTo(p.aimX + 8, p.aimY); ctx.lineTo(p.aimX + 22, p.aimY);
        ctx.moveTo(p.aimX, p.aimY - 22); ctx.lineTo(p.aimX, p.aimY - 8); ctx.moveTo(p.aimX, p.aimY + 8); ctx.lineTo(p.aimX, p.aimY + 22); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (((!Input.touch && Input.mouse.has) || thumb) && this.state === "play") {
        const dx = p.aimX - p.x, dy = p.aimY - p.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, CONFIG.player.netRange);
        const rx = p.x + (dx / d) * m, ry = p.y + (dy / d) * m;
        const rad = this.netRadius();
        ctx.globalAlpha = p.netT > 0 ? 0.15 : 0.4; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(rx, ry, rad, rad * 0.8, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    World.drawLairFx(ctx, v, time);
    drawZones(ctx, time);
    FX.drawGround(ctx);

    // y-sorted world
    const list = [];
    World.collectProps(v, list);
    if (this.state !== "title") {
      const hide = this.state === "cut" && Voyage.hideCrew();
      for (const u of this.army) if (!u.down && !u.boarded && !hide && this.onScreen(u.x, u.y - u.r)) list.push(u);
      for (const h of this.hostiles) if (!h.removed && this.onScreen(h.x, h.y - h.r)) list.push(h);
      if (this.state !== "dead" && !hide && !p.boarded) list.push(p);
    }
    list.sort((a, b) => a.y - b.y);
    // Everything in the world is drawn from this one back-to-front list, so a throw part-way through used
    // to leave the ground painted and every prop, beast and the player below the thrower missing — the
    // world looked like it had vanished. Each entity now draws inside its own guard: a failure is reported
    // once and skipped, and any canvas state it leaked (an unbalanced save, a clip, an alpha) is unwound
    // before the next one draws.
    for (const e of list) {
      const depth = this._depth;
      try {
        if (e.prop) World.drawProp(ctx, e, time);
        else if (e === p) PlayerCtl.draw(ctx, p, time);
        else drawUnit(ctx, e, time);
      } catch (err) {
        this.reportDrawError(e, err);
      }
      while (this._depth > depth) ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    Voyage.drawRocket(ctx, time);
    if (this.chargeT > 0) this.drawRallyFlag(ctx);
    for (const g of this.gems) {
      const s = g.big ? 8 : 6, x = Math.round(g.x), y = Math.round(g.y - Math.abs(Math.sin(g.t * 6)) * (g.homing ? 0 : 4));
      ctx.fillStyle = "#2a1248"; ctx.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = g.big ? "#ffd84a" : "#c8a0ff"; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x - s / 2, y - s / 2, s / 2, s / 2);
    }
    for (const pr of this.projectiles) drawProjectile(ctx, pr, time);
    FX.draw(ctx);
    FX.drawTexts(ctx, this.zoom);

    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawAmbient(ctx);
    if (this.state !== "title") this.drawEdgeArrows(ctx);
    Voyage.drawOverlay(ctx, this.W, this.H);
    if (this.slowT > 0) { ctx.fillStyle = "rgba(150,220,255," + (0.14 * Math.min(1, this.slowT / 0.2)) + ")"; ctx.fillRect(0, 0, this.W, this.H); }
    if (this.state === "dead") { ctx.fillStyle = "rgba(60,0,10," + clamp(1 - this.deadT / 3.2, 0, 0.7) + ")"; ctx.fillRect(0, 0, this.W, this.H); }
  },

  drawRallyFlag(ctx) {
    const r = this.rally, wave = Math.sin(this.time * 8) * 2;
    ctx.fillStyle = "#4a2e1c"; ctx.fillRect(r.x - 1, r.y - 44, 3, 44);
    ctx.fillStyle = "#ff8a3a"; ctx.fillRect(r.x + 2, r.y - 44, 18, 12 + wave);
    ctx.fillStyle = "#ffd84a"; ctx.fillRect(r.x + 2, r.y - 44, 18, 3);
  },

  AMBIENT: {
    meadow: { color: "#fff6c0", n: 14, vx: 12, vy: 6, size: 2, tint: null },
    mere:   { color: "#c8ff9a", n: 22, vx: 6, vy: -4, size: 3, tint: "rgba(20,60,50,0.10)" },
    dust:   { color: "#f0d8a0", n: 30, vx: 140, vy: 10, size: 2, tint: "rgba(255,200,120,0.06)" },
    frost:  { color: "#ffffff", n: 60, vx: 22, vy: 60, size: 3, tint: "rgba(160,200,255,0.07)" },
    cinder: { color: "#ff9a3a", n: 40, vx: 10, vy: -50, size: 3, tint: "rgba(255,80,20,0.08)" },
    rift:   { color: "#c080ff", n: 36, vx: -8, vy: -16, size: 3, tint: "rgba(40,0,80,0.22)" },
  },
  drawAmbient(ctx) {
    const ri = World.regionIndexAt(this.cam.x, this.cam.y), A = this.AMBIENT[REGIONS[ri].id];
    if (A.tint) { ctx.fillStyle = A.tint; ctx.fillRect(0, 0, this.W, this.H); }
    while (this.ambient.length < 60) this.ambient.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() });
    ctx.fillStyle = A.color;
    for (let i = 0; i < A.n; i++) {
      const a = this.ambient[i];
      const x = (((a.x * this.W + this.time * A.vx * a.s - this.cam.x * 0.6) % this.W) + this.W) % this.W;
      const y = (((a.y * this.H + this.time * A.vy * a.s - this.cam.y * 0.6 + Math.sin(this.time + i) * 8) % this.H) + this.H) % this.H;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.time * 2 + i * 1.7);
      ctx.fillRect(Math.round(x), Math.round(y), A.size, A.size);
    }
    ctx.globalAlpha = 1;
    // vignette
    if (!this.vignette || this.vignette.w !== this.W || this.vignette.h !== this.H) {
      const c = document.createElement("canvas"); c.width = Math.max(2, this.W >> 2); c.height = Math.max(2, this.H >> 2);
      const g = c.getContext("2d"), gr = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.75);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(4,6,16,0.5)");
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      this.vignette = { c, w: this.W, h: this.H };
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.vignette.c, 0, 0, this.W, this.H);
    ctx.imageSmoothingEnabled = false;
  },

  nextTitanIndex() { for (let i = 0; i < REGIONS.length; i++) if (!this.titansDefeated[i]) return i; return -1; },

  // arrows on the screen edge: gold = next Titan, red = hunters closing in, blue = dazed beasts
  drawEdgeArrows(ctx) {
    const marks = [];
    const nt = this.nextTitanIndex(), T = CONFIG.tile;
    if (nt >= 0 && this.stats.bound >= 3) marks.push({ x: REGIONS[nt].lair[0] * T, y: REGIONS[nt].lair[1] * T, color: "#ffd84a", size: 12 });
    else if (nt < 0) { const r = this.rocketPos(); marks.push({ x: r.x, y: r.y, color: "#7dffb0", size: 13 }); }
    let hunters = 0;
    for (const h of this.hostiles) if (h.hunter && !h.summoned && h.hp > 0 && !h.dazed && hunters++ < 6) marks.push({ x: h.x, y: h.y, color: "#ff5a5a", size: 8 });
    for (const m of marks) {
      if (this.onScreen(m.x, m.y)) continue;
      const sx = (m.x - this.view.x0) * this.zoom, sy = (m.y - this.view.y0) * this.zoom;
      const cx = this.W / 2, cy = this.H / 2, a = Math.atan2(sy - cy, sx - cx);
      const pad = 34, k = Math.min((cx - pad) / Math.abs(Math.cos(a) || 1e-6), (cy - pad) / Math.abs(Math.sin(a) || 1e-6));
      const ex = cx + Math.cos(a) * k, ey = cy + Math.sin(a) * k;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = "rgba(8,10,18,0.8)"; ctx.beginPath(); ctx.moveTo(m.size + 3, 0); ctx.lineTo(-m.size, -m.size - 1); ctx.lineTo(-m.size, m.size + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.moveTo(m.size, 0); ctx.lineTo(-m.size + 3, -m.size + 3); ctx.lineTo(-m.size + 3, m.size - 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },
};

window.addEventListener("load", () => Game.init());
