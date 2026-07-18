import { describe, it, expect } from 'vitest';
import { zipStore, crc32 } from '../src/zip';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('handles empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zipStore', () => {
  it('produces a well-formed archive: local headers, central directory, EOCD', () => {
    const zip = zipStore([
      { name: 'a.png', data: bytes('AAA') },
      { name: 'b.jpg', data: bytes('BB') },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // First local file header signature.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // EOCD trailer: signature + total entry count.
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    // Central directory offset points at a central header signature.
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    // Stored (method 0) data is embedded verbatim.
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('a.png');
    expect(text).toContain('AAA');
    expect(text).toContain('b.jpg');
  });

  it('records the entry CRC in the local header', () => {
    const data = bytes('123456789');
    const zip = zipStore([{ name: 'x', data }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(view.getUint32(18, true)).toBe(data.length); // compressed size (stored)
    expect(view.getUint32(22, true)).toBe(data.length); // uncompressed size
  });

  it('handles an empty entry list', () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22); // bare EOCD
  });
});
