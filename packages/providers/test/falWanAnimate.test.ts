import { describe, it, expect, vi } from 'vitest';
import { FalWanAnimateProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/wan-animate';
const REQUEST_ID = 'req-7';
const RESPONSE_URL = `${BASE}/${MODEL}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalWanAnimateProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalWanAnimateProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits image_url + video_url to the fal queue', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalWanAnimateProvider(opts(fetchFn));
    const { taskId } = await p.create({ imageUrl: 'https://cdn/hero.png', videoUrl: 'https://cdn/perf.mp4' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toEqual({ image_url: 'https://cdn/hero.png', video_url: 'https://cdn/perf.mp4' });
  });

  it('supports an alternate model', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID }),
    );
    const p = new FalWanAnimateProvider({ apiKey: 'k', model: 'fal-ai/wan-animate/replace', fetchFn });
    expect(p.name).toBe('wan-animate/replace');
    const { taskId } = await p.create({ imageUrl: 'https://cdn/hero.png', videoUrl: 'https://cdn/perf.mp4' });
    expect(fetchFn.mock.calls[0]![0]).toBe(`${BASE}/fal-ai/wan-animate/replace`);
    expect(taskId).toBe(`${BASE}/fal-ai/wan-animate/replace/requests/${REQUEST_ID}`);
  });

  it('reports processing while IN_QUEUE / IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const task = await new FalWanAnimateProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status')
        ? json({ status: 'COMPLETED' })
        : json({ video: { url: 'https://cdn/animated.mp4' } }),
    );
    const task = await new FalWanAnimateProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task).toEqual({ taskId: RESPONSE_URL, state: 'complete', videoUrl: 'https://cdn/animated.mp4' });
  });

  it('maps FAILED / non-ok / missing-video responses to failed', async () => {
    const failed = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'FAILED' }));
    expect((await new FalWanAnimateProvider(opts(failed)).getTask(RESPONSE_URL)).state).toBe('failed');
    const nonOk = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalWanAnimateProvider(opts(nonOk)).getTask(RESPONSE_URL)).state).toBe('failed');
    const noUrl = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({}),
    );
    expect((await new FalWanAnimateProvider(opts(noUrl)).getTask(RESPONSE_URL)).state).toBe('failed');
  });
});
