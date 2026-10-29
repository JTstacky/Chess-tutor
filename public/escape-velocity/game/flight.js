// Flight view: playfield (496x480) plus the original 144 px status bar (PICT 128).
import { isDisabled, isDead, hasOutfit, POD_TYPE } from '../engine/ships.js';
import { MOD, SPOB } from '../engine/data.js';
import { freeCargo } from '../engine/missions.js';
import { addPolar, bearing } from '../engine/trig.js';
import { modSum } from '../engine/encounters.js';
import { friendlyToPlayer } from '../engine/ai.js';

export const VIEW_W = 496, VIEW_H = 480, BAR_X = 496;
// Full-screen layout in portrait (main.js, re-gaps #65): the bar's three parts side by side across the top, as
// [source top, height] of PICT 128: radar + shield/fuel, nav + secondary + target, cargo + credits.
export const BAR_PARTS = [[0, 186], [186, 196], [382, 98]];   // panel gaps at rows 142, 186, 231, 258, 382
export const BAR_BLOCK = { w: 144 * BAR_PARTS.length, h: Math.max(...BAR_PARTS.map(p => p[1])) };
// Where the full-screen layout puts the status bar on a W x H flight canvas (480 px on its short side).
// Landscape: the original 144 x 480 bar whole, as one column down an edge of the screen: the right edge as in the
// original, or the left with touch on, so the right edge stays free for the thumb buttons. The playfield is the
// rest of the canvas, with the ship at its centre. Portrait: the bar's three parts in a row across the top, over
// the playfield. view is the playfield's rect on the canvas.
export function barPlacement(W, H, side = 'right') {
  if (W > H) {
    const left = side === 'left';
    return { col: true, x: left ? 0 : W - 144, y: 0, w: 144, h: Math.min(H, 480), view: { x: left ? 144 : 0, y: 0, w: W - 144, h: H } };
  }
  return { col: false, x: W - BAR_BLOCK.w, y: 0, w: BAR_BLOCK.w, h: BAR_BLOCK.h, view: { x: 0, y: 0, w: W, h: H } };
}
export const GREEN = '#00e000', DIM = '#008a00';
// Geneva 9 (TextFont 3, TextSize 9) is drawn with Kelsey Higham's "Geneva 9" bitmap clone (CC BY 3.0,
// game/fonts/geneva-9). Its grid is 64 units at 1024/em, so at 16 px every brick is one screen pixel and
// the advance widths match the Mac's (measured against orig-76: 239/240/225/204 px lines, equal).
// Until the face has loaded (or if it fails) a browser sans stands in. FONT_SMALL is the map's 7-pt label
// face (Geneva at TextSize 7, map scale > 1), which the clone doesn't cover. Measured in the running
// original on 2026-10-17 (m-map3): cap height 5 px, x-height 4, ink widths Centauri 28, Rigel 15, Levo 16,
// Matar 18. The EVGeneva stand-in at 5.25 px gives cap 5 and 27/16/15/18 (re-gaps #22).
// The browser would anti-alias those outlines, so text in this face is drawn from the clone's own
// bitmaps (game/fonts/geneva-9/geneva-9.json, made by tools/fonts/make-geneva9.py): fillText is
// wrapped once, and for this font only it blits each glyph at whole-pixel pen positions, as QuickDraw
// does. measureText still uses the font, whose advances are the bitmaps' advances. Centred text is
// placed by integer halves (FUN_1006137c). A 'top' baseline puts the baseline 8 px down, as the
// browser fonts used before did; dialogs that know their TETextBox metrics pass explicit baselines.
export const GENEVA9 = '16px EVGeneva9', FONT_SMALL = '5.25px EVGeneva, Geneva, Tahoma, Arial, sans-serif';
export let FONT = '10px Geneva, Tahoma, Arial, sans-serif';
export async function loadGeneva9() {
  try {
    const face = new FontFace('EVGeneva9', 'url(game/fonts/geneva-9/geneva-9.ttf)');
    const [, table] = await Promise.all([face.load(), fetch('game/fonts/geneva-9/geneva-9.json').then(r => r.json())]);
    document.fonts.add(face);
    installBitmapFont(GENEVA9, table);
    FONT = GENEVA9;
  } catch { }
  await loadStandins();
}
// The faces with no open clone (system font, Times 18, Geneva 7) use Liberation-derived stand-ins built
// by tools/fonts/make-standins.py (SIL OFL 1.1, game/fonts/standins): cap height and line widths are
// scaled to the original's at its point size, kerning is dropped as QuickDraw didn't kern. Bundled so
// the sizes are the same on every platform (docs/fonts.md).
async function loadStandins() {
  await Promise.all(['EVSys:ev-sys', 'EVTimes:ev-times', 'EVGeneva:ev-geneva'].map(async s => {
    const [family, file] = s.split(':');
    try { const f = new FontFace(family, `url(game/fonts/standins/${file}.ttf)`); await f.load(); document.fonts.add(f); } catch { }
  }));
}
function installBitmapFont(font, table) {
  const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
  const name = probe.font, G = table.glyphs, cache = new Map();
  const glyph = (ch, color) => {
    const k = color + ch; let c = cache.get(k);
    if (c === undefined) {
      const g = G[ch]; c = null;
      if (g && g[3]) {
        c = document.createElement('canvas'); c.width = g[3]; c.height = g[4].length;
        const x = c.getContext('2d'); x.fillStyle = color;
        g[4].forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') x.fillRect(i, y, 1, 1); });
      }
      cache.set(k, c);
    }
    return c;
  };
  const P = CanvasRenderingContext2D.prototype, fill = P.fillText;
  P.fillText = function (t, x, y, ...rest) {
    if (this.font !== name || typeof this.fillStyle !== 'string') return fill.call(this, t, x, y, ...rest);
    t = String(t);
    let w = 0; for (const ch of t) w += G[ch] ? G[ch][0] : this.measureText(ch).width;
    const al = this.textAlign, bl = this.textBaseline;
    let px = Math.round(al === 'center' ? x - Math.floor(w / 2) : al === 'right' || al === 'end' ? x - w : x);
    const py = Math.round(bl === 'top' ? y + 8 : bl === 'middle' ? y + 4 : bl === 'bottom' || bl === 'ideographic' ? y - table.descent : bl === 'hanging' ? y + table.ascent : y);
    const color = this.fillStyle;
    for (const ch of t) {
      const g = G[ch];
      if (!g) {   // not in the clone: the browser's fallback face, at the pen position
        const a = this.textAlign; this.textAlign = 'left'; this.textBaseline = 'alphabetic';
        fill.call(this, ch, px, py); this.textAlign = a; this.textBaseline = bl;
        px += this.measureText(ch).width; continue;
      }
      const c = glyph(ch, color);
      if (c) this.drawImage(c, px + g[1], py + g[2]);
      px += g[0];
    }
  };
}
// The Mac system font (font 0, Chicago; Charcoal under Mac OS 8/9) at 12 pt, used for flight messages.
export const SYSFONT = '12px EVSys, Charcoal, Chicago, Tahoma, sans-serif';
// Status bar colours, measured in the running original (orig-37/38/53). Those captures carry the
// emulator's display gamma (PICT 128's 0x22 shows as 63, 0x55 as 119, 0x99 as 179), so the values
// here are the QuickDraw ones before it: dim -0xc5e = (0,0x99,0) (shown as 179), bright -0xc58 =
// (0,0xff,0), panel background -0xc52 = PICT 128's (0,0x22,0). All these RGB records are set at start-up
// by FUN_1005afb8: -0xc64 (fuel short of a full jump) = (0,0x6666,0), -0xc70 (target blip with IFF) =
// grey 0xc000, -0xc76 grey 0x8000, -0xc7c grey 0x4000, -0xc82 (0,0,0x428f). On the 8-bit screen they
// land on the nearest system-palette entry (QuickDraw's 4-bit inverse table): 0x66, 0xcc, 0x88, 0x44
// and (0,0,0x44), which is what the running original shows (#888888 dialog frames, #000044 cells).
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const BAR = { dim: [0, 153, 0], bright: [0, 255, 0], bgRgb: [0, 34, 0], partial: [0, 102, 0], targetIff: [0xcc, 0xcc, 0xcc] };
Object.assign(BAR, { dimCss: rgb(BAR.dim), brightCss: rgb(BAR.bright), bgCss: rgb(BAR.bgRgb), bg: rgb(BAR.bgRgb), partialCss: rgb(BAR.partial), targetIffCss: rgb(BAR.targetIff) });
const BAR_FONT = '14px EVUI';                       // TextFont 2020 (FOND 2020 -> sfnt 9295), TextSize 14
// Radar 0x1005d8ec: scope (R-0x8b,4)-(R-6,0x8a), 1/32 scale (const -0x6488), centre at the rect's middle.
const RADAR = { l: 501, t: 4, r: 634, b: 138 };
const RADAR_SCALE = 0.03125;
// EVUI (FOND 2020 -> sfnt 9295) at 14 ppem: [advance, left, top, rows], each row one hex digit of
// coverage (0-15) per pixel from the left. Mac OS 9 smooths this font with full TrueType hinting:
// stems land on whole pixels and only diagonals are grey (orig-37). FreeType's v35 (full hinting)
// interpreter in greyscale reproduces that; its "Nav System Off" matches the original except the
// bottom of the 'v', so 'v' is the original's own pixels (orig-37, x 537-541, y 208-214).
const EVUI_14 = {" ":[4,0,0,""],"!":[4,0,10,"aff6.aff6.aff6.aff6.aff6.aff6.3552...aff6"],"\"":[6,1,10,"f0f.f0f.f0f.f0f"],"#":[11,0,10,"00f00000f.00f00000f.00f00000f.fffffffff9.00ff000ff.00ff000ff.00ff000ff.fffffffff9.00f00000f.00f00000f"],"$":[6,0,11,"00f.fffff.f.f.f.f.fffff.0000f.0000f.0000f.fffff.00f"],"%":[12,0,10,"ffff000001a1.ff0f00001c9.ff0f0001ca.ffff001ba.000000ba.00000ba.0000ba.000aa00ffff.00ab000ff0f.0ab0000ff0f.9b00000ff4f.6100000bbbb"],"&":[9,0,10,"fffff8.f0000f.f.f.e4.6a5.f.f0000507.f0000385.f0002db6.f001d709.ffff8"],"'":[3,0,10,"f.f.f.f"],"(":[5,-1,10,"00031.0007.0054.01b.086.2e1.1e3.069.00c.0055.0007.00032"],")":[5,0,10,"4.26.091.057.00d1.0088.005c.00b3.039.081.16.4"],"*":[8,-1,10,"03000f063.1ea00f5d2.04ea0fe2.003def3.0004ff1.001d6fc1.01c70fac1.05800f088"],"+":[8,0,7,"000f.000f.000f.fffffff.000f.000f.000f"],",":[4,0,2,"01.0c6.2f5.36"],"-":[5,-1,4,"6fff1.6fff1"],".":[2,0,1,"f"],"/":[5,0,10,"002e.006a.0096.00d2.02e.06a.096.0d2.2e.6a.96.d2"],"0":[7,0,10,"ffffff.f0005f.f003ff.f03eff.f5ee4f.ffe30f.ff300f.ff000f.ff000f.ffffff"],"1":[7,0,10,"fff.00f.00f.00f.00f.00f.00f.00f.00f.fffff"],"2":[7,0,10,"ffffff.00000f.00000f.00000f.00000f.ffffff.f.f.f.ffffff"],"3":[7,0,10,"0efff.0000f.0000f.0000f1.0000f7.0effff5.0000ff5.0000ff5.0000ff5.ffffff5"],"4":[7,0,10,"f.f.f0006.f000f.f000f.f000f.ffffff.0000f.0000f.0000f"],"5":[7,0,10,"ffffff.f.f.f.f.ffffff.00000f.00000f.00000f.ffffff"],"6":[7,0,10,"ffff.f.f.f.f.fffff.ff00f.ff00f.ff00f.fffff"],"7":[7,0,10,"fffff.f000f.f003f.300ad.004e2.00c5.00f1.00f.00f.00f"],"8":[7,0,10,"fffff.f000f.f000f.f000f.f000fa.ffffff.ff000f.ff000f.ff000f.ffffff"],"9":[7,0,10,"fffff.f000f.f000f.f000f.f000f.fffff.0000f.0000f.0000f.fffff"],":":[4,1,6,"f...f"],";":[4,0,6,"0f.....0a2.1f3.26"],"<":[8,0,8,"00000001.000006c7.0028eb4.3ae92.fd4.27bea51.00015ae7.00000001"],"=":[8,0,5,"9ffffff7..9ffffff7"],">":[8,0,8,"1.9b5.05bd71.00039ea3.000016ef.026beb72.8e951.1"],"?":[6,0,10,"fffff.0000f.0000f.0000f.0000f.00fff.00f.001..00f"],"@":[11,0,10,"ffffffffff.f00000000f.f00000000f.f0fffff00f.f0f000f00f.f0f000f00f.f0f000f00f.f0ffffffff.f.ffffffff5"],"A":[7,0,10,"fffff.f000f.f000f.fffffb.f0000f.f0000f.f0000f.f0000f.f0000f.f0000f"],"B":[7,0,10,"fffff.f000f.f000f.fffffb.f0000f.ff000f.ff000f.ff000f.ff000f.ffffff"],"C":[7,0,10,"ffffff.f.f.f.f.f.f.f.f.ffffff"],"D":[7,0,10,"fffff6.f0000f.f0000f.f0000f.f0000f.f8000f.ff000f.ff000f.ff000f.fffff6"],"E":[6,0,10,"fffff4.f.f.f.ffff2.f.f.f.f.fffff4"],"F":[6,0,10,"fffff4.f.f.f.ffff2.f.f.f.f.f"],"G":[7,0,10,"ffffff.f.f.f.f.f00fff.f0000f.f0000f.f0000f.ffffff"],"H":[7,0,10,"f0000f.f0000f.f0000f.f0000f.ffffff.f0000f.f0000f.f0000f.f0000f.f0000f"],"I":[3,0,10,"f.f.f.f.f.f4.fe.fe.fe.fe"],"J":[7,0,10,"00000f.00000f.00000f.00000f.00000f.00000f.00000f.00000f.f0000f.7fffff"],"K":[8,0,10,"f0000b8.f00078.f0035.f013.f0a3.fffd2.f05ee3.f001ae2.f000059.f000001"],"L":[6,0,10,"f.f.f.f.f.f.f.f.f.fffff4"],"M":[9,0,10,"fffffffff.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f"],"N":[8,0,10,"ffffa0f.f000f0f.f000f0f.f000f0f.f000f0f.f000f0f.f000f0f.f000f0f.f000e0f.f0003bf"],"O":[7,0,10,"ffffff.f0000f.f0000f.f0000f.f0000f.f8000f.ff000f.ff000f.ff000f.ffffff"],"P":[7,0,10,"ffffff.f0000f.f0000f.f0000f.ffffff.f.f.f.f.f"],"Q":[7,0,10,"ffffff.f0000f.f0000f.f0000f.f0000f.f8000f.ff000f.ff003d.ff07fc.ffff895"],"R":[7,0,10,"ffffff.f0000f.f0000f.f0000f.f0000d.fffff6.f002eb.f0004f.f0000f.f0000f"],"S":[6,0,10,"fffff.f.f.f.f.fffff.0000f.0000f.0000f.fffff"],"T":[7,0,10,"fffff.00f.00f.00f.00f.00f.00f.00f.00f.00f"],"U":[7,0,10,"f0000f.f0000f.f0000f.f0000f.f0000f.f0000f.f0000f.f0000f.f0000f.ffffff"],"V":[7,0,10,"f0000f.f0000f.f0000f.f0000f.f1000f.f2000f.e4000f.4e202f.06d3d6.007f7"],"W":[11,0,10,"f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f.fffffffff"],"X":[7,0,10,"f0000f.f0000f.f0000f.f0000f.f9999f.799996.f0000f.f0000f.f0000f.f0000f"],"Y":[7,0,10,"f000f.f000f.f000f.f000f.f000f.fffff.007.00f.00f.00f"],"Z":[7,0,10,"ffffff.00000f.00007d.0006d1.006d2.05d2.5e3.f3.f.ffffff5"],"[":[5,1,10,"fff3.f1.f.f.f.f.f.f.f.f.f2.fff3"],"\\":[4,-2,10,"0d4.06b.00d4.006b.000d4.0006b.0000d4.00006b.00000d4.000006b."],"]":[5,0,10,"8ff.01f.00f.00f.00f.00f.00f.00f.00f.00f.01f.8ff"],"^":[7,0,10,"004f2.00bd7.04d4d.0b50d2.4d0087.b5003d."],"_":[7,0,-1,"fffffff"],"`":[5,0,11,"1.a6.3e1.06a"],"a":[7,0,6,"ffffff.00000f.ffffff.f000ff.f000ff.ffffff"],"b":[7,0,10,"f.f.f.ffffff.f0000f.f0000f.f8000f.ff000f.ff000f.ffffff"],"c":[6,0,6,"fffff4.f.f.f.f.fffff4"],"d":[6,0,10,"0000f.0000f.0000f.0000f.fffff.f000f.f200f.ff00f.ff00f.fffff"],"e":[7,0,6,"ffffff.f0000f.ffffff.f.f.ffffff"],"f":[7,0,10,"00fff.00f.00f.00f.fffff.00f.00f.00f.00f.00f"],"g":[7,0,6,"ffffff.f0000f.ff000f.ff000f.ff000f.ffffff.00000f.00000f.ffffff"],"h":[6,0,10,"f.f.f.f.fffff.f000f.f000f.f000f.f000f.f000f"],"i":[3,0,7,"f.3.f.f.fe.fe.fe"],"j":[6,0,7,"0000f..0000f.0000f.0000f.0000f.0000f.0000f.0000f.fffff"],"k":[6,0,10,"f.f.f00031.f002a1.f028.f45.f6.fe81.f04a6.f00021.1"],"l":[3,0,10,"f.f.f.f.f.f.f.f.f.f"],"m":[10,0,6,"fffffffff.f000f000f.f000f000f.f000f000f.f000f000f.f000f000f"],"n":[7,0,6,"ffffff.f0000f.f0000f.f0000f.f0000f.f0000f"],"o":[7,0,6,"ffffff.f0000f.ff000f.ff000f.ff000f.ffffff"],"p":[7,0,6,"ffffff.f0000f.f0000f.ff000f.ff000f.ffffff.f.f"],"q":[7,0,6,"ffffff.f0000f.ff000f.ff000f.ff000f.ffffff.00000f.00000f"],"r":[6,0,6,"fffff.f.f.f.f.f"],"s":[6,0,6,"fffff.f.fffff.0000f.0000f.fffff"],"t":[5,0,10,"0f.0f.0f.fff.0f.0f.0f.0f.0f.0ff"],"u":[6,0,6,"f000f.f000f.f000f.f000f.f000f.fffff"],"v":[6,0,6,"f000f.f000f.f000f.f202f.6d2d6.0bf9.006"],"w":[11,0,6,"f000f000f.f000f000f.f000f000f.f000ff00f.f000ff00f.fffffffff"],"x":[6,0,6,"f000f.f000f.f000f.48887.b000f.f000f"],"y":[6,0,6,"f000f.f000f.f000f.f000f.f000f.fffff.0000f.0000f.fffff"],"z":[6,0,6,"ffffe.00065.0013.02.51.fffff"],"{":[7,0,11,".0005.00a3.00f.00f.02e.0a8.1e2.089.01f.00f.0083.0002"],"|":[3,1,10,"f.f.f.f.f.f.f.f.f.f"],"}":[7,2,11,".5.2a.0f.0f.0e2.08a.02e1.098.0f1.0f.39.3"],"~":[8,0,6,"0000001.03b201c2.1a3c7a9.84007b.1"]};
const PPAT_URL = (base, id) => `${base}icons/${/\/evo\//.test(base) ? 'Override' : 'EV'}_Graphics/ppat_${id}.png`;
// Beam draw (end of 0x1002dd40, asm 0x1002fb7c-0x10030118): ForeColor by Graphic, pen ProxRadius square.
// -2..-7 one line: red, green, blue, cyan, magenta, yellow. -8/-9/-10 two lines: red/green/blue at the
// full width, then a magenta/yellow/cyan core at trunc(ProxRadius / 2). The classic QuickDraw colours
// are shown on EV's 8-bit screen as their nearest system-palette entries (red and magenta measured, #61).
const QD = { red: '#dd0000', green: '#008800', blue: '#0000dd', cyan: '#0099ff', magenta: '#ff0099', yellow: '#ffff00' };
const BEAM_COLORS = { [-2]: [QD.red], [-3]: [QD.green], [-4]: [QD.blue], [-5]: [QD.cyan], [-6]: [QD.magenta], [-7]: [QD.yellow],
  [-8]: [QD.red, QD.magenta], [-9]: [QD.green, QD.yellow], [-10]: [QD.blue, QD.cyan] };
// QuickDraw's pen hangs below and right of the path: a w x w pen swept from p0 to p1.
function penLine(ctx, x0, y0, x1, y1, w, color) {
  if (w < 1) return;
  const h = w / 2;
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(Math.trunc(x0) + h, Math.trunc(y0) + h); ctx.lineTo(Math.trunc(x1) + h, Math.trunc(y1) + h); ctx.stroke();
  ctx.lineCap = 'butt';
}

// Deterministic star field in three parallax layers.
const STARS = (() => {
  let s = 12345; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 260 }, (_, i) => ({ x: r() * 1024, y: r() * 1024, f: [0.25, 0.5, 1][i % 3], c: [90, 150, 230][i % 3] }));
})();

function wrapLines(ctx, text, width) {
  const out = [];
  for (const para of String(text).split('\r').join('\n').split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (line && ctx.measureText(t).width > width) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

export class FlightView {
  constructor(assets) { this.assets = assets; this.explosions = []; this.messages = []; this.glyphs = new Map(); }

  onEvent(game, e) {
    // FUN_1001e3d8's last argument delays an explosion by that many frames.
    if (e.type === 'explosion') this.explosions.push({ kind: e.kind, x: e.x, y: e.y, t: -(e.delay ?? 0) });
    // FUN_1001c7dc keeps a single message (DAT_10084fa8) and its tick count: a new one replaces the old.
    else if (e.type === 'msg') this.messages = [{ text: e.text, t: 0, ticks: e.ticks ?? 0xf0, kind: e.kind }];
  }
  tick() {
    for (const x of this.explosions) x.t++;
    this.explosions = this.explosions.filter(x => x.t < 16);
    for (const m of this.messages) m.t++;
    this.messages = this.messages.filter(m => m.t < m.ticks);
    this.radarTick();
  }

  // full: the bar where barPlacement puts it (this.barSide: 'right' or 'left') and the playfield beside or under
  // it, the ship at the playfield's centre; otherwise the original 496x480 playfield and the bar at x 496.
  draw(ctx, game, W = 640, H = 480, full = false) {
    const A = this.assets, P = game.player, D = game.data;
    const bp = this.bar = full ? barPlacement(W, H, this.barSide) : null;
    const VIEW_X = bp ? bp.view.x : 0, VIEW_W = bp ? bp.view.w : 496, VIEW_H = bp ? bp.view.h : 480;
    this.view = { x: VIEW_X, y: 0, w: VIEW_W, h: VIEW_H };
    ctx.save();
    if (VIEW_X) ctx.translate(VIEW_X, 0);
    ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const cx = P?.x ?? 0, cy = P?.y ?? 0, ox = VIEW_W / 2 - cx, oy = VIEW_H / 2 - cy;
    // stars (a 1024 px tile, repeated when the playfield is wider or taller)
    for (const s of STARS) {
      const x0 = ((s.x - cx * s.f) % 1024 + 1024) % 1024, y0 = ((s.y - cy * s.f) % 1024 + 1024) % 1024;
      for (let x = x0; x < VIEW_W; x += 1024) for (let y = y0; y < VIEW_H; y += 1024) { ctx.fillStyle = `rgb(${s.c},${s.c},${s.c})`; ctx.fillRect(x | 0, y | 0, 1, 1); }
    }
    // stellar objects
    for (const p of D.spobs(game.system)) {
      if (!game.spobInPlay(p.id)) continue;   // sprites only for stellars in play (EVO 0x10061d74)
      const x = p.xPos + ox, y = p.yPos + oy;
      if (x < -200 || y < -200 || x > VIEW_W + 200 || y > VIEW_H + 200) continue;
      A.sprite(ctx, 300 + p.Type, 0, x, y);
      if (game.navSpob === p.id) this.brackets(ctx, x, y, (D.sprite(300 + p.Type)?.w ?? 60) / 2 + 4, '#808080');
    }
    // asteroids (sprite layer 4, above the stellars' 2 and below the ships' 10): spïn 800 / 801
    for (const r of game.roids ?? []) if (r.sprite && r.active) A.sprite(ctx, r.big ? 801 : 800, r.frame, r.x + ox, r.y + oy);
    for (const b of game.boxes ?? []) if (b.life >= 0) A.sprite(ctx, 500, b.frame, b.x + ox, b.y + oy);   // layer 2
    // ships
    for (const s of game.ships) {
      if (!s?.alive) continue;
      const x = s.x + ox, y = s.y + oy;
      if (x < -150 || y < -150 || x > VIEW_W + 150 || y > VIEW_H + 150) continue;
      if (s.slot === 0 && s.death > 0 && s.death < 4) continue;
      A.sprite(ctx, s.type, Math.round(s.facing / 10) % 36, x, y);   // a cloaked ship is drawn as usual: the cloak tints the palette
      if (s.slot === 0 && s.afterburning && game.frame % 2) {
        const p = { x, y }; addPolar(p, s.facing + 180, (D.sprite(s.type)?.h ?? 24) / 2 + 2);
        ctx.fillStyle = '#ffd040'; ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
      }
    }
    // shots and beams
    for (const sh of game.shots) {
      if (sh.life <= -2) continue;
      const W = D.weap[sh.wid], spin = 200 + W.Graphic;
      const f = (W.MiscFlags & 1) ? game.frame % 36 : Math.round(sh.heading / 10) % 36;
      if (!A.sprite(ctx, spin, f, sh.x + ox, sh.y + oy)) { ctx.fillStyle = '#fff'; ctx.fillRect(sh.x + ox - 1, sh.y + oy - 1, 2, 2); }
    }
    for (const b of game.beams) {
      if (b.life < 0 || b.len == null || b.off) continue;
      const W = D.weap[b.wid], e = { x: b.x, y: b.y }; addPolar(e, b.angle, b.len);
      const cols = BEAM_COLORS[W.Graphic]; if (!cols) continue;
      penLine(ctx, b.x + ox, b.y + oy, e.x + ox, e.y + oy, W.ProxRadius, cols[0]);
      if (cols[1]) penLine(ctx, b.x + ox, b.y + oy, e.x + ox, e.y + oy, Math.trunc(W.ProxRadius / 2), cols[1]);
    }
    for (const x of this.explosions) {
      const s = D.sprite(400 + x.kind); if (!s || x.t < 0) continue;
      const f = Math.floor(x.t * s.frames / 16);
      A.sprite(ctx, 400 + x.kind, f, x.x + ox, x.y + oy);
    }
    // target brackets
    const T = P && P.target >= 0 ? game.ships[P.target] : null;
    if (T?.alive) {
      const sp = D.sprite(T.type);
      this.brackets(ctx, T.x + ox, T.y + oy, Math.max(sp?.w ?? 24, sp?.h ?? 24) / 2 + 3, game.hostileToPlayer(T) ? '#e00000' : GREEN);
    }
    if (this.modern && P) this.edgeArrows(ctx, game, ox, oy, VIEW_W, VIEW_H, full && !bp.col);
    // message: TETextBox, system font 12, white, top-left aligned (measured in the original: left edge
    // x=26, cap tops at 408 so the first baseline is y=417, 16 px lines; the breaks of orig-37/53/65 need
    // a wrap width of 418-424 px with the EVSys stand-in)
    const m = this.messages[0];
    if (m) {
      ctx.font = SYSFONT; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
      // full-screen portrait: under the status bar and its button row, clear of the thumb buttons at the bottom
      const my = full && H > W ? BAR_BLOCK.h + 110 : VIEW_H - 63;
      wrapLines(ctx, m.text, Math.min(420, VIEW_W - 52)).forEach((line, i) => ctx.fillText(line, 26, my + 16 * i));
    }
    ctx.restore();
    if (!full) { this.drawBar(ctx, game); return; }
    // the bar is drawn whole off-screen at its original coordinates, then copied as one column or as three parts
    const b = (this.barCv ??= Object.assign(document.createElement('canvas'), { width: 144, height: 480 })), bc = b.getContext('2d');
    bc.setTransform(1, 0, 0, 1, -BAR_X, 0); bc.imageSmoothingEnabled = false;
    this.drawBar(bc, game);
    if (bp.col) { ctx.drawImage(b, 0, 0, 144, bp.h, bp.x, 0, 144, bp.h); return; }
    BAR_PARTS.forEach(([t, h], i) => ctx.drawImage(b, 0, t, 144, h, bp.x + 144 * i, 0, 144, h));
  }

  // Modern rules (re-gaps #67), RECONSTRUCTED: an arrow at the edge of the playfield for each stellar in the
  // system that is off-screen (white) and for the targeted ship when it is (red hostile, green friendly, orange
  // neutral). In portrait the status bar's corner counts as off-screen, and the arrows stop at its edge, so none
  // hides under it (in landscape the bar is beside the playfield, not over it).
  edgeArrows(ctx, game, ox, oy, W, H, full) {
    const D = game.data, P = game.player, m = 14; this.arrows = [];
    const bw = full ? BAR_BLOCK.w : 0, bh = full ? BAR_BLOCK.h : 0;
    const shown = (x, y, r) => x > -r && y > -r && x < W + r && y < H + r && !(x - r > W - bw && y + r < bh);
    // where the line from the ship to the object leaves the playfield (inset by m); a point under the status bar
    // moves to the bar's nearer edge, below it or to its left
    const L = m, R = W - m, T = m, B = H - m, BX = W - bw - m, BY = bh + m, cx = W / 2, cy = H / 2;
    const arrow = (x, y, color, size) => {
      const dx = x - cx, dy = y - cy;
      const t = Math.min(dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity, dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity);
      if (!isFinite(t)) return;
      let px = cx + t * dx, py = cy + t * dy;
      if (bw && px > BX && py < BY) { if (BY - py < px - BX) py = BY; else px = BX; }
      const a = Math.atan2(dy, dx);
      this.arrows.push({ x: Math.round(px), y: Math.round(py), color });   // for tests/qol-check.mjs
      ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.7); ctx.lineTo(-size * 0.3, 0); ctx.lineTo(-size * 0.7, size * 0.7); ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    };
    for (const sp of D.spobs(game.system)) {
      if (!game.spobInPlay(sp.id)) continue;
      const x = sp.xPos + ox, y = sp.yPos + oy, r = (D.sprite(300 + sp.Type)?.w ?? 60) / 2;
      if (!shown(x, y, r)) arrow(x, y, game.navSpob === sp.id ? '#ffffff' : '#c8c8c8', game.navSpob === sp.id ? 9 : 7);
    }
    const t = P.target >= 0 ? game.ships[P.target] : null;
    if (t?.alive) {
      const x = t.x + ox, y = t.y + oy, r = (D.sprite(t.type)?.w ?? 24) / 2;
      const color = game.hostileToPlayer(t) ? '#ff2020' : friendlyToPlayer(game, t) ? '#20ff20' : '#ff9a00';
      if (!shown(x, y, r)) arrow(x, y, color, 11);
    }
  }

  brackets(ctx, x, y, r, color) {
    const k = Math.max(4, r / 3);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = Math.round(x + sx * r) + 0.5, py = Math.round(y + sy * r) + 0.5;
      ctx.moveTo(px, py - sy * k); ctx.lineTo(px, py); ctx.lineTo(px - sx * k, py);
    }
    ctx.stroke();
  }

  // ---------- status bar (EV 1.0.5 0x1005d368 and the panel routines it schedules) ----------
  // Every panel is redrawn over a fresh copy of PICT 128, in font 2020 (EVUI) 14 pt, aliased.
  // Coordinates are the original's: R = screen right (640), panels hang off it.
  drawBar(ctx, game) {
    const A = this.assets, D = game.data, P = game.player;
    // FUN_10064d14 / FUN_10064d78: while cloaked the three bar colours (-0xc64, -0xc5e, -0xc58) are white;
    // the cloak palette then shows them in its tint.
    const white = !!game.pilot.cloaked;
    if (white !== this.barWhite) { this.barWhite = white; setBarColours(white); this.glyphs.clear(); this.radarDue = true; }
    const bar = A.pict(128);
    if (bar) ctx.drawImage(bar, BAR_X, 0); else { ctx.fillStyle = BAR.bg; ctx.fillRect(BAR_X, 0, 144, 480); }
    if (this.radarDue || !this.radar || this.radarGame !== game) { this.radarDue = false; this.drawRadar(game); }
    if (this.radar && this.radarGame === game) ctx.drawImage(this.radar, RADAR.l, RADAR.t);
    if (!P) return;
    this.drawShield(ctx, game, P);
    this.drawFuel(ctx, game, P);
    this.drawNav(ctx, game, P);
    this.drawSecondary(ctx, game, P);
    this.drawTarget(ctx, game, P);
    this.drawCargo(ctx, game);
  }

  // Text as Mac OS 9 draws EVUI: hinted, lightly smoothed glyphs from EVUI_14 at whole-pixel pen
  // positions (hinted advances). A character missing there falls back to the browser's outline,
  // centre-sampled. Overlapping glyph pixels keep the larger coverage.
  text(ctx, s, x, y, color) {
    if (!s) return 0;
    const key = color + '|' + s;
    let im = this.glyphs.get(key);
    if (!im) {
      const pad = 4, w = this.measure(s) + pad * 2, h = 24, base = 18;
      im = document.createElement('canvas'); im.width = Math.max(1, w); im.height = h;
      const c = im.getContext('2d'), cov = new Uint8Array(im.width * h);
      let pen = pad;
      for (const ch of s) {
        const g = EVUI_14[ch];
        if (g) g[3].split('.').forEach((row, j) => {
          for (let i = 0; i < row.length; i++) {
            const X = pen + g[1] + i, Y = base - g[2] + j;
            if (X >= 0 && X < im.width && Y >= 0 && Y < h) cov[Y * im.width + X] = Math.max(cov[Y * im.width + X], parseInt(row[i], 16) * 17);
          }
        });
        else this.outlineGlyph(cov, im.width, ch, pen, base);
        pen += this.advance(ch);
      }
      const d = c.createImageData(im.width, h), px = d.data;
      for (let k = 0; k < cov.length; k++) { px[k * 4] = color[0]; px[k * 4 + 1] = color[1]; px[k * 4 + 2] = color[2]; px[k * 4 + 3] = cov[k]; }
      c.putImageData(d, 0, 0);
      if (this.glyphs.size > 400) this.glyphs.clear();
      this.glyphs.set(key, im);
    }
    ctx.drawImage(im, x - 4, y - 18);
    return this.measure(s);
  }
  outlineGlyph(cov, w, ch, pen, base) {
    const S = 8, t = document.createElement('canvas'); t.width = 24 * S; t.height = 24 * S;
    const x = t.getContext('2d'); x.font = `${14 * S}px EVUI`; x.fillStyle = '#fff'; x.fillText(ch, 4 * S, base * S);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
      const X = pen - 4 + i;
      if (X >= 0 && X < w && d[((j * S + S / 2) * t.width + i * S + S / 2) * 4 + 3] >= 128) cov[j * w + X] = 255;
    }
  }
  advance(ch) {
    const g = EVUI_14[ch]; if (g) return g[0];
    const m = (this.advances ??= new Map());
    let w = m.get(ch);
    if (w === undefined) { const c = (this.mctx ??= document.createElement('canvas').getContext('2d')); c.font = BAR_FONT; w = Math.round(c.measureText(ch).width); if (document.fonts?.check?.(BAR_FONT)) m.set(ch, w); }
    return w;
  }
  measure(s) { let w = 0; for (const ch of s) w += this.advance(ch); return w; }   // TextWidth
  // FUN_1006137c: centred between left and right with integer halves.
  centred(ctx, s, l, r, y, color) { this.text(ctx, s, ((l + r) >> 1) - (this.measure(s) >> 1), y, color); }

  // 0x1005e2fc: nav panel, rect (R-0x8b,0xc0)-(R-6,0xe3).
  drawNav(ctx, game, P) {
    const D = game.data, l = 501, r = 634, t = 192;
    const mode = game.navMode ?? -1;   // player +0x24
    if (mode === 2) {
      this.centred(ctx, 'Stellar Navigation', l, r, t + 12, BAR.dim);
      const s = game.navSpob >= 0 ? D.spob[game.navSpob] : null;
      if (s) this.centred(ctx, s.name, l, r, t + 0x1e, BAR.bright);
      else this.centred(ctx, 'No Destination', l, r, t + 0x1e, BAR.dim);
    } else if (mode === 3) {
      const jumping = P.jump > 0;
      this.centred(ctx, 'Hyperspace', l, r, t + 12, jumping ? BAR.bright : BAR.dim);
      const S = game.navSys >= 0 ? D.syst[game.navSys] : null;
      if (S) {
        const name = (game.pilot.explored?.[S.id] ?? 0) > 0 ? S.name : 'Unexplored System';
        // bright once the ship is clear of every nav stellar's jump radius (0x10062b28)
        const sy = D.syst[game.system], j2 = (P.stats?.jumpDist ?? 1000) ** 2;
        const clear = [sy?.Nav1, sy?.Nav2, sy?.Nav3, sy?.Nav4].every(id => { const p = D.spob[id]; return !p || (p.xPos - P.x) ** 2 + (p.yPos - P.y) ** 2 > j2; });
        this.centred(ctx, name, l, r, t + 0x1e, jumping || clear ? BAR.bright : BAR.dim);
      } else this.centred(ctx, 'No Destination', l, r, t + 0x1e, BAR.dim);
    } else this.centred(ctx, 'Nav System Off', l, r, t + 0x16, BAR.dim);
  }

  // 0x1005e7dc: shield bar (R-0x55,0x9a)-(R-0xa,0xa0); armor below zero shields.
  drawShield(ctx, game, P) {
    const l = 555, t = 154, b = 160, full = 76, max = 75;
    if (P.pool > 0 && !game.pilot.cloaked) {
      const w = Math.min(max, Math.floor(full * P.pool / Math.max(1, P.stats.shieldMax)));
      ctx.fillStyle = BAR.dimCss; ctx.fillRect(l, t, w, b - t);
    } else if (P.pool <= 0) {
      ctx.fillStyle = BAR.bgCss; ctx.fillRect(BAR_X + 10, 150, 39, 13);   // covers the baked "Shield:"
      this.text(ctx, 'Armor:', BAR_X + 10, 163 - 2, BAR.dim);
      if (!isDead(P) && P.type !== POD_TYPE) {
        const lost = Math.max(0, -P.pool), right = Math.min(l + max, l + full - Math.floor(full * lost / Math.max(1, P.stats.armorMax)));
        if (right > l) { ctx.fillStyle = this.armorFill(ctx); ctx.fillRect(l, t, right - l, b - t); }
      }
    }
  }
  // ppat 200 (GetPixPat 0xc8 at 0x1002ad20), aligned to the port origin like QuickDraw's FillCRect.
  armorFill(ctx) {
    if (this.ppat200 === undefined) {
      this.ppat200 = null;
      const im = new Image(); im.onload = () => { this.ppat200 = im; }; im.src = PPAT_URL(this.assets.base, 200);
    }
    return this.ppat200 ? (this.armorPat ??= ctx.createPattern(this.ppat200, 'repeat')) : BAR.brightCss;
  }

  // 0x1005ec5c: fuel bar (R-0x55,0xaa)-(R-0xa,0xb0); the part short of the next full jump (100
  // units) is repainted in colour -0xc64.
  drawFuel(ctx, game, P) {
    const l = 555, t = 170, b = 176, full = 76, max = 75, fm = Math.max(1, P.stats.fuelMax);
    if (P.fuel <= 0 || isDisabled(P)) return;
    const end = l + Math.min(max, Math.floor(full * P.fuel / fm));
    ctx.fillStyle = BAR.dimCss; ctx.fillRect(l, t, end - l, b - t);
    const jumpEnd = l + Math.min(max, Math.floor(full * Math.floor(P.fuel / 100) * 100 / fm));
    if (end > jumpEnd) { ctx.fillStyle = BAR.partialCss; ctx.fillRect(jumpEnd, t, end - jumpEnd, b - t); }
  }

  // 0x1005fbf4: secondary weapon, rect (R-0x8a,0xed)-(R-6,0xfe).
  drawSecondary(ctx, game, P) {
    const D = game.data, l = 502, r = 634, y = 237 + 12;
    const W = P.selected >= 0 ? D.weap[P.selected] : null;
    if (!W) { this.centred(ctx, 'No Secondary Weapon', l, r, y, BAR.dim); return; }
    const ammo = W.AmmoType;
    const s = ammo > -1000 && ammo !== -1 ? `${W.name} - ${P.weapons?.[P.selected]?.ammo ?? 0}` : W.name;
    this.centred(ctx, s, l, r, y, BAR.bright);
  }

  // 0x1005ef48: target panel, rect (R-0x8b,0x107)-(R-5,0x17a). The tester read-out branch is not drawn.
  drawTarget(ctx, game, P) {
    const D = game.data, l = 501, r = 635, t = 263, b = 378;
    const T = P.target >= 0 ? game.ships[P.target] : null;
    if (!T?.alive) { this.centred(ctx, 'No Target', l, r, t + 0x2f, BAR.dim); return; }
    const st = D.ship[T.type];
    const name = T.name || (T.pers >= 128 ? D.pers[T.pers]?.name : null) || st?.name || '';
    this.centred(ctx, name, l, r, t + 0x10, BAR.bright);
    // PICT 3000 + ship index (GetPicture loop at 0x1002acc0), drawn into a 128x64 rect about the centre
    const pic = st ? this.assets.pict(3000 + st.index) : null;
    const cx = Math.trunc(0.5 * (l + r)), cy = Math.trunc(0.5 * (t + b));
    if (pic) ctx.drawImage(pic, cx - 0x40, cy - 0x20, 0x80, 0x40);
    if (T.pers === 0x1ff + 128) { this.centred(ctx, 'Ambrosia', l, r, b - 6, BAR.bright); return; }
    const x = l + 5, y = b - 6;
    if (T.pool <= 0) {
      const s = (st?.Shield ?? 0) <= 0 ? 'No Shields' : isDisabled(T) ? 'Disabled' : 'Shields Down';
      this.text(ctx, s, x, y, BAR.bright);
    } else {
      const w = this.text(ctx, 'Shield: ', x, y, BAR.dim);
      this.text(ctx, Math.trunc(100 * T.pool / Math.max(1, T.stats.shieldMax)) + '%', x + w, y, BAR.bright);
    }
    const g = D.govtOf(T.govt);
    const tag = g ? D.str(6000, g.index).slice(0, 9) : T.leader === 0 ? (T.ai === 5 ? 'Fighter' : 'Escort') : '';
    this.text(ctx, tag, l + 0x57, y, BAR.dim);
  }

  // 0x1005fea0: cargo panel, rect (R-0x8a,0x183)-(R-5,0x1db).
  drawCargo(ctx, game) {
    const D = game.data, p = game.pilot, L = 502, T = 387;
    let row = 0;
    p.cargo.forEach((n, i) => {
      if (n <= 0) return;
      row++;
      const y = T - 2 + row * 14;
      this.text(ctx, D.str(4003, i), L + 3, y, BAR.dim);
      this.text(ctx, String(n), L + 0x23, y, BAR.bright);
    });
    this.text(ctx, 'Free:', L + 0x43, T + 12, BAR.dim);
    this.text(ctx, String(Math.max(0, freeCargo(game))), L + 0x64, T + 12, BAR.bright);
    const special = [];
    for (const m of p.missions ?? []) if (m?.active && m.loaded && m.cargoType !== -1 && m.cargoType != null) special.push(D.str(4002, m.cargoType));
    for (const [id, n] of Object.entries(p.junk ?? {})) if (n > 0) special.push(D.str(4005, (D.junk[id]?.index ?? id - 128)));
    if (special.length) {
      this.text(ctx, 'Special:', L + 0x43, T + 0x1e, BAR.dim);
      this.text(ctx, special.length === 1 ? special[0] : 'Multiple', L + 0x4d, T + 0x2e, BAR.bright);
    }
    this.text(ctx, 'Credits:', L + 0x43, T + 0x42, BAR.dim);
    this.text(ctx, credits(p.credits), L + 0x4d, T + 0x52, BAR.bright);
  }

  // ---------- radar 0x1005d8ec ----------
  // Redrawn only when 0x1005d638 raises its flag: every 15 frames (counter -0x749c), so blips move
  // in steps. The counter also blinks the target blip and the "back to centre" arrow.
  radarTick() {
    this.blink = (this.blink ?? 0) + 1;
    if (this.blink % 15 === 0) { if (this.blink > 30) this.blink = 0; this.radarDue = true; }
  }
  drawRadar(game) {
    const D = game.data, P = game.player, p = game.pilot;
    const w = RADAR.r - RADAR.l, h = RADAR.b - RADAR.t;
    const cv = (this.radar ??= Object.assign(document.createElement('canvas'), { width: w, height: h }));
    this.radarGame = game;
    const c = cv.getContext('2d'), ox = RADAR.l, oy = RADAR.t;
    const iff = hasOutfit(D, p.outfits, MOD.IFF), dens = hasOutfit(D, p.outfits, MOD.DENSITY);
    const sys = D.syst[game.system];
    // interference: Rand(100)+1 <= syst +0x46 fills the scope with one of ppat 128-137 instead. Override
    // (FUN_100554ac, VERIFIED) first takes off the ModType 24 total (Sensor Upgrade, FUN_10060974).
    const jam = (sys?.Interference ?? 0) - (D.evo ? modSum(D, p.outfits, 24) : 0);
    if (sys && jam > 0 && 1 + Math.floor(Math.random() * 100) <= jam) {
      const k = Math.floor(Math.random() * 10), im = this.staticPat?.[k];
      this.loadStatic();
      if (im) { c.fillStyle = c.createPattern(im, 'repeat'); c.setTransform(1, 0, 0, 1, -ox, -oy); c.fillRect(ox, oy, w, h); c.setTransform(1, 0, 0, 1, 0, 0); }
      return;
    }
    const bar = this.assets.pict(128);
    if (iff || !bar) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }
    else { c.clearRect(0, 0, w, h); c.drawImage(bar, 5, 4, w, h, 0, 0, w, h); }   // CopyBits (5,4,138,138)
    if (!P) return;
    const cx = Math.trunc(0.5 * (RADAR.l + RADAR.r)), cy = Math.trunc(0.5 * (RADAR.t + RADAR.b));
    const at = (wx, wy) => [Math.trunc(RADAR_SCALE * Math.trunc(wx - P.x) + cx) - ox, Math.trunc(RADAR_SCALE * Math.trunc(wy - P.y) + cy) - oy];
    const pix = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    const box2 = (x, y, col) => { c.fillStyle = col; c.fillRect(x - 1, y - 1, 2, 2); };
    const oval4 = (x, y, col) => { c.fillStyle = col; c.fillRect(x - 1, y - 2, 2, 1); c.fillRect(x - 2, y - 1, 1, 2); c.fillRect(x + 1, y - 1, 1, 2); c.fillRect(x - 1, y + 1, 2, 1); };
    for (const id of [sys?.Nav1, sys?.Nav2, sys?.Nav3, sys?.Nav4]) {
      const s = D.spob[id]; if (!s) continue;
      const [x, y] = at(s.xPos, s.yPos), col = iff ? spobIff(game, s) : BAR.dimCss;
      if (D.spobFlag(s, SPOB.STATION)) { if (dens) box2(x, y, col); else pix(x, y, col); }
      else if ((D.sprite(300 + s.Type)?.w ?? 0) >= 0x40) oval4(x, y, col);
      else box2(x, y, col);   // FrameOval of a 2x2 rect
    }
    for (const s of game.ships) {
      if (!s?.alive || s.slot === 0) continue;
      const [x, y] = at(s.x, s.y);
      const col = P.target === s.slot && this.blink > 15 ? (iff ? BAR.targetIffCss : BAR.brightCss) : iff ? shipIff(game, s) : BAR.dimCss;
      if (dens && (D.ship[s.type]?.Mass ?? 0) >= 100) box2(x, y, col); else pix(x, y, col);
    }
    pix(cx - ox, cy - oy, iff ? IFF.player : BAR.brightCss);
    // arrow back toward the system centre when the ship is farther than sqrt(7e6)
    const nav = game.navMode ?? -1, hasNav = [sys?.Nav1, sys?.Nav2, sys?.Nav3, sys?.Nav4].some(id => id >= 128);
    const px = Math.trunc(P.x), py = Math.trunc(P.y);
    if (this.blink <= 15 && nav !== 3 && hasNav && px * px + py * py > 7000000) {
      const dir = bearing(P.x, P.y, 0, 0);
      const a = { x: cx, y: cy }, e = { x: cx, y: cy }; addPolar(a, dir, 25); addPolar(e, dir, 50);
      const h1 = { ...e }, h2 = { ...e }; addPolar(h1, dir + 0x87, 6); addPolar(h2, dir - 0x87, 6);
      c.strokeStyle = BAR.dimCss; c.lineWidth = 1;
      const seg = (p0, p1) => qdLine(c, Math.trunc(p0.x) - ox, Math.trunc(p0.y) - oy, Math.trunc(p1.x) - ox, Math.trunc(p1.y) - oy);
      seg(a, e); seg(e, h1); seg(e, h2);
    }
  }
  loadStatic() {
    if (this.staticPat) return;
    this.staticPat = [];
    for (let i = 0; i < 10; i++) { const im = new Image(); im.onload = () => { this.staticPat[i] = im; }; im.src = PPAT_URL(this.assets.base, 128 + i); }
  }
}

function setBarColours(white) {
  const W = [255, 255, 255];
  Object.assign(BAR, white ? { dim: W, bright: W, partial: W } : { dim: [0, 153, 0], bright: [0, 255, 0], partial: [0, 102, 0] });
  Object.assign(BAR, { dimCss: rgb(BAR.dim), brightCss: rgb(BAR.bright), partialCss: rgb(BAR.partial) });
}

// The cloak's screen palette (FUN_10064de4 -> FUN_100688f4 with the clut built at start-up by
// FUN_10068ed8(ModVal) / FUN_10069160): every palette entry becomes the tint colour scaled by
// FixRatio(entry lightness, tint lightness), each component stored as a 16-bit word, so entries
// lighter than the tint wrap round (white stays bright, light greys turn dark). ModVal 1-6: red,
// green, blue, cyan, magenta, yellow; 7 grey. Applied here to the finished frame's pixels.
const TINTS = { 1: [0xffff, 0, 0], 2: [0, 0xffff, 0], 3: [0, 0, 0xffff], 4: [0, 0xffff, 0xffff], 5: [0xffff, 0, 0xffff], 6: [0xffff, 0xffff, 0], 7: [0x7fff, 0x7fff, 0x7fff] };
const tintCache = new Map();
export function cloakTint(ctx, w, h, modVal) {
  const T = TINTS[modVal]; if (!T) return;
  const TL = Math.trunc((Math.max(...T) + Math.min(...T)) / 2);
  let map = tintCache.get(modVal); if (!map) tintCache.set(modVal, (map = new Map()));
  const img = ctx.getImageData(0, 0, w, h), px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let out = map.get(key);
    if (out === undefined) {
      const r = px[i] * 257, g = px[i + 1] * 257, b = px[i + 2] * 257;
      const L = Math.trunc((Math.max(r, g, b) + Math.min(r, g, b)) / 2);
      const ratio = Math.trunc(L * 65536 / TL);                       // FixRatio
      const c = v => ((Math.trunc(ratio * v / 65536)) & 0xffff) >> 8;   // FixMul, >> 16, sthx
      out = (c(T[0]) << 16) | (c(T[1]) << 8) | c(T[2]);
      map.set(key, out);
    }
    px[i] = out >> 16; px[i + 1] = (out >> 8) & 255; px[i + 2] = out & 255;
  }
  ctx.putImageData(img, 0, 0);
}

// QuickDraw LineTo with a 1x1 pen: Bresenham, both end points drawn.
function qdLine(c, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  c.fillStyle = c.strokeStyle;
  for (;;) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

// FUN_10062f6c: 999, 10,000, 1.25M
function credits(n) {
  n = Math.trunc(n);
  if (n < 1000) return String(n);
  if (n < 1000000) return `${Math.trunc(n / 1000)},${String(n % 1000).padStart(3, '0')}`;
  return `${Math.trunc(n / 1000000)}.${String(Math.trunc((n % 1000000) / 10000)).padStart(2, '0')}M`;
}

// IFF colours (0x10063224 ships, 0x100632e0 stellars). QuickDraw's old colour constants: cyan 0x111,
// red 0xcd, blue 0x199, yellow 0x45, green 0x155. -0xc7c (disabled) is grey 0x4000 and -0xc76 (no
// landing) grey 0x8000 (FUN_1005afb8), shown as 0x44 and 0x88 on the 8-bit screen.
const IFF = { player: '#00ffff', disabled: '#444444', hostile: '#ff0000', escort: '#00ff00', other: '#0000ff', noLand: '#888888', yellow: '#ffff00', orange: '#ff6600' };
function shipIff(game, s) {
  if (isDisabled(s)) return IFF.disabled;
  if (game.attackingPlayer(s)) return IFF.hostile;
  if (s.leader === 0 && s.defends === -1) return IFF.escort;
  return IFF.other;
}
// ev_spob_landable_color 0x100632e0: not landable grey -0xc76; uninhabited blue 0x199; dominated by
// the player (+0x20) green 0x155; no govt yellow 0x45; else the system's legal record (the table at
// -0x149a, [1007fb66]) against MinCoolness: at or above it yellow, below it red 0xcd when the record is
// negative, otherwise orange (0xffff,0x6666,0).
function spobIff(game, s) {
  const D = game.data;
  if (!D.spobFlag(s, SPOB.LAND)) return IFF.noLand;
  if (D.spobFlag(s, SPOB.UNINHABITED)) return IFF.other;
  if (game.pilot.dominated?.[s.id]) return IFF.escort;
  if (s.Govt < 128) return IFF.yellow;
  const rec = game.pilot.legal?.[s.System] ?? 0;
  return rec >= s.MinCoolness ? IFF.yellow : rec < 0 ? IFF.hostile : IFF.orange;
}
