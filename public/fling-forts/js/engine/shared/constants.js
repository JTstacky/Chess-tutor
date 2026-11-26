// Shared constants used by both the host simulation and the browser client.
// Fling Forts' copy of the Teng Games engine (from Ninja Nab, engine at 1167270).
// The rules step at a fixed 1/60 s (sim.js DT), so the room ticks at 60 Hz and
// sends every second tick (30 snapshots a second; deltas against the last
// acknowledged one). Two players: one per keep.
export const TICK_RATE = 60;
export const SNAPSHOT_EVERY = 2;
export const MAX_PLAYERS = 2;

// Side colours, in slot order (slot 0 = red keep at the bottom, slot 1 = blue).
export const PLAYER_COLORS = [
  { name: 'Red', hex: '#e2453c' },
  { name: 'Blue', hex: '#3c6fe2' },
];
