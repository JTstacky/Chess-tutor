# Asset credits

All models are CC0 (public domain). No attribution is required; it is given anyway.

| File | Source | Author | Licence |
|---|---|---|---|
| knight.glb, barbarian.glb, mage.glb, rogue.glb, rogue_hooded.glb | KayKit Adventurers (character pack) | Kay Lousberg, kaylousberg.com | CC0 1.0 |
| env.glb (buildings, trees, mountains, rocks, props) | KayKit Medieval Hexagon Pack | Kay Lousberg, kaylousberg.com | CC0 1.0 |
| dragon.glb | Animated Monsters pack (Dragon), via OpenGameArt | Quaternius, quaternius.com | CC0 1.0 |

Processing: converted and trimmed with headless Blender and gltf-transform (meshopt geometry,
WebP textures at 512 px) using `~/ai-gamedev-toolkit/tools/scripts`.
three.js r186 (MIT) is vendored under `vendor/three/` with its LICENSE.

## Generated landmarks (2026-10-10)

| File | Concept image | 3D | Licence |
|---|---|---|---|
| lair_thunder.glb, lair_water.glb, lair_fire.glb, lair_earth.glb, ashen_gate.glb | gpt-image-2 via Codex (prompts in the toolkit's `scratch/lairs`) | TRELLIS.2 (local, ComfyUI), `--res 1024 --faces 200000`, seed 42; Blender prep, meshopt simplify, WebP | concepts per OpenAI terms; TRELLIS.2 weights MIT |
| chest_closed.glb, chest_open.glb, signpost.glb, heart.glb, crown.glb | gpt-image-2 via Codex (`scratch/props`) | same pipeline; chest_open with `--remesh 512`; heart uses the shape only (flat red material) | as above |
