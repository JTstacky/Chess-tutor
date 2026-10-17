// AI-upscaled static pictures (art-hd/, listed in art-hd/manifest.json) and ship spin sheets
// (art-hd/sprites/manifest.json). This is not part of the 1:1
// game (docs/re-gaps.md #62): with HD art off, every frame is exactly the original drawing.
// With it on, the game still draws on the 640x480 canvas as before. When it draws a PICT that has an HD
// version, the main canvas gets a transparent hole at that rect. The HD image is drawn at the same rect on
// a canvas behind it, sized to the screen's real pixels. Text, lines and buttons drawn later stay on the
// main canvas, so they stay on top and keep their bitmap look. The rect clips (dialog text boxes, the map
// pane) and the translate/scale of a centred screen are mirrored onto the HD canvas.
const KEY = 'evonline.art';
const P = CanvasRenderingContext2D.prototype;
const O = { save: P.save, restore: P.restore, beginPath: P.beginPath, rect: P.rect, clip: P.clip, drawImage: P.drawImage, translate: P.translate, scale: P.scale };

// ?art=original or ?art=hd picks the art and is remembered; HD is the default.
export function artSetting() {
  const q = new URLSearchParams(location.search).get('art');
  if (q === 'original' || q === 'hd') { try { localStorage.setItem(KEY, q); } catch { } return q; }
  try { return localStorage.getItem(KEY) === 'original' ? 'original' : 'hd'; } catch { return 'hd'; }
}
export function saveArtSetting(v) { try { localStorage.setItem(KEY, v); } catch { } }

export class HDArt {
  constructor() {
    this.on = false; this.active = false; this.sprites = true;
    this.map = {}; this.spins = {}; this.hd = new Map(); this.of = new WeakMap();
  }

  async load(game) {
    const get = async f => { try { const r = await fetch('art-hd/' + f, { cache: 'no-cache' }); return r.ok ? (await r.json())[game] ?? {} : {}; } catch { return {}; } };
    [this.map, this.spins] = await Promise.all([get('manifest.json'), get('sprites/manifest.json')]);
  }

  // Called by Assets.pict: remember which HD image stands for this original picture.
  link(id, im) { const e = this.map[id]; if (e?.hd) this.of.set(im, { h: this.image('p' + id, e.hd), mask: false }); }

  // Called by Assets.sprite: the same for a ship's spin sheet (art-hd/sprites/manifest.json). A ship frame
  // is drawn from the HD sheet behind the game canvas, and the hole in the main canvas is cut in the shape of
  // the original frame, so stars and stellars around the hull stay. Collision still uses the original sprite.
  linkSprite(id, im) { const e = this.spins[id]; if (e?.hd && !this.of.has(im)) this.of.set(im, { h: this.image('s' + id, e.hd), mask: true }); }

  // HD images load lazily, once, the first time their original is drawn.
  image(key, file) {
    let h = this.hd.get(key);
    if (!h) { h = new Image(); h.decoding = 'async'; h.src = 'art-hd/' + file; this.hd.set(key, h); }
    return h;
  }

  install(canvas, ctx) {
    this.canvas = canvas;
    const u = this.under = document.createElement('canvas');
    u.setAttribute('aria-hidden', 'true');
    Object.assign(u.style, { position: 'fixed', zIndex: '0', pointerEvents: 'none', background: '#000', display: 'none', imageRendering: 'auto' });
    canvas.parentNode.insertBefore(u, canvas);
    canvas.style.position = 'relative'; canvas.style.zIndex = '1';
    const c = this.uctx = u.getContext('2d'), self = this;
    // translate/scale too: the full-screen layout (main.js) draws screens and dialogs offset and sometimes scaled
    for (const k of ['save', 'restore', 'beginPath', 'clip', 'translate', 'scale']) {
      ctx[k] = function (...a) { if (self.active) O[k].apply(c, a); return P[k].apply(this, a); };
    }
    ctx.rect = function (...a) { if (self.active) O.rect.apply(c, a); return P.rect.apply(this, a); };
    ctx.drawImage = function (im, ...a) { if (self.active && self.draw(this, im, a)) return; return P.drawImage.call(this, im, ...a); };
  }

  // Start of a frame: line the HD canvas up with the game canvas and clear it.
  begin(w, h) {
    const u = this.under; if (!u) return;
    this.active = this.on;
    if (!this.on) { if (u.style.display !== 'none') { u.style.display = 'none'; this.canvas.style.background = ''; } return; }
    const r = this.canvas.getBoundingClientRect(), dpr = globalThis.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(r.width * dpr)), bh = Math.max(1, Math.round(r.height * dpr));
    if (u.width !== bw || u.height !== bh) { u.width = bw; u.height = bh; }
    Object.assign(u.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    this.canvas.style.background = 'transparent';
    const c = this.uctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, bw, bh);
    c.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  }

  // drawImage(im, dx, dy), (im, dx, dy, dw, dh) or (im, sx, sy, sw, sh, dx, dy, dw, dh) with an
  // original PICT: the same rect from the HD image (the source rect scaled), and a hole in the main canvas.
  // A ship frame (mask) is only swapped while sprites are allowed (not under the cloak's palette tint, which
  // recolours the main canvas only), with no transform or blending in effect.
  draw(ctx, im, a) {
    const e = this.of.get(im), h = e?.h;
    if (!h || !h.complete || !h.naturalWidth || ctx.globalAlpha !== 1) return false;
    if (e.mask && (!this.sprites || a.length !== 8 || ctx.globalCompositeOperation !== 'source-over' || !ctx.getTransform().isIdentity)) return false;
    let sx = 0, sy = 0, sw = im.width, sh = im.height, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; }
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    const kx = h.naturalWidth / im.width, ky = h.naturalHeight / im.height;
    O.drawImage.call(this.uctx, h, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh);
    if (e.mask) {   // cut the hole in the original frame's shape
      ctx.globalCompositeOperation = 'destination-out';
      P.drawImage.call(ctx, im, ...a);
      ctx.globalCompositeOperation = 'source-over';
    } else ctx.clearRect(dx, dy, dw, dh);
    return true;
  }
}
