import { describe, it, expect } from 'vitest';
import { newAsset } from '@forgecast/core';
import { InMemoryAssetRepo } from '../src/index';

describe('InMemoryAssetRepo', () => {
  it('creates, gets, and lists assets by project', async () => {
    const repo = new InMemoryAssetRepo();
    const a1 = await repo.create(
      newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k1' }, { id: 'a1', now: 'T' }),
    );
    await repo.create(
      newAsset({ projectId: 'p2', type: 'image', provider: 'fal', storageKey: 'k2' }, { id: 'a2', now: 'T' }),
    );
    expect(await repo.get('a1')).toEqual(a1);
    expect(await repo.get('missing')).toBeNull();
    expect(await repo.listByProject('p1')).toEqual([a1]);
  });
});
