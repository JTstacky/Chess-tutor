// Teng Games high scores (Revenge of the Demon Dragon).
//
//   GET  /scores?board=<board>[&limit=10]   top scores on a board
//   POST /scores                            submit a result, answered with its rank
//   GET  /health                            liveness check for the deploy workflow
//
// Board: "quest2", whole story runs (all five dragons) on one quest clock that runs in the
// open world too, with deaths costing points. Only quest2 takes new scores. The older boards
// ("quest" without the clock, and one per dragon from when Trials were scored) can still be
// read. The server never trusts a submitted score: it recomputes it from the records with the
// game's own formulas (js/data.js in the game, fightScore and questScore) and rejects records
// outside what the game allows.
//
// POST body: { game: 'demon-dragon', board: 'quest2', name, diff: 1-5, look: '000'-'999',
//              t: quest clock seconds, deaths,
//              fights: [{ id, tier, t: seconds, taken: half hearts, hpMax: half hearts }] }
// look is the knight's look from the game's character creator (three digits); names go
// through the game's own filter (names.js, a copy of js/names.js), rude ones become "Knight".

import { DurableObject } from 'cloudflare:workers';
import './names.js';

const Names = globalThis.Names;

const GAME = 'demon-dragon';
const BOARDS = ['quest2', 'quest', 'thunder', 'water', 'fire', 'earth', 'demon']; // readable
const OPEN = ['quest2'];                                                          // take scores
const DRAGON_HP = { thunder: 190, water: 240, fire: 240, earth: 270, demon: 620 };
const QUEST_PAR = 900;
const DEATH_COST = 2000;
// Scores were reset when the quest clock came in (2026-10-11). A new name here resets again.
const RESET = 'reset-2026-10-11-quest-clock';
const KEEP = 200;            // rows kept per board
const POSTS_PER_MINUTE = 8;  // per IP

// --- the game's scoring rules (keep in step with js/data.js) ---
function fightScore(f) {
  const kept = Math.round(2500 * Math.max(0, 1 - f.taken / Math.max(1, f.hpMax)));
  const flawless = f.taken <= 0 ? 1000 : 0;
  return 1000 + kept + flawless;
}
function questScore(fights, t, deaths, diff) {
  const sum = fights.reduce((n, f) => n + fightScore(f), 0);
  const time = Math.round(10000 * Math.min(2, QUEST_PAR / Math.max(1, t)));
  return Math.max(0, (sum + time - deaths * DEATH_COST) * diff);
}

function allowed(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*') || !origin) return true;
  return list.some((o) => origin === o || (o.startsWith('http://') && origin.startsWith(`${o}:`)));
}
function cors(origin, env) {
  return {
    'access-control-allow-origin': origin && allowed(origin, env) ? origin : 'https://tenggames.com.au',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

// Letters, digits, spaces and a little punctuation; 1-12 characters; nothing rude.
const cleanName = (s) => Names.check(s).name;
const cleanLook = (s) => (/^\d{3}$/.test(s || '') ? s : '000');
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Checks a submission and returns { board, name, diff, total, t, taken } or an error string.
export function validate(b) {
  if (!b || b.game !== GAME) return 'unknown game';
  if (!BOARDS.includes(b.board)) return 'unknown board';
  if (!OPEN.includes(b.board)) return 'this board is closed';
  if (!Number.isInteger(b.diff) || b.diff < 1 || b.diff > 5) return 'bad difficulty';
  if (!Array.isArray(b.fights)) return 'no fights';
  const fights = b.fights;
  for (const f of fights) {
    if (!f || !DRAGON_HP[f.id]) return 'bad fight';
    if (!Number.isInteger(f.tier) || f.tier < 0 || f.tier > 3) return 'bad tier';
    if (!num(f.t, 5, 7200) || !num(f.taken, 0, 400) || !Number.isInteger(f.taken)) return 'bad record';
    if (!Number.isInteger(f.hpMax) || f.hpMax < 10 || f.hpMax > 60 || f.taken > f.hpMax * 12) return 'bad health';
  }
  const ids = fights.map((f) => f.id).sort().join(',');
  if (ids !== 'demon,earth,fire,thunder,water') return 'a quest needs all five dragons';
  const tiers = fights.filter((f) => f.id !== 'demon').map((f) => f.tier).sort().join(',');
  if (tiers !== '0,1,2,3' || fights.find((f) => f.id === 'demon').tier !== 0) return 'bad quest order';
  // The quest clock includes every fight (an hourglass chest can take 30 s off, ten at most).
  const fightTime = fights.reduce((s, f) => s + f.t, 0);
  if (!num(b.t, 30, 360000) || b.t < fightTime - 300) return 'bad quest clock';
  if (!Number.isInteger(b.deaths) || b.deaths < 0 || b.deaths > 999) return 'bad deaths';
  const total = questScore(fights, b.t, b.deaths, b.diff);
  const t = Math.round(b.t);
  const taken = fights.reduce((s, f) => s + f.taken, 0);
  return { board: b.board, name: cleanName(b.name), look: cleanLook(b.look), diff: b.diff, total, t, taken };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const h = cors(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'tenggames-scores' }, 200, h);
    if (url.pathname !== '/scores') return json({ error: 'not found' }, 404, h);
    if (origin && !allowed(origin, env)) return json({ error: 'origin not allowed' }, 403, h);
    const store = env.SCORES.get(env.SCORES.idFromName(GAME));
    if (req.method === 'GET') {
      const board = url.searchParams.get('board');
      if (!BOARDS.includes(board)) return json({ error: 'unknown board' }, 400, h);
      const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
      return json(await store.top(board, limit), 200, h);
    }
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      const v = validate(body);
      if (typeof v === 'string') return json({ error: v }, 400, h);
      const ip = req.headers.get('CF-Connecting-IP') || 'local';
      const r = await store.add(v, ip);
      return json(r, r.error ? 429 : 200, h);
    }
    return json({ error: 'method not allowed' }, 405, h);
  },
};

// One object holds every board (SQLite storage, Cloudflare's free plan).
export class Scores extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT NOT NULL, name TEXT NOT NULL,
      total INTEGER NOT NULL, diff INTEGER NOT NULL, t INTEGER NOT NULL, taken INTEGER NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS by_board ON scores (board, total DESC)');
    // Added with the character creator; older rows show the knight as made.
    const cols = this.sql.exec('PRAGMA table_info(scores)').toArray().map((c) => c.name);
    if (!cols.includes('look')) this.sql.exec("ALTER TABLE scores ADD COLUMN look TEXT NOT NULL DEFAULT '000'");
    // One-time resets, each run once and recorded: RESET clears every board.
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    if (!this.sql.exec('SELECT 1 FROM meta WHERE k = ?', RESET).toArray().length) {
      this.sql.exec('DELETE FROM scores');
      this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?)', RESET, String(Date.now()));
    }
    this.recent = new Map(); // ip -> [timestamps], kept in memory only
  }

  top(board, limit) {
    const rows = this.sql.exec('SELECT name, look, total, diff, t, taken, at FROM scores WHERE board = ? ORDER BY total DESC, at ASC LIMIT ?', board, limit).toArray();
    const count = this.sql.exec('SELECT COUNT(*) AS n FROM scores WHERE board = ?', board).one().n;
    return { board, count, entries: rows };
  }

  add(v, ip) {
    const now = Date.now();
    const times = (this.recent.get(ip) || []).filter((t) => now - t < 60000);
    if (times.length >= POSTS_PER_MINUTE) return { error: 'too many submissions, try again in a minute' };
    times.push(now);
    this.recent.set(ip, times);
    if (this.recent.size > 5000) this.recent.clear();

    this.sql.exec('INSERT INTO scores (board, name, look, total, diff, t, taken, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', v.board, v.name, v.look, v.total, v.diff, v.t, v.taken, now);
    const rank = this.sql.exec('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND total > ?', v.board, v.total).one().n + 1;
    const count = this.sql.exec('SELECT COUNT(*) AS n FROM scores WHERE board = ?', v.board).one().n;
    if (count > KEEP) {
      this.sql.exec('DELETE FROM scores WHERE board = ? AND id NOT IN (SELECT id FROM scores WHERE board = ? ORDER BY total DESC, at ASC LIMIT ?)', v.board, v.board, KEEP);
    }
    return { ok: true, board: v.board, total: v.total, rank, count: Math.min(count, KEEP) };
  }
}
