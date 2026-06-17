import { describe, it, expect } from 'vitest';
import { newProject } from '@forgecast/core';
import { InMemoryProjectRepo } from '../src/index';

describe('InMemoryProjectRepo', () => {
  it('creates, gets, and lists projects', async () => {
    const repo = new InMemoryProjectRepo();
    expect(await repo.get('missing')).toBeNull();

    const a = await repo.create(newProject({ name: 'A' }, { id: 'p1', now: 'T1' }));
    const b = await repo.create(newProject({ name: 'B' }, { id: 'p2', now: 'T2' }));

    expect(await repo.get('p1')).toEqual(a);
    expect(await repo.list()).toEqual([a, b]);
  });
});
