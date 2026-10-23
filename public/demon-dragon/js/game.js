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
  // clock: the quest clock in seconds (world and lairs, not cutscenes or menus). seed places
  // and fills this quest's chests (Data.rollChests).
  function newPlayer(name, difficulty, look) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    return { name, look: look || '000', difficulty: difficulty || 1, fightScores: {}, hpMax: 10, sword: 4, shot: 3, relics: [], active: null, slain: [], chests: [], seed, chestSpots: D.rollChests(seed), xp: 0, level: 1, perks: {}, perkPending: 0, clock: 0, deaths: 0, pos: null, seenAwaken: false, tips: {}, won: false };
  }
  // A Trial replays one slain dragon with a fixed knight (D.trialKit) so every score on a
  // dragon's board is comparable. A trial knight is never saved.
  function trialPlayer(id, difficulty, name) {
    const k = D.trialKit(id);
    const p = newPlayer(name, difficulty, store.get(LOOK_KEY, '000'));
    Object.assign(p, { hpMax: k.hpMax, sword: k.sword, shot: k.shot, level: k.level, relics: k.relics, perks: {}, perkPending: 0, trial: id });
    p.slain = D.ELEMENT_ORDER.filter((e) => e !== id); // sets the dragon's tier, as late in the quest
    const weak = D.weaknessOf(D.DRAGONS[id].element);
    p.active = p.relics.includes(weak) ? weak : null;
    p.tips.arena = true;
    return p;
  }
  // Every M.knight() without a look (the hero, in play and in cutscenes) wears the player's.
  Object.defineProperty(window.Models, 'heroLook', { configurable: true, get: () => (P && P.look) || '000' });
  function save() {
    if (P && P.trial) return;
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

  // Roguelite level-up: upgrade cards. Only a tap or click on a card keeps one (or a gamepad's
  // Start on the highlighted card): the move, attack and dodge controls never pick, since level-ups
  // land mid-fight. Taps in the first moments are ignored too, in case one was meant for a swing.
  const PERK_GRACE = 500; // ms
  function pickPerk(title, options) {
    return new Promise((resolve) => {
      const box = $('perks');
      box.innerHTML = `<div class="ptitle">${title}</div><div class="pcards"></div>`;
      const cards = box.querySelector('.pcards');
      const opened = performance.now();
      const pick = (i) => {
        if (performance.now() - opened < PERK_GRACE) return;
        Sfx.play('select'); box.classList.remove('on'); dlg = null; resolve(i);
      };
      options.forEach((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pcard';
        const have = Perks.stacks(P, p.id);
        b.innerHTML = `<span class="picon">${p.icon}</span><span class="pname">${p.name}</span><span class="pdesc">${p.per}</span><span class="prank">${have ? `Rank ${have + 1} of ${p.max}` : p.max > 1 ? `New · up to ${p.max}` : 'New'}</span>`;
        b.addEventListener('click', (e) => { e.stopPropagation(); pick(i); });
        cards.appendChild(b);
      });
      // No card is highlighted until a gamepad or the arrow keys move to one (Start then takes it).
      dlg = { typing: false, choices: true, sel: -1, tapOnly: true };
      dlg.pick = () => { if (dlg.sel >= 0) pick(dlg.sel); };
      dlg.move = (step) => {
        dlg.sel = dlg.sel < 0 ? 0 : (dlg.sel + step + options.length) % options.length;
        [...cards.children].forEach((b, i) => b.classList.toggle('sel', i === dlg.sel));
      };
      box.classList.add('on');
    });
  }

  // Offers one upgrade per level gained; picks still owed (cutscene, fight end) wait in P.perkPending.
  function offerPerks() {
    if (!P || !P.perkPending || busy || !level || level.over) return;
    scripted(async () => {
      while (P.perkPending > 0) {
        const options = Perks.roll(P, Perks.choices(P.level));
        if (!options.length) { P.perkPending = 0; break; }
        const i = await pickPerk(`Level ${P.level}! Choose an upgrade`, options);
        const def = Perks.take(P, options[i].id);
        P.perkPending -= 1;
        if (def && def.id === 'vigor') { P.hpMax += 2; level.heal(); }
        G.emit({ pos: level.knightWorldPos(), count: 26, colors: [0xffe680, 0xffffff], speed: 2.4, life: 0.8, size: 0.32 });
        banner(`${def ? def.name : 'Upgrade'}!`);
        renderHud();
        save();
      }
    });
  }

  function advance() {
    if (!dlg) return false;
    if (dlg.tapOnly) return true; // upgrade cards: only a tap on a card picks
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
    if (P && P.perkPending && level && !level.over) setTimeout(offerPerks, 0);
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
    const dn = D.difficulty(P.difficulty).name;
    $('lvl').textContent = P.trial ? `${P.name}  ·  Trial  ·  ${dn}` : `${P.name}  ·  Lv ${P.level}  ·  ${dn}`;
    const r = $('relic');
    r.style.display = P.relics.length ? 'block' : 'none';
    r.textContent = P.active ? `${D.ELEMENTS[P.active].icon} ${D.ELEMENTS[P.active].name}` : '⚔️ Plain';
    r.style.borderColor = P.active ? D.ELEMENTS[P.active].css : '';
    const x = $('btnX');
    x.classList.toggle('off', !P.relics.length);
    x.innerHTML = `${P.active ? D.ELEMENTS[P.active].icon : '⚔️'}<small>relic</small>`;
    x.style.background = P.active ? D.ELEMENTS[P.active].css : '';
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
    if (window.TGController?.paused) return;
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
      if (dlg.side && (KEY_DIR[k] === 'left' || KEY_DIR[k] === 'right')) dlg.side(KEY_DIR[k] === 'left' ? -1 : 1);
      else if (dlg.choices && !dlg.typing && (KEY_DIR[k] === 'up' || KEY_DIR[k] === 'left')) dlg.move(-1);
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
  window.addEventListener('tg-input-reset', () => clearInput());

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
    if (dlg) { if (!dlg.sheet) advance(); return; }
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

  // Gamepad, laid out like the buttons on screen: Y (top) relic, X (left) dodge, A (bottom)
  // bolt, B (right) sword; the bumpers switch relic too.
  const padWas = {};
  function pollPad() {
    requestAnimationFrame(pollPad);
    let gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp || document.hidden || window.TGController?.suspended) {
      if (padStick.x || padStick.z) { padStick.x = padStick.z = 0; pushInput(); }
      for (const i in padWas) padWas[i] = false;
      return;
    }
    gp = window.TGController?.filterPad(gp) || gp;
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
      if (dlg.side && (edge(14) || edge(15))) dlg.side(padWas[14] ? -1 : 1);
      else if (dlg.choices && !dlg.typing && (edge(12) || edge(14))) dlg.move(-1);
      else if (dlg.choices && !dlg.typing && (edge(13) || edge(15))) dlg.move(1);
      else if (dlg.tapOnly) { if (edge(9)) dlg.pick(); }
      else if (edge(0) || edge(1) || edge(2) || edge(3)) advance();
      return;
    }
    if (edge(1)) press('A');
    if (edge(0)) press('B');
    if (edge(2)) press('C');
    if (edge(3) || edge(4) || edge(5)) cycleRelic();
    if (edge(9) && app.classList.contains('mode-title')) $(load() ? 'btn-continue' : 'btn-new').click();
  }
  requestAnimationFrame(pollPad);

  [['btnA', 'A'], ['btnB', 'B'], ['btnC', 'C'], ['btnX', 'X']].forEach(([id, btn]) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); if (btn === 'X') { Sfx.unlock(); if (dlg) advance(); else cycleRelic(); } else press(btn); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('down')));
  });
  $('dialog').addEventListener('click', () => { Sfx.unlock(); advance(); });
  $('c').addEventListener('click', () => { Sfx.unlock(); if (dlg && !dlg.choices) advance(); });
  // The relic badge switches on pointerdown, like A/B/C, so a second finger can tap it while the
  // first holds the joystick (phones send no click for a second touch). click stays for the
  // keyboard (detail 0) only, so a mouse or single tap doesn't switch twice.
  $('relic').addEventListener('pointerdown', (e) => { e.preventDefault(); Sfx.unlock(); cycleRelic(); });
  $('relic').addEventListener('click', (e) => { if (e.detail === 0) cycleRelic(); });
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
      const k = def.kind;
      if (k === 'heart') { P.hpMax += 2; level.heal(); }
      if (k === 'sword') P.sword += 1;
      if (k === 'shot') P.shot += 0.5;
      if (k === 'hourglass') P.clock = Math.max(0, (P.clock || 0) - 30);
      if (k === 'scroll') P.perkPending = (P.perkPending || 0) + 1;
      Sfx.play('item');
      save();
      renderHud();
      const tome = 4 + 3 * P.slain.length;
      await say(D.CHEST_KINDS[k].text + (k === 'tome' ? ` (+${tome} XP)` : ''));
      if (k === 'tome') addXp(tome, level.knightWorldPos());
    }),
    onXp: (n, pos) => addXp(n, pos),
    onClock(dt) {
      if (!P || P.trial) return;
      P.clock = (P.clock || 0) + dt;
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
      // Every death in a quest costs points (Data.DEATH_COST, times the difficulty).
      const cost = P.trial ? '' : `  (-${(D.DEATH_COST * D.difficulty(P.difficulty).level).toLocaleString()} points)`;
      if (!P.trial) { P.deaths = (P.deaths || 0) + 1; save(); }
      if (arenaId) {
        Sfx.music(null);
        Sfx.play('defeat');
        scripted(async () => {
          const again = await ask('You have fallen...  but a knight of Valemoor does not stay down.' + cost, ['Try again', P.trial ? 'Back to Trials' : 'Retreat']);
          if (again === 0) await startArena(arenaId, true);
          else if (P.trial) await openTrials(true);
          else await startWorld();
        });
      } else {
        Sfx.play('defeat');
        scripted(async () => {
          await fade(true);
          P.pos = null;
          await startWorld(true);
          level.locked = true;
          await say('You wake in Valemoor. The healers will not say who carried you home.' + cost);
          level.locked = false;
        });
      }
    },
    onBossDefeated: () => bossDefeated(),
  };

  // Experience from drakelings, journals and dragons. Quick Study multiplies it; every level
  // owes an upgrade pick, offered as soon as play allows.
  function addXp(n, pos) {
    if (!P || P.trial || P.level >= Perks.MAX_LEVEL) return;
    n = Math.round(n * Perks.stat(P, 'xp'));
    P.xp += n;
    if (pos) G.floatText(pos, '+' + n + ' XP', 'xp');
    let up = false;
    while (P.level < Perks.MAX_LEVEL && P.xp >= Perks.xpNeeded(P.level)) {
      P.xp -= Perks.xpNeeded(P.level);
      P.level += 1;
      // The old fixed growth stays for the first levels; every level also brings an upgrade pick.
      if (P.level <= 6) {
        P.sword += 0.5;
        if (P.level % 2 === 1) { P.hpMax += 2; if (level) level.hp += 2; }
      }
      P.perkPending = (P.perkPending || 0) + 1;
      up = true;
    }
    if (up) { Sfx.play('levelup'); renderHud(); setTimeout(offerPerks, 350); }
    save();
  }

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
    offerPerks();
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
    const f = fightRecord(id);
    const s = D.fightScore(f);
    Sfx.music(null);
    Sfx.play('fanfare');
    await wait(900);
    if (P.trial) return trialWon(id, f);
    P.fightScores = P.fightScores || {};
    P.fightScores[id] = Object.assign({ total: s.total }, f);
    unlockTrial(id);
    save();
    await sheet(scoreHtml(`${icon(id)} ${def.name} slain!`, f, s), ['Continue']);
    if (id === 'demon') {
      P.won = true;
      P.pos = null;
      save();
      await questResults();
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
    if (first) await say('Relics charge your sword and bolts with an element. Water beats Fire, Fire beats Earth, Earth beats Thunder, Thunder beats Water. Press the top button (or Q) to switch.');
    await say(P.slain.length < 4 ? 'Far to the north, a seal-stone above the Ashen Gate shatters.' : 'Far to the north, the last seal-stone shatters. The ground begins to shake.');
    addXp(6 + 3 * P.slain.length, level.knightWorldPos());
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

  // ---------- panels: difficulty, results, Trials, high scores ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };
  const BEST_KEY = 'rotdd.best.v1', TRIALS_KEY = 'rotdd.trials.v1', NAME_KEY = 'rotdd.name', LOOK_KEY = 'rotdd.look', PRACTICE_KEY = 'rotdd.practice.v1';
  // The one world board: whole quests on one clock, deaths counted (Data.questScore).
  const BOARD = 'quest2';
  const TRIAL_IDS = D.ELEMENT_ORDER.concat('demon');
  const icon = (id) => (id === 'demon' ? '🐲' : D.ELEMENTS[D.DRAGONS[id].element].icon);

  // Shows a panel with a set of buttons and resolves with the index picked. Arrows, the
  // stick and (A) work as in a dialogue choice. Buttons are labels or { html, disabled }.
  function sheet(html, buttons, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const box = $('sheet');
      box.innerHTML = `<div class="panel${opts.wide ? ' wide' : ''}">${html}<div class="sbtns ${opts.layout || ''}"></div></div>`;
      const row = box.querySelector('.sbtns');
      const live = [];
      const pick = (i) => { Sfx.play('select'); box.classList.remove('on'); dlg = null; resolve(i); };
      buttons.forEach((b, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'menu-btn';
        el.innerHTML = typeof b === 'string' ? esc(b) : b.html;
        if (b.disabled) el.disabled = true; else live.push(i);
        el.addEventListener('click', (e) => { e.stopPropagation(); if (!el.disabled) pick(i); });
        row.appendChild(el);
      });
      let at = Math.max(0, live.indexOf(opts.sel == null ? live[0] : opts.sel));
      dlg = { typing: false, choices: true, sheet: true };
      dlg.pick = () => pick(live[at]);
      dlg.move = (step) => {
        at = (at + step + live.length) % live.length;
        [...row.children].forEach((el, i) => el.classList.toggle('sel', i === live[at]));
      };
      box.classList.add('on');
      dlg.move(0);
    });
  }

  const DIFF_NOTES = {
    1: 'Any element does full damage. One drakeling.',
    2: 'Quicker dragons. Wrong elements do ¾ damage.',
    3: 'Wrong elements do half. Hits hurt 1.5×. Two drakelings.',
    4: 'Combos and feints. Wrong elements do ¼. Three drakelings.',
    5: 'Wrong elements do nothing. Hits hurt 2×. Four drakelings.',
  };
  async function pickDifficulty(sel, back) {
    const opts = [1, 2, 3, 4, 5].map((n) => ({ html: `<b>${n} · ${D.difficulty(n).name}</b><small>${DIFF_NOTES[n]}</small>` }));
    if (back) opts.push('Back');
    const i = await sheet('<div class="stitle">Choose your difficulty</div><div class="snote">Your quest score is multiplied by the level. Dragons never gain health: they strike faster and less predictably, hit harder, resist the wrong element and bring drakelings.</div>',
      opts, { sel: (sel || 1) - 1, layout: 'list' });
    return i < 5 ? i + 1 : null;
  }

  // World scores (the tenggames-scores worker). ?scores=http://localhost:PORT points a
  // local test at a local worker.
  const SCORES_URL = (() => {
    const o = new URLSearchParams(location.search).get('scores');
    return o && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : 'https://tenggames-scores.justintengyz.workers.dev';
  })();
  async function scoresApi(path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(SCORES_URL + path, body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }
        : { signal: ctl.signal });
      const j = await r.json();
      return r.ok ? j : { error: j.error || 'error' };
    } catch (e) { return { error: 'offline' }; } finally { clearTimeout(timer); }
  }
  // Posts a result, keeps the local best, and writes the outcome into the open panel.
  async function postScore(board, run, total, diff, name) {
    const bests = store.get(BEST_KEY, {});
    const old = bests[board];
    if (!old || total > old.total) { bests[board] = { total, diff }; store.set(BEST_KEY, bests); }
    const mine = !old ? '' : total > old.total ? `New personal best! (was ${old.total.toLocaleString()})` : `Your best: ${old.total.toLocaleString()}`;
    const r = await scoresApi('/scores', Object.assign({ game: 'demon-dragon', board, name, diff, look: (P && P.look) || '000' }, run));
    const world = r.error === 'offline' ? 'Could not reach the world board. Your best is kept on this device.'
      : r.error ? `The world board did not take this score (${r.error}).`
      : `World rank #${r.rank} of ${r.count}`;
    const el = $('srank');
    if (el) el.innerHTML = `<b>${esc(world)}</b>${mine ? `<br>${esc(mine)}` : ''}`;
    if (r.error) return;
    const top = await scoresApi(`/scores?board=${board}&limit=3`);
    const pod = $('spodium');
    if (pod && !top.error) pod.innerHTML = podiumHtml(top.entries);
  }

  // The top three of a board as portraits of their knights, a crown on the first.
  const portraits = new Map();
  const lookOk = (l) => (/^\d{3}$/.test(l || '') ? l : '000');
  function portrait(look, crowned) {
    const key = look + (crowned ? 'c' : '');
    if (!portraits.has(key)) {
      const k = window.Models.knight({ look, crowned });
      if (crowned) { k.crown(); k.anim.raise = 1; }
      k.group.rotation.y = -Math.PI / 2 + 0.5;
      k.update(0.45);
      portraits.set(key, G.snapshot(k.group, 150, 190, (cam) => { cam.position.set(0, 1.0, 5.2); cam.lookAt(0, 0.82, 0); }));
    }
    return portraits.get(key);
  }
  function podiumHtml(entries) {
    const top = (entries || []).slice(0, 3);
    if (!top.length) return '';
    const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
    return '<div class="podium">' + order.map((i) => {
      const e = top[i];
      return `<div class="pod p${i + 1}"><img alt="" src="${portrait(lookOk(e.look), i === 0)}"><b>${esc(e.name)}</b><small>${e.total.toLocaleString()}</small><span class="step">${i + 1}</span></div>`;
    }).join('') + '</div>';
  }

  function fightRecord(id) {
    return { id, tier: id === 'demon' ? 0 : Math.min(3, P.slain.length), t: Math.max(5, Math.round(level.stats.t * 10) / 10), taken: level.stats.taken, hpMax: P.hpMax };
  }
  const row = (a, b, cls) => `<div class="srow ${cls || ''}"><span>${a}</span><b>${b}</b></div>`;
  // After a dragon in a quest: what the fight adds, and where the quest stands.
  function scoreHtml(title, f, s) {
    return `<div class="stitle">${title}</div>`
      + row('Victory', '+1000')
      + row(`Health <small>${f.taken / 2} of ${f.hpMax / 2} hearts lost</small>`, `+${s.kept}`)
      + (s.flawless ? row('Flawless!', `+${s.flawless}`, 'gold') : '')
      + `<div class="stotal">+${s.total.toLocaleString()}</div>`
      + `<div class="snote">Fight ${clock(f.t)} · Quest clock ${clock(P.clock || 0)}${P.deaths ? ` · ${P.deaths} death${P.deaths > 1 ? 's' : ''}` : ''}<br>The clock keeps running in the open world.</div>`;
  }
  function unlockTrial(id) {
    const open = store.get(TRIALS_KEY, []);
    if (!open.includes(id)) { open.push(id); store.set(TRIALS_KEY, open); }
  }

  // Trials are practice: no score, just the fight and this device's best time.
  async function trialWon(id, f) {
    const name = P.name, diff = P.difficulty;
    const bests = store.get(PRACTICE_KEY, {}), key = id + diff, old = bests[key];
    if (!old || f.t < old) { bests[key] = f.t; store.set(PRACTICE_KEY, bests); }
    const df = D.difficulty(diff);
    const c = await sheet(`<div class="stitle">${icon(id)} Practice: ${D.DRAGONS[id].name}</div>`
      + row('Time', clock(f.t)) + row('Hearts lost', `${f.taken / 2} of ${f.hpMax / 2}`)
      + `<div class="snote">${df.name} difficulty · ${!old ? 'First win at this difficulty' : f.t < old ? `New best time! (was ${clock(old)})` : `Best time ${clock(old)}`}<br>Trials are practice. Only a whole quest goes on the world board.</div>`,
      ['Fight again', 'Trials', 'Title'], { layout: 'row' });
    busy = false;
    if (c === 0) { P = trialPlayer(id, diff, name); return startArena(id, true); }
    if (c === 1) return openTrials(true);
    await fade(true);
    return showTitle();
  }

  // The world board takes a whole story run: all five dragons, the quest clock and the deaths.
  async function questResults() {
    const fights = TRIAL_IDS.map((id) => P.fightScores[id]).filter(Boolean).map(({ id, tier, t, taken, hpMax }) => ({ id, tier, t, taken, hpMax }));
    const df = D.difficulty(P.difficulty);
    const t = Math.round(P.clock || 0), deaths = P.deaths || 0;
    const q = D.questScore({ diff: P.difficulty, fights, t, deaths });
    const rows = fights.map((f) => row(`${icon(f.id)} ${D.DRAGONS[f.id].name} <small>${f.taken / 2} hearts lost</small>`, `+${D.fightScore(f).total.toLocaleString()}`)).join('')
      + row(`Quest time ${clock(t)} <small>par ${clock(D.QUEST_PAR)}</small>`, `+${q.time.toLocaleString()}`)
      + row(`Deaths <small>${deaths}</small>`, deaths ? `-${q.deaths.toLocaleString()}` : '0', deaths ? '' : 'gold')
      + row(`${df.name} difficulty`, `×${df.level}`);
    const whole = fights.length === 5 && !P.untimed;
    const shown = sheet(`<div class="stitle">Quest complete</div><div class="snote">${esc(P.name)} · ${df.name} difficulty</div>${rows}<div class="stotal">${q.total.toLocaleString()}</div>`
      + `<div id="srank" class="snote">${whole ? 'Sending to the world board…' : 'This journey began before the quest clock was kept, so it cannot go on the world board. Start a new quest to post one.'}</div><div id="spodium"></div>`, ['Continue']);
    if (whole) postScore(BOARD, { fights, t, deaths }, q.total, P.difficulty, P.name);
    await shown;
  }

  async function openTrials(fromGame) {
    busy = true;
    if (fromGame) { await fade(true); await showTitle(); }
    const open = store.get(TRIALS_KEY, []);
    const practice = store.get(PRACTICE_KEY, {});
    const bestTime = (id) => { const ts = [1, 2, 3, 4, 5].map((d) => practice[id + d]).filter(Boolean); return ts.length ? 'Best ' + clock(Math.min(...ts)) : 'Not yet won'; };
    const pick = await sheet('<div class="stitle">Trials</div><div class="snote">Practise a dragon you have slain, with a set knight: 8 hearts and the three other relics (10 hearts and all four for the Demon Dragon). Trials are not scored; only a whole quest goes on the world board.</div>',
      TRIAL_IDS.map((id) => (open.includes(id)
        ? { html: `${icon(id)} ${D.DRAGONS[id].name}<small>${bestTime(id)}</small>` }
        : { html: `🔒 ${D.DRAGONS[id].name}<small>Slay it in the quest</small>`, disabled: true })).concat(['Back']),
      { layout: 'grid' });
    if (pick === TRIAL_IDS.length) { busy = false; return; }
    const id = TRIAL_IDS[pick];
    const diff = await pickDifficulty(store.get('rotdd.diff', 1), true);
    if (!diff) return openTrials(false);
    store.set('rotdd.diff', diff);
    let name = store.get(NAME_KEY, null) || (load() || {}).name;
    if (!name) { name = await askName(); store.set(NAME_KEY, name); store.set(LOOK_KEY, await createKnight(name, '000')); }
    P = trialPlayer(id, diff, name);
    busy = false;
    await startArena(id);
  }

  function boardRows(r) {
    if (r.error) return '<div class="snote">Could not reach the world board.</div>';
    if (!r.entries.length) return '<div class="snote">No scores yet. Be the first!</div>';
    return podiumHtml(r.entries) + '<table class="board">' + r.entries.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.total.toLocaleString()}</td><td>${esc(D.difficulty(e.diff).name)}</td><td>${clock(e.t)}</td></tr>`).join('') + '</table>';
  }
  async function openBoards() {
    busy = true;
    const best = store.get(BEST_KEY, {})[BOARD];
    const shown = sheet(`<div class="stitle">World high scores</div><div class="snote">Whole quests: all five dragons on one clock, which runs in the open world too. Deaths cost points.${best ? ` Your best ${best.total.toLocaleString()}.` : ''}</div><div id="sboard"><div class="snote">Loading…</div></div>`,
      ['Back'], { wide: true });
    scoresApi(`/scores?board=${BOARD}&limit=10`).then((r) => { const el = $('sboard'); if (el) el.innerHTML = boardRows(r); });
    await shown;
    busy = false;
  }

  // The quest clock (world and lairs) in a quest, the fight clock in a Trial. A quest also
  // saves its clock now and then, so a reload loses little.
  let clockSaves = 0;
  setInterval(() => {
    const trial = P && P.trial;
    const on = !!(level && P && (trial ? arenaId && level.stats : true));
    $('timer').style.display = on ? 'block' : 'none';
    if (!on) return;
    $('timer').textContent = '⏱ ' + clock(trial ? level.stats.t : P.clock || 0);
    if (!trial && ++clockSaves % 40 === 0) save();
  }, 250);

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
    const saved = load();
    $('btn-continue').style.display = saved ? 'block' : 'none';
    // Dragons slain in a quest from before Trials existed count too.
    if (saved) { saved.slain.forEach(unlockTrial); if (saved.won) unlockTrial('demon'); }
    $('btn-trials').style.display = store.get(TRIALS_KEY, []).length ? 'block' : 'none';
    await fade(false);
  }

  // ---------- character creator ----------
  // The knight on a turntable with three rows of choices. Tap a row's arrows (or left/right)
  // to step through it; up/down or the stick picks a row; A steps the row forward.
  function creatorStage() {
    const group = new THREE.Group();
    group.add(G.sky(0x8fc3ee, 0xfbeed2));
    group.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(3, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    group.add(sun);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.24, 48), G.toon(0xd8c095));
    disc.position.y = -0.12;
    disc.receiveShadow = true;
    group.add(disc);
    let knight = null, turn = 0;
    return {
      group, bg: 0xfbeed2,
      set(code, move) {
        if (knight) group.remove(knight.group);
        knight = window.Models.knight({ look: code });
        group.add(knight.group);
        if (move) knight.play(move, 1.4);
      },
      cheer() { if (knight) knight.anim.raise = 1; },
      update(dt) {
        turn += dt;
        if (knight) { knight.group.rotation.y = -Math.PI / 2 + Math.sin(turn * 0.6) * 0.7; knight.update(dt); }
      },
      frame(aspect) {
        const tall = aspect < 1;
        G.cam.fov = tall ? 34 : 30;
        // The panel covers the bottom half (tall) or the right side (wide); keep the knight clear of it.
        G.cam.target.set(tall ? 0 : 1.15, tall ? 0.05 : 0.7, 0);
        G.cam.pos.set(tall ? 0 : 1.15, tall ? 1.3 : 1.4, tall ? 6.4 : 5.4);
      },
    };
  }
  function createKnight(name, look) {
    return new Promise((resolve) => {
      const K = window.Models.KNIGHT_LOOKS, parts = window.Models.lookParts(look);
      const rows = [['c', 'Colours', K.colors], ['w', 'Weapon', K.weapons], ['h', 'Head', K.heads]];
      const code = () => `${parts.c}${parts.w}${parts.h}`;
      setMode('story');
      const stage = creatorStage();
      G.setStage(stage);
      stage.set(code());
      const box = $('creator');
      let sel = 0;
      const MOVES = { c: 'Interact', w: 'Chop', h: 'Interact' };
      function step(i, s) {
        const [k, , list] = rows[i];
        parts[k] = (parts[k] + s + list.length) % list.length;
        Sfx.play('select');
        stage.set(code(), MOVES[k]);
        draw();
      }
      function draw() {
        box.innerHTML = `<div class="ctitle">Sir ${esc(name)}</div>` + rows.map(([k, label, list], i) => {
          const o = list[parts[k]];
          const sw = o.swatch != null ? `<i class="sw" style="background:#${o.swatch.toString(16).padStart(6, '0')}"></i>` : '';
          return `<div class="crow${i === sel ? ' sel' : ''}"><button type="button" class="cstep" data-i="${i}" data-s="-1" aria-label="Previous">◀</button>`
            + `<button type="button" class="cval" data-i="${i}" data-s="1"><small>${label}</small><span>${sw}${esc(o.name)}</span></button>`
            + `<button type="button" class="cstep" data-i="${i}" data-s="1" aria-label="Next">▶</button></div>`;
        }).join('') + `<div class="cbtns"><button type="button" class="menu-btn${sel === 3 ? ' sel' : ''}" data-a="rand">🎲 Surprise me</button><button type="button" class="menu-btn${sel === 4 ? ' sel' : ''}" data-a="done">Ready!</button></div>`;
      }
      function random() {
        rows.forEach(([k, , list]) => { parts[k] = Math.floor(Math.random() * list.length); });
        Sfx.play('select');
        stage.set(code(), 'Chop');
        draw();
      }
      async function done() {
        box.onclick = null;
        dlg = null;
        Sfx.play('item');
        stage.cheer();
        box.classList.remove('on');
        await wait(900);
        resolve(code());
      }
      box.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.a === 'rand') return random();
        if (b.dataset.a === 'done') return done();
        sel = +b.dataset.i;
        step(sel, +b.dataset.s);
      };
      dlg = { typing: false, choices: true, sheet: true };
      dlg.move = (s) => { sel = (sel + s + 5) % 5; draw(); };
      dlg.side = (s) => { if (sel < 3) step(sel, s); else dlg.move(s); };
      dlg.pick = () => (sel < 3 ? step(sel, 1) : sel === 3 ? random() : done());
      draw();
      box.classList.add('on');
    });
  }

  function askName() {
    return new Promise((resolve) => {
      $('namebox').classList.add('on');
      const input = $('name-input');
      const q = $('namebox').querySelector('.q'), ask0 = 'What is your name, knight?';
      q.textContent = ask0;
      q.classList.remove('warn');
      input.value = '';
      $('name-ok').onclick = () => {
        const r = Names.check(input.value);
        if (!r.ok) {
          q.textContent = 'That name is not fit for a knight. Choose another.';
          q.classList.add('warn');
          Sfx.play('plink');
          input.select();
          return;
        }
        q.textContent = ask0;
        q.classList.remove('warn');
        const name = r.name;
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
    store.set(NAME_KEY, name);
    const look = await createKnight(name, store.get(LOOK_KEY, '000'));
    store.set(LOOK_KEY, look);
    const diff = await pickDifficulty(store.get('rotdd.diff', 1));
    store.set('rotdd.diff', diff);
    P = newPlayer(name, diff, look);
    await playStory('rise');
    save();
    await startWorld(true);
    scripted(async () => {
      await say('Move with the joystick, in any direction. (A) swings your sword, and talks to people. (B) looses a bolt. (C) is a dodge roll. The top button switches relics, once you have one.');
      await say('The quest clock is running, out here as well as in the lairs. Grow stronger first, or race to the dragons: a faster quest scores more, and every fall costs points.');
      await say('Chests are hidden across Valemoor, different in every quest. The King waits at the castle gate behind you. He can heal you, and save your journey.');
    });
  });

  $('btn-trials').addEventListener('click', () => { if (busy) return; Sfx.unlock(); Sfx.play('select'); openTrials(false); });
  $('btn-scores').addEventListener('click', () => { if (busy) return; Sfx.unlock(); Sfx.play('select'); openBoards(); });

  $('btn-continue').addEventListener('click', async () => {
    if (busy) return;
    Sfx.unlock();
    Sfx.play('select');
    P = load();
    if (P) P.name = Names.check(P.name).name;
    if (!P) return;
    P.tips = P.tips || {};
    P.difficulty = P.difficulty || 1;
    P.fightScores = P.fightScores || {};
    if (!P.chestSpots) { P.seed = Math.floor(Math.random() * 2 ** 31); P.chestSpots = D.rollChests(P.seed); }
    if (P.clock == null) { P.clock = 0; P.deaths = 0; P.untimed = P.slain.length > 0; }
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
      boss(id, diff) { P = P || newPlayer('Tester', diff); startArena(id); },
      trial(id, diff) { P = trialPlayer(id, diff || 5, 'Tester'); startArena(id); },
      diff(n) { P.difficulty = n; },
      world() { P = P || newPlayer('Tester'); startWorld(); },
      story(id) { P = P || newPlayer('Tester'); playStory(id).then(showTitle); },
      relics() { P.relics = D.ELEMENT_ORDER.slice(); P.slain = D.ELEMENT_ORDER.slice(); P.hpMax = 18; P.sword = 8; P.shot = 4; renderHud(); },
      god() { P.hpMax = 60; if (level) level.heal(); },
      warp(x, z) { const K = level.knight; K.x = K.circle.x = x; K.z = K.circle.z = z; },
      level: () => level, player: () => P,
      creator: (name, look) => createKnight(name || 'Tester', look || '000'),
      die: () => hooks.onDeath(),
      xp: (n) => addXp(n),
      podium: (entries) => sheet(`<div class="stitle">World high scores</div>${podiumHtml(entries)}`, ['Back']),
    };
  }
  $('fade').classList.add('on');
  showTitle();
})();
