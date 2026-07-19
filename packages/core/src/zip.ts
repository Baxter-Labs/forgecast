/**
 * Minimal ZIP writer (STORE method, no compression) — enough to bundle a
 * handful of reference images into the archive LoRA-training endpoints expect.
 * Pure and dependency-free so it runs on Node and Cloudflare Workers alike.
 */

export interface ZipEntry {
  /** Path inside the archive (forward slashes). */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/** Build an uncompressed ZIP archive from the given entries. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = chunks.length;
    // Local file header: signature, version 2.0, no flags, method 0 (store),
    // zeroed DOS time/date, CRC, sizes, name length, no extra field.
    chunks.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(name.length), ...u16(0),
    );
    for (const b of name) chunks.push(b);
    for (const b of entry.data) chunks.push(b);
    // Matching central directory record (version made-by 2.0, external attrs 0).
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    );
    for (const b of name) central.push(b);
  }

  const centralOffset = chunks.length;
  for (const b of central) chunks.push(b);
  // End of central directory: single disk, entry counts, size + offset of the directory.
  chunks.push(
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(centralOffset), ...u16(0),
  );
  return new Uint8Array(chunks);
}
