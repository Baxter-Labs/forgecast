/**
 * timeline.ts — Pure (no Remotion/React) deterministic core for the montage worker.
 *
 * MontageSpec/MontageScene are re-declared locally so this module is usable
 * as a standalone service outside the pnpm workspace (no @forgecast/* aliases).
 * Keep them structurally identical to packages/core/src/montage.ts.
 */

// ---------------------------------------------------------------------------
// Types (structurally identical to @forgecast/core montage.ts)
// ---------------------------------------------------------------------------

export type CameraPreset =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'crash-zoom'
  | 'pan-left'
  | 'pan-right'
  | 'dutch'
  | 'handheld';

export interface MontageScene {
  url: string;
  kind: 'image' | 'video';
  durationSec: number;
  caption?: string;
  transition?: 'fade' | 'slide' | 'none';
  /** Camera motion applied across the scene's duration (default: none). */
  cameraPreset?: CameraPreset;
}

export interface MontageSpec {
  scenes: MontageScene[];
  aspectRatio: string;
  fps?: number;
  /** @deprecated Never rendered. Synthesize upstream and pass `voiceoverUrl` instead. */
  voiceoverText?: string;
  /** Public URL of a narration audio track. Rendered alongside `musicUrl` (music is ducked). */
  voiceoverUrl?: string;
  musicUrl?: string;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SceneFrames {
  index: number;
  fromFrame: number;
  durationInFrames: number;
  kind: 'image' | 'video';
  url: string;
  caption?: string;
  transition: 'fade' | 'slide' | 'none';
  cameraPreset: CameraPreset;
}

export interface Timeline {
  width: number;
  height: number;
  fps: number;
  totalDurationInFrames: number;
  scenes: SceneFrames[];
}

// ---------------------------------------------------------------------------
// Known aspect-ratio lookup table (1080-based canonical dims)
// ---------------------------------------------------------------------------

const KNOWN_RATIOS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

/**
 * Round a number to the nearest even integer (H.264 requires even dimensions).
 */
function toEven(n: number): number {
  return Math.round(n / 2) * 2;
}

/**
 * Map an aspect-ratio string to pixel dimensions.
 *
 * Known ratios use a hardcoded 1080-based table. Unknown "W:H" strings are
 * scaled so the LARGER side is 1920, with both dimensions rounded to even
 * integers. Falls back to 1080×1920 if the string cannot be parsed.
 */
export function dimensionsFor(aspectRatio: string): { width: number; height: number } {
  const known = KNOWN_RATIOS[aspectRatio];
  if (known) return known;

  const parts = aspectRatio.split(':');
  if (parts.length === 2) {
    const w = parseInt(parts[0] ?? '', 10);
    const h = parseInt(parts[1] ?? '', 10);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      if (w >= h) {
        // Landscape or square — width is the larger side
        const width = 1920;
        const height = toEven((h / w) * 1920);
        return { width, height };
      } else {
        // Portrait — height is the larger side
        const height = 1920;
        const width = toEven((w / h) * 1920);
        return { width, height };
      }
    }
  }

  // Fallback
  return { width: 1080, height: 1920 };
}

/**
 * Build a fully-resolved frame-level plan for a MontageSpec.
 */
export function planTimeline(spec: MontageSpec): Timeline {
  if (spec.scenes.length === 0) {
    throw new Error('montage requires at least one scene');
  }

  const fps = spec.fps ?? 30;
  const { width, height } = dimensionsFor(spec.aspectRatio);

  const scenes: SceneFrames[] = [];
  let cursor = 0;

  for (let i = 0; i < spec.scenes.length; i++) {
    const scene = spec.scenes[i]!;
    const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));

    scenes.push({
      index: i,
      fromFrame: cursor,
      durationInFrames,
      kind: scene.kind,
      url: scene.url,
      caption: scene.caption,
      transition: scene.transition ?? 'fade',
      cameraPreset: scene.cameraPreset ?? 'none',
    });

    cursor += durationInFrames;
  }

  const totalDurationInFrames = Math.max(1, cursor);

  return { width, height, fps, totalDurationInFrames, scenes };
}

// ---------------------------------------------------------------------------
// Virtual camera — pure per-frame transform math for the camera presets.
// Kept out of React so it is unit-testable and deterministic (frame-driven,
// no randomness — Remotion renders must be reproducible).
// ---------------------------------------------------------------------------

export interface CameraTransform {
  /** Scale factor applied to the media (>= 1; moving presets overscan so pans never reveal edges). */
  scale: number;
  /** Horizontal translation in % of the frame width. */
  x: number;
  /** Vertical translation in % of the frame height. */
  y: number;
  /** Rotation in degrees. */
  rotate: number;
}

const IDENTITY: CameraTransform = { scale: 1, x: 0, y: 0, rotate: 0 };

/** Overscan base so pans/rotations never expose the frame edge. */
const BASE = 1.12;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * The camera position for `preset` at `frame` of a scene lasting
 * `durationInFrames`. Progress is clamped to [0, 1]; 'none' is the identity.
 */
export function cameraTransform(preset: CameraPreset, frame: number, durationInFrames: number): CameraTransform {
  const p = durationInFrames <= 1 ? 1 : Math.min(1, Math.max(0, frame / (durationInFrames - 1)));

  switch (preset) {
    case 'zoom-in':
      return { ...IDENTITY, scale: BASE + 0.12 * p };
    case 'zoom-out':
      return { ...IDENTITY, scale: BASE + 0.12 * (1 - p) };
    case 'crash-zoom': {
      // Hard, fast push-in over the first 40% of the scene, then hold.
      const sub = easeOutCubic(Math.min(1, p / 0.4));
      return { ...IDENTITY, scale: BASE + 0.33 * sub };
    }
    case 'pan-left':
      return { ...IDENTITY, scale: BASE, x: 4 - 8 * p };
    case 'pan-right':
      return { ...IDENTITY, scale: BASE, x: -4 + 8 * p };
    case 'dutch':
      // A slow roll onto the diagonal with a gentle push-in.
      return { scale: BASE + 0.06 * p, x: 0, y: 0, rotate: 3 * p };
    case 'handheld': {
      // Deterministic drift — layered sines at unrelated frequencies read as
      // an operator's sway without any randomness.
      const x = 0.6 * Math.sin(frame / 7) + 0.25 * Math.sin(frame / 3.1);
      const y = 0.5 * Math.cos(frame / 9) + 0.2 * Math.sin(frame / 4.3);
      const rotate = 0.4 * Math.sin(frame / 11);
      return { scale: BASE, x, y, rotate };
    }
    case 'none':
    default:
      return IDENTITY;
  }
}
