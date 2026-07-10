import { describe, it, expect, vi } from 'vitest';
import { ReplicateVideoProvider } from '../src/video/replicate';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('ReplicateVideoProvider', () => {
  it('is unavailable without a token, available with one', () => {
    expect(new ReplicateVideoProvider({ apiKey: undefined }).isAvailable()).toBe(false);
    expect(new ReplicateVideoProvider({ apiKey: 'r8-1' }).isAvailable()).toBe(true);
  });

  it('create posts to the official-model endpoint with Bearer auth + prompt, returns the prediction id', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe('https://api.replicate.com/v1/models/minimax/video-01/predictions');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer r8-1');
      const body = JSON.parse(String(init.body));
      expect(body.input.prompt).toBe('a wave');
      expect(body.input.first_frame_image).toBe('https://img/x.png');
      return new Response(JSON.stringify({ id: 'pred-1', status: 'starting' }), { status: 201 });
    });
    const r = await new ReplicateVideoProvider({ apiKey: 'r8-1', fetchFn }).create({ prompt: 'a wave', imageUrl: 'https://img/x.png' });
    expect(r.taskId).toBe('pred-1');
  });

  it('create uses the versioned /predictions endpoint for owner/name:version', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe('https://api.replicate.com/v1/predictions');
      expect(JSON.parse(String(init.body)).version).toBe('abc123');
      return new Response(JSON.stringify({ id: 'pred-2' }), { status: 201 });
    });
    await new ReplicateVideoProvider({ apiKey: 'r8-1', model: 'owner/name:abc123', fetchFn }).create({ prompt: 'p' });
  });

  it('getTask maps statuses and extracts the video url from varied output shapes', async () => {
    const cases: Array<[Record<string, unknown>, { state: string; videoUrl?: string }]> = [
      [{ status: 'processing' }, { state: 'processing' }],
      [{ status: 'failed', error: 'boom' }, { state: 'failed' }],
      [{ status: 'succeeded', output: 'https://v/1.mp4' }, { state: 'complete', videoUrl: 'https://v/1.mp4' }],
      [{ status: 'succeeded', output: ['https://v/2.mp4'] }, { state: 'complete', videoUrl: 'https://v/2.mp4' }],
      [{ status: 'succeeded', output: { video: 'https://v/3.mp4' } }, { state: 'complete', videoUrl: 'https://v/3.mp4' }],
      [{ status: 'succeeded', output: null }, { state: 'failed' }],
    ];
    for (const [payload, expected] of cases) {
      const fetchFn = mockFetch((url) => {
        expect(url).toBe('https://api.replicate.com/v1/predictions/pred-1');
        return new Response(JSON.stringify(payload), { status: 200 });
      });
      const task = await new ReplicateVideoProvider({ apiKey: 'r8-1', fetchFn }).getTask('pred-1');
      expect(task.state).toBe(expected.state);
      if (expected.videoUrl) expect(task.videoUrl).toBe(expected.videoUrl);
    }
  });
});
