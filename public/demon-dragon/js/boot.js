// Boot: load three.js (ES modules), the GLB models, then the game's classic scripts in order.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE;
window.THREEX = { SkeletonUtils, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment };

const ASSETS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded', 'dragon', 'env'];
// Generated landmarks (TRELLIS.2). Optional: the procedural shapes stand in if one is missing.
const OPTIONAL = ['lair_thunder', 'lair_water', 'lair_fire', 'lair_earth', 'ashen_gate', 'chest_closed', 'chest_open', 'signpost', 'heart', 'crown',
  'person_soldier', 'person_scholar', 'person_villager', 'person_villager2', 'person_king',
  'dragon_thunder', 'dragon_water', 'dragon_fire', 'dragon_earth', 'dragon_demon',
  'well', 'market_stall', 'windmill'];
const SCRIPTS = ['data', 'names', 'perks', 'gfx', 'models', 'actors', 'sets', 'world', 'level', 'audio', 'game'];

const status = document.getElementById('loading');
const setStatus = (text) => { if (status) status.textContent = text; };

function loadScript(name) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `js/${name}.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load ' + s.src));
    document.body.appendChild(s);
  });
}

async function boot() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  window.Assets = {};
  setStatus('Loading 0%');
  const total = ASSETS.length + OPTIONAL.length;
  const tick = () => { done += 1; setStatus(`Loading ${Math.round((done / total) * 100)}%`); };
  await Promise.all([
    ...ASSETS.map(async (name) => { window.Assets[name] = await loader.loadAsync(`assets/${name}.glb`); tick(); }),
    ...OPTIONAL.map(async (name) => {
      try { window.Assets[name] = await loader.loadAsync(`assets/${name}.glb`); } catch (e) { /* stand-in used */ }
      tick();
    }),
  ]);
  for (const name of SCRIPTS) await loadScript(name);
  if (status) status.remove();
}

boot().catch((e) => {
  console.error(e);
  setStatus('Could not load the game. Serve this folder over HTTP (run play.cmd).');
});
