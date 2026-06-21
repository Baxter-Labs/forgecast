import { describe, it, expect, vi } from 'vitest';
import { FalTtsProvider } from '../src/index';

const BASE = 'https://queue.fal.run';
const MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';
const APP = 'fal-ai/elevenlabs/tts'; // fal normalises status/result URLs to the app-level path
const REQUEST_ID = 'req-99';
const RESPONSE_URL = `${BASE}/${APP}/requests/${REQUEST_ID}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const opts = (fetchFn: typeof fetch) => ({ apiKey: 'k', fetchFn });

describe('FalTtsProvider', () => {
  it('is unavailable without an api key', () => {
    expect(new FalTtsProvider({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('submits to the fal queue with Key auth and body {text}, returns response_url as taskId', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalTtsProvider(opts(fetchFn));
    const { taskId } = await p.create({ text: 'Hello world' });
    expect(taskId).toBe(RESPONSE_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/${MODEL}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ text: 'Hello world' });
    expect(parsed).not.toHaveProperty('voice');
  });

  it('includes voice in the body when given', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ request_id: REQUEST_ID, response_url: RESPONSE_URL }),
    );
    const p = new FalTtsProvider(opts(fetchFn));
    await p.create({ text: 'Hi', voice: 'rachel' });
    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toMatchObject({ text: 'Hi', voice: 'rachel' });
  });

  it('falls back to constructing response_url from model path when fal omits response_url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ request_id: REQUEST_ID }));
    const { taskId } = await new FalTtsProvider(opts(fetchFn)).create({ text: 'x' });
    expect(taskId).toBe(`${BASE}/${MODEL}/requests/${REQUEST_ID}`);
  });

  it('reports processing while IN_PROGRESS (status only, no result fetch)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ status: 'IN_PROGRESS' }));
    const t = await new FalTtsProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t.state).toBe('processing');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${RESPONSE_URL}/status`);
  });

  it('fetches the result payload and returns audio.url when COMPLETED', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({ audio: { url: 'https://cdn/v.mp3' } }),
    );
    const t = await new FalTtsProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t).toEqual({ taskId: RESPONSE_URL, state: 'complete', audioUrl: 'https://cdn/v.mp3' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('maps a non-ok status response to failed', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ detail: 'gone' }, 500));
    expect((await new FalTtsProvider(opts(fetchFn)).getTask(RESPONSE_URL)).state).toBe('failed');
  });

  it('returns failed when result has no audio.url', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) =>
      String(a[0]).endsWith('/status') ? json({ status: 'COMPLETED' }) : json({ audio: {} }),
    );
    const t = await new FalTtsProvider(opts(fetchFn)).getTask(RESPONSE_URL);
    expect(t.state).toBe('failed');
  });
});
