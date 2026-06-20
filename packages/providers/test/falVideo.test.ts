import { describe, it, expect, vi } from 'vitest';
import { FalVideoProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/wan/v2.2-5b/text-to-video';
const APP = 'fal-ai/wan'; // fal normalises status/result URLs to the app-level path
const REQUEST_ID = 'req-42';
const RESPONSE_URL = `${BASE}/${APP}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalVideoProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalVideoProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits to the fal queue and returns response_url as taskId', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalVideoProvider(opts(fetchFn));
    const { taskId } = await p.create({ prompt: 'a fox', aspectRatio: '9:16' });
    // taskId should be the response_url so getTask polls the correct app-level path
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ prompt: 'a fox', aspect_ratio: '9:16', resolution: '720p' });
  });

  it('falls back to constructing response_url from model path when fal omits response_url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ request_id: REQUEST_ID }));
    const { taskId } = await new FalVideoProvider(opts(fetchFn)).create({ prompt: 'x' });
    expect(taskId).toBe(`${BASE}/${MODEL}/requests/${REQUEST_ID}`);
  });

  it('reports processing while IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const t = await new FalVideoProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1); // status only
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result payload and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({ video: { url: 'https://cdn/v.mp4' } }),
    );
    const t = await new FalVideoProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t).toEqual({ taskId: RESPONSE_URL, state: 'complete', videoUrl: 'https://cdn/v.mp4' });
    expect(fetchFn).toHaveBeenCalledTimes(2); // status + result
  });

  it('maps a non-ok status response to failed', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalVideoProvider(opts(fetchFn)).getTask(RESPONSE_URL)).state).toBe('failed');
  });

  it('throws a helpful error when submit fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'unauthorized' }, 401));
    await expect(new FalVideoProvider(opts(fetchFn)).create({ prompt: 'x' })).rejects.toThrowError(/401|unauthorized/);
  });
});
