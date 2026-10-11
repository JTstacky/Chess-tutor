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

## Generated characters and village props (2026-10-11)

| File | Concept image | 3D | Licence |
|---|---|---|---|
| knight.glb (redesign) | gpt-image-2 *edit* of the KayKit knight's rest-pose render (`render_ref.py`) | TRELLIS.2; re-skinned onto the original KayKit rig and animations with `rig_transfer.py --fit arms` (keeps the KayKit sword and shield) | concept per OpenAI terms; TRELLIS.2 MIT; rig/animations KayKit CC0 |
| person_soldier/scholar/villager/villager2/king.glb | gpt-image-2 edits of the KayKit barbarian, mage and rogue rest poses | TRELLIS.2; `rig_transfer.py --fit person` onto those KayKit rigs | as above |
| dragon_thunder/water/fire/earth/demon.glb | gpt-image-2 edits of the Quaternius dragon's rest pose | TRELLIS.2; `rig_transfer.py --fit span` onto the Quaternius rig (demon: tail bound to the hips) | concepts per OpenAI terms; TRELLIS.2 MIT; rig/animations Quaternius CC0 |
| well.glb, market_stall.glb, windmill.glb | gpt-image-2 via Codex (`scratch/props`) | TRELLIS.2, Blender prep, meshopt simplify, WebP | as above |
