import { describe, it, expect, vi } from 'vitest';
import { FalLipsyncProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/sync-lipsync';
const REQUEST_ID = 'req-9';
const RESPONSE_URL = `${BASE}/${MODEL}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalLipsyncProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalLipsyncProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits video_url + audio_url to the fal queue', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalLipsyncProvider(opts(fetchFn));
    const { taskId } = await p.create({ videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://cdn/speech.mp3' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toEqual({ video_url: 'https://cdn/in.mp4', audio_url: 'https://cdn/speech.mp3' });
  });

  it('supports an alternate model (latentsync)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID }),
    );
    const p = new FalLipsyncProvider({ apiKey: 'k', model: 'fal-ai/latentsync', fetchFn });
    expect(p.name).toBe('latentsync');
    const { taskId } = await p.create({ videoUrl: 'https://cdn/in.mp4', audioUrl: 'https://cdn/speech.mp3' });
    expect(fetchFn.mock.calls[0]![0]).toBe(`${BASE}/fal-ai/latentsync`);
    expect(taskId).toBe(`${BASE}/fal-ai/latentsync/requests/${REQUEST_ID}`);
  });

  it('reports processing while IN_QUEUE / IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const task = await new FalLipsyncProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status')
        ? json({ status: 'COMPLETED' })
        : json({ video: { url: 'https://cdn/synced.mp4' } }),
    );
    const task = await new FalLipsyncProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task).toEqual({ taskId: RESPONSE_URL, state: 'complete', videoUrl: 'https://cdn/synced.mp4' });
  });

  it('maps FAILED / non-ok / missing-video responses to failed', async () => {
    const failed = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'FAILED' }));
    expect((await new FalLipsyncProvider(opts(failed)).getTask(RESPONSE_URL)).state).toBe('failed');
    const nonOk = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalLipsyncProvider(opts(nonOk)).getTask(RESPONSE_URL)).state).toBe('failed');
    const noUrl = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({}),
    );
    expect((await new FalLipsyncProvider(opts(noUrl)).getTask(RESPONSE_URL)).state).toBe('failed');
  });
});
