"use strict";
// titananim.js — the Titans' animation rig. Their art is one frame per facing, in eight true directions
// (assets/sprites/titans/<id>/<E|SE|S|SW|W|NW|N|NE>.png); every action is posed in code about the feet:
//   facing   eight directions with hysteresis, straight from the art
//   actions  idle (breathing) · walk (the leg band steps left/right under a riding body) · run (lean, bounding,
//            afterimages, dust) · attack (per-move wind-up → strike → recover) · hurt (recoil + shudder) ·
//            death (stagger, collapse, lie still)
//   wounds   three stages of cracks that glow with the Titan's element, bruising, and an enraged state:
//            a pulsing aura, heat wash, swelling, embers
const TitanAnim = {
  woundCache: new Map(),
  DIRS: ["E", "SE", "S", "SW", "W", "NW", "N", "NE"],

  // ---------------------------------------------------------------- state (called every tick, even when felled)
  update(u, dt) {
    const a = u.ta || (u.ta = { d8: 2, px: u.x, py: u.y, vx: 0, vy: 0, hurt: 0, hx: 0, hy: 0, fall: 0, rage: 0, stage: 0, hurtCd: 0, trail: [], step: 0, landed: false, t: Math.random() * 9 });
    a.t += dt;
    // real velocity, smoothed — knockback and charges count, not just steering
    const ivx = (u.x - a.px) / Math.max(dt, 1e-3), ivy = (u.y - a.py) / Math.max(dt, 1e-3);
    a.px = u.x; a.py = u.y;
    a.vx += (ivx - a.vx) * Math.min(1, dt * 10); a.vy += (ivy - a.vy) * Math.min(1, dt * 10);
    const sp = Math.hypot(a.vx, a.vy), m = u.tAtk, down = u.dazed > 0 || u.hp <= 0;
    a.speed = sp;
    a.run = !down && (sp > Math.max(70, u.speed * 1.25) || (m && m.kind === "charge" && m.t >= m.wind));

    // heading: the move being performed, else where it is going, else what it is fighting
    let ang = null;
    if (down) ang = null;
    else if (m) ang = m.a;
    else if (sp > 12) ang = Math.atan2(a.vy, a.vx);
    else if (u.target) ang = Math.atan2(u.target.y - u.y, u.target.x - u.x);
    if (ang !== null) {
      let diff = ang - (a.d8 * Math.PI) / 4; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
      if (Math.abs(diff) > 0.58) a.d8 = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;   // hysteresis: no flicker on a sector edge
    }

    if (a.hurt > 0) a.hurt -= dt / 0.3;
    if (a.hurtCd > 0) a.hurtCd -= dt;
    a.fall = clamp(a.fall + (down ? dt / 1.15 : -dt / 0.9), 0, 1);      // a bound Titan climbs back to its feet
    if (down && a.fall > 0.62 && !a.landed) {                          // the body hits the ground
      a.landed = true;
      if (Game.onScreen(u.x, u.y)) { FX.ring(u.x, u.y, u.r, u.r * 5, "#c8c0a8", 0.6, 5); FX.burst(u.x, u.y, "#c8c0a8", 26, 240, 0.8, 5); FX.addShake(9); SFX.play("thud", 0.9, 0.6); }
    }
    if (!down) a.landed = false;
    a.rage += ((u.enraged && !down ? 1 : 0) - a.rage) * Math.min(1, dt * 3);

    // wounds open as health falls
    const f = u.hp / u.maxHp, stage = down ? 3 : f < 0.35 ? 3 : f < 0.55 ? 2 : f < 0.78 ? 1 : 0;
    if (stage > a.stage && !down && Game.onScreen(u.x, u.y)) {
      const col = TYPES[u.moveType].color, H = CONFIG.beastHeight * u.scale;
      FX.burst(u.x, u.y - H * 0.5, col, 18 + stage * 8, 260, 0.7, 4); FX.burst(u.x, u.y - H * 0.5, "#2a2028", 12, 200, 0.8, 5);
      FX.text(u.x, u.y - H - 20, stage === 1 ? "WOUNDED" : stage === 2 ? "BLEEDING LIGHT" : "BREAKING", col, 1.4, 15);
      SFX.play("chink", 0.7, 0.7); FX.addShake(3 + stage);
    }
    a.stage = stage;

    if (!Game.onScreen(u.x, u.y)) { a.trail.length = 0; return; }
    const H = CONFIG.beastHeight * u.scale, col = TYPES[u.moveType].color;
    // the light leaks out of the cracks; an enraged Titan burns
    if (stage >= 2 && !down && Math.random() < (stage - 1) * 0.25 + a.rage * 0.5)
      FX.mote(u.x + (Math.random() - 0.5) * u.r * 2, u.y - H * (0.2 + Math.random() * 0.6), (Math.random() - 0.5) * 30, -(40 + Math.random() * 60), a.rage > 0.5 && Math.random() < 0.5 ? "#ff5a2a" : col, 0.5 + Math.random() * 0.5, 3 + Math.random() * 3, -30);
    // footfalls kick up dust; a run leaves afterimages
    if (sp > 20 && !down) {
      a.step -= dt * (a.run ? 2 : 1);
      if (a.step <= 0) { a.step = 0.3; FX.burst(u.x - (a.vx / sp) * u.r, u.y, "#c8c0a8", a.run ? 7 : 3, a.run ? 120 : 60, 0.45, a.run ? 4 : 3); if (a.run) FX.addShake(1.5); }
    }
    if (a.run) { a.trail.push({ x: u.x, y: u.y, life: 0.28 }); if (a.trail.length > 5) a.trail.shift(); }
    for (const g of a.trail) g.life -= dt;
    while (a.trail.length && a.trail[0].life <= 0) a.trail.shift();
  },

  // a hit lands: big ones make it flinch (rate-limited, so a horde's chip damage does not lock it in a shudder)
  hit(u, src, dmg) {
    const a = u.ta; if (!a) return;
    if (dmg < u.maxHp * 0.012 || a.hurtCd > 0 || (u.tAtk && u.tAtk.t >= u.tAtk.wind)) return;
    a.hurt = 1; a.hurtCd = 0.55;
    const dx = src && src.x !== undefined ? u.x - src.x : 0, dy = src && src.x !== undefined ? u.y - src.y : -1, d = Math.hypot(dx, dy) || 1;
    a.hx = dx / d; a.hy = dy / d;
  },

  // ---------------------------------------------------------------- wound layers (cached per frame image + stage)
  wounds(img, u, stage) {
    const key = img.src + "|w" + stage + "|" + u.moveType;
    let w = this.woundCache.get(key);
    if (w) return w;
    const W = img.naturalWidth, Hh = img.naturalHeight, G = 2;         // cracks sit on a 2px grid, like the art's own detail
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = Hh; return c; };
    const dark = mk(), glow = mk(), dx = dark.getContext("2d"), gx = glow.getContext("2d");
    let hs = 17; for (const ch of u.sp.art || u.sp.id) hs = (hs * 31 + ch.charCodeAt(0)) | 0;
    const rnd = mulberry32(hs), col = TYPES[u.moveType].color;
    const block = (ctx, x, y, s, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x / G) * G, Math.round(y / G) * G, s, s); };
    const n = [0, 4, 8, 12][stage];
    for (let i = 0; i < n; i++) {
      // same seed for every frame, in body-relative coordinates, so a crack stays where it opened
      let x = (0.34 + rnd() * 0.32) * W, y = (0.25 + rnd() * 0.5) * Hh, ang = Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const segs = 4 + ((rnd() * 4) | 0), since = i < 4 ? 1 : i < 8 ? 2 : 3;
      for (let s = 0; s < segs; s++) {
        const len = (0.05 + rnd() * 0.06) * Hh, steps = Math.max(2, Math.round(len / G));
        for (let k = 0; k < steps; k++) {
          x += (Math.cos(ang) * len) / steps; y += (Math.sin(ang) * len) / steps;
          block(dx, x, y, since === 1 && stage >= 3 ? G * 2 : G + 1, "#120a10");
          block(gx, x + (since < stage ? 0 : G), y, G, col);
          if (stage >= 3 && since === 1) block(gx, x + G, y, G, "#ffffff");
        }
        ang += (rnd() - 0.5) * 1.6;
        if (rnd() < 0.3) { const bx = x + Math.cos(ang + 1.2) * G * 3, by = y + Math.sin(ang + 1.2) * G * 3; block(dx, bx, by, G, "#120a10"); block(gx, bx, by, G, col); }
      }
    }
    if (stage >= 2) for (let i = 0; i < stage * 3; i++) {             // bruised, scorched plates
      const bx = (0.3 + rnd() * 0.4) * W, by = (0.22 + rnd() * 0.6) * Hh, r = (1 + ((rnd() * 3) | 0)) * G;
      dx.globalAlpha = 0.3; for (let yy = -r; yy <= r; yy += G) for (let xx = -r; xx <= r; xx += G) if (xx * xx + yy * yy <= r * r) block(dx, bx + xx, by + yy, G, "#120a10");
      dx.globalAlpha = 1;
    }
    for (const c of [dx, gx]) { c.globalCompositeOperation = "destination-in"; c.drawImage(img, 0, 0); }   // only on the body
    // keep only a couple of Titans' worth (8 facings x 3 stages each) and drop the oldest one at a
    // time, so this never becomes another big pile of canvases
    while (this.woundCache.size >= 48) this.woundCache.delete(this.woundCache.keys().next().value);
    w = { dark, glow }; this.woundCache.set(key, w);
    return w;
  },

  // ---------------------------------------------------------------- pose
  pose(u, a, time, H) {
    const P = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, shear: 0, rate: 0.55, action: "idle", hide: 0 };
    const d8 = a.d8, sideView = d8 === 0 || d8 === 4, face = d8 === 0 || d8 === 1 || d8 === 7 ? 1 : d8 >= 3 && d8 <= 5 ? -1 : 0;
    const fwd = sideView ? face : 0, away = d8 >= 5 && d8 <= 7 ? -1 : d8 >= 1 && d8 <= 3 ? 1 : 0;   // toward (+1) / away from (-1) the camera
    const lean = (k) => { if (sideView) P.rot += fwd * k; else { P.sy *= 1 + away * k * 0.35; P.y += away * k * H * 0.06; P.shear += face * k * 0.5; } };
    const m = u.tAtk, ease = (k) => k * k * (3 - 2 * k);

    // base rhythm
    const br = Math.sin(a.t * 1.9) * (0.016 + a.rage * 0.02);
    P.sy *= 1 + br; P.sx *= 1 - br * 0.6;
    if (a.speed > 12) {
      P.action = "walk"; P.rate = clamp(a.speed / 80, 0.8, 1.6);
      const ph = u.animT * P.rate * Math.PI * 2;
      if (a.run) P.y -= Math.abs(Math.sin(ph)) * H * 0.04;
      if (sideView) P.rot += Math.sin(ph) * 0.015; else P.shear += Math.sin(ph) * 0.025;      // weight shifting from foot to foot (the legs themselves step in draw())
      if (a.run) { P.rate = clamp(a.speed / 60, 1.6, 2.6); lean(0.16); P.sx *= 1.04; P.sy *= 0.97; }
    }
    // attack: every move reads differently in the body
    if (m && !(u.dazed > 0)) {
      P.action = m.kind === "charge" && m.t >= m.wind ? "walk" : "idle";
      const w = clamp(m.t / m.wind, 0, 1), s = clamp((m.t - m.wind) / 0.28, 0, 1), rec = clamp((m.t - m.wind - 0.28) / 0.35, 0, 1);
      const strike = m.t >= m.wind ? Math.sin(s * Math.PI) : 0, hold = m.t >= m.wind ? 1 - rec : 0;
      const tremble = Math.sin(time * 46) * w * (m.t < m.wind ? 1 : 0);
      P.x += tremble * H * 0.008;
      if (m.kind === "stomp") { P.y -= ease(w) * H * 0.14 * (1 - s); P.sy *= 1 + ease(w) * 0.1 - strike * 0.24; P.sx *= 1 - ease(w) * 0.05 + strike * 0.16; }
      else if (m.kind === "charge") { lean(-0.18 * ease(w) * (1 - s)); P.sx *= 1 + 0.05 * w; if (m.t >= m.wind) { lean(0.1); P.rate = 2.6; } }
      else if (m.kind === "breath") { lean(-0.14 * ease(w) * (1 - s) + 0.16 * hold); P.sy *= 1 + 0.07 * ease(w) * (1 - s); P.x += Math.sin(time * 38) * hold * H * 0.006; }
      else if (m.kind === "blink") { const v = m.t < m.wind ? 1 - ease(w) * 0.85 : ease(s); P.sx *= Math.max(0.08, v); P.sy *= 1 + (1 - v) * 0.35; P.hide = 1 - v; }
      else { P.y -= ease(w) * H * 0.05; P.sy *= 1 + 0.08 * ease(w) + strike * 0.05; lean(-0.12 * ease(w) * (1 - s)); P.sx *= 1 + Math.sin(time * 9) * 0.02 * hold; }   // barrage / rain: reared up, arms to the sky
    } else if (u.lungeT > 0) {                                        // a plain swipe or bite
      const k = 1 - u.lungeT / 0.32, st = Math.sin(k * Math.PI);
      lean(k < 0.3 ? -0.1 * (k / 0.3) : 0.2 * st); P.sx *= 1 + st * 0.08; P.sy *= 1 - st * 0.06;
    }
    // hurt: thrown back along the blow, shuddering
    if (a.hurt > 0 && a.fall <= 0) {
      const k = a.hurt * a.hurt;
      P.x += a.hx * k * H * 0.06; P.y += a.hy * k * H * 0.03;
      P.shear += Math.sin(time * 42) * 0.1 * k; P.sy *= 1 - 0.06 * k; P.sx *= 1 + 0.05 * k;
      if (sideView) P.rot -= fwd * 0.08 * k;
    }
    // death: a stagger, then the whole mass goes over and lies breathing
    if (a.fall > 0) {
      P.action = "idle"; P.rate = 0.25;
      const st = clamp(a.fall / 0.35, 0, 1), go = ease(clamp((a.fall - 0.35) / 0.3, 0, 1)), settle = clamp((a.fall - 0.65) / 0.35, 0, 1);
      const bounce = Math.sin(settle * Math.PI) * (1 - settle) * 0.12;
      P.x += Math.sin(time * 30) * (1 - go) * st * H * 0.025;
      if (sideView) { P.rot = -fwd * (Math.PI / 2) * 0.9 * (go - bounce); P.y -= (1 - go) * st * H * 0.04; P.x -= fwd * go * H * 0.2; }
      else { P.sy *= 1 - go * 0.5 + bounce; P.sx *= 1 + go * 0.22; P.rot = (u.uid % 2 ? 1 : -1) * go * 0.2; P.shear += (u.uid % 2 ? 1 : -1) * go * 0.25; }
    }
    const grow = 1 + a.rage * 0.08;
    P.sx *= grow; P.sy *= grow;
    return P;
  },

  // ---------------------------------------------------------------- art
  // Titan art: one 128x128 frame per facing (E SE S SW W NW N NE), foot pivot at (64,116). See
  // assets/sprites/titans/PACK_README.md. All motion is posed in code on top of these eight frames.
  FRAME: 128, PIVOT_X: 64, PIVOT_Y: 116,
  // how much of the figure (from the ground up) is legs, and how big the beast stands relative to the old art
  LEGS: { thornstag: 0.42, mireguard: 0.3, mysticave: 0.2, crystallon: 0.4, solvern: 0.3, voidwraith: 0.3 },
  SIZE: { thornstag: 1, mireguard: 1, mysticave: 0.78, crystallon: 1.05, solvern: 1.05, voidwraith: 1.05 },
  // Ground to the top of the head, in source px, measured once per Titan so every facing shares one
  // scale. This is baked in rather than measured at runtime: the old figH() ran getImageData on the art,
  // which throws a SecurityError as soon as the canvas is tainted (opening the game straight off disk on
  // a file:// URL is enough), and that throw came out of drawUnit and took the whole world's draw loop
  // with it. Re-measure with: node tools/shot.mjs tools/measure_titans.mjs
  FIGH: { thornstag: 104, mireguard: 85, mysticave: 70, crystallon: 104, solvern: 87, voidwraith: 81 },
  art: {},
  has(sp) { return !!this.LEGS[sp.art || sp.id]; },
  url(sp, dir) { return "assets/sprites/titans/" + (sp.art || sp.id) + "/" + (dir || "S") + ".png"; },
  load(sp) {
    const id = sp.art || sp.id;
    if (this.art[id]) return this.art[id];
    const e = (this.art[id] = { id, imgs: [] });
    this.DIRS.forEach((d, i) => { const im = new Image(); im.src = this.url(sp, d); e.imgs[i] = im; });
    return e;
  },
  figH(e) { return this.FIGH[e.id] || 104; },

  // ---------------------------------------------------------------- draw
  draw(ctx, u, entry, time, H, dx, dy, alpha, wet) {
    const a = u.ta || { d8: u.dir === "up" ? 6 : u.dir === "down" ? 2 : u.facing < 0 ? 4 : 0, t: 0, hurt: 0, fall: u.dazed > 0 ? 1 : 0, rage: 0, stage: 0, trail: [], speed: 0 };
    const id = u.sp.art || u.sp.id, e = this.load(u.sp), base = e.imgs[a.d8];
    if (!base || !base.complete || !base.naturalWidth) return false;
    const P = this.pose(u, a, time, H);
    const F = this.FRAME, PX = this.PIVOT_X, PY = this.PIVOT_Y, figH = this.figH(e);
    const k = (H * this.SIZE[id]) / figH;                               // world px per source px
    const col = TYPES[u.moveType].color, down = a.fall > 0.5;

    // the walk cycle: the leg band is cut in two and each half steps in turn while the body rides above it
    const legTop = Math.round(PY - figH * this.LEGS[id]), side = a.d8 === 0 || a.d8 === 4;
    let liftL = 0, liftR = 0, shL = 0, shR = 0, ride = 0;
    if (a.speed > 12 && a.fall <= 0) {
      const ph = u.animT * P.rate * Math.PI * 2, amp = a.run ? 5 : 3, sw = side ? (a.run ? 3 : 2) : 0, f = a.d8 === 4 ? -1 : 1;
      liftL = Math.round(Math.max(0, Math.sin(ph)) * amp); liftR = Math.round(Math.max(0, Math.sin(ph + Math.PI)) * amp);
      shL = Math.round(Math.cos(ph) * sw) * f; shR = Math.round(Math.cos(ph + Math.PI) * sw) * f;
      ride = Math.round(Math.abs(Math.cos(ph)) * (a.run ? 2 : 1));
    } else if (u.tAtk && u.tAtk.kind === "stomp" && u.tAtk.t < u.tAtk.wind) liftR = Math.round((u.tAtk.t / u.tAtk.wind) * 9);   // the stomping foot comes up
    const blit = (src) => {
      // the leg strips overlap each other (OV px past the centre line) and tuck UP under the body, so a step
      // or a riding body never opens a seam
      const OV = 4, UP = 7, y0 = legTop - UP, lh = F - y0;
      if (!liftL && !liftR && !shL && !shR && !ride) { ctx.drawImage(src, -PX * k, -PY * k, F * k, F * k); return; }
      ctx.drawImage(src, 0, y0, PX + OV, lh, (-PX + shL) * k, (y0 - PY - liftL) * k, (PX + OV) * k, lh * k);
      ctx.drawImage(src, PX - OV, y0, F - PX + OV, lh, (shR - OV) * k, (y0 - PY - liftR) * k, (F - PX + OV) * k, lh * k);
      ctx.drawImage(src, 0, 0, F, legTop, -PX * k, (-PY - ride) * k, F * k, legTop * k);
    };
    const place = (x, y, extra) => {
      ctx.save();
      ctx.translate(Math.round(x + P.x), Math.round(y + P.y));
      if (wet && !down) { ctx.beginPath(); ctx.rect(-H * 2, -H * 3, H * 4, H * 3 - H * 0.2); ctx.clip(); ctx.translate(0, H * 0.2); }
      ctx.rotate(P.rot);
      ctx.transform(1, 0, P.shear, 1, 0, 0);
      ctx.scale(P.sx * (extra || 1), P.sy * (extra || 1));
    };

    // afterimages of a run / charge
    if (a.trail.length) {
      const ghost = Sprites.tinted(base, col, 0.7);
      for (const g of a.trail) { ctx.globalAlpha = alpha * (g.life / 0.28) * 0.28; place(dx + (g.x - u.x), dy + (g.y - u.y)); blit(ghost); ctx.restore(); }
    }
    // enraged: a pulsing silhouette of its element burns around it
    if (a.rage > 0.05 && !down) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 9);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * a.rage * (0.3 + 0.25 * pulse); place(dx, dy + H * 0.02, 1.07 + 0.03 * pulse); blit(Sprites.tinted(base, "#ff3a2a", 1)); ctx.restore();
      ctx.globalAlpha = alpha * a.rage * 0.22 * (1 - pulse); place(dx, dy + H * 0.04, 1.14); blit(Sprites.tinted(base, col, 1)); ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
    // blit() cuts the source with explicit FRAME-sized rectangles, so whatever is drawn here must be
    // exactly one 128x128 frame — which is what tinted() guarantees.
    let img = base;
    if (u.flash > 0 && !down) img = Sprites.tinted(base, a.hurt > 0.3 ? "#ffd0c0" : "#ffffff", 0.32);   // a Titan under fire is hit constantly: keep the flash light
    else if (down) img = Sprites.tinted(base, "#1c2028", 0.5);
    else if (u.dotT > 0) img = Sprites.tinted(base, STATUS_COL[u.dotKind], 0.3);
    else if (u.slowT > 0) img = Sprites.tinted(base, "#a8ecff", 0.35);
    else if (a.rage > 0.5) img = Sprites.tinted(base, "#ff3a1a", Math.sin(time * 7) > 0 ? 0.22 : 0.12);
    ctx.globalAlpha = alpha * (1 - P.hide * 0.9);
    place(dx, dy);
    blit(img);
    if (a.stage > 0) {
      const wl = this.wounds(base, u, a.stage);
      blit(wl.dark);
      if (!down) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * (1 - P.hide) * clamp(0.35 + a.stage * 0.15 + a.rage * 0.3 + Math.sin(time * (3 + a.stage * 2)) * 0.25, 0, 1);
        blit(wl.glow);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    ctx.globalAlpha = alpha;
    if (wet && !down) { ctx.globalAlpha = 0.7 * alpha; ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 3; const rp = 0.5 + 0.5 * Math.sin(time * 4 + u.uid); ctx.beginPath(); ctx.ellipse(dx, dy - 1, u.r * (1.1 + rp * 0.4), u.r * (0.4 + rp * 0.15), 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = alpha; }
    return true;
  },
};
