import { describe, it, expect, vi } from 'vitest';
import { FalVideoProvider } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalVideoProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalVideoProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits to the fal queue with Key auth and the mapped body', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ request_id: 'req-42' }));
    const p = new FalVideoProvider(opts(fetchFn));
    const { taskId } = await p.create({ prompt: 'a fox', aspectRatio: '9:16' });
    expect(taskId).toBe('req-42');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://queue.fal.run/fal-ai/wan/v2.2-5b/text-to-video');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ prompt: 'a fox', aspect_ratio: '9:16', resolution: '720p' });
  });

  it('reports processing while IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const t = await new FalVideoProvider(opts(fetchFn)).getTask('req-42');
    expect(t.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1); // status only
    expect(fetchFn.mock.calls[0]![0]).toBe('https://queue.fal.run/fal-ai/wan/v2.2-5b/text-to-video/requests/req-42/status');
  });

  it('fetches the result payload and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({ video: { url: 'https://cdn/v.mp4' } }),
    );
    const t = await new FalVideoProvider(opts(fetchFn)).getTask('req-42');
    expect(t).toEqual({ taskId: 'req-42', state: 'complete', videoUrl: 'https://cdn/v.mp4' });
    expect(fetchFn).toHaveBeenCalledTimes(2); // status + result
  });

  it('maps a non-ok status response to failed', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalVideoProvider(opts(fetchFn)).getTask('x')).state).toBe('failed');
  });

  it('throws a helpful error when submit fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'unauthorized' }, 401));
    await expect(new FalVideoProvider(opts(fetchFn)).create({ prompt: 'x' })).rejects.toThrowError(/401|unauthorized/);
  });
});
