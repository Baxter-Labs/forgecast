import { describe, it, expect, vi } from 'vitest';
import { FalMmaudioProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/mmaudio-v2';
const REQUEST_ID = 'req-31';
const RESPONSE_URL = `${BASE}/${MODEL}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalMmaudioProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalMmaudioProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits video_url + prompt to the fal queue', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalMmaudioProvider(opts(fetchFn));
    const { taskId } = await p.create({ videoUrl: 'https://cdn/in.mp4', prompt: 'rain on a tin roof' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toEqual({ video_url: 'https://cdn/in.mp4', prompt: 'rain on a tin roof' });
  });

  it('forwards negative_prompt only when provided', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID }),
    );
    const p = new FalMmaudioProvider(opts(fetchFn));
    await p.create({ videoUrl: 'https://cdn/in.mp4', prompt: 'wind', negativePrompt: 'music, speech' });
    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toEqual({ video_url: 'https://cdn/in.mp4', prompt: 'wind', negative_prompt: 'music, speech' });
  });

  it('supports an alternate model', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID }),
    );
    const p = new FalMmaudioProvider({ apiKey: 'k', model: 'fal-ai/mmaudio-v2/text-to-audio', fetchFn });
    expect(p.name).toBe('mmaudio-v2/text-to-audio');
    const { taskId } = await p.create({ videoUrl: 'https://cdn/in.mp4', prompt: 'x' });
    expect(fetchFn.mock.calls[0]![0]).toBe(`${BASE}/fal-ai/mmaudio-v2/text-to-audio`);
    expect(taskId).toBe(`${BASE}/fal-ai/mmaudio-v2/text-to-audio/requests/${REQUEST_ID}`);
  });

  it('reports processing while IN_QUEUE / IN_PROGRESS (no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const task = await new FalMmaudioProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result and returns the video url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status')
        ? json({ status: 'COMPLETED' })
        : json({ video: { url: 'https://cdn/scored.mp4' } }),
    );
    const task = await new FalMmaudioProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task).toEqual({ taskId: RESPONSE_URL, state: 'complete', videoUrl: 'https://cdn/scored.mp4' });
  });

  it('maps FAILED to failed', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'FAILED' }));
    const task = await new FalMmaudioProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('failed');
  });

  it('fails when the completed result has no video url', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({ detail: 'nope' }),
    );
    const task = await new FalMmaudioProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('failed');
  });

  it('fails on a non-ok status response', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}, 500));
    const task = await new FalMmaudioProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(task.state).toBe('failed');
  });
});
