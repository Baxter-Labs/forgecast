import { describe, it, expect, vi } from 'vitest';
import { WisprFlowTranscriber } from '../src/index';

const BASE_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const opts = (fetchFn: typeof fetch) => ({ apiKey: 'test-key', fetchFn });

describe('WisprFlowTranscriber', () => {
  it('is unavailable without an api key', () => {
    expect(new WisprFlowTranscriber({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('is available with an api key', () => {
    expect(new WisprFlowTranscriber({ apiKey: 'k' }).isAvailable()).toBe(true);
  });

  it('posts to the endpoint with Bearer auth and {audio} body', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ id: 'r1', text: 'hello world', detected_language: 'en' }),
    );
    const t = new WisprFlowTranscriber(opts(fetchFn));
    const result = await t.transcribe({ audioBase64Wav: 'base64wav==' });

    expect(result.text).toBe('hello world');
    expect(result.detectedLanguage).toBe('en');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(BASE_URL);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed).toMatchObject({ audio: 'base64wav==' });
    expect(parsed).not.toHaveProperty('language');
  });

  it('includes language in the body when given', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ text: 'bonjour', detected_language: 'fr' }),
    );
    const t = new WisprFlowTranscriber(opts(fetchFn));
    await t.transcribe({ audioBase64Wav: 'abc', language: ['fr'] });

    const parsed = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(parsed).toMatchObject({ audio: 'abc', language: ['fr'] });
  });

  it('returns the transcript text from the response', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ id: 'r2', text: 'forge it', detected_language: 'en', total_time: 0.4, generated_tokens: 3 }),
    );
    const result = await new WisprFlowTranscriber(opts(fetchFn)).transcribe({ audioBase64Wav: 'x' });
    expect(result.text).toBe('forge it');
    expect(result.detectedLanguage).toBe('en');
  });

  it('maps a non-ok response to a thrown error', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      new Response('Unauthorized', { status: 401 }),
    );
    await expect(
      new WisprFlowTranscriber(opts(fetchFn)).transcribe({ audioBase64Wav: 'x' }),
    ).rejects.toThrow('wispr flow transcription failed (401)');
  });

  it('throws when no api key is configured', async () => {
    const fetchFn = vi.fn();
    await expect(
      new WisprFlowTranscriber({ apiKey: undefined, fetchFn }).transcribe({ audioBase64Wav: 'x' }),
    ).rejects.toThrow('wispr flow not configured');
  });
});
