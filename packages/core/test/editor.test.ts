import { describe, it, expect } from 'vitest';
import { normalizeTimeline, emptyTimeline, timelineDuration, type EditorTimeline } from '../src/index';

let counter = 0;
const genId = () => `clip-${++counter}`;

describe('emptyTimeline', () => {
  it('defaults to 9:16 and no clips; rejects a bad aspect', () => {
    expect(emptyTimeline()).toEqual({ aspectRatio: '9:16', clips: [] });
    expect(emptyTimeline('16:9').aspectRatio).toBe('16:9');
    expect(emptyTimeline('bogus').aspectRatio).toBe('9:16');
  });
});

describe('normalizeTimeline', () => {
  it('keeps valid clips, drops invalid ones, and backfills ids', () => {
    counter = 0;
    const t = normalizeTimeline({
      aspectRatio: '16:9',
      clips: [
        { assetId: 'a1', durationSec: 4, caption: 'hi', transition: 'fade' },
        { id: 'keep', assetId: 'a2', durationSec: 3 },
        { durationSec: 5 },        // no assetId → dropped
        { assetId: '', durationSec: 2 }, // empty assetId → dropped
        'nope',                    // not an object → dropped
      ],
    }, genId);
    expect(t.aspectRatio).toBe('16:9');
    expect(t.clips.map((c) => c.assetId)).toEqual(['a1', 'a2']);
    expect(t.clips[0]!.id).toBe('clip-1');      // backfilled
    expect(t.clips[1]!.id).toBe('keep');        // preserved
    expect(t.clips[0]).toMatchObject({ caption: 'hi', transition: 'fade', durationSec: 4 });
  });

  it('clamps durations, fps, and drops an invalid transition', () => {
    const t = normalizeTimeline({
      fps: 999,
      clips: [
        { assetId: 'a', durationSec: 999 },   // → 60
        { assetId: 'b', durationSec: 0 },     // → 0.5
        { assetId: 'c', transition: 'wipe' }, // invalid transition dropped, default duration 3
      ],
    }, genId);
    expect(t.fps).toBe(60);
    expect(t.clips[0]!.durationSec).toBe(60);
    expect(t.clips[1]!.durationSec).toBe(0.5);
    expect(t.clips[2]!.durationSec).toBe(3);
    expect(t.clips[2]!.transition).toBeUndefined();
  });

  it('defaults a bad aspect ratio and tolerates junk input', () => {
    expect(normalizeTimeline({ aspectRatio: 'nope', clips: 'x' }, genId)).toEqual({ aspectRatio: '9:16', clips: [] });
    expect(normalizeTimeline(null, genId)).toEqual({ aspectRatio: '9:16', clips: [] });
  });

  it('carries an optional music asset', () => {
    expect(normalizeTimeline({ musicAssetId: 'm1', clips: [] }, genId).musicAssetId).toBe('m1');
  });

  it('whitelists cameraPreset and drops unknown values', () => {
    const t = normalizeTimeline({ clips: [
      { assetId: 'a', cameraPreset: 'crash-zoom' },
      { assetId: 'b', cameraPreset: 'orbit-360' }, // not implementable in 2D — dropped
    ] }, genId);
    expect(t.clips[0]!.cameraPreset).toBe('crash-zoom');
    expect(t.clips[1]!.cameraPreset).toBeUndefined();
  });

  it('carries an optional voice-over asset and drops non-string junk', () => {
    expect(normalizeTimeline({ voiceoverAssetId: 'v1', clips: [] }, genId).voiceoverAssetId).toBe('v1');
    expect(normalizeTimeline({ voiceoverAssetId: 7, clips: [] }, genId).voiceoverAssetId).toBeUndefined();
    expect(normalizeTimeline({ voiceoverAssetId: '', clips: [] }, genId).voiceoverAssetId).toBeUndefined();
  });
});

describe('timelineDuration', () => {
  it('sums clip durations', () => {
    const t: EditorTimeline = { aspectRatio: '9:16', clips: [
      { id: '1', assetId: 'a', durationSec: 4 },
      { id: '2', assetId: 'b', durationSec: 3.5 },
    ] };
    expect(timelineDuration(t)).toBe(7.5);
    expect(timelineDuration(emptyTimeline())).toBe(0);
  });
});
