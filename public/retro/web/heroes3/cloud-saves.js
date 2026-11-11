// Solo saves follow the player between devices: the Saves folder is packed (RSV1, as Retro Archive's
// docs/cloud-saves.md, but with case kept because VCMI paths are case-sensitive), gzipped and kept in the
// site's retro save slot heroes3/auto (full accounts only).
//
// Each sync is a three-way merge of this device, the cloud copy and the last copy both agreed on, file by
// file, so a save is never lost: a save changed on one side only takes that side; a save changed on both
// is kept twice ("name (other device).vsgm1"). Nothing on the device is ever deleted by a sync. A save the
// player deleted here leaves the cloud copy as well; a save deleted on another device stays here.
// Online-match files (TurnPass-*, OnlineCheckpoint*) never travel; the relay owns them.

export const GAME_ID = 'heroes3';
export const MAX_UPLOAD = 15 * 1024 * 1024;    // server allows 16 MB per slot; keep headroom
const MAGIC = [0x52, 0x53, 0x56, 0x31];        // 'RSV1'
const STATE_KEY = 'h3.cloudSaves';

const safeFolder = /^[^\\/\x00-\x1f\x7f]+$/;
export function isSyncedSave(path) {
  if (typeof path !== 'string' || path.length > 300) return false;
  const parts = path.split('/');
  if (parts.length > 9 || parts.some(p => !p || p === '.' || p === '..' || !safeFolder.test(p))) return false;
  const name = parts.at(-1);
  return /\.vsgm1$/i.test(name) && !/^(TurnPass-|OnlineCheckpoint)/i.test(name);
}

export function pack(files) {
  const encoder = new TextEncoder();
  const entries = [...files].map(f => ({ path: f.path, bytes: new Uint8Array(f.bytes), mtime: f.mtime ?? 0 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const names = entries.map(e => encoder.encode(e.path));
  let size = 8;
  entries.forEach((e, i) => { size += 14 + names[i].length + e.bytes.length; });
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(4, entries.length, true);
  let p = 8;
  entries.forEach((e, i) => {
    view.setUint16(p, names[i].length, true); p += 2;
    out.set(names[i], p); p += names[i].length;
    view.setUint32(p, e.bytes.length, true); p += 4;
    view.setFloat64(p, e.mtime, true); p += 8;
  });
  for (const e of entries) { out.set(e.bytes, p); p += e.bytes.length; }
  return out;
}

export function unpack(bytes) {
  const data = new Uint8Array(bytes), view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 8 || MAGIC.some((v, i) => data[i] !== v)) throw Error('The online save is not a save pack.');
  const count = view.getUint32(4, true);
  if (count > 10000) throw Error('The online save is damaged.');
  const decoder = new TextDecoder(), headers = [];
  let p = 8;
  for (let i = 0; i < count; i++) {
    if (p + 2 > data.length) throw Error('The online save is damaged.');
    const n = view.getUint16(p, true); p += 2;
    if (p + n + 12 > data.length) throw Error('The online save is damaged.');
    const path = decoder.decode(data.subarray(p, p + n)); p += n;
    const size = view.getUint32(p, true); p += 4;
    const mtime = view.getFloat64(p, true); p += 8;
    headers.push({ path, size, mtime });
  }
  const files = [];
  for (const h of headers) {
    if (p + h.size > data.length) throw Error('The online save is damaged.');
    if (isSyncedSave(h.path)) files.push({ path: h.path, bytes: data.slice(p, p + h.size), mtime: h.mtime });
    p += h.size;
  }
  return files;
}

async function transform(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
export const gzip = bytes => transform(bytes, new CompressionStream('gzip'));
export const gunzip = bytes => transform(bytes, new DecompressionStream('gzip'));
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}

function freeName(path, taken) {
  const stem = path.replace(/\.vsgm1$/i, '');
  for (let n = 1; n < 1000; n++) {
    const candidate = `${stem} (other device${n > 1 ? ' ' + n : ''}).vsgm1`;
    if (!taken.has(candidate)) return candidate;
  }
  throw Error('Too many copies of this save.');
}

// local, remote: Map path -> {sha, bytes, mtime}; base: {path: {sha, mtime}} from the last agreed sync.
// Returns the files the cloud should hold and the files to write on this device.
export function merge(local, remote, base = {}) {
  const result = new Map(), writes = [], conflicts = [];
  const taken = new Set([...local.keys(), ...remote.keys()]);
  const inRemote = new Set([...remote.values()].map(f => f.sha)), inLocal = new Set([...local.values()].map(f => f.sha));
  for (const path of [...taken].sort()) {
    const l = local.get(path), r = remote.get(path), b = base[path];
    if (l && r && l.sha === r.sha) result.set(path, { ...l, mtime: Math.max(l.mtime, r.mtime) });
    else if (l && !r) result.set(path, l);                       // new here, or deleted elsewhere: keep it
    else if (!l && r) {
      if (b && b.sha === r.sha) continue;                         // deleted here since the last sync
      result.set(path, r); writes.push({ path, bytes: r.bytes });
    } else if (b && b.sha === l.sha) { result.set(path, r); writes.push({ path, bytes: r.bytes }); }
    else if (b && b.sha === r.sha) result.set(path, l);
    // A version already kept under another name (an earlier "other device" copy) is not copied again.
    else if (inRemote.has(l.sha)) { result.set(path, r); writes.push({ path, bytes: r.bytes }); }
    else if (inLocal.has(r.sha)) result.set(path, l);
    else {                                                         // changed on both sides: keep both
      const other = freeName(path, taken);
      taken.add(other);
      result.set(path, l);
      result.set(other, { ...r });
      writes.push({ path: other, bytes: r.bytes });
      conflicts.push(other);
    }
  }
  return { result, writes, conflicts };
}

// Keeps the newest saves when the whole folder would not fit in one online slot.
async function fitted(result) {
  const files = [...result.entries()].map(([path, f]) => ({ path, ...f })).sort((a, b) => b.mtime - a.mtime);
  let raw = pack(files), body = await gzip(raw);
  const left = [];
  while (body.length > MAX_UPLOAD && files.length) {
    left.push(files.pop().path);
    raw = pack(files); body = await gzip(raw);
  }
  return { files, raw, body, left };
}

export function readCredentials(storage = globalThis.localStorage) {
  try {
    const token = storage.getItem('evonline.session');
    if (!token || storage.getItem('evonline.tier') !== 'full' || storage.getItem('tenggames.kind') === 'guest') return null;
    return { token, profile: storage.getItem('tenggames.profileId') || storage.getItem('evonline.user') || '',
      device: (storage.getItem('tenggames.device') || '').slice(0, 40) };
  } catch { return null; }
}

export function cloudApi({ base, token, device = '', fetchImpl = globalThis.fetch }) {
  const url = `${base.replace(/\/$/, '')}/api/retro/saves/${GAME_ID}/auto`;
  const auth = { Authorization: `Bearer ${token}` };
  const failure = async (response, what) => {
    let message = '';
    try { message = (await response.json()).error ?? ''; } catch {}
    const error = Error(message || `${what} (${response.status})`);
    error.status = response.status;
    return error;
  };
  // A network failure (offline, server down) comes back from fetch as a bare "Failed to fetch".
  const send = async (...args) => {
    try { return await fetchImpl(...args); }
    catch { const error = Error('Online saves could not be reached.'); error.offline = true; throw error; }
  };
  return {
    async get() {
      const response = await send(url, { headers: auth, cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) throw await failure(response, 'Online saves unavailable');
      return { rev: Number(response.headers.get('X-Rev')), sha256: response.headers.get('X-Sha256'),
        body: new Uint8Array(await response.arrayBuffer()) };
    },
    async put({ body, rev, sha256: hash, rawBytes, files }) {
      const response = await send(url, { method: 'PUT', body, headers: { ...auth,
        'Content-Type': 'application/octet-stream', 'X-Rev': String(rev), 'X-Sha256': hash,
        'X-Raw-Bytes': String(rawBytes), 'X-Files': String(files), 'X-Device': device, 'X-Emulator': 'vcmi@1.7.5' } });
      if (response.status === 409) return { conflict: true };
      if (!response.ok) throw await failure(response, 'Online saves unavailable');
      return { rev: (await response.json()).rev };
    },
  };
}

export function localState(storage = globalThis.localStorage) {
  return {
    get() { try { return JSON.parse(storage.getItem(STATE_KEY)); } catch { return null; } },
    set(value) { storage.setItem(STATE_KEY, JSON.stringify(value)); },
  };
}

// files: {list() -> [{path, size, modified}], read(path) -> Uint8Array, write(path, bytes)}
export function createCloudSaves({ files, api, state, profile = '', onStatus = () => {} }) {
  let running = null, again = false, lastSignature = null, pendingSignature = null, timer = null;
  const signature = list => list.filter(f => isSyncedSave(f.path))
    .map(f => `${f.path}:${f.size}:${f.modified}`).sort().join('|');

  async function readLocal(base) {
    const out = new Map();
    for (const item of await files.list()) {
      if (!isSyncedSave(item.path)) continue;
      const bytes = await files.read(item.path), sha = await sha256(bytes);
      out.set(item.path, { sha, bytes, mtime: base[item.path]?.sha === sha ? base[item.path].mtime : item.modified });
    }
    return out;
  }
  async function readRemote() {
    const got = await api.get();
    if (!got) return { rev: 0, files: new Map() };
    const raw = await gunzip(got.body);
    if (got.sha256 && await sha256(raw) !== got.sha256) throw Error('The online save did not arrive intact.');
    const map = new Map();
    for (const f of unpack(raw)) map.set(f.path, { sha: await sha256(f.bytes), bytes: f.bytes, mtime: f.mtime });
    return { rev: got.rev, files: map };
  }

  async function once() {
    const saved = state.get();
    if (saved?.profile !== undefined && saved.profile !== profile)
      return { paused: true, message: 'Online saves are off here: the saves on this device belong to another profile.' };
    const base = saved?.files ?? {};
    let localChanged = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      // Read the slow network first so a save made during the download is included in the merge.
      const remote = await readRemote(), local = await readLocal(base);
      const { result, writes, conflicts } = merge(local, remote.files, base);
      // A VCMI save may finish after readLocal. Recheck each destination before
      // replacing it with the remote version, then merge both changes again.
      localChanged = false;
      for (const { path, bytes } of writes) {
        let current = null;
        if ((await files.list()).some(file => file.path === path)) {
          try { current = await sha256(await files.read(path)); }
          catch (error) { if (error.name !== 'NotFoundError') throw error; }
        }
        if (current !== (local.get(path)?.sha ?? null)) { localChanged = true; break; }
        await files.write(path, bytes);
      }
      if (localChanged) continue;
      // Remember the files represented by this upload, not newer saves written while it is in flight.
      const syncedSignature = signature(await files.list());
      const fit = await fitted(result);
      const synced = Object.fromEntries(fit.files.map(f => [f.path, { sha: f.sha, mtime: f.mtime }]));
      const same = remote.rev && fit.files.length === remote.files.size
        && fit.files.every(f => remote.files.get(f.path)?.sha === f.sha);
      let rev = remote.rev;
      if (!same && (fit.files.length || remote.rev)) {
        const put = await api.put({ body: fit.body, rev: remote.rev, sha256: await sha256(fit.raw),
          rawBytes: fit.raw.length, files: fit.files.length });
        if (put.conflict) continue;   // another device saved meanwhile: merge again with its copy
        rev = put.rev;
      }
      state.set({ profile, rev, files: synced });
      lastSignature = syncedSignature;
      return { rev, uploaded: !same && (fit.files.length > 0 || remote.rev > 0), wrote: writes.map(w => w.path), conflicts, left: fit.left };
    }
    throw Error(localChanged ? 'Saves kept changing during sync.' : 'Online saves kept changing on another device.');
  }

  function describe(outcome) {
    if (outcome.paused) return outcome.message;
    const parts = [];
    if (outcome.wrote.length) parts.push(`${outcome.wrote.length} save${outcome.wrote.length === 1 ? '' : 's'} from your other devices`);
    if (outcome.conflicts.length) parts.push(`kept both copies of ${outcome.conflicts.length} save${outcome.conflicts.length === 1 ? '' : 's'} changed on two devices`);
    if (outcome.left.length) parts.push(`${outcome.left.length} oldest save${outcome.left.length === 1 ? '' : 's'} kept on this device only (online space is full)`);
    return parts.length ? `Online saves: ${parts.join('; ')}.` : outcome.uploaded ? 'Saved online.' : '';
  }

  async function sync() {
    if (running) { again = true; return running; }
    running = (async () => {
      let outcome;
      try {
        do { again = false; outcome = await once(); } while (again && !outcome.paused);
        const text = describe(outcome);
        if (text) onStatus(text, outcome);
        return outcome;
      } catch (error) {
        const reason = String(error.message || 'Online saves are unavailable').trim();
        onStatus(`${/[.!?]$/.test(reason) ? reason : `${reason}.`} Your saves are safe on this device.`, { error });
        return { error };
      } finally { running = null; }
    })();
    return running;
  }

  // Uploads once a changed save has stopped changing for one poll (VCMI writes a save in pieces).
  async function poll() {
    try {
      const now = signature(await files.list());
      if (now === lastSignature) { pendingSignature = null; return; }
      if (now !== pendingSignature) { pendingSignature = now; return; }
      pendingSignature = null;
      await sync();
    } catch {}
  }
  return {
    sync,
    poll,
    watch(ms = 5000) { clearInterval(timer); timer = setInterval(poll, ms); },
    stop() { clearInterval(timer); timer = null; },
  };
}
