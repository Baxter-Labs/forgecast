import { describe, it, expect } from 'vitest';
import { newProject, type ProjectRepo } from '@forgecast/core';
import { InMemoryProjectRepo } from '../src/memory/projectRepo';
import { openStore } from '../src/sqlite/store';

function suite(name: string, make: () => ProjectRepo) {
  describe(`${name} project owner scoping`, () => {
    it('round-trips ownerId and filters list by owner (unowned rows read as local)', async () => {
      const repo = make();
      await repo.create(newProject({ name: 'legacy' }, { id: 'p0', now: '2026-01-01T00:00:00Z' }));
      await repo.create(newProject({ name: 'mine', ownerId: 'user-a' }, { id: 'p1', now: '2026-01-02T00:00:00Z' }));
      await repo.create(newProject({ name: 'theirs', ownerId: 'user-b' }, { id: 'p2', now: '2026-01-03T00:00:00Z' }));

      expect((await repo.get('p1'))?.ownerId).toBe('user-a');
      expect((await repo.get('p0'))?.ownerId).toBeUndefined();

      expect((await repo.list()).length).toBe(3);
      expect((await repo.list('user-a')).map((p) => p.id)).toEqual(['p1']);
      expect((await repo.list('local')).map((p) => p.id)).toEqual(['p0']); // legacy rows belong to the open mode
      expect(await repo.list('user-c')).toEqual([]);
    });
  });
}

suite('in-memory', () => new InMemoryProjectRepo());
suite('sqlite', () => openStore(':memory:').projects);
