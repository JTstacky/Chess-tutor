// WebAudio music and sound effects. Unlocked on the first key/tap (browser rule).
const ctxClass = window.AudioContext || window.webkitAudioContext;

class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.music = null;
    this.musicId = null;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.manifest = {};
    this.lastPlay = new Map();
  }
  unlock() {
    if (!this.ctx && ctxClass) {
      this.ctx = new ctxClass();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      if (this.pendingMusic) { const m = this.pendingMusic; this.pendingMusic = null; this.playMusic(m); }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setManifest(m) { this.manifest = m || {}; }
  url(id) { return this.manifest[id] || null; }
  async load(id) {
    if (!this.ctx) return null;
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.loading.has(id)) return this.loading.get(id);
    const url = this.url(id);
    if (!url) return null;
    const p = fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => {
      this.buffers.set(id, buf);
      return buf;
    }).catch(() => null);
    this.loading.set(id, p);
    return p;
  }
  async sfx(id, { vol = 1, rate = 1, throttle = 0.05 } = {}) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(id) || -1) < throttle) return;
    this.lastPlay.set(id, now);
    const buf = await this.load(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }
  async playMusic(id) {
    if (id === this.musicId) return;
    this.musicId = id;
    if (!this.ctx) { this.pendingMusic = id; return; }
    const old = this.music;
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => { try { old.src.stop(); } catch { /* already stopped */ } }, 2000);
      this.music = null;
    }
    if (!id) return;
    const buf = await this.load(id);
    if (!buf || this.musicId !== id) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.5);
    src.connect(gain).connect(this.musicGain);
    src.start();
    this.music = { src, gain };
  }
  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }
}

export const audio = new Audio();
