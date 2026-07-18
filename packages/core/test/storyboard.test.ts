import { describe, it, expect } from 'vitest';
import {
  normalizeStoryboard, emptyStoryboard, storyboardShotPrompt,
  buildStoryboardPrompt, parseStoryboardPlan, MAX_STORYBOARD_SHOTS,
} from '../src/index';

let counter = 0;
const genId = () => `shot-${++counter}`;

describe('emptyStoryboard', () => {
  it('defaults to 9:16 and no shots; rejects a bad aspect', () => {
    expect(emptyStoryboard()).toEqual({ title: '', brief: '', aspectRatio: '9:16', shots: [] });
    expect(emptyStoryboard('16:9').aspectRatio).toBe('16:9');
    expect(emptyStoryboard('bogus').aspectRatio).toBe('9:16');
  });
});

describe('normalizeStoryboard', () => {
  it('keeps valid shots, drops promptless ones, and backfills ids', () => {
    counter = 0;
    const s = normalizeStoryboard({
      title: 'Molten',
      brief: 'a knife launch film',
      aspectRatio: '16:9',
      shots: [
        { prompt: 'raw steel on the anvil', caption: 'From raw steel', shotType: 'establishing', durationSec: 5 },
        { id: 'keep', prompt: 'hammer strikes, sparks fly' },
        { caption: 'no prompt' },       // no prompt → dropped
        { prompt: '   ' },              // blank prompt → dropped
        'nope',                          // not an object → dropped
      ],
    }, genId);
    expect(s.title).toBe('Molten');
    expect(s.brief).toBe('a knife launch film');
    expect(s.aspectRatio).toBe('16:9');
    expect(s.shots.map((x) => x.prompt)).toEqual(['raw steel on the anvil', 'hammer strikes, sparks fly']);
    expect(s.shots[0]!.id).toBe('shot-1');  // backfilled
    expect(s.shots[1]!.id).toBe('keep');    // preserved
    expect(s.shots[0]).toMatchObject({ caption: 'From raw steel', shotType: 'establishing', durationSec: 5 });
  });

  it('clamps durations (1–15, default 4) and whitelists shotType', () => {
    const s = normalizeStoryboard({ shots: [
      { prompt: 'a', durationSec: 999 },        // → 15
      { prompt: 'b', durationSec: 0 },          // → 1
      { prompt: 'c', shotType: 'close-up' },    // valid; default duration 4
      { prompt: 'd', shotType: 'drone-orbit' }, // unknown shotType dropped
    ] }, genId);
    expect(s.shots[0]!.durationSec).toBe(15);
    expect(s.shots[1]!.durationSec).toBe(1);
    expect(s.shots[2]!.durationSec).toBe(4);
    expect(s.shots[2]!.shotType).toBe('close-up');
    expect(s.shots[3]!.shotType).toBeUndefined();
  });

  it(`caps shots at ${MAX_STORYBOARD_SHOTS}`, () => {
    const shots = Array.from({ length: MAX_STORYBOARD_SHOTS + 3 }, (_, i) => ({ prompt: `shot ${i}` }));
    expect(normalizeStoryboard({ shots }, genId).shots).toHaveLength(MAX_STORYBOARD_SHOTS);
  });

  it('carries cameraAngle / characterId / asset stamps / voiceoverScript, and drops junk', () => {
    const s = normalizeStoryboard({
      voiceoverScript: '  From raw steel to the first cut.  ',
      shots: [{ prompt: 'p', cameraAngle: ' low angle, push-in ', characterId: 'c1', imageAssetId: 'img1', clipAssetId: 'v1' }],
    }, genId);
    expect(s.voiceoverScript).toBe('From raw steel to the first cut.');
    expect(s.shots[0]).toMatchObject({ cameraAngle: 'low angle, push-in', characterId: 'c1', imageAssetId: 'img1', clipAssetId: 'v1' });
    expect(normalizeStoryboard({ voiceoverScript: 7, shots: [{ prompt: 'p', characterId: 9 }] }, genId).voiceoverScript).toBeUndefined();
  });

  it('defaults a bad aspect ratio and tolerates junk input', () => {
    expect(normalizeStoryboard({ aspectRatio: 'nope', shots: 'x' }, genId)).toEqual({ title: '', brief: '', aspectRatio: '9:16', shots: [] });
    expect(normalizeStoryboard(null, genId)).toEqual({ title: '', brief: '', aspectRatio: '9:16', shots: [] });
  });
});

describe('storyboardShotPrompt', () => {
  it('folds shotType and cameraAngle into the prompt text', () => {
    expect(storyboardShotPrompt({ prompt: 'sparks fly' })).toBe('sparks fly');
    expect(storyboardShotPrompt({ prompt: 'sparks fly', shotType: 'close-up' })).toBe('sparks fly — close-up shot');
    expect(storyboardShotPrompt({ prompt: 'sparks fly', shotType: 'wide', cameraAngle: 'low angle' }))
      .toBe('sparks fly — wide shot, camera: low angle');
  });
});

describe('buildStoryboardPrompt', () => {
  it('asks for the exact shot count, JSON-only output, and the starring character', () => {
    const { system, user } = buildStoryboardPrompt({ brief: 'launch the knife', shotCount: 7, aspectRatio: '9:16', characterName: 'Nova' });
    expect(system).toContain('exactly 7 shots');
    expect(system).toContain('9:16');
    expect(system).toContain('Nova');
    expect(system).toContain('ONLY a JSON object');
    expect(user).toContain('launch the knife');
  });
});

describe('parseStoryboardPlan', () => {
  it('parses the documented object shape', () => {
    const p = parseStoryboardPlan('{"title":"Molten","voiceoverScript":"vo","shots":[{"prompt":"a"},{"prompt":"b"}]}');
    expect(p.title).toBe('Molten');
    expect(p.voiceoverScript).toBe('vo');
    expect(p.shots).toHaveLength(2);
  });

  it('parses fenced / prose-wrapped JSON', () => {
    const p = parseStoryboardPlan('Here is your storyboard:\n```json\n{"shots":[{"prompt":"a"}]}\n```\nEnjoy!');
    expect(p.shots).toHaveLength(1);
  });

  it('accepts a bare array of shots (no wrapper object)', () => {
    const p = parseStoryboardPlan('[{"prompt":"a"},{"prompt":"b"},{"prompt":"c"}]');
    expect(p.shots).toHaveLength(3);
    expect(p.title).toBeUndefined();
  });

  it('returns no shots for garbage', () => {
    expect(parseStoryboardPlan('sorry, I cannot').shots).toEqual([]);
    expect(parseStoryboardPlan('{broken json').shots).toEqual([]);
  });
});
