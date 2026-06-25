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

const DEFAULT_EDIT_MODEL = 'fal-ai/flux-kontext/dev';

export interface EditImageJobHandlerDeps {
  registry: ImageProviderRegistry;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  /** Injectable fetch (to download the edited image). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export class EditImageJobHandler implements JobHandler {
  readonly kind = 'edit';

  constructor(private readonly deps: EditImageJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as Partial<{
      imageUrl: string;
      prompt: string;
      model: string;
      sourceAssetId: string;
    }>;

    if (typeof params.imageUrl !== 'string' || params.imageUrl.length === 0) {
      throw new Error('edit job requires a non-empty "imageUrl" param');
    }
    if (typeof params.prompt !== 'string' || params.prompt.trim().length === 0) {
      throw new Error('edit job requires a non-empty "prompt" param');
    }

    const provider = this.deps.registry.get(job.provider);
    await report(0.1);

    const result = await provider.generateImage({
      prompt: params.prompt,
      model: params.model ?? DEFAULT_EDIT_MODEL,
      extra: { image_url: params.imageUrl },
    });
    await report(0.6);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(result.url);
    if (!res.ok) throw new Error(`failed to download edited image (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';

    const id = this.deps.idGen();
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const key = `projects/${job.projectId}/images/${id}.${ext}`;
    const stored = await this.deps.storage.put(key, bytes, contentType);
    await report(0.9);

    const asset = await this.deps.assets.create(
      newAsset(
        {
          projectId: job.projectId,
          type: 'image',
          provider: 'edit',
          storageKey: stored.key,
          params: {
            sourceAssetId: params.sourceAssetId,
            prompt: params.prompt,
            model: params.model ?? DEFAULT_EDIT_MODEL,
            edited: true,
          },
        },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
