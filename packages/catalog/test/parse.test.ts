import { describe, it, expect } from 'vitest';
import { parseImageModels } from '../src/parse';

const raw = {
  t2i: [
    { id: 'nano-banana', name: 'Nano Banana', inputs: { aspect_ratio: { enum: ['1:1', '16:9'] } } },
    { id: 'flux', name: 'FLUX', inputs: {} },
    { id: 42, name: 'bad-id' },
    { name: 'no-id' },
  ],
};

describe('parseImageModels', () => {
  it('maps valid t2i entries to CatalogModel and extracts aspect ratios', () => {
    const models = parseImageModels(raw);
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({ id: 'nano-banana', name: 'Nano Banana', category: 'image', aspectRatios: ['1:1', '16:9'] });
    expect(models[1]).toEqual({ id: 'flux', name: 'FLUX', category: 'image', aspectRatios: [] });
  });

  it('returns [] for missing/invalid t2i', () => {
    expect(parseImageModels({})).toEqual([]);
    expect(parseImageModels(null)).toEqual([]);
    expect(parseImageModels({ t2i: 'nope' })).toEqual([]);
  });
});
