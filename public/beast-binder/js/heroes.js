"use strict";
// heroes.js — the three Binders you can land as, chosen at the start of every planet (Game.hero, saved with the
// planet). They share movement, dash, net, the drone and the horde commands; what differs is the attack button
// (tap / hold / full charge — the press-and-release state machine lives in PlayerCtl.attack):
//   blade   — the suited swordsman: a three-hit combo, a heavy sweep, a full spin (PlayerCtl.SWINGS in player.js)
//   trapper — tosses proximity mines toward the aim; a held charge tosses a bigger bomb, a full charge a huge one
//   vet     — a mending beam that locks onto the most hurt marching beast on its own; tap pulses a heal around
//             you, a held charge bursts a wide heal that also hurries fallen beasts back
// Each hero recolours the suit (BinderArt.pal) and holds a different tool (BinderArt.tool).

const HEROES = {
  blade: {
    name: "Vanguard", tool: "Blade", role: "Fights at the front", color: "#9df0ff",
    desc: ["Tap: forehand · backhand · lunging thrust", "Hold: a heavy sweep", "Full charge: a spin that throws foes into the air"],
    hint: (touch) => (touch ? "Tap your right thumb to cut a wild beast with your blade" : "Click to cut a wild beast with your blade") + "; your drone joins in.",
    guide: "<b>The blade.</b> Tap to strike the way you face: forehand, backhand, then a lunging thrust. <b>Hold</b> to wind up a heavy sweep and release it; hold until the ring at your feet closes for a <b>spin</b> that throws everything around you into the air.",
    pal: {},
  },
  trapper: {
    name: "Trapper", tool: "Mines", role: "Controls the ground", color: "#ffb03a",
    desc: ["Tap: toss a proximity mine", "Hold: toss a bigger bomb", "Full charge: a huge bomb that hurls foes"],
    hint: (touch) => (touch ? "Tap your right thumb to toss a mine under a wild beast" : "Click to toss a mine under a wild beast") + "; your drone joins in.",
    guide: "<b>The mines.</b> Tap to toss a proximity mine toward your aim: it arms in half a second and blows when a foe steps near it. <b>Hold</b> for a bigger bomb, hold until the ring at your feet closes for a <b>huge</b> one that hurls foes and leaves them reeling. Six mines can wait at once; the seventh sets off the oldest. Mines that lie close together go up as a <b>chain</b>.",
    pal: { suit: "#9aa86a", suitDk: "#5c6a3c", suitLt: "#c4d09a", acc: "#ffb03a", accDk: "#b8701a", pack: "#3a3428", packLt: "#5a5040", glow: "#ffb03a", visorHi: "#ffd07a", visorLt: "#fff0c0" },
  },
  vet: {
    name: "Vet", tool: "Mend", role: "Keeps the horde standing", color: "#7dffb0",
    desc: ["Beam: mends the most hurt beast on its own", "Tap: a pulse of healing around you", "Full charge: a wide burst heal that hurries fallen beasts back"],
    hint: (touch) => "Your drone shoots provoked beasts while your beam keeps your horde mended" + (touch ? "; tap your right thumb to pulse a heal." : "; click to pulse a heal."),
    guide: "<b>The beam.</b> It needs no button: it locks onto the most hurt marching beast in range and mends it. <b>Tap</b> to pulse a heal around you. <b>Hold</b> to charge a burst heal — the longer, the wider and stronger — that also clears burns, poison and slows and brings fallen beasts back sooner.",
    pal: { suit: "#e2eef2", suitDk: "#8ab4bc", suitLt: "#f6fbfc", acc: "#ff5a6a", accDk: "#b82a3a", pack: "#3a4a52", packLt: "#5a7280", glow: "#7dffb0", visorHi: "#7dffb0", visorLt: "#d8ffe8" },
  },
};
const HERO_IDS = Object.keys(HEROES);

// ---------------------------------------------------------------- the Trapper's mines
const Traps = {
  list: [], n: 0, MAX: 5, TOSS: 0.45,       // TOSS: seconds a throw takes (the cadence of taps)
  // dmg is a multiple of PlayerCtl.boltDamage(); aoe / range grow with the Bindframe (Mech.reach)
  KINDS: [
    { name: "mine",     dmg: 2.4, aoe: 58,  kb: 8,  range: 90,  fuse: 14, arm: 0.45, size: 5 },
    { name: "bomb",     dmg: 5.2, aoe: 95,  kb: 12, range: 130, fuse: 14, arm: 0.5,  size: 7 },
    { name: "big bomb", dmg: 8.5, aoe: 140, kb: 16, range: 160, fuse: 14, arm: 0.6,  size: 9, quake: true },
  ],
  reset() { this.list.length = 0; },
  // toss one from the hand toward the aim: it arcs, lands, arms, and waits for a foe (or its fuse)
  toss(p, kind) {
    const K = this.KINDS[kind], g = Mech.reach(Game.mechTier());
    const dx = p.holdAimX - p.x, dy = p.holdAimY - p.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, K.range * g), a = Math.atan2(dy, dx);
    if (Math.abs(Math.cos(a)) > 0.15) p.facing = Math.cos(a) > 0 ? 1 : -1;
    p.faceA = a; p.swingA = a; p.atkT = this.TOSS; p.atkKind = "toss"; p.atkHit = true;
    const o = BinderArt.toolPos(p), sy = o.y;      // leaves the hand (or the frame's launcher arm)
    this.list.push({ id: ++this.n, kind, K, g, x: o.x, y: sy, z: 0, sx: o.x, sy, tx: p.x + Math.cos(a) * m, ty: p.y + Math.sin(a) * m, t: 0, dur: 0.3 + m / 450, live: false, armT: K.arm, fuse: K.fuse });
    // only so many can wait at once: the seventh sets off the oldest
    let live = this.list.filter((t) => t.live);
    while (live.length >= this.MAX) { this.detonate(live.shift(), p); }
    SFX.play("lob", 0.6, 1.15 - kind * 0.15);
    sicDrone(p, K.range * g);
  },
  update(p, dt) {
    for (const t of this.list) {
      if (t.gone) continue;
      if (!t.live) {
        t.t += dt / t.dur; const k = Math.min(1, t.t);
        t.x = lerp(t.sx, t.tx, k); t.y = lerp(t.sy, t.ty, k); t.z = Math.sin(k * Math.PI) * 46;
        if (k >= 1) { t.live = true; t.z = 0; t.y = t.ty; if (Game.onScreen(t.x, t.y)) { FX.burst(t.x, t.y, "#c8c0a8", 4, 60, 0.3, 3); SFX.play("thud", 0.2, 1.7); } }
        continue;
      }
      t.armT -= dt; t.fuse -= dt;
      if (t.fuse <= 0) { this.detonate(t, p); continue; }
      if (t.armT > 0) continue;
      const trig = t.K.aoe * 0.55 * t.g;
      let hit = false;
      Grid.query(t.x, t.y, trig + 60, (e) => { if (!hit && e.team === 1 && targetable(e) && dist2(e.x, e.y, t.x, t.y) < (trig + e.r) * (trig + e.r)) hit = true; });
      if (hit) this.detonate(t, p);
    }
    let w = 0; for (const t of this.list) if (!t.gone) this.list[w++] = t; this.list.length = w;
  },
  detonate(t, p) {
    if (t.gone) return;
    t.gone = true;
    const K = t.K, aoe = K.aoe * t.g, dmg = PlayerCtl.boltDamage() * K.dmg;
    forEnemies(p, t.x, t.y, aoe, (e) => {
      const k = 1 - 0.4 * Math.min(1, Math.hypot(e.x - t.x, e.y - t.y) / aoe);       // hardest at the heart of the blast
      dealDamage(p, e, dmg * k, "arcane", { text: true, kb: K.kb });
      if (K.quake && e.hp > 0 && !e.titan) { e.stunT = Math.max(e.stunT || 0, 0.6); applyStatus(e, "slow", p, 0); }
      if (e.hp > 0) { p.mark = e; p.markT = 4; }
    });
    FX.ring(t.x, t.y, 8, aoe, "#ffb03a", 0.35, 4);
    FX.burst(t.x, t.y, "#ff8a3a", 10 + t.kind * 8, 150 + t.kind * 80, 0.5, 4); FX.burst(t.x, t.y, "#ffffff", 6 + t.kind * 4, 120, 0.3, 3);
    for (let i = 0; i < 4 + t.kind * 3; i++) FX.mote(t.x + (Math.random() - 0.5) * aoe * 0.5, t.y, (Math.random() - 0.5) * 40, -50 - Math.random() * 40, "#5a5048", 0.8, 5 + t.kind * 2, -20);
    if (K.quake) { FX.ring(t.x, t.y, 10, aoe * 1.4, "#ffffff", 0.5, 5); FX.pillar(t.x, t.y, aoe * 0.2, "#ffb03a", 0.35); FX.addShake(8); SFX.play("bigHit", 0.7, 0.9); }
    else { FX.addShake(2 + t.kind * 2); SFX.play("boom", 0.5 + t.kind * 0.15, 1.1 - t.kind * 0.15); }

    // a blast sets off the other mines it reaches a beat later: a clustered field goes up as a chain
    for (const o of this.list) if (o !== t && o.live && !o.gone && dist2(o.x, o.y, t.x, t.y) < aoe * aoe) { o.armT = 0; o.fuse = Math.min(o.fuse, 0.1 + 0.06 * Math.sqrt(dist2(o.x, o.y, t.x, t.y)) / 10); o.chained = true; }
  },
  // the mines on the ground: a dark disc with a blinking light, and a faint ring for the trigger once armed
  drawGround(ctx, time) {
    for (const t of this.list) {
      if (!t.live || t.gone) continue;
      const s = t.K.size * t.g, armed = t.armT <= 0, late = t.fuse < 3;
      if (armed) {
        ctx.globalAlpha = 0.1 + 0.05 * Math.sin(time * 3); ctx.strokeStyle = "#ffb03a"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -time * 10;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.K.aoe * 0.55 * t.g, t.K.aoe * 0.55 * t.g * 0.8, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      this.disc(ctx, t.x, t.y, s, armed ? Math.sin(time * (late ? 26 : 7) + t.id) > 0 : false, late);
    }
  },
  disc(ctx, x, y, s, lit, late) {
    ctx.fillStyle = "#0c101c"; ctx.beginPath(); ctx.ellipse(x, y, s + 2, (s + 2) * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#3a3428"; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5a5040"; ctx.beginPath(); ctx.ellipse(x, y - 1, s * 0.7, s * 0.45, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = lit ? (late ? "#ff3a3a" : "#ffb03a") : "#4a2a10"; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 3, 3);
    if (lit) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35; ctx.fillStyle = late ? "#ff3a3a" : "#ffb03a"; ctx.beginPath(); ctx.arc(x, y - 2, s * 1.4, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
  },
  // mines still in the air, with their shadow on the ground
  drawAir(ctx, time) {
    for (const t of this.list) {
      if (t.live || t.gone) continue;
      const s = t.K.size * t.g;
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#0a0e18"; ctx.beginPath(); ctx.ellipse(t.x, t.y, s * 1.2, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      this.disc(ctx, t.x, t.y - t.z, s, Math.sin(time * 20) > 0, false);
    }
  },
};

// ---------------------------------------------------------------- the Vet's mending
const Mend = {
  target: null, retarget: 0, tick: 0, pulseCd: 0, PULSE_CD: 1.1,
  range() { return 260 * Mech.reach(Game.mechTier()); },
  valid(p, t) { const R = this.range(); return !!t && Game.army.indexOf(t) >= 0 && !t.down && t.hp > 0 && t.hp < t.maxHp && dist2(t.x, t.y, p.x, p.y) < R * R; },
  pick(p) {
    let best = null, bf = 0.999; const R = this.range();
    for (const u of Game.army) {
      if (u.down || u.hp <= 0 || u.hp >= u.maxHp || dist2(u.x, u.y, p.x, p.y) > R * R) continue;
      const f = u.hp / u.maxHp; if (f < bf) { bf = f; best = u; }
    }
    return best;
  },
  // the beam: locks onto the most hurt marching beast in range and mends it a little every frame
  update(p, dt) {
    this.retarget -= dt; this.pulseCd -= dt;
    if (this.retarget <= 0 || !this.valid(p, this.target)) { this.retarget = 0.3; this.target = this.pick(p); }
    const t = this.target;
    if (!t) return;
    const rate = t.maxHp * 0.04 + PlayerCtl.boltDamage() * 0.7;                        // per second
    t.hp = Math.min(t.maxHp, t.hp + rate * dt); t.mendedAt = Game.time;
    if (Math.random() < 0.35 && Game.onScreen(t.x, t.y)) FX.mote(t.x + (Math.random() - 0.5) * t.r * 1.5, t.y - t.r * 0.5, 0, -40, "#7dffb0", 0.4, 2);
    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 0.9; if (Game.onScreen(t.x, t.y)) FX.text(t.x, t.y - t.r * 2.4 - 8, "+" + Math.round(rate * 0.9), "#7dffb0", 0.6, 11); }
  },
  heal(u, amount, show) {
    if (u.hp <= 0 || u.down) return 0;
    const n = Math.min(u.maxHp - u.hp, Math.round(amount)); if (n <= 0) return 0;
    u.hp += n; u.mendedAt = Game.time;
    if (show && Game.onScreen(u.x, u.y)) { FX.text(u.x, u.y - u.r * 2.4 - 8, "+" + n, "#7dffb0", 0.8, 12); FX.burst(u.x, u.y - u.r, "#7dffb0", 5, 70, 0.4, 3); }
    return n;
  },
  // tap: a pulse of healing around the Vet
  pulse(p) {
    const g = Mech.reach(Game.mechTier()), r = 110 * g, base = PlayerCtl.boltDamage() * 1.5;
    // a tap always points the drone; the heal itself waits out its cooldown
    if (this.pulseCd > 0) { sicDrone(p); p.atkT = 0.12; p.atkKind = "pulse"; p.atkHit = true; SFX.play("chink", 0.25, 0.8); return; }
    this.pulseCd = this.PULSE_CD;
    p.atkT = 0.3; p.atkKind = "pulse"; sicDrone(p); p.atkHit = true; p.swingA = p.faceA;
    let n = 0;
    for (const u of Game.army) if (!u.down && dist2(u.x, u.y, p.x, p.y) < (r + u.r) * (r + u.r) && this.heal(u, u.maxHp * 0.1 + base, true)) n++;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05);
    FX.ring(p.x, p.y, 10, r, "#7dffb0", 0.3, 3);
    SFX.play("bind", 0.35, n ? 1.2 : 0.9);
  },
  // held charge: a wide burst that mends everyone near, clears their ailments, and hurries fallen beasts back
  burst(p, k) {
    const g = Mech.reach(Game.mechTier()), r = (140 + 160 * k) * g, frac = 0.18 + 0.22 * k, base = PlayerCtl.boltDamage() * (2 + 3 * k);
    p.atkT = 0.4; p.atkKind = "pulse"; sicDrone(p); p.atkHit = true; p.swingA = p.faceA;
    let n = 0, back = 0;
    for (const u of Game.army) {
      if (u.down > 0) { u.down = Math.max(0.05, u.down - (4 + 8 * k)); back++; continue; }
      if (dist2(u.x, u.y, p.x, p.y) > (r + u.r) * (r + u.r)) continue;
      u.dotT = 0; u.dotDps = 0; u.slowT = 0;
      if (this.heal(u, u.maxHp * frac + base, true)) n++;
    }
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (0.1 + 0.1 * k));
    FX.ring(p.x, p.y, 20, r, "#7dffb0", 0.5, 5); FX.ring(p.x, p.y, 10, r * 0.6, "#ffffff", 0.35, 3); FX.burst(p.x, p.y - 20, "#7dffb0", 16 + Math.round(14 * k), 160 + 120 * k, 0.6, 4);
    if (k >= 1) { FX.pillar(p.x, p.y, 36 * g, "#7dffb0", 0.5); FX.addShake(3); }
    if (back) FX.text(p.x, p.y - Mech.height(Game.mechTier()) - 26, back + " fallen hurried back", "#7dffb0", 1.2, 13);
    Game.slowT = Math.max(Game.slowT, 0.1);
    SFX.play("level", 0.5, 1.1 + 0.3 * k);
  },
};

// ---------------------------------------------------------------- dispatch
// point the drone at the targetable foe nearest the attack's aim (the blade does this by hitting; the other tools
// have no blow to land, so their tap does it instead). Returns the foe, or null.
function sicDrone(p, range) {
  const ax = p.holdAimX || p.x, ay = p.holdAimY || p.y, R2 = (range || 220) * (range || 220);
  let best = null, bd = R2;
  Grid.query(ax, ay, range || 220, (e) => { if (e.team === 1 && targetable(e)) { const d = dist2(e.x, e.y, ax, ay); if (d < bd) { bd = d; best = e; } } });
  if (best) { p.mark = best; p.markT = 4; }
  return best;
}

const Heroes = {
  ids: HERO_IDS,
  def(id) { return HEROES[id] || HEROES.blade; },
  current() { return this.def(Game.hero); },
  reset() { Traps.reset(); Mend.target = null; },
  update(p, dt) { if (Game.hero === "trapper") Traps.update(p, dt); else if (Game.hero === "vet") Mend.update(p, dt); },
  // the attack button, resolved by PlayerCtl.attack: a tap, or a released hold with its charge k (0..1)
  quick(p) { if (Game.hero === "trapper") Traps.toss(p, 0); else if (Game.hero === "vet") Mend.pulse(p); else PlayerCtl.quick(p); },
  heavy(p, k) { if (Game.hero === "trapper") Traps.toss(p, k >= 1 ? 2 : 1); else if (Game.hero === "vet") Mend.burst(p, k); else PlayerCtl.swing(p, k >= 1 ? "charged" : "heavy"); },
  drawGround(ctx, time) { if (Game.hero === "trapper") Traps.drawGround(ctx, time); },
  // world-layer extras drawn right after the Binder: mines in flight, the mending beam
  drawWorld(ctx, p, time) {
    if (Game.hero === "trapper") Traps.drawAir(ctx, time);
    else if (Game.hero === "vet" && Mend.target && Game.state === "play") {
      const t = Mend.target, e = BinderArt.toolPos(p), k = 0.5 + 0.5 * Math.sin(time * 9);
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.35; ctx.strokeStyle = "#7dffb0"; ctx.lineWidth = 7 + k * 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(t.x, t.y - t.r * 0.6); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = "#e8fff0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(t.x, t.y - t.r * 0.6); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = "butt";
      ctx.fillStyle = "#e8fff0"; ctx.fillRect(Math.round(e.x) - 2, Math.round(e.y) - 2, 4, 4);
    }
  },
};
