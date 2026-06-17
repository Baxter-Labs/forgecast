import { describe, it, expect, vi } from 'vitest';
import { ProviderUnavailableError } from '@forgecast/core';
import { FalImageProvider } from '../src/image/fal';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FalImageProvider', () => {
  it('is unavailable without an API key', () => {
    const p = new FalImageProvider({ apiKey: undefined });
    expect(p.isAvailable()).toBe(false);
  });

  it('throws ProviderUnavailableError when generating without a key', async () => {
    const p = new FalImageProvider({ apiKey: undefined });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('posts the prompt and returns the first image url', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ images: [{ url: 'https://cdn.fal/out.png', width: 1024, height: 1024 }] }),
    );
    const p = new FalImageProvider({ apiKey: 'k-test', model: 'fal-ai/flux/schnell', fetchFn });

    const result = await p.generateImage({ prompt: 'a fox', width: 1024, height: 1024 });

    expect(result.url).toBe('https://cdn.fal/out.png');
    expect(result.width).toBe(1024);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://fal.run/fal-ai/flux/schnell');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k-test' });
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.prompt).toBe('a fox');
    expect(sentBody.image_size).toEqual({ width: 1024, height: 1024 });
  });

  it('raises a descriptive error on a non-2xx response', async () => {
    const fetchFn = vi.fn(async () => new Response('quota exceeded', { status: 429 }));
    const p = new FalImageProvider({ apiKey: 'k-test', fetchFn });
    await expect(p.generateImage({ prompt: 'a fox' })).rejects.toThrowError(
      /fal request failed \(429\): quota exceeded/,
    );
  });

  it('raises when the response has no image', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ images: [] }));
    const p = new FalImageProvider({ apiKey: 'k-test', fetchFn });
    await expect(p.generateImage({ prompt: 'a fox' })).rejects.toThrowError(
      /response missing image url/,
    );
  });
});
