// Game flow: title, cutscenes, the overworld, dragon fights, saving, input and HUD.
(function () {
  'use strict';
  const G = window.Gfx, D = window.Data, Sfx = window.Sfx;
  const $ = (id) => document.getElementById(id);
  const app = $('app'), view = $('view');
  const SAVE_KEY = 'rotdd.save.v1';

  let P = null;        // the saved player
  let level = null;    // the live Level, in the world or an arena
  let busy = false;    // a scripted sequence is running
  let arenaId = null;

  // ---------- saving ----------
  function newPlayer(name) {
    return { name, hpMax: 10, sword: 4, shot: 3, relics: [], active: null, slain: [], chests: [], xp: 0, level: 1, pos: null, seenAwaken: false, tips: {}, won: false };
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: play on without saving */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      return s && s.name && Array.isArray(s.slain) ? s : null;
    } catch (e) { return null; }
  }

  function setMode(m) {
    app.className = app.className.replace(/mode-\w+/, 'mode-' + m);
  }

  // ---------- fades, banners ----------
  const wait = G.wait;
  async function fade(on) {
    $('fade').classList.toggle('on', on);
    await wait(380);
  }
  let bannerTimer = null;
  function banner(text, big) {
    const b = $('banner');
    b.textContent = text;
    b.classList.toggle('big', !!big);
    b.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('on'), big ? 1900 : 2300);
  }

  // ---------- dialogue ----------
  let dlg = null;
  function openDialog(text, name) {
    $('dname').textContent = name || '';
    $('dname').classList.toggle('on', !!name);
    $('dtext').textContent = '';
    $('dchoices').classList.remove('on');
    $('dchoices').innerHTML = '';
    $('dialog').classList.add('on');
    $('dialog').classList.remove('ready');
    app.classList.add('talking');
  }
  function closeDialog() {
    $('dialog').classList.remove('on');
    app.classList.remove('talking');
    dlg = null;
  }
  function typeOut(text, done) {
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(text.length, i + 2);
      $('dtext').textContent = text.slice(0, i);
      if (i % 6 === 0) Sfx.play('text');
      if (i >= text.length) finish();
    }, 26);
    function finish() {
      clearInterval(timer);
      $('dtext').textContent = text;
      dlg.typing = false;
      done();
    }
    return finish;
  }

  function say(text, name) {
    const m = /^([A-Z][A-Z ]+): (.*)$/.exec(text);
    if (m && !name) { name = m[1]; text = m[2]; }
    return new Promise((resolve) => {
      openDialog(text, name);
      dlg = { typing: true, resolve: () => { closeDialog(); resolve(); } };
      dlg.finish = typeOut(text, () => $('dialog').classList.add('ready'));
    });
  }

  function ask(text, options) {
    return new Promise((resolve) => {
      openDialog(text);
      dlg = { typing: true, choices: true, sel: 0 };
      const pick = (i) => { Sfx.play('select'); closeDialog(); resolve(i); };
      dlg.pick = () => pick(dlg.sel);
      dlg.move = (step) => {
        dlg.sel = (dlg.sel + step + options.length) % options.length;
        [...$('dchoices').children].forEach((b, i) => b.classList.toggle('sel', i === dlg.sel));
      };
      dlg.finish = typeOut(text, () => {
        options.forEach((label, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'menu-btn';
          b.textContent = label;
          b.addEventListener('click', (e) => { e.stopPropagation(); pick(i); });
          $('dchoices').appendChild(b);
        });
        $('dchoices').classList.add('on');
        dlg.move(0);
      });
    });
  }

  function advance() {
    if (!dlg) return false;
    if (dlg.typing) dlg.finish();
    else if (dlg.choices) dlg.pick();
    else { Sfx.play('select'); dlg.resolve(); }
    return true;
  }

  // Runs a scripted sequence with the level frozen. Ignores re-entry.
  async function scripted(fn) {
    if (busy) return;
    busy = true;
    const mine = level;
    if (mine) mine.locked = true;
    clearInput();
    try { await fn(); } finally {
      busy = false;
      if (mine && mine === level) mine.locked = false;
    }
  }

  // ---------- HUD ----------
  function renderHud() {
    if (!P || !level) return;
    const hearts = $('hearts');
    let html = '';
    for (let i = 0; i < P.hpMax / 2; i++) {
      const v = level.hp - i * 2;
      html += `<span class="heart ${v >= 2 ? '' : v === 1 ? 'half' : 'empty'}">♥</span>`;
    }
    hearts.innerHTML = html;
    $('lvl').textContent = `${P.name}  ·  Lv ${P.level}`;
    const r = $('relic');
    r.style.display = P.relics.length ? 'block' : 'none';
    r.textContent = P.active ? `${D.ELEMENTS[P.active].icon} ${D.ELEMENTS[P.active].name}` : '⚔️ Plain';
    r.style.borderColor = P.active ? D.ELEMENTS[P.active].css : '';
  }
  function renderBoss() {
    const b = level && level.boss;
    $('bossbar').style.display = b ? 'block' : 'none';
    if (!b) return;
    const weak = D.weaknessOf(b.element);
    $('bossname').textContent = `${D.ELEMENTS[b.element].icon} ${b.def.name}, ${b.def.title}`;
    $('bossfill').style.width = (100 * b.hp / b.maxHp) + '%';
    $('bosshint').textContent = `Weak to ${D.ELEMENTS[weak].icon} ${D.ELEMENTS[weak].name}` + (P.relics.includes(weak) ? (P.active === weak ? ' (ready!)' : ' (switch relic!)') : '');
  }
  function showHud(on) {
    $('hud').style.display = on ? 'block' : 'none';
    if (!on) { $('relic').style.display = 'none'; $('bossbar').style.display = 'none'; }
  }

  function cycleRelic() {
    if (!P || !P.relics.length || !level || busy) return;
    const order = [null].concat(P.relics);
    P.active = order[(order.indexOf(P.active) + 1) % order.length];
    level.refreshGlow();
    Sfx.play('select');
    renderHud();
    renderBoss();
    save();
  }

  // ---------- input ----------
  // Movement is an analog vector (x right, z down the screen), from the joystick,
  // the keys (any mix of them), or a gamepad's left stick.
  const held = new Set();
  const stick = { x: 0, z: 0, on: false };
  const padStick = { x: 0, z: 0 };
  function pushInput() {
    if (!level) return;
    let x = 0, z = 0;
    if (stick.on) { x = stick.x; z = stick.z; }
    else if (held.size) {
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) z -= 1;
      if (held.has('down')) z += 1;
      const n = Math.hypot(x, z) || 1;
      x /= n; z /= n;
    } else { x = padStick.x; z = padStick.z; }
    level.input.x = x;
    level.input.z = z;
  }
  function clearInput() {
    held.clear();
    stick.on = false; stick.x = stick.z = 0;
    padStick.x = padStick.z = 0;
    resetStick();
    pushInput();
  }
  function press(btn) {
    Sfx.unlock();
    if (dlg) { if (btn === 'A') advance(); return; }
    if (level && !busy) level.press(btn);
  }

  const KEY_DIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const KEY_BTN = { z: 'A', j: 'A', Enter: 'A', x: 'B', k: 'B', c: 'C', l: 'C', ' ': 'C' };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') $('name-ok').click(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEY_DIR[k] || KEY_BTN[k] || k === 'Tab') e.preventDefault();
    if (e.repeat) return;
    Sfx.unlock();
    if (dlg) {
      if (dlg.choices && !dlg.typing && (KEY_DIR[k] === 'up' || KEY_DIR[k] === 'left')) dlg.move(-1);
      else if (dlg.choices && !dlg.typing && (KEY_DIR[k] === 'down' || KEY_DIR[k] === 'right')) dlg.move(1);
      else if (KEY_BTN[k]) advance();
      return;
    }
    if (KEY_DIR[k]) { held.add(KEY_DIR[k]); pushInput(); }
    else if (KEY_BTN[k]) press(KEY_BTN[k]);
    else if (k === 'q' || k === 'e' || k === 'Tab') cycleRelic();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!KEY_DIR[k]) return;
    held.delete(KEY_DIR[k]);
    pushInput();
  });
  window.addEventListener('blur', () => clearInput());

  // Floating joystick: the base appears under the thumb, the knob follows it.
  const stickEl = $('stick'), baseEl = stickEl.querySelector('.base'), knobEl = stickEl.querySelector('.knob');
  const REACH = 52;
  let stickPointer = null, origin = null;
  function resetStick() {
    stickPointer = null;
    stickEl.classList.remove('active', 'moved');
    baseEl.style.left = baseEl.style.top = baseEl.style.bottom = '';
    knobEl.style.transform = '';
  }
  function stickMove(e) {
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    let m = Math.min(1, d / REACH);
    m = m < 0.15 ? 0 : m > 0.85 ? 1 : (m - 0.15) / 0.7;
    stick.on = true;
    stick.x = d ? (dx / Math.hypot(dx, dy)) * m : 0;
    stick.z = d ? (dy / Math.hypot(dx, dy)) * m : 0;
    pushInput();
  }
  stickEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.unlock();
    if (dlg) { advance(); return; }
    if (stickPointer != null) return;
    stickPointer = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    const r = stickEl.getBoundingClientRect();
    origin = { x: e.clientX, y: e.clientY };
    baseEl.style.left = (e.clientX - r.left) + 'px';
    baseEl.style.top = (e.clientY - r.top) + 'px';
    baseEl.style.bottom = 'auto';
    stickEl.classList.add('active', 'moved');
    stickMove(e);
  });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stickPointer) stickMove(e); });
  const stickUp = (e) => {
    if (e.pointerId !== stickPointer) return;
    resetStick();
    stick.on = false; stick.x = stick.z = 0;
    pushInput();
  };
  stickEl.addEventListener('pointerup', stickUp);
  stickEl.addEventListener('pointercancel', stickUp);

  // Gamepad: left stick or d-pad moves; A sword, X bolt, B dodge, bumpers switch relic.
  const padWas = {};
  function pollPad() {
    requestAnimationFrame(pollPad);
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) return;
    let x = gp.axes[0] || 0, z = gp.axes[1] || 0;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    if (b(12)) z = -1;
    if (b(13)) z = 1;
    const m = Math.hypot(x, z);
    if (m < 0.2) { x = 0; z = 0; } else if (m > 1) { x /= m; z /= m; }
    if (x !== padStick.x || z !== padStick.z) { padStick.x = x; padStick.z = z; pushInput(); }
    const edge = (i) => { const now = b(i), was = padWas[i]; padWas[i] = now; return now && !was; };
    if (dlg) {
      if (dlg.choices && !dlg.typing && (edge(12) || edge(14))) dlg.move(-1);
      else if (dlg.choices && !dlg.typing && (edge(13) || edge(15))) dlg.move(1);
      else if (edge(0) || edge(1) || edge(2)) advance();
      return;
    }
    if (edge(0)) press('A');
    if (edge(2)) press('B');
    if (edge(1)) press('C');
    if (edge(4) || edge(5)) cycleRelic();
    if (edge(9) && app.classList.contains('mode-title')) $(load() ? 'btn-continue' : 'btn-new').click();
  }
  requestAnimationFrame(pollPad);

  [['btnA', 'A'], ['btnB', 'B'], ['btnC', 'C']].forEach(([id, btn]) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); press(btn); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('down')));
  });
  $('dialog').addEventListener('click', () => { Sfx.unlock(); advance(); });
  $('c').addEventListener('click', () => { Sfx.unlock(); if (dlg && !dlg.choices) advance(); });
  $('relic').addEventListener('click', cycleRelic);
  $('mute').addEventListener('click', () => { Sfx.unlock(); $('mute').textContent = Sfx.toggleMute() ? '🔇' : '🔊'; });
  $('mute').textContent = Sfx.muted ? '🔇' : '🔊';
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- cutscenes ----------
  let skipping = false;
  $('skip').addEventListener('click', () => { skipping = true; if (dlg && dlg.resolve) { if (dlg.typing) dlg.finish(); dlg.resolve(); } });

  async function playStory(id) {
    setMode('story');
    showHud(false);
    level = null;
    skipping = false;
    view.classList.add('cinema');
    Sfx.music(id === 'awaken' ? 'final' : 'story');
    for (const shot of D.STORY[id]) {
      if (skipping) break;
      await fade(true);
      // Shots are framed for a wide screen. On a tall one, pull the camera back
      // until the same width of the set is in view.
      const tall = G.aspect() < 1;
      const fov = tall ? 64 : 46;
      const halfWidth = (f, a) => Math.tan((f / 2) * Math.PI / 180) * a;
      const pull = Math.min(2.4, Math.max(1, halfWidth(46, 1.6) / halfWidth(fov, G.aspect())));
      const back = (pos, target) => pos.map((v, i) => target[i] + (v - target[i]) * pull);
      const from = back(shot.from.pos, shot.from.target), to = back(shot.to.pos, shot.to.target);
      const set = window.Sets.create(shot.set, shot);
      if (set.fog) set.fog = [set.fog[0], set.fog[1] * pull, set.fog[2] * pull];
      G.setStage(set);
      const cam = G.cam;
      G.stopTweens(cam.pos); G.stopTweens(cam.target);
      cam.fov = fov;
      cam.pos.set(...from); cam.target.set(...shot.from.target);
      G.tween(cam.pos, { x: to[0], y: to[1], z: to[2] }, shot.ms);
      G.tween(cam.target, { x: shot.to.target[0], y: shot.to.target[1], z: shot.to.target[2] }, shot.ms);
      if (shot.phase === 'roar') Sfx.play('roar');
      await fade(false);
      for (const line of shot.lines) {
        if (skipping) break;
        await say(line.replace('{name}', P ? P.name : 'the knight'));
      }
    }
    await fade(true);
    G.stopTweens(G.cam.pos); G.stopTweens(G.cam.target);
    view.classList.remove('cinema');
  }

  // ---------- the overworld ----------
  const hooks = {
    sfx: (n) => Sfx.play(n),
    onHud: renderHud,
    // Crossing into a new region is also a quiet autosave of where you stand.
    onBanner(text, big) {
      banner(text, big);
      if (!big && level && !arenaId && level.knight) {
        P.pos = { x: level.knight.x, z: level.knight.z, rot: level.knight.rot };
        save();
      }
    },
    onBossHp: renderBoss,
    onSign: (text) => scripted(() => say(text)),
    onTalk: (def) => scripted(async () => { for (const line of def.lines) await say(line, def.name); }),
    onCastle: () => scripted(async () => {
      const lines = P.slain.length >= 4 ? D.KING_LINES.all : P.slain.length ? D.KING_LINES.some : D.KING_LINES.start;
      for (const line of lines) await say(line, 'King Aldric');
      level.heal();
      Sfx.play('heart');
      P.pos = { x: level.knight.x, z: level.knight.z, rot: level.knight.rot };
      save();
      banner('Health restored. Game saved.');
    }),
    onChest: (def) => scripted(async () => {
      P.chests.push(def.id);
      if (def.kind === 'heart') { P.hpMax += 2; level.heal(); }
      if (def.kind === 'sword') P.sword += 1;
      Sfx.play('item');
      save();
      renderHud();
      await say(def.text);
    }),
    onXp(n, pos) {
      if (P.level >= 6) return;
      P.xp += n;
      G.floatText(pos, '+' + n + ' XP', 'xp');
      const need = 2 + P.level * 2;
      if (P.xp >= need) {
        P.xp -= need;
        P.level += 1;
        P.sword += 0.5;
        if (P.level % 2 === 1) { P.hpMax += 2; level.hp += 2; }
        Sfx.play('levelup');
        banner(`Level ${P.level}! Your sword arm grows stronger.`);
        renderHud();
      }
      save();
    },
    onLair: (id) => scripted(async () => {
      const def = D.DRAGONS[id];
      P.pos = { x: level.knight.x, z: level.knight.z, rot: -Math.PI / 2 };
      if (id === 'demon' && P.slain.length < 4) {
        const left = 4 - P.slain.length;
        return say(`The Ashen Gate is sealed. ${left} seal-stone${left > 1 ? 's' : ''} still burn${left > 1 ? '' : 's'} above it, one for each living dragon.`);
      }
      if (P.slain.includes(id)) return say('The lair is silent now.');
      const go = await ask(id === 'demon' ? 'The gate stands open. Beyond it, something breathes. There is no way back.' : `${def.lair}. ${def.name}, ${def.title}, waits within.`, [id === 'demon' ? 'Face the Demon Dragon' : 'Enter the lair', 'Not yet']);
      if (go === 0) { save(); await startArena(id); }
    }),
    onDeath: () => {
      busy = false;
      if (arenaId) {
        Sfx.music(null);
        Sfx.play('defeat');
        scripted(async () => {
          const again = await ask('You have fallen...  but a knight of Valemoor does not stay down.', ['Try again', 'Retreat']);
          if (again === 0) await startArena(arenaId, true); else await startWorld();
        });
      } else {
        Sfx.play('defeat');
        scripted(async () => {
          await fade(true);
          P.pos = null;
          await startWorld(true);
          level.locked = true;
          await say('You wake in Valemoor. The healers will not say who carried you home.');
          level.locked = false;
        });
      }
    },
    onBossDefeated: () => bossDefeated(),
  };

  async function startWorld(alreadyDark) {
    busy = true;
    arenaId = null;
    if (!alreadyDark) await fade(true);
    setMode('world');
    level = window.Level.create({ kind: 'world', player: P, start: P.pos || D.START, hooks });
    pushInput();
    G.setStage(level.stage);
    Sfx.music('world');
    showHud(true);
    renderHud();
    renderBoss();
    await fade(false);
    busy = false;
  }

  async function startArena(id, retry) {
    busy = true;
    arenaId = id;
    await fade(true);
    setMode('arena');
    level = window.Level.create({ kind: 'arena', bossId: id, player: P, hooks });
    level.locked = true;
    G.setStage(level.stage);
    Sfx.music(id === 'demon' ? 'final' : 'boss');
    showHud(true);
    renderHud();
    await fade(false);
    const def = D.DRAGONS[id];
    if (!retry) {
      $('nc-name').textContent = def.name.toUpperCase();
      $('nc-title').textContent = def.title;
      $('namecard').classList.add('on');
      Sfx.play('roar');
      G.shake(0.4);
      await wait(2300);
      $('namecard').classList.remove('on');
      await say(def.intro);
      if (!P.tips.arena) {
        P.tips.arena = true;
        await say('Glowing marks on the ground strike a moment after they appear. Step off them, or roll through with (C). Slash with (A) up close, or loose bolts with (B) from anywhere below the dragon.');
      }
    }
    renderBoss();
    busy = false;
    level.locked = false;
  }

  async function bossDefeated() {
    busy = true;
    const id = arenaId;
    const def = D.DRAGONS[id];
    Sfx.music(null);
    Sfx.play('fanfare');
    await wait(900);
    if (id === 'demon') {
      P.won = true;
      P.pos = null;
      save();
      await playStory('ending');
      busy = false;
      return showTitle();
    }
    const first = P.relics.length === 0;
    P.slain.push(id);
    P.relics.push(def.element);
    P.active = def.element;
    P.hpMax += 2;
    P.sword += 1;
    P.shot += 0.5;
    level.refreshGlow();
    level.heal();
    const km = level.knightModel;
    G.tween(km.anim, { raise: 1, armZ: 0 }, 400);
    G.emit({ pos: level.knightWorldPos(), count: 50, colors: [D.ELEMENTS[def.element].color, 0xffffff], speed: 3, life: 1.2, size: 0.4 });
    Sfx.play('item');
    renderHud();
    await say(`${def.name} is slain! You claim the ${def.relic}. ${def.relicText}`);
    await say('Your life grows by one heart, and your sword strikes harder.');
    if (first) await say('Relics charge your sword and bolts with an element. Water beats Fire, Fire beats Earth, Earth beats Thunder, Thunder beats Water. Tap the relic badge (or press Q) to switch.');
    await say(P.slain.length < 4 ? 'Far to the north, a seal-stone above the Ashen Gate shatters.' : 'Far to the north, the last seal-stone shatters. The ground begins to shake.');
    save();
    if (P.slain.length >= 4 && !P.seenAwaken) {
      await playStory('awaken');
      P.seenAwaken = true;
      save();
      await startWorld(true);
      banner('The Ashen Gate is open.', true);
    } else {
      await startWorld();
    }
  }

  // ---------- title and new game ----------
  async function showTitle() {
    level = null;
    arenaId = null;
    showHud(false);
    setMode('title');
    G.setStage(window.Sets.create('castle', {}));
    const cam = G.cam;
    G.stopTweens(cam.pos); G.stopTweens(cam.target);
    cam.fov = G.aspect() < 1 ? 64 : 46;
    cam.pos.set(-18, 4, 24); cam.target.set(0, 5.5, 0);
    G.tween(cam.pos, { x: 18, y: 8 }, 90000, G.ease.linear);
    Sfx.music('title');
    $('btn-continue').style.display = load() ? 'block' : 'none';
    await fade(false);
  }

  function askName() {
    return new Promise((resolve) => {
      $('namebox').classList.add('on');
      const input = $('name-input');
      input.value = '';
      $('name-ok').onclick = () => {
        const name = input.value.trim().replace(/[<>]/g, '').slice(0, 12) || 'Knight';
        input.blur();
        $('namebox').classList.remove('on');
        Sfx.play('select');
        resolve(name);
      };
    });
  }

  $('btn-new').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    Sfx.unlock();
    Sfx.play('select');
    P = null;
    await playStory('intro');
    await fade(false);
    const name = await askName();
    P = newPlayer(name);
    await playStory('rise');
    save();
    await startWorld(true);
    scripted(async () => {
      await say('Move with the joystick, in any direction. (A) swings your sword, and talks to people. (B) looses a bolt. (C) is a dodge roll.');
      await say('The King waits at the castle gate behind you. He can heal you, and save your journey.');
    });
  });

  $('btn-continue').addEventListener('click', async () => {
    if (busy) return;
    Sfx.unlock();
    Sfx.play('select');
    P = load();
    if (!P) return;
    P.tips = P.tips || {};
    await startWorld();
  });

  // ---------- boot ----------
  if (!G.init($('c'), view)) {
    $('nogl').classList.add('on');
    return;
  }
  // Developer shortcuts, e.g. index.html?debug then DBG.boss('fire') in the console.
  if (/[?&]debug/.test(location.search)) {
    window.DBG = {
      boss(id) { P = P || newPlayer('Tester'); startArena(id); },
      world() { P = P || newPlayer('Tester'); startWorld(); },
      story(id) { P = P || newPlayer('Tester'); playStory(id).then(showTitle); },
      relics() { P.relics = D.ELEMENT_ORDER.slice(); P.slain = D.ELEMENT_ORDER.slice(); P.hpMax = 18; P.sword = 8; P.shot = 4; renderHud(); },
      god() { P.hpMax = 60; if (level) level.heal(); },
      warp(x, z) { const K = level.knight; K.x = K.circle.x = x; K.z = K.circle.z = z; },
      level: () => level, player: () => P,
    };
  }
  $('fade').classList.add('on');
  showTitle();
})();
