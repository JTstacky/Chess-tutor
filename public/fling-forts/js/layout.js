// layout.js — screen layout and touch geometry: world <-> screen, control-strip buttons, race-pick cards,
// pause button. Integrator lane (see docs/COORDINATION.md). view.js draws with these; input.js hit-tests with them.
import * as S from './sim.js';

const { W, AMMO, BUILD } = S;
export const HUD_H = 212;                 // control strip under the ground line, in world units
export const SKY_MIN = 640;               // world height kept visible on the race-pick screen (its cards reach 566)
// During a match only the forts must stay in view, so the field zooms in until the forts reach the screen edges
// (owner feedback 2026-11-25: zoom too small on phones, forts not out at the edges). High shots may leave the top.
export const PLAY_SKY = 500, PHONE_SKY = 350;

// ---------- layout ----------
// Short landscape screens (phones) get their own control strip: three rows of buttons sized in CSS pixels so each is
// at least 44 px tall and wide, spread across the full screen width; the field takes the height that is left.
// Tablets and desktops keep the world-scaled strip.
export const PHONE_H = 520, PHONE_BTN = 44, PHONE_GAP = 4;
let LAY = null;                           // the layout now on screen, so buttons() matches what is drawn
export function computeLayout(cssW, cssH, dpr, view = 'play', safe = { l: 0, r: 0 }) {
  const phone = cssH < PHONE_H && cssW > cssH;
  let lay;
  if (view === 'pick') {
    // the race pick covers the field and has no control strip, so it uses the whole height (BUGS.md S1: on phones
    // it used to get only the top 60%, with cards 43-53 px wide)
    const s = Math.min(cssW / W, cssH / SKY_MIN);
    lay = { view, s, ox: (cssW - W * s) / 2, gy: cssH, w: cssW, h: cssH, dpr, portrait: cssH > cssW * 1.1, compact: null };
  } else if (phone) {
    const hud = 3 * PHONE_BTN + 4 * PHONE_GAP, s = Math.min(cssW / W, (cssH - hud) / (view === 'pick' ? SKY_MIN : PHONE_SKY));
    const inset = Math.max(safe.l, safe.r), bw = Math.max(PHONE_BTN, Math.min(84, Math.floor((cssW / 2 - 10 - inset - 5 * PHONE_GAP) / BPER)));
    lay = { view, s, ox: (cssW - W * s) / 2, gy: cssH - hud, w: cssW, h: cssH, dpr, portrait: false, compact: { bw, bh: PHONE_BTN, gap: PHONE_GAP, l: 5 + safe.l, r: 5 + safe.r } };
  } else {
    const s = Math.min(cssW / W, cssH / (HUD_H + (view === 'pick' ? SKY_MIN : PLAY_SKY)));
    lay = { view, s, ox: (cssW - W * s) / 2, gy: cssH - HUD_H * s, w: cssW, h: cssH, dpr, portrait: cssH > cssW * 1.1, compact: null };
  }
  LAY = lay;
  return lay;
}
export const worldToScreen = (lay, x, y) => ({ x: lay.ox + x * lay.s, y: lay.gy - y * lay.s });
export const screenToWorld = (lay, sx, sy) => ({ x: (sx - lay.ox) / lay.s, y: (lay.gy - sy) / lay.s });

// three rows of six slots per player: shots and fort upgrades, then builds and flyers, then ground troops
const BPER = 6;                                                       // buttons per row
export const BTN_KEYS = ['stone', 'scatter', 'fire', 'boulder', 'shield', 'ult', 'wall', 'tower', 'mine', 'a0', 'a1', null, 'g0', 'g1', 'g2', 'g3', null, null];   // owner: no vault, no hero; four ground troops
export const BW = 100, BH = 60, BGAP = 6, BX0 = 8, BY0 = -12;     // button boxes as left-fort world coords (below ground = negative y)
/** Button rectangles for player p in world coords: { key, kind, slot, x, y (top), w, h }.
 *  `lay` defaults to the layout on screen; on a phone layout the boxes come from CSS pixels (see computeLayout). */
export function buttons(p, lay = LAY) {
  const out = [], c = lay && lay.compact;
  BTN_KEYS.forEach((key, i) => {
    if (!key) return;
    const col = i % BPER, row = Math.floor(i / BPER);
    const kind = AMMO[key] ? 'ammo' : BUILD[key] ? 'build' : key === 'hero' ? 'hero' : key === 'ult' ? 'ult' : 'unit', slot = kind === 'unit' ? Number(key[1]) : -1;
    if (c) {
      const px = p === 0 ? c.l + col * (c.bw + c.gap) : lay.w - c.r - c.bw - col * (c.bw + c.gap), py = lay.gy + c.gap + row * (c.bh + c.gap);
      out.push({ key, kind, slot, x: (px - lay.ox) / lay.s, y: (lay.gy - py) / lay.s, w: c.bw / lay.s, h: c.bh / lay.s });
      return;
    }
    const u = BX0 + col * (BW + BGAP), x = p === 0 ? u : W - u - BW;
    out.push({ key, kind, slot, x, y: BY0 - row * (BH + BGAP), w: BW, h: BH });
  });
  return out;
}
export function buttonAt(p, x, y) { return buttons(p).find((b) => x >= b.x - 3 && x <= b.x + b.w + 3 && y <= b.y + 4 && y >= b.y - b.h - 4) || null; }
/** What a button means for this player right now (null = an empty slot: that race has no such troop). */
export const keyFor = (s, p, b) => (b.kind === 'unit' ? S.raceOf(s, p)[b.key[0] === 'a' ? 'air' : 'ground'][b.slot] || null : b.kind === 'hero' ? S.raceOf(s, p).hero : b.key);
export const PAUSE = { x: W / 2, y: SKY_MIN - 96, r: 26 };
// race pick: three cards per player in their own half, a Ready button under them (world coords for player 0)
export const PICK = { cards: S.RACE_KEYS.map((k, i) => ({ key: k, x: 12 + (i % 5) * 126, y: 566 - Math.floor(i / 5) * 150, w: 120, h: 144 })), ready: { x: 170, y: 100, w: 300, h: 86 } };   // 86 tall: at least 44 CSS px on a 667x375 phone
export function pickHit(p, x, y) {
  const u = p === 0 ? x : W - x;
  const hit = (r) => u >= r.x && u <= r.x + r.w && y <= r.y && y >= r.y - r.h;
  const c = PICK.cards.find(hit);
  if (c) return { race: c.key };
  return hit(PICK.ready) ? { ready: true } : null;
}
