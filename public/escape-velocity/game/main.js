// EV 1:1 browser client: boot, screen flow, dialog stack, fixed-step loop, saves, sound routing.
import { GameData } from '../engine/data.js';
import { Game, STEPS_PER_SECOND } from '../engine/game.js';
import { newPilot, rebuildNebulae } from '../engine/pilot.js';
import { CMD } from '../engine/input.js';
import { Assets } from './assets.js';
import { Keyboard } from './keys.js';
import { loadPrefs, savePrefs, volumeGain } from './prefs.js';
import { Touch } from './touch.js';
import { FlightView, cloakTint, loadGeneva9 } from './flight.js';
import { UI } from './ui.js';
import { HDArt, artSetting, saveArtSetting } from './hdart.js';
import { TitleScreen, SpaceportScreen, MapDialog, InfoDialog, MissionInfoDialog, ShipCommDialog, PlanetCommDialog, PlunderDialog, NoticeDialog } from './screens.js';

const GAME = new URLSearchParams(location.search).get('game') === 'evo' ? 'evo' : 'ev';
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
    this.keyboard = new Keyboard(window); this.saves = new Saves(GAME);
    this.screen = null; this.dialogs = []; this.game = null; this.pilot = null;
    this.acc = 0; this.last = performance.now(); this.paused = false; this.shift = false; this.anim = null;
    this.keyboard.onKey(e => this.onKey(e));
    addEventListener('keydown', e => { if (e.key === 'Shift') this.shift = true; });
    addEventListener('keyup', e => { if (e.key === 'Shift') this.shift = false; });
    canvas.addEventListener('pointermove', e => { const p = this.toLogical(e); this.ui.mouse.x = p.x; this.ui.mouse.y = p.y; });
    canvas.addEventListener('pointerdown', e => {
      this.assets?.unlock(); const p = this.toLogical(e); this.ui.mouse.x = p.x; this.ui.mouse.y = p.y; this.ui.mouse.down = true;
      this.ui.click(p.x, p.y);
    });
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
  toLogical(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * this.canvas.width / r.width, y: (e.clientY - r.top) * this.canvas.height / r.height }; }

  // ---------- flow ----------
  // FUN_1004ef64: the two naming dialogs, then the pilot is saved and the title screen shows it.
  newPilot(name, strict = false, shipName) {
    this.pilot = newPilot(this.data, name, new Date(), { strict, shipName });
    this.saves.put(this.pilot);
  }
  loadPilot(name) { this.pilot = this.saves.get(name); if (this.pilot) rebuildNebulae(this.data, this.pilot); }
  enterShip() {
    if (!this.pilot || this.pilot.killed) return;
    this.assets.stopMusic();
    this.game = new Game(this.data, structuredClone(this.pilot), { speed: this.prefs.speed });
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
        this.save(); this.dialogs = []; this.screen = new SpaceportScreen(this); this.assets.play(390); break;
      }
      // Back to the title, whose pilot box now reads "<name> / has been killed" (FUN_1004cf20 asks
      // 0x10061e5c whether the ship is dead). A strict pilot's file is gone (FUN_10029e94); any other
      // pilot can be opened again from its last save.
      case 'playerDied':
        if (e.deleteFile) this.saves.remove(this.pilot.name);
        this.pilot = { ...this.pilot, killed: true };
        this.game = null; this.dialogs = []; this.screen = new TitleScreen(this);
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
        const input = this.keyboard.take(); this.touch.apply(input);
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
    const [w, h] = this.screen?.size ?? [640, 480];
    this.size(w, h); this.hd?.begin(w, h);
    const ctx = this.ctx; this.ui.begin();
    const flight = this.screen?.flight && this.game?.player;
    if (flight) {
      if (this.hd) this.hd.sprites = !this.game.pilot.cloaked;   // the cloak tint recolours the main canvas only
      this.flight.draw(ctx, this.game);
      if (this.anim) this.drawLaunch(ctx, dt);
      if (this.paused) this.ui.text(ctx, 'PAUSED (F1 to resume)', 248, 230, '#ffffff', 'center');
    } else this.screen?.draw(ctx, this.ui);
    for (const d of this.dialogs) d.draw(ctx, this.ui);
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
  drawLaunch(ctx, dt) {
    const a = this.anim; a.t += dt;
    const f = Math.min(16, Math.floor(a.t / 70));
    ctx.fillStyle = '#000'; ctx.globalAlpha = Math.max(0, 1 - Math.max(0, a.t - 1100) / 300); ctx.fillRect(0, 0, 496, 480);
    const im = this.assets.pict(8300 + f);
    if (im && a.t < 1200) ctx.drawImage(im, (496 - 480) / 2, 210);
    ctx.globalAlpha = 1;
    if (a.t > 1400) { this.anim = null; this.last = performance.now(); }
  }
}

const app = new App(document.getElementById('screen'));
window.evApp = app;
app.boot();
