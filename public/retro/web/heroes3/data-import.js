// NO network request may carry game data; files only go File → OPFS.
import { zipEntries } from "./unzip.js";

const required = [
  "H3bitmap.lod",
  "H3sprite.lod",
  "H3ab_bmp.lod",
  "H3ab_spr.lod",
  "Heroes3.snd",
  "VIDEO.VID",
];
const recommended = [
  "H3ab_ahd.snd",
  "H3ab_ahd.vid",
  "Heroes3.vid",
  "Mp3 folder",
  "Maps",
];
const canonical = [
  ...required,
  "h3abp_bm.lod",
  "h3abp_sp.lod",
  "H3pbitma.lod",
  "H3psprit.lod",
  "Heroes3-cd2.snd",
  ...recommended.slice(0, 3),
];
const names = new Map(canonical.map((n) => [n.toLowerCase(), n]));
const archive = /\.(lod|snd|vid|pak)$/i;
const map = /\.(h3m|h3c)$/i;
const music = /\.mp3$/i;
// Same characters the accounts Worker allows (commas: e.g. Maps/Good Witch, Bad Witch.h3m).
const safePath = /^(Data|Maps|Mp3)\/[\w .,+()'-]+$/i;
export function safeGamePath(path) {
  return safePath.test(path) && ![".", ".."].includes(path.split("/")[1]);
}
const formatMissing = (n) =>
  /H3ab_/i.test(n)
    ? `${n} (Armageddon's Blade / Shadow of Death data from the Complete edition is needed)`
    : n;

export function planImport(entries) {
  const plan = [],
    seen = new Set(),
    skippedNames = [];
  for (const entry of entries) {
    const name = String(entry.name ?? entry.path ?? "").replaceAll("\\", "/");
    const base = name.split("/").at(-1);
    const folder = archive.test(base)
      ? "Data"
      : map.test(base)
        ? "Maps"
        : music.test(base)
          ? "Mp3"
          : null;
    if (!folder) continue;
    const path = `${folder}/${folder === "Data" ? (names.get(base.toLowerCase()) ?? base) : base}`;
    if (name.split("/").includes("..") || !safeGamePath(path)) {
      skippedNames.push(name);
      continue;
    }
    // A CD2 folder can contain another Heroes3.snd. VCMI mounts it separately.
    let target = path;
    if (
      path.toLowerCase() === "data/heroes3.snd" &&
      seen.has(path.toLowerCase())
    ) {
      target = "Data/Heroes3-cd2.snd";
    }
    if (seen.has(target.toLowerCase())) continue;
    seen.add(target.toLowerCase());
    plan.push({ ...entry, path: target, size: Number(entry.size ?? 0) });
  }
  const dataNames = new Set(
    plan
      .filter((p) => p.path.startsWith("Data/"))
      .map((p) => p.path.slice(5).toLowerCase()),
  );
  return {
    plan,
    skippedNames,
    missingRequired: required
      .filter((n) => !dataNames.has(n.toLowerCase()))
      .map(formatMissing),
    missingRecommended: recommended.filter((n) =>
      n === "Mp3 folder"
        ? !plan.some((p) => p.path.startsWith("Mp3/"))
        : n === "Maps"
          ? !plan.some((p) => p.path.startsWith("Maps/"))
          : !dataNames.has(n.toLowerCase()),
    ),
  };
}

async function directory(path, create = true) {
  let dir = await navigator.storage.getDirectory();
  for (const part of path.split("/").filter(Boolean))
    dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}
async function shaPart(entry, staging) {
  const f = await (await directory(`${staging}/${entry.path.split("/")[0]}`))
    .getFileHandle(entry.path.split("/").at(-1))
    .then((h) => h.getFile());
  const first = new Uint8Array(await f.slice(0, 65536).arrayBuffer()),
    last = new Uint8Array(
      await f.slice(Math.max(0, f.size - 65536)).arrayBuffer(),
    );
  const prefix = new TextEncoder().encode(`${f.size}:`);
  const data = new Uint8Array(prefix.length + first.length + last.length);
  data.set(prefix);
  data.set(first, prefix.length);
  data.set(last, prefix.length + first.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
let worker,
  sequence = 0;
function workerCall(command, path, chunk) {
  worker ??= new Worker("./opfs-writer-worker.js", { type: "module" });
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const handler = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", handler);
      e.data.ok ? resolve() : reject(Error(e.data.error));
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ id, command, path, chunk });
  });
}
async function writeStream(path, stream, onChunk) {
  const parts = path.split("/"),
    name = parts.pop();
  const dir = await directory(parts.join("/"));
  const handle = await dir.getFileHandle(name, { create: true });
  if (handle.createWritable) {
    const writable = await handle.createWritable();
    await stream
      .pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            onChunk(chunk.byteLength);
            controller.enqueue(chunk);
          },
        }),
      )
      .pipeTo(writable);
  } else {
    await workerCall("open", path);
    try {
      for await (const chunk of stream) {
        await workerCall("write", path, chunk);
        onChunk(chunk.byteLength);
      }
    } finally {
      await workerCall("close", path);
    }
  }
}
async function copyTree(from, to) {
  const source = await directory(from, false);
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === "directory") {
      await copyTree(`${from}/${name}`, `${to}/${name}`);
    } else {
      const file = await handle.getFile();
      await writeStream(`${to}/${name}`, file.stream(), () => {});
    }
  }
}
async function removeIfPresent(root, name) {
  await root.removeEntry(name, { recursive: true }).catch((error) => {
    if (error.name !== "NotFoundError") throw error;
  });
}
export async function writeEntriesToOpfs(
  entries,
  { source = "import", onProgress = () => {} } = {},
) {
  const items = Array.from(entries),
    total = items.reduce((n, e) => n + Number(e.size || 0), 0);
  const storage = navigator.storage;
  if (!storage?.getDirectory)
    throw Error("This browser does not support private game storage.");
  for (const entry of items) {
    if (
      !safeGamePath(entry.path) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    )
      throw Error(`Unsafe data path: ${entry.path}`);
  }
  const root = await storage.getDirectory();
  // The previous copy is replaceable; do not charge it against the new import.
  let oldSize = 0;
  try {
    const old = await (
      await root.getDirectoryHandle("h3")
    ).getFileHandle("manifest.json");
    const previous = JSON.parse(await (await old.getFile()).text());
    oldSize = previous.files.reduce(
      (sum, file) => sum + Number(file.size || 0),
      0,
    );
  } catch (error) {
    if (error.name !== "NotFoundError") oldSize = 0;
  }
  const estimate = await storage.estimate();
  if (
    Number.isFinite(estimate.quota) &&
    estimate.quota - Math.max(0, (estimate.usage || 0) - oldSize) < total * 1.05
  ) {
    throw Error(
      "There is not enough browser storage for these files. Please free space and try again.",
    );
  }
  const persistent = await storage.persist?.().catch(() => false);
  const staging = `h3-import-${crypto.randomUUID()}`;
  let done = 0,
    count = 0;
  const files = [];
  try {
    for (const entry of items) {
      let written = 0;
      await writeStream(`${staging}/${entry.path}`, entry.stream(), (bytes) => {
        written += bytes;
        if (written > entry.size)
          throw Error(`File exceeds declared size: ${entry.path}`);
        done += bytes;
        onProgress({
          bytesDone: done,
          bytesTotal: total,
          fileCount: count,
          totalFiles: items.length,
          persistent,
        });
      });
      if (written !== entry.size)
        throw Error(`File is shorter than declared size: ${entry.path}`);
      count++;
      files.push({
        path: entry.path,
        size: entry.size,
        fp: await shaPart(entry, staging),
      });
      onProgress({
        bytesDone: done,
        bytesTotal: total,
        fileCount: count,
        totalFiles: items.length,
        persistent,
      });
    }
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      source,
      files,
    };
    await writeStream(
      `${staging}/manifest.json`,
      new Blob([JSON.stringify(manifest)]).stream(),
      () => {},
    );
    const staged = await root.getDirectoryHandle(staging);
    const backup = `h3-backup-${crypto.randomUUID()}`;
    let previous;
    try {
      previous = await root.getDirectoryHandle("h3");
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    if (typeof staged.move === "function") {
      if (previous) await previous.move(backup);
      try {
        await staged.move("h3");
      } catch (error) {
        if (previous) await (await root.getDirectoryHandle(backup)).move("h3");
        throw error;
      }
    } else {
      // Chrome without directory move: retain a full backup until replacement succeeds.
      if (previous) await copyTree("h3", backup);
      try {
        await removeIfPresent(root, "h3");
        await copyTree(staging, "h3");
      } catch (error) {
        await removeIfPresent(root, "h3");
        if (previous) await copyTree(backup, "h3");
        throw error;
      }
    }
    if (previous) await removeIfPresent(root, backup);
    return { manifest, persistent };
  } finally {
    await removeIfPresent(root, staging).catch(console.warn);
  }
}
async function importEntries(entries, options) {
  const result = planImport(entries);
  if (result.missingRequired.length)
    throw Error(`Missing required files: ${result.missingRequired.join(", ")}`);
  return {
    ...(await writeEntriesToOpfs(result.plan, options)),
    missingRecommended: result.missingRecommended,
    skippedNames: result.skippedNames,
  };
}
export async function importFromFiles(files, options = {}) {
  const entries = Array.from(files, (file) => ({
    name: file.webkitRelativePath || file.name,
    size: file.size,
    file,
    stream: () => file.stream(),
  }));
  return importEntries(entries, options);
}
export async function importFromZip(file, options = {}) {
  const entries = [];
  for await (const e of zipEntries(file)) entries.push(e);
  return importEntries(entries, options);
}
export async function importFromDirectoryHandle(handle, options = {}) {
  const entries = [];
  async function walk(dir, prefix = "") {
    for await (const [name, item] of dir.entries()) {
      if (item.kind === "directory") await walk(item, `${prefix}${name}/`);
      else {
        const file = await item.getFile();
        entries.push({
          name: `${prefix}${name}`,
          size: file.size,
          file,
          stream: () => file.stream(),
        });
      }
    }
  }
  for (const dir of Array.isArray(handle) ? handle : [handle]) await walk(dir);
  return importEntries(entries, options);
}
export async function importFromLegacyEntries(handles, options = {}) {
  const entries = [];
  const readFile = (handle) =>
    new Promise((resolve, reject) => handle.file(resolve, reject));
  async function walk(handle, prefix = "") {
    if (handle.isFile) {
      const file = await readFile(handle);
      entries.push({
        name: `${prefix}${file.name}`,
        size: file.size,
        file,
        stream: () => file.stream(),
      });
      return;
    }
    const reader = handle.createReader();
    while (true) {
      const batch = await new Promise((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${handle.name}/`);
    }
  }
  for (const handle of handles) await walk(handle);
  return importEntries(entries, options);
}
export async function readManifest() {
  try {
    const dir = await directory("h3", false);
    return JSON.parse(
      await (await (await dir.getFileHandle("manifest.json")).getFile()).text(),
    );
  } catch (e) {
    if (e.name === "NotFoundError") return null;
    throw e;
  }
}
export async function forgetGameData({ includeSaves = false } = {}) {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry("h3", { recursive: true }).catch((e) => {
    if (e.name !== "NotFoundError") throw e;
  });
  if (includeSaves)
    await root.removeEntry("userdata", { recursive: true }).catch((e) => {
      if (e.name !== "NotFoundError") throw e;
    });
}
export const importSource = {
  id: "local",
  label: "Import my files",
  isAvailable: () => true,
  load: ({ files, onProgress }) => importFromFiles(files, { onProgress }),
};
