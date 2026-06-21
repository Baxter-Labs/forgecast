import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { newProject, newAsset, newJob } from '@forgecast/core';
import { d1Store, type D1Like, type D1LikePreparedStatement } from '../src/index';

/**
 * A SQLite-backed fake of the D1 binding. D1's wire API is async and uses
 * `.bind().first()/.all()/.run()`; node:sqlite is sync with positional params,
 * so this thin shim lets the real repo SQL run against a real SQLite engine.
 */
class FakeD1Stmt implements D1LikePreparedStatement {
  constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...values: unknown[]): D1LikePreparedStatement {
    return new FakeD1Stmt(this.db, this.sql, values);
  }
  async first<T = unknown>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row ?? null) as T | null;
  }
  async all<T = unknown>(): Promise<{ results: T[] }> {
    const results = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: results as T[] };
  }
  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...(this.params as never[]));
  }
}

class FakeD1 implements D1Like {
  private readonly db = new DatabaseSync(':memory:');
  prepare(query: string): D1LikePreparedStatement {
    return new FakeD1Stmt(this.db, query);
  }
}

describe('D1 repos', () => {
  it('self-initialize the schema and round-trip projects/assets/jobs', async () => {
    const store = d1Store(new FakeD1());

    const p = await store.projects.create(newProject({ name: 'A' }, { id: 'p1', now: 'T1' }));
    expect(await store.projects.get('p1')).toEqual(p);
    expect(await store.projects.get('missing')).toBeNull();
    expect(await store.projects.list()).toEqual([p]);

    const a = await store.assets.create(
      newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k1', params: { prompt: 'x' } }, { id: 'a1', now: 'T2' }),
    );
    await store.assets.create(
      newAsset({ projectId: 'p2', type: 'image', provider: 'fal', storageKey: 'k2' }, { id: 'a2', now: 'T3' }),
    );
    expect(await store.assets.get('a1')).toEqual(a);
    expect(await store.assets.listByProject('p1')).toEqual([a]);
  });

  it('creates, merge-updates, and lists jobs; throws on unknown update', async () => {
    const store = d1Store(new FakeD1());
    await store.jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j1', now: 'T' }));

    const updated = await store.jobs.update('j1', { status: 'running', progress: 0.5 });
    expect(updated.status).toBe('running');
    expect(updated.progress).toBe(0.5);
    expect(updated.kind).toBe('image');

    expect((await store.jobs.get('j1'))?.status).toBe('running');
    expect(await store.jobs.listByProject('p1')).toHaveLength(1);

    await expect(store.jobs.update('nope', { status: 'done' })).rejects.toThrowError(/unknown job: nope/i);
  });

  it('shares one schema-init per binding across separate stores', async () => {
    const db = new FakeD1();
    const s1 = d1Store(db);
    const s2 = d1Store(db);
    await s1.projects.create(newProject({ name: 'A' }, { id: 'p1', now: 'T1' }));
    // s2 sees the row written via s1: same binding, same underlying DB.
    expect(await s2.projects.get('p1')).not.toBeNull();
  });
});
