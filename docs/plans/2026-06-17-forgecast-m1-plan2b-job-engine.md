# Forgecast M1 — Plan 2b: Job Engine + Image Handler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an async job engine — an in-process `JobRunner` that drives a `Job` through its lifecycle (queued → running → done/error with progress), plus an `ImageJobHandler` that generates an image via the provider registry, downloads it, stores it, and records an `Asset`.

**Architecture:** A new `@forgecast/jobs` package depends on `@forgecast/core` (contracts) and `@forgecast/providers` (image registry). The runner is generic (knows only the `JobHandler` contract from core); the image handler is the first concrete handler. Everything is unit-tested fully offline with a fake provider, in-memory store, and a mocked `fetch`.

**Tech Stack:** Node 20+, pnpm, TypeScript (Bundler, ESM), Vitest.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (Plans 1 + 2a complete: `@forgecast/core`, `@forgecast/providers`, `@forgecast/store` are live; 27 tests green, tsc clean).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/core/src/jobengine.ts` | `JobHandler`, `ProgressReporter`, `JobOutcome` contracts |
| `packages/core/src/index.ts` | barrel (add jobengine) |
| `packages/jobs/package.json` · `tsconfig.json` | new `@forgecast/jobs` |
| `packages/jobs/src/runner.ts` | `JobRunner` (lifecycle orchestration) |
| `packages/jobs/src/handlers/image.ts` | `ImageJobHandler` |
| `packages/jobs/src/index.ts` | barrel |
| `packages/jobs/test/*.test.ts` | runner, image handler, integration |

---

## Task 1: Core job contracts + `@forgecast/jobs` package + `JobRunner`

**Files:**
- Create: `packages/core/src/jobengine.ts`; modify `packages/core/src/index.ts`
- Create: `packages/jobs/package.json`, `packages/jobs/tsconfig.json`, `packages/jobs/src/runner.ts`, `packages/jobs/src/index.ts`
- Modify: `vitest.config.ts` (add `@forgecast/jobs` alias)
- Test: `packages/jobs/test/runner.test.ts`

- [ ] **Step 1: Add core contracts `packages/core/src/jobengine.ts`**

```ts
import type { Job, JobKind } from './types';

export type ProgressReporter = (progress: number) => void | Promise<void>;

export interface JobOutcome {
  assetId: string;
}

export interface JobHandler {
  readonly kind: JobKind;
  run(job: Job, report: ProgressReporter): Promise<JobOutcome>;
}
```

- [ ] **Step 2: Update `packages/core/src/index.ts`** (append; keep existing)

```ts
export * from './types';
export * from './job';
export * from './providers';
export * from './factories';
export * from './repos';
export * from './storage';
export * from './jobengine';
```

- [ ] **Step 3: Create `packages/jobs/package.json`**

```json
{
  "name": "@forgecast/jobs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@forgecast/core": "workspace:*",
    "@forgecast/providers": "workspace:*"
  },
  "devDependencies": {
    "@forgecast/store": "workspace:*",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 4: Create `packages/jobs/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@forgecast/core": ["../core/src/index.ts"],
      "@forgecast/providers": ["../providers/src/index.ts"],
      "@forgecast/store": ["../store/src/index.ts"]
    }
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Add the `@forgecast/jobs` alias to `vitest.config.ts`** (add to the existing `resolve.alias` block)

```ts
      '@forgecast/jobs': `${root}packages/jobs/src/index.ts`,
```

- [ ] **Step 6: Run `pnpm install`** to link the new workspace package.

- [ ] **Step 7: Write the failing test `packages/jobs/test/runner.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { JobHandler } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryJobRepo } from '@forgecast/store';
import { JobRunner } from '../src/index';

describe('JobRunner', () => {
  it('drives a job queued -> running -> done with progress and resultAssetId', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j1', now: 'T' }));

    const seen: number[] = [];
    const handler: JobHandler = {
      kind: 'image',
      run: async (_job, report) => {
        await report(0.5);
        seen.push(0.5);
        return { assetId: 'a1' };
      },
    };

    const runner = new JobRunner(jobs, [handler]);
    const done = await runner.run('j1');

    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.resultAssetId).toBe('a1');
    expect(seen).toEqual([0.5]);
  });

  it('marks the job error when the handler throws', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j2', now: 'T' }));
    const handler: JobHandler = { kind: 'image', run: async () => { throw new Error('boom'); } };
    const runner = new JobRunner(jobs, [handler]);

    const errored = await runner.run('j2');
    expect(errored.status).toBe('error');
    expect(errored.error).toBe('boom');
  });

  it('throws for an unknown job id', async () => {
    const runner = new JobRunner(new InMemoryJobRepo(), []);
    await expect(runner.run('nope')).rejects.toThrowError(/unknown job: nope/i);
  });

  it('marks error when no handler is registered for the job kind', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'short_video', provider: 'mpt' }, { id: 'j3', now: 'T' }));
    const runner = new JobRunner(jobs, []);
    const errored = await runner.run('j3');
    expect(errored.status).toBe('error');
    expect(errored.error).toMatch(/no handler for job kind: short_video/i);
  });
});
```

- [ ] **Step 8: Run the test, confirm it FAILS** (`../src/index` / `JobRunner` missing)

Run: `pnpm test packages/jobs/test/runner.test.ts`

- [ ] **Step 9: Implement `packages/jobs/src/runner.ts`**

```ts
import type { Job, JobKind, JobHandler, JobRepo, ProgressReporter } from '@forgecast/core';

export class JobRunner {
  private readonly handlers: Map<JobKind, JobHandler>;

  constructor(
    private readonly jobs: JobRepo,
    handlers: JobHandler[],
  ) {
    this.handlers = new Map(handlers.map((h): [JobKind, JobHandler] => [h.kind, h]));
  }

  async run(jobId: string): Promise<Job> {
    const job = await this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job: ${jobId}`);

    const handler = this.handlers.get(job.kind);
    if (!handler) {
      return this.jobs.update(jobId, { status: 'error', error: `No handler for job kind: ${job.kind}` });
    }

    await this.jobs.update(jobId, { status: 'running', progress: 0 });
    const report: ProgressReporter = async (p) => {
      await this.jobs.update(jobId, { progress: p });
    };

    try {
      const outcome = await handler.run(job, report);
      return await this.jobs.update(jobId, { status: 'done', progress: 1, resultAssetId: outcome.assetId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return await this.jobs.update(jobId, { status: 'error', error: message });
    }
  }
}
```

- [ ] **Step 10: Create `packages/jobs/src/index.ts`**

```ts
export * from './runner';
```

- [ ] **Step 11: Run the test (PASS, 4 tests), full `pnpm test`, `pnpm typecheck` (clean)**

- [ ] **Step 12: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(jobs): core JobHandler contract + JobRunner lifecycle"
```

---

## Task 2: `ImageJobHandler`

**Files:**
- Create: `packages/jobs/src/handlers/image.ts`
- Modify: `packages/jobs/src/index.ts`
- Test: `packages/jobs/test/image.test.ts`

- [ ] **Step 1: Write the failing test `packages/jobs/test/image.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { ImageProviderRegistry } from '@forgecast/providers';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { ImageJobHandler } from '../src/index';

function fakeProvider(name = 'fal'): ImageProvider {
  return {
    name,
    isAvailable: () => true,
    async generateImage(input) {
      return { url: `https://cdn/${encodeURIComponent(input.prompt)}.png` };
    },
  };
}

function pngResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

describe('ImageJobHandler', () => {
  it('generates, downloads, stores, and records an asset', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider('fal'));
    const storage = new InMemoryStorage({ baseUrl: 'mem://f' });
    const assets = new InMemoryAssetRepo();
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => pngResponse());
    let n = 0;

    const handler = new ImageJobHandler({
      registry,
      storage,
      assets,
      idGen: () => `a${++n}`,
      clock: () => 'T',
      fetchFn,
    });

    const job = newJob(
      { projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'a fox', width: 512, height: 512 } },
      { id: 'j1', now: 'T' },
    );
    const progress: number[] = [];
    const outcome = await handler.run(job, async (p) => { progress.push(p); });

    expect(outcome.assetId).toBe('a1');
    const asset = await assets.get('a1');
    expect(asset?.type).toBe('image');
    expect(asset?.provider).toBe('fal');
    expect(asset?.storageKey).toBe('projects/p1/images/a1.png');
    expect(storage.read('projects/p1/images/a1.png')?.contentType).toBe('image/png');
    expect(fetchFn).toHaveBeenCalledWith('https://cdn/a%20fox.png');
    expect(progress.length).toBeGreaterThan(0);
  });

  it('throws when the job has no prompt', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider());
    const handler = new ImageJobHandler({
      registry,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => pngResponse()),
    });
    const job = newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/prompt/i);
  });

  it('throws when the image download fails', async () => {
    const registry = new ImageProviderRegistry();
    registry.register(fakeProvider());
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('nope', { status: 404 }));
    const handler = new ImageJobHandler({
      registry,
      storage: new InMemoryStorage(),
      assets: new InMemoryAssetRepo(),
      idGen: () => 'a1',
      clock: () => 'T',
      fetchFn,
    });
    const job = newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/download/i);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** (`ImageJobHandler` not exported)

Run: `pnpm test packages/jobs/test/image.test.ts`

- [ ] **Step 3: Implement `packages/jobs/src/handlers/image.ts`**

```ts
import {
  newAsset,
  type Job,
  type JobHandler,
  type JobOutcome,
  type ProgressReporter,
  type StorageDriver,
  type AssetRepo,
} from '@forgecast/core';
import type { ImageProviderRegistry } from '@forgecast/providers';

export interface ImageJobParams {
  prompt: string;
  width?: number;
  height?: number;
}

export interface ImageJobHandlerDeps {
  registry: ImageProviderRegistry;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  /** Injectable fetch (to download the generated image). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export class ImageJobHandler implements JobHandler {
  readonly kind = 'image';

  constructor(private readonly deps: ImageJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as Partial<ImageJobParams>;
    if (typeof params.prompt !== 'string' || params.prompt.length === 0) {
      throw new Error('image job requires a non-empty "prompt" param');
    }

    const provider = this.deps.registry.get(job.provider);
    await report(0.1);

    const result = await provider.generateImage({
      prompt: params.prompt,
      width: params.width,
      height: params.height,
    });
    await report(0.6);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(result.url);
    if (!res.ok) throw new Error(`failed to download generated image (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';

    const id = this.deps.idGen();
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const key = `projects/${job.projectId}/images/${id}.${ext}`;
    const stored = await this.deps.storage.put(key, bytes, contentType);
    await report(0.9);

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'image', provider: job.provider, storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
```

- [ ] **Step 4: Update `packages/jobs/src/index.ts`**

```ts
export * from './runner';
export * from './handlers/image';
```

- [ ] **Step 5: Run the test (PASS, 3 tests), full `pnpm test`, `pnpm typecheck` (clean)**

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(jobs): ImageJobHandler (generate -> download -> store -> asset)"
```

---

## Task 3: Job engine integration test

**Files:**
- Test: `packages/jobs/test/integration.test.ts`

- [ ] **Step 1: Write the test `packages/jobs/test/integration.test.ts`** (runner + image handler + in-memory store, mocked fetch — a full image job end-to-end)

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { ImageProviderRegistry } from '@forgecast/providers';
import { InMemoryJobRepo, InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { JobRunner, ImageJobHandler } from '../src/index';

describe('jobs integration', () => {
  it('runs an image job end-to-end through the runner', async () => {
    const registry = new ImageProviderRegistry();
    const provider: ImageProvider = {
      name: 'fal',
      isAvailable: () => true,
      async generateImage() {
        return { url: 'https://cdn/x.png' };
      },
    };
    registry.register(provider);

    const jobsRepo = new InMemoryJobRepo();
    const assets = new InMemoryAssetRepo();
    const storage = new InMemoryStorage();
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    let n = 0;

    const handler = new ImageJobHandler({
      registry,
      storage,
      assets,
      idGen: () => `a${++n}`,
      clock: () => 'T',
      fetchFn,
    });
    const runner = new JobRunner(jobsRepo, [handler]);

    await jobsRepo.create(
      newJob({ projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'hi' } }, { id: 'j1', now: 'T' }),
    );
    const done = await runner.run('j1');

    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.resultAssetId).toBe('a1');

    const asset = await assets.get('a1');
    expect(asset?.projectId).toBe('p1');
    expect(storage.read(asset!.storageKey)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expected PASS — all symbols exist). Then full `pnpm test` + `pnpm typecheck`.**

- [ ] **Step 3: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "test(jobs): image job end-to-end through the runner"
```

---

## Definition of Done (Plan 2b)

- `@forgecast/core` exports `JobHandler`, `ProgressReporter`, `JobOutcome`.
- `@forgecast/jobs` exports `JobRunner` and `ImageJobHandler`; the runner persists lifecycle transitions (running/done/error + progress) via `JobRepo`, and the image handler turns a job into a stored asset using the provider registry + storage.
- Full `pnpm test` green and `pnpm typecheck` clean.
- Atomic conventional commits per task.

**Next:** Plan 2c — Next.js Spine API + Image Studio UI (route handlers for projects/assets/jobs/generate wired to these packages; the studio UI with a model picker seeded from the harvested `models_dump.json`). Then Plan 2d — Postgres + MinIO adapters + `docker-compose.yml`.
