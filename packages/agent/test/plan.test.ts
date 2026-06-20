import { describe, it, expect } from 'vitest';
import { parsePlan } from '../src/plan';

const planJson = {
  concept: 'Eco sneaker launch teaser',
  trendingNotes: 'fast cuts, bold captions',
  assets: [
    { kind: 'video', prompt: 'a sneaker forming from leaves', aspectRatio: '9:16' },
    { kind: 'image', prompt: 'hero shot of the sneaker' },
  ],
  posts: [
    { platform: 'instagram', caption: 'Drop incoming 🌱' },
    { platform: 'linkedin', caption: 'Sustainable footwear, reimagined.' },
  ],
};

describe('parsePlan', () => {
  it('parses raw JSON', () => {
    const plan = parsePlan(JSON.stringify(planJson));
    expect(plan.concept).toBe('Eco sneaker launch teaser');
    expect(plan.assets).toHaveLength(2);
    expect(plan.assets[0]).toEqual({ kind: 'video', prompt: 'a sneaker forming from leaves', aspectRatio: '9:16' });
    expect(plan.posts.map((p) => p.platform)).toEqual(['instagram', 'linkedin']);
  });

  it('parses JSON inside a ```json fenced block with prose around it', () => {
    const raw = 'Here is the plan:\n```json\n' + JSON.stringify(planJson) + '\n```\nHope that helps!';
    expect(parsePlan(raw).concept).toBe('Eco sneaker launch teaser');
  });

  it('parses JSON embedded in prose without a fence', () => {
    const raw = 'Sure! ' + JSON.stringify(planJson) + ' Done.';
    expect(parsePlan(raw).assets).toHaveLength(2);
  });

  it('drops malformed items and defaults missing fields', () => {
    const plan = parsePlan(JSON.stringify({ assets: [{ kind: 'image', prompt: 'ok' }, { kind: 'nope' }, { prompt: 'no kind' }], posts: [{ platform: 'x', caption: 'hi' }, { caption: 'no platform' }] }));
    expect(plan.concept).toBe('');
    expect(plan.assets).toHaveLength(1);
    expect(plan.posts).toHaveLength(1);
  });

  it('parses a montage directive with scenes', () => {
    const scenes = [
      { prompt: 'clip a', aspectRatio: '9:16' },
      { prompt: 'clip b', aspectRatio: '9:16' },
      { prompt: 'clip c', aspectRatio: '9:16' },
    ];
    const plan = parsePlan(JSON.stringify({ ...planJson, montage: { aspectRatio: '9:16', scenes } }));
    expect(plan.montage).toEqual({ aspectRatio: '9:16', scenes });
  });

  it('requires at least 2 valid scenes; drops malformed/absent montage', () => {
    // No scenes → undefined
    expect(parsePlan(JSON.stringify({ ...planJson, montage: { aspectRatio: '9:16' } })).montage).toBeUndefined();
    expect(parsePlan(JSON.stringify({ ...planJson, montage: {} })).montage).toBeUndefined();
    // 1 scene → undefined (need at least 2)
    expect(parsePlan(JSON.stringify({ ...planJson, montage: { scenes: [{ prompt: 'a' }] } })).montage).toBeUndefined();
    // 2 valid scenes → ok
    const two = parsePlan(JSON.stringify({ ...planJson, montage: { scenes: [{ prompt: 'a' }, { prompt: 'b' }] } }));
    expect(two.montage?.scenes).toHaveLength(2);
    // Scenes with missing prompts are dropped
    const mixed = parsePlan(JSON.stringify({ ...planJson, montage: { scenes: [{ prompt: 'a' }, {}, { prompt: 'c' }] } }));
    expect(mixed.montage?.scenes).toHaveLength(2);
    // Non-object montage → undefined
    expect(parsePlan(JSON.stringify({ ...planJson, montage: 'yes' })).montage).toBeUndefined();
    expect(parsePlan(JSON.stringify({ ...planJson, montage: ['x'] })).montage).toBeUndefined();
    expect(parsePlan(JSON.stringify(planJson)).montage).toBeUndefined();
  });
});
