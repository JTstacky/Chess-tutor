"use strict";
// ui.js — DOM HUD, minimap, banners, and the Horde / Upgrades / Menu panels.

const UI = {
  el: {}, openPanel: null, dirtyHud: true, dirtyArmy: true, hudT: 0, mapT: 0, bannerT: 0, regionT: 0, hordeTab: "march",

  $(id) { return document.getElementById(id); },

  init() {
    for (const id of ["hud", "hp-fill", "hp-text", "rn-fill", "rn-text", "horde-count", "den-count", "essence", "minimap", "region-name", "objective",
      "bossbar", "boss-name", "boss-fill", "region-toast", "banner", "banner-title", "banner-sub", "toasts", "panel", "panel-inner", "title",
      "btn-continue", "btn-new", "btn-upgrades", "stick", "lv-lbl", "xp-fill", "xp-text", "frenzy", "frenzy-count", "frenzy-mult", "frenzy-fill",
      "boons", "boon-title", "boon-cards", "prompt", "cores", "resonance"]) this.el[id] = this.$(id);
    this.el.prompt.onclick = () => { SFX.unlock(); if (Game.nearRocket()) Game.tryLaunch(); else Game.recallToShip(); };
    this.el["btn-continue"].onclick = () => { SFX.unlock(); Game.continueGame(); };
    this.el["btn-new"].onclick = () => {
      SFX.unlock();
      if (Game.hasSave() && !this.confirmNew) { this.confirmNew = true; this.el["btn-new"].textContent = "Erase save & start?"; return; }
      Game.startNew();
    };
    for (const b of document.querySelectorAll("#menu-buttons button")) b.onclick = () => { SFX.unlock(); this.togglePanel(b.dataset.panel); };
    for (const b of document.querySelectorAll(".ab")) {
      const act = b.dataset.act;
      const fire = (e) => {
        e.preventDefault(); SFX.unlock();
        if (act === "bolt") { Input.held.bolt = true; return; }
        Game.onKey({ net: "Net", dash: "ShiftLeft", stomp: "KeyC", charge: "KeyG", recall: "KeyR", horn: "KeyF", stance: "Stance" }[act]);
      };
      b.addEventListener("touchstart", fire, { passive: false });
      b.addEventListener("mousedown", fire);
      const up = () => { if (act === "bolt") Input.held.bolt = false; };
      b.addEventListener("touchend", up); b.addEventListener("mouseup", up); b.addEventListener("mouseleave", up);
    }
    this.el.panel.addEventListener("mousedown", (e) => { if (e.target === this.el.panel) this.togglePanel(this.openPanel); });
    this.mapCtx = this.el.minimap.getContext("2d");
  },

  showTitle(hasSave) {
    this.el.title.classList.remove("hidden"); this.el.hud.classList.add("hidden");
    this.el["btn-continue"].classList.toggle("hidden", !hasSave);
  },
  hideTitle() { this.el.title.classList.add("hidden"); this.el.hud.classList.remove("hidden"); },
  refreshAll() { this.dirtyHud = true; this.dirtyArmy = true; this.hudT = 0; },

  // a contextual button above the ability bar (the rocket)
  setPrompt(text, hot) {
    if (text === this.promptText) return;
    this.promptText = text;
    this.el.prompt.classList.toggle("hidden", !text); this.el.prompt.classList.toggle("hot", !!hot);
    if (text) this.el.prompt.textContent = text;
  },

  banner(title, sub, color) {
    this.el["banner-title"].textContent = title; this.el["banner-title"].style.color = color || "#ffd84a";
    this.el["banner-sub"].textContent = sub || "";
    this.el.banner.classList.add("on"); this.bannerT = 3.4;
  },
  toast(text) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 2700);
  },
  regionToast(r) {
    const cap = levelCap(), danger = r.lvl[0] > cap + 3;
    this.el["region-toast"].innerHTML = '<div class="rn">' + r.name.toUpperCase() + '</div><div class="rl' + (danger ? " danger" : "") + '">Beasts Lv ' + r.lvl[0] + "–" + r.lvl[1] +
      (danger ? "  ·  DANGER — far beyond your horde" : "") + "</div>";
    this.el["region-toast"].classList.add("on"); this.regionT = 3.5;
    this.el["region-name"].textContent = r.name;
  },

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove("on"); }
    if (this.regionT > 0) { this.regionT -= dt; if (this.regionT <= 0) this.el["region-toast"].classList.remove("on"); }
    if (Game.state === "title" || Game.state === "base") return;
    this.hudT -= dt; this.mapT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.drawHud(); }
    if (this.mapT <= 0) { this.mapT = 0.25; this.drawMinimap(); }
    if (this.openPanel === "horde" && this.dirtyArmy) { this.renderPanel(); }
    // touch stick visual
    const s = Input.stick, st = this.el.stick;
    st.classList.toggle("on", s.id !== null);
    if (s.id !== null) { st.style.left = s.ox + "px"; st.style.top = s.oy + "px"; st.firstChild.style.transform = "translate(" + s.x * 40 + "px," + s.y * 40 + "px)"; }
  },

  drawHud() {
    const p = Game.player, r = Game.rank(), ranks = CONFIG.ranks, e = this.el;
    e["hp-fill"].style.width = clamp((p.hp / p.maxHp) * 100, 0, 100) + "%";
    e["hp-fill"].parentNode.classList.toggle("low", p.hp / p.maxHp < 0.3);
    e["hp-text"].textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    const next = ranks[Game.rankIndex + 1];
    e["rn-fill"].style.width = (next ? clamp(((Game.renown - r.renown) / (next.renown - r.renown)) * 100, 0, 100) : 100) + "%";
    const mt = Game.mechTier();
    e["rn-text"].textContent = (Game.rankIndex + 1) + " · " + r.name + (mt ? " · " + MECH_TIERS[mt].name : "") + (Game.rankLocked() ? " · 🔒 fell a Titan" : "");
    e["lv-lbl"].textContent = "LV " + Game.binderLevel;
    const need = Game.binderXpNeed(Game.binderLevel);
    e["xp-fill"].style.width = clamp((Game.binderXp / need) * 100, 0, 100) + "%";
    e["xp-text"].textContent = Math.floor(Game.binderXp) + " / " + need + " xp";
    // frenzy meter
    const f = Game.frenzy;
    e.frenzy.classList.toggle("hidden", f < 3);
    if (f >= 3) {
      if (f !== this.lastFrenzy) { e.frenzy.classList.remove("pop"); void e.frenzy.offsetWidth; e.frenzy.classList.add("pop"); }
      e["frenzy-count"].innerHTML = f + "<small>FRENZY</small>";
      e["frenzy-mult"].textContent = "×" + Game.frenzyMult().toFixed(2) + " xp & essence";
      e["frenzy-fill"].style.width = clamp((Game.frenzyT / Game.frenzyWindow()) * 100, 0, 100) + "%";
      e.frenzy.classList.toggle("hot", f >= 50);
      e.frenzy.style.transform = "scale(" + (1 + Math.min(0.5, f / 200)) + ")";
    }
    this.lastFrenzy = f;
    let up = 0; for (const u of Game.army) if (!u.down) up++;
    e["horde-count"].textContent = "HORDE " + up + "/" + Game.armyCap();
    e["den-count"].textContent = "DEN " + Game.reserve.length;
    e.essence.textContent = "◆ " + Game.essence;
    let pips = ""; for (let i = 0; i < REGIONS.length; i++) pips += '<i class="' + (Game.titansDefeated[i] ? "on" : "") + '" style="--c:' + RUNE_COL[REGIONS[i].id] + '"></i>';
    e.cores.innerHTML = "<span>" + Game.planet().name.toUpperCase() + "</span>" + pips;
    // upgrades affordable?
    let afford = false;
    for (const d of CONFIG.upgrades) if (Game.upg(d.id) < d.max && Game.upgradeCost(d.id) <= Game.essence) afford = true;
    e["btn-upgrades"].classList.toggle("pulse", afford && Game.atCamp());

    // abilities
    const C = CONFIG.player;
    const cds = { bolt: 0, net: p.netT / C.netCd, dash: p.dashCd / C.dashCd, stomp: p.stompCd / CONFIG.stompCd, charge: 0, recall: 0, horn: p.hornCd / (p.hornCdMax || C.hornCd) };
    for (const b of document.querySelectorAll(".ab")) {
      const act = b.dataset.act, f = clamp(cds[act] || 0, 0, 1);
      b.lastElementChild.style.height = f * 100 + "%";
      b.classList.toggle("active", (act === "horn" && Game.hornT > 0) || (act === "charge" && Game.chargeT > 0));
      b.classList.toggle("off", ((act === "charge" || act === "recall" || act === "horn") && !Game.army.length) || (act === "stomp" && !Game.mechTier()));
      if (act === "stance") { const S = Game.stance(); b.children[1].textContent = S.name; b.style.borderColor = S.color; }
      if (act === "dash") b.classList.toggle("active", p.riposte > 0);
    }
    // resonance chips: every element bond the marching horde has, and how deep it runs
    const rk = Object.keys(Game.resonance).map((id) => id + Game.resonance[id]).join(",");
    if (rk !== this.lastRes) {
      this.lastRes = rk;
      e.resonance.innerHTML = RESONANCE.filter((R) => Game.resonance[R.id]).map((R) => {
        const l = Game.resonance[R.id], col = R.id === "stone" ? TYPES.rock.color : TYPES[R.id].color;
        return '<span style="--c:' + col + '" title="' + R.name + " " + (l === 2 ? "II" : "I") + ": " + R.desc(R.v[l - 1]) + '">' + R.name + (l === 2 ? " II" : "") + "</span>";
      }).join("");
      e.resonance.classList.toggle("hidden", !rk);
    }

    // boss bar
    const t = Director.activeTitan();
    e.bossbar.classList.toggle("hidden", !t);
    if (t) { e["boss-name"].textContent = t.name + "  ·  Lv " + t.level; e["boss-fill"].style.width = clamp((t.hp / t.maxHp) * 100, 0, 100) + "%"; }

    e.objective.innerHTML = this.objectiveHtml();
  },

  objectiveHtml() {
    const g = Game;
    if (g.fuelled()) return "<b>Fly home</b><small>All six Titan cores are aboard. Bind whatever else you want to sell — then walk up to your <b>rocket</b> at camp (green arrow) and press <b>Enter</b>. Only your catch comes with you.</small>";
    if (g.stats.bound === 0) return "<b>Bind your first beast</b><small>Hold click to blast a wild beast with your staff. When it is weak — or dazed — throw your net with right-click or Space.</small>";
    if (g.stats.bound < 3) return "<b>Grow your pack (" + g.stats.bound + "/3)</b><small>Your beasts fight on their own. Beasts they defeat are <b>dazed</b>: net them or simply walk over them to bind.</small>";
    const nt = g.nextTitanIndex();

    const r = REGIONS[nt], ready = levelCap() + 6 >= r.titanLvl && g.army.length >= Math.min(g.armyCap(), 4 + nt * 6);
    let tip = ready ? "Follow the gold arrow to its lair." : "Too strong for now — bind more beasts, rank up, and fuse triples into ★ beasts.";
    const gate = r.gate | 0;
    if (gate > g.mechTier()) tip = "Its land lies beyond " + (gate === 2 ? "a river" : gate === 3 ? "a wall of rock" : "a bottomless chasm") + ": only a <b>" + MECH_TIERS[gate].name + "</b> frame (" + gate + " Titan cores) can cross.";
    if (g.essence >= 40 && !g.atCamp() && g.stats.bound >= 3 && Object.keys(g.upgrades).length === 0) tip += " Essence is spent on upgrades at your ship.";
    if (g.army.length < g.armyCap() && !g.reserve.length) tip += " Your horde has " + (g.armyCap() - g.army.length) + " open slot(s).";
    return "<b>Titan core " + (g.cores() + 1) + "/" + REGIONS.length + ": " + r.titanName + "</b><small>Lv " + r.titanLvl + " · " + r.name + ". " + tip + "</small>";
  },

  drawMinimap() {
    const c = this.mapCtx, S = 152, N = CONFIG.worldTiles, T = CONFIG.tile, p = Game.player;
    // a window of the world centred on the player (the whole island would be unreadable at this size)
    const span = 96, half = span / 2;
    const cx = clamp(p.x / T, half, N - half), cy = clamp(p.y / T, half, N - half);
    c.imageSmoothingEnabled = false;
    c.drawImage(World.minimap, cx - half, cy - half, span, span, 0, 0, S, S);
    const k = S / span, mx = (wx) => (wx / T - (cx - half)) * k, my = (wy) => (wy / T - (cy - half)) * k;
    const dot = (wx, wy, col, s) => { const x = mx(wx), y = my(wy); if (x < 0 || y < 0 || x > S || y > S) return; c.fillStyle = "#000"; c.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2); c.fillStyle = col; c.fillRect(x - s / 2, y - s / 2, s, s); };
    for (const h of Game.hostiles) {
      if (h.removed) continue;
      if (h.dazed || h.cowed) dot(h.x, h.y, "#7be0ff", 2);
      else if (h.hunter) dot(h.x, h.y, "#ff5a5a", 3);
      else if (h.alpha) dot(h.x, h.y, "#ffb03a", 3);
    }
    for (let i = 0; i < REGIONS.length; i++) dot(REGIONS[i].lair[0] * T, REGIONS[i].lair[1] * T, Game.titansDefeated[i] ? "#7a8aa8" : "#ffd84a", 6);
    dot(CAMP.tx * T, CAMP.ty * T, "#ffffff", 5);
    if (Game.chargeT > 0) dot(Game.rally.x, Game.rally.y, "#ff8a3a", 4);
    dot(p.x, p.y, "#5cf08a", 5);
  },

  // ---------------------------------------------------------------- boon pick
  showBoons() {
    Game.state = "boon";
    // keys/mouse keep tracking while paused (their release events still arrive), so nothing to reset
    this.el.banner.classList.remove("on"); this.el["region-toast"].classList.remove("on");
    this.boonChoices = Game.rollBoons();
    this.el["boon-title"].textContent = "LEVEL " + (Game.binderLevel - Game.pendingBoons + 1);
    this.el["boon-cards"].innerHTML = this.boonChoices.map((b, i) => {
      const have = Game.boon(b.id);
      let pips = ""; for (let k = 0; k < b.max; k++) pips += '<i class="' + (k < have + 1 ? "on" : "") + '"></i>';
      return '<div class="boon ' + b.rarity + '" data-i="' + i + '"><span class="hot">' + (i + 1) + '</span><div class="rar">' + b.rarity + '</div><div class="bn">' + b.name + '</div><div class="bd">' + b.desc + "</div>" +
        (b.max > 1 ? '<div class="pips">' + pips + "</div>" : "") + "</div>";
    }).join("");
    this.el.boons.classList.remove("hidden");
    this.boonShownAt = performance.now();
    for (const c of this.el["boon-cards"].children) c.onclick = () => this.pickBoon(+c.dataset.i);
    SFX.play("boon");
  },
  pickBoon(i) {
    // swallow clicks from the fight that was raging when the cards appeared
    if (Game.state !== "boon" || !this.boonChoices[i] || performance.now() - this.boonShownAt < 350) return;
    Game.takeBoon(this.boonChoices[i]);
    this.toast(this.boonChoices[i].name + " acquired");
    this.el.boons.classList.add("hidden");
    Game.state = "play"; Game.lastTs = performance.now();
    this.dirtyHud = true;
  },

  // ---------------------------------------------------------------- panels
  togglePanel(name) {
    if (Game.state === "title" || Game.state === "dead" || Game.state === "boon") return;
    SFX.play("ui");
    if (this.openPanel === name || !name) { this.openPanel = null; this.el.panel.classList.add("hidden"); Game.state = "play"; Game.lastTs = performance.now(); return; }
    this.openPanel = name; Game.state = "panel";
    this.el.panel.classList.remove("hidden");
    this.renderPanel();
  },

  tabsHtml() {
    const t = (id, label) => '<button data-tab="' + id + '" class="' + (this.openPanel === id ? "on" : "") + '">' + label + "</button>";
    return '<div class="tabs">' + t("horde", "Horde") + t("upgrades", "Upgrades") + t("journey", "Journey") + t("pause", "Menu") + '<button data-tab="" class="close">Resume ✕</button></div>';
  },

  cardHtml(u, where) {
    const types = u.sp.types.map((t) => '<i style="background:' + TYPES[t].color + '" title="' + TYPES[t].name + '"></i>').join("");
    const role = u.sp.heal ? "heal" : u.style === "melee" ? "melee" : u.style === "lob" ? "splash" : "ranged";
    return '<div class="card' + (u.down ? " down" : "") + (u.titan ? " titan" : "") + '" data-uid="' + u.uid + '" data-where="' + where + '" title="' + u.sp.flavor.replace(/"/g, "&quot;") + '">' +
      '<div class="ty">' + types + '</div><div class="role">' + role + "</div>" +
      Sprites.thumbHtml(u.sp, "", u.titan) + '<div class="st">' + "★".repeat(u.stars) + (u.gen ? '<span class="gen">⬡' + u.gen + "</span>" : "") + this.affixTag(u) + '</div><div class="nm">' + u.name + '</div><div class="lv">Lv ' + u.level + (u.down ? " · resting" : "") + "</div>" +
      '<div class="mini"><i style="width:' + Math.round((u.hp / u.maxHp) * 100) + '%"></i></div></div>';
  },

  affixTag(u) {
    if (!u.affix) return "";
    const A = AFFIXES[u.affix];
    return '<span class="affix" style="--c:' + A.color + '" title="' + A.name + ": " + A.ally + '">◆</span>';
  },

  resonanceHtml() {
    const g = Game, n = g.army.length;
    let h = "<h3>Stance — keys 1 · 2 · 3</h3><div class='btn-row'>";
    for (const id in STANCES) { const S = STANCES[id]; h += '<button class="btn' + (g.stanceId === id ? " on" : "") + '" data-stance="' + id + '" title="' + S.desc + '" style="border-color:' + S.color + '">' + S.key + " · " + S.name + "</button>"; }
    h += "</div><div class='sub'>" + g.stance().desc + "</div>";
    h += "<h3>Elemental resonance</h3><div class='sub'>When a quarter of the marching horde (at least 2) shares an element it forms a bond; half of it (at least 4) forms a deep one. Rock, ground and steel resonate together as Stone. Choose who marches in the Den below.</div><div class='resgrid'>";
    for (const R of RESONANCE) {
      let c = 0; for (const u of g.army) if (u.sp.types.some((t) => R.types.indexOf(t) >= 0)) c++;
      const l = g.resonance[R.id] || 0, col = R.id === "stone" ? TYPES.rock.color : TYPES[R.id].color;
      const need1 = Math.max(2, Math.ceil(n * 0.25)), need2 = Math.max(4, Math.ceil(n * 0.5));
      h += '<div class="rescard' + (l ? " on" : "") + '" style="--c:' + col + '"><b>' + R.name + (l ? " " + (l === 2 ? "II" : "I") : "") + "</b><small>" + R.types.map((t) => TYPES[t].name).join(" / ") + " · " + c + " marching — " +
        (l === 2 ? "deep bond" : l === 1 ? need2 + " for II" : need1 + " for I") + "</small><small>" + R.desc(R.v[Math.max(0, l - 1)]) + (l ? "" : " (at I)") + "</small></div>";
    }
    return h + "</div>";
  },

  renderPanel() {
    this.dirtyArmy = false;
    const g = Game, el = this.el["panel-inner"];
    const scroll = el.scrollTop;
    let h = this.tabsHtml();
    if (this.openPanel === "horde") {
      const seen = Object.keys(g.seen).length;
      h += "<h2>YOUR HORDE</h2><div class='sub'>Rank " + (g.rankIndex + 1) + " · " + g.rank().name + " — commands <b>" + g.armyCap() + "</b> beasts · beasts train up to Lv " + levelCap() + " · species bound " + seen + "/" + SPECIES.length + "</div>";
      h += '<div class="btn-row"><button class="btn" data-do="best">Deploy strongest</button>' +
        '<button class="btn ' + (g.settings.autoFill ? "on" : "") + '" data-do="autofill">Auto-fill: ' + (g.settings.autoFill ? "ON" : "OFF") + "</button>" +
        '<button class="btn ' + (g.settings.autoFuse ? "on" : "") + '" data-do="autofuse">Auto-fuse triples: ' + (g.settings.autoFuse ? "ON" : "OFF") + "</button>" +
        '<button class="btn" data-do="fuse">Fuse now</button></div>';
      h += this.resonanceHtml();
      h += "<h3>Marching (" + g.army.length + "/" + g.armyCap() + ") — click to send to the Den</h3>";
      const army = g.army.slice().sort((a, b) => unitPower(b) - unitPower(a));
      h += army.length ? '<div class="cards">' + army.map((u) => this.cardHtml(u, "army")).join("") + "</div>" : '<div class="empty">No beasts yet. Weaken a wild beast and throw your net.</div>';
      h += "<h3>The Den (" + g.reserve.length + "/" + CONFIG.reserveMax + ") — click to deploy</h3>";
      const res = g.reserve.slice().sort((a, b) => unitPower(b) - unitPower(a));
      h += res.length ? '<div class="cards">' + res.map((u) => this.cardHtml(u, "den")).join("") + "</div>" : '<div class="empty">Beasts bound while your horde is full wait here. Three of the same species and star rank fuse into one ★ beast: bigger, tougher, stronger.</div>';
    } else if (this.openPanel === "upgrades") {
      const here = g.atCamp();
      h += "<h2>SHIP WORKSHOP</h2><div class='sub'>Spend essence <b style='color:#c8a0ff'>◆ " + g.essence + "</b> — earned from every beast and hunter your horde defeats. These last until you leave the planet.</div>" +
        (here ? "" : "<div class='notice'>⚠ Upgrades are fitted at your ship. Walk back to camp (white dot on the map) — or press <b>H</b> to be recalled" + (g.recallWait() ? " (beacon ready in " + g.recallWait() + "s)" : " (beacon ready)") + ".</div>") + "<div class='upgrades'>";
      for (const d of CONFIG.upgrades) {
        const lvl = g.upg(d.id), cost = g.upgradeCost(d.id), maxed = lvl >= d.max;
        let pips = ""; for (let i = 0; i < d.max; i++) pips += '<i class="' + (i < lvl ? "on" : "") + '"></i>';
        h += '<div class="upg"><div class="info"><div class="un">' + d.name + '</div><div class="ud">' + d.desc + '</div><div class="pips">' + pips + "</div></div>" +
          '<button data-upg="' + d.id + '"' + (maxed || cost > g.essence || !here ? " disabled" : "") + ">" + (maxed ? "MAX" : "◆ " + cost) + "</button></div>";
      }
      h += "</div>";
      const m = g.meta, perm = FORGE.filter((d) => g.forge(d.id)).map((d) => d.name + " ×" + g.forge(d.id)).concat(SHIP.filter((d) => g.shipUpg(d.id)).map((d) => d.name + " ×" + g.shipUpg(d.id)));
      h += "<h3>From the Hangar — permanent</h3><div class='sub'>¢ " + m.credits.toLocaleString() + " credits · ⬢ " + m.materials.toLocaleString() + " materials · " + (perm.length ? perm.join(" · ") : "nothing fitted yet. Fill the rocket's tanks with six Titan cores to fly to the Hangar: sell, harvest and breed your catch there.") + "</div>";
    } else if (this.openPanel === "journey") {
      h += "<h2>PLANET " + (g.meta.planet + 1) + " — " + g.planet().name.toUpperCase() + "</h2><div class='sub'>Six regions, six Titans, six cores for the rocket (" + g.cores() + "/6). Fell a Titan, then bind it — a colossus for your horde, or a fortune at the Hangar." +
        (g.meta.planet ? " Beasts here are " + Math.round((g.planetMult() - 1) * 100) + "% tougher than on your first world." : "") + "</div><div class='journey'>";
      REGIONS.forEach((r, i) => {
        const n = g.titansDefeated[i] || 0;
        h += '<div class="jr' + (n ? " done" : "") + '"><b>' + (i + 1) + ". " + r.name + "</b><small>Wild beasts Lv " + r.lvl[0] + "–" + r.lvl[1] + " · " + r.types.map((t) => TYPES[t].name).join(", ") + "</small>" +
          "<small>Titan: " + r.titanName + " (Lv " + r.titanLvl + ") — " + (n ? "felled ×" + n : "undefeated") + "</small>" +
          (r.gate ? "<small>Reached across " + (r.gate === 2 ? "a river" : r.gate === 3 ? "a rock ridge" : "the deep chasm") + " — needs a " + MECH_TIERS[r.gate].name + " frame</small>" : "") + "</div>";
      });
      h += "</div><h3>Bindframes — forged from Titan cores</h3><div class='journey'>";
      MECH_TIERS.forEach((M, i) => { if (i) h += '<div class="jr' + (g.cores() >= i ? " done" : "") + '"><b style="color:' + M.accent + '">' + i + " core" + (i > 1 ? "s" : "") + " · " + M.name + "</b><small>" + M.unlock + " · ranks to " + CONFIG.ranks[CONFIG.rankCapAtCores[i]].name + " (horde of " + CONFIG.ranks[CONFIG.rankCapAtCores[i]].cap + ")</small></div>"; });
      h += "</div><h3>Ranks</h3><div class='journey'>";
      CONFIG.ranks.forEach((r, i) => {
        const need = CONFIG.rankCapAtCores.findIndex((c) => c >= i);
        h += '<div class="jr' + (i <= g.rankIndex ? " done" : "") + '"><b>' + (i + 1) + ". " + r.name + "</b><small>" + r.renown.toLocaleString() + " renown · horde of " + r.cap + "</small>" +
          (need > 0 ? '<small style="color:' + MECH_TIERS[need].accent + '">' + (g.cores() >= need ? "⚙" : "🔒") + " needs the " + MECH_TIERS[need].name + " frame (" + need + " Titan core" + (need > 1 ? "s" : "") + ")</small>" : "") + "</div>";
      });
      const mine = CONFIG.boons.filter((b) => g.boon(b.id));
      h += "</div><h3>Binder level " + g.binderLevel + " — boons</h3>" + (mine.length ? '<div class="boonlist">' + mine.map((b) => "<span>" + b.name + " <b>×" + g.boon(b.id) + "</b></span>").join("") + "</div>" : '<div class="empty">Level up to choose boons.</div>');
      h += "<h3>Record</h3><div class='sub'>Beasts bound " + g.stats.bound + " · foes defeated " + g.stats.defeated + " · fusions " + g.stats.fused + " · best frenzy " + g.frenzyBest + " · falls " + g.stats.deaths + "</div>";
    } else {
      h += "<h2>PAUSED</h2><div style='margin:0 0 14px'><button class='btn' data-tab='' style='font-size:16px;padding:10px 26px'>▶ Resume (P / Esc)</button></div><div class='guide'><b>The job.</b> You are an intergalactic poacher. Strip this planet of its beasts, take the six Titans' cores to fuel your rocket, then fly to the Hangar to <b>sell</b>, <b>harvest</b> and <b>breed</b> your catch — and take the best six on to the next world.<br><b>Bind.</b> Blast wild beasts with your staff, then net them. The weaker they are, the surer the bind.<br>" +
        "<b>Command.</b> Bound beasts march with you and fight on their own. Anything they defeat is <b>dazed</b> — a guaranteed bind. Fell a pack's crowned <b>Alpha</b> and the whole pack submits.<br>" +
        "<b>Grow.</b> Renown raises your rank and the size of your horde. Three identical beasts fuse into a ★ beast. Fell the six Titans — and bind them.<br>" +
        "<b>Ascend.</b> Every level offers a boon (keys 1–3). Chain kills into a <b>Frenzy</b> for bonus XP and essence. Every <b>Titan core</b> is forged into your <b>Bindframe</b> — a bigger, stronger frame, and only a bigger frame can command a bigger horde (ranks lock until the next Titan falls). Frames <b>stomp</b> (C), trample small beasts underfoot, and the bigger ones simply <b>wade rivers, stride over rock ridges and cross the chasm</b> that wall off the deadlier regions. Essence upgrades are fitted at your <b>ship</b>, at camp.</div>" +
        "<div class='guide' style='margin-top:8px'><b>Fight smart.</b> You always face the cursor: <b>Q / E</b> strafe around a foe while your staff stays on it. Dash <i>through</i> a blow at the last moment for a <b>Perfect Dodge</b> — time slows, the dash is ready again and your next shot is a <b>Riposte</b>. Pack <b>Alphas</b> wind up telegraphed charges, stomps, breaths and barrages — get out of the red. <b>Elites</b> (a ◆ and a coloured ring) carry a trait they keep once bound: a <b>Warded</b> one shrugs off damage until your net shatters its ward; a <b>Volatile</b> one explodes a moment after it is dazed. Set the horde's <b>stance</b> with 1 · 2 · 3, and march beasts that share an element for <b>Resonance</b> bonuses (Tab).</div>" +
        "<h3>Controls</h3><div class='keys'><div><b>WASD / Arrows</b> move</div><div><b>Q / E</b> strafe left / right</div><div><b>Hold Left Click</b> staff bolts</div><div><b>Right Click / Space</b> throw net</div><div><b>Shift</b> dash (perfect dodge)</div>" +
        "<div><b>G / Middle Click</b> charge to cursor</div><div><b>1 · 2 · 3</b> stance: swarm · guard · hunt</div><div><b>R</b> recall horde</div><div><b>F</b> war horn</div><div><b>Tab</b> horde · <b>U</b> workshop</div><div><b>C</b> stomp (Bindframe)</div><div><b>P</b> / <b>Esc</b> pause</div><div><b>H</b> recall to your ship</div><div><b>Enter</b> launch (at the rocket)</div><div><b>Mouse wheel</b> zoom</div></div>" +
        '<h3>Options</h3><div class="btn-row"><button class="btn ' + (g.settings.muted ? "" : "on") + '" data-do="mute">Sound: ' + (g.settings.muted ? "OFF" : "ON") + "</button>" +
        '<button class="btn" data-do="camp">Recall to ship (H)' + (g.recallWait() ? " — " + g.recallWait() + "s" : "") + '</button><button class="btn danger" data-do="newgame">' + (this.confirmWipe ? "Really erase everything?" : "New journey (erase save)") + "</button></div>";
    }
    el.innerHTML = h;
    el.scrollTop = scroll;
    for (const b of el.querySelectorAll("[data-tab]")) b.onclick = () => { if (!b.dataset.tab) this.togglePanel(this.openPanel); else { this.openPanel = b.dataset.tab; SFX.play("ui"); this.renderPanel(); } };
    for (const b of el.querySelectorAll("[data-upg]")) b.onclick = () => { Game.buyUpgrade(b.dataset.upg); this.renderPanel(); this.dirtyHud = true; };
    for (const c of el.querySelectorAll(".card")) c.onclick = () => this.cardClick(+c.dataset.uid, c.dataset.where);
    for (const b of el.querySelectorAll("[data-do]")) b.onclick = () => this.panelAction(b.dataset.do);
    for (const b of el.querySelectorAll("[data-stance]")) b.onclick = () => { Game.setStance(b.dataset.stance); this.renderPanel(); };
  },

  cardClick(uid, where) {
    const g = Game;
    if (where === "army") {
      const u = g.army.find((x) => x.uid === uid);
      if (u) { u.benchedByPlayer = true; g.bench(u); }
    } else {
      const u = g.reserve.find((x) => x.uid === uid);
      if (u) { if (g.army.length >= g.armyCap()) { this.toast("Your horde is full — send a beast to the Den first"); SFX.play("fail"); return; } u.benchedByPlayer = false; g.deploy(u); }
    }
    SFX.play("ui");
    const fill = g.settings.autoFill; g.settings.autoFill = false;   // a manual swap must not be undone instantly
    g.afterRosterChange(); g.settings.autoFill = fill;
    this.renderPanel();
  },

  panelAction(act) {
    const g = Game;
    if (act === "best") {
      for (const u of g.army.slice()) g.bench(u);
      for (const u of g.reserve) u.benchedByPlayer = false;
      const fill = g.settings.autoFill; g.settings.autoFill = true; g.afterRosterChange(); g.settings.autoFill = fill;
    } else if (act === "autofill") { g.settings.autoFill = !g.settings.autoFill; g.afterRosterChange(); }
    else if (act === "autofuse") { g.settings.autoFuse = !g.settings.autoFuse; g.afterRosterChange(); }
    else if (act === "fuse") { if (!g.autoFuse()) this.toast("No three-of-a-kind to fuse"); g.afterRosterChange(); }
    else if (act === "mute") { g.settings.muted = !g.settings.muted; SFX.setMuted(g.settings.muted); }
    else if (act === "camp") { this.togglePanel(this.openPanel); g.recallToShip(); return; }
    else if (act === "newgame") {
      if (!this.confirmWipe) { this.confirmWipe = true; this.renderPanel(); return; }
      this.confirmWipe = false; this.togglePanel(this.openPanel); g.startNew(); return;
    }
    SFX.play("ui"); g.save();
    this.renderPanel();
  },

  showVictory() {
    this.banner("THE RIFT IS BROKEN", "Every Titan has fallen. You are the Apex of the wilds — and the hordes still come.", "#ffd84a");
    SFX.play("victory");
  },
};
