import { describe, it, expect, afterEach } from 'vitest';
import { buildServices } from '../lib/forgecast';

const saved = { db: process.env.FORGECAST_DB, dir: process.env.FORGECAST_DATA_DIR };
afterEach(() => {
  if (saved.db === undefined) delete process.env.FORGECAST_DB; else process.env.FORGECAST_DB = saved.db;
  if (saved.dir === undefined) delete process.env.FORGECAST_DATA_DIR; else process.env.FORGECAST_DATA_DIR = saved.dir;
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
    const svc = buildServices({ falKey: 'k' });
    expect(svc.projects.constructor.name).toBe('InMemoryProjectRepo');
  });
});
