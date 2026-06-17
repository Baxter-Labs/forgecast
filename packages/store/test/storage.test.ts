import { describe, it, expect } from 'vitest';
import { InMemoryStorage } from '../src/index';

describe('InMemoryStorage', () => {
  it('stores bytes and returns a url derived from the key', async () => {
    const s = new InMemoryStorage({ baseUrl: 'mem://forgecast' });
    const obj = await s.put('img/1.png', new Uint8Array([1, 2, 3]), 'image/png');
    expect(obj).toEqual({ key: 'img/1.png', url: 'mem://forgecast/img/1.png' });
    expect(s.url('img/1.png')).toBe('mem://forgecast/img/1.png');
  });

  it('reads back stored bytes and content type via the test helper', async () => {
    const s = new InMemoryStorage();
    await s.put('a.txt', new Uint8Array([65]), 'text/plain');
    expect(s.read('a.txt')).toEqual({ data: new Uint8Array([65]), contentType: 'text/plain' });
    expect(s.read('missing')).toBeUndefined();
  });

  it('strips a trailing slash from baseUrl', async () => {
    const s = new InMemoryStorage({ baseUrl: 'mem://x/' });
    expect(s.url('k')).toBe('mem://x/k');
  });
});
