import { describe, it, expect } from 'vitest';
import {
  SHOT_PRESETS,
  LENS_PRESETS,
  MOVE_PRESETS,
  LOOK_PRESETS,
  CINEMA_GROUPS,
  cinemaPresetById,
  resolveCinemaSelection,
  composeCinemaPrompt,
} from '../src/index';

describe('cinema presets', () => {
  it('exposes the four racks with stable ids and non-empty modifiers', () => {
    expect(SHOT_PRESETS.map((p) => p.id)).toEqual([
      'establishing', 'wide', 'medium', 'close-up', 'extreme-close-up', 'over-the-shoulder', 'pov',
    ]);
    expect(LENS_PRESETS.map((p) => p.id)).toEqual([
      'wide-24mm', 'standard-50mm', 'portrait-85mm', 'macro', 'fisheye', 'anamorphic',
    ]);
    expect(MOVE_PRESETS.map((p) => p.id)).toEqual([
      'static', 'dolly-in', 'dolly-out', 'pan', 'tilt', 'crane', 'orbit', 'handheld', 'crash-zoom', 'whip-pan', 'fpv-drone', 'hyperlapse',
    ]);
    expect(LOOK_PRESETS.map((p) => p.id)).toEqual([
      'cinematic', 'teal-orange', 'noir-bw', 'warm-film', 'cold-blue', 'vibrant-hdr', 'vintage-8mm',
    ]);
    for (const p of [...SHOT_PRESETS, ...LENS_PRESETS, ...MOVE_PRESETS, ...LOOK_PRESETS]) {
      expect(p.modifier.length).toBeGreaterThan(10);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('CINEMA_GROUPS iterates racks in compose order (shot → lens → move → look)', () => {
    expect(CINEMA_GROUPS.map((g) => g.id)).toEqual(['shot', 'lens', 'move', 'look']);
    expect(CINEMA_GROUPS[0]!.presets).toBe(SHOT_PRESETS);
    expect(CINEMA_GROUPS[3]!.presets).toBe(LOOK_PRESETS);
  });

  it('cinemaPresetById resolves within a rack and rejects unknown/cross-rack ids', () => {
    expect(cinemaPresetById('lens', 'portrait-85mm')?.label).toBe('85mm portrait');
    expect(cinemaPresetById('lens', 'nope')).toBeUndefined();
    // ids are rack-scoped: a shot id must not resolve under the lens rack.
    expect(cinemaPresetById('lens', 'wide')).toBeUndefined();
  });
});

describe('composeCinemaPrompt', () => {
  const base = 'a fox running through snow';

  it('returns the base prompt unchanged when nothing is selected', () => {
    expect(composeCinemaPrompt(base, {})).toBe(base);
  });

  it('appends a single rack modifier', () => {
    const out = composeCinemaPrompt(base, { shot: 'close-up' });
    expect(out).toContain(base);
    expect(out).toContain('shot as a tight close-up');
  });

  it('folds each rack individually', () => {
    expect(composeCinemaPrompt(base, { lens: 'portrait-85mm' })).toContain('85mm portrait lens with shallow depth of field');
    expect(composeCinemaPrompt(base, { move: 'dolly-in' })).toContain('slow dolly-in camera move');
    expect(composeCinemaPrompt(base, { look: 'teal-orange' })).toContain('teal-and-orange cinematic color palette');
  });

  it('folds all four racks in shot → lens → move → look order', () => {
    const out = composeCinemaPrompt(base, { look: 'noir-bw', move: 'orbit', lens: 'macro', shot: 'wide' });
    const iShot = out.indexOf('wide shot');
    const iLens = out.indexOf('macro lens');
    const iMove = out.indexOf('orbiting camera');
    const iLook = out.indexOf('black-and-white film noir');
    expect(iShot).toBeGreaterThan(-1);
    expect(iLens).toBeGreaterThan(iShot);
    expect(iMove).toBeGreaterThan(iLens);
    expect(iLook).toBeGreaterThan(iMove);
  });

  it('ignores unknown ids (whitelist) and keeps valid ones', () => {
    const out = composeCinemaPrompt(base, { shot: 'not-a-shot', look: 'warm-film' });
    expect(out).not.toContain('not-a-shot');
    expect(out).toContain('warm golden film tones');
    // an all-unknown selection leaves the prompt untouched
    expect(composeCinemaPrompt(base, { shot: 'x', lens: 'y', move: 'z', look: 'w' })).toBe(base);
  });
});

describe('resolveCinemaSelection', () => {
  it('drops unknown ids and preserves valid ones for provenance stamping', () => {
    expect(resolveCinemaSelection({ shot: 'close-up', lens: 'bogus', move: 'pan' })).toEqual({ shot: 'close-up', move: 'pan' });
    expect(resolveCinemaSelection({})).toEqual({});
    expect(resolveCinemaSelection({ look: 'cinematic' })).toEqual({ look: 'cinematic' });
  });
});
