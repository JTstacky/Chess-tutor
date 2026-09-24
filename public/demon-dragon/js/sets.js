// 3D sets for cutscenes. A set has no camera logic of its own: the cutscene
// runner in game.js flies the camera through it.
(function () {
  'use strict';
  const G = window.Gfx, M = window.Models, D = window.Data;
  const V3 = THREE.Vector3;

  function stars(group, count) {
    const pos = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3;
      pos.push(Math.cos(a) * Math.cos(e) * 150, Math.sin(e) * 150, Math.sin(a) * Math.cos(e) * 150);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
  }

  function disc(radius, color, y) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), G.toon(color));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y || 0;
    return m;
  }

  const SETS = {
    note() {
      const group = new THREE.Group();
      group.add(new THREE.AmbientLight(0x554466, 0.5));
      const candleLight = new THREE.PointLight(0xffb45e, 1.5, 9);
      candleLight.position.set(-0.9, 1.35, -0.3);
      group.add(candleLight);
      group.add(M.box(7, 0.6, 5, G.toon(0x6b4423), 0, 0.3, 0));
      const note = M.note();
      note.rotation.x = -Math.PI / 2;
      note.rotation.z = 0.12;
      note.position.set(0, 0.61, 0);
      group.add(note);
      const dagger = new THREE.Group();
      dagger.add(M.box(0.05, 0.5, 0.12, G.toon(0xdfe7f2), 0, 0.25, 0), M.box(0.08, 0.06, 0.3, G.toon(0x2a2230), 0, 0.52, 0), M.cyl(0.04, 0.04, 0.24, 6, G.toon(0x151018), 0, 0.66, 0));
      dagger.position.set(0.02, 0.56, -0.62);
      dagger.rotation.z = 0.18;
      group.add(dagger);
      group.add(M.cyl(0.09, 0.1, 0.5, 10, G.toon(0xf5efe0), -0.9, 0.85, -0.3));
      const flame = M.cone(0.06, 0.2, 8, G.glow(0xffc04d), -0.9, 1.22, -0.3);
      group.add(flame);
      return {
        group, bg: 0x0b0710,
        update(dt, t) {
          candleLight.intensity = 1.4 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.1;
          flame.scale.y = 1 + Math.sin(t * 15) * 0.15;
        },
      };
    },

    castle(shot) {
      const dawn = !!shot.dawn;
      const group = new THREE.Group();
      group.add(G.sky(dawn ? 0x6fa8ff : 0x0a1030, dawn ? 0xffc98a : 0x3a4a86));
      if (!dawn) stars(group, 140);
      group.add(new THREE.HemisphereLight(dawn ? 0xfff0d8 : 0x8fa0ff, 0x30304a, dawn ? 0.68 : 0.55));
      const sun = new THREE.DirectionalLight(dawn ? 0xffd2a0 : 0xa8b8ff, dawn ? 0.5 : 0.5);
      sun.position.set(dawn ? 12 : -8, 9, 10);
      group.add(sun);
      const orb = M.ball(dawn ? 9 : 5, G.glow(dawn ? 0xffe2a8 : 0xf4f1d8), dawn ? 40 : -45, dawn ? 6 : 50, -120);
      orb.material.fog = false;
      group.add(orb);
      group.add(disc(90, dawn ? 0x79c957 : 0x2f5a3c));
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 60), G.toon(dawn ? 0xe6cf8f : 0x7c7560));
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, 34);
      group.add(road);
      const castle = M.castle(!dawn);
      castle.scale.setScalar(3);
      group.add(castle);
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4, r = 16 + (i % 5) * 5;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 + 6;
        if (Math.abs(x) < 3) continue;
        const green = dawn ? 0x3fa34d : 0x1f4a33;
        group.add(M.cyl(0.25, 0.35, 1.2, 6, G.toon(0x5a3a22), x, 0.6, z), M.ball(1.3, G.toon(green), x, 2.2, z), M.ball(0.9, G.toon(green), x + 0.1, 3.5, z));
      }
      const walkers = [];
      if (dawn) {
        const k = M.knight();
        k.group.scale.setScalar(1.6);
        k.group.rotation.y = Math.PI / 2;
        k.anim.walk = 1;
        group.add(k.group);
        walkers.push({ model: k, knight: true });
      } else {
        const steel = G.toon(0x9fb0c8), cloth = G.toon(0x3d7a4a), wood = G.toon(0x7a5a3a);
        for (let i = 0; i < 14; i++) {
          const s = new THREE.Group();
          s.add(M.cyl(0.2, 0.3, 0.9, 8, cloth, 0, 0.55, 0), M.ball(0.3, steel, 0, 1.25, 0), M.cyl(0.03, 0.03, 2.2, 5, wood, 0.35, 1.1, 0), M.cone(0.08, 0.3, 4, steel, 0.35, 2.3, 0));
          s.scale.setScalar(1.3);
          group.add(s);
          walkers.push({ group: s, lane: i % 2 ? 0.6 : -0.6, offset: Math.floor(i / 2) * 2.6 });
        }
      }
      return {
        group, bg: dawn ? 0xffc98a : 0x3a4a86, fog: [dawn ? 0xffc98a : 0x1a2450, 40, 150],
        update(dt, t) {
          walkers.forEach((w) => {
            if (w.knight) {
              w.model.group.position.set(0, 0, Math.max(7, 30 - t * 1.6));
              if (w.model.group.position.z <= 7) w.model.anim.walk = 0;
              w.model.update(dt, t);
            } else {
              const z = 6 + ((t * 1.5 + w.offset) % 30);
              w.group.position.set(w.lane, Math.abs(Math.sin(t * 6 + w.offset)) * 0.08, z);
            }
          });
        },
      };
    },

    dragons() {
      const group = new THREE.Group();
      group.add(new THREE.AmbientLight(0x404060, 0.55));
      group.add(disc(60, 0x16131f));
      const list = [];
      D.ELEMENT_ORDER.forEach((el, i) => {
        const d = M.dragon(el, 1.15);
        d.group.position.set(-8.4 + i * 5.6, 0, Math.abs(i - 1.5) < 1 ? -2 : 0.5);
        d.group.rotation.y = -Math.PI / 2 + (1.5 - i) * 0.3;
        group.add(d.group);
        const light = new THREE.PointLight(D.ELEMENTS[el].color, 1.3, 12);
        light.position.set(d.group.position.x, 3.5, d.group.position.z + 3.5);
        group.add(light);
        list.push({ d, light, el });
      });
      return {
        group, bg: 0x07060c, fog: [0x07060c, 12, 40],
        update(dt, t) {
          list.forEach(({ d, light, el }, i) => {
            d.anim.mouth = 0.3 + Math.sin(t * 0.9 + i) * 0.3;
            d.update(dt, t);
            light.intensity = 1.2 + Math.sin(t * 3 + i * 2) * 0.25;
            if (Math.random() < dt * 5) G.emit({ pos: d.group.position.clone().add(new V3((Math.random() - 0.5) * 3, 0.2, 1)), count: 1, color: D.ELEMENTS[el].color, dir: new V3(0, 1, 0), speed: 1.5, life: 1.8, size: 0.2, spread: 0.4 });
          });
        },
      };
    },

    hall() {
      const group = new THREE.Group();
      group.add(new THREE.HemisphereLight(0xffe8c8, 0x302030, 0.7));
      const key = new THREE.DirectionalLight(0xfff2d0, 0.7);
      key.position.set(3, 8, 5);
      group.add(key);
      const tiles = [];
      for (let z = -8; z <= 7; z++) for (let x = -5; x <= 5; x++) tiles.push([x, z]);
      const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.2, 1), G.toon(0xffffff), tiles.length);
      const o = new THREE.Object3D(), c = new THREE.Color();
      tiles.forEach(([x, z], i) => { o.position.set(x, -0.1, z); o.updateMatrix(); floor.setMatrixAt(i, o.matrix); floor.setColorAt(i, c.setHex((x + z) % 2 ? 0xd9d0c0 : 0xb8ad9a)); });
      floor.frustumCulled = false;
      group.add(floor);
      group.add(M.box(1.6, 0.03, 13, G.toon(0xb3243c), 0, 0.02, -1.5));
      group.add(M.box(11, 9, 0.5, G.toon(0x8f8676), 0, 4.5, -8.4));
      [-3.4, 3.4].forEach((x) => [-6, -2.5, 1, 4.5].forEach((z) => {
        group.add(M.cyl(0.42, 0.48, 7, 10, G.toon(0xe9e3d2), x, 3.5, z), M.box(1.2, 0.3, 1.2, G.toon(0xd3ccb8), x, 0.15, z));
        group.add(M.box(0.9, 2.2, 0.06, G.toon(0x3f6fd1), x * 0.78, 4.4, z));
      }));
      group.add(M.box(2.6, 0.5, 2, G.toon(0xd3ccb8), 0, 0.25, -6.6));
      group.add(M.box(1.2, 2.4, 0.4, G.toon(0xf2c14e), 0, 1.7, -7.3), M.box(1.2, 0.5, 1, G.toon(0xb3243c), 0, 0.75, -6.8));
      const king = M.person('king');
      king.group.scale.setScalar(1.35);
      king.group.position.set(0, 0.5, -5.9);
      king.group.rotation.y = -Math.PI / 2;
      group.add(king.group);
      const knight = M.knight();
      knight.group.rotation.y = Math.PI / 2;
      knight.anim.armZ = -1.35;
      group.add(knight.group);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.0, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
      shaft.position.set(0.6, 4.4, 0.3);
      shaft.rotation.z = 0.12;
      group.add(shaft);
      return {
        group, bg: 0x1a1420, fog: [0x1a1420, 10, 30],
        update(dt, t) {
          king.update(dt, t);
          knight.update(dt, t);
          if (Math.random() < dt * 6) G.emit({ pos: new V3(0.4 + (Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2), count: 1, color: 0xfff0c0, speed: 0.15, life: 2.5, size: 0.08 });
        },
      };
    },

    awaken(shot) {
      const phase = shot.phase;
      const group = new THREE.Group();
      group.add(G.sky(0x0a0410, phase === 'fallen' ? 0x6a4a6a : 0x5a0f26));
      group.add(new THREE.HemisphereLight(0xb090c0, 0x200818, phase === 'quiet' ? 0.5 : 0.7));
      const glow = new THREE.PointLight(0xff2a4a, phase === 'quiet' || phase === 'fallen' ? 0 : 1.6, 40);
      glow.position.set(0, 4, 5);
      group.add(glow);
      group.add(disc(70, 0x221a2a));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        const h = 5 + ((i * 7) % 5) * 1.6;
        const s = M.cone(1.3, h, 5, G.toon(0x1a1222), Math.cos(a) * 17, h / 2, Math.sin(a) * 14 - 4);
        if (Math.sin(a) < 0.75) group.add(s);
      }
      const demon = M.dragon('demon', 2.3);
      demon.group.position.set(0, 0, -1);
      demon.group.rotation.y = -Math.PI / 2;
      demon.setElement('fire');
      group.add(demon.group);
      const knight = M.knight();
      knight.group.position.set(0.4, 0, 6.2);
      knight.group.rotation.y = Math.PI / 2;
      group.add(knight.group);
      const relics = D.ELEMENT_ORDER.map((el) => {
        const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), G.glow(D.ELEMENTS[el].color));
        r.visible = phase === 'quiet';
        group.add(r);
        return r;
      });
      if (phase === 'quiet') demon.anim.rise = -6;
      if (phase === 'rise') { demon.anim.rise = -6; G.tween(demon.anim, { rise: 0 }, 6500, G.ease.inOut); }
      if (phase === 'roar') G.tween(demon.anim, { mouth: 1, flap: 3, rise: 0.4 }, 900, G.ease.out);
      if (phase === 'fallen') { demon.anim.dead = 1; demon.anim.lower = 0.4; knight.anim.armZ = -1.35; }
      let shakeT = 0;
      return {
        group, bg: 0x0a0410, fog: [phase === 'fallen' ? 0x3a2a3a : 0x2a0814, 16, 70],
        update(dt, t) {
          demon.update(dt, t);
          knight.update(dt, t);
          relics.forEach((r, i) => {
            const a = t * 1.4 + i * Math.PI / 2;
            r.position.set(0.4 + Math.cos(a) * 1.1, 1.3 + Math.sin(t * 2 + i) * 0.15, 6.2 + Math.sin(a) * 1.1);
            r.rotation.y = t * 3;
            if (r.visible && Math.random() < dt * 8) G.emit({ pos: r.position, count: 1, color: D.ELEMENTS[D.ELEMENT_ORDER[i]].color, speed: 0.5, life: 0.7, size: 0.18 });
          });
          shakeT -= dt;
          if ((phase === 'rise' || phase === 'roar') && shakeT <= 0) { shakeT = 0.12; G.shake(phase === 'roar' ? 0.25 : 0.12); }
          if (phase !== 'fallen' && Math.random() < dt * 20) G.emit({ pos: new V3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 10), count: 1, colors: [0xd21f45, 0xff7a33], dir: new V3(0, 1, 0), speed: 2, life: 2.4, size: 0.22, spread: 0.4 });
        },
      };
    },
  };

  window.Sets = { create: (name, shot) => SETS[name](shot || {}) };
})();
