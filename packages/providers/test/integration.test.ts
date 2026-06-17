import { describe, it, expect, vi } from 'vitest';
import { ImageProviderRegistry, FalImageProvider } from '../src/index';

describe('providers integration', () => {
  it('selects the fal provider from the registry and generates an image', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/i.png' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const registry = new ImageProviderRegistry();
    registry.register(new FalImageProvider({ apiKey: 'k', fetchFn }));

    expect(registry.available()).toEqual(['fal']);
    const provider = registry.get('fal');
    const result = await provider.generateImage({ prompt: 'a lighthouse' });

    expect(result.url).toBe('https://cdn.fal/i.png');
  });
});
