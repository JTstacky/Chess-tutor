"use strict";
// fx.js — particles, rings, beams, floating text, screen shake. All drawn as
// chunky squares snapped to the 2px world grid so effects match the pixel art.

const FX = {
  parts: [], texts: [], rings: [], beams: [], arcs: [], zaps: [], pillars: [],
  shake: 0,
  MAX_PARTS: 900,

  reset() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.beams.length = 0; this.arcs.length = 0; this.zaps.length = 0; this.pillars.length = 0; this.shake = 0; },

  burst(x, y, color, n, speed, life, size) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.MAX_PARTS) return;
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.25, g: speed * 1.4, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size || 4 });
    }
  },
  // single drifting mote (embers, snow, trails)
  mote(x, y, vx, vy, color, life, size, g) {
    if (this.parts.length >= this.MAX_PARTS) return;
    this.parts.push({ x, y, vx, vy, g: g || 0, life, max: life, color, size: size || 2 });
  },
  text(x, y, str, color, life, size) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({ x, y, str, color, life: life || 0.9, max: life || 0.9, size: size || 13 });
  },
  ring(x, y, r0, r1, color, life, width) { this.rings.push({ x, y, r0, r1, color, life, max: life, width: width || 3 }); },
  beam(x0, y0, x1, y1, color, life, width) { this.beams.push({ x0, y0, x1, y1, color, life, max: life, width: width || 3 }); },
  // a claw / blade swipe: a crescent sweeping through angle a, radius r
  slash(x, y, a, r, color, life) { if (this.arcs.length < 160) this.arcs.push({ x, y, a, r, color, life: life || 0.22, max: life || 0.22 }); },
  // jagged lightning between two points; re-rolled every few frames while it lives
  zap(x0, y0, x1, y1, color, life, width) { if (this.zaps.length < 80) this.zaps.push({ x0, y0, x1, y1, color, life: life || 0.18, max: life || 0.18, width: width || 2, seed: (Math.random() * 1e6) | 0 }); },
  // a column of light slamming down (orbital strikes, launches)
  pillar(x, y, r, color, life) { this.pillars.push({ x, y, r, color, life, max: life }); },
  // a spray of motes inside a cone (breath attacks)
  cone(x, y, a, half, range, color, n, size) {
    for (let i = 0; i < n; i++) {
      const aa = a + (Math.random() - 0.5) * 2 * half, sp = range * (1.2 + Math.random() * 1.2);
      this.mote(x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, color, 0.35 + Math.random() * 0.3, size || 5, -30);
    }
  },
  addShake(v) { this.shake = Math.min(14, this.shake + v); },

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.5;
      this.parts[w++] = p;
    }
    this.parts.length = w;
    for (const arr of [this.texts, this.rings, this.beams, this.arcs, this.zaps, this.pillars]) {
      let k = 0;
      for (let i = 0; i < arr.length; i++) { const e = arr[i]; e.life -= dt; if (e.life > 0) arr[k++] = e; }
      arr.length = k;
    }
    for (const t of this.texts) t.y -= 34 * dt;
    this.shake = Math.max(0, this.shake - dt * 30);
  },

  drawGround(ctx) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max, rad = lerp(r.r0, r.r1, 1 - (1 - t) * (1 - t));
      ctx.globalAlpha = Math.min(1, (r.life / r.max) * 1.6);
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.8, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  draw(ctx) {
    ctx.lineCap = "round";
    for (const b of this.beams) {
      const k = b.life / b.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = b.color; ctx.lineWidth = b.width * (0.4 + k * 0.6);
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, b.width * 0.35 * k);
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    }
    for (const s of this.arcs) {
      // the crescent sweeps across its arc as it fades, thick in the middle and sharp at the tips
      const k = 1 - s.life / s.max, a0 = s.a - 1.1 + k * 0.9, a1 = a0 + 1.3;
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.8);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, a0, a1); ctx.arc(s.x - Math.cos(s.a) * s.r * 0.22, s.y - Math.sin(s.a) * s.r * 0.22, s.r * 0.92, a1, a0, true); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, a0 + 0.15, a1 - 0.15); ctx.stroke();
    }
    for (const z of this.zaps) {
      const rnd = mulberry32(z.seed + ((z.life * 40) | 0)), dx = z.x1 - z.x0, dy = z.y1 - z.y0, d = Math.hypot(dx, dy) || 1, n = Math.max(3, (d / 22) | 0);
      ctx.globalAlpha = Math.min(1, (z.life / z.max) * 2);
      ctx.beginPath(); ctx.moveTo(z.x0, z.y0);
      for (let i = 1; i < n; i++) { const u = i / n, j = (rnd() - 0.5) * Math.min(26, d * 0.22); ctx.lineTo(z.x0 + dx * u - (dy / d) * j, z.y0 + dy * u + (dx / d) * j); }
      ctx.lineTo(z.x1, z.y1);
      ctx.strokeStyle = z.color; ctx.lineWidth = z.width + 2; ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, z.width - 1); ctx.stroke();
    }
    for (const p of this.pillars) {
      const k = p.life / p.max, w = p.r * (0.3 + 0.7 * Math.sin(k * Math.PI));
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 * k; ctx.fillStyle = p.color; ctx.fillRect(p.x - w, p.y - 1400, w * 2, 1400);
      ctx.globalAlpha = 0.8 * k; ctx.fillStyle = "#ffffff"; ctx.fillRect(p.x - w * 0.35, p.y - 1400, w * 0.7, 1400);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.lineCap = "butt";
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x / 2) * 2 - s / 2, Math.round(p.y / 2) * 2 - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  },

  drawTexts(ctx, zoom) {
    ctx.textAlign = "center";
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      const pop = 1 + Math.max(0, k - 0.8) * 1.5;
      ctx.font = "bold " + Math.round((t.size * pop) / Math.max(0.75, Math.min(1.2, zoom)) ) + "px 'Trebuchet MS', Verdana, sans-serif";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,12,20,0.9)";
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};
