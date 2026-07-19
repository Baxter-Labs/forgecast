import { describe, it, expect, vi } from 'vitest';
import type { SfxProvider, SfxGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { SfxJobHandler } from '../src/index';

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeSfxProvider(videoUrl = 'https://cdn/scored.mp4'): SfxProvider & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn(async () => ({ taskId: 'sfx-task' }));
  return {
    name: 'mmaudio-v2', isAvailable: () => true,
    create: createSpy,
    async getTask(taskId): Promise<SfxGenTask> {
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

function makeHandler(overrides: Partial<ConstructorParameters<typeof SfxJobHandler>[0]> = {}) {
  const storage = new InMemoryStorage();
  const assets = new InMemoryAssetRepo();
  const provider = fakeSfxProvider();
  const fetchFn = mp4Fetch();
  const handler = new SfxJobHandler({
    provider, storage, assets,
    idGen: () => 'sfx1', clock: () => 'T',
    fetchFn, wait: noWait, maxPolls: 5,
    ...overrides,
  });
  return { handler, storage, assets, provider, fetchFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SfxJobHandler', () => {
  it('forwards the video url + prompt and stores the scored video asset', async () => {
    const { handler, assets, provider, storage } = makeHandler();

    const job = newJob(
      { projectId: 'proj1', kind: 'sfx', provider: 'mmaudio-v2', params: { videoUrl: 'https://cdn/in.mp4', prompt: 'rain on a tin roof' } },
      { id: 'j1', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('sfx1');

    expect(provider.createSpy).toHaveBeenCalledWith({ videoUrl: 'https://cdn/in.mp4', prompt: 'rain on a tin roof', negativePrompt: undefined });

    const asset = await assets.get('sfx1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('mmaudio-v2');
    expect(asset?.storageKey).toBe('projects/proj1/videos/sfx1.mp4');
    expect(await storage.get(asset!.storageKey)).not.toBeNull();
  });

  it('forwards negativePrompt when given', async () => {
    const { handler, provider } = makeHandler();
    const job = newJob(
      { projectId: 'p', kind: 'sfx', provider: 'mmaudio-v2', params: { videoUrl: 'https://cdn/in.mp4', prompt: 'wind', negativePrompt: 'music, speech' } },
      { id: 'j2', now: 'T' },
    );
    await handler.run(job, async () => {});
    expect(provider.createSpy).toHaveBeenCalledWith({ videoUrl: 'https://cdn/in.mp4', prompt: 'wind', negativePrompt: 'music, speech' });
  });

  it('throws when videoUrl or prompt is missing', async () => {
    const { handler } = makeHandler();
    const noVideo = newJob(
      { projectId: 'p', kind: 'sfx', provider: 'mmaudio-v2', params: { prompt: 'x' } },
      { id: 'j3', now: 'T' },
    );
    await expect(handler.run(noVideo, async () => {})).rejects.toThrow('sfx requires videoUrl');
    const noPrompt = newJob(
      { projectId: 'p', kind: 'sfx', provider: 'mmaudio-v2', params: { videoUrl: 'https://cdn/in.mp4' } },
      { id: 'j4', now: 'T' },
    );
    await expect(handler.run(noPrompt, async () => {})).rejects.toThrow('sfx requires prompt');
  });

  it('throws when the provider reports failure', async () => {
    const provider = fakeSfxProvider();
    provider.getTask = async (taskId): Promise<SfxGenTask> => ({ taskId, state: 'failed' });
    const { handler } = makeHandler({ provider });
    const job = newJob(
      { projectId: 'p', kind: 'sfx', provider: 'mmaudio-v2', params: { videoUrl: 'https://cdn/in.mp4', prompt: 'x' } },
      { id: 'j5', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrow('sfx provider reported failure');
  });
});
