# Forgecast — Architecture (the spine)

This document is the bird's-eye view of *how Forgecast is built* and *why it's shaped this way*. The short version: **everything points inward to a set of pure contracts, so any concrete piece — a model provider, a database, a storage backend, a cloud — is a swappable adapter.** That is the entire design.

---

## 1. Principles

- **Dependency inversion.** `@forgecast/core` defines *interfaces* (contracts) and pure types with **zero I/O**. Every other package depends on those contracts, never the reverse. You can read and test any unit without reading the others.
- **Pluggable everything.** Generation, storage, persistence, and (soon) distribution are interfaces. The default implementations are *cloud* (run anywhere, no GPU) and *in-memory* (for dev/tests); production swaps in real backends behind the same interfaces with **no changes upstream**.
- **Offline-testable.** Every adapter takes its I/O (HTTP `fetch`, clock, id generator) by injection, so the whole system is unit-tested with mocks — no network, no GPU, no database required to run the suite.
- **Two interfaces, one spine.** Each capability is exposed as a web API (for humans) *and* an MCP tool (for agents).

---

## 2. Package graph

```
                         @forgecast/core
            (Project, Asset, Job · ImageProvider · ProjectRepo/AssetRepo/JobRepo
             · StorageDriver · JobHandler/JobRunner contracts · factories)
                    ▲             ▲              ▲
        ┌───────────┘             │              └─────────────┐
 @forgecast/providers      @forgecast/store            @forgecast/catalog
 ImageProviderRegistry     InMemory*Repo +             typed model list
 + FalImageProvider        InMemoryStorage             (51 t2i models)
        ▲                         ▲
        └────────────┬────────────┘
                @forgecast/jobs
         JobRunner (lifecycle) + ImageJobHandler
                     ▲
                  apps/web
        Next.js spine API + Image Studio UI
              (+ MCP surface — planned)
```

| Package | Responsibility | Depends on |
|---|---|---|
| `@forgecast/core` | Pure types + all contracts. No side effects. | — |
| `@forgecast/providers` | `ImageProviderRegistry` + the fal.ai adapter | core |
| `@forgecast/store` | In-memory repositories + storage (Postgres/MinIO next, same interfaces) | core |
| `@forgecast/catalog` | Vendored, typed text-to-image model catalog | — |
| `@forgecast/jobs` | `JobRunner` + `ImageJobHandler` | core, providers |
| `apps/web` | Composition root: spine API + Studio UI | all of the above |

---

## 3. The provider contract (the heart)

```ts
export interface ImageProvider {
  readonly name: string;
  isAvailable(): boolean;                                  // has creds/config?
  generateImage(input: GenerateImageInput): Promise<ImageResult>;
}
```

- `isAvailable()` powers **graceful degradation** — a provider with no API key is reported unavailable and never offered, instead of crashing.
- Providers are chosen by name from a registry; the platform is unaware of which adapter is active.
- **Cloud-default / local-optional:** the shipped adapter is `FalImageProvider` (cloud, BYO key). A local Stable Diffusion adapter is just another class implementing this interface — the canonical way to contribute (see `CONTRIBUTING.md`).

The same pattern will extend to `VideoProvider`, `TtsProvider`, `ScriptProvider`, `StockProvider`.

---

## 4. Data model & repositories

```ts
interface Project { id; name; createdAt }
interface Asset   { id; projectId; type; provider; params; storageKey; status; createdAt }
interface Job     { id; projectId; kind; provider; params; status; progress; resultAssetId?; error?; ... }
```

Persistence is behind interfaces — `ProjectRepo`, `AssetRepo`, `JobRepo` — implemented today by `InMemory*Repo` and (next milestone) by Postgres repos behind the **same** signatures. Generation is always **Job → (async) → Asset**; the UI and MCP both create Jobs and read status, never blocking on a render.

`StorageDriver` (`put` / `get` / `url`) abstracts object storage — `InMemoryStorage` for dev, S3/MinIO and Cloudflare R2 next.

---

## 5. The job engine

```ts
interface JobHandler { readonly kind: JobKind; run(job, report): Promise<JobOutcome> }
type ProgressReporter = (progress: number) => void | Promise<void>;
```

`JobRunner.run(jobId)`:

1. loads the job (unknown id → throws; unknown kind → marks the job `error`),
2. transitions it to `running` (progress 0),
3. invokes the matching `JobHandler`, persisting progress as it reports,
4. on success → `done` + `resultAssetId`; on throw → `error` with the message captured.

`ImageJobHandler` (kind `image`) is the first handler:

```
validate prompt → registry.get(provider).generateImage() → download bytes (injectable fetch)
→ StorageDriver.put() → AssetRepo.create() → return { assetId }
```

Today the runner executes in-process (image gen is fast). When durable queues arrive (Redis/Cloudflare Queues) for long renders like video, the **same `JobHandler` contract** runs behind the queue — the API shape (`create job → poll status`) doesn't change.

---

## 6. The web app (`apps/web`)

- **Composition root** `lib/forgecast.ts` — `buildServices()` wires the registry (+ fal), the in-memory store, the image handler, and the runner; `getServices()` is the process singleton. Everything is injectable (`falKey`, `fetchFn`) so the route logic is unit-tested offline.
- **Route logic** `lib/api.ts` — pure `(services, input) → { status, body }` functions, fully tested. The Next.js route handlers are thin wrappers.
- **API surface** — `POST/GET /api/projects`, `POST /api/projects/[id]/generate`, `GET /api/jobs/[id]`, `GET /api/projects/[id]/assets`, `GET /api/assets/[id]/raw` (serves bytes), `GET /api/health`.
- **Studio UI** — a "Molten Forge" aesthetic (Bricolage Grotesque + IBM Plex, warm-charcoal canvas, molten ember accents, grain/glow). Components: `Header`, `ForgePanel` (prompt · model picker from the catalog · ratio chips · Forge button), `JobStatus` (heat-bar + error card), `Gallery`/`AssetCard`, `EmptyState`. The `useForgecast` hook drives projects → generate → gallery.

### MCP surface (planned)

A thin `apps/mcp` package will wrap the same spine API as MCP tools (`create_project`, `generate_image`, `get_job`, `list_assets`, later `publish_*`), so external agents (Claude Code) and a future in-app agent drive the exact actions humans do.

---

## 7. Deployment profiles

The OSS core stays **cloud-agnostic**; clouds are opt-in profiles, never a requirement.

| Layer | `local` (default) | `baxter-cloud` (optional) |
|---|---|---|
| Storage | MinIO (S3-compatible) | Cloudflare **R2** (zero egress) ✅ |
| AI generation | BYO keys (fal, Edge TTS, …) | GCP **Vertex AI** (Imagen/Veo/Gemini/Cloud TTS) |
| Heavy/local-model workers | local | GCP **GPU** (Cloud Run / GKE) |
| Data | Postgres + Redis (containers) | Cloud SQL + Memorystore |
| Exposure | localhost | Cloudflare **Tunnel** |

Because storage is S3-compatible, providers are interfaces, and workers are containerized HTTP services, switching profiles is **configuration, not a rewrite**.

**Selecting a profile.** The composition root (`apps/web/lib/forgecast.ts`) reads `FORGECAST_PROFILE` (`local` default, or `baxter-cloud`). Under `baxter-cloud`, asset bytes are stored in Cloudflare R2 via `R2Storage` (`packages/store`, an S3-compatible `StorageDriver` that signs requests with AWS SigV4 — no SDK dependency), configured by `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (+ optional `R2_PUBLIC_BASE_URL` for CDN serving, `R2_ENDPOINT` override). If R2 is unconfigured it falls back to local storage with a warning. The GCP (Vertex/GPU/Cloud SQL) and Cloudflare Tunnel layers remain on the M1.5 roadmap.

---

## 8. Testing philosophy

- **TDD per change**, every commit green.
- **Strict TypeScript** (`strict` + `noUncheckedIndexedAccess`), enforced by `pnpm typecheck` over every package (no test escapes the type gate).
- **No network, no GPU, no DB in the suite** — adapters inject their I/O and are tested against mocks/in-memory implementations.

See the design history in [`docs/specs`](specs) and the phased build in [`docs/plans`](plans).
