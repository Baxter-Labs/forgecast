# Forgecast — Architecture

The short version: **everything depends inward on `@forgecast/core`'s pure contracts**, so any concrete piece — a model provider, a database, a storage backend, a publishing adapter — is a swappable adapter that drops in with zero changes to everything above it.

---

## 1. Principles

- **Dependency inversion.** `@forgecast/core` defines interfaces (contracts) and pure types with **zero I/O**. Every other package depends on those contracts, never the reverse.
- **Pluggable everything.** Generation, storage, persistence, publishing, voice, and distribution are all interfaces. The default implementations are cloud-backed (no GPU) and in-memory (for dev/tests); SQLite + filesystem and Cloudflare D1 + R2 are the production backends.
- **Offline-testable.** Every adapter takes its I/O (HTTP `fetch`, clock, id generator) by injection — the whole suite is mock-tested with no network, GPU, or database. 375 tests, all offline.
- **Two front doors, one spine.** Each capability is exposed as an HTTP route (for humans and the Studio UI) and as an MCP tool (for agents and Claude Desktop).

---

## 2. Package graph

```
                              @forgecast/core
      (Project, Asset, Job · ImageProvider · VideoProvider · VoiceProvider
       PresenterProvider · MontageWorker · Transcriber · Publisher · AdsInsightsProvider
       ProjectRepo / AssetRepo / JobRepo · StorageDriver
       JobHandler / JobRunner · ShortVideoWorker
       BrandKit · ad-copy / creative-fatigue / ad-audit analyzers)
          ▲             ▲             ▲              ▲
   ┌──────┘        ┌────┘        ┌───┘          ┌───┘
@forgecast/    @forgecast/   @forgecast/    @forgecast/
 providers       store          jobs           agent
 (adapters:    (repos +      (JobRunner +    (ContentAgent:
  image, video, storage:      handlers:       LLM plan →
  TTS, montage, in-memory,    image, video,   execute →
  publish,      SQLite/FS,    short_video,    publish)
  presenter)    D1, R2)       montage,
                              voiceover,
     ▲               ▲        narrate,
     └───────┬────────┘        presenter)
             ▲              ▲
       @forgecast/catalog   │
       (typed model list)   │
                  ▲         │
               apps/web ────┘
       (Next.js spine API + Studio UI)
                  ▲
               apps/mcp
       (MCP server — forgecast_* tools)
```

| Package / App | Responsibility | Depends on |
|---|---|---|
| `@forgecast/core` | Pure types + all contracts, plus pure analyzers: brand kit, ad-copy, creative-fatigue & ad-audit. No side effects. | — |
| `@forgecast/catalog` | Vendored, typed text-to-image + video model catalogs | — |
| `@forgecast/providers` | All adapters: image (fal), video (fal), short-video (MoneyPrinter), voice (VoxCPM-2 self-hosted / fal TTS), montage (Remotion / in-process ffmpeg), presenter (OmniHuman), publishing (Webhook/Instagram/LinkedIn/YouTube/OmniSocials), ads insights (Meta / Google Ads), transcription (WisprFlow), website fetcher | core |
| `@forgecast/store` | Repositories + storage: in-memory (dev), SQLite/FS (local durable), Cloudflare D1/R2 (edge) | core |
| `@forgecast/jobs` | `JobRunner` lifecycle + all `JobHandler`s | core, providers |
| `@forgecast/agent` | `ContentAgent` (plan → execute) and `ToolCallingAgent` (autonomous AUTO-RUN); pluggable `LlmClient` (OpenAI default, Claude opt-in) | core |
| `apps/web` | Composition root: spine HTTP API + Studio UI | all packages |
| `apps/mcp` | MCP server: `forgecast_*` tools over the spine HTTP API | — (HTTP client) |
| `workers/montage` | Remotion render service (Docker). Called by `RemotionMontageWorker`. | — |
| `workers/shorts` | MoneyPrinterTurbo setup (Docker). Called by `MoneyPrinterWorker`. | — |

---

## 3. Provider contracts

All provider contracts live in `@forgecast/core`. The key ones:

```ts
interface ImageProvider {
  readonly name: string;
  isAvailable(): boolean;
  generateImage(input: GenerateImageInput): Promise<ImageResult>;
}

interface VideoProvider {
  readonly name: string;
  isAvailable(): boolean;
  generateVideo(input: GenerateVideoInput): Promise<VideoResult>;
}

interface VoiceProvider {
  readonly name: string;
  isAvailable(): boolean;
  synthesize(input: SynthesizeInput): Promise<VoiceResult>;
}

interface MontageWorker {
  isAvailable(): boolean;
  render(spec: MontageSpec): Promise<{ taskId: string }>;
  poll(taskId: string): Promise<MontageTaskResult>;
}

interface Publisher {
  readonly name: string;
  isAvailable(): boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
}

interface Transcriber {
  isAvailable(): boolean;
  transcribe(audio: TranscribeInput): Promise<string>;
}

interface AdsInsightsProvider {          // the "measure" side of the ads loop
  readonly name: string;                 // 'meta' | 'google'
  isAvailable(): boolean;
  fetchInsights(input?: { sinceDays?: number }): Promise<AdCreativeMetrics[]>;
}
```

`isAvailable()` powers **graceful degradation** — a provider missing its API key reports unavailable and is never offered, instead of crashing. Providers are selected by name from registries; the platform is unaware of which adapter is active.

Alongside the I/O contracts, `@forgecast/core` also holds **pure analyzers** with no side effects, so they're trivially testable and reusable across web + MCP:

- **Brand kit** (`brandKitToPrompt`, `applyBrandKit`) — folds a project's identity (palette, tone, key messages) into every generation prompt.
- **Ad copy** (`platformCopySpec`, `buildAdCopyPrompt`, `parseAdCopyVariants`) — platform-aware, character-limited, A/B-tagged ad-copy generation.
- **Creative fatigue** (`diagnoseCreativeFatigue`) — CTR decay + frequency saturation + rising CPA → a 0–1 score + status.
- **Ad audit** (`auditAds`) — a 0–100 health score across CTR health, creative freshness, spend efficiency, conversion rate and spend concentration, with per-creative fatigue and recommendations.

---

## 4. Data model

```ts
interface Project { id; name; createdAt }
interface Asset   { id; projectId; type; provider; params; storageKey; status; createdAt }
interface Job     {
  id; projectId; kind; provider; params;
  status; progress; resultAssetId?; error?;
  createdAt; startedAt?; completedAt?
}
```

Generation is always **Job → (async) → Asset**. The UI and MCP both create jobs and poll status — they never block on a render.

Persistence is behind interfaces (`ProjectRepo`, `AssetRepo`, `JobRepo`) with three implementations:

| Backend | Class | When used |
|---|---|---|
| In-memory | `InMemory*Repo` | Dev / tests (data resets on restart) |
| SQLite + filesystem | `Sqlite*Repo` + `FilesystemStorage` | Local durable (`FORGECAST_DATA_DIR` set) |
| Cloudflare D1 + R2 | `D1*Repo` + `R2Storage` | Edge deployment (`baxter-cloud` profile) |

`StorageDriver` (`put` / `get` / `url`) abstracts object storage behind the same interface across all backends.

---

## 5. Job engine

```ts
interface JobHandler { readonly kind: JobKind; run(job, report): Promise<JobOutcome> }
type ProgressReporter = (progress: number) => void | Promise<void>;
```

`JobRunner.run(jobId)`:
1. Loads the job (unknown id → throws; unknown kind → marks job `error`).
2. Transitions to `running` (progress 0).
3. Invokes the matching `JobHandler`, persisting progress as it reports.
4. On success → `done` + `resultAssetId`; on throw → `error` with message captured.

Registered handlers:

| Handler | Kind | What it does |
|---|---|---|
| `ImageJobHandler` | `image` | validate → `ImageProvider.generateImage()` → download → store → asset |
| `VideoJobHandler` | `video` | `VideoProvider.generateVideo()` → poll → download → store → asset |
| `ShortVideoJobHandler` | `short_video` | drive MoneyPrinterTurbo worker → download MP4 → store → asset |
| `MontageJobHandler` | `montage` | drive Remotion worker → poll → download MP4 → store → asset |
| `LocalMontageJobHandler` | `local_montage` | in-process montage fallback |
| `VoiceoverJobHandler` | `voiceover` | `VoiceProvider.synthesize()` → store audio → asset |
| `NarrateJobHandler` | `narrate` | script generation + TTS in sequence |
| `PresenterJobHandler` | `presenter` | `PresenterProvider` → avatar video → store → asset |

---

## 6. The content agent (`@forgecast/agent`)

`ContentAgent` is an LLM-powered planner that drives the same spine actions humans use via the Studio:

1. **Plan:** calls an LLM with the user's brief + optional trend data (Agent-Reach). Returns a structured `ContentPlan` (concept, assets array, publish targets).
2. **Execute:** iterates the plan — `generateImage` / `generateVideo` per asset, `publish` per target.

A second agent, `ToolCallingAgent`, runs the autonomous **AUTO-RUN** mode: given a brief it tool-calls its way through brainstorm → generate → publish in one shot (the `agentic` mode of `/api/agent`).

The `LlmClient` is pluggable — **OpenAI by default**, **Claude (Anthropic) opt-in** via `FORGECAST_AGENT_LLM=anthropic`. Selection is explicit, so an ambient `ANTHROPIC_API_KEY` never silently bills the agent. Dependencies are injected (`LlmClient`, `ForgecastActions`, `TrendTool?`) so the agent is fully offline-testable. The web app exposes `POST /api/agent` (modes: `plan` / `execute` / `agentic`) and the Studio has a chat panel to drive it.

---

## 7. The web app (`apps/web`)

- **Composition root** `lib/forgecast.ts` — `buildServices()` wires all providers, repos, storage, job handlers, and the runner based on environment. `getServices()` is the process singleton.
- **Route logic** `lib/api.ts` — pure `(services, input) → { status, body }` functions, unit-tested offline. Next.js route handlers are thin wrappers.
- **API surface:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + configured providers + publishers |
| `GET/POST` | `/api/projects` | List / create projects |
| `POST` | `/api/projects/:id/generate` | Start image job |
| `POST` | `/api/projects/:id/generate-video` | Start video job (text→video / image→video) |
| `POST` | `/api/projects/:id/generate-clip` | Start short-video job |
| `POST` | `/api/projects/:id/generate-montage` | Start montage job |
| `POST` | `/api/projects/:id/generate-voiceover` | Start voice-over job |
| `POST` | `/api/projects/:id/narrate` | Mux an AI voice-over onto a clip |
| `POST` | `/api/projects/:id/generate-presenter` | Start talking-head presenter job |
| `POST` | `/api/projects/:id/assets/upload` | Upload a user asset (image/clip) |
| `POST` | `/api/projects/:id/assets/:assetId/{enhance,edit,cutout,variations}` | Upscale / instruction-edit / background-cutout / variations |
| `GET/PUT` | `/api/projects/:id/brand-kit` | Read / set the project brand kit |
| `POST` | `/api/projects/:id/brand-kit/from-website` | Seed the brand kit from a website |
| `POST` | `/api/projects/:id/from-website` | URL → import + generate on-brand assets |
| `POST` | `/api/projects/:id/ad-copy` | Generate platform-aware, A/B ad-copy variants |
| `POST` | `/api/projects/:id/ads/optimize` | Regenerate fatigued creatives on-brand (close the loop) |
| `POST` | `/api/ads/audit` | Audit ad performance (fatigue + health score) |
| `POST` | `/api/ads/insights` | Pull / echo normalized ad metrics |
| `GET` | `/api/jobs/:id` | Poll job status |
| `GET` | `/api/projects/:id/assets` · `GET /api/assets/:id` | List / get assets |
| `GET` | `/api/assets/:id/raw` | Serve asset bytes |
| `POST` | `/api/assets/:id/publish` | Publish / cross-post an asset |
| `POST` | `/api/agent` | Agent (modes: `plan` / `execute` / `agentic`) |
| `POST` | `/api/voice/vapi` · `POST /api/transcribe` | Vapi voice webhook · audio transcription |
| `POST/GET` | `/api/billing/{checkout,webhook,status}` | Mollie checkout · webhook · Pro entitlement |

- **Studio UI** — "Molten Forge" aesthetic (Bricolage Grotesque + IBM Plex, warm-charcoal canvas, molten ember accents). Components: `Header`, `CreatePanel` (idea / website / upload), `ForgePanel` (prompt + model picker + ratio + mode toggle), `JobStatus`, `Gallery` / `AssetCard`, `AssetEditor`, `MontageBuilder`, `BrandKitModal`, `PublishPanel` (with AI ad-copy suggestions), `PerformancePanel` (audit + optimize), `AgentChat`, `Lightbox`.

---

## 8. The MCP server (`apps/mcp`)

A standalone process that wraps the spine HTTP API as MCP tools. Requires the Forgecast web app to be running. **25 tools**, grouped:

- **Projects / assets:** `forgecast_health`, `forgecast_list_projects`, `forgecast_create_project`, `forgecast_list_assets`, `forgecast_get_job`
- **Generate:** `forgecast_generate_image`, `forgecast_generate_video`, `forgecast_generate_short_video`, `forgecast_generate_montage`, `forgecast_enhance_image`, `forgecast_edit_image`, `forgecast_cutout_image`, `forgecast_narrate_video`
- **Brand + website:** `forgecast_get_brand_kit`, `forgecast_set_brand_kit`, `forgecast_brand_kit_from_website`, `forgecast_generate_from_website`
- **Copy + publish:** `forgecast_generate_ad_copy`, `forgecast_publish_asset`
- **Agent:** `forgecast_agent_plan`, `forgecast_agent_execute`, `forgecast_agent_run`
- **Ads measure → optimize:** `forgecast_ads_audit`, `forgecast_ads_insights`, `forgecast_optimize_creatives`

See [`apps/mcp/README.md`](../apps/mcp/README.md) for configuration and the full tool table.

---

## 9. Deployment profiles

The OSS core is cloud-agnostic; clouds are opt-in configuration, never a requirement.

| Layer | `local` (default) | `baxter-cloud` |
|---|---|---|
| Asset bytes | Filesystem (`FORGECAST_DATA_DIR`) or in-memory | Cloudflare **R2** (S3-compatible, zero egress) |
| Metadata | SQLite (`FORGECAST_DB`) or in-memory | Cloudflare **D1** (edge-durable) |
| App hosting | Node / Docker | Cloudflare **Workers** (via OpenNext) |

Switching profiles is **configuration, not a rewrite** — storage is S3-compatible, repos implement the same interface, and the composition root reads `FORGECAST_PROFILE`.

See [`docs/DEPLOY-CLOUDFLARE.md`](DEPLOY-CLOUDFLARE.md) for the step-by-step Cloudflare Workers + D1 + R2 deployment.

---

## 10. Testing philosophy

- **TDD per change**, every commit green.
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`) — `pnpm typecheck` must pass across every package.
- **No network, GPU, or DB in the suite** — adapters inject I/O and are tested against mocks or in-memory implementations.
- 375 tests, CI on Node 24 (GitHub Actions).
