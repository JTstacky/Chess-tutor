// Portrait tablets have spare height, but their world scale makes score text tiny.
// Keep this header in CSS pixels; the field and its touch mapping stay world-scaled.
export function portraitHud(lay) {
  if (lay.w <= 520 || !lay.portrait || !lay.compact) return null;
  const edge = 8 + Math.max(lay.safe?.l || 0, lay.safe?.r || 0);
  const top = 8 + (lay.safe?.t || 0), clockWidth = 88, gap = 12;
  const width = Math.min(272, (lay.w - edge * 2 - clockWidth - gap * 2) / 2);
  const height = 42, radius = Math.max(22, 26 * lay.s);
  const panels = [edge, lay.w - edge - width].map(x => ({x, y: top, w: width, h: height}));
  const rapidWidth = Math.min(112, width - 16);
  return {
    panels,
    rapid: panels.map((p,i) => ({x:i ? p.x+p.w-8-rapidWidth : p.x+8,y:top+height+4,w:rapidWidth,h:20})),
    clock: {x: (lay.w - clockWidth) / 2, y: top, w: clockWidth, h: height},
    hpFont: 12, goldFont: 17, clockFont: 24, rapidFont: 12,
    pauseY: top + height + 8 + radius,
    noticeY: top + height + 8 + radius * 2 + 16,
  };
}
