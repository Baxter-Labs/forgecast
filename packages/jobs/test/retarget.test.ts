import { describe, it, expect, vi } from 'vitest';
import type { RetargetProvider, RetargetGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { RetargetJobHandler } from '../src/index';

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeRetargetProvider(videoUrl = 'https://cdn/animated.mp4'): RetargetProvider & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn(async () => ({ taskId: 'rt-task' }));
  return {
    name: 'wan-animate', isAvailable: () => true,
    create: createSpy,
    async getTask(taskId): Promise<RetargetGenTask> {
      return { taskId, state: 'complete', videoUrl };
    },
    createSpy,
  };
}

function mp4Fetch() {
  return vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } }),
  );
}

const noWait = async () => {};

function makeHandler(overrides: Partial<ConstructorParameters<typeof RetargetJobHandler>[0]> = {}) {
  const storage = new InMemoryStorage();
  const assets = new InMemoryAssetRepo();
  const provider = fakeRetargetProvider();
  const fetchFn = mp4Fetch();
  const handler = new RetargetJobHandler({
    provider, storage, assets,
    idGen: () => 'rt1', clock: () => 'T',
    fetchFn, wait: noWait, maxPolls: 5,
    ...overrides,
  });
  return { handler, storage, assets, provider, fetchFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RetargetJobHandler', () => {
  it('forwards image + reference video urls and stores the animated video asset', async () => {
    const { handler, assets, provider, storage } = makeHandler();

    const job = newJob(
      { projectId: 'proj1', kind: 'retarget', provider: 'wan-animate', params: { imageUrl: 'https://cdn/hero.png', videoUrl: 'https://cdn/perf.mp4' } },
      { id: 'j1', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('rt1');

    expect(provider.createSpy).toHaveBeenCalledWith({ imageUrl: 'https://cdn/hero.png', videoUrl: 'https://cdn/perf.mp4' });

    const asset = await assets.get('rt1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('wan-animate');
    expect(asset?.storageKey).toBe('projects/proj1/videos/rt1.mp4');
    expect(await storage.get(asset!.storageKey)).not.toBeNull();
  });

  it('throws when imageUrl or videoUrl is missing', async () => {
    const { handler } = makeHandler();
    const noImage = newJob(
      { projectId: 'p', kind: 'retarget', provider: 'wan-animate', params: { videoUrl: 'https://cdn/perf.mp4' } },
      { id: 'j2', now: 'T' },
    );
    await expect(handler.run(noImage, async () => {})).rejects.toThrow('retarget requires imageUrl');
    const noVideo = newJob(
      { projectId: 'p', kind: 'retarget', provider: 'wan-animate', params: { imageUrl: 'https://cdn/hero.png' } },
      { id: 'j3', now: 'T' },
    );
    await expect(handler.run(noVideo, async () => {})).rejects.toThrow('retarget requires videoUrl');
  });

  it('throws when the provider reports failure', async () => {
    const provider = fakeRetargetProvider();
    provider.getTask = async (taskId): Promise<RetargetGenTask> => ({ taskId, state: 'failed' });
    const { handler } = makeHandler({ provider });
    const job = newJob(
      { projectId: 'p', kind: 'retarget', provider: 'wan-animate', params: { imageUrl: 'https://cdn/hero.png', videoUrl: 'https://cdn/perf.mp4' } },
      { id: 'j4', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrow('retarget provider reported failure');
  });
});
