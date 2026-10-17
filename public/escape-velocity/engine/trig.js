// EV trigonometry, transcribed from the start-up table builder 0x10060390 and the bearing
// routine 0x10060d2c -> 0x10060534 (research deep-physics §5.1).
// Headings are whole degrees, 0 = up, clockwise; y grows downward.
const DEG = 0.01745329;                        // the literal used by EV, not exact pi/180
export const SIN = new Float64Array(360), COS = new Float64Array(360);
for (let i = 0; i < 360; i++) { SIN[i] = Math.sin(DEG * i); COS[i] = Math.cos(DEG * i); }
const ATAN = new Int16Array(1024);
for (let i = 0; i < 1024; i++) ATAN[i] = Math.trunc(Math.atan(0.01 * i) * 57.2957795);

export const wrap = a => { a %= 360; return a < 0 ? a + 360 : a; };
export const sinT = a => SIN[wrap(Math.trunc(a))];
export const cosT = a => COS[wrap(Math.trunc(a))];

// add_polar 0x10060a80: vec.x += sin(a)*m ; vec.y -= cos(a)*m
export function addPolar(v, a, m) { const i = wrap(Math.trunc(a)); v.x += SIN[i] * m; v.y -= COS[i] * m; }

// Compass bearing of (bx,by) as seen from (ax,ay).
export function bearing(ax, ay, bx, by) {
  const a = ax - bx, b = ay - by, aa = Math.abs(a), ab = Math.abs(b);
  let q;
  if (aa >= ab) q = aa === 0 ? 0 : ab / aa; else q = aa / ab;
  let r = Math.abs(ATAN[Math.min(1023, Math.max(0, Math.trunc(100 * q)))]);
  if (aa < ab) r = 90 - r;
  if (a < 0 && b >= 0) r = 180 - r;
  else if (a < 0 && b < 0) r += 180;
  else if (a >= 0 && b < 0) r = -r;
  return wrap(r - 90);
}

// thrust_limited 0x10060b00: per-axis soft cap; a step is never clipped.
export function thrustLimited(v, a, accel, maxSpeed) {
  const i = wrap(Math.trunc(a));
  const sx = SIN[i] * accel, sy = -COS[i] * accel;
  const lx = Math.abs(SIN[i] * maxSpeed), ly = Math.abs(COS[i] * maxSpeed);
  const sgn = x => (x < 0 ? -1 : 1);
  if (Math.abs(v.x) < lx || sgn(v.x) !== sgn(sx)) v.x += sx;
  if (Math.abs(v.y) < ly || sgn(v.y) !== sgn(sy)) v.y += sy;
}

// Box clamp 0x10060da8
export function boxClamp(v, lx, ly = lx) {
  if (v.x > lx) v.x = lx; else if (v.x < -lx) v.x = -lx;
  if (v.y > ly) v.y = ly; else if (v.y < -ly) v.y = -ly;
}
