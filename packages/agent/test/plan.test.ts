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
});
