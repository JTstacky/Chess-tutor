// ZIP central-directory reader. Only small directory records are buffered; file bodies stream.
const decoder = new TextDecoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function safeName(name) {
  const normalized = name.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return (
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:/.test(normalized) &&
    !normalized.includes("\0") &&
    !parts.some(
      (part, index) =>
        part === ".." || part === "." || (!part && index !== parts.length - 1),
    )
  );
}
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => {
  const n = v.getBigUint64(o, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("ZIP entry is too large.");
  return Number(n);
};
async function bytes(file, start, length) {
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}
export async function* zipEntries(file) {
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await bytes(file, tailStart, file.size - tailStart);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw Error("This is not a readable ZIP file.");
  if (u16(tail, eocd + 4) || u16(tail, eocd + 6))
    throw Error("Multi-disk ZIP files are not supported.");
  let count = u16(tail, eocd + 10),
    directorySize = u32(tail, eocd + 12),
    directoryOffset = u32(tail, eocd + 16);
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    const locator = eocd - 20;
    if (locator < 0 || u32(tail, locator) !== 0x07064b50)
      throw Error("Invalid ZIP64 directory.");
    const zip64Offset = u64(tail, locator + 8);
    const z = await bytes(file, zip64Offset, 56);
    if (u32(z, 0) !== 0x06064b50) throw Error("Invalid ZIP64 directory.");
    count = u64(z, 32);
    directorySize = u64(z, 40);
    directoryOffset = u64(z, 48);
  }
  let cursor = directoryOffset;
  if (cursor > file.size || directorySize > file.size - cursor)
    throw Error("ZIP directory outside file.");
  for (let i = 0; i < count; i++) {
    const header = await bytes(file, cursor, 46);
    if (u32(header, 0) !== 0x02014b50) throw Error("Invalid ZIP directory.");
    const flags = u16(header, 8),
      method = u16(header, 10);
    if (flags & 1) throw Error("Encrypted ZIP files are not supported.");
    if (method !== 0 && method !== 8)
      throw Error(`ZIP compression method ${method} is not supported.`);
    const nameLength = u16(header, 28),
      extraLength = u16(header, 30),
      commentLength = u16(header, 32);
    const record = await bytes(file, cursor + 46, nameLength + extraLength);
    const name = decoder.decode(
      new Uint8Array(record.buffer, record.byteOffset, nameLength),
    );
    if (!safeName(name)) throw Error(`Unsafe ZIP path: ${name}`);
    const expectedCrc = u32(header, 16);
    let size = u32(header, 24),
      compressedSize = u32(header, 20),
      localOffset = u32(header, 42);
    let p = nameLength;
    while (p + 4 <= record.byteLength) {
      const kind = u16(record, p),
        length = u16(record, p + 2);
      p += 4;
      if (kind === 1) {
        let q = p;
        if (size === 0xffffffff) {
          size = u64(record, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(record, q);
          q += 8;
        }
        if (localOffset === 0xffffffff) localOffset = u64(record, q);
      }
      p += length;
    }
    if (method === 0 && size !== compressedSize)
      throw Error("Invalid stored ZIP entry size.");
    if (name && !name.endsWith("/")) {
      const local = await bytes(file, localOffset, 30);
      if (u32(local, 0) !== 0x04034b50)
        throw Error("Invalid ZIP entry header.");
      const start = localOffset + 30 + u16(local, 26) + u16(local, 28);
      if (start > file.size || compressedSize > file.size - start)
        throw Error("ZIP entry outside file.");
      yield {
        name,
        size,
        stream() {
          const compressed = file.slice(start, start + compressedSize).stream();
          const plain =
            method === 8
              ? compressed.pipeThrough(new DecompressionStream("deflate-raw"))
              : compressed;
          let written = 0;
          let crc = 0xffffffff;
          return plain.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                written += chunk.byteLength;
                if (written > size)
                  throw Error(`ZIP entry exceeds declared size: ${name}`);
                for (const byte of chunk)
                  crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
                controller.enqueue(chunk);
              },
              flush() {
                if (written !== size)
                  throw Error(`ZIP entry is truncated: ${name}`);
                if (~crc >>> 0 !== expectedCrc)
                  throw Error(`ZIP entry checksum mismatch: ${name}`);
              },
            }),
          );
        },
      };
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
}
