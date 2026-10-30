// VCMI's XDG userDataPath is $XDG_DATA_HOME/vcmi; native saves are in Saves/.
// These files stay in OPFS. Reading a save is used for private turn transfer.
const saveExtension = /\.vsgm1$/i;
const safeName = /^[^\\/\x00-\x1f\x7f]+\.vsgm1$/i;
const safeFolder = /^[^\\/\x00-\x1f\x7f]+$/;

function checkedName(name) {
  if (typeof name !== 'string' || name.length > 160 || !safeName.test(name))
    throw Error('Choose a VCMI .vsgm1 save file.');
  return name;
}

function checkedPath(path) {
  if (typeof path !== 'string' || path.length > 300) throw Error('Invalid save path.');
  const parts = path.split('/');
  if (parts.length > 9 || parts.slice(0, -1).some(part =>
    !part || part === '.' || part === '..' || !safeFolder.test(part)))
    throw Error('Invalid save path.');
  checkedName(parts.at(-1));
  return parts;
}

async function saveDirectory(create = false) {
  let dir = await navigator.storage.getDirectory();
  for (const part of ['userdata', 'vcmi', 'Saves']) {
    try { dir = await dir.getDirectoryHandle(part, { create }); }
    catch (error) {
      if (!create && error.name === 'NotFoundError') return null;
      throw error;
    }
  }
  return dir;
}

async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; }
  catch (error) {
    if (error.name === 'NotFoundError') return false;
    throw error;
  }
}

export async function listSaves() {
  const dir = await saveDirectory();
  if (!dir) return [];
  const saves = [];
  async function walk(folder, prefix = '', depth = 0) {
    for await (const [name, handle] of folder.entries()) {
      if (handle.kind === 'directory') {
        if (depth < 8) await walk(handle, `${prefix}${name}/`, depth + 1);
      } else if (handle.kind === 'file' && saveExtension.test(name)) {
        const file = await handle.getFile();
        saves.push({ name: `${prefix}${name}`, size: file.size, modified: file.lastModified });
      }
    }
  }
  await walk(dir);
  return saves.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

export async function importSave(file) {
  const name = checkedName(file?.name);
  if (!file.size) throw Error('The save file is empty.');
  const dir = await saveDirectory(true);
  const stem = name.slice(0, -6);
  let target = name;
  for (let n = 2; await exists(dir, target); n++) {
    if (n > 999) throw Error('Too many copies of this save.');
    target = `${stem} (${n}).vsgm1`;
  }
  const handle = await dir.getFileHandle(target, { create: true });
  try {
    const output = await handle.createWritable();
    await file.stream().pipeTo(output);
  } catch (error) {
    await dir.removeEntry(target).catch(() => {});
    throw error;
  }
  return target;
}

export async function exportSave(name) {
  let dir = await saveDirectory();
  if (!dir) throw Error('No saved games are on this device.');
  const parts = checkedPath(name);
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  return (await dir.getFileHandle(parts.at(-1))).getFile();
}

export async function deleteSave(name) {
  let dir = await saveDirectory();
  if (!dir) throw Error('No saved games are on this device.');
  const parts = checkedPath(name);
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  await dir.removeEntry(parts.at(-1));
}
