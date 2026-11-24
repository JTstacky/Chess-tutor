// Check stored quest data before it reaches the world builder or HUD.
(function () {
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => Number.isFinite(value) && value >= 0 && value < 1e9;
  const list = (value, allowed) => Array.isArray(value) && value.every(item => allowed(item));
  const string = value => typeof value === 'string';

  function valid(s, data) {
    if (!record(s) || !string(s.name) || !s.name.trim()
      || (s.difficulty != null && (!Number.isInteger(s.difficulty) || s.difficulty < 1 || s.difficulty > 5))
      || !list(s.slain, id => data.ELEMENT_ORDER.includes(id))
      || !list(s.relics, id => Object.hasOwn(data.ELEMENTS, id))
      || !list(s.chests, string)) return false;
    if (!['hpMax', 'sword', 'shot', 'xp', 'level'].every(key => finite(s[key]))
      || s.hpMax === 0 || s.level < 1) return false;
    if (s.active != null && !s.relics.includes(s.active)) return false;
    if (s.pos != null && (!record(s.pos) || !Number.isFinite(s.pos.x)
      || !Number.isFinite(s.pos.z) || !Number.isFinite(s.pos.rot))) return false;
    if (s.chestSpots != null && !list(s.chestSpots, spot => record(spot)
      && string(spot.id) && string(spot.kind) && Number.isFinite(spot.x) && Number.isFinite(spot.y))) return false;
    if (s.fightScores != null && !record(s.fightScores)) return false;
    if (s.perks != null && !record(s.perks)) return false;
    if (s.tips != null && !record(s.tips)) return false;
    if (s.clock != null && !finite(s.clock)) return false;
    if (s.deaths != null && !finite(s.deaths)) return false;
    return true;
  }

  window.SaveState = { valid };
})();
