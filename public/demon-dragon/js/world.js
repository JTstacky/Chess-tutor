// The ground under a level: a smooth terrain mesh shaped and coloured from the map
// characters, scattered 3D scenery, water and lava, and circle-vs-box collision.
// One map character is one world unit; cell (x, y) is centred on world (x, 0, y).
(function () {
  'use strict';
  const G = window.Gfx, M = window.Models, D = window.Data;

  const GROUND = {
    grass: 0x7fcf5a, tall: 0x5fb24a, forest: 0x4f9a45, path: 0xe6cc92, sand: 0xf2dc9b, peak: 0xa9b2c6,
    ash: 0x6e5c60, canyon: 0xd99a5e, wall: 0xb8763f, rock: 0x7d8a78, bed: 0x2f7fa8, lavabed: 0x5a2a1a,
  };
  const CHAR_GROUND = { '.': 'grass', ',': 'tall', '=': 'path', s: 'sand', p: 'peak', a: 'ash', c: 'canyon', T: 'forest', W: 'wall', '~': 'bed', '#': 'bed', L: 'lavabed' };
  const CHAR_HEIGHT = { '~': -0.8, '#': -0.8, L: -0.5, M: 0.45, W: 0.6, B: 0.5, X: 0.12, T: 0.04 };
  // Arena colours per theme: field, ledge, border.
  const ARENA = {
    thunder: { f: 0x6f7696, X: 0x575d7a, B: 0x3d4258, margin: 'M', rock: 0x6a7090, sky: [0x2b3157, 0x7a84b0] },
    water: { f: 0x4f8f98, X: 0x3f7680, B: 0x2c5960, margin: '~', rock: 0x4f7f88, sky: [0x0f5d73, 0x8fe3df] },
    fire: { f: 0x56423f, X: 0x47353a, B: 0x33262a, margin: 'L', rock: 0x4a3a3e, sky: [0x3a0d0d, 0xff8a3d] },
    earth: { f: 0x9a7a50, X: 0x856842, B: 0x6a5232, margin: 'W', rock: 0xb07a48, sky: [0xd98e4a, 0xffe2a8] },
    demon: { f: 0x45324f, X: 0x3a2944, B: 0x2a1d33, margin: 'L', rock: 0x30223a, sky: [0x12060f, 0x7a1230] },
  };

  // Small deterministic random numbers, so the same map always looks the same.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- collision ----------
  // Blocked map cells are unit boxes; props and creatures are circles.
  function collider(blockedCell) {
    const circles = [];
    function push(p, r) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        const cx = Math.round(p.x), cz = Math.round(p.z);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const bx = cx + dx, bz = cz + dz;
          if (!blockedCell(bx, bz)) continue;
          const qx = Math.max(bx - 0.5, Math.min(bx + 0.5, p.x));
          const qz = Math.max(bz - 0.5, Math.min(bz + 0.5, p.z));
          let ox = p.x - qx, oz = p.z - qz;
          const d = Math.hypot(ox, oz);
          if (d >= r) continue;
          if (d > 1e-5) { p.x += (ox / d) * (r - d); p.z += (oz / d) * (r - d); }
          else {
            // Centre inside the box: leave by the nearest side.
            ox = p.x - bx; oz = p.z - bz;
            if (Math.abs(ox) > Math.abs(oz)) p.x = bx + Math.sign(ox || 1) * (0.5 + r);
            else p.z = bz + Math.sign(oz || 1) * (0.5 + r);
          }
          moved = true;
        }
        for (let i = 0; i < circles.length; i++) {
          const c = circles[i];
          if (c.off || c === p.self) continue;
          const ox = p.x - c.x, oz = p.z - c.z;
          const d = Math.hypot(ox, oz), min = r + c.r;
          if (d >= min) continue;
          if (d > 1e-5) { p.x += (ox / d) * (min - d); p.z += (oz / d) * (min - d); }
          else p.x += min;
          moved = true;
        }
        if (!moved) break;
      }
      return p;
    }
    return { circles, push, add(c) { circles.push(c); return c; }, remove(c) { const i = circles.indexOf(c); if (i >= 0) circles.splice(i, 1); } };
  }

  // ---------- terrain ----------
  function terrain(o) {
    const { W, H, margin, charAt, colorAt, heightAt, rand } = o;
    const RES = 2; // vertices per unit
    const x0 = -0.5 - margin, z0 = -0.5 - margin;
    const NX = (W + margin * 2) * RES, NZ = (H + margin * 2) * RES;
    const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
    const col = new Float32Array((NX + 1) * (NZ + 1) * 3);
    const heights = new Float32Array((NX + 1) * (NZ + 1));
    const c = new THREE.Color(), acc = new THREE.Color();
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = x0 + i / RES, z = z0 + j / RES;
      // Average the cells whose square touches this vertex.
      const xs = [Math.round(x - 0.01), Math.round(x + 0.01)], zs = [Math.round(z - 0.01), Math.round(z + 0.01)];
      let h = 0, n = 0;
      acc.setRGB(0, 0, 0);
      const seen = new Set();
      for (const cz of zs) for (const cx of xs) {
        const k = cx + ',' + cz;
        if (seen.has(k)) continue;
        seen.add(k);
        h += heightAt(cx, cz);
        c.setHex(colorAt(cx, cz));
        acc.r += c.r; acc.g += c.g; acc.b += c.b;
        n += 1;
      }
      h /= n;
      const ch = charAt(Math.round(x), Math.round(z));
      if (h > 0.05 || h < -0.05) h += (rand() - 0.5) * 0.18;
      const shade = 0.94 + rand() * 0.1;
      const v = j * (NX + 1) + i;
      heights[v] = h;
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      col[v * 3] = (acc.r / n) * shade; col[v * 3 + 1] = (acc.g / n) * shade; col[v * 3 + 2] = (acc.b / n) * shade;
      if (ch === ',' && rand() < 0.5) col[v * 3 + 1] *= 0.94;
    }
    const idx = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, d = a + NX + 1, e = d + 1;
      if ((i + j) % 2) idx.push(a, d, b, b, d, e); else idx.push(a, d, e, a, e, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, G.toon(0xffffff, { vertexColors: true }));
    mesh.receiveShadow = true;
    // Ground height under any point, for feet and props.
    function groundY(x, z) {
      const fi = (x - x0) * RES, fj = (z - z0) * RES;
      const i = Math.max(0, Math.min(NX - 1, Math.floor(fi))), j = Math.max(0, Math.min(NZ - 1, Math.floor(fj)));
      const u = Math.min(1, Math.max(0, fi - i)), w = Math.min(1, Math.max(0, fj - j));
      const h00 = heights[j * (NX + 1) + i], h10 = heights[j * (NX + 1) + i + 1];
      const h01 = heights[(j + 1) * (NX + 1) + i], h11 = heights[(j + 1) * (NX + 1) + i + 1];
      return (h00 * (1 - u) + h10 * u) * (1 - w) + (h01 * (1 - u) + h11 * u) * w;
    }
    return { mesh, groundY };
  }

  // A rippled water texture, scrolled each frame.
  function waterTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#3aa9e8';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    const r = rng(7);
    for (let i = 0; i < 14; i++) {
      const x = r() * 128, y = r() * 128, w = 10 + r() * 18;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4, x + w, y); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Grass blades: three crossed quads, tapered.
  function bladeGeometry() {
    const g = new THREE.BufferGeometry();
    const p = [], c = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, dx = Math.cos(a) * 0.12, dz = Math.sin(a) * 0.12;
      p.push(-dx, 0, -dz, dx, 0, dz, 0, 0.42, 0);
      c.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 1, 1);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  }

  function build(o) {
    const { rows, group, kind, theme } = o;
    const isArena = kind === 'arena';
    const H = rows.length, W = rows[0].length;
    const A = isArena ? ARENA[theme] : null;
    const margin = isArena ? 9 : 8;
    const rand = rng(isArena ? 99 + theme.length : 1234);
    const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const at = (x, y) => (inMap(x, y) ? rows[y][x] : 'M');
    // Outside the map the edge repeats, so the world does not end in a cliff.
    const atR = (x, y) => {
      if (inMap(x, y)) return rows[y][x];
      if (isArena) {
        const d = Math.max(-x, x - (W - 1), -y, y - (H - 1));
        return d >= 2 ? A.margin : 'B';
      }
      return rows[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))];
    };
    const walkable = (c) => (isArena ? c === 'f' : D.WALKABLE.includes(c));
    const near = (x, y, chars, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (chars.includes(atR(x + dx, y + dy))) return true;
      return false;
    };
    function majority(x, y) {
      const n = {};
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const g = CHAR_GROUND[atR(x + dx, y + dy)];
        if (g && g !== 'path' && g !== 'forest' && g !== 'wall' && g !== 'bed' && g !== 'lavabed') n[g] = (n[g] || 0) + 1;
      }
      return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
    }
    function colorAt(x, y) {
      const c = atR(x, y);
      if (isArena) {
        if (c === 'f') return A.f;
        if (c === 'X') return A.X;
        if (c === 'L') return GROUND.lavabed;
        if (c === '~') return GROUND.bed;
        return A.B;
      }
      const g = CHAR_GROUND[c] || majority(x, y) || (c === 'M' ? 'rock' : 'grass');
      return GROUND[g];
    }
    function heightAt(x, y) {
      const c = atR(x, y);
      if (isArena && c === 'B') return 0.5;
      return CHAR_HEIGHT[c] || 0;
    }

    const T = terrain({ W, H, margin, charAt: atR, colorAt, heightAt, rand });
    group.add(T.mesh);

    // Water and lava planes sit under the ground and show where it dips.
    const updaters = [];
    // Each plane covers only the box around its own cells, so water and lava never overlap.
    const boxes = { water: null, lava: null };
    for (let y = -margin; y < H + margin; y++) for (let x = -margin; x < W + margin; x++) {
      const c = atR(x, y);
      const k = c === '~' || c === '#' ? 'water' : c === 'L' ? 'lava' : null;
      if (!k) continue;
      const b = boxes[k] || (boxes[k] = { x0: x, x1: x, z0: y, z1: y });
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, y); b.z1 = Math.max(b.z1, y);
    }
    const plane = (b) => {
      const w = b.x1 - b.x0 + 2, d = b.z1 - b.z0 + 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2));
      m.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
      return { m, w, d };
    };
    if (boxes.water) {
      const tex = waterTexture();
      const { m: water, w, d } = plane(boxes.water);
      tex.repeat.set(w / 3, d / 3);
      water.material = G.toon(0xffffff, { map: tex, transparent: true, opacity: 0.9 });
      water.position.y = -0.2;
      water.userData.noShadow = true;
      water.receiveShadow = true;
      group.add(water);
      updaters.push((dt, t) => { tex.offset.set(t * 0.02, t * 0.035); water.position.y = -0.2 + Math.sin(t * 1.4) * 0.025; });
    }
    if (boxes.lava) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
      const { m: lava } = plane(boxes.lava);
      lava.material = mat;
      lava.position.y = -0.17;
      group.add(lava);
      updaters.push((dt, t) => { mat.color.setRGB(1, 0.36 + Math.sin(t * 2.2) * 0.08, 0.08); });
    }

    // ---------- scenery ----------
    const sets = {};
    const put = (name, it) => { (sets[name] = sets[name] || []).push(it); };
    const blades = [];
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const jit = (v) => v + (rand() - 0.5) * 0.35;
    for (let y = -margin; y < H + margin; y++) for (let x = -margin; x < W + margin; x++) {
      const c = atR(x, y);
      const edge = !inMap(x, y);
      // Keep the arena's near side and the field's flanks clear so nothing hides the fight.
      if (isArena && (y > 10 || ((x >= 0 && x < W) && y > 2 && c !== 'X'))) continue;
      if (c === 'T') {
        const dense = !edge && near(x, y, 'T', 1) && !near(x, y, '.,=s', 1);
        if (dense && rand() < 0.5) put(pick(['trees_A_large', 'trees_B_large', 'trees_A_medium']), { x: jit(x), z: jit(y), ry: rand() * 6.3, s: 1.3 + rand() * 0.3, color: pick([0xffffff, 0xe6f5d8, 0xd8eccb]) });
        else put(pick(['tree_single_A', 'tree_single_B', 'tree_single_A']), { x: jit(x), z: jit(y), y: 0.1, ry: rand() * 6.3, s: 1.5 + rand() * 0.45, color: pick([0xffffff, 0xe6f5d8, 0xd8eccb]) });
      } else if (c === 'M' || (isArena && c === 'B' && edge && theme === 'thunder')) {
        const volcanic = near(x, y, 'aL', 2) || theme === 'fire' || theme === 'demon';
        const peak = near(x, y, 'p1', 2) || theme === 'thunder';
        if (isArena && (x + y) % 2) continue;
        let name, color;
        if (volcanic) { name = pick(['mountain_A', 'mountain_B', 'mountain_C']); color = isArena ? A.rock : 0x8a787e; }
        else if (peak) { name = pick(['mountain_B', 'mountain_C', 'mountain_A']); color = 0xc8cede; }
        else { name = pick(['mountain_A_grass', 'mountain_B_grass_trees', 'mountain_C_grass', 'mountain_A_grass']); color = 0x9ccf86; }
        // Sunk a little so the piece's hex base plate hides under the raised ground.
        put(name, { x: jit(x), z: jit(y), y: -0.5, ry: rand() * 6.3, s: 0.85 + rand() * 0.35, sy: 0.9 + rand() * 0.6, color });
      } else if (c === 'W') {
        if ((x + y) % 2 === 0 || !edge) put(pick(['mountain_C', 'mountain_A', 'hill_single_C']), { x: jit(x), z: jit(y), y: -0.5, ry: rand() * 6.3, s: 0.7 + rand() * 0.25, sy: 1 + rand() * 0.5, color: isArena ? A.rock : pick([0xd99158, 0xc98048, 0xe2a066]) });
      } else if (c === 'B') {
        if (rand() < 0.75) put(pick(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E']), { x: jit(x), z: jit(y), y: 0.4, ry: rand() * 6.3, s: 1.6 + rand() * 0.8, sy: 1 + rand() * 0.8, color: A.rock });
      } else if (c === 'R') {
        const tint = near(x, y, 'a', 1) ? 0x6a5a5e : near(x, y, 'c', 1) ? 0xc08a5a : near(x, y, 'p', 1) ? 0xb4bccc : 0xa8a8a8;
        put(pick(['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E']), { x, z: y, ry: rand() * 6.3, s: 2.4 + rand() * 0.4, color: tint });
      } else if (c === ',') {
        const dry = !near(x, y, '.T', 1) || near(x, y, 'acs', 1);
        for (let i = 0; i < 6; i++) blades.push({ x: x + (rand() - 0.5) * 0.95, z: y + (rand() - 0.5) * 0.95, ry: rand() * 3, s: 0.8 + rand() * 0.6, color: dry ? pick([0xc8b45a, 0xb8a04a]) : pick([0x3f9a40, 0x4fae48, 0x5cbf50]) });
      } else if (c === '~' && !isArena) {
        if (rand() < 0.04) put('waterlily_A', { x: jit(x), z: jit(y), y: -0.2, ry: rand() * 6.3, s: 1.2 });
        else if (rand() < 0.03) put(pick(['waterplant_A', 'waterplant_B']), { x: jit(x), z: jit(y), y: -0.25, ry: rand() * 6.3, s: 1.2 });
      } else if (c === '.' && !edge && !isArena) {
        if (rand() < 0.035) put(pick(['rock_single_A', 'rock_single_C', 'rock_single_E']), { x: jit(x), z: jit(y), ry: rand() * 6.3, s: 0.8, color: 0xb0b0b0 });
        if (rand() < 0.25) for (let i = 0; i < 3; i++) blades.push({ x: x + (rand() - 0.5) * 0.9, z: y + (rand() - 0.5) * 0.9, ry: rand() * 3, s: 0.45 + rand() * 0.3, color: pick([0x4fae48, 0x5cbf50]) });
      } else if ((c === 'a' || c === 'c' || c === 's') && !edge && !isArena) {
        if (rand() < 0.04) put(pick(['rock_single_B', 'rock_single_D']), { x: jit(x), z: jit(y), ry: rand() * 6.3, s: 0.9, color: c === 'a' ? 0x5e5054 : c === 'c' ? 0xc08a5a : 0xd8c8a0 });
      }
    }
    Object.keys(sets).forEach((name) => M.envInstances(name, sets[name], group, { shadow: !/rock|lily|plant/.test(name) || isArena }));
    if (blades.length) {
      const im = new THREE.InstancedMesh(bladeGeometry(), G.toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), blades.length);
      const d = new THREE.Object3D(), col = new THREE.Color();
      blades.forEach((b, i) => {
        d.position.set(b.x, 0, b.z); d.rotation.set(0, b.ry, 0); d.scale.setScalar(b.s); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, col.setHex(b.color));
      });
      im.receiveShadow = true;
      group.add(im);
    }

    // The bridge: one span per run of '#' cells.
    if (!isArena) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#' || at(x - 1, y) === '#') continue;
        let n = 1;
        while (at(x + n, y) === '#') n += 1;
        const b = M.env('building_bridge_A', 1);
        b.rotation.y = Math.PI / 2;
        b.scale.set(1.15, 1, (n + 1.2) / 1.92);
        b.position.set(x + (n - 1) / 2, -0.25, y);
        group.add(b);
      }
    }

    const blockedCell = (x, y) => !walkable(at(x, y));
    return { at, atR, W, H, collider: collider(blockedCell), groundY: T.groundY, update(dt, t) { updaters.forEach((u) => u(dt, t)); }, rand };
  }

  window.World = { build, ARENA, rng };
})();
