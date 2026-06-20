import { ImageProviderRegistry, FalImageProvider, MoneyPrinterWorker, PixverseVideoProvider, FalVideoProvider, PublisherRegistry, OmnisocialsPublisher, RemotionMontageWorker } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
  openStore,
  FilesystemStorage,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler, ShortVideoJobHandler, VideoJobHandler, MontageJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, StorageDriver, ShortVideoWorker, JobHandler, VideoProvider, MontageWorker } from '@forgecast/core';
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
  videoProvider: VideoProvider;
  montageWorker: MontageWorker;
}

export interface BuildServicesOptions {
  falKey?: string;
  /** SQLite path for durable metadata. Falls back to FORGECAST_DB env, then in-memory. */
  db?: string;
  /** Filesystem root for durable asset bytes. Falls back to FORGECAST_DATA_DIR env, then in-memory. */
  dataDir?: string;
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

  const dbPath = opts.db ?? process.env.FORGECAST_DB;
  const dataDir = opts.dataDir ?? process.env.FORGECAST_DATA_DIR;

  // Durable persistence needs BOTH: the DB holds asset metadata, the data dir holds
  // the bytes. Setting only one splits them (records without files, or vice versa) —
  // assets break on restart. Warn loudly rather than fail silently.
  if (Boolean(dbPath) !== Boolean(dataDir)) {
    console.warn(
      '[forgecast] Partial persistence config: set BOTH FORGECAST_DB and FORGECAST_DATA_DIR for durable assets, or neither for ephemeral in-memory. ' +
        `Currently FORGECAST_DB=${dbPath ? 'set' : 'unset'}, FORGECAST_DATA_DIR=${dataDir ? 'set' : 'unset'}.`,
    );
  }

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
  // Prefer fal for video (reuses FAL_KEY — no separate Pixverse credits needed);
  // fall back to Pixverse only if its key is set instead.
  const videoProvider: VideoProvider = falKey
    ? new FalVideoProvider({ apiKey: falKey, fetchFn: opts.fetchFn })
    : new PixverseVideoProvider({ fetchFn: opts.fetchFn });
  const handlers: JobHandler[] = [imageHandler];
  if (videoWorker.isAvailable()) {
    handlers.push(
      new ShortVideoJobHandler({ worker: videoWorker, storage, assets, idGen: randomId, clock: nowIso }),
    );
  }
  if (videoProvider.isAvailable()) {
    handlers.push(new VideoJobHandler({ provider: videoProvider, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
  }
  const montageWorker = new RemotionMontageWorker({ fetchFn: opts.fetchFn });
  if (montageWorker.isAvailable()) {
    handlers.push(new MontageJobHandler({ worker: montageWorker, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
  }
  const runner = new JobRunner(jobs, handlers);

  return { imageRegistry, publishers, projects, assets, jobs, storage, runner, ids: { randomId, nowIso }, videoWorker, videoProvider, montageWorker };
}

/**
 * Process-wide singleton for the running app. Defaults to DURABLE persistence in
 * the working directory (./.forgecast) so generated assets survive restarts and
 * land on disk — overridable via FORGECAST_DB / FORGECAST_DATA_DIR (e.g. a mounted
 * volume in production). Tests call buildServices() directly and stay in-memory.
 */
export function getServices(): Services {
  if (!cached) {
    cached = buildServices({
      db: process.env.FORGECAST_DB ?? './.forgecast/forgecast.db',
      dataDir: process.env.FORGECAST_DATA_DIR ?? './.forgecast/objects',
    });
  }
  return cached;
}
