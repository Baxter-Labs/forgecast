import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { newProject, newAsset, newJob } from '@forgecast/core';
import { openStore } from '../src/index';

describe('SQLite store (in-memory db)', () => {
  it('CRUDs projects, assets, and jobs', async () => {
    const s = openStore(':memory:');
    await s.projects.create(newProject({ name: 'Demo' }, { id: 'p1', now: 'T1' }));
    expect((await s.projects.get('p1'))?.name).toBe('Demo');
    expect(await s.projects.get('missing')).toBeNull();

    await s.assets.create(newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k', params: { prompt: 'x' } }, { id: 'a1', now: 'T1' }));
    expect((await s.assets.listByProject('p1'))[0]?.params).toEqual({ prompt: 'x' });

    await s.jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'x' } }, { id: 'j1', now: 'T1' }));
    const done = await s.jobs.update('j1', { status: 'done', progress: 1, resultAssetId: 'a1' });
    expect(done.status).toBe('done');
    expect(done.resultAssetId).toBe('a1');
    expect((await s.jobs.get('j1'))?.status).toBe('done');
    await expect(s.jobs.update('nope', { status: 'done' })).rejects.toThrowError(/unknown job: nope/i);
    s.close();
  });
});

describe('SQLite store (durable file)', () => {
  it('persists data across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-sqlite-'));
    const path = join(dir, 'forgecast.db');
    try {
      const a = openStore(path);
      await a.projects.create(newProject({ name: 'Persisted' }, { id: 'p1', now: 'T1' }));
      a.close();

      const b = openStore(path);
      expect((await b.projects.get('p1'))?.name).toBe('Persisted');
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
