// Duke Garland (and co-op knights). A local hero is simulated from its InputState;
// a remote hero is a puppet interpolated from network snapshots.
//
// Movement is continuous but tuned to the original (data/world/physics.json): the
// knight is 3 tiles tall (2 crouching), walks about a tile per original frame, jumps
// 2 rows (4 with Feruza Shoes) only while the button is held, climbs ropes a row per
// frame, is knocked back 2 tiles, slides on level-4 ice and down slopes, and is
// carried by airflow at 2 tiles per frame.
import { TILE, F } from '../world/tilemap.js';
import { clamp, approach, overlap } from '../core/util.js';
import { sheetNow } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { ctx } from '../render/screen.js';

const ORIG = 24 * 11.83; // 1 tile per original frame, in px/s (≈284)

export const PHYS = {
  walk: 250, accel: 2600, decel: 3200, airAccel: 2200,
  gravity: 2700, maxFall: ORIG * 1.35, jumpRows: 2.25, jumpCut: 0.4, coyote: 0.08, buffer: 0.12,
  climb: ORIG * 0.8, w: 40, h: 70, crouchH: 46,
  knockTiles: 2, stun: 0.22, iframes: 0.45,
  iceFriction: 260, wind: ORIG * 2 * 0.8, slopeSlide: ORIG / 4,
};
// The climbing frames were painted smaller (a 70 px body against 79 px standing), so the knight
// shrank on every rope. Draw them up to the standing size.
const POSE_SCALE = { climb: 1.14 };
export const jumpV = (rows) => Math.sqrt(2 * PHYS.gravity * rows * TILE);

// Sword boxes relative to the feet-centre, facing right: [x, y, w, h]. Active from t0 to
// t1 seconds. The original forward swing lasts 3 frames and reaches 4 tiles past the
// knight's body (5 with the Knight's and Illumination swords); `reach` adds that tile.
export const ATTACKS = {
  slash: { dur: 0.26, t0: 0.03, t1: 0.17, box: [6, -62, 66, 46] },
  overhead: { dur: 0.3, t0: 0.03, t1: 0.2, box: [-34, -112, 104, 70] },
  low: { dur: 0.24, t0: 0.03, t1: 0.15, box: [6, -36, 66, 34] },
  thrust: { dur: 99, t0: 0, t1: 99, box: [-18, -6, 36, 40] },
};

let heroSeq = 0;

export class Hero {
  constructor(opts = {}) {
    this.id = opts.id ?? `h${++heroSeq}`;
    this.kind = 'hero';
    this.name = opts.name || 'Duke';
    this.slot = opts.slot ?? 0; // colour / player number
    this.local = opts.local ?? true;
    this.stats = opts.stats || {}; // derived equipment effects
    this.x = 0; this.y = 0; this.w = PHYS.w; this.h = PHYS.h;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.state = 'idle'; // idle walk jump fall climb crouch hurt dead spirit door cast
    this.stateT = 0;
    this.attack = null; // { kind, t, hits:Set }
    this.iframes = 0;
    this.stun = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.animT = 0;
    this.flash = 0;
    this.castT = 0;
    this.spiritT = 0; // co-op: time left as a spirit before auto-return
    this.fallStartY = 0;
    this.slideV = 0; // ice momentum
    this.remote = null; // interpolation buffer for puppets
    this.input = null;
  }

  get cx() { return this.x + this.w / 2; }
  get feet() { return this.y + this.h; }
  get alive() { return this.state !== 'dead' && this.state !== 'spirit'; }

  // Place by the original convention: left column + head row of the 3x3 body.
  placeTiles(leftCol, headRow) { this.place((leftCol + 1.5) * TILE, (headRow + 3) * TILE); }
  place(x, feetY) {
    this.x = x - this.w / 2;
    this.y = feetY - this.h;
    this.vx = this.vy = 0;
    this.attack = null;
    this.h = PHYS.h;
    this.y = feetY - this.h;
    if (this.state === 'climb' || this.state === 'crouch' || this.state === 'door') this.state = 'idle';
  }

  setCrouch(on, map) {
    const h = on ? PHYS.crouchH : PHYS.h;
    if (h === this.h) return true;
    const ny = this.y + this.h - h;
    if (!on && map.rectSolid(this.x, ny, this.w, h)) return false; // no headroom to stand
    this.y = ny;
    this.h = h;
    return true;
  }

  // ---------------------------------------------------------------- simulation
  update(dt, input, world) {
    const map = world.map;
    this.input = input;
    this.animT += dt;
    this.stateT += dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.castT > 0) this.castT -= dt;
    if (this.state === 'dead') { this.vx = approach(this.vx, 0, 600 * dt); this.fall(dt, map); return; }
    if (this.state === 'spirit') { this.updateSpirit(dt, input, world); return; }
    if (this.state === 'door' || this.frozen) return;

    const L = input.down('left'), R = input.down('right'), U = input.down('up'), D = input.down('down');
    if (input.pressed('jump')) this.jumpBuffer = PHYS.buffer; else this.jumpBuffer -= dt;

    // Knockback: 2 tiles away from the hit, no control until it ends.
    if (this.stun > 0) {
      this.stun -= dt;
      map.move(this, this.vx * dt, 0);
      this.fall(dt, map);
      if (this.stun <= 0) { this.vx = 0; if (this.state === 'hurt') this.state = this.h < PHYS.h ? 'crouch' : this.onGround ? 'idle' : 'fall'; }
      return;
    }

    // Rope climbing (the original's main vertical traversal). Ropes are grabbed with
    // Up, or with Down while airborne ("grab while falling").
    if (this.state === 'climb') { this.updateClimb(dt, input, map, U, D, L, R); return; }
    const onRope = this.ropeCol(map) != null;
    if (onRope && (U || (D && !this.onGround)) && !this.attack && !world.doorAt?.(this)) { this.startClimb(map); return; }

    // Attacks
    if (this.attack) {
      this.attack.t += dt;
      const a = ATTACKS[this.attack.kind];
      if (this.attack.kind === 'thrust') { if (this.onGround || !D) this.attack = null; }
      else if (this.attack.t >= a.dur) this.attack = null;
    }
    if (input.pressed('attack') && !this.attack && this.castT <= 0) {
      let kind = 'slash';
      if (!this.onGround && D) kind = 'thrust';
      else if (U) kind = 'overhead';
      else if (this.state === 'crouch') kind = 'low';
      this.attack = { kind, t: 0, hits: new Set() };
      audio.sfx('sword_swing', { rate: kind === 'overhead' ? 0.9 : 1 });
    }
    if (input.pressed('magic') && !this.attack && this.castT <= 0) world.castSpell?.(this);

    // Crouch
    const wantCrouch = D && this.onGround && !this.hardLand;
    if (this.hardLand > 0) { this.hardLand -= dt; if (this.hardLand <= 0) this.hardLand = 0; }
    const crouching = wantCrouch || this.hardLand > 0;
    if (crouching && this.state !== 'crouch') { this.setCrouch(true, map); this.state = 'crouch'; }
    else if (!crouching && this.state === 'crouch') { if (this.setCrouch(false, map)) this.state = 'idle'; }

    // Horizontal
    const under = this.onGround ? this.groundFlags(map) : 0;
    const ice = (under & F.ICE) && !this.stats.iceGrip;
    let move = (R ? 1 : 0) - (L ? 1 : 0);
    const swinging = this.attack && this.attack.kind !== 'thrust';
    if (this.state === 'crouch') move = 0;
    if (move && !swinging) this.dir = move;
    const target = swinging && this.onGround ? 0 : move * PHYS.walk;
    if (ice) {
      // Level-4 ice: walking builds momentum that carries on (up to 10 tiles) after release.
      if (move) this.vx = approach(this.vx, target, PHYS.accel * 0.5 * dt);
      else this.vx = approach(this.vx, 0, PHYS.iceFriction * dt);
    } else {
      const accel = !this.onGround ? PHYS.airAccel : move ? PHYS.accel : PHYS.decel;
      this.vx = approach(this.vx, target, accel * dt);
    }
    // Slopes: standing in a slope tile slides you downhill unless you walk uphill
    // (Silkarn Shoes stop the slide).
    let pushX = 0, pushY = 0;
    if (this.onGround && !this.stats.slopeGrip) {
      const s = this.slopeFlags(map);
      if (s & F.SLOPE_L && move !== 1) pushX -= PHYS.slopeSlide;
      if (s & F.SLOPE_R && move !== -1) pushX += PHYS.slopeSlide;
    }
    // Airflow tiles carry the knight.
    const wf = this.bodyFlags(map);
    if (wf & F.WIND_L) pushX -= PHYS.wind;
    if (wf & F.WIND_R) pushX += PHYS.wind;
    if (wf & F.WIND_U) pushY -= PHYS.wind;

    // Jump: rises only while held, up to 2 rows (4 with Feruza Shoes).
    if (this.onGround) this.coyote = PHYS.coyote; else this.coyote -= dt;
    const headClear = !map.rectSolid(this.x + 4, this.y - 4, this.w - 8, 4);
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.state !== 'crouch' && headClear) {
      this.vy = -jumpV(this.stats.jumpRows || PHYS.jumpRows);
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = true;
      this.fallStartY = this.y;
      audio.sfx('jump', { vol: 0.5 });
    }
    if (this.jumpHeld && !input.down('jump') && this.vy < 0) { this.vy *= PHYS.jumpCut; this.jumpHeld = false; }
    if (this.onGround) this.jumpHeld = false;

    map.move(this, (this.vx + pushX) * dt, 0, { stepUp: this.onGround ? 6 : 0 });
    if (pushY) { this.vy = Math.max(this.vy - 4000 * dt, pushY); }
    this.fall(dt, map);

    // State for animation
    if (this.state !== 'crouch') {
      if (!this.onGround) this.setState(this.vy < 0 ? 'jump' : 'fall');
      else this.setState(Math.abs(this.vx) > 12 && move ? 'walk' : 'idle');
    }
    // Hazard tiles: the body, or the ground under its centre.
    if (!this.stats.hazardProof && this.iframes <= 0) {
      const hz = map.rectHas(this.x + 6, this.y + 6, this.w - 12, this.h - 6, F.HAZARD) || (this.onGround && map.rectHas(this.cx - 4, this.feet + 1, 8, 2, F.HAZARD));
      if (hz) world.hazardHit?.(this);
    }
  }

  groundFlags(map) {
    const y = Math.floor((this.feet + 2) / TILE);
    return map.flags(Math.floor((this.x + 4) / TILE), y) | map.flags(Math.floor(this.cx / TILE), y) | map.flags(Math.floor((this.x + this.w - 4) / TILE), y);
  }
  slopeFlags(map) {
    const y = Math.floor((this.feet - 2) / TILE);
    return map.flags(Math.floor(this.cx / TILE), y) & (F.SLOPE_L | F.SLOPE_R);
  }
  bodyFlags(map) {
    let f = 0;
    const x0 = Math.floor((this.x + 4) / TILE), x1 = Math.floor((this.x + this.w - 4) / TILE);
    const y0 = Math.floor(this.y / TILE), y1 = Math.floor((this.feet - 1) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f |= map.flags(x, y);
    return f;
  }
  ropeCol(map) {
    const tx = Math.floor(this.cx / TILE);
    for (const c of [tx, tx - 1, tx + 1]) {
      const cxp = c * TILE + TILE / 2;
      if (Math.abs(cxp - this.cx) > TILE * 0.9) continue;
      if (map.rectHas(c * TILE + 8, this.y + 10, 8, this.h - 20, F.ROPE)) return c;
    }
    return null;
  }

  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; if (s !== 'walk' && s !== 'idle') this.animT = 0; } }

  fall(dt, map) {
    if (this.state === 'climb') return;
    const wasAir = !this.onGround;
    if (wasAir && this.vy <= 0) this.fallStartY = Math.min(this.fallStartY, this.y);
    this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
    const hit = map.move(this, 0, this.vy * dt);
    if (hit.down) {
      if (wasAir) {
        const rows = (this.y - this.fallStartY) / TILE;
        if (rows >= 2 && this.vy > 200) { audio.sfx('land', { vol: 0.45 }); if (rows >= 3) this.hardLand = 0.1; }
      }
      this.vy = 0;
      this.onGround = true;
      this.fallStartY = this.y;
    } else {
      if (hit.up) { this.vy = Math.max(0, this.vy); this.jumpHeld = false; }
      const g = map.groundBelow(this) && this.vy >= 0;
      if (!g && this.onGround) this.fallStartY = this.y;
      this.onGround = g;
    }
  }

  startClimb(map) {
    const c = this.ropeCol(map);
    if (this.h !== PHYS.h && !this.setCrouch(false, map)) return;
    this.x = c * TILE + TILE / 2 - this.w / 2;
    this.vx = 0; this.vy = 0;
    this.attack = null;
    this.setState('climb');
  }

  updateClimb(dt, input, map, U, D, L, R) {
    let dy = 0;
    if (U) dy = -PHYS.climb * dt;
    if (D) dy = PHYS.climb * dt;
    if (dy) this.animT += dt; else this.animT = 0;
    const rope = (y) => map.rectHas(this.cx - 3, y + 10, 6, this.h - 30, F.ROPE);
    if (dy < 0) {
      // Climb while any rope remains beside the upper body; at the top, pull onto the ledge.
      if (!map.rectSolid(this.x, this.y + dy, this.w, this.h) && (rope(this.y + dy) || map.rectHas(this.cx - 3, this.y + dy + this.h - 12, 6, 12, F.ROPE))) this.y += dy;
    } else if (dy > 0) {
      if (map.rectSolid(this.x, this.y + dy, this.w, this.h)) { this.state = 'idle'; this.onGround = true; return; }
      this.y += dy;
    }
    if (!map.rectHas(this.cx - 3, this.y, 6, this.h, F.ROPE)) { this.state = 'fall'; this.onGround = false; this.fallStartY = this.y; return; }
    if (input.pressed('jump')) {
      this.state = 'jump';
      this.vy = -jumpV(1.2);
      // Spend the buffered press and the grab-time coyote window, or the ground jump fires
      // on the next frame as well and the rope hop becomes a full (or Feruza) jump.
      this.jumpBuffer = 0; this.coyote = 0; this.onGround = false;
      this.vx = ((R ? 1 : 0) - (L ? 1 : 0)) * PHYS.walk;
      if (this.vx) this.dir = Math.sign(this.vx);
      this.fallStartY = this.y;
    } else if ((L || R) && !U && !D) {
      // Step off sideways onto a ledge (or let go into the air).
      const dir = R ? 1 : -1;
      this.dir = dir;
      if (!map.rectSolid(this.x + dir * 6, this.y, this.w, this.h)) {
        map.move(this, dir * PHYS.walk * dt, 0);
        if (this.ropeCol(map) == null || Math.abs(this.cx - (Math.floor(this.cx / TILE) + 0.5) * TILE) > TILE * 0.8) { this.state = 'fall'; this.onGround = false; this.fallStartY = this.y; }
      }
    }
  }

  updateSpirit(dt, input, world) {
    // Co-op spirit: float freely through the level, touch a living ally to rekindle.
    const sp = 200;
    const mx = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    const my = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    this.vx = approach(this.vx, mx * sp, 900 * dt);
    this.vy = approach(this.vy, my * sp, 900 * dt);
    if (mx) this.dir = mx;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!world.map.wrap) {
      this.x = clamp(this.x, 0, world.map.w * TILE - this.w);
      this.y = clamp(this.y, 0, world.map.h * TILE - this.h);
    }
    this.spiritT -= dt;
    world.spiritTick?.(this);
  }

  // Down-thrust hit: hop back up off the target.
  bounce() { this.vy = -jumpV(1.6); this.onGround = false; this.fallStartY = this.y; }

  // World-space hitbox of the current sword swing, or null when not active.
  swordBox() {
    if (!this.attack) return null;
    const a = ATTACKS[this.attack.kind];
    if (this.attack.t < a.t0 || this.attack.t > a.t1) return null;
    const reach = this.attack.kind === 'thrust' ? 0 : (this.stats.reach || 0) * TILE;
    const [bx, by, bw, bh] = a.box;
    const w = bw + reach;
    const x = this.dir > 0 ? this.cx + bx : this.cx - bx - w;
    return { x, y: this.feet + by - (this.h < PHYS.h && this.attack.kind === 'slash' ? -24 : 0), w, h: bh };
  }

  hurtBox() { return { x: this.x + 5, y: this.y + 5, w: this.w - 10, h: this.h - 6 }; }

  // Knockback: 2 tiles straight away from the source.
  knock(fromX, strength = 1, map) {
    const d = this.cx < fromX ? -1 : 1;
    this.stun = PHYS.stun * strength;
    this.vx = (d * PHYS.knockTiles * TILE * strength) / this.stun;
    this.vy = Math.min(this.vy, -120);
    this.iframes = PHYS.iframes;
    this.flash = 0.2;
    this.attack = null;
    if (this.state === 'climb') this.fallStartY = this.y;
    // Stand up from a crouch keeping the feet on the floor (growing the box downward sank
    // the knight a tile into the ground). Under a low ceiling he stays crouched.
    if (this.state === 'crouch' && map) this.setCrouch(false, map);
    else if (this.state === 'crouch') { this.y -= PHYS.h - this.h; this.h = PHYS.h; }
    this.state = 'hurt';
  }

  // ---------------------------------------------------------------- drawing
  anim() {
    if (this.state === 'dead') return ['dead', true];
    if (this.state === 'spirit') return ['idle', false];
    if (this.attack) {
      const k = this.attack.kind;
      return [k === 'overhead' ? 'overhead' : k === 'thrust' ? 'thrust' : k === 'low' ? 'low' : 'attack', true];
    }
    if (this.castT > 0) return ['cast', true];
    if (this.state === 'hurt') return ['hurt', true];
    if (this.state === 'climb') return ['climb', false];
    if (this.state === 'crouch') return ['crouch', true];
    if (this.state === 'jump') return ['jump', true];
    if (this.state === 'fall') return ['fall', true];
    if (this.state === 'walk') return ['walk', false];
    return ['idle', false];
  }

  draw(camX, camY, t) {
    const [name, once] = this.anim();
    const sh = sheetNow(`hero.${name}`) || sheetNow('hero.idle');
    const x = this.cx - camX, y = this.feet - camY;
    if (this.fairy) { drawFairy(x, y - 40, t, this.dir, this.label); return; }
    if (this.iframes > 0 && this.state !== 'dead' && this.stun <= 0 && Math.floor(t * 20) % 2 === 0) return;
    let alpha = 1;
    if (this.state === 'spirit') {
      alpha = 0.45 + Math.sin(t * 6) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 36, 4, x, y - 36, 60);
      g.addColorStop(0, 'rgba(160,230,255,0.55)');
      g.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 60, y - 96, 120, 120);
      ctx.restore();
    }
    if (!sh) {
      ctx.fillStyle = ['#e04a3a', '#3aa0e0', '#e0c03a', '#6ad06a'][this.slot % 4];
      ctx.fillRect(x - this.w / 2, y - this.h, this.w, this.h);
      return;
    }
    let f;
    const at = this.attack ? this.attack.t : name === 'cast' ? 0.5 - this.castT : this.animT;
    if (this.attack) {
      const a = ATTACKS[this.attack.kind];
      const seq = sh.anims[name] || sh.anims.default;
      f = this.attack.kind === 'thrust' ? seq[Math.min(seq.length - 1, Math.floor(at * sh.fps))] : seq[Math.min(seq.length - 1, Math.floor((at / a.dur) * seq.length))];
    } else if (name === 'walk') f = walkFrame(this, sh);
    else f = once ? sh.frameOnce(name, at) : sh.frameAt(name, at);
    // Co-op knights get a tinted cloak so players can tell each other apart.
    const tint = this.slot > 0 && this.state !== 'spirit' ? ['', 'hue-rotate(200deg)', 'hue-rotate(60deg) saturate(1.3)', 'hue-rotate(110deg)'][this.slot % 4] : '';
    if (tint) { ctx.save(); ctx.filter = tint; }
    sh.draw(ctx, f, x, y, this.dir, alpha, POSE_SCALE[name] || 1);
    if (tint) ctx.restore();
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 3;
      sh.draw(ctx, f, x, y, this.dir, 1, POSE_SCALE[name] || 1);
      ctx.restore();
    }
    if (this.label) {
      ctx.save();
      ctx.font = "700 13px 'Beliards', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(this.label, x + 1, y - this.h - 22 + 1);
      ctx.fillStyle = ['#ffd27a', '#8fd0ff', '#ffe98a', '#9fef9f'][this.slot % 4];
      ctx.fillText(this.label, x, y - this.h - 22);
      ctx.restore();
    }
  }
}

// The Spirit of Esmesanti (co-op support role): a small winged light with a trail.
// Walk frame from the distance the knight has covered, so his feet keep pace with the ground at any
// speed (cavern, town, co-op puppet). One stride of the 8-frame cycle covers about 120 px.
// Jumps of more than 40 px between draws (a wrap seam, a door) don't count as walking.
const STRIDE = 15;
export function walkFrame(h, sh) {
  const d = Math.abs(h.x - (h.lastWalkX ?? h.x));
  h.lastWalkX = h.x;
  if (d < 40) h.odo = (h.odo || 0) + d;
  return sh.frameByDist('walk', h.odo || 0, STRIDE);
}

export function drawFairy(x, y, t, dir = 1, label) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + Math.sin(t * 5) * 0.12;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 46 * pulse);
  g.addColorStop(0, 'rgba(230,250,255,0.95)');
  g.addColorStop(0.25, 'rgba(140,220,255,0.55)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 50, y - 50, 100, 100);
  // Fluttering wings
  const flap = Math.abs(Math.sin(t * 18)) * 0.8 + 0.2;
  ctx.fillStyle = 'rgba(200,240,255,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * 9, y - 6, 11, 5 + flap * 6, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sparkle trail
  for (let i = 1; i <= 5; i++) {
    const k = i / 5;
    ctx.fillStyle = `rgba(190,235,255,${0.5 * (1 - k)})`;
    const tx = x - dir * i * 9 + Math.sin(t * 7 + i) * 3, ty = y + Math.cos(t * 5 + i * 1.7) * 4;
    ctx.fillRect(tx - 2, ty - 2, 4, 4);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  if (label) {
    ctx.font = "700 13px 'Beliards', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, x + 1, y - 34);
    ctx.fillStyle = '#bff0ff'; ctx.fillText(label, x, y - 35);
  }
  ctx.restore();
}

export function swordHits(hero, target) {
  const box = hero.swordBox();
  return box && overlap(box, target);
}
