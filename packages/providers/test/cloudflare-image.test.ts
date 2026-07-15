import { describe, it, expect, vi } from 'vitest';
import { CloudflareImageProvider } from '../src/image/cloudflare';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

describe('CloudflareImageProvider', () => {
  it('is unavailable with neither a binding nor REST creds; available with either', () => {
    expect(new CloudflareImageProvider({}).isAvailable()).toBe(false);
    expect(new CloudflareImageProvider({ runner: { run: async () => ({}) } }).isAvailable()).toBe(true);
    expect(new CloudflareImageProvider({ accountId: 'a', apiToken: 't' }).isAvailable()).toBe(true);
  });

  it('generates via the AI binding and returns a data URI', async () => {
    const run = vi.fn(async () => ({ image: 'QUJD' })); // base64 for "ABC"
    const p = new CloudflareImageProvider({ runner: { run } });
    const out = await p.generateImage({ prompt: 'a fox' });
    expect(run).toHaveBeenCalledWith('@cf/black-forest-labs/flux-1-schnell', { prompt: 'a fox' });
    expect(out.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('generates via the REST fallback (result.image) when there is no binding', async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toContain('/accounts/acc/ai/run/@cf/black-forest-labs/flux-1-schnell');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify({ result: { image: 'REVG' }, success: true }), { status: 200 });
    });
    const p = new CloudflareImageProvider({ accountId: 'acc', apiToken: 'tok', fetchFn });
    const out = await p.generateImage({ prompt: 'a fox' });
    expect(out.url).toBe('data:image/jpeg;base64,REVG');
  });

  it('passes an overridden model + extra params through to the runner', async () => {
    const run = vi.fn(async () => ({ image: 'x' }));
    const p = new CloudflareImageProvider({ runner: { run } });
    await p.generateImage({ prompt: 'p', model: '@cf/other', extra: { steps: 6 } });
    expect(run).toHaveBeenCalledWith('@cf/other', { prompt: 'p', steps: 6 });
  });

  it('throws ProviderUnavailableError when unavailable', async () => {
    await expect(new CloudflareImageProvider({}).generateImage({ prompt: 'x' })).rejects.toThrow();
  });

  it('throws when the response has no image', async () => {
    const run = vi.fn(async () => ({ notImage: true }));
    const p = new CloudflareImageProvider({ runner: { run } });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/missing image/);
  });
});
