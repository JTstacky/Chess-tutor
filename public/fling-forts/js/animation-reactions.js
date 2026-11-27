// Presentation state only. Rendering frequency must not change the reaction speed.
export function reactionKick(hit, hurt, now) {
  const target = hurt > .09 ? 1 : hurt > 0 ? hurt / .09 : 0;
  const dt = Math.max(0, Math.min(.25, now - (hit.motionAt ?? hit.t0 ?? now)));
  hit.motionAt = now;
  hit.kick = target + ((hit.kick || 0) - target) * Math.pow(.6, dt * 60);
  return hit.kick;
}

// Death events omit the unit id. Match against the last rendered collision centre,
// then consume the pose so simultaneous deaths cannot reuse one unit's picture.
const poses = new Map();
export function beginPoseFrame() { poses.clear(); }
export function rememberPose(unit, pose) {
  poses.set(unit.id, {unitX:unit.x, owner:unit.owner, kind:unit.kind, ...pose});
}
export function takeDeathPose(event) {
  let chosen = null, distance = 64;
  for (const [id, pose] of poses) {
    if (pose.kind !== event.kind || pose.owner !== 1-event.p) continue;
    const d = Math.abs(pose.unitX-event.x);
    if (d < distance) { chosen=id; distance=d; }
  }
  if (chosen == null) return null;
  const pose = poses.get(chosen); poses.delete(chosen); return pose;
}

// sprite() rotates around its centre. Keep the rotated lower edge on the grass.
export function settledBottom(height, width, rotation, ground = 0) {
  return ground + (Math.abs(Math.cos(rotation))*height + Math.abs(Math.sin(rotation))*width-height)/2;
}
