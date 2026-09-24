"use strict";
// voyage.js — the poacher's trade. The rocket (parked, landing, launching), and
// the Hangar between planets: sell beasts for credits, harvest them for materials,
// breed them into purebred bloodlines or two-element hybrids, fit permanent
// upgrades, then load the cargo pods and fly to the next planet.

// ---------------------------------------------------------------- the rocket
const Voyage = {
  cut: null, z: 0, fade: 0,

  STORY: ["You are a poacher. The best in nine systems.",
    "This world is uncharted, unclaimed — and crawling with beasts worth a fortune.",
    "Net them. March them. Fell the six Titans: their cores will fuel the flight home."],

  startLanding(intro) {
    Game.state = "cut"; this.cut = { kind: "landing", t: 0, intro: !!intro, touched: false, out: false }; this.z = 1100; this.fade = 1;
    UI.setPrompt(null); SFX.play("land");
  },
  startLaunch() {
    Game.save();
    Game.state = "cut"; this.cut = { kind: "launch", t: 0, lit: false }; this.z = 0; this.fade = 0;
    UI.setPrompt(null); Game.projectiles.length = 0; Game.hostiles.length = 0;
    UI.banner("ALL ABOARD", "Six Titan cores. One overloaded rocket.", "#7dffb0");
  },
  hideCrew() { return this.cut && this.cut.kind === "landing" && !this.cut.out; },
  skip() { if (!this.cut) return; if (this.cut.kind === "landing") this.cut.t = Math.max(this.cut.t, this.cut.touched ? 99 : 2.75); else this.cut.t = Math.max(this.cut.t, 5.9); },

  update(dt) {
    const c = this.cut; if (!c) return;
    c.t += dt;
    const r = Game.rocketPos(), p = Game.player;
    if (c.kind === "launch") {
      if (c.t < 1.8) {
        // everyone piles in
        const board = (u, sp) => {
          if (u.boarded) return;
          const dx = r.x - u.x, dy = r.y + 8 - u.y, d = Math.hypot(dx, dy) || 1;
          if (d < 28 || c.t > 1.7) { u.boarded = true; FX.burst(u.x, u.y - 10, "#7dffb0", 4, 60, 0.3, 3); return; }
          const s = Math.min(d, sp * dt * (1 + d / 300)); u.x += (dx / d) * s; u.y += (dy / d) * s; u.moving = true; u.animT += dt; u.facing = dx > 0 ? 1 : -1; u.dir = "side";
        };
        for (const u of Game.army) board(u, 380);
        board(p, 300);
      } else {
        if (!c.lit) { c.lit = true; SFX.play("engine"); for (const u of Game.army) u.boarded = true; p.boarded = true; }
        const a = Math.max(0, c.t - 3);
        this.z = 130 * a * a + 30 * a;
        FX.addShake(c.t < 3 ? 1.2 : Math.max(0, 2.2 - this.z / 300));
        // exhaust: fire at the bell, smoke rolling out along the ground
        for (let i = 0; i < 3; i++) FX.mote(r.x + (Math.random() - 0.5) * 14, r.y - this.z - 6, (Math.random() - 0.5) * 60, 160 + Math.random() * 200, Math.random() < 0.5 ? "#ffa83a" : "#ff5a1a", 0.35, 6);
        if (this.z < 420) for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; FX.mote(r.x + d * 10, r.y + 4, d * (120 + Math.random() * 260), -10 - Math.random() * 30, Math.random() < 0.5 ? "#c8c0b8" : "#8a8894", 0.9, 8, -14); }
        this.fade = clamp((c.t - 5) / 0.9, 0, 1);
        if (c.t >= 6) { this.cut = null; for (const u of Game.army) u.boarded = false; p.boarded = false; Base.open(); }
      }
      return;
    }
    // landing
    const k = clamp(c.t / 2.8, 0, 1);
    this.z = 1100 * (1 - k) * (1 - k);
    this.fade = clamp(1 - c.t / 0.9, 0, 1);
    if (!c.touched) {
      for (let i = 0; i < 3; i++) FX.mote(r.x + (Math.random() - 0.5) * 14, r.y - this.z - 6, (Math.random() - 0.5) * 50, 200 + Math.random() * 240, Math.random() < 0.5 ? "#ffa83a" : "#fff0a0", 0.3, 6);
      if (this.z < 380) for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; FX.mote(r.x + d * 10, r.y + 4, d * (140 + Math.random() * 300), -10 - Math.random() * 30, "#c8c0b8", 0.8, 8, -14); }
      FX.addShake(this.z < 300 ? 1.5 : 0.4);
      if (k >= 1) {
        c.touched = true; this.z = 0;
        FX.ring(r.x, r.y, 20, 320, "#e8e0d0", 0.8, 6); FX.ring(r.x, r.y, 10, 200, "#ffffff", 0.5, 3); FX.burst(r.x, r.y, "#c8c0a8", 40, 320, 0.9, 6); FX.addShake(12);
      }
      return;
    }
    if (!c.out && c.t > 3.3) {
      // the hatch drops: the poacher and the crew spill out
      c.out = true;
      p.x = r.x; p.y = r.y + 70; FX.burst(p.x, p.y - 20, "#7be0ff", 14, 140, 0.5, 4);
      Game.army.forEach((u, i) => { const a = 0.4 + (i / Math.max(1, Game.army.length)) * 2.3; u.x = r.x + Math.cos(a) * (90 + (i % 3) * 26); u.y = r.y + 40 + Math.sin(a) * 70; u.spawnT = 0.5; FX.burst(u.x, u.y - u.r, "#7dffb0", 8, 90, 0.5, 3); });
      SFX.play("bind");
    }
    if (c.t > (c.intro ? 8.6 : 4.4)) {
      this.cut = null; this.fade = 0;
      Game.state = "play"; Game.lastTs = performance.now();
      const pl = Game.planet();
      if (c.intro) UI.banner("PLANETFALL — " + pl.name.toUpperCase(), "Bind the wilds. Raise a horde. Take the Titans' cores.", "#ffd84a");
      else UI.banner("PLANET " + (Game.meta.planet + 1) + " — " + pl.name.toUpperCase(), "Wilder than the last. " + Game.army.length + " veterans march with you.", "#ffd84a");
    }
  },

  // the parked rocket's lights, or the rocket itself while it flies
  drawRocket(ctx, time) {
    if (Game.state === "title" || Game.state === "base") return;
    const r = Game.rocketPos(), s = CONFIG.texel;
    if (!this.cut) {
      if (!Game.onScreen(r.x, r.y)) return;
      const n = Game.cores();
      for (let i = 0; i < REGIONS.length; i++) {
        const x = r.x + 14, y = r.y - 50 - i * 11, lit = i < n;
        ctx.fillStyle = "#0a0c14"; ctx.fillRect(x - 1, y - 1, 8, 8);
        ctx.fillStyle = lit ? RUNE_COL[REGIONS[i].id] : "#2a3040"; ctx.fillRect(x, y, 6, 6);
        if (lit) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time * 4 + i); ctx.beginPath(); ctx.arc(x + 3, y + 3, 9, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      }
      if (Game.fuelled()) {
        // ready to fly: a beacon you can see from across the meadow
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "#7dffb0";
        ctx.globalAlpha = 0.1 + 0.06 * Math.sin(time * 3); ctx.fillRect(r.x - 9, r.y - 1600, 18, 1430);
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "#7dffb0"; ctx.lineWidth = 3;
        const k = (time * 0.6) % 1; ctx.globalAlpha = (1 - k) * 0.7; ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 40 + k * 90, 16 + k * 36, 0, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
      if (Math.random() < 0.04) FX.mote(r.x - 16, r.y - 22, -14, -22, "#c8d4e8", 0.9, 4, -8);
      return;
    }
    const flying = this.z > 3, art = PropArt.get(flying ? "rocketfly" : "rocket", 0);
    const sh = 1 / (1 + this.z / 260);
    ctx.globalAlpha = 0.3 * sh; ctx.fillStyle = "#0a0e18"; ctx.beginPath(); ctx.ellipse(r.x, r.y, 40 * sh + 6, 9 * sh + 2, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    const y = r.y - this.z, lit = this.cut.kind === "landing" ? !this.cut.touched : this.cut.lit;
    if (lit) {
      const th = this.cut.kind === "landing" ? 0.5 + 0.5 * clamp(1 - this.z / 1100, 0, 1) : clamp((this.cut.t - 1.8) / 1.2, 0.15, 1);
      ctx.globalCompositeOperation = "lighter";
      const gr = ctx.createRadialGradient(r.x, y, 0, r.x, y, 90 * th + 30); gr.addColorStop(0, "rgba(255,170,60,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(r.x - 130, y - 130, 260, 260);
      ctx.globalCompositeOperation = "source-over";
      const cols = ["#ff5a1a", "#ffa83a", "#fff6c0"];
      for (let i = 0; i < 3; i++) {
        const L = (34 + th * 130) * (1 - i * 0.26) * (1 + 0.16 * Math.sin(time * 47 + i * 2)), w = (13 - i * 3.6) * (0.8 + th * 0.5);
        ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(r.x - w, y - 10); ctx.quadraticCurveTo(r.x - w * 0.9, y + L * 0.5, r.x + Math.sin(time * 31 + i) * 3, y + L); ctx.quadraticCurveTo(r.x + w * 0.9, y + L * 0.5, r.x + w, y - 10); ctx.fill();
      }
    }
    ctx.drawImage(art.canvas, Math.round(r.x - art.ax * s), Math.round(y - art.ay * s), art.canvas.width * s, art.canvas.height * s);
  },

  drawOverlay(ctx, W, H) {
    const c = this.cut;
    if (c) {
      // letterbox
      const bar = Math.round(H * 0.11 * clamp(c.kind === "landing" ? Math.min(c.t / 0.5, ((c.intro ? 8.6 : 4.4) - c.t) / 0.5) : c.t / 0.5, 0, 1));
      ctx.fillStyle = "#05060c"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      if (c.kind === "landing" && c.intro) {
        ctx.textAlign = "center"; ctx.font = "bold " + Math.round(clamp(W / 52, 13, 22)) + "px 'Trebuchet MS', Verdana, sans-serif";
        for (let i = 0; i < this.STORY.length; i++) {
          const t0 = 0.6 + i * 2.3, n = Math.floor((c.t - t0) * 38); if (n <= 0) continue;
          const a = clamp((8.4 - c.t) / 0.6, 0, 1); ctx.globalAlpha = a;
          const y = H * 0.2 + i * Math.round(clamp(W / 36, 20, 32));
          ctx.lineWidth = 4; ctx.strokeStyle = "rgba(5,6,12,0.9)"; ctx.strokeText(this.STORY[i].slice(0, n), W / 2, y);
          ctx.fillStyle = i === 0 ? "#ffd84a" : "#eef2ff"; ctx.fillText(this.STORY[i].slice(0, n), W / 2, y);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (this.fade > 0) { ctx.fillStyle = "rgba(5,6,12," + this.fade + ")"; ctx.fillRect(0, 0, W, H); }
  },
};

// ---------------------------------------------------------------- breeding
const TIER_VALUE = [1, 1.6, 2.6, 4.2, 6.5];
function beastValue(u) {
  return Math.round((12 + u.level * 3) * TIER_VALUE[(u.sp.tier || 1) - 1] * Math.pow(1.7, u.stars) * (1 + 0.6 * (u.gen || 0)) * (u.titan ? 12 : 1) * (u.sp.hybrid ? 1.4 : 1) * (u.affix ? 1.5 : 1));
}
function blendName(a, b) { const s = a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2)).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

// the species two different parents make: A's body and fighting style, B's element laid over it
function hybridSpecies(a, b, keep) {
  const t1 = a.types[0], t2 = b.types.find((t) => t !== t1) || a.types.find((t) => t !== t1) || t1;
  const art = a.art || a.id, id = "hy_" + art + "_" + t1 + "_" + t2 + "_" + b.move.type;
  if (SPECIES_BY_ID[id]) return SPECIES_BY_ID[id];
  const avg = (x, y, cap) => Math.min(cap, Math.round(((x + y) / 2) * 1.12));
  const sp = { id, art, hybrid: true, name: blendName(a.name, b.name), types: t1 === t2 ? [t1] : [t1, t2], tier: Math.max(a.tier, b.tier),
    hp: avg(a.hp, b.hp, 260), atk: avg(a.atk, b.atk, 240), spd: avg(a.spd, b.spd, 125), size: Math.round(((a.size + b.size) / 2) * 105) / 100,
    move: { name: b.move.name, type: b.move.type, power: Math.min(140, Math.max(a.move.power, b.move.power) + 5), style: a.move.style },
    heal: a.heal || b.heal || null, flavor: "A hangar-bred cross of " + a.name + " and " + b.name + ".", sets: a.sets, tint: TYPES[b.move.type] ? TYPES[b.move.type].color : TYPES[t2].color };
  if (keep) { SPECIES_BY_ID[id] = sp; Game.meta.hybrids[id] = sp; }   // only a hybrid that was actually bred is remembered
  return sp;
}

function breedPreview(a, b) {
  if (a.titan || b.titan) return { ok: false, why: "Titans will not breed." };
  const inc = 3 * Game.shipUpg("incubator");
  if (a.sp.id === b.sp.id) return { ok: true, pure: true, sp: a.sp, level: Math.max(a.level, b.level) + inc, stars: Math.max(a.stars, b.stars), gen: Math.max(a.gen || 0, b.gen || 0) + 1 };
  return { ok: true, pure: false, sp: null, level: Math.round((a.level + b.level) / 2) + 2 + inc, stars: Math.max(a.stars, b.stars), gen: Math.max(a.gen || 0, b.gen || 0) };
}

// ---------------------------------------------------------------- the Hangar
const FORGE = [
  { id: "hide",      name: "Reinforced Hides", desc: "+10% horde health — permanent",     base: 1500, grow: 1.7, max: 10 },
  { id: "fang",      name: "Honed Fangs",      desc: "+10% horde damage — permanent",     base: 1500, grow: 1.7, max: 10 },
  { id: "plating",   name: "Frame Plating",    desc: "+10% Bindframe health — permanent", base: 1200, grow: 1.7, max: 10 },
  { id: "capacitor", name: "Bolt Capacitors",  desc: "+10% bolt damage — permanent",      base: 1200, grow: 1.7, max: 10 },
];
const SHIP = [
  { id: "cargo",     name: "Cargo Pods",    desc: "+1 beast aboard the rocket",            base: 4000, grow: 2.2, max: 6 },
  { id: "stash",     name: "Essence Stash", desc: "Land with +150 essence",                base: 2500, grow: 1.8, max: 6 },
  { id: "incubator", name: "Incubator",     desc: "Bred offspring hatch 3 levels higher",  base: 3000, grow: 2.0, max: 5 },
];

const Base = {
  el: null, roster: [], sel: [], cargo: {}, shown: { credits: 0, materials: 0 }, busy: false, raf: 0, stars: null,

  cap() { return 6 + Game.shipUpg("cargo"); },
  aboard() { return this.roster.filter((u) => this.cargo[u.uid]); },
  cost(d, lvl) { return Math.round(d.base * Math.pow(d.grow, lvl)); },

  open() {
    const g = Game;
    g.state = "base"; Voyage.fade = 0;
    this.el = document.getElementById("base");
    this.roster = g.army.concat(g.reserve); g.army = []; g.reserve = [];
    for (const u of this.roster) { u.down = 0; u.hp = u.maxHp; }
    this.sel = []; this.cargo = {}; this.busy = false;
    this.shown.credits = g.meta.credits; this.shown.materials = g.meta.materials;
    document.getElementById("hud").classList.add("hidden");
    this.el.classList.remove("hidden"); this.el.classList.add("arrive");
    setTimeout(() => this.el.classList.remove("arrive"), 900);
    this.autoPick(); this.render(); this.startBg();
    SFX.play("rank"); g.save();
  },

  // keep Game's roster in step so a save made in the hangar holds everyone
  sync() { Game.reserve = this.roster.slice(); Game.army = []; Game.save(); },

  autoPick() {
    this.cargo = {};
    const best = this.roster.slice().sort((a, b) => unitPower(b) - unitPower(a)).slice(0, this.cap());
    for (const u of best) this.cargo[u.uid] = 1;
  },

  card(u) {
    const types = u.sp.types.map((t) => '<i style="background:' + TYPES[t].color + '" title="' + TYPES[t].name + '"></i>').join("");
    const cls = "card" + (u.titan ? " titan" : "") + (this.sel.indexOf(u) >= 0 ? " sel" : "") + (this.cargo[u.uid] ? " aboard" : "") + (u.sp.hybrid ? " hybrid" : "");
    return '<div class="' + cls + '" data-uid="' + u.uid + '"><div class="ty">' + types + '</div><div class="role">' + (this.cargo[u.uid] ? "aboard" : "") + "</div>" +
      Sprites.thumbHtml(u.sp, "", u.titan) + '<div class="st">' + "★".repeat(u.stars) + (u.gen ? '<span class="gen">⬡' + u.gen + "</span>" : "") + UI.affixTag(u) +
      '</div><div class="nm">' + u.name + '</div><div class="lv">Lv ' + u.level + " · ¢" + beastValue(u).toLocaleString() + "</div></div>";
  },

  upgRow(d, kind) {
    const lvl = kind === "forge" ? Game.forge(d.id) : Game.shipUpg(d.id), cost = this.cost(d, lvl), maxed = lvl >= d.max;
    const have = kind === "forge" ? Game.meta.materials : Game.meta.credits;
    let pips = ""; for (let i = 0; i < d.max; i++) pips += '<i class="' + (i < lvl ? "on" : "") + '"></i>';
    return '<div class="upg ' + kind + '"><div class="info"><div class="un">' + d.name + '</div><div class="ud">' + d.desc + '</div><div class="pips">' + pips + "</div></div>" +
      '<button data-buy="' + kind + ":" + d.id + '"' + (maxed || cost > have ? " disabled" : "") + ">" + (maxed ? "MAX" : (kind === "forge" ? "⬢ " : "¢ ") + cost.toLocaleString()) + "</button></div>";
  },

  render() {
    const g = Game, next = planetInfo(g.meta.planet + 1), n = this.aboard().length, cap = this.cap();
    const roster = this.roster.slice().sort((a, b) => (this.cargo[b.uid] || 0) - (this.cargo[a.uid] || 0) || unitPower(b) - unitPower(a));
    let side = "";
    if (this.sel.length === 1) {
      const u = this.sel[0], v = beastValue(u);
      side = '<div class="pick">' + Sprites.thumbHtml(u.sp, "", u.titan) + "<div><b>" + u.name + "</b><small>Lv " + u.level + " · " + u.sp.types.map((t) => TYPES[t].name).join(" / ") + (u.stars ? " · " + "★".repeat(u.stars) : "") + (u.gen ? " · bloodline ⬡" + u.gen : "") +
        "</small><small>" + u.sp.move.name + " (" + TYPES[u.sp.move.type].name + ") · " + Math.round(u.maxHp) + " hp · " + Math.round(u.atk) + " atk</small></div></div>" +
        '<div class="btn-row"><button class="btn sell" data-act="sell">Sell  +¢' + v.toLocaleString() + '</button><button class="btn harvest" data-act="harvest">Harvest  +⬢' + Math.round(v * 0.4).toLocaleString() + "</button>" +
        '<button class="btn load" data-act="load">' + (this.cargo[u.uid] ? "Take off the rocket" : "Load onto the rocket") + "</button></div>" +
        "<div class='hint'>Select a second beast to breed them.</div>";
    } else if (this.sel.length === 2) {
      const [a, b] = this.sel, pv = breedPreview(a, b);
      if (!pv.ok) side = "<div class='hint'>" + pv.why + "</div>";
      else {
        const sp = pv.pure ? pv.sp : hybridSpecies(a.sp, b.sp);
        side = '<div class="pair">' + Sprites.thumbHtml(a.sp) + "<span>+</span>" + Sprites.thumbHtml(b.sp) + "<span>→</span>" + Sprites.thumbHtml(sp, "kid") + "</div>" +
          "<div class='hint'><b>" + (pv.pure ? "Purebred " + sp.name : "Hybrid: " + sp.name) + "</b> · Lv " + pv.level + (pv.stars ? " · " + "★".repeat(pv.stars) : "") + (pv.gen ? " · bloodline ⬡" + pv.gen : "") + "<br>" +
          (pv.pure ? "Same species: the bloodline deepens — <b>+16% health and damage per ⬡</b>, forever." : "Two species: " + a.sp.name + "'s body, " + b.sp.name + "'s element. <b>" + sp.types.map((t) => TYPES[t].name).join(" / ") + "</b>, strikes with <b>" + sp.move.name + "</b>, +12% base stats.") +
          "<br>Both parents are spent.</div>" + '<div class="btn-row"><button class="btn breed" data-act="breed">Breed</button><button class="btn" data-act="swap">Swap parents</button></div>';
      }
    } else {
      side = "<div class='hint'>Click a beast to sell, harvest or load it. Click two to breed them.<br><b>Sell</b> for credits (ship upgrades) · <b>Harvest</b> for materials (permanent forge upgrades) · <b>Breed</b> for bloodlines and hybrids.</div>";
    }
    const loose = this.roster.length - n;
    this.el.querySelector("#base-ui").innerHTML =
      '<div class="bhead"><div><h1>THE HANGAR</h1><div class="sub">' + planetInfo(g.meta.planet).name + " is poached clean. Next stop: <b>" + next.name + "</b> — wilder by " + Math.round(80 * (g.meta.planet + 1)) + "%. Only what rides the rocket comes with you.</div></div>" +
      '<div class="res"><span class="cr" id="b-cr">¢ ' + Math.round(this.shown.credits).toLocaleString() + '</span><span class="mt" id="b-mt">⬢ ' + Math.round(this.shown.materials).toLocaleString() + "</span></div></div>" +
      '<div class="bmain"><div class="bleft"><h3>Your catch (' + this.roster.length + ") — aboard " + n + "/" + cap + '</h3><div class="cards" id="b-cards">' + roster.map((u) => this.card(u)).join("") + "</div></div>" +
      '<div class="bright"><div class="bbox">' + side + '</div><div class="bbox"><h3>Forge <small>materials ⬢</small></h3>' + FORGE.map((d) => this.upgRow(d, "forge")).join("") + "</div>" +
      '<div class="bbox"><h3>Ship <small>credits ¢</small></h3>' + SHIP.map((d) => this.upgRow(d, "ship")).join("") + "</div></div></div>" +
      '<div class="bfoot"><button class="btn" data-act="auto">Load strongest ' + cap + '</button><button class="btn sell" data-act="sellall"' + (loose ? "" : " disabled") + ">Sell all not aboard (" + loose + ')</button><button class="btn harvest" data-act="harvestall"' + (loose ? "" : " disabled") + ">Harvest all not aboard (" + loose + ")</button>" +
      '<button class="btn launch" data-act="launch"' + (n ? "" : " disabled") + ">🚀 LAUNCH to " + next.name + "  (" + n + "/" + cap + " aboard)</button></div>";
    const ui = this.el.querySelector("#base-ui");
    for (const c of ui.querySelectorAll(".card")) c.onclick = () => this.clickCard(+c.dataset.uid);
    for (const b of ui.querySelectorAll("[data-act]")) b.onclick = () => this.act(b.dataset.act);
    for (const b of ui.querySelectorAll("[data-buy]")) b.onclick = () => this.buy(b.dataset.buy);
  },

  clickCard(uid) {
    if (this.busy) return;
    const u = this.roster.find((x) => x.uid === uid); if (!u) return;
    const i = this.sel.indexOf(u);
    if (i >= 0) this.sel.splice(i, 1); else { this.sel.push(u); if (this.sel.length > 2) this.sel.shift(); }
    SFX.play("ui"); this.keepScroll(() => this.render());
  },
  keepScroll(fn) { const c = this.el.querySelector("#b-cards"), s = c ? c.parentNode.scrollTop : 0; fn(); const d = this.el.querySelector("#b-cards"); if (d) d.parentNode.scrollTop = s; },

  buy(key) {
    const [kind, id] = key.split(":"), d = (kind === "forge" ? FORGE : SHIP).find((x) => x.id === id), m = Game.meta;
    const lvl = kind === "forge" ? Game.forge(id) : Game.shipUpg(id), cost = this.cost(d, lvl);
    if (lvl >= d.max) return;
    if (kind === "forge") { if (m.materials < cost) return; m.materials -= cost; m.forge[id] = lvl + 1; }
    else { if (m.credits < cost) return; m.credits -= cost; m.ship[id] = lvl + 1; }
    for (const u of this.roster) { recalcUnit(u); u.hp = u.maxHp; }
    SFX.play("buy"); this.tween(); this.keepScroll(() => this.render()); this.sync();
  },

  remove(u) { let i = this.roster.indexOf(u); if (i >= 0) this.roster.splice(i, 1); i = this.sel.indexOf(u); if (i >= 0) this.sel.splice(i, 1); delete this.cargo[u.uid]; },

  act(a) {
    if (this.busy) return;
    const g = Game;
    if (a === "auto") { this.autoPick(); SFX.play("ui"); this.keepScroll(() => this.render()); return; }
    if (a === "swap") { this.sel.reverse(); SFX.play("ui"); this.keepScroll(() => this.render()); return; }
    if (a === "load") {
      const u = this.sel[0]; if (!u) return;
      if (this.cargo[u.uid]) delete this.cargo[u.uid];
      else if (this.aboard().length >= this.cap()) { SFX.play("fail"); this.flash("The cargo pods are full — " + this.cap() + " beasts. Buy Cargo Pods or take one off."); return; }
      else this.cargo[u.uid] = 1;
      SFX.play("ui"); this.keepScroll(() => this.render()); return;
    }
    if (a === "sell" || a === "harvest") { const u = this.sel[0]; if (u) this.process([u], a); return; }
    if (a === "sellall" || a === "harvestall") { this.process(this.roster.filter((u) => !this.cargo[u.uid]), a === "sellall" ? "sell" : "harvest"); return; }
    if (a === "breed") { this.breed(); return; }
    if (a === "launch") {
      const crew = this.aboard(); if (!crew.length) return;
      const left = this.roster.filter((u) => !this.cargo[u.uid]);
      if (left.length && !this.confirmLaunch) { this.confirmLaunch = true; this.flash(left.length + " beast(s) are not aboard. Launch again to sell them at the dock for ¢" + left.reduce((s, u) => s + beastValue(u), 0).toLocaleString() + "."); return; }
      this.confirmLaunch = false;
      for (const u of left) g.meta.credits += beastValue(u);
      this.busy = true; this.el.classList.add("depart"); SFX.play("engine");
      setTimeout(() => { this.close(); g.nextPlanet(crew); }, 1500);
    }
  },

  flash(text) { const d = document.createElement("div"); d.className = "bflash"; d.textContent = text; this.el.querySelector("#base-fx").appendChild(d); setTimeout(() => d.remove(), 3600); },

  // sell / harvest, one beast or hundreds: each card is animated out, a little after the last
  process(list, mode) {
    if (!list.length) return;
    this.busy = true; this.confirmLaunch = false;
    const fx = this.el.querySelector("#base-fx"), target = this.el.querySelector(mode === "sell" ? "#b-cr" : "#b-mt").getBoundingClientRect();
    let total = 0, shown = 0;
    list.forEach((u, idx) => {
      const v = beastValue(u), gain = mode === "sell" ? v : Math.round(v * 0.4); total += gain;
      const card = this.el.querySelector('.card[data-uid="' + u.uid + '"]');
      if (!card || shown > 40) return;
      const r = card.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) return;
      const delay = Math.min(shown++ * 45, 1400);
      setTimeout(() => {
        card.classList.add(mode === "sell" ? "sold" : "shredded");
        SFX.play(mode === "sell" ? "coin" : "shred", 0.7, 0.9 + Math.random() * 0.3);
        for (let i = 0; i < (mode === "sell" ? 5 : 9); i++) {
          const p = document.createElement("i"); p.className = mode === "sell" ? "coin" : "chunk";
          if (mode !== "sell") p.style.background = TYPES[u.sp.types[0]].color;
          p.style.left = r.left + r.width / 2 + "px"; p.style.top = r.top + r.height / 2 + "px";
          p.style.setProperty("--dx", target.left + target.width / 2 - (r.left + r.width / 2) + "px"); p.style.setProperty("--dy", target.top - (r.top + r.height / 2) + "px");
          p.style.setProperty("--sx", (Math.random() - 0.5) * 120 + "px"); p.style.setProperty("--sy", (Math.random() - 0.5) * 90 - 30 + "px"); p.style.animationDelay = i * 35 + "ms";
          fx.appendChild(p); setTimeout(() => p.remove(), 1100 + i * 35);
        }
      }, delay);
    });
    const wait = Math.min(shown * 45, 1400) + 900;
    setTimeout(() => {
      for (const u of list) this.remove(u);
      if (mode === "sell") Game.meta.credits += total; else Game.meta.materials += total;
      this.busy = false; this.tween(); this.keepScroll(() => this.render()); this.sync();
    }, wait);
  },

  // the counters roll up to their new totals
  tween() {
    const step = () => {
      let moving = false;
      for (const k of ["credits", "materials"]) {
        const want = Game.meta[k], d = want - this.shown[k];
        if (Math.abs(d) > 1) { this.shown[k] += d * 0.18 + Math.sign(d); moving = true; } else this.shown[k] = want;
        const el = document.getElementById(k === "credits" ? "b-cr" : "b-mt");
        if (el) { el.textContent = (k === "credits" ? "¢ " : "⬢ ") + Math.round(this.shown[k]).toLocaleString(); el.classList.toggle("tick", moving); }
      }
      if (moving && Game.state === "base") requestAnimationFrame(step);
    };
    step();
  },

  // the gene lab: parents slide together, the helix spins, an egg wobbles, cracks — and out it comes
  breed() {
    const [a, b] = this.sel; if (!a || !b) return;
    const pv = breedPreview(a, b); if (!pv.ok) return;
    this.busy = true; this.confirmLaunch = false;
    const sp = pv.pure ? pv.sp : hybridSpecies(a.sp, b.sp, true);
    const kid = makeBeast(sp.id, pv.level, { team: 0, stars: pv.stars, gen: pv.gen, affix: a.affix || b.affix || null });   // an elite parent passes its trait on
    const wasAboard = this.cargo[a.uid] || this.cargo[b.uid];
    const lab = document.createElement("div"); lab.className = "lab";
    let helix = ""; for (let i = 0; i < 14; i++) helix += '<i style="--i:' + i + ";--c:" + TYPES[(i % 2 ? b : a).sp.types[0]].color + '"></i>';
    lab.innerHTML = '<div class="lab-stage">' + Sprites.thumbHtml(a.sp, "pa") + Sprites.thumbHtml(b.sp, "pb") + '<div class="helix">' + helix + '</div><div class="egg" style="--c:' + TYPES[sp.types[0]].color + ";--c2:" + TYPES[sp.types[sp.types.length - 1]].color + '"><b></b></div>' +
      '<div class="rays"></div>' + Sprites.thumbHtml(sp, "kid") + "</div>" +
      '<div class="lab-text"><b>' + (pv.pure ? "PUREBRED " : "HYBRID — ") + sp.name.toUpperCase() + "</b><span>Lv " + pv.level + (pv.stars ? " · " + "★".repeat(pv.stars) : "") + (kid.gen ? " · bloodline ⬡" + kid.gen : "") + " · " + sp.types.map((t) => TYPES[t].name).join(" / ") + " · " + Math.round(kid.maxHp) + " hp · " + Math.round(kid.atk) + " atk</span><small>click to continue</small></div>";
    this.el.appendChild(lab);
    SFX.play("gene"); setTimeout(() => SFX.play("hatch"), 2500);
    const done = () => {
      if (!lab.classList.contains("ready")) return;
      lab.remove(); this.remove(a); this.remove(b); this.roster.push(kid);
      if (wasAboard && this.aboard().length < this.cap()) this.cargo[kid.uid] = 1;
      this.sel = [kid]; this.busy = false; this.keepScroll(() => this.render()); this.sync();
    };
    setTimeout(() => lab.classList.add("ready"), 3100);
    lab.onclick = done;
  },

  dismiss() { const lab = this.el && this.el.querySelector(".lab.ready"); if (lab) lab.click(); },

  close() {
    cancelAnimationFrame(this.raf);
    this.el.classList.add("hidden"); this.el.classList.remove("depart");
    document.getElementById("hud").classList.remove("hidden");
  },

  // backdrop: drifting stars, the planet you just stripped turning below, the dock's lights
  startBg() {
    const cv = document.getElementById("base-bg"), ctx = cv.getContext("2d"), hue = Game.planet().hue;
    if (!this.stars) { this.stars = []; for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 3 : 2, v: 0.004 + Math.random() * 0.012, p: Math.random() * 6 }); }
    const draw = (ts) => {
      if (Game.state !== "base") return;
      const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight, t = ts / 1000;
      ctx.fillStyle = "#05060e"; ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) { const x = ((s.x - t * s.v) % 1 + 1) % 1; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p); ctx.fillStyle = "#dfe8ff"; ctx.fillRect(Math.round(x * W), Math.round(s.y * H), s.s, s.s); }
      ctx.globalAlpha = 1;
      // the planet: banded, slowly turning, lit from the upper left
      const R = Math.max(W, H) * 0.42, cx = W * 0.16, cy = H + R * 0.42;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip(); ctx.filter = "hue-rotate(" + hue + "deg)";
      const cols = ["#3f8a3a", "#2a5ea8", "#5cae48", "#c89a54", "#3674c0", "#70c054", "#c4d8ec"];
      for (let i = 0; i < 26; i++) { ctx.fillStyle = cols[(i * 5) % cols.length]; const y = cy - R + (i / 26) * R * 2; ctx.fillRect(cx - R, y, R * 2, R / 12); ctx.fillStyle = cols[(i * 3 + 2) % cols.length]; const ox = ((t * 9 + i * 97) % (R * 2)); ctx.fillRect(cx - R + ox, y, R * 0.5, R / 12); }
      ctx.filter = "none";
      const sh = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.6, R * 0.2, cx, cy, R * 1.05); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(2,3,10,0.88)");
      ctx.fillStyle = sh; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.restore();
      // dock gantry lights
      for (let i = 0; i < 9; i++) { ctx.fillStyle = (Math.floor(t * 2) + i) % 3 === 0 ? "#ffd84a" : "#3a2c10"; ctx.fillRect(W - 26, 40 + i * 44, 8, 8); ctx.fillRect(18, H - 60 - i * 44, 8, 8); }
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  },
};
