// The relay transports battle pixels and input; it never sees game data.
// A viewer controls only while the holder has granted that exact seat control.
const KEY = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Escape|Space|Backspace|F2)$/;
const FIXED_KEYS = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, Space: 32, Backspace: 8, F2: 113 };
// The legacy keyCode SDL reads, derived from the allowed code so a remote seat can't send other keys.
export const keyCodeFor = code => !KEY.test(code ?? '') ? null
  : code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : FIXED_KEYS[code];

export function validBattleInput(value) {
  if (!value || value.type !== 'input') return false;
  if (value.event === 'keydown' || value.event === 'keyup')
    return typeof value.code === 'string' && KEY.test(value.code) &&
      typeof value.key === 'string' && value.key.length <= 12 &&
      value.keyCode === keyCodeFor(value.code);
  return ['down', 'move', 'up'].includes(value.event) &&
    Number.isFinite(value.x) && value.x >= 0 && value.x <= 1 &&
    Number.isFinite(value.y) && value.y >= 0 && value.y <= 1 &&
    (value.button === 0 || value.button === 2);
}

export function createBattleStream({ canvas, stage, setup, game, send, getSeat, getModule,
  onStatus = () => {},
  now = () => performance.now(), timer = setInterval, untimer = clearInterval }) {
  if (!canvas || !stage) return null;
  const viewer = document.createElement('canvas');
  viewer.id = 'remote-battle'; viewer.width = 800; viewer.height = 600;
  viewer.tabIndex = 0; viewer.hidden = true;
  viewer.setAttribute('aria-label', 'Your remote battle screen');
  stage.append(viewer);
  const controls = document.createElement('div');
  controls.id = 'remote-battle-controls'; controls.hidden = true;
  const buttons = [
    ['Enter', 'Enter', 13], ['Back', 'Escape', 27], ['Right-click', null, 0],
  ];
  for (const [label, code, keyCode] of buttons) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {
      if (room?.viewer !== local() || room.controller !== local()) return;
      if (!code) {
        rightClick = !rightClick;
        button.setAttribute('aria-pressed', String(rightClick));
        return;
      }
      for (const kind of ['keydown', 'keyup'])
        send({ type: 'input', event: kind, code, key: code, keyCode });
      viewer.focus();
    });
    controls.append(button);
  }
  game.append?.(controls);
  const context = viewer.getContext('2d');
  let room = null, roomReceivedAt = 0, remoteSeat = -1, remoteColor = -1;
  let live = false, remoteActive = false, botEnabled = false, sending = false, lastFrame = 0;
  let pointer = null, rightClick = false;
  const local = () => getSeat();
  const holder = () => room?.holder === local();
  const controlling = () => live && remoteActive && !botEnabled && holder() &&
    room?.controller === remoteSeat && remoteSeat >= 0;
  const streaming = () => live && holder() && room?.viewer === remoteSeat && remoteSeat >= 0;
  function display() {
    const watching = room?.viewer === local() && !holder();
    viewer.hidden = !watching;
    canvas.hidden = watching;
    controls.hidden = !watching;
    for (const button of controls.querySelectorAll?.('button') ?? [])
      button.disabled = room?.controller !== local();
    const localControls = game.querySelector?.('#touch-bar');
    if (localControls) localControls.hidden = watching;
    if (watching) { setup.hidden = true; game.hidden = false; }
    if (!watching && !getModule()) { setup.hidden = false; game.hidden = true; }
  }
  function grant(seat) {
    if (!room || !holder() || !live) return;
    const online = room.players?.find(player => player.seat === seat)?.online;
    const next = online ? seat : -1;
    const controller = next >= 0 && remoteActive && !botEnabled ? next : -1;
    if (remoteActive) onStatus(botEnabled
      ? `Computer is fighting for Player ${seat + 1}.`
      : online ? `Player ${seat + 1} is controlling their battle side.`
        : room.botMinutes == null
          ? `Waiting for Player ${seat + 1} to return for this battle. A closed tab resumes from the last checkpoint; you may need to repeat the attack.`
          : `Waiting for Player ${seat + 1}. Their battle bot starts after ${room.botMinutes} minute${room.botMinutes === 1 ? '' : 's'} away.`);
    if (room.viewer !== next || room.controller !== controller)
      send({ type: 'control', lease: room.lease, viewer: next, controller });
  }
  function state(next) {
    room = next; roomReceivedAt = Date.now(); display();
    if (remoteSeat >= 0) grant(remoteSeat);
  }
  function battle(event, colors) {
    if (!holder() || !Array.isArray(colors)) return;
    if (event?.active === false) {
      live = false; remoteSeat = -1; remoteColor = -1; remoteActive = false; botEnabled = false;
      getModule()?.ccall?.('h3_set_battle_bot', null, ['number'], [-1]);
      if (room.viewer !== -1 || room.controller !== -1)
        send({ type: 'control', lease: room.lease, viewer: -1, controller: -1 });
      return;
    }
    if (Number.isInteger(event?.control) && live) {
      remoteActive = event.control === remoteColor;
      if (!remoteActive) onStatus('Your battle move.');
      grant(remoteSeat);
      return;
    }
    if (!Number.isInteger(event?.attacker) || !Number.isInteger(event?.defender)) return;
    // The remote human side: against the holder, or against a computer player (an AI hero
    // attacking another human during the computer players' moves).
    const ownColor = colors[local()];
    const otherColor = [event.attacker, event.defender]
      .find(color => color !== ownColor && colors.indexOf(color) >= 0) ?? -1;
    remoteSeat = colors.indexOf(otherColor); remoteColor = otherColor;
    live = remoteSeat >= 0 && remoteSeat !== local();
    remoteActive = false; botEnabled = false;
    if (live) grant(remoteSeat);
  }
  async function frame(frame) {
    if (room?.viewer !== local() || holder()) return;
    const bytes = new Uint8Array(frame);
    if (bytes[0] !== 1 || bytes.byteLength < 2 || bytes.byteLength > 200001) return;
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes.subarray(1)], { type: 'image/jpeg' }));
      if (room.viewer === local() && !holder()) context.drawImage(bitmap, 0, 0, 800, 600);
    } catch {} finally { bitmap?.close(); }
  }
  function input(value) {
    if (!validBattleInput(value) || value.seat !== remoteSeat || !controlling()) return false;
    if (value.event === 'keydown' || value.event === 'keyup') {
      const event = new KeyboardEvent(value.event, {
        code: value.code, key: value.key, bubbles: true, cancelable: true,
      });
      // KeyboardEventInit does not populate legacy keyCode/which in Chrome.
      // Emscripten's SDL keyboard bridge still reads those legacy fields.
      Object.defineProperty(event, 'keyCode', { value: value.keyCode });
      Object.defineProperty(event, 'which', { value: value.keyCode });
      canvas.dispatchEvent(event);
    } else {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent({ down: 'mousedown', move: 'mousemove', up: 'mouseup' }[value.event], {
        clientX: rect.left + value.x * rect.width,
        clientY: rect.top + value.y * rect.height,
        button: value.button, buttons: value.event === 'up' ? 0 : 1,
        bubbles: true, cancelable: true,
      }));
    }
    return true;
  }
  const frameTimer = timer(() => {
    if (live && holder() && !botEnabled && remoteSeat >= 0 && room?.botMinutes != null) {
      const player = room.players?.find(entry => entry.seat === remoteSeat);
      const offlineSince = player?.offlineSince ?? room.turnSince;
      const serverNow = room.now + Date.now() - roomReceivedAt;
      if (player && !player.online && Number.isFinite(offlineSince) &&
          serverNow - offlineSince >= room.botMinutes * 60000) {
        const module = getModule();
        if (module?.ccall) {
          module.ccall('h3_set_battle_bot', null, ['number'], [remoteColor]);
          botEnabled = true;
          grant(remoteSeat);
        }
      }
    }
    if (!streaming() || sending || now() - lastFrame < 100) return;
    lastFrame = now(); sending = true;
    try { canvas.toBlob(async blob => {
      try {
        if (!blob || blob.size > 200000 || !streaming()) return;
        const payload = new Uint8Array(blob.size + 1);
        payload[0] = 1; payload.set(new Uint8Array(await blob.arrayBuffer()), 1);
        send(payload.buffer);
      } catch {} finally { sending = false; }
    }, 'image/jpeg', .55); } catch { sending = false; }
  }, 100);
  const blockLocal = event => {
    if (!controlling() || !event.isTrusted) return;
    if (event.target === canvas || (event.type.startsWith('key') &&
        !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName ?? ''))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  for (const kind of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup',
    'mousemove', 'touchstart', 'touchend', 'keydown', 'keyup'])
    window.addEventListener(kind, blockLocal, { capture: true, passive: false });
  function sendPointer(event, kind) {
    if (room?.controller !== local() || room?.viewer !== local() || holder()) return;
    const rect = viewer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    send({ type: 'input', event: kind,
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      button: rightClick || event.button === 2 ? 2 : 0 });
  }
  viewer.addEventListener('pointerdown', event => {
    pointer = event.pointerId; viewer.focus(); viewer.setPointerCapture?.(pointer);
    sendPointer(event, 'down');
  });
  viewer.addEventListener('pointermove', event => { if (pointer === event.pointerId) sendPointer(event, 'move'); });
  for (const kind of ['pointerup', 'pointercancel']) viewer.addEventListener(kind, event => {
    if (pointer === event.pointerId) { sendPointer(event, 'up'); pointer = null; }
  });
  viewer.addEventListener('contextmenu', event => event.preventDefault());
  for (const kind of ['keydown', 'keyup']) viewer.addEventListener(kind, event => {
    if (!KEY.test(event.code) || room?.controller !== local() || room?.viewer !== local()) return;
    event.preventDefault();
    send({ type: 'input', event: kind, code: event.code, key: event.key.slice(0, 12), keyCode: keyCodeFor(event.code) });
  });
  // The touch layout has no right mouse button. A two-finger press is a right click.
  viewer.addEventListener('touchstart', event => { rightClick = event.touches.length > 1; }, { passive: true });
  viewer.addEventListener('touchend', () => { rightClick = false; }, { passive: true });
  function stop() {
    untimer(frameTimer);
    for (const kind of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup',
      'mousemove', 'touchstart', 'touchend', 'keydown', 'keyup'])
      window.removeEventListener(kind, blockLocal, true);
  }
  return { state, battle, frame, input, stop, viewer };
}
