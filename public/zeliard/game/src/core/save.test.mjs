import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../game/character.js';
import { loadSlot, normaliseSlot } from './save.js';

test('malformed nested save fields are rejected before Continue', () => {
  const valid = newCharacter('Duke');
  assert.ok(normaliseSlot(valid));
  const values = new Map();
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null };
  try {
    for (const invalid of [
      { ...valid, bits: null },
      { ...valid, charges: [] },
      { ...valid, items: null },
      { ...valid, level: '7' },
      { ...valid, location: null },
    ]) {
      values.set('beliards.save.0', JSON.stringify(invalid));
      assert.equal(loadSlot(0), null);
    }
    values.set('beliards.save.0', JSON.stringify(valid));
    assert.equal(loadSlot(0).name, 'Duke');
  } finally {
    globalThis.localStorage = oldStorage;
  }
});

test('a version-one save still migrates to a complete character', () => {
  const save = normaliseSlot({ v: 1, name: 'Old knight', level: 3, gold: 45 });
  assert.equal(save.v, 2);
  assert.equal(save.difficulty, 'english');
  assert.equal(save.gold, 45);
  assert.deepEqual(save.items, []);
  assert.deepEqual(save.bits, {});
});
