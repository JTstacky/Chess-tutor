"use strict";
// bestiary.js — the pixel icon set (assets/ui/icons, generated with gpt-image-2 and sliced by tools/slice_icons.py)
// and the Bestiary panel: every species on the planet, what you have sighted, what you have bound, where each one
// roams and how it fights. A species is "sighted" the first time its frames are requested for drawing, which is
// exactly the first time it is on screen (Game.sighted, saved with the game); "bound" is Game.seen.

const Icons = {
  // an inline pixel icon: element ids, or essence / credits / materials / core
  html(name, title, cls) {
    return '<img class="ico ' + (cls || "") + '" src="assets/ui/icons/' + name + '.png" alt="" draggable="false"' + (title ? ' title="' + title + '"' : "") + ">";
  },
  type(t, cls) { const T = TYPES[t]; return T ? this.html(t, T.name, cls) : ""; },
  types(list, cls) { return list.map((t) => this.type(t, cls)).join(""); },
};

const Bestiary = {
  filter: "all",           // all | bound | sighted | unknown | <element id>
  TIER_NAME: ["", "Common", "Uncommon", "Rare", "Epic", "Legendary"],
  TIER_COL: ["", "#9aa6c8", "#5cf08a", "#7be0ff", "#c8a0ff", "#ffd84a"],

  init() {
    // sighting hook: the frame loader is the one place every drawn beast passes through
    const orig = Sprites.beast.bind(Sprites);
    Sprites.beast = (sp) => {
      if (Game.state === "play" && sp && !sp.art) { const s = Game.sighted || (Game.sighted = {}); if (!s[sp.id]) s[sp.id] = true; }
      return orig(sp);
    };
  },

  status(sp) {
    if (Game.seen[sp.id] || (this._own && this._own[sp.id])) return "bound";
    if (Game.sighted && Game.sighted[sp.id]) return "sighted";
    return "unknown";
  },

  // where a species roams: the regions whose spawn table weights it, best first (the director's own formula)
  regions(sp) {
    const out = [];
    for (const r of REGIONS) {
      let v = r.tiers[sp.tier - 1] || 0;
      if (!v) continue;
      v *= sp.types.some((t) => r.types.indexOf(t) >= 0) ? 6 : 0.45;
      out.push({ r, v });
    }
    return out.sort((a, b) => b.v - a.v).slice(0, 2).map((x) => x.r);
  },

  html() {
    const g = Game, list = SPECIES.filter((sp) => !sp.art);   // hybrids are runtime species; the wild list is the planet's
    const bound = list.filter((sp) => g.seen[sp.id]).length, sighted = list.filter((sp) => this.status(sp) !== "unknown").length;
    const titanOf = {}; REGIONS.forEach((r, i) => { titanOf[r.titan] = { r, i }; });
    const inHorde = {}; for (const u of g.army.concat(g.reserve)) inHorde[u.sp.art || u.sp.id] = (inHorde[u.sp.art || u.sp.id] || 0) + 1;
    this._own = inHorde;   // anything marching or in the Den counts as bound, whatever the record says
    const maxStat = { hp: 0, atk: 0, spd: 0 }; for (const sp of list) for (const k in maxStat) maxStat[k] = Math.max(maxStat[k], sp[k]);
    const f = this.filter;
    const shown = list.filter((sp) => f === "all" ? true : f === "bound" || f === "sighted" || f === "unknown" ? this.status(sp) === f : sp.types.indexOf(f) >= 0)
      .sort((a, b) => a.tier - b.tier || (a.hp + a.atk + a.spd) - (b.hp + b.atk + b.spd));
    let h = "<h2>BESTIARY</h2><div class='sub'>" + list.length + " species roam " + g.planet().name + " · <b style='color:var(--green)'>" + bound + " bound</b> · " + sighted +
      " sighted. A sighted beast shows its shape; bind one to learn how it lives. Wild beasts are drawn to regions of their own element.</div>";
    const chip = (id, label) => '<button class="btn bf' + (f === id ? " on" : "") + '" data-bf="' + id + '">' + label + "</button>";
    h += "<div class='btn-row bfilters'>" + chip("all", "All") + chip("bound", "Bound") + chip("sighted", "Sighted") + chip("unknown", "Unknown") + "</div><div class='btn-row bfilters'>";
    for (const t in TYPES) h += chip(t, Icons.type(t) + TYPES[t].name);
    h += "</div><div class='bgrid'>";
    for (const sp of shown) {
      const st = this.status(sp), T = titanOf[sp.id], n = inHorde[sp.id] || 0;
      const role = sp.heal ? "healer" : sp.move.style === "melee" ? "melee" : sp.move.style === "lob" ? "splash" : sp.move.style === "homing" ? "homing" : "ranged";
      const bar = (k) => '<span class="sb"><i style="width:' + Math.round((sp[k] / maxStat[k]) * 100) + '%"></i></span>';
      h += '<div class="bent ' + st + (T ? " titan" : "") + '" style="--tc:' + this.TIER_COL[sp.tier] + '">' +
        '<div class="btop"><span class="btier" title="' + this.TIER_NAME[sp.tier] + '">' + "◆".repeat(sp.tier) + "</span>" + (n ? '<span class="bown" title="In your horde and Den">×' + n + "</span>" : "") + "</div>" +
        '<span class="thumb"><img src="' + Sprites.thumbUrl(sp) + '" alt=""></span>' +
        '<div class="bnm">' + (st === "unknown" ? "???" : sp.name) + "</div>" +
        '<div class="bty">' + Icons.types(sp.types) + "</div>" +
        (st === "bound"
          ? '<div class="bmv"><b>' + sp.move.name + "</b> · " + role + "</div>" +
            '<div class="bst"><small>HP</small>' + bar("hp") + "<small>ATK</small>" + bar("atk") + "<small>SPD</small>" + bar("spd") + "</div>" +
            '<div class="bfl">' + sp.flavor + "</div>"
          : st === "sighted" ? '<div class="bmv">' + role + " · bind one to learn more</div>" : '<div class="bmv">not yet sighted</div>') +
        (T ? '<div class="breg titan">Titan of ' + T.r.name + (g.titansDefeated[T.i] ? " · felled" : "") + "</div>" : '<div class="breg">' + this.regions(sp).map((r) => r.name.split(" ")[0]).join(" · ") + "</div>") +
        "</div>";
    }
    if (!shown.length) h += "<div class='empty'>Nothing here yet.</div>";
    return h + "</div>";
  },

  bind(el) {
    for (const b of el.querySelectorAll("[data-bf]")) b.onclick = () => { this.filter = b.dataset.bf; SFX.play("ui"); UI.renderPanel(); };
  },
};
