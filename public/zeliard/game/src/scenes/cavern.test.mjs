import test from 'node:test';
import assert from 'node:assert/strict';

// The scene imports browser render helpers; no canvas is rendered in this test.
globalThis.location = { search: '' };
globalThis.document = {
  getElementById: () => ({ getContext: () => ({}), style: {} }),
  addEventListener() {},
};
globalThis.window = { innerWidth: 960, innerHeight: 540, addEventListener() {} };
globalThis.Image = class { set src(_value) { queueMicrotask(() => this.onload?.()); } };

const { CavernScene } = await import('./cavern.js');
const { TownScene } = await import('./town.js');

test('a cavern replaced during async loading cannot change heroes or autosave', async () => {
  let finishLoad;
  const original = CavernScene.prototype.loadWorld;
  CavernScene.prototype.loadWorld = () => new Promise(resolve => { finishLoad = resolve; });
  try {
    let saves = 0;
    const game = { locals: [], save() { saves++; } };
    const scene = new CavernScene(game, { mapId: 'fake' });
    scene.exit();
    finishLoad({ data: { spawn: { x: 1, y: 1 } }, addHero() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scene.ready, false);
    assert.equal(scene.world, null);
    assert.equal(saves, 0);
  } finally {
    CavernScene.prototype.loadWorld = original;
  }
});

test('an exited town ignores its late map load', async () => {
  let finishLoad;
  const original = TownScene.prototype.loadMap;
  TownScene.prototype.loadMap = () => new Promise(resolve => { finishLoad = resolve; });
  try {
    let saves = 0;
    const scene = new TownScene({ save() { saves++; } }, { mapId: 'fake' });
    scene.exit();
    finishLoad({ width: 20, doors: [], npcs: [] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scene.ready, false);
    assert.equal(scene.map, undefined);
    assert.equal(saves, 0);
  } finally {
    TownScene.prototype.loadMap = original;
  }
});
