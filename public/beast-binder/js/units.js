"use strict";
// units.js — beasts, rangers, combat, projectiles and the spatial grid.
// One unit model serves both sides: team 0 = the player's horde, team 1 = hostile.

let NEXT_UID = 1;

const Grid = {
  cell: 80, map: new Map(),
  clear() { for (const arr of this.map.values()) arr.length = 0; if (this.map.size > 4000) this.map.clear(); },
  insert(u) {
    const k = ((u.y / this.cell) | 0) * 4096 + ((u.x / this.cell) | 0);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(u);
  },
  // calls fn(unit) for every unit whose cell overlaps the circle
  query(x, y, r, fn) {
    const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.map.get(cy * 4096 + cx);
      if (arr) for (let i = 0; i < arr.length; i++) fn(arr[i]);
    }
  },
};

const RANGER_KINDS = {
  striker:   { name: "Striker",   hp: 70,  atk: 9,  speed: 150, style: "melee",  cd: 0.7, range: 0,   color: "#ff8a3a" },
  rifleman:  { name: "Rifleman",  hp: 55,  atk: 11, speed: 105, style: "ranged", cd: 1.5, range: 330, color: "#ffd83f" },
  grenadier: { name: "Grenadier", hp: 65,  atk: 16, speed: 95,  style: "lob",    cd: 2.6, range: 280, color: "#b874dc" },
  brute:     { name: "Iron Brute", hp: 240, atk: 20, speed: 80,  style: "melee",  cd: 1.5, range: 0,   color: "#bcc6d8" },
};

const TITAN_HP = [26, 68, 125, 200, 300, 430];

function xpNeed(level) { return 18 + level * level * 5; }
function levelCap() { return 8 + Game.rankIndex * 5; }

function makeBeast(speciesId, level, opts) {
  opts = opts || {};
  const sp = SPECIES_BY_ID[speciesId] || SPECIES[0];
  const u = {
    uid: NEXT_UID++, kind: "beast", sp, name: opts.name || ((opts.affix && opts.team === 0 ? AFFIXES[opts.affix].name + " " : "") + sp.name),
    level: Math.max(1, level | 0), xp: 0, stars: opts.stars || 0,
    team: opts.team === undefined ? 1 : opts.team,
    alpha: !!opts.alpha, titan: !!opts.titan, hunter: !!opts.hunter, regionIndex: opts.regionIndex,
    x: 0, y: 0, vx: 0, vy: 0, facing: Math.random() < 0.5 ? 1 : -1, dir: "side", animT: Math.random() * 4, moving: false,
    hp: 1, maxHp: 1, atk: 1, speed: 100, scale: 1, r: 9,
    style: sp.move.style, moveType: sp.move.type, range: 0, cd: 1, atkTimer: Math.random(), healTimer: 3 + Math.random() * 3,
    target: null, retarget: Math.random() * 0.4, lungeT: 0, lungeDx: 0, lungeDy: 0, flash: 0, hurtT: 99,
    aggro: !!opts.aggro || !!opts.hunter, aggressive: !!opts.aggressive, pack: null,
    dazed: 0, cowed: 0, down: 0, fade: 1, spawnT: 0.5,
    homeX: 0, homeY: 0, wanderT: Math.random() * 3, wanderX: 0, wanderY: 0,
    crossWater: canCrossWater(sp), flyer: isFlyer(sp), slot: 0,
    gen: opts.gen || 0,                 // breeding generation: each one is a permanent stat bonus
    affix: opts.affix || null,          // elite trait (AFFIXES in core.js) — kept when bound
    pass: opts.hunter ? 3 : canCrossWater(sp) ? 1 : 0,
  };
  if (u.affix === "warded" && u.team === 1) u.ward = 1;
  recalcUnit(u);
  u.hp = u.maxHp;
  return u;
}

function makeRanger(kind, rank) {
  const k = RANGER_KINDS[kind];
  const u = {
    uid: NEXT_UID++, kind: "ranger", rkind: kind, sp: null, name: k.name, level: 1 + rank * 3, stars: 0, team: 1,
    hunter: true, aggro: true, alpha: false, titan: false,
    x: 0, y: 0, vx: 0, vy: 0, facing: 1, dir: "side", animT: Math.random() * 4, moving: false,
    maxHp: Math.round(k.hp * (1 + rank * 0.55)), atk: k.atk * (1 + rank * 0.32), speed: k.speed, scale: kind === "brute" ? 1.35 : 1.05, r: kind === "brute" ? 13 : 9,
    style: k.style, moveType: "normal", range: k.range, cd: k.cd, atkTimer: Math.random() * k.cd, healTimer: 1e9,
    target: null, retarget: Math.random() * 0.4, lungeT: 0, lungeDx: 0, lungeDy: 0, flash: 0, hurtT: 99,
    dazed: 0, cowed: 0, down: 0, fade: 1, spawnT: 0.5, homeX: 0, homeY: 0, wanderT: 0, wanderX: 0, wanderY: 0,
    crossWater: false, flyer: false, types: ["normal"], color: k.color, pass: 3, form: k.style === "melee" ? "slash" : k.style === "lob" ? "lob" : "shot",
  };
  const th = Game.threat();
  const pm = Game.planetMult();
  u.maxHp = Math.round(u.maxHp * (1 + th) * pm); u.atk *= (1 + th * 0.5) * (1 + (pm - 1) * 0.7);
  u.hp = u.maxHp;
  return u;
}

// derive combat stats from species + level + stars (+ the player's upgrades for allies)
function recalcUnit(u) {
  const sp = u.sp;
  const lv = 1 + 0.115 * (u.level - 1);
  const star = Math.pow(1.55, u.stars);
  let hp = (sp.hp * 0.95 + 25) * lv * star;
  let atk = sp.atk * 0.2 * (1 + 0.095 * (u.level - 1)) * Math.pow(1.45, u.stars) * (sp.move.power / 55);
  if (u.style !== "melee") { atk *= 0.78; hp *= 0.85; }     // ranged beasts trade bulk for reach
  if (u.style === "lob") atk *= 0.8;                          // splash hits several targets
  if (u.alpha) { hp *= 2.4; atk *= 1.3; }
  if (u.gen) { const g = 1 + 0.16 * u.gen; hp *= g; atk *= g; }   // bred bloodlines
  if (u.affix && u.team === 1 && !u.alpha && !u.titan) hp *= 1.4;    // a wild elite is a tougher catch
  // a wild Titan is a raid boss sized for the horde you should have by then; bound, it is "merely" colossal
  if (u.titan) { hp *= u.team === 0 ? 8 : TITAN_HP[u.regionIndex || 0]; atk *= 2; }
  if (u.team === 0) {
    hp *= (1 + 0.08 * Game.upg("vigor")) * (1 + 0.1 * Game.forge("hide"));
    atk *= (1 + 0.08 * Game.upg("fury")) * (1 + 0.1 * Game.forge("fang"));
  } else {
    // threat is sampled once, when the beast first appears, so a fight never changes under you
    if (u.threat === undefined) u.threat = Game.threat();
    // ...and every new planet is wilder than the last
    if (u.pm === undefined) u.pm = Game.planetMult();
    hp *= (1 + u.threat) * u.pm; atk *= 1.1 * (1 + u.threat * 0.55) * (1 + (u.pm - 1) * 0.7);
  }
  const ratio = u.maxHp > 1 ? u.hp / u.maxHp : 1;
  u.maxHp = Math.round(hp); u.hp = Math.max(1, Math.round(u.maxHp * ratio)); u.atk = atk;
  u.speed = 62 + sp.spd * 0.62;
  u.cd = clamp(1.75 - sp.spd / 130, 0.75, 1.5);
  if (u.affix === "swift") { u.speed *= 1.35; u.cd *= 0.8; }
  u.scale = sp.size * (1 + 0.2 * u.stars) * (1 + Math.min(u.level, 60) / 110) * (u.alpha ? 1.25 : 1) * (u.titan ? (u.team === 0 ? 2.5 : 3.3) : 1);
  u.r = clamp(8 * u.scale, 7, 58);
  u.range = u.style === "melee" ? 0 : u.style === "lob" ? 235 : u.style === "homing" ? 250 : 220;
  applyForm(u);
}

function unitPower(u) { return u.maxHp * 0.4 + u.atk * 7; }
function unitTypes(u) { return u.sp ? u.sp.types : u.types; }
function targetable(u) { return u && u.hp > 0 && !u.dazed && !u.cowed && !u.down && !u.removed; }

// ---------------------------------------------------------------- damage
function dealDamage(src, tgt, amount, moveType, opts) {
  if (!tgt || tgt.hp <= 0 || tgt.dazed || tgt.removed) return 0;
  let mult = typeMult(moveType, unitTypes(tgt));
  if (src && src.team === 0 && src !== Game.player && Game.hornT > 0) mult *= 1.4;
  if (tgt === Game.player && Game.player.invuln > 0) {
    // a blow that lands mid-dash is a PERFECT DODGE (a hazard pool you stand in does not count)
    if (src && src.team === 1 && !(opts && opts.zone)) PlayerCtl.perfectDodge(tgt);
    return 0;
  }
  let crit = false;
  const S = Game.stance(), allyBeast = !!src && src.team === 0 && src.kind === "beast";
  if (src && src.team === 0) {
    if ((tgt.alpha || tgt.titan) && Game.boon("giant")) mult *= 1 + 0.2 * Game.boon("giant");
    if (allyBeast) {
      mult *= S.dmg * (1 + Game.res("dragon"));
      if (Math.random() < 0.08 * Game.boon("crit") + Game.res("shadow")) { mult *= 2; crit = true; }
    }
  }
  // the horde's stance, Stone resonance and a Warded hide blunt a blow; a wild ward soaks most of it
  if (tgt.team === 0 && tgt.kind === "beast") mult *= S.taken * (1 - Game.res("stone")) * (tgt.affix === "warded" ? 0.8 : 1);
  if (tgt.ward > 0) mult *= 0.25;
  let dmg = Math.max(1, Math.round(amount * mult * (0.9 + Math.random() * 0.2)));
  tgt.hp -= dmg;
  if (src && src.affix === "vampiric" && src !== tgt && src.hp > 0) src.hp = Math.min(src.maxHp, src.hp + dmg * 0.25);
  // Thorned: a beast that bites one is cut in turn (ranged attackers are too far away to care)
  if (tgt.affix === "thorned" && src && src.kind === "beast" && src.team !== tgt.team && dist2(src.x, src.y, tgt.x, tgt.y) < Math.pow(src.r + tgt.r + 50, 2)) tickDamage(src, dmg * 0.25, tgt, AFFIXES.thorned.color);
  tgt.flash = 0.12; tgt.hurtT = 0;
  if (tgt.titan) TitanAnim.hit(tgt, src, dmg);
  if (src && !tgt.titan && src.x !== undefined) {
    const dx = tgt.x - src.x, dy = tgt.y - src.y, d = Math.hypot(dx, dy) || 1;
    const kb = (opts && opts.kb) || 3;
    // light hits nudge; heavy hits send the target skidding, and the heaviest throw it into the air
    if (kb >= 8) knock(tgt, dx / d, dy / d, kb * 24, kb >= 12 ? kb * 16 : 0);
    else if (tgt !== Game.player) { tgt.x += (dx / d) * kb; tgt.y += (dy / d) * kb; }
  }
  const col = TYPES[moveType] ? TYPES[moveType].color : "#ffffff";
  FX.burst(tgt.x, tgt.y - tgt.r, col, mult > 1.2 ? 5 : 3, 90, 0.3, 4);
  if (crit) FX.burst(tgt.x, tgt.y - tgt.r, "#ffe14a", 6, 140, 0.35, 4);
  const big = (opts && opts.text) || mult > 1.2 || tgt === Game.player;
  if (big && Game.onScreen(tgt.x, tgt.y)) {
    FX.text(tgt.x + (Math.random() - 0.5) * 14, tgt.y - tgt.r * 2.4 - 8, String(dmg) + (mult > 1.2 ? "!" : ""),
      tgt === Game.player ? "#ff6a6a" : mult > 1.2 ? "#ffb03a" : "#ffffff", 0.7, mult > 1.2 ? 15 : 12);
  }
  if (Game.onScreen(tgt.x, tgt.y)) SFX.hit(moveType, tgt === Game.player);
  // provoke
  if (tgt.team === 1 && !tgt.aggro) provoke(tgt);
  if (tgt.hp <= 0) { tgt.hp = 0; onDefeat(tgt, src); }
  else if (allyBeast && !Game.procLock) resonanceProcs(src, tgt, dmg);
  return dmg;
}

// Elemental Resonance on-hit effects. Locked while they run so an arc cannot set off another arc.
function resonanceProcs(src, tgt, dmg) {
  Game.procLock = true;
  try {
    if (Math.random() < Game.res("fire")) applyStatus(tgt, "burn", src, src.atk * 0.25);
    if (Math.random() < Game.res("poison")) applyStatus(tgt, "poison", src, src.atk * 0.2);
    if (Math.random() < Game.res("ice")) applyStatus(tgt, "slow", src, 0);
    if (Math.random() < Game.res("electric")) {
      let next = null, bd = 150 * 150;
      Grid.query(tgt.x, tgt.y, 150, (e) => { if (e === tgt || e.team !== 1 || !targetable(e)) return; const d = dist2(e.x, e.y, tgt.x, tgt.y); if (d < bd) { bd = d; next = e; } });
      if (next) { if (Game.onScreen(tgt.x, tgt.y)) FX.zap(tgt.x, tgt.y - tgt.r, next.x, next.y - next.r, TYPES.electric.color, 0.18, 2); dealDamage(src, next, dmg * 0.5, "electric", null); }
    }
  } finally { Game.procLock = false; }
}

// a Volatile beast bursts: a wild one catches your horde (and you), a bound one catches the enemy
function volatileBlast(u) {
  const rad = 70 + u.r * 2.2, col = AFFIXES.volatile.color;
  if (Game.onScreen(u.x, u.y)) {
    FX.ring(u.x, u.y, 8, rad, col, 0.4, 5); FX.ring(u.x, u.y, 4, rad * 0.6, "#ffffff", 0.3, 3);
    FX.burst(u.x, u.y - u.r, col, 26, 260, 0.6, 5); FX.burst(u.x, u.y - u.r, "#fff0a0", 12, 180, 0.4, 4);
    FX.addShake(5); SFX.play("boom", 0.8, 0.9);
  }
  forEnemies(u, u.x, u.y, rad, (e) => dealDamage(u, e, u.atk * 2.2 * (e === Game.player ? 0.6 : 1), "fire", { kb: 12 }));
}

function provoke(u) {
  u.aggro = true;
  if (u.pack) for (const m of u.pack.members) if (m.hp > 0 && !m.dazed) m.aggro = true;
}

function onDefeat(u, src) {
  if (u === Game.player) { Game.playerDied(); return; }
  u.target = null;
  if (!u.titan) u.tAtk = null;                                        // an Alpha felled mid-move drops it
  if (u.team === 0) {
    // an army beast falls: it rests and returns later (never lost for good)
    u.down = CONFIG.reviveTime * (1 - 0.1 * Game.upg("mend")) * Math.pow(0.88, Game.boon("revive")) * (u.titan ? 2 : 1) * (1 - Game.res("grass"));
    if (u.affix === "volatile") volatileBlast(u);
    FX.burst(u.x, u.y - u.r, "#c8d4e8", 12, 120, 0.6, 4);
    FX.text(u.x, u.y - u.r * 2 - 10, u.name + " fell!", "#ffb0b0", 1.1, 12);
    SFX.play("down");
    UI.dirtyArmy = true;
    return;
  }
  // hostile defeated -> rewards
  const tier = u.sp ? u.sp.tier : 2;
  const bossMult = u.titan ? 30 : u.alpha ? 3 : u.affix ? 2 : 1;
  // renown is earned by beating things worth beating: prey far below the horde's level is worth little
  const gap = u.level - Game.avgArmyLevel();
  const worth = u.titan ? 1 : clamp(1 + gap * 0.08, 0.2, 1.6);
  Game.addRenown(Math.max(1, Math.round((1 + u.level * 0.3 * tier) * worth * (u.titan ? 14 : bossMult) * (u.kind === "ranger" ? 1.6 : 1) * (u.summoned ? 0.3 : 1))));
  Game.onKill(u.x, u.y);
  Game.dropGems(u.x, u.y - u.r, (2 + u.level * 0.45 * tier) * bossMult * (u.kind === "ranger" ? 2 : 1));
  Game.shareXp((7 + u.level * 4.5) * bossMult);
  Game.addXp((4 + u.level * 1.6) * (u.titan ? 25 : u.alpha ? 3 : 1) * Game.frenzyMult() * (u.summoned ? 0.4 : 1));
  Game.stats.defeated++;
  // Blood Bond: the killer drinks deep
  if (src && src.team === 0 && src.kind === "beast" && Game.boon("leech")) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.03 * Game.boon("leech"));
  if (u.kind === "ranger") {
    FX.burst(u.x, u.y - 14, u.color, 16, 150, 0.6, 4);
    u.removed = true;
    return;
  }
  // beasts are never killed: they are DAZED and can be bound with the net
  u.dazed = u.titan ? 20 : CONFIG.dazeTime;
  u.aggro = false;
  if (u.affix === "volatile") { u.fuse = 1.6; if (Game.onScreen(u.x, u.y)) FX.text(u.x, u.y - u.r * 2.4 - 24, "VOLATILE — net it or clear out!", AFFIXES.volatile.color, 1.4, 13); }
  FX.burst(u.x, u.y - u.r, "#ffe89a", 10, 110, 0.5, 4);
  if (Game.onScreen(u.x, u.y)) SFX.play(u.titan ? "roar" : "daze");
  if (u.titan) { Game.onTitanDefeated(u); FX.addShake(12); }
  if (u.alpha && u.pack) {
    // the pack submits when its alpha falls
    let n = 0;
    for (const m of u.pack.members) if (m !== u && m.hp > 0 && !m.dazed && !m.removed) { m.cowed = CONFIG.cowedTime; m.target = null; n++; }
    if (n) { FX.text(u.x, u.y - u.r * 2 - 26, "The pack submits!", "#7be0ff", 1.6, 15); FX.ring(u.x, u.y, 20, 240, "#7be0ff", 0.7, 4); }
  }
}

// ---------------------------------------------------------------- binding
function bindChance(u) {
  if (u.dazed || u.cowed) return 1;
  if (u.titan || u.kind !== "beast") return 0;
  const hpFrac = u.hp / u.maxHp;
  let c = (1 - hpFrac) * 1.05 + 0.06;
  c *= [1, 0.85, 0.68, 0.52, 0.38][u.sp.tier - 1];
  if (u.alpha) c *= 0.5;
  if (u.affix) c *= 0.75;
  c *= (1 + 0.12 * Game.upg("net")) * (1 + Game.res("psychic"));
  if (u.level > levelCap() + 4) c *= 0.4;
  return clamp(c, 0.02, 0.95);
}

function bindBeast(u) {
  const idx = Game.hostiles.indexOf(u);
  if (idx >= 0) Game.hostiles.splice(idx, 1);
  const wasTitan = u.titan;
  u.team = 0; u.aggro = false; u.dazed = 0; u.cowed = 0; u.target = null; u.pack = null; u.alpha = false; u.hunter = false;
  u.fuse = 0; u.ward = 0; if (!wasTitan) u.tAtk = null;
  if (!wasTitan) u.name = (u.affix ? AFFIXES[u.affix].name + " " : "") + u.sp.name;
  if (u.affix && !wasTitan) FX.text(u.x, u.y - u.r * 2.4 - 44, AFFIXES[u.affix].name + ": " + AFFIXES[u.affix].ally, AFFIXES[u.affix].color, 1.8, 12);
  // a beast far beyond the binder's rank is humbled by the binding: no skipping the journey
  // by netting one monster from three regions ahead
  const maxLv = levelCap() + (wasTitan ? 6 : 3);
  if (u.level > maxLv) { u.level = maxLv; u.xp = 0; }
  if (!wasTitan && u.stars < 5 && Math.random() < 0.07 * Game.boon("lucky")) { u.stars++; FX.text(u.x, u.y - u.r * 2.4 - 44, "Lucky ★!", "#ffd84a", 1.4, 13); }
  recalcUnit(u);
  u.hp = u.maxHp;
  Game.stats.bound++;
  Game.onKill(u.x, u.y);
  Game.addXp((3 + u.level * 0.6) * Game.frenzyMult());
  // a first-ever species is a discovery; the hundredth Sprig is just another mouth to feed
  const fresh = !Game.seen[u.sp.id];
  Game.addRenown(wasTitan ? 150 + u.level * 12 : (fresh ? 12 + u.sp.tier * 10 : 1 + u.sp.tier));
  if (fresh && !wasTitan) FX.text(u.x, u.y - u.r * 2.4 - 30, "New species!", "#ffd84a", 1.4, 12);
  Game.seen[u.sp.id] = true;
  FX.ring(u.x, u.y, 8, 60 + u.r * 2, "#7be0ff", 0.6, 4);
  FX.burst(u.x, u.y - u.r, "#7be0ff", 18, 170, 0.7, 4);
  FX.text(u.x, u.y - u.r * 2.4 - 12, "Bound " + u.name + "!", "#7be0ff", 1.3, wasTitan ? 20 : 13);
  SFX.play("bind");
  // binding several beasts in quick succession is a MASS BIND: bonus renown, big text
  if (Game.time - (Game.lastBindT || -9) < 2.5) Game.bindCombo = (Game.bindCombo || 1) + 1; else Game.bindCombo = 1;
  Game.lastBindT = Game.time;
  if (Game.bindCombo >= 3) {
    Game.addRenown(Math.min(10, Game.bindCombo));
    FX.text(Game.player.x, Game.player.y - 84, "MASS BIND ×" + Game.bindCombo, "#ffd84a", 1.2, 16 + Math.min(10, Game.bindCombo));
  }
  if (Game.activeCount() < Game.armyCap()) { Game.army.push(u); }
  else { Game.toReserve(u); FX.text(u.x, u.y - u.r * 2.4 - 28, "→ sent to the Den", "#b8c8e0", 1.3, 11); }
  Game.afterRosterChange();
  if (wasTitan) UI.banner("TITAN BOUND", u.name + " marches with your horde", "#ffd84a");
}

// (projectiles, attack forms and Titan moves live in combat.js)

// ---------------------------------------------------------------- AI
function nearestEnemy(u, range) {
  let best = null, bd = range * range;
  const want = u.team === 0 ? 1 : 0;
  Grid.query(u.x, u.y, range, (e) => {
    if (e.team !== want || !targetable(e)) return;
    const d = dist2(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  });
  if (u.team === 1) {
    const p = Game.player;
    if (p.hp > 0) {
      // the binder is a slightly less tempting target than the beast in your face
      const d = dist2(u.x, u.y, p.x, p.y) * 1.35;
      if (d < bd) { bd = d; best = p; }
    }
  }
  return best;
}

function steer(u, tx, ty, speed, dt, stopDist) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= (stopDist || 2)) { u.moving = false; return d; }
  const s = Math.min(speed * dt, d);
  let hx = dx / d, hy = dy / d;
  if (u.detourT > 0) {
    // walking around an obstacle: hold a rotated heading for a moment
    u.detourT -= dt;
    const c = Math.cos(u.detourA), sn = Math.sin(u.detourA), rx = hx * c - hy * sn;
    hy = hx * sn + hy * c; hx = rx;
  }
  const ox = u.x, oy = u.y;
  World.move(u, hx * s, hy * s, u.pass);
  if (!(u.detourT > 0) && s > 0.2 && Math.hypot(u.x - ox, u.y - oy) < s * 0.4) {
    // blocked by water: probe for open ground, preferring the side we already chose
    const a = Math.atan2(dy, dx), sign = u.detourA < 0 ? -1 : 1;
    let pick = 0;
    for (const off of [0.9, -0.9, 1.5, -1.5, 2.2, -2.2]) {
      const o = off * sign;
      if (!World.solidAt(u.x + Math.cos(a + o) * 44, u.y + Math.sin(a + o) * 44, u.pass)) { pick = o; break; }
    }
    u.detourA = pick || sign * 2.6; u.detourT = 0.6 + Math.random() * 0.7;
  }
  u.moving = true;
  if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
  u.dir = Math.abs(dy) > Math.abs(dx) * 1.35 ? (dy > 0 ? "down" : "up") : "side";
  return d;
}

function updateUnit(u, dt) {
  u.animT += dt; u.hurtT += dt;
  if (u.titan) TitanAnim.update(u, dt);
  if (u.flash > 0) u.flash -= dt;
  if (u.lungeT > 0) u.lungeT -= dt;
  if (u.spawnT > 0) u.spawnT -= dt;
  u.moving = false;
  // Anything thrown into the air has to come down, even if it is bound, cowed or killed on the way up.
  // Those three states return out of this function before updateKnock is reached, so kz used to freeze at
  // whatever height the beast had got to and it hung there for good — lifted clear of its feet, with its
  // shadow shrunk to nothing by the airborne scale. Settle the fall first; a pounce is cancelled because
  // a bound or dead beast is not finishing it.
  if (u.kz > 0 && (u.dazed > 0 || u.cowed > 0 || u.hp <= 0)) { u.pounce = null; updateKnock(u, dt); }
  if (u.dazed > 0) {
    u.dazed -= dt;
    if (u.fuse > 0) { u.fuse -= dt; if (u.fuse <= 0) { volatileBlast(u); u.removed = true; return; } }
    if (u.dazed <= 0) { u.removed = true; FX.burst(u.x, u.y - u.r, "#ffffff", 8, 80, 0.5, 3); }
    return;
  }
  if (u.cowed > 0) {
    u.cowed -= dt;
    if (u.cowed <= 0) { u.aggro = false; u.hp = Math.max(u.hp, u.maxHp * 0.5); }
    return;
  }
  updateStatus(u, dt);
  if (u.hp <= 0) return;
  if (updateKnock(u, dt)) return;                                   // thrown through the air, or winded
  u.atkTimer -= dt; u.retarget -= dt;
  if (u.hunter && u.team === 1) hunterFailsafe(u, dt);

  const p = Game.player;
  const ally = u.team === 0;
  let anchorX, anchorY;
  if (ally) {
    const charging = Game.chargeT > 0;
    anchorX = charging ? Game.rally.x : p.x; anchorY = charging ? Game.rally.y : p.y;
    u.pass = Math.max(u.crossWater ? 1 : 0, Game.playerPass());     // the horde follows wherever the frame can wade
    const dA = dist2(u.x, u.y, p.x, p.y);
    if (dA > CONFIG.teleportLeash * CONFIG.teleportLeash || (u.stuckT || 0) > 2.5) {
      // hopelessly separated (water, a dash across a lake...): blink back to the binder
      FX.burst(u.x, u.y - u.r, "#b8e8ff", 8, 90, 0.4, 3);
      const a = Math.random() * TAU; u.x = p.x + Math.cos(a) * 50; u.y = p.y + Math.sin(a) * 40;
      FX.burst(u.x, u.y - u.r, "#b8e8ff", 8, 90, 0.4, 3);
      u.target = null; u.stuckT = 0;
    }
    // regen out of combat (and, with Tide resonance, in it)
    if (u.hurtT > 5 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * (0.03 + 0.012 * Game.upg("mend")) * dt);
    if (Game.res("water") && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * Game.res("water") * dt);
  }

  // --- targeting
  if (u.retarget <= 0 || (u.target && !targetable(u.target) && u.target !== p)) {
    u.retarget = 0.35 + Math.random() * 0.25;
    if (ally) {
      // the stance decides how far the horde ranges: Guard only answers what reaches the binder
      const S = Game.stance(), charging = Game.chargeT > 0, leash = CONFIG.leash * (charging ? 1 : S.leash);
      let t = nearestEnemy(u, (CONFIG.aggroRange + u.range * 0.5) * (charging ? 1 : S.range));
      if (t && dist2(t.x, t.y, anchorX, anchorY) > leash * leash) t = null;
      // guard the binder: prefer whatever is attacking them
      u.target = t;
    } else if (u.aggro || u.aggressive) {
      // a vast horde is noticed from much further away than a lone binder
      const notice = Math.min(180, Game.army.length * 1.2);
      const t = nearestEnemy(u, u.hunter ? 1400 : (u.aggro ? 380 : 190) + notice);
      if (t && !u.aggro) provoke(u);
      u.target = t;
      if (!t && u.hunter) u.target = p.hp > 0 ? p : null;
    } else u.target = null;
  }
  if (u.target === p && p.hp <= 0) u.target = null;

  // --- healers mend the most hurt friend nearby
  if (u.sp && u.sp.heal) {
    u.healTimer -= dt;
    if (u.healTimer <= 0) {
      u.healTimer = 4.5;
      let worst = null, wf = 0.85;
      // a beast can only be mended once every few seconds, however many healers surround it —
      // otherwise a pack of healers out-heals any amount of damage and the fight never ends
      const now = Game.time;
      Grid.query(u.x, u.y, 230, (e) => { if (e.team === u.team && targetable(e) && e.hp / e.maxHp < wf && !(e.mendedAt > now - 3.5) && dist2(e.x, e.y, u.x, u.y) < 230 * 230) { wf = e.hp / e.maxHp; worst = e; } });
      if (ally && p.hp > 0 && p.hp / p.maxHp < wf && !(p.mendedAt > now - 3.5) && dist2(p.x, p.y, u.x, u.y) < 230 * 230) worst = p;
      if (worst) {
        worst.mendedAt = now;
        const amt = Math.round(worst.maxHp * (worst.titan ? 0.02 : 0.08) + u.sp.heal.power * 0.25 * (1 + u.level * 0.05));
        worst.hp = Math.min(worst.maxHp, worst.hp + amt);
        FX.beam(u.x, u.y - u.r, worst.x, worst.y - worst.r, "#7dffb0", 0.3);
        FX.burst(worst.x, worst.y - worst.r, "#7dffb0", 6, 70, 0.5, 3);
      } else u.healTimer = 1;
    }
  }

  // Titans — and wild pack Alphas, with a smaller set — fight with telegraphed signature moves
  if ((u.titan || (u.alpha && u.team === 1 && u.aggro && u.kind === "beast")) && updateTitan(u, dt)) return;

  // --- act
  const speedMul = (ally ? (Game.hornT > 0 ? 1.3 : 1) * (1 + 0.06 * Game.boon("swift")) * Game.stance().speed * (1 + Game.res("air")) : 1) * (u.slowT > 0 ? 0.55 : 1);
  const t = u.target;
  if (t) {
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    const reach = u.style === "melee" ? u.r + t.r + (u.form === "pounce" ? 95 : 10) : u.range;
    if (d > reach) steer(u, t.x, t.y, u.speed * speedMul, dt, reach * 0.9);
    else if (u.style !== "melee" && d < reach * 0.45 && !u.titan) steer(u, u.x - (t.x - u.x), u.y - (t.y - u.y), u.speed * 0.7, dt); // kite
    else { if (Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1; }
    if (d <= reach + 6 && u.atkTimer <= 0) performAttack(u, t);
    if (!ally && !u.hunter && dist2(u.x, u.y, u.homeX, u.homeY) > 900 * 900) { u.target = null; u.aggro = false; u.hp = u.maxHp; }
    return;
  }

  if (ally) {
    // Gather as a HERD, not a parade: a lumpy, drifting blob that trails behind the binder,
    // every beast with its own spot in it — and once the binder stands still they mill about and graze.
    const i = u.slot, n = Game.army.length;
    if (u.hA === undefined) { u.hA = (hash2(u.uid, 3, 11) - 0.5) * 1.3; u.hR = 0.72 + hash2(u.uid, 5, 12) * 0.56; u.gx = 0; u.gy = 0; u.grazeT = Math.random() * 3; }
    const ang = i * 2.39996 + 0.6 + u.hA;
    const inner = 40 + (Game.player.r - 9) * 2 * Mech.reach(Game.mechTier());
    const lump = 0.74 + 0.52 * vnoise(Math.cos(ang) * 1.6 + 7.3, Math.sin(ang) * 1.6 + Game.time * 0.03, 5);
    const spread = Game.formationSpread * Game.stance().spread;
    const rad = inner + 21 * Math.sqrt(i + 0.5) * spread * u.hR * lump;
    const herdR = inner + 21 * Math.sqrt(n) * spread, idle = Game.herdIdle > 1.2 && !(Game.chargeT > 0);
    // the herd's heart lags behind the way the binder is heading
    const cx = anchorX - (Game.herdDx || 0) * herdR * 0.5, cy = anchorY - (Game.herdDy || 0) * herdR * 0.42;
    u.grazeT -= dt;
    if (u.grazeT <= 0) {
      u.grazeT = idle ? 2.5 + Math.random() * 7 : 1.5 + Math.random() * 2;
      const stray = idle && Math.random() < 0.15 ? 150 : idle ? 62 : 18, ga = Math.random() * TAU, gd = Math.sqrt(Math.random()) * stray;
      u.gx = Math.cos(ga) * gd; u.gy = Math.sin(ga) * gd * 0.8;
      if (idle && Math.random() < 0.5) u.idleFace = Math.random() < 0.5 ? 1 : -1;
    }
    const fx = cx + Math.cos(ang) * rad + u.gx, fy = cy + Math.sin(ang) * rad * 0.82 + u.gy;
    const d = Math.hypot(fx - u.x, fy - u.y);
    if (d > (u.arrived ? 26 : 8)) {
      u.arrived = false;
      const before = u.x + u.y;
      const amble = idle && d < 170;                                   // grazing beasts stroll; stragglers run
      steer(u, fx, fy, amble ? u.speed * 0.42 : u.speed * (d > 150 ? 1.9 : 1.15) * speedMul + (d > 150 ? 60 : 0), dt, 6);
      u.stuckT = Math.abs(u.x + u.y - before) < 0.05 && d > 200 ? (u.stuckT || 0) + dt : 0;
    } else {
      u.arrived = true; u.stuckT = 0;
      if (p.moveX) u.facing = p.moveX > 0 ? 1 : -1; else if (u.idleFace) { u.facing = u.idleFace; u.idleFace = 0; }
    }
    return;
  }

  // wild: wander near home, or (hunters) march on the binder
  if (u.hunter) { steer(u, p.x, p.y, u.speed, dt, 40); return; }
  wander(u, dt);
}

// Hunters must always arrive. If one makes no headway for a while (lakes,
// coastline), it regroups on open ground just outside the player's view.
function hunterFailsafe(u, dt) {
  const p = Game.player, d = Math.hypot(p.x - u.x, p.y - u.y);
  u.progT = (u.progT || 0) + dt;
  if (u.progD === undefined || d < u.progD - 60) { u.progD = d; u.progT = 0; }
  if (u.progT < 9 || d < 420 || Game.onScreen(u.x, u.y)) { if (u.progT >= 9) { u.progT = 0; u.progD = d; } return; }
  const R = Math.hypot(Game.view.x1 - Game.view.x0, Game.view.y1 - Game.view.y0) / 2 + 80;
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * TAU, x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
    if (x < 60 || y < 60 || x > World.size - 60 || y > World.size - 60 || World.solidAt(x, y, false)) continue;
    u.x = x; u.y = y; u.spawnT = 0.5; break;
  }
  u.progT = 0; u.progD = undefined;
}

function wander(u, dt) {
  u.wanderT -= dt;
  if (u.wanderT <= 0) {
    u.wanderT = 2 + Math.random() * 4;
    const a = Math.random() * TAU, d = Math.random() * 90;
    u.wanderX = u.homeX + Math.cos(a) * d; u.wanderY = u.homeY + Math.sin(a) * d;
    if (Math.random() < 0.4) { u.wanderX = u.x; u.wanderY = u.y; }
  }
  steer(u, u.wanderX, u.wanderY, u.speed * 0.35, dt, 5);
  if (u.hp < u.maxHp && u.hurtT > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);
}

// soft separation so hordes spread out instead of stacking on one pixel
function separateUnits(units) {
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.down || u.removed || u.kz > 0) continue;
    let n = 0;
    Grid.query(u.x, u.y, u.r + 30, (e) => {
      if (e === u || n > 8 || e.uid < u.uid) return;
      const rr = (u.r + e.r) * 0.95;
      const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return;
      n++;
      const d = Math.sqrt(d2) || 0.01, push = (rr - d) * 0.5;
      const px = d2 < 0.01 ? (Math.random() - 0.5) : dx / d, py = d2 < 0.01 ? (Math.random() - 0.5) : dy / d;
      const wu = e.titan || e.dazed ? 1 : u.titan || u.dazed ? 0 : 0.5;
      World.move(u, -px * push * wu * 2, -py * push * wu * 2, u.pass);
      World.move(e, px * push * (1 - wu) * 2, py * push * (1 - wu) * 2, e.pass);
    });
  }
}

// ---------------------------------------------------------------- drawing
function drawUnit(ctx, u, time) {
  const H = (u.kind === "ranger" ? 52 : CONFIG.beastHeight) * u.scale;
  const entry = u.kind === "ranger" ? Sprites.ranger(u.rkind) : Sprites.beast(u.sp);
  const action = u.lungeT > 0 ? "attack" : u.moving ? "walk" : "idle";
  const rate = action === "walk" ? clamp(u.speed / 90, 0.9, 1.9) : action === "attack" ? 0 : 0.55;
  const tt = action === "attack" ? clamp(1 - u.lungeT / 0.32, 0, 0.99) : u.animT * rate;
  const fr = Sprites.frame(entry, action, u.dir, tt);
  const air = u.kz > 0 ? u.kz : 0;
  // wading: anything that cannot fly sinks to its belly in water
  const wet = !u.flyer && !air && (World.cellAt(u.x, u.y) & F_WATER) !== 0 && !(World.cellAt(u.x, u.y) & F_OCEAN);
  const bob = (u.flyer ? 8 * u.scale + Math.sin(time * 3 + u.uid) * 3 : 0) + air;
  const alpha = (u.spawnT > 0 ? 1 - u.spawnT / 0.5 : 1) * (u.dazed > 0 && u.dazed < 1.5 ? u.dazed / 1.5 : 1);

  // ground marks
  ctx.globalAlpha = 0.26 * alpha;
  ctx.fillStyle = "#0a0e18";
  const shk = 1 / (1 + air / 90);
  if (!wet) { ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * 1.15 * shk, u.r * 0.5 * shk, 0, 0, TAU); ctx.fill(); }
  if (u.enraged && u.hp > 0 && !u.dazed) {
    ctx.globalAlpha = (0.2 + 0.15 * Math.sin(time * 10)) * alpha; ctx.fillStyle = "#ff2a2a";
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * 2.2, u.r * 1.1, 0, 0, TAU); ctx.fill();
  }
  if (u.team === 0 && !wet) {
    ctx.globalAlpha = 0.5 * alpha; ctx.strokeStyle = u.titan ? "#ffd84a" : "#5ad0ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * 1.25, u.r * 0.58, 0, 0, TAU); ctx.stroke();
  } else if (u.dazed > 0 || u.cowed > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    ctx.globalAlpha = (0.45 + pulse * 0.45) * alpha; ctx.strokeStyle = "#7be0ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * 1.5 + pulse * 4, u.r * 0.75 + pulse * 2, 0, 0, TAU); ctx.stroke();
  }
  if (u.affix && u.hp > 0 && !u.dazed && !u.cowed && u.team === 1) {
    // a wild elite stands in a slow-turning ring of its affix colour
    const A = AFFIXES[u.affix];
    ctx.globalAlpha = (0.45 + 0.2 * Math.sin(time * 4 + u.uid)) * alpha; ctx.strokeStyle = A.color; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = time * 14;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.r * 1.6, u.r * 0.78, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if (u.fuse > 0) {
    // a Volatile beast's fuse: the blast radius fills as it burns down
    const rad = 70 + u.r * 2.2, k = 1 - u.fuse / 1.6, blink = Math.floor(time * (6 + k * 14)) % 2;
    ctx.globalAlpha = 0.14 + k * 0.22; ctx.fillStyle = "#ff3a1a";
    ctx.beginPath(); ctx.ellipse(u.x, u.y, rad * k, rad * 0.8 * k, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = blink ? 0.9 : 0.5; ctx.strokeStyle = AFFIXES.volatile.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, rad, rad * 0.8, 0, 0, TAU); ctx.stroke();
  }
  if (u.tAtk) drawTitanTelegraph(ctx, u, time);
  ctx.globalAlpha = alpha;

  const lunge = u.lungeT > 0 ? Math.sin((1 - u.lungeT / 0.32) * Math.PI) * Math.min(14, 5 + u.r * 0.5) : 0;
  // an Alpha winding up a signature move trembles with it
  const winding = !u.titan && u.tAtk && u.tAtk.t < u.tAtk.wind, tremble = winding ? Math.sin(time * 70) * 1.6 : 0;
  const dx = u.x + u.lungeDx * lunge + tremble, dy = u.y + u.lungeDy * lunge - bob;
  if (u.titan && TitanAnim.has(u.sp) && TitanAnim.draw(ctx, u, entry, time, H, dx, dy, alpha, wet)) { /* the Titan rig drew it */ }
  else if (fr) {
    let img = fr.img;
    if (u.flash > 0) img = Sprites.tinted(fr.img, "#ffffff", 0.85);
    else if (u.fuse > 0 && Math.floor(time * 10) % 2) img = Sprites.tinted(fr.img, "#ff5a1a", 0.6);
    else if (winding && Math.floor(time * 12) % 2) img = Sprites.tinted(fr.img, "#ff3a3a", 0.45);
    else if (u.shade) img = Sprites.tinted(fr.img, u.shade, 0.45);
    else if (u.dotT > 0) img = Sprites.tinted(fr.img, STATUS_COL[u.dotKind], 0.35);
    else if (u.slowT > 0) img = Sprites.tinted(fr.img, "#a8ecff", 0.4);
    else if (u.sp && u.sp.tint) img = Sprites.tinted(fr.img, u.sp.tint, 0.38);   // hybrids wear their second element
    const w = (fr.img.naturalWidth * H) / fr.img.naturalHeight;
    const wobble = u.dazed > 0 ? Math.sin(time * 6 + u.uid) * 0.08 : 0;
    const squash = u.cowed > 0 ? 0.82 : 1;
    ctx.save();
    ctx.translate(Math.round(dx), Math.round(dy));
    if (air) { ctx.translate(0, -H * 0.45); ctx.rotate(u.spin || 0); ctx.translate(0, H * 0.45); }
    else if (wobble) ctx.rotate(wobble);
    ctx.scale(fr.mirrored && u.facing < 0 ? -1 : 1, squash);
    if (wet) {
      // only what is above the waterline is drawn, and a ripple rings it
      const sink = 0.26, ih = fr.img.naturalHeight;
      ctx.drawImage(img, 0, 0, fr.img.naturalWidth, ih * (1 - sink), -w / 2, -H * (1 - sink), w, H * (1 - sink));
      ctx.globalAlpha = 0.7 * alpha; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2;
      const rp = 0.5 + 0.5 * Math.sin(time * 4 + u.uid);
      ctx.beginPath(); ctx.ellipse(0, -1, u.r * (1.1 + rp * 0.4), u.r * (0.4 + rp * 0.15), 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha;
    } else ctx.drawImage(img, -w / 2, -H, w, H);
    ctx.restore();
  } else {
    // art still loading: a soft type-coloured blob stands in
    ctx.fillStyle = u.sp ? TYPES[u.sp.types[0]].color : u.color;
    ctx.beginPath(); ctx.ellipse(dx, dy - H * 0.35, H * 0.3, H * 0.35, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (u.ward > 0 && u.hp > 0 && !u.dazed) {
    // the ward: a shimmering shell until a net tears it open
    const wr = Math.max(H * 0.55, u.r * 1.5), cy = dy - H * 0.45;
    ctx.globalAlpha = 0.16; ctx.fillStyle = AFFIXES.warded.color;
    ctx.beginPath(); ctx.ellipse(dx, cy, wr, wr * 0.95, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 5 + u.uid); ctx.strokeStyle = AFFIXES.warded.color; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + time * 0.8; ctx.lineTo(dx + Math.cos(a) * wr, cy + Math.sin(a) * wr * 0.95); } ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const top = u.y - H - bob - 6;
  if (u.dazed > 0 || u.cowed > 0) {
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * TAU) / 3;
      ctx.fillStyle = u.cowed > 0 ? "#7be0ff" : "#ffe14a";
      ctx.fillRect(Math.round(u.x + Math.cos(a) * (8 + u.r * 0.6)) - 2, Math.round(top + 4 + Math.sin(a) * 3) - 2, 4, 4);
    }
    return;
  }
  // health bar (only when it tells you something): just the coloured fill on a hairline track — no backing box
  if (u.hp < u.maxHp || u.alpha || u.titan) {
    const bw = clamp(u.r * 2.4, 20, 90), bx = Math.round(u.x - bw / 2), by = Math.round(top), w = Math.max(0, Math.round((bw * u.hp) / u.maxHp));
    ctx.fillStyle = "rgba(8,10,18,0.45)"; ctx.fillRect(bx, by + 1, bw, 1); ctx.fillRect(bx, by + 3, w, 1);
    ctx.fillStyle = u.team === 0 ? "#5cf08a" : u.hunter ? "#ff5a7a" : "#ff8a4a";
    ctx.fillRect(bx, by, w, 3);
  }
  if (u.affix) {                                                     // elite: a diamond in its affix colour
    const cx = Math.round(u.x + clamp(u.r * 1.2, 10, 45) + 6), cy = Math.round(top + 1);
    ctx.fillStyle = "#0c101c"; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 6, cy); ctx.fill();
    ctx.fillStyle = AFFIXES[u.affix].color; ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 4, cy); ctx.fill();
  }
  if (u.gen > 0 && u.team === 0) {                                   // bred bloodline: a helix pip per generation
    ctx.fillStyle = "#7dffb0";
    for (let i = 0; i < Math.min(u.gen, 5); i++) ctx.fillRect(Math.round(u.x - Math.min(u.gen, 5) * 2.5 + i * 5), Math.round(top + 5), 3, 3);
  }
  if (u.stars > 0) {
    ctx.fillStyle = "#ffd84a";
    const n = u.stars, sx = u.x - (n * 6) / 2;
    for (let i = 0; i < n; i++) { ctx.fillRect(Math.round(sx + i * 6) + 1, Math.round(top - 7), 3, 5); ctx.fillRect(Math.round(sx + i * 6), Math.round(top - 6), 5, 3); }
  }
  if (u.alpha) {
    const cx = Math.round(u.x), cy = Math.round(top - (u.stars ? 16 : 9));
    ctx.fillStyle = "#ffd84a"; ctx.fillRect(cx - 6, cy + 3, 12, 4);
    ctx.fillRect(cx - 6, cy, 2, 4); ctx.fillRect(cx - 1, cy - 2, 2, 6); ctx.fillRect(cx + 4, cy, 2, 4);
    ctx.fillStyle = "#ff5a7a"; ctx.fillRect(cx - 1, cy + 4, 2, 2);
  }
}

