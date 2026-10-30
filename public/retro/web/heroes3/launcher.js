// The PROXY_TO_PTHREAD engine mounts OPFS in its C++ main thread. Creating the
// WasmFS OPFS backend on the browser main thread would block or assert.
const ARGS = ['--nointro']; // The web build has video playback disabled.
let runningModule;
let runningOnline = false;

export async function engineAvailable() {
  try {
    const response = await fetch('./engine/vcmiclient.js', { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function prepareGameData() {
  const root = await navigator.storage.getDirectory();
  await root.getDirectoryHandle('h3');
  await root.getDirectoryHandle('userdata', { create: true });
}

export async function launch({ canvas, localSeat, saveName, phase, onTurnPass = () => {}, onSeats = () => {}, onCheckpoint = () => {}, onBattle = () => {}, onMessage = console.log, onStatus = () => {}, factory } = {}) {
  if (runningModule) throw Error('The game is already running.');
  if (!canvas) throw Error('Game canvas is missing.');
  if (localSeat !== undefined && (!Number.isInteger(localSeat) || localSeat < 0 || localSeat > 7))
    throw Error('Invalid player seat.');
  if (saveName !== undefined && (!/^[a-zA-Z0-9 ()-]+\.vsgm1$/.test(saveName) || localSeat === undefined))
    throw Error('Invalid online save name or player seat.');
  if (phase !== undefined && (![0, 1, 2].includes(phase) || saveName === undefined))
    throw Error('Invalid online save phase.');
  await prepareGameData();
  onStatus('Loading VCMI engine…');
  factory ??= (await import('./engine/vcmiclient.js')).default;
  if (typeof factory !== 'function') throw Error('Engine module does not export createVcmi.');

  const options = {
    canvas,
    noInitialRun: true,
    print: onMessage,
    printErr: onMessage,
    setStatus: message => { if (message) onStatus(message); },
    onAbort: reason => onStatus(`VCMI stopped: ${reason}`),
    onTurnPass,
    onTurnSeats: onSeats,
    onTurnCheckpoint: onCheckpoint,
    onTurnBattle: onBattle,
    locateFile: name => new URL(`./engine/${name}`, import.meta.url).href,
    preRun: [() => {
      Object.assign(options.ENV ??= {}, {
        HOME: '/opfs/userdata',
        XDG_DATA_HOME: '/opfs/userdata',
        XDG_CONFIG_HOME: '/opfs/userdata/config',
        XDG_CACHE_HOME: '/tmp/vcmi-cache',
        XDG_DATA_DIRS: '/gamedata',
        SDL_RENDER_DRIVER: 'software',
        SDL_AUDIODRIVER: 'dummy',
      });
      if (localSeat !== undefined) options.ENV.H3_LOCAL_SEAT = String(localSeat);
      if (phase !== undefined) options.ENV.H3_TURN_PHASE = String(phase);
    }],
  };
  const module = await factory(options);
  onStatus('Starting VCMI…');
  const args = saveName ? [...ARGS, '--h3-load-save', `Saves/${saveName}`] : [...ARGS];
  if (module.callMain(args) !== 0) throw Error('Could not start the engine worker.');
  runningModule = module;
  runningOnline = localSeat !== undefined;
  return module;
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!runningModule) return;
  try {
    if (document.hidden) {
      runningModule.ccall?.('h3_request_checkpoint', null, [], []);
      if (!runningOnline) runningModule.pauseMainLoop?.();
    }
    else if (!runningOnline) runningModule.resumeMainLoop?.();
  } catch {}
  const audio = runningModule.SDL?.audioContext ?? runningModule.audioContext;
  try {
    if (document.hidden) audio?.suspend?.();
    else audio?.resume?.();
  } catch {}
});
