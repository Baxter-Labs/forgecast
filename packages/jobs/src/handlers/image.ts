import {
  newAsset,
  type Job,
  type JobHandler,
  type JobOutcome,
  type ProgressReporter,
  type StorageDriver,
  type AssetRepo,
} from '@forgecast/core';
import type { ImageProviderRegistry } from '@forgecast/providers';

export interface ImageJobParams {
  prompt: string;
  width?: number;
  height?: number;
  /** fal model endpoint to use (else the provider's default). */
  model?: string;
  /** Provider-specific request params (e.g. `aspect_ratio` for Nano Banana). */
  extra?: Record<string, unknown>;
}

export interface ImageJobHandlerDeps {
  registry: ImageProviderRegistry;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  /** Injectable fetch (to download the generated image). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export class ImageJobHandler implements JobHandler {
  readonly kind = 'image';

  constructor(private readonly deps: ImageJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as Partial<ImageJobParams>;
    if (typeof params.prompt !== 'string' || params.prompt.length === 0) {
      throw new Error('image job requires a non-empty "prompt" param');
    }

    const provider = this.deps.registry.get(job.provider);
    await report(0.1);

    const result = await provider.generateImage({
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      model: params.model,
      extra: params.extra,
    });
    await report(0.6);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(result.url);
    if (!res.ok) throw new Error(`failed to download generated image (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';

    const id = this.deps.idGen();
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const key = `projects/${job.projectId}/images/${id}.${ext}`;
    const stored = await this.deps.storage.put(key, bytes, contentType);
    await report(0.9);

    const asset = await this.deps.assets.create(
      newAsset(
        { projectId: job.projectId, type: 'image', provider: job.provider, storageKey: stored.key, params: job.params },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
