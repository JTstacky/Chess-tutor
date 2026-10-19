// Modern-rules autopilot (docs/re-gaps.md #66). RECONSTRUCTED: not in the original. It only feeds the same
// commands a player would press (turn, thrust, Land, Jump) into the step's input, so the engine's own rules
// for landing clearance, landing distance and speed, fuel and the jump distance are unchanged.
//   Jump too close to the centre, or on the wrong side of it: fly out along the line to the destination, then
//   jump (the original says "too close", or starts the jump and cancels it once the ship crosses back inside).
//   Land: one press asks for clearance as before, then flies to the planet, brakes and lands.
// Any stick or steering key, Nav Off, a hit on the ship, or a lost target hands control back.
import { CMD } from './input.js';
import { wrap, bearing } from './trig.js';
import { SPEED } from './ships.js';

const MANUAL = [CMD.LEFT, CMD.RIGHT, CMD.ACCELERATE, CMD.REVERSE, CMD.AFTERBURNER, CMD.AUTOPILOT];
const MARGIN = 80;          // fly this far past the jump distance before pressing Jump

export class Assist {
  constructor() { this.mode = null; this.pool = null; }
  get active() { return this.mode !== null; }
  stop(game, why) {
    if (!this.mode) return;
    this.mode = null;
    if (why) game.message(why);
  }

  // Before game.step(input).
  apply(game, input) {
    const s = game.player;
    if (!s || game.landed || game.deadTicks >= 0 || s.death > 0) { this.mode = null; return; }
    if (this.mode && (MANUAL.some(c => input.held.has(c)) || input.pressed.has(CMD.NAV_OFF))) this.stop(game, 'Autopilot off.');
    if (this.mode && this.pool !== null && s.pool < this.pool) this.stop(game, 'Autopilot off: under fire.');
    this.pool = s.pool;

    if (input.pressed.has(CMD.JUMP) && s.jump <= 0 && game.navSys >= 0 && s.fuel >= 100 && !this.clear(game, s)) {
      input.pressed.delete(CMD.JUMP);
      this.mode = { kind: 'jump', sys: game.navSys };
      game.message(`Autopilot: leaving the system's gravity for the jump to ${game.data.syst[game.navSys]?.name ?? 'the next system'}.`);
    }
    if (input.pressed.has(CMD.LAND)) this.mode = { kind: 'land', fresh: true };

    if (this.mode?.kind === 'jump') this.jump(game, s, input);
    else if (this.mode?.kind === 'land') this.land(game, s, input);
  }

  // The engine's jump brakes to a stop, turns to the destination's bearing and creeps along it, and cancels
  // whenever the ship is inside the jump distance. So the jump is safe when the ship already lies out along that
  // bearing and still would where it stops (braking distance plus the drift while it turns round).
  jumpLine(game) {
    const A = game.data.syst[game.system], B = game.data.syst[game.navSys];
    return polar(bearing(A.xPos, A.yPos, B.xPos, B.yPos), 1);
  }
  clear(game, s) {
    const st = s.stats, u = this.jumpLine(game), v = Math.hypot(s.vx, s.vy);
    const stop = v > 0 ? (v * v / (2 * Math.max(st.accel, 1e-3)) + v * 180 / Math.max(1, st.turn)) * SPEED.S / v : 0;
    const along = (x, y) => x * u.x + y * u.y;
    return along(s.x, s.y) > st.jumpDist + MARGIN / 2 && along(s.x + s.vx * stop, s.y + s.vy * stop) > st.jumpDist + MARGIN;
  }

  jump(game, s, input) {
    if (s.jump > 0) { this.mode = null; return; }                       // the engine's jump has started
    if (game.navSys !== this.mode.sys || s.fuel < 100) { this.stop(game, 'Autopilot off.'); return; }
    if (this.clear(game, s)) { input.pressed.add(CMD.JUMP); this.mode = null; return; }
    // full speed for a point out along the jump line, past the jump distance
    const u = this.jumpLine(game), R = s.stats.jumpDist + 2.5 * MARGIN, dx = u.x * R - s.x, dy = u.y * R - s.y, d = Math.hypot(dx, dy) || 1;
    this.steer(s, input, dx / d * s.stats.speed - s.vx, dy / d * s.stats.speed - s.vy);
  }

  land(game, s, input) {
    const m = this.mode;
    if (m.fresh) { m.fresh = false; return; }                           // the engine handles this step's Land press
    const P = game.data.spob[game.navSpob];
    // denied, out of range of the request, or the target changed: the engine has said why
    if (game.navMode !== 2 || !P || game.landCounter < 0 || P.System !== game.system) { this.mode = null; return; }
    if (m.spob == null) m.spob = P.id; else if (m.spob !== P.id) { this.stop(game, 'Autopilot off.'); return; }
    const R = Math.max(75, Math.trunc(1.75 * (game.data.sprite(300 + P.Type)?.w ?? 0) / 2));
    const dx = P.xPos - s.x, dy = P.yPos - s.y, d = Math.hypot(dx, dy);
    const slow = Math.abs(s.vx) <= 0.75 && Math.abs(s.vy) <= 0.75;
    if (Math.abs(dx) < R * 0.8 && Math.abs(dy) < R * 0.8 && slow) {
      if (s.delay <= 0 && game.landCounter >= 750) input.pressed.add(CMD.LAND);
      return;
    }
    // aim for a speed that can still be braked away before the planet: v^2 = 2 a d (positions move v * SPEED.S per step)
    const a = s.stats.accel, reach = Math.max(0, d - R * 0.3) / SPEED.S;
    const want = Math.min(s.stats.speed, Math.sqrt(2 * a * reach) * 0.55, Math.max(0.5, reach / 25));
    const k = d > 0 ? want / d : 0;
    this.steer(s, input, dx * k - s.vx, dy * k - s.vy);
  }

  // Turn towards the velocity error and thrust once facing it, the way a player brakes and burns.
  steer(s, input, ex, ey) {
    const st = s.stats, e = Math.hypot(ex, ey);
    if (e < st.accel * 0.75) return;
    const want = wrap(bearing(0, 0, 100 * ex, 100 * ey)), d = wrap(s.facing - want), turn = Math.max(1, st.turn);
    if (d > turn / 2 && d <= 180) input.held.add(CMD.LEFT);
    else if (d > 180 && 360 - d > turn / 2) input.held.add(CMD.RIGHT);
    if (Math.min(d, 360 - d) <= Math.max(turn, 12)) input.held.add(CMD.ACCELERATE);
  }
}

// The engine's headings: 0 is up (screen y down), clockwise, as bearing() returns them.
function polar(deg, len) {
  const t = deg * Math.PI / 180;
  return { x: Math.sin(t) * len, y: -Math.cos(t) * len };
}
