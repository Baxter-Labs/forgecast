import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { getServicesForUser, invalidateUserServices } from '../lib/forgecast';
import { listKeyStatuses, setUserKey, clearUserKey, resolveOwnerKeys, type KeyStatus } from '../lib/keys';

afterEach(() => {
  vi.unstubAllEnvs();
  invalidateUserServices('u1');
  invalidateUserServices('local');
});

function statuses(body: unknown): KeyStatus[] {
  return (body as { keys: KeyStatus[] }).keys;
}

describe('key management API', () => {
  it('lists the whitelist with sources: none / instance / user (masked, never the value)', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'env-pexels-key');
    const svc = buildServices({});
    const before = statuses((await listKeyStatuses(svc, 'u1')).body);
    expect(before.find((k) => k.id === 'fal')?.source).toBe('none');
    expect(before.find((k) => k.id === 'pexels')?.source).toBe('instance');

    const r = await setUserKey(svc, 'u1', { id: 'fal', value: 'sk-user-fal-12345' });
    expect(r.status).toBe(200);
    const after = statuses(r.body);
    const fal = after.find((k) => k.id === 'fal')!;
    expect(fal.source).toBe('user');
    expect(fal.preview).toBe('••••2345');
    expect(JSON.stringify(r.body)).not.toContain('sk-user-fal-12345');
  });

  it('rejects unknown ids and junk values; clear falls back to instance/none', async () => {
    const svc = buildServices({});
    expect((await setUserKey(svc, 'u1', { id: 'not_a_key', value: 'x' })).status).toBe(400);
    expect((await setUserKey(svc, 'u1', { id: 'fal', value: '' })).status).toBe(400);
    expect((await setUserKey(svc, 'u1', { id: 'fal', value: 'line\nbreak' })).status).toBe(400);

    await setUserKey(svc, 'u1', { id: 'fal', value: 'sk-abc' });
    const cleared = statuses((await clearUserKey(svc, 'u1', { id: 'fal' })).body);
    expect(cleared.find((k) => k.id === 'fal')?.source).toBe('none');
  });

  it('seals with AUTH_SECRET when set and keys stay per-owner', async () => {
    vi.stubEnv('AUTH_SECRET', 'seal-secret-32-bytes-long-enough!');
    const svc = buildServices({});
    await setUserKey(svc, 'u1', { id: 'openai', value: 'sk-openai-999' });

    const raw = await svc.keys.get('u1', 'openai');
    expect(raw?.value.startsWith('enc:')).toBe(true);
    expect(raw?.value).not.toContain('sk-openai-999');

    expect(await resolveOwnerKeys(svc, 'u1')).toEqual({ openai: 'sk-openai-999' });
    expect(await resolveOwnerKeys(svc, 'u2')).toEqual({});
  });
});

describe('per-user services overlay', () => {
  it('applies the owner key over a keyless instance without touching the base or state', async () => {
    const base = buildServices({});
    expect(base.imageRegistry.available()).toEqual([]); // keyless instance

    await setUserKey(base, 'u1', { id: 'fal', value: 'sk-user-fal' });
    const mine = await getServicesForUser('u1', base);
    expect(mine.imageRegistry.available()).toContain('fal');
    expect(base.imageRegistry.available()).toEqual([]); // base untouched

    // Shared state: same repos and storage objects.
    expect(mine.projects).toBe(base.projects);
    expect(mine.storage).toBe(base.storage);
    expect(mine.jobs).toBe(base.jobs);
  });

  it('wires non-fal image (OpenAI) and video (Replicate) providers from BYO keys', async () => {
    const base = buildServices({});
    expect(base.imageRegistry.available()).toEqual([]);
    expect(base.videoProvider.isAvailable()).toBe(false);

    await setUserKey(base, 'u1', { id: 'openai', value: 'sk-openai' });
    await setUserKey(base, 'u1', { id: 'replicate', value: 'r8-token' });
    invalidateUserServices('u1');
    const mine = await getServicesForUser('u1', base);

    expect(mine.imageRegistry.available()).toContain('openai'); // image via OpenAI, no fal
    expect(mine.videoProvider.name).toBe('replicate');           // video via Replicate, no fal
    expect(mine.videoProvider.isAvailable()).toBe(true);
    expect(base.imageRegistry.available()).toEqual([]);          // base untouched
  });

  it('a stored FREE Hugging Face token unlocks the free hf-spaces video provider for that user', async () => {
    const base = buildServices({});
    expect(base.videoProvider.isAvailable()).toBe(false);

    await setUserKey(base, 'u1', { id: 'hf', value: 'hf_free_token' });
    invalidateUserServices('u1');
    const mine = await getServicesForUser('u1', base);

    expect(mine.videoProvider.name).toBe('hf-spaces');
    expect(mine.videoProvider.isAvailable()).toBe(true);
    expect(base.videoProvider.isAvailable()).toBe(false); // base untouched
  });

  it('returns the base singleton for owners with no stored keys, and caches per owner', async () => {
    const base = buildServices({});
    invalidateUserServices('u1');
    expect(await getServicesForUser('u1', base)).toBe(base);

    await setUserKey(base, 'u1', { id: 'fal', value: 'sk-1' });
    invalidateUserServices('u1'); // what the route does after a write
    const a = await getServicesForUser('u1', base);
    const b = await getServicesForUser('u1', base);
    expect(a).not.toBe(base);
    expect(b).toBe(a); // cached
  });
});
