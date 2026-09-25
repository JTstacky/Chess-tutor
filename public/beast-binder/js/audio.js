"use strict";
// audio.js — a small Web Audio synth. No files: every sound is built from shaped
// oscillators and filtered noise. A sound is one or more LAYERS, may have several
// VARIANTS (one is picked at random), and every play is detuned a little, so a
// hundred-beast melee sounds like a fight, not a metronome. Sounds are rate-limited
// per name and by a global voice budget. On top sit a per-region ambience bed and a
// sparse generative score that thickens when the horde is fighting.

const SFX = {
  ctx: null, master: null, muted: false, last: {}, voices: [],
  amb: null, ambRegion: null, ambT: 0, musT: 0, musStep: 0, intensity: 0,

  // layer: { w: wave|"noise", f: [from, to], t: seconds, v: volume, a: attack, d: delay, flt: [type, from, to, Q], vib: [rate, depth], chord: [...] }
  // def:   { gap, rnd: pitch spread, L: [layers] }  or  { gap, rnd, alt: [[layers], [layers]] }
  DEFS: {
    // ---- the binder
    swing:   { gap: 0.04, rnd: 0.12, alt: [[{ w: "noise", f: [1400, 260], t: 0.13, v: 0.09, a: 0.15 }, { w: "sine", f: [900, 300], t: 0.1, v: 0.04 }],
                                           [{ w: "noise", f: [800, 2400], t: 0.11, v: 0.08, a: 0.3 }, { w: "triangle", f: [400, 1100], t: 0.08, v: 0.04 }]] },
    heavy:   { gap: 0.1, rnd: 0.08, L: [{ w: "noise", f: [300, 2600], t: 0.26, v: 0.16, a: 0.3 }, { w: "sawtooth", f: [140, 60], t: 0.3, v: 0.09, flt: ["lowpass", 900, 200, 2] }, { w: "sine", f: [1200, 400], t: 0.12, v: 0.05, d: 0.08 }] },
    charge:  { gap: 0.25, rnd: 0.03, L: [{ w: "sine", f: [220, 900], t: 0.9, v: 0.06, a: 0.7 }, { w: "sawtooth", f: [110, 440], t: 0.9, v: 0.03, a: 0.6, flt: ["lowpass", 400, 2400, 3] }, { w: "noise", f: [500, 2400], t: 0.9, v: 0.025, a: 0.6 }] },
    bolt:    { gap: 0.05, rnd: 0.06, alt: [[{ w: "square", f: [900, 330], t: 0.09, v: 0.08 }, { w: "noise", f: [3000, 900], t: 0.04, v: 0.05 }],
                                           [{ w: "sawtooth", f: [1040, 380], t: 0.08, v: 0.06 }, { w: "sine", f: [520, 260], t: 0.1, v: 0.06 }]] },
    lance:   { gap: 0.1, rnd: 0.04, L: [{ w: "sawtooth", f: [420, 1500], t: 0.07, v: 0.1 }, { w: "square", f: [1500, 180], t: 0.3, v: 0.1, d: 0.06, flt: ["lowpass", 4000, 500, 2] }, { w: "noise", f: [900, 200], t: 0.25, v: 0.12, d: 0.06 }] },
    mortar:  { gap: 0.3, rnd: 0.08, L: [{ w: "noise", f: [400, 90], t: 0.22, v: 0.22 }, { w: "sine", f: [160, 50], t: 0.25, v: 0.22 }, { w: "noise", f: [2400, 1200], t: 0.5, v: 0.03, d: 0.15, a: 0.2 }] },
    boom:    { gap: 0.09, rnd: 0.15, alt: [[{ w: "noise", f: [900, 80], t: 0.35, v: 0.2 }, { w: "sine", f: [110, 38], t: 0.4, v: 0.25 }],
                                           [{ w: "noise", f: [600, 60], t: 0.45, v: 0.2 }, { w: "triangle", f: [140, 44], t: 0.35, v: 0.22 }]] },
    beam:    { gap: 0.2, rnd: 0.03, L: [{ w: "sawtooth", f: [220, 236], t: 0.9, v: 0.09, vib: [28, 14], flt: ["bandpass", 600, 2600, 3] }, { w: "sine", f: [880, 940], t: 0.9, v: 0.05, vib: [9, 30] }, { w: "noise", f: [5000, 3000], t: 0.9, v: 0.03 }] },
    zap:     { gap: 0.07, rnd: 0.2, alt: [[{ w: "square", f: [2400, 160], t: 0.12, v: 0.07 }, { w: "noise", f: [6000, 1500], t: 0.1, v: 0.07 }],
                                          [{ w: "sawtooth", f: [1800, 90], t: 0.16, v: 0.07, vib: [60, 300] }, { w: "noise", f: [4000, 2000], t: 0.05, v: 0.08 }]] },
    sunfall: { gap: 1, rnd: 0, L: [{ w: "sine", f: [1760, 220], t: 0.9, v: 0.14, chord: [1, 1.5, 2] }, { w: "noise", f: [200, 3000], t: 0.9, v: 0.08, a: 0.7 }, { w: "sine", f: [70, 30], t: 0.9, v: 0.3, d: 0.9 }, { w: "noise", f: [1400, 60], t: 0.8, v: 0.28, d: 0.9 }] },
    net:     { gap: 0.05, rnd: 0.08, L: [{ w: "triangle", f: [300, 760], t: 0.14, v: 0.12 }, { w: "noise", f: [1800, 3600], t: 0.16, v: 0.04, a: 0.08 }] },
    dash:    { gap: 0.1, rnd: 0.1, L: [{ w: "noise", f: [2400, 500], t: 0.16, v: 0.09 }, { w: "sine", f: [300, 120], t: 0.14, v: 0.06 }] },
    step:    { gap: 0.12, rnd: 0.12, alt: [[{ w: "noise", f: [260, 70], t: 0.12, v: 0.16 }, { w: "sine", f: [90, 40], t: 0.14, v: 0.14 }],
                                           [{ w: "noise", f: [320, 80], t: 0.1, v: 0.14 }, { w: "square", f: [70, 36], t: 0.12, v: 0.06 }, { w: "noise", f: [3000, 2000], t: 0.03, v: 0.03, d: 0.02 }]] },
    hurt:    { gap: 0.15, rnd: 0.08, L: [{ w: "sawtooth", f: [260, 110], t: 0.16, v: 0.14 }, { w: "noise", f: [900, 300], t: 0.1, v: 0.1 }] },
    // ---- beasts and impacts (element hits are hit_<type>; see SFX.hit)
    hit:       { gap: 0.04, rnd: 0.25, alt: [[{ w: "noise", f: [1800, 500], t: 0.06, v: 0.09 }], [{ w: "noise", f: [1200, 300], t: 0.08, v: 0.09 }, { w: "sine", f: [200, 90], t: 0.06, v: 0.06 }], [{ w: "noise", f: [2600, 800], t: 0.045, v: 0.08 }]] },
    hit_fire:  { gap: 0.06, rnd: 0.2, L: [{ w: "noise", f: [700, 2600], t: 0.14, v: 0.08, a: 0.03 }, { w: "noise", f: [5000, 3000], t: 0.05, v: 0.04, d: 0.05 }] },
    hit_water: { gap: 0.06, rnd: 0.25, L: [{ w: "noise", f: [3200, 500], t: 0.13, v: 0.08 }, { w: "sine", f: [620, 180], t: 0.1, v: 0.06 }] },
    hit_electric: { gap: 0.06, rnd: 0.3, L: [{ w: "square", f: [2000, 240], t: 0.07, v: 0.05 }, { w: "noise", f: [6000, 2400], t: 0.06, v: 0.06 }] },
    hit_ice:   { gap: 0.06, rnd: 0.2, L: [{ w: "sine", f: [2600, 3400], t: 0.09, v: 0.06, chord: [1, 1.51] }, { w: "noise", f: [7000, 4000], t: 0.04, v: 0.05 }] },
    hit_rock:  { gap: 0.06, rnd: 0.2, L: [{ w: "noise", f: [500, 110], t: 0.12, v: 0.13 }, { w: "sine", f: [130, 60], t: 0.12, v: 0.12 }] },
    hit_steel: { gap: 0.06, rnd: 0.12, L: [{ w: "square", f: [1320, 1300], t: 0.16, v: 0.04, chord: [1, 1.47, 2.09] }, { w: "noise", f: [4000, 1800], t: 0.04, v: 0.07 }] },
    hit_grass: { gap: 0.06, rnd: 0.3, L: [{ w: "noise", f: [4200, 1600], t: 0.05, v: 0.08 }, { w: "triangle", f: [700, 320], t: 0.05, v: 0.05 }] },
    hit_poison: { gap: 0.06, rnd: 0.3, L: [{ w: "sine", f: [300, 760], t: 0.12, v: 0.08, vib: [34, 120] }, { w: "noise", f: [1200, 500], t: 0.07, v: 0.05 }] },
    hit_mind:  { gap: 0.06, rnd: 0.25, L: [{ w: "sine", f: [1200, 480], t: 0.16, v: 0.07, vib: [18, 80], chord: [1, 1.26] }] },
    hit_shadow: { gap: 0.06, rnd: 0.2, L: [{ w: "sawtooth", f: [180, 70], t: 0.18, v: 0.08, flt: ["lowpass", 1200, 200, 4] }, { w: "noise", f: [500, 1600], t: 0.12, v: 0.04, a: 0.06 }] },
    hit_air:   { gap: 0.06, rnd: 0.3, L: [{ w: "noise", f: [900, 3800], t: 0.12, v: 0.07, a: 0.04 }] },
    hit_arcane: { gap: 0.04, rnd: 0.25, L: [{ w: "triangle", f: [1400, 500], t: 0.06, v: 0.06 }, { w: "noise", f: [2400, 700], t: 0.05, v: 0.07 }] },
    thud:    { gap: 0.07, rnd: 0.2, L: [{ w: "noise", f: [380, 70], t: 0.16, v: 0.18 }, { w: "sine", f: [100, 40], t: 0.18, v: 0.2 }] },
    whoosh:  { gap: 0.08, rnd: 0.2, L: [{ w: "noise", f: [500, 3000], t: 0.2, v: 0.1, a: 0.08 }] },
    flame:   { gap: 0.1, rnd: 0.15, L: [{ w: "noise", f: [400, 1800], t: 0.4, v: 0.12, a: 0.08 }, { w: "noise", f: [5000, 2600], t: 0.3, v: 0.03, d: 0.05 }, { w: "sawtooth", f: [90, 60], t: 0.35, v: 0.05 }] },
    splash:  { gap: 0.08, rnd: 0.25, L: [{ w: "noise", f: [3600, 600], t: 0.18, v: 0.1 }, { w: "sine", f: [500, 140], t: 0.12, v: 0.05 }] },
    chink:   { gap: 0.08, rnd: 0.2, L: [{ w: "sine", f: [3000, 3800], t: 0.12, v: 0.06, chord: [1, 1.34, 1.78] }] },
    shoot:   { gap: 0.05, rnd: 0.25, alt: [[{ w: "triangle", f: [700, 260], t: 0.08, v: 0.07 }], [{ w: "square", f: [560, 200], t: 0.07, v: 0.04 }, { w: "noise", f: [2600, 1000], t: 0.04, v: 0.04 }]] },
    lob:     { gap: 0.08, rnd: 0.2, L: [{ w: "sine", f: [240, 520], t: 0.18, v: 0.08 }, { w: "noise", f: [700, 1500], t: 0.14, v: 0.04, a: 0.05 }] },
    bigHit:  { gap: 0.12, rnd: 0.1, L: [{ w: "noise", f: [700, 100], t: 0.3, v: 0.22 }, { w: "sine", f: [90, 32], t: 0.45, v: 0.3 }, { w: "noise", f: [3000, 600], t: 0.12, v: 0.08 }] },
    windup:  { gap: 0.3, rnd: 0.05, L: [{ w: "sawtooth", f: [70, 260], t: 0.8, v: 0.1, a: 0.5, flt: ["lowpass", 300, 2400, 3] }, { w: "noise", f: [200, 1600], t: 0.8, v: 0.06, a: 0.6 }] },
    warp:    { gap: 0.3, rnd: 0.05, L: [{ w: "sine", f: [1800, 80], t: 0.45, v: 0.14, vib: [24, 200] }, { w: "sine", f: [90, 1400], t: 0.4, v: 0.08 }] },
    roar:    { gap: 1, rnd: 0.12, L: [{ w: "sawtooth", f: [130, 46], t: 1.2, v: 0.22, vib: [21, 16], chord: [1, 1.06, 0.5], flt: ["lowpass", 1600, 300, 5] }, { w: "noise", f: [900, 200], t: 1.1, v: 0.14, a: 0.1 }] },
    daze:    { gap: 0.08, rnd: 0.15, L: [{ w: "sine", f: [900, 500], t: 0.22, v: 0.09, vib: [14, 60] }] },
    down:    { gap: 0.12, rnd: 0.1, L: [{ w: "sawtooth", f: [220, 70], t: 0.3, v: 0.1, flt: ["lowpass", 1500, 300, 2] }] },
    // ---- rewards and interface
    bind:    { gap: 0.06, rnd: 0.04, L: [{ w: "triangle", f: [520, 1040], t: 0.22, v: 0.16, chord: [1, 1.5] }, { w: "sine", f: [2080, 2080], t: 0.3, v: 0.05, d: 0.1 }] },
    fail:    { gap: 0.1, rnd: 0.05, L: [{ w: "square", f: [300, 160], t: 0.16, v: 0.09 }] },
    level:   { gap: 0.2, rnd: 0, L: [{ w: "triangle", f: [660, 660], t: 0.12, v: 0.11 }, { w: "triangle", f: [880, 880], t: 0.12, v: 0.11, d: 0.08 }, { w: "triangle", f: [1320, 1320], t: 0.25, v: 0.11, d: 0.16 }] },
    rank:    { gap: 0.5, rnd: 0, L: [{ w: "triangle", f: [440, 880], t: 0.7, v: 0.18, chord: [1, 1.25, 1.5, 2] }, { w: "noise", f: [4000, 8000], t: 0.6, v: 0.03, a: 0.3 }] },
    fuse:    { gap: 0.2, rnd: 0.05, L: [{ w: "sine", f: [330, 1320], t: 0.5, v: 0.16, chord: [1, 1.5] }, { w: "sine", f: [2640, 2640], t: 0.4, v: 0.04, d: 0.35 }] },
    horn:    { gap: 1, rnd: 0, L: [{ w: "sawtooth", f: [146, 174], t: 1.1, v: 0.18, chord: [1, 1.5, 2], a: 0.12, flt: ["lowpass", 500, 1800, 2], vib: [5, 3] }] },
    charge:  { gap: 0.2, rnd: 0.04, L: [{ w: "square", f: [220, 440], t: 0.22, v: 0.1 }, { w: "noise", f: [800, 2400], t: 0.2, v: 0.04, a: 0.1 }] },
    warn:    { gap: 0.3, rnd: 0, L: [{ w: "square", f: [520, 520], t: 0.12, v: 0.1, chord: [1, 0.75] }, { w: "square", f: [520, 520], t: 0.12, v: 0.1, chord: [1, 0.75], d: 0.18 }] },
    ui:      { gap: 0.03, rnd: 0.05, L: [{ w: "square", f: [700, 900], t: 0.04, v: 0.05 }] },
    buy:     { gap: 0.05, rnd: 0.04, L: [{ w: "triangle", f: [600, 1200], t: 0.12, v: 0.12 }, { w: "sine", f: [1800, 1800], t: 0.2, v: 0.04, d: 0.08 }] },
    gem:     { gap: 0.035, rnd: 0.02, L: [{ w: "sine", f: [880, 1320], t: 0.07, v: 0.08 }] },
    boon:    { gap: 0.3, rnd: 0, L: [{ w: "triangle", f: [523, 1046], t: 0.5, v: 0.14, chord: [1, 1.25, 1.5] }] },
    victory: { gap: 2, rnd: 0, L: [{ w: "triangle", f: [392, 392], t: 0.3, v: 0.18, chord: [1, 1.25, 1.5] }, { w: "triangle", f: [523, 523], t: 0.3, v: 0.18, chord: [1, 1.25, 1.5], d: 0.28 }, { w: "triangle", f: [784, 784], t: 1.2, v: 0.2, chord: [1, 1.25, 1.5, 2], d: 0.56 }] },
    // ---- the ship and the hangar
    coin:    { gap: 0.04, rnd: 0.06, L: [{ w: "square", f: [1568, 1568], t: 0.05, v: 0.06 }, { w: "square", f: [2093, 2093], t: 0.18, v: 0.06, d: 0.05 }] },
    shred:   { gap: 0.1, rnd: 0.1, L: [{ w: "sawtooth", f: [90, 60], t: 0.5, v: 0.1, vib: [40, 30] }, { w: "noise", f: [3000, 600], t: 0.5, v: 0.12 }, { w: "square", f: [1200, 300], t: 0.1, v: 0.05, d: 0.4 }] },
    gene:    { gap: 0.2, rnd: 0, L: [{ w: "sine", f: [440, 880], t: 1.2, v: 0.1, vib: [6, 20], chord: [1, 1.5] }, { w: "sine", f: [660, 1320], t: 1.2, v: 0.06, d: 0.3, vib: [7, 20] }] },
    hatch:   { gap: 0.2, rnd: 0, L: [{ w: "noise", f: [3000, 1200], t: 0.08, v: 0.12 }, { w: "triangle", f: [660, 1320], t: 0.5, v: 0.16, chord: [1, 1.25, 1.5], d: 0.08 }] },
    engine:  { gap: 0.5, rnd: 0, L: [{ w: "noise", f: [120, 900], t: 4.5, v: 0.3, a: 1.2 }, { w: "sawtooth", f: [40, 120], t: 4.5, v: 0.16, a: 1, vib: [30, 8] }, { w: "noise", f: [2000, 6000], t: 4.5, v: 0.06, a: 2 }] },
    land:    { gap: 0.5, rnd: 0, L: [{ w: "noise", f: [900, 120], t: 3, v: 0.26 }, { w: "sawtooth", f: [120, 40], t: 3, v: 0.14, vib: [30, 8] }, { w: "sine", f: [70, 30], t: 0.6, v: 0.3, d: 2.9 }, { w: "noise", f: [500, 80], t: 0.5, v: 0.25, d: 2.9 }] },
    core:    { gap: 0.3, rnd: 0, L: [{ w: "sine", f: [220, 1760], t: 0.9, v: 0.12, chord: [1, 1.5] }, { w: "sine", f: [1760, 1760], t: 0.8, v: 0.08, d: 0.8, chord: [1, 1.25, 1.5] }] },
  },

  HIT_GROUP: { fire: "fire", dragon: "fire", water: "water", electric: "electric", ice: "ice", rock: "rock", ground: "rock", steel: "steel", grass: "grass", bug: "grass",
    poison: "poison", psychic: "mind", light: "mind", shadow: "shadow", air: "air", arcane: "arcane" },

  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    // a gentle compressor keeps a 400-beast brawl from clipping
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },

  // an impact, voiced by the element that caused it
  hit(type, onPlayer) {
    if (onPlayer) { this.play("hurt", 0.8); return; }
    const g = this.HIT_GROUP[type];
    this.play(g && Math.random() < 0.75 ? "hit_" + g : "hit", 0.75);
  },

  play(name, vol, pitch) {
    const d = this.DEFS[name];
    if (!d || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < d.gap) return;
    // global budget: at most 5 new voices in any 60ms
    while (this.voices.length && now - this.voices[0] > 0.06) this.voices.shift();
    if (this.voices.length >= 5 && d.gap < 0.2) return;
    this.voices.push(now);
    this.last[name] = now;
    const layers = d.alt ? d.alt[(Math.random() * d.alt.length) | 0] : d.L;
    const p = (pitch || 1) * (1 + (Math.random() - 0.5) * 2 * (d.rnd || 0));
    for (const L of layers) this.layer(L, now + (L.d || 0), vol || 1, p, this.master);
  },

  layer(L, t0, vol, pitch, dest) {
    const ctx = this.ctx, g = ctx.createGain(), v = L.v * vol, t1 = t0 + L.t;
    if (L.a) { g.gain.setValueAtTime(0.0008, t0); g.gain.exponentialRampToValueAtTime(v, t0 + L.a * L.t); }
    else g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t1);
    g.connect(dest);
    let out = g;
    if (L.flt) {
      const f = ctx.createBiquadFilter(); f.type = L.flt[0]; f.Q.value = L.flt[3] || 1;
      f.frequency.setValueAtTime(L.flt[1], t0); f.frequency.exponentialRampToValueAtTime(L.flt[2], t1);
      f.connect(g); out = f;
    }
    if (L.w === "noise") {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
      f.frequency.setValueAtTime(L.f[0] * pitch, t0); f.frequency.exponentialRampToValueAtTime(L.f[1] * pitch, t1);
      src.connect(f); f.connect(out);
      src.start(t0, Math.random() * 1.5); src.stop(t1 + 0.02);
      return;
    }
    for (const mult of L.chord || [1]) {
      const o = ctx.createOscillator(); o.type = L.w;
      o.frequency.setValueAtTime(L.f[0] * mult * pitch, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, L.f[1] * mult * pitch), t1);
      if (L.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.vib[0]; lg.gain.value = L.vib[1]; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(t1 + 0.02); }
      o.connect(out); o.start(t0); o.stop(t1 + 0.02);
    }
  },

  // ---------------------------------------------------------------- ambience + score
  // bed: filtered noise ("wind") per region; spots: little one-shots scattered over it; scale: the score's notes
  REGION_AUDIO: {
    meadow: { bed: [700, 0.035], spot: ["bird", 2.2], scale: [261.6, 293.7, 329.6, 392, 440, 523.3], wave: "triangle" },
    mere:   { bed: [400, 0.04], spot: ["frog", 1.8], scale: [220, 261.6, 293.7, 329.6, 392, 440], wave: "sine" },
    dust:   { bed: [1100, 0.06], spot: ["gust", 3.5], scale: [246.9, 261.6, 329.6, 349.2, 415.3, 493.9], wave: "triangle" },
    frost:  { bed: [1800, 0.05], spot: ["chime", 2.6], scale: [293.7, 349.2, 440, 523.3, 587.3, 698.5], wave: "sine" },
    cinder: { bed: [160, 0.09], spot: ["crackle", 0.7], scale: [196, 207.7, 246.9, 293.7, 311.1, 392], wave: "sawtooth" },
    rift:   { bed: [260, 0.06], spot: ["whisper", 2.8], scale: [185, 220, 233.1, 277.2, 329.6, 370], wave: "sine" },
    space:  { bed: [120, 0.05], spot: ["ping", 3.2], scale: [220, 277.2, 329.6, 415.3, 440, 554.4], wave: "sine" },
  },
  SPOTS: {
    bird:    () => { const f = 2200 + Math.random() * 1400; return [{ w: "sine", f: [f, f * 1.25], t: 0.07, v: 0.035 }, { w: "sine", f: [f * 1.2, f * 0.9], t: 0.09, v: 0.035, d: 0.1 }, { w: "sine", f: [f, f * 1.3], t: 0.07, v: 0.03, d: 0.22 }]; },
    frog:    () => { const f = 140 + Math.random() * 90; return [{ w: "square", f: [f, f * 1.5], t: 0.09, v: 0.03, flt: ["lowpass", 900, 500, 3] }, { w: "square", f: [f, f * 1.5], t: 0.09, v: 0.03, d: 0.16, flt: ["lowpass", 900, 500, 3] }]; },
    gust:    () => [{ w: "noise", f: [400, 1800], t: 1.6, v: 0.05, a: 0.5 }],
    chime:   () => { const f = [1568, 1760, 2093, 2349][(Math.random() * 4) | 0]; return [{ w: "sine", f: [f, f], t: 1.1, v: 0.03, chord: [1, 2.01] }]; },
    crackle: () => [{ w: "noise", f: [3000 + Math.random() * 3000, 1500], t: 0.03, v: 0.05 }, { w: "noise", f: [4000, 2000], t: 0.02, v: 0.04, d: 0.06 + Math.random() * 0.1 }],
    whisper: () => [{ w: "noise", f: [1200, 2600], t: 1.2, v: 0.03, a: 0.5, flt: ["bandpass", 1500, 2500, 8] }, { w: "sine", f: [110, 104], t: 1.6, v: 0.04, a: 0.4 }],
    ping:    () => [{ w: "sine", f: [1320, 1320], t: 1.4, v: 0.03 }],
  },

  // called every frame with the region under the camera and how hot the fight is (0..1)
  ambience(regionId, heat, dt) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, R = this.REGION_AUDIO[regionId] || this.REGION_AUDIO.meadow;
    if (!this.amb) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.amb = { f, g };
      this.bus = ctx.createGain(); this.bus.gain.value = 0.9; this.bus.connect(this.master);
    }
    const now = ctx.currentTime;
    if (regionId !== this.ambRegion) {
      this.ambRegion = regionId;
      this.amb.f.frequency.setTargetAtTime(R.bed[0], now, 1.5); this.amb.g.gain.setTargetAtTime(R.bed[1], now, 1.5);
    }
    // wind breathes
    this.amb.f.frequency.setTargetAtTime(R.bed[0] * (1 + 0.35 * Math.sin(now * 0.23) + 0.15 * Math.sin(now * 0.71)), now, 0.4);
    this.intensity = lerp(this.intensity, heat, Math.min(1, dt * 0.8));
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = R.spot[1] * (0.5 + Math.random() * 1.2);
      for (const L of this.SPOTS[R.spot[0]]()) this.layer(L, now + (L.d || 0), 1 - this.intensity * 0.7, 1, this.bus);
    }
    // the score: a slow pentatonic wander; in a fight it gains a pulse and a bass
    this.musT -= dt;
    if (this.musT <= 0) {
      const hot = this.intensity, beat = hot > 0.35 ? 0.27 : 0.62;
      this.musT = beat; this.musStep++;
      const s = R.scale, st = this.musStep;
      if (hot > 0.35) {
        if (st % 2 === 0) this.layer({ w: "sine", f: [s[0] / 4, s[0] / 4.3], t: 0.22, v: 0.09 * hot }, now, 1, 1, this.bus);
        if (st % 4 === 2) this.layer({ w: "noise", f: [1800, 600], t: 0.07, v: 0.035 * hot }, now, 1, 1, this.bus);
        if (st % 8 === 0) this.layer({ w: "sawtooth", f: [s[0] / 2, s[0] / 2], t: 1.6, v: 0.03 * hot, chord: [1, 1.5], flt: ["lowpass", 500, 1200, 2], a: 0.2 }, now, 1, 1, this.bus);
        if (Math.random() < 0.55) { const n = s[(Math.random() * s.length) | 0]; this.layer({ w: "square", f: [n, n], t: 0.16, v: 0.018, flt: ["lowpass", 2400, 900, 1] }, now, 1, 1, this.bus); }
      } else if (Math.random() < 0.6) {
        this.note = clamp((this.note === undefined ? 2 : this.note) + ((Math.random() * 5) | 0) - 2, 0, s.length - 1);
        const n = s[this.note] * (Math.random() < 0.2 ? 2 : 1);
        this.layer({ w: R.wave, f: [n, n], t: 1.8, v: 0.022, a: 0.06, flt: ["lowpass", 1800, 600, 1] }, now, 1, 1, this.bus);
        if (st % 6 === 0) this.layer({ w: "sine", f: [s[0] / 2, s[0] / 2], t: 3.2, v: 0.03, a: 0.3, chord: [1, 1.5] }, now, 1, 1, this.bus);
      }
    }
  },
};
