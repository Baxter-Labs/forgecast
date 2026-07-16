import { describe, it, expect } from 'vitest';
import { dimensionsFor, planTimeline, cameraTransform } from '../src/timeline';
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

describe('cameraPreset propagation', () => {
  const scene = (overrides: Partial<MontageSpec['scenes'][0]> = {}): MontageSpec['scenes'][0] =>
    ({ url: 'https://img.example.com/a.png', kind: 'image', durationSec: 3, ...overrides });

  it('defaults scenes to none and carries an explicit preset', () => {
    const spec: MontageSpec = {
      scenes: [scene(), scene({ cameraPreset: 'crash-zoom' })],
      aspectRatio: '9:16',
    };
    const tl = planTimeline(spec);
    expect(tl.scenes[0]!.cameraPreset).toBe('none');
    expect(tl.scenes[1]!.cameraPreset).toBe('crash-zoom');
  });
});

describe('cameraTransform', () => {
  it('none is the identity at every frame', () => {
    expect(cameraTransform('none', 0, 90)).toEqual({ scale: 1, x: 0, y: 0, rotate: 0 });
    expect(cameraTransform('none', 89, 90)).toEqual({ scale: 1, x: 0, y: 0, rotate: 0 });
  });

  it('zoom-in pushes from the overscan base to a deeper scale monotonically', () => {
    const start = cameraTransform('zoom-in', 0, 90);
    const mid = cameraTransform('zoom-in', 45, 90);
    const end = cameraTransform('zoom-in', 89, 90);
    expect(start.scale).toBeCloseTo(1.12, 5);
    expect(end.scale).toBeCloseTo(1.24, 5);
    expect(mid.scale).toBeGreaterThan(start.scale);
    expect(end.scale).toBeGreaterThan(mid.scale);
  });

  it('zoom-out is the reverse of zoom-in', () => {
    expect(cameraTransform('zoom-out', 0, 90).scale).toBeCloseTo(1.24, 5);
    expect(cameraTransform('zoom-out', 89, 90).scale).toBeCloseTo(1.12, 5);
  });

  it('crash-zoom completes its push within the first 40% then holds', () => {
    const atCut = cameraTransform('crash-zoom', 36, 90); // 40% of 89 ≈ frame 36
    const end = cameraTransform('crash-zoom', 89, 90);
    expect(end.scale).toBeCloseTo(1.45, 2);
    expect(atCut.scale).toBeGreaterThan(1.44); // eased — essentially done at the cut
  });

  it('pans traverse from one side to the other at constant overscan', () => {
    const l0 = cameraTransform('pan-left', 0, 90);
    const l1 = cameraTransform('pan-left', 89, 90);
    expect(l0.x).toBeCloseTo(4, 5);
    expect(l1.x).toBeCloseTo(-4, 5);
    expect(l0.scale).toBeCloseTo(1.12, 5);
    const r0 = cameraTransform('pan-right', 0, 90);
    expect(r0.x).toBeCloseTo(-4, 5);
  });

  it('dutch rolls to 3deg; handheld stays bounded and deterministic', () => {
    expect(cameraTransform('dutch', 89, 90).rotate).toBeCloseTo(3, 5);
    const a = cameraTransform('handheld', 30, 90);
    const b = cameraTransform('handheld', 30, 90);
    expect(a).toEqual(b); // deterministic — same frame, same camera
    expect(Math.abs(a.x)).toBeLessThan(1);
    expect(Math.abs(a.y)).toBeLessThan(1);
  });

  it('clamps progress for single-frame scenes and out-of-range frames', () => {
    expect(cameraTransform('zoom-in', 0, 1).scale).toBeCloseTo(1.24, 5);
    expect(cameraTransform('zoom-in', 500, 90).scale).toBeCloseTo(1.24, 5);
  });
});
