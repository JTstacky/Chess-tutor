import { Chess, type Square } from 'chess.js';
import { Board } from './board';
import { themeById } from './themes';

type Room = { players: { seat: number; online: boolean }[]; moves: string[]; result: string | null; draw: number | null };
type Invite = { seat: number | null; connected: boolean; send: (message: unknown) => boolean; close: () => void };
declare global {
  interface Window {
    TengInvite: { mount: (options: { game: string; parent: HTMLElement; onState: (room: Room, invite: Invite) => void; onDisconnect: (invite: Invite) => void }) => Invite };
  }
}

export async function onlineView(): Promise<{ el: HTMLElement; stop: () => void }> {
  if (!window.TengInvite) await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/tg-invite.js'; script.onload = () => resolve(); script.onerror = () => reject(Error('Could not load online play.')); document.head.append(script);
  });
  const el = document.createElement('section'); el.className = 'view tg-online-chess'; el.dataset.view = 'online';
  el.innerHTML = '<div class="online-lobby"></div><p class="online-turn" role="status">Create or join an invite to begin.</p><div class="board-host"></div><div class="online-actions"><button type="button" data-draw disabled>Offer draw</button><button type="button" data-decline hidden>Decline draw</button><button type="button" data-resign disabled>Resign</button></div><p class="online-moves" aria-label="Moves"></p>';
  let chess = new Chess(), room: Room | null = null;
  const turn = el.querySelector<HTMLElement>('.online-turn')!;
  const draw = el.querySelector<HTMLButtonElement>('[data-draw]')!, decline = el.querySelector<HTMLButtonElement>('[data-decline]')!, resign = el.querySelector<HTMLButtonElement>('[data-resign]')!;
  const board = new Board({ onMove(from, to, promotion) { if (canMove()) invite.send({ type: 'move', from, to, promotion, ply: chess.history().length }); } });
  board.setTheme(themeById(localStorage.getItem('tg-chess-theme') || undefined));
  el.querySelector('.board-host')!.append(board.el);
  function connected() { return invite?.connected && room?.players.length === 2 && !room.result; }
  function canMove() { return connected() && chess.turn() === (invite.seat === 0 ? 'w' : 'b'); }
  function render() {
    const dests = new Map<Square, Square[]>();
    if (canMove()) for (const m of chess.moves({ verbose: true })) { const list = dests.get(m.from) || []; if (!list.includes(m.to)) list.push(m.to); dests.set(m.from, list); }
    const history = chess.history({ verbose: true }), last = history.at(-1);
    const check = chess.isCheck() ? chess.board().flat().find(p => p?.type === 'k' && p.color === chess.turn())?.square : null;
    board.setState({ pieces: chess.board(), dests, movable: canMove() ? chess.turn() : null, check, lastMove: last || null });
    draw.disabled = resign.disabled = !connected(); decline.hidden = !connected() || room?.draw == null || room.draw === invite.seat;
    draw.textContent = room?.draw != null && room.draw !== invite.seat ? 'Accept draw' : room?.draw === invite.seat ? 'Draw offered' : 'Offer draw';
    turn.textContent = room?.result || (!invite?.connected ? 'Offline. Reconnect to continue.' : room?.players.length !== 2 ? 'Waiting for your friend.' : (chess.turn() === 'w' ? 'White' : 'Black') + ' to move' + (canMove() ? ' — your turn.' : ' Come back for your turn.') + (chess.isCheck() ? ' Check!' : ''));
    el.querySelector('.online-moves')!.textContent = history.map((m, i) => (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + m.san).join(' ');
  }
  const invite = window.TengInvite.mount({ game: 'chess', parent: el.querySelector('.online-lobby')!,
    onState(value) { room = value; chess = new Chess(); for (const move of room.moves) chess.move(move); board.setOrientation(invite.seat === 0 ? 'w' : 'b'); render(); },
    onDisconnect() { render(); } });
  draw.onclick = () => { if (connected()) invite.send({ type: 'draw' }); };
  decline.onclick = () => { if (connected()) invite.send({ type: 'decline' }); };
  resign.onclick = () => { if (connected() && window.confirm('Resign this online game?')) invite.send({ type: 'resign' }); };
  render();
  return { el, stop() { invite.close(); board.skipAnimation(); } };
}
