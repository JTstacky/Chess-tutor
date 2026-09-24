// A playable tile level: the overworld or a dragon's arena. Everything moves
// tile to tile. Dragons attack by marking floor tiles, which strike a moment later.
(function () {
  'use strict';
  const G = window.Gfx, M = window.Models, D = window.Data;
  const V3 = THREE.Vector3;

  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const angleOf = (d) => Math.atan2(-d.y, d.x);
  const STEP = 0.16;
  // Arena layout: a 9 x 8 field, with the dragon's ledge across the top.
  const FX0 = 1, FX1 = 9, FY0 = 4, FY1 = 11, BOSS_ROW = 3;

  const GROUND = {
    grass: [0x86d95a, 0x7bcf50], path: [0xead7a0, 0xe0cb90], sand: [0xf7e6ad, 0xf0dc9c], peak: [0xa8b0c4, 0x9da6bb],
    ash: [0x6b5a5e, 0x625257], canyon: [0xe0a366, 0xd69859], rockbase: [0x7d8a78, 0x758270],
  };
  const ARENA_GROUND = {
    thunder: [0x6f7696, 0x666d8c], water: [0x4f8f98, 0x47858e], fire: [0x4a3a3e, 0x423337], earth: [0x8f6f48, 0x866740], demon: [0x3d2c4c, 0x352543],
  };
  const SKIES = {
    world: [0x4aa8ff, 0xcfeeff], thunder: [0x2b3157, 0x7a84b0], water: [0x0f5d73, 0x8fe3df], fire: [0x3a0d0d, 0xff8a3d], earth: [0xd98e4a, 0xffe2a8], demon: [0x12060f, 0x7a1230],
  };
  const CHAR_GROUND = { '.': 'grass', '=': 'path', s: 'sand', p: 'peak', a: 'ash', c: 'canyon', T: 'grass', W: 'canyon' };

  function arenaRows() {
    const rows = [];
    for (let y = 0; y < 13; y++) {
      const inner = y === 0 || y === 12 ? 'BBBBBBBBB' : y <= BOSS_ROW ? 'XXXXXXXXX' : 'fffffffff';
      rows.push('B' + inner + 'B');
    }
    return rows;
  }

  function instanced(geo, mat, items, parent) {
    if (!items.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(it.x, it.y || 0, it.z);
      o.rotation.set(it.rx || 0, it.ry || 0, 0);
      o.scale.set(it.sx || 1, it.sy || 1, it.sz || it.sx || 1);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      if (it.color != null) im.setColorAt(i, c.setHex(it.color));
    });
    im.frustumCulled = false;
    parent.add(im);
    return im;
  }

  function create(opts) {
    const P = opts.player;
    const hooks = opts.hooks;
    const isArena = opts.kind === 'arena';
    const rows = isArena ? arenaRows() : D.WORLD;
    const H = rows.length, W = rows[0].length;
    const theme = isArena ? (opts.bossId === 'demon' ? 'demon' : D.DRAGONS[opts.bossId].element) : 'world';
    const group = new THREE.Group();
    const L = { locked: false, input: { dir: null, fresh: false }, time: 0, hp: P.hpMax, over: false };
    const key = (x, y) => x + ',' + y;
    const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W ? 'M' : rows[y][x]);
    const walkChar = (c) => D.WALKABLE.includes(c) || c === 'f';
    const rand = (n) => Math.floor(Math.random() * n);

    // ---------- lights and sky ----------
    const sky = SKIES[theme];
    group.add(G.sky(sky[0], sky[1]));
    group.add(new THREE.HemisphereLight(0xffffff, theme === 'demon' ? 0x3a1030 : 0x8899aa, theme === 'demon' ? 0.55 : 0.62));
    const sun = new THREE.DirectionalLight(theme === 'fire' || theme === 'demon' ? 0xffb38a : 0xffffff, 0.5);
    sun.position.set(4, 10, 6);
    group.add(sun);

    // ---------- terrain ----------
    function lairs() {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (D.LAIR_CHARS[at(x, y)]) out.push({ x, y, id: D.LAIR_CHARS[at(x, y)] });
      return out;
    }
    const lairList = isArena ? [] : lairs();
    function nearestLair(x, y) {
      let best = null, bd = 1e9;
      lairList.forEach((l) => { const d = Math.abs(l.x - x) + Math.abs(l.y - y); if (d < bd) { bd = d; best = l; } });
      return { lair: best, dist: bd };
    }
    function majority(x, y) {
      const n = {};
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const g = CHAR_GROUND[at(x + dx, y + dy)];
        if (g && g !== 'path' && at(x + dx, y + dy) !== 'T' && at(x + dx, y + dy) !== 'W') n[g] = (n[g] || 0) + 1;
      }
      const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
      return best || null;
    }
    function nearChar(x, y, chars, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (chars.includes(at(x + dx, y + dy))) return true;
      return false;
    }

    const ground = [], water = [], lava = [], trunks = [], leaves = [], peaks = [], caps = [], walls = [], stones = [], tufts = [], planks = [], spires = [];
    const groundType = [];
    for (let y = 0; y < H; y++) {
      groundType.push([]);
      for (let x = 0; x < W; x++) {
        const c = at(x, y);
        let g = CHAR_GROUND[c] || null;
        if (isArena) g = 'arena';
        else if (!g && c !== '~' && c !== 'L' && c !== '#') g = majority(x, y) || (c === 'M' ? 'rockbase' : 'grass');
        groundType[y].push(g);
        const shade = (x + y) % 2;
        if (c === '~' || c === '#') water.push({ x, y: -0.27, z: y });
        else if (c === 'L') lava.push({ x, y: -0.22, z: y });
        else {
          let col = isArena ? ARENA_GROUND[theme][shade] : GROUND[g][shade];
          if (c === 'B') col = new THREE.Color(col).multiplyScalar(0.6).getHex();
          if (c === 'X') col = new THREE.Color(col).multiplyScalar(0.82).getHex();
          ground.push({ x, y: -0.25, z: y, color: col });
        }
        const jitter = ((x * 73 + y * 131) % 17) / 17;
        if (c === 'T') {
          trunks.push({ x, y: 0.25, z: y });
          const green = [0x3fa34d, 0x4cb35a, 0x369447][(x * 7 + y * 3) % 3];
          leaves.push({ x, y: 0.85, z: y, sx: 0.55 + jitter * 0.1, color: green }, { x: x + 0.05, y: 1.4, z: y, sx: 0.36, color: green });
        } else if (c === 'M') {
          const volcanic = nearChar(x, y, 'aL', 2);
          const sy = 0.9 + jitter * 0.7;
          peaks.push({ x, y: 0.95 * sy, z: y, sy, ry: jitter * 3, color: volcanic ? 0x54434a : nearChar(x, y, 'p', 2) ? 0x7f89a6 : 0x8f9a8a });
          if (!volcanic) caps.push({ x, y: 1.9 * sy - 0.27, z: y, ry: jitter * 3 });
        } else if (c === 'W') {
          const sy = 1.3 + jitter * 0.9;
          walls.push({ x, y: sy / 2, z: y, sy, color: [0xc07f45, 0xb5763d, 0xcb8a4f][(x + y * 2) % 3] });
        } else if (c === 'R') {
          stones.push({ x, y: 0.32, z: y, sx: 0.45, ry: jitter * 6, rx: jitter * 3, color: 0x8d8d99 });
        } else if (c === ',') {
          const dry = g !== 'grass';
          for (let i = 0; i < 4; i++) tufts.push({ x: x - 0.25 + (i % 2) * 0.5 + jitter * 0.1, y: 0.22, z: y - 0.25 + Math.floor(i / 2) * 0.5, color: dry ? 0xb8a94a : [0x2f9142, 0x38a04c][i % 2] });
        } else if (c === '#') {
          planks.push({ x, y: 0.0, z: y });
        } else if (c === 'B') {
          const sy = 0.8 + jitter * 1.1;
          spires.push({ x, y: 0.8 * sy, z: y, sy, ry: jitter * 4, color: new THREE.Color(ARENA_GROUND[theme][0]).multiplyScalar(0.55).getHex() });
        }
      }
    }
    const whiteToon = () => G.toon(0xffffff);
    instanced(new THREE.BoxGeometry(1, 0.5, 1), whiteToon(), ground, group);
    const waterMesh = instanced(new THREE.BoxGeometry(1, 0.3, 1), G.toon(0x4db8ff, { transparent: true, opacity: 0.92 }), water, group);
    const lavaMat = G.glow(0xff6a1a);
    instanced(new THREE.BoxGeometry(1, 0.3, 1), lavaMat, lava, group);
    instanced(new THREE.CylinderGeometry(0.12, 0.17, 0.5, 6), G.toon(0x8a5a2b), trunks, group);
    instanced(new THREE.SphereGeometry(1, 10, 8), whiteToon(), leaves, group);
    instanced(new THREE.ConeGeometry(0.78, 1.9, 6), whiteToon(), peaks, group);
    instanced(new THREE.ConeGeometry(0.3, 0.6, 6), G.toon(0xffffff), caps, group);
    instanced(new THREE.BoxGeometry(1, 1, 1), whiteToon(), walls, group);
    instanced(new THREE.DodecahedronGeometry(1), whiteToon(), stones, group);
    instanced(new THREE.ConeGeometry(0.13, 0.5, 5), whiteToon(), tufts, group);
    instanced(new THREE.BoxGeometry(0.96, 0.12, 0.9), G.toon(0xa9713d), planks, group);
    instanced(new THREE.ConeGeometry(0.62, 1.6, 5), whiteToon(), spires, group);

    // ---------- props, people and places ----------
    const updaters = [];
    const npcs = new Map();
    const chests = new Map();
    let gate = null;
    const lairModels = {};
    if (!isArena) {
      const seenHouse = new Set();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = at(x, y);
        if (c === 'H' && !seenHouse.has(key(x, y))) {
          [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => seenHouse.add(key(x + dx, y + dy)));
          const h = M.house(x < 19 ? 0xd9534f : 0x3f8fd1);
          h.position.set(x + 0.5, 0, y + 0.5);
          group.add(h);
        } else if (c === 'G') {
          const castle = M.castle(false);
          castle.position.set(x, 0, y - 1.5);
          group.add(castle);
        } else if (c === 'S') {
          const s = M.sign();
          s.position.set(x, 0, y);
          group.add(s);
        } else if (c === '*') {
          const def = D.CHESTS[key(x, y)];
          const ch = M.chest(P.chests.includes(def.id));
          ch.group.position.set(x, 0, y);
          group.add(ch.group);
          chests.set(key(x, y), { def, model: ch });
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
        }
      }
      D.NPCS.forEach((n) => {
        const m = M.person(n.look);
        m.group.position.set(n.x, 0, n.y);
        m.group.rotation.y = -Math.PI / 2;
        group.add(m.group);
        npcs.set(key(n.x, n.y), { def: n, model: m });
      });
    }

    // ---------- the knight ----------
    const start = opts.start || (isArena ? { x: 5, y: 9, dir: 'up' } : D.START);
    const kModel = M.knight();
    group.add(kModel.group);
    const K = { tx: start.x, ty: start.y, x: start.x, z: start.y, dir: start.dir || 'down', moving: false, prog: 0, fx: 0, fz: 0, invuln: 0, blink: 0, cdA: 0, cdB: 0, cdC: 0, lock: 0, rolling: false, buffer: null, rot: angleOf(DIRS[start.dir || 'down']) };
    L.knight = K;
    kModel.group.position.set(K.x, 0, K.z);
    kModel.group.rotation.y = K.rot;
    function refreshGlow() { kModel.setGlow(P.active ? D.ELEMENTS[P.active].color : null); }
    refreshGlow();
    L.refreshGlow = refreshGlow;

    // ---------- dynamic things ----------
    const rocks = new Map();
    const enemies = [];
    const hazards = [];
    const shots = [];
    const pickups = [];
    let boss = null;

    const markerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });
    const MAXMARK = 160;
    const markers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2), markerMat, MAXMARK);
    markers.setColorAt(0, new THREE.Color(1, 0, 0));
    markers.count = 0;
    markers.frustumCulled = false;
    markers.renderOrder = 2;
    group.add(markers);

    function enemyAt(x, y) { return enemies.find((e) => e.alive && e.tx === x && e.ty === y); }
    function blocked(x, y, forEnemy) {
      if (!walkChar(at(x, y))) return true;
      if (npcs.has(key(x, y)) || rocks.has(key(x, y))) return true;
      if (enemyAt(x, y)) return true;
      if (forEnemy && K.tx === x && K.ty === y) return true;
      return false;
    }
    const bossHitAt = (x, y) => boss && boss.state !== 'dead' && y === BOSS_ROW && Math.abs(x - boss.x) <= 1;
    const tilePos = (x, y, h) => new V3(x, h == null ? 0.5 : h, y);

    // ---------- knight actions ----------
    function face(dirName) { K.dir = dirName; }

    function interactTarget() {
      const d = DIRS[K.dir];
      const x = K.tx + d.x, y = K.ty + d.y;
      const c = at(x, y);
      if (npcs.has(key(x, y))) return () => hooks.onTalk(npcs.get(key(x, y)).def);
      if (c === 'S') return () => hooks.onSign(D.SIGNS[key(x, y)]);
      if (c === 'G') return () => hooks.onCastle();
      if (c === '*') {
        const ch = chests.get(key(x, y));
        return () => {
          if (P.chests.includes(ch.def.id)) return hooks.onSign('The chest is empty.');
          ch.model.open();
          G.emit({ pos: tilePos(x, y, 0.6), count: 24, colors: [0xffe680, 0xffffff], speed: 2.5, life: 0.8, size: 0.3, gravity: 3 });
          hooks.onChest(ch.def);
        };
      }
      if (D.LAIR_CHARS[c]) return () => hooks.onLair(D.LAIR_CHARS[c]);
      return null;
    }

    function swordDamage(targetEl, tired) {
      return P.sword * D.effectiveness(P.active, targetEl) * (tired ? 2 : 1);
    }

    function swing() {
      K.cdA = 0.46;
      K.lock = 0.22;
      const a = kModel.anim;
      G.stopTweens(a);
      a.armZ = 0.9;
      G.tween(a, { armZ: -2.0 }, 110, G.ease.out).then(() => G.tween(a, { armZ: -0.35 }, 180));
      hooks.sfx('swing');
      const d = DIRS[K.dir];
      const px = d.y, py = d.x;
      const fx = K.tx + d.x, fy = K.ty + d.y;
      const tiles = [[fx, fy], [fx + px, fy + py], [fx - px, fy - py]];
      const color = P.active ? D.ELEMENTS[P.active].color : 0xffffff;
      setTimeout(() => {
        if (L.over) return;
        tiles.forEach(([x, y]) => G.emit({ pos: tilePos(x, y, 0.6), count: 5, colors: [color, 0xffffff], speed: 1.6, life: 0.25, size: 0.34, area: 0.5 }));
        let hitBoss = false;
        tiles.forEach(([x, y]) => {
          const e = enemyAt(x, y);
          if (e) hurtEnemy(e, swordDamage(e.element, false));
          if (bossHitAt(x, y)) hitBoss = true;
        });
        if (rocks.has(key(fx, fy))) breakRock(fx, fy);
        if (hitBoss) hurtBoss(swordDamage(boss.element, boss.state === 'tired'), true);
      }, 90);
    }

    function shoot() {
      K.cdB = 0.5;
      K.lock = 0.12;
      hooks.sfx('shoot');
      const a = kModel.anim;
      G.stopTweens(a);
      a.armZ = -1.5;
      G.tween(a, { armZ: -0.35 }, 260);
      const d = DIRS[K.dir];
      const color = P.active ? D.ELEMENTS[P.active].color : 0xcfe8ff;
      const mesh = M.ball(0.17, G.glow(color), K.tx, 0.6, K.ty);
      group.add(mesh);
      shots.push({ mesh, x: K.tx, y: K.ty, dx: d.x, dy: d.y, left: 9, tileX: K.tx, tileY: K.ty, color, element: P.active });
    }

    function dodge() {
      K.cdC = 0.75;
      const dirName = L.input.dir || K.dir;
      face(dirName);
      const d = DIRS[dirName];
      let n = 0;
      while (n < 2 && !blocked(K.tx + d.x * (n + 1), K.ty + d.y * (n + 1))) n += 1;
      K.invuln = Math.max(K.invuln, 0.42);
      K.rolling = true;
      K.lock = 0.24;
      K.rot = angleOf(d);
      kModel.group.rotation.y = K.rot;
      hooks.sfx('dodge');
      const a = kModel.anim;
      a.spin = 0;
      G.tween(a, { spin: -Math.PI * 2 }, 230, G.ease.linear).then(() => { a.spin = 0; K.rolling = false; });
      G.emit({ pos: tilePos(K.tx, K.ty, 0.15), count: 8, color: 0xffffff, speed: 1.2, life: 0.4, size: 0.3 });
      if (n > 0) {
        K.fx = K.tx; K.fz = K.ty;
        K.tx += d.x * n; K.ty += d.y * n;
        K.moving = true; K.prog = 0; K.stepTime = 0.2;
      }
    }

    L.press = function (btn) {
      if (L.locked || L.over) return;
      K.buffer = { btn, t: 0.25 };
    };

    function runBuffer() {
      const b = K.buffer;
      if (!b || K.moving || K.lock > 0) return;
      K.buffer = null;
      if (b.btn === 'A') {
        const act = interactTarget();
        if (act) { act(); return; }
        if (K.cdA <= 0) swing();
      } else if (b.btn === 'B' && K.cdB <= 0) shoot();
      else if (b.btn === 'C' && K.cdC <= 0) dodge();
    }

    function tryStep(dirName) {
      const fresh = L.input.fresh;
      L.input.fresh = false;
      face(dirName);
      const d = DIRS[dirName];
      const x = K.tx + d.x, y = K.ty + d.y;
      if (blocked(x, y)) {
        if (fresh && D.LAIR_CHARS[at(x, y)]) hooks.onLair(D.LAIR_CHARS[at(x, y)]);
        return;
      }
      K.fx = K.tx; K.fz = K.ty;
      K.tx = x; K.ty = y;
      K.moving = true; K.prog = 0; K.stepTime = STEP;
    }

    let region = null;
    function arrive() {
      K.moving = false;
      K.x = K.tx; K.z = K.ty;
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (p.x === K.tx && p.y === K.ty) {
          group.remove(p.mesh);
          pickups.splice(i, 1);
          L.hp = Math.min(P.hpMax, L.hp + 2);
          hooks.sfx('heart');
          G.floatText(tilePos(K.tx, K.ty, 1.4), '+1 ♥', 'heal');
          hooks.onHud();
        }
      }
      if (!isArena) {
        if (at(K.tx, K.ty) === ',') G.emit({ pos: tilePos(K.tx, K.ty, 0.3), count: 4, color: 0x6fd36f, speed: 1.4, life: 0.4, size: 0.2, gravity: 3 });
        const nl = nearestLair(K.tx, K.ty);
        let name = 'Valemoor Fields';
        if (nl.dist <= 9) name = nl.lair.id === 'demon' ? 'The Ashen Gate' : D.DRAGONS[nl.lair.id].lair;
        if (name !== region) { region = name; hooks.onBanner(name); }
      }
    }

    function hurtKnight(dmg, color) {
      if (K.invuln > 0 || L.locked || L.over) return;
      L.hp = Math.max(0, L.hp - dmg);
      K.invuln = 1.1;
      K.blink = 1.1;
      G.shake(0.35);
      G.flash('rgba(255,40,40,0.55)', 300);
      hooks.sfx('hurt');
      G.floatText(tilePos(K.tx, K.ty, 1.5), '-' + (dmg / 2) + ' ♥', 'hurt');
      G.emit({ pos: tilePos(K.tx, K.ty, 0.7), count: 14, colors: [color || 0xff5555, 0xffffff], speed: 3, life: 0.5, size: 0.3 });
      hooks.onHud();
      if (L.hp <= 0) {
        L.over = true;
        kModel.group.visible = true;
        G.tween(kModel.anim, { dead: 1 }, 700, G.ease.in);
        setTimeout(() => hooks.onDeath(), 1500);
      }
    }

    // ---------- rocks, hearts ----------
    function placeRock(x, y) {
      if (rocks.has(key(x, y)) || (K.tx === x && K.ty === y)) return;
      if (rocks.size >= 12) breakRock(...rocks.keys().next().value.split(',').map(Number));
      const m = M.boulder();
      m.position.set(x, 0, y);
      group.add(m);
      rocks.set(key(x, y), m);
    }
    function breakRock(x, y) {
      const m = rocks.get(key(x, y));
      if (!m) return;
      group.remove(m);
      rocks.delete(key(x, y));
      hooks.sfx('rock');
      G.emit({ pos: tilePos(x, y, 0.4), count: 12, colors: [0x8a7a66, 0xb8a68e], speed: 3, life: 0.5, size: 0.32, gravity: 8 });
    }
    function dropHeart(x, y) {
      if (pickups.some((p) => p.x === x && p.y === y)) return;
      const mesh = M.heart();
      mesh.position.set(x, 0.6, y);
      group.add(mesh);
      pickups.push({ x, y, mesh });
    }

    // ---------- hazards ----------
    // { tiles, warn, dmg, color, linger, safe, rocks, owner, fx }
    function hazard(h) {
      h.t = 0; h.fired = false; h.linger = h.linger || 0;
      hazards.push(h);
      return h;
    }
    function fireHazard(h) {
      h.fired = true;
      if (h.safe) return;
      if (h.owner && !h.owner.alive) return;
      const many = h.tiles.length > 24;
      h.tiles.forEach(([x, y], i) => {
        if (!many || i % 2 === 0) G.emit({ pos: tilePos(x, y, 0.2), count: many ? 3 : 7, colors: [h.color, 0xffffff], speed: 3.2, dir: new V3(0, 1, 0), spread: 0.5, life: 0.45, size: 0.36, gravity: 4 });
        if (h.rocks) placeRock(x, y);
        if (rocks.has(key(x, y)) && h.shatter) breakRock(x, y);
      });
      if (h.onFire) h.onFire();
      hooks.sfx(h.sfx || 'boom');
      if (h.tiles.length > 6) G.shake(0.22);
      if (h.tiles.some(([x, y]) => x === K.tx && y === K.ty)) hurtKnight(h.dmg, h.color);
    }
    const color = new THREE.Color();
    const dummy = new THREE.Object3D();
    function updateHazards(dt) {
      let n = 0;
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.t += dt;
        if (!h.fired && h.t >= h.warn) fireHazard(h);
        if (h.fired && h.t >= h.warn + h.linger) { hazards.splice(i, 1); continue; }
        if (h.fired && !h.safe && h.tiles.some(([x, y]) => x === K.tx && y === K.ty)) hurtKnight(h.dmg, h.color);
        const k = Math.min(1, h.t / h.warn);
        const pulse = 0.5 + 0.5 * Math.sin(h.t * (8 + k * 22));
        if (h.safe) color.setHex(0x3dff7a).multiplyScalar(0.7 + pulse * 0.3);
        else if (h.fired) color.setHex(h.color).multiplyScalar(0.8 + pulse * 0.2);
        else color.setRGB(1, 0.12 + 0.75 * pulse * k, 0.12 + 0.5 * pulse * k);
        const s = h.fired || h.safe ? 1 : 0.3 + 0.7 * k;
        for (let j = 0; j < h.tiles.length && n < MAXMARK; j++) {
          dummy.position.set(h.tiles[j][0], 0.03, h.tiles[j][1]);
          dummy.scale.set(s, 1, s);
          dummy.updateMatrix();
          markers.setMatrixAt(n, dummy.matrix);
          markers.setColorAt(n, color);
          n += 1;
        }
      }
      markers.count = n;
      markers.instanceMatrix.needsUpdate = true;
      if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
    }

    // ---------- bolts (B button) ----------
    function updateShots(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const move = 12 * dt;
        s.x += s.dx * move; s.y += s.dy * move; s.left -= move;
        s.mesh.position.set(s.x, 0.6, s.y);
        if (Math.random() < 0.7) G.emit({ pos: s.mesh.position, count: 1, color: s.color, speed: 0.4, life: 0.3, size: 0.26 });
        const tx = Math.round(s.x), ty = Math.round(s.y);
        let dead = s.left <= 0;
        if (tx !== s.tileX || ty !== s.tileY) {
          s.tileX = tx; s.tileY = ty;
          const e = enemyAt(tx, ty);
          if (e) { hurtEnemy(e, P.shot * D.effectiveness(s.element, e.element)); dead = true; }
          else if (bossHitAt(tx, ty)) {
            hurtBoss(P.shot * D.effectiveness(s.element, boss.element) * (boss.state === 'tired' ? 2 : 1) * (boss.def.toughHide ? 0.5 : 1), false);
            dead = true;
          } else if (rocks.has(key(tx, ty))) { breakRock(tx, ty); dead = true; }
          else if (!walkChar(at(tx, ty)) && at(tx, ty) !== '~' && at(tx, ty) !== 'L') dead = true;
          else if (npcs.has(key(tx, ty))) dead = true;
        }
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
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (at(x, y) !== ',' || (x * 31 + y * 17) % 5 !== 0) continue;
        const nl = nearestLair(x, y);
        const element = nl.lair.id === 'demon' ? 'fire' : nl.lair.id;
        const model = M.dragon(element, 0.27);
        model.group.position.set(x, 0, y);
        group.add(model.group);
        enemies.push({ alive: true, home: { x, y }, tx: x, ty: y, x, z: y, fx: x, fz: y, moving: false, prog: 0, element, model, timer: 1 + Math.random(), hp: 0, maxHp: 0, respawn: 0, rot: -Math.PI / 2 });
      }
      enemies.forEach(resetEnemy);
    }
    function resetEnemy(e) {
      e.alive = true;
      e.maxHp = e.hp = 8 + 3 * Math.min(4, P.slain.length);
      e.tx = e.home.x; e.ty = e.home.y; e.x = e.tx; e.z = e.ty; e.moving = false;
      e.model.group.visible = true;
      e.model.group.position.set(e.x, 0, e.z);
    }
    function hurtEnemy(e, dmg) {
      e.hp -= dmg;
      e.model.flash();
      e.timer = Math.max(e.timer, 0.35);
      hooks.sfx('hit');
      G.floatText(tilePos(e.tx, e.ty, 1.2), String(Math.round(dmg)), dmg > P.sword * 1.2 ? 'crit' : 'dmg');
      if (e.hp <= 0) {
        e.alive = false;
        e.respawn = 50;
        e.model.group.visible = false;
        G.emit({ pos: tilePos(e.tx, e.ty, 0.5), count: 22, colors: [D.ELEMENTS[e.element].color, 0xffffff], speed: 3, life: 0.6, size: 0.4 });
        hooks.sfx('poof');
        if (L.hp < P.hpMax && Math.random() < 0.45) dropHeart(e.tx, e.ty);
        hooks.onXp(1, tilePos(e.tx, e.ty, 1.3));
      }
    }
    function updateEnemies(dt, t) {
      enemies.forEach((e) => {
        const far = Math.abs(e.home.x - K.tx) + Math.abs(e.home.y - K.ty);
        if (!e.alive) {
          e.respawn -= dt;
          if (e.respawn <= 0 && far > 9) resetEnemy(e);
          return;
        }
        const dist = Math.abs(e.tx - K.tx) + Math.abs(e.ty - K.ty);
        e.model.group.visible = dist < 11;
        if (dist >= 11) return;
        e.model.update(dt, t);
        if (e.moving) {
          e.prog += dt / 0.3;
          const k = Math.min(1, e.prog);
          e.x = e.fx + (e.tx - e.fx) * k; e.z = e.fz + (e.ty - e.fz) * k;
          e.model.group.position.set(e.x, Math.sin(k * Math.PI) * 0.25, e.z);
          if (k >= 1) e.moving = false;
          return;
        }
        let want = e.rot;
        if (dist <= 5) want = Math.atan2(-(K.ty - e.ty), K.tx - e.tx);
        e.rot += Math.atan2(Math.sin(want - e.rot), Math.cos(want - e.rot)) * Math.min(1, dt * 10);
        e.model.group.rotation.y = e.rot;
        e.timer -= dt;
        if (e.timer > 0 || L.locked) return;
        const el = D.ELEMENTS[e.element].color;
        const dx = K.tx - e.tx, dy = K.ty - e.ty;
        if (dist === 1) {
          hazard({ tiles: [[K.tx, K.ty]], warn: 0.55, dmg: 1, color: el, owner: e, sfx: 'bite' });
          G.tween(e.model.anim, { thrust: 1, mouth: 1 }, 450).then(() => G.tween(e.model.anim, { thrust: 0, mouth: 0 }, 250));
          e.timer = 1.9;
        } else if (dist <= 3 && (dx === 0 || dy === 0) && Math.random() < 0.6) {
          const sx = Math.sign(dx), sy = Math.sign(dy);
          const tiles = [];
          for (let i = 1; i <= 3; i++) { const x = e.tx + sx * i, y = e.ty + sy * i; if (!walkChar(at(x, y))) break; tiles.push([x, y]); }
          hazard({ tiles, warn: 0.7, dmg: 1, color: el, owner: e, sfx: 'spit' });
          G.tween(e.model.anim, { mouth: 1 }, 600).then(() => G.tween(e.model.anim, { mouth: 0 }, 250));
          e.timer = 2.3;
        } else {
          let step = null;
          const leashOk = (x, y) => Math.abs(x - e.home.x) + Math.abs(y - e.home.y) <= 4;
          if (dist <= 5) {
            const opts2 = Math.abs(dx) >= Math.abs(dy) ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
            step = opts2.find(([sx, sy]) => (sx || sy) && !blocked(e.tx + sx, e.ty + sy, true) && leashOk(e.tx + sx, e.ty + sy));
            e.timer = 0.5;
          } else {
            const d = Object.values(DIRS)[rand(4)];
            if (Math.random() < 0.5 && !blocked(e.tx + d.x, e.ty + d.y, true) && leashOk(e.tx + d.x, e.ty + d.y)) step = [d.x, d.y];
            e.timer = 0.8 + Math.random();
          }
          if (step) { e.fx = e.tx; e.fz = e.ty; e.tx += step[0]; e.ty += step[1]; e.moving = true; e.prog = 0; }
        }
      });
    }

    // ---------- the dragon ----------
    function fieldTiles(filter) {
      const out = [];
      for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) if (!filter || filter(x, y)) out.push([x, y]);
      return out;
    }
    const randomField = () => [FX0 + rand(9), FY0 + rand(8)];
    const clampX = (x) => Math.max(FX0, Math.min(FX1, x));

    function setupBoss() {
      const def = D.DRAGONS[opts.bossId];
      const tier = def.id === 'demon' ? 0 : Math.min(3, P.slain.length);
      const model = M.dragon(def.id === 'demon' ? 'demon' : def.element, def.id === 'demon' ? 1.45 : def.id === 'earth' ? 1.2 : 1.12);
      model.group.position.set(5, 0, 1.7);
      model.group.rotation.y = -Math.PI / 2;
      group.add(model.group);
      const maxHp = Math.round(def.hp * (1 + 0.3 * tier));
      boss = { def, id: def.id, element: def.element, x: 5, fx: 5, hp: maxHp, maxHp, model, state: 'intro', timer: 1.2, done: 0, last: null, speed: Math.max(0.74, 1 - 0.07 * tier), enraged: false, events: [], bonus: def.id === 'demon' ? 1 : 0, alive: true, phase: 0 };
      if (def.shifts) model.setElement(boss.element);
      L.boss = boss;
    }
    const later = (delay, fn) => boss.events.push({ at: L.time + delay, fn });
    const spd = () => boss.speed * (boss.enraged ? 0.86 : 1);
    const ecolor = () => D.ELEMENTS[boss.element].color;

    const ATTACKS = {
      claw() {
        const tiles = [];
        for (let y = FY0; y <= FY0 + 1; y++) for (let x = boss.x - 2; x <= boss.x + 2; x++) if (x >= FX0 && x <= FX1) tiles.push([x, y]);
        const warn = 0.8 * spd();
        hazard({ tiles, warn, dmg: 2 + boss.bonus, color: 0xffffff, sfx: 'bite' });
        later(warn - 0.2, () => G.tween(boss.model.anim, { thrust: 1, lower: 0.75, mouth: 1 }, 180, G.ease.out).then(() => G.tween(boss.model.anim, { thrust: 0, lower: 0, mouth: 0 }, 420)));
        return warn + 0.7;
      },
      bolts() {
        for (let v = 0; v < 2; v++) later(v * 1.1, () => {
          const picks = [[K.tx, K.ty]];
          while (picks.length < 8) picks.push(randomField());
          picks.forEach((tile, i) => later(i * 0.09, () => hazard({ tiles: [tile], warn: 0.72 * spd(), dmg: 2 + boss.bonus, color: ecolor(), sfx: 'zap' })));
        });
        return 3.0;
      },
      cross() {
        for (let v = 0; v < 2; v++) later(v * 1.25, () => {
          const tiles = fieldTiles((x, y) => x === K.tx || y === K.ty);
          hazard({ tiles, warn: 0.85 * spd(), dmg: 2 + boss.bonus, color: ecolor(), sfx: 'zap' });
        });
        return 3.0;
      },
      wave(startDelay, stagger, dmg) {
        const gap = FX0 + rand(8);
        for (let i = 0; i < 8; i++) later((startDelay || 0) + i * (stagger || 0.2), () => {
          hazard({ tiles: fieldTiles((x, y) => y === FY0 + i && x !== gap && x !== gap + 1), warn: 0.75 * spd(), dmg: dmg || 2 + boss.bonus, color: ecolor(), sfx: 'splash' });
        });
        return 0.75 + 8 * (stagger || 0.2) + 0.5;
      },
      bubble() {
        for (let v = 0; v < 2; v++) later(v * 1.1, () => {
          const cx = K.tx, cy = K.ty;
          hazard({ tiles: fieldTiles((x, y) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1), warn: 0.85 * spd(), dmg: 2 + boss.bonus, color: ecolor(), sfx: 'splash' });
        });
        return 2.9;
      },
      breath() {
        const cx = K.tx;
        const warn = 0.85 * spd();
        hazard({ tiles: fieldTiles((x) => Math.abs(x - cx) === 1), warn, dmg: 2 + boss.bonus, color: ecolor(), sfx: 'fire' });
        hazard({ tiles: fieldTiles((x) => x === cx), warn, dmg: 2 + boss.bonus, color: ecolor(), linger: 2.2, sfx: 'fire' });
        G.tween(boss.model.anim, { mouth: 1 }, warn * 1000).then(() => {
          const from = boss.model.mouthPos();
          G.emit({ pos: from, count: 50, colors: [ecolor(), 0xffe680], dir: new V3((cx - boss.x) * 0.12, -0.25, 1), spread: 0.18, speed: 12, life: 0.7, size: 0.6 });
          G.tween(boss.model.anim, { mouth: 0 }, 500);
        });
        return warn + 1.3;
      },
      fireballs() {
        for (let i = 0; i < 5; i++) later(i * 0.28, () => {
          const [cx, cy] = i === 4 ? [K.tx, K.ty] : randomField();
          hazard({ tiles: fieldTiles((x, y) => (x === cx || x === cx + 1) && (y === cy || y === cy + 1)), warn: 0.85 * spd(), dmg: 2 + boss.bonus, color: ecolor(), linger: 1.2, sfx: 'fire' });
        });
        return 2.8;
      },
      rockfall() {
        const picks = [[K.tx, K.ty]];
        while (picks.length < 6) picks.push(randomField());
        picks.forEach((tile, i) => later(i * 0.12, () => hazard({ tiles: [tile], warn: 0.85 * spd(), dmg: 2 + boss.bonus, color: ecolor(), rocks: true, sfx: 'rock' })));
        return 2.2;
      },
      shockwave() {
        G.tween(boss.model.anim, { rise: 0.9 }, 350, G.ease.out).then(() => G.tween(boss.model.anim, { rise: 0 }, 140, G.ease.in)).then(() => G.shake(0.4));
        for (let i = 0; i < 8; i++) later(0.5 + i * 0.17, () => {
          // A boulder shelters the tile just behind it.
          hazard({ tiles: fieldTiles((x, y) => y === FY0 + i && !rocks.has(key(x, y)) && !rocks.has(key(x, y - 1))), warn: 0.75 * spd(), dmg: 2 + boss.bonus, color: ecolor(), sfx: 'rock' });
        });
        return 3.2;
      },
      storm() {
        [[0, 1.05, 0], [1.25, 0.85, 1], [2.3, 0.75, 0]].forEach(([at2, warn, parity]) => later(at2, () => hazard({ tiles: fieldTiles((x) => x % 2 === parity), warn, dmg: 3, color: ecolor(), sfx: 'thunder' })));
        return 3.6;
      },
      tidal() {
        ATTACKS.wave(0, 0.15, 3); ATTACKS.wave(1.5, 0.15, 3); ATTACKS.wave(3.0, 0.13, 3);
        return 5.2;
      },
      inferno() {
        later(0, () => hazard({ tiles: fieldTiles((x, y) => (x + y) % 2 === 0), warn: 1.15, dmg: 3, color: ecolor(), linger: 0.9, sfx: 'fire' }));
        later(1.7, () => hazard({ tiles: fieldTiles((x, y) => (x + y) % 2 === 1), warn: 0.95, dmg: 3, color: ecolor(), linger: 0.9, sfx: 'fire' }));
        return 4.0;
      },
      quake() {
        const safe = [];
        const nearX = clampX(K.tx + rand(5) - 2), nearY = Math.max(FY0, Math.min(FY1, K.ty + rand(5) - 2));
        safe.push([nearX, nearY]);
        while (safe.length < 3) { const t = randomField(); if (!safe.some((s) => s[0] === t[0] && s[1] === t[1])) safe.push(t); }
        safe.forEach(([x, y]) => breakRock(x, y));
        const isSafe = (x, y) => safe.some((s) => s[0] === x && s[1] === y);
        hazard({ tiles: safe, warn: 1.9, safe: true, dmg: 0, color: 0x3dff7a });
        hazard({ tiles: fieldTiles((x, y) => !isSafe(x, y)), warn: 1.9, dmg: 4, color: ecolor(), shatter: true, sfx: 'thunder', onFire: () => G.shake(0.8) });
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
      if (K.ty <= FY0 + 1 && boss.last !== 'claw' && Math.random() < 0.65) id = 'claw';
      boss.last = id;
      if (id === 'element') id = D.ELEMENT_ATTACKS[boss.element][0];
      if (id === 'element2') id = D.ELEMENT_ATTACKS[boss.element][1];
      return id;
    }

    function hurtBoss(dmg, melee) {
      if (!boss || boss.state === 'dead' || boss.state === 'intro') return;
      dmg = Math.max(1, Math.round(dmg));
      boss.hp = Math.max(0, boss.hp - dmg);
      boss.model.flash();
      hooks.sfx(melee ? 'hit' : 'plink');
      const tired = boss.state === 'tired';
      G.floatText(boss.model.headPos().add(new V3((Math.random() - 0.5) * 1.5, 0.6, 0)), String(dmg) + (tired ? '!' : ''), tired || dmg >= P.sword * 1.4 ? 'crit' : 'dmg');
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
      const burst = setInterval(() => {
        G.emit({ pos: boss.model.chestPos().add(new V3((Math.random() - 0.5) * 3, Math.random() * 2, 0)), count: 18, colors: [ecolor(), 0xffffff, 0xffe680], speed: 4, life: 0.8, size: 0.5 });
        hooks.sfx('boom');
        if (++n >= 7) clearInterval(burst);
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
        const free = fieldTiles((x, y) => !rocks.has(key(x, y)) && !(x === K.tx && y === K.ty));
        const spot = free[rand(free.length)];
        dropHeart(spot[0], spot[1]);
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
      const pos = new V3(rand(11), 0, rand(13));
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
      fog: isArena ? null : [sky[1], 30, 60],
      update(dt, t) {
        L.time += L.locked ? 0 : dt;
        K.cdA -= dt; K.cdB -= dt; K.cdC -= dt; K.lock -= dt; K.invuln -= dt; K.blink -= dt;
        if (K.buffer) { K.buffer.t -= dt; if (K.buffer.t <= 0) K.buffer = null; }
        if (!L.over) {
          if (K.moving) {
            K.prog += dt / K.stepTime;
            const k = Math.min(1, K.prog);
            K.x = K.fx + (K.tx - K.fx) * k; K.z = K.fz + (K.ty - K.fz) * k;
            if (k >= 1) arrive();
          }
          if (!K.moving && !L.locked) {
            runBuffer();
            if (!K.moving && K.lock <= 0 && L.input.dir) tryStep(L.input.dir);
          }
        }
        const want = angleOf(DIRS[K.dir]);
        K.rot += Math.atan2(Math.sin(want - K.rot), Math.cos(want - K.rot)) * Math.min(1, dt * 22);
        kModel.group.rotation.y = K.rot;
        kModel.group.position.set(K.x, 0, K.z);
        kModel.anim.walk += ((K.moving && !K.rolling ? 1 : 0) - kModel.anim.walk) * Math.min(1, dt * 14);
        kModel.group.visible = L.over || K.blink <= 0 || Math.floor(t * 18) % 2 === 0;
        kModel.update(dt, t);

        npcs.forEach((n) => {
          const near = Math.abs(n.def.x - K.tx) + Math.abs(n.def.y - K.ty) < 12;
          n.model.group.visible = near;
          if (near) n.model.update(dt, t);
        });
        updaters.forEach((u) => u.update(dt, t));
        pickups.forEach((p) => { p.mesh.position.y = 0.6 + Math.sin(t * 4) * 0.08; p.mesh.rotation.y = t * 2.5; });
        Object.values(lairModels).forEach((lm) => lm.crystals.forEach((c, i) => { c.rotation.y = t * 1.5 + i; c.position.y += Math.sin(t * 2 + i) * 0.0015; }));
        if (waterMesh) waterMesh.position.y = Math.sin(t * 1.6) * 0.035;
        lavaMat.color.setRGB(1, 0.36 + Math.sin(t * 2.2) * 0.08, 0.1);
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
          const dist = Math.max(6.0 / tv, 6.3 / (tv * aspect));
          cam.fov = vf;
          cam.target.set(5, 0.4, 6.3);
          cam.pos.set(5, 0.4 + dist * 0.8, 6.3 + dist * 0.6);
        } else {
          camTarget.x += (K.x - camTarget.x) * Math.min(1, dt * 8);
          camTarget.z += (K.z - camTarget.z) * Math.min(1, dt * 8);
          const tall = aspect < 1;
          cam.fov = tall ? 46 : 40;
          cam.target.set(camTarget.x, 0.4, camTarget.z - 0.4);
          cam.pos.set(camTarget.x, tall ? 16 : 13.5, camTarget.z + (tall ? 9 : 7.6));
        }
      },
    };

    L.refreshWorld = function () {
      if (gate) gate.refresh(P.slain);
      Object.keys(lairModels).forEach((id) => { if (P.slain.includes(id)) lairModels[id].setSlain(); });
    };
    L.heal = function () { L.hp = P.hpMax; hooks.onHud(); };
    L.knightModel = kModel;
    L.debug = { hazards, rocks, pickups };
    L.knightWorldPos = () => tilePos(K.tx, K.ty, 1.4);
    if (!isArena) setTimeout(() => arrive(), 0);
    return L;
  }

  window.Level = { create };
})();
