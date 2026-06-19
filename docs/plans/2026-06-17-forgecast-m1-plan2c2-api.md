# Forgecast M1 — Plan 2c-2: Spine API Routes

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expose the spine over HTTP — create/list projects, generate an image (as a job), read job status, list a project's assets — wired to the `getServices()` composition root, with the route logic unit-tested offline.

**Architecture:** Route *logic* lives in `apps/web/lib/api.ts` as pure async functions `(services, input) => { status, body }`, unit-tested with `buildServices()` + a fake provider + a mocked `fetchFn`. The Next.js App Router route files are thin wrappers that parse the `Request`, call `getServices()` + the logic, and return `NextResponse.json`. `buildServices` is extended to accept an injectable `fetchFn` (so the image handler's download is mockable in tests). For v1, `generate` runs the job synchronously and returns the finished job + asset.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (2c-1 done: `apps/web` builds; `lib/forgecast.ts` has `buildServices`/`getServices`; 37 tests green).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/lib/forgecast.ts` | extend `BuildServicesOptions` with `fetchFn`; pass to `ImageJobHandler` |
| `apps/web/lib/api.ts` | route logic: createProject, listProjects, generateImage, getJob, listAssets |
| `apps/web/test/api.test.ts` | offline unit tests for the logic |
| `apps/web/app/api/projects/route.ts` | `GET` list, `POST` create |
| `apps/web/app/api/projects/[id]/generate/route.ts` | `POST` generate image |
| `apps/web/app/api/projects/[id]/assets/route.ts` | `GET` list assets |
| `apps/web/app/api/jobs/[id]/route.ts` | `GET` job status |

---

## Task 1: Route logic (`lib/api.ts`) + `fetchFn` injection

**Files:**
- Modify: `apps/web/lib/forgecast.ts`
- Create: `apps/web/lib/api.ts`
- Test: `apps/web/test/api.test.ts`

- [ ] **Step 1: Extend `apps/web/lib/forgecast.ts`** — add `fetchFn` to options and pass it to the image handler. Change the `BuildServicesOptions` interface and the `ImageJobHandler` construction:

```ts
export interface BuildServicesOptions {
  falKey?: string;
  /** Injectable fetch for the image handler's download step (tests). */
  fetchFn?: typeof fetch;
}
```
and in `buildServices`, change the handler construction to:
```ts
  const imageHandler = new ImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
```
(Leave everything else, including the `'falKey' in opts` guard and `getServices()`, unchanged.)

- [ ] **Step 2: Write the failing test `apps/web/test/api.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { createProject, listProjects, generateImage, getJob, listAssets } from '../lib/api';

function fakeProvider(): ImageProvider {
  return {
    name: 'fal',
    isAvailable: () => true,
    async generateImage(input) {
      return { url: `https://cdn/${encodeURIComponent(input.prompt)}.png` };
    },
  };
}

function services() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: 'k', fetchFn });
  svc.imageRegistry.register(fakeProvider()); // override 'fal' with the offline fake
  return svc;
}

describe('api: projects', () => {
  it('creates and lists projects', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'Demo' });
    expect(created.status).toBe(201);
    expect((created.body as { project: { id: string } }).project.id).toBeTruthy();

    const listed = await listProjects(svc);
    expect(listed.status).toBe(200);
    expect((listed.body as { projects: unknown[] }).projects).toHaveLength(1);
  });

  it('rejects a project without a name', async () => {
    const r = await createProject(services(), {});
    expect(r.status).toBe(400);
  });
});

describe('api: generate', () => {
  it('generates an image end-to-end and returns a done job + asset', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;

    const r = await generateImage(svc, projectId, { prompt: 'a fox', width: 512, height: 512 });
    expect(r.status).toBe(200);
    const body = r.body as { job: { id: string; status: string }; asset: unknown };
    expect(body.job.status).toBe('done');
    expect(body.asset).toBeTruthy();

    const assets = await listAssets(svc, projectId);
    expect((assets.body as { assets: unknown[] }).assets).toHaveLength(1);

    const jobRes = await getJob(svc, body.job.id);
    expect((jobRes.body as { job: { status: string } }).job.status).toBe('done');
  });

  it('404 when generating on a missing project', async () => {
    const r = await generateImage(services(), 'nope', { prompt: 'x' });
    expect(r.status).toBe(404);
  });

  it('400 when generating without a prompt', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;
    const r = await generateImage(svc, projectId, {});
    expect(r.status).toBe(400);
  });

  it('404 for an unknown job', async () => {
    const r = await getJob(services(), 'nope');
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run, confirm FAIL** (`../lib/api` missing).

Run: `pnpm test apps/web/test/api.test.ts`

- [ ] **Step 4: Implement `apps/web/lib/api.ts`**

```ts
import { newProject, newJob } from '@forgecast/core';
import type { Services } from './forgecast';

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function createProject(services: Services, input: unknown): Promise<ApiResult> {
  const name = (input as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { status: 400, body: { error: 'name is required' } };
  }
  const project = await services.projects.create(
    newProject({ name }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  return { status: 201, body: { project } };
}

export async function listProjects(services: Services): Promise<ApiResult> {
  return { status: 200, body: { projects: await services.projects.list() } };
}

export async function generateImage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { prompt?: unknown; provider?: unknown; width?: unknown; height?: unknown };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }

  const providerName = typeof fields.provider === 'string' && fields.provider.length > 0 ? fields.provider : 'fal';
  const params: Record<string, unknown> = { prompt: fields.prompt };
  if (typeof fields.width === 'number') params.width = fields.width;
  if (typeof fields.height === 'number') params.height = fields.height;

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'image', provider: providerName, params },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const asset = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset } };
}

export async function getJob(services: Services, jobId: string): Promise<ApiResult> {
  const job = await services.jobs.get(jobId);
  if (!job) return { status: 404, body: { error: 'job not found' } };
  return { status: 200, body: { job } };
}

export async function listAssets(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  return { status: 200, body: { assets: await services.assets.listByProject(projectId) } };
}
```

- [ ] **Step 5: Run the test (PASS, 6 tests); full `pnpm test`; `pnpm --filter @forgecast/web exec tsc --noEmit` clean.**

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(web): spine API route logic (projects, generate, jobs, assets)"
```

---

## Task 2: Next.js route wrappers + build verification

**Files:** create the four route handler files.

- [ ] **Step 1: `apps/web/app/api/projects/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { createProject, listProjects } from '@/lib/api';

export async function GET() {
  const r = await listProjects(getServices());
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const r = await createProject(getServices(), input);
  return NextResponse.json(r.body, { status: r.status });
}
```

- [ ] **Step 2: `apps/web/app/api/projects/[id]/generate/route.ts`** (Next 16 route params are async — `await ctx.params`)

```ts
import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { generateImage } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const input = await req.json().catch(() => null);
  const r = await generateImage(getServices(), id, input);
  return NextResponse.json(r.body, { status: r.status });
}
```

- [ ] **Step 3: `apps/web/app/api/projects/[id]/assets/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { listAssets } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await listAssets(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}
```

- [ ] **Step 4: `apps/web/app/api/jobs/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { getJob } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await getJob(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}
```

- [ ] **Step 5: Verify the app builds (this type-checks the route handlers).**

```bash
pnpm --filter @forgecast/web build
```
Expected: success; the new routes appear (the `[id]` ones as dynamic `ƒ`). Run `pnpm test` to confirm still green.

- [ ] **Step 6: (Optional) smoke test the live API**

```bash
cd ~/Desktop/BaxterLabs/forgecast
pnpm --filter @forgecast/web start &
sleep 4
curl -s -X POST localhost:3210/api/projects -H 'content-type: application/json' -d '{"name":"Demo"}'
curl -s localhost:3210/api/projects
kill %1
```
Expected: the POST returns `{"project":{...}}` (201) and the GET lists it. (Generate against real fal needs `FAL_KEY`; without it the job comes back `status:"error"` — that's correct behavior.) If start/curl is flaky here, skip and note it.

- [ ] **Step 7: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(web): Next.js route handlers for the spine API"
```

---

## Definition of Done (2c-2)

- `lib/api.ts` logic for projects/generate/jobs/assets is unit-tested offline (fake provider + mocked fetch), covering success, 400, and 404 paths.
- The four route files wrap the logic; `pnpm --filter @forgecast/web build` succeeds (type-checks them).
- Full `pnpm test` green; web `tsc --noEmit` clean.
- Atomic conventional commits per task.

**Next:** 2c-3 — `@forgecast/catalog` (load/validate the harvested `scratch/openmodels-t2i.json` into typed `CatalogModel[]`). Then 2c-4 — the Image Studio UI consuming these routes + the catalog.
