// The knight's shield is drawn separately from his body, so it shows the shield he actually
// carries (or none). As in the original (whose knight sprites come in no-shield, small-shield and
// large-shield sets), the shield is held squarely in front of his chest on the side he faces, in
// every pose, so it is obvious what it covers: Clay, Wise Man's and Stone are small (the chest
// row), Honor, Light and Titanium are large (the whole body). The hero sheets are painted without
// a shield once data/hero_shields.json exists (written by tools/art/shield_boxes.py with the cut
// shield images art/shields/<id>.png); until then the painted shield stays and nothing is added.
import { loadJSON, image, imageNow } from '../core/assets.js';

export const SHIELD_IDS = ['clay_shield', 'wise_mans_shield', 'stone_shield', 'honor_shield', 'light_shield', 'titanium_shield'];
// Height in px: small shields cover the chest, large ones chest to knees.
const SIZE = { clay_shield: 28, wise_mans_shield: 31, stone_shield: 32, honor_shield: 44, light_shield: 45, titanium_shield: 48 };
let ON = false;

export async function loadShieldArt() {
  const d = await loadJSON('data/hero_shields.json', null);
  if (!d || !d.separate) return;
  await Promise.all(SHIELD_IDS.map((id) => image(`art/shields/${id}.png`)));
  ON = true;
}
// True once the shield-less hero art is in use.
export const shieldsSeparate = () => ON;

// Draw shield `shieldId` for a knight whose feet-centre is at (x, y) on screen, facing `dir`.
// pose: 'stand' (also walk, jump, swing, cast), 'crouch', or 'hidden' (climbing, dead).
// body: where the frame's torso is, px from x along the facing (Sheet.torsoX scaled).
export function drawShield(ctx, x, y, dir, alpha, shieldId, pose = 'stand', scale = 1, body = 0) {
  if (!ON || !shieldId || pose === 'hidden') return;
  const img = imageNow(`art/shields/${shieldId}.png`);
  if (!img) return;
  const h = (SIZE[shieldId] || 32) * scale, w = h * img.width / img.height;
  const big = h >= 40 * scale;
  // Centre: just past the front of the body, at the chest (large shields sit a little lower).
  const cx = x + dir * (body + (13 + w * 0.25) * scale);
  const cy = y - (pose === 'crouch' ? 24 : big ? 40 : 46) * scale;
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(cx), Math.round(cy));
  if (dir < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// Which shield a knight carries: his own character's, or what a co-op partner reported.
export const shieldOf = (h) => (h.character ? h.character.shield : h.remoteShield) || null;
