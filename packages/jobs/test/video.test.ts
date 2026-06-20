import { describe, it, expect, vi } from 'vitest';
import type { VideoProvider, VideoGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { VideoJobHandler } from '../src/index';

function providerCompletingAfter(polls: number): VideoProvider {
  let n = 0;
  return {
    name: 'pixverse', isAvailable: () => true,
    async create() { return { taskId: 'pv1' }; },
    async getTask(taskId): Promise<VideoGenTask> {
      n += 1;
      if (n < polls) return { taskId, state: 'processing' };
      return { taskId, state: 'complete', videoUrl: 'https://cdn/pv1.mp4' };
    },
  };
}
const noWait = async () => {};
const mp4Fetch = () => vi.fn(async (..._a: Parameters<typeof fetch>) =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }));

describe('VideoJobHandler', () => {
  it('creates → polls → downloads → stores → records a video asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const fetchFn = mp4Fetch();
    const handler = new VideoJobHandler({ provider: providerCompletingAfter(2), storage, assets, idGen: () => 'v1', clock: () => 'T', fetchFn, wait: noWait, maxPolls: 5 });
    const job = newJob({ projectId: 'p1', kind: 'video', provider: 'pixverse', params: { prompt: 'a fox', aspectRatio: '9:16' } }, { id: 'j1', now: 'T' });
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('v1');
    const asset = await assets.get('v1');
    expect(asset?.type).toBe('video');
    expect(asset?.storageKey).toBe('projects/p1/videos/v1.mp4');
    expect(storage.read('projects/p1/videos/v1.mp4')?.contentType).toBe('video/mp4');
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/pv1.mp4');
  });

  it('throws without a prompt', async () => {
    const handler = new VideoJobHandler({ provider: providerCompletingAfter(1), storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait });
    const job = newJob({ projectId: 'p1', kind: 'video', provider: 'pixverse', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/prompt/i);
  });

  it('throws when the provider reports failure', async () => {
    const provider: VideoProvider = { name: 'pixverse', isAvailable: () => true, async create() { return { taskId: 't' }; }, async getTask(taskId) { return { taskId, state: 'failed' }; } };
    const handler = new VideoJobHandler({ provider, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait });
    const job = newJob({ projectId: 'p1', kind: 'video', provider: 'pixverse', params: { prompt: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/fail/i);
  });

  it('throws if it never completes within maxPolls', async () => {
    const provider: VideoProvider = { name: 'pixverse', isAvailable: () => true, async create() { return { taskId: 't' }; }, async getTask(taskId) { return { taskId, state: 'processing' }; } };
    const handler = new VideoJobHandler({ provider, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(), idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait, maxPolls: 3 });
    const job = newJob({ projectId: 'p1', kind: 'video', provider: 'pixverse', params: { prompt: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/did not complete/i);
  });
});
