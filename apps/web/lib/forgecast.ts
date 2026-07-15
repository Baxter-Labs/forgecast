import { ImageProviderRegistry, FalImageProvider, StableDiffusionImageProvider, OpenAiImageProvider, MoneyPrinterWorker, FalVideoProvider, ReplicateVideoProvider, FalTtsProvider, VoxCpmVoiceProvider, PublisherRegistry, WebhookPublisher, OmnisocialsPublisher, InstagramPublisher, LinkedInPublisher, YouTubePublisher, RemotionMontageWorker, WisprFlowTranscriber, OmniHumanPresenterProvider, HttpWebsiteReader, AdsInsightsRegistry, MetaAdsInsightsProvider, GoogleAdsInsightsProvider, FootageRegistry, PexelsFootageProvider, CloudflareImageProvider, CloudflareVideoProvider, SkyReelsVideoProvider, VideoProviderRegistry, type WorkersAiRunner } from '@forgecast/providers';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryUserRepo,
  InMemoryKeyRepo,
  InMemoryStorage,
  openStore,
  d1Store,
  FilesystemStorage,
  R2Storage,
  R2BucketStorage,
  r2OptionsFromEnv,
  type D1Like,
  type R2BucketLike,
} from '@forgecast/store';
import { JobRunner, ImageJobHandler, EnhanceJobHandler, EditImageJobHandler, CutoutJobHandler, ShortVideoJobHandler, VideoJobHandler, MontageJobHandler, LocalMontageJobHandler, VoiceoverJobHandler, NarrateJobHandler, PresenterJobHandler } from '@forgecast/jobs';
import type { ProjectRepo, AssetRepo, JobRepo, UserRepo, KeyRepo, StorageDriver, ShortVideoWorker, JobHandler, VideoProvider, VoiceProvider, MontageWorker, Transcriber, PresenterProvider, WebsiteReader } from '@forgecast/core';
import ffmpegStatic from 'ffmpeg-static';
import { randomId, nowIso } from './ids';
import { getD1Binding, getAiBinding, getMediaBucket } from './cf-env';
import { resolveOwnerKeys } from './keys';

export interface Services {
  imageRegistry: ImageProviderRegistry;
  publishers: PublisherRegistry;
  projects: ProjectRepo;
  assets: AssetRepo;
  jobs: JobRepo;
  users: UserRepo;
  keys: KeyRepo;
  storage: StorageDriver;
  runner: JobRunner;
  ids: { randomId: () => string; nowIso: () => string };
  videoWorker: ShortVideoWorker;
  videoProvider: VideoProvider;
  videoRegistry: VideoProviderRegistry;
  /** Names of available video providers (e.g. ['cloudflare','fal-video']). */
  videoProviders: string[];
  montageWorker: MontageWorker;
  montageAvailable: boolean;
  voiceProvider: VoiceProvider;
  voiceAvailable: boolean;
  transcriber: Transcriber;
  transcribeAvailable: boolean;
  presenterProvider: PresenterProvider;
  presenterAvailable: boolean;
  websiteReader: WebsiteReader;
  insights: AdsInsightsRegistry;
  /** Names of connected ad-insights sources (e.g. ['meta','google']). */
  insightsAvailable: string[];
  footage: FootageRegistry;
  /** Names of configured footage sources (e.g. ['pexels']). */
  footageAvailable: string[];
  /** Injectable fetch for api-level downloads (e.g. importing footage). */
  fetchFn: typeof fetch;
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
  /** fal key for cloud TTS. Falls back to voice→image key, then env. */
  voiceKey?: string;
  /** Wispr Flow transcription key. Falls back to WISPRFLOW_API_KEY env. */
  wisprKey?: string;
  /** Pexels stock-footage key. Falls back to PEXELS_API_KEY env. */
  pexelsKey?: string;
  /** OpenAI key for the non-fal image provider (gpt-image-1). Falls back to OPENAI_API_KEY env. */
  openaiKey?: string;
  /** Replicate token for the non-fal video provider. Falls back to REPLICATE_API_TOKEN env. */
  replicateKey?: string;
  /** Cloudflare Workers AI binding (env.AI) — powers the keyless default image/video
   *  provider. Present on the Cloudflare deploy; absent (undefined) off-Workers. */
  ai?: WorkersAiRunner;
  /** Cloudflare R2 bucket binding (env.MEDIA_BUCKET) — the keyless media store for the
   *  baxter-cloud profile (no S3 access keys). Present on the deploy; undefined off-Workers. */
  mediaBucket?: R2BucketLike;
  /** Reuse an existing instance's repos + storage (per-user provider overlays).
   *  Providers/handlers are rebuilt with the key overrides; state is shared. */
  shared?: Pick<Services, 'projects' | 'assets' | 'jobs' | 'users' | 'keys' | 'storage'>;
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
function resolveStorage(profile: string, dataDir: string | undefined, mediaBucket?: R2BucketLike): StorageDriver {
  if (profile === 'baxter-cloud') {
    // Prefer the native R2 binding (no S3 access keys) when the Worker exposes it.
    if (mediaBucket) return new R2BucketStorage({ bucket: mediaBucket, publicBaseUrl: process.env.R2_PUBLIC_BASE_URL });
    const r2 = r2OptionsFromEnv();
    if (r2) return new R2Storage({ ...r2, publicBaseUrl: r2.publicBaseUrl ?? process.env.FORGECAST_BASE_URL });
    console.warn(
      "[forgecast] Profile 'baxter-cloud' selected but R2 is not configured. Bind an R2 bucket as MEDIA_BUCKET " +
        '(native, no keys) or set R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY. Falling back to local storage.',
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
  // Self-hosted, free image generation via a local Stable Diffusion WebUI. Available
  // only when SD_WEBUI_URL is set (the registry filters by isAvailable()).
  imageRegistry.register(new StableDiffusionImageProvider({ fetchFn: opts.fetchFn }));
  // Non-fal cloud image generation via OpenAI (gpt-image-1) — a BYO-key alternative.
  // Available when the user's OpenAI key (or OPENAI_API_KEY) is set.
  const openaiImageProvider = new OpenAiImageProvider({ apiKey: opts.openaiKey, fetchFn: opts.fetchFn });
  imageRegistry.register(openaiImageProvider);
  // Keyless DEFAULT: Cloudflare Workers AI (FLUX.1 schnell) via the Worker's `AI`
  // binding — no API key, billed to the account's free daily neuron allowance.
  // Available on the Cloudflare deploy (binding) or off-Workers with
  // CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN; else the registry filters it out.
  imageRegistry.register(new CloudflareImageProvider({ runner: opts.ai, fetchFn: opts.fetchFn }));

  const publishers = new PublisherRegistry();
  publishers.register(new WebhookPublisher({ fetchFn: opts.fetchFn }));
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
  let users: UserRepo;
  let keys: KeyRepo;
  let storage: StorageDriver;
  if (opts.shared) {
    // Per-user provider overlay: same state, different keys.
    ({ projects, assets, jobs, users, keys, storage } = opts.shared);
  } else if (opts.d1) {
    // Edge-durable metadata: D1 (SQLite at the edge), so projects/assets/jobs
    // persist across Worker isolates.
    const store = d1Store(opts.d1);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
    users = store.users;
    keys = store.keys;
    storage = resolveStorage(opts.profile ?? process.env.FORGECAST_PROFILE ?? 'local', dataDir, opts.mediaBucket);
  } else if (dbPath) {
    const store = openStore(dbPath);
    projects = store.projects;
    assets = store.assets;
    jobs = store.jobs;
    users = store.users;
    keys = store.keys;
    storage = resolveStorage(opts.profile ?? process.env.FORGECAST_PROFILE ?? 'local', dataDir, opts.mediaBucket);
  } else {
    projects = new InMemoryProjectRepo();
    assets = new InMemoryAssetRepo();
    jobs = new InMemoryJobRepo();
    users = new InMemoryUserRepo();
    keys = new InMemoryKeyRepo();
    storage = resolveStorage(opts.profile ?? process.env.FORGECAST_PROFILE ?? 'local', dataDir, opts.mediaBucket);
  }

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
  const editImageHandler = new EditImageJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const cutoutHandler = new CutoutJobHandler({
    registry: imageRegistry,
    storage,
    assets,
    idGen: randomId,
    clock: nowIso,
    fetchFn: opts.fetchFn,
  });
  const videoWorker = new MoneyPrinterWorker({ fetchFn: opts.fetchFn });
  // Video providers → a registry, so each job resolves back to the provider that
  // created it (by name). Keyless DEFAULT: Cloudflare Workers AI via the AI binding;
  // BYO fal / Replicate keys are selectable "on top".
  const videoRegistry = new VideoProviderRegistry();
  const cloudflareVideoProvider = new CloudflareVideoProvider({ runner: opts.ai, fetchFn: opts.fetchFn });
  const falVideoProvider = new FalVideoProvider({ apiKey: falVideoKey, fetchFn: opts.fetchFn });
  const replicateVideoProvider = new ReplicateVideoProvider({ apiKey: opts.replicateKey, fetchFn: opts.fetchFn });
  // Optional self-hosted SkyReels-V2 (bring-your-own-GPU). Available only when
  // SKYREELS_URL points at a running worker (see workers/skyreels).
  const skyReelsVideoProvider = new SkyReelsVideoProvider({ fetchFn: opts.fetchFn });
  videoRegistry.register(cloudflareVideoProvider);
  videoRegistry.register(falVideoProvider);
  videoRegistry.register(replicateVideoProvider);
  videoRegistry.register(skyReelsVideoProvider);
  // Default pick when a request names no provider. An operator can pin any available
  // provider via FORGECAST_VIDEO_PROVIDER (e.g. a self-hosted 'skyreels'); otherwise a
  // configured BYO key wins (fal, then Replicate) so a user's own key is used "on top";
  // else the keyless Cloudflare provider (also the unavailable placeholder for health).
  const pinnedVideo = process.env.FORGECAST_VIDEO_PROVIDER;
  const videoProvider: VideoProvider =
    pinnedVideo && videoRegistry.has(pinnedVideo) && videoRegistry.get(pinnedVideo).isAvailable()
      ? videoRegistry.get(pinnedVideo)
      : falVideoProvider.isAvailable()
        ? falVideoProvider
        : replicateVideoProvider.isAvailable()
          ? replicateVideoProvider
          : cloudflareVideoProvider;
  const videoProviders = videoRegistry.available();
  const handlers: JobHandler[] = [imageHandler, enhanceHandler, editImageHandler, cutoutHandler];
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
  // User voice key → user image key → env (the provider's own fallback chain).
  const ttsKey = opts.voiceKey ?? falKey;
  const voiceProvider: VoiceProvider = voxcpm.isAvailable()
    ? voxcpm
    : new FalTtsProvider({ fetchFn: opts.fetchFn, ...(ttsKey !== undefined ? { apiKey: ttsKey } : {}) });
  if (voiceProvider.isAvailable()) {
    handlers.push(new VoiceoverJobHandler({ provider: voiceProvider, storage, assets, idGen: randomId, clock: nowIso, fetchFn: opts.fetchFn }));
  }
  if (voiceProvider.isAvailable() && ffmpegStatic) {
    handlers.push(new NarrateJobHandler({ voiceProvider, storage, assets, idGen: randomId, clock: nowIso, ffmpegPath: ffmpegStatic, fetchFn: opts.fetchFn }));
  }
  const voiceAvailable = voiceProvider.isAvailable();

  const transcriber: Transcriber = new WisprFlowTranscriber({ fetchFn: opts.fetchFn, ...(opts.wisprKey !== undefined ? { apiKey: opts.wisprKey } : {}) });
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

  const websiteReader: WebsiteReader = new HttpWebsiteReader({ fetchFn: opts.fetchFn });

  // Ad-performance sources for the measure→optimize loop. Unconfigured by default;
  // the analyzers also run on metrics handed in directly, so this needs no keys.
  const insights = new AdsInsightsRegistry();
  insights.register(new MetaAdsInsightsProvider({ fetchFn: opts.fetchFn }));
  insights.register(new GoogleAdsInsightsProvider({ fetchFn: opts.fetchFn }));
  const insightsAvailable = insights.available();

  // Real-footage search (OpenMontage-style). Keyless-friendly UI; needs PEXELS_API_KEY to pull.
  const footage = new FootageRegistry();
  footage.register(new PexelsFootageProvider({ fetchFn: opts.fetchFn, ...(opts.pexelsKey !== undefined ? { apiKey: opts.pexelsKey } : {}) }));
  const footageAvailable = footage.available();

  const runner = new JobRunner(jobs, handlers);

  return { imageRegistry, publishers, projects, assets, jobs, users, keys, storage, runner, ids: { randomId, nowIso }, videoWorker, videoProvider, videoRegistry, videoProviders, montageWorker, montageAvailable, voiceProvider, voiceAvailable, transcriber, transcribeAvailable, presenterProvider, presenterAvailable, websiteReader, insights, insightsAvailable, footage, footageAvailable, fetchFn: opts.fetchFn ?? fetch };
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
      cached = buildServices({ profile, d1: d1 ?? undefined, ai: getAiBinding() ?? undefined, mediaBucket: getMediaBucket() ?? undefined });
    } else {
      cached = buildServices({
        db: process.env.FORGECAST_DB ?? './.forgecast/forgecast.db',
        dataDir: process.env.FORGECAST_DATA_DIR ?? './.forgecast/objects',
        ai: getAiBinding() ?? undefined,
        mediaBucket: getMediaBucket() ?? undefined,
      });
    }
  }
  return cached;
}

// ── Per-user services: BYO keys set from the UI ───────────────────────────────
// The owner's stored keys (see lib/keys.ts) override the instance env vars.
// Repos + storage are shared with the singleton; only providers/handlers are
// rebuilt, so state is identical and construction is cheap. Cached briefly per
// owner; key writes invalidate immediately in this process.

const userServicesCache = new Map<string, { at: number; services: Services }>();
const USER_SERVICES_TTL_MS = 30_000;

export function invalidateUserServices(ownerId: string): void {
  userServicesCache.delete(ownerId);
}

/**
 * The Services an owner's requests should run on: the base singleton when they
 * have no stored keys, or a provider overlay with their keys applied.
 * Pass `base` explicitly in tests to stay off the process-wide singleton.
 */
export async function getServicesForUser(ownerId: string, base: Services = getServices()): Promise<Services> {
  const hit = userServicesCache.get(ownerId);
  if (hit && Date.now() - hit.at < USER_SERVICES_TTL_MS) return hit.services;

  const own = await resolveOwnerKeys(base, ownerId);
  let services = base;
  if (Object.keys(own).length > 0) {
    const opts: BuildServicesOptions = {
      shared: {
        projects: base.projects, assets: base.assets, jobs: base.jobs,
        users: base.users, keys: base.keys, storage: base.storage,
      },
      fetchFn: base.fetchFn,
      ai: getAiBinding() ?? undefined,
      mediaBucket: getMediaBucket() ?? undefined,
    };
    // Only set the fields the owner actually stored — buildServices treats a
    // *present* option as authoritative, so an undefined here would kill the
    // env fallback.
    if (own.fal !== undefined) opts.falKey = own.fal;
    if (own.fal_video !== undefined) opts.falVideoKey = own.fal_video;
    if (own.fal_voice !== undefined) opts.voiceKey = own.fal_voice;
    if (own.pexels !== undefined) opts.pexelsKey = own.pexels;
    if (own.wisprflow !== undefined) opts.wisprKey = own.wisprflow;
    if (own.openai !== undefined) opts.openaiKey = own.openai;
    if (own.replicate !== undefined) opts.replicateKey = own.replicate;
    services = buildServices(opts);
  }
  userServicesCache.set(ownerId, { at: Date.now(), services });
  return services;
}
