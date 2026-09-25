"use strict";
// binder.js — the Binder in their spacesuit, the energy blade in their hand and the drone that covers them.
// All of it is painted procedurally on the 2px texel grid (the way the Bindframe is in mech.js), straight
// to the world canvas from a few dozen rectangles: posed every frame, nothing cached, no sprite sheet.
// The body is drawn facing +x in local space and mirrored by p.facing; front/back views are symmetric so
// the mirror only decides which hand holds the blade.

const BinderArt = {
  PAL: {
    out: "#0c101c", suitDk: "#7c8698", suit: "#c8d0de", suitLt: "#eef2f8",
    visor: "#101c34", visorHi: "#7be0ff", visorLt: "#d8f8ff",
    acc: "#ff8a3a", accDk: "#b8501a", pack: "#3a4256", packLt: "#5a667e", boot: "#2a3040", grip: "#20242e",
    glow: "#7be0ff", blade: "#9df0ff", core: "#ffffff",
  },
  _mix: {}, _pal: {},
  // the suit colours of a hero: HEROES[id].pal laid over the default palette (cached per hero)
  pal(p) {
    const id = (p && p.hero) || Game.hero || "blade", h = typeof HEROES !== "undefined" && HEROES[id];
    if (!h || !h.pal || !Object.keys(h.pal).length) return this.PAL;
    return this._pal[id] || (this._pal[id] = Object.assign({}, this.PAL, h.pal));
  },
  // a colour pulled part-way toward another (the hit flash); cached per pair
  mix(a, b, k) {
    const key = a + b + k;
    let c = this._mix[key];
    if (c) return c;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    c = "#" + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
    this._mix[key] = c;
    return c;
  },

  // ---------------------------------------------------------------- the binder
  draw(ctx, p, time) { this.body(ctx, p, time, Math.round(p.x / CONFIG.texel) * CONFIG.texel, Math.round(p.y / CONFIG.texel) * CONFIG.texel, false); },
  // helmet and shoulders only: the pilot in an open Bindframe cockpit (the caller clips at the rim)
  bust(ctx, x, yBottom, p, time) { this.body(ctx, p, time, Math.round(x / CONFIG.texel) * CONFIG.texel, Math.round(yBottom / CONFIG.texel) * CONFIG.texel + 10 * CONFIG.texel, true); },

  body(ctx, p, time, ox, oy, bust) {
    const tx = CONFIG.texel, P = this.pal(p), face = p.facing < 0 ? -1 : 1, flash = p.flash > 0 && !bust;
    const col = (c) => (flash ? this.mix(c, "#ff6a6a", 0.55) : c);
    const R = (x, y, w, h, c) => { ctx.fillStyle = col(c); ctx.fillRect(x * tx, y * tx, w * tx, h * tx); };
    ctx.save(); ctx.translate(ox, oy); ctx.scale(face, 1);
    const moving = p.moving && p.dashT <= 0 && !bust, phase = p.animT * 10;
    const sw = moving ? Math.round(Math.sin(phase) * 2) : 0;                                 // side-view leg swing
    const bob = bust ? 0 : moving ? (Math.abs(Math.cos(phase)) > 0.7 ? -1 : 0) : Math.sin(time * 2.2) > 0.6 ? -1 : 0;
    const dir = bust ? (p.dir === "up" || p.dir === "updiag" ? "up" : "down") : p.dir;
    const side = dir === "side", back = dir === "up" || dir === "updiag", diag = dir.endsWith("diag");
    if (p.dashT > 0 && !bust) { ctx.translate(0, -8 * tx); ctx.rotate(0.28); ctx.translate(0, 8 * tx); }      // lean into the dash

    if (side) {
      if (!bust) {
        R(-3 - sw, -10 + bob, 3, 7, P.suitDk); R(-4 - sw, -3, 4, 3, P.boot);                            // far leg
        R(0 + sw, -10 + bob, 3, 7, P.suit); R(0 + sw, -7 + bob, 3, 1, P.suitDk); R(1 + sw, -9 + bob, 1, 3, P.acc);
        R(0 + sw, -3, 5, 3, P.boot); R(0 + sw, -1, 5, 1, P.out);                                        // near leg
        R(-9, -18 + bob, 1, 8, P.out); R(-8, -18 + bob, 3, 8, P.pack); R(-8, -18 + bob, 3, 1, P.packLt); R(-8, -15 + bob, 1, 2, P.glow);   // backpack
        R(-6, -18 + bob, 2, 6, P.suitDk); R(-6, -12 + bob, 2, 2, P.accDk);                              // far arm
      }
      R(-5, -19 + bob, 1, 9, P.out); R(4, -19 + bob, 1, 9, P.out);
      R(-4, -19 + bob, 8, 9, P.suit); R(-4, -19 + bob, 8, 1, P.suitLt); R(-4, -11 + bob, 8, 1, P.accDk);
      R(1, -17 + bob, 3, 3, P.acc); R(2, -16 + bob, 1, 1, P.glow);                                       // chest unit
      this.helmet(R, P, 0, -19 + bob, "side");
    } else {
      if (!bust) {
        const lL = moving ? Math.max(0, Math.round(Math.sin(phase))) : 0, lR = moving ? Math.max(0, Math.round(-Math.sin(phase))) : 0;
        R(-5, -10 + bob, 4, 7, P.suit); R(-5, -3 - lL, 4, 3, P.boot); R(-4, -9 + bob, 1, 3, P.acc);
        R(1, -10 + bob, 4, 7, P.suit); R(1, -3 - lR, 4, 3, P.boot); R(3, -9 + bob, 1, 3, P.acc);
        R(-1, -10 + bob, 2, 7, P.suitDk);                                                                // the gap between the legs
        R(-8, -18 + bob, 2, 6, P.suitDk); R(-8, -12 + bob, 2, 2, P.accDk);                              // far arm
        if (back) { R(-8, -18 + bob, 2, 6, P.suit); R(6, -18 + bob, 2, 6, P.suit); R(6, -12 + bob, 2, 2, P.acc); }
      }
      R(-7, -20 + bob, 3, 2, P.pack); R(4, -20 + bob, 3, 2, P.pack);                                      // shoulder rims of the pack
      R(-6, -19 + bob, 12, 9, P.out); R(-5, -19 + bob, 10, 9, P.suit); R(-5, -19 + bob, 10, 1, P.suitLt); R(-5, -11 + bob, 10, 1, P.accDk);
      if (back) {                                                                                       // the backpack faces the camera
        R(-5, -19 + bob, 10, 8, P.out); R(-4, -19 + bob, 8, 8, P.pack); R(-4, -19 + bob, 8, 1, P.packLt); R(-1, -18 + bob, 2, 7, P.packLt);
        R(-3, -15 + bob, 1, 2, P.glow); R(2, -15 + bob, 1, 2, P.glow);
      } else { R(-2 + (diag ? 1 : 0), -17 + bob, 4, 3, P.acc); R(-1 + (diag ? 1 : 0), -16 + bob, 1, 1, P.glow); R(1 + (diag ? 1 : 0), -16 + bob, 1, 1, P.glow); }
      this.helmet(R, P, 0, -19 + bob, dir);
    }

    // the tool arm and what it holds: the blade, a mine, or the mending emitter
    if (!bust) {
      const hero = (p.hero || Game.hero || "blade"), A = hero === "blade" ? this.bladePose(p, side, face, bob, time) : this.toolPose(p, side, face, bob, time), sx = side ? 3 : 5, sy = -18 + bob;
      for (let i = 0; i <= 3; i++) R(Math.round(sx + (A.hx - sx) * (i / 3)) - 1, Math.round(sy + (A.hy - sy) * (i / 3)) - 1, 2, 2, i === 3 ? P.acc : P.suit);
      if (A.trail) {
        ctx.globalAlpha = A.trail; ctx.fillStyle = P.glow;
        ctx.beginPath(); ctx.moveTo(0, -14 * tx); ctx.arc(0, -14 * tx, (A.len + 4) * tx, A.a0, A.a, A.a < A.a0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (hero === "blade") this.blade(ctx, A.hx * tx, A.hy * tx, A.a, A.len, A.k);
      else if (hero === "trapper") this.mine(ctx, A.hx * tx, A.hy * tx, p, P, time);
      else this.emitter(ctx, A.hx * tx, A.hy * tx, A.a, p, P, time);
    }
    ctx.restore();
  },

  // dome, visor and trim. y0 is the neck line; the dome fills the eight rows above it.
  helmet(R, P, cx, y0, view) {
    R(cx - 4, y0 - 9, 8, 1, P.out); R(cx - 5, y0 - 8, 10, 7, P.out); R(cx - 4, y0 - 1, 8, 1, P.out);
    R(cx - 3, y0 - 8, 6, 1, P.suitLt); R(cx - 4, y0 - 7, 8, 6, P.suitLt); R(cx - 3, y0 - 1, 6, 1, P.suit);
    R(cx + 2, y0 - 3, 2, 2, P.suit); R(cx - 3, y0 - 7, 2, 1, P.core);
    if (view === "side") { R(cx, y0 - 6, 4, 4, P.visor); R(cx + 1, y0 - 6, 1, 1, P.visorLt); R(cx + 2, y0 - 5, 1, 1, P.visorHi); R(cx - 5, y0 - 6, 1, 3, P.suitDk); }
    else if (view === "down") { R(cx - 3, y0 - 6, 6, 4, P.visor); R(cx - 2, y0 - 6, 2, 1, P.visorLt); R(cx + 1, y0 - 5, 1, 1, P.visorHi); }
    else if (view === "downdiag") { R(cx - 1, y0 - 6, 5, 4, P.visor); R(cx, y0 - 6, 2, 1, P.visorLt); R(cx + 2, y0 - 5, 1, 1, P.visorHi); R(cx - 5, y0 - 6, 1, 3, P.suitDk); }
    else if (view === "updiag") { R(cx + 2, y0 - 6, 2, 4, P.visor); R(cx + 3, y0 - 6, 1, 1, P.visorLt); R(cx - 4, y0 - 6, 2, 3, P.suitDk); R(cx - 3, y0 - 5, 1, 1, P.glow); }
    else { R(cx - 1, y0 - 7, 2, 6, P.suit); R(cx + 1, y0 - 6, 2, 3, P.suitDk); R(cx + 2, y0 - 5, 1, 1, P.glow); }   // the back of the helmet
  },

  // where the hand is and which way the blade points, in local (unmirrored) texels
  bladePose(p, side, face, bob, time) {
    const toLocal = (a) => (face > 0 ? a : Math.PI - a);
    const sx = side ? 3 : 5, sy = -18 + bob;
    const S = p.atkT > 0 ? PlayerCtl.SWINGS[p.atkKind] : null;
    if (S) {
      const k = 1 - p.atkT / S.dur, e = k * k * (3 - 2 * k), heavy = S.heavy ? 1 : 0;
      const la = toLocal(p.swingA);
      if (S.thrust) { const r = 3 + 7 * Math.sin(k * Math.PI); return { hx: sx + Math.cos(la) * r, hy: sy + Math.sin(la) * r, a: la, len: 12, k: 0.6 }; }
      // a spin goes exactly once round (span = pi, so the blade ends where it started); the other swings overshoot a little
      const span = S.spin ? Math.PI : S.half + 0.3, a0 = la - p.sweep * span, a = la + p.sweep * (-span + 2 * span * e);
      return { hx: sx + Math.cos(a) * (S.spin ? 6 : 4), hy: sy + Math.sin(a) * (S.spin ? 6 : 4), a, a0, len: 11 + 3 * heavy + (S.spin ? 3 : 0), k: 0.5 + 0.5 * heavy, trail: S.spin ? 0.45 * (1 - k) + 0.2 : 0.28 * (1 - k) };
    }
    if (p.charging) {
      const la = toLocal(p.faceA), a = la - 2.3 + Math.sin(time * 40) * 0.06 * p.chargeK;
      return { hx: sx + Math.cos(a) * 3, hy: sy + Math.sin(a) * 3, a, len: 12 + 2 * p.chargeK, k: 0.4 + 0.6 * p.chargeK };
    }
    const walkSw = p.moving && p.dashT <= 0 ? Math.round(Math.sin(p.animT * 10)) : 0;
    return { hx: (side ? 4 : 7) - walkSw * 0.5, hy: (side ? -11 : -12) + bob, a: p.dashT > 0 ? 0.3 : 1.2, len: 10, k: 0.25 };
  },

  // the energy blade: hilt at the hand, a glowing bar with a white core. k = how hard it is burning (0..1)
  blade(ctx, hx, hy, a, len, k) {
    const tx = CONFIG.texel, P = this.PAL;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
    ctx.fillStyle = P.grip; ctx.fillRect(-2 * tx, -1.5 * tx, 3 * tx, 3 * tx);
    ctx.fillStyle = P.acc; ctx.fillRect(-1 * tx, -0.5 * tx, tx, tx);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.16 + 0.34 * k; ctx.fillStyle = P.glow;
    ctx.fillRect(0, -2.5 * tx, (len + 1) * tx, 5 * tx);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = P.blade; ctx.fillRect(tx, -tx, (len - 1) * tx, 2 * tx); ctx.fillRect(len * tx, -0.5 * tx, tx, tx);
    ctx.fillStyle = P.core; ctx.fillRect(tx, -0.5 * tx, (len - 2) * tx, tx);
    ctx.restore();
  },

  // the hand for the Trapper's mines and the Vet's emitter, in local texels: at the hip when idle, thrust out
  // toward the aim for a toss, raised for a pulse, drawn back while a charge builds
  toolPose(p, side, face, bob, time) {
    const toLocal = (a) => (face > 0 ? a : Math.PI - a);
    const sx = side ? 3 : 5, sy = -18 + bob;
    if (p.atkT > 0 && p.atkKind === "toss") { const k = 1 - p.atkT / Traps.TOSS, la = toLocal(p.swingA), r = 3 + 6 * Math.sin(Math.min(1, k * 1.4) * Math.PI); return { hx: sx + Math.cos(la) * r, hy: sy + Math.sin(la) * r, a: la }; }
    if (p.atkT > 0 && p.atkKind === "pulse") { const k = 1 - p.atkT / 0.3; return { hx: sx + 1, hy: sy - 3 - Math.round(3 * Math.sin(k * Math.PI)), a: -Math.PI / 2 }; }
    if (p.charging) { const a = -2.2 + Math.sin(time * 30) * 0.05 * p.chargeK; return { hx: sx + Math.cos(a) * 3, hy: sy + Math.sin(a) * 3, a }; }
    const walkSw = p.moving && p.dashT <= 0 ? Math.round(Math.sin(p.animT * 10)) : 0;
    return { hx: (side ? 4 : 7) - walkSw * 0.5, hy: (side ? -11 : -12) + bob, a: side ? 0.2 : 0.6 };
  },
  // a proximity mine in the hand: a dark puck with an amber light; a charge swells it into a bomb
  mine(ctx, hx, hy, p, P, time) {
    const tx = CONFIG.texel, k = p.charging ? p.chargeK : 0, s = (2 + 2 * k) * tx, lit = p.charging ? Math.sin(time * (10 + 30 * k)) > 0 : ((time * 2) | 0) % 2 === 0;
    ctx.fillStyle = P.out; ctx.fillRect(hx - s - tx, hy - s * 0.7 - tx, s * 2 + 2 * tx, s * 1.4 + 2 * tx);
    ctx.fillStyle = "#3a3428"; ctx.fillRect(hx - s, hy - s * 0.7, s * 2, s * 1.4);
    ctx.fillStyle = "#5a5040"; ctx.fillRect(hx - s * 0.6, hy - s * 0.7, s * 1.2, s * 0.6);
    ctx.fillStyle = lit ? P.glow : P.accDk; ctx.fillRect(hx - tx / 2, hy - s * 0.7, tx, tx);
    if (p.charging) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.15 + 0.35 * k; ctx.fillStyle = P.glow; ctx.beginPath(); ctx.arc(hx, hy, s * 1.8, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
  },
  // the Vet's emitter: a short grey wand with a green lens that burns while the beam is on or a burst charges
  emitter(ctx, hx, hy, a, p, P, time) {
    const tx = CONFIG.texel, on = (typeof Mend !== "undefined" && Mend.target) || p.charging || p.atkT > 0, k = p.charging ? p.chargeK : 0;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
    ctx.fillStyle = P.out; ctx.fillRect(-tx, -1.5 * tx, 6 * tx, 3 * tx);
    ctx.fillStyle = "#8a92a0"; ctx.fillRect(-tx, -tx, 5 * tx, 2 * tx); ctx.fillStyle = "#c8d0dc"; ctx.fillRect(0, -tx, 3 * tx, tx);
    ctx.fillStyle = P.accDk; ctx.fillRect(tx, -tx, tx, 2 * tx);
    ctx.fillStyle = on ? "#e8fff0" : P.glow; ctx.fillRect(4 * tx, -tx, tx, 2 * tx);
    if (on) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.25 + 0.4 * k + 0.1 * Math.sin(time * 12); ctx.fillStyle = P.glow; ctx.beginPath(); ctx.arc(4.5 * tx, 0, (2 + 3 * k) * tx, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
    ctx.restore();
  },
  // where the tool's business end is in world space (the beam starts here)
  toolPos(p) {
    const tx = CONFIG.texel, tier = Game.mechTier();
    if (tier) { const m = (Mech.armTip && Mech.armTip(p)) || Mech.muzzle(p, tier); return { x: m.x, y: m.y }; }   // the frame's arm (mech.js) when riding
    const side = p.dir === "side", face = p.facing < 0 ? -1 : 1, A = this.toolPose(p, side, face, 0, Game.time);
    return { x: p.x + face * (A.hx + Math.cos(A.a) * 4) * tx, y: p.y + (A.hy + Math.sin(A.a) * 4) * tx };
  },
  // a hero on a card: the suit and tool, standing, facing the camera
  portrait(canvas, hero, scale) {
    const ctx = canvas.getContext("2d"), s = scale || 3;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2, canvas.height - 6 * s);
    const fake = { hero, facing: 1, dir: "downdiag", moving: false, dashT: 0, flash: 0, animT: 0, atkT: 0, atkKind: "q1", charging: false, chargeK: 0, faceA: Math.PI / 2, swingA: Math.PI / 2 };
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#0a0e18"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    this.body(ctx, fake, 0, 0, 0, false);
    if (hero === "blade") this.drone(ctx, { x: -18, y: -CONFIG.playerHeight - 8, a: 0.3, flash: 0 }, 0, false);
  },

  // ---------------------------------------------------------------- the drone
  // a flattened disc with two thruster pods, an eye that tracks its target and a blinking antenna
  drone(ctx, d, time, active) {
    const tx = CONFIG.texel, P = this.PAL, ox = Math.round(d.x / tx) * tx, oy = Math.round(d.y / tx) * tx;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * tx, oy + y * tx, w * tx, h * tx); };
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = active ? 0.2 : 0.1; ctx.fillStyle = P.glow;
    ctx.beginPath(); ctx.arc(ox, oy + tx, 7 * tx, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    const fl = ((time * 24) | 0) % 2 === 0;
    R(-6, -1, 2, 2, P.pack); R(4, -1, 2, 2, P.pack); R(-6, 1, 2, 1, fl ? P.glow : P.acc); R(4, 1, 2, 1, fl ? P.acc : P.glow);   // pods
    R(-2, -4, 4, 1, P.out); R(-3, -3, 1, 1, P.out); R(2, -3, 1, 1, P.out); R(-4, -2, 1, 4, P.out); R(3, -2, 1, 4, P.out); R(-3, 2, 1, 1, P.out); R(2, 2, 1, 1, P.out); R(-2, 3, 4, 1, P.out);
    R(-2, -3, 4, 1, P.suitLt); R(-3, -2, 6, 4, P.suit); R(-2, 2, 4, 1, P.suitDk); R(-3, -2, 1, 1, P.suitLt);
    const ex = Math.round(Math.cos(d.a) * 1.5), ey = Math.round(Math.sin(d.a) * 1);
    R(ex - 1, ey - 1, 3, 2, P.visor); R(ex, ey - 1, 1, 1, active ? (Math.sin(time * 12) > 0 ? P.visorLt : P.glow) : P.visorHi);
    R(0, -6, 1, 2, P.suitDk); R(0, -7, 1, 1, ((time * 3) | 0) % 2 ? P.acc : P.accDk);
    if (d.flash > 0) {
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, d.flash / 0.08); ctx.fillStyle = "#ffffff";
      const mx = ox + Math.cos(d.a) * 5 * tx, my = oy + Math.sin(d.a) * 3 * tx;
      ctx.fillRect(mx - 3, my - 3, 6, 6); ctx.fillRect(mx - 6, my - 1, 12, 2); ctx.fillRect(mx - 1, my - 6, 2, 12);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
  },
};
