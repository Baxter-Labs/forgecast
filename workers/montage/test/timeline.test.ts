import { describe, it, expect } from 'vitest';
import { dimensionsFor, planTimeline } from '../src/timeline';
import type { MontageSpec } from '../src/timeline';

// ---------------------------------------------------------------------------
// dimensionsFor
// ---------------------------------------------------------------------------
describe('dimensionsFor', () => {
  it('maps 9:16 to 1080x1920', () => {
    expect(dimensionsFor('9:16')).toEqual({ width: 1080, height: 1920 });
  });

  it('maps 16:9 to 1920x1080', () => {
    expect(dimensionsFor('16:9')).toEqual({ width: 1920, height: 1080 });
  });

  it('maps 1:1 to 1080x1080', () => {
    expect(dimensionsFor('1:1')).toEqual({ width: 1080, height: 1080 });
  });

  it('maps 4:5 to 1080x1350', () => {
    expect(dimensionsFor('4:5')).toEqual({ width: 1080, height: 1350 });
  });

  it('scales a custom ratio so the larger side is 1920 with even dims', () => {
    // 3:2 → landscape: width is larger, so width=1920, height=round(1920/3*2)=1280
    const { width, height } = dimensionsFor('3:2');
    expect(width).toBe(1920);
    expect(height).toBe(1280);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it('produces even dimensions for any custom ratio', () => {
    // 7:4 → width larger → width=1920, height=round(1920/7*4)=1097 → round to even 1096
    const { width, height } = dimensionsFor('7:4');
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
    // Larger side is 1920
    expect(Math.max(width, height)).toBe(1920);
  });

  it('falls back to 1080x1920 for unparseable ratio', () => {
    expect(dimensionsFor('bogus')).toEqual({ width: 1080, height: 1920 });
  });
});

// ---------------------------------------------------------------------------
// planTimeline
// ---------------------------------------------------------------------------
describe('planTimeline', () => {
  const baseScene = (overrides: Partial<MontageSpec['scenes'][0]> = {}): MontageSpec['scenes'][0] => ({
    url: 'https://example.com/img.jpg',
    kind: 'image',
    durationSec: 3,
    ...overrides,
  });

  it('throws when scenes array is empty', () => {
    const spec: MontageSpec = { scenes: [], aspectRatio: '9:16' };
    expect(() => planTimeline(spec)).toThrow('montage requires at least one scene');
  });

  it('defaults fps to 30', () => {
    const spec: MontageSpec = { scenes: [baseScene()], aspectRatio: '9:16' };
    expect(planTimeline(spec).fps).toBe(30);
  });

  it('respects overridden fps', () => {
    const spec: MontageSpec = { scenes: [baseScene()], aspectRatio: '9:16', fps: 60 };
    expect(planTimeline(spec).fps).toBe(60);
  });

  it('computes durationInFrames by rounding durationSec * fps', () => {
    // 1.5 sec * 30 fps = 45 frames
    const spec: MontageSpec = { scenes: [baseScene({ durationSec: 1.5 })], aspectRatio: '9:16' };
    expect(planTimeline(spec).scenes[0]!.durationInFrames).toBe(45);
  });

  it('ensures durationInFrames is at least 1', () => {
    const spec: MontageSpec = { scenes: [baseScene({ durationSec: 0.001 })], aspectRatio: '9:16' };
    expect(planTimeline(spec).scenes[0]!.durationInFrames).toBe(1);
  });

  it('sets sequential fromFrame offsets', () => {
    const spec: MontageSpec = {
      scenes: [
        baseScene({ durationSec: 2 }), // 60 frames
        baseScene({ durationSec: 3 }), // 90 frames — starts at 60
        baseScene({ durationSec: 1 }), // 30 frames — starts at 150
      ],
      aspectRatio: '9:16',
    };
    const { scenes } = planTimeline(spec);
    expect(scenes[0]!.fromFrame).toBe(0);
    expect(scenes[1]!.fromFrame).toBe(60);
    expect(scenes[2]!.fromFrame).toBe(150);
  });

  it('totalDurationInFrames is the sum of all scene durations', () => {
    const spec: MontageSpec = {
      scenes: [
        baseScene({ durationSec: 2 }), // 60
        baseScene({ durationSec: 3 }), // 90
      ],
      aspectRatio: '9:16',
    };
    expect(planTimeline(spec).totalDurationInFrames).toBe(150);
  });

  it('defaults transition to "fade" when undefined', () => {
    const spec: MontageSpec = { scenes: [baseScene()], aspectRatio: '9:16' };
    expect(planTimeline(spec).scenes[0]!.transition).toBe('fade');
  });

  it('preserves explicit transition value', () => {
    const spec: MontageSpec = {
      scenes: [baseScene({ transition: 'slide' })],
      aspectRatio: '9:16',
    };
    expect(planTimeline(spec).scenes[0]!.transition).toBe('slide');
  });

  it('preserves explicit "none" transition', () => {
    const spec: MontageSpec = {
      scenes: [baseScene({ transition: 'none' })],
      aspectRatio: '9:16',
    };
    expect(planTimeline(spec).scenes[0]!.transition).toBe('none');
  });

  it('propagates width/height from dimensionsFor', () => {
    const spec: MontageSpec = { scenes: [baseScene()], aspectRatio: '16:9' };
    const tl = planTimeline(spec);
    expect(tl.width).toBe(1920);
    expect(tl.height).toBe(1080);
  });

  it('includes index, kind, url, and caption in scene frames', () => {
    const spec: MontageSpec = {
      scenes: [baseScene({ kind: 'video', caption: 'Hello', url: 'https://v.example.com/1.mp4' })],
      aspectRatio: '9:16',
    };
    const s = planTimeline(spec).scenes[0]!;
    expect(s.index).toBe(0);
    expect(s.kind).toBe('video');
    expect(s.url).toBe('https://v.example.com/1.mp4');
    expect(s.caption).toBe('Hello');
  });
});
