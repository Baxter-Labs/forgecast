import { describe, it, expect } from 'vitest';
import type { KeyRepo } from '@forgecast/core';
import { InMemoryKeyRepo } from '../src/memory/keyRepo';
import { openStore } from '../src/sqlite/store';

function suite(name: string, make: () => KeyRepo) {
  describe(`${name} key repo`, () => {
    it('sets, gets, lists per owner and overwrites on re-set', async () => {
      const repo = make();
      await repo.set({ ownerId: 'u1', keyId: 'fal', value: 'enc:aaa.bbb', updatedAt: '2026-07-05T00:00:00Z' });
      await repo.set({ ownerId: 'u1', keyId: 'openai', value: 'enc:ccc.ddd', updatedAt: '2026-07-05T00:00:00Z' });
      await repo.set({ ownerId: 'u2', keyId: 'fal', value: 'enc:eee.fff', updatedAt: '2026-07-05T00:00:00Z' });

      expect((await repo.get('u1', 'fal'))?.value).toBe('enc:aaa.bbb');
      expect((await repo.list('u1')).map((k) => k.keyId).sort()).toEqual(['fal', 'openai']);
      expect((await repo.list('u2')).map((k) => k.keyId)).toEqual(['fal']);
      expect(await repo.get('u3', 'fal')).toBeNull();

      await repo.set({ ownerId: 'u1', keyId: 'fal', value: 'enc:new.new', updatedAt: '2026-07-06T00:00:00Z' });
      expect((await repo.get('u1', 'fal'))?.value).toBe('enc:new.new');
      expect(await repo.list('u1')).toHaveLength(2);
    });

    it('deletes a single (owner, key) pair', async () => {
      const repo = make();
      await repo.set({ ownerId: 'u1', keyId: 'fal', value: 'v', updatedAt: 'now' });
      await repo.delete('u1', 'fal');
      expect(await repo.get('u1', 'fal')).toBeNull();
      await repo.delete('u1', 'missing'); // no-op, no throw
    });
  });
}

suite('in-memory', () => new InMemoryKeyRepo());
suite('sqlite', () => openStore(':memory:').keys);
