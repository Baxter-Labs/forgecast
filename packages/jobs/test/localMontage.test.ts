import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newJob } from '@forgecast/core';
import type { MontageSpec } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { LocalMontageJobHandler } from '../src/index';

const tinyFetch = () =>
  vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  );

// Fake runner: records args and writes a dummy out.mp4 next to the working dir so the
// handler's readFileSync(out.mp4) step succeeds. The output path is always the last arg.
function fakeRun(record: { calls: string[][] }) {
  return async (_ffmpegPath: string, args: string[]): Promise<void> => {
    record.calls.push(args);
    const out = args[args.length - 1]!;
    writeFileSync(out, new Uint8Array([9, 9, 9, 9]));
  };
}

function imageSpec(aspectRatio: string, extra?: Partial<MontageSpec>): MontageSpec {
  return {
    aspectRatio,
    scenes: [
      { url: 'https://cdn/a.png', kind: 'image', durationSec: 3 },
      { url: 'https://cdn/b.png', kind: 'image', durationSec: 2 },
    ],
    ...extra,
  };
}

describe('LocalMontageJobHandler', () => {
  it('throws on empty scenes', async () => {
    const handler = new LocalMontageJobHandler({
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'm1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: tinyFetch(),
      run: async () => {},
    });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'ffmpeg-montage', params: { spec: { scenes: [], aspectRatio: '9:16' } } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/at least one scene/i);
  });

  it('renders a 2-image 9:16 spec: builds concat args, stores + records a video asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const record = { calls: [] as string[][] };
    const fetchFn = tinyFetch();
    const handler = new LocalMontageJobHandler({
      storage,
      assets,
      idGen: () => 'm1',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn,
      run: fakeRun(record),
    });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'ffmpeg-montage', params: { spec: imageSpec('9:16') } }, { id: 'j1', now: 'T' });

    const outcome = await handler.run(job, async () => {});
    expect(outcome.assetId).toBe('m1');

    // run was called with ffmpeg args
    expect(record.calls.length).toBe(1);
    const args = record.calls[0]!;
    const joined = args.join(' ');
    // two image inputs → two `-loop 1`
    expect(args.filter((a) => a === '-loop').length).toBe(2);
    expect(joined).toContain('-loop 1');
    // concat of 2 scenes
    expect(joined).toContain('concat=n=2:v=1:a=0[outv]');
    // 9:16 → 1080x1920
    expect(joined).toContain('scale=1080:1920');
    // output is an mp4
    expect(args[args.length - 1]!.endsWith('out.mp4')).toBe(true);
    // fetched both scenes
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/a.png');
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/b.png');

    // asset recorded as video under projects/p1/videos/ with provider ffmpeg-montage
    const asset = await assets.get('m1');
    expect(asset?.type).toBe('video');
    expect(asset?.provider).toBe('ffmpeg-montage');
    expect(asset?.storageKey).toBe('projects/p1/videos/m1.mp4');
    expect(storage.read('projects/p1/videos/m1.mp4')?.contentType).toBe('video/mp4');
  });

  it('uses the right scale for 16:9', async () => {
    const record = { calls: [] as string[][] };
    const handler = new LocalMontageJobHandler({
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'm2',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn: tinyFetch(),
      run: fakeRun(record),
    });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'ffmpeg-montage', params: { spec: imageSpec('16:9') } }, { id: 'j1', now: 'T' });
    await handler.run(job, async () => {});
    expect(record.calls[0]!.join(' ')).toContain('scale=1920:1080');
  });

  it('with musicUrl: adds an audio input, audio map and -shortest', async () => {
    const record = { calls: [] as string[][] };
    const fetchFn = tinyFetch();
    const handler = new LocalMontageJobHandler({
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'm3',
      clock: () => 'T',
      ffmpegPath: '/bin/ffmpeg',
      fetchFn,
      run: fakeRun(record),
    });
    const spec = imageSpec('9:16', { musicUrl: 'https://cdn/music.mp3' });
    const job = newJob({ projectId: 'p1', kind: 'montage', provider: 'ffmpeg-montage', params: { spec } }, { id: 'j1', now: 'T' });
    await handler.run(job, async () => {});

    const args = record.calls[0]!;
    const joined = args.join(' ');
    // music fetched
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/music.mp3');
    // three `-i` inputs total: 2 scenes + 1 audio
    expect(args.filter((a) => a === '-i').length).toBe(3);
    // audio map (input index 2) and -shortest present
    expect(joined).toContain('-map 2:a');
    expect(args).toContain('-shortest');
    expect(args).toContain('-c:a');
  });
});
