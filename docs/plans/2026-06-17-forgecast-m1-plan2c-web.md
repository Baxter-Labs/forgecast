# Forgecast M1 — Plan 2c: Next.js Spine API + Image Studio UI

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the real runnable app — `apps/web` (Next.js App Router) — exposing the spine as HTTP routes wired to the Plan 1/2a/2b packages, plus a polished Image Studio UI (prompt, model picker, live job progress, gallery).

**Architecture:** `apps/web` is the composition root. A `lib/forgecast.ts` factory constructs the `ImageProviderRegistry` (with `FalImageProvider`), the in-memory store (`@forgecast/store` — swapped for Postgres/MinIO in Plan 2d), the `ImageJobHandler`, and the `JobRunner`. Route handlers create/read projects, enqueue generate jobs (run via the runner), and report job/asset status. The UI is React + Tailwind + shadcn/ui, polling job status.

**Tech Stack:** Next.js (App Router, TS), Tailwind CSS + shadcn/ui, Vitest. Builds on `@forgecast/core|providers|store|jobs`.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (Plans 1/2a/2b complete: 4 packages, 35 tests green, tsc clean). Harvested model catalog at `scratch/openmodels-t2i.json` (51 t2i models).

---

## Decomposition (each independently verifiable)

- **2c-1 — App scaffold + composition root** *(detailed below)*: scaffold `apps/web`, wire workspace deps, a `lib/forgecast.ts` services factory, a `/api/health` route, shadcn/ui initialized. Verifiable by `next build` + a unit test of the factory.
- **2c-2 — Spine API routes**: `POST /api/projects`, `GET /api/projects`, `POST /api/projects/:id/generate` (image), `GET /api/jobs/:id`, `GET /api/projects/:id/assets`. Handlers wired to the factory; unit-tested against in-memory services with a mock provider.
- **2c-3 — Model catalog**: a `@forgecast/catalog` package that loads/validates the harvested `openmodels-t2i.json` into a typed `CatalogModel[]` for the picker; unit-tested.
- **2c-4 — Image Studio UI**: the studio page (prompt, model picker, generate, job progress polling, gallery), built with shadcn/ui + Tailwind via the frontend-design skill.

This document fully specifies **2c-1**. 2c-2 / 2c-3 / 2c-4 are detailed when reached.

---

## 2c-1 — File Structure

| File | Responsibility |
|------|----------------|
| `.gitignore` | ignore `scratch/` (harvest staging) |
| `apps/web/` | Next.js App Router app (`@forgecast/web`) |
| `apps/web/lib/forgecast.ts` | services factory (composition root) |
| `apps/web/lib/ids.ts` | `randomId()` / `nowIso()` helpers |
| `apps/web/app/api/health/route.ts` | `GET` health + available providers |
| `apps/web/test/forgecast.test.ts` | factory unit test |

---

## Task 1: Scaffold `apps/web` (Next.js + Tailwind) in the monorepo

**Files:** create `apps/web/**` (via create-next-app); modify `.gitignore`.

- [ ] **Step 1: Ignore the harvest staging dir.** Append to `.gitignore`:

```gitignore
scratch/
```

- [ ] **Step 2: Scaffold the app non-interactively** (from the repo root):

```bash
cd ~/Desktop/BaxterLabs/forgecast
pnpm dlx create-next-app@latest apps/web \
  --ts --tailwind --app --no-src-dir --no-eslint \
  --use-pnpm --import-alias "@/*" --turbopack
```
Expected: creates `apps/web` with Next.js (App Router), TypeScript, Tailwind. If the CLI still prompts despite flags, accept defaults consistent with the flags above. If create-next-app refuses to run inside the workspace, scaffold into a temp dir and move the files into `apps/web`. **Report any deviation.**

- [ ] **Step 3: Make it a workspace member.** Edit `apps/web/package.json`: set `"name": "@forgecast/web"`, keep `"private": true`, and add the workspace deps:

```jsonc
  "dependencies": {
    // ...existing next/react deps from create-next-app stay...
    "@forgecast/core": "workspace:*",
    "@forgecast/providers": "workspace:*",
    "@forgecast/store": "workspace:*",
    "@forgecast/jobs": "workspace:*"
  }
```
Also ensure a dev port is fixed: set `"scripts": { "dev": "next dev -p 3210", "build": "next build", "start": "next start -p 3210", "typecheck": "tsc --noEmit" }` (keep create-next-app's defaults where they already match).

- [ ] **Step 4: Install** so workspace links resolve:

```bash
pnpm install
```
Expected: `@forgecast/*` linked into `apps/web/node_modules`.

- [ ] **Step 5: Verify it builds.**

```bash
pnpm --filter @forgecast/web build
```
Expected: a successful production build (Next compiles the default page). If the build fails for reasons unrelated to our code (e.g. a Next/Tailwind version quirk), fix the minimal config needed and report it.

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(web): scaffold Next.js app (@forgecast/web) in the monorepo"
```

---

## Task 2: Composition root — `lib/forgecast.ts`

**Files:**
- Create: `apps/web/lib/ids.ts`, `apps/web/lib/forgecast.ts`
- Test: `apps/web/test/forgecast.test.ts`

- [ ] **Step 1: Write the failing test `apps/web/test/forgecast.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildServices } from '../lib/forgecast';

describe('buildServices', () => {
  it('wires a runner with an image handler and a provider registry', () => {
    const svc = buildServices({ falKey: 'k-test' });
    expect(svc.imageRegistry.available()).toContain('fal');
    expect(svc.runner).toBeDefined();
    expect(svc.projects).toBeDefined();
    expect(svc.assets).toBeDefined();
    expect(svc.jobs).toBeDefined();
  });

  it('reports fal unavailable when no key is configured', () => {
    const svc = buildServices({ falKey: undefined });
    expect(svc.imageRegistry.available()).not.toContain('fal');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** (`../lib/forgecast` missing).

Run: `pnpm test apps/web/test/forgecast.test.ts`

- [ ] **Step 3: Implement `apps/web/lib/ids.ts`**

```ts
import { randomUUID } from 'node:crypto';

export function randomId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Implement `apps/web/lib/forgecast.ts`**

```ts
import { ImageProviderRegistry, FalImageProvider } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, StorageDriver } from '@forgecast/core';
import { randomId, nowIso } from './ids';

export interface Services {
  imageRegistry: ImageProviderRegistry;
  projects: ProjectRepo;
  assets: AssetRepo;
  jobs: JobRepo;
  storage: StorageDriver;
  runner: JobRunner;
  ids: { randomId: () => string; nowIso: () => string };
}

export interface BuildServicesOptions {
  falKey?: string;
}

let cached: Services | undefined;

export function buildServices(opts: BuildServicesOptions = {}): Services {
  const imageRegistry = new ImageProviderRegistry();
  imageRegistry.register(new FalImageProvider({ apiKey: opts.falKey ?? process.env.FAL_KEY }));

  const projects = new InMemoryProjectRepo();
  const assets = new InMemoryAssetRepo();
  const jobs = new InMemoryJobRepo();
  const storage = new InMemoryStorage({ baseUrl: process.env.FORGECAST_BASE_URL ?? 'memory://forgecast' });

  const imageHandler = new ImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
  });
  const runner = new JobRunner(jobs, [imageHandler]);

  return { imageRegistry, projects, assets, jobs, storage, runner, ids: { randomId, nowIso } };
}

/** Process-wide singleton (in-memory store persists for the server's lifetime). */
export function getServices(): Services {
  if (!cached) cached = buildServices();
  return cached;
}
```

- [ ] **Step 5: Run the test (PASS, 2 tests); run full `pnpm test`; run `pnpm typecheck`.**

Note: if `pnpm typecheck` for `@forgecast/web` complains about Next's generated tsconfig before a build, run `pnpm --filter @forgecast/web build` once (generates `.next/types`) or ensure `next-env.d.ts` exists; report any deviation.

- [ ] **Step 6: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(web): services composition root (buildServices/getServices)"
```

---

## Task 3: Health route + shadcn/ui init

**Files:**
- Create: `apps/web/app/api/health/route.ts`
- shadcn/ui initialized + base components added

- [ ] **Step 1: Implement `apps/web/app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';

export async function GET() {
  const svc = getServices();
  return NextResponse.json({
    ok: true,
    providers: { image: svc.imageRegistry.available() },
  });
}
```

- [ ] **Step 2: Initialize shadcn/ui (non-interactive) and add base components** (run in `apps/web`):

```bash
cd ~/Desktop/BaxterLabs/forgecast/apps/web
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input textarea card label sonner
```
If the shadcn CLI prompts, accept defaults (New York style or default, CSS variables yes, base color neutral). **Report the exact components installed.**

- [ ] **Step 3: Verify build still passes**

```bash
pnpm --filter @forgecast/web build
```
Expected: success (health route compiles as a Route Handler; shadcn components present).

- [ ] **Step 4: Manually verify the health route boots** (optional but recommended):

```bash
pnpm --filter @forgecast/web start &
sleep 4
curl -s http://localhost:3210/api/health
kill %1
```
Expected JSON like `{"ok":true,"providers":{"image":[]}}` (image empty unless `FAL_KEY` is set).

- [ ] **Step 5: Commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(web): health route + shadcn/ui base components"
```

---

## Definition of Done (2c-1)

- `apps/web` is a workspace member (`@forgecast/web`) that builds (`pnpm --filter @forgecast/web build`).
- `buildServices()` wires registry + in-memory store + image handler + runner; `getServices()` is the app singleton; both unit-tested.
- `/api/health` returns `{ ok, providers }`.
- shadcn/ui is initialized with base components for 2c-4.
- Full `pnpm test` green; root `pnpm typecheck` accounts for the Next app (or its deviation is reported).
- Atomic conventional commits per task.

**Next:** 2c-2 (Spine API routes), 2c-3 (`@forgecast/catalog` from the harvested JSON), 2c-4 (Image Studio UI).
