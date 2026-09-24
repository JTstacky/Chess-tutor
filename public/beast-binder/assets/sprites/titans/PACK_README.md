# Alien creatures — eight-direction idle sprite pack

Six stylised alien creatures, each with eight distinct facing directions.
The sprites are idle poses. Each direction is one frame; the preview's turntable changes facing rather than playing a walk cycle.

## Import

| File | Canvas | Frame size | Layout |
| --- | --- | --- | --- |
| `alien-creatures-8-direction.png` | 1024 × 768 | 128 × 128 | 8 columns × 6 rows |
| `alien-creatures-8-direction-2x.png` | 2048 × 1536 | 256 × 256 | Same layout, exact nearest-neighbour 2× |

Columns, from left: **E, SE, S, SW, W, NW, N, NE**.
South faces the viewer; north faces away.
Rows, from top: **Aetherhart, Veilfin, Cindercrab, Sprigwraith, Pyrodrake, Voidbrute**.

- RGBA PNG with actual transparency; no baked backgrounds, shadows, labels or grid lines.
- Fixed-size, untrimmed cells. Slice from `(0, 0)` with zero spacing and zero external margin.
- Every frame includes transparent internal padding. Do not trim automatically without preserving the supplied pivot.
- Foot pivot from top-left: **(64, 116)** at 128 px; **(128, 232)** at 256 px.
- Normalized top-left pivot: **(0.5, 0.90625)**. For an importer using bottom-left coordinates, use **(0.5, 0.09375)**.
- Use point / nearest-neighbour filtering. Disable mipmaps for an unscaled pixel-art presentation; use integer display scales.
- Alpha is binary (0 or 255); invisible RGB is zeroed. The 2× version uses identical artwork, not additional detail.

## Included

- `frames/<creature>/<direction>.png`: 48 individual 128 × 128 frames.
- `sheets/<creature>.png`: six transparent 1024 × 128 directional strips.
- `atlas.json` and `atlas-2x.json`: frame rectangles, direction names, row order and pivots. Rectangles use top-left coordinates.
- `preview.html`: self-contained offline viewer. Open it directly in a browser; no server, account or network needed. Click a direction, use arrow keys or play the rotation preview. Pivot and light-background toggles help inspect alignment and transparency.
- `source-compass/`: the six full-resolution generated source sheets. These are source artwork, not the import atlases. Their layout is NW / N / NE, W / blank / E, SW / S / SE; Veilfin's source rear diagonals are swapped and corrected in the exported frames.
- `tools/build.cjs`: reproducible extraction and atlas assembly using Node.js and `sharp`. It cleans faint edge alpha, removes isolated dust, normalizes head-to-ground height, aligns foot pivots and exports both resolutions.
- `tools/preview-template.html`: source for the self-contained preview.
- `validation.json`: frame dimensions, alpha bounds, pivot metadata, unique frame/silhouette hashes and side/diagonal comparisons.

## Art and direction checks

All six creatures were generated separately with the built-in image generator and visually reviewed in the compass arrangement and final atlas. The shared prompt was: preserve the alien identity; show eight rigid-body orientations in 45-degree steps; distinguish full side profiles from front and rear diagonals; use consistent proportions, chunky pixel art and transparency.

Assembly verifies 48 distinct pixel frames and 48 distinct silhouettes, fixed frame dimensions, in-cell bounds and hard transparency. Side/diagonal comparisons are recorded in `validation.json`. Those checks supplement visual review; a difference hash alone does not measure the quality of a pose.

The assets have no runtime dependencies. The source build tool requires Node.js and `sharp` only if you want to rebuild the PNGs.
