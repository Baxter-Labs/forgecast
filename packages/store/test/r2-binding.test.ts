import { describe, it, expect } from 'vitest';
import { R2BucketStorage, type R2BucketLike } from '../src/r2/binding';

function mockBucket(): R2BucketLike & { store: Map<string, { bytes: Uint8Array; contentType?: string }> } {
  const store = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    store,
    async put(key, value, options) {
      store.set(key, { bytes: value, contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const o = store.get(key);
      if (!o) return null;
      return {
        async arrayBuffer() {
          const b = new Uint8Array(o.bytes.byteLength);
          b.set(o.bytes);
          return b.buffer;
        },
        httpMetadata: o.contentType ? { contentType: o.contentType } : undefined,
      };
    },
  };
}

describe('R2BucketStorage', () => {
  it('puts and gets bytes round-trip with the content type', async () => {
    const bucket = mockBucket();
    const s = new R2BucketStorage({ bucket });
    const stored = await s.put('projects/p/images/x.png', new Uint8Array([1, 2, 3, 4]), 'image/png');
    expect(stored.key).toBe('projects/p/images/x.png');
    const got = await s.get('projects/p/images/x.png');
    expect(got?.contentType).toBe('image/png');
    expect(Array.from(got!.data)).toEqual([1, 2, 3, 4]);
  });

  it('returns null for a missing key', async () => {
    const s = new R2BucketStorage({ bucket: mockBucket() });
    expect(await s.get('nope.png')).toBeNull();
  });

  it('derives the content type from the extension when the object has none', async () => {
    const bucket = mockBucket();
    await bucket.put('a/b.mp4', new Uint8Array([9]));
    const s = new R2BucketStorage({ bucket });
    expect((await s.get('a/b.mp4'))?.contentType).toBe('video/mp4');
  });

  it('url() uses the public base when set', () => {
    const s = new R2BucketStorage({ bucket: mockBucket(), publicBaseUrl: 'https://cdn.example.com/' });
    expect(s.url('x/y.png')).toBe('https://cdn.example.com/x/y.png');
  });
});
