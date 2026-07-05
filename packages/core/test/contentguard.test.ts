import { describe, it, expect } from 'vitest';
import { checkContent, isContentAllowed } from '../src/index';

describe('checkContent — hard blocks (sexual content involving minors)', () => {
  it('blocks minor + sexual co-occurrence', () => {
    for (const t of [
      'a child, nude',
      'naked toddler',
      'a 12 year old in explicit poses',
      'schoolgirl porn',
      'preteen erotica',
    ]) {
      const r = checkContent(t);
      expect(r.ok, t).toBe(false);
      expect(r.category).toBe('sexual_minors');
    }
  });

  it('blocks explicit CSAM terms standalone', () => {
    expect(checkContent('csam').ok).toBe(false);
    expect(checkContent('child porn').ok).toBe(false);
    expect(checkContent('child sexual abuse material').ok).toBe(false);
  });
});

describe('checkContent — no false positives (word boundaries)', () => {
  it('allows innocent words that merely contain fragments', () => {
    for (const t of ['category', 'Ashkenazi', 'Al Gore', 'escorted the guests', 'asexual reproduction', 'the therapist']) {
      expect(isContentAllowed(t), t).toBe(true);
    }
  });

  it('allows adult / non-minor content (only the minors intersection is blocked)', () => {
    expect(isContentAllowed('an 18 year old model, nude')).toBe(true); // 18+ is not a minor
    expect(isContentAllowed('a nude oil painting')).toBe(true);        // adult art, no minor term
    expect(isContentAllowed('a teenager skateboarding at the park')).toBe(true); // minor term, no sexual term
  });

  it('allows ordinary creative prompts', () => {
    expect(isContentAllowed('a lone anvil glowing in a dark smithy, embers rising')).toBe(true);
    expect(isContentAllowed('launch our new running shoe with a punchy caption')).toBe(true);
  });
});

describe('checkContent — operator blocklist', () => {
  it('blocks configured terms (word-boundary, case-insensitive) and ignores substrings', () => {
    expect(checkContent('buy from AcmeRival now', ['acmerival']).ok).toBe(false);
    expect(checkContent('a badword here', [' badword ', '']).ok).toBe(false); // trims + skips empties
    expect(isContentAllowed('scunthorpe united', ['cunt'])).toBe(true);       // substring not matched (word boundary)
  });

  it('returns ok with no blocklist configured', () => {
    expect(checkContent('anything at all').ok).toBe(true);
  });
});
