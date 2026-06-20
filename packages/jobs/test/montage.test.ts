import { describe, it, expect, vi } from 'vitest';
import type { MontageWorker, VideoGenTask, MontageSpec } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { MontageJobHandler } from '../src/index';

const spec: MontageSpec = { scenes: [{ url: 'https://x/a.png', kind: 'image', durationSec: 3 }], aspectRatio: '16:9' };

function workerCompletingAfter(polls: number): MontageWorker {
  let n = 0;
  return {
    name: 'remotion', isAvailable: () => true,
    async render() { return { taskId: 'm1' }; },
    async getTask(taskId): Promise<VideoGenTask> {
      n += 1;
      if (n < polls) return { taskId, state: 'processing' };
      return { taskId, state: 'complete', videoUrl: 'http://m/out/m1.mp4' };
    },
  };
}
const noWait = async () => {};
const mp4Fetch = () => vi.fn(async (..._a: Parameters<typeof fetch>) => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }));

describe('MontageJobHandler', () => {
  it('renders → polls → downloads → stores → records a video asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const fetchFn = mp4Fetch();
    const handler = new MontageJobHandler({ worker: workerCompletingAfter(2), storage, assets, idGen: () => 'mv1', clock: () => 'T', fetchFn, wait: noWait, maxPolls: 5 });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'remotion', params: { spec } }, { id: 'j1', now: 'T' });
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('mv1');
    const asset = await assets.get('mv1');
    expect(asset?.type).toBe('video');
    expect(asset?.storageKey).toBe('projects/p1/videos/mv1.mp4');
    expect(fetchFn).toHaveBeenCalledWith('http://m/out/m1.mp4');
  });

  it('throws when the spec has no scenes', async () => {
    const handler = new MontageJobHandler({ worker: workerCompletingAfter(1), storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'mv1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'remotion', params: { spec: { scenes: [], aspectRatio: '16:9' } } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/scene/i);
  });

  it('throws when the worker reports failure', async () => {
    const worker: MontageWorker = { name: 'remotion', isAvailable: () => true, async render() { return { taskId: 'm1' }; }, async getTask(taskId) { return { taskId, state: 'failed' }; } };
    const handler = new MontageJobHandler({ worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'mv1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'remotion', params: { spec } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/fail/i);
  });

  it('throws if it never completes within maxPolls', async () => {
    const worker: MontageWorker = { name: 'remotion', isAvailable: () => true, async render() { return { taskId: 'm1' }; }, async getTask(taskId) { return { taskId, state: 'processing' }; } };
    const handler = new MontageJobHandler({ worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'mv1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait, maxPolls: 3 });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'remotion', params: { spec } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/did not complete/i);
  });
});
