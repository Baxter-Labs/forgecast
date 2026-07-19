import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo,
  type RetargetProvider,
} from '@forgecast/core';

export interface RetargetJobHandlerDeps {
  provider: RetargetProvider;
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

/**
 * Motion retarget job handler: drives a character image with the performance
 * of a reference video (wan-animate or any RetargetProvider), then stores the
 * resulting video as a new asset.
 */
export class RetargetJobHandler implements JobHandler {
  readonly kind = 'retarget';

  constructor(private readonly deps: RetargetJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as { imageUrl?: unknown; videoUrl?: unknown };

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;
    const fetchFn = this.deps.fetchFn ?? fetch;

    if (!(typeof params.imageUrl === 'string' && params.imageUrl.length > 0)) {
      throw new Error('retarget requires imageUrl');
    }
    if (!(typeof params.videoUrl === 'string' && params.videoUrl.length > 0)) {
      throw new Error('retarget requires videoUrl');
    }

    const { taskId } = await this.deps.provider.create({ imageUrl: params.imageUrl, videoUrl: params.videoUrl });
    await report(0.3);

    let resultUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.6);
      if (task.state === 'failed') throw new Error(`retarget provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { resultUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!resultUrl) throw new Error(`retarget task ${taskId} did not complete in time`);
    await report(0.9);

    const res = await fetchFn(resultUrl);
    if (!res.ok) throw new Error(`failed to download retargeted video (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const id = this.deps.idGen();
    const key = `projects/${job.projectId}/videos/${id}.mp4`;
    const stored = await this.deps.storage.put(key, bytes, 'video/mp4');

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'video', provider: this.deps.provider.name, storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
