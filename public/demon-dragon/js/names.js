// Name filter for the knight's name. The same file runs in the game and in the high-score
// worker (site repo, scores/src/names.js); keep the two copies identical.
(function (root) {
  'use strict';

  // Blocked anywhere in the name, even inside a longer word or spelled out with gaps.
  const ANYWHERE = ['fuck', 'fuk', 'fck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut',
    'asshole', 'arsehole', 'dickhead', 'wank', 'twat', 'bastard', 'bollock', 'kike', 'retard', 'rapist', 'hitler',
    'porn', 'penis', 'vagina', 'dildo', 'pussy', 'jizz', 'boob', 'kkk', 'nazis', 'cocksuck', 'blowjob', 'tranny'];
  // Blocked only as a whole word, so Cassandra, Hancock and Grape stay allowed.
  const WHOLE = ['ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'fag', 'fags', 'rape', 'nazi', 'spic', 'chink',
    'coon', 'pedo', 'anus', 'anal', 'sex', 'gook', 'piss', 'crap', 'damn', 'hell', 'poop', 'butt'];

  const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e' };
  const plain = (s) => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[0-9@$!|+€]/g, (c) => LEET[c] || c);
  const squash = (s) => s.replace(/(.)\1+/g, '$1'); // fuuuuck -> fuck
  const letters = (s) => s.replace(/[^a-z]/g, '');
  // Squashed forms too short to be distinctive (kkk -> k, boob -> bob) are left out.
  const SQ_ANY = ANYWHERE.map(squash).filter((w) => w.length >= 4);

  function rude(name) {
    const p = plain(name);
    const all = letters(p);
    if (ANYWHERE.some((w) => all.includes(w)) || SQ_ANY.some((w) => squash(all).includes(w))) return true;
    const words = p.split(/[^a-z]+/).filter(Boolean);
    return words.some((w) => WHOLE.includes(w) || WHOLE.includes(squash(w))) || WHOLE.includes(all);
  }

  // Letters, digits, spaces and a little punctuation; 1-12 characters.
  function tidy(s) {
    return String(s || '').normalize('NFKC').replace(/[^\p{L}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  }

  // { ok, name }: ok is false when the name is rude; name is always safe to show.
  function check(s) {
    const name = tidy(s);
    if (!name) return { ok: true, name: 'Knight' };
    return rude(s) || rude(name) ? { ok: false, name: 'Knight' } : { ok: true, name };
  }

  const api = { check, rude, tidy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Names = api;
})(typeof window !== 'undefined' ? window : globalThis);
