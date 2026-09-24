"use strict";
// assets.js — lazy sprite-frame loading. A species' frames are only requested
// the first time one of them is on screen, so boot stays instant even though
// the library is ~2000 PNGs.

const FRAME_COUNTS = { walk: 6, idle: 4, attack: 4 };
const RANGER_SETS = { brute: ["idle", "walk"], grenadier: ["walk"], rifleman: ["idle", "walk"], striker: ["idle", "walk"] };
const PLAYER_SETS = ["attack", "attack_down", "attack_up", "idle", "idle_down", "idle_downdiag", "idle_up", "idle_updiag",
  "walk", "walk_down", "walk_downdiag", "walk_up", "walk_updiag"];

const Sprites = {
  entries: {},
  tintCache: new Map(),   // small LRU of tinted frames; see the note on tinted()

  load(key, base, sets) {
    const e = { sets: {}, ready: false };
    this.entries[key] = e;
    for (const set of sets) {
      const n = FRAME_COUNTS[set.split("_")[0]] || 4;
      const arr = [];
      for (let i = 0; i < n; i++) {
        const img = new Image();
        img.src = base + set + "_" + String(i).padStart(2, "0") + ".png";
        arr.push(img);
      }
      e.sets[set] = arr;
    }
    return e;
  },

  // hybrids (sp.art) wear one parent's frames; the second element shows as a tint
  beast(sp) { const id = sp.art || sp.id; return this.entries[id] || this.load(id, "assets/sprites/frames/beasts/" + id + "_", sp.sets); },
  ranger(kind) { return this.entries["r:" + kind] || this.load("r:" + kind, "assets/sprites/frames/rangers/" + kind + "_", RANGER_SETS[kind]); },
  player() { return this.entries.player || this.load("player", "assets/sprites/frames/player/", PLAYER_SETS); },

  // Pick a loaded frame. dir: "side" | "down" | "up" | "downdiag" | "updiag".
  // Falls back action -> walk -> idle and facing -> side, so partial art always draws.
  frame(entry, action, dir, t) {
    const tryOrder = [action, "walk", "idle"];
    for (const a of tryOrder) {
      const names = dir === "side" ? [a] : [a + "_" + dir, dir.endsWith("diag") ? a + "_" + dir.replace("diag", "") : null, a];
      for (const name of names) {
        if (!name) continue;
        const set = entry.sets[name];
        if (!set) continue;
        const img = set[Math.floor(t * set.length) % set.length] || set[0];
        if (img && img.complete && img.naturalWidth) return { img, mirrored: name === a };
      }
    }
    return null;
  },

  // A flat-coloured copy of a frame (hit flash, status, hybrid wash, ghostly enemies).
  // The result is always EXACTLY the size of the source frame, because most callers hand it straight to
  // the five-argument drawImage(img, x, y, w, h), which stretches the whole surface: a shared scratch
  // canvas sized to the largest sprite ever tinted made every small sprite render shrunk into the corner
  // of its own box. So: one canvas per image+colour+alpha, in a small LRU that drops the least recently
  // used entry one at a time (never a mass clear — that used to rebuild hundreds of canvases at once).
  tinted(img, color, alpha) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return img;
    const key = img.src + "|" + color + "|" + alpha;
    let c = this.tintCache.get(key);
    if (c) { this.tintCache.delete(key); this.tintCache.set(key, c); return c; }   // touch: most recent last
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-atop";
    x.globalAlpha = alpha;
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    while (this.tintCache.size >= 160) this.tintCache.delete(this.tintCache.keys().next().value);
    this.tintCache.set(key, c);
    return c;
  },

  // a portrait for DOM panels; hybrids get the same colour wash they wear in the field
  thumbHtml(sp, cls, titan) {
    const url = titan && TitanAnim.has(sp) ? TitanAnim.url(sp, "S") : this.thumbUrl(sp);
    return '<span class="thumb ' + (cls || "") + '"><img src="' + url + '" alt="">' + (sp.tint ? '<i style="background:' + sp.tint + ";-webkit-mask-image:url(" + url + ");mask-image:url(" + url + ')"></i>' : "") + "</span>";
  },

  thumbUrl(sp) {
    const set = sp.sets.indexOf("idle_down") >= 0 ? "idle_down" : sp.sets.indexOf("idle") >= 0 ? "idle" : "walk";
    return "assets/sprites/frames/beasts/" + (sp.art || sp.id) + "_" + set + "_00.png";
  },
};
