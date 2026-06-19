# Forgecast M1 — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Forgecast monorepo with a tested `@forgecast/core` (domain types + provider contracts) and `@forgecast/providers` (a pluggable image-provider registry + a working fal.ai adapter).

**Architecture:** A pnpm/TypeScript workspace. `@forgecast/core` holds pure types and interfaces with zero I/O. `@forgecast/providers` implements those interfaces as swappable adapters selected through a registry; the first adapter is fal.ai for image generation. All network calls are made through an injectable `fetch`, so every adapter is unit-tested offline. This is the "pluggable provider" seam from the spec (§6) — later plans add the Next.js spine, the Python short-video worker, and the MCP server on top of these packages.

**Tech Stack:** Node 20+, pnpm workspaces, TypeScript (Bundler resolution, ESM), Vitest.

**Repo location:** Create a NEW git repo, separate from the website, at `~/Desktop/BaxterLabs/forgecast`. All file paths below are relative to that repo root.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Root workspace + scripts + dev tooling |
| `pnpm-workspace.yaml` | Declares `packages/*`, `apps/*`, `workers/*` |
| `tsconfig.base.json` | Shared strict TS config (Bundler resolution) |
| `vitest.config.ts` | Test config + `@forgecast/core` → src alias |
| `.gitignore`, `.env.example`, `LICENSE`, `NOTICE` | Repo hygiene + licensing |
| `test/sanity.test.ts` | Toolchain smoke test |
| `packages/core/src/types.ts` | `Project`, `Asset`, `Job` + enums |
| `packages/core/src/job.ts` | `newJob()` factory (deterministic, injectable id/clock) |
| `packages/core/src/providers.ts` | `ImageProvider` contract + I/O types + `ProviderUnavailableError` |
| `packages/core/src/index.ts` | Barrel exports for the package |
| `packages/core/test/job.test.ts` | Tests for `newJob()` |
| `packages/providers/src/registry.ts` | `ImageProviderRegistry` (register / get / available) |
| `packages/providers/src/image/fal.ts` | `FalImageProvider` adapter |
| `packages/providers/src/index.ts` | Barrel exports |
| `packages/providers/test/registry.test.ts` | Registry tests (with a fake provider) |
| `packages/providers/test/fal.test.ts` | fal adapter tests (mocked fetch) |

---

## Task 1: Initialize the Forgecast monorepo

**Files:**
- Create: `~/Desktop/BaxterLabs/forgecast/package.json`
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `.gitignore`, `.env.example`, `LICENSE`, `NOTICE`
- Test: `test/sanity.test.ts`

- [ ] **Step 1: Create the repo directory and init git**

```bash
mkdir -p ~/Desktop/BaxterLabs/forgecast
cd ~/Desktop/BaxterLabs/forgecast
git init
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "forgecast",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.7.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r exec tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'workers/*'
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 5: Create `vitest.config.ts`** (aliases `@forgecast/core` to its source so tests need no build)

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@forgecast/core': `${root}packages/core/src/index.ts`,
      '@forgecast/providers': `${root}packages/providers/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['**/test/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 7: Create `.env.example`**

```dotenv
# Image generation (cloud default — bring your own key)
FAL_KEY=
```

- [ ] **Step 8: Create `LICENSE` (MIT)**

```text
MIT License

Copyright (c) 2026 Baxter Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 9: Create `NOTICE`** (attributions are added as each component is integrated in later plans)

```text
Forgecast
Copyright (c) 2026 Baxter Labs — MIT License

This product will integrate the following third-party components in later
milestones; their notices will be added here when their code or services are
incorporated:

- MoneyPrinterTurbo — Copyright (c) harry0703 — MIT License
  https://github.com/harry0703/MoneyPrinterTurbo
- Open-Generative-AI — Copyright (c) Anil-matcha — MIT License
  https://github.com/Anil-matcha/Open-Generative-AI
- VibeVoice — Copyright (c) Microsoft — MIT License (research-only usage advisory)
  https://github.com/microsoft/VibeVoice

Runtime content obtained through configured providers (e.g. Pexels, Pixabay)
is governed by those services' own terms, not this license.
```

- [ ] **Step 10: Create the toolchain smoke test `test/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 11: Install dependencies**

Run: `pnpm install`
Expected: completes, creates `node_modules/` and `pnpm-lock.yaml`.

- [ ] **Step 12: Run the smoke test to verify the toolchain**

Run: `pnpm test`
Expected: PASS — 1 test passed (`test/sanity.test.ts`).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Forgecast monorepo (pnpm + TypeScript + vitest)"
```

---

## Task 2: Core domain types + `newJob` factory

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`, `packages/core/src/job.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/job.test.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@forgecast/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.5.4" }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `packages/core/src/types.ts`**

```ts
export type AssetType = 'image' | 'video' | 'audio';
export type JobKind = 'image' | 'short_video';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  provider: string;
  params: Record<string, unknown>;
  storageKey: string;
  status: 'ready' | 'error';
  createdAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  kind: JobKind;
  provider: string;
  params: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  resultAssetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Write the failing test `packages/core/test/job.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { newJob } from '../src/job';

describe('newJob', () => {
  it('creates a queued job with zero progress', () => {
    const job = newJob(
      { projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'a cat' } },
      { id: 'j1', now: '2026-06-17T00:00:00Z' },
    );
    expect(job).toEqual({
      id: 'j1',
      projectId: 'p1',
      kind: 'image',
      provider: 'fal',
      params: { prompt: 'a cat' },
      status: 'queued',
      progress: 0,
      createdAt: '2026-06-17T00:00:00Z',
      updatedAt: '2026-06-17T00:00:00Z',
    });
  });

  it('defaults params to an empty object', () => {
    const job = newJob(
      { projectId: 'p1', kind: 'short_video', provider: 'mpt' },
      { id: 'j2', now: '2026-06-17T00:00:00Z' },
    );
    expect(job.params).toEqual({});
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test packages/core`
Expected: FAIL — cannot resolve `../src/job` (module does not exist).

- [ ] **Step 6: Implement `packages/core/src/job.ts`**

```ts
import type { Job, JobKind } from './types';

export interface NewJobInput {
  projectId: string;
  kind: JobKind;
  provider: string;
  params?: Record<string, unknown>;
}

export interface NewJobDeps {
  id: string;
  now: string;
}

export function newJob(input: NewJobInput, deps: NewJobDeps): Job {
  return {
    id: deps.id,
    projectId: input.projectId,
    kind: input.kind,
    provider: input.provider,
    params: input.params ?? {},
    status: 'queued',
    progress: 0,
    createdAt: deps.now,
    updatedAt: deps.now,
  };
}
```

- [ ] **Step 7: Create the barrel `packages/core/src/index.ts`**

```ts
export * from './types';
export * from './job';
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test packages/core`
Expected: PASS — 2 tests passed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): domain types and newJob factory"
```

---

## Task 3: Provider contracts

**Files:**
- Create: `packages/core/src/providers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/providers.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/test/providers.test.ts`** (a fake provider proves the contract is implementable, and the error type carries the provider name)

```ts
import { describe, it, expect } from 'vitest';
import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '../src/providers';

class FakeProvider implements ImageProvider {
  readonly name = 'fake';
  constructor(private available: boolean) {}
  isAvailable(): boolean {
    return this.available;
  }
  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);
    return { url: `https://example.test/${encodeURIComponent(input.prompt)}.png` };
  }
}

describe('ImageProvider contract', () => {
  it('an available provider returns an image result', async () => {
    const p = new FakeProvider(true);
    const result = await p.generateImage({ prompt: 'sunset' });
    expect(result.url).toBe('https://example.test/sunset.png');
  });

  it('an unavailable provider throws ProviderUnavailableError naming itself', async () => {
    const p = new FakeProvider(false);
    await expect(p.generateImage({ prompt: 'sunset' })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    await expect(p.generateImage({ prompt: 'sunset' })).rejects.toMatchObject({
      providerName: 'fake',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test packages/core/test/providers.test.ts`
Expected: FAIL — cannot resolve `../src/providers`.

- [ ] **Step 3: Implement `packages/core/src/providers.ts`**

```ts
export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
  /** Provider-specific extra parameters passed through verbatim. */
  extra?: Record<string, unknown>;
}

export interface ImageResult {
  url: string;
  width?: number;
  height?: number;
  /** The raw provider response, for debugging/storage. */
  raw?: unknown;
}

export interface ImageProvider {
  readonly name: string;
  /** True when the provider has the credentials/config it needs to run. */
  isAvailable(): boolean;
  generateImage(input: GenerateImageInput): Promise<ImageResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly providerName: string) {
    super(`Provider "${providerName}" is unavailable (missing credentials or config)`);
    this.name = 'ProviderUnavailableError';
  }
}
```

- [ ] **Step 4: Update the barrel `packages/core/src/index.ts`**

```ts
export * from './types';
export * from './job';
export * from './providers';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test packages/core/test/providers.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): ImageProvider contract and ProviderUnavailableError"
```

---

## Task 4: Image provider registry

**Files:**
- Create: `packages/providers/package.json`, `packages/providers/tsconfig.json`
- Create: `packages/providers/src/registry.ts`, `packages/providers/src/index.ts`
- Test: `packages/providers/test/registry.test.ts`

- [ ] **Step 1: Create `packages/providers/package.json`**

```json
{
  "name": "@forgecast/providers",
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

- [ ] **Step 2: Create `packages/providers/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@forgecast/core": ["../core/src/index.ts"] }
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install the workspace dependency**

Run: `pnpm install`
Expected: links `@forgecast/core` into `@forgecast/providers` (workspace symlink).

- [ ] **Step 4: Write the failing test `packages/providers/test/registry.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { ImageProvider, GenerateImageInput, ImageResult } from '@forgecast/core';
import { ImageProviderRegistry } from '../src/registry';

function makeProvider(name: string, available: boolean): ImageProvider {
  return {
    name,
    isAvailable: () => available,
    async generateImage(_input: GenerateImageInput): Promise<ImageResult> {
      return { url: `https://example.test/${name}.png` };
    },
  };
}

describe('ImageProviderRegistry', () => {
  it('registers and retrieves a provider by name', () => {
    const reg = new ImageProviderRegistry();
    const p = makeProvider('fal', true);
    reg.register(p);
    expect(reg.get('fal')).toBe(p);
  });

  it('throws for an unknown provider', () => {
    const reg = new ImageProviderRegistry();
    expect(() => reg.get('nope')).toThrowError(/unknown image provider: nope/i);
  });

  it('lists only available providers', () => {
    const reg = new ImageProviderRegistry();
    reg.register(makeProvider('fal', true));
    reg.register(makeProvider('replicate', false));
    expect(reg.available()).toEqual(['fal']);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test packages/providers/test/registry.test.ts`
Expected: FAIL — cannot resolve `../src/registry`.

- [ ] **Step 6: Implement `packages/providers/src/registry.ts`**

```ts
import type { ImageProvider } from '@forgecast/core';

export class ImageProviderRegistry {
  private readonly providers = new Map<string, ImageProvider>();

  register(provider: ImageProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ImageProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown image provider: ${name}`);
    return provider;
  }

  available(): string[] {
    return [...this.providers.values()]
      .filter((p) => p.isAvailable())
      .map((p) => p.name);
  }
}
```

- [ ] **Step 7: Create the barrel `packages/providers/src/index.ts`**

```ts
export * from './registry';
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test packages/providers/test/registry.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(providers): image provider registry"
```

---

## Task 5: fal.ai image adapter

**Files:**
- Create: `packages/providers/src/image/fal.ts`
- Modify: `packages/providers/src/index.ts`
- Test: `packages/providers/test/fal.test.ts`

- [ ] **Step 1: Write the failing test `packages/providers/test/fal.test.ts`** (covers success, missing-key unavailability, and HTTP error — all with a mocked fetch, no network)

```ts
import { describe, it, expect, vi } from 'vitest';
import { ProviderUnavailableError } from '@forgecast/core';
import { FalImageProvider } from '../src/image/fal';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FalImageProvider', () => {
  it('is unavailable without an API key', () => {
    const p = new FalImageProvider({ apiKey: undefined });
    expect(p.isAvailable()).toBe(false);
  });

  it('throws ProviderUnavailableError when generating without a key', async () => {
    const p = new FalImageProvider({ apiKey: undefined });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('posts the prompt and returns the first image url', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ images: [{ url: 'https://cdn.fal/out.png', width: 1024, height: 1024 }] }),
    );
    const p = new FalImageProvider({ apiKey: 'k-test', model: 'fal-ai/flux/schnell', fetchFn });

    const result = await p.generateImage({ prompt: 'a fox', width: 1024, height: 1024 });

    expect(result.url).toBe('https://cdn.fal/out.png');
    expect(result.width).toBe(1024);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://fal.run/fal-ai/flux/schnell');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Key k-test' });
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.prompt).toBe('a fox');
    expect(sentBody.image_size).toEqual({ width: 1024, height: 1024 });
  });

  it('raises a descriptive error on a non-2xx response', async () => {
    const fetchFn = vi.fn(async () => new Response('quota exceeded', { status: 429 }));
    const p = new FalImageProvider({ apiKey: 'k-test', fetchFn });
    await expect(p.generateImage({ prompt: 'a fox' })).rejects.toThrowError(
      /fal request failed \(429\): quota exceeded/,
    );
  });

  it('raises when the response has no image', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ images: [] }));
    const p = new FalImageProvider({ apiKey: 'k-test', fetchFn });
    await expect(p.generateImage({ prompt: 'a fox' })).rejects.toThrowError(
      /response missing image url/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test packages/providers/test/fal.test.ts`
Expected: FAIL — cannot resolve `../src/image/fal`.

- [ ] **Step 3: Implement `packages/providers/src/image/fal.ts`**

```ts
import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '@forgecast/core';

export interface FalImageProviderOptions {
  /** Defaults to process.env.FAL_KEY. */
  apiKey?: string;
  /** fal model id. Defaults to a fast text-to-image model. */
  model?: string;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface FalImageResponse {
  images?: Array<{ url: string; width?: number; height?: number }>;
}

export class FalImageProvider implements ImageProvider {
  readonly name = 'fal';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalImageProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY;
    this.model = opts.model ?? 'fal-ai/flux/schnell';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);

    const body: Record<string, unknown> = { prompt: input.prompt, ...input.extra };
    if (input.width && input.height) {
      body.image_size = { width: input.width, height: input.height };
    }

    const res = await this.fetchFn(`https://fal.run/${this.model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fal request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as FalImageResponse;
    const image = data.images?.[0];
    if (!image?.url) throw new Error('fal response missing image url');

    return { url: image.url, width: image.width, height: image.height, raw: data };
  }
}
```

- [ ] **Step 4: Update the barrel `packages/providers/src/index.ts`**

```ts
export * from './registry';
export * from './image/fal';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test packages/providers/test/fal.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(providers): fal.ai image adapter"
```

---

## Task 6: Wire-up integration test

**Files:**
- Test: `packages/providers/test/integration.test.ts`

- [ ] **Step 1: Write the failing test `packages/providers/test/integration.test.ts`** (registry + fal adapter together, end-to-end with a mocked fetch)

```ts
import { describe, it, expect, vi } from 'vitest';
import { ImageProviderRegistry, FalImageProvider } from '../src/index';

describe('providers integration', () => {
  it('selects the fal provider from the registry and generates an image', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/i.png' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const registry = new ImageProviderRegistry();
    registry.register(new FalImageProvider({ apiKey: 'k', fetchFn }));

    expect(registry.available()).toEqual(['fal']);
    const provider = registry.get('fal');
    const result = await provider.generateImage({ prompt: 'a lighthouse' });

    expect(result.url).toBe('https://cdn.fal/i.png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `pnpm test packages/providers/test/integration.test.ts`
Expected: PASS (all referenced symbols already exist from Tasks 4–5; this test guards their composition). If it fails to resolve `../src/index`, re-check the barrel from Task 5 Step 4.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS — all tests across `test/`, `packages/core`, and `packages/providers` green (13 tests total).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(providers): registry + fal integration"
```

---

## Definition of Done (Plan 1)

- `pnpm install && pnpm test` is green from a clean clone.
- `@forgecast/core` exports `Project`, `Asset`, `Job`, `newJob`, the `ImageProvider` contract, and `ProviderUnavailableError`.
- `@forgecast/providers` exports `ImageProviderRegistry` and `FalImageProvider`; a provider with no key reports unavailable instead of crashing.
- Repo has `LICENSE` (MIT) and `NOTICE`.
- Every change is committed with a conventional-commit message.

**Next plan:** Plan 2 — Spine + Image Studio (Next.js app, Postgres/Redis/MinIO, image generation end-to-end, docker-compose) consumes these two packages.
