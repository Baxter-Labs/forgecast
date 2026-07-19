import { describe, it, expect, vi } from 'vitest';
import type { LipsyncProvider, LipsyncGenTask, VoiceProvider, VoiceGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { LipsyncJobHandler } from '../src/index';

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeVoiceProvider(audioUrl = 'https://fal/vo.mp3'): VoiceProvider & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn(async () => ({ taskId: 'tts-task' }));
  return {
    name: 'fal-tts', isAvailable: () => true,
    create: createSpy,
    async getTask(taskId): Promise<VoiceGenTask> {
      return { taskId, state: 'complete', audioUrl };
    },
    createSpy,
  };
}

function fakeLipsyncProvider(videoUrl = 'https://cdn/synced.mp4'): LipsyncProvider & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn(async () => ({ taskId: 'ls-task' }));
  return {
    name: 'sync-lipsync', isAvailable: () => true,
    create: createSpy,
    async getTask(taskId): Promise<LipsyncGenTask> {
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

function makeHandler(overrides: Partial<ConstructorParameters<typeof LipsyncJobHandler>[0]> = {}) {
  const storage = new InMemoryStorage();
  const assets = new InMemoryAssetRepo();
  const provider = fakeLipsyncProvider();
  const voiceProvider = fakeVoiceProvider();
  const fetchFn = mp4Fetch();
  const handler = new LipsyncJobHandler({
    provider, voiceProvider, storage, assets,
    idGen: () => 'ls1', clock: () => 'T',
    fetchFn, wait: noWait, maxPolls: 5,
    ...overrides,
  });
  return { handler, storage, assets, provider, voiceProvider, fetchFn };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LipsyncJobHandler', () => {
  it('forwards a pre-resolved audio url and stores the synced video asset', async () => {
    const { handler, assets, provider, voiceProvider, storage } = makeHandler();

    const job = newJob(
      { projectId: 'proj1', kind: 'lipsync', provider: 'sync-lipsync', params: { videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://cdn/speech.mp3' } },
      { id: 'j1', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('ls1');

    expect(provider.createSpy).toHaveBeenCalledWith({ videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://cdn/speech.mp3' });
    expect(voiceProvider.createSpy).not.toHaveBeenCalled();

    const asset = await assets.get('ls1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('sync-lipsync');
    expect(asset?.storageKey).toBe('projects/proj1/videos/ls1.mp4');
    expect(await storage.get(asset!.storageKey)).not.toBeNull();
  });

  it('voices a script with the voice provider when only text is given', async () => {
    const { handler, provider, voiceProvider } = makeHandler();

    const job = newJob(
      { projectId: 'proj1', kind: 'lipsync', provider: 'sync-lipsync', params: { videoUrl: 'https://cdn/in.mp4', text: 'New line', voice: 'nova' } },
      { id: 'j2', now: 'T' },
    );
    await handler.run(job, async () => {});

    expect(voiceProvider.createSpy).toHaveBeenCalledWith({ text: 'New line', voice: 'nova' });
    expect(provider.createSpy).toHaveBeenCalledWith({ videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://fal/vo.mp3' });
  });

  it('throws when videoUrl is missing or no audio source is given', async () => {
    const { handler } = makeHandler();
    const noVideo = newJob(
      { projectId: 'p', kind: 'lipsync', provider: 'sync-lipsync', params: { text: 'hi' } },
      { id: 'j3', now: 'T' },
    );
    await expect(handler.run(noVideo, async () => {})).rejects.toThrow('lipsync requires videoUrl');
    const noAudio = newJob(
      { projectId: 'p', kind: 'lipsync', provider: 'sync-lipsync', params: { videoUrl: 'https://cdn/in.mp4' } },
      { id: 'j4', now: 'T' },
    );
    await expect(handler.run(noAudio, async () => {})).rejects.toThrow('lipsync requires text or audioUrl');
  });

  it('throws when the provider reports failure', async () => {
    const provider = fakeLipsyncProvider();
    provider.getTask = async (taskId): Promise<LipsyncGenTask> => ({ taskId, state: 'failed' });
    const { handler } = makeHandler({ provider });
    const job = newJob(
      { projectId: 'p', kind: 'lipsync', provider: 'sync-lipsync', params: { videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://cdn/a.mp3' } },
      { id: 'j5', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrow('lipsync provider reported failure');
  });
});
