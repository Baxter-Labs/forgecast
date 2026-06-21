import { describe, it, expect, vi } from 'vitest';
import { OmniHumanPresenterProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/bytedance/omnihuman';
const APP = 'fal-ai/bytedance/omnihuman';
const REQUEST_ID = 'req-oh-1';
const RESPONSE_URL = `${BASE}/${APP}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('OmniHumanPresenterProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new OmniHumanPresenterProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits {image_url, audio_url} with Key auth and returns response_url as taskId', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new OmniHumanPresenterProvider(opts(fetchFn));
    const { taskId } = await p.create({ imageUrl: 'https://fal/img.png', audioUrl: 'https://fal/vo.mp3' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ image_url: 'https://fal/img.png', audio_url: 'https://fal/vo.mp3' });
  });

  it('reports processing while IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const t = await new OmniHumanPresenterProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result payload and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status')
        ? json({ status: 'COMPLETED' })
        : json({ video: { url: 'https://cdn/presenter.mp4' } }),
    );
    const t = await new OmniHumanPresenterProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t).toEqual({ taskId: RESPONSE_URL, state: 'complete', videoUrl: 'https://cdn/presenter.mp4' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('maps a non-ok status response to failed', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new OmniHumanPresenterProvider(opts(fetchFn)).getTask(RESPONSE_URL)).state).toBe('failed');
  });

  it('throws a helpful error when submit fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'unauthorized' }, 401));
    await expect(new OmniHumanPresenterProvider(opts(fetchFn)).create({ imageUrl: 'https://fal/img.png', audioUrl: 'https://fal/vo.mp3' })).rejects.toThrowError(/401|unauthorized/i);
  });
});
