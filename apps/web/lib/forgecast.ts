import { ImageProviderRegistry, FalImageProvider } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, StorageDriver } from '@forgecast/core';
import { randomId, nowIso } from './ids';

export interface Services {
  imageRegistry: ImageProviderRegistry;
  projects: ProjectRepo;
  assets: AssetRepo;
  jobs: JobRepo;
  storage: StorageDriver;
  runner: JobRunner;
  ids: { randomId: () => string; nowIso: () => string };
}

export interface BuildServicesOptions {
  falKey?: string;
  /** Injectable fetch for the image handler's download step (tests). */
  fetchFn?: typeof fetch;
}

let cached: Services | undefined;

export function buildServices(opts: BuildServicesOptions = {}): Services {
  const falKey = 'falKey' in opts ? opts.falKey : process.env.FAL_KEY;

  const imageRegistry = new ImageProviderRegistry();
  imageRegistry.register(new FalImageProvider({ apiKey: falKey }));

  const projects = new InMemoryProjectRepo();
  const assets = new InMemoryAssetRepo();
  const jobs = new InMemoryJobRepo();
  const storage = new InMemoryStorage({ baseUrl: process.env.FORGECAST_BASE_URL ?? 'memory://forgecast' });

  const imageHandler = new ImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const runner = new JobRunner(jobs, [imageHandler]);

  return { imageRegistry, projects, assets, jobs, storage, runner, ids: { randomId, nowIso } };
}

/** Process-wide singleton (in-memory store persists for the server's lifetime). */
export function getServices(): Services {
  if (!cached) cached = buildServices();
  return cached;
}
