// Evaluates the original save-byte conditions used by town NPC lines and patches,
// e.g. "stdply[0x12] & 0x08", "stdply[0x49] != 0", "!(stdply[0x30] & 0x80)".
// Anything after a parenthesised explanation or the word "only" is ignored.
const SAFE = /^[\s\d()&|!=<>x a-fA-F~^]+$/;

export function evalCondition(cond, game) {
  if (!cond || cond === 'default' || cond === 'always') return true;
  let s = String(cond).replace(/\(only[^)]*\)/g, '').replace(/\s+-\s.*$/, '');
  s = s.replace(/stdply\[(0x[0-9a-fA-F]+|\d+)\]/g, (_, b) => String(game.getByte(`0x${Number(b).toString(16).padStart(2, '0')}`)));
  s = s.replace(/\band\b/gi, '&&').replace(/\bor\b/gi, '||').replace(/\bnot\b/gi, '!');
  if (!SAFE.test(s)) return false;
  try {
    // eslint-disable-next-line no-new-func
    return !!Function(`"use strict";return (${s});`)();
  } catch { return false; }
}
