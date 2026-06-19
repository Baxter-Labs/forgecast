import { ImageProviderRegistry, FalImageProvider, MoneyPrinterWorker, PublisherRegistry, OmnisocialsPublisher } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
  openStore,
  FilesystemStorage,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler, ShortVideoJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, StorageDriver, ShortVideoWorker, JobHandler } from '@forgecast/core';
import { randomId, nowIso } from './ids';

export interface Services {
  imageRegistry: ImageProviderRegistry;
  publishers: PublisherRegistry;
  projects: ProjectRepo;
  assets: AssetRepo;
  jobs: JobRepo;
  storage: StorageDriver;
  runner: JobRunner;
  ids: { randomId: () => string; nowIso: () => string };
  videoWorker: ShortVideoWorker;
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

  const publishers = new PublisherRegistry();
  publishers.register(new OmnisocialsPublisher({ fetchFn: opts.fetchFn }));

  const dbPath = process.env.FORGECAST_DB;
  const dataDir = process.env.FORGECAST_DATA_DIR;

  let projects: ProjectRepo;
  let assets: AssetRepo;
  let jobs: JobRepo;
  if (dbPath) {
    const store = openStore(dbPath);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
  } else {
    projects = new InMemoryProjectRepo();
    assets = new InMemoryAssetRepo();
    jobs = new InMemoryJobRepo();
  }

  const storage: StorageDriver = dataDir
    ? new FilesystemStorage({ root: dataDir, baseUrl: process.env.FORGECAST_BASE_URL })
    : new InMemoryStorage({ baseUrl: process.env.FORGECAST_BASE_URL ?? 'memory://forgecast' });

  const imageHandler = new ImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const videoWorker = new MoneyPrinterWorker();
  const handlers: JobHandler[] = [imageHandler];
  if (videoWorker.isAvailable()) {
    handlers.push(
      new ShortVideoJobHandler({ worker: videoWorker, storage, assets, idGen: randomId, clock: nowIso }),
    );
  }
  const runner = new JobRunner(jobs, handlers);

  return { imageRegistry, publishers, projects, assets, jobs, storage, runner, ids: { randomId, nowIso }, videoWorker };
}

/** Process-wide singleton (in-memory store persists for the server's lifetime). */
export function getServices(): Services {
  if (!cached) cached = buildServices();
  return cached;
}
