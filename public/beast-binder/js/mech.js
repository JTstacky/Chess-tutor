"use strict";
// mech.js — the Bindframe: the war-machine the Binder pilots. It is painted
// procedurally (same texel grid as the world) in six growing tiers, as separate
// parts — legs, body, arms — so it can stride, bob and swing. Each tier has its
// own armour palette and piles on animated spectacle: aura rings, a cape, energy
// wings, a halo, lightning. On top of the tier, the whole frame is drawn larger
// as the horde grows (Mech.grow), so it towers over a sea of beasts.
// The frame is the pilot's (js/heroes.js): its lights burn in the Binder's colour
// and the near arm carries their tool — the Vanguard's great sword (which swings
// with the blade combo and reaches further the bigger the frame: Mech.swordReach),
// the Trapper's grenade launcher, the Vet's beam emitter (Mech.tool / toolState).
// The frame's own auto-cannon sits on the shoulder (Mech.gunPos / muzzle).

const MECH_PAL = {
  steel:  ["#0e121c", "#343e56", "#56637f", "#8696b4", "#cbd8ec"],
  dark:   ["#090b12", "#1f2534", "#323b50", "#4a566f", "#6f7e9c"],
  brass:  ["#2a1a08", "#7a5218", "#b8842a", "#e0b04a", "#ffe08a"],
  jade:   ["#0c1614", "#2c4640", "#4a6e62", "#7ea08e", "#c8e6d2"],
  gun:    ["#121014", "#3a3640", "#5e5866", "#8e8896", "#d6d0dc"],
  gunDk:  ["#08070a", "#1c1a22", "#2e2a36", "#44404e", "#666070"],
  gold:   ["#3a2204", "#a86c10", "#e8a820", "#ffd85a", "#fff6c0"],
  blood:  ["#140608", "#431418", "#6e2222", "#a63a2e", "#f0906a"],
  bloodDk:["#080406", "#1e1012", "#34181a", "#502424", "#7a3a34"],
  ember:  ["#2a1004", "#8a4a10", "#d07818", "#ffae3a", "#ffe08a"],
  void:   ["#0a0614", "#241a44", "#3c2c6e", "#6650a8", "#b8a0f0"],
  voidDk: ["#05030a", "#140e26", "#221a3e", "#34285c", "#54448a"],
  amethyst:["#1a1030", "#6a4ab0", "#a07ae8", "#d0b0ff", "#f4e8ff"],
  ivory:  ["#2a2418", "#8a8068", "#c0b89c", "#e8e2cc", "#fffdf0"],
  ivoryDk:["#1a140a", "#4a3c1e", "#7a6430", "#a88c48", "#d8bc70"],
  clothRed:   ["#2a0604", "#6a1410", "#a02818", "#d04a20", "#ff8a3a"],
  clothViolet:["#1a0630", "#4a1684", "#7a2ec8", "#a860f8", "#e8c0ff"],
  clothGold:  ["#5a4410", "#b89030", "#f0d060", "#fff0a0", "#ffffff"],
};

const MECH_TIERS = [
  null,
  { name: "Strider", unlock: "Dash ends in a ground-slam",     s: 1.0,  accent: "#7be0ff", open: true,  steel: "steel", dark: "dark",    trim: "brass" },
  { name: "Warframe", unlock: "Wades through rivers and lakes",    s: 1.3,  accent: "#7dffb0", open: true,  steel: "jade",  dark: "dark",    trim: "brass" },
  { name: "Juggernaut", unlock: "Shoulder mortars · strides over rocks and ridges",  s: 1.7,  accent: "#ffd84a", open: false, steel: "gun",   dark: "gunDk",   trim: "gold",     smoke: ["#8a8894", "#5e5c68"] },
  { name: "Colossus", unlock: "Sweeping beam · crosses the deep chasm",    s: 2.2,  accent: "#ff8a3a", open: false, steel: "blood", dark: "bloodDk", trim: "ember",    cloth: "clothRed",    smoke: ["#ffae3a", "#ff5a1a", "#5a3a30"] },
  { name: "Titanframe", unlock: "Rune lightning strikes nearby foes",  s: 2.8,  accent: "#d080ff", open: false, steel: "void",  dark: "voidDk",  trim: "amethyst", cloth: "clothViolet", smoke: ["#d080ff", "#8a3adc", "#ffffff"] },
  { name: "Worldbinder", unlock: "Sunfall: light from orbit", s: 3.4,  accent: "#fff1b0", open: false, steel: "ivory", dark: "ivoryDk", trim: "gold",     cloth: "clothGold",   smoke: ["#fff6c0", "#ffd85a", "#ffffff"] },
];

const Mech = {
  cache: {},
  grow: 1,                    // horde-driven draw scale, eased toward growTarget() every frame

  // how much larger than its tier the frame is drawn, from the size of the horde
  growTarget(army) { return 1 + 0.75 * Math.sqrt(Math.min(army, 400) / 400); },
  update(dt, army) { this.grow = lerp(this.grow, this.growTarget(army), Math.min(1, dt * 1.2)); },

  // The frame is the pilot's: which Binder is riding (js/heroes.js) decides the colour of its lights and what
  // the near arm carries. The pick-card portrait passes a fake p with p.hero; in play it is Game.hero.
  heroOf(p) { return (p && p.hero) || (typeof Game !== "undefined" && Game.hero) || "blade"; },
  accentOf(hero, T) { const h = typeof HEROES !== "undefined" && HEROES[hero]; return (h && h.color) || T.accent; },

  parts(tier, hero) {
    hero = hero || this.heroOf();
    const key = tier + ":" + hero;
    if (this.cache[key]) return this.cache[key];
    const T = MECH_TIERS[tier], s = T.s, seed = tier * 97, accent = this.accentOf(hero, T);
    const ST = MECH_PAL[T.steel], DK = MECH_PAL[T.dark], TR = MECH_PAL[T.trim], CL = T.cloth ? MECH_PAL[T.cloth] : null;
    const R = (v) => Math.round(v * s);
    const one = Math.max(1, R(1));

    // ---- leg: thigh, knee, flared shin, foot. Anchor = hip joint (top centre).
    const lw = R(16) + 4, lh = R(21) + 2;
    const leg = new Painter(lw, lh), lcx = lw / 2;
    let m = leg.newMask(); leg.maskRect(m, lcx - R(2.5), 0, R(5), R(9)); leg.shade(m, DK, seed, 0.2, true);
    m = leg.newMask(); leg.maskPoly(m, [[lcx - R(3), R(8)], [lcx + R(3), R(8)], [lcx + R(4.5), R(17)], [lcx - R(4.5), R(17)]]); leg.shade(m, ST, seed + 1, 0.2, true);
    m = leg.newMask(); leg.maskPoly(m, [[lcx - R(5), R(21)], [lcx + R(6), R(21)], [lcx + R(5), R(17)], [lcx - R(4), R(17)]]); leg.shade(m, DK, seed + 3, 0.15, true);
    if (tier >= 3) {                                                 // toe claws
      m = leg.newMask(); leg.maskPoly(m, [[lcx + R(4.5), R(21)], [lcx + R(8), R(21)], [lcx + R(5), R(18)]]); leg.shade(m, TR, seed + 20, 0.1, true);
      m = leg.newMask(); leg.maskPoly(m, [[lcx - R(4), R(21)], [lcx - R(7), R(21)], [lcx - R(4), R(18.5)]]); leg.shade(m, TR, seed + 21, 0.1, true);
      leg.rect(lcx - R(4.5), R(16.5), R(9), one, TR[3]);
    }
    if (tier >= 4) { m = leg.newMask(); leg.maskPoly(m, [[lcx - R(1.5), R(8)], [lcx + R(2.5), R(8)], [lcx + R(4.5), R(1.5)]]); leg.shade(m, TR, seed + 22, 0.1, true); }
    m = leg.newMask(); leg.maskEllipse(m, lcx, R(8), R(tier >= 2 ? 3.8 : 3.2), R(tier >= 2 ? 3 : 2.6), seed, 0); leg.shade(m, TR, seed + 2, 0.1);
    leg.rect(lcx - R(2), R(11), one, R(tier >= 3 ? 5 : 3), accent);
    if (tier >= 5) leg.rect(lcx + R(1), R(11), one, R(5), accent);

    // ---- arm: pauldron, upper arm, cannon forearm. Anchor = shoulder centre (armAy).
    const ay0 = R(8), A = (v) => R(v) + ay0;
    const aw = R(20) + 4, ah = R(24) + ay0 + 2;
    const arm = new Painter(aw, ah), acx = aw / 2;
    m = arm.newMask(); arm.maskRect(m, acx - R(2), A(4), R(4), R(8)); arm.shade(m, DK, seed + 4, 0.2, true);
    const fw = tier >= 3 ? 4.5 : 3.5;
    m = arm.newMask(); arm.maskPoly(m, [[acx - R(fw), A(11)], [acx + R(fw), A(11)], [acx + R(fw + 0.5), A(21)], [acx - R(fw + 0.5), A(21)]]); arm.shade(m, ST, seed + 5, 0.2, true);
    if (tier >= 4) { m = arm.newMask(); arm.maskPoly(m, [[acx + R(4), A(11)], [acx + R(8.5), A(9)], [acx + R(5), A(20)]]); arm.shade(m, TR, seed + 23, 0.1, true); }   // forearm blade
    arm.rect(acx - R(fw - 1), A(21), R(fw * 2 - 2), Math.max(2, R(2)), "#0e121c");
    if (tier >= 3) { arm.rect(acx - R(3), A(21), R(2.2), Math.max(1, R(1.4)), accent); arm.rect(acx + R(0.8), A(21), R(2.2), Math.max(1, R(1.4)), accent); }
    else arm.rect(acx - R(1.5), A(21), R(3), Math.max(1, R(1.4)), accent);
    arm.rect(acx - R(fw), A(14), R(fw * 2), one, TR[3]);
    if (tier >= 5) { arm.rect(acx - R(fw), A(16.5), R(fw * 2), one, accent); arm.rect(acx - R(fw), A(19), R(fw * 2), one, accent); }   // energy coils
    if (tier >= 3) {
      // layered pauldron: trim under-plate, armour dome, rim
      m = arm.newMask(); arm.maskEllipse(m, acx + R(0.5), A(6.5), R(8), R(4.5), seed, 0); arm.shade(m, TR, seed + 24, 0.1);
      m = arm.newMask(); arm.maskEllipse(m, acx, A(4), R(8.5), R(6), seed, 0); arm.shade(m, ST, seed + 6, 0.15);
      arm.rect(acx - R(7), A(7.5), R(14), one, TR[3]);
      arm.rect(acx - R(1), A(1), R(2), R(4), accent);
      if (tier >= 4) {
        m = arm.newMask(); arm.maskPoly(m, [[acx + R(2), A(0)], [acx + R(7), A(3)], [acx + R(9.5), A(-7)]]); arm.shade(m, TR, seed + 7, 0.1, true);
        m = arm.newMask(); arm.maskPoly(m, [[acx - R(3.5), A(-1)], [acx + R(1), A(-1.5)], [acx - R(0.5), A(-6.5)]]); arm.shade(m, TR, seed + 25, 0.1, true);
      }
      if (tier >= 6) { m = arm.newMask(); arm.maskPoly(m, [[acx - R(8), A(2)], [acx - R(4.5), A(0)], [acx - R(7.5), A(-5)]]); arm.shade(m, TR, seed + 26, 0.1, true); }
    } else {
      m = arm.newMask(); arm.maskEllipse(m, acx, A(5), R(tier >= 2 ? 6.5 : 5.5), R(tier >= 2 ? 5.5 : 5), seed, 0); arm.shade(m, ST, seed + 6, 0.15);
      if (tier >= 2) arm.rect(acx - R(5.5), A(7), R(11), one, TR[3]);
    }

    // ---- body: pelvis, trapezoid torso, collar, head / open cockpit, tier extras.
    const drop = CL ? R(13) : 0;                                       // room below the pelvis for the tabard
    const bw = R(44) + 6, bh = R(40) + drop + 6;
    const body = new Painter(bw, bh), cx = bw / 2, base = bh - 1 - drop;   // base = pelvis bottom
    // back details first (they sit behind the torso)
    if (tier >= 2) {                                                   // antenna + pennant
      body.rect(cx - R(10), base - R(31), one, R(10), DK[3]);
      body.rect(cx - R(10) + one, base - R(31), R(3.5), R(2), accent);
      body.px(cx - R(10), base - R(31) - 1, "#ffffff");
    }
    if (tier >= 3) {
      for (const sx of [-1, 1]) {
        // exhaust stacks
        m = body.newMask(); body.maskRect(m, cx + sx * R(9) - R(1.5), base - R(33), R(3), R(12)); body.shade(m, DK, seed + 8, 0.15, true);
        body.rect(cx + sx * R(9) - R(1.5), base - R(33), R(3), one, accent);
        if (tier >= 4) {
          m = body.newMask(); body.maskRect(m, cx + sx * R(12.5) - R(1.2), base - R(30), R(2.5), R(9)); body.shade(m, DK, seed + 27, 0.15, true);
          body.rect(cx + sx * R(12.5) - R(1.2), base - R(30), R(2.5), one, accent);
        }
        // shoulder cannon, angled up and out
        m = body.newMask(); body.maskPoly(m, [[cx + sx * R(11), base - R(20)], [cx + sx * R(15.5), base - R(20)], [cx + sx * R(20), base - R(30)], [cx + sx * R(16.5), base - R(31.5)]]);
        body.shade(m, DK, seed + 28, 0.15, true);
        body.rect(cx + sx * R(18.2) - R(1.5), base - R(31.5), R(3), one * 2, accent);
      }
    }
    if (tier >= 5) {
      for (const sx of [-1, 1]) {                                      // wing roots — the energy wings spring from these
        m = body.newMask(); body.maskPoly(m, [[cx + sx * R(7), base - R(24)], [cx + sx * R(17), base - R(36)], [cx + sx * R(16), base - R(24)], [cx + sx * R(11), base - R(18)]]);
        body.shade(m, TR, seed + 9, 0.1, true);
      }
    }
    m = body.newMask(); body.maskRect(m, cx - R(8), base - R(5), R(16), R(5)); body.shade(m, DK, seed + 10, 0.2, true);
    m = body.newMask(); body.maskPoly(m, [[cx - R(8), base - R(4)], [cx + R(8), base - R(4)], [cx + R(12.5), base - R(21)], [cx - R(12.5), base - R(21)]]); body.shade(m, ST, seed + 11, 0.22);
    // chest plate + trim
    m = body.newMask(); body.maskPoly(m, [[cx - R(5), base - R(8)], [cx + R(5), base - R(8)], [cx + R(7), base - R(18)], [cx - R(7), base - R(18)]]); body.shade(m, DK, seed + 12, 0.15);
    body.rect(cx - R(12.5), base - R(21), R(25), Math.max(1, R(1.2)), TR[3]);
    body.rect(cx - R(8), base - R(5), R(16), one, TR[2]);
    if (tier >= 3) {                                                   // chevron emblem framing the core
      for (let k = 0; k < one; k++) {
        body.line(cx - R(6.5), base - R(17.5) + k, cx, base - R(9) + k, TR[3]);
        body.line(cx + R(6.5), base - R(17.5) + k, cx, base - R(9) + k, TR[3]);
      }
    }
    if (tier >= 5) for (const sx of [-1, 1]) { body.rect(cx + sx * R(8.5) - R(1), base - R(17), R(2), R(2), accent); body.px(cx + sx * R(8.5), base - R(16.5), "#ffffff"); }
    // vents
    for (let i = 0; i < 3; i++) { body.rect(cx - R(10.5), base - R(9 + i * 3), R(2.5), 1, "#0e121c"); body.rect(cx + R(8), base - R(9 + i * 3), R(2.5), 1, "#0e121c"); }
    if (T.open) {
      // open cockpit: a rim the rider sits behind
      m = body.newMask(); body.maskPoly(m, [[cx - R(7), base - R(21)], [cx + R(7), base - R(21)], [cx + R(6), base - R(25)], [cx - R(6), base - R(25)]]); body.shade(m, DK, seed + 13, 0.15, true);
      body.rect(cx - R(6), base - R(25), R(12), one, TR[3]);
    } else {
      // raised gorget either side of the head
      for (const sx of [-1, 1]) { m = body.newMask(); body.maskPoly(m, [[cx + sx * R(4.5), base - R(21)], [cx + sx * R(10.5), base - R(21)], [cx + sx * R(9.5), base - R(26.5)]]); body.shade(m, TR, seed + 29, 0.1, true); }
      // sealed head with a glowing visor
      m = body.newMask(); body.maskEllipse(m, cx, base - R(25), R(6.5), R(5.5), seed, 0); body.shade(m, ST, seed + 14, 0.15);
      body.rect(cx - R(4.5), base - R(26), R(9), Math.max(2, R(2)), "#0e121c");
      body.rect(cx - R(3.5), base - R(26), R(7), Math.max(1, R(1.2)), accent);
      if (tier >= 4) {
        for (let i = -1; i <= 1; i++) body.rect(cx + i * R(1.8) - one / 2, base - R(23.5), one, R(2.5), "#0e121c");   // jaw grille
        for (const sx of [-1, 1]) { m = body.newMask(); body.maskPoly(m, [[cx + sx * R(4), base - R(29)], [cx + sx * R(7), base - R(27.5)], [cx + sx * R(tier >= 5 ? 11 : 9.5), base - R(tier >= 5 ? 37 : 35)]]); body.shade(m, TR, seed + 15, 0.1, true); }
      }
      if (tier >= 5) { m = body.newMask(); body.maskPoly(m, [[cx - R(1.8), base - R(30)], [cx + R(1.8), base - R(30)], [cx, base - R(37)]]); body.shade(m, TR, seed + 16, 0.1, true); }
      if (tier >= 6) {
        for (const sx of [-1, 1]) { m = body.newMask(); body.maskPoly(m, [[cx + sx * R(2), base - R(30)], [cx + sx * R(4.5), base - R(29.5)], [cx + sx * R(4.5), base - R(35)]]); body.shade(m, TR, seed + 30, 0.1, true); }
        body.rect(cx - R(5), base - R(30), R(10), one, TR[4]);
      }
    }
    if (CL) {                                                          // tabard hanging between the legs
      m = body.newMask(); body.maskPoly(m, [[cx - R(4.5), base - R(1)], [cx + R(4.5), base - R(1)], [cx + R(3.5), base + R(8)], [cx, base + R(12)], [cx - R(3.5), base + R(8)]]);
      body.shade(m, CL, seed + 31, 0.12, true);
      body.rect(cx - R(1), base + R(2), R(2), R(2), TR[4]); body.rect(cx - R(2), base + R(3), R(4), one, TR[4]);
    }
    // rivets
    for (const [rx, ry] of [[-6, 6], [6, 6], [-9, 19], [9, 19]]) body.px(cx + R(rx), base - R(ry), ST[4]);

    const out = { leg, arm, body, s, tier, T, lcx, acx, armAy: R(5) + ay0, bcx: cx, bbase: base, accent: accent, open: T.open,
      hipY: R(21), hipX: R(5.5), shoulderX: R(14.5), shoulderY: R(19), coreY: R(13), rimY: R(23), headY: R(25),
      height: (R(21) + R(tier >= 4 ? 37 : 34)) * CONFIG.texel };
    this.detail(out, tier);
    if (tier < 3) {
      // a stubby auto-cannon rides the pauldron: the frame's own gun, since the forearm carries the pilot's tool
      // (the great frames have shoulder cannons on the hull instead). Mech.muzzle points at its bore. Painted after
      // the detailing pass, which rebuilds the salvage frame's shoulder.
      const ay = out.armAy;
      arm.rect(acx + R(1), ay - R(7.5) - 1, R(9), R(2.5) + 2, DK[0]);
      arm.rect(acx + R(1.5), ay - R(7.5), R(8), R(2.5), ST[2]); arm.rect(acx + R(1.5), ay - R(7.5), R(8), one, ST[4]);
      arm.rect(acx + R(8), ay - R(8), R(2), R(3.5), TR[2]); arm.rect(acx + R(9.5), ay - R(7), one, R(1.5), accent);
    }
    out.tool = this.tool(out, tier, hero);
    this.cache[key] = out;
    return out;
  },

  // Detailing pass (from the bindframe art proposals): panel seams, shin pistons, chest ribs,
  // cockpit lamps, heat-sink ribs. Painted straight onto the part canvases.
  detail(p, tier) {
    const s = p.s, R = (v) => Math.round(v * s), tr = MECH_PAL[p.T.trim], st = MECH_PAL[p.T.steel];
    const leg0 = p.leg;
    const leg = p.leg, lx = p.lcx;
    leg.rect(lx + R(3), R(10), 1, R(6), tr[4]);
    leg.rect(lx + R(2), R(14), R(2), R(3), tr[1]);
    for (let i = 0; i < 3; i++) { leg.rect(lx - R(3), R(12 + i * 2), R(2), 1, st[0]); leg.rect(lx - R(3), R(12 + i * 2) - 1, R(2), 1, st[3]); }
    leg.line(lx - R(4), R(19), lx + R(4), R(19), tr[2]);
    const arm = p.arm, ax = p.acx, ay = p.armAy;
    arm.line(ax - R(4), ay - R(2), ax + R(2), ay - R(2), tr[4]);
    for (const side of [-1, 1]) arm.px(ax + side * R(4), ay + R(1), st[4]);
    for (let i = 0; i < tier; i++) arm.rect(ax - R(3) + i * 2, ay + R(2), 1, R(2), tr[3]);
    for (let i = 0; i < 3; i++) arm.rect(ax - R(2), ay + R(11 + i * 2), R(4), 1, st[0]);
    arm.line(ax + R(3), ay + R(8), ax + R(3), ay + R(14), p.accent);
    const b = p.body, cx = p.bcx, by = p.bbase;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) { b.line(cx + side * R(7), by - R(18 - i * 3), cx + side * R(10), by - R(17 - i * 3), tr[2]); b.px(cx + side * R(10), by - R(17 - i * 3), tr[4]); }
      b.rect(cx + side * R(6) - 1, by - R(4), R(2), R(2), tr[4]);
      if (tier <= 2) { b.rect(cx + side * R(5) - 1, by - R(24), R(2), 1, p.accent); b.rect(cx + side * R(8) - 1, by - R(23), 1, R(3), tr[3]); }
      else for (let i = 0; i < 3; i++) b.rect(cx + side * R(9) - R(1), by - R(30 - i * 2), R(2), 1, tr[3]);
    }
    // Secondary shapes give the plates thickness without turning every surface into noise.
    for (const side of [-1, 1]) {
      const px2 = cx + side * R(8);
      b.rect(px2 - R(2), by - R(19), R(4), R(5), st[0]);
      b.rect(px2 - R(2) + 1, by - R(19) + 1, R(4) - 2, R(5) - 2, st[2]);
      b.rect(px2 - R(2) + 1, by - R(19) + 1, R(3), 1, st[4]);
      b.rect(px2, by - R(17), R(1), R(1), tr[4]);
      for (let j = 0; j < 3; j++) b.px(px2 + side * R(1), by - R(7 + j), st[4]);
      for (let j = 0; j < 2; j++) arm.rect(ax + side * R(5), ay + R(3 + j * 2), R(1), 1, st[4]);
    }
    if (tier === 1) {
      // The first frame is salvage: a loader rebuilt in the field, and it should look it. One chest plate is
      // missing over a bare flywheel, one panel is a rust-red replacement welded on, and the two legs and the
      // two shoulders do not match. (tier 1 has s === 1, so these plain pixel offsets are already to scale.)
      b.rect(cx - R(10), by - R(20), R(9), R(14), "#171d23");
      b.line(cx - R(9), by - R(19), cx - R(3), by - R(7), "#75818a");
      b.line(cx - R(3), by - R(19), cx - R(9), by - R(7), "#45515a");
      b.rect(cx - R(7), by - R(16), R(5), R(5), "#8c5837");
      b.rect(cx - R(6), by - R(15), R(3), R(3), "#25282b");
      b.px(cx - R(5), by - R(14), "#c4bbb0");
      b.rect(cx + R(2), by - R(20), R(9), R(10), "#713f30");
      b.rect(cx + R(3), by - R(19), R(7), R(7), "#a66743");
      b.line(cx + R(3), by - R(19), cx + R(9), by - R(19), "#d4a56c");
      for (let j = 0; j < 4; j++) { b.px(cx + R(2), by - R(18 - j * 2), "#bfc4b6"); b.px(cx + R(10), by - R(18 - j * 2), "#293137"); }
      b.rect(cx - R(9), by - R(5), R(18), R(3), "#d2a747");
      for (let j = 0; j < 6; j++) b.line(cx - R(8) + j * 3, by - R(5), cx - R(6) + j * 3, by - R(3), "#303331");
      // the far leg is a narrow exposed piston with a patched toe; draw() uses legB on that side
      const sl = (p.legB = new Painter(leg.w, leg.h));
      sl.rect(lx - 3, 0, 6, 9, "#252c32"); sl.rect(lx - 2, 1, 4, 7, "#3f4a52"); sl.rect(lx - 2, 1, 3, 1, "#75818a");
      sl.rect(lx - 3, 8, 6, 10, "#2c353c"); sl.rect(lx - 2, 9, 1, 8, "#bdc6c4"); sl.rect(lx + 1, 9, 1, 8, "#1b2127");
      sl.rect(lx + 2, 7, 2, 10, "#73523a"); sl.rect(lx + 2, 8, 1, 7, "#d9c394");
      sl.rect(lx - 4, 7, 8, 3, "#956342"); sl.rect(lx - 4, 7, 7, 1, "#e6cf96");
      for (let j = 0; j < 3; j++) sl.rect(lx - 3, 11 + j * 2, 6, 1, "#4d5960");
      sl.rect(lx - 5, 17, 10, 4, "#515c60"); sl.rect(lx - 5, 17, 9, 1, "#a6aea0");
      sl.rect(lx + 1, 18, 4, 2, "#a66743"); sl.px(lx - 4, 20, "#2b3236");
      // a small support shoulder on the far arm, against a square reclaimed cannon shoulder on the near one
      const sa = (p.armB = new Painter(arm.w, arm.h));
      sa.ctx.drawImage(arm.canvas, 0, 0);
      sa.ctx.clearRect(0, 0, arm.w, ay + 8);
      sa.rect(ax - 2, ay, 4, 10, "#313c42"); sa.rect(ax - 1, ay + 1, 1, 8, "#bec7c2");
      sa.rect(ax - 4, ay - 2, 7, 5, "#906549"); sa.rect(ax - 4, ay - 2, 6, 1, "#cba273");
      arm.ctx.clearRect(0, 0, arm.w, ay + 7);
      arm.rect(ax - 6, ay - 4, 12, 8, "#272d33"); arm.rect(ax - 5, ay - 3, 10, 6, "#777f78");
      arm.rect(ax - 5, ay - 3, 9, 1, "#c3c8b3"); arm.rect(ax - 4, ay + 1, 8, 2, "#c49b40");
      for (let j = 0; j < 3; j++) arm.line(ax - 4 + j * 3, ay + 1, ax - 3 + j * 3, ay + 2, "#343633");
      arm.px(ax - 4, ay - 2, "#e7d9ad"); arm.px(ax + 3, ay - 2, "#292d31");
    } else if (tier === 2) {
      // the second frame is the first one built, not found: a matched jade shell with ceramic ID stripes
      for (const side of [-1, 1]) {
        b.rect(cx + side * R(9) - R(2), by - R(21), R(4), R(10), st[1]);
        b.rect(cx + side * R(9) - R(1), by - R(20), R(2), R(8), st[3]);
        b.rect(cx + side * R(9) - R(1), by - R(20), R(2), R(2), "#ecedd1");
      }
      arm.rect(ax - R(4), ay - R(2), R(8), R(2), "#d5dfbc");
      arm.rect(ax - R(2), ay - R(2), R(2), R(2), st[2]);
      leg.rect(lx - R(3), R(12), R(6), R(6), st[2]);
      leg.rect(lx - R(3), R(12), R(5), 1, st[4]);
      leg.rect(lx - R(2), R(13), R(2), R(4), "#d5dfbc");
    } else {
      // recessed knee armour, vent lips and small heraldic inlays on the great frames
      for (let j = 0; j < 3; j++) {
        leg.line(lx - R(3), R(12 + j * 2), lx + R(2), R(13 + j * 2), st[1]);
        leg.px(lx - R(3), R(12 + j * 2) - 1, st[4]);
      }
      for (const side of [-1, 1]) {
        b.line(cx + side * R(4), by - R(8), cx + side * R(3), by - R(11), tr[4]);
        b.px(cx + side * R(4), by - R(12), tr[2]);
      }
    }
  },

  // The near forearm carries the pilot's tool, painted pointing right with its pivot (the elbow) at (px, py);
  // draw() rotates it onto the swing, the throw or the beam. `len` is elbow to tip, in texels.
  //   blade   — a great double-edged sword, runes lit in the pilot's colour (serrated and edged on the big frames)
  //   trapper — a grenade launcher: a revolving drum behind a short fat barrel with a wide, hot bore
  //   vet     — a beam emitter: a coiled sleeve ending in a flared cup around a bright crystal
  tool(p, tier, hero) {
    const s = p.s, R = (v) => Math.round(v * s), st = MECH_PAL[p.T.steel], dk = MECH_PAL[p.T.dark], tr = MECH_PAL[p.T.trim], ac = p.accent;
    const one = Math.max(1, R(1)), padX = R(3);
    let m;
    if (hero === "trapper") {
      const len = R(14 + tier), hh = R(4.5), dr = R(5.5), g = new Painter(padX + len + R(3), dr * 2 + R(4)), cy = dr + R(2), dx = padX + R(4);
      g.rect(0, cy - R(2.5), padX + R(2), R(5), dk[2]);                                          // elbow block
      m = g.newMask(); g.maskEllipse(m, dx, cy, dr, dr, tier, 0); g.shade(m, dk, tier * 3 + 1, 0.15);   // the drum
      m = g.newMask(); g.maskEllipse(m, dx, cy, dr - R(1.5), dr - R(1.5), tier, 0); g.shade(m, st, tier * 3 + 2, 0.12);
      for (let i = 0; i < 5; i++) {                                                             // chambers, three of them loaded and lit
        const a = (i * TAU) / 5 + 0.3, rr = dr - R(2.6), cw = Math.max(1, R(1.2));
        g.rect(dx + Math.round(Math.cos(a) * rr) - (cw >> 1), cy + Math.round(Math.sin(a) * rr) - (cw >> 1), cw, cw, i < 3 ? ac : dk[0]);
      }
      g.rect(padX + R(6), cy - hh - 1, len - R(4), hh * 2 + 2, dk[0]);                          // barrel
      g.rect(padX + R(7), cy - hh, len - R(6), hh * 2, st[2]);
      g.rect(padX + R(7), cy - hh, len - R(7), one, st[4]); g.rect(padX + R(7), cy + hh - one, len - R(7), one, st[1]);
      for (let i = 0; i < 2 + (tier >> 1); i++) g.rect(padX + R(9 + i * 3), cy - hh, one, hh * 2, tr[2]);   // bands
      g.rect(padX + len - R(3), cy - hh - R(1), R(4), hh * 2 + R(2), tr[1]);                     // the flared muzzle
      g.rect(padX + len - R(3), cy - hh - R(1), R(4), one, tr[4]);
      g.rect(padX + len - R(1.5), cy - hh + R(0.5), R(2.5), hh * 2 - R(1), ac);                  // hot ring
      g.rect(padX + len - R(0.5), cy - hh + R(1.5), R(1.5), hh * 2 - R(3), "#1a0c04");            // the bore
      if (tier >= 3) g.rect(padX + R(7), cy - hh - R(2), R(5), R(2), tr[3]);                     // sight
      return { canvas: g.canvas, px: padX, py: cy, len: len + R(1) };
    }
    if (hero === "vet") {
      const sleeve = R(9 + tier), cup = R(6), ch = R(5.5), hh = R(3), g = new Painter(padX + sleeve + cup + R(4), ch * 2 + R(4)), cy = ch + R(2), ex = padX + sleeve;
      g.rect(0, cy - R(2.5), padX + R(1), R(5), dk[2]);                                          // elbow block
      g.rect(padX, cy - hh - 1, sleeve + 1, hh * 2 + 2, dk[0]);                                  // sleeve
      g.rect(padX + 1, cy - hh, sleeve - 1, hh * 2, st[2]); g.rect(padX + 1, cy - hh, sleeve - 1, one, st[4]); g.rect(padX + 1, cy + hh - one, sleeve - 1, one, st[1]);
      for (let i = 0; i < 2 + (tier >> 1); i++) g.rect(padX + R(2 + i * 2.6), cy - hh, one, hh * 2, ac);   // coils
      m = g.newMask(); g.maskPoly(m, [[ex, cy - hh - 1], [ex + cup, cy - ch], [ex + cup, cy + ch], [ex, cy + hh + 1]]); g.shade(m, tr, tier * 7, 0.1, true);   // the cup
      m = g.newMask(); g.maskPoly(m, [[ex + R(1.5), cy - hh], [ex + cup - one, cy - ch + R(1.5)], [ex + cup - one, cy + ch - R(1.5)], [ex + R(1.5), cy + hh]]); g.shade(m, dk, tier * 7 + 1, 0, true);
      g.rect(ex + cup - one, cy - ch, R(2.5), one, tr[3]); g.rect(ex + cup - one, cy + ch - one, R(2.5), one, tr[3]);   // prongs
      const cx0 = ex + cup - R(1);
      g.rect(cx0 - R(1.5), cy - R(2), R(3), R(4), ac); g.rect(cx0 - Math.max(1, R(0.5)), cy - R(1), Math.max(1, R(1)), R(2), "#ffffff");   // the crystal
      return { canvas: g.canvas, px: padX, py: cy, len: cx0 - padX };
    }
    // the sword
    const grip = R(7), blade = R(22 + tier * 2), len = grip + R(2) + blade, gh = R(5), g = new Painter(padX + len + R(3), gh * 2 + R(6)), cy = gh + R(2);
    g.rect(0, cy - R(2), padX + R(1), R(4), dk[2]);                                              // wrist block
    g.rect(padX, cy - R(1.5), grip, R(3), dk[1]); g.rect(padX, cy - R(1.5), grip, one, dk[3]);   // wrapped grip
    for (let i = 0; i < 3; i++) g.rect(padX + R(1 + i * 2), cy - R(1.5), one, R(3), dk[0]);
    g.rect(padX - R(1), cy - R(2), R(2), R(4), tr[2]); g.rect(padX - R(1), cy - R(2), R(2), one, tr[4]);   // pommel
    g.rect(padX + grip - R(1), cy - gh, R(3), gh * 2, tr[1]); g.rect(padX + grip - R(1), cy - gh, R(3), one, tr[4]);   // crossguard
    g.rect(padX + grip, cy - gh + one, one, gh * 2 - 2 * one, tr[3]);
    const bx = padX + grip + R(2), bw = R(3.2), tip = bx + blade, pt = Math.max(2, R(5));
    m = g.newMask(); g.maskPoly(m, [[bx, cy - bw - 1], [tip - pt, cy - bw - 1], [tip + 1, cy], [tip - pt, cy + bw + 1], [bx, cy + bw + 1]]); g.shade(m, dk, tier * 5, 0, true);   // outline
    m = g.newMask(); g.maskPoly(m, [[bx, cy - bw], [tip - pt, cy - bw], [tip, cy], [tip - pt, cy + bw], [bx, cy + bw]]); g.shade(m, st, tier * 5 + 1, 0.08, true);   // the slab
    g.rect(bx, cy - bw, tip - pt - bx, one, st[4]); g.rect(bx, cy + bw - one, tip - pt - bx, one, st[1]);   // edges
    g.rect(bx + R(1), cy - (one >> 1), tip - pt - bx - R(2), one, dk[1]);                       // fuller
    for (let i = 0; i < 2 + tier; i++) g.rect(bx + R(2 + i * 3.2), cy - (one >> 1), one, one, ac);   // runes lit in the pilot's colour
    if (tier >= 3) for (let i = 0; i < 3; i++) { m = g.newMask(); g.maskPoly(m, [[bx + R(2 + i * 4), cy + bw], [bx + R(5 + i * 4), cy + bw], [bx + R(4 + i * 4), cy + bw + R(1.8)]]); g.shade(m, tr, tier * 5 + 2 + i, 0, true); }   // serrated teeth
    if (tier >= 5) g.rect(bx, cy - bw - one, tip - pt - bx, one, ac);                            // an energy edge
    return { canvas: g.canvas, px: padX, py: cy, len };
  },

  // Back-mounted hardware per tier (from the art proposals): backpack + aerials, snorkel pylons,
  // mortar cassettes, siege standards, mechanical vanes, the six core reliquaries. Static; cached.
  regaliaCache: {},
  regalia(tier, hero) {
    hero = hero || this.heroOf();
    const key = tier + ":" + hero;
    if (this.regaliaCache[key]) return this.regaliaCache[key];
    const p = this.parts(tier, hero), s = p.s, r = new Painter(400, 280), cx = 200, foot = 260;
    const tr = MECH_PAL[p.T.trim], dk = MECH_PAL[p.T.dark], st = MECH_PAL[p.T.steel];
    const X = (v) => cx + Math.round(v * s), Y = (v) => foot + Math.round(v * s);
    const plate = (points, pal, seed = tier * 61) => { const mask = r.newMask(); r.maskPoly(mask, points.map(([x, y]) => [X(x), Y(y)])); r.shade(mask, pal, seed, 0.08, true); };
    for (const side of [-1, 1]) {
      if (tier === 1) {
        plate([[side * 8, -42], [side * 12, -42], [side * 12, -31], [side * 8, -31]], dk);
        r.line(X(side * 10), Y(-44), X(side * 10), Y(-53), tr[2]); r.px(X(side * 10), Y(-54), p.accent);
      }
      if (tier >= 2 && tier <= 4) {
        plate([[side * 11, -35], [side * 15, -55], [side * 19, -57], [side * 20, -39]], dk);
        plate([[side * 14, -43], [side * 17, -54], [side * 19, -53], [side * 17, -41]], tr);
        for (let k = 0; k < 3; k++) r.rect(X(side * 17) - 1, Y(-50 + k * 3), 2, 1, p.accent);
      }
      if (tier === 3) {
        plate([[side * 18, -39], [side * 27, -41], [side * 28, -54], [side * 19, -52]], st);
        for (let k = 0; k < 3; k++) { r.rect(X(side * (20 + k * 2.5)) - 1, Y(-51 - k), 3, 4, dk[0]); r.rect(X(side * (20 + k * 2.5)), Y(-51 - k), 1, 2, tr[4]); }
      }
      if (tier === 4) {
        plate([[side * 17, -38], [side * 25, -57], [side * 28, -63], [side * 28, -44], [side * 23, -35]], tr);
        plate([[side * 23, -54], [side * 26, -58], [side * 25, -42], [side * 21, -39]], MECH_PAL.blood);
      }
      if (tier >= 5) {
        const count = tier === 6 ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const spread = 25 + i * 9, high = -62 + i * 7;
          plate([[side * 13, -39], [side * spread, high], [side * (spread + 5), high - 9], [side * (spread + 4), high + 4], [side * 19, -32]], dk, 71 + i);
          plate([[side * 18, -40], [side * (spread + 3), high - 5], [side * (spread + 2), high + 1]], tr, 82 + i);
          r.line(X(side * 22), Y(-42), X(side * (spread + 2)), Y(high), p.accent);
        }
      }
    }
    const lamps = [];
    if (tier === 6) for (let i = 0; i < 6; i++) {
      const a = -Math.PI + (i * Math.PI) / 5, x = Math.cos(a) * 31, y = -51 + Math.sin(a) * 24;
      plate([[x - 3, y], [x, y - 5], [x + 3, y], [x, y + 5]], tr, 100 + i);
      r.line(X(x), Y(y + 6), X(x * 0.8), Y(y + 10), tr[2]);
      lamps.push([X(x) - cx, Y(y) - foot]);
    }
    return (this.regaliaCache[key] = { canvas: r.canvas, cx, foot, lamps });
  },

  // The rear of the hull, shown when the frame walks away from the camera: radiator armour over
  // the reactor, no visor.
  backCache: {},
  back(tier, hero) {
    hero = hero || this.heroOf();
    const key = tier + ":" + hero;
    if (this.backCache[key]) return this.backCache[key];
    const p = this.parts(tier, hero), b = new Painter(p.body.w, p.body.h), s = p.s, R = (v) => Math.round(v * s);
    b.ctx.drawImage(p.body.canvas, 0, 0);
    const cx = p.bcx, base = p.bbase, dk = MECH_PAL[p.T.dark], st = MECH_PAL[p.T.steel], tr = MECH_PAL[p.T.trim];
    b.rect(cx - R(12), base - R(25), R(24), R(25), dk[0]);
    b.rect(cx - R(11), base - R(24), R(22), R(22), st[2]);
    b.rect(cx - R(11), base - R(24), R(22), Math.max(1, R(1)), st[4]);
    b.rect(cx - R(7), base - R(22), R(14), R(18), dk[1]);
    for (let i = 0; i < 6; i++) { b.rect(cx - R(5), base - R(20 - i * 2), R(10), Math.max(1, R(1)), dk[0]); b.rect(cx - R(5), base - R(20 - i * 2), R(8), 1, tr[2]); }
    b.rect(cx - R(1), base - R(23), R(2), R(20), tr[3]);
    if (!p.open) { b.rect(cx - R(4), base - R(27.5), R(8), R(4), st[2]); b.rect(cx - R(4), base - R(27.5), R(8), Math.max(1, R(0.8)), st[3]); b.rect(cx - R(0.5), base - R(27), Math.max(1, R(1)), R(3.5), dk[1]); }   // the back of the helm: no visor
    for (const side of [-1, 1]) { b.rect(cx + side * R(9) - R(1), base - R(20), R(2), R(12), dk[0]); b.rect(cx + side * R(9) - R(1), base - R(19), Math.max(1, R(1)), R(10), p.accent); }
    return (this.backCache[key] = b);
  },

  // where the tool arm pivots (px, relative to the feet, before grow) and which way it points on screen
  armPose(p, P, aim) {
    const tx = CONFIG.texel, face = p.facing < 0 ? -1 : 1;
    const dx = Math.cos(aim), dy = Math.sin(aim) * 0.72, l = Math.hypot(dx, dy) || 1;   // vertical aim is foreshortened
    return { px: face * P.shoulderX * tx, py: -(P.hipY + P.shoulderY) * tx + 4 + Math.round(5 * P.s) * tx, ux: dx / l, uy: dy / l, len: P.tool.len * tx * (0.72 + 0.28 * Math.abs(dx / l)) };
  },

  // What the tool arm is doing this frame: the world angle it wants (a), whether it snaps there (a swing, a
  // throw, a pulse) or eases (rate), and the trimmings — a sword trail from a0, a thrust push, launcher
  // recoil and flash, the emitter's glow. Rest is hanging down and a little forward.
  toolState(p, hero, time) {
    const face = p.facing < 0 ? -1 : 1, up = (a) => a - (Math.cos(a) < 0 ? -1 : 1) * 0.35;   // tilt an angle a little skyward
    const o = { a: Math.PI / 2 - face * 0.3, snap: false, rate: 0.12 };
    if (p.atkT > 0) {
      const S = hero === "blade" && typeof PlayerCtl !== "undefined" ? PlayerCtl.SWINGS[p.atkKind] : null;
      if (S) {
        const k = clamp(1 - p.atkT / S.dur, 0, 1), e = k * k * (3 - 2 * k);
        o.snap = true; o.k = k;
        if (S.thrust) { o.a = p.swingA; o.push = Math.sin(k * Math.PI); }
        else {
          // a spin goes exactly once round (span = pi); the other swings overshoot a little, like the suit's blade
          const span = S.spin ? Math.PI : S.half + 0.3;
          o.a0 = p.swingA - p.sweep * span; o.a = p.swingA + p.sweep * (-span + 2 * span * e); o.sweep = p.sweep;
          o.trail = S.spin ? 0.45 * (1 - k) + 0.2 : 0.28 * (1 - k);
        }
        return o;
      }
      if (p.atkKind === "toss") {                                        // the throw lasts Traps.TOSS: kick hardest at the start, flash for the first tenth
        const T = (typeof Traps !== "undefined" && Traps.TOSS) || 0.25;
        o.snap = true; o.a = up(p.swingA); o.recoil = (5 * p.atkT) / T; o.flash = p.atkT > T - 0.1 ? (p.atkT - (T - 0.1)) / 0.1 : 0; return o;
      }
      if (p.atkKind === "pulse") { o.snap = true; o.a = -Math.PI / 2 + face * 0.45; o.glow = 0.9; o.push = 0.5 * Math.sin(clamp(p.atkT / 0.3, 0, 1) * Math.PI); return o; }
    }
    if (p.charging) {
      const j = Math.sin(time * 40) * 0.06 * p.chargeK;
      o.rate = 0.35; o.a = hero === "blade" ? p.faceA - face * 2.3 + j : up(p.faceA) + j;   // the sword winds up behind, the others come up to the aim
      if (hero !== "blade") o.glow = 0.3 + 0.6 * p.chargeK;
      return o;
    }
    if (hero === "vet" && typeof Mend !== "undefined" && Mend.target) {
      const t = Mend.target, P = this.parts(Game.mechTier(), hero), ap = this.armPose(p, P, 0), g = this.grow;
      o.rate = 0.35; o.track = true; o.a = Math.atan2(t.y - t.r * 0.6 - (p.y + ap.py * g), t.x - (p.x + ap.px * g)); o.glow = 0.5 + 0.3 * Math.sin(time * 9);
      return o;
    }
    return o;
  },

  // the tip of the tool arm in world space — where a mine leaves the launcher or the mending beam starts
  // (BinderArt.toolPos uses it while riding); null on foot
  armTip(p) {
    const tier = Game.mechTier();
    if (!tier) return null;
    const hero = this.heroOf(p), P = this.parts(tier, hero), st = this.toolState(p, hero, Game.time);
    const a = st.snap || p.toolA === undefined ? st.a : p.toolA, ap = this.armPose(p, P, a), g = this.grow;
    return { x: p.x + (ap.px + ap.ux * ap.len) * g, y: p.y + (ap.py + ap.uy * ap.len) * g };
  },

  // total standing height in world px (for camera, chevron, floating text) — includes the horde growth
  height(tier) { return tier ? this.parts(tier).height * this.grow : CONFIG.playerHeight; },
  // extra reach for things that come off the frame's feet / hull (slam, walk-over bind)
  reach(tier) { return tier ? this.grow : 1; },
  // how much further than the suit's blade the frame's sword reaches: the ratio of the two blades as drawn (the
  // suit's is 11 texels), capped so the Worldbinder's does not clear a whole screen. PlayerCtl.swingHit uses it.
  swordReach(tier) { return tier ? this.grow * clamp((0.75 * this.parts(tier, "blade").tool.len) / 11, 1, 5) : 1; },

  draw(ctx, p, tier, time) {
    const hero = this.heroOf(p), P = this.parts(tier, hero), T = P.T, tx = CONFIG.texel, s = P.s, g = this.grow;
    const moving = p.moving || p.dashT > 0;
    const phase = p.animT * Math.max(3.2, 7.5 - s) / Math.sqrt(g);
    const stride = moving ? 1 : 0;
    const liftL = stride * Math.max(0, Math.sin(phase)) * 4 * s, liftR = stride * Math.max(0, Math.sin(phase + Math.PI)) * 4 * s;
    // stomp: rear up on one leg through the wind-up, then sink into the impact
    const stK = p.stompT > 0 ? 1 - p.stompT / 0.34 : 0, land = p.stompLand > 0 ? p.stompLand / 0.3 : 0;
    const bob = (moving ? Math.abs(Math.cos(phase)) * 2.5 * s : Math.sin(time * 2.2) * 1.2) + stK * 5 * s - land * 4 * s;
    const face = p.facing < 0 ? -1 : 1;
    const rear = p.dir === "up" || p.dir === "updiag";
    // the tool arm: snaps into a swing, a throw or a pulse, otherwise eases toward its rest or its target
    const TS = this.toolState(p, hero, time);
    if (p.toolA === undefined || TS.snap) p.toolA = TS.a;
    else { let dA = TS.a - p.toolA; while (dA > Math.PI) dA -= TAU; while (dA < -Math.PI) dA += TAU; p.toolA += dA * TS.rate; }
    const hipY = -P.hipY * tx, by = hipY - bob + 4;                  // pelvis bottom sits on the hips

    // footfalls: dust, and the big frames shake the earth
    const step = Math.floor(phase / Math.PI);
    if (moving && step !== p.lastStep) {
      p.lastStep = step;
      const fx = p.x + (step % 2 ? 1 : -1) * P.hipX * tx * g;
      FX.burst(fx, p.y, "#c8c0a8", 3 + tier * 2, (40 + tier * 14) * g, 0.4, 3 + (tier >> 1));
      if (tier >= 4) FX.ring(fx, p.y, 4, 22 * s * g, T.accent, 0.35, 3);
      if (tier >= 3) FX.addShake(tier * 0.35 * g);
      if (tier >= 2 && Game.onScreen(p.x, p.y)) SFX.play("step", 0.3 + tier * 0.12, 1.3 - tier * 0.13);
    }
    // the stacks belch smoke, then fire, then raw binding-light
    if (T.smoke && Math.random() < 0.18 + tier * 0.07) {
      const sx = Math.random() < 0.5 ? -1 : 1, col = T.smoke[(Math.random() * T.smoke.length) | 0];
      FX.mote(p.x + sx * 9 * s * tx * g, p.y + (by - 33 * s * tx) * g, (Math.random() - 0.5) * 20, -(30 + Math.random() * 40) * g, col, 0.5 + Math.random() * 0.5, (3 + tier) * Math.sqrt(g), -20);
    }

    const X = Math.round(p.x), Y = Math.round(p.y);
    const blink = p.invuln > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 ? 0.5 : 1;
    ctx.save();
    ctx.translate(X, Y); ctx.scale(g, g); ctx.translate(-X, -Y);

    const img = (part, ax, ay, dx, dy, flip) => {
      const w = part.canvas.width * tx, h = part.canvas.height * tx;
      if (flip) { ctx.save(); ctx.translate(X + dx, Y + dy); ctx.scale(-1, 1); ctx.drawImage(part.canvas, -ax * tx, -ay * tx, w, h); ctx.restore(); }
      else ctx.drawImage(part.canvas, X + dx - ax * tx, Y + dy - ay * tx, w, h);
    };
    const glow = (gx, gy, rad, color, a) => {
      const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
      gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a; ctx.fillStyle = gr;
      ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    };
    const diamond = (dx, dy, r) => {
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.moveTo(dx, dy - r * 1.5); ctx.lineTo(dx + r, dy); ctx.lineTo(dx, dy + r * 1.5); ctx.lineTo(dx - r, dy); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(dx - r / 3), Math.round(dy - r / 2), Math.ceil(r * 0.66), Math.ceil(r));
    };

    // ---- ground: binding-circle under the great frames, then the shadow
    if (tier >= 3) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
      ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(2, s);
      ctx.globalAlpha = 0.25 + pulse * 0.2;
      ctx.beginPath(); ctx.ellipse(X, Y, 30 * s, 12 * s, 0, 0, TAU); ctx.stroke();
      if (tier >= 4) {
        ctx.setLineDash([5 * s, 4 * s]); ctx.lineDashOffset = -time * 14 * s; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(X, Y, 38 * s, 15.2 * s, 0, 0, TAU); ctx.stroke();
        if (tier >= 5) { ctx.lineDashOffset = time * 10 * s; ctx.setLineDash([2 * s, 7 * s]); ctx.lineWidth = Math.max(3, s * 1.8); ctx.beginPath(); ctx.ellipse(X, Y, 46 * s, 18.4 * s, 0, 0, TAU); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      if (tier >= 6) {                                                 // rays of light crawling over the ground
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = P.accent;
        for (let i = 0; i < 12; i++) {
          const a = time * 0.35 + (i * TAU) / 12, r0 = 20 * s, r1 = (52 + 8 * Math.sin(time * 3 + i * 1.7)) * s, w = 0.07;
          ctx.globalAlpha = 0.16;
          ctx.beginPath(); ctx.moveTo(X + Math.cos(a - w) * r0, Y + Math.sin(a - w) * r0 * 0.4); ctx.lineTo(X + Math.cos(a) * r1, Y + Math.sin(a) * r1 * 0.4); ctx.lineTo(X + Math.cos(a + w) * r0, Y + Math.sin(a + w) * r0 * 0.4); ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      glow(X, Y, 34 * s, P.accent, 0.12 + pulse * 0.08);
    }
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#0a0e18";
    ctx.beginPath(); ctx.ellipse(X, Y, 18 * s + 6, 7 * s + 2, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const headTop = Y + by - (P.headY + 6 * s) * tx, shY = Y + by - P.shoulderY * tx;

    // ---- behind the frame: sun-disc, energy wings, cape
    if (tier >= 6) {
      const hy = Y + by - P.headY * tx, r = 17 * s * tx * 0.5;
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = P.accent; ctx.fillStyle = P.accent;
      ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(2, s * 1.2);
      ctx.beginPath(); ctx.arc(X, hy, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(X, hy, r * 0.8, 0, TAU); ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const a = time * 0.5 + (i * TAU) / 16, l = r * (i % 2 ? 1.28 : 1.6), w = 0.06;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(X + Math.cos(a - w) * r, hy + Math.sin(a - w) * r); ctx.lineTo(X + Math.cos(a) * l, hy + Math.sin(a) * l); ctx.lineTo(X + Math.cos(a + w) * r, hy + Math.sin(a + w) * r); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    const REG = this.regalia(tier, hero);
    const regalia = () => {
      ctx.globalAlpha = blink;
      ctx.drawImage(REG.canvas, X - REG.cx * tx, Math.round(Y - REG.foot * tx - bob), REG.canvas.width * tx, REG.canvas.height * tx);
      const lit = Math.floor(time * 2) % 6;                              // the six cores take turns flaring
      REG.lamps.forEach(([lx, ly], i) => { ctx.fillStyle = i === lit ? "#ffffff" : P.accent; ctx.fillRect(X + (lx - 1) * tx, Math.round(Y + (ly - 1) * tx - bob), 3 * tx, 3 * tx); if (i === lit) glow(X + lx * tx, Y + ly * tx - bob, 7 * s, P.accent, 0.7); });
      ctx.globalAlpha = 1;
    };
    if (!rear) regalia();
    if (tier >= 5) {
      const n = tier >= 6 ? 7 : 5, flap = Math.sin(time * (moving ? 3.2 : 1.6)) * 0.09;
      ctx.globalCompositeOperation = "lighter";
      for (const sx of [-1, 1]) {
        const rx = X + sx * 10 * s * tx * 0.5, ry = shY - 6 * s;
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + sx * (0.5 + k * (tier >= 6 ? 0.24 : 0.3) + flap * (1 + k * 0.4));
          const len = (tier >= 6 ? 78 : 66) * s * (1 - k * 0.09) * (1 + 0.04 * Math.sin(time * 5 + k));
          const ex = rx + Math.cos(a) * len, ey = ry + Math.sin(a) * len, nx = -Math.sin(a), ny = Math.cos(a), w = 4.5 * s;
          const mx = rx + Math.cos(a) * len * 0.35, my = ry + Math.sin(a) * len * 0.35;
          ctx.fillStyle = P.accent;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(mx + nx * w, my + ny * w); ctx.lineTo(ex, ey); ctx.lineTo(mx - nx * w, my - ny * w);
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.55 * blink; ctx.fill();   // solid base so it reads on bright ground
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.4 * blink; ctx.fill();
          ctx.globalAlpha = 0.55 * blink; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, s * 0.6);
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(ex, ey); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // ---- the ceremonial cloak: a deterministic deforming mesh, pinned at the shoulders.
    // u runs across the cloth (0..1), v down it; travelling folds lag behind the frame and the wind
    // strengthens when it walks. Piping, stitching and the binding seal are mapped onto the same surface,
    // so they deform with it. (Design from proposals/bindframe; no physics solver, so it is frame-rate free.)
    const clothPoint = (u, v, out) => {
      const q = u * 2 - 1, sp = moving ? 4.5 : 2.4;
      const phase = time * sp - v * 5 + q * 2.4;
      const fold = Math.sin(q * 8 - time * 0.8 + v * 2.1);
      const wind = (Math.sin(phase) * 3.3 + Math.sin(phase * 0.71 + q) * 1.5) * (moving ? 1.7 : 1);
      const width = (11 + v * 8) * s * (rear ? 1 : 1.12);
      const split = Math.exp(-q * q * 28) * (tier === 4 ? 6 : 4);      // the hem parts over the legs
      const len = 74 * s - split * s;
      out.x = X + q * width + (wind - face * (moving ? 7 : 1.5)) * s * v * v + fold * s * v * 0.8;
      out.y = shY + 3 * s + len * v + (Math.cos(phase + q) * 2.1 + fold * 1.2) * s * v * v;
      out.light = Math.cos(q * 8 - time * 0.8 + v * 2.1) * 0.6 + Math.sin(phase) * 0.18 - v * 0.15;
      return out;
    };
    const cape = () => {
      if (!T.cloth) return;
      const CL = MECH_PAL[T.cloth], TRc = MECH_PAL[T.trim];
      // the mesh is coarser on the small frames, where the extra rows would never be seen
      const cols = tier >= 6 ? 16 : 12, rows = tier >= 6 ? 12 : 9;
      const row = [], next = [];
      for (let i = 0; i <= cols; i++) { row.push(clothPoint(i / cols, 0, {})); next.push({}); }
      ctx.lineWidth = 1;
      for (let j = 0; j < rows; j++) {
        const v1 = (j + 1) / rows;
        for (let i = 0; i <= cols; i++) clothPoint(i / cols, v1, next[i]);
        for (let i = 0; i < cols; i++) {
          const a = row[i], b = row[i + 1], d = next[i], e = next[i + 1];
          const light = (a.light + b.light + d.light + e.light) / 4;
          let col = CL[light > 0.38 ? 3 : light > -0.12 ? 2 : 1];
          if (j === rows - 1) col = light > 0 ? TRc[3] : TRc[1];       // the turned hem shows its lining
          else if (i === 0 || i === cols - 1) col = light > 0 ? CL[3] : CL[1];
          ctx.fillStyle = col; ctx.strokeStyle = col;                  // stroke as well: it seals the seams between quads
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.lineTo(d.x, d.y); ctx.closePath();
          ctx.fill(); ctx.stroke();
          if (light < -0.58) { ctx.fillStyle = CL[0]; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
        }
        for (let i = 0; i <= cols; i++) { const t0 = row[i]; row[i] = next[i]; next[i] = t0; }
      }
      // embroidery: piping down both edges and along the hem, then the binding seal
      const pt = {}, stitch = (uvs, color, w) => {
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, w * s); ctx.beginPath();
        for (let n = 0; n < uvs.length - 1; n++) for (let k = n ? 1 : 0; k <= 6; k++) {
          const f = k / 6, p2 = clothPoint(uvs[n][0] * (1 - f) + uvs[n + 1][0] * f, uvs[n][1] * (1 - f) + uvs[n + 1][1] * f, pt);
          if (!n && !k) ctx.moveTo(p2.x, p2.y); else ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      };
      stitch([[0.045, 0], [0.045, 0.92], [0.5, 0.92], [0.955, 0.92], [0.955, 0]], TRc[2], 0.65);
      stitch([[0.5, 0.28], [0.68, 0.49], [0.5, 0.7], [0.32, 0.49], [0.5, 0.28]], TRc[3], 0.65);
      stitch([[0.5, 0.34], [0.5, 0.62]], TRc[4], 0.55);
      stitch([[0.42, 0.47], [0.5, 0.55], [0.58, 0.47]], TRc[3], 0.5);
      // heavy clasps stay put at the shoulders while everything below them travels
      for (const u of [0.08, 0.92]) {
        const p2 = clothPoint(u, 0, pt);
        ctx.fillStyle = TRc[1]; ctx.fillRect(Math.round(p2.x - s), Math.round(p2.y - s), Math.ceil(3 * s), Math.ceil(2 * s));
        ctx.fillStyle = TRc[4]; ctx.fillRect(Math.round(p2.x), Math.round(p2.y - s), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
      }
      ctx.lineWidth = 1;
    };
    if (!rear) cape();

    // ---- the frame itself
    ctx.globalAlpha = blink;
    img(P.leg, P.lcx, 0, -P.hipX * tx, hipY - liftL, false);
    img(P.legB || P.leg, P.lcx, 0, P.hipX * tx, hipY - liftR - stK * 13 * s, true);
    // far arm (behind the body)
    const swing = moving ? Math.sin(phase) * 2 * s : 0;
    img(P.armB || P.arm, P.acx, P.armAy, -face * P.shoulderX * tx, shY - Y + swing, face > 0);
    // the pilot in the open cockpit: helmet and shoulders above the rim (BinderArt draws the suit)
    if (P.open) {
      const H = 44, ry = Y + by - P.rimY * tx + 16;
      ctx.save(); ctx.beginPath(); ctx.rect(X - 40, ry - H - 4, 80, H - 8); ctx.clip();
      BinderArt.bust(ctx, X, ry, p, time);
      ctx.restore();
    }
    img(rear ? this.back(tier, hero) : P.body, P.bcx, P.bbase, 0, by, false);
    // reactor core: a pulsing diamond in the chest, and a burning visor
    const pulse = 0.55 + 0.45 * Math.sin(time * 5), cy = Y + by - P.coreY * tx, cs = Math.round(2 * s) * 2;
    if (!rear) {
      ctx.fillStyle = P.accent; ctx.globalAlpha = blink * (0.6 + pulse * 0.4);
      ctx.fillRect(X - cs, cy - cs / 2, cs * 2, cs); ctx.fillRect(X - cs / 2, cy - cs, cs, cs * 2);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(X - cs / 2, cy - cs / 2, cs, cs);
      if (tier >= 2) glow(X, cy, (9 + tier * 2) * s, P.accent, (0.3 + pulse * 0.3) * blink);
      if (!P.open) glow(X, Y + by - (P.headY + 0.5 * s) * tx, 9 * s, P.accent, 0.5 * blink);
    } else { cape(); regalia(); }
    ctx.globalAlpha = blink;
    // muzzle flash: a hot four-point star, on the frame's gun when a bolt leaves and on the launcher's bore
    const star = (mx, k, big) => {
      const fl = (10 + tier * 3) * s * (0.5 + k) * (big ? 1.4 : 1), fw = (3 + tier * 0.5) * s * (big ? 1.5 : 1);
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.moveTo(mx, -fw); ctx.lineTo(mx + fl * 0.35, -fw * 0.5); ctx.lineTo(mx + fl * 0.45, -fw * 2); ctx.lineTo(mx + fl * 0.6, -fw * 0.4); ctx.lineTo(mx + fl, 0);
      ctx.lineTo(mx + fl * 0.6, fw * 0.4); ctx.lineTo(mx + fl * 0.45, fw * 2); ctx.lineTo(mx + fl * 0.35, fw * 0.5); ctx.lineTo(mx, fw); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(mx, -fw * 0.5); ctx.lineTo(mx + fl * 0.7, 0); ctx.lineTo(mx, fw * 0.5); ctx.fill();
    };
    // near arm: the pilot's tool — the sword sweeping through its swing, the launcher kicking, the emitter
    // glowing — pivoting under the pauldron. It follows the body's walking swing only while idle.
    {
      const Tl = P.tool, ap = this.armPose(p, P, p.toolA), gx = X + ap.px, gy = Y + ap.py - bob - (TS.snap || TS.track || p.charging ? 0 : swing);
      const ang = Math.atan2(ap.uy, ap.ux), sq = ap.len / (Tl.len * tx), tipX = Tl.len * tx * sq;
      if (TS.trail) {                                                    // the sword's wake, a sector from where the swing began
        ctx.save(); ctx.translate(Math.round(gx), Math.round(gy)); ctx.scale(1, 0.72);
        ctx.globalAlpha = TS.trail * blink; ctx.fillStyle = P.accent;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Tl.len * tx * 0.96, TS.a0, TS.a, TS.sweep < 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = blink; ctx.restore();
      }
      ctx.save(); ctx.translate(Math.round(gx), Math.round(gy)); ctx.rotate(ang);
      if (hero !== "blade" && Math.abs(ang) > Math.PI / 2) ctx.scale(1, -1);   // the sword is double-edged; the others keep their sights on top
      ctx.translate((TS.push || 0) * 10 * s - (TS.recoil || 0) * s * tx * 0.5, 0);
      ctx.drawImage(Tl.canvas, -Tl.px * tx, -Tl.py * tx, Tl.canvas.width * tx * sq, Tl.canvas.height * tx);
      if (TS.glow) glow(tipX, 0, (7 + tier * 2) * s, P.accent, TS.glow * blink);
      if (TS.flash) star(tipX, TS.flash, true);
      if (hero === "vet" && !TS.glow) glow(tipX, 0, (4 + tier) * s, P.accent, (0.25 + 0.1 * Math.sin(time * 4)) * blink);   // the crystal never quite goes dark
      ctx.restore();
      // the pauldron stays on the shoulder while the tool pivots under it
      const cut = P.armAy + Math.round(7 * s), ax = X + face * P.shoulderX * tx, ay = shY - swing * 0;
      ctx.save(); ctx.translate(ax, ay); if (face < 0) ctx.scale(-1, 1);
      ctx.drawImage(P.arm.canvas, 0, 0, P.arm.canvas.width, cut, -P.acx * tx, -P.armAy * tx, P.arm.canvas.width * tx, cut * tx);
      ctx.restore();
      // the frame's own gun fires from the shoulder
      if (p.attackT > 0.1) {
        const m = this.gunPos(p, P), mA = p.gunAim !== undefined ? p.gunAim : p.aim, mx0 = X + m.x, my0 = Y + m.y - bob;
        ctx.save(); ctx.translate(mx0, my0); ctx.rotate(Math.atan2(Math.sin(mA) * 0.72, Math.cos(mA))); star(0, (p.attackT - 0.1) / 0.15, false); ctx.restore();
        glow(mx0, my0, 10 * s, P.accent, 0.7 * blink);
      }
    }
    if (p.flash > 0) { ctx.globalAlpha = 0.4; ctx.fillStyle = "#ff5a5a"; ctx.fillRect(X - 24 * s, Y + by - 42 * s, 48 * s, 34 * s); }
    ctx.globalAlpha = 1;

    // ---- over the frame: shoulder crystals, halo, orbiting binding-runes, lightning
    if (tier >= 5) {
      for (const sx of [-1, 1]) {
        const fy = shY - (20 + 3 * Math.sin(time * 2 + sx)) * s;
        diamond(X + sx * (P.shoulderX * tx + 6 * s), fy, 2.6 * s);
        glow(X + sx * (P.shoulderX * tx + 6 * s), fy, 8 * s, P.accent, 0.45);
      }
      // halo
      ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(2, s * 1.3); ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(X, headTop - 9 * s, 11 * s, 3.2 * s, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, s * 0.5); ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(X, headTop - 9 * s, 11 * s, 3.2 * s, 0, time * 2, time * 2 + 1.6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (tier >= 4) {
      const n = tier + 2, rad = 32 * s, oy = Y - P.height * 0.5, pts = [];
      for (let i = 0; i < n; i++) {
        const a = time * 1.3 + (i * TAU) / n;
        for (let tr = 3; tr >= 0; tr--) {                            // fading trail behind each rune
          const at = a - tr * 0.09, rx = X + Math.cos(at) * rad, ry = oy + Math.sin(at) * rad * 0.35 + (tier >= 6 ? Math.cos(at) * rad * 0.25 : 0);
          if (tr) { ctx.globalAlpha = 0.5 - tr * 0.13; ctx.fillStyle = P.accent; ctx.fillRect(Math.round(rx - s), Math.round(ry - s), Math.ceil(2 * s), Math.ceil(2 * s)); }
          else { ctx.globalAlpha = 1; diamond(rx, ry, 1.9 * s); pts.push([rx, ry]); }
        }
      }
      if (tier >= 6) for (let i = 0; i < 5; i++) {                   // a second, counter-turning orbit
        const a = -time * 0.9 + (i * TAU) / 5, rx = X + Math.cos(a) * rad * 1.35, ry = oy - 10 * s + Math.sin(a) * rad * 0.3 - Math.cos(a) * rad * 0.3;
        diamond(rx, ry, 1.5 * s);
      }
      if (tier >= 5) {
        // lightning jumps from the reactor to a rune a few times a second
        const tick = Math.floor(time * 9), rnd = mulberry32(tick * 7919 + tier);
        if (rnd() < 0.55) {
          const [ex, ey] = pts[(rnd() * pts.length) | 0];
          ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, s * 0.8); ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(X, cy);
          for (let k = 1; k < 6; k++) { const u = k / 6; ctx.lineTo(lerp(X, ex, u) + (rnd() - 0.5) * 9 * s, lerp(cy, ey, u) + (rnd() - 0.5) * 9 * s); }
          ctx.lineTo(ex, ey); ctx.stroke();
          ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(3, s * 2); ctx.globalAlpha = 0.35; ctx.stroke();
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  },

  // the frame's own gun: the pauldron stub on the small frames, the hull's shoulder cannon on the great ones —
  // relative to the feet, before grow (px). Bolts leave from here; the tool arm is the pilot's.
  gunPos(p, P) {
    const tx = CONFIG.texel, face = p.facing < 0 ? -1 : 1, s = P.s, R = (v) => Math.round(v * s), by = -P.hipY * tx + 4;
    if (P.tier >= 3) return { x: face * R(18.2) * tx, y: by - R(31.5) * tx };
    return { x: face * (P.shoulderX + R(10)) * tx, y: by - (P.shoulderY + R(7)) * tx };
  },
  // muzzle position for bolts, in world space
  muzzle(p, tier) {
    const P = this.parts(tier), g = this.grow, m = this.gunPos(p, P);
    return { x: p.x + m.x * g, y: p.y + m.y * g };
  },
};
