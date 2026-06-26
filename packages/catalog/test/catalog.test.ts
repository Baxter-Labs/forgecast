import { describe, it, expect } from 'vitest';
import { imageModels, openImageModels, videoModels, videoModelById, imageModelById, defaultImageModelId } from '../src/index';

describe('imageModels (curated, fal-runnable)', () => {
  it('every model is well-formed and uses a fal-ai endpoint id', () => {
    expect(imageModels.length).toBeGreaterThanOrEqual(2);
    for (const m of imageModels) {
      expect(typeof m.id).toBe('string');
      expect(m.id.startsWith('fal-ai/')).toBe(true); // a real, submittable endpoint
      expect(typeof m.name).toBe('string');
      expect(m.category).toBe('image');
      expect(Array.isArray(m.aspectRatios)).toBe(true);
      expect(m.sizing === 'aspect_ratio' || m.sizing === 'image_size' || m.sizing === undefined).toBe(true);
    }
  });

  it('defaults to Nano Banana (aspect_ratio sizing), first in the list', () => {
    expect(defaultImageModelId).toBe('fal-ai/nano-banana');
    expect(imageModelById('fal-ai/nano-banana')?.sizing).toBe('aspect_ratio');
    expect(imageModels[0]?.id).toBe('fal-ai/nano-banana'); // the default selection
  });

  it('marks the FLUX family as image_size sizing', () => {
    expect(imageModelById('fal-ai/flux/schnell')?.sizing).toBe('image_size');
  });

  it('still exposes the full open browse catalog separately', () => {
    expect(openImageModels.length).toBeGreaterThanOrEqual(40);
    expect(openImageModels.map((m) => m.id)).toContain('nano-banana');
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
