/**
 * Timeline video editor — the data model for arranging a project's assets into a
 * finished video. A timeline is an ordered list of clips (each referencing an
 * image or video asset, with its own duration / trim / caption / transition),
 * plus an aspect ratio and optional background music. It renders through the
 * existing montage pipeline (Remotion / in-process ffmpeg).
 *
 * Deliberately vendor- and UI-neutral so the SAME timeline can be built and
 * edited by a human in the Studio *or* by an agent over MCP — the clean-room,
 * MIT/TypeScript answer to palmier-pro's agent-native editor concept (no code is
 * reused from palmier, which is GPLv3 / Swift).
 */

import { CAMERA_PRESETS, type CameraPreset } from './montage';

export type EditorTransition = 'fade' | 'slide' | 'none';

export interface EditorClip {
  /** Stable id within the timeline. */
  id: string;
  /** The project asset this clip shows (image or video). */
  assetId: string;
  /** Seconds this clip plays for on the timeline. */
  durationSec: number;
  /** For video assets: seconds to skip from the source start (a simple trim). */
  trimStartSec?: number;
  /** Optional caption/overlay text for this clip. */
  caption?: string;
  /** Transition INTO this clip. */
  transition?: EditorTransition;
  /** Camera motion across the clip (zoom/pan/dutch/handheld — the virtual camera). */
  cameraPreset?: CameraPreset;
}

export interface EditorTimeline {
  /** Output shape — `9:16` (default), `16:9`, `1:1`, `4:5`, `4:3`, `3:4`. */
  aspectRatio: string;
  fps?: number;
  clips: EditorClip[];
  /** Optional background-music asset for the whole timeline. */
  musicAssetId?: string;
  /** Optional narration (voice-over) audio asset. Plays over the whole timeline; music is ducked under it. */
  voiceoverAssetId?: string;
}

const ASPECTS = new Set(['9:16', '16:9', '1:1', '4:5', '4:3', '3:4']);
const TRANSITIONS = new Set<EditorTransition>(['fade', 'slide', 'none']);
const PRESETS = new Set<CameraPreset>(CAMERA_PRESETS);

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** An empty timeline (default vertical). */
export function emptyTimeline(aspectRatio = '9:16'): EditorTimeline {
  return { aspectRatio: ASPECTS.has(aspectRatio) ? aspectRatio : '9:16', clips: [] };
}

/** Total play length of a timeline, in seconds. */
export function timelineDuration(t: EditorTimeline): number {
  return t.clips.reduce((sum, c) => sum + Math.max(0, c.durationSec || 0), 0);
}

/**
 * Validate + clamp an untrusted timeline (from the UI or an agent) into a clean
 * `EditorTimeline`. Invalid clips (no assetId) are dropped; ids are backfilled
 * with `genId`; durations/fps are clamped to sane ranges.
 */
export function normalizeTimeline(input: unknown, genId: () => string): EditorTimeline {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const aspectRatio = typeof o.aspectRatio === 'string' && ASPECTS.has(o.aspectRatio) ? o.aspectRatio : '9:16';

  const clips: EditorClip[] = [];
  const rawClips = Array.isArray(o.clips) ? o.clips : [];
  for (const c of rawClips) {
    if (!c || typeof c !== 'object') continue;
    const cc = c as Record<string, unknown>;
    if (typeof cc.assetId !== 'string' || cc.assetId.length === 0) continue;
    const clip: EditorClip = {
      id: typeof cc.id === 'string' && cc.id.length > 0 ? cc.id : genId(),
      assetId: cc.assetId,
      durationSec: clamp(typeof cc.durationSec === 'number' && Number.isFinite(cc.durationSec) ? cc.durationSec : 3, 0.5, 60),
    };
    if (typeof cc.trimStartSec === 'number' && cc.trimStartSec > 0) clip.trimStartSec = clamp(cc.trimStartSec, 0, 3600);
    if (typeof cc.caption === 'string' && cc.caption.trim().length > 0) clip.caption = cc.caption;
    if (typeof cc.transition === 'string' && TRANSITIONS.has(cc.transition as EditorTransition)) clip.transition = cc.transition as EditorTransition;
    if (typeof cc.cameraPreset === 'string' && PRESETS.has(cc.cameraPreset as CameraPreset)) clip.cameraPreset = cc.cameraPreset as CameraPreset;
    clips.push(clip);
  }

  const timeline: EditorTimeline = { aspectRatio, clips };
  if (typeof o.fps === 'number' && Number.isFinite(o.fps)) {
    const fps = Math.round(clamp(o.fps, 1, 60));
    timeline.fps = fps;
  }
  if (typeof o.musicAssetId === 'string' && o.musicAssetId.length > 0) timeline.musicAssetId = o.musicAssetId;
  if (typeof o.voiceoverAssetId === 'string' && o.voiceoverAssetId.length > 0) timeline.voiceoverAssetId = o.voiceoverAssetId;
  return timeline;
}
