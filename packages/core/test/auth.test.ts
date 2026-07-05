import { describe, it, expect } from 'vitest';
import { newUser, signSession, verifySession } from '../src/auth';

const SECRET = 'test-secret-at-least-32-bytes-long!!';
const NOW = 1_800_000_000; // unix seconds

describe('newUser', () => {
  it('lowercases the email and only includes provided profile fields', () => {
    const u = newUser({ email: 'Smith@Example.COM', name: 'Smith' }, { id: 'u1', now: '2026-07-05T00:00:00Z' });
    expect(u).toEqual({ id: 'u1', email: 'smith@example.com', name: 'Smith', createdAt: '2026-07-05T00:00:00Z' });
    expect('avatarUrl' in u).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips a signed payload', async () => {
    const token = await signSession({ uid: 'u1', exp: NOW + 3600 }, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toEqual({ uid: 'u1', exp: NOW + 3600 });
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession({ uid: 'u1', exp: NOW + 3600 }, SECRET);
    const [body, sig] = token.split('.') as [string, string];
    const forgedBody = body.slice(0, -2) + (body.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySession(`${forgedBody}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('rejects the wrong secret', async () => {
    const token = await signSession({ uid: 'u1', exp: NOW + 3600 }, SECRET);
    expect(await verifySession(token, 'a-completely-different-secret-value', NOW)).toBeNull();
  });

  it('rejects expired sessions', async () => {
    const token = await signSession({ uid: 'u1', exp: NOW - 1 }, SECRET);
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });

  it('rejects garbage tokens without throwing', async () => {
    for (const junk of ['', 'no-dot', 'a.b', '..', '%%%.###']) {
      expect(await verifySession(junk, SECRET, NOW)).toBeNull();
    }
  });
});
