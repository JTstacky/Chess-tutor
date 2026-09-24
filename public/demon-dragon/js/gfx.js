// Rendering core: one Three.js renderer and camera, swappable "stages",
// tweens, a particle pool, and screen-space float text.
(function () {
  'use strict';
  const V3 = THREE.Vector3;
  const G = {};
  let renderer, scene, camera, viewEl, labelsEl, flashEl;
  let stage = null;
  let last = 0;
  let gradientMap = null;
  const tweens = [];
  const cam = { pos: new V3(0, 6, 10), target: new V3(), fov: 42, shake: 0 };
  G.cam = cam;
  G.time = 0;

  G.ease = {
    linear: (k) => k,
    inOut: (k) => k * k * (3 - 2 * k),
    out: (k) => 1 - (1 - k) * (1 - k),
    in: (k) => k * k,
  };

  G.init = function (canvas, view) {
    viewEl = view;
    labelsEl = view.querySelector('#labels');
    flashEl = view.querySelector('#flash');
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    G.camera = camera;

    // Three hard steps of light give the flat, toy-like toon look.
    const steps = new Uint8Array([90, 170, 255]);
    const format = renderer.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
    gradientMap = new THREE.DataTexture(steps, steps.length, 1, format);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;

    initParticles();
    const resize = () => {
      const w = Math.max(1, viewEl.clientWidth);
      const h = Math.max(1, viewEl.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      particleMat.uniforms.scale.value = h * renderer.getPixelRatio() * 0.9;
    };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(viewEl);
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
    return true;
  };

  G.aspect = () => camera.aspect;

  G.toon = function (color, opts) {
    return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap }, opts || {}));
  };
  G.glow = function (color, opts) {
    return new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {}));
  };

  // A vertical gradient dome, drawn behind everything.
  G.sky = function (top, bottom) {
    const geo = new THREE.SphereGeometry(180, 16, 10);
    const a = new THREE.Color(top);
    const b = new THREE.Color(bottom);
    const colors = [];
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = Math.min(1, Math.max(0, p.getY(i) / 120 + 0.12));
      const c = b.clone().lerp(a, Math.sqrt(k));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  };

  // stage: { group, update(dt, t), frame(aspect, t), bg, fog: [color, near, far] }
  G.setStage = function (next) {
    if (stage) {
      scene.remove(stage.group);
      stage.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      });
      if (stage.onRemove) stage.onRemove();
    }
    stage = next;
    clearParticles();
    labelsEl.innerHTML = '';
    cam.shake = 0;
    if (!stage) return;
    scene.add(stage.group);
    scene.background = new THREE.Color(stage.bg == null ? 0x000000 : stage.bg);
    scene.fog = stage.fog ? new THREE.Fog(stage.fog[0], stage.fog[1], stage.fog[2]) : null;
  };
  G.stage = () => stage;

  G.tween = function (target, to, ms, ease) {
    return new Promise((resolve) => {
      const from = {};
      Object.keys(to).forEach((k) => { from[k] = target[k]; });
      tweens.push({ target, from, to, ms: Math.max(1, ms), t: 0, ease: ease || G.ease.inOut, resolve });
    });
  };
  G.stopTweens = function (target) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].target === target) tweens.splice(i, 1);
  };
  G.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  G.shake = (amount) => { cam.shake = Math.max(cam.shake, amount); };

  G.flash = function (color, ms) {
    flashEl.style.transition = 'none';
    flashEl.style.background = color;
    flashEl.style.opacity = '0.75';
    void flashEl.offsetWidth;
    flashEl.style.transition = `opacity ${ms || 400}ms ease-out`;
    flashEl.style.opacity = '0';
  };

  G.project = function (v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * viewEl.clientWidth, y: (-p.y * 0.5 + 0.5) * viewEl.clientHeight, visible: p.z < 1 };
  };

  G.floatText = function (worldPos, text, cls) {
    const s = G.project(worldPos);
    if (!s.visible) return;
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    labelsEl.appendChild(el);
    setTimeout(() => el.remove(), 950);
  };

  // ---- particles ----
  const MAX = 700;
  let particleMat, particleGeo, pPos, pCol, pSize;
  const parts = [];
  let cursor = 0;

  function initParticles() {
    particleGeo = new THREE.BufferGeometry();
    pPos = new Float32Array(MAX * 3);
    pCol = new Float32Array(MAX * 4);
    pSize = new Float32Array(MAX);
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    particleGeo.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 4));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    particleMat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: 'attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float scale;' +
        'void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }',
      transparent: true, depthWrite: false,
    });
    for (let i = 0; i < MAX; i++) parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0.2, r: 1, gr: 1, b: 1 });
    const points = new THREE.Points(particleGeo, particleMat);
    points.frustumCulled = false;
    points.renderOrder = 10;
    scene.add(points);
  }

  function clearParticles() {
    parts.forEach((p) => { p.life = 0; });
  }

  const tmpColor = new THREE.Color();
  // o: { pos, count, color | colors[], speed, dir (V3), spread 0..1, size, life (s), gravity, drag, area }
  G.emit = function (o) {
    const count = o.count || 1;
    const dir = o.dir || null;
    for (let n = 0; n < count; n++) {
      const p = parts[cursor];
      const i = cursor;
      cursor = (cursor + 1) % MAX;
      const area = o.area || 0;
      pPos[i * 3] = o.pos.x + (Math.random() - 0.5) * area;
      pPos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * area * (o.flat ? 0 : 1);
      pPos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * area;
      let vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx /= len; vy /= len; vz /= len;
      if (dir) {
        const s = o.spread == null ? 0.3 : o.spread;
        vx = dir.x + vx * s; vy = dir.y + vy * s; vz = dir.z + vz * s;
      }
      const speed = (o.speed == null ? 2 : o.speed) * (0.6 + Math.random() * 0.8);
      p.vx = vx * speed; p.vy = vy * speed; p.vz = vz * speed;
      p.g = o.gravity || 0;
      p.drag = o.drag || 0;
      p.max = p.life = (o.life || 0.6) * (0.7 + Math.random() * 0.6);
      p.size = (o.size || 0.25) * (0.7 + Math.random() * 0.6);
      tmpColor.set(o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : o.color == null ? 0xffffff : o.color);
      p.r = tmpColor.r; p.gr = tmpColor.g; p.b = tmpColor.b;
    }
  };

  function updateParticles(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = parts[i];
      if (p.life <= 0) { pSize[i] = 0; continue; }
      p.life -= dt;
      p.vy -= p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      pPos[i * 3] += p.vx * dt;
      pPos[i * 3 + 1] += p.vy * dt;
      pPos[i * 3 + 2] += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      pCol[i * 4] = p.r; pCol[i * 4 + 1] = p.gr; pCol[i * 4 + 2] = p.b; pCol[i * 4 + 3] = Math.min(1, k * 1.6);
      pSize[i] = p.size * (0.4 + 0.6 * k);
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.pcolor.needsUpdate = true;
    particleGeo.attributes.size.needsUpdate = true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    G.time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt * 1000;
      const k = Math.min(1, tw.t / tw.ms);
      const e = tw.ease(k);
      for (const key in tw.to) tw.target[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    if (stage) {
      if (stage.update) stage.update(dt, G.time);
      if (stage.frame) stage.frame(camera.aspect, G.time, dt);
    }
    updateParticles(dt);
    const s = cam.shake;
    camera.position.set(cam.pos.x + (Math.random() - 0.5) * s, cam.pos.y + (Math.random() - 0.5) * s, cam.pos.z + (Math.random() - 0.5) * s * 0.5);
    camera.lookAt(cam.target);
    cam.shake = s < 0.005 ? 0 : s * Math.exp(-dt * 7);
    if (camera.fov !== cam.fov) camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  window.Gfx = G;
})();
