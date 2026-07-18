import { describe, it, expect } from 'vitest';
import { newAsset, newProject } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryProjectRepo } from '../src/index';

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

  it('lists an owner’s assets across projects (newest first) and updates params', async () => {
    const projects = new InMemoryProjectRepo();
    const assets = new InMemoryAssetRepo(projects);
    await projects.create(newProject({ name: 'A1', ownerId: 'A' }, { id: 'pa1', now: 'T1' }));
    await projects.create(newProject({ name: 'A2', ownerId: 'A' }, { id: 'pa2', now: 'T2' }));
    await projects.create(newProject({ name: 'B1', ownerId: 'B' }, { id: 'pb1', now: 'T1' }));

    await assets.create(newAsset({ projectId: 'pa1', type: 'image', provider: 'fal', storageKey: 'k1' }, { id: 'a1', now: '2026-01-01' }));
    await assets.create(newAsset({ projectId: 'pa2', type: 'video', provider: 'fal', storageKey: 'k2' }, { id: 'a2', now: '2026-02-01' }));
    await assets.create(newAsset({ projectId: 'pb1', type: 'image', provider: 'fal', storageKey: 'k3' }, { id: 'a3', now: '2026-03-01' }));

    const mine = await assets.listByOwner('A');
    expect(mine.map((a) => a.id)).toEqual(['a2', 'a1']); // newest first, only owner A
    expect((await assets.listByOwner('B')).map((a) => a.id)).toEqual(['a3']);

    const updated = await assets.update('a1', { params: { tags: ['hero', 'launch'] } });
    expect(updated.params.tags).toEqual(['hero', 'launch']);
    expect((await assets.get('a1'))!.params.tags).toEqual(['hero', 'launch']);
    await expect(assets.update('nope', { params: {} })).rejects.toThrow(/not found/);
  });
});
