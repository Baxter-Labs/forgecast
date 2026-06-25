import { ImageProviderRegistry, FalImageProvider, MoneyPrinterWorker, FalVideoProvider, FalTtsProvider, VoxCpmVoiceProvider, PublisherRegistry, OmnisocialsPublisher, InstagramPublisher, LinkedInPublisher, YouTubePublisher, RemotionMontageWorker, WisprFlowTranscriber, OmniHumanPresenterProvider } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
  openStore,
  d1Store,
  FilesystemStorage,
  R2Storage,
  r2OptionsFromEnv,
  type D1Like,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler, EnhanceJobHandler, ShortVideoJobHandler, VideoJobHandler, MontageJobHandler, LocalMontageJobHandler, VoiceoverJobHandler, NarrateJobHandler, PresenterJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, StorageDriver, ShortVideoWorker, JobHandler, VideoProvider, VoiceProvider, MontageWorker, Transcriber, PresenterProvider } from '@forgecast/core';
import ffmpegStatic from 'ffmpeg-static';
import { randomId, nowIso } from './ids';
import { getD1Binding } from './cf-env';

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
  montageAvailable: boolean;
  voiceProvider: VoiceProvider;
  voiceAvailable: boolean;
  transcriber: Transcriber;
  transcribeAvailable: boolean;
  presenterProvider: PresenterProvider;
  presenterAvailable: boolean;
}

export interface BuildServicesOptions {
  falKey?: string;
  /** fal.ai key for video generation. Falls back to FAL_KEY_VIDEO env. */
  falVideoKey?: string;
  /** SQLite path for durable metadata. Falls back to FORGECAST_DB env, then in-memory. */
  db?: string;
  /** Filesystem root for durable asset bytes. Falls back to FORGECAST_DATA_DIR env, then in-memory. */
  dataDir?: string;
  /** Deployment profile. Falls back to FORGECAST_PROFILE env, then 'local'. 'baxter-cloud' stores asset bytes in Cloudflare R2. */
  profile?: string;
  /** Cloudflare D1 binding for edge-durable metadata (baxter-cloud). When set, repos persist to D1 instead of in-memory. */
  d1?: D1Like;
  /** Injectable fetch for the image handler's download step (tests). */
  fetchFn?: typeof fetch;
}

let cached: Services | undefined;

/**
 * Selects the asset-bytes store for the active deployment profile.
 * - `baxter-cloud`: Cloudflare R2 (S3-compatible, zero egress) from the R2_* env
 *   vars; falls back to local storage with a warning if R2 is not configured.
 * - `local` (default): filesystem when FORGECAST_DATA_DIR is set, else in-memory.
 */
function resolveStorage(profile: string, dataDir: string | undefined): StorageDriver {
  if (profile === 'baxter-cloud') {
    const r2 = r2OptionsFromEnv();
    if (r2) return new R2Storage({ ...r2, publicBaseUrl: r2.publicBaseUrl ?? process.env.FORGECAST_BASE_URL });
    console.warn(
      "[forgecast] Profile 'baxter-cloud' selected but R2 is not configured. Set R2_ACCOUNT_ID, R2_BUCKET, " +
        'R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. Falling back to local storage.',
    );
  }
  return dataDir
    ? new FilesystemStorage({ root: dataDir, baseUrl: process.env.FORGECAST_BASE_URL })
    : new InMemoryStorage({ baseUrl: process.env.FORGECAST_BASE_URL ?? 'memory://forgecast' });
}

export function buildServices(opts: BuildServicesOptions = {}): Services {
  const falKey = 'falKey' in opts ? opts.falKey : process.env.FAL_KEY;
  const falVideoKey = 'falVideoKey' in opts ? opts.falVideoKey : process.env.FAL_KEY_VIDEO;

  const imageRegistry = new ImageProviderRegistry();
  const falImageProvider = new FalImageProvider({ apiKey: falKey, fetchFn: opts.fetchFn });
  imageRegistry.register(falImageProvider);

  const publishers = new PublisherRegistry();
  publishers.register(new OmnisocialsPublisher({ fetchFn: opts.fetchFn }));
  publishers.register(new InstagramPublisher({ fetchFn: opts.fetchFn }));
  publishers.register(new LinkedInPublisher({ fetchFn: opts.fetchFn }));
  publishers.register(new YouTubePublisher({ fetchFn: opts.fetchFn }));

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
  if (opts.d1) {
    // Edge-durable metadata: D1 (SQLite at the edge), so projects/assets/jobs
    // persist across Worker isolates.
    const store = d1Store(opts.d1);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
  } else if (dbPath) {
    const store = openStore(dbPath);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
  } else {
    projects = new InMemoryProjectRepo();
    assets = new InMemoryAssetRepo();
    jobs = new InMemoryJobRepo();
  }

  const storage = resolveStorage(opts.profile ?? process.env.FORGECAST_PROFILE ?? 'local', dataDir);

  const imageHandler = new ImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const enhanceHandler = new EnhanceJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const videoWorker = new MoneyPrinterWorker();
  const videoProvider: VideoProvider = new FalVideoProvider({ apiKey: falVideoKey, fetchFn: opts.fetchFn });
  const handlers: JobHandler[] = [imageHandler, enhanceHandler];
  if (videoWorker.isAvailable()) {
    handlers.push(
      new ShortVideoJobHandler({ worker: videoWorker, storage, assets, idGen: randomId, clock: nowIso }),
    );
  }
  if (videoProvider.isAvailable()) {
    handlers.push(new VideoJobHandler({ provider: videoProvider, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
  }
  const montageWorker = new RemotionMontageWorker({ fetchFn: opts.fetchFn });
  // Prefer the remote Remotion worker when MONTAGE_WORKER_URL is set; otherwise render
  // montages in-process with the bundled ffmpeg binary (no Chromium worker needed).
  let montageAvailable = false;
  if (montageWorker.isAvailable()) {
    handlers.push(new MontageJobHandler({ worker: montageWorker, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
    montageAvailable = true;
  } else if (ffmpegStatic) {
    handlers.push(new LocalMontageJobHandler({ storage, assets, idGen: randomId, clock: nowIso, ffmpegPath: ffmpegStatic, fetchFn: opts.fetchFn }));
    montageAvailable = true;
  }
  const voxcpm = new VoxCpmVoiceProvider({ fetchFn: opts.fetchFn });
  const voiceProvider: VoiceProvider = voxcpm.isAvailable() ? voxcpm : new FalTtsProvider({ fetchFn: opts.fetchFn });
  if (voiceProvider.isAvailable()) {
    handlers.push(new VoiceoverJobHandler({ provider: voiceProvider, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
  }
  if (voiceProvider.isAvailable() && ffmpegStatic) {
    handlers.push(new NarrateJobHandler({ voiceProvider, storage, assets, idGen: randomId, clock: nowIso, ffmpegPath: ffmpegStatic, fetchFn: opts.fetchFn }));
  }
  const voiceAvailable = voiceProvider.isAvailable();

  const transcriber: Transcriber = new WisprFlowTranscriber({ fetchFn: opts.fetchFn });
  const transcribeAvailable = transcriber.isAvailable();

  const presenterProvider: PresenterProvider = new OmniHumanPresenterProvider({ apiKey: falVideoKey, fetchFn: opts.fetchFn });
  const presenterAvailable = presenterProvider.isAvailable() && voiceProvider.isAvailable() && falImageProvider.isAvailable();
  if (presenterAvailable) {
    handlers.push(new PresenterJobHandler({
      provider: presenterProvider,
      imageProvider: falImageProvider,
      voiceProvider,
      storage,
      assets,
      idGen: randomId,
      clock: nowIso,
      fetchFn: opts.fetchFn,
    }));
  }

  const runner = new JobRunner(jobs, handlers);

  return { imageRegistry, publishers, projects, assets, jobs, storage, runner, ids: { randomId, nowIso }, videoWorker, videoProvider, montageWorker, montageAvailable, voiceProvider, voiceAvailable, transcriber, transcribeAvailable, presenterProvider, presenterAvailable };
}

/**
 * Process-wide singleton for the running app.
 *
 * - `local` (default): DURABLE persistence in the working directory (./.forgecast)
 *   so generated assets survive restarts — overridable via FORGECAST_DB /
 *   FORGECAST_DATA_DIR (e.g. a mounted volume in production).
 * - `baxter-cloud`: asset bytes go to R2 and metadata to Cloudflare D1 (the `DB`
 *   binding), so state survives across Worker isolates. If the D1 binding is
 *   absent (e.g. local dev without it), metadata falls back to in-memory.
 *
 * Tests call buildServices() directly and stay in-memory.
 */
export function getServices(): Services {
  if (!cached) {
    const profile = process.env.FORGECAST_PROFILE ?? 'local';
    if (profile === 'baxter-cloud') {
      const d1 = getD1Binding();
      if (!d1) {
        console.warn(
          "[forgecast] Profile 'baxter-cloud' has no D1 binding ('DB'); metadata is in-memory and will not " +
            'persist across Worker isolates. Bind a D1 database named DB in wrangler.jsonc.',
        );
      }
      cached = buildServices({ profile, d1: d1 ?? undefined });
    } else {
      cached = buildServices({
        db: process.env.FORGECAST_DB ?? './.forgecast/forgecast.db',
        dataDir: process.env.FORGECAST_DATA_DIR ?? './.forgecast/objects',
      });
    }
  }
  return cached;
}
