import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo,
  type SfxProvider,
} from '@forgecast/core';

export interface SfxJobHandlerDeps {
  provider: SfxProvider;
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
 * SFX job handler: generates synchronized sound effects/ambience for an
 * existing video (MMAudio or any SfxProvider) and stores the returned video
 * (with the audio track merged) as a new asset.
 */
export class SfxJobHandler implements JobHandler {
  readonly kind = 'sfx';

  constructor(private readonly deps: SfxJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as { videoUrl?: unknown; prompt?: unknown; negativePrompt?: unknown };

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;
    const fetchFn = this.deps.fetchFn ?? fetch;

    if (!(typeof params.videoUrl === 'string' && params.videoUrl.length > 0)) {
      throw new Error('sfx requires videoUrl');
    }
    if (!(typeof params.prompt === 'string' && params.prompt.length > 0)) {
      throw new Error('sfx requires prompt');
    }
    const negativePrompt = typeof params.negativePrompt === 'string' && params.negativePrompt.length > 0
      ? params.negativePrompt
      : undefined;

    const { taskId } = await this.deps.provider.create({
      videoUrl: params.videoUrl,
      prompt: params.prompt,
      negativePrompt,
    });
    await report(0.3);

    let resultUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.6);
      if (task.state === 'failed') throw new Error(`sfx provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { resultUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!resultUrl) throw new Error(`sfx task ${taskId} did not complete in time`);
    await report(0.9);

    const res = await fetchFn(resultUrl);
    if (!res.ok) throw new Error(`failed to download scored video (${res.status})`);
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
