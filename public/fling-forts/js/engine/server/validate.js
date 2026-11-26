// The one gate every client message passes before the room or game sees it:
// known message types and fields only, finite bounded numbers, short strings.
// Fling Forts' copy: the shared message types are unchanged; `commands` lists this game's orders.
import { PLAYER_COLORS } from '../shared/constants.js';
import { RACE_KEYS, AMMO, BUILD, UNIT, W } from '../../sim.js';

const own = (o, k) => Object.hasOwn(o, k);
const str = (v, max) => typeof v === 'string' && v.length <= max;
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const keys = (m, allowed) => Object.keys(m).every((k) => allowed.includes(k));
const flag = (v) => v === 0 || v === 1 || typeof v === 'boolean';
const oneOf = (table) => (v) => typeof v === 'string' && own(table, v);
const commands = {
  pick: (m) => keys(m, ['t', 'k', 'race']) && RACE_KEYS.includes(m.race),
  ready: (m) => keys(m, ['t', 'k', 'on']) && flag(m.on),
  ammo: (m) => keys(m, ['t', 'k', 'a']) && oneOf(AMMO)(m.a),
  fire: (m) => keys(m, ['t', 'k', 'dx', 'dy', 'power']) && num(m.dx, -1, 1) && num(m.dy, -1, 1) && num(m.power, 0, 1),
  build: (m) => keys(m, ['t', 'k', 'b', 'x']) && oneOf(BUILD)(m.b) && num(m.x, 0, W),
  autobuild: (m) => keys(m, ['t', 'k', 'b']) && oneOf(BUILD)(m.b),
  send: (m) => keys(m, ['t', 'k', 'u', 'x']) && oneOf(UNIT)(m.u) && num(m.x, 0, W),
  power: (m) => keys(m, ['t', 'k']),
  ult: (m) => keys(m, ['t', 'k']),
  rematch: (m) => keys(m, ['t', 'k', 'races']) && flag(m.races),
};

export function validMessage(m, options = {}) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return false;
  const token = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  switch (m.t) {
    case 'create': return keys(m, ['t', 'name', 'token']) && str(m.name, 16) && token(m.token);
    case 'join': return keys(m, ['t', 'name', 'token', 'code']) && str(m.name, 16) && token(m.token)
      && typeof m.code === 'string' && /^[A-Z0-9]{1,8}$/i.test(m.code);
    case 'chat': return keys(m, ['t', 'text']) && str(m.text, 200);
    case 'name': return keys(m, ['t', 'name']) && str(m.name, 16);
    case 'color': return keys(m, ['t', 'slot']) && int(m.slot, 0, PLAYER_COLORS.length - 1);
    case 'settings': return keys(m, ['t', ...Object.keys(options)])
      && Object.entries(m).every(([k, v]) => k === 't' || (Object.hasOwn(options, k) && options[k].includes(v)));
    case 'addBot': case 'toLobby': return keys(m, ['t']);
    case 'kick': return keys(m, ['t', 'id']) && int(m.id, 1, Number.MAX_SAFE_INTEGER);
    case 'start': return keys(m, ['t', 'only']) && (!own(m, 'only') || m.only === null || str(m.only, 64));
    case 'cmd': return typeof m.k === 'string' && Object.hasOwn(commands, m.k) && commands[m.k](m);
    default: return false;
  }
}
