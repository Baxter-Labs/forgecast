import { describe, it, expect } from 'vitest';
import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '../src/providers';

class FakeProvider implements ImageProvider {
  readonly name = 'fake';
  constructor(private available: boolean) {}
  isAvailable(): boolean {
    return this.available;
  }
  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);
    return { url: `https://example.test/${encodeURIComponent(input.prompt)}.png` };
  }
}

describe('ImageProvider contract', () => {
  it('an available provider returns an image result', async () => {
    const p = new FakeProvider(true);
    const result = await p.generateImage({ prompt: 'sunset' });
    expect(result.url).toBe('https://example.test/sunset.png');
  });

  it('an unavailable provider throws ProviderUnavailableError naming itself', async () => {
    const p = new FakeProvider(false);
    await expect(p.generateImage({ prompt: 'sunset' })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    await expect(p.generateImage({ prompt: 'sunset' })).rejects.toMatchObject({
      providerName: 'fake',
    });
  });
});
