// Read-only view over a game data bundle (data/gamedata/<game>.json).
// Resource ids are kept (128+); `index` is id-128, which several original fields use.

export class GameData {
  constructor(bundle) {
    Object.assign(this, bundle);
    // Override runs the same engine with its own rules switched on (research analysis/override).
    this.evo = this.game === 'evo';
    this.bitMax = this.evo ? 512 : 256;                    // mission bits 0..n-1, clear aliases 1000..1000+n-1
    this.yearOffset ??= this.evo ? 150 : 250;
    // EVO loader: Guidance 2 becomes homing 1 with Seeker 0x30fe (deep-03).
    if (this.evo) for (const W of Object.values(this.weap)) if (W.Guidance === 2) { W.Guidance = 1; W.Seeker = 0x30fe; }
    const byIndex = t => { const a = []; for (const r of Object.values(t)) a[r.index] = r; return a; };
    this.govtList = byIndex(this.govt);
    this.systList = byIndex(this.syst);
    this.spobList = byIndex(this.spob);
    this.spobsBySystem = new Map();
    for (const p of this.spobList) if (p) {
      const a = this.spobsBySystem.get(p.System) ?? []; a.push(p); this.spobsBySystem.set(p.System, a);
    }
  }
  system(id) { return this.syst[id]; }
  links(sysId) {
    const s = this.syst[sysId], out = [];
    for (let i = 1; i <= 16; i++) { const c = s['Con' + i]; if (c >= 128 && this.syst[c]) out.push(c); }
    return out;
  }
  spobs(sysId) { return this.spobsBySystem.get(sysId) ?? []; }
  // Government by the resource's own field value: ids 128+, -1 = independent.
  govtOf(id) { return id >= 128 ? this.govt[id] : null; }
  str(table, i) { return this.strings[table]?.[i] ?? ''; }   // i is 0-based
  msg(key) { return this.engineStrings?.[key] ?? key; }
  sprite(spinId) { return this.sprites[spinId]; }
  // Spob flags (long): bit0 land, 1 commodities, 2 outfitter, 3 shipyard, 4 station, 5 uninhabited, 6 bar.
  spobFlag(p, bit) { return ((p.Flags >>> 0) & bit) !== 0; }
  // The sÿst VisBit test (EVO FUN_10024c38, EV FUN_10031934): negative = always, 0..n-1 = bit set,
  // 1000.. = bit clear. `loose`: values outside both ranges pass (FUN_10051e9c) instead of hiding.
  visBitOn(bits, v, loose = false) {
    if (v < 0) return true;
    if (v < this.bitMax) return !!bits[v];
    if (v >= 1000 && v < 1000 + this.bitMax) return !bits[v - 1000];
    return !!loose;
  }
}

export const SPOB = { LAND: 1, TRADE: 2, OUTFIT: 4, SHIPYARD: 8, STATION: 16, UNINHABITED: 32, BAR: 64 };

// Outfit ModTypes (Override Bible / research deep-physics §2).
export const MOD = { WEAPON: 1, CARGO: 2, AMMO: 3, SHIELD: 4, RECHARGE: 5, ARMOR: 6, ACCEL: 7, SPEED: 8, TURN: 9,
  JAMMER: 10, POD: 11, FUEL: 12, SCANNER: 13, IFF: 14, AFTERBURNER: 15, MAP: 16, CLOAK: 17, RAMSCOOP: 18,
  AUTOREFUEL: 19, AUTOEJECT: 20, CLEAN: 21, JUMPDAYS: 22, JUMPDIST: 23 };
