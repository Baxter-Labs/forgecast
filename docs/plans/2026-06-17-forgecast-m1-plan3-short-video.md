# Forgecast M1 — Plan 3: Short-Video Worker (MoneyPrinterTurbo)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add short-form video generation by integrating **MoneyPrinterTurbo as a separate containerized worker** behind its HTTP contract. Forgecast speaks the contract via a `short_video` job handler — fully unit-tested with a mocked worker — and ships the worker container config. No MoneyPrinter code is vendored.

**Verified contract** (from the real source, prefix `/api/v1`):
- `POST /api/v1/videos`, body = `VideoParams` (only `video_subject` required) → `{ data: { task_id } }`
- `GET /api/v1/tasks/{id}` → `{ data: { state, progress, combined_videos[], videos[] } }` where `state`: `-1`=failed, `1`=complete, `4`=processing. The final MP4 URI is `combined_videos[0]` (served by the worker's `/tasks` static mount; relative unless the worker has `endpoint` configured).

**Architecture:** A `ShortVideoWorker` contract in `@forgecast/core`; a `MoneyPrinterWorker` HTTP client in `@forgecast/providers` (injectable fetch); a `ShortVideoJobHandler` in `@forgecast/jobs` (create → poll → download → store → video asset). `apps/web` wires the worker (env `FORGECAST_VIDEO_WORKER_URL`), registers the handler, and exposes an **async** generate path (short video takes minutes → fire-and-forget + poll, which works in the self-hosted persistent Node server). `workers/shorts/` holds the MoneyPrinter container config.

**Repo:** `~/Desktop/BaxterLabs/forgecast` (M1 image path complete + durable; 55 tests; CI green; published).

---

## Decomposition
- **3-1** *(detailed)* — `ShortVideoWorker` contract + `MoneyPrinterWorker` HTTP client. Testable with mock fetch.
- **3-2** *(detailed)* — `ShortVideoJobHandler` (poll → download → store → video asset). Testable with a fake worker + injected wait.
- **3-3** *(outline)* — wire into `apps/web`: build the worker from env, register the `short_video` handler, async generate route (`POST /api/projects/[id]/generate-video`), add video content-types to `FilesystemStorage`, Studio toggle. Tests.
- **3-4** *(outline)* — `workers/shorts/` MoneyPrinter container (Dockerfile/compose + README). Config only (running it needs Docker + provider keys).

This document fully specifies **3-1 and 3-2**. 3-3/3-4 are detailed when reached.

---

## Task 1 (3-1): `ShortVideoWorker` contract + `MoneyPrinterWorker` client

**Files:**
- Create: `packages/core/src/video.ts`; modify `packages/core/src/index.ts`
- Create: `packages/providers/src/video/moneyprinter.ts`; modify `packages/providers/src/index.ts`
- Test: `packages/providers/test/moneyprinter.test.ts`

- [ ] **Step 1: `packages/core/src/video.ts`**

```ts
export interface ShortVideoRequest {
  /** The topic/subject for the short video. */
  subject: string;
  /** Extra MoneyPrinter VideoParams passed through verbatim (aspect, voice, etc.). */
  extra?: Record<string, unknown>;
}

export type VideoTaskState = 'processing' | 'complete' | 'failed';

export interface ShortVideoTask {
  taskId: string;
  state: VideoTaskState;
  progress: number; // 0..100
  /** Absolute URL of the finished video, set when state === 'complete'. */
  videoUrl?: string;
}

export interface ShortVideoWorker {
  readonly name: string;
  isAvailable(): boolean;
  createVideo(req: ShortVideoRequest): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<ShortVideoTask>;
}
```

- [ ] **Step 2: `packages/core/src/index.ts`** — add `export * from './video';` (keep existing).

- [ ] **Step 3: failing test `packages/providers/test/moneyprinter.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { MoneyPrinterWorker } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MoneyPrinterWorker', () => {
  it('is unavailable without a base url', () => {
    expect(new MoneyPrinterWorker({ baseUrl: undefined }).isAvailable()).toBe(false);
  });

  it('creates a video task (POST /api/v1/videos with video_subject)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { task_id: 't1' } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const { taskId } = await w.createVideo({ subject: 'cats in space', extra: { video_aspect: 'portrait' } });
    expect(taskId).toBe('t1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://worker:8080/api/v1/videos');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.video_subject).toBe('cats in space');
    expect(sent.video_aspect).toBe('portrait');
  });

  it('maps task state and resolves the combined video url when complete', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['/tasks/t1/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('complete');
    expect(task.progress).toBe(100);
    expect(task.videoUrl).toBe('http://worker:8080/tasks/t1/combined-1.mp4');
  });

  it('reports processing without a url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: 4, progress: 40 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('processing');
    expect(task.videoUrl).toBeUndefined();
  });

  it('maps failure state', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: -1, progress: 0 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).state).toBe('failed');
  });

  it('keeps an already-absolute video url as-is', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['https://cdn/x/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).videoUrl).toBe('https://cdn/x/combined-1.mp4');
  });
});
```

- [ ] **Step 4: `packages/providers/src/video/moneyprinter.ts`**

```ts
import type {
  ShortVideoWorker, ShortVideoRequest, ShortVideoTask, VideoTaskState,
} from '@forgecast/core';

export interface MoneyPrinterWorkerOptions {
  /** Base url of the MoneyPrinter worker. Defaults to process.env.FORGECAST_VIDEO_WORKER_URL. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface CreateResp { data?: { task_id?: string } }
interface TaskResp {
  data?: { state?: number; progress?: number; combined_videos?: string[]; videos?: string[] };
}

const stateFrom = (n: number | undefined): VideoTaskState =>
  n === 1 ? 'complete' : n === -1 ? 'failed' : 'processing';

export class MoneyPrinterWorker implements ShortVideoWorker {
  readonly name = 'moneyprinter';
  private readonly baseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MoneyPrinterWorkerOptions = {}) {
    const url = opts.baseUrl ?? process.env.FORGECAST_VIDEO_WORKER_URL;
    this.baseUrl = url ? url.replace(/\/$/, '') : undefined;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async createVideo(req: ShortVideoRequest): Promise<{ taskId: string }> {
    const base = this.requireBase();
    const body = { video_subject: req.subject, ...req.extra };
    const res = await this.fetchFn(`${base}/api/v1/videos`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`worker create failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as CreateResp;
    const taskId = data.data?.task_id;
    if (!taskId) throw new Error('worker response missing task_id');
    return { taskId };
  }

  async getTask(taskId: string): Promise<ShortVideoTask> {
    const base = this.requireBase();
    const res = await this.fetchFn(`${base}/api/v1/tasks/${taskId}`);
    if (!res.ok) throw new Error(`worker task query failed (${res.status})`);
    const data = (await res.json()) as TaskResp;
    const d = data.data ?? {};
    const state = stateFrom(d.state);
    const uri = d.combined_videos?.[0] ?? d.videos?.[0];
    const videoUrl = state === 'complete' && uri ? this.resolveUrl(uri) : undefined;
    return { taskId, state, progress: d.progress ?? 0, videoUrl };
  }

  private requireBase(): string {
    if (!this.baseUrl) throw new Error('MoneyPrinter worker URL not configured');
    return this.baseUrl;
  }

  private resolveUrl(uri: string): string {
    if (/^https?:\/\//.test(uri)) return uri;
    return `${this.baseUrl}/${uri.replace(/^\//, '')}`;
  }
}
```

- [ ] **Step 5: `packages/providers/src/index.ts`** — add `export * from './video/moneyprinter';`.

- [ ] **Step 6:** run the test (PASS, 6), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(providers): MoneyPrinter short-video worker client`.

---

## Task 2 (3-2): `ShortVideoJobHandler`

**Files:**
- Create: `packages/jobs/src/handlers/shortVideo.ts`; modify `packages/jobs/src/index.ts`
- Modify: `packages/jobs/package.json` (it already deps providers; ensure core)
- Test: `packages/jobs/test/shortVideo.test.ts`

- [ ] **Step 1: failing test `packages/jobs/test/shortVideo.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ShortVideoWorker, ShortVideoTask } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryAssetRepo, InMemoryStorage } from '@forgecast/store';
import { ShortVideoJobHandler } from '../src/index';

function workerThatCompletesAfter(polls: number): ShortVideoWorker {
  let n = 0;
  return {
    name: 'fake',
    isAvailable: () => true,
    async createVideo() { return { taskId: 'tk' }; },
    async getTask(taskId): Promise<ShortVideoTask> {
      n += 1;
      if (n < polls) return { taskId, state: 'processing', progress: n * 20 };
      return { taskId, state: 'complete', progress: 100, videoUrl: 'http://worker/tasks/tk/combined-1.mp4' };
    },
  };
}

const noWait = async () => {};
function mp4Fetch() {
  return vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } }),
  );
}

describe('ShortVideoJobHandler', () => {
  it('creates → polls to completion → downloads → stores → records a video asset', async () => {
    const storage = new InMemoryStorage();
    const assets = new InMemoryAssetRepo();
    const fetchFn = mp4Fetch();
    const handler = new ShortVideoJobHandler({
      worker: workerThatCompletesAfter(3), storage, assets,
      idGen: () => 'v1', clock: () => 'T', fetchFn, wait: noWait, pollIntervalMs: 1, maxPolls: 10,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'cats' } }, { id: 'j1', now: 'T' });
    const progress: number[] = [];
    const outcome = await handler.run(job, async (p) => { progress.push(p); });

    expect(outcome.assetId).toBe('v1');
    const asset = await assets.get('v1');
    expect(asset?.type).toBe('video');
    expect(asset?.storageKey).toBe('projects/p1/videos/v1.mp4');
    expect(storage.read('projects/p1/videos/v1.mp4')?.contentType).toBe('video/mp4');
    expect(fetchFn).toHaveBeenCalledWith('http://worker/tasks/tk/combined-1.mp4');
    expect(progress.length).toBeGreaterThan(1);
  });

  it('throws without a subject', async () => {
    const handler = new ShortVideoJobHandler({
      worker: workerThatCompletesAfter(1), storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: {} }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/subject/i);
  });

  it('throws when the worker reports failure', async () => {
    const worker: ShortVideoWorker = {
      name: 'fake', isAvailable: () => true,
      async createVideo() { return { taskId: 'tk' }; },
      async getTask(taskId) { return { taskId, state: 'failed', progress: 0 }; },
    };
    const handler = new ShortVideoJobHandler({
      worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/fail/i);
  });

  it('throws if it never completes within maxPolls', async () => {
    const worker: ShortVideoWorker = {
      name: 'fake', isAvailable: () => true,
      async createVideo() { return { taskId: 'tk' }; },
      async getTask(taskId) { return { taskId, state: 'processing', progress: 10 }; },
    };
    const handler = new ShortVideoJobHandler({
      worker, storage: new InMemoryStorage(), assets: new InMemoryAssetRepo(),
      idGen: () => 'v1', clock: () => 'T', fetchFn: mp4Fetch(), wait: noWait, maxPolls: 3,
    });
    const job = newJob({ projectId: 'p1', kind: 'short_video', provider: 'moneyprinter', params: { subject: 'x' } }, { id: 'j1', now: 'T' });
    await expect(handler.run(job, async () => {})).rejects.toThrowError(/did not complete/i);
  });
});
```

- [ ] **Step 2: `packages/jobs/src/handlers/shortVideo.ts`**

```ts
import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type ShortVideoWorker,
} from '@forgecast/core';

export interface ShortVideoJobHandlerDeps {
  worker: ShortVideoWorker;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  fetchFn?: typeof fetch;
  /** Injected wait between polls (default real setTimeout). */
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
}

const defaultWait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function subjectOf(params: Record<string, unknown>): string | undefined {
  for (const key of ['subject', 'topic', 'prompt'] as const) {
    const v = params[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return undefined;
}

function extraOf(params: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k !== 'subject' && k !== 'topic' && k !== 'prompt') rest[k] = v;
  }
  return rest;
}

export class ShortVideoJobHandler implements JobHandler {
  readonly kind = 'short_video';

  constructor(private readonly deps: ShortVideoJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const subject = subjectOf(job.params);
    if (!subject) throw new Error('short_video job requires a "subject" (or prompt/topic) param');

    const { taskId } = await this.deps.worker.createVideo({ subject, extra: extraOf(job.params) });
    await report(0.05);

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;

    let videoUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.worker.getTask(taskId);
      await report(Math.min(0.95, 0.05 + (task.progress / 100) * 0.9));
      if (task.state === 'failed') throw new Error(`worker reported failure for task ${taskId}`);
      if (task.state === 'complete') { videoUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!videoUrl) throw new Error(`short_video task ${taskId} did not complete in time`);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(videoUrl);
    if (!res.ok) throw new Error(`failed to download generated video (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/videos/${id}.mp4`;
    const stored = await this.deps.storage.put(key, bytes, 'video/mp4');
    await report(0.98);

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'video', provider: job.provider, storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
```

- [ ] **Step 3: `packages/jobs/src/index.ts`** — add `export * from './handlers/shortVideo';`.

- [ ] **Step 4:** run the test (PASS, 4), full `pnpm test`, `pnpm typecheck` clean. Commit: `feat(jobs): ShortVideoJobHandler (create → poll → store → video asset)`.

---

## 3-3 (outline — detailed when reached)
- Extend `FilesystemStorage` `CONTENT_TYPES` with `mp4: video/mp4`, `webm: video/webm`, `mov: video/quicktime` (so served videos play).
- `buildServices`: construct `new MoneyPrinterWorker()` (env `FORGECAST_VIDEO_WORKER_URL`), and if available register a `ShortVideoJobHandler` in the `JobRunner` handler list (alongside the image handler). Expose `videoWorker` on `Services`.
- `lib/api.ts`: `generateShortVideo(services, projectId, input)` — create a `short_video` job (queued), kick `services.runner.run(jobId)` **without awaiting** (fire-and-forget; works in the persistent self-hosted Node server), return the job immediately. Client polls `GET /api/jobs/[id]`.
- Route `POST /api/projects/[id]/generate-video`.
- Studio: an image/video toggle in `ForgePanel`; video jobs poll `/api/jobs/[id]` and render `<video>` from `/api/assets/[id]/raw`.
- Tests for the new api logic (job created queued, kind short_video) with a fake worker.

## 3-4 (outline — container config)
- `workers/shorts/` with a `docker-compose.shorts.yml` (or a service in the root compose) running MoneyPrinterTurbo's published image / a thin Dockerfile, mapping its API port, mounting a `config.toml` (provider keys: an LLM provider + Pexels), and exposing `FORGECAST_VIDEO_WORKER_URL`.
- `workers/shorts/README.md`: setup (keys, FFmpeg in the image), and that it requires Docker + provider keys to actually render. Not run-verified in CI.

---

## Definition of Done (3-1 + 3-2)
- `@forgecast/core` exports the `ShortVideoWorker` contract; `@forgecast/providers` exports `MoneyPrinterWorker` (HTTP client, mock-tested); `@forgecast/jobs` exports `ShortVideoJobHandler` (poll → download → store → **video** asset, tested with a fake worker).
- Full `pnpm test` green; `pnpm typecheck` clean.
- Atomic commits per task.

**Next:** 3-3 (web wiring + async generate + Studio video) and 3-4 (MoneyPrinter container), then Plan 4 (MCP surface).
