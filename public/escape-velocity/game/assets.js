// Original EV art and sound, loaded on demand from /gamedata/<game>/assets/ (served by the local
// server straight from the research package; nothing is copied or published).
export class Assets {
  constructor(data, game = 'ev') {
    this.data = data; this.base = `gamedata/${game}/assets/`;
    this.images = new Map(); this.buffers = new Map();
    this.audio = null; this.musicNode = null; this.volume = 0.7; this.musicVolume = 0.4; this.loops = new Map();
  }
  image(path) {
    let im = this.images.get(path);
    if (!im) { im = new Image(); im.src = this.base + path; this.images.set(path, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  // With HD art on (game/hdart.js), the picture is also linked to its upscaled version for drawImage.
  pict(id) { const p = this.data.picts[id], im = p ? this.image(p) : null; if (im && this.hd) this.hd.link(id, im); return im; }
  sheet(spinId) { const s = this.data.sprites[spinId]; return s ? this.image(s.sheet) : null; }
  preload(paths) {
    return Promise.all(paths.map(p => new Promise(res => {
      const im = new Image(); im.onload = im.onerror = () => res(); im.src = this.base + p; this.images.set(p, im);
    })));
  }
  preloadPicts(ids) { return this.preload(ids.map(i => this.data.picts[i]).filter(Boolean)); }
  preloadSprites(ids) { return this.preload(ids.map(i => this.data.sprites[i]?.sheet).filter(Boolean)); }

  // Draw frame n of a spin sheet centred on (x, y).
  sprite(ctx, spinId, frame, x, y, scale = 1) {
    const s = this.data.sprites[spinId], im = s && this.sheet(spinId);
    if (!im) return false;
    if (this.hd) this.hd.linkSprite(spinId, im);   // HD ship sheet, if there is one (game/hdart.js)
    const f = ((frame % s.frames) + s.frames) % s.frames, c = f % s.cols, r = Math.floor(f / s.cols);
    const w = s.w * scale, h = s.h * scale;
    ctx.drawImage(im, c * s.w, r * s.h, s.w, s.h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    return true;
  }

  // ---------- sound ----------
  unlock() {
    if (!this.audio) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext; if (!AC) return;
      this.audio = new AC();
      this.master = this.audio.createGain(); this.master.gain.value = this.volume; this.master.connect(this.audio.destination);
      this.musicGain = this.audio.createGain(); this.musicGain.gain.value = this.musicVolume; this.musicGain.connect(this.audio.destination);
    }
    if (this.audio.state === 'suspended') this.audio.resume();
  }
  async buffer(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const p = this.data.sounds[id]; if (!p || !this.audio) return null;
    const pr = fetch(this.base + p).then(r => r.arrayBuffer()).then(b => this.audio.decodeAudioData(b)).catch(() => null);
    this.buffers.set(id, pr);
    return pr;
  }
  async play(id, { gain = 1, loop = false, key = null } = {}) {
    if (!this.audio) return;
    if (key && this.loops.has(key)) return;
    const b = await this.buffer(id); if (!b) return;
    const src = this.audio.createBufferSource(), g = this.audio.createGain();
    src.buffer = b; src.loop = loop; g.gain.value = gain; src.connect(g).connect(this.master); src.start();
    if (key) { this.loops.set(key, src); src.onended = () => this.loops.delete(key); }
    return src;
  }
  stopLoop(key) { const s = this.loops.get(key); if (s) { try { s.stop(); } catch { } this.loops.delete(key); } }
  async music(id) {
    if (!this.audio || this.musicId === id) return;
    this.stopMusic(); this.musicId = id;
    const b = await this.buffer(id); if (!b || this.musicId !== id) return;
    const src = this.audio.createBufferSource(); src.buffer = b; src.loop = true; src.connect(this.musicGain); src.start();
    this.musicNode = src;
  }
  // Play a list of tunes once each, in turn (the About box queues snd 30001 then 30002).
  async musicSeq(ids) {
    if (!this.audio) return;
    this.stopMusic(); const tag = this.musicId = 'seq:' + ids.join(',');
    for (const id of ids) {
      const b = await this.buffer(id); if (!b || this.musicId !== tag) return;
      const src = this.audio.createBufferSource(); src.buffer = b; src.connect(this.musicGain); src.start();
      this.musicNode = src;
      await new Promise(r => (src.onended = r));
      if (this.musicId !== tag) return;
    }
  }
  stopMusic() { try { this.musicNode?.stop(); } catch { } this.musicNode = null; this.musicId = null; }
}
