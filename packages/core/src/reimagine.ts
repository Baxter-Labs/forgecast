/**
 * Re-angle & Re-light presets — one-click camera re-angling and scene relighting
 * for still images (Higgsfield Relight / Runway Aleph class), expressed as precise
 * edit instructions for an instruction-following image editor.
 *
 * Pure data + composition helpers: the api layer composes the final instruction
 * (preset, custom, or both) and routes it onto the existing `edit` job pipeline;
 * the UI renders the same presets as chips. No provider knowledge lives here.
 */

export interface ReimaginePreset {
  /** Stable machine id (also the MCP enum value). */
  id: string;
  /** Short human label for the UI chip. */
  label: string;
  /** The full edit instruction sent to the image editor. */
  instruction: string;
}

/** Camera re-angle presets — change ONLY the camera; subject, scene and lighting stay put. */
export const ANGLE_PRESETS: readonly ReimaginePreset[] = [
  {
    id: 'front',
    label: 'Front',
    instruction:
      'Rotate the camera to a straight-on front view of the subject at eye level, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'low-angle',
    label: 'Low angle',
    instruction:
      'Rotate the camera to a low angle looking up at the subject, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'high-angle',
    label: 'High angle',
    instruction:
      'Rotate the camera to a high angle looking down at the subject, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'side-profile',
    label: 'Side profile',
    instruction:
      'Rotate the camera 90 degrees to a side profile view of the subject, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'three-quarter',
    label: '3/4 view',
    instruction:
      'Rotate the camera to a three-quarter view of the subject, halfway between front and profile, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'from-behind',
    label: 'From behind',
    instruction:
      'Rotate the camera behind the subject so they are seen from the back, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'close-up',
    label: 'Close-up',
    instruction:
      'Move the camera in to a tight close-up on the subject, keep the subject, scene, background and lighting identical.',
  },
  {
    id: 'wide-shot',
    label: 'Wide shot',
    instruction:
      'Pull the camera back to a wide shot revealing the full scene around the subject, keep the subject, scene, background and lighting identical.',
  },
];

/** Relighting presets — change ONLY the lighting; subject, composition and camera stay put. */
export const LIGHT_PRESETS: readonly ReimaginePreset[] = [
  {
    id: 'golden-hour',
    label: 'Golden hour',
    instruction:
      'Relight the scene as warm golden-hour backlight with a low sun and long soft shadows, keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'studio-softbox',
    label: 'Studio softbox',
    instruction:
      'Relight the scene as clean studio softbox lighting — soft, even, diffused key with gentle fill — keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'neon-night',
    label: 'Neon night',
    instruction:
      'Relight the scene as a neon-lit night with vivid magenta and cyan glow and deep shadows, keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'overcast',
    label: 'Overcast',
    instruction:
      'Relight the scene as flat overcast daylight — soft, diffuse, nearly shadowless — keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'candlelight',
    label: 'Candlelight',
    instruction:
      'Relight the scene as intimate low-key candlelight with a warm flickering orange glow, keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'noir',
    label: 'Noir',
    instruction:
      'Relight the scene as high-contrast film-noir lighting — one hard key light, dramatic deep shadows — keep the subject, composition and camera identical — change only the lighting.',
  },
  {
    id: 'dawn',
    label: 'Dawn',
    instruction:
      'Relight the scene as cool pre-sunrise dawn light with a soft blue-pink sky glow, keep the subject, composition and camera identical — change only the lighting.',
  },
];

export function anglePresetById(id: string): ReimaginePreset | undefined {
  return ANGLE_PRESETS.find((p) => p.id === id);
}

export function lightPresetById(id: string): ReimaginePreset | undefined {
  return LIGHT_PRESETS.find((p) => p.id === id);
}

export type ReimagineComposeResult =
  | { ok: true; instruction: string; /** True when a preset drove the instruction (model routing hint). */ fromPreset: boolean }
  | { ok: false; error: string };

/**
 * Compose the final edit instruction from a preset id and/or a custom instruction.
 *  - preset only  → the preset's instruction verbatim.
 *  - custom only  → the trimmed custom instruction.
 *  - both         → preset instruction first, custom appended (the preset anchors
 *                   the transform; the custom text refines it).
 *  - neither / unknown preset → { ok: false } with an actionable error listing
 *    the valid preset ids.
 */
export function composeReimagineInstruction(
  presets: readonly ReimaginePreset[],
  input: { preset?: string; instruction?: string },
): ReimagineComposeResult {
  const validIds = presets.map((p) => p.id).join(', ');
  const custom = typeof input.instruction === 'string' ? input.instruction.trim() : '';

  if (input.preset !== undefined && input.preset !== '') {
    const preset = presets.find((p) => p.id === input.preset);
    if (!preset) {
      return { ok: false, error: `unknown preset "${input.preset}" — valid presets: ${validIds}` };
    }
    return { ok: true, instruction: custom ? `${preset.instruction} ${custom}` : preset.instruction, fromPreset: true };
  }

  if (custom.length > 0) return { ok: true, instruction: custom, fromPreset: false };

  return { ok: false, error: `a preset or a custom instruction is required — valid presets: ${validIds}` };
}
