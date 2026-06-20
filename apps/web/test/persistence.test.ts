import { describe, it, expect, afterEach } from 'vitest';
import { buildServices } from '../lib/forgecast';

const R2_VARS = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'FORGECAST_PROFILE'] as const;
const saved: Record<string, string | undefined> = {
  FORGECAST_DB: process.env.FORGECAST_DB,
  FORGECAST_DATA_DIR: process.env.FORGECAST_DATA_DIR,
};
for (const v of R2_VARS) saved[v] = process.env[v];
afterEach(() => {
  for (const [k, val] of Object.entries(saved)) {
    if (val === undefined) delete process.env[k]; else process.env[k] = val;
  }
});

describe('buildServices persistence wiring', () => {
  it('uses a SQLite-backed store when FORGECAST_DB is set', async () => {
    process.env.FORGECAST_DB = ':memory:';
    const svc = buildServices({ falKey: 'k' });
    expect(svc.projects.constructor.name).toBe('SqliteProjectRepo');
    const { newProject } = await import('@forgecast/core');
    await svc.projects.create(newProject({ name: 'Z' }, { id: 'p9', now: 'T' }));
    expect((await svc.projects.get('p9'))?.name).toBe('Z');
  });

  it('defaults to in-memory when no env is set', () => {
    delete process.env.FORGECAST_DB;
    delete process.env.FORGECAST_DATA_DIR;
    const svc = buildServices({ falKey: 'k' });
    expect(svc.projects.constructor.name).toBe('InMemoryProjectRepo');
  });

  it('uses durable sqlite + filesystem storage when db/dataDir opts are passed (how getServices runs the app)', () => {
    delete process.env.FORGECAST_DB;
    delete process.env.FORGECAST_DATA_DIR;
    const svc = buildServices({ falKey: 'k', db: ':memory:', dataDir: '/tmp/forgecast-test-objects' });
    expect(svc.projects.constructor.name).toBe('SqliteProjectRepo');
    expect(svc.storage.constructor.name).toBe('FilesystemStorage');
  });
});

describe('buildServices profile wiring', () => {
  it('uses R2 storage for the baxter-cloud profile when R2 is configured', () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_BUCKET = 'media';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    const svc = buildServices({ falKey: 'k', profile: 'baxter-cloud' });
    expect(svc.storage.constructor.name).toBe('R2Storage');
  });

  it('falls back to local storage when baxter-cloud is selected but R2 is unconfigured', () => {
    for (const v of ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[v];
    const svc = buildServices({ falKey: 'k', profile: 'baxter-cloud' });
    expect(svc.storage.constructor.name).toBe('InMemoryStorage');
  });

  it('does not use R2 for the local profile even if R2 env is present', () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_BUCKET = 'media';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    const svc = buildServices({ falKey: 'k', profile: 'local' });
    expect(svc.storage.constructor.name).toBe('InMemoryStorage');
  });
});
