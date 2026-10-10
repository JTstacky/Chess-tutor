// Real 3D models from the GLB assets (see assets/CREDITS.md). Replaces the procedural
// knight, townsfolk, dragon, castle and house in Models, keeping the same small APIs
// (group, anim, update ...) so the cutscene sets and levels drive them unchanged.
// Every character still faces +X in its own space.
(function () {
  'use strict';
  const G = window.Gfx, M = window.Models, A = window.Assets;
  const V3 = THREE.Vector3;
  const SK = window.THREEX.SkeletonUtils;
  const FACE_X = Math.PI / 2; // GLB characters face +Z
  const KAYKIT_HEIGHT = 2.45;   // KayKit Adventurers rig, feet to helmet
  const DRAGON_HEIGHT = 3.7;    // Quaternius dragon, feet to wing tips

  // One toon material per source material, so the whole game shares a handful.
  const toonCache = new Map();
  function toonOf(m) {
    if (!toonCache.has(m.uuid)) {
      const t = G.toon(m.color.getHex(), { map: m.map || null });
      t.name = m.name;
      if (m.map) t.color.setRGB(1, 1, 1);
      else t.color.copy(m.color);
      toonCache.set(m.uuid, t);
    }
    return toonCache.get(m.uuid);
  }
  function prepare(root, shadow) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.keep = true;
      o.castShadow = shadow !== false;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map(toonOf) : toonOf(o.material);
    });
    return root;
  }
  // Cloned materials belong to one model, so they can be tinted alone.
  function ownMaterials(root) {
    const out = {};
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      out[o.material.name] = out[o.material.name] || [];
      out[o.material.name].push(o.material);
    });
    return out;
  }

  function clip(gltf, name) { return gltf.animations.find((a) => a.name === name); }

  // A little animation state machine: a looping base clip plus one-shot overlays.
  function animator(root, gltf) {
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    gltf.animations.forEach((c) => { actions[c.name] = mixer.clipAction(c); });
    let base = null, shot = null;
    const api = {
      mixer, actions,
      base(name, speed) {
        const a = actions[name];
        if (!a) return;
        a.timeScale = speed || 1;
        if (base === name) return;
        const prev = actions[base];
        a.reset().setLoop(name === 'Death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = name === 'Death';
        a.enabled = true;
        a.play();
        if (shot) a.setEffectiveWeight(0);
        if (prev && !shot) prev.crossFadeTo(a, 0.18, false);
        else if (prev) prev.stop();
        base = name;
      },
      play(name, speed) {
        const a = actions[name];
        if (!a) return;
        if (shot && shot !== name) actions[shot].stop();
        a.reset().setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
        a.timeScale = speed || 1;
        a.setEffectiveWeight(1);
        a.play();
        if (actions[base]) actions[base].setEffectiveWeight(0.0);
        shot = name;
      },
      update(dt) {
        if (shot && !actions[shot].isRunning()) {
          shot = null;
          if (actions[base]) actions[base].setEffectiveWeight(1);
        }
        mixer.update(dt);
      },
      get current() { return shot || base; },
    };
    mixer.addEventListener('finished', (e) => {
      if (e.action === actions[shot]) { shot = null; if (actions[base]) actions[base].setEffectiveWeight(1); }
    });
    return api;
  }

  // native: the model's own height in its file (skinned bounds are unreliable before the first frame).
  function character(gltf, height, hide, native) {
    const model = prepare(SK.clone(gltf.scene));
    model.traverse((o) => { if (hide && hide.test(o.name)) o.visible = false; });
    model.scale.setScalar(height / (native || KAYKIT_HEIGHT));
    model.rotation.y = FACE_X;
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.add(model);
    group.add(body);
    return { group, body, model, anim: animator(model, gltf) };
  }

  // ---------- the knight ----------
  const knightBase = M.knight;
  M.proceduralKnight = knightBase;
  M.knight = function (o) {
    if (o && Object.keys(o).length) return knightBase(o);
    const c = character(A.knight, 1.35);
    const anim = { walk: 0, armZ: -0.35, spin: 0, dead: 0, raise: 0, phase: Math.random() * 6 };
    let sword = null, bladeMats = [];
    c.model.traverse((x) => { if (x.name === '1H_Sword') sword = x; });
    if (sword) {
      sword.traverse((x) => { if (x.isMesh) { x.material = x.material.clone(); bladeMats.push(x.material); } });
    }
    c.anim.base('Idle');
    return {
      group: c.group, anim,
      play(name, speed) { c.anim.play(name, speed); },
      setGlow(hex) {
        bladeMats.forEach((m) => { m.emissive.setHex(hex == null ? 0x000000 : hex); m.emissiveIntensity = hex == null ? 0 : 0.9; });
      },
      bladeTip() { return sword ? sword.getWorldPosition(new V3()) : c.group.position.clone().setY(1); },
      update(dt) {
        if (anim.dead > 0.05) c.anim.base('Death');
        else if (anim.raise > 0.5 || anim.armZ < -1.2) c.anim.base('Cheer');
        else if (anim.spin !== 0) c.anim.base('Roll', 1.6);
        else if (anim.walk > 0.55) c.anim.base('Run', 0.7 + anim.walk * 0.4);
        else if (anim.walk > 0.08) c.anim.base('Walk', 0.6 + anim.walk);
        else c.anim.base('Idle');
        c.anim.update(dt);
      },
    };
  };

  // ---------- townsfolk ----------
  const WEAPONS = /Axe|Wand|Spellbook|Knife|Crossbow|Sword|Shield/;
  const LOOKS = { soldier: 'barbarian', scholar: 'mage', villager: 'rogue', villager2: 'rogue_hooded', king: 'mage' };
  M.person = function (look) {
    const c = character(A[LOOKS[look] || 'rogue'], look === 'king' ? 1.4 : 1.3, WEAPONS);
    if (look === 'king') {
      const mats = ownMaterials(c.model);
      Object.values(mats).flat().forEach((m) => m.color.setHex(0xffd27a));
      const crown = M.cone(0.16, 0.2, 5, G.toon(0xf2c14e), 0, 1.5, 0);
      c.group.add(crown);
    }
    const anim = { walk: 0 };
    c.anim.base('Idle');
    c.anim.mixer.setTime(Math.random() * 2);
    return {
      group: c.group, anim,
      play(name) { c.anim.play(name); },
      update(dt) {
        c.anim.base(anim.walk > 0.3 ? 'Walk' : 'Idle');
        c.anim.update(dt);
      },
    };
  };

  // ---------- dragons ----------
  // body, wings, belly, claws per element.
  const DRAGON_COLORS = {
    thunder: [0xf2c94c, 0x5b6bd6, 0xfff1b8, 0x2a2f4a],
    water: [0x2f9fd8, 0x1d6f9a, 0xbfefff, 0x0f3a52],
    fire: [0xe2482b, 0xff9a3d, 0xffd38a, 0x3a1410],
    earth: [0x9a7448, 0x5f7d3a, 0xe6c58f, 0x3b2a1a],
    demon: [0x3a2346, 0xa0193a, 0x6a3a7a, 0x120810],
  };
  const DRAGON_SIZE = 0.8; // the old procedural dragon's scale 1 is about 3 units tall
  M.dragon = function (kind, scale) {
    const c = character(A.dragon, DRAGON_HEIGHT * DRAGON_SIZE, null, DRAGON_HEIGHT);
    c.group.scale.setScalar(scale || 1);
    const mats = ownMaterials(c.model);
    Object.values(mats).flat().forEach((m) => { m.side = THREE.DoubleSide; });
    const flashMats = [].concat(mats.Main || [], mats.Belly || [], mats.Wings || []);
    const pal = DRAGON_COLORS[kind] || DRAGON_COLORS.fire;
    const setColors = (p) => {
      ['Main', 'Wings', 'Belly', 'Claws'].forEach((n, i) => (mats[n] || []).forEach((m) => m.color.setHex(p[i])));
    };
    setColors(pal);
    if (kind === 'demon') (mats.Eyes || []).forEach((m) => { m.color.setHex(0xff2a2a); m.emissive.setHex(0xff2a2a); });
    let head = null, nose = null, chest = null, eyes = null;
    c.model.traverse((o) => {
      if (o.name === 'Head') head = o;
      if (o.name === 'Nose_end' || (o.name === 'Nose' && !nose)) nose = o;
      if (o.name === 'Body') chest = o;
      if (o.name === 'Eyes' && o.isMesh && !o.isSkinnedMesh) eyes = o;
    });
    // The eyes are a loose mesh in the file; pin them to the head bone so they follow it.
    if (eyes && head) { c.model.updateMatrixWorld(true); head.attach(eyes); }
    const anim = { thrust: 0, lower: 0, mouth: 0, flap: 1, rise: 0, dead: 0, flashT: 0, phase: Math.random() * 6 };
    const tint = new THREE.Color(0, 0, 0);
    const whiteC = new THREE.Color(0xffffff);
    let attacking = false;
    c.anim.base('Fly');
    c.anim.mixer.setTime(anim.phase);
    return {
      group: c.group, inner: c.body, anim, kind,
      flash() { anim.flashT = 1; if (anim.dead < 0.05 && !attacking) c.anim.play('Hit', 1.4); },
      // The Demon Dragon wears whichever element it is channelling.
      setElement(el) {
        const p = DRAGON_COLORS[el];
        setColors([new THREE.Color(p[0]).lerp(new THREE.Color(DRAGON_COLORS.demon[0]), 0.55).getHex(), p[0], DRAGON_COLORS.demon[2], p[3]]);
        tint.setHex(window.Data.ELEMENTS[el].color).multiplyScalar(0.25);
      },
      mouthPos() { return (nose || head || c.body).getWorldPosition(new V3()); },
      headPos() { return (head || c.body).getWorldPosition(new V3()); },
      chestPos() { return (chest || c.body).getWorldPosition(new V3()); },
      update(dt, t) {
        const strike = anim.mouth > 0.5 || anim.thrust > 0.5;
        if (strike && !attacking && anim.dead < 0.05) c.anim.play(anim.thrust > 0.5 ? 'Attack' : 'Attack2');
        attacking = strike;
        if (anim.dead > 0.05) c.anim.base('Death', 0.8);
        else c.anim.base('Fly', 0.8 + 0.25 * anim.flap);
        c.body.position.y = anim.rise - anim.lower * 0.35 + (1 - anim.dead) * Math.sin(t * 2.2 + anim.phase) * 0.06;
        c.body.rotation.z = -anim.lower * 0.25;
        c.anim.update(dt);
        if (anim.flashT > 0 || tint.r + tint.g + tint.b > 0) {
          anim.flashT = Math.max(0, anim.flashT - dt * 5);
          flashMats.forEach((m) => m.emissive.copy(tint).lerp(whiteC, anim.flashT * 0.8));
        }
      },
    };
  };

  // ---------- scenery ----------
  const envNodes = {};
  A.env.scene.children.forEach((n) => { envNodes[n.name] = n; });
  M.envNames = Object.keys(envNodes);

  // A single cloned piece of scenery, sitting on y = 0 at its origin.
  M.env = function (name, scale, shadow) {
    const src = envNodes[name];
    if (!src) throw new Error('no scenery piece ' + name);
    // Pieces keep their own offset in the file (it seats them on the ground).
    const o = prepare(src.clone(), shadow);
    const g = new THREE.Group();
    g.scale.setScalar(scale || 1);
    g.add(o);
    return g;
  };

  // Many copies of one piece as InstancedMeshes. items: { x, y, z, ry, s, sy, color }
  M.envInstances = function (name, items, parent, opts) {
    if (!items.length) return [];
    opts = opts || {};
    const src = envNodes[name];
    if (!src) throw new Error('no scenery piece ' + name);
    A.env.scene.updateMatrixWorld(true);
    const out = [];
    const o = new THREE.Object3D();
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    src.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const local = mesh.matrixWorld.clone();
      const im = new THREE.InstancedMesh(mesh.geometry, toonOf(mesh.material), items.length);
      im.userData.keep = true;
      im.castShadow = opts.shadow !== false;
      im.receiveShadow = true;
      items.forEach((it, i) => {
        o.position.set(it.x, it.y || 0, it.z);
        o.rotation.set(0, it.ry || 0, 0);
        const s = it.s || 1;
        o.scale.set(s, s * (it.sy || 1), s);
        o.updateMatrix();
        m.multiplyMatrices(o.matrix, local);
        im.setMatrixAt(i, m);
        if (it.color != null) im.setColorAt(i, col.setHex(it.color));
        else if (opts.anyColor) im.setColorAt(i, col.setHex(0xffffff));
      });
      im.computeBoundingSphere();
      parent.add(im);
      out.push(im);
    });
    return out;
  };

  M.castle = function () {
    const g = new THREE.Group();
    g.add(M.env('building_castle_blue', 1.8));
    [[-2.0, 0.7], [2.0, 0.7]].forEach(([x, z]) => {
      const t = M.env('building_tower_A_blue', 1.35);
      t.position.set(x, 0, z);
      g.add(t);
    });
    [-0.9, 0.9].forEach((x) => {
      const f = M.env('flag_blue', 4);
      f.position.set(x, 0, 2.6);
      g.add(f);
    });
    return g;
  };

  M.house = function (roofColor) {
    const red = new THREE.Color(roofColor).r > 0.6;
    const pick = Math.random() < 0.5 ? 'A' : 'B';
    return M.env(`building_home_${pick}_${red ? 'red' : 'blue'}`, 1.9);
  };

  // ---------- landmarks (TRELLIS.2 models, see assets/CREDITS.md) ----------
  // Converted to the shared toon look, like the rest of the scenery.
  function landmark(name, height) {
    const src = A[name];
    if (!src) return null;
    const o = src.scene.clone();
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.keep = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.material = toonOf(m.material);
    });
    const box = new THREE.Box3().setFromObject(o);
    o.scale.setScalar(height / Math.max(0.01, box.max.y - box.min.y));
    const g = new THREE.Group();
    g.add(o);
    return g;
  }

  const lairBase = M.lair;
  M.lair = function (element) {
    const model = landmark('lair_' + element, 2.1);
    if (!model) return lairBase(element);
    const E = window.Data.ELEMENTS[element];
    const crystal = G.glow(E.color);
    const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), crystal);
    c1.position.set(0, 2.55, 0);
    model.add(c1);
    let dim = null;
    return {
      group: model, crystals: [c1],
      setSlain() {
        crystal.color.setHex(0x555555);
        if (dim) return;
        dim = true;
        model.traverse((m) => { if (m.isMesh && m !== c1) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.55); } });
      },
    };
  };

  const gateBase = M.ashenGate;
  M.ashenGate = function () {
    const g = landmark('ashen_gate', 3.2);
    if (!g) return gateBase();
    const portalMat = G.glow(0x12060c, { transparent: true, opacity: 0.0 });
    const portal = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), portalMat);
    portal.position.set(0, 1.15, 0.25);
    portal.scale.y = 1.6;
    g.add(portal);
    const seals = {};
    window.Data.ELEMENT_ORDER.forEach((el, i) => {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), G.glow(window.Data.ELEMENTS[el].color));
      s.position.set(-0.9 + i * 0.6, 3.75, 0.2);
      g.add(s);
      seals[el] = s;
    });
    return {
      group: g, seals, portal,
      refresh(slain) {
        window.Data.ELEMENT_ORDER.forEach((el) => { seals[el].visible = !slain.includes(el); });
        const open = slain.length >= 4;
        portalMat.color.setHex(open ? 0xd21f45 : 0x12060c);
        portalMat.opacity = open ? 0.9 : 0;
      },
      update(dt, t) {
        Object.keys(seals).forEach((el, i) => { seals[el].position.y = 3.75 + Math.sin(t * 2 + i) * 0.1; seals[el].rotation.y = t * 1.5; });
        portal.rotation.z = t * 0.8;
      },
    };
  };

  window.Actors = { prepare, toonOf, character };
})();
