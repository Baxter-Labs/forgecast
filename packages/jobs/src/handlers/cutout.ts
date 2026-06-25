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

// birefnet is a strong, widely-available background-removal model on fal; it
// returns the subject on a transparent background.
const DEFAULT_CUTOUT_MODEL = 'fal-ai/birefnet';

export interface CutoutJobHandlerDeps {
  registry: ImageProviderRegistry;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  /** Injectable fetch (to download the cutout). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Removes the background from an image, producing a clean transparent-PNG cutout
 * of the product — a new asset derived from an existing one. Same shape as the
 * enhance handler: image_url in → fal model → download → store as a new asset.
 */
export class CutoutJobHandler implements JobHandler {
  readonly kind = 'cutout';

  constructor(private readonly deps: CutoutJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as Partial<{
      imageUrl: string;
      model: string;
      sourceAssetId: string;
    }>;

    if (typeof params.imageUrl !== 'string' || params.imageUrl.length === 0) {
      throw new Error('cutout job requires a non-empty "imageUrl" param');
    }

    const provider = this.deps.registry.get(job.provider);
    await report(0.1);

    const result = await provider.generateImage({
      prompt: 'remove background, clean cutout, transparent background',
      model: params.model ?? DEFAULT_CUTOUT_MODEL,
      extra: { image_url: params.imageUrl },
    });
    await report(0.6);

    const fetchFn = this.deps.fetchFn ?? fetch;
    const res = await fetchFn(result.url);
    if (!res.ok) throw new Error(`failed to download cutout image (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Cutouts keep transparency — default to png unless the provider says otherwise.
    const contentType = res.headers.get('content-type') ?? 'image/png';

    const id = this.deps.idGen();
    const ext = contentType.includes('webp') ? 'webp' : 'png';
    const key = `projects/${job.projectId}/images/${id}.${ext}`;
    const stored = await this.deps.storage.put(key, bytes, contentType);
    await report(0.9);

    const asset = await this.deps.assets.create(
      newAsset(
        {
          projectId: job.projectId,
          type: 'image',
          provider: 'cutout',
          storageKey: stored.key,
          params: {
            sourceAssetId: params.sourceAssetId,
            model: params.model ?? DEFAULT_CUTOUT_MODEL,
            cutout: true,
          },
        },
        { id, now: this.deps.clock() },
      ),
    );
    return { assetId: asset.id };
  }
}
