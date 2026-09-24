// Procedural toy-like models, built from primitives. Every character faces +X
// in its own space; callers turn the group to aim it.
(function () {
  'use strict';
  const G = window.Gfx;
  const V3 = THREE.Vector3;
  const M = {};

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function ball(r, mat, x, y, z, sx, sy, sz) {
    const m = mesh(new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
    if (sx) m.scale.set(sx, sy, sz);
    return m;
  }
  function box(w, h, d, mat, x, y, z) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }
  function cone(r, h, seg, mat, x, y, z) {
    return mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y, z);
  }
  function cyl(rt, rb, h, seg, mat, x, y, z) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  }
  function bone(a, b, r, mat) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 5), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
    return m;
  }
  M.ball = ball; M.box = box; M.cone = cone; M.cyl = cyl;

  // ---------- the knight ----------
  M.knight = function (o) {
    o = o || {};
    const steel = G.toon(o.armor || 0xcfd9e6);
    const dark = G.toon(0x39415a);
    const trim = G.toon(o.trim || 0xf2c14e);
    const cloth = G.toon(o.cape || 0xd7263d);
    const blade = G.toon(0xf4f8ff, { emissive: 0x222222 });
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);

    const footL = ball(0.14, dark, 0.04, 0.1, -0.17, 1.3, 0.75, 1);
    const footR = ball(0.14, dark, 0.04, 0.1, 0.17, 1.3, 0.75, 1);
    body.add(footL, footR);
    body.add(ball(0.34, steel, 0, 0.5, 0, 1, 1.05, 1));
    body.add(mesh(new THREE.TorusGeometry(0.31, 0.06, 6, 16), trim, 0, 0.36, 0).rotateX(Math.PI / 2));

    const head = new THREE.Group();
    head.position.set(0.02, 1.02, 0);
    head.add(ball(0.42, steel));
    head.add(box(0.12, 0.13, 0.56, G.toon(0x151826), 0.36, 0, 0));
    const eyeMat = G.glow(0xbfeaff);
    head.add(ball(0.05, eyeMat, 0.42, 0, 0.13), ball(0.05, eyeMat, 0.42, 0, -0.13));
    if (o.plume !== null) {
      head.add(ball(0.16, cloth, -0.08, 0.45, 0, 1.5, 1, 0.7));
      head.add(ball(0.12, cloth, -0.3, 0.36, 0, 1.4, 1, 0.7));
    }
    body.add(head);

    const capePivot = new THREE.Group();
    capePivot.position.set(-0.27, 0.78, 0);
    const cape = mesh(new THREE.PlaneGeometry(0.62, 0.62), G.toon(o.cape || 0xd7263d, { side: THREE.DoubleSide, emissive: new THREE.Color(o.cape || 0xd7263d).multiplyScalar(0.45) }), 0, -0.3, 0);
    cape.rotation.y = Math.PI / 2;
    capePivot.add(cape);
    body.add(capePivot);

    // Sword arm on the right (+Z). The blade points up the arm's +Y.
    const swordArm = new THREE.Group();
    swordArm.position.set(0.05, 0.62, 0.42);
    swordArm.add(ball(0.12, steel, 0, 0, 0));
    const sword = new THREE.Group();
    sword.position.set(0.1, 0.02, 0.04);
    sword.add(box(0.07, 0.62, 0.13, blade, 0, 0.45, 0));
    sword.add(cone(0.075, 0.16, 4, blade, 0, 0.84, 0));
    sword.add(box(0.1, 0.07, 0.3, trim, 0, 0.12, 0));
    sword.add(cyl(0.035, 0.035, 0.16, 6, dark, 0, 0.03, 0));
    swordArm.add(sword);
    body.add(swordArm);

    const shieldArm = new THREE.Group();
    shieldArm.position.set(0.05, 0.55, -0.44);
    shieldArm.add(ball(0.12, steel));
    const shield = new THREE.Group();
    const face = cyl(0.3, 0.3, 0.07, 18, G.toon(o.shield || 0x3f6fd1));
    face.rotation.x = Math.PI / 2;
    shield.add(face, ball(0.09, trim, 0, 0, -0.05));
    shield.position.set(0.05, -0.02, -0.08);
    shieldArm.add(shield);
    body.add(shieldArm);

    const anim = { walk: 0, armZ: -0.35, spin: 0, dead: 0, raise: 0, phase: Math.random() * 6 };
    let glowHex = 0x222222;
    const k = {
      group, anim,
      setGlow(hex) { glowHex = hex == null ? 0x222222 : hex; blade.emissive.setHex(glowHex); blade.color.setHex(hex == null ? 0xf4f8ff : 0xffffff); },
      bladeTip() { return sword.localToWorld(new V3(0, 0.8, 0)); },
      update(dt, t) {
        const w = anim.walk;
        const s = Math.sin(t * 16 + anim.phase);
        footL.position.x = 0.04 + s * 0.16 * w;
        footR.position.x = 0.04 - s * 0.16 * w;
        body.position.y = Math.abs(s) * 0.06 * w + Math.sin(t * 2.4 + anim.phase) * 0.015 + anim.raise * 0.05;
        swordArm.rotation.z = anim.armZ + anim.raise * 0.3 + Math.sin(t * 2.4) * 0.04;
        capePivot.rotation.z = -0.22 - w * 0.35 - Math.sin(t * 3 + anim.phase) * 0.06;
        body.rotation.z = anim.spin + anim.dead * 1.5;
        body.position.y += Math.abs(Math.sin(anim.spin * 0.5)) * 0.35;
        head.rotation.z = anim.raise * 0.35;
      },
    };
    return k;
  };

  // ---------- townsfolk ----------
  M.person = function (look) {
    const looks = {
      villager: { robe: 0x4aa3df, hair: 0x7a4a21 },
      villager2: { robe: 0xf08a5d, hair: 0x2d2d2d },
      scholar: { robe: 0x6a4c93, hair: 0xe8e8e8, beard: true },
      king: { robe: 0x8e2a4f, hair: 0xe8e8e8, beard: true, crown: true },
    };
    if (look === 'soldier') {
      const s = M.knight({ armor: 0xa9c4a0, cape: 0x3d7a4a, plume: null, shield: 0x3d7a4a });
      s.anim.armZ = -1.2;
      return s;
    }
    const L = looks[look] || looks.villager;
    const group = new THREE.Group();
    const skin = G.toon(0xffd9b3);
    const robe = G.toon(L.robe);
    const hair = G.toon(L.hair);
    group.add(cyl(0.2, 0.38, 0.72, 12, robe, 0, 0.36, 0));
    const head = new THREE.Group();
    head.position.y = 0.98;
    head.add(ball(0.32, skin));
    head.add(ball(0.33, hair, -0.06, 0.07, 0, 1, 0.9, 1));
    const eye = G.toon(0x222222);
    head.add(ball(0.04, eye, 0.29, 0.0, 0.11), ball(0.04, eye, 0.29, 0.0, -0.11));
    if (L.beard) head.add(ball(0.2, hair, 0.16, -0.2, 0, 0.9, 1.1, 1.1));
    if (L.crown) {
      const gold = G.toon(0xf2c14e);
      head.add(cyl(0.24, 0.2, 0.16, 8, gold, -0.02, 0.33, 0));
      for (let i = 0; i < 5; i++) head.add(cone(0.05, 0.12, 4, gold, -0.02 + Math.cos(i * 1.256) * 0.2, 0.46, Math.sin(i * 1.256) * 0.2));
    }
    group.add(head);
    return { group, anim: {}, update(dt, t) { head.position.y = 0.98 + Math.sin(t * 2 + group.position.x) * 0.02; } };
  };

  // ---------- dragons ----------
  const PALETTES = {
    thunder: { body: 0x6f6fe0, belly: 0xffe680, wing: 0xffd23f, spike: 0xffd23f, horn: 0xfff4c2, wingScale: 0.62, hover: 0.55, tail: 'bolt' },
    water: { body: 0x2fb6c9, belly: 0xc8f5f0, wing: 0x8fe9ee, spike: 0x1d8fa3, horn: 0xe9ffff, wingScale: 0.45, tail: 'fin' },
    fire: { body: 0xe8452c, belly: 0xffc857, wing: 0xff8c42, spike: 0x8c1c13, horn: 0xfff0c9, wingScale: 0.55, tail: 'flame' },
    earth: { body: 0xa6834f, belly: 0xdcc696, wing: 0, spike: 0x6e6257, horn: 0xefe3c8, wingScale: 0, girth: 1.15, tail: 'club' },
    demon: { body: 0x2c1a3d, belly: 0x5d2449, wing: 0x9b1533, spike: 0xd21f45, horn: 0x15101c, wingScale: 0.8, horns: 4, evil: true, tail: 'spade' },
  };

  function wingGeometry() {
    const S = [0, 0, 0], E = [0.2, 0.9, 1.2], W = [0.5, 1.3, 2.6];
    const T1 = [0.9, 1.0, 4.2], T2 = [-0.6, 0.3, 3.8], T3 = [-1.5, -0.1, 2.8], T4 = [-1.6, -0.3, 1.4], B = [-1.2, -0.2, 0.2];
    const tris = [[W, T1, T2], [W, T2, T3], [W, T3, T4], [E, W, T4], [S, E, T4], [S, T4, B]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
    geo.computeVertexNormals();
    return { geo, bones: [[S, E], [E, W], [W, T1], [W, T2], [W, T3], [E, T4]] };
  }

  M.dragon = function (kind, scale) {
    const P = PALETTES[kind] || PALETTES.fire;
    const bodyMat = G.toon(P.body);
    const bellyMat = G.toon(P.belly);
    const spikeMat = G.toon(P.spike);
    const hornMat = G.toon(P.horn);
    const white = G.toon(0xffffff);
    const pupilMat = P.evil ? G.glow(0xff2a2a) : G.toon(0x1a1a2e);
    const flashMats = [bodyMat, bellyMat, spikeMat];
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    group.scale.setScalar(scale || 1);
    const girth = P.girth || 1;

    inner.add(ball(1, bodyMat, 0, 1.35, 0, 1.25 * girth, 1.05 * girth, 1.1 * girth));
    inner.add(ball(1, bellyMat, 0.22, 1.18, 0, 1.05 * girth, 0.9 * girth, 0.92 * girth));

    const legs = [];
    [[0.55, 0.64], [0.55, -0.64], [-0.6, 0.72], [-0.6, -0.72]].forEach(([x, z]) => {
      const leg = new THREE.Group();
      leg.position.set(x * girth, 0, z * girth);
      leg.add(ball(0.38, bodyMat, 0, 0.5, 0, 1, 1.15, 1));
      leg.add(ball(0.3, bodyMat, 0.16, 0.14, 0, 1.4, 0.6, 1.15));
      for (let i = -1; i <= 1; i++) leg.add(ball(0.07, hornMat, 0.52, 0.09, i * 0.17));
      inner.add(leg);
      legs.push(leg);
    });

    const NECK = 4;
    const neck = [];
    for (let i = 0; i < NECK; i++) {
      const r = 0.58 - i * 0.05;
      const seg = new THREE.Group();
      seg.add(ball(r, bodyMat));
      seg.add(cone(0.12, 0.34, 6, spikeMat, -r * 0.55, r * 0.8, 0));
      inner.add(seg);
      neck.push(seg);
    }

    const head = new THREE.Group();
    head.add(ball(0.72, bodyMat, 0, 0, 0, 1.05, 0.95, 1));
    head.add(ball(0.5, bodyMat, 0.62, -0.14, 0, 1.1, 0.72, 0.95));
    head.add(ball(0.05, G.toon(0x222222), 1.08, -0.02, 0.16), ball(0.05, G.toon(0x222222), 1.08, -0.02, -0.16));
    const jaw = new THREE.Group();
    jaw.position.set(0.2, -0.36, 0);
    jaw.add(ball(0.46, bellyMat, 0.4, -0.02, 0, 1.15, 0.36, 0.9));
    jaw.add(ball(0.3, G.toon(0x7a1f2b), 0.35, 0.08, 0, 1.2, 0.3, 0.9));
    head.add(jaw);
    [0.3, -0.3].forEach((z) => {
      head.add(cone(0.07, 0.2, 5, white, 0.95, -0.42, z).rotateX(Math.PI));
      head.add(ball(0.22, white, 0.42, 0.2, z * 1.45, 0.55, 1, 0.8));
      head.add(ball(0.12, pupilMat, 0.53, 0.19, z * 1.62, 0.6, P.evil ? 1.3 : 1, P.evil ? 0.45 : 0.8));
      if (!P.evil) head.add(ball(0.04, G.glow(0xffffff), 0.6, 0.26, z * 1.7));
      const brow = box(0.42, 0.09, 0.14, bodyMat, 0.46, 0.45, z * 1.45);
      brow.rotation.z = -0.4;
      head.add(brow);
    });
    const hornCount = P.horns || 2;
    for (let i = 0; i < hornCount; i++) {
      const side = i % 2 ? -1 : 1;
      const row = Math.floor(i / 2);
      const h = cone(0.14 - row * 0.03, 0.75 - row * 0.2, 6, hornMat, -0.25 - row * 0.3, 0.62 - row * 0.12, side * (0.32 + row * 0.12));
      h.rotation.z = 0.7 + row * 0.3;
      h.rotation.x = side * 0.25;
      head.add(h);
    }
    if (kind === 'water') [1, -1].forEach((s) => { const f = ball(0.35, G.toon(P.wing), -0.2, 0, s * 0.68, 1, 1.1, 0.12); head.add(f); });
    inner.add(head);

    const TAIL = 7;
    const tail = [];
    for (let i = 0; i < TAIL; i++) {
      const r = 0.52 - i * 0.06;
      const seg = new THREE.Group();
      seg.add(ball(r, bodyMat));
      if (i < TAIL - 1) seg.add(cone(0.1, 0.28, 6, spikeMat, 0, r * 0.9, 0));
      inner.add(seg);
      tail.push(seg);
    }
    const tip = new THREE.Group();
    let flameMat = null;
    if (P.tail === 'bolt') tip.add(mesh(new THREE.OctahedronGeometry(0.34), G.toon(P.spike, { emissive: 0x665500 })));
    if (P.tail === 'fin') tip.add(ball(0.4, G.toon(P.wing), -0.2, 0, 0, 1.2, 1, 0.15));
    if (P.tail === 'flame') { flameMat = G.glow(0xffb02e); tip.add(cone(0.24, 0.6, 8, flameMat, 0, 0.2, 0), ball(0.24, flameMat)); }
    if (P.tail === 'club') tip.add(mesh(new THREE.DodecahedronGeometry(0.42), spikeMat));
    if (P.tail === 'spade') { const c = cone(0.3, 0.6, 4, spikeMat); c.rotation.z = Math.PI / 2; tip.add(c); }
    tail[TAIL - 1].add(tip);

    for (let i = 0; i < 4; i++) inner.add(cone(0.15, 0.42, 6, spikeMat, 0.5 - i * 0.42, 2.38 * girth - Math.abs(i - 1.3) * 0.12, 0));

    const wings = [];
    let wingMat = null;
    if (P.wingScale) {
      wingMat = G.toon(P.wing, { side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
      flashMats.push(wingMat);
      [1, -1].forEach((side) => {
        const wg = wingGeometry();
        const w = new THREE.Group();
        w.add(new THREE.Mesh(wg.geo, wingMat));
        wg.bones.forEach(([a, b]) => w.add(bone(new V3(...a), new V3(...b), 0.09, bodyMat)));
        w.position.set(-0.1, 1.95, side * 0.55);
        w.scale.set(P.wingScale, P.wingScale, side * P.wingScale);
        inner.add(w);
        wings.push({ w, side });
      });
    }

    const rocks = new THREE.Group();
    if (kind === 'earth') {
      for (let i = 0; i < 7; i++) {
        const r = mesh(new THREE.DodecahedronGeometry(0.32 + (i % 3) * 0.1), spikeMat, 0.7 - i * 0.28, 2.2 + Math.sin(i * 2.1) * 0.2, (i % 2 ? 1 : -1) * (0.25 + (i % 3) * 0.2));
        r.rotation.set(i, i * 2, i * 3);
        rocks.add(r);
      }
      inner.add(rocks);
    }

    const base = flashMats.map((m) => m.emissive.clone());
    const tint = new THREE.Color(0x000000);
    const anim = { thrust: 0, lower: 0, mouth: 0, flap: 1, rise: 0, dead: 0, flashT: 0, phase: Math.random() * 6 };
    const p0 = new V3(), p1 = new V3(), p2 = new V3(), tmp = new V3();
    const whiteC = new THREE.Color(0xffffff);

    const d = {
      group, inner, anim, kind,
      flash() { anim.flashT = 1; },
      // The Demon Dragon wears whichever element it is channelling.
      setElement(el) {
        const c = window.Data.ELEMENTS[el].color;
        tint.setHex(c).multiplyScalar(0.22);
        base.forEach((b) => b.copy(tint));
        spikeMat.color.setHex(c);
        if (wingMat) wingMat.color.setHex(c).lerp(new THREE.Color(P.wing), 0.45);
        if (P.evil) pupilMat.color.setHex(c);
      },
      mouthPos() { return head.localToWorld(new V3(1.1, -0.3, 0)); },
      headPos() { return head.getWorldPosition(new V3()); },
      chestPos() { return inner.localToWorld(new V3(0.6, 1.4, 0)); },
      update(dt, t) {
        t += anim.phase;
        const breathe = Math.sin(t * 2.2) * 0.05;
        const hover = (P.hover || 0) * (1 - anim.dead);
        inner.position.y = hover * (1 + Math.sin(t * 2.6) * 0.25) + anim.rise - anim.dead * 0.55;
        inner.rotation.x = anim.dead * 1.25;
        const hx = 1.5 + anim.thrust * 0.9 + anim.lower * 0.55;
        const hy = 2.72 + breathe - anim.thrust * 0.45 - anim.lower * 1.75 - anim.dead * 0.6;
        const hz = Math.sin(t * 1.1) * 0.12 * (1 - anim.lower);
        p0.set(0.72, 1.8, 0); p1.set(0.95, 2.75 - anim.lower * 0.9, 0); p2.set(hx, hy, hz);
        for (let i = 0; i < NECK; i++) {
          const k = (i + 0.4) / NECK * 0.85;
          const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
          neck[i].position.set(p0.x * a + p1.x * b + p2.x * c, p0.y * a + p1.y * b + p2.y * c, p2.z * c);
        }
        head.position.copy(p2);
        head.rotation.z = -0.22 - anim.lower * 0.55 + Math.sin(t * 1.7) * 0.03;
        head.rotation.y = Math.sin(t * 1.1) * 0.08;
        jaw.rotation.z = -(0.06 + anim.mouth * 0.75);
        for (let i = 0; i < TAIL; i++) {
          const s = i / (TAIL - 1);
          tail[i].position.set(-0.95 * girth - s * 2.3, 1.2 - Math.sin(s * 2.4) * 0.75 + s * s * 1.5, Math.sin(t * 1.8 - s * 3) * 0.45 * s * (1 - anim.dead));
        }
        tip.rotation.y += dt * (P.tail === 'bolt' ? 3 : 0);
        if (flameMat) tip.scale.setScalar(1 + Math.sin(t * 14) * 0.12);
        const amp = (hover ? 0.5 : 0.22) * anim.flap;
        wings.forEach(({ w, side }) => { w.rotation.x = -side * (0.5 + Math.sin(t * (hover ? 7 : 2.4)) * amp - anim.dead * 0.7); });
        if (anim.flashT > 0 || tint.r + tint.g + tint.b > 0) {
          anim.flashT = Math.max(0, anim.flashT - dt * 5);
          flashMats.forEach((m, i) => m.emissive.copy(base[i]).lerp(whiteC, anim.flashT * 0.8));
        }
        tmp.set(0, 0, 0);
      },
    };
    return d;
  };

  // ---------- buildings and props ----------
  M.castle = function (night) {
    const g = new THREE.Group();
    const stone = G.toon(0xe9e3d2);
    const stone2 = G.toon(0xd3ccb8);
    const roof = G.toon(0x3f6fd1);
    const win = G.glow(night ? 0xffd87a : 0x3a4a6a);
    g.add(box(4.5, 1.5, 3.4, stone, 0, 0.75, 0));
    for (let i = 0; i < 9; i++) g.add(box(0.3, 0.3, 0.3, stone2, -2.0 + i * 0.5, 1.62, 1.6));
    g.add(box(2.2, 2.7, 1.8, stone2, 0, 1.35, -0.5));
    const top = cone(1.75, 1.3, 4, roof, 0, 3.35, -0.5);
    top.rotation.y = Math.PI / 4;
    g.add(top);
    [[-2.1, 1.55], [2.1, 1.55], [-2.1, -1.55], [2.1, -1.55]].forEach(([x, z]) => {
      g.add(cyl(0.58, 0.64, 2.5, 12, stone, x, 1.25, z));
      g.add(cone(0.78, 1.1, 12, roof, x, 3.05, z));
      g.add(cyl(0.02, 0.02, 0.6, 4, stone2, x, 3.85, z), box(0.34, 0.2, 0.02, G.toon(0xd7263d), x + 0.18, 4.0, z));
      g.add(box(0.16, 0.26, 0.04, win, x, 1.7, z + 0.62));
    });
    g.add(box(0.9, 1.05, 0.12, G.toon(0x4a3222), 0, 0.52, 1.72));
    g.add(cyl(0.45, 0.45, 0.12, 12, G.toon(0x4a3222), 0, 1.05, 1.72).rotateX(Math.PI / 2));
    [-0.6, 0, 0.6].forEach((x) => g.add(box(0.2, 0.34, 0.04, win, x, 2.1, 0.42)));
    return g;
  };

  M.house = function (roofColor) {
    const g = new THREE.Group();
    g.add(box(1.7, 1.05, 1.45, G.toon(0xfff1d6), 0, 0.52, 0));
    const r = cone(1.4, 0.95, 4, G.toon(roofColor), 0, 1.5, 0);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    g.add(box(0.36, 0.6, 0.06, G.toon(0x7a4a21), 0, 0.3, 0.74));
    g.add(box(0.3, 0.3, 0.06, G.glow(0x9fd8ff), 0.52, 0.62, 0.74), box(0.3, 0.3, 0.06, G.glow(0x9fd8ff), -0.52, 0.62, 0.74));
    return g;
  };

  M.lair = function (element) {
    const E = window.Data.ELEMENTS[element];
    const rockColor = { thunder: 0x8a90a6, water: 0x5f9aa8, fire: 0x5a3a3a, earth: 0xb98a5a }[element];
    const g = new THREE.Group();
    g.add(ball(1, G.toon(rockColor), 0, 0.3, -0.1, 0.95, 1.15, 0.85));
    g.add(ball(0.5, G.glow(0x07060a), 0, 0.36, 0.52, 0.85, 1, 0.5));
    const crystal = G.glow(E.color);
    const c1 = mesh(new THREE.OctahedronGeometry(0.22), crystal, -0.55, 1.2, 0.2);
    const c2 = mesh(new THREE.OctahedronGeometry(0.16), crystal, 0.6, 1.05, 0.25);
    g.add(c1, c2);
    return { group: g, crystals: [c1, c2], setSlain() { crystal.color.setHex(0x555555); } };
  };

  M.ashenGate = function () {
    const g = new THREE.Group();
    const dark = G.toon(0x2a2230);
    g.add(box(0.5, 2.6, 0.6, dark, -0.95, 1.3, 0), box(0.5, 2.6, 0.6, dark, 0.95, 1.3, 0), box(2.7, 0.55, 0.7, dark, 0, 2.75, 0));
    g.add(cone(0.3, 0.7, 4, dark, -0.95, 3.3, 0), cone(0.3, 0.7, 4, dark, 0.95, 3.3, 0));
    const portalMat = G.glow(0x12060c);
    const portal = mesh(new THREE.CircleGeometry(0.95, 24), portalMat, 0, 1.25, 0.05);
    portal.scale.y = 1.25;
    g.add(portal);
    const seals = {};
    window.Data.ELEMENT_ORDER.forEach((el, i) => {
      const s = mesh(new THREE.OctahedronGeometry(0.22), G.glow(window.Data.ELEMENTS[el].color), -1.2 + i * 0.8, 3.7, 0.2);
      g.add(s);
      seals[el] = s;
    });
    return {
      group: g, seals, portal,
      refresh(slain) {
        window.Data.ELEMENT_ORDER.forEach((el) => { seals[el].visible = !slain.includes(el); });
        portalMat.color.setHex(slain.length >= 4 ? 0xd21f45 : 0x12060c);
      },
      update(dt, t) {
        Object.keys(seals).forEach((el, i) => { seals[el].position.y = 3.7 + Math.sin(t * 2 + i) * 0.12; seals[el].rotation.y = t * 1.5; });
        portal.rotation.z = t * 0.8;
      },
    };
  };

  M.chest = function (opened) {
    const g = new THREE.Group();
    const wood = G.toon(0x9a5b2b);
    const gold = G.toon(0xf2c14e);
    g.add(box(0.7, 0.36, 0.5, wood, 0, 0.18, 0), box(0.74, 0.08, 0.54, gold, 0, 0.36, 0));
    const lid = new THREE.Group();
    lid.position.set(0, 0.4, -0.25);
    lid.add(box(0.7, 0.2, 0.5, wood, 0, 0.1, 0.25), box(0.12, 0.16, 0.06, gold, 0, 0.06, 0.52));
    g.add(lid);
    const c = { group: g, open() { lid.rotation.x = -1.3; } };
    if (opened) c.open();
    return c;
  };

  M.sign = function () {
    const g = new THREE.Group();
    const wood = G.toon(0xa9713d);
    g.add(cyl(0.06, 0.06, 0.7, 6, wood, 0, 0.35, 0), box(0.8, 0.45, 0.08, wood, 0, 0.75, 0.02), box(0.6, 0.06, 0.02, G.toon(0x5a3a1a), 0, 0.82, 0.07), box(0.5, 0.06, 0.02, G.toon(0x5a3a1a), 0, 0.68, 0.07));
    return g;
  };

  M.heart = function () {
    const g = new THREE.Group();
    const red = G.glow(0xff4d6d);
    g.add(ball(0.15, red, -0.1, 0.1, 0), ball(0.15, red, 0.1, 0.1, 0));
    const c = cone(0.235, 0.32, 10, red, 0, -0.1, 0);
    c.rotation.x = Math.PI;
    c.scale.z = 0.6;
    g.add(c);
    return g;
  };

  M.boulder = function () {
    const m = mesh(new THREE.DodecahedronGeometry(0.46), G.toon(0x8a7a66), 0, 0.4, 0);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    const g = new THREE.Group();
    g.add(m);
    return g;
  };

  M.note = function () {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 640;
    const x = c.getContext('2d');
    x.fillStyle = '#ead9b0'; x.fillRect(0, 0, 512, 640);
    x.fillStyle = 'rgba(120,80,30,0.18)';
    for (let i = 0; i < 60; i++) x.fillRect(Math.random() * 512, Math.random() * 640, 40 * Math.random(), 2);
    x.fillStyle = '#2b2622'; x.textAlign = 'center';
    x.font = 'italic 46px Georgia, serif';
    ['Yield me', 'your crown', 'before the', 'snows melt...'].forEach((l, i) => x.fillText(l, 256, 110 + i * 62));
    x.font = 'bold 50px Georgia, serif'; x.fillStyle = '#7a0f16';
    x.fillText('or DEATH', 256, 400); x.fillText('WILL COME.', 256, 462);
    x.strokeStyle = '#151210'; x.lineWidth = 10; x.lineCap = 'round';
    [-36, 0, 36].forEach((dx) => { x.beginPath(); x.moveTo(236 + dx, 520); x.quadraticCurveTo(250 + dx, 560, 262 + dx, 606); x.stroke(); });
    const tex = new THREE.CanvasTexture(c);
    return mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  };

  window.Models = M;
})();
