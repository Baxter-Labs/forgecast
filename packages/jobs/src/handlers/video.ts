import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type VideoProvider,
} from '@forgecast/core';

export interface VideoJobHandlerDeps {
  provider: VideoProvider;
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

export class VideoJobHandler implements JobHandler {
  readonly kind = 'video';

  constructor(private readonly deps: VideoJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as { prompt?: unknown; aspectRatio?: unknown; duration?: unknown; quality?: unknown; model?: unknown; imageUrl?: unknown; extra?: unknown };
    if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      throw new Error('video job requires a non-empty "prompt" param');
    }

    const { taskId } = await this.deps.provider.create({
      prompt: params.prompt,
      aspectRatio: typeof params.aspectRatio === 'string' ? params.aspectRatio : undefined,
      duration: typeof params.duration === 'number' ? params.duration : undefined,
      quality: typeof params.quality === 'string' ? params.quality : undefined,
      model: typeof params.model === 'string' ? params.model : undefined,
      imageUrl: typeof params.imageUrl === 'string' ? params.imageUrl : undefined,
      extra: params.extra != null && typeof params.extra === 'object' && !Array.isArray(params.extra)
        ? (params.extra as Record<string, unknown>)
        : undefined,
    });
    await report(0.05);

    const wait = this.deps.wait ?? defaultWait;
    const interval = this.deps.pollIntervalMs ?? 4000;
    const maxPolls = this.deps.maxPolls ?? 450;

    let videoUrl: string | undefined;
    for (let i = 0; i < maxPolls; i += 1) {
      const task = await this.deps.provider.getTask(taskId);
      await report(0.5);
      if (task.state === 'failed') throw new Error(`video provider reported failure for task ${taskId}`);
      if (task.state === 'complete') { videoUrl = task.videoUrl; break; }
      await wait(interval);
    }
    if (!videoUrl) throw new Error(`video task ${taskId} did not complete in time`);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(videoUrl);
    if (!res.ok) throw new Error(`failed to download generated video (${res.status})`);
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
