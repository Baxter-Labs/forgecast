# Forgecast — Architecture

The short version: **everything depends inward on `@forgecast/core`'s pure contracts**, so any concrete piece — a model provider, a database, a storage backend, a publishing adapter — is a swappable adapter that drops in with zero changes to everything above it.

---

## 1. Principles

- **Dependency inversion.** `@forgecast/core` defines interfaces (contracts) and pure types with **zero I/O**. Every other package depends on those contracts, never the reverse.
- **Pluggable everything.** Generation, storage, persistence, publishing, voice, and distribution are all interfaces. The default implementations are cloud-backed (no GPU) and in-memory (for dev/tests); SQLite + filesystem and Cloudflare D1 + R2 are the production backends.
- **Offline-testable.** Every adapter takes its I/O (HTTP `fetch`, clock, id generator) by injection — the whole suite is mock-tested with no network, GPU, or database. 141 tests, all offline.
- **Two front doors, one spine.** Each capability is exposed as an HTTP route (for humans and the Studio UI) and as an MCP tool (for agents and Claude Desktop).

---

## 2. Package graph

```
                              @forgecast/core
      (Project, Asset, Job · ImageProvider · VideoProvider · VoiceProvider
       PresenterProvider · MontageWorker · Transcriber · Publisher
       ProjectRepo / AssetRepo / JobRepo · StorageDriver
       JobHandler / JobRunner · ShortVideoWorker)
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
| `@forgecast/core` | Pure types + all contracts. No side effects. | — |
| `@forgecast/catalog` | Vendored, typed text-to-image model catalog | — |
| `@forgecast/providers` | All adapters: image (fal), video (fal/PixVerse), short-video (MoneyPrinter), TTS (fal), montage (Remotion), presenter (OmniHuman), publishing (Instagram/LinkedIn/YouTube/OmniSocials), transcription (WisprFlow), website fetcher | core |
| `@forgecast/store` | Repositories + storage: in-memory (dev), SQLite/FS (local durable), Cloudflare D1/R2 (edge) | core |
| `@forgecast/jobs` | `JobRunner` lifecycle + all `JobHandler`s | core, providers |
| `@forgecast/agent` | `ContentAgent`: LLM-driven content planning + execution + publishing | core |
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
  readonly platform: string;
  isAvailable(): boolean;
  publish(post: PublishPost): Promise<PublishResult>;
}

interface Transcriber {
  isAvailable(): boolean;
  transcribe(audio: TranscribeInput): Promise<string>;
}
```

`isAvailable()` powers **graceful degradation** — a provider missing its API key reports unavailable and is never offered, instead of crashing. Providers are selected by name from registries; the platform is unaware of which adapter is active.

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

Dependencies are injected (`LlmClient`, `ForgecastActions`, `TrendTool?`) so the agent is fully offline-testable. The web app exposes `POST /api/agent` (chat-style streaming) and the Studio has a chat panel to drive it.

---

## 7. The web app (`apps/web`)

- **Composition root** `lib/forgecast.ts` — `buildServices()` wires all providers, repos, storage, job handlers, and the runner based on environment. `getServices()` is the process singleton.
- **Route logic** `lib/api.ts` — pure `(services, input) → { status, body }` functions, unit-tested offline. Next.js route handlers are thin wrappers.
- **API surface:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness + configured providers |
| `GET/POST` | `/api/projects` | List / create projects |
| `POST` | `/api/projects/:id/generate` | Start image job |
| `POST` | `/api/projects/:id/generate-video` | Start video/short-video job |
| `POST` | `/api/projects/:id/generate-montage` | Start montage job |
| `GET` | `/api/jobs/:id` | Poll job status |
| `GET` | `/api/projects/:id/assets` | List assets |
| `GET` | `/api/assets/:id/raw` | Serve asset bytes |
| `POST` | `/api/agent` | Chat endpoint (ContentAgent) |
| `POST` | `/api/voice/vapi` | Vapi voice webhook |
| `POST` | `/api/transcribe` | Audio transcription |
| `POST` | `/api/billing/checkout` | Mollie checkout session |
| `POST` | `/api/billing/webhook` | Mollie payment webhook |
| `GET` | `/api/billing/status` | Pro entitlement check |

- **Studio UI** — "Molten Forge" aesthetic (Bricolage Grotesque + IBM Plex, warm-charcoal canvas, molten ember accents). Components: `Header`, `ForgePanel` (prompt + model picker + ratio + mode toggle), `JobStatus`, `Gallery` / `AssetCard`, `CampaignPanel`, `MontageBuilder`, `PublishPanel`, `AgentChat`, `Lightbox`.

---

## 8. The MCP server (`apps/mcp`)

A standalone process that wraps the spine HTTP API as MCP tools. Requires the Forgecast web app to be running. Tools: `forgecast_health`, `forgecast_list_projects`, `forgecast_create_project`, `forgecast_generate_image`, `forgecast_generate_short_video`, `forgecast_generate_video`, `forgecast_generate_montage`, `forgecast_get_job`, `forgecast_list_assets`, `forgecast_publish_asset`.

See [`apps/mcp/README.md`](../apps/mcp/README.md) for configuration.

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
- 141 tests, CI on Node 24 (GitHub Actions).
