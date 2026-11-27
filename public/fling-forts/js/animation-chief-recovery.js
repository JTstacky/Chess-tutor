// Use the end of the existing KO timer: standing and combat still resume on the
// exact simulation tick. No extra delay, health change or render-time clock.
export const CHIEF_RISE_TIME = .5;
export function chiefRecoveryPose(down, age, terminal = false) {
  if (terminal || !(down > 0 && down <= CHIEF_RISE_TIME) || age < .8) return null;
  const q = 1 - down / CHIEF_RISE_TIME, ease = q*q*(3-2*q);
  return {q, ease, frame:q < .22 ? 2 : q < .50 ? 1 : q < .82 ? 0 : -1,
    offset:.22*(1-ease), squash:Math.sin(q*Math.PI)*.025};
}

export function drawChiefRecovery(g, pl, {x, height, face, age, terminal}, {spr, sprite, meta, standing, trace}) {
  const pose = chiefRecoveryPose(pl.down, age, terminal);
  if (!pose) return false;
  const group = `kingko_${pl.race}`, key = pose.frame < 0 ? standing : `${group}_${pose.frame}`;
  g.save();
  g.filter = pose.q < .35 ? 'saturate(0.6) brightness(0.92)' : pose.q < .7 ? 'saturate(0.8) brightness(0.98)' : 'none';
  if (spr(key)) {
    sprite(g, key, x + face*height*pose.offset, 0,
      height*(pose.frame < 0 ? 1 : meta?.[group]?.k || 1),
      {flip:face < 0, sx:1+pose.squash, sy:1-pose.squash});
  } else {
    // Same painted standing fallback as the existing KO path, unwound in place.
    const fall = 1-pose.ease;
    sprite(g, standing, x + face*height*.12*fall, -height*.4*fall*fall, height,
      {flip:face < 0, rot:-face*Math.PI/2*fall*fall});
  }
  g.restore();
  trace?.push(['chief-rise', pl.id, key, pose.q, pl.down]);
  return true;
}
