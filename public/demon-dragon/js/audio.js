// All sound is synthesised with WebAudio, so the game ships no audio files.
(function () {
  'use strict';
  let ctx = null, master = null, musicGain = null;
  let muted = false;
  try { muted = localStorage.getItem('rotdd.muted') === '1'; } catch (e) { /* private mode */ }

  // Browsers only allow audio after a touch or key press.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, slideTo, delay, dest) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(dur, vol, freq, kind, delay) {
    if (!ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind || 'lowpass';
    f.frequency.value = freq || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const arp = (notes, step, type, vol) => notes.forEach((n, i) => tone(n, step * 1.6, type || 'square', vol || 0.14, null, i * step));

  const SOUNDS = {
    swing: () => noise(0.12, 0.22, 2400, 'highpass'),
    shoot: () => tone(920, 0.13, 'square', 0.12, 380),
    dodge: () => noise(0.2, 0.18, 900, 'bandpass'),
    hit: () => { tone(200, 0.1, 'square', 0.2, 90); noise(0.08, 0.2, 1800); },
    plink: () => tone(700, 0.06, 'triangle', 0.18, 500),
    hurt: () => tone(240, 0.32, 'sawtooth', 0.22, 70),
    heart: () => arp([660, 880, 1320], 0.07, 'triangle', 0.16),
    rock: () => noise(0.22, 0.3, 320),
    boom: () => { noise(0.28, 0.28, 500); tone(90, 0.25, 'sine', 0.3, 40); },
    zap: () => tone(1500, 0.16, 'sawtooth', 0.13, 180),
    thunder: () => { noise(0.7, 0.4, 260); tone(70, 0.6, 'sine', 0.3, 30); },
    splash: () => noise(0.3, 0.22, 1300, 'bandpass'),
    fire: () => noise(0.4, 0.22, 700, 'bandpass'),
    bite: () => tone(160, 0.1, 'square', 0.18, 90),
    spit: () => tone(520, 0.14, 'square', 0.1, 200),
    poof: () => { noise(0.15, 0.18, 1600); tone(300, 0.2, 'sine', 0.14, 900); },
    roar: () => { tone(120, 0.95, 'sawtooth', 0.26, 48); noise(0.9, 0.2, 420); },
    text: () => tone(1050, 0.025, 'square', 0.035),
    select: () => tone(880, 0.07, 'square', 0.1, 1100),
    levelup: () => arp([523, 659, 784, 1047], 0.08, 'square', 0.13),
    item: () => arp([392, 494, 587, 784, 988], 0.13, 'triangle', 0.2),
    fanfare: () => arp([523, 523, 523, 659, 784, 1047], 0.13, 'square', 0.15),
    defeat: () => arp([392, 349, 311, 262, 196], 0.17, 'triangle', 0.18),
  };

  // A tiny step sequencer. Each tune is a bass line and a lead line of semitone offsets.
  const TUNES = {
    title: { bpm: 84, root: 146.8, bass: [0, 0, 7, 7, 3, 3, 5, 5], lead: [12, null, 15, null, 19, 17, 15, null], wave: 'triangle' },
    story: { bpm: 70, root: 130.8, bass: [0, null, 0, null, 8, null, 7, null], lead: [null, 12, null, 15, null, 14, null, 10], wave: 'sine' },
    world: { bpm: 126, root: 196, bass: [0, 7, 0, 7, 5, 12, 5, 12, 9, 16, 9, 16, 7, 14, 7, 14], lead: [12, null, 16, 19, 24, null, 19, 16, 17, null, 21, 24, 23, 19, 14, null], wave: 'square' },
    boss: { bpm: 152, root: 110, bass: [0, 0, 12, 0, 0, 12, 0, 10, 3, 3, 15, 3, 5, 5, 17, 7], lead: [12, null, 15, 12, null, 19, 18, null, 15, null, 12, 15, 17, null, 19, 22], wave: 'sawtooth' },
    final: { bpm: 164, root: 98, bass: [0, 12, 0, 12, 1, 13, 1, 13, 0, 12, 0, 12, 6, 18, 5, 17], lead: [24, 23, 19, null, 18, 19, 23, null, 24, 27, 23, null, 18, 19, 13, null], wave: 'sawtooth' },
  };
  let tune = null, tuneName = null, stepNo = 0, timer = null;

  function tick() {
    if (!ctx || !tune) return;
    const dur = 60 / tune.bpm / 2;
    const b = tune.bass[stepNo % tune.bass.length];
    const l = tune.lead[stepNo % tune.lead.length];
    if (b != null) tone(tune.root / 2 * Math.pow(2, b / 12), dur * 0.95, 'triangle', 0.3, null, 0, musicGain);
    if (l != null) tone(tune.root * Math.pow(2, l / 12), dur * 1.5, tune.wave, 0.11, null, 0, musicGain);
    stepNo += 1;
  }

  function music(name) {
    if (name === tuneName) return;
    tuneName = name;
    tune = TUNES[name] || null;
    stepNo = 0;
    clearInterval(timer);
    if (tune) timer = setInterval(tick, 60000 / tune.bpm / 2);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  window.Sfx = {
    unlock,
    play(name) { if (ctx && SOUNDS[name]) SOUNDS[name](); },
    music,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('rotdd.muted', muted ? '1' : '0'); } catch (e) { /* private mode */ }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
})();
