# Forgecast M1 — Plan 2: Spine + Image Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Forgecast "spine" — persistence (projects/assets/jobs), object storage, an async job engine, an HTTP API, and an Image Studio UI — on top of the Plan 1 provider library, so a user can generate and browse images end-to-end.

**Architecture:** Layered and dependency-inverted. `@forgecast/core` defines repository/storage/job *interfaces*; `@forgecast/store` provides in-memory implementations (for tests/dev) and later Postgres/MinIO implementations (same interfaces). The Next.js app wires these to the Plan 1 provider registry. Everything is testable offline against in-memory adapters; concrete infra (Postgres, MinIO) is added behind the same interfaces.

**Tech Stack:** Node 20+, pnpm workspaces, TypeScript (Bundler resolution, ESM), Vitest. (Next.js, Postgres, MinIO added in later sub-plans.)

**Repo:** `~/Desktop/BaxterLabs/forgecast` (exists; Plan 1 complete — `@forgecast/core` and `@forgecast/providers` are live and green).

---

## Verified upstream finding (informs this plan)

Cloning `Anil-matcha/Open-Generative-AI` confirmed its `app/api/**/[[...path]]/route.js` handlers are **thin proxies to `https://api.muapi.ai`** — there is no self-contained gateway to vendor. Therefore:
- Image generation is built on **Forgecast's own provider registry** (Plan 1: `ImageProviderRegistry` + `FalImageProvider`), not Open-Gen-AI's code.
- The one reusable asset is **`models_dump.json`** (51 text-to-image models with input schemas) — harvested later (Plan 2c) to seed a model-picker. Muapi can become an optional `ImageProvider` adapter, no different from fal.

---

## Plan 2 decomposition (each sub-plan is independently testable)

- **Plan 2a — Domain Store & Data Layer** *(THIS DOCUMENT, in full)*: factories + repository/storage interfaces in `@forgecast/core`; in-memory implementations in a new `@forgecast/store`. Pure, offline.
- **Plan 2b — Job Engine + Image Handler**: `JobQueue`/`JobHandler`/`JobRunner` interfaces + in-process runner; the image-generation handler wiring `ImageProviderRegistry` → `StorageDriver` → `AssetRepo`/`JobRepo`. Offline (fake provider + in-memory store).
- **Plan 2c — Next.js Spine API + Image Studio UI**: `apps/web` route handlers (projects/assets/jobs/generate) + the studio UI (prompt, model picker seeded from harvested `models_dump.json`, gallery, job progress).
- **Plan 2d — Concrete infra + compose**: Postgres (`@forgecast/store` Drizzle impl) + S3/MinIO `StorageDriver` + `docker-compose.yml` + end-to-end run verification.

This document specifies **Plan 2a** completely. Plans 2b–2d are written when reached.

---

## Plan 2a — File Structure

| File | Responsibility |
|------|----------------|
| `packages/core/src/factories.ts` | `newProject`, `newAsset` (deterministic, injected id/clock) |
| `packages/core/src/repos.ts` | `ProjectRepo`, `AssetRepo`, `JobRepo` interfaces |
| `packages/core/src/storage.ts` | `StorageDriver`, `StoredObject` interfaces |
| `packages/core/src/index.ts` | barrel (add the three new modules) |
| `packages/core/test/factories.test.ts` | factory tests |
| `packages/core/test/contracts.test.ts` | repo/storage contracts proven via fakes |
| `packages/store/package.json` · `tsconfig.json` | new package `@forgecast/store` |
| `packages/store/src/memory/projectRepo.ts` | `InMemoryProjectRepo` |
| `packages/store/src/memory/assetRepo.ts` | `InMemoryAssetRepo` |
| `packages/store/src/memory/jobRepo.ts` | `InMemoryJobRepo` |
| `packages/store/src/memory/storage.ts` | `InMemoryStorage` |
| `packages/store/src/index.ts` | barrel |
| `packages/store/test/*.test.ts` | per-impl tests + integration |

---

## Task 1: Core factories — `newProject`, `newAsset`

**Files:**
- Create: `packages/core/src/factories.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/factories.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/test/factories.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newProject, newAsset } from '../src/factories';

describe('newProject', () => {
  it('creates a project with injected id and timestamp', () => {
    const p = newProject({ name: 'Launch campaign' }, { id: 'p1', now: '2026-06-17T00:00:00Z' });
    expect(p).toEqual({ id: 'p1', name: 'Launch campaign', createdAt: '2026-06-17T00:00:00Z' });
  });
});

describe('newAsset', () => {
  it('creates a ready asset with injected id and timestamp', () => {
    const a = newAsset(
      { projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'img/1.png', params: { prompt: 'a cat' } },
      { id: 'a1', now: '2026-06-17T00:00:00Z' },
    );
    expect(a).toEqual({
      id: 'a1',
      projectId: 'p1',
      type: 'image',
      provider: 'fal',
      params: { prompt: 'a cat' },
      storageKey: 'img/1.png',
      status: 'ready',
      createdAt: '2026-06-17T00:00:00Z',
    });
  });

  it('defaults params to {} and status to ready', () => {
    const a = newAsset(
      { projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k' },
      { id: 'a2', now: '2026-06-17T00:00:00Z' },
    );
    expect(a.params).toEqual({});
    expect(a.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `pnpm test packages/core/test/factories.test.ts`
Expected: FAIL — cannot resolve `../src/factories`.

- [ ] **Step 3: Implement `packages/core/src/factories.ts`**

```ts
import type { Project, Asset, AssetType } from './types';

export interface NewProjectInput {
  name: string;
}

export interface NewProjectDeps {
  id: string;
  now: string;
}

export function newProject(input: NewProjectInput, deps: NewProjectDeps): Project {
  return { id: deps.id, name: input.name, createdAt: deps.now };
}

export interface NewAssetInput {
  projectId: string;
  type: AssetType;
  provider: string;
  storageKey: string;
  params?: Record<string, unknown>;
  status?: 'ready' | 'error';
}

export interface NewAssetDeps {
  id: string;
  now: string;
}

export function newAsset(input: NewAssetInput, deps: NewAssetDeps): Asset {
  return {
    id: deps.id,
    projectId: input.projectId,
    type: input.type,
    provider: input.provider,
    params: input.params ?? {},
    storageKey: input.storageKey,
    status: input.status ?? 'ready',
    createdAt: deps.now,
  };
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`** (add factories; keep existing exports)

```ts
export * from './types';
export * from './job';
export * from './providers';
export * from './factories';
```

- [ ] **Step 5: Run the test, confirm it PASSES; run full suite + typecheck**

Run: `pnpm test packages/core/test/factories.test.ts` → PASS (3 tests)
Run: `pnpm test` → all pass
Run: `pnpm typecheck` → clean

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(core): newProject and newAsset factories"
```

---

## Task 2: Repository + storage contracts

**Files:**
- Create: `packages/core/src/repos.ts`, `packages/core/src/storage.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/contracts.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/test/contracts.test.ts`** (tiny fakes prove the interfaces are implementable and document the `get → null when missing` convention)

```ts
import { describe, it, expect } from 'vitest';
import type { ProjectRepo } from '../src/repos';
import type { StorageDriver } from '../src/storage';
import { newProject } from '../src/factories';

class FakeProjectRepo implements ProjectRepo {
  private items = new Map<string, ReturnType<typeof newProject>>();
  async create(p: ReturnType<typeof newProject>) {
    this.items.set(p.id, p);
    return p;
  }
  async get(id: string) {
    return this.items.get(id) ?? null;
  }
  async list() {
    return [...this.items.values()];
  }
}

class FakeStorage implements StorageDriver {
  async put(key: string, _data: Uint8Array, _contentType: string) {
    return { key, url: `mem://${key}` };
  }
  url(key: string) {
    return `mem://${key}`;
  }
}

describe('ProjectRepo contract', () => {
  it('returns null for a missing project and the project after create', async () => {
    const repo = new FakeProjectRepo();
    expect(await repo.get('nope')).toBeNull();
    const p = await repo.create(newProject({ name: 'X' }, { id: 'p1', now: 'T' }));
    expect(await repo.get('p1')).toEqual(p);
    expect(await repo.list()).toEqual([p]);
  });
});

describe('StorageDriver contract', () => {
  it('returns a StoredObject whose url matches url(key)', async () => {
    const s = new FakeStorage();
    const obj = await s.put('img/1.png', new Uint8Array([1, 2, 3]), 'image/png');
    expect(obj).toEqual({ key: 'img/1.png', url: 'mem://img/1.png' });
    expect(s.url('img/1.png')).toBe('mem://img/1.png');
  });
});
```

- [ ] **Step 2: Run the test, confirm it FAILS** (cannot resolve `../src/repos`)

Run: `pnpm test packages/core/test/contracts.test.ts`

- [ ] **Step 3: Implement `packages/core/src/repos.ts`**

```ts
import type { Project, Asset, Job } from './types';

export interface ProjectRepo {
  create(project: Project): Promise<Project>;
  get(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
}

export interface AssetRepo {
  create(asset: Asset): Promise<Asset>;
  get(id: string): Promise<Asset | null>;
  listByProject(projectId: string): Promise<Asset[]>;
}

export interface JobRepo {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job>;
  listByProject(projectId: string): Promise<Job[]>;
}
```

- [ ] **Step 4: Implement `packages/core/src/storage.ts`**

```ts
export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  /** Stores bytes under `key` and returns the stored object's key + public/retrievable url. */
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  /** The url at which `key` can be retrieved. */
  url(key: string): string;
}
```

- [ ] **Step 5: Update `packages/core/src/index.ts`**

```ts
export * from './types';
export * from './job';
export * from './providers';
export * from './factories';
export * from './repos';
export * from './storage';
```

- [ ] **Step 6: Run the test (PASS), full suite, typecheck**

Run: `pnpm test packages/core/test/contracts.test.ts` → PASS (2 tests)
Run: `pnpm test` → all pass · `pnpm typecheck` → clean

- [ ] **Step 7: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(core): repository and storage contracts"
```

---

## Task 3: `@forgecast/store` package + `InMemoryProjectRepo`

**Files:**
- Create: `packages/store/package.json`, `packages/store/tsconfig.json`
- Create: `packages/store/src/memory/projectRepo.ts`, `packages/store/src/index.ts`
- Test: `packages/store/test/projectRepo.test.ts`

- [ ] **Step 1: Create `packages/store/package.json`**

```json
{
  "name": "@forgecast/store",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@forgecast/core": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.4" }
}
```

- [ ] **Step 2: Create `packages/store/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@forgecast/core": ["../core/src/index.ts"] }
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Add the `@forgecast/store` → `@forgecast/core` alias to `vitest.config.ts`** (modify the `resolve.alias` block to add the store entry; keep the existing two)

```ts
    alias: {
      '@forgecast/core': `${root}packages/core/src/index.ts`,
      '@forgecast/providers': `${root}packages/providers/src/index.ts`,
      '@forgecast/store': `${root}packages/store/src/index.ts`,
    },
```

- [ ] **Step 4: Run `pnpm install`** to link the new workspace package.

Run: `pnpm install`
Expected: links `@forgecast/core` into `@forgecast/store`.

- [ ] **Step 5: Write the failing test `packages/store/test/projectRepo.test.ts`**

```ts
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
```

- [ ] **Step 6: Run the test, confirm it FAILS** (cannot resolve `../src/index`)

Run: `pnpm test packages/store/test/projectRepo.test.ts`

- [ ] **Step 7: Implement `packages/store/src/memory/projectRepo.ts`**

```ts
import type { Project, ProjectRepo } from '@forgecast/core';

export class InMemoryProjectRepo implements ProjectRepo {
  private readonly items = new Map<string, Project>();

  async create(project: Project): Promise<Project> {
    this.items.set(project.id, project);
    return project;
  }

  async get(id: string): Promise<Project | null> {
    return this.items.get(id) ?? null;
  }

  async list(): Promise<Project[]> {
    return [...this.items.values()];
  }
}
```

- [ ] **Step 8: Create the barrel `packages/store/src/index.ts`**

```ts
export * from './memory/projectRepo';
```

- [ ] **Step 9: Run the test (PASS), full suite, typecheck**

Run: `pnpm test packages/store/test/projectRepo.test.ts` → PASS (1 test)
Run: `pnpm test` → all pass · `pnpm typecheck` → clean

- [ ] **Step 10: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(store): @forgecast/store package + InMemoryProjectRepo"
```

---

## Task 4: `InMemoryAssetRepo` + `InMemoryJobRepo`

**Files:**
- Create: `packages/store/src/memory/assetRepo.ts`, `packages/store/src/memory/jobRepo.ts`
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/assetRepo.test.ts`, `packages/store/test/jobRepo.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/store/test/assetRepo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newAsset } from '@forgecast/core';
import { InMemoryAssetRepo } from '../src/index';

describe('InMemoryAssetRepo', () => {
  it('creates, gets, and lists assets by project', async () => {
    const repo = new InMemoryAssetRepo();
    const a1 = await repo.create(
      newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k1' }, { id: 'a1', now: 'T' }),
    );
    await repo.create(
      newAsset({ projectId: 'p2', type: 'image', provider: 'fal', storageKey: 'k2' }, { id: 'a2', now: 'T' }),
    );
    expect(await repo.get('a1')).toEqual(a1);
    expect(await repo.get('missing')).toBeNull();
    expect(await repo.listByProject('p1')).toEqual([a1]);
  });
});
```

`packages/store/test/jobRepo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newJob } from '@forgecast/core';
import { InMemoryJobRepo } from '../src/index';

describe('InMemoryJobRepo', () => {
  it('creates, updates (merge), gets, and lists by project', async () => {
    const repo = new InMemoryJobRepo();
    await repo.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j1', now: 'T' }));

    const updated = await repo.update('j1', { status: 'running', progress: 0.5 });
    expect(updated.status).toBe('running');
    expect(updated.progress).toBe(0.5);
    expect(updated.kind).toBe('image'); // unchanged fields preserved

    expect((await repo.get('j1'))?.status).toBe('running');
    expect(await repo.listByProject('p1')).toHaveLength(1);
  });

  it('throws when updating an unknown job', async () => {
    const repo = new InMemoryJobRepo();
    await expect(repo.update('nope', { status: 'done' })).rejects.toThrowError(/unknown job: nope/i);
  });
});
```

- [ ] **Step 2: Run both tests, confirm they FAIL** (cannot resolve the new classes)

Run: `pnpm test packages/store/test/assetRepo.test.ts packages/store/test/jobRepo.test.ts`

- [ ] **Step 3: Implement `packages/store/src/memory/assetRepo.ts`**

```ts
import type { Asset, AssetRepo } from '@forgecast/core';

export class InMemoryAssetRepo implements AssetRepo {
  private readonly items = new Map<string, Asset>();

  async create(asset: Asset): Promise<Asset> {
    this.items.set(asset.id, asset);
    return asset;
  }

  async get(id: string): Promise<Asset | null> {
    return this.items.get(id) ?? null;
  }

  async listByProject(projectId: string): Promise<Asset[]> {
    return [...this.items.values()].filter((a) => a.projectId === projectId);
  }
}
```

- [ ] **Step 4: Implement `packages/store/src/memory/jobRepo.ts`**

```ts
import type { Job, JobRepo } from '@forgecast/core';

export class InMemoryJobRepo implements JobRepo {
  private readonly items = new Map<string, Job>();

  async create(job: Job): Promise<Job> {
    this.items.set(job.id, job);
    return job;
  }

  async get(id: string): Promise<Job | null> {
    return this.items.get(id) ?? null;
  }

  async update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`Unknown job: ${id}`);
    const updated: Job = { ...existing, ...patch };
    this.items.set(id, updated);
    return updated;
  }

  async listByProject(projectId: string): Promise<Job[]> {
    return [...this.items.values()].filter((j) => j.projectId === projectId);
  }
}
```

- [ ] **Step 5: Update the barrel `packages/store/src/index.ts`**

```ts
export * from './memory/projectRepo';
export * from './memory/assetRepo';
export * from './memory/jobRepo';
```

- [ ] **Step 6: Run both tests (PASS), full suite, typecheck**

Run: `pnpm test packages/store` → all store tests pass
Run: `pnpm test` → all pass · `pnpm typecheck` → clean

- [ ] **Step 7: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(store): in-memory asset and job repositories"
```

---

## Task 5: `InMemoryStorage`

**Files:**
- Create: `packages/store/src/memory/storage.ts`
- Modify: `packages/store/src/index.ts`
- Test: `packages/store/test/storage.test.ts`

- [ ] **Step 1: Write the failing test `packages/store/test/storage.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryStorage } from '../src/index';

describe('InMemoryStorage', () => {
  it('stores bytes and returns a url derived from the key', async () => {
    const s = new InMemoryStorage({ baseUrl: 'mem://forgecast' });
    const obj = await s.put('img/1.png', new Uint8Array([1, 2, 3]), 'image/png');
    expect(obj).toEqual({ key: 'img/1.png', url: 'mem://forgecast/img/1.png' });
    expect(s.url('img/1.png')).toBe('mem://forgecast/img/1.png');
  });

  it('reads back stored bytes and content type via the test helper', async () => {
    const s = new InMemoryStorage();
    await s.put('a.txt', new Uint8Array([65]), 'text/plain');
    expect(s.read('a.txt')).toEqual({ data: new Uint8Array([65]), contentType: 'text/plain' });
    expect(s.read('missing')).toBeUndefined();
  });

  it('strips a trailing slash from baseUrl', async () => {
    const s = new InMemoryStorage({ baseUrl: 'mem://x/' });
    expect(s.url('k')).toBe('mem://x/k');
  });
});
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `pnpm test packages/store/test/storage.test.ts`

- [ ] **Step 3: Implement `packages/store/src/memory/storage.ts`**

```ts
import type { StorageDriver, StoredObject } from '@forgecast/core';

export interface InMemoryStorageOptions {
  /** Base url for generated object urls. Defaults to "memory://forgecast". */
  baseUrl?: string;
}

interface StoredBytes {
  data: Uint8Array;
  contentType: string;
}

export class InMemoryStorage implements StorageDriver {
  private readonly objects = new Map<string, StoredBytes>();
  private readonly baseUrl: string;

  constructor(opts: InMemoryStorageOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'memory://forgecast').replace(/\/$/, '');
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { data, contentType });
    return { key, url: this.url(key) };
  }

  url(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /** Test/debug helper: read back stored bytes. Not part of the StorageDriver contract. */
  read(key: string): StoredBytes | undefined {
    return this.objects.get(key);
  }
}
```

- [ ] **Step 4: Update the barrel `packages/store/src/index.ts`**

```ts
export * from './memory/projectRepo';
export * from './memory/assetRepo';
export * from './memory/jobRepo';
export * from './memory/storage';
```

- [ ] **Step 5: Run the test (PASS), full suite, typecheck**

Run: `pnpm test packages/store/test/storage.test.ts` → PASS (3 tests)
Run: `pnpm test` → all pass · `pnpm typecheck` → clean

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(store): in-memory storage driver"
```

---

## Task 6: Store integration test

**Files:**
- Test: `packages/store/test/integration.test.ts`

- [ ] **Step 1: Write the test `packages/store/test/integration.test.ts`** (the data layer composes: a project, an asset stored to storage, and a job that completes referencing the asset)

```ts
import { describe, it, expect } from 'vitest';
import { newProject, newAsset, newJob } from '@forgecast/core';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
} from '../src/index';

describe('store integration', () => {
  it('persists a project, stores an image, records an asset, and completes a job', async () => {
    const projects = new InMemoryProjectRepo();
    const assets = new InMemoryAssetRepo();
    const jobs = new InMemoryJobRepo();
    const storage = new InMemoryStorage({ baseUrl: 'mem://forgecast' });

    const project = await projects.create(newProject({ name: 'Demo' }, { id: 'p1', now: 'T' }));

    const job = await jobs.create(
      newJob({ projectId: project.id, kind: 'image', provider: 'fal', params: { prompt: 'a fox' } }, { id: 'j1', now: 'T' }),
    );

    // simulate a worker: store the produced image, record the asset, finish the job
    const stored = await storage.put('img/j1.png', new Uint8Array([1, 2, 3]), 'image/png');
    const asset = await assets.create(
      newAsset(
        { projectId: project.id, type: 'image', provider: 'fal', storageKey: stored.key, params: job.params },
        { id: 'a1', now: 'T' },
      ),
    );
    const done = await jobs.update(job.id, { status: 'done', progress: 1, resultAssetId: asset.id });

    expect(done.status).toBe('done');
    expect(done.resultAssetId).toBe('a1');
    expect(await assets.listByProject('p1')).toEqual([asset]);
    expect(storage.read('img/j1.png')?.contentType).toBe('image/png');
  });
});
```

- [ ] **Step 2: Run the test (expected PASS — all symbols exist from Tasks 1–5)**

Run: `pnpm test packages/store/test/integration.test.ts`
Expected: PASS. If it fails to resolve symbols, re-check the barrel from Task 5.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `pnpm test` → all pass · `pnpm typecheck` → clean

- [ ] **Step 4: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "test(store): data-layer integration"
```

---

## Definition of Done (Plan 2a)

- `@forgecast/core` exports `newProject`, `newAsset`, the `ProjectRepo`/`AssetRepo`/`JobRepo` and `StorageDriver`/`StoredObject` contracts.
- `@forgecast/store` exports working in-memory implementations of all four, each unit-tested.
- Full `pnpm test` green and `pnpm typecheck` clean.
- Every change is an atomic conventional commit.

**Next:** Plan 2b — Job Engine + Image Handler (the in-process `JobRunner` + the image-generation handler wiring `@forgecast/providers` → `StorageDriver` → repos), then 2c (Next.js API + UI) and 2d (Postgres/MinIO + docker-compose).
