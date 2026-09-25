"use strict";
// player.js — input (keyboard / mouse / touch) and the Binder: movement, the energy blade (quick combos and
// the held heavy blow), the drone that fires on its own, the binding net, dash, and the horde commands.

const Input = {
  keys: {}, mouse: { x: 0, y: 0, down: false, has: false },
  touch: false, stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, held: {},
  // touch aim: a thumb held on the right side of the screen aims (and swings) at the point under it
  aim: { id: null, x: 0, y: 0 },
  // the attack button, as edges: pressed / released are set by the event and consumed by PlayerCtl.sword once a
  // frame, so a tap that begins and ends between two frames still lands. pos says whether x,y mean anything.
  atk: { down: false, pressed: false, released: false, x: 0, y: 0, pos: false },
  wheel: 0,

  // Phones and tablets play in touch mode from the moment the page loads (a coarse primary pointer, or a
  // touch screen with a mobile browser); anything else switches over on its first touch. Desktop with a
  // mouse never enters it, so none of the touch layout reaches desktop browsers.
  isMobile() {
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    return coarse || (navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  },
  enableTouch() {
    if (this.touch) return;
    this.touch = true;
    document.body.classList.add("touch");
    if (typeof UI !== "undefined" && UI.el.hud) UI.touchLayout();
    if (typeof Game !== "undefined" && Game.canvas) Game.resize();
  },
  press(x, y, pos) { const a = this.atk; a.down = true; a.pressed = true; a.pos = !!pos; if (pos) { a.x = x; a.y = y; } },
  release() { const a = this.atk; if (a.down || a.pressed) a.released = true; a.down = false; },

  init(canvas) {
    window.addEventListener("touchstart", () => this.enableTouch(), { passive: true, capture: true });
    window.addEventListener("keydown", (e) => {
      if (e.repeat) { if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault(); return; }
      this.keys[e.code] = true;
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
      if (e.code === "KeyJ") this.press(0, 0, false);
      Game.onKey(e.code);
    });
    window.addEventListener("keyup", (e) => { this.keys[e.code] = false; if (e.code === "KeyJ") this.release(); });
    window.addEventListener("blur", () => { this.keys = {}; this.mouse.down = false; this.held = {}; this.aim.id = null; this.stick.id = null; this.stick.x = 0; this.stick.y = 0; this.release(); });
    canvas.addEventListener("mousemove", (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true; });
    canvas.addEventListener("mousedown", (e) => {
      SFX.unlock();
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true;
      if (e.button === 0) { this.mouse.down = true; this.press(e.clientX, e.clientY, true); }
      if (e.button === 2) Game.onKey("Net");
      if (e.button === 1) { e.preventDefault(); Game.onKey("KeyG"); }
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) { this.mouse.down = false; this.release(); } });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); Game.userZoom = clamp(Game.userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 1.6); }, { passive: false });

    // touch: left side = movement stick (floating); right side = the sword hand — tap to strike toward the
    // point, hold to charge a heavy blow and release it there; buttons live in the DOM
    canvas.addEventListener("touchstart", (e) => {
      SFX.unlock(); e.preventDefault();
      this.enableTouch();
      if (Game.state === "cut") { Voyage.skip(); return; }                // a tap hurries the rocket along
      for (const t of e.changedTouches) {
        if (this.stick.id === null && t.clientX < window.innerWidth * 0.5) {
          this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.x = 0; this.stick.y = 0;
        } else if (this.aim.id === null && t.clientX >= window.innerWidth * 0.5) {
          this.aim.id = t.identifier; this.aim.x = t.clientX; this.aim.y = t.clientY;
          this.press(t.clientX, t.clientY, true);
        }
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          const dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy, d = Math.hypot(dx, dy), m = 56;
          this.stick.x = d > 8 ? (dx / d) * Math.min(1, d / m) : 0; this.stick.y = d > 8 ? (dy / d) * Math.min(1, d / m) : 0;
          if (d > m) { this.stick.ox = t.clientX - (dx / d) * m; this.stick.oy = t.clientY - (dy / d) * m; }
        } else if (t.identifier === this.aim.id) { this.aim.x = t.clientX; this.aim.y = t.clientY; this.atk.x = t.clientX; this.atk.y = t.clientY; }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.x = 0; this.stick.y = 0; }
        if (t.identifier === this.aim.id) { this.aim.id = null; this.release(); }
      }
    };
    canvas.addEventListener("touchend", end); canvas.addEventListener("touchcancel", end);
  },

  // WASD moves on the screen's axes; Q / E strafe left / right of where the binder is aiming
  // (perpendicular to the cursor), so you can circle a foe while facing it
  moveVec(p) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1; if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1; if (k.KeyS || k.ArrowDown) y += 1;
    const s = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    if (s && p) { const ax = Math.cos(p.aim), ay = Math.sin(p.aim); x += -ay * s; y += ax * s; }
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    return { x: this.stick.x, y: this.stick.y };
  },
};

function createPlayer() {
  const T = CONFIG.tile;
  return {
    kind: "player", team: 0, types: ["normal"], name: "Binder",
    x: CAMP.tx * T, y: CAMP.ty * T + 60, r: CONFIG.player.radius,
    hp: CONFIG.player.baseHp, maxHp: CONFIG.player.baseHp, invuln: 0, hurtT: 99, flash: 0,
    moveX: 0, moveY: 0, facing: 1, dir: "down", faceA: Math.PI / 2, animT: 0, moving: false, attackT: 0,
    aim: 0, aimX: 0, aimY: 0,
    // the blade: the swing playing out, the combo it belongs to, and the button held for a heavy blow
    atkT: 0, atkKind: "q1", atkHit: false, swingA: 0, sweep: 1, combo: 0, comboT: 0, queued: false,
    holdT: -1, charging: false, chargeT0: 0, chargeK: 0, chargeFull: false, holdAimX: 0, holdAimY: 0,
    mark: null, markT: 0, drone: null, gunAim: undefined,
    stompT: 0, stompCd: 0, stompLand: 0,
    boltT: 0, netT: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, hornCd: 0, chargeCd: 0,
    shotN: 0, riposte: 0, dodgeT: 0, dodged: false, mortarT: 1.5, beamCd: 4, beamT: 0, beamTick: 0, arcT: 1, sunT: 5, pass: 0, kvx: 0, kvy: 0, gateHintT: 0,
  };
}

const PlayerCtl = {
  // where the player is aiming, in world space. Touch with no thumb down aims at what you are fighting.
  resolveAim(p) {
    if (Input.aim.id !== null) {
      const w = Game.screenToWorld(Input.aim.x, Input.aim.y);
      p.aimX = w.x; p.aimY = w.y;
    } else if (!Input.touch && Input.mouse.has) {
      const w = Game.screenToWorld(Input.mouse.x, Input.mouse.y);
      p.aimX = w.x; p.aimY = w.y;
    } else {
      const t = this.autoTarget(p, false);
      if (t) { p.aimX = t.x; p.aimY = t.y - t.r; }
      else { p.aimX = p.x + p.facing * 120; p.aimY = p.y; }
    }
    p.aim = Math.atan2(p.aimY - (p.y - 20), p.aimX - p.x);
  },

  autoTarget(p, preferDazed) {
    let best = null, bd = CONFIG.player.boltRange * CONFIG.player.boltRange;
    for (const h of Game.hostiles) {
      if (h.removed || h.hp < 0) continue;
      const bindable = h.dazed > 0 || h.cowed > 0;
      if (preferDazed ? !bindable : bindable) continue;
      if (!preferDazed && !h.aggro) continue;
      const d = dist2(h.x, h.y, p.x, p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  },

  update(p, dt) {
    const C = CONFIG.player;
    p.animT += dt; p.hurtT += dt;
    for (const k of ["boltT", "netT", "dashCd", "hornCd", "invuln", "flash", "attackT", "stompCd", "stompLand", "dodgeT", "riposte", "markT"]) if (p[k] > 0) p[k] -= dt;
    if (p.stompT > 0) { p.stompT -= dt; if (p.stompT <= 0) this.stompLand(p, Game.mechTier()); }
    this.resolveAim(p);

    const mv = Input.moveVec(p);
    p.moveX = mv.x; p.moveY = mv.y;
    const tier = Game.mechTier(), speed = C.speed * (1 + 0.06 * Game.boon("swift")) * (1 + Game.res("air") / 2);
    // the bigger the frame, the more of the world it can simply walk through
    p.pass = Game.playerPass();
    this.trample(p, tier, dt);
    const wet = (World.cellAt(p.x, p.y) & F_WATER) !== 0;
    updateKnock(p, dt);
    const ox = p.x, oy = p.y;
    if (p.dashT > 0) {
      p.dashT -= dt;
      World.move(p, p.dashX * C.dashSpeed * dt, p.dashY * C.dashSpeed * dt, p.pass);
      if (Math.random() < 0.8) FX.mote(p.x, p.y - Mech.height(tier) * (0.2 + Math.random() * 0.5), 0, 0, tier ? Mech.parts(tier).accent : "#b8e8ff", 0.3, (6 + tier * 2) * Mech.reach(tier));
      if (p.dashT <= 0) this.slam(p, tier);
    } else if (mv.x || mv.y) {
      // winding up a heavy blow roots you; a swing in progress only slows you
      const sp = speed * (wet ? 0.8 : 1) * (p.charging ? 0.45 : p.atkT > 0 ? 0.7 : 1);
      World.move(p, mv.x * sp * dt, mv.y * sp * dt, p.pass);
      // stopped dead by a river, ridge or chasm? say which frame could cross it
      if (p.gateHintT > 0) p.gateHintT -= dt;
      else if (Math.hypot(p.x - ox, p.y - oy) < sp * dt * 0.35) {
        const g = World.gateAt(p.x + mv.x * (p.r + 14), p.y + mv.y * (p.r + 14));
        if (g > 0 && g < 9 && g > tier) {
          p.gateHintT = 5;
          UI.toast((g === 2 ? "Too deep to ford" : g === 3 ? "A wall of rock" : "A bottomless chasm") + " — a " + MECH_TIERS[g].name + " Bindframe (" + g + " Titan cores) could cross it");
        }
      }
    }
    if (tier < 3) World.collideProps(p);                              // Juggernauts and up stride over rocks, tents and trees
    if (wet && (mv.x || mv.y || p.dashT > 0) && Math.random() < 0.3) { FX.ring(p.x, p.y, p.r * 0.6, p.r * 1.6 + 10, "#e8f6ff", 0.5, 2); if (Math.random() < 0.3) SFX.play("splash", 0.25, 0.8 + Math.random() * 0.4); }
    p.moving = !!(mv.x || mv.y);

    // facing: mid-swing you face the blow (a spin turns you right round with the blade); with a mouse the binder
    // otherwise faces the cursor (move and strafe independently of it); on touch they face the way they walk —
    // never the right thumb, so a tap strikes the way you are already facing. p.faceA is that direction as an angle.
    let fx = mv.x, fy = mv.y;
    if (p.atkT > 0) { const a = this.swingAngle(p); fx = Math.cos(a); fy = Math.sin(a); }
    else if (!Input.touch && Input.mouse.has) { fx = Math.cos(p.aim); fy = Math.sin(p.aim); }
    else if (!p.moving) { fx = 0; fy = 0; }
    if (fx || fy) {
      const a = Math.atan2(fy, fx), deg = (a * 180) / Math.PI;
      p.faceA = a;
      if (Math.abs(fx) > 0.05) p.facing = fx > 0 ? 1 : -1;
      const ad = Math.abs(deg);
      if (deg > 0) p.dir = ad < 25 || ad > 155 ? "side" : ad < 65 || ad > 115 ? "downdiag" : "down";
      else p.dir = ad < 25 || ad > 155 ? "side" : ad < 65 || ad > 115 ? "updiag" : "up";
    }

    // the attack button is yours (blade, mines or mending — see heroes.js); the drone (or the frame's cannon)
    // picks its own targets and fires on its own
    if (Game.state === "play") {
      this.attack(p, dt);
      Heroes.update(p, dt);
      const tgt = this.autoFire(p, dt, tier);
      this.weapons(p, dt, tier, tgt);
    }

    // regen
    if (p.hurtT > C.regenDelay && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + C.regen * (1 + Game.rankIndex * 0.25) * dt);

    // walking over a dazed beast binds it — sweep up after your horde
    const reach = (30 + p.r) * (1 + 0.3 * Game.boon("magnet")) * Mech.reach(tier);
    for (const h of Game.hostiles) {
      if ((h.dazed > 0 || h.cowed > 0) && !h.removed && dist2(h.x, h.y, p.x, p.y) < (h.r + reach) * (h.r + reach)) { bindBeast(h); break; }
    }
  },

  // the one damage scalar the blade, the drone and the frame's weapons all grow from
  boltDamage() {
    const C = CONFIG.player;
    return (C.boltDmg + C.boltDmgPerRank * Game.rankIndex + 0.6 * (Game.binderLevel - 1)) * (1 + 0.15 * Game.upg("bolt")) * (1 + 0.1 * Game.forge("capacitor")) * CONFIG.mech[Game.mechTier()].bolt * (1 + Game.res("light"));
  },
  swordDamage() { return this.boltDamage() * 1.7; },

  // ---------------------------------------------------------------- the drone
  // What the drone shoots at: whatever your blade last marked, else the nearest provoked foe in range. It never
  // starts a fight on its own — a wild beast that has not been provoked is left alone until you or the horde hit it.
  droneTarget(p) {
    const R = CONFIG.player.boltRange * (1 + Game.mechTier() * 0.12), R2 = R * R;
    if (p.markT > 0 && targetable(p.mark) && dist2(p.mark.x, p.mark.y, p.x, p.y) < R2) return p.mark;
    let best = null, bd = R2;
    for (const h of Game.hostiles) {
      if (h.removed || !h.aggro || !targetable(h)) continue;
      const d = dist2(h.x, h.y, p.x, p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  },

  // The drone hovers over the binder's shoulder and drifts to the side its target is on; in a Bindframe it is
  // docked and the frame's cannon fires instead. Returns the current target (null when there is nothing to shoot).
  autoFire(p, dt, tier) {
    const H = CONFIG.playerHeight, time = Game.time;
    if (!p.drone) p.drone = { x: p.x - 14, y: p.y - H - 10, a: 0, t: null, retarget: 0, flash: 0 };
    const d = p.drone;
    d.retarget -= dt;
    if (d.retarget <= 0 || !targetable(d.t)) { d.retarget = 0.15; d.t = this.droneTarget(p); }
    if (d.flash > 0) d.flash -= dt;
    if (!tier) {
      const side = d.t ? Math.sign(d.t.x - p.x) || p.facing : -p.facing;
      const wx = p.x + side * 16 + Math.sin(time * 1.7) * 3, wy = p.y - H - 10 + Math.sin(time * 2.3) * 3 - (p.dashT > 0 ? 6 : 0);
      const k = Math.min(1, dt * (p.dashT > 0 ? 12 : 5));
      d.x += (wx - d.x) * k; d.y += (wy - d.y) * k;
      const want = d.t ? Math.atan2(d.t.y - d.t.r * 0.6 - d.y, d.t.x - d.x) : (p.facing > 0 ? 0.3 : Math.PI - 0.3);
      let da = want - d.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      d.a += da * Math.min(1, dt * 10);
    }
    if (d.t && p.boltT <= 0) this.bolt(p, d.t);
    return d.t;
  },

  bolt(p, t) {
    const C = CONFIG.player, tier = Game.mechTier();
    p.boltT = C.boltCd * Math.pow(0.88, Game.boon("rapid"));
    const ty = t.y - t.r * 0.6;
    let sx, sy;
    if (tier) {
      p.gunAim = Math.atan2(ty - (p.y - Mech.height(tier) * 0.5), t.x - p.x);
      const m = Mech.muzzle(p, tier); sx = m.x; sy = m.y;
      p.gunAim = Math.atan2(ty - sy, t.x - sx); p.attackT = 0.22;
    } else { sx = p.drone.x; sy = p.drone.y; p.drone.flash = 0.1; }
    const a0 = Math.atan2(ty - sy, t.x - sx), dmg = this.boltDamage();
    const n = 1 + Game.boon("twin"), color = tier ? Mech.parts(tier).accent : "#7be0ff";
    // every fifth shot is a LANCE: a heavy bolt that punches through a whole line and shoves it back
    const lance = ++p.shotN % 5 === 0, g = Mech.reach(tier);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.13, big = lance && i === ((n - 1) >> 1);
      Game.projectiles.push({ kind: "shot", x: sx, y: sy, vx: Math.cos(a) * C.boltSpeed * (big ? 1.25 : 1), vy: Math.sin(a) * C.boltSpeed * (big ? 1.25 : 1), speed: C.boltSpeed,
        team: 0, dmg: dmg * (big ? 2.4 : 1), type: "arcane", look: big ? "power" : "arcane", src: p, life: C.boltRange * (1 + tier * 0.12) / C.boltSpeed, color, age: 0,
        size: (7 + tier * 2) * g * (big ? 1.5 : 1), r: (9 + tier * 2) * g * (big ? 1.5 : 1), fromPlayer: true, kb: big ? 11 : 0,
        pierce: Game.boon("pierce") + (big ? 4 : 0), blast: Game.boon("blast") ? 18 + 28 * Game.boon("blast") + tier * 6 : (tier >= 3 ? 30 + tier * 6 : 0) });
    }
    FX.burst(sx, sy, "#ffffff", 3 + tier + (lance ? 6 : 0), 60 + tier * 20, 0.18, 3);
    if (lance) { FX.ring(sx, sy, 4, 26 * g, color, 0.25, 3); SFX.play("lance", 0.8, 1 - tier * 0.07); }
    else SFX.play("bolt", 1, (1 - tier * 0.1) * (0.94 + Math.random() * 0.12));
  },

  // ---------------------------------------------------------------- the blade
  // Quick strikes chain forehand → backhand → lunging thrust. Holding the button past `heavyHold` winds up a
  // heavy blow that grows for `chargeTime` more; released early it is a heavy sweep, fully charged it is a
  // SPIN: the Binder turns a full circle with the blade out, throwing everything around them into the air and
  // leaving it reeling. Every swing goes the way the Binder is facing (p.faceA), never toward the thumb.
  SWINGS: {
    q1:      { dur: 0.26, half: 1.05, reach: 48, dmg: 1.0,  kb: 4,  sweep: 1 },
    q2:      { dur: 0.26, half: 1.05, reach: 48, dmg: 1.1,  kb: 4,  sweep: -1 },
    q3:      { dur: 0.34, half: 0.5,  reach: 70, dmg: 1.55, kb: 8,  sweep: 1, thrust: 26 },
    heavy:   { dur: 0.42, half: 1.5,  reach: 60, dmg: 2.4,  kb: 9,  sweep: 1, heavy: true },
    charged: { dur: 0.62, half: Math.PI, reach: 80, dmg: 4.2, kb: 15, sweep: 1, heavy: true, quake: true, spin: true },
  },
  // the blade's angle right now: a spin sweeps a full turn from the facing over the swing (eased, like the art)
  swingAngle(p) {
    const S = this.SWINGS[p.atkKind];
    if (!S || !S.spin) return p.swingA;
    const k = clamp(1 - p.atkT / S.dur, 0, 1), e = k * k * (3 - 2 * k);
    return p.swingA + p.sweep * (-Math.PI + TAU * e);
  },
  // The attack button for every hero: a press starts a hold, the release decides what it was — a tap (a quick
  // strike, a mine, a heal pulse), a heavy blow, or a fully charged one. Heroes.quick / Heroes.heavy do the deed.
  attack(p, dt) {
    const C = CONFIG.player, A = Input.atk, col = Heroes.current().color;
    if (p.atkT > 0) {
      p.atkT -= dt;
      const S = this.SWINGS[p.atkKind];                                   // a blade swing plays out; other tools just animate
      if (S) {
        const k = 1 - p.atkT / S.dur;
        if (S.thrust && k < 0.5) World.move(p, Math.cos(p.swingA) * S.thrust * dt / (S.dur * 0.5), Math.sin(p.swingA) * S.thrust * dt / (S.dur * 0.5), p.pass);
        if (!p.atkHit && k >= 0.38) { p.atkHit = true; this.swingHit(p, S); }
      }
    }
    if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
    // the button: press starts the hold, release decides what it was
    if (A.pressed) { A.pressed = false; p.holdT = 0; p.queued = false; }
    if (p.holdT >= 0) {
      // remember where the button is pointing while it is down: on touch the thumb has lifted by the time we swing
      if (A.pos) { const w = Game.screenToWorld(A.x, A.y); p.holdAimX = w.x; p.holdAimY = w.y; } else { p.holdAimX = p.aimX; p.holdAimY = p.aimY; }
      if (A.down) p.holdT += dt;
      if (!p.charging && A.down && p.holdT >= C.heavyHold && p.atkT <= 0.1) {
        p.charging = true; p.chargeT0 = p.holdT; p.chargeK = 0; p.chargeFull = false;
        SFX.play("charge", 0.6);
      }
      if (p.charging) {
        p.chargeK = clamp((p.holdT - p.chargeT0) / C.heavyCharge, 0, 1);
        if (p.chargeK >= 1 && !p.chargeFull) { p.chargeFull = true; FX.ring(p.x, p.y, 8, 40 * Mech.reach(Game.mechTier()), col, 0.3, 3); SFX.play("chink", 0.7, 1.5); }
        if (Math.random() < 0.25 + p.chargeK * 0.5) FX.mote(p.x + (Math.random() - 0.5) * 24, p.y - 30 - Math.random() * 16, 0, -30, p.chargeK >= 1 ? "#ffffff" : col, 0.3, 2);
      }
    }
    if (A.released) {
      A.released = false;
      if (p.holdT >= 0) {
        if (p.charging) Heroes.heavy(p, p.chargeK);
        else if (p.holdT < C.heavyHold) { if (p.atkT > 0.1) p.queued = true; else Heroes.quick(p); }
        else if (p.atkT <= 0.1) Heroes.quick(p);             // held through a swing, released before the wind-up began
      }
      p.holdT = -1; p.charging = false; p.chargeK = 0; p.chargeFull = false;
    }
    if (p.queued && p.atkT <= 0.1) { p.queued = false; Heroes.quick(p); }
  },
  quick(p) {
    const kind = ["q1", "q2", "q3"][p.combo % 3];
    p.combo = (p.combo + 1) % 3; p.comboT = 1.0;
    this.swing(p, kind);
  },
  swing(p, kind) {
    const S = this.SWINGS[kind];
    p.atkKind = kind; p.atkT = S.dur; p.atkHit = false; p.sweep = S.sweep;
    p.swingA = p.faceA;                                   // the way the Binder faces, not where the thumb or cursor is
    if (Math.abs(Math.cos(p.swingA)) > 0.15) p.facing = Math.cos(p.swingA) > 0 ? 1 : -1;
    if (S.heavy) { SFX.play("heavy", 0.8, S.quake ? 0.8 : 1); if (S.quake) FX.addShake(3); }
    else SFX.play("swing", 0.7, kind === "q3" ? 1.25 : kind === "q2" ? 0.9 : 1);
  },
  // the blow lands part-way through the swing: a cone in front of the binder, wider and longer for heavy blows
  swingHit(p, S) {
    const tier = Game.mechTier(), g = Mech.reach(tier), reach = S.reach * Mech.swordReach(tier) + p.r, a = p.swingA;   // the frame's sword reaches as far as it is drawn
    const riposte = p.riposte > 0, col = tier ? Mech.parts(tier).accent : "#9df0ff";
    const dmg = this.swordDamage() * S.dmg * (riposte ? 3 : 1), kb = riposte ? Math.max(S.kb, 15) : S.kb;
    if (riposte) { p.riposte = 0; FX.text(p.x, p.y - Mech.height(tier) - 24, "RIPOSTE!", "#9dffff", 1, 15); FX.ring(p.x, p.y, 6, 70 * g, "#9dffff", 0.35, 4); }
    let n = 0;
    // a spin hits everything within reach all round; every other swing is a cone in front
    const cx = S.spin ? p.x : p.x + Math.cos(a) * reach * 0.5, cy = S.spin ? p.y : p.y + Math.sin(a) * reach * 0.5;
    forEnemies(p, cx, cy, (S.spin ? reach : reach * 0.5) + 20, (e) => {
      if (S.spin ? dist2(p.x, p.y, e.x, e.y) > (reach + e.r) * (reach + e.r) : !inCone(p.x, p.y, a, S.half, reach, e)) return;
      n++;
      dealDamage(p, e, dmg, "arcane", { text: true, kb });
      if (S.quake && e.hp > 0 && !e.titan) { e.stunT = Math.max(e.stunT || 0, 0.6); applyStatus(e, "slow", p, 0); }
      if (e.hp > 0) { p.mark = e; p.markT = 4; }
    });
    if (S.spin) { for (let i = 0; i < 4; i++) FX.slash(p.x, p.y - 10 * g, a + (i / 4) * TAU, reach * 0.8, col, 0.32); }
    else FX.slash(p.x, p.y - 10 * g, a, reach * 0.8, col, S.heavy ? 0.3 : 0.22);
    if (S.quake) { FX.ring(p.x, p.y, 10, reach + 20, col, 0.4, 4); FX.burst(p.x, p.y - 10 * g, "#ffffff", 18, 200, 0.4, 3); FX.addShake(5); SFX.play("bigHit", 0.5, 1.1); }
    else if (S.heavy) { FX.burst(p.x + Math.cos(a) * reach * 0.5, p.y + Math.sin(a) * reach * 0.4, col, 8, 120, 0.3, 3); FX.addShake(1.5); }
    if (n && S.heavy) Game.slowT = Math.max(Game.slowT, S.quake ? 0.18 : 0.08);          // a heavy blow that connects bites for a moment
  },

  // The Bindframe's own weapon systems. They need no button: mortars and the beam fire while the cannon has a
  // target; the rune lightning and the Sunfall pick their own.
  weapons(p, dt, tier, tgt) {
    if (tier < 3) return;
    const dmg = this.boltDamage(), g = Mech.reach(tier), P = Mech.parts(tier), tx = CONFIG.texel, color = Mech.parts(tier).accent;
    const topY = p.y - (P.hipY + P.shoulderY + 12 * P.s) * tx * g;
    const gunA = p.gunAim !== undefined ? p.gunAim : p.aim;
    // shoulder mortars: a pair of shells lobbed at the target
    p.mortarT -= dt;
    if (tgt && p.mortarT <= 0) {
      p.mortarT = 2.3;
      const d = Math.min(Math.hypot(tgt.x - p.x, tgt.y - p.y), 560), a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      for (const sx of [-1, 1]) {
        const ox = p.x + sx * 18 * P.s * tx * 0.5 * g, lx = p.x + Math.cos(a) * d + sx * 34 + (Math.random() - 0.5) * 30, ly = p.y + Math.sin(a) * d + (Math.random() - 0.5) * 40;
        Game.projectiles.push({ kind: "lob", warn: true, x: ox, y: topY, sx: ox, sy: p.y, tx: lx, ty: ly, t: 0, dur: 0.85, team: 0, dmg: dmg * 1.5, type: "arcane", src: p, color, aoe: 62 + tier * 6, size: 8 + tier, look: "fire", age: 0, kb: 13, shake: 1.5 });
        FX.burst(ox, topY, "#ffffff", 5, 90, 0.25, 3); FX.mote(ox, topY, sx * 20, -60, "#8a8894", 0.7, 6, -20);
      }
      SFX.play("mortar", 0.6);
    }
    // sweeping beam: a second of solid light along the cannon
    if (tier >= 4) {
      if (p.beamT > 0) {
        p.beamT -= dt; p.beamTick -= dt;
        const m = Mech.muzzle(p, tier), len = 620, ex = m.x + Math.cos(gunA) * len, ey = m.y + Math.sin(gunA) * len;
        FX.beam(m.x, m.y, ex, ey, color, 0.09, 12 * g);
        if (Math.random() < 0.6) FX.mote(lerp(m.x, ex, Math.random()), lerp(m.y, ey, Math.random()), (Math.random() - 0.5) * 60, -40, color, 0.4, 4);
        if (p.beamTick <= 0) { p.beamTick = 0.1; lineDamage(p, m.x, m.y, gunA, len, 12 * g, dmg * 0.55, "arcane", { kb: 4 }); }
        p.attackT = 0.2; FX.addShake(0.6);
      } else {
        p.beamCd -= dt;
        if (tgt && p.beamCd <= 0) { p.beamCd = 7.5; p.beamT = 0.9; p.beamTick = 0; SFX.play("beam", 0.9, 0.6); }
      }
    }
    // rune lightning: the orbiting runes strike whatever strays too close
    if (tier >= 5) {
      p.arcT -= dt;
      if (p.arcT <= 0) {
        p.arcT = 1.25;
        let best = null, bd = 400 * 400;
        Grid.query(p.x, p.y, 400, (e) => { if (e.team !== 1 || !targetable(e) || !e.aggro) return; const d = dist2(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; best = e; } });
        if (best) { chainLightning(p, p.x, p.y - Mech.height(tier) * 0.5, best, dmg * 1.3, 3, "arcane", color); SFX.play("zap", 0.5, 0.8); }
        else p.arcT = 0.3;
      }
    }
    // Sunfall: the Worldbinder calls a pillar of light down on the thickest knot of foes
    if (tier >= 6) {
      p.sunT -= dt;
      if (p.sunT <= 0) {
        p.sunT = 1;
        let best = null, bn = 2;
        Grid.query(p.x, p.y, 620, (e) => {
          if (e.team !== 1 || !targetable(e) || !e.aggro || Math.random() > 0.25) return;
          let n = 0; Grid.query(e.x, e.y, 120, (o) => { if (o.team === 1 && targetable(o)) n += o.titan ? 6 : 1; });
          if (n > bn) { bn = n; best = e; }
        });
        if (best) {
          p.sunT = 8;
          Game.projectiles.push({ kind: "lob", sky: true, warn: true, x: best.x, y: best.y, sx: best.x, sy: best.y, tx: best.x, ty: best.y, t: 0, dur: 0.9, team: 0, dmg: dmg * 6, type: "arcane", src: p, color, aoe: 140, size: 18, look: "light", age: 0, kb: 17, pillar: true });
          SFX.play("sunfall", 0.8);
        }
      }
    }
  },

  net(p) {
    const C = CONFIG.player, tier = Game.mechTier();
    if (p.netT > 0) return;
    p.netT = C.netCd; p.attackT = 0.25;
    let tx = p.aimX, ty = p.aimY;
    if (Input.touch && Input.aim.id === null) { const t = this.autoTarget(p, true) || this.autoTarget(p, false); if (t) { tx = t.x; ty = t.y; } }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, C.netRange * (1 + tier * 0.15));
    const top = p.y - Mech.height(tier) * 0.6, n = 1 + Game.boon("nets"), a0 = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      // extra nets fan out around the aimed one
      const a = a0 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45);
      Game.projectiles.push({ kind: "net", x: p.x, y: top, sx: p.x, sy: top, tx: p.x + Math.cos(a) * m, ty: p.y + Math.sin(a) * m, t: 0, dur: C.netFlight + m / 1400, team: 0, size: 10 });
    }
    SFX.play("net");
  },

  // the dash ends in a ground-slam once you pilot a Bindframe (or hold the Shockwave boon)
  slam(p, tier) {
    const base = CONFIG.mech[tier].slam, b = Game.boon("slam");
    if (!base && !b) return;
    const rad = (base || 60) * (1 + 0.1 * b) * Mech.reach(tier), dmg = this.boltDamage() * 2.5 * (1 + 0.35 * b);
    const color = tier ? Mech.parts(tier).accent : "#7be0ff";
    FX.ring(p.x, p.y, 10, rad, color, 0.4, 5); FX.burst(p.x, p.y, color, 14 + tier * 5, 200 + tier * 40, 0.5, 4);
    FX.addShake(3 + tier * 1.5); SFX.play("bigHit", 0.6 + tier * 0.1);
    Grid.query(p.x, p.y, rad + 60, (e) => { if (e.team === 1 && targetable(e) && dist2(e.x, e.y, p.x, p.y) < (rad + e.r) * (rad + e.r)) dealDamage(p, e, dmg, "arcane", { text: true, kb: 18 }); });
  },

  // TRAMPLE: a big frame simply walks over small beasts. Anything much smaller than the frame that ends up
  // under its feet while it strides is crushed and kicked aside; bigger frames crush bigger beasts, harder.
  trample(p, tier, dt) {
    if (tier < 2 || !(p.moving || p.dashT > 0)) return;
    const foot = p.r * Mech.reach(tier) * 1.15, maxR = p.r * Mech.reach(tier) * 0.62, dps = this.boltDamage() * (1.2 + tier * 0.5);
    Grid.query(p.x, p.y, foot + 40, (e) => {
      if (e.team !== 1 || !targetable(e) || e.titan || e.r > maxR || (e.trampleT || 0) > Game.time) return;
      const dx = e.x - p.x, dy = (e.y - p.y) * 1.6; if (dx * dx + dy * dy > (foot + e.r) * (foot + e.r)) return;
      e.trampleT = Game.time + 0.45;
      dealDamage(p, e, dps * 0.45, "ground", { text: true, kb: 9 + tier * 2 });
      FX.burst(e.x, e.y, "#c8c0a8", 5, 90, 0.35, 3); SFX.play("thud", 0.25, 1.5);
    });
  },

  // STOMP: the frame rears up and drives a foot into the ground. Everything about it scales with the frame.
  stompRadius(tier) { return (70 + 38 * tier) * Mech.reach(tier) * (1 + 0.1 * Game.boon("slam")); },
  stomp(p) {
    const tier = Game.mechTier();
    if (!tier) { UI.toast("Only a Bindframe can stomp — fell a Titan and forge its core"); return; }
    if (p.stompCd > 0 || p.stompT > 0 || p.dashT > 0) return;
    p.stompT = 0.34; p.stompCd = CONFIG.stompCd;
    SFX.play("windup", 0.5, 1.2 - tier * 0.08);
  },
  stompLand(p, tier) {
    if (!tier) return;
    const rad = this.stompRadius(tier), color = Mech.parts(tier).accent, b = Game.boon("slam");
    const dmg = this.boltDamage() * (3 + tier * 0.9) * (1 + 0.35 * b);
    p.stompLand = 0.3;
    // shockwave rings, a dust wall racing outward, cracks of binding-light, and debris thrown up
    for (let i = 0; i < 2 + (tier >> 1); i++) FX.ring(p.x, p.y, 10 + i * 14, rad * (1 - i * 0.16), i ? "#ffffff" : color, 0.35 + i * 0.12, 4 + tier);
    const n = 10 + tier * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.3, sp = rad * (1.6 + Math.random());
      FX.mote(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp * 0.55, i % 3 ? "#c8c0a8" : color, 0.35 + Math.random() * 0.3, 4 + tier + Math.random() * 4, 60);
    }
    for (let i = 0; i < 5 + tier; i++) { const a = Math.random() * TAU, l = rad * (0.5 + Math.random() * 0.5); FX.zap(p.x, p.y, p.x + Math.cos(a) * l, p.y + Math.sin(a) * l * 0.6, color, 0.3, 2 + tier * 0.5); }
    FX.burst(p.x, p.y, "#8a7a5a", 12 + tier * 6, 160 + tier * 50, 0.6, 4 + (tier >> 1));
    if (tier >= 4) FX.pillar(p.x, p.y, rad * 0.25, color, 0.4);
    FX.addShake(5 + tier * 2.5); SFX.play("thud", 0.8 + tier * 0.1, 1.1 - tier * 0.1); SFX.play("boom", 0.4 + tier * 0.1, 1.2 - tier * 0.1);
    Grid.query(p.x, p.y, rad + 80, (e) => {
      if (e.team !== 1 || !targetable(e)) return;
      const d = Math.hypot(e.x - p.x, e.y - p.y); if (d > rad + e.r) return;
      const k = 1 - 0.5 * (d / rad);                                   // hardest at the foot
      dealDamage(p, e, dmg * k, "ground", { text: true, kb: (16 + tier * 4) * k });
      if (e.hp > 0) { applyStatus(e, "slow", p, 0); if (!e.titan) e.stunT = Math.max(e.stunT || 0, 0.5 + tier * 0.12); }
    });
  },

  dash(p) {
    const C = CONFIG.player;
    if (p.dashCd > 0 || p.dashT > 0) return;
    let dx = p.moveX, dy = p.moveY;
    if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    p.dashX = dx; p.dashY = dy; p.dashT = C.dashTime; p.dashCd = C.dashCd; p.invuln = Math.max(p.invuln, C.dashTime + 0.1);
    p.dodgeT = C.dashTime + 0.12; p.dodged = false;
    SFX.play("dash");
  },

  // PERFECT DODGE: a blow that lands while you are mid-dash. Time crawls for a heartbeat, the dash is
  // ready again at once, and your next blade hit is a Riposte. Once per dash, so it cannot be chained
  // off one lingering hazard.
  perfectDodge(p) {
    if (p.dodged || !(p.dodgeT > 0) || Game.state !== "play") return;
    p.dodged = true; p.dashCd = 0; p.riposte = 4;
    Game.slowT = 0.55; Game.stats.dodges = (Game.stats.dodges || 0) + 1;
    if (Game.frenzy > 0) Game.frenzyT = Game.frenzyWindow();
    const top = p.y - Mech.height(Game.mechTier()) * 0.7;
    FX.text(p.x, top - 20, "PERFECT DODGE", "#9dffff", 1.2, 17);
    FX.ring(p.x, p.y, 10, 120 * Mech.reach(Game.mechTier()), "#9dffff", 0.45, 4); FX.burst(p.x, top, "#ffffff", 14, 180, 0.4, 3);
    SFX.play("warp", 0.5, 1.6); SFX.play("chink", 0.6, 1.3);
  },

  draw(ctx, p, time) {
    const tier = Game.mechTier();
    this.drawCharge(ctx, p, time, tier);
    if (tier) {
      Mech.draw(ctx, p, tier, time);
      if ((World.cellAt(p.x, p.y) & F_WATER) !== 0) {
        const g = Mech.reach(tier), s = MECH_TIERS[tier].s, f = World.cellAt(p.x, p.y), liquid = BIOME_ART[REGIONS[f & F_REGION].id].liquid;
        ctx.fillStyle = f & F_DEEP ? "#1e0e3a" : liquid === "lava" ? "#e85a10" : "#3674c0"; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, (22 * s + 8) * g, (8 * s + 3) * g, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) { const k = (time * 0.8 + i * 0.5) % 1; ctx.globalAlpha = (1 - k) * 0.8; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, (22 * s + 8) * g * (0.8 + k * 0.7), (8 * s + 3) * g * (0.8 + k * 0.7), 0, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      Heroes.drawWorld(ctx, p, time);
      this.chevron(ctx, p, Mech.height(tier), time); return;
    }
    const H = CONFIG.playerHeight;
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#0a0e18";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = p.invuln > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 ? 0.45 : 1;
    BinderArt.draw(ctx, p, time);
    ctx.globalAlpha = 1;
    Heroes.drawWorld(ctx, p, time);
    if (p.drone) BinderArt.drone(ctx, p.drone, time, !!p.drone.t);
    this.chevron(ctx, p, H, time);
  },

  // the heavy blow winding up: an arc at the feet fills as it charges and burns white when it is full
  drawCharge(ctx, p, time, tier) {
    if (!p.charging) return;
    const k = p.chargeK, r = (16 + 10 * k) * Mech.reach(tier), full = k >= 1;
    ctx.lineWidth = full ? 4 : 3; ctx.strokeStyle = full ? "#ffffff" : Heroes.current().color; ctx.globalAlpha = full ? 0.7 + 0.3 * Math.sin(time * 20) : 0.35 + 0.45 * k;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.04, k)); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // a bobbing chevron so the binder is never lost inside their own horde
  chevron(ctx, p, H, time) {
    if (Game.army.length >= 6) {
      const y = Math.round(p.y - H - 12 + Math.sin(time * 5) * 2), x = Math.round(p.x);
      ctx.fillStyle = "#0c101c"; ctx.fillRect(x - 7, y - 1, 14, 5); ctx.fillRect(x - 4, y + 4, 8, 3); ctx.fillRect(x - 2, y + 7, 4, 2);
      ctx.fillStyle = "#5cf08a"; ctx.fillRect(x - 5, y, 10, 3); ctx.fillRect(x - 3, y + 3, 6, 2); ctx.fillRect(x - 1, y + 5, 2, 2);
    }
  },
};
