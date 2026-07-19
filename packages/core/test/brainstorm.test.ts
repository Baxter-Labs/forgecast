import { describe, it, expect } from 'vitest';
import {
  normalizeBrainstormBoard,
  normalizeBrainstormBoards,
  MAX_BRAINSTORM_IDEAS,
  MAX_BRAINSTORM_BOARDS,
} from '../src/brainstorm';

let seq = 0;
const genId = () => `id_${++seq}`;
const NOW = '2026-01-01T00:00:00.000Z';

describe('normalizeBrainstormBoard', () => {
  it('backfills ids, whitelists kinds, and drops empty ideas/captions', () => {
    const board = normalizeBrainstormBoard(
      {
        concept: 'Eco sneaker drop',
        brief: 'launch a recycled sneaker',
        platforms: ['instagram', 'INSTAGRAM', ' tiktok ', ''],
        ideas: [
          { kind: 'image', prompt: 'hero shot on mossy rock' },
          { kind: 'clip', prompt: 'unboxing' }, // bad kind → defaults to image
          { kind: 'video', prompt: '   ' }, // empty prompt → dropped
          { prompt: 'flat lay' }, // missing kind → image
        ],
        captions: [
          { platform: 'instagram', caption: 'Step lightly.' },
          { platform: '', caption: 'no platform' }, // dropped
          { platform: 'x', caption: '' }, // dropped
        ],
      },
      genId,
      NOW,
    );

    expect(board.id).toBeTruthy();
    expect(board.concept).toBe('Eco sneaker drop');
    expect(board.platforms).toEqual(['instagram', 'tiktok']); // trimmed + case-deduped
    expect(board.ideas).toHaveLength(3);
    expect(board.ideas.every((i) => i.id.length > 0)).toBe(true);
    expect(board.ideas.map((i) => i.kind)).toEqual(['image', 'image', 'image']);
    expect(board.captions).toEqual([{ platform: 'instagram', caption: 'Step lightly.' }]);
    expect(board.createdAt).toBe(NOW);
  });

  it('derives a title from the concept when none is given, and preserves given ids', () => {
    const board = normalizeBrainstormBoard(
      { id: 'board_keep', concept: 'A very cool concept', ideas: [{ id: 'idea_keep', prompt: 'p', assetId: 'a1' }] },
      genId,
      NOW,
    );
    expect(board.id).toBe('board_keep');
    expect(board.title).toBe('A very cool concept');
    expect(board.ideas[0]).toMatchObject({ id: 'idea_keep', prompt: 'p', assetId: 'a1' });
  });

  it('caps ideas at MAX_BRAINSTORM_IDEAS', () => {
    const ideas = Array.from({ length: MAX_BRAINSTORM_IDEAS + 10 }, (_, i) => ({ prompt: `idea ${i}` }));
    const board = normalizeBrainstormBoard({ concept: 'c', ideas }, genId, NOW);
    expect(board.ideas).toHaveLength(MAX_BRAINSTORM_IDEAS);
  });
});

describe('normalizeBrainstormBoards', () => {
  it('reads { boards: [...] } or a bare array, sorts newest-first, and caps the count', () => {
    const raw = {
      boards: [
        { id: 'a', concept: 'old', createdAt: '2020-01-01T00:00:00.000Z', ideas: [{ prompt: 'x' }] },
        { id: 'b', concept: 'new', createdAt: '2026-06-01T00:00:00.000Z', ideas: [{ prompt: 'y' }] },
      ],
    };
    const boards = normalizeBrainstormBoards(raw, genId);
    expect(boards.map((b) => b.id)).toEqual(['b', 'a']); // newest-first

    const bare = normalizeBrainstormBoards([{ concept: 'z', ideas: [{ prompt: 'q' }] }], genId);
    expect(bare).toHaveLength(1);

    const many = normalizeBrainstormBoards(
      Array.from({ length: MAX_BRAINSTORM_BOARDS + 5 }, (_, i) => ({ id: `b${i}`, concept: `c${i}`, ideas: [{ prompt: 'p' }] })),
      genId,
    );
    expect(many).toHaveLength(MAX_BRAINSTORM_BOARDS);
  });

  it('returns [] for junk input', () => {
    expect(normalizeBrainstormBoards(null, genId)).toEqual([]);
    expect(normalizeBrainstormBoards('nope', genId)).toEqual([]);
    expect(normalizeBrainstormBoards({}, genId)).toEqual([]);
  });
});
