import type { EditorTimeline, EditorClip } from '@forgecast/core';
import type { StudioAsset } from './use-forgecast';

/** A clip as the UI edits it (caption/transition always present for controlled inputs). */
export interface TimelineUIClip {
  id: string;
  assetId: string;
  durationSec: number;
  caption: string;
  transition: 'fade' | 'slide' | 'none';
}

/** The timeline as UI state — converted to/from the core EditorTimeline document. */
export interface TimelineControls {
  clips: TimelineUIClip[];
  aspect: string;
  musicAssetId: string | null;
}

export const TIMELINE_TRANSITIONS: TimelineUIClip['transition'][] = ['fade', 'slide', 'none'];

export function emptyControls(aspect = '9:16'): TimelineControls {
  return { clips: [], aspect, musicAssetId: null };
}

export function clipUid(): string {
  return 'clip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Server document → editable UI state (backfills the controlled-input defaults). */
export function toUI(doc: EditorTimeline): TimelineControls {
  return {
    aspect: doc.aspectRatio || '9:16',
    musicAssetId: doc.musicAssetId ?? null,
    clips: doc.clips.map((c) => ({
      id: c.id,
      assetId: c.assetId,
      durationSec: c.durationSec,
      caption: c.caption ?? '',
      transition: c.transition ?? 'fade',
    })),
  };
}

/** Editable UI state → server document (drops empty captions, null music). */
export function toDoc(controls: TimelineControls): EditorTimeline {
  const doc: EditorTimeline = {
    aspectRatio: controls.aspect,
    clips: controls.clips.map((c) => {
      const clip: EditorClip = { id: c.id, assetId: c.assetId, durationSec: c.durationSec, transition: c.transition };
      const caption = c.caption.trim();
      if (caption) clip.caption = caption;
      return clip;
    }),
  };
  if (controls.musicAssetId) doc.musicAssetId = controls.musicAssetId;
  return doc;
}

/** A new clip for an asset (videos default longer than stills). */
export function newClipFrom(asset: Pick<StudioAsset, 'id' | 'type'>): TimelineUIClip {
  return { id: clipUid(), assetId: asset.id, durationSec: asset.type === 'video' ? 5 : 3, caption: '', transition: 'fade' };
}

/** Reorder a clip one step; returns the same array reference when it's a no-op. */
export function moveItem(clips: TimelineUIClip[], id: string, dir: -1 | 1): TimelineUIClip[] {
  const i = clips.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= clips.length) return clips;
  const next = [...clips];
  const moved = next.splice(i, 1)[0];
  if (!moved) return clips;
  next.splice(j, 0, moved);
  return next;
}

/** Move a clip to an exact position (drag-and-drop). No-op returns the same reference. */
export function moveItemTo(clips: TimelineUIClip[], id: string, targetIndex: number): TimelineUIClip[] {
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return clips;
  const t = Math.max(0, Math.min(clips.length - 1, targetIndex));
  if (t === i) return clips;
  const next = [...clips];
  const moved = next.splice(i, 1)[0];
  if (!moved) return clips;
  next.splice(t, 0, moved);
  return next;
}

export function totalDurationSec(clips: TimelineUIClip[]): number {
  return Math.round(clips.reduce((s, c) => s + (c.durationSec || 0), 0) * 10) / 10;
}
