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

export interface MontageScene {
  url: string;
  kind: 'image' | 'video';
  durationSec: number;
  caption?: string;
  transition?: 'fade' | 'slide' | 'none';
}

export interface MontageSpec {
  scenes: MontageScene[];
  aspectRatio: string;
  fps?: number;
  voiceoverText?: string;
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
    });

    cursor += durationInFrames;
  }

  const totalDurationInFrames = Math.max(1, cursor);

  return { width, height, fps, totalDurationInFrames, scenes };
}
