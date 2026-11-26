// Render-only choreography. No positions, attacks or timers in the simulation change.
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export function victoryDance(age, id = 0, air = false, machine = false) {
  const t = Math.max(0, age - (id % 4) * 0.055), beat = (t / 0.34) % 8;
  const step = Math.floor(beat), q = beat - step, lift = Math.sin(q * Math.PI);
  const variant = id % 3;
  let x = 0, y = 0, rot = 0, sx = 1, sy = 1, turn = false;
  if (air) {
    // A figure-eight victory lap, with a banking turn at each end; wings/rotors keep cycling.
    const a = beat * Math.PI / 4;
    x = Math.sin(a) * 0.48; y = (1 - Math.cos(a * 2)) * 0.16;
    rot = Math.sin(a) * (machine ? 0.16 : 0.28);
    turn = beat >= 2 && beat < 6;
  } else if (step < 4) {
    // Two travelling heel-toe steps out, then two back. Actual stride frames move the feet.
    const positions = [0, 0.25, 0.5, 0.25, 0];
    x = positions[step] + (positions[step + 1] - positions[step]) * smooth(q);
    y = machine ? 0 : lift * (variant === 1 ? 0.09 : 0.035);
    turn = step >= 2;
    rot = machine ? lift * 0.025 : (step % 2 ? -1 : 1) * lift * 0.07;
  } else if (step < 6) {
    const j = (beat - 4) / 2;
    // Crouch, leap, half-turn in the air, land. Vehicles do a short reverse-and-pivot instead.
    const jump = Math.sin(Math.PI * clamp((j - 0.12) / 0.76));
    y = machine ? 0 : jump * (variant === 2 ? 0.4 : 0.28);
    x = machine ? -Math.sin(j * Math.PI) * 0.24 : -Math.sin(j * Math.PI) * 0.12;
    turn = j >= 0.5;
    sx = 1 - 0.65 * Math.pow(Math.sin(j * Math.PI), 12);
    sy = machine ? 1 : j < 0.12 ? 1 - 0.15 * Math.sin(j / 0.12 * Math.PI) : j > 0.88 ? 1 - 0.13 * Math.sin((j - 0.88) / 0.12 * Math.PI) : 1;
  } else {
    // A held salute/bow, then a deliberate recovery to the first step.
    rot = machine ? 0 : -Math.sin((beat - 6) / 2 * Math.PI) * (variant === 0 ? 0.3 : 0.14);
    sy = machine ? 1 : 1 - Math.sin((beat - 6) / 2 * Math.PI) * 0.08;
  }
  return { x, y, rot, sx, sy, turn, step, q, stride: t * 1.25 };
}

export function slingFall(age) {
  const t = Math.max(0, age), impact = 0.68;
  return { t, broken: t >= impact, fall: smooth(t / impact), scatter: smooth((t - impact) / 0.7), dust: clamp(1 - (t - impact) / 0.65) };
}
