import { describe, it, expect, vi } from 'vitest';
import { OpenAiImageProvider } from '../src/image/openai';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('OpenAiImageProvider', () => {
  it('is unavailable without a key, available with one', () => {
    expect(new OpenAiImageProvider({ apiKey: undefined }).isAvailable()).toBe(false);
    expect(new OpenAiImageProvider({ apiKey: 'sk-1' }).isAvailable()).toBe(true);
  });

  it('posts to the images endpoint with Bearer auth + model and returns a data URL for b64', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe('https://api.openai.com/v1/images/generations');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-1');
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('gpt-image-1');
      expect(body.prompt).toBe('a fox');
      expect(body.size).toBe('1024x1024');
      expect('response_format' in body).toBe(false); // gpt-image-1 rejects it
      return new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }] }), { status: 200 });
    });
    const r = await new OpenAiImageProvider({ apiKey: 'sk-1', fetchFn }).generateImage({ prompt: 'a fox' });
    expect(r.url).toBe('data:image/png;base64,QUJD');
  });

  it('maps orientation to the right size and sends response_format for dall-e', async () => {
    const seen: Record<string, unknown>[] = [];
    const fetchFn = mockFetch((_url, init) => {
      seen.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ data: [{ url: 'https://img/x.png' }] }), { status: 200 });
    });
    const p = new OpenAiImageProvider({ apiKey: 'sk-1', model: 'dall-e-3', fetchFn });
    const land = await p.generateImage({ prompt: 'p', width: 1536, height: 864 });
    const port = await p.generateImage({ prompt: 'p', width: 864, height: 1536 });
    expect(seen[0]!.size).toBe('1792x1024');
    expect(seen[1]!.size).toBe('1024x1792');
    expect(seen[0]!.response_format).toBe('b64_json');
    expect(land.url).toBe('https://img/x.png'); // a returned url passes through
    expect(port.url).toBe('https://img/x.png');
  });

  it('throws a descriptive error on a non-200', async () => {
    const fetchFn = mockFetch(() => new Response('nope', { status: 401 }));
    await expect(new OpenAiImageProvider({ apiKey: 'sk-1', fetchFn }).generateImage({ prompt: 'p' }))
      .rejects.toThrow(/OpenAI image request failed \(401\)/);
  });
});
