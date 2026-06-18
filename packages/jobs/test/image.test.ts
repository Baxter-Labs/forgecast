import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { ImageProviderRegistry } from '@forgecast/providers';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { ImageJobHandler } from '../src/index';

function fakeProvider(name = 'fal'): ImageProvider {
  return {
    name,
    isAvailable: () => true,
    async generateImage(input) {
      return { url: `https://cdn/${encodeURIComponent(input.prompt)}.png` };
    },
  };
}

function pngResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

describe('ImageJobHandler', () => {
  it('generates, downloads, stores, and records an asset', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider('fal'));
    const storage = new InMemoryStorage({ baseUrl: 'mem://f' });
    const assets = new InMemoryAssetRepo();
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => pngResponse());
    let n = 0;

    const handler = new ImageJobHandler({
      registry,
      storage,
      assets,
      idGen: () => `a${++n}`,
      clock: () => 'T',
      fetchFn,
    });

    const job = newJob(
      { projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'a fox', width: 512, height: 512 } },
      { id: 'j1', now: 'T' },
    );
    const progress: number[] = [];
    const outcome = await handler.run(job, async (p) => { progress.push(p); });

    expect(outcome.assetId).toBe('a1');
    const asset = await assets.get('a1');
    expect(asset?.type).toBe('image');
    expect(asset?.provider).toBe('fal');
    expect(asset?.storageKey).toBe('projects/p1/images/a1.png');
    expect(storage.read('projects/p1/images/a1.png')?.contentType).toBe('image/png');
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/a%20fox.png');
    expect(progress.length).toBeGreaterThan(0);
  });

  it('throws when the job has no prompt', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider());
    const handler = new ImageJobHandler({
      registry,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => pngResponse()),
    });
    const job = newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/prompt/i);
  });

  it('throws when the image download fails', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider());
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('nope', { status: 404 }));
    const handler = new ImageJobHandler({
      registry,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn,
    });
    const job = newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/download/i);
  });
});
