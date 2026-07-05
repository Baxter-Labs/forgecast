import { describe, it, expect } from 'vitest';
import { newUser, type UserRepo } from '@forgecast/core';
import { InMemoryUserRepo } from '../src/memory/userRepo';
import { openStore } from '../src/sqlite/store';

function suite(name: string, make: () => UserRepo) {
  describe(`${name} user repo`, () => {
    it('inserts and reads by id + email (email case-insensitive)', async () => {
      const repo = make();
      const u = newUser({ email: 'Smith@Example.com', name: 'Smith' }, { id: 'u1', now: '2026-07-05T00:00:00Z' });
      await repo.upsert(u);
      expect(await repo.get('u1')).toEqual(u);
      expect(await repo.getByEmail('smith@example.com')).toEqual(u);
      expect(await repo.getByEmail('SMITH@EXAMPLE.COM')).toEqual(u);
      expect(await repo.get('nope')).toBeNull();
    });

    it('upsert refreshes profile fields but keeps the original id + createdAt', async () => {
      const repo = make();
      await repo.upsert(newUser({ email: 'a@b.co', name: 'Old Name' }, { id: 'u1', now: '2026-01-01T00:00:00Z' }));
      const back = await repo.upsert(
        newUser({ email: 'a@b.co', name: 'New Name', avatarUrl: 'https://img/x.png' }, { id: 'u2-ignored', now: '2026-07-05T00:00:00Z' }),
      );
      expect(back.id).toBe('u1');
      expect(back.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(back.name).toBe('New Name');
      expect(back.avatarUrl).toBe('https://img/x.png');
      expect(await repo.get('u2-ignored')).toBeNull();
    });
  });
}

suite('in-memory', () => new InMemoryUserRepo());
suite('sqlite', () => openStore(':memory:').users);
