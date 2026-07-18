import { describe, it, expect } from 'vitest';
import { ANGLE_PRESETS, LIGHT_PRESETS, composeReimagineInstruction } from '../src/index';

describe('reimagine presets', () => {
  it('exposes stable angle + light preset ids with instructions', () => {
    expect(ANGLE_PRESETS.map((p) => p.id)).toContain('low-angle');
    expect(LIGHT_PRESETS.map((p) => p.id)).toContain('golden-hour');
    for (const p of [...ANGLE_PRESETS, ...LIGHT_PRESETS]) {
      expect(p.instruction.length).toBeGreaterThan(20);
    }
    // Light presets must not touch camera/composition; angle presets must not touch lighting.
    for (const p of LIGHT_PRESETS) expect(p.instruction.toLowerCase()).toMatch(/only the lighting|camera identical/);
    for (const p of ANGLE_PRESETS) expect(p.instruction.toLowerCase()).toMatch(/lighting identical/);
  });

  it('composes preset only, custom only, both, and reports fromPreset for model routing', () => {
    const presetOnly = composeReimagineInstruction(ANGLE_PRESETS, { preset: 'low-angle' });
    expect(presetOnly).toMatchObject({ ok: true, fromPreset: true });
    expect((presetOnly as { instruction: string }).instruction).toMatch(/low angle/i);

    const customOnly = composeReimagineInstruction(ANGLE_PRESETS, { instruction: '  orbit 30 degrees left  ' });
    expect(customOnly).toMatchObject({ ok: true, fromPreset: false, instruction: 'orbit 30 degrees left' });

    const both = composeReimagineInstruction(LIGHT_PRESETS, { preset: 'noir', instruction: 'add a rim light' });
    expect(both).toMatchObject({ ok: true, fromPreset: true });
    expect((both as { instruction: string }).instruction).toMatch(/noir.*rim light/is);
  });

  it('rejects neither and unknown presets with the valid-id list', () => {
    const neither = composeReimagineInstruction(ANGLE_PRESETS, {});
    expect(neither.ok).toBe(false);
    expect((neither as { error: string }).error).toMatch(/preset or a custom instruction/);
    const unknown = composeReimagineInstruction(ANGLE_PRESETS, { preset: 'orbit-360' });
    expect(unknown.ok).toBe(false);
    expect((unknown as { error: string }).error).toMatch(/unknown preset.*low-angle/is);
  });
});
