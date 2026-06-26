import { describe, it, expect } from 'vitest';
import { brandKitToPrompt, applyBrandKit, isEmptyBrandKit, type BrandKit } from '../src/brandkit';

const kit: BrandKit = {
  name: 'Forgecast',
  tagline: 'Forge it, cast it',
  palette: ['#0A0604', '#FF7A1A'],
  fonts: { display: 'Bricolage Grotesque', body: 'IBM Plex Mono' },
  toneOfVoice: 'bold, terse, builder-to-builder',
  keyMessages: ['You own it', 'No lock-in'],
  notes: 'Molten forge energy.',
};

describe('brandKitToPrompt', () => {
  it('renders every facet into a compact preamble', () => {
    const out = brandKitToPrompt(kit);
    expect(out).toContain('brand "Forgecast" (Forge it, cast it)');
    expect(out).toContain('brand colors #0A0604, #FF7A1A');
    expect(out).toContain('typography Bricolage Grotesque + IBM Plex Mono');
    expect(out).toContain('tone bold, terse, builder-to-builder');
    expect(out).toContain('key messages: You own it; No lock-in');
    expect(out).toContain('Molten forge energy.');
  });

  it('returns just the notes when only notes are set', () => {
    expect(brandKitToPrompt({ notes: 'Keep it dark.' })).toBe('Keep it dark.');
  });
});

describe('applyBrandKit', () => {
  it('prepends the preamble to the user prompt', () => {
    const result = applyBrandKit(kit, 'a hero shot of sneakers');
    expect(result.startsWith('On-brand for brand "Forgecast"')).toBe(true);
    expect(result.endsWith('a hero shot of sneakers')).toBe(true);
  });

  it('is a no-op for an empty or absent kit', () => {
    expect(applyBrandKit(null, 'p')).toBe('p');
    expect(applyBrandKit({}, 'p')).toBe('p');
    expect(applyBrandKit({ palette: [] }, 'p')).toBe('p');
  });
});

describe('isEmptyBrandKit', () => {
  it('detects empty kits', () => {
    expect(isEmptyBrandKit(null)).toBe(true);
    expect(isEmptyBrandKit({})).toBe(true);
    expect(isEmptyBrandKit({ keyMessages: [] })).toBe(true);
    expect(isEmptyBrandKit({ name: 'X' })).toBe(false);
    expect(isEmptyBrandKit({ notes: 'hi' })).toBe(false);
  });
});
