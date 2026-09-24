"use strict";
// world.js — one continuous island of six regions. The ground is painted per
// texel from continuous fields (so coasts and biome borders are organic, never
// tile-square), cached in chunks, and collision comes from the same fields.

const BIOME_ART = {
  // ground: 4 shades dark->light; deco: stamp kinds scattered on the ground
  meadow: { ground: ["#3f8a3a", "#4c9c40", "#5cae48", "#70c054"], deco: ["tuft", "tuft", "flower", "clover"], tuft: ["#2f7434", "#86d262"],
            water: ["#2a5ea8", "#3674c0", "#4a8cd4", "#6aa8e4"], foam: "#d8f0ff", shore: ["#c8b070", "#dcc688"], liquid: "water" },
  mere:   { ground: ["#2f6e4a", "#3a7e52", "#488e58", "#5a9e60"], deco: ["tuft", "lily", "puddle", "tuft"], tuft: ["#1f5a3c", "#7cc47a"],
            water: ["#1f5a6e", "#2a6e80", "#3a8494", "#54a0a8"], foam: "#c4ecd8", shore: ["#5a6a3a", "#70804a"], liquid: "water" },
  dust:   { ground: ["#c89a54", "#d6aa62", "#e2ba72", "#ecca88"], deco: ["pebble", "crack", "drytuft", "pebble"], tuft: ["#9a7a3a", "#c4a45a"],
            water: ["#2a7a9a", "#3a90b0", "#50a8c4", "#78c4d8"], foam: "#e8f8ff", shore: ["#8aa050", "#a4b860"], liquid: "water" },
  frost:  { ground: ["#c4d8ec", "#d4e4f4", "#e4eefa", "#f4faff"], deco: ["sparkle", "snowtuft", "pebble", "sparkle"], tuft: ["#8aa8c8", "#ffffff"],
            water: ["#7ab4e0", "#90c4ec", "#a8d4f4", "#c4e4fc"], foam: "#ffffff", shore: ["#b0c8e0", "#c0d4e8"], liquid: "ice" },
  cinder: { ground: ["#2a2428", "#363034", "#443c40", "#524a4c"], deco: ["ember", "crack", "pebble", "ember"], tuft: ["#1a1618", "#6a5a58"],
            water: ["#c83a0a", "#e85a10", "#ff8a1a", "#ffc83a"], foam: "#fff0a0", shore: ["#1a1214", "#5a1a0a"], liquid: "lava" },
  rift:   { ground: ["#241a38", "#2e2246", "#3a2c56", "#483868"], deco: ["rune", "voidtuft", "pebble", "rune"], tuft: ["#160e26", "#9a6ad8"],
            water: ["#0a0614", "#160a2a", "#2a1248", "#5a2a9a"], foam: "#d080ff", shore: ["#1a1030", "#3a1a5c"], liquid: "void" },
};
const ROAD_COL = { meadow: ["#a8875a", "#b8986a", "#c4a678"], mere: ["#6a5a3c", "#7a6a48", "#8a7a54"], dust: ["#b08444", "#a87c3e", "#bc904e"],
                   frost: ["#9aa8b8", "#a8b6c4", "#b8c4d0"], cinder: ["#5a4e4c", "#665a56", "#746662"], rift: ["#5a4a7a", "#665688", "#746496"] };
const PROP_TABLE = {
  meadow: { density: 0.34, kinds: [["oak", 40], ["oak2", 18], ["bush", 22], ["rock", 8], ["stump", 5], ["shroom", 7]] },
  mere:   { density: 0.30, kinds: [["willow", 34], ["reeds", 30], ["mossrock", 12], ["shroom", 12], ["bush", 12]] },
  dust:   { density: 0.13, kinds: [["cactus", 34], ["sandrock", 30], ["drybush", 20], ["bones", 10], ["deadtree", 6]] },
  frost:  { density: 0.26, kinds: [["snowpine", 48], ["pine", 10], ["snowrock", 18], ["icecrystal", 12], ["snowbush", 12]] },
  cinder: { density: 0.16, kinds: [["chartree", 34], ["obsidian", 40], ["bones", 10], ["drybush", 16]] },
  rift:   { density: 0.20, kinds: [["crystal", 34], ["rifttree", 30], ["glowshroom", 22], ["obsidian", 14]] },
};
// tiny ground stamps: [dx, dy, paletteSlot]  (slot 0 = dark tuft, 1 = light tuft, else literal colour)
const STAMPS = {
  tuft:     [[0, 2, 0], [1, 1, 0], [1, 2, 1], [2, 0, 1], [2, 1, 1], [2, 2, 0], [3, 1, 0], [3, 2, 1], [4, 2, 0]],
  drytuft:  [[0, 2, 0], [1, 1, 1], [2, 2, 0], [2, 0, 1], [3, 1, 1], [4, 2, 0]],
  snowtuft: [[0, 2, 0], [1, 1, 0], [2, 0, 0], [2, 1, 1], [3, 1, 0], [4, 2, 0]],
  voidtuft: [[0, 2, 0], [1, 1, 1], [2, 0, 1], [2, 2, 0], [3, 1, 1], [4, 2, 0]],
  clover:   [[1, 0, 1], [0, 1, 1], [2, 1, 1], [1, 1, 0], [1, 2, 1]],
  pebble:   [[0, 1, "#00000030"], [1, 0, "#ffffff50"], [1, 1, "#00000040"], [2, 1, "#00000030"]],
  crack:    [[0, 0, "#00000038"], [1, 1, "#00000038"], [2, 1, "#00000038"], [3, 2, "#00000038"], [3, 3, "#00000028"], [1, 2, "#00000028"]],
  sparkle:  [[1, 0, "#ffffff"], [0, 1, "#ffffff"], [1, 1, "#ffffff"], [2, 1, "#ffffff"], [1, 2, "#ffffff"]],
  ember:    [[0, 0, "#ff5a1a"], [1, 0, "#ffa83a"], [1, 1, "#ff5a1a"], [2, 1, "#c8300a"], [3, 1, "#ff7a2a"]],
  rune:     [[0, 0, "#9a5ae0"], [2, 0, "#9a5ae0"], [1, 1, "#e0a0ff"], [0, 2, "#9a5ae0"], [2, 2, "#9a5ae0"]],
  puddle:   [[1, 0, "#2a6e80"], [2, 0, "#2a6e80"], [0, 1, "#2a6e80"], [1, 1, "#54a0a8"], [2, 1, "#3a8494"], [3, 1, "#2a6e80"], [1, 2, "#2a6e80"], [2, 2, "#2a6e80"]],
  lily:     [[1, 0, "#7cc47a"], [0, 1, "#7cc47a"], [1, 1, "#ffb0d0"], [2, 1, "#5aa85a"], [1, 2, "#5aa85a"]],
};
const FLOWER_COLS = ["#ff6a7a", "#ffd84a", "#ffffff", "#c48aff", "#ff9a4a"];

const F_WATER = 16, F_ICE = 32, F_ROAD = 64, F_OCEAN = 128, F_REGION = 7;
// terrain gates between regions: a river (any water: Bindframe tier 2 wades it), a rock
// ridge (tier 3 strides over it) and a deep chasm (tier 4). See World.solidAt / Game.playerPass.
const F_RIDGE = 256, F_DEEP = 512;
const BARRIER_W = [0, 120, 104, 150];
const RUNE_COL = { meadow: "#c8f08a", mere: "#8af0d0", dust: "#fff0b0", frost: "#7ac8ff", cinder: "#ff8a3a", rift: "#d080ff" };

const World = {
  seed: 1,
  hue: 0,             // degrees of hue rotation baked into this planet's ground and props
  size: 0,            // world px
  cells: null,        // 16px collision/biome grid
  cellN: 0,
  props: null,        // per tile: 0 none, else 1 + kind index into propKinds
  propKinds: [],
  extraProps: [],     // hand-placed (camp, lairs)
  chunks: new Map(),
  chunkQueue: [],
  roads: [],
  minimap: null,

  // a hue-rotated copy of a canvas (done once per chunk / prop, never per frame)
  hueShift(src) {
    const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d"); x.filter = "hue-rotate(" + this.hue + "deg)"; x.drawImage(src, 0, 0);
    return c;
  },

  init(seed, hue) {
    this.seed = seed; this.hue = hue | 0;
    const N = CONFIG.worldTiles;
    this.size = N * CONFIG.tile;
    this.chunks.clear();
    this.chunkQueue = [];
    this.buildRoads();
    this.cellN = N * 2;
    this.cells = new Uint16Array(this.cellN * this.cellN);
    const out = {};
    for (let cy = 0; cy < this.cellN; cy++) for (let cx = 0; cx < this.cellN; cx++) {
      this.fields(cx * 16 + 8, cy * 16 + 8, out);
      let f = out.region;
      if (out.ocean) f |= F_OCEAN | F_WATER;
      else if (out.barrier) f |= out.barrier === 1 ? F_WATER : out.barrier === 2 ? F_RIDGE : F_DEEP | F_WATER;
      else if (out.liquid) f |= (REGIONS[out.region].id === "frost" ? F_ICE : F_WATER);
      if (out.road && !out.barrier) f |= F_ROAD;
      this.cells[cy * this.cellN + cx] = f;
    }
    this.buildProps();
    this.buildMinimap();
  },

  buildRoads() {
    const T = CONFIG.tile, R = REGIONS;
    const c = (r) => [r.cx * T, r.cy * T], l = (r) => [r.lair[0] * T, r.lair[1] * T];
    const camp = [CAMP.tx * T, CAMP.ty * T];
    this.roads = [
      [camp, c(R[0])], [c(R[0]), l(R[0])],
      [c(R[0]), c(R[1])], [c(R[1]), l(R[1])],
      [c(R[0]), c(R[2])], [c(R[2]), l(R[2])],
      [c(R[1]), c(R[3])], [c(R[3]), l(R[3])],
      [c(R[2]), c(R[4])], [c(R[4]), l(R[4])],
      [c(R[3]), c(R[5])], [c(R[4]), c(R[5])], [c(R[5]), l(R[5])],
    ];
  },

  roadDist(x, y) {
    let best = 1e9;
    for (const [a, b] of this.roads) {
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const t = clamp(((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy), 0, 1);
      const dx = x - (a[0] + vx * t), dy = y - (a[1] + vy * t);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  },

  // distance (px) to the nearest "keep clear" site: camp or a titan lair
  siteDist(x, y) {
    const T = CONFIG.tile;
    let best = Math.hypot(x - CAMP.tx * T, y - CAMP.ty * T) - 60;
    for (const r of REGIONS) best = Math.min(best, Math.hypot(x - r.lair[0] * T, y - r.lair[1] * T));
    return best;
  },

  // smooth low-frequency terms; evaluated on a lattice for chunk painting
  smooth(wx, wy, o) {
    const s = this.seed;
    o.warpX = (vnoise(wx / 460, wy / 460, s + 1) - 0.5) * 620 + (vnoise(wx / 120, wy / 120, s + 2) - 0.5) * 150;
    o.warpY = (vnoise(wx / 460, wy / 460, s + 3) - 0.5) * 620 + (vnoise(wx / 120, wy / 120, s + 4) - 0.5) * 150;
    o.lake = vnoise(wx / 330, wy / 330, s + 5) * 0.68 + vnoise(wx / 95, wy / 95, s + 6) * 0.32;
    const e = Math.min(wx, wy, this.size - wx, this.size - wy) / CONFIG.tile;
    o.coast = e / 13 - 0.55 + (vnoise(wx / 210, wy / 210, s + 7) - 0.5) * 0.95;
    o.shadeN = vnoise(wx / 70, wy / 70, s + 8) * 0.62 + vnoise(wx / 19, wy / 19, s + 9) * 0.38;
    o.road = this.roadDist(wx + (vnoise(wx / 90, wy / 90, s + 10) - 0.5) * 70, wy + (vnoise(wx / 90, wy / 90, s + 11) - 0.5) * 70);
    o.site = this.siteDist(wx, wy);
    return o;
  },

  LAKE_THR: [0.69, 0.6, 0.78, 0.66, 0.67, 0.68],

  // resolve the smooth terms at a point into region / liquid / road
  resolve(wx, wy, sm, o) {
    const T = CONFIG.tile;
    const qx = wx + sm.warpX, qy = wy + sm.warpY;
    let d1 = 1e18, d2 = 1e18, a = 0, b = 0;
    for (let i = 0; i < REGIONS.length; i++) {
      const dx = qx - REGIONS[i].cx * T, dy = qy - REGIONS[i].cy * T;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; b = a; d1 = d; a = i; } else if (d < d2) { d2 = d; b = i; }
    }
    o.region = a; o.region2 = b;
    o.edge = Math.sqrt(d2) - Math.sqrt(d1);
    o.ocean = sm.coast < 0;
    o.coast = sm.coast;
    // lakes keep clear of roads, the camp and lairs
    const keep = Math.min(1, Math.max(0, (sm.site - 200) / 160)) * Math.min(1, Math.max(0, (sm.road - 26) / 40));
    o.depth = (sm.lake - this.LAKE_THR[a]) * keep - (1 - keep) * 0.05;
    o.liquid = !o.ocean && o.depth > 0;
    o.road = !o.ocean && sm.road < 17;
    o.roadD = sm.road;
    o.arena = sm.site < 230;
    // terrain gate where two regions of different standing meet
    o.barrier = 0; o.bank = 0;
    const ga = REGIONS[a].gate | 0, gb = REGIONS[b].gate | 0;
    if (ga !== gb && !o.ocean && sm.site > 330) {
      const g = Math.max(ga, gb), k = g >= 4 ? 3 : g >= 3 ? 2 : 1;
      if (o.edge < BARRIER_W[k]) { o.barrier = k; o.bt = 1 - o.edge / BARRIER_W[k]; }
      else if (o.edge < BARRIER_W[k] + 16) o.bank = k;
    }
    if (o.barrier) { o.liquid = false; o.road = false; }
    return o;
  },

  _sm: {},
  fields(wx, wy, o) { return this.resolve(wx, wy, this.smooth(wx, wy, this._sm), o); },

  // ---------------------------------------------------------------- queries
  cellAt(wx, wy) {
    const cx = (wx >> 4), cy = (wy >> 4);
    if (cx < 0 || cy < 0 || cx >= this.cellN || cy >= this.cellN) return F_OCEAN | F_WATER;
    return this.cells[cy * this.cellN + cx];
  },
  // pass: 0 land only · 1 water too (swimmers, flyers, a tier-2 frame) · 2 + rock ridges · 3 + deep chasms
  solidAt(wx, wy, pass) {
    const f = this.cellAt(wx, wy);
    if (f & F_OCEAN) return true;
    if (f & F_DEEP) return !(pass >= 3);
    if (f & F_RIDGE) return !(pass >= 2);
    return !pass && (f & F_WATER) !== 0;
  },
  // what stands in the way at a point, for hints: 0 nothing, else the Bindframe tier that crosses it
  gateAt(wx, wy) {
    const f = this.cellAt(wx, wy);
    return f & F_OCEAN ? 99 : f & F_DEEP ? 4 : f & F_RIDGE ? 3 : f & F_WATER ? 2 : 0;
  },
  regionAt(wx, wy) { return REGIONS[this.cellAt(wx, wy) & F_REGION] || REGIONS[0]; },
  regionIndexAt(wx, wy) { return Math.min(REGIONS.length - 1, this.cellAt(wx, wy) & F_REGION); },

  // move a circle with axis-separated sliding against liquid/ocean
  move(e, dx, dy, crossWater) {
    const r = e.r || 8;
    let nx = e.x + dx;
    if (!this.solidAt(nx + Math.sign(dx) * r, e.y, crossWater)) e.x = nx;
    let ny = e.y + dy;
    if (!this.solidAt(e.x, ny + Math.sign(dy) * r, crossWater)) e.y = ny;
    e.x = clamp(e.x, 40, this.size - 40); e.y = clamp(e.y, 40, this.size - 40);
  },

  // nearest walkable point around (x,y)
  findLand(x, y, rnd, spread) {
    for (let i = 0; i < 40; i++) {
      const a = rnd() * TAU, d = (i / 40) * (spread || 200);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (!this.solidAt(px, py, false)) return { x: px, y: py };
    }
    return null;
  },

  // ---------------------------------------------------------------- props
  buildProps() {
    const N = CONFIG.worldTiles, T = CONFIG.tile, s = this.seed;
    this.props = new Uint8Array(N * N);
    this.propKinds = [];
    const kindIndex = {};
    const idx = (k) => { if (!(k in kindIndex)) { kindIndex[k] = this.propKinds.length; this.propKinds.push(k); } return kindIndex[k]; };
    for (let ty = 1; ty < N - 1; ty++) for (let tx = 1; tx < N - 1; tx++) {
      const x = tx * T + 16, y = ty * T + 16;
      let blocked = false;
      for (let j = 0; j < 2 && !blocked; j++) for (let i = 0; i < 2; i++) {
        const f = this.cells[(ty * 2 + j) * this.cellN + tx * 2 + i];
        if (f & (F_WATER | F_ICE | F_ROAD | F_OCEAN | F_DEEP)) { blocked = true; break; }
      }
      if (!blocked && (this.cells[(ty * 2) * this.cellN + tx * 2] & F_RIDGE)) {
        // the ridge is crowned with boulders
        if (hash2(tx, ty, s + 26) < 0.55) this.props[ty * N + tx] = 1 + idx(REGIONS[this.cells[(ty * 2) * this.cellN + tx * 2] & F_REGION].id === "cinder" ? "obsidian" : "rock");
        continue;
      }
      if (blocked || this.siteDist(x, y) < 300) continue;
      const reg = REGIONS[this.cells[(ty * 2) * this.cellN + tx * 2] & F_REGION];
      const tab = PROP_TABLE[reg.id];
      const forest = vnoise(tx / 8, ty / 8, s + 20);
      const dens = tab.density * (0.12 + 1.5 * clamp((forest - 0.45) / 0.3, 0, 1));
      if (hash2(tx, ty, s + 21) > dens) continue;
      let roll = hash2(tx, ty, s + 22) * tab.kinds.reduce((a, k) => a + k[1], 0);
      let kind = tab.kinds[0][0];
      for (const k of tab.kinds) { roll -= k[1]; if (roll <= 0) { kind = k[0]; break; } }
      this.props[ty * N + tx] = 1 + idx(kind);
    }
    // hand-placed sites
    this.extraProps = [];
    const cx = CAMP.tx * T, cy = CAMP.ty * T;
    this.extraProps.push({ kind: "tent", v: 0, x: cx - 70, y: cy - 60 }, { kind: "tent", v: 1, x: cx + 84, y: cy - 40 },
      { kind: "campfire", v: 0, x: cx, y: cy }, { kind: "rocket", v: 0, x: cx + 10, y: cy - 120 }, { kind: "banner", v: 0, x: cx - 26, y: cy - 84 }, { kind: "banner", v: 1, x: cx + 40, y: cy - 84 },
      { kind: "crate", v: 0, x: cx + 120, y: cy + 10 }, { kind: "crate", v: 1, x: cx + 136, y: cy + 22 }, { kind: "stump", v: 1, x: cx - 40, y: cy + 36 }, { kind: "stump", v: 2, x: cx + 44, y: cy + 40 });
    // bucket the hand-placed props by tile so lookups stay O(1)
    this.extraByTile = new Map();
    for (const p of this.extraProps) {
      const k = ((p.y / T) | 0) * N + ((p.x / T) | 0);
      if (!this.extraByTile.has(k)) this.extraByTile.set(k, []);
      this.extraByTile.get(k).push(p);
      this.props[k] = 0;
    }
  },

  propAtTile(tx, ty) {
    const N = CONFIG.worldTiles;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    const k = this.props[ty * N + tx];
    if (!k) return null;
    const T = CONFIG.tile, s = this.seed;
    return { kind: this.propKinds[k - 1], v: (hash2(tx, ty, s + 23) * 6) | 0,
      x: tx * T + 6 + hash2(tx, ty, s + 24) * 20, y: ty * T + 6 + hash2(tx, ty, s + 25) * 20 };
  },

  // push a circle out of solid props (player only — armies flow through woods)
  collideProps(e) {
    const T = CONFIG.tile, tx0 = ((e.x / T) | 0), ty0 = ((e.y / T) | 0), N = CONFIG.worldTiles;
    for (let ty = ty0 - 1; ty <= ty0 + 1; ty++) for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
      const list = this.extraByTile.get(ty * N + tx);
      const p = this.propAtTile(tx, ty);
      const arr = list ? (p ? list.concat(p) : list) : (p ? [p] : null);
      if (!arr) continue;
      for (const q of arr) {
        const solid = PropArt.get(q.kind, q.v).solid;
        if (!solid) continue;
        const dx = e.x - q.x, dy = e.y - (q.y - 2), rr = solid + e.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2); e.x += (dx / d) * (rr - d); e.y += (dy / d) * (rr - d); }
      }
    }
  },

  // y-sorted drawables for every prop in view
  collectProps(view, out) {
    const T = CONFIG.tile, N = CONFIG.worldTiles;
    const tx0 = Math.max(0, ((view.x0 - 48) / T) | 0), tx1 = Math.min(N - 1, ((view.x1 + 48) / T) | 0);
    const ty0 = Math.max(0, (view.y0 / T) | 0), ty1 = Math.min(N - 1, ((view.y1 + 120) / T) | 0);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const k = ty * N + tx;
      if (this.props[k]) { const p = this.propAtTile(tx, ty); p.prop = true; out.push(p); }
      const ex = this.extraByTile.get(k);
      if (ex) for (const p of ex) { p.prop = true; out.push(p); }
    }
  },

  drawProp(ctx, p, time) {
    if (p.kind === "rocket" && typeof Game !== "undefined" && Game.rocketAway()) return;
    const art = PropArt.get(p.kind, p.v), s = CONFIG.texel;
    // canopies go see-through while the binder stands behind them
    const pl = typeof Game !== "undefined" ? Game.player : null;
    const hide = art.tall && pl && pl.y < p.y && pl.y > p.y - 96 && Math.abs(pl.x - p.x) < 34;
    if (hide) ctx.globalAlpha = 0.4;
    ctx.drawImage(art.canvas, Math.round(p.x - art.ax * s), Math.round(p.y - art.ay * s), art.canvas.width * s, art.canvas.height * s);
    if (hide) ctx.globalAlpha = 1;
    if (art.fire) {
      // campfire flame: three flickering pixel tongues
      for (let i = 0; i < 3; i++) {
        const h = 10 + Math.sin(time * 9 + i * 2.1) * 4 + Math.sin(time * 17 + i) * 2;
        const x = p.x - 6 + i * 5;
        ctx.fillStyle = "#ff5a1a"; ctx.fillRect(x, p.y - 4 - h, 4, h);
        ctx.fillStyle = "#ffa83a"; ctx.fillRect(x + 1, p.y - 4 - h * 0.7, 2, h * 0.7);
        ctx.fillStyle = "#fff0a0"; ctx.fillRect(x + 1, p.y - 4 - h * 0.35, 2, h * 0.35);
      }
    }
  },

  // ---------------------------------------------------------------- ground chunks
  chunkPx() { return CONFIG.chunkTiles * CONFIG.tile; },

  hexToInt(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;
  },

  palInts: null,
  buildPalInts() {
    this.palInts = {};
    for (const id in BIOME_ART) {
      const a = BIOME_ART[id];
      this.palInts[id] = {
        ground: a.ground.map((h) => this.hexToInt(h)), water: a.water.map((h) => this.hexToInt(h)),
        foam: this.hexToInt(a.foam), shore: a.shore.map((h) => this.hexToInt(h)), road: ROAD_COL[id].map((h) => this.hexToInt(h)),
      };
    }
    this.oceanInts = ["#1c4a8c", "#245aa0", "#3070b8", "#4a8cd4"].map((h) => this.hexToInt(h));
    this.beachInts = ["#d8c080", "#e8d498"].map((h) => this.hexToInt(h));
    this.surfInt = this.hexToInt("#e0f4ff");
    this.riverInts = ["#245aa0", "#3070b8", "#4a8cd4", "#6aa8e4"].map((h) => this.hexToInt(h));
    this.ridgeInts = ["#1c1e26", "#3a404e", "#5a6272", "#7e8898", "#aab4c2"].map((h) => this.hexToInt(h));
    this.deepInts = ["#05030a", "#0e0820", "#1e0e3a", "#4a2288"].map((h) => this.hexToInt(h));
    this.deepRim = this.hexToInt("#c070ff");
    this.runeInts = {}; for (const id in RUNE_COL) this.runeInts[id] = this.hexToInt(RUNE_COL[id]);
    this.whiteInt = this.hexToInt("#ffffff");
  },

  paintChunk(cx, cy) {
    if (!this.palInts) this.buildPalInts();
    const CP = this.chunkPx(), tex = CONFIG.texel, n = CP / tex;       // 256 texels
    const step = 4, ln = n / step + 1;                                  // lattice
    const x0 = cx * CP, y0 = cy * CP;
    const keys = ["warpX", "warpY", "lake", "coast", "shadeN", "road", "site"];
    const lat = {};
    for (const k of keys) lat[k] = new Float32Array(ln * ln);
    const tmp = {};
    for (let j = 0; j < ln; j++) for (let i = 0; i < ln; i++) {
      this.smooth(x0 + i * step * tex, y0 + j * step * tex, tmp);
      for (const k of keys) lat[k][j * ln + i] = tmp[k];
    }
    const canvas = document.createElement("canvas");
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(n, n);
    const buf = new Uint32Array(img.data.buffer);
    const kind = new Uint8Array(n * n); // 0 ground 1 liquid/other
    const regionOf = new Uint8Array(n * n);
    const sm = {}, o = {};
    const s = this.seed;
    // a Titan's lair is marked only by a rune-circle worn into the ground
    let lair = null;
    for (let ri = 0; ri < REGIONS.length; ri++) {
      const lx = REGIONS[ri].lair[0] * CONFIG.tile, ly = REGIONS[ri].lair[1] * CONFIG.tile;
      if (lx > x0 - 230 && lx < x0 + CP + 230 && ly > y0 - 230 && ly < y0 + CP + 230) lair = { x: lx, y: ly, ri };
    }
    for (let ty = 0; ty < n; ty++) {
      const fy = ty / step, j = fy | 0, v = fy - j;
      for (let tx = 0; tx < n; tx++) {
        const fx = tx / step, i = fx | 0, u = fx - i;
        const i00 = j * ln + i, i10 = i00 + 1, i01 = i00 + ln, i11 = i01 + 1;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
        for (const k of keys) { const L = lat[k]; sm[k] = L[i00] * w00 + L[i10] * w10 + L[i01] * w01 + L[i11] * w11; }
        const wx = x0 + tx * tex + 1, wy = y0 + ty * tex + 1;
        this.resolve(wx, wy, sm, o);
        const gx = (wx / tex) | 0, gy = (wy / tex) | 0;
        const h = hash2(gx, gy, s + 30);
        // dithered region blend along borders
        let ri = o.region;
        if (o.edge < 90 && h < 0.5 * (1 - o.edge / 90)) ri = o.region2;
        const id = REGIONS[ri].id, P = this.palInts[id];
        let col;
        const idx = ty * n + tx;
        regionOf[idx] = ri;
        if (o.ocean) {
          const d = -o.coast;
          const band = d < 0.035 ? -1 : clamp(((0.5 - d * 1.6) * 4 + (h - 0.5) * 0.9) | 0, 0, 3);
          col = band < 0 ? this.surfInt : this.oceanInts[band];
          kind[idx] = 1;
        } else if (o.coast < 0.05 && !o.barrier) {
          col = this.beachInts[h < 0.5 ? 0 : 1]; kind[idx] = 1;
        } else if (o.barrier === 1) {
          col = o.bt < 0.1 ? this.surfInt : this.riverInts[clamp((3.6 - o.bt * 4.2 + (h - 0.5) * 0.9) | 0, 0, 3)]; kind[idx] = 1;
        } else if (o.barrier === 2) {
          // a rock ridge: dark at its foot, lit along the crest, split by cracks
          let k = (o.bt * 4.6 + (h - 0.5) * 1.5 + (vnoise(wx / 14, wy / 9, s + 33) - 0.5) * 2.2) | 0;
          if (hash2(gx >> 2, gy >> 1, s + 34) < 0.1) k = 0;
          col = this.ridgeInts[clamp(k, 0, 4)]; kind[idx] = 1;
        } else if (o.barrier === 3) {
          col = o.bt < 0.07 ? this.deepRim : this.deepInts[clamp((3.4 - o.bt * 5 + (h - 0.5) * 0.8) | 0, 0, 3)];
          if (o.bt > 0.4 && hash2(gx, gy, s + 35) < 0.004) col = this.deepRim;
          kind[idx] = 1;
        } else if (o.bank && !o.road) {
          const Pl = this.palInts[REGIONS[o.region].id];
          col = o.bank === 2 ? this.ridgeInts[h < 0.5 ? 1 : 2] : Pl.shore[h < 0.5 ? 0 : 1]; kind[idx] = 1;
        } else if (o.liquid) {
          const Pl = this.palInts[REGIONS[o.region].id];
          const d = o.depth;
          if (d < 0.012) col = Pl.foam;
          else col = Pl.water[clamp((3.4 - d * 22 + (h - 0.5) * 0.9) | 0, 0, 3)];
          if (REGIONS[o.region].id === "frost" && hash2((gx + gy) >> 1, (gx - gy) >> 3, s + 31) < 0.06) col = this.whiteInt;
          kind[idx] = 1;
        } else if (o.depth > -0.014 && !o.road) {
          const Pl = this.palInts[REGIONS[o.region].id];
          col = Pl.shore[h < 0.5 ? 0 : 1]; kind[idx] = 1;
        } else if (o.road) {
          const edge = o.roadD > 13;
          col = edge && h < 0.5 ? P.ground[1] : P.road[clamp((h * 3) | 0, 0, 2)];
          if (!edge && hash2(gx >> 1, gy >> 1, s + 32) < 0.05) col = P.road[0];
          kind[idx] = 1;
        } else {
          let n4 = sm.shadeN * 4.4 - 0.4 + (h - 0.5) * 0.95;
          if (sm.site < 270) n4 -= (lair ? 0.45 : 0.9) * clamp((270 - sm.site) / 110, 0, 1); // trampled earth at camp and lairs
          col = P.ground[clamp(n4 | 0, 0, 3)];
          if (lair) {
            const ldx = wx - lair.x, ldy = (wy - lair.y) * 1.08, d = Math.sqrt(ldx * ldx + ldy * ldy);
            let mark = Math.abs(d - 206) < 2.2 || Math.abs(d - 176) < 1.2 || Math.abs(d - 60) < 1.2;
            if (!mark && d > 183 && d < 199) {
              // glyphs: a mirrored 5x5 hashed sigil in each slot round the band
              const arc = ((Math.atan2(ldy, ldx) + Math.PI) / TAU) * 24, slot = arc | 0, u = ((arc - slot) * 10) | 0, vv = ((d - 183) / 3.2) | 0;
              if (u >= 2 && u <= 6) { const uu = u - 2, mu = uu > 2 ? 4 - uu : uu; mark = hash2(slot * 7 + mu, vv, lair.ri + 91) < 0.55; }
            }
            if (mark && h < 0.8) { col = this.runeInts[REGIONS[lair.ri].id]; kind[idx] = 1; }
          }
        }
        buf[idx] = col;
      }
    }
    ctx.putImageData(img, 0, 0);
    // ground stamps: one candidate per 8x8 texel cell
    for (let cyy = 0; cyy < n; cyy += 8) for (let cxx = 0; cxx < n; cxx += 8) {
      const gx = (x0 / tex + cxx) >> 3, gy = (y0 / tex + cyy) >> 3;
      const h = hash2(gx, gy, s + 40);
      if (h > 0.42) continue;
      const ox = cxx + ((hash2(gx, gy, s + 41) * 3) | 0), oy = cyy + ((hash2(gx, gy, s + 42) * 3) | 0);
      let ok = true;
      for (let yy = 0; yy < 5 && ok; yy++) for (let xx = 0; xx < 5; xx++) if (kind[(oy + yy) * n + ox + xx]) { ok = false; break; }
      if (!ok) continue;
      const art = BIOME_ART[REGIONS[regionOf[oy * n + ox]].id];
      const name = art.deco[(hash2(gx, gy, s + 43) * art.deco.length) | 0];
      if (name === "flower") {
        const c = FLOWER_COLS[(hash2(gx, gy, s + 44) * FLOWER_COLS.length) | 0];
        ctx.fillStyle = "#2f7434"; ctx.fillRect(ox + 1, oy + 2, 1, 2);
        ctx.fillStyle = c; ctx.fillRect(ox, oy + 1, 3, 1); ctx.fillRect(ox + 1, oy, 1, 3);
        ctx.fillStyle = "#ffe88a"; ctx.fillRect(ox + 1, oy + 1, 1, 1);
        continue;
      }
      for (const [dx, dy, c] of STAMPS[name]) {
        ctx.fillStyle = typeof c === "number" ? art.tuft[c] : c;
        ctx.fillRect(ox + dx, oy + dy, 1, 1);
      }
    }
    return this.hue ? this.hueShift(canvas) : canvas;
  },

  // draw the ground for the view; paints at most `budget` missing chunks per frame
  drawGround(ctx, view, budget) {
    const CP = this.chunkPx(), maxC = this.size / CP;
    const cx0 = Math.max(0, Math.floor(view.x0 / CP)), cx1 = Math.min(maxC - 1, Math.floor(view.x1 / CP));
    const cy0 = Math.max(0, Math.floor(view.y0 / CP)), cy1 = Math.min(maxC - 1, Math.floor(view.y1 / CP));
    let missing = false, drawn = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cy * 64 + cx;
      let ch = this.chunks.get(key);
      if (!ch) {
        if (budget > 0) { budget--; ch = { canvas: this.paintChunk(cx, cy), used: 0 }; this.chunks.set(key, ch); }
        else { missing = true; ctx.fillStyle = "#2a3a4a"; ctx.fillRect(cx * CP, cy * CP, CP, CP); continue; }
      }
      ch.used = performance.now(); drawn++;
      // overlap by a sliver so fractional zooms never show seams between chunks
      ctx.drawImage(ch.canvas, cx * CP, cy * CP, CP + 1, CP + 1);
    }
    // prefetch one ring beyond the view when idle
    if (budget > 0 && !missing) {
      outer: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= maxC || cy >= maxC) continue;
        const key = cy * 64 + cx;
        if (!this.chunks.has(key)) { this.chunks.set(key, { canvas: this.paintChunk(cx, cy), used: performance.now() }); break outer; }
      }
    }
    // Each chunk is a 256x256 canvas (256KB of backing store), so this cache is the biggest surface the
    // game holds. Keep it to a couple of screenfuls rather than a flat 140: the view can be 25 chunks or
    // 60 depending on zoom and monitor, and holding far more than that for no reason is what pushes a
    // loaded machine into dropping canvas backing stores (and blanking the world).
    const keep = Math.max(64, drawn * 2 + 12);
    if (this.chunks.size > keep) {
      const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.chunks.size - keep);
      for (const [k] of old) this.chunks.delete(k);   // least recently drawn first, so nothing on screen goes
    }
    return missing;
  },

  // animated glints on liquid tiles (water ripples, lava pulses, void motes)
  drawLiquidFx(ctx, view, time) {
    const T = CONFIG.tile;
    const tx0 = Math.max(0, (view.x0 / T) | 0), tx1 = Math.min(CONFIG.worldTiles - 1, (view.x1 / T) | 0);
    const ty0 = Math.max(0, (view.y0 / T) | 0), ty1 = Math.min(CONFIG.worldTiles - 1, (view.y1 / T) | 0);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const f = this.cells[(ty * 2) * this.cellN + tx * 2];
      if (!(f & F_WATER)) continue;
      const h = hash2(tx, ty, 77);
      if (h > 0.34) continue;
      const ph = (time * 0.55 + h * 9) % 1;
      if (ph > 0.6) continue;
      const id = (f & F_OCEAN) ? "meadow" : REGIONS[f & F_REGION].id;
      const liquid = BIOME_ART[id].liquid;
      const x = tx * T + 4 + h * 40 % 18 + ph * 8, y = ty * T + 6 + (h * 97 % 1) * 18;
      ctx.globalAlpha = Math.sin((ph / 0.6) * Math.PI) * 0.8;
      ctx.fillStyle = liquid === "lava" ? "#fff0a0" : liquid === "void" ? "#d080ff" : "#e8f6ff";
      ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, liquid === "lava" ? 4 : 8, 2);
      if (liquid !== "lava") ctx.fillRect(Math.round(x / 2) * 2 + 4, Math.round(y / 2) * 2 + 4, 6, 2);
    }
    ctx.globalAlpha = 1;
  },

  drawLairFx(ctx, view, time) {
    const T = CONFIG.tile;
    for (let ri = 0; ri < REGIONS.length; ri++) {
      const x = REGIONS[ri].lair[0] * T, y = REGIONS[ri].lair[1] * T;
      if (x < view.x0 - 260 || x > view.x1 + 260 || y < view.y0 - 260 || y > view.y1 + 260) continue;
      if (typeof Game !== "undefined" && Game.titansDefeated[ri]) continue;
      const awake = typeof Director !== "undefined" && Director.titans[ri] && Director.titans[ri].aggro;
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = RUNE_COL[REGIONS[ri].id];
      ctx.globalAlpha = (awake ? 0.3 : 0.1) + 0.08 * Math.sin(time * (awake ? 5 : 1.6)); ctx.lineWidth = awake ? 6 : 4;
      ctx.beginPath(); ctx.ellipse(x, y, 206, 206 / 1.08, 0, 0, TAU); ctx.stroke();
      if (awake) { ctx.setLineDash([10, 22]); ctx.lineDashOffset = -time * 40; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 191, 191 / 1.08, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
  },

  buildMinimap() {
    const N = CONFIG.worldTiles;
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const ctx = c.getContext("2d"), img = ctx.createImageData(N, N), buf = new Uint32Array(img.data.buffer);
    if (!this.palInts) this.buildPalInts();
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const f = this.cells[(ty * 2) * this.cellN + tx * 2];
      const P = this.palInts[REGIONS[f & F_REGION].id];
      let col = P.ground[2];
      if (f & F_OCEAN) col = this.oceanInts[1];
      else if (f & F_DEEP) col = this.deepInts[2];
      else if (f & F_RIDGE) col = this.ridgeInts[2];
      else if (f & (F_WATER | F_ICE)) col = P.water[1];
      else if (f & F_ROAD) col = P.road[1];
      else if (this.props[ty * N + tx]) col = P.ground[0];
      buf[ty * N + tx] = col;
    }
    ctx.putImageData(img, 0, 0);
    this.minimap = this.hue ? this.hueShift(c) : c;
  },
};
