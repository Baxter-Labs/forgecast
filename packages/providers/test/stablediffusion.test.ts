import { describe, it, expect, vi } from 'vitest';
import { ProviderUnavailableError } from '@forgecast/core';
import { StableDiffusionImageProvider } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('StableDiffusionImageProvider', () => {
  it('is unavailable without a base url', () => {
    expect(new StableDiffusionImageProvider({ baseUrl: undefined }).isAvailable()).toBe(false);
    expect(new StableDiffusionImageProvider({ baseUrl: 'http://localhost:7860' }).isAvailable()).toBe(true);
  });

  it('POSTs txt2img and returns the base64 image as a data URI', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ images: ['QUJD'] }));
    const p = new StableDiffusionImageProvider({ baseUrl: 'http://localhost:7860/', steps: 30, cfgScale: 6, fetchFn });
    const r = await p.generateImage({ prompt: 'a glowing anvil', width: 768, height: 1024, extra: { negative_prompt: 'blurry' } });

    expect(r.url).toBe('data:image/png;base64,QUJD');
    expect(r.width).toBe(768);
    expect(r.height).toBe(1024);

    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('http://localhost:7860/sdapi/v1/txt2img'); // trailing slash stripped
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ prompt: 'a glowing anvil', width: 768, height: 1024, steps: 30, cfg_scale: 6, negative_prompt: 'blurry' });
  });

  it('throws ProviderUnavailableError when unconfigured', async () => {
    await expect(new StableDiffusionImageProvider({ baseUrl: undefined }).generateImage({ prompt: 'x' })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('throws when the response has no image', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ images: [] }));
    const p = new StableDiffusionImageProvider({ baseUrl: 'http://localhost:7860', fetchFn });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/missing image/);
  });
});
