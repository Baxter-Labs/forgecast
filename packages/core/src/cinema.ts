/**
 * Cinema preset rack — one-click cinematic direction for video generation,
 * expressed as prompt-modifier chips across four racks: SHOT / LENS / MOVE / LOOK
 * (the Higgsfield "Virtual Camera Rack" / LTX shot-controls class).
 *
 * Prompt-modifier approach on purpose: each preset is a plain phrase folded into
 * the generation prompt, so it steers EVERY video provider — including the free,
 * keyless ones — without needing a dedicated camera-control API (the OpenArt/clone
 * pattern). Pure data + a compose helper: the api layer folds the selected
 * modifiers into the prompt right where the brand kit is applied; the UI renders
 * the same presets as single-select chips. No provider knowledge lives here.
 */

/** Which rack a preset belongs to. */
export type CinemaGroup = 'shot' | 'lens' | 'move' | 'look';

export interface CinemaPreset {
  /** Stable machine id (also the MCP enum value). */
  id: string;
  /** The rack this preset belongs to. */
  group: CinemaGroup;
  /** Short human label for the UI chip. */
  label: string;
  /** The phrase appended to the generation prompt when selected. */
  modifier: string;
}

/** SHOT — how the frame is composed around the subject. */
export const SHOT_PRESETS: readonly CinemaPreset[] = [
  { id: 'establishing', group: 'shot', label: 'Establishing', modifier: 'framed as a wide establishing shot that sets the scene' },
  { id: 'wide', group: 'shot', label: 'Wide', modifier: 'framed as a wide shot' },
  { id: 'medium', group: 'shot', label: 'Medium', modifier: 'framed as a medium shot' },
  { id: 'close-up', group: 'shot', label: 'Close-up', modifier: 'shot as a tight close-up' },
  { id: 'extreme-close-up', group: 'shot', label: 'Extreme close-up', modifier: 'shot as an extreme close-up' },
  { id: 'over-the-shoulder', group: 'shot', label: 'Over-the-shoulder', modifier: 'framed as an over-the-shoulder shot' },
  { id: 'pov', group: 'shot', label: 'POV', modifier: 'shot from a first-person POV perspective' },
];

/** LENS — the optical character of the glass. */
export const LENS_PRESETS: readonly CinemaPreset[] = [
  { id: 'wide-24mm', group: 'lens', label: '24mm wide', modifier: 'shot on a 24mm wide-angle lens with deep focus' },
  { id: 'standard-50mm', group: 'lens', label: '50mm standard', modifier: 'shot on a 50mm standard lens with natural perspective' },
  { id: 'portrait-85mm', group: 'lens', label: '85mm portrait', modifier: 'shot on an 85mm portrait lens with shallow depth of field' },
  { id: 'macro', group: 'lens', label: 'Macro', modifier: 'shot on a macro lens with extreme detail and razor-thin focus' },
  { id: 'fisheye', group: 'lens', label: 'Fisheye', modifier: 'shot on a fisheye lens with wide curved distortion' },
  { id: 'anamorphic', group: 'lens', label: 'Anamorphic', modifier: 'shot on an anamorphic lens with wide cinematic flares and oval bokeh' },
];

/** MOVE — how the camera travels through the shot. */
export const MOVE_PRESETS: readonly CinemaPreset[] = [
  { id: 'static', group: 'move', label: 'Static', modifier: 'with a locked-off static camera' },
  { id: 'dolly-in', group: 'move', label: 'Dolly in', modifier: 'with a slow dolly-in camera move' },
  { id: 'dolly-out', group: 'move', label: 'Dolly out', modifier: 'with a slow dolly-out camera move' },
  { id: 'pan', group: 'move', label: 'Pan', modifier: 'with a smooth horizontal camera pan' },
  { id: 'tilt', group: 'move', label: 'Tilt', modifier: 'with a smooth vertical camera tilt' },
  { id: 'crane', group: 'move', label: 'Crane', modifier: 'with a sweeping crane camera move' },
  { id: 'orbit', group: 'move', label: 'Orbit', modifier: 'with a 360-degree orbiting camera move around the subject' },
  { id: 'handheld', group: 'move', label: 'Handheld', modifier: 'with a natural handheld camera move' },
  { id: 'crash-zoom', group: 'move', label: 'Crash zoom', modifier: 'with a sudden crash-zoom' },
  { id: 'whip-pan', group: 'move', label: 'Whip pan', modifier: 'with a fast whip-pan camera move' },
  { id: 'fpv-drone', group: 'move', label: 'FPV drone', modifier: 'with a fast FPV drone fly-through camera move' },
  { id: 'hyperlapse', group: 'move', label: 'Hyperlapse', modifier: 'with a moving hyperlapse camera move' },
];

/** LOOK — the color grade / film stock. */
export const LOOK_PRESETS: readonly CinemaPreset[] = [
  { id: 'cinematic', group: 'look', label: 'Cinematic', modifier: 'graded with a filmic cinematic color palette' },
  { id: 'teal-orange', group: 'look', label: 'Teal & orange', modifier: 'graded with a teal-and-orange cinematic color palette' },
  { id: 'noir-bw', group: 'look', label: 'Noir B&W', modifier: 'graded as high-contrast black-and-white film noir' },
  { id: 'warm-film', group: 'look', label: 'Warm film', modifier: 'graded with warm golden film tones' },
  { id: 'cold-blue', group: 'look', label: 'Cold blue', modifier: 'graded with a cold desaturated blue palette' },
  { id: 'vibrant-hdr', group: 'look', label: 'Vibrant HDR', modifier: 'graded with vibrant high-dynamic-range color' },
  { id: 'vintage-8mm', group: 'look', label: 'Vintage 8mm', modifier: 'graded as grainy vintage 8mm film' },
];

/** The four racks in UI/compose order (shot → lens → move → look). */
export const CINEMA_GROUPS: readonly { id: CinemaGroup; label: string; presets: readonly CinemaPreset[] }[] = [
  { id: 'shot', label: 'Shot', presets: SHOT_PRESETS },
  { id: 'lens', label: 'Lens', presets: LENS_PRESETS },
  { id: 'move', label: 'Move', presets: MOVE_PRESETS },
  { id: 'look', label: 'Look', presets: LOOK_PRESETS },
];

const GROUP_PRESETS: Record<CinemaGroup, readonly CinemaPreset[]> = {
  shot: SHOT_PRESETS,
  lens: LENS_PRESETS,
  move: MOVE_PRESETS,
  look: LOOK_PRESETS,
};

/** A single-select choice per rack (undefined = nothing chosen for that rack). */
export interface CinemaSelection {
  shot?: string;
  lens?: string;
  move?: string;
  look?: string;
}

/** Look up one preset by rack + id. Returns undefined for an unknown id. */
export function cinemaPresetById(group: CinemaGroup, id: string): CinemaPreset | undefined {
  return GROUP_PRESETS[group]?.find((p) => p.id === id);
}

/**
 * Whitelist a selection down to ids that actually resolve to a preset in their
 * rack — for stamping provenance onto a job/asset without trusting raw input.
 * Unknown ids are dropped.
 */
export function resolveCinemaSelection(sel: CinemaSelection): CinemaSelection {
  const out: CinemaSelection = {};
  for (const group of ['shot', 'lens', 'move', 'look'] as const) {
    const id = sel[group];
    if (typeof id === 'string' && cinemaPresetById(group, id)) out[group] = id;
  }
  return out;
}

/**
 * Fold the selected SHOT/LENS/MOVE/LOOK modifiers into a base prompt, in rack
 * order (shot → lens → move → look). Unknown ids are ignored. Returns the base
 * prompt unchanged when nothing valid is selected.
 */
export function composeCinemaPrompt(basePrompt: string, sel: CinemaSelection): string {
  const modifiers: string[] = [];
  for (const group of ['shot', 'lens', 'move', 'look'] as const) {
    const id = sel[group];
    if (typeof id !== 'string' || id.length === 0) continue;
    const preset = cinemaPresetById(group, id);
    if (preset) modifiers.push(preset.modifier);
  }
  if (modifiers.length === 0) return basePrompt;
  return `${basePrompt} — ${modifiers.join(', ')}`;
}
