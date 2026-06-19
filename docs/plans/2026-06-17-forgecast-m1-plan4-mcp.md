# Forgecast M1 — Plan 4: MCP Surface

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development + the mcp-builder guidance. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Forgecast **agent-drivable** — an MCP server (`forgecast-mcp-server`) exposing the spine's actions as tools (`forgecast_create_project`, `forgecast_generate_image`, `forgecast_generate_short_video`, `forgecast_get_job`, `forgecast_list_assets`, `forgecast_list_projects`, `forgecast_health`). This delivers the "two interfaces over one spine" promise: Claude Code (or any MCP client) drives the exact actions the Studio UI does.

**Architecture:** `apps/mcp` is a **thin MCP server over the spine HTTP API** (matching `docs/ARCHITECTURE.md` §6). It imports NO `@forgecast/*` package — only `@modelcontextprotocol/sdk` + `zod` + global `fetch`, targeting `FORGECAST_API_URL` (default `http://localhost:3210`). The deterministic core is a `SpineClient` (fetch wrapper, injectable fetch → fully unit-tested offline); each tool is a thin adapter that calls a `SpineClient` method, formats the result, and returns clear errors. Runs via `tsx` (no build/bundling needed — it has no TS-source workspace deps).

**Repo:** `~/Desktop/BaxterLabs/forgecast` (M1 image + short-video paths built; spine API live; 69 tests; CI green; published).

---

## Decomposition
- **Task 1** *(detailed, TDD)* — `apps/mcp` package + `SpineClient` (the tested HTTP wrapper).
- **Task 2** *(detailed, SDK-adaptive)* — the MCP server (`index.ts`) registering the tools over `SpineClient`, + README. Verified by typecheck + a start smoke test; tool registration follows the installed `@modelcontextprotocol/sdk` API.

---

## Task 1: `apps/mcp` package + `SpineClient`

**Files:**
- Create: `apps/mcp/package.json`, `apps/mcp/tsconfig.json`
- Create: `apps/mcp/src/constants.ts`, `apps/mcp/src/spine.ts`
- Modify: `vitest.config.ts` (add `@forgecast/mcp` alias — optional, for consistency)
- Test: `apps/mcp/test/spine.test.ts`

- [ ] **Step 1: `apps/mcp/package.json`**

```json
{
  "name": "@forgecast/mcp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "forgecast-mcp": "src/index.ts" },
  "scripts": {
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.5.4"
  }
}
```
(If `@modelcontextprotocol/sdk` `^1.12.0` is unavailable, install the latest `1.x`.)

- [ ] **Step 2: `apps/mcp/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 3: run `pnpm install`** (registers the package, installs the SDK + zod + tsx).

- [ ] **Step 4: `apps/mcp/src/constants.ts`**

```ts
export const DEFAULT_API_URL = 'http://localhost:3210';
export const CHARACTER_LIMIT = 25000;
```

- [ ] **Step 5: failing test `apps/mcp/test/spine.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { SpineClient, SpineError } from '../src/spine';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpineClient', () => {
  it('lists and creates projects', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ projects: [{ id: 'p1', name: 'A', createdAt: 'T' }] }));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    expect((await c.listProjects()).projects).toHaveLength(1);
    expect(fetchFn).toHaveBeenLastCalledWith('http://api/api/projects', undefined);

    const fetch2 = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ project: { id: 'p2', name: 'B', createdAt: 'T' } }, 201));
    const c2 = new SpineClient({ baseUrl: 'http://api', fetchFn: fetch2 });
    const created = await c2.createProject('B');
    expect(created.project.id).toBe('p2');
    const [url, init] = fetch2.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'B' });
  });

  it('generates an image (returns job + asset) and exposes the asset url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'j1', status: 'done' }, asset: { id: 'a1', type: 'image' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateImage('p1', { prompt: 'a fox', width: 512, height: 512 });
    expect(r.asset?.id).toBe('a1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/generate');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ prompt: 'a fox', width: 512 });
    expect(c.assetUrl('a1')).toBe('http://api/api/assets/a1/raw');
  });

  it('starts a short video and reads a job', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ job: { id: 'jv', kind: 'short_video', status: 'queued' } }, 202));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateShortVideo('p1', 'cats in space');
    expect(r.job.id).toBe('jv');
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api/api/projects/p1/generate-video');

    const fetch2 = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ job: { id: 'jv', status: 'running', progress: 0.4 } }));
    const c2 = new SpineClient({ baseUrl: 'http://api', fetchFn: fetch2 });
    expect((await c2.getJob('jv')).job.status).toBe('running');
  });

  it('throws SpineError with the api error message on failure', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ error: 'project not found' }, 404));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    await expect(c.getJob('nope')).rejects.toBeInstanceOf(SpineError);
    await expect(c.listAssets('nope')).rejects.toThrowError(/project not found/);
  });

  it('defaults the base url and strips a trailing slash', () => {
    const c = new SpineClient({ baseUrl: 'http://api/' });
    expect(c.assetUrl('x')).toBe('http://api/api/assets/x/raw');
  });
});
```

- [ ] **Step 6: implement `apps/mcp/src/spine.ts`**

```ts
import { DEFAULT_API_URL } from './constants';

export interface SpineClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface Project { id: string; name: string; createdAt: string }
export interface Job {
  id: string; projectId?: string; kind?: string; provider?: string;
  status: string; progress?: number; resultAssetId?: string; error?: string;
  params?: Record<string, unknown>;
}
export interface Asset {
  id: string; projectId?: string; type: string; provider?: string;
  storageKey?: string; params?: Record<string, unknown>; createdAt?: string;
}

export class SpineError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'SpineError';
  }
}

export interface GenerateImageInput {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
}

export class SpineClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: SpineClientOptions = {}) {
    const url = opts.baseUrl ?? process.env.FORGECAST_API_URL ?? DEFAULT_API_URL;
    this.baseUrl = url.replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  assetUrl(assetId: string): string {
    return `${this.baseUrl}/api/assets/${assetId}/raw`;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    let body: unknown = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }
    if (!res.ok) {
      const message = (body as { error?: string }).error ?? `request failed with status ${res.status}`;
      throw new SpineError(res.status, message);
    }
    return body as T;
  }

  health(): Promise<{ ok: boolean; providers: { image: string[] } }> {
    return this.req('/api/health');
  }
  listProjects(): Promise<{ projects: Project[] }> {
    return this.req('/api/projects');
  }
  createProject(name: string): Promise<{ project: Project }> {
    return this.req('/api/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  generateImage(projectId: string, input: GenerateImageInput): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  generateShortVideo(projectId: string, subject: string): Promise<{ job: Job }> {
    return this.req(`/api/projects/${projectId}/generate-video`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject }),
    });
  }
  getJob(jobId: string): Promise<{ job: Job }> {
    return this.req(`/api/jobs/${jobId}`);
  }
  listAssets(projectId: string): Promise<{ assets: Asset[] }> {
    return this.req(`/api/projects/${projectId}/assets`);
  }
}
```

- [ ] **Step 7:** run the test (PASS, 5), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(mcp): SpineClient (HTTP wrapper for the spine API)`.

---

## Task 2: the MCP server + tools

**Files:**
- Create: `apps/mcp/src/index.ts`, `apps/mcp/README.md`

- [ ] **Step 1: Confirm the SDK API.** Read `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` (or the package README) to confirm the exact `McpServer` + `registerTool` signature and the `inputSchema` shape (raw Zod shape vs `z.object`) for the installed version. Implement against the real API; the snippet below follows the mcp-builder guidance.

- [ ] **Step 2: `apps/mcp/src/index.ts`** — register one tool per `SpineClient` method. Each: snake_case `forgecast_*` name, `title`, a thorough `description` (purpose, args, returns, examples, errors), a `.strict()` Zod input schema, correct `annotations` (read-only tools: `readOnlyHint:true`; generate/create: `readOnlyHint:false, destructiveHint:false, openWorldHint:true`), and a handler that calls `SpineClient`, returns `{ content: [{ type: 'text', text }] }` (concise JSON, ≤ `CHARACTER_LIMIT`), and on `SpineError` returns an actionable message (e.g. include "Is the Forgecast app running at <url>? Set FORGECAST_API_URL."). Shape:

```ts
#!/usr/bin/env -S npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SpineClient, SpineError } from './spine';
import { CHARACTER_LIMIT } from './constants';

const client = new SpineClient(); // reads FORGECAST_API_URL

const server = new McpServer({ name: 'forgecast-mcp-server', version: '0.1.0' });

function ok(data: unknown) {
  let text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.length > CHARACTER_LIMIT) text = text.slice(0, CHARACTER_LIMIT) + '\n…(truncated)';
  return { content: [{ type: 'text' as const, text }] };
}
function fail(err: unknown) {
  const msg = err instanceof SpineError
    ? `Forgecast API error (${err.status}): ${err.message}. Is the Forgecast app running and reachable at FORGECAST_API_URL?`
    : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}

// Example — list_projects (read-only). Register the rest analogously.
server.registerTool(
  'forgecast_list_projects',
  {
    title: 'List Forgecast projects',
    description: 'List all projects in the local Forgecast studio. Returns id, name, createdAt for each. Use this first to find a project_id before generating.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    try { return ok((await client.listProjects()).projects); } catch (e) { return fail(e); }
  },
);

// ... register: forgecast_health, forgecast_create_project(name),
//     forgecast_generate_image(project_id, prompt, model?, width?, height?) [include client.assetUrl in the result],
//     forgecast_generate_short_video(project_id, subject),
//     forgecast_get_job(job_id), forgecast_list_assets(project_id) [include asset urls].

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('forgecast-mcp-server running on stdio');
}
main().catch((e) => { console.error('Server error:', e); process.exit(1); });
```
Tools to register (all): `forgecast_health` (read), `forgecast_list_projects` (read), `forgecast_create_project` (write), `forgecast_generate_image` (write; include the asset's raw URL via `client.assetUrl(asset.id)` in the result so the caller can view it), `forgecast_generate_short_video` (write; note it's async — returns a queued job, tell the caller to poll `forgecast_get_job`), `forgecast_get_job` (read), `forgecast_list_assets` (read; include asset URLs). If the installed SDK's `inputSchema` wants a raw shape (`{ name: z.string() }`) instead of a `z.object`, use that form consistently.

- [ ] **Step 3: `apps/mcp/README.md`** — what it is + how to register it in an MCP client (Claude Code), e.g.:
```jsonc
// .mcp.json / client config
{
  "mcpServers": {
    "forgecast": {
      "command": "tsx",
      "args": ["<abs path>/apps/mcp/src/index.ts"],
      "env": { "FORGECAST_API_URL": "http://localhost:3210" }
    }
  }
}
```
Note the Forgecast web app must be running (`pnpm -C apps/web dev`) for the tools to reach the spine. List the tools.

- [ ] **Step 4: verify** — `pnpm typecheck` clean; `pnpm test` green; **start smoke test** (the server is long-running, so use a timeout): `timeout 5s pnpm -C apps/mcp start 2>&1 | head` should print `forgecast-mcp-server running on stdio` and not crash. Commit: `feat(mcp): forgecast-mcp-server tools over the spine API`.

---

## Definition of Done (Plan 4)
- `apps/mcp` is a workspace package exposing a `forgecast-mcp-server` with the seven tools over the spine API.
- `SpineClient` is fully unit-tested (mock fetch); the server type-checks and starts on stdio.
- Full `pnpm test` green; `pnpm typecheck` clean. README documents client setup.
- Atomic commits per task.

**Next:** with MCP done, Forgecast delivers "two interfaces over one spine" end-to-end. Remaining roadmap: M1.5 cloud profiles, M2 distribution (social posting), M3 in-app agent, M4 montage.
