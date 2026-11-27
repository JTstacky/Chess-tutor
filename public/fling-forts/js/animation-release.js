// A ranged shot already exists when act starts. Its painted release must be
// visible on that same draw, rather than winding up after the projectile left.
export function attackFrameIndex(elapsed, ranged) {
  return !ranged && elapsed < .035 ? 0 : elapsed < .12 ? 1 : elapsed < .2 ? 2 : 3;
}

export function holdCombatFrame(held, u, frame, now, ranged, available) {
  const hold = held.get(u.id), busy = u.hurt > 0 || u.act > 0;
  const releasing = ranged && u.hurt <= 0 && u.act > 0 && .28 - u.act < .035;
  // Keep the anti-flicker hold between ordinary combat poses, but never keep a
  // previous flinch on screen after it ended and a new projectile was released.
  if (!releasing && hold?.busy && busy && hold.key !== frame.key &&
      now >= hold.t && now - hold.t < .066 && available(hold.key)) return hold.fr;
  if (!hold || hold.key !== frame.key) held.set(u.id, {key:frame.key, fr:frame, t:now, busy});
  else hold.busy = busy;
  return frame;
}
