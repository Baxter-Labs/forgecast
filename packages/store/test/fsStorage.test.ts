import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { FilesystemStorage } from '../src/index';

describe('FilesystemStorage', () => {
  it('stores and reads bytes, infers content type, and persists across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-fs-'));
    try {
      const a = new FilesystemStorage({ root: dir, baseUrl: 'http://x' });
      const stored = await a.put('projects/p1/images/a1.png', new Uint8Array([1, 2, 3]), 'image/png');
      expect(stored).toEqual({ key: 'projects/p1/images/a1.png', url: 'http://x/projects/p1/images/a1.png' });

      const b = new FilesystemStorage({ root: dir });
      const got = await b.get('projects/p1/images/a1.png');
      expect(got?.contentType).toBe('image/png');
      expect(Array.from(got?.data ?? [])).toEqual([1, 2, 3]);

      expect(await b.get('missing.png')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects keys containing ".."', async () => {
    const s = new FilesystemStorage({ root: '/tmp/forgecast-test' });
    await expect(s.get('../escape.png')).rejects.toThrowError(/invalid storage key/i);
  });
});
