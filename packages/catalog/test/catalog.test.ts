import { describe, it, expect } from 'vitest';
import { imageModels, videoModels, videoModelById } from '../src/index';

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

describe('videoModels (fal endpoints)', () => {
  // The two text-to-video endpoints the Studio submits (standard / boost quality).
  // fal's submit is lenient and queues an unknown variant as a no-op under the base
  // app, so an invalid id silently "succeeds" then 404s on result fetch. Pin the
  // exact endpoint ids that are verified to return a real video.
  it('exposes the standard and boost text-to-video endpoints used by the Studio', () => {
    const ids = videoModels.map((m) => m.id);
    expect(ids).toContain('fal-ai/wan/v2.2-a14b/text-to-video');
    expect(ids).toContain('fal-ai/veo3.1/fast');
  });

  it('does not ship the stale WAN endpoint that 404s on result fetch', () => {
    expect(videoModelById('fal-ai/wan/v2.2-14b/text-to-video')).toBeUndefined();
  });
});
