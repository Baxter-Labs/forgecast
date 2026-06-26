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
    // Type the mock's params as fetch's params so mock.calls is a typed tuple
    // ([input, init?]) under strict tsc (noUncheckedIndexedAccess + strict).
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) =>
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

  it('uses per-call model override and parses single {image:{url}} response (upscaler shape)', async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      new Response(JSON.stringify({ image: { url: 'https://cdn.fal/up.png', width: 2048, height: 2048 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const p = new FalImageProvider({ apiKey: 'k-test', model: 'fal-ai/flux/schnell', fetchFn });

    const result = await p.generateImage({
      prompt: 'enhance quality',
      model: 'fal-ai/clarity-upscaler',
      extra: { image_url: 'https://example.com/src.png' },
    });

    expect(result.url).toBe('https://cdn.fal/up.png');
    expect(result.width).toBe(2048);
    const [url, init] = fetchFn.mock.calls[0]!;
    // Must post to the per-call model, not the provider default
    expect(url).toBe('https://fal.run/fal-ai/clarity-upscaler');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.image_url).toBe('https://example.com/src.png');
  });

  it('passes extra params through, and extra takes precedence over mapped fields', async () => {
    const fetchFn = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      jsonResponse({ images: [{ url: 'https://cdn.fal/o.png' }] }),
    );
    const p = new FalImageProvider({ apiKey: 'k-test', fetchFn });

    await p.generateImage({
      prompt: 'a fox',
      width: 512,
      height: 512,
      extra: { num_inference_steps: 8, image_size: 'square_hd' },
    });

    const init = fetchFn.mock.calls[0]![1];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.num_inference_steps).toBe(8);
    // extra.image_size overrides the width/height-derived value:
    expect(sentBody.image_size).toBe('square_hd');
  });
});
