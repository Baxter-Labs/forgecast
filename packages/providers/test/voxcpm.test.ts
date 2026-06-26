import { describe, it, expect, vi } from 'vitest';
import { VoxCpmVoiceProvider } from '../src/index';

const BASE = 'http://localhost:8770';
const AUDIO_URL = 'https://cdn.example.com/audio/test.wav';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function text(body: string, status: number): Response {
  return new Response(body, { status });
}

const opts = (fetchFn: typeof fetch) => ({ baseUrl: BASE, fetchFn });

describe('VoxCpmVoiceProvider', () => {
  it('is unavailable without VOXCPM_URL or baseUrl', () => {
    // No baseUrl, no env — should be unavailable.
    const p = new VoxCpmVoiceProvider({ baseUrl: undefined });
    expect(p.isAvailable()).toBe(false);
  });

  it('is available when baseUrl is provided', () => {
    expect(new VoxCpmVoiceProvider({ baseUrl: BASE }).isAvailable()).toBe(true);
  });

  it('posts to ${baseUrl}/tts with {text} and returns audio_url as taskId', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ audio_url: AUDIO_URL }),
    );
    const p = new VoxCpmVoiceProvider(opts(fetchFn));
    const { taskId } = await p.create({ text: 'Hello VoxCPM' });
    expect(taskId).toBe(AUDIO_URL);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/tts`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ text: 'Hello VoxCPM' });
    expect(parsed).not.toHaveProperty('voice');
  });

  it('includes voice in the body when given', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ audio_url: AUDIO_URL }),
    );
    const p = new VoxCpmVoiceProvider(opts(fetchFn));
    await p.create({ text: 'Hi', voice: 'warm and calm' });
    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toMatchObject({ text: 'Hi', voice: 'warm and calm' });
  });

  it('resolves a relative /audio/x.wav path against baseUrl', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ audio_url: '/audio/x.wav' }),
    );
    const p = new VoxCpmVoiceProvider(opts(fetchFn));
    const { taskId } = await p.create({ text: 'relative path test' });
    expect(taskId).toBe(`${BASE}/audio/x.wav`);
  });

  it('throws when the response is not ok', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      text('service unavailable', 503),
    );
    const p = new VoxCpmVoiceProvider(opts(fetchFn));
    await expect(p.create({ text: 'boom' })).rejects.toThrow(
      'voxcpm tts failed (503): service unavailable',
    );
  });

  it('throws when audio_url is missing from the response', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    const p = new VoxCpmVoiceProvider(opts(fetchFn));
    await expect(p.create({ text: 'no url' })).rejects.toThrow(
      'voxcpm response missing audio_url',
    );
  });

  it('getTask returns {state:"complete", audioUrl: taskId} without calling fetch', async () => {
    const fetchFn = vi.fn();
    const p = new VoxCpmVoiceProvider(opts(fetchFn as unknown as typeof fetch));
    const result = await p.getTask(AUDIO_URL);
    expect(result).toEqual({ taskId: AUDIO_URL, state: 'complete', audioUrl: AUDIO_URL });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
