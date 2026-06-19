# Forgecast M1 — Plan 2d: Durable Persistence (SQLite + Filesystem)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generated content survives restarts. Add durable implementations of the repository + storage contracts using Node's built-in `node:sqlite` and the filesystem — **no Docker, no new dependencies** — selectable by environment variables, behind the same interfaces (so nothing upstream changes). Postgres/MinIO/R2 remain a future scale-up profile.

**Architecture:** `@forgecast/store` gains `sqlite/` repositories (one `DatabaseSync` shared) and a `fs/` storage driver. `apps/web`'s `buildServices()` picks SQLite+filesystem when `FORGECAST_DB` / `FORGECAST_DATA_DIR` are set, else stays in-memory (so tests + the zero-config dev experience are unchanged). Verified durable in-process via `:memory:`/temp-dir tests and a real "create → restart → still there" check.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (2c complete: spine API + Studio live; 49 tests; published).

---

## Task 1: SQLite repositories (`node:sqlite`)

**Files:**
- Modify: root `package.json` (bump `@types/node` so `node:sqlite` is typed)
- Create: `packages/store/src/sqlite/db.ts`, `projectRepo.ts`, `assetRepo.ts`, `jobRepo.ts`, `store.ts`
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/sqlite.test.ts`

- [ ] **Step 1: Bump `@types/node`** in root `package.json` from `^20.14.0` to `^24.0.0` (node:sqlite types ship in @types/node ≥ 22.5). Run `pnpm install`. Then `pnpm typecheck` to confirm the bump didn't break anything; fix only genuine breaks, report them.

- [ ] **Step 2: `packages/store/src/sqlite/db.ts`** (schema applied via prepared statements)

```ts
import { DatabaseSync } from 'node:sqlite';

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS assets (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     type TEXT NOT NULL,
     provider TEXT NOT NULL,
     params TEXT NOT NULL,
     storage_key TEXT NOT NULL,
     status TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS jobs (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     provider TEXT NOT NULL,
     params TEXT NOT NULL,
     status TEXT NOT NULL,
     progress REAL NOT NULL,
     result_asset_id TEXT,
     error TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
];

/** Opens (creating if needed) a SQLite database and ensures the schema exists. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  for (const statement of SCHEMA) {
    db.prepare(statement).run();
  }
  return db;
}
```

- [ ] **Step 3: `packages/store/src/sqlite/projectRepo.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Project, ProjectRepo } from '@forgecast/core';

interface ProjectRow { id: string; name: string; created_at: string }
const toProject = (r: ProjectRow): Project => ({ id: r.id, name: r.name, createdAt: r.created_at });

export class SqliteProjectRepo implements ProjectRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(p: Project): Promise<Project> {
    this.db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(p.id, p.name, p.createdAt);
    return p;
  }
  async get(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }
  async list(): Promise<Project[]> {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC, id ASC').all() as ProjectRow[];
    return rows.map(toProject);
  }
}
```

- [ ] **Step 4: `packages/store/src/sqlite/assetRepo.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Asset, AssetRepo, AssetType } from '@forgecast/core';

interface AssetRow {
  id: string; project_id: string; type: string; provider: string;
  params: string; storage_key: string; status: string; created_at: string;
}
const toAsset = (r: AssetRow): Asset => ({
  id: r.id, projectId: r.project_id, type: r.type as AssetType, provider: r.provider,
  params: JSON.parse(r.params) as Record<string, unknown>, storageKey: r.storage_key,
  status: r.status as 'ready' | 'error', createdAt: r.created_at,
});

export class SqliteAssetRepo implements AssetRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(a: Asset): Promise<Asset> {
    this.db
      .prepare('INSERT INTO assets (id, project_id, type, provider, params, storage_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.id, a.projectId, a.type, a.provider, JSON.stringify(a.params), a.storageKey, a.status, a.createdAt);
    return a;
  }
  async get(id: string): Promise<Asset | null> {
    const row = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
    return row ? toAsset(row) : null;
  }
  async listByProject(projectId: string): Promise<Asset[]> {
    const rows = this.db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC, id ASC').all(projectId) as AssetRow[];
    return rows.map(toAsset);
  }
}
```

- [ ] **Step 5: `packages/store/src/sqlite/jobRepo.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Job, JobRepo, JobKind, JobStatus } from '@forgecast/core';

interface JobRow {
  id: string; project_id: string; kind: string; provider: string; params: string;
  status: string; progress: number; result_asset_id: string | null; error: string | null;
  created_at: string; updated_at: string;
}
const toJob = (r: JobRow): Job => ({
  id: r.id, projectId: r.project_id, kind: r.kind as JobKind, provider: r.provider,
  params: JSON.parse(r.params) as Record<string, unknown>, status: r.status as JobStatus,
  progress: r.progress, resultAssetId: r.result_asset_id ?? undefined, error: r.error ?? undefined,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export class SqliteJobRepo implements JobRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(j: Job): Promise<Job> {
    this.db
      .prepare('INSERT INTO jobs (id, project_id, kind, provider, params, status, progress, result_asset_id, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(j.id, j.projectId, j.kind, j.provider, JSON.stringify(j.params), j.status, j.progress, j.resultAssetId ?? null, j.error ?? null, j.createdAt, j.updatedAt);
    return j;
  }
  async get(id: string): Promise<Job | null> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? toJob(row) : null;
  }
  async update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Unknown job: ${id}`);
    const j: Job = { ...existing, ...patch };
    this.db
      .prepare('UPDATE jobs SET project_id=?, kind=?, provider=?, params=?, status=?, progress=?, result_asset_id=?, error=?, created_at=?, updated_at=? WHERE id=?')
      .run(j.projectId, j.kind, j.provider, JSON.stringify(j.params), j.status, j.progress, j.resultAssetId ?? null, j.error ?? null, j.createdAt, j.updatedAt, id);
    return j;
  }
  async listByProject(projectId: string): Promise<Job[]> {
    const rows = this.db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at ASC, id ASC').all(projectId) as JobRow[];
    return rows.map(toJob);
  }
}
```

- [ ] **Step 6: `packages/store/src/sqlite/store.ts`**

```ts
import { openDatabase } from './db';
import { SqliteProjectRepo } from './projectRepo';
import { SqliteAssetRepo } from './assetRepo';
import { SqliteJobRepo } from './jobRepo';

export interface SqliteStore {
  projects: SqliteProjectRepo;
  assets: SqliteAssetRepo;
  jobs: SqliteJobRepo;
  close(): void;
}

/** Opens a durable SQLite-backed store at `path` (use ':memory:' for ephemeral). */
export function openStore(path: string): SqliteStore {
  const db = openDatabase(path);
  return {
    projects: new SqliteProjectRepo(db),
    assets: new SqliteAssetRepo(db),
    jobs: new SqliteJobRepo(db),
    close: () => db.close(),
  };
}
```

- [ ] **Step 7: Update `packages/store/src/index.ts`** — add:

```ts
export * from './sqlite/projectRepo';
export * from './sqlite/assetRepo';
export * from './sqlite/jobRepo';
export * from './sqlite/store';
```
(Keep the existing in-memory + storage exports.)

- [ ] **Step 8: Write the test `packages/store/test/sqlite.test.ts`** (in-memory db for CRUD; a temp FILE for durability across reopen)

```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { newProject, newAsset, newJob } from '@forgecast/core';
import { openStore } from '../src/index';

describe('SQLite store (in-memory db)', () => {
  it('CRUDs projects, assets, and jobs', async () => {
    const s = openStore(':memory:');
    await s.projects.create(newProject({ name: 'Demo' }, { id: 'p1', now: 'T1' }));
    expect((await s.projects.get('p1'))?.name).toBe('Demo');
    expect(await s.projects.get('missing')).toBeNull();

    await s.assets.create(newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k', params: { prompt: 'x' } }, { id: 'a1', now: 'T1' }));
    expect((await s.assets.listByProject('p1'))[0]?.params).toEqual({ prompt: 'x' });

    await s.jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'x' } }, { id: 'j1', now: 'T1' }));
    const done = await s.jobs.update('j1', { status: 'done', progress: 1, resultAssetId: 'a1' });
    expect(done.status).toBe('done');
    expect(done.resultAssetId).toBe('a1');
    expect((await s.jobs.get('j1'))?.status).toBe('done');
    await expect(s.jobs.update('nope', { status: 'done' })).rejects.toThrowError(/unknown job: nope/i);
    s.close();
  });
});

describe('SQLite store (durable file)', () => {
  it('persists data across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-sqlite-'));
    const path = join(dir, 'forgecast.db');
    try {
      const a = openStore(path);
      await a.projects.create(newProject({ name: 'Persisted' }, { id: 'p1', now: 'T1' }));
      a.close();

      const b = openStore(path); // reopen the same file
      expect((await b.projects.get('p1'))?.name).toBe('Persisted');
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 9:** Run `pnpm test packages/store/test/sqlite.test.ts` (PASS), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(store): durable SQLite repositories (node:sqlite)`.

---

## Task 2: Filesystem storage driver

**Files:**
- Create: `packages/store/src/fs/storage.ts`; modify `packages/store/src/index.ts`
- Test: `packages/store/test/fsStorage.test.ts`

- [ ] **Step 1: `packages/store/src/fs/storage.ts`**

```ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageDriver, StoredObject, StoredBytes } from '@forgecast/core';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface FilesystemStorageOptions {
  /** Directory under which object keys are stored. */
  root: string;
  /** Base url for generated object urls. Defaults to "file://forgecast". */
  baseUrl?: string;
}

export class FilesystemStorage implements StorageDriver {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(opts: FilesystemStorageOptions) {
    this.root = opts.root;
    this.baseUrl = (opts.baseUrl ?? 'file://forgecast').replace(/\/$/, '');
  }

  private pathFor(key: string): string {
    if (key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    return join(this.root, key);
  }

  async put(key: string, data: Uint8Array, _contentType: string): Promise<StoredObject> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return { key, url: this.url(key) };
  }

  async get(key: string): Promise<StoredBytes | null> {
    try {
      const buf = await readFile(this.pathFor(key));
      return { data: new Uint8Array(buf), contentType: contentTypeFor(key) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  url(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
```
(`_contentType` is intentionally unused — content type is derived from the key's extension on read, and our keys always carry the correct extension.)

- [ ] **Step 2: Update `packages/store/src/index.ts`** — add `export * from './fs/storage';`.

- [ ] **Step 3: Write `packages/store/test/fsStorage.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { FilesystemStorage } from '../src/index';

describe('FilesystemStorage', () => {
  it('stores and reads bytes, infers content type, and persists across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-fs-'));
    try {
      const a = new FilesystemStorage({ root: dir, baseUrl: 'http://x' });
      const stored = await a.put('projects/p1/images/a1.png', new Uint8Array([1, 2, 3]), 'image/png');
      expect(stored).toEqual({ key: 'projects/p1/images/a1.png', url: 'http://x/projects/p1/images/a1.png' });

      const b = new FilesystemStorage({ root: dir }); // fresh instance, same root
      const got = await b.get('projects/p1/images/a1.png');
      expect(got?.contentType).toBe('image/png');
      expect(Array.from(got?.data ?? [])).toEqual([1, 2, 3]);

      expect(await b.get('missing.png')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects keys containing ".."', async () => {
    const s = new FilesystemStorage({ root: '/tmp/forgecast-test' });
    await expect(s.get('../escape.png')).rejects.toThrowError(/invalid storage key/i);
  });
});
```

- [ ] **Step 4:** `pnpm test packages/store/test/fsStorage.test.ts` (PASS), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(store): filesystem storage driver`.

---

## Task 3: Wire persistence by environment + verify

**Files:**
- Modify: `apps/web/lib/forgecast.ts`, `.env.example`, `.gitignore`
- Test: `apps/web/test/persistence.test.ts`

- [ ] **Step 1: Update `apps/web/lib/forgecast.ts`** — select durable backends when env vars are present (keep `falKey`/`fetchFn` opts + the `'falKey' in opts` guard). Replace the in-memory wiring block with:

```ts
  const dbPath = process.env.FORGECAST_DB;
  const dataDir = process.env.FORGECAST_DATA_DIR;

  let projects: ProjectRepo;
  let assets: AssetRepo;
  let jobs: JobRepo;
  if (dbPath) {
    const store = openStore(dbPath);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
  } else {
    projects = new InMemoryProjectRepo();
    assets = new InMemoryAssetRepo();
    jobs = new InMemoryJobRepo();
  }

  const storage: StorageDriver = dataDir
    ? new FilesystemStorage({ root: dataDir, baseUrl: process.env.FORGECAST_BASE_URL })
    : new InMemoryStorage({ baseUrl: process.env.FORGECAST_BASE_URL ?? 'memory://forgecast' });
```
Add `openStore`, `FilesystemStorage` to the `@forgecast/store` import. Ensure `ProjectRepo`/`AssetRepo`/`JobRepo`/`StorageDriver` are imported from `@forgecast/core` (some already are).

- [ ] **Step 2: Write `apps/web/test/persistence.test.ts`** (the env branch produces a working SQLite-backed store)

```ts
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
```

- [ ] **Step 3: Update `.env.example`** — append:

```dotenv

# Durable persistence (optional — omit both for ephemeral in-memory)
# FORGECAST_DB=./.forgecast/forgecast.db
# FORGECAST_DATA_DIR=./.forgecast/objects
# FORGECAST_BASE_URL=http://localhost:3210
```

- [ ] **Step 4: Update `.gitignore`** — add `/.forgecast/` and `apps/web/.forgecast/` (the local data dir) so a developer's database/objects are never committed.

- [ ] **Step 5:** `pnpm test` (all green), `pnpm typecheck` clean, `pnpm --filter @forgecast/web build` ok. Commit: `feat(web): select durable SQLite+filesystem persistence via env`.

---

## Definition of Done (2d)

- `@forgecast/store` exports `openStore` (SQLite repos) + `FilesystemStorage`, both durable across reopen, unit-tested in-process (no Docker, no new deps).
- `buildServices()` uses them when `FORGECAST_DB` / `FORGECAST_DATA_DIR` are set; otherwise in-memory (tests + zero-config dev unchanged).
- Full `pnpm test` green; `pnpm typecheck` clean; web builds.
- Atomic commits per task.

**Verification (controller):** run the app with `FORGECAST_DB`+`FORGECAST_DATA_DIR` set, create a project over HTTP, restart the server, confirm the project is still listed — proving real durability.

**Next:** wire a live `FAL_KEY` for an actual generated+persisted image; then Postgres/MinIO/R2 as the team/cloud profile; then Plan 3 (short-video worker) and Plan 4 (MCP surface).
