// Safari fallback: synchronous OPFS access handles work in dedicated workers.
let handle = null;
let position = 0;

self.onmessage = async ({ data }) => {
  const { id, command, path, chunk } = data;
  try {
    if (command === "open") {
      if (handle) throw Error("Another OPFS file is already open.");
      const parts = String(path).split("/");
      if (parts.some((part) => !part || part === "." || part === "..")) {
        throw Error("Unsafe OPFS path.");
      }
      let dir = await navigator.storage.getDirectory();
      for (const part of parts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
      handle = await (
        await dir.getFileHandle(parts.at(-1), { create: true })
      ).createSyncAccessHandle();
      try {
        handle.truncate(0);
      } catch (error) {
        handle.close();
        handle = null;
        throw error;
      }
      position = 0;
    } else if (command === "write") {
      if (!handle) throw Error("No OPFS file is open.");
      const bytes = new Uint8Array(chunk);
      for (let offset = 0; offset < bytes.length; ) {
        const count = handle.write(bytes.subarray(offset), { at: position });
        if (!Number.isSafeInteger(count) || count <= 0)
          throw Error("OPFS write stalled.");
        offset += count;
        position += count;
      }
    } else if (command === "close") {
      if (!handle) throw Error("No OPFS file is open.");
      try {
        handle.flush();
      } finally {
        handle.close();
        handle = null;
      }
    } else {
      throw Error(`Unknown OPFS command: ${command}`);
    }
    self.postMessage({ id, ok: true });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
