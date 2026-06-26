import { describe, it, expect } from 'vitest';
import {
  platformCopySpec,
  buildAdCopyPrompt,
  parseAdCopyVariants,
  type BrandKit,
} from '../src/index';

describe('platformCopySpec', () => {
  it('returns the right character limit per platform', () => {
    expect(platformCopySpec('twitter').limit).toBe(280);
    expect(platformCopySpec('instagram').limit).toBe(2200);
    expect(platformCopySpec('linkedin').limit).toBe(3000);
    expect(platformCopySpec('google').limit).toBe(90); // RSA description
  });

  it('is case-insensitive and aliases x -> twitter', () => {
    expect(platformCopySpec('X').platform).toBe('twitter');
    expect(platformCopySpec('Instagram').platform).toBe('instagram');
  });

  it('falls back to a sane generic spec for unknown platforms', () => {
    const spec = platformCopySpec('mastodon');
    expect(spec.limit).toBeGreaterThan(0);
    expect(spec.guidance.length).toBeGreaterThan(0);
  });
});

describe('buildAdCopyPrompt', () => {
  const spec = platformCopySpec('twitter');

  it('encodes the count, platform and a hard character constraint', () => {
    const { system, user } = buildAdCopyPrompt({ brief: 'Launch our forge', spec, count: 3 });
    expect(system).toContain('3');
    expect(system).toContain('280');
    expect(system).toMatch(/X|Twitter/);
    expect(system.toLowerCase()).toContain('json array');
    expect(user).toContain('Launch our forge');
  });

  it('folds in brand voice when a brand kit is given', () => {
    const kit: BrandKit = { name: 'Forgecast', toneOfVoice: 'bold, terse, builder-to-builder' };
    const { system } = buildAdCopyPrompt({ brief: 'x', spec, count: 2, brandKit: kit });
    expect(system).toContain('Forgecast');
    expect(system).toContain('builder-to-builder');
  });

  it('omits the brand line for an empty kit', () => {
    const { system } = buildAdCopyPrompt({ brief: 'x', spec, count: 2, brandKit: {} });
    expect(system).not.toContain('Brand:');
  });
});

describe('parseAdCopyVariants', () => {
  const spec = platformCopySpec('twitter');

  it('parses a JSON array of strings and tags them A/B/C with char counts', () => {
    const raw = '["First angle", "Second angle", "Third angle"]';
    const out = parseAdCopyVariants(raw, spec, 3);
    expect(out.map((v) => v.id)).toEqual(['A', 'B', 'C']);
    expect(out[0]).toMatchObject({ text: 'First angle', chars: 'First angle'.length });
  });

  it('tolerates a fenced ```json block and surrounding prose', () => {
    const raw = 'Sure!\n```json\n["one", "two"]\n```\nHope that helps.';
    const out = parseAdCopyVariants(raw, spec, 2);
    expect(out.map((v) => v.text)).toEqual(['one', 'two']);
  });

  it('extracts the text field when the model returns objects', () => {
    const raw = '[{"text":"alpha"},{"copy":"beta"}]';
    const out = parseAdCopyVariants(raw, spec, 2);
    expect(out.map((v) => v.text)).toEqual(['alpha', 'beta']);
  });

  it('falls back to line-splitting when there is no JSON', () => {
    const raw = '1. First line\n2) Second line\n- Third line';
    const out = parseAdCopyVariants(raw, spec, 3);
    expect(out.map((v) => v.text)).toEqual(['First line', 'Second line', 'Third line']);
  });

  it('enforces the platform character limit (clips overlong variants)', () => {
    const long = 'x'.repeat(400);
    const out = parseAdCopyVariants(JSON.stringify([long]), spec, 1);
    expect(out[0]!.chars).toBeLessThanOrEqual(spec.limit);
    expect(out[0]!.text.length).toBeLessThanOrEqual(spec.limit);
  });

  it('never returns more than the requested count', () => {
    const raw = '["a","b","c","d","e"]';
    expect(parseAdCopyVariants(raw, spec, 2)).toHaveLength(2);
  });
});
