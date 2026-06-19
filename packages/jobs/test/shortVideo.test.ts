import { describe, it, expect, vi } from 'vitest';
import type { ShortVideoWorker, ShortVideoTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { ShortVideoJobHandler } from '../src/index';

function workerThatCompletesAfter(polls: number): ShortVideoWorker {
  let n = 0;
  return {
    name: 'fake',
    isAvailable: () => true,
    async createVideo() { return { taskId: 'tk' }; },
    async getTask(taskId): Promise<ShortVideoTask> {
      n += 1;
      if (n < polls) return { taskId, state: 'processing', progress: n * 20 };
      return { taskId, state: 'complete', progress: 100, videoUrl: 'http://worker/tasks/tk/combined-1.mp4' };
    },
  };
}

const noWait = async () => {};
function mp4Fetch() {
  return vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } }),
  );
}

describe('ShortVideoJobHandler', () => {
  it('creates → polls to completion → downloads → stores → records a video asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const fetchFn = mp4Fetch();
    const handler = new ShortVideoJobHandler({
      worker: workerThatCompletesAfter(3), storage, assets,
      idGen: () => 'v1', clock: () => 'T', fetchFn, wait: noWait, pollIntervalMs: 1, maxPolls: 10,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'cats' } }, { id: 'j1', now: 'T' });
    const progress: number[] = [];
    const outcome = await handler.run(job, async (p) => { progress.push(p); });

    expect(outcome.assetId).toBe('v1');
    const asset = await assets.get('v1');
    expect(asset?.type).toBe('video');
    expect(asset?.storageKey).toBe('projects/p1/videos/v1.mp4');
    expect(storage.read('projects/p1/videos/v1.mp4')?.contentType).toBe('video/mp4');
    expect(fetchFn).toHaveBeenCalledWith('http://worker/tasks/tk/combined-1.mp4');
    expect(progress.length).toBeGreaterThan(1);
  });

  it('throws without a subject', async () => {
    const handler = new ShortVideoJobHandler({
      worker: workerThatCompletesAfter(1), storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/subject/i);
  });

  it('throws when the worker reports failure', async () => {
    const worker: ShortVideoWorker = {
      name: 'fake', isAvailable: () => true,
      async createVideo() { return { taskId: 'tk' }; },
      async getTask(taskId) { return { taskId, state: 'failed', progress: 0 }; },
    };
    const handler = new ShortVideoJobHandler({
      worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/fail/i);
  });

  it('throws if it never completes within maxPolls', async () => {
    const worker: ShortVideoWorker = {
      name: 'fake', isAvailable: () => true,
      async createVideo() { return { taskId: 'tk' }; },
      async getTask(taskId) { return { taskId, state: 'processing', progress: 10 }; },
    };
    const handler = new ShortVideoJobHandler({
      worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait, maxPolls: 3,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/did not complete/i);
  });
});
