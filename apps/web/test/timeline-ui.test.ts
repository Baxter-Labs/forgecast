import { describe, it, expect } from 'vitest';
import { toUI, toDoc, newClipFrom, moveItem, moveItemTo, totalDurationSec, emptyControls } from '../lib/timeline-ui';

const clips = [
  { id: 'a', assetId: 'x', durationSec: 3, caption: '', transition: 'fade' as const, cameraPreset: 'auto' as const },
  { id: 'b', assetId: 'y', durationSec: 5, caption: 'hi', transition: 'none' as const, cameraPreset: 'auto' as const },
  { id: 'c', assetId: 'z', durationSec: 2, caption: '', transition: 'slide' as const, cameraPreset: 'dutch' as const },
];

describe('timeline-ui helpers', () => {
  it('toUI backfills controlled-input defaults; toDoc drops empty captions and null music', () => {
    const ui = toUI({ aspectRatio: '16:9', clips: [{ id: 'a', assetId: 'x', durationSec: 4 }] });
    expect(ui).toEqual({ aspect: '16:9', musicAssetId: null, voiceoverAssetId: null, clips: [{ id: 'a', assetId: 'x', durationSec: 4, caption: '', transition: 'fade', cameraPreset: 'auto' }] });

    const doc = toDoc({ aspect: '9:16', musicAssetId: null, voiceoverAssetId: null, clips: [{ id: 'a', assetId: 'x', durationSec: 4, caption: '   ', transition: 'fade', cameraPreset: 'auto' as const }] });
    expect(doc.clips[0]).toEqual({ id: 'a', assetId: 'x', durationSec: 4, transition: 'fade' });
    expect('musicAssetId' in doc).toBe(false);
  });

  it('round-trips a full document', () => {
    const doc = { aspectRatio: '1:1', fps: undefined, clips: [{ id: 'a', assetId: 'x', durationSec: 4, caption: 'yo', transition: 'slide' as const }], musicAssetId: 'm1' };
    expect(toDoc(toUI(doc))).toEqual({ aspectRatio: '1:1', clips: doc.clips, musicAssetId: 'm1' });
  });

  it('newClipFrom defaults videos longer than stills and assigns unique ids', () => {
    const v = newClipFrom({ id: 'vid', type: 'video' });
    const i = newClipFrom({ id: 'img', type: 'image' });
    expect(v.durationSec).toBe(5);
    expect(i.durationSec).toBe(3);
    expect(v.id).not.toBe(i.id);
  });

  it('moveItem steps a clip and no-ops at the edges (same reference)', () => {
    expect(moveItem(clips, 'a', -1)).toBe(clips);
    expect(moveItem(clips, 'c', 1)).toBe(clips);
    expect(moveItem(clips, 'missing', 1)).toBe(clips);
    expect(moveItem(clips, 'a', 1).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('moveItemTo drops a clip at an exact index with clamping', () => {
    expect(moveItemTo(clips, 'a', 2).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(moveItemTo(clips, 'c', 0).map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(moveItemTo(clips, 'b', 99).map((c) => c.id)).toEqual(['a', 'c', 'b']);
    expect(moveItemTo(clips, 'b', 1)).toBe(clips);
  });

  it('totalDurationSec sums to one decimal; emptyControls defaults 9:16', () => {
    expect(totalDurationSec(clips)).toBe(10);
    expect(emptyControls()).toEqual({ clips: [], aspect: '9:16', musicAssetId: null, voiceoverAssetId: null });
  });
});
