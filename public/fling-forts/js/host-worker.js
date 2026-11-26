// host-worker.js — the hosting player's Web Worker: the shared engine's room running Fling Forts.
import { runHostWorker } from './engine/client/host-worker-core.js';
import { gameDef } from './online-game.js';
runHostWorker(gameDef);
