import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { ImageProviderRegistry } from '@forgecast/providers';
import { InMemoryJobRepo, InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { JobRunner, ImageJobHandler } from '../src/index';

describe('jobs integration', () => {
  it('runs an image job end-to-end through the runner', async () => {
    const registry = new ImageProviderRegistry();
    const provider: ImageProvider = {
      name: 'fal',
      isAvailable: () => true,
      async generateImage() {
        return { url: 'https://cdn/x.png' };
      },
    };
    registry.register(provider);

    const jobsRepo = new InMemoryJobRepo();
    const assets = new InMemoryAssetRepo();
    const storage = new InMemoryStorage();
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    let n = 0;

    const handler = new ImageJobHandler({
      registry,
      storage,
      assets,
      idGen: () => `a${++n}`,
      clock: () => 'T',
      fetchFn,
    });
    const runner = new JobRunner(jobsRepo, [handler]);

    await jobsRepo.create(
      newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'hi' } }, { id: 'j1', now: 'T' }),
    );
    const done = await runner.run('j1');

    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.resultAssetId).toBe('a1');

    const asset = await assets.get('a1');
    expect(asset?.projectId).toBe('p1');
    expect(storage.read(asset!.storageKey)).toBeDefined();
  });
});
