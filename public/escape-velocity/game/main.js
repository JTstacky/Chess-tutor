// EV 1:1 browser client: boot, screen flow, dialog stack, fixed-step loop, saves, sound routing.
import { GameData } from '../engine/data.js';
import { Game, STEPS_PER_SECOND } from '../engine/game.js';
import { newPilot, rebuildNebulae } from '../engine/pilot.js';
import { CMD } from '../engine/input.js';
import { Assist } from '../engine/assist.js';
import { commodityPrices } from '../engine/spaceport.js';
import { CloudSaves } from './cloud.js';
import { Assets } from './assets.js';
import { Keyboard } from './keys.js';
import { loadPrefs, savePrefs, volumeGain } from './prefs.js';
import { Touch } from './touch.js';
import { FlightView, cloakTint, loadGeneva9 } from './flight.js';
import { UI } from './ui.js';
import { HDArt, artSetting, saveArtSetting } from './hdart.js';
import { TitleScreen, SpaceportScreen, MapDialog, InfoDialog, MissionInfoDialog, ShipCommDialog, PlanetCommDialog, PlunderDialog, NoticeDialog, ConfirmDialog } from './screens.js';

const GAME = new URLSearchParams(location.search).get('game') === 'evo' ? 'evo' : 'ev';
// Screen layout (docs/re-gaps.md #65): "full" fills the window. The flight playfield is the whole canvas, with the
// ship at its centre and the status bar in the top-right corner; other screens and dialogs keep their original
// size, centred (or at the start edge on touch screens, to leave one strip for the big buttons). "classic" is
// the original fixed 640x480 picture. ?layout=classic|full picks one and is remembered.
const LAYOUT_KEY = 'evonline.layout';
function layoutSetting() {
  const q = new URLSearchParams(location.search).get('layout');
  if (q === 'classic' || q === 'full') { try { localStorage.setItem(LAYOUT_KEY, q); } catch { } return q; }
  try { return localStorage.getItem(LAYOUT_KEY) === 'classic' ? 'classic' : 'full'; } catch { return 'full'; }
}
// Rules (docs/re-gaps.md #66): "modern" adds the quality-of-life helpers (autopilot for landing and leaving a
// system's gravity, map routes to any known system, held Buy/Sell buttons, Max buttons, remembered prices,
// load the last save after death). "classic" is the original's behaviour. ?rules=classic|modern picks one and
// is remembered.
const RULES_KEY = 'evonline.rules';
function rulesSetting() {
  const q = new URLSearchParams(location.search).get('rules');
  if (q === 'classic' || q === 'modern') { try { localStorage.setItem(RULES_KEY, q); } catch { } return q; }
  try { return localStorage.getItem(RULES_KEY) === 'classic' ? 'classic' : 'modern'; } catch { return 'modern'; }
}
const STEP_MS = 1000 / STEPS_PER_SECOND;

class Saves {
  constructor(game) { this.key = `evonline.${game}.pilots`; }
  all() { try { return JSON.parse(localStorage.getItem(this.key)) ?? {}; } catch { return {}; } }
  list() { return Object.values(this.all()).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)); }
  // A pilot read back from storage is never "fresh": like opening the original's file, it starts at
  // its last stellar (load path), not at (50,50) with the tutorial.
  get(name) { const p = this.all()[name]; if (!p) return null; delete p.fresh; return p; }
  remove(name) { try { const a = this.all(); delete a[name]; localStorage.setItem(this.key, JSON.stringify(a)); } catch { } }
  put(p) { try { const a = this.all(); a[p.name] = { ...p, savedAt: Date.now() }; localStorage.setItem(this.key, JSON.stringify(a)); localStorage.setItem(this.key + '.last', p.name); } catch { } }
  last() { try { return this.get(localStorage.getItem(this.key + '.last')); } catch { return null; } }
}

class App {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.keyboard = new Keyboard(window); this.localSaves = this.saves = new Saves(GAME);
    // signed in, pilots live on the server (game/cloud.js, docs/cloud.md); signed out, in this browser
    this.cloud = new CloudSaves(GAME);
    this.cloud.onConflict = name => {
      if (this.game?.pilot?.name !== name) return;
      this.openDialog(new NoticeDialog(this, `“${name}” was saved from another device after this game loaded it, so this game has stopped saving it. Pick the pilot again on the pilot screen to carry on from the newer save.`));
    };
    this.screen = null; this.dialogs = []; this.game = null; this.pilot = null;
    this.acc = 0; this.last = performance.now(); this.paused = false; this.shift = false; this.anim = null;
    this.frameT = { x: 0, y: 0, s: 1 };   // where the current screen's or dialog's own coordinates sit on the canvas
    this.setLayout(layoutSetting());
    this.assist = new Assist(); this.setRules(rulesSetting());
    // A phone switching apps (or a hidden tab) pauses the flight instead of flying on unattended.
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen?.flight && this.game && !this.paused) { this.paused = true; this.keyboard.clear(); } });
    this.keyboard.onKey(e => this.onKey(e));
    addEventListener('keydown', e => { if (e.key === 'Shift') this.shift = true; });
    addEventListener('keyup', e => { if (e.key === 'Shift') this.shift = false; });
    canvas.addEventListener('pointermove', e => { const p = this.toLogical(e); this.ui.mouse.x = p.x; this.ui.mouse.y = p.y; });
    canvas.addEventListener('pointerdown', e => {
      this.assets?.unlock(); const p = this.toLogical(e); this.ui.mouse.x = p.x; this.ui.mouse.y = p.y; this.ui.mouse.down = true;
      const slop = e.pointerType === 'touch' ? this.touch?.slop() ?? 0 : 0, r = this.ui.click(p.x, p.y, slop);
      if (r?.repeat && this.modern) this.holdRepeat(() => this.ui.click(p.x, p.y, slop)?.repeat);
    });
    // any lift ends a held button's repeat, even when the button under the finger was rebuilt meanwhile
    for (const t of ['pointerup', 'pointercancel']) addEventListener(t, () => this.holdRepeat(null));
    canvas.addEventListener('pointerleave', () => this.holdRepeat(null));
    canvas.addEventListener('pointerup', e => { if (this.ui) { this.ui.mouse.down = false; const f = this.ui.up; this.ui.up = null; f?.(); } });
    canvas.addEventListener('wheel', e => { if (this.wheel(Math.sign(e.deltaY), this.toLogical(e))) e.preventDefault(); }, { passive: false });
  }

  async boot() {
    this.status('Loading game data...');
    const res = await fetch(`gamedata/${GAME}.json`);
    if (!res.ok) { this.status('Game data not found. Run: npm run build:data'); return; }
    this.data = new GameData(await res.json());
    this.assets = new Assets(this.data, GAME);
    this.ui = new UI(this.assets);
    this.hd = new HDArt(); this.hd.install(this.canvas, this.ctx); await this.hd.load(GAME);
    this.setArt(artSetting());
    this.touch = new Touch(this);
    await loadGeneva9();
    if (this.data.font) try { const f = new FontFace('EVUI', `url(gamedata/${GAME}/${this.data.font})`); await f.load(); document.fonts.add(f); } catch { }
    this.prefs = loadPrefs(this.data.evo); this.keyboard.setKeys(this.prefs.keys); this.applyVolume(this.prefs.volume);
    await this.assets.preloadPicts([8000, 8002, 128, 8200, 9000, 9001, ...Array.from({ length: 17 }, (_, i) => 8300 + i)]);
    this.assets.preloadSprites(Object.keys(this.data.sprites).map(Number));
    this.flight = new FlightView(this.assets);
    if (this.cloud.signedIn) {
      this.status('Loading your pilots...');
      const load = async () => { await this.cloud.refreshTier(); if (this.cloud.full) await this.cloud.load(); };
      try { await Promise.race([load(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000))]); }
      catch (e) { this.cloud.status = 'Can’t reach the server: online pilots aren’t available right now.'; }
      // a basic account plays with this browser's pilots
      if (this.cloud.full) this.saves = this.cloud;
    }
    this.pilot = this.saves.last();
    this.screen = new TitleScreen(this);
    requestAnimationFrame(t => this.frame(t));
  }
  status(t) { const c = this.ctx; this.size(640, 480); c.fillStyle = '#000'; c.fillRect(0, 0, 640, 480); c.fillStyle = '#0e0'; c.font = '12px Geneva, Verdana'; c.fillText(t, 20, 240); }
  // HD art (game/hdart.js) or the original pictures; the toggle sits in the controls bar, outside the game.
  setArt(v) {
    this.art = v === 'original' ? 'original' : 'hd'; this.hd.on = this.art === 'hd'; this.assets.hd = this.hd.on ? this.hd : null; saveArtSetting(this.art);
    const b = document.getElementById('art'); if (b) { b.textContent = this.hd.on ? 'HD' : 'Original'; b.onclick = () => this.setArt(this.hd.on ? 'original' : 'hd'); }
  }
  // Scroll the top dialog or screen one notch (mouse wheel; touch drags via game/touch.js). True if it scrolled.
  wheel(dir, p) {
    const d = this.dialogs.at(-1) ?? (this.screen?.wheel ? this.screen : null);
    if (d?.wheel?.(dir, p)) return true;
    if (d && 'scroll' in d) { d.scroll = (d.scroll ?? 0) + dir * 3; return true; }
    return false;
  }
  size(w, h) { if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; } this.ctx.imageSmoothingEnabled = false; }
  // Canvas pixels under a pointer event.
  toCanvas(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.canvas.width / r.width, y: (e.clientY - r.top) * this.canvas.height / r.height }; }
  // The same in the coordinates of the screen or dialog on top (what UI hit regions use).
  toLogical(e) { const q = this.toCanvas(e), f = this.frameT; return { x: (q.x - f.x) / f.s, y: (q.y - f.y) / f.s }; }
  setLayout(v) {
    this.full = v !== 'classic';
    document.body.classList.toggle('full', this.full);
    try { localStorage.setItem(LAYOUT_KEY, this.full ? 'full' : 'classic'); } catch { }
    const b = document.getElementById('layout'); if (b) { b.textContent = this.full ? 'Full screen' : 'Classic'; b.onclick = () => this.setLayout(this.full ? 'classic' : 'full'); }
    dispatchEvent(new Event('resize'));
  }
  // Remembered prices (re-gaps #66): each landing notes the commodity levels and prices seen there, in the pilot
  // file, so the map can show them later under modern rules. The original kept no such record.
  notePrices(g) {
    const P = g.data.spob[g.landed]; if (!P || !g.data.spobFlag(P, 0x2)) return;
    const d = g.pilot.date;
    (g.pilot.prices ??= {})[P.id] = { seen: d.y * 10000 + d.m * 100 + d.d, c: commodityPrices(g, P).map(c => c && [c.level, c.price]) };
  }
  // Modern rules: a held Buy or Sell repeats, slowly at first and then faster. fn returns false to stop.
  // holdRepeat(null) stops it. Returns whether anything repeated, for the touch panel.
  holdRepeat(fn) {
    clearTimeout(this.repeatT); const did = !!this.repeated; this.repeated = false; this.holding = !!fn;
    if (!fn) return did;
    let n = 0;
    const tick = () => { if (!fn()) return; this.repeated = true; n++; this.repeatT = setTimeout(tick, n < 5 ? 160 : n < 15 ? 90 : 45); };
    this.repeatT = setTimeout(tick, 420);
    return did;
  }
  setRules(v) {
    this.modern = v !== 'classic';
    try { localStorage.setItem(RULES_KEY, this.modern ? 'modern' : 'classic'); } catch { }
    if (!this.modern && this.game) this.assist.stop(this.game);
    const b = document.getElementById('rules'); if (b) { b.textContent = this.modern ? 'Modern' : 'Classic'; b.onclick = () => this.setRules(this.modern ? 'classic' : 'modern'); }
  }
  // Canvas size for this frame. Classic: the screen's own size. Full: the window's shape, 480 canvas pixels on the
  // short side in flight (the original's height), and just big enough to hold the screen otherwise.
  canvasSize(flight, w0, h0) {
    if (!this.full) return [w0, h0];
    const r = this.canvas.getBoundingClientRect(), a = r.width > 0 && r.height > 0 ? r.width / r.height : w0 / h0;
    if (flight) return a >= 1 ? [Math.max(480, Math.round(480 * a)), 480] : [480, Math.round(480 / a)];
    return a >= w0 / h0 ? [Math.round(h0 * a), h0] : [w0, Math.round(w0 / a)];
  }
  // Where a w0 x h0 screen or dialog goes on a W x H canvas: scaled down only if it doesn't fit, centred, or
  // at the start edge (left, or top in portrait) when touch controls are on.
  placeFrame(w0, h0, W, H) {
    const s = Math.min(1, W / w0, H / h0), fw = w0 * s, fh = h0 * s, start = !!this.touch?.active;
    return { x: Math.round(start && W - fw > H - fh ? 0 : (W - fw) / 2), y: Math.round(start && H - fh > W - fw ? 0 : (H - fh) / 2), s };
  }
  // The current frame's rect in CSS pixels (the touch layer's big-button panel goes beside it).
  frameRect() {
    const r = this.canvas.getBoundingClientRect(), k = r.width / this.canvas.width, f = this.frameT, [w0, h0] = this.frameSize ?? [640, 480];
    return { left: r.left + f.x * k, top: r.top + f.y * k, right: r.left + (f.x + w0 * f.s) * k, bottom: r.top + (f.y + h0 * f.s) * k, width: w0 * f.s * k, height: h0 * f.s * k };
  }

  // ---------- flow ----------
  // FUN_1004ef64: the two naming dialogs, then the pilot is saved and the title screen shows it.
  newPilot(name, strict = false, shipName) {
    this.pilot = this.makePilot(name, strict, shipName);
    this.saves.put(this.pilot);
  }
  makePilot(name, strict = false, shipName) { return newPilot(this.data, name, new Date(), { strict, shipName }); }
  // Switch between the account's online pilots and this browser's.
  useCloud(on) {
    this.saves = on && this.cloud.full ? this.cloud : this.localSaves;
    this.pilot = this.saves.last();
    if (this.pilot) rebuildNebulae(this.data, this.pilot);
  }
  loadPilot(name) { this.pilot = this.saves.get(name); if (this.pilot) rebuildNebulae(this.data, this.pilot); }
  enterShip() {
    if (!this.pilot || this.pilot.killed) return;
    this.assets.stopMusic();
    this.game = new Game(this.data, structuredClone(this.pilot), { speed: this.prefs.speed }); this.assist.mode = null;
    delete this.pilot.fresh;
    this.game.enterSpace();
    this.dialogs = [];
    this.screen = { size: [640, 480], flight: true }; this.anim = null; this.keyboard.clear();
  }
  save() { if (!this.game) return; this.game.syncPilot(); this.pilot = this.game.pilot.toJSON(); this.saves.put(this.pilot); }
  takeOff() { this.screen = { size: [640, 480], flight: true }; this.anim = { t: 0 }; this.keyboard.clear(); }
  openDialog(d) { this.dialogs.push(d); this.keyboard.clear(); }
  closeDialog(d) { this.dialogs = this.dialogs.filter(x => x !== d); this.keyboard.clear(); this.last = performance.now(); }
  // One volume for every sound, music included (FUN_1006d76c sets the output volume).
  applyVolume(step) {
    const g = volumeGain(step); this.assets.volume = g; this.assets.musicVolume = g;
    if (this.assets.master) this.assets.master.gain.value = g;
    if (this.assets.musicGain) this.assets.musicGain.gain.value = g;
  }
  savePrefs() { savePrefs(this.prefs, this.data.evo); this.keyboard.setKeys(this.prefs.keys); }
  // SysBeep: the Mac alert sound (the system's, not the game's): a short square tone.
  sysBeep() {
    const a = this.assets.audio; if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.15 * this.assets.volume;
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12);
  }

  onKey(e) {
    this.assets?.unlock();
    const d = this.dialogs.at(-1);
    if (d) return d.key ? d.key(e) : true;
    if (this.screen?.key) return this.screen.key(e);
    return false;
  }

  // ---------- engine events ----------
  handle(e) {
    const g = this.game, P = g.player;
    switch (e.type) {
      case 'sound': {
        let gain = 1;
        if (e.x != null && P) { const d = Math.hypot(e.x - P.x, e.y - P.y); gain = Math.max(0, 1 - d / 900); }
        if (gain > 0.05) this.assets.play(e.id, { gain });
        break;
      }
      case 'landed': {
        // keep the last flight frame: the spaceport dialog is drawn over it, as in the original
        const b = this.backdrop ??= document.createElement('canvas'); b.width = this.canvas.width; b.height = this.canvas.height;
        b.getContext('2d').drawImage(this.canvas, 0, 0);
        // full layout: render draws the whole frame where it was, and the spaceport's own backdrop is left blank
        if (this.full) { this.backdropFull = b; this.backdrop = Object.assign(document.createElement('canvas'), { width: 640, height: 480 }); }
        else this.backdropFull = null;
        this.notePrices(g);
        this.save(); this.dialogs = []; this.screen = new SpaceportScreen(this); this.assets.play(390); break;
      }
      // Back to the title, whose pilot box now reads "<name> / has been killed" (FUN_1004cf20 asks
      // 0x10061e5c whether the ship is dead). A strict pilot's file is gone (FUN_10029e94); any other
      // pilot can be opened again from its last save.
      case 'playerDied':
        if (e.deleteFile) this.saves.remove(this.pilot.name);
        this.pilot = { ...this.pilot, killed: true };
        this.game = null; this.dialogs = []; this.screen = new TitleScreen(this);
        // Modern rules: offer the last save straight away instead of the trip through the pilot list.
        if (this.modern && !e.deleteFile && this.saves.get(this.pilot.name)) {
          const name = this.pilot.name;
          this.openDialog(new ConfirmDialog(this, 'Your ship has been destroyed. Load your last save and launch again?', () => { this.loadPilot(name); this.enterShip(); }));
        }
        break;
      case 'autosave': this.game.syncPilot(); this.game.pilot.spob = e.spob; this.pilot = this.game.pilot.toJSON(); this.saves.put(this.pilot); break;
      case 'ui':
        if (e.what === CMD.MAP) this.openDialog(new MapDialog(this));
        else if (e.what === CMD.PLAYER_INFO) this.openDialog(new InfoDialog(this));
        else if (e.what === CMD.MISSION_INFO) this.openDialog(new MissionInfoDialog(this));
        else if (e.what === CMD.PAUSE) this.paused = !this.paused;
        else if (e.what === 'hailShip') this.openDialog(new ShipCommDialog(this, e.slot));
        else if (e.what === 'hailPlanet') this.openDialog(new PlanetCommDialog(this, e.spob));
        else if (e.what === 'board') this.openDialog(new PlunderDialog(this, e.slot));
        else if (e.what === 'notice') this.openDialog(new NoticeDialog(this, e.text));
        break;
      default: this.flight.onEvent(g, e);
    }
  }

  // ---------- loop ----------
  frame(now) {
    const dt = Math.min(250, now - this.last); this.last = now;
    const flying = this.screen?.flight && this.game && !this.dialogs.length && !this.anim && !this.paused;
    if (flying) {
      this.acc += dt;
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS;
        const input = this.keyboard.take(); this.touch.apply(input); if (this.modern) this.assist.apply(this.game, input);
        this.game.step(input);
        for (const e of this.game.drainEvents()) this.handle(e);
        this.flight.tick();
        if (!this.screen?.flight || this.dialogs.length) break;
      }
    } else this.acc = 0;
    this.render(dt);
    requestAnimationFrame(t => this.frame(t));
  }

  render(dt) {
    const flight = this.screen?.flight && this.game?.player;
    const [w0, h0] = flight ? [640, 480] : this.screen?.size ?? [640, 480];
    const [w, h] = this.canvasSize(flight, w0, h0);
    this.size(w, h); this.hd?.begin(w, h);
    const ctx = this.ctx; this.ui.begin();
    this.frameT = { x: 0, y: 0, s: 1 }; this.frameSize = [w, h];
    const frame = (fw, fh) => {   // later drawing in a fw x fh screen's own coordinates
      const f = this.frameT = this.full ? this.placeFrame(fw, fh, w, h) : { x: 0, y: 0, s: 1 };
      this.frameSize = [fw, fh];
      if (f.x || f.y) ctx.translate(f.x, f.y); if (f.s !== 1) ctx.scale(f.s, f.s);
    };
    ctx.save();
    if (flight) {
      if (this.hd) this.hd.sprites = !this.game.pilot.cloaked;   // the cloak tint recolours the main canvas only
      (this.flight.modern = this.modern, this.flight.draw(ctx, this.game, w, h, this.full));
      if (this.anim) this.drawLaunch(ctx, dt, w, h);
      if (this.paused) this.ui.text(ctx, 'PAUSED (F1 to resume)', this.full ? w / 2 : 248, this.full ? h / 2 - 10 : 230, '#ffffff', 'center');
      if (this.dialogs.length) frame(640, 480);
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      // the spaceport sits over the last flight frame: show all of it around the 640x480 screen
      if (this.full && this.backdropFull && this.screen instanceof SpaceportScreen) {
        const b = this.backdropFull; ctx.drawImage(b, b.width === w ? 0 : Math.round((w - b.width) / 2), b.height === h ? 0 : Math.round((h - b.height) / 2));
      }
      frame(w0, h0);
      this.screen?.draw(ctx, this.ui);
    }
    for (const d of this.dialogs) d.draw(ctx, this.ui);
    ctx.restore();
    // FUN_10064de4: the cloak switches the screen to the clut of the last owned Cloaking Device's ModVal.
    if (flight && this.game.pilot.cloaked) {
      const D = this.data, own = this.game.pilot.outfits;
      let mv = -1; for (const o of Object.values(D.outf)) if (o.ModType === 17 && (own[o.id] ?? 0) > 0) mv = o.ModVal;
      if (mv >= 0) cloakTint(ctx, w, h, mv);
    }
    this.touch?.update();
    this.canvas.style.cursor = this.ui.hoverCursor ? 'pointer' : 'default';
  }

  // Take-off: the original airlock strip (PICT 8300-8316) over the playfield.
  drawLaunch(ctx, dt, w = 640, h = 480) {
    const a = this.anim; a.t += dt;
    const f = Math.min(16, Math.floor(a.t / 70));
    const fw = this.full ? w : 496, oy = this.full ? Math.round((h - 480) / 2) : 0;
    ctx.fillStyle = '#000'; ctx.globalAlpha = Math.max(0, 1 - Math.max(0, a.t - 1100) / 300); ctx.fillRect(0, 0, fw, this.full ? h : 480);
    const im = this.assets.pict(8300 + f);
    if (im && a.t < 1200) ctx.drawImage(im, Math.round((fw - 480) / 2), oy + 210);
    ctx.globalAlpha = 1;
    if (a.t > 1400) { this.anim = null; this.last = performance.now(); }
  }
}

const app = new App(document.getElementById('screen'));
window.evApp = app;
app.boot();
