import { TurnRelayClient, importRelaySave } from './turn-transfer.js';
import { exportSave } from './saves.js';
import { createBattleStream } from './battle-stream.js';

// TengInvite owns authentication, invite links, the socket and notifications.
// This controller owns only VCMI saves and the current relay lease.
export function mountOnline({ parent, gameParent, ready, start, canvas, stage, setup, game, getModule,
  invite = window.TengInvite,
  readSave = exportSave, importTurn = importRelaySave, reload = () => location.reload() }) {
  if (!invite?.mount) { parent.textContent = 'Online play is unavailable on this page.'; return null; }
  const startButton = document.createElement('button');
  startButton.type = 'button'; startButton.textContent = 'Start online game'; startButton.hidden = true;
  const loadRetry = document.createElement('button');
  loadRetry.type = 'button'; loadRetry.textContent = 'Retry loading turn'; loadRetry.hidden = true;
  parent.append(startButton, loadRetry);
  const gameStatus = document.createElement('p');
  gameStatus.setAttribute('role', 'status');
  const retryButton = document.createElement('button');
  retryButton.type = 'button'; retryButton.textContent = 'Retry handoff'; retryButton.hidden = true;
  gameParent.append(gameStatus, retryButton);
  let api, relay, starting = false, running = false, uploading = false, claiming = false;
  let colors = null, pending = null, checkpointUpload = Promise.resolve();
  const stream = canvas && stage && setup && game && getModule ? createBattleStream({
    canvas, stage, setup, game, getModule, getSeat: () => api?.seat,
    send: message => api?.send(message), onStatus: message => say(message),
  }) : null;
  const say = message => { const node = api?.panel?.querySelector('[data-status]'); if (node) node.textContent = message; gameStatus.textContent = message; };
  const matchId = () => new URLSearchParams(location.hash.slice(1)).get('invite');
  const validColors = (value, capacity) => Array.isArray(value) && value.length === capacity &&
    value.every(color => Number.isInteger(color) && color >= 0 && color < 8) &&
    new Set(value).size === value.length;
  const seats = value => {
    if (!validColors(value, api.room.capacity) || value[0] !== 0) {
      colors = null;
      say('This map needs exactly one human player per invite seat, starting with Red. Start a new match with a suitable map.');
      return;
    }
    if (colors && JSON.stringify(colors) !== JSON.stringify(value)) {
      say('The save player colours do not match the relay. The game has stopped.');
      reload();
      return;
    }
    colors = value;
    say('Online game started. End your turn to pass the save.');
  };
  async function handoff(event) {
    try {
      if (!event || event.phase !== 0 || !Number.isInteger(event.seat) || !colors)
        throw Error('The game did not provide a valid turn handoff.');
      const nextSeat = colors.indexOf(event.seat);
      if (nextSeat < 0 || nextSeat === api.seat) throw Error('The next player is outside this match.');
      const lease = api.room.lease;
      // Keep the handoff before reading the save, so Retry can read it again if the read fails.
      pending = { saveName: event.save, save: null, lease, phase: 0, saveSeat: nextSeat,
        nextSeat, colors, order: colors.map((_, seat) => seat) };
      await checkpointUpload.catch(() => {});
      await sendPending();
    } catch (error) { say(`Turn is saved on this device. ${error.message} Retry the handoff.`); retryButton.hidden = !pending; }
  }
  function checkpoint(event) {
    if (!running || !colors || ![1, 2].includes(event?.phase) ||
        !['OnlineCheckpoint1.vsgm1', 'OnlineCheckpoint2.vsgm1'].includes(event.save)) return;
    checkpointUpload = checkpointUpload.catch(() => {}).then(async () => {
      const save = await readSave(event.save);
      await relay.upload({ save, lease: api.room.lease, phase: event.phase,
        saveSeat: event.phase === 1 ? api.seat : -1, colors,
        order: colors.map((_, seat) => seat) });
    });
    checkpointUpload.catch(error => say(`The latest checkpoint remains on this device: ${error.message}`));
  }
  async function sendPending() {
    if (!pending || uploading) return;
    uploading = true;
    try {
      say('Saving your turn for the next player…');
      if (!pending.save) pending.save = await readSave(pending.saveName);
      const { saveName, ...upload } = pending;
      await relay.upload(upload);
      pending = null; running = false;
      retryButton.hidden = true;
      say('Turn passed. Waiting for the next player.');
      reload(); // Kill the old engine worker; a later lease starts from the server save.
    } finally {
      uploading = false;
      if (pending && relay.runningLease === null) reload();
    }
  }
  async function launchHeldTurn() {
    if (!api?.room || api.room.holder !== api.seat || starting || running || !ready()) return;
    const room = api.room;
    if (room.checkpointPhase == null) return;
    starting = true;
    try {
      const { checkpoint: stored, save } = await relay.load({ lease: room.lease,
        allowPhase2: room.checkpointPhase === 2 });
      colors = stored.meta.colors;
      const localSeat = colors[api.seat];
      const saveName = await importTurn({ save, matchId: matchId(), revision: stored.revision });
      relay.runningLease = room.lease;
      loadRetry.hidden = true;
      await start({ localSeat, saveName, phase: stored.phase,
        onTurnPass: handoff, onSeats: seats, onCheckpoint: checkpoint,
        onBattle: event => stream?.battle(event, colors) });
      running = true;
      say('Your turn. The game is running on this device.');
    } catch (error) { relay.runningLease = null; loadRetry.hidden = false; say(`Could not load this turn: ${error.message}`); }
    finally { starting = false; }
  }
  startButton.onclick = async () => {
    if (!api?.room || api.room.holder !== api.seat || api.seat !== 0 ||
        api.room.checkpointPhase != null || api.room.players.length !== api.room.capacity ||
        starting || running || !ready()) return;
    starting = true; startButton.disabled = true;
    try {
      relay.runningLease = api.room.lease;
      await start({ localSeat: 0, onTurnPass: handoff, onSeats: seats,
        onCheckpoint: checkpoint, onBattle: event => stream?.battle(event, colors) });
      running = true; startButton.hidden = true;
      say(`Set up ${api.room.capacity} human players in seat order, starting with Red.`);
    } catch (error) { relay.runningLease = null; say(error.message); }
    finally { starting = false; startButton.disabled = false; }
  };
  retryButton.onclick = () => sendPending().catch(error => { retryButton.hidden = !pending; say(`Turn remains on this device: ${error.message}`); });
  loadRetry.onclick = () => { loadRetry.hidden = true; void launchHeldTurn(); };
  api = invite.mount({ game: 'heroes3', parent, title: 'Heroes III',
    turn: { players: [2, 8], awayBot: true },
    description: 'Full-account players take turns on their own devices. The relay keeps the latest private save.',
    onState(room, lobby) {
      api = lobby;
      if (!relay && Number.isInteger(lobby.seat)) relay = new TurnRelayClient({
        seat: lobby.seat, send: message => lobby.send(message),
        onStale: () => { if ((running || starting) && !uploading) reload(); },
      });
      relay?.onState(room);
      stream?.state(room);
      if (room.holder !== lobby.seat)
        say(`Waiting for Player ${room.holder + 1}. Your game remains private on this device.`);
      else if (!ready() && !running && !starting)
        say('It is your turn. Load the private game files on this device to continue.');
      startButton.hidden = !(lobby.seat === 0 && room.holder === 0 && room.checkpointPhase == null &&
        room.players.length === room.capacity && ready() && !running);
      if (room.holder === lobby.seat && room.checkpointPhase != null &&
          (!running || room.lease !== relay?.runningLease)) void launchHeldTurn();
      // Only a device that can run the game may take over the computer players' moves.
      // Losing a claim race to another seat is normal and not shown.
      if (room.holder !== lobby.seat && room.checkpointPhase === 2 && ready() && !claiming &&
          !room.players.find(player => player.seat === room.holder)?.online) {
        claiming = true;
        relay?.claim().catch(() => {}).finally(() => { claiming = false; });
      }
    },
    onMessage(message) { if (message?.type === 'input') stream?.input(message); else relay?.onMessage(message); },
    onFrame(frame) {
      if (new Uint8Array(frame)[0] === 1) void stream?.frame(frame);
      else relay?.onFrame(frame);
    },
    onDisconnect() { relay?.failPending(Error('Relay disconnected.')); if (running) say('Disconnected. The local save remains on this device.'); },
  });
  return { api, resume: () => { if (api?.room) {
    if (api.room.holder === api.seat && api.room.checkpointPhase != null) void launchHeldTurn();
    else if (api.seat === 0 && api.room.checkpointPhase == null &&
             api.room.players.length === api.room.capacity && ready()) startButton.hidden = false;
  } } };
}
