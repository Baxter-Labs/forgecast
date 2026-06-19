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
  /** Injectable fetch (to download the generated video). Defaults to global fetch. */
  fetchFn?: typeof fetch;
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
