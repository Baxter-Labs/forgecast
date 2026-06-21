import { describe, it, expect, vi } from 'vitest';
import type { VoiceProvider, VoiceGenTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { VoiceoverJobHandler } from '../src/index';

function providerCompletingAfter(polls: number): VoiceProvider {
  let n = 0;
  return {
    name: 'fal-tts', isAvailable: () => true,
    async create() { return { taskId: 'tts1' }; },
    async getTask(taskId): Promise<VoiceGenTask> {
      n += 1;
      if (n < polls) return { taskId, state: 'processing' };
      return { taskId, state: 'complete', audioUrl: 'https://cdn/tts1.mp3' };
    },
  };
}
const noWait = async () => {};
const mp3Fetch = () => vi.fn(async (..._a: Parameters<typeof fetch>) =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));

describe('VoiceoverJobHandler', () => {
  it('creates → polls → downloads → stores → records an audio asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const fetchFn = mp3Fetch();
    const handler = new VoiceoverJobHandler({
      provider: providerCompletingAfter(2),
      storage, assets,
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn, wait: noWait, maxPolls: 5,
    });
    const job = newJob(
      { projectId: 'p1', kind: 'voiceover', provider: 'fal-tts', params: { text: 'Hello world', voice: 'rachel' } },
      { id: 'j1', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('a1');
    const asset = await assets.get('a1');
    expect(asset?.type).toBe('audio');
    expect(asset?.provider).toBe('fal-tts');
    expect(asset?.storageKey).toBe('projects/p1/audio/a1.mp3');
    expect(storage.read('projects/p1/audio/a1.mp3')?.contentType).toBe('audio/mpeg');
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/tts1.mp3');
  });

  it('throws without a text param', async () => {
    const handler = new VoiceoverJobHandler({
      provider: providerCompletingAfter(1),
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn: mp3Fetch(),
      wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'voiceover', provider: 'fal-tts', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/text/i);
  });

  it('throws when the provider reports failure', async () => {
    const provider: VoiceProvider = {
      name: 'fal-tts', isAvailable: () => true,
      async create() { return { taskId: 't' }; },
      async getTask(taskId) { return { taskId, state: 'failed' }; },
    };
    const handler = new VoiceoverJobHandler({
      provider,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn: mp3Fetch(),
      wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'voiceover', provider: 'fal-tts', params: { text: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/fail/i);
  });

  it('throws if it never completes within maxPolls', async () => {
    const provider: VoiceProvider = {
      name: 'fal-tts', isAvailable: () => true,
      async create() { return { taskId: 't' }; },
      async getTask(taskId) { return { taskId, state: 'processing' }; },
    };
    const handler = new VoiceoverJobHandler({
      provider,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn: mp3Fetch(),
      wait: noWait,
      maxPolls: 3,
    });
    const job = newJob({ projectId: 'p1', kind: 'voiceover', provider: 'fal-tts', params: { text: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/did not complete/i);
  });
});
