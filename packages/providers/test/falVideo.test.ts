import { describe, it, expect, vi } from 'vitest';
import { FalVideoProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/veo3.1/fast';
const APP = 'fal-ai/veo3.1'; // fal normalises status/result URLs to the app-level path
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
    // Body is minimal: no hardcoded resolution — only prompt + aspect_ratio
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ prompt: 'a fox', aspect_ratio: '9:16' });
    expect(parsed).not.toHaveProperty('resolution');
  });

  it('merges extra params (e.g. per-model resolution from catalog) into the body', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalVideoProvider(opts(fetchFn));
    await p.create({ prompt: 'a fox', aspectRatio: '16:9', extra: { resolution: '720p', motion_strength: 5 } });
    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toMatchObject({ prompt: 'a fox', aspect_ratio: '16:9', resolution: '720p', motion_strength: 5 });
  });

  it('passes image_url for image-to-video requests', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalVideoProvider(opts(fetchFn));
    await p.create({ prompt: 'animate this', imageUrl: 'https://cdn/source.jpg' });
    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toMatchObject({ prompt: 'animate this', image_url: 'https://cdn/source.jpg' });
    expect(parsed).not.toHaveProperty('aspect_ratio');
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
