import { describe, it, expect, vi } from 'vitest';
import { SkyReelsVideoProvider } from '../src/video/skyreels';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('SkyReelsVideoProvider', () => {
  it('is unavailable without SKYREELS_URL, available with one', () => {
    expect(new SkyReelsVideoProvider({ baseUrl: undefined }).isAvailable()).toBe(false);
    expect(new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780' }).isAvailable()).toBe(true);
  });

  it('submits a generation and returns the worker task id', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe('http://gpu:8780/generate');
      expect(JSON.parse(String(init.body))).toEqual({ prompt: 'a fox', aspect_ratio: '9:16' });
      return new Response(JSON.stringify({ task_id: 't1' }), { status: 200 });
    });
    const p = new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780/', fetchFn });
    expect(await p.create({ prompt: 'a fox', aspectRatio: '9:16' })).toEqual({ taskId: 't1' });
  });

  it('maps an image source to the image field for image-to-video', async () => {
    const fetchFn = mockFetch((_url, init) => {
      expect(JSON.parse(String(init.body))).toEqual({ prompt: 'move', image: 'https://img' });
      return new Response(JSON.stringify({ task_id: 't2' }), { status: 200 });
    });
    const p = new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780', fetchFn });
    await p.create({ prompt: 'move', imageUrl: 'https://img' });
  });

  it('polls: processing, then complete with the video url', async () => {
    const fetchFn = mockFetch((url) => {
      expect(url).toBe('http://gpu:8780/tasks/t1');
      return new Response(JSON.stringify({ state: 'complete', video_url: 'http://gpu:8780/files/t1.mp4' }), { status: 200 });
    });
    const p = new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780', fetchFn });
    expect(await p.getTask('t1')).toEqual({ taskId: 't1', state: 'complete', videoUrl: 'http://gpu:8780/files/t1.mp4' });
  });

  it('reports processing while running and failed on error state or a bad response', async () => {
    const running = new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780', fetchFn: mockFetch(() => new Response(JSON.stringify({ state: 'processing' }), { status: 200 })) });
    expect((await running.getTask('t1')).state).toBe('processing');
    const failed = new SkyReelsVideoProvider({ baseUrl: 'http://gpu:8780', fetchFn: mockFetch(() => new Response('nope', { status: 500 })) });
    expect((await failed.getTask('t1')).state).toBe('failed');
  });
});
