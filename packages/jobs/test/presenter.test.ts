import { describe, it, expect, vi } from 'vitest';
import type { PresenterProvider, PresenterGenTask, ImageProvider, VoiceProvider, VoiceGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { PresenterJobHandler } from '../src/index';

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeImageProvider(url = 'https://fal/img.png'): ImageProvider {
  const spy = vi.fn(async () => ({ url }));
  const provider: ImageProvider & { spy: typeof spy } = {
    name: 'fal', isAvailable: () => true,
    generateImage: spy,
    spy,
  };
  return provider;
}

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

function fakePresenterProvider(videoUrl = 'https://cdn/presenter.mp4'): PresenterProvider & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn(async () => ({ taskId: 'oh-task' }));
  return {
    name: 'omnihuman', isAvailable: () => true,
    create: createSpy,
    async getTask(taskId): Promise<PresenterGenTask> {
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PresenterJobHandler', () => {
  it('generates image + voice then calls presenter provider and creates a video asset (omnihuman)', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const imageProvider = fakeImageProvider('https://fal/img.png');
    const voiceProvider = fakeVoiceProvider('https://fal/vo.mp3');
    const provider = fakePresenterProvider('https://cdn/presenter.mp4');
    const fetchFn = mp4Fetch();

    const handler = new PresenterJobHandler({
      provider, imageProvider, voiceProvider,
      storage, assets,
      idGen: () => 'p1',
      clock: () => 'T',
      fetchFn, wait: noWait, maxPolls: 5,
    });

    const job = newJob(
      { projectId: 'proj1', kind: 'presenter', provider: 'omnihuman', params: { imagePrompt: 'A professional presenter', text: 'Hello world' } },
      { id: 'j1', now: 'T' },
    );

    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('p1');

    // Image was generated from the prompt
    expect((imageProvider as ReturnType<typeof fakeImageProvider> & { spy: ReturnType<typeof vi.fn> }).generateImage).toHaveBeenCalledWith({ prompt: 'A professional presenter' });

    // Voice was created with the text
    expect(provider.createSpy).toHaveBeenCalledWith({
      imageUrl: 'https://fal/img.png',
      audioUrl: 'https://fal/vo.mp3',
    });

    // Video asset recorded with provider 'omnihuman'
    const asset = await assets.get('p1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('omnihuman');
    expect(asset?.storageKey).toBe('projects/proj1/videos/p1.mp4');
    expect(storage.read('projects/proj1/videos/p1.mp4')?.contentType).toBe('video/mp4');

    // Download was called with the presenter video URL
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/presenter.mp4');
  });

  it('skips image + voice generation when imageUrl and audioUrl are provided directly', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const imageProvider = fakeImageProvider();
    const voiceProvider = fakeVoiceProvider();
    const provider = fakePresenterProvider();
    const fetchFn = mp4Fetch();

    const handler = new PresenterJobHandler({
      provider, imageProvider, voiceProvider,
      storage, assets,
      idGen: () => 'p2',
      clock: () => 'T',
      fetchFn, wait: noWait, maxPolls: 5,
    });

    const job = newJob(
      {
        projectId: 'proj1', kind: 'presenter', provider: 'omnihuman',
        params: { imageUrl: 'https://prebuilt/img.png', audioUrl: 'https://prebuilt/vo.mp3' },
      },
      { id: 'j2', now: 'T' },
    );

    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('p2');

    // imageProvider and voiceProvider must NOT be called when URLs are pre-supplied
    expect((imageProvider as ReturnType<typeof fakeImageProvider> & { spy: ReturnType<typeof vi.fn> }).generateImage).not.toHaveBeenCalled();
    expect((voiceProvider as ReturnType<typeof fakeVoiceProvider>).createSpy).not.toHaveBeenCalled();

    // presenter provider called with the exact urls passed in
    expect(provider.createSpy).toHaveBeenCalledWith({
      imageUrl: 'https://prebuilt/img.png',
      audioUrl: 'https://prebuilt/vo.mp3',
    });
  });

  it('throws when neither image source (imagePrompt or imageUrl) is provided', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const handler = new PresenterJobHandler({
      provider: fakePresenterProvider(),
      imageProvider: fakeImageProvider(),
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'p3',
      clock: () => 'T',
      fetchFn: mp4Fetch(), wait: noWait,
    });

    const job = newJob(
      { projectId: 'proj1', kind: 'presenter', provider: 'omnihuman', params: { text: 'No image here' } },
      { id: 'j3', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/presenter requires imagePrompt or imageUrl/i);
  });

  it('throws when neither text source (text or audioUrl) is provided', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const handler = new PresenterJobHandler({
      provider: fakePresenterProvider(),
      imageProvider: fakeImageProvider(),
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'p4',
      clock: () => 'T',
      fetchFn: mp4Fetch(), wait: noWait,
    });

    const job = newJob(
      { projectId: 'proj1', kind: 'presenter', provider: 'omnihuman', params: { imageUrl: 'https://fal/img.png' } },
      { id: 'j4', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/presenter requires text or audioUrl/i);
  });

  it('throws when the presenter provider reports failure', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const failingProvider: PresenterProvider = {
      name: 'omnihuman', isAvailable: () => true,
      async create() { return { taskId: 'oh-fail' }; },
      async getTask(taskId): Promise<PresenterGenTask> { return { taskId, state: 'failed' }; },
    };
    const handler = new PresenterJobHandler({
      provider: failingProvider,
      imageProvider: fakeImageProvider(),
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'p5',
      clock: () => 'T',
      fetchFn: mp4Fetch(), wait: noWait, maxPolls: 3,
    });
    const job = newJob(
      { projectId: 'proj1', kind: 'presenter', provider: 'omnihuman', params: { imageUrl: 'https://fal/img.png', audioUrl: 'https://fal/vo.mp3' } },
      { id: 'j5', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/presenter provider reported failure/i);
  });
});
