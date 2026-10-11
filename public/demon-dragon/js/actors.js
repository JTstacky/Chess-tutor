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

  // ---------- the knight's look (character creator) ----------
  // Cheap variations on the one knight: a palette shader over his own texture, and weapons
  // and hats borrowed from the KayKit townsfolk. They hang on the same bones (same rig), so
  // every animation fits. A look is three digits: colours, weapon, head ("000" = as made).
  const KNIGHT_LOOKS = {
    colors: [
      { name: 'Crimson', swatch: 0xc8202a },
      { name: 'Azure', swatch: 0x2f6fd8, cloth: 0x2f6fd8 },
      { name: 'Verdant', swatch: 0x2f9e4f, cloth: 0x2f9e4f },
      { name: 'Amethyst', swatch: 0x7b3fc4, cloth: 0x7b3fc4, steel: 0x8a86a0, trim: 0xd9d9e6 },
      { name: 'Sunlit', swatch: 0xf0c64a, cloth: 0xf4ecd6, steel: 0xf0c64a, trim: 0xffffff },
      { name: 'Frost', swatch: 0x5fd0ee, cloth: 0x5fd0ee, steel: 0xdcefff, trim: 0xe4ecf6 },
      { name: 'Ember', swatch: 0xff7a1f, cloth: 0x2a2226, steel: 0x55505c, trim: 0xff8a2a },
    ],
    weapons: [
      { name: "Knight's Sword" },
      { name: 'Gilded Sword', tint: 0xffcf5a },
      { name: 'Shadow Blade', tint: 0x5b4a80 },
      { name: 'Greatsword', scale: [1.15, 1.4, 1.15] },
      { name: 'Battle Axe', from: ['barbarian', '1H_Axe'], scale: [0.8, 0.8, 0.8] },
    ],
    // Every head but the helm replaces the knight's whole head: a KayKit head (and its hat)
    // from the townsfolk, skinned to the knight's own bones.
    heads: [
      { name: 'Knight Helm' },
      // A whole round bear's head, built from a few spheres on the head bone.
      { name: 'Bear Head', bear: true, crownY: 0.9 },
      { name: 'Wizard', head: ['mage', 'Mage_Head'], hat: ['mage', 'Mage_Hat'], crownY: 0.9 },
      { name: 'Rogue', head: ['rogue', 'Rogue_Head'], crownY: 0.9 },
      { name: 'Hooded Rogue', head: ['rogue_hooded', 'Rogue_Head_Hooded'], crownY: 0.9 },
    ],
  };
  const lookParts = (code) => {
    const d = String(code || '000');
    const pick = (i, list) => Math.min(list.length - 1, Math.max(0, parseInt(d[i], 10) || 0));
    return { c: pick(0, KNIGHT_LOOKS.colors), w: pick(1, KNIGHT_LOOKS.weapons), h: pick(2, KNIGHT_LOOKS.heads) };
  };
  M.KNIGHT_LOOKS = KNIGHT_LOOKS;
  M.lookParts = lookParts;
  M.heroLook = '000'; // the player's look; game.js keeps it in step with the save

  // Recolours the red cloth, grey steel and gold trim of the knight's texture; skin and
  // leather are left alone. One shader program serves every palette (uniforms differ).
  const srgb = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
  // cut: [height, radius] in the head bone's space. Inside that column and above that height
  // the knight's own mesh is not drawn, so a new head (or the crown) replaces it.
  function paletteMaterial(base, pal, cut) {
    const m = base.clone();
    const u = {
      uCloth: { value: srgb(pal.cloth || 0xc8202a) }, uSteel: { value: srgb(pal.steel || 0xffffff) },
      uTrim: { value: srgb(pal.trim || 0xe6b94a) },
      uUse: { value: new THREE.Vector3(pal.cloth ? 1 : 0, pal.steel ? 1 : 0, pal.trim ? 1 : 0) },
      uCut: { value: cut ? cut[0] : 1e6 }, uCutR: { value: cut ? cut[1] : 1e6 }, uNeck: { value: new THREE.Vector2(...(cut && cut[2] != null ? cut.slice(2) : [1e6, 0])) }, uToHead: { value: new THREE.Matrix4() },
    };
    m.userData.toHead = u.uToHead.value;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform mat4 uToHead;\nvarying vec3 vHead;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
        '#include <skinning_vertex>\n  vHead = (uToHead * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform vec3 uCloth, uSteel, uTrim, uUse;\nuniform float uCut, uCutR;\nuniform vec2 uNeck;\nvarying vec3 vHead;\n' + sh.fragmentShader
        .replace('void main() {', 'void main() {\n  bool inHead = length(vHead.xz) < uCutR;\n  if (inHead && vHead.y > uCut) discard;\n  if (vHead.y > uNeck.x && length(vHead.xz) < uNeck.y) discard;')
        .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 s = pow(clamp(diffuseColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
        float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
        float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
        float red = smoothstep(0.3, 0.45, s.r) * (1.0 - smoothstep(0.38, 0.5, max(s.g, s.b) / max(s.r, 0.001)));
        float gold = smoothstep(0.5, 0.6, s.r) * smoothstep(0.66, 0.74, s.g / max(s.r, 0.001)) * (1.0 - smoothstep(0.45, 0.55, s.b / max(s.r, 0.001)));
        float grey = (1.0 - smoothstep(0.1, 0.2, sat)) * smoothstep(0.2, 0.35, mx);
        // The plume hangs down the back of the helmet: under a hat, red goes a little lower.
        if (inHead && red > 0.5 && vHead.y > uCut - 0.3) discard;
        vec3 o = s;
        o = mix(o, uCloth * (mx / 0.8), red * uUse.x);
        o = mix(o, s * uSteel * 1.05, grey * uUse.y);
        o = mix(o, uTrim * (mx / 0.85), gold * uUse.z);
        diffuseColor.rgb = pow(clamp(o, 0.0, 1.0), vec3(2.2));
      }`);
    };
    m.customProgramCacheKey = () => 'knight-palette';
    return m;
  }
  // A prop from another KayKit character, hung on this knight's bone of the same name.
  function borrow([asset, name], bone) {
    const src = A[asset] && A[asset].scene.getObjectByName(name);
    if (!src || !bone) return null;
    const o = prepare(src.clone());
    o.traverse((x) => { if (x.isMesh) x.material = x.material.clone(); });
    bone.add(o);
    return o;
  }
  // The best score's crown is headwear too: it replaces the helmet top like a hat does.
  const CROWNED = { name: 'Crown', cut: [0.5, 1e6], crownY: 1.0 };
  // A whole head from a KayKit character. They are weighted to the head bone alone, so the
  // geometry is moved into head-bone space once and shared, and hung on the head as a prop.
  const headGeo = new Map();
  function borrowHead([asset, name]) {
    const key = asset + '/' + name;
    if (!headGeo.has(key)) {
      const src = A[asset] && A[asset].scene.getObjectByName(name);
      const i = src && src.isSkinnedMesh ? src.skeleton.bones.findIndex((b) => b.name === 'head') : -1;
      headGeo.set(key, i < 0 ? null : [src.geometry.clone().applyMatrix4(src.skeleton.boneInverses[i].clone().multiply(src.bindMatrix)), src.material]);
    }
    const hit = headGeo.get(key);
    return hit && prepare(new THREE.Mesh(hit[0], hit[1]));
  }
  // Built once and shared by every bear: [colour, x, y, z, sx, sy, sz] in head-bone space.
  let bearParts = null;
  const BEAR_SIZE = 0.72; // about the size of the other heads
  function bearHead() {
    if (!bearParts) {
      const ball = new THREE.SphereGeometry(1, 16, 12);
      const fur = G.toon(0x8a5f43), tan = G.toon(0xd8b08a), dark = G.toon(0x2b201c), shine = G.toon(0xffffff);
      bearParts = [
        [fur, 0, 0.28, 0.05, 0.74, 0.7, 0.7],         // skull
        [fur, 0, -0.05, 0.25, 0.6, 0.42, 0.55],       // cheeks and jaw
        [fur, -0.5, 0.86, -0.02, 0.24, 0.24, 0.14],   // ears
        [fur, 0.5, 0.86, -0.02, 0.24, 0.24, 0.14],
        [tan, -0.5, 0.86, 0.05, 0.14, 0.14, 0.1],
        [tan, 0.5, 0.86, 0.05, 0.14, 0.14, 0.1],
        [tan, 0, 0.08, 0.62, 0.34, 0.26, 0.3],        // muzzle
        [dark, 0, 0.22, 0.88, 0.13, 0.09, 0.08],      // nose
        [dark, -0.27, 0.44, 0.66, 0.085, 0.1, 0.06],  // eyes
        [dark, 0.27, 0.44, 0.66, 0.085, 0.1, 0.06],
        [shine, -0.25, 0.47, 0.71, 0.025, 0.03, 0.02],
        [shine, 0.29, 0.47, 0.71, 0.025, 0.03, 0.02],
      ].map(([mat, ...t]) => [ball, mat, t]);
    }
    const g = new THREE.Group();
    g.name = 'Bear_Head';
    g.scale.setScalar(BEAR_SIZE);
    for (const [geo, mat, [x, y, z, sx, sy, sz]] of bearParts) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }
  // In head-bone space: the knight's whole head (height, radius) and, narrower and lower, his
  // steel collar (height, radius) are not drawn; the new head sits HEAD_DROP lower in their place.
  const HEAD_CUT = [-0.05, 1.25, -0.45, 0.95];
  const HEAD_DROP = 0.3;
  // A leather collar under a person's head closes the trimmed armour (the bear's jaw does that).
  let neckGeo = null, neckMat = null;
  function neckPiece() {
    neckGeo = neckGeo || new THREE.SphereGeometry(1, 16, 10);
    neckMat = neckMat || G.toon(0x6b4630);
    const n = new THREE.Mesh(neckGeo, neckMat);
    n.position.y = -0.45;
    n.scale.set(0.45, 0.18, 0.42);
    n.castShadow = true;
    return n;
  }
  function dressKnight(model, code, crowned) {
    const L = lookParts(code), pal = KNIGHT_LOOKS.colors[L.c], wpn = KNIGHT_LOOKS.weapons[L.w];
    const pick = KNIGHT_LOOKS.heads[L.h];
    // Crowned: the helm loses its top to the crown, a hat makes way for it; the bear is the head.
    const head = pick.head || pick.bear ? Object.assign({ cut: HEAD_CUT }, pick, crowned ? { hat: null } : {}) : crowned ? CROWNED : pick;
    let sword = null, shield = null, body = null, headBone = null;
    model.traverse((x) => {
      if (x.name === '1H_Sword') sword = x;
      else if (x.name === 'Round_Shield') shield = x;
      else if (x.isSkinnedMesh) body = x;
      else if (x.isBone && x.name === 'head') headBone = x;
    });
    if (body && (pal.cloth || pal.steel || pal.trim || head.cut != null)) {
      body.material = paletteMaterial(body.material, pal, head.cut);
      const toHead = body.material.userData.toHead;
      // Mesh space to head-bone space, refreshed each frame so the cut follows the head.
      if (headBone && head.cut != null) body.onBeforeRender = () => toHead.copy(headBone.matrixWorld).invert().multiply(body.matrixWorld);
    }
    if (shield && pal.cloth) shield.traverse((x) => { if (x.isMesh) { x.material = x.material.clone(); x.material.color.set(pal.cloth).lerp(new THREE.Color(0xffffff), 0.45); } });
    if (sword && wpn.from) {
      const w = borrow(wpn.from, sword.parent);
      if (w) { sword.visible = false; sword = w; }
    }
    if (sword) {
      sword.traverse((x) => { if (x.isMesh && !x.material.userData.own) { x.material = x.material.clone(); x.material.userData.own = true; } });
      if (wpn.tint) sword.traverse((x) => { if (x.isMesh) x.material.color.setHex(wpn.tint); });
      if (wpn.scale) sword.scale.multiply(new V3(...wpn.scale));
    }
    if ((head.head || head.bear) && headBone) {
      const seat = new THREE.Group();
      seat.position.y = -HEAD_DROP;
      headBone.add(seat);
      const h = head.bear ? bearHead() : borrowHead(head.head);
      if (h) seat.add(h);
      if (!head.bear) headBone.add(neckPiece());
      if (head.hat) borrow(head.hat, seat);
    }
    return sword;
  }

  // ---------- the knight ----------
  const knightBase = M.knight;
  M.proceduralKnight = knightBase;
  // M.knight() is the player (M.heroLook); M.knight({ look, crowned }) any knight look, crowned
  // for the top of a board; other options give the old procedural soldier.
  M.knight = function (o) {
    if (o && Object.keys(o).length && !('look' in o)) return knightBase(o);
    const c = character(A.knight, 1.35);
    const anim = { walk: 0, armZ: -0.35, spin: 0, dead: 0, raise: 0, phase: Math.random() * 6 };
    const look = o && 'look' in o ? o.look : M.heroLook;
    let sword = dressKnight(c.model, look, o && o.crowned), bladeMats = [];
    if (sword) sword.traverse((x) => { if (x.isMesh) bladeMats.push(x.material); });
    c.anim.base('Idle');
    return {
      group: c.group, anim, model: c.model,
      // Seats the crown on a knight made with { crowned: true }.
      crown() {
        const cr = landmark('crown', 0.3);
        if (!cr) return null;
        // Placed in the current pose, then carried by the head bone so it tilts with the head.
        cr.position.y = KNIGHT_LOOKS.heads[lookParts(look).h].crownY || CROWNED.crownY;
        c.group.add(cr);
        const head = c.model.getObjectByName('head');
        if (head) { c.group.updateMatrixWorld(true); head.attach(cr); }
        return cr;
      },
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
    // A redesigned model for this look (assets/person_<look>.glb) replaces the shared KayKit one.
    const own = A['person_' + look];
    const c = character(own || A[LOOKS[look] || 'rogue'], look === 'king' ? 1.4 : 1.3, WEAPONS);
    if (look === 'king' && !own) {
      const mats = ownMaterials(c.model);
      Object.values(mats).flat().forEach((m) => m.color.setHex(0xffd27a));
      const crown = landmark('crown', 0.32);
      if (crown) {
        c.model.traverse((o) => { if (/Hat/.test(o.name)) o.visible = false; });
        crown.position.y = 1.18;
        c.group.add(crown);
      } else c.group.add(M.cone(0.16, 0.2, 5, G.toon(0xf2c14e), 0, 1.5, 0));
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
    // Each element has its own redesigned dragon (assets/dragon_<kind>.glb) on the shared rig;
    // without one, the base model is tinted with the element's colours.
    const own = A['dragon_' + kind];
    const c = character(own || A.dragon, DRAGON_HEIGHT * DRAGON_SIZE, null, DRAGON_HEIGHT);
    c.group.scale.setScalar(scale || 1);
    const mats = ownMaterials(c.model);
    Object.values(mats).flat().forEach((m) => { m.side = THREE.DoubleSide; });
    const flashMats = own ? Object.values(mats).flat() : [].concat(mats.Main || [], mats.Belly || [], mats.Wings || []);
    const pal = DRAGON_COLORS[kind] || DRAGON_COLORS.fire;
    const setColors = (p) => {
      ['Main', 'Wings', 'Belly', 'Claws'].forEach((n, i) => (mats[n] || []).forEach((m) => m.color.setHex(p[i])));
    };
    if (!own) setColors(pal);
    if (kind === 'demon' && !own) (mats.Eyes || []).forEach((m) => { m.color.setHex(0xff2a2a); m.emissive.setHex(0xff2a2a); });
    // The redesigned demon is lit by its own texture: its bright cracks and eyes glow, the dark
    // hide stays dark. The glow takes the colour of the element it channels.
    const glows = own && kind === 'demon';
    if (glows) flashMats.forEach((m) => { m.emissiveMap = m.map; m.emissiveIntensity = 0.65; m.needsUpdate = true; });
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
    const tint = glows ? new THREE.Color(0xffffff) : new THREE.Color(0, 0, 0);
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
        if (!own) setColors([new THREE.Color(p[0]).lerp(new THREE.Color(DRAGON_COLORS.demon[0]), 0.55).getHex(), p[0], DRAGON_COLORS.demon[2], p[3]]);
        if (glows) tint.set(0xffffff).lerp(new THREE.Color(window.Data.ELEMENTS[el].color), 0.6);
        else if (!own) tint.setHex(window.Data.ELEMENTS[el].color).multiplyScalar(0.25);
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
  // Generated village dressing (well, market stall, windmill); null when the asset is missing.
  M.prop = (name, height) => landmark(name, height);

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

  // ---------- small generated props (fall back to the procedural ones) ----------
  const chestBase = M.chest;
  M.chest = function (opened) {
    const shut = landmark('chest_closed', 0.75), open = landmark('chest_open', 0.95);
    if (!shut || !open) return chestBase(opened);
    const g = new THREE.Group();
    g.add(shut, open);
    const set = (o) => { shut.visible = !o; open.visible = o; };
    set(!!opened);
    return { group: g, open() { set(true); } };
  };
  const signBase = M.sign;
  M.sign = function () { return landmark('signpost', 1.35) || signBase(); };
  const heartBase = M.heart;
  M.heart = function () {
    const h = landmark('heart', 0.5);
    if (!h) return heartBase();
    h.children[0].position.y = -0.25; // callers float the group by its centre
    // The generated texture has bake holes; a heart is one colour, so use the shape only.
    const red = G.toon(0xff3b5c, { emissive: 0x6a0018 });
    h.traverse((m) => { if (m.isMesh) m.material = red; });
    return h;
  };

  // Rockfall boulders: KayKit rocks instead of a plain dodecahedron.
  const ROCKS = ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'];
  M.boulder = function () {
    const r = M.env(ROCKS[Math.floor(Math.random() * ROCKS.length)], 3.2);
    r.rotation.y = Math.random() * 6.3;
    r.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(0xb59a7a); } });
    return r;
  };

  window.Actors = { prepare, toonOf, character };
})();
