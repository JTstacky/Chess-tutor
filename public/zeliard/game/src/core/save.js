// Save slots and settings in localStorage. Every access is guarded: private
// windows and blocked storage must never stop the game from running.
const PREFIX = 'beliards.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export const SLOTS = 3;
export function loadSlot(i) { return read(`save.${i}`, null); }
export function saveSlot(i, data) { return write(`save.${i}`, { ...data, savedAt: Date.now() }); }
export function deleteSlot(i) { try { localStorage.removeItem(`${PREFIX}save.${i}`); } catch { /* storage blocked */ } }
export function listSlots() { return Array.from({ length: SLOTS }, (_, i) => loadSlot(i)); }

// Back up every save slot to a .json file (for another browser or device).
export function exportSaves() {
  const data = { game: 'zeliard', version: 1, exportedAt: new Date().toISOString(), slots: listSlots() };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `zeliard-saves-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return data.slots.filter(Boolean).length;
}

// Load a backup made by exportSaves. Resolves to the number of knights restored.
export function importSaves() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const f = inp.files?.[0];
        if (!f) { resolve(0); return; }
        const data = JSON.parse(await f.text());
        if (!['zeliard', 'beliards'].includes(data.game) || !Array.isArray(data.slots)) throw new Error('That is not a Zeliard save file.');
        let n = 0;
        data.slots.slice(0, SLOTS).forEach((s, i) => { if (s && typeof s === 'object' && s.name) { write(`save.${i}`, s); n++; } });
        resolve(n);
      } catch (e) { reject(e); }
    };
    inp.click();
  });
}

export const settings = {
  data: read('settings', { music: 0.55, sfx: 0.8, speed: 1, name: '', controls: 'modern', showHitboxes: false }),
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; write('settings', this.data); },
};
