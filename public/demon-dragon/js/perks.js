// Level-up upgrades, roguelite style: every level offers three, the knight keeps one.
// Picks live in the save as P.perks = { id: stacks }. Free of DOM and Three.js so Node can test it.
(function (root) {
  'use strict';

  // per: what one stack does, shown on the card. max: how many times it can be taken.
  const PERKS = [
    { id: 'swift', icon: '⚔️', name: 'Swift Blade', per: 'Sword swings 15% faster', max: 3 },
    { id: 'keen', icon: '🗡️', name: 'Keen Edge', per: 'Sword deals 25% more damage', max: 3 },
    { id: 'wide', icon: '🌙', name: 'Wide Arc', per: 'Sword reaches 20% further', max: 2 },
    { id: 'power', icon: '💥', name: 'Power Bolt', per: 'Bolts deal 35% more damage', max: 3 },
    { id: 'rapid', icon: '⚡', name: 'Rapid Fire', per: 'Bolts fire 20% faster', max: 3 },
    { id: 'split', icon: '🔱', name: 'Split Bolt', per: 'Fire one more bolt in a fan (+50% total bolt damage)', max: 2 },
    { id: 'pierce', icon: '🏹', name: 'Piercing Bolt', per: 'Bolts pass through drakelings', max: 1 },
    { id: 'far', icon: '🎯', name: 'Long Shot', per: 'Bolts fly 35% further and faster', max: 2 },
    { id: 'nimble', icon: '💨', name: 'Nimble Roll', per: 'Dodge recovers 25% sooner', max: 3 },
    { id: 'ghost', icon: '👻', name: 'Ghost Step', per: 'Dodge keeps you safe a little longer', max: 2 },
    { id: 'fleet', icon: '👢', name: 'Fleet Foot', per: 'Run 10% faster', max: 2 },
    { id: 'vigor', icon: '❤️', name: 'Vigor', per: 'One more heart, and full health', max: 3 },
    { id: 'forage', icon: '🍀', name: 'Forager', per: 'Drakelings drop hearts more often', max: 2 },
  ];
  const BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));

  const MAX_LEVEL = 15;
  const xpNeeded = (level) => 2 + level * 2;
  const stacks = (P, id) => (P && P.perks && P.perks[id]) || 0;

  // Multipliers and counts the level reads at the moment of each swing, bolt or roll.
  function stat(P, key) {
    const n = (id) => stacks(P, id);
    switch (key) {
      case 'swordCd': return Math.pow(0.85, n('swift'));
      case 'swordDmg': return 1 + 0.25 * n('keen');
      case 'swordReach': return 1 + 0.2 * n('wide');
      case 'boltDmg': return 1 + 0.35 * n('power');
      case 'boltCd': return Math.pow(0.8, n('rapid'));
      case 'bolts': return 1 + n('split');
      case 'pierce': return n('pierce') > 0;
      case 'boltRange': return 1 + 0.35 * n('far');
      case 'dodgeCd': return Math.pow(0.75, n('nimble'));
      case 'rollGuard': return 0.15 * n('ghost');
      case 'speed': return 1 + 0.1 * n('fleet');
      case 'heartDrop': return 0.15 * n('forage');
      default: return 1;
    }
  }

  // Up to `count` different upgrades that are not maxed yet. rng() returns [0, 1).
  function roll(P, count = 3, rng = Math.random) {
    const pool = PERKS.filter((p) => stacks(P, p.id) < p.max);
    const out = [];
    while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }

  // Records the pick. Returns the perk; immediate effects (Vigor's heart) are the caller's job.
  function take(P, id) {
    const def = BY_ID[id];
    if (!def || stacks(P, id) >= def.max) return null;
    P.perks = P.perks || {};
    P.perks[id] = stacks(P, id) + 1;
    return def;
  }

  const api = { PERKS, BY_ID, MAX_LEVEL, xpNeeded, stacks, stat, roll, take };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Perks = api;
})(typeof window !== 'undefined' ? window : globalThis);
