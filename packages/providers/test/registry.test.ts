import { describe, it, expect } from 'vitest';
import type { ImageProvider, GenerateImageInput, ImageResult } from '@forgecast/core';
import { ImageProviderRegistry } from '../src/registry';

function makeProvider(name: string, available: boolean): ImageProvider {
  return {
    name,
    isAvailable: () => available,
    async generateImage(_input: GenerateImageInput): Promise<ImageResult> {
      return { url: `https://example.test/${name}.png` };
    },
  };
}

describe('ImageProviderRegistry', () => {
  it('registers and retrieves a provider by name', () => {
    const reg = new ImageProviderRegistry();
    const p = makeProvider('fal', true);
    reg.register(p);
    expect(reg.get('fal')).toBe(p);
  });

  it('throws for an unknown provider', () => {
    const reg = new ImageProviderRegistry();
    expect(() => reg.get('nope')).toThrowError(/unknown image provider: nope/i);
  });

  it('lists only available providers', () => {
    const reg = new ImageProviderRegistry();
    reg.register(makeProvider('fal', true));
    reg.register(makeProvider('replicate', false));
    expect(reg.available()).toEqual(['fal']);
  });
});
