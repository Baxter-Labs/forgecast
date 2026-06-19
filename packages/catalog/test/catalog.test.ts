import { describe, it, expect } from 'vitest';
import { imageModels } from '../src/index';

describe('imageModels (vendored catalog)', () => {
  it('loads many image models', () => {
    expect(imageModels.length).toBeGreaterThanOrEqual(40);
  });

  it('every model is well-formed', () => {
    for (const m of imageModels) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.name).toBe('string');
      expect(m.category).toBe('image');
      expect(Array.isArray(m.aspectRatios)).toBe(true);
    }
  });

  it('includes a known model id', () => {
    expect(imageModels.map((m) => m.id)).toContain('nano-banana');
  });
});
