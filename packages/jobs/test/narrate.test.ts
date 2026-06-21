import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VoiceProvider, VoiceGenTask } from '@forgecast/core';
import { newJob, newAsset } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { NarrateJobHandler } from '../src/index';

// Fake voice provider that immediately completes with an audio URL.
function fakeVoiceProvider(audioUrl = 'https://cdn/vo.mp3'): VoiceProvider {
  return {
    name: 'fal-tts', isAvailable: () => true,
    async create() { return { taskId: 'tts-x' }; },
    async getTask(taskId): Promise<VoiceGenTask> {
      return { taskId, state: 'complete', audioUrl };
    },
  };
}

// Fake runner: records args and writes a dummy out.mp4 (last arg is always the output path).
function fakeRun(record: { calls: string[][] }) {
  return async (_ffmpegPath: string, args: string[]): Promise<void> => {
    record.calls.push(args);
    const out = args[args.length - 1]!;
    writeFileSync(out, new Uint8Array([9, 9, 9, 9]));
  };
}

// Fetch stub: returns tiny audio bytes for the voice-over download URL, video bytes for the videoUrl case.
function fakeFetch() {
  return vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  );
}

const noWait = async () => {};

async function makeStorageWithVideo(): Promise<{ storage: InMemoryStorage; assets: InMemoryAssetRepo; videoAssetId: string }> {
  const storage = new InMemoryStorage();
  const assets = new InMemoryAssetRepo();
  // Pre-seed a source video asset.
  const videoAsset = await assets.create(
    newAsset(
      { projectId: 'p1', type: 'video', provider: 'fal-video', storageKey: 'projects/p1/videos/src.mp4', params: {} },
      { id: 'vid-src', now: 'T' },
    ),
  );
  await storage.put('projects/p1/videos/src.mp4', new Uint8Array([0xde, 0xad, 0xbe, 0xef]), 'video/mp4');
  return { storage, assets, videoAssetId: videoAsset.id };
}

describe('NarrateJobHandler', () => {
  it('throws when text is empty', async () => {
    const { storage, assets } = await makeStorageWithVideo();
    const handler = new NarrateJobHandler({
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'n1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: fakeFetch(),
      wait: noWait,
      run: async () => {},
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { videoAssetId: 'vid-src', text: '' } },
      { id: 'j1', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/text/i);
  });

  it('throws when neither videoAssetId nor videoUrl is provided', async () => {
    const { storage, assets } = await makeStorageWithVideo();
    const record = { calls: [] as string[][] };
    const handler = new NarrateJobHandler({
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'n1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: fakeFetch(),
      wait: noWait,
      run: fakeRun(record),
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { text: 'Hello' } },
      { id: 'j1', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/videoAssetId|videoUrl/i);
  });

  it('creates a video asset with provider "narrate" using videoAssetId', async () => {
    const { storage, assets, videoAssetId } = await makeStorageWithVideo();
    const record = { calls: [] as string[][] };
    const fetchFn = fakeFetch();
    const handler = new NarrateJobHandler({
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'n1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn,
      wait: noWait,
      run: fakeRun(record),
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { videoAssetId, text: 'Narrate this.' } },
      { id: 'j1', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('n1');

    const asset = await assets.get('n1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('narrate');
    expect(asset?.storageKey).toBe('projects/p1/videos/n1.mp4');
    expect(storage.read('projects/p1/videos/n1.mp4')?.contentType).toBe('video/mp4');
  });

  it('ffmpeg args contain both inputs and -shortest', async () => {
    const { storage, assets, videoAssetId } = await makeStorageWithVideo();
    const record = { calls: [] as string[][] };
    const handler = new NarrateJobHandler({
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'n1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: fakeFetch(),
      wait: noWait,
      run: fakeRun(record),
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { videoAssetId, text: 'Script here.' } },
      { id: 'j1', now: 'T' },
    );
    await handler.run(job, async () => {});

    expect(record.calls.length).toBe(1);
    const args = record.calls[0]!;
    const joined = args.join(' ');
    // Both inputs present
    expect(args.filter((a) => a === '-i').length).toBe(2);
    expect(joined).toContain('in.mp4');
    expect(joined).toContain('vo.mp3');
    // Audio/video mapping
    expect(joined).toContain('-map 0:v:0');
    expect(joined).toContain('-map 1:a:0');
    // Codec and mux flags
    expect(args).toContain('-shortest');
    expect(joined).toContain('-c:v copy');
    expect(joined).toContain('-c:a aac');
    expect(joined).toContain('+faststart');
    // Output
    expect(args[args.length - 1]!.endsWith('out.mp4')).toBe(true);
  });

  it('works with videoUrl instead of videoAssetId', async () => {
    const { storage, assets } = await makeStorageWithVideo();
    const record = { calls: [] as string[][] };
    const fetchFn = fakeFetch();
    const handler = new NarrateJobHandler({
      voiceProvider: fakeVoiceProvider(),
      storage, assets,
      idGen: () => 'n2',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn,
      wait: noWait,
      run: fakeRun(record),
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { videoUrl: 'https://cdn/src.mp4', text: 'From URL.' } },
      { id: 'j2', now: 'T' },
    );
    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('n2');
    // fetchFn was called for the video URL
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/src.mp4');
  });

  it('throws when voice generation fails', async () => {
    const failingProvider: VoiceProvider = {
      name: 'fal-tts', isAvailable: () => true,
      async create() { return { taskId: 'tts-fail' }; },
      async getTask(taskId): Promise<VoiceGenTask> { return { taskId, state: 'failed' }; },
    };
    const { storage, assets, videoAssetId } = await makeStorageWithVideo();
    const handler = new NarrateJobHandler({
      voiceProvider: failingProvider,
      storage, assets,
      idGen: () => 'n1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: fakeFetch(),
      wait: noWait,
      run: async () => {},
    });
    const job = newJob(
      { projectId: 'p1', kind: 'narrate', provider: 'narrate', params: { videoAssetId, text: 'x' } },
      { id: 'j1', now: 'T' },
    );
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/voice generation failed/i);
  });
});
