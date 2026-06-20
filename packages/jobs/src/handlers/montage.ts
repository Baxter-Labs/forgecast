import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type MontageWorker, type MontageSpec,
} from '@forgecast/core';

export interface MontageJobHandlerDeps {
  worker: MontageWorker;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  fetchFn?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
}

const defaultWait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class MontageJobHandler implements JobHandler {
  readonly kind = 'montage';

  constructor(private readonly deps: MontageJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const spec = (job.params as { spec?: MontageSpec }).spec;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      throw new Error('montage job requires a spec with at least one scene');
    }

    const { taskId } = await this.deps.worker.render(spec);
    await report(0.05);

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 600;

    let videoUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.worker.getTask(taskId);
      await report(0.5);
      if (task.state === 'failed') throw new Error(`montage worker reported failure for task ${taskId}`);
      if (task.state === 'complete') { videoUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!videoUrl) throw new Error(`montage task ${taskId} did not complete in time`);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(videoUrl);
    if (!res.ok) throw new Error(`failed to download rendered montage (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/videos/${id}.mp4`;
    const stored = await this.deps.storage.put(key, bytes, 'video/mp4');
    await report(0.98);

    const asset = await this.deps.assets.create(
      newAsset({ projectId: job.projectId, type: 'video', provider: job.provider, storageKey: stored.key, params: job.params }, { id, now: this.deps.clock() }),
    );
    return { assetId: asset.id };
  }
}
