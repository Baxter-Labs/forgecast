import { describe, it, expect } from 'vitest';
import { newJob } from '@forgecast/core';
import { InMemoryJobRepo } from '../src/index';

describe('InMemoryJobRepo', () => {
  it('creates, updates (merge), gets, and lists by project', async () => {
    const repo = new InMemoryJobRepo();
    await repo.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j1', now: 'T' }));

    const updated = await repo.update('j1', { status: 'running', progress: 0.5 });
    expect(updated.status).toBe('running');
    expect(updated.progress).toBe(0.5);
    expect(updated.kind).toBe('image');

    expect((await repo.get('j1'))?.status).toBe('running');
    expect(await repo.listByProject('p1')).toHaveLength(1);
  });

  it('throws when updating an unknown job', async () => {
    const repo = new InMemoryJobRepo();
    await expect(repo.update('nope', { status: 'done' })).rejects.toThrowError(/unknown job: nope/i);
  });
});
