// A playable level: the overworld or a dragon's arena. The knight moves freely in any
// direction. Dragons attack by marking shapes on the ground (circles, bands, lanes)
// that strike a moment later.
(function () {
  'use strict';
  const G = window.Gfx, M = window.Models, D = window.Data;
  const V3 = THREE.Vector3;

  const SPEED = 4.8;          // knight run speed, units per second
  const KR = 0.3;             // knight radius
  const ROLL = { dist: 2.4, time: 0.28 };
  // Arena: the field the knight can stand on, and the dragon's ledge across the top.
  const F = { x0: 0.5, x1: 9.5, z0: 3.5, z1: 11.5 };
  const BOSS_BOX = { half: 1.6, z0: 1.0, z1: 3.5 };
  const SKIES = {
    world: [0x4aa8ff, 0xcfeeff], thunder: [0x2b3157, 0x7a84b0], water: [0x0f5d73, 0x8fe3df], fire: [0x3a0d0d, 0xff8a3d], earth: [0xd98e4a, 0xffe2a8], demon: [0x12060f, 0x7a1230],
  };
  const DIR_ROT = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };
  // Characters face +X; rotation y = atan2(-dz, dx) aims them along (dx, dz).
  const angleOf = (dx, dz) => Math.atan2(-dz, dx);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const p3 = (x, z, h) => new V3(x, h == null ? 0.5 : h, z);

  function arenaRows() {
    const rows = [];
    for (let y = 0; y < 13; y++) {
      const inner = y === 0 || y === 12 ? 'BBBBBBBBB' : y <= 3 ? 'XXXXXXXXX' : 'fffffffff';
      rows.push('B' + inner + 'B');
    }
    return rows;
  }

  // ---------- hazard shapes ----------
  const circle = (x, z, r) => ({ c: 'circle', x, z, r });
  const box = (x, z, w, d, a) => ({ c: 'box', x, z, w, d, a: a || 0 });
  const rect = (x0, z0, x1, z1) => box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  function inside(s, x, z) {
    if (s.c === 'circle') return (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) <= s.r * s.r;
    const ox = x - s.x, oz = z - s.z, ca = Math.cos(s.a), sa = Math.sin(s.a);
    return Math.abs(ox * ca - oz * sa) <= s.w / 2 && Math.abs(ox * sa + oz * ca) <= s.d / 2;
  }

  // Ground decals for the warnings: an outline at full size and a fill that grows.
  function decalTexture(round, ring) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    if (ring) {
      g.lineWidth = 9;
      g.globalAlpha = 1;
      if (round) { g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke(); } else g.strokeRect(5, 5, 118, 118);
      g.globalAlpha = 0.22;
      if (round) { g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill(); } else g.fillRect(8, 8, 112, 112);
    } else {
      g.globalAlpha = 0.6;
      if (round) { g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); } else g.fillRect(2, 2, 124, 124);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function decalLayer(round, ring, parent) {
    const MAX = 220;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: decalTexture(round, ring), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 2;
    im.userData.noShadow = true;
    parent.add(im);
    const d = new THREE.Object3D();
    return {
      clear() { im.count = 0; },
      add(s, k, color, y) {
        if (im.count >= MAX) return;
        d.position.set(s.x, y, s.z);
        d.rotation.set(0, s.c === 'box' ? s.a : 0, 0);
        if (s.c === 'circle') d.scale.set(s.r * 2 * k, 1, s.r * 2 * k);
        else d.scale.set(s.w * k, 1, s.d * k);
        d.updateMatrix();
        im.setMatrixAt(im.count, d.matrix);
        im.setColorAt(im.count, color);
        im.count += 1;
      },
      done() { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; },
    };
  }

  function create(opts) {
    const P = opts.player;
    const hooks = opts.hooks;
    const isArena = opts.kind === 'arena';
    const rows = isArena ? arenaRows() : D.WORLD;
    const theme = isArena ? (opts.bossId === 'demon' ? 'demon' : D.DRAGONS[opts.bossId].element) : 'world';
    const group = new THREE.Group();
    const L = { locked: false, input: { x: 0, z: 0 }, time: 0, hp: P.hpMax, over: false };
    const rand = (n) => Math.floor(Math.random() * n);

    // ---------- ground, scenery, lights ----------
    const world = window.World.build({ rows, group, kind: opts.kind, theme });
    const phys = world.collider;
    const at = world.at;
    const sky = SKIES[theme];
    group.add(G.sky(sky[0], sky[1]));
    group.add(new THREE.HemisphereLight(0xffffff, theme === 'demon' ? 0x3a1030 : 0x7a8a70, theme === 'demon' ? 0.5 : 0.55));
    const sun = new THREE.DirectionalLight(theme === 'fire' || theme === 'demon' ? 0xffc29a : 0xfff4e0, 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(G.lite ? 1024 : 2048, G.lite ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -13; sc.right = sc.top = 13; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    group.add(sun, sun.target);
    const SUN_OFFSET = new V3(-6, 14, 7);

    // ---------- props, people and places ----------
    const updaters = [];
    const npcs = [];
    const targets = [];   // things (A) can talk to or use: { x, z, reach, act }
    const lairs = [];
    let gate = null;
    const lairModels = {};
    if (!isArena) {
      const seenHouse = new Set();
      for (let y = 0; y < world.H; y++) for (let x = 0; x < world.W; x++) {
        const c = at(x, y);
        if (c === 'H' && !seenHouse.has(x + ',' + y)) {
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => seenHouse.add((x + dx) + ',' + (y + dy)));
          const h = M.house(x < 19 ? 0xd9534f : 0x3f8fd1);
          h.position.set(x + 0.5, 0, y + 0.5);
          group.add(h);
          const barrel = M.env(Math.random() < 0.5 ? 'barrel' : 'crate_A_big', 3);
          barrel.position.set(x + 1.85, 0, y + 1.35);
          barrel.rotation.y = Math.random() * 3;
          group.add(barrel);
          phys.add({ x: x + 1.85, z: y + 1.35, r: 0.3 });
        } else if (c === 'G') {
          const castle = M.castle(false);
          castle.position.set(x, 0, y - 1.6);
          group.add(castle);
          targets.push({ x, z: y, reach: 1.6, act: () => hooks.onCastle() });
        } else if (c === 'S') {
          const s = M.sign();
          s.position.set(x, 0, y);
          group.add(s);
          targets.push({ x, z: y, reach: 1.45, act: () => hooks.onSign(D.SIGNS[x + ',' + y]) });
        } else if (c === '*') {
          const def = D.CHESTS[x + ',' + y];
          const ch = M.chest(P.chests.includes(def.id));
          ch.group.position.set(x, 0, y);
          group.add(ch.group);
          targets.push({
            x, z: y, reach: 1.45, act: () => {
              if (P.chests.includes(def.id)) return hooks.onSign('The chest is empty.');
              ch.open();
              G.emit({ pos: p3(x, y, 0.6), count: 24, colors: [0xffe680, 0xffffff], speed: 2.5, life: 0.8, size: 0.3, gravity: 3 });
              hooks.onChest(def);
            },
          });
        } else if (D.LAIR_CHARS[c]) {
          const id = D.LAIR_CHARS[c];
          if (id === 'demon') {
            gate = M.ashenGate();
            gate.group.position.set(x, 0, y);
            gate.refresh(P.slain);
            group.add(gate.group);
            updaters.push(gate);
          } else {
            const lm = M.lair(id);
            lm.group.position.set(x, 0, y);
            if (P.slain.includes(id)) lm.setSlain();
            group.add(lm.group);
            lairModels[id] = lm;
          }
          lairs.push({ x, z: y, id, armed: false });
          targets.push({ x, z: y, reach: 1.6, act: () => hooks.onLair(id) });
        }
      }
      D.NPCS.forEach((n) => {
        const m = M.person(n.look);
        m.group.position.set(n.x, 0, n.y);
        m.group.rotation.y = -Math.PI / 2;
        group.add(m.group);
        phys.add({ x: n.x, z: n.y, r: 0.4 });
        npcs.push({ def: n, model: m });
        targets.push({ x: n.x, z: n.y, reach: 1.45, act: () => hooks.onTalk(n), npc: m });
      });
    }
    function nearestLair(x, z) {
      let best = null, bd = 1e9;
      lairs.forEach((l) => { const d = Math.abs(l.x - x) + Math.abs(l.z - z); if (d < bd) { bd = d; best = l; } });
      return { lair: best, dist: bd };
    }

    // ---------- the knight ----------
    const s0 = opts.start || (isArena ? { x: 5, z: 9.5, rot: Math.PI / 2 } : D.START);
    const start = { x: s0.x, z: s0.z != null ? s0.z : s0.y, rot: s0.rot != null ? s0.rot : DIR_ROT[s0.dir || 'down'] };
    const kModel = M.knight();
    group.add(kModel.group);
    const K = {
      x: start.x, z: start.z, rot: start.rot, want: start.rot, speed: 0, tileX: null, tileY: null,
      invuln: 0, blink: 0, cdA: 0, cdB: 0, cdC: 0, lock: 0, roll: null, buffer: null,
    };
    K.circle = phys.add({ x: K.x, z: K.z, r: KR, knight: true });
    L.knight = K;
    const facing = () => ({ x: Math.cos(K.rot), z: -Math.sin(K.rot) });
    function refreshGlow() { kModel.setGlow(P.active ? D.ELEMENTS[P.active].color : null); }
    refreshGlow();
    L.refreshGlow = refreshGlow;

    // ---------- dynamic things ----------
    const rocks = [];     // { x, z, mesh, circle }
    const enemies = [];
    const hazards = [];
    const shots = [];
    const pickups = [];
    let boss = null;
    const layers = {
      ringC: decalLayer(true, true, group), fillC: decalLayer(true, false, group),
      ringB: decalLayer(false, true, group), fillB: decalLayer(false, false, group),
    };

    function moveCircle(self, x, z, r) {
      const p = { x, z, self };
      phys.push(p, r);
      return p;
    }
    const groundY = (x, z) => Math.max(0, world.groundY(x, z));

    // ---------- knight actions ----------
    function interactTarget() {
      const f = facing();
      let best = null, bs = 1e9;
      targets.forEach((t) => {
        const dx = t.x - K.x, dz = t.z - K.z, d = Math.hypot(dx, dz);
        if (d > t.reach) return;
        const score = d - ((dx * f.x + dz * f.z) / (d || 1)) * 0.6;
        if (score < bs) { bs = score; best = t; }
      });
      return best;
    }
    function inputMag() { return Math.min(1, Math.hypot(L.input.x || 0, L.input.z || 0)); }

    // With the stick idle, attacks turn to face the nearest foe in reach.
    function autoFace(range) {
      if (inputMag() > 0.2) return;
      let best = null, bd = range;
      enemies.forEach((e) => { if (!e.alive) return; const d = Math.hypot(e.x - K.x, e.z - K.z); if (d < bd) { bd = d; best = e; } });
      if (best) K.rot = K.want = angleOf(best.x - K.x, best.z - K.z);
    }

    function swordDamage(targetEl, tired) {
      return P.sword * D.effectiveness(P.active, targetEl) * (tired ? 2 : 1);
    }
    function bossDistance(x, z) {
      const qx = Math.max(boss.x - BOSS_BOX.half, Math.min(boss.x + BOSS_BOX.half, x));
      const qz = Math.max(BOSS_BOX.z0, Math.min(BOSS_BOX.z1, z));
      return Math.hypot(x - qx, z - qz);
    }

    function swing() {
      K.cdA = 0.42;
      K.lock = 0.24;
      autoFace(2.6);
      kModel.play('Chop', 1.7);
      hooks.sfx('swing');
      const color = P.active ? D.ELEMENTS[P.active].color : 0xffffff;
      setTimeout(() => {
        if (L.over) return;
        const f = facing();
        for (let i = -2; i <= 2; i++) {
          const a = K.rot + i * 0.45;
          G.emit({ pos: p3(K.x + Math.cos(a) * 1.0, K.z - Math.sin(a) * 1.0, 0.65), count: 3, colors: [color, 0xffffff], speed: 1.4, life: 0.22, size: 0.32, area: 0.2 });
        }
        const inArc = (x, z, reach) => {
          const dx = x - K.x, dz = z - K.z, d = Math.hypot(dx, dz);
          return d <= reach && (d < 0.4 || (dx * f.x + dz * f.z) / d > 0.42);
        };
        enemies.forEach((e) => { if (e.alive && inArc(e.x, e.z, 1.55 + 0.4)) hurtEnemy(e, swordDamage(e.element, false), f); });
        const rock = rocks.find((r) => inArc(r.x, r.z, 1.5));
        if (rock) breakRock(rock);
        if (boss && bossDistance(K.x + f.x * 0.6, K.z + f.z * 0.6) <= 1.0 && f.z < 0.3) hurtBoss(swordDamage(boss.element, boss.state === 'tired'), true);
      }, 100);
    }

    function shoot() {
      K.cdB = 0.45;
      K.lock = 0.14;
      hooks.sfx('shoot');
      kModel.play('Interact', 2.2);
      let f = facing();
      // Aim assist: bend up to 30 degrees toward the nearest thing worth hitting.
      let best = null, bestDot = Math.cos(Math.PI / 6);
      const consider = (x, z) => {
        const dx = x - K.x, dz = z - K.z, d = Math.hypot(dx, dz);
        if (d < 0.1 || d > 11) return;
        const dot = (dx * f.x + dz * f.z) / d;
        if (dot > bestDot) { bestDot = dot; best = { x: dx / d, z: dz / d }; }
      };
      enemies.forEach((e) => { if (e.alive) consider(e.x, e.z); });
      if (boss && boss.alive) consider(boss.x, 2.6);
      if (best) { f = best; K.rot = K.want = angleOf(f.x, f.z); }
      const color = P.active ? D.ELEMENTS[P.active].color : 0xcfe8ff;
      const mesh = M.ball(0.17, G.glow(color), K.x + f.x * 0.4, 0.75, K.z + f.z * 0.4);
      group.add(mesh);
      shots.push({ mesh, x: K.x + f.x * 0.4, z: K.z + f.z * 0.4, dx: f.x, dz: f.z, left: 11, color, element: P.active });
    }

    function dodge() {
      K.cdC = 0.7;
      const m = inputMag();
      let d = facing();
      if (m > 0.2) { const n = Math.hypot(L.input.x, L.input.z); d = { x: L.input.x / n, z: L.input.z / n }; }
      K.roll = { t: 0, dx: d.x, dz: d.z };
      K.rot = K.want = angleOf(d.x, d.z);
      K.invuln = Math.max(K.invuln, 0.42);
      K.lock = ROLL.time;
      kModel.anim.spin = 1;
      hooks.sfx('dodge');
      G.emit({ pos: p3(K.x, K.z, 0.15), count: 8, color: 0xffffff, speed: 1.2, life: 0.4, size: 0.3 });
    }

    L.press = function (btn) {
      if (L.locked || L.over) return;
      K.buffer = { btn, t: 0.25 };
    };

    function runBuffer() {
      const b = K.buffer;
      if (!b || K.roll || K.lock > 0) return;
      K.buffer = null;
      if (b.btn === 'A') {
        const t = interactTarget();
        if (t) {
          K.rot = K.want = angleOf(t.x - K.x, t.z - K.z);
          if (t.npc) t.npc.group.rotation.y = angleOf(K.x - t.x, K.z - t.z);
          t.act();
          return;
        }
        if (K.cdA <= 0) swing();
      } else if (b.btn === 'B' && K.cdB <= 0) shoot();
      else if (b.btn === 'C' && K.cdC <= 0) dodge();
    }

    function moveKnight(dt) {
      let dx = 0, dz = 0;
      if (K.roll) {
        const r = K.roll;
        r.t += dt;
        const step = (ROLL.dist / ROLL.time) * dt;
        dx = r.dx * step; dz = r.dz * step;
        if (r.t >= ROLL.time) { K.roll = null; kModel.anim.spin = 0; }
        K.speed = 0;
      } else {
        const m = L.locked ? 0 : inputMag();
        if (m > 0.08) {
          const n = Math.hypot(L.input.x, L.input.z);
          const ux = L.input.x / n, uz = L.input.z / n;
          const slow = K.lock > 0 ? 0.3 : 1;
          dx = ux * SPEED * m * slow * dt; dz = uz * SPEED * m * slow * dt;
          K.want = angleOf(ux, uz);
          K.speed = m * slow;
        } else K.speed = 0;
      }
      if (dx || dz) {
        const p = moveCircle(K.circle, K.x + dx, K.z + dz, KR);
        K.x = p.x; K.z = p.z;
        K.circle.x = K.x; K.circle.z = K.z;
      }
      K.rot += wrap(K.want - K.rot) * Math.min(1, dt * 16);
      const tx = Math.round(K.x), ty = Math.round(K.z);
      if (tx !== K.tileX || ty !== K.tileY) { K.tileX = tx; K.tileY = ty; enterTile(tx, ty); }
    }

    let region = null;
    function enterTile(tx, ty) {
      if (isArena) return;
      if (at(tx, ty) === ',' && K.speed > 0) G.emit({ pos: p3(K.x, K.z, 0.3), count: 4, color: 0x6fd36f, speed: 1.4, life: 0.4, size: 0.2, gravity: 3 });
      const nl = nearestLair(tx, ty);
      let name = 'Valemoor Fields';
      if (nl.dist <= 9) name = nl.lair.id === 'demon' ? 'The Ashen Gate' : D.DRAGONS[nl.lair.id].lair;
      if (name !== region) { region = name; hooks.onBanner(name); }
    }

    function checkTouches() {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (Math.hypot(p.x - K.x, p.z - K.z) > 0.75) continue;
        group.remove(p.mesh);
        pickups.splice(i, 1);
        L.hp = Math.min(P.hpMax, L.hp + 2);
        hooks.sfx('heart');
        G.floatText(p3(K.x, K.z, 1.6), '+1 ♥', 'heal');
        hooks.onHud();
      }
      // Walking into a lair's mouth asks to enter, once per approach.
      lairs.forEach((l) => {
        const d = Math.hypot(l.x - K.x, l.z - K.z);
        if (d > 1.7) l.armed = true;
        else if (d < 1.0 && l.armed && K.speed > 0.3 && !L.locked) { l.armed = false; hooks.onLair(l.id); }
      });
    }

    function hurtKnight(dmg, color) {
      if (K.invuln > 0 || L.locked || L.over) return;
      L.hp = Math.max(0, L.hp - dmg);
      K.invuln = 1.1;
      K.blink = 1.1;
      G.shake(0.35);
      G.flash('rgba(255,40,40,0.55)', 300);
      hooks.sfx('hurt');
      kModel.play('Hit', 1.6);
      G.floatText(p3(K.x, K.z, 1.7), '-' + (dmg / 2) + ' ♥', 'hurt');
      G.emit({ pos: p3(K.x, K.z, 0.7), count: 14, colors: [color || 0xff5555, 0xffffff], speed: 3, life: 0.5, size: 0.3 });
      hooks.onHud();
      if (L.hp <= 0) {
        L.over = true;
        kModel.group.visible = true;
        G.tween(kModel.anim, { dead: 1 }, 700, G.ease.in);
        setTimeout(() => hooks.onDeath(), 1500);
      }
    }

    // ---------- rocks, hearts ----------
    function placeRock(x, z) {
      if (Math.hypot(x - K.x, z - K.z) < 0.75 || rocks.some((r) => Math.hypot(r.x - x, r.z - z) < 0.8)) return;
      if (rocks.length >= 12) breakRock(rocks[0]);
      const mesh = M.boulder();
      mesh.position.set(x, 0, z);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(mesh);
      rocks.push({ x, z, mesh, circle: phys.add({ x, z, r: 0.42 }) });
    }
    function breakRock(r) {
      const i = rocks.indexOf(r);
      if (i < 0) return;
      group.remove(r.mesh);
      phys.remove(r.circle);
      rocks.splice(i, 1);
      hooks.sfx('rock');
      G.emit({ pos: p3(r.x, r.z, 0.4), count: 12, colors: [0x8a7a66, 0xb8a68e], speed: 3, life: 0.5, size: 0.32, gravity: 8 });
    }
    function dropHeart(x, z) {
      if (pickups.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) return;
      const mesh = M.heart();
      mesh.position.set(x, 0.6, z);
      group.add(mesh);
      pickups.push({ x, z, mesh });
    }

    // ---------- hazards ----------
    // { shapes, except, warn, dmg, color, linger, safe, rocks, shatter, owner, sfx, onFire }
    function hazard(h) {
      h.t = 0; h.fired = false; h.linger = h.linger || 0;
      hazards.push(h);
      return h;
    }
    function hits(h, x, z) {
      if (h.except && h.except.some((s) => inside(s, x, z))) return false;
      return h.shapes.some((s) => inside(s, x, z));
    }
    function burst(s, color, many) {
      const up = new V3(0, 1, 0);
      if (s.c === 'circle') {
        G.emit({ pos: p3(s.x, s.z, 0.2), count: Math.min(14, 4 + Math.round(s.r * 6)), colors: [color, 0xffffff], speed: 3.2, dir: up, spread: 0.5, life: 0.45, size: 0.36, gravity: 4, area: s.r * 1.3 });
        return;
      }
      const n = Math.max(1, Math.min(many ? 4 : 8, Math.round(Math.max(s.w, s.d) / 1.2)));
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n - 0.5;
        const along = s.w >= s.d ? k * s.w : 0, across = s.w >= s.d ? 0 : k * s.d;
        G.emit({ pos: p3(s.x + along * ca + across * sa, s.z - along * sa + across * ca, 0.2), count: many ? 3 : 5, colors: [color, 0xffffff], speed: 3.2, dir: up, spread: 0.5, life: 0.45, size: 0.36, gravity: 4, area: Math.min(s.w, s.d) * 0.8 });
      }
    }
    function fireHazard(h) {
      h.fired = true;
      if (h.safe) return;
      if (h.owner && !h.owner.alive) return;
      const many = h.shapes.length > 10;
      h.shapes.forEach((s, i) => {
        if (!many || i % 2 === 0) burst(s, h.color, many);
        if (h.rocks && s.c === 'circle') placeRock(s.x, s.z);
      });
      if (h.shatter) rocks.slice().forEach((r) => { if (hits(h, r.x, r.z)) breakRock(r); });
      if (h.onFire) h.onFire();
      hooks.sfx(h.sfx || 'boom');
      if (h.shapes.length > 4 || h.shapes.some((s) => s.c === 'box' && s.w * s.d > 8)) G.shake(0.22);
      if (hits(h, K.x, K.z)) hurtKnight(h.dmg, h.color);
    }
    const color = new THREE.Color(), dim = new THREE.Color();
    function updateHazards(dt) {
      Object.values(layers).forEach((l) => l.clear());
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.t += dt;
        if (!h.fired && h.t >= h.warn) fireHazard(h);
        if (h.fired && h.t >= h.warn + h.linger) { hazards.splice(i, 1); continue; }
        if (h.fired && !h.safe && (!h.owner || h.owner.alive) && hits(h, K.x, K.z)) hurtKnight(h.dmg, h.color);
        const k = Math.min(1, h.t / h.warn);
        const pulse = 0.5 + 0.5 * Math.sin(h.t * (8 + k * 22));
        if (h.safe) color.setHex(0x3dff7a).multiplyScalar(0.75 + pulse * 0.25);
        else if (h.fired) color.setHex(h.color).multiplyScalar(0.85 + pulse * 0.15);
        else color.setRGB(1, 0.12 + 0.4 * pulse * k, 0.08 + 0.12 * pulse * k);
        dim.copy(color);
        const grow = h.fired || h.safe ? 1 : 0.15 + 0.85 * k;
        h.shapes.forEach((s) => {
          const y = 0.06 + (isArena ? 0 : groundY(s.x, s.z));
          (s.c === 'circle' ? layers.ringC : layers.ringB).add(s, 1, color, y);
          (s.c === 'circle' ? layers.fillC : layers.fillB).add(s, grow, dim, y + 0.005);
        });
      }
      Object.values(layers).forEach((l) => l.done());
    }

    // ---------- bolts (B button) ----------
    function updateShots(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const move = 12 * dt;
        s.x += s.dx * move; s.z += s.dz * move; s.left -= move;
        s.mesh.position.set(s.x, 0.75, s.z);
        if (Math.random() < 0.7) G.emit({ pos: s.mesh.position, count: 1, color: s.color, speed: 0.4, life: 0.3, size: 0.26 });
        let dead = s.left <= 0;
        const e = enemies.find((en) => en.alive && Math.hypot(en.x - s.x, en.z - s.z) < 0.6);
        const rock = rocks.find((r) => Math.hypot(r.x - s.x, r.z - s.z) < 0.5);
        const c = at(Math.round(s.x), Math.round(s.z));
        if (e) { hurtEnemy(e, P.shot * D.effectiveness(s.element, e.element), { x: s.dx, z: s.dz }); dead = true; }
        else if (boss && boss.alive && bossDistance(s.x, s.z) < 0.05) {
          hurtBoss(P.shot * D.effectiveness(s.element, boss.element) * (boss.state === 'tired' ? 2 : 1) * (boss.def.toughHide ? 0.5 : 1), false);
          dead = true;
        } else if (rock) { breakRock(rock); dead = true; }
        else if (!isArena && !D.WALKABLE.includes(c) && c !== '~' && c !== 'L') dead = true;
        else if (isArena && (s.z > F.z1 + 0.5 || s.x < F.x0 - 0.5 || s.x > F.x1 + 0.5)) dead = true;
        else if (npcs.some((n) => Math.hypot(n.def.x - s.x, n.def.y - s.z) < 0.45)) dead = true;
        if (dead) {
          G.emit({ pos: s.mesh.position, count: 8, colors: [s.color, 0xffffff], speed: 2, life: 0.3, size: 0.26 });
          group.remove(s.mesh);
          s.mesh.geometry.dispose();
          shots.splice(i, 1);
        }
      }
    }

    // ---------- drakelings ----------
    function spawnEnemies() {
      for (let y = 0; y < world.H; y++) for (let x = 0; x < world.W; x++) {
        if (at(x, y) !== ',' || (x * 31 + y * 17) % 5 !== 0) continue;
        const nl = nearestLair(x, y);
        const element = nl.lair.id === 'demon' ? 'fire' : nl.lair.id;
        const model = M.dragon(element, 0.3);
        group.add(model.group);
        const e = { alive: true, home: { x, z: y }, x, z: y, element, model, timer: 1 + Math.random(), pause: 0, goal: null, hp: 0, maxHp: 0, respawn: 0, rot: -Math.PI / 2 };
        e.circle = phys.add({ x, z: y, r: 0.42 });
        enemies.push(e);
      }
      enemies.forEach(resetEnemy);
    }
    function resetEnemy(e) {
      e.alive = true;
      e.maxHp = e.hp = 8 + 3 * Math.min(4, P.slain.length);
      e.x = e.home.x; e.z = e.home.z; e.goal = null; e.timer = 2.5 + Math.random() * 2;
      e.circle.off = false; e.circle.x = e.x; e.circle.z = e.z;
      e.model.group.visible = true;
      e.model.group.position.set(e.x, 0, e.z);
    }
    function hurtEnemy(e, dmg, push) {
      e.hp -= dmg;
      e.model.flash();
      e.timer = Math.max(e.timer, 0.35);
      if (push) { const p = moveCircle(e.circle, e.x + push.x * 0.5, e.z + push.z * 0.5, 0.42); e.x = p.x; e.z = p.z; }
      hooks.sfx('hit');
      G.floatText(p3(e.x, e.z, 1.3), String(Math.round(dmg)), dmg > P.sword * 1.2 ? 'crit' : 'dmg');
      if (e.hp <= 0) {
        e.alive = false;
        e.respawn = 50;
        e.circle.off = true;
        e.model.group.visible = false;
        G.emit({ pos: p3(e.x, e.z, 0.5), count: 22, colors: [D.ELEMENTS[e.element].color, 0xffffff], speed: 3, life: 0.6, size: 0.4 });
        hooks.sfx('poof');
        if (L.hp < P.hpMax && Math.random() < 0.45) dropHeart(e.x, e.z);
        hooks.onXp(1, p3(e.x, e.z, 1.4));
      }
    }
    function updateEnemies(dt, t) {
      enemies.forEach((e) => {
        if (!e.alive) {
          e.respawn -= dt;
          if (e.respawn <= 0 && Math.hypot(e.home.x - K.x, e.home.z - K.z) > 10) resetEnemy(e);
          return;
        }
        const dx = K.x - e.x, dz = K.z - e.z, dist = Math.hypot(dx, dz);
        e.model.group.visible = dist < 15;
        if (dist >= 15) return;
        e.model.update(dt, t);
        e.timer -= dt;
        e.pause -= dt;
        // Move: chase the knight when near home, otherwise wander about home.
        const homeK = Math.hypot(K.x - e.home.x, K.z - e.home.z);
        let gx = null, gz = null, sp = 0;
        if (dist < 5 && homeK < 5) {
          if (dist > 1.25) { gx = K.x; gz = K.z; sp = 2.1; }
        } else {
          if (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < 0.2) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
            e.goal = { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r, wait: 0.6 + Math.random() * 1.6 };
          }
          if (e.goal.wait > 0) e.goal.wait -= dt;
          else { gx = e.goal.x; gz = e.goal.z; sp = 1.1; }
        }
        if (gx != null && e.pause <= 0 && !L.locked) {
          const mx = gx - e.x, mz = gz - e.z, md = Math.hypot(mx, mz) || 1;
          let nx = e.x + (mx / md) * sp * dt, nz = e.z + (mz / md) * sp * dt;
          // Stay on a leash around home.
          const hx = nx - e.home.x, hz = nz - e.home.z, hd = Math.hypot(hx, hz);
          if (hd > 3.8) { nx = e.home.x + (hx / hd) * 3.8; nz = e.home.z + (hz / hd) * 3.8; }
          const p = moveCircle(e.circle, nx, nz, 0.42);
          e.x = p.x; e.z = p.z;
          e.circle.x = e.x; e.circle.z = e.z;
          if (dist > 4) e.want = angleOf(mx, mz);
        }
        if (dist <= 5 && homeK < 5) e.want = angleOf(dx, dz);
        if (e.want != null) e.rot += wrap(e.want - e.rot) * Math.min(1, dt * 8);
        e.model.group.rotation.y = e.rot;
        e.model.group.position.set(e.x, groundY(e.x, e.z) + 0.25, e.z);
        if (e.timer > 0 || L.locked || homeK > 6) return;
        const el = D.ELEMENTS[e.element].color;
        if (dist <= 1.7) {
          hazard({ shapes: [circle(K.x, K.z, 0.8)], warn: 0.55, dmg: 1, color: el, owner: e, sfx: 'bite' });
          G.tween(e.model.anim, { thrust: 1, mouth: 1 }, 450).then(() => G.tween(e.model.anim, { thrust: 0, mouth: 0 }, 250));
          e.timer = 1.9; e.pause = 0.7;
        } else if (dist <= 4.5 && Math.random() < 0.6) {
          const ux = dx / dist, uz = dz / dist, len = 3.6;
          hazard({ shapes: [box(e.x + ux * (len / 2 + 0.3), e.z + uz * (len / 2 + 0.3), len, 0.9, angleOf(ux, uz))], warn: 0.7, dmg: 1, color: el, owner: e, sfx: 'spit' });
          G.tween(e.model.anim, { mouth: 1 }, 600).then(() => G.tween(e.model.anim, { mouth: 0 }, 250));
          e.timer = 2.3; e.pause = 0.9;
        } else e.timer = 0.5;
      });
    }

    // ---------- the dragon ----------
    const randomPoint = () => [F.x0 + 0.6 + Math.random() * (F.x1 - F.x0 - 1.2), F.z0 + 0.6 + Math.random() * (F.z1 - F.z0 - 1.2)];
    const clampX = (x) => Math.max(F.x0 + 0.5, Math.min(F.x1 - 0.5, x));
    const clampZ = (z) => Math.max(F.z0 + 0.5, Math.min(F.z1 - 0.5, z));
    const fieldRect = (x0, z0, x1, z1) => rect(Math.max(F.x0, x0), Math.max(F.z0, z0), Math.min(F.x1, x1), Math.min(F.z1, z1));

    function setupBoss() {
      const def = D.DRAGONS[opts.bossId];
      const tier = def.id === 'demon' ? 0 : Math.min(3, P.slain.length);
      const model = M.dragon(def.id === 'demon' ? 'demon' : def.element, def.id === 'demon' ? 1.45 : def.id === 'earth' ? 1.2 : 1.12);
      model.group.position.set(5, 0.12, def.id === 'demon' ? 1.3 : 1.7);
      model.group.rotation.y = -Math.PI / 2;
      group.add(model.group);
      const maxHp = Math.round(def.hp * (1 + 0.3 * tier));
      boss = { def, id: def.id, element: def.element, x: 5, hp: maxHp, maxHp, model, state: 'intro', timer: 1.2, done: 0, last: null, speed: Math.max(0.74, 1 - 0.07 * tier), enraged: false, events: [], bonus: def.id === 'demon' ? 1 : 0, alive: true, phase: 0 };
      if (def.shifts) model.setElement(boss.element);
      L.boss = boss;
    }
    const later = (delay, fn) => boss.events.push({ at: L.time + delay, fn });
    const spd = () => boss.speed * (boss.enraged ? 0.86 : 1);
    const ecolor = () => D.ELEMENTS[boss.element].color;
    const dmg = () => 2 + boss.bonus;

    // A sweeping band across the field, `rowIndex` 0..7 from the dragon's side, with gaps cut out.
    function band(i, gaps) {
      const z0 = F.z0 + i, z1 = z0 + 1;
      const cuts = (gaps || []).slice().sort((a, b) => a[0] - b[0]);
      const out = [];
      let x = F.x0;
      cuts.forEach(([g0, g1]) => { if (g0 > x) out.push(rect(x, z0, Math.min(g0, F.x1), z1)); x = Math.max(x, g1); });
      if (x < F.x1) out.push(rect(x, z0, F.x1, z1));
      return out;
    }

    const ATTACKS = {
      claw() {
        const warn = 0.8 * spd();
        hazard({ shapes: [fieldRect(boss.x - 2.5, F.z0, boss.x + 2.5, F.z0 + 2)], warn, dmg: dmg(), color: 0xffffff, sfx: 'bite' });
        later(warn - 0.2, () => G.tween(boss.model.anim, { thrust: 1, lower: 0.75, mouth: 1 }, 180, G.ease.out).then(() => G.tween(boss.model.anim, { thrust: 0, lower: 0, mouth: 0 }, 420)));
        return warn + 0.7;
      },
      bolts() {
        for (let v = 0; v < 2; v++) later(v * 1.1, () => {
          const picks = [[K.x, K.z]];
          while (picks.length < 8) picks.push(randomPoint());
          picks.forEach(([x, z], i) => later(i * 0.09, () => hazard({ shapes: [circle(x, z, 0.75)], warn: 0.72 * spd(), dmg: dmg(), color: ecolor(), sfx: 'zap' })));
        });
        return 3.0;
      },
      cross() {
        for (let v = 0; v < 2; v++) later(v * 1.25, () => {
          hazard({ shapes: [rect(F.x0, K.z - 0.55, F.x1, K.z + 0.55), rect(K.x - 0.55, F.z0, K.x + 0.55, F.z1)], warn: 0.85 * spd(), dmg: dmg(), color: ecolor(), sfx: 'zap' });
        });
        return 3.0;
      },
      wave(startDelay, stagger, d) {
        const gx = F.x0 + 0.5 + Math.random() * (F.x1 - F.x0 - 2.6);
        for (let i = 0; i < 8; i++) later((startDelay || 0) + i * (stagger || 0.2), () => {
          hazard({ shapes: band(i, [[gx, gx + 2]]), warn: 0.75 * spd(), dmg: d || dmg(), color: ecolor(), sfx: 'splash' });
        });
        return 0.75 + 8 * (stagger || 0.2) + 0.5;
      },
      bubble() {
        for (let v = 0; v < 2; v++) later(v * 1.1, () => {
          hazard({ shapes: [circle(K.x, K.z, 1.5)], warn: 0.85 * spd(), dmg: dmg(), color: ecolor(), sfx: 'splash' });
        });
        return 2.9;
      },
      breath() {
        const cx = clampX(K.x);
        const warn = 0.85 * spd();
        hazard({ shapes: [rect(cx - 1.6, F.z0, cx - 0.5, F.z1), rect(cx + 0.5, F.z0, cx + 1.6, F.z1)], warn, dmg: dmg(), color: ecolor(), sfx: 'fire' });
        hazard({ shapes: [rect(cx - 0.5, F.z0, cx + 0.5, F.z1)], warn, dmg: dmg(), color: ecolor(), linger: 2.2, sfx: 'fire' });
        G.tween(boss.model.anim, { mouth: 1 }, warn * 1000).then(() => {
          const from = boss.model.mouthPos();
          G.emit({ pos: from, count: 50, colors: [ecolor(), 0xffe680], dir: new V3((cx - boss.x) * 0.12, -0.25, 1), spread: 0.18, speed: 12, life: 0.7, size: 0.6 });
          G.tween(boss.model.anim, { mouth: 0 }, 500);
        });
        return warn + 1.3;
      },
      fireballs() {
        for (let i = 0; i < 5; i++) later(i * 0.28, () => {
          const [x, z] = i === 4 ? [K.x, K.z] : randomPoint();
          hazard({ shapes: [circle(x, z, 1.05)], warn: 0.85 * spd(), dmg: dmg(), color: ecolor(), linger: 1.2, sfx: 'fire' });
        });
        return 2.8;
      },
      rockfall() {
        const picks = [[clampX(K.x), clampZ(K.z)]];
        while (picks.length < 6) picks.push(randomPoint());
        picks.forEach(([x, z], i) => later(i * 0.12, () => hazard({ shapes: [circle(x, z, 0.65)], warn: 0.85 * spd(), dmg: dmg(), color: ecolor(), rocks: true, sfx: 'rock' })));
        return 2.2;
      },
      shockwave() {
        G.tween(boss.model.anim, { rise: 0.9 }, 350, G.ease.out).then(() => G.tween(boss.model.anim, { rise: 0 }, 140, G.ease.in)).then(() => G.shake(0.4));
        for (let i = 0; i < 8; i++) later(0.5 + i * 0.17, () => {
          // A boulder shelters the strip just behind it.
          const z0 = F.z0 + i;
          const gaps = rocks.filter((r) => r.z > z0 - 1.4 && r.z < z0 + 0.9).map((r) => [r.x - 0.55, r.x + 0.55]);
          hazard({ shapes: band(i, gaps), warn: 0.75 * spd(), dmg: dmg(), color: ecolor(), sfx: 'rock' });
        });
        return 3.2;
      },
      storm() {
        const stripes = (parity) => {
          const out = [];
          for (let x = F.x0 + parity; x < F.x1; x += 2) out.push(rect(x, F.z0, Math.min(F.x1, x + 1), F.z1));
          return out;
        };
        [[0, 1.05, 0], [1.25, 0.85, 1], [2.3, 0.75, 0]].forEach(([when, warn, parity]) => later(when, () => hazard({ shapes: stripes(parity), warn, dmg: 3, color: ecolor(), sfx: 'thunder' })));
        return 3.6;
      },
      tidal() {
        ATTACKS.wave(0, 0.15, 3); ATTACKS.wave(1.5, 0.15, 3); ATTACKS.wave(3.0, 0.13, 3);
        return 5.2;
      },
      inferno() {
        const grid = (parity) => {
          const out = [];
          for (let z = F.z0 + 0.5; z < F.z1; z += 1) for (let x = F.x0 + 0.5; x < F.x1; x += 1) {
            if ((Math.round(x - 0.5) + Math.round(z - 0.5)) % 2 === parity) out.push(circle(x, z, 0.62));
          }
          return out;
        };
        later(0, () => hazard({ shapes: grid(0), warn: 1.15, dmg: 3, color: ecolor(), linger: 0.9, sfx: 'fire' }));
        later(1.7, () => hazard({ shapes: grid(1), warn: 0.95, dmg: 3, color: ecolor(), linger: 0.9, sfx: 'fire' }));
        return 4.0;
      },
      quake() {
        const safe = [circle(clampX(K.x + (Math.random() - 0.5) * 4), clampZ(K.z + (Math.random() - 0.5) * 4), 0.85)];
        while (safe.length < 3) {
          const [x, z] = randomPoint();
          if (safe.every((s) => Math.hypot(s.x - x, s.z - z) > 2.2)) safe.push(circle(x, z, 0.85));
        }
        rocks.slice().forEach((r) => { if (safe.some((s) => inside(s, r.x, r.z))) breakRock(r); });
        hazard({ shapes: safe, warn: 1.9, safe: true, dmg: 0, color: 0x3dff7a });
        hazard({ shapes: [rect(F.x0, F.z0, F.x1, F.z1)], except: safe, warn: 1.9, dmg: 4, color: ecolor(), shatter: true, sfx: 'thunder', onFire: () => G.shake(0.8) });
        return 3.0;
      },
      cataclysm() {
        const d = ATTACKS[D.ELEMENT_BIG[boss.element]]();
        later(d * 0.55, () => ATTACKS.cross());
        return d + 1.0;
      },
    };

    function pickAttack() {
      const pool = boss.def.attacks;
      let id;
      do { id = pool[rand(pool.length)]; } while (id === boss.last && pool.length > 1);
      // Standing under the dragon's chin invites a swipe.
      if (K.z <= F.z0 + 2 && boss.last !== 'claw' && Math.random() < 0.65) id = 'claw';
      boss.last = id;
      if (id === 'element') id = D.ELEMENT_ATTACKS[boss.element][0];
      if (id === 'element2') id = D.ELEMENT_ATTACKS[boss.element][1];
      return id;
    }

    function hurtBoss(amount, melee) {
      if (!boss || boss.state === 'dead' || boss.state === 'intro') return;
      amount = Math.max(1, Math.round(amount));
      boss.hp = Math.max(0, boss.hp - amount);
      boss.model.flash();
      hooks.sfx(melee ? 'hit' : 'plink');
      const tired = boss.state === 'tired';
      G.floatText(boss.model.headPos().add(new V3((Math.random() - 0.5) * 1.5, 0.6, 0)), String(amount) + (tired ? '!' : ''), tired || amount >= P.sword * 1.4 ? 'crit' : 'dmg');
      G.emit({ pos: boss.model.chestPos(), count: melee ? 12 : 5, colors: [ecolor(), 0xffffff], speed: 3, life: 0.4, size: 0.35 });
      hooks.onBossHp();
      if (boss.hp <= 0) return killBoss();
      if (!boss.enraged && boss.hp <= boss.maxHp * 0.4) {
        boss.enraged = true;
        hooks.onBanner(boss.def.name + ' is enraged!', true);
        hooks.sfx('roar');
      }
      if (boss.def.shifts) {
        const phase = Math.min(3, Math.floor((1 - boss.hp / boss.maxHp) * 4));
        if (phase !== boss.phase) {
          boss.phase = phase;
          boss.element = D.ELEMENT_ORDER[phase];
          boss.model.setElement(boss.element);
          G.flash(D.ELEMENTS[boss.element].css, 500);
          G.emit({ pos: boss.model.chestPos(), count: 60, colors: [ecolor(), 0xffffff], speed: 6, life: 0.9, size: 0.5 });
          hooks.onBanner('Malgrath turns to ' + D.ELEMENTS[boss.element].name.toUpperCase() + '!', true);
          hooks.sfx('roar');
          hooks.onBossHp();
        }
      }
    }

    function killBoss() {
      boss.state = 'dead';
      boss.alive = false;
      boss.events.length = 0;
      hazards.length = 0;
      L.over = true;
      K.invuln = 99;
      hooks.sfx('roar');
      G.shake(0.7);
      G.tween(boss.model.anim, { dead: 1, mouth: 1, lower: 0.4 }, 1800, G.ease.in);
      let n = 0;
      const timer = setInterval(() => {
        G.emit({ pos: boss.model.chestPos().add(new V3((Math.random() - 0.5) * 3, Math.random() * 2, 0)), count: 18, colors: [ecolor(), 0xffffff, 0xffe680], speed: 4, life: 0.8, size: 0.5 });
        hooks.sfx('boom');
        if (++n >= 7) clearInterval(timer);
      }, 260);
      setTimeout(() => hooks.onBossDefeated(), 2900);
    }

    function updateBoss(dt, t) {
      const b = boss;
      b.model.update(dt, t);
      b.model.group.position.x += (b.x - b.model.group.position.x) * Math.min(1, dt * 5);
      if (b.state === 'dead' || L.locked) return;
      for (let i = b.events.length - 1; i >= 0; i--) if (b.events[i].at <= L.time) { const e = b.events.splice(i, 1)[0]; e.fn(); }
      b.timer -= dt;
      if (b.state === 'tired' && Math.random() < dt * 8) G.emit({ pos: b.model.headPos().add(new V3(0, 0.9, 0)), count: 1, color: 0xfff27a, speed: 1, life: 0.6, size: 0.3 });
      if (b.timer > 0) return;
      if (b.state === 'intro' || b.state === 'attack') {
        b.state = 'idle';
        b.timer = 0.9 * spd();
        if (Math.random() < b.def.roams) b.x = 3 + rand(5);
      } else if (b.state === 'idle') {
        if (b.done >= 3) {
          b.state = 'roar';
          b.timer = 1.2;
          hooks.onBanner(b.def.shifts ? 'CATACLYSM!' : b.def.bigName + '!', true);
          hooks.sfx('roar');
          G.shake(0.5);
          G.tween(b.model.anim, { rise: 0.7, mouth: 1, flap: 2.5 }, 500, G.ease.out);
          G.emit({ pos: b.model.chestPos(), count: 40, colors: [ecolor(), 0xffffff], speed: 5, life: 0.9, size: 0.45 });
        } else {
          b.state = 'attack';
          b.done += 1;
          b.timer = ATTACKS[pickAttack()]();
        }
      } else if (b.state === 'roar') {
        b.state = 'big';
        b.timer = ATTACKS[b.def.big]();
        G.tween(b.model.anim, { rise: 0, mouth: 0, flap: 1 }, 600);
      } else if (b.state === 'big') {
        b.state = 'tired';
        b.timer = 3.6;
        b.done = 0;
        G.tween(b.model.anim, { lower: 1 }, 400);
        hooks.onBanner(b.def.name + ' is exhausted. Strike now!', false);
        for (let tries = 0; tries < 20; tries++) {
          const [x, z] = randomPoint();
          if (Math.hypot(x - K.x, z - K.z) > 1.5 && !rocks.some((r) => Math.hypot(r.x - x, r.z - z) < 0.9)) { dropHeart(x, z); break; }
        }
      } else if (b.state === 'tired') {
        b.state = 'idle';
        b.timer = 0.6;
        G.tween(b.model.anim, { lower: 0 }, 400);
      }
    }

    if (isArena) setupBoss();
    else spawnEnemies();

    // ---------- ambience ----------
    function ambience(dt) {
      if (theme === 'world') return;
      if (Math.random() > dt * 14) return;
      const pos = new V3(Math.random() * 11, 0, Math.random() * 13);
      if (theme === 'fire') G.emit({ pos, count: 1, colors: [0xff7a33, 0xffd23f], dir: new V3(0, 1, 0), speed: 1.6, life: 2, size: 0.18, spread: 0.4 });
      if (theme === 'thunder') G.emit({ pos: pos.setY(7), count: 1, color: 0xbfd4ff, dir: new V3(-0.2, -1, 0), speed: 12, life: 0.6, size: 0.14, spread: 0.02 });
      if (theme === 'water') G.emit({ pos, count: 1, color: 0xd6fbff, dir: new V3(0, 1, 0), speed: 0.9, life: 2.2, size: 0.2, spread: 0.3 });
      if (theme === 'earth') G.emit({ pos: pos.setY(0.4), count: 1, color: 0xf0d3a0, dir: new V3(1, 0.1, 0), speed: 1.2, life: 2, size: 0.22, spread: 0.3 });
      if (theme === 'demon') G.emit({ pos, count: 1, colors: [boss ? ecolor() : 0xd21f45, 0xd21f45], dir: new V3(0, 1, 0), speed: 1.4, life: 2.2, size: 0.2, spread: 0.5 });
    }

    // ---------- per-frame ----------
    const camTarget = new V3(K.x, 0, K.z);
    L.stage = {
      group,
      bg: sky[1],
      fog: isArena ? null : [sky[1], 26, 55],
      update(dt, t) {
        L.time += L.locked ? 0 : dt;
        K.cdA -= dt; K.cdB -= dt; K.cdC -= dt; K.lock -= dt; K.invuln -= dt; K.blink -= dt;
        if (K.buffer) { K.buffer.t -= dt; if (K.buffer.t <= 0) K.buffer = null; }
        if (!L.over) {
          moveKnight(dt);
          if (!L.locked) { runBuffer(); checkTouches(); }
        }
        kModel.group.rotation.y = K.rot;
        kModel.group.position.set(K.x, isArena ? 0 : groundY(K.x, K.z), K.z);
        kModel.anim.walk += (K.speed - kModel.anim.walk) * Math.min(1, dt * 14);
        kModel.group.visible = L.over || K.blink <= 0 || Math.floor(t * 18) % 2 === 0;
        kModel.update(dt, t);

        npcs.forEach((n) => {
          const near = Math.abs(n.def.x - K.x) + Math.abs(n.def.y - K.z) < 16;
          n.model.group.visible = near;
          if (near) n.model.update(dt, t);
        });
        updaters.forEach((u) => u.update(dt, t));
        world.update(dt, t);
        pickups.forEach((p) => { p.mesh.position.y = 0.6 + Math.sin(t * 4) * 0.08; p.mesh.rotation.y = t * 2.5; });
        Object.values(lairModels).forEach((lm) => lm.crystals.forEach((c, i) => { c.rotation.y = t * 1.5 + i; c.position.y += Math.sin(t * 2 + i) * 0.0015; }));
        if (!L.locked) { updateShots(dt); updateEnemies(dt, t); }
        if (boss) updateBoss(dt, t);
        if (!L.locked || hazards.length) updateHazards(L.locked ? 0 : dt);
        ambience(dt);
      },
      frame(aspect, t, dt) {
        const cam = G.cam;
        if (isArena) {
          const vf = 44;
          const tv = Math.tan((vf / 2) * Math.PI / 180);
          const dist = Math.max(6.2 / tv, 6.3 / (tv * aspect));
          cam.fov = vf;
          cam.target.set(5, 0.4, 6.4);
          cam.pos.set(5, 0.4 + dist * 0.78, 6.4 + dist * 0.62);
          camTarget.set(5, 0, 6.5);
        } else {
          camTarget.x += (K.x - camTarget.x) * Math.min(1, dt * 6);
          camTarget.z += (K.z - camTarget.z) * Math.min(1, dt * 6);
          const tall = aspect < 1;
          cam.fov = tall ? 50 : 42;
          cam.target.set(camTarget.x, 0.5, camTarget.z - 0.3);
          cam.pos.set(camTarget.x, tall ? 13.5 : 11, camTarget.z + (tall ? 9.5 : 8.2));
        }
        sun.position.copy(camTarget).add(SUN_OFFSET);
        sun.target.position.copy(camTarget);
      },
    };

    L.refreshWorld = function () {
      if (gate) gate.refresh(P.slain);
      Object.keys(lairModels).forEach((id) => { if (P.slain.includes(id)) lairModels[id].setSlain(); });
    };
    L.heal = function () { L.hp = P.hpMax; hooks.onHud(); };
    L.knightModel = kModel;
    L.debug = { hazards, rocks, pickups, enemies, ATTACKS: isArena ? ATTACKS : null, world };
    L.knightWorldPos = () => p3(K.x, K.z, 1.5);
    return L;
  }

  window.Level = { create };
})();
