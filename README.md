<div align="center">

# 🔥 Forgecast

### Forge it, cast it.

**A self-hosted, open-source platform to generate images, video, and voice — and broadcast them everywhere.**

`MIT licensed` · `runs on any laptop (no GPU)` · `provider-agnostic` · `agent-native`

</div>

---

## What is Forgecast?

Forgecast is a **content forge you own**. Describe what you want, generate it (images now; short-form video and voice next), organize it into projects, and — soon — cast it across Instagram, LinkedIn, and YouTube from one place.

It's not another hosted AI tool you rent. It's a clean, MIT-licensed platform you `git clone && docker compose up`, that runs on **any machine with no GPU** (cloud-default, bring-your-own-keys) and that **never locks you to one vendor or one model**. Every capability is a swappable adapter.

Built by [Baxter Labs](https://baxter-labs.com). Reuses proven open-source engines (MoneyPrinterTurbo, Open-Generative-AI, VibeVoice) — but as one cohesive, owned product, free of copyleft entanglements.

> **Status:** early but real. The image pipeline works end-to-end — UI → API → async job engine → provider → storage → serving — and is live-tested. See [Roadmap](#roadmap).

---

## Why Forgecast is different

Most tools make you pick one compromise. Forgecast refuses the trade-offs:

|  | **Forgecast** | Hosted SaaS<br/>(Midjourney, Leonardo, Runway, Canva) | OSS image tools<br/>(ComfyUI, A1111, InvokeAI) | The source engines<br/>(MoneyPrinter, OpenMontage, Open-Gen-AI) |
|---|:---:|:---:|:---:|:---:|
| **Self-hosted, own your stack & outputs** | ✅ | ❌ rented | ✅ | ✅ / partial |
| **License** | **MIT** | proprietary | mixed (often GPL/AGPL) | MIT / AGPL / API-proxy |
| **Runs with NO GPU** | ✅ cloud-default | n/a (hosted) | ❌ needs GPU | varies |
| **Local models, optional** | ✅ contribution surface | ❌ | ✅ (only mode) | varies |
| **Provider-agnostic (no lock-in)** | ✅ | ❌ | SD-only | ❌ (e.g. Muapi proxy) |
| **Multi-modal: image → video → voice** | ✅ (roadmap) | partial | image-only | single-purpose |
| **Agent-native (MCP tool surface)** | ✅ day one | ❌ | ❌ | partial |
| **Create → cross-platform distribution** | ✅ (roadmap) | ❌ | ❌ | upload hook only |

### The five ideas that make it unique

1. **A provider-adapter spine.** Image, video, voice, script, stock, and storage are all *interfaces*. v1 ships **cloud adapters** (run anywhere, no GPU, BYO API keys); **local adapters** (Stable Diffusion, Ollama, Piper, VibeVoice) are the natural way to contribute. No vendor, no model, no cloud is hard-wired.
2. **Agent-native from day one.** Every action exists twice — as a web API for humans *and* as an **MCP tool surface** for agents. The same platform that powers the Studio UI can be driven by Claude Code or an in-app agent.
3. **Forge → Cast.** Generation and *distribution* are one story. The roadmap unifies "make the content" with "post it across platforms" — most tools stop at generation.
4. **Cloud-agnostic core, cloud-optional power.** `docker compose up` runs anywhere. Optional deployment profiles light up Cloudflare R2 + GCP Vertex/GPU for those who want them — *without* tying the open-source core to any cloud.
5. **Reuse, don't rewrite — and stay clean MIT.** Forgecast stands on proven OSS engines but wraps them in one architecture it owns, deliberately avoiding AGPL copyleft so anyone can build on it.

---

## The spine (architecture)

Two interfaces over one spine, driving generation modules through pluggable providers, backed by storage:

```
        Humans ─▶ Web UI (Studio) ─┐
                                   ├─▶  Platform Spine  ──▶  Job Engine ──▶  Provider Adapters
        Agents ─▶ MCP Tools ───────┘   (API · projects ·     (async, with     ├─ Cloud (default): fal · Pexels · Edge TTS · LLM APIs
                                        jobs · auth)           progress)        └─ Local (optional): SD · Ollama · Piper · VibeVoice
                                              │                                          │
                                     Postgres (metadata)  ◀────────────────────▶  Object Store (images/renders)
```

### Package graph (the build of the spine)

```
@forgecast/core      ← pure types + contracts (Project/Asset/Job, ImageProvider,
   ▲    ▲    ▲           repositories, StorageDriver, JobHandler). Zero I/O.
   │    │    │
providers store catalog   providers: ImageProviderRegistry + FalImageProvider
   ▲    ▲                  store:     in-memory repos + storage (Postgres/MinIO next)
   └─┬──┘                  catalog:   51 text-to-image models, typed
   jobs                 ← JobRunner (lifecycle) + ImageJobHandler (generate→download→store→asset)
     ▲
  apps/web            ← Next.js spine API + Image Studio UI (+ MCP surface, next)
```

Dependencies point **inward** to `core`'s contracts — so a new provider, a Postgres repo, or a MinIO storage driver drops in behind the *same* interface with zero changes to everything above it. That's the whole point.

**Read the deep dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the provider contract, the job lifecycle, the data model, how to add an adapter, and the cloud deployment profiles.

---

## What's built today

- ✅ **Typed core** — domain model + the pluggable-provider, repository, storage, and job contracts.
- ✅ **fal.ai image provider** — offline-tested adapter; graceful "unavailable" when no key.
- ✅ **In-memory data layer** — projects / assets / jobs repositories + object storage.
- ✅ **Async job engine** — `JobRunner` lifecycle + `ImageJobHandler` (generate → download → store → asset).
- ✅ **Model catalog** — 51 text-to-image models, parsed and typed.
- ✅ **Spine HTTP API** — projects, generate, jobs, assets, image-serving — live-verified.
- ✅ **Image Studio UI** — a distinctive "Molten Forge" front-end (prompt → model picker → ratio → forge → gallery), responsive, with graceful error states.
- 🔜 Postgres + MinIO + `docker-compose` + live `FAL_KEY` (so generations actually persist).
- 🔜 Short-form video (MoneyPrinter pipeline as a worker) · MCP surface · social posting · in-app agent.

**~49 tests, strict TypeScript, every commit a passing TDD cycle.**

---

## Monorepo layout

```
forgecast/
├─ apps/
│  └─ web/              # Next.js spine API + Image Studio UI (Tailwind + shadcn/ui)
├─ packages/
│  ├─ core/             # pure types + contracts (no I/O)
│  ├─ providers/        # ImageProviderRegistry + fal.ai adapter
│  ├─ store/            # in-memory repos + storage (Postgres/MinIO behind same interfaces next)
│  ├─ jobs/             # JobRunner + ImageJobHandler
│  └─ catalog/          # typed model catalog (51 t2i models)
├─ docs/                # specs, plans, architecture
├─ LICENSE              # MIT
└─ NOTICE               # third-party attributions
```

---

## Quickstart

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9. (No GPU needed.)

```bash
git clone https://github.com/eshwarpk/forgecast.git
cd forgecast
pnpm install
pnpm test          # run the full suite
```

**Run the Studio:**

```bash
cp .env.example .env          # add your FAL_KEY to forge real images (optional)
pnpm -C apps/web dev          # http://localhost:3210
```

Without a `FAL_KEY`, the Studio runs fine and shows a clear "set FAL_KEY" state — the whole pipeline executes, it just can't reach the provider. Add a [fal.ai](https://fal.ai) key to forge for real.

> Postgres/MinIO + a one-command `docker compose up` land in the next milestone; today the store is in-memory (data resets on restart).

---

## Roadmap

| Milestone | What it delivers | Status |
|---|---|---|
| **M1 · Creation Studio** | Image + short-video generation, projects/library, provider adapters, MCP-ready | 🚧 image path done; video + MCP next |
| **M1.5 · Cloud profiles** | Cloudflare R2 + GCP Vertex/GPU deployment profile (optional, on credits) | ⬜ |
| **M2 · Distribution** | Cross-platform posting — Instagram/Meta, LinkedIn, YouTube + agent skills | ⬜ |
| **M3 · Agent** | "Describe it → it makes it," orchestrating the MCP tools | ⬜ |
| **M4 · Montage** | Longer-form video (Remotion + pipeline) | ⬜ |

---

## Tech stack

**TypeScript** monorepo (pnpm workspaces, strict + `noUncheckedIndexedAccess`, Vitest) · **Next.js 16** (App Router) + **Tailwind v4** + **shadcn/ui** · Python (FastAPI) workers for heavy pipelines (coming) · Postgres + S3-compatible storage (MinIO) coming · an **MCP** server for the agent surface.

---

## Built on the shoulders of

Forgecast reuses logic and ideas from these MIT-licensed projects (see [`NOTICE`](NOTICE)):

- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — short-video pipeline (worker, next milestone)
- [Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) — the model catalog metadata
- [VibeVoice](https://github.com/microsoft/VibeVoice) — optional local voice/ASR (research-use advisory)

We deliberately **do not** vendor AGPL code, keeping Forgecast cleanly MIT.

---

## Contributing

The single best place to start: **add a provider adapter.** A local Stable Diffusion image provider, an Ollama LLM, a Piper TTS — each is a small class implementing one interface, with no changes needed elsewhere. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

[MIT](LICENSE) © Baxter Labs. Generated content and provider usage are governed by each provider's own terms.
