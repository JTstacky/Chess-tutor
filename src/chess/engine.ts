// Thin promise-based wrapper around the Stockfish WASM web worker.
// Searches are queued so options (MultiPV, strength limits) never change mid-search.

export interface EngineLine {
  move: string; // UCI, e.g. "e2e4" or "e7e8q"
  pv: string[];
  cp: number; // centipawns from the side to move's point of view (mate scores mapped to ±100000)
  mate: number | null;
}

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  elo?: number; // enables UCI_LimitStrength when set
}

interface Job {
  fen: string;
  opts: SearchOptions;
  resolve: (lines: EngineLine[]) => void;
}

const MATE_CP = 100000;

export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines: EngineLine[] = [];

  constructor() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`);
    this.ready = new Promise((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (String(e.data) === 'uciok') {
          this.worker.removeEventListener('message', onReady);
          resolve();
        }
      };
      this.worker.addEventListener('message', onReady);
    });
    this.worker.addEventListener('message', (e) => this.onLine(String(e.data)));
    this.send('uci');
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  analyse(fen: string, opts: SearchOptions = {}): Promise<EngineLine[]> {
    return new Promise((resolve) => {
      this.queue.push({ fen, opts, resolve });
      void this.pump();
    });
  }

  /** Drop pending searches and stop the running one (its promise resolves with whatever it found). */
  cancelAll() {
    for (const job of this.queue) job.resolve([]);
    this.queue = [];
    if (this.current) this.send('stop');
  }

  private async pump() {
    await this.ready;
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.current = job;
    this.lines = [];
    const { opts } = job;
    this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
    if (opts.elo) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${opts.elo}`);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
    }
    this.send(`position fen ${job.fen}`);
    if (opts.depth) this.send(`go depth ${opts.depth}`);
    else this.send(`go movetime ${opts.movetime ?? 500}`);
  }

  private onLine(line: string) {
    if (!this.current) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const idx = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1) - 1;
      const cpMatch = / score cp (-?\d+)/.exec(line);
      const mateMatch = / score mate (-?\d+)/.exec(line);
      const pv = line.split(' pv ')[1].trim().split(/\s+/);
      const mate = mateMatch ? Number(mateMatch[1]) : null;
      const cp = mate !== null ? Math.sign(mate || -1) * (MATE_CP - Math.abs(mate)) : Number(cpMatch?.[1] ?? 0);
      this.lines[idx] = { move: pv[0], pv, cp, mate };
    } else if (line.startsWith('bestmove')) {
      const job = this.current;
      this.current = null;
      const best = line.split(/\s+/)[1];
      let lines = this.lines.filter(Boolean);
      if (lines.length === 0 && best && best !== '(none)') {
        lines = [{ move: best, pv: [best], cp: 0, mate: null }];
      }
      job.resolve(lines);
      void this.pump();
    }
  }
}

let shared: Engine | null = null;
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}
