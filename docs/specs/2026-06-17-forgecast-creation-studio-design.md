# Forgecast — v1 (Creation Studio) Design Spec

- **Date:** 2026-06-17
- **Status:** Draft — awaiting user review
- **Author:** Eshwar (Baxter Labs), with Claude Code
- **Milestone:** M1 of 4 (Creation Studio)

---

## 1. Overview

**Forgecast** is a self-hostable, open-source platform for generating images, short-form
videos, and (later) voice content — and eventually broadcasting it across social platforms
("forge it, cast it"). It is shipped as the author's own MIT-licensed GitHub project,
designed to be used and contributed to by others.

**The design philosophy ("the sweet spot"):** Forgecast is a *new, cohesive, branded
product we own* — not a fork and not docker-compose duct tape over three apps. We **reuse
the proven engines** from established MIT-licensed projects (as internal modules or isolated
worker services) instead of reimplementing them, and wrap them in one clean architecture
under one UI and one license.

This v1 (M1) delivers the **Creation Studio**: generate images and short videos, organize
them into projects, with every capability pluggable (cloud-default / local-optional). No
social posting yet — that is M2.

---

## 2. Goals & Non-Goals (v1)

### Goals
- One cohesive web app to generate **images** and **short-form videos**.
- Runs self-hosted via `git clone && docker compose up`, on a machine with **no GPU**
  (cloud adapters by default; users supply their own API keys).
- **Pluggable provider architecture** — image, video, script(LLM), voice(TTS),
  subtitles(ASR), and stock are all interfaces with swappable cloud/local adapters.
- **MCP tool surface scaffolded from day one** — every core action is exposed both as a
  web API (for the UI) and as MCP tools (for agents), so M2/M3 are unblocked without rework.
- Clean MIT/Apache licensing with a correct `NOTICE` file for all reused components.

### Non-Goals (deferred to later milestones)
- Social/cross-platform posting (M2).
- In-app AI agent ("describe it → it makes it") (M3).
- Long-form / agentic montage editing (M4).
- Multi-tenant SaaS, billing, team accounts (out of scope for the OSS core).
- Native local-model inference being *required* (local adapters are optional contributions).

---

## 3. Key Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Own MIT/Apache repo; reuse-not-rewrite** | Cohesive product we control + contributable OSS, without rebuilding proven pipelines. |
| 2 | **OpenMontage code is OUT** | It is AGPLv3; vendoring it would force the whole repo to AGPL. Its montage capability is rebuilt later (M4) from MoneyPrinter (MIT) + our existing Remotion — its composition engine is Remotion anyway. |
| 3 | **Pluggable providers; cloud default / local optional** | Runs anywhere with no GPU; local adapters (SD, Ollama, Piper, VibeVoice) become the natural contribution surface. Matches how the reused engines already work internally. |
| 4 | **MCP tool surface built from day one** | The platform exposes its actions as tools so both an in-app agent (M3) and external agents (Claude Code) can drive the exact same surface humans use. |
| 5 | **v1 = Creation Studio, both image + short-video, no posting** | Lowest-risk end-to-end create experience; avoids the social-API approval marathon in v1. |
| 6 | **VibeVoice = optional local voice + ASR adapters, labeled experimental** | MIT, but Microsoft states it is "for research only" — so it is never a default; Edge TTS remains the zero-GPU cloud default. |
| 7 | **AgentHarness = deferred (not infrastructure)** | It is a *benchmark harness* for one research model, not an agent runtime. Borrow its tool-wiring patterns (Serper/Jina/E2B) in M3; optionally offer Apodex-1.0 as a "research LLM" provider. |
| 8 | **Cloudflare + GCP deferred to M1.5; core stays cloud-agnostic** | v1 ships local/portable only. CF/GCP arrive as additive adapters + an optional deployment profile (powered by Baxter's credits), never a requirement. The v1 seams (S3-compatible storage, pluggable providers, containerized workers) make M1.5 zero-rework. See §12.1. |

---

## 4. Architecture

Forgecast is a layered system with **two interfaces over one spine**, driving **two
generation modules** through **pluggable provider adapters**, backed by Postgres + object
storage. (See the architecture diagram shared during design.)

```
Web UI (Next.js, humans) ─┐
                          ├─▶ Platform Spine (Core API · Job queue · Projects · Auth)
MCP Tool Surface (agents)─┘            │
                                       ▼
              ┌──────────────────────────────────────────────┐
              │  Image/Video Gateway        Short-Video Pipeline │
              │  (from Open-Gen-AI)         (MoneyPrinter worker) │
              └──────────────────────────────────────────────┘
                                       │
                          Pluggable Provider Adapters
            Cloud (default): image API · stock · Edge TTS · LLM
            Local (optional): SD · Ollama · Piper · VibeVoice (TTS+ASR)
                                       │
                  Postgres (metadata)  +  Object Store (assets/renders)
```

### 4.1 The two load-bearing ideas
1. **Dual interface over one spine.** Every action exists once as a web API (UI) and once
   as an MCP tool (agents). v1 builds both; v1 *uses* only the UI.
2. **Everything behind a provider interface.** No generation call is hard-wired to a vendor.

---

## 5. Reused Components & Integration Boundaries

*(Boundaries below are verified against repo structure via the GitHub API on 2026-06-17.
Exact symbol names should be re-confirmed on clone — see §15 verification checklist.)*

### 5.1 MoneyPrinterTurbo (MIT) → containerized FastAPI worker
- **Boundary:** run it **as its own container** (`workers/shorts/`); the Spine calls it over
  HTTP. **Never vendored**, so its heavy deps stay quarantined.
- **Surface we call:** `POST /videos` (create task from a params object) → `{ task_id }`;
  poll `GET /tasks/{task_id}` for progress + output path.
- **Internal orchestrator:** `app/services/task.py` runs all stages in order.
- **Confirmed pipeline modules** (`app/services/`): `llm.py` (script+terms),
  `material.py` (stock), `voice.py` (TTS+timing), `subtitle.py` (whisper/edge),
  `video.py` (MoviePy/FFmpeg compose), `task.py` (orchestrator), `state.py` (progress).
  Also present: `upload_post.py` — **a posting hook to mine in M2**.
- **Provider seams (where our cloud/local adapters plug in, inside the worker):**
  `llm.py` (LLM), `voice.py` (TTS), `material.py` (stock) — all config-string dispatchers.
- **Heavy deps to package:** FFmpeg (mandatory), ImageMagick (verify if still required for
  subtitle `TextClip`), optional `faster-whisper` model, bundled fonts.

### 5.2 Open-Generative-AI (MIT) → reuse gateway logic, build our own UI
- **Confirmed structure:** Next.js monorepo. Generation backend lives in **`app/api/`**
  (route handlers), model catalog in **`models_dump.json`**, UI in **`app/studio/`** +
  **`packages/studio/`**. Local inference engines (sd.cpp / Wan2GP) are **git submodules**
  (`packages/` references `Open-AI-Design-Agent`, `Open-Poe-AI`, `Vibe-Workflow`).
- **Boundary:** **reuse the model-gateway logic** (`app/api/` request dispatch + the
  `models_dump.json` catalog) and adapt it behind Forgecast's image/video provider
  interface. **Build Forgecast's own unified UI** (don't bolt on their whole app), while
  **cherry-picking components from `packages/studio`** where useful (MIT).
- **Cloud default:** the model gateway. **Local optional:** the submodule engines.
- **Open question (§15):** the upstream gateway defaults to the **Muapi.ai** paid gateway.
  For an OSS product we should not hard-tie users to one paid relay — abstract it and ship
  **1–2 simple cloud image adapters** (e.g. fal.ai or Replicate, pay-per-use, trivial keys),
  keeping Muapi as one option.

### 5.3 VibeVoice (MIT, "research-only" disclaimer) → optional local adapters
- **Voice (TTS):** `VibeVoice-TTS-1.5B` (expressive, ≤4 speakers, multilingual) or
  `Realtime-0.5B` (streaming ~300ms). The **GPU-powered premium** voice option.
- **Subtitles/transcription (ASR):** `VibeVoice-ASR-7B` (60-min, speaker IDs + timestamps)
  — an alternative to Whisper for the subtitle stage; reusable for reference-video analysis later.
- **Constraint:** never a default. Ship clearly labeled **experimental / local-only** with a
  responsible-use note. Edge TTS stays the cloud default.

---

## 6. Provider Interface

Each capability is a small interface with a uniform shape `(input) -> output` plus a
`capabilities()`/health probe. Adapters are registered by config (env + UI).

| Capability | Cloud default (v1) | Local optional (contribution surface) |
|------------|--------------------|---------------------------------------|
| **Image gen** | fal.ai (default, §15) · Replicate · Muapi | Stable Diffusion (sd.cpp / ComfyUI) |
| **Video gen** (text/img→video) ◇ | Muapi gateway models | local video models (WAN/Hunyuan) |
| **Script/copy (LLM)** | OpenAI / Anthropic / Gemini API | Ollama |
| **Voice (TTS)** | Edge TTS (free, no key) | Piper, **VibeVoice-TTS** |
| **Subtitles (ASR)** | Edge timestamps (no model) | faster-whisper, **VibeVoice-ASR** |
| **Stock footage** | Pexels / Pixabay | local media library |

**Selection rule:** a provider is chosen per-capability from config; the platform code is
unaware of which adapter is active. Missing credentials → that adapter is reported
unavailable, not a crash.

**◇ v1 generation-scope clarification:** v1 wires **image generation** through the gateway
and **short-form video** through the MoneyPrinter pipeline (§5.1). Standalone text→video
*model* generation (single AI clips via Kling/Veo/etc.) is **architecture-ready but a v1
stretch** — "video" in v1 primarily means the short-video pipeline, not single-clip model gen.

---

## 7. Tech Stack

- **Web UI + Spine:** Next.js (App Router) + TypeScript — one app for the UI and core API.
  (Matches the author's existing stack and Open-Gen-AI's.)
- **Heavy workers:** Python (FastAPI) — the MoneyPrinter-based short-video worker; later,
  optional local-model workers.
- **Queue:** Redis + a worker process (renders are long-running → async, with progress).
- **Data:** Postgres (projects/assets/jobs metadata).
- **Object storage:** S3-compatible; **MinIO** in the default local compose stack.
- **MCP server:** a thin TypeScript package wrapping the Spine API.
- **Orchestration:** a single `docker-compose.yml` wires web, shorts-worker, redis,
  postgres, minio.

---

## 8. Monorepo Layout

```
forgecast/
├─ apps/
│  ├─ web/             # Next.js UI + Spine API (+ MCP tool definitions)
│  └─ mcp/             # standalone MCP server (wraps the Spine API)
├─ workers/
│  └─ shorts/           # MoneyPrinter-based FastAPI video worker (containerized)
├─ packages/
│  ├─ providers/        # provider interfaces + cloud/local adapters
│  └─ core/             # shared types: Project, Asset, Job, provider contracts
├─ docker-compose.yml
├─ .env.example
├─ LICENSE              # MIT
└─ NOTICE               # third-party attributions (see §13)
```

---

## 9. Data Model (v1, minimal)

- **Project** — `id, name, created_at`. A container for related assets.
- **Asset** — `id, project_id, type (image|video|audio), provider, params(json),
  storage_key, status, created_at`. The output of a generation.
- **Job** — `id, project_id, kind (image|short_video), provider, params(json),
  status (queued|running|done|error), progress, result_asset_id, error, timestamps`.

Generation is always Job → (async) → Asset. The UI and MCP both create Jobs and read
status; they never block on the render.

---

## 10. Job / Queue Flow

1. UI or MCP calls Spine: "create image/short-video job" with params + chosen providers.
2. Spine writes a `Job(queued)`, enqueues to Redis, returns `job_id` immediately.
3. Worker picks up: image jobs run in-process via the provider adapter; short-video jobs are
   delegated to the shorts worker (`POST /videos`) and polled.
4. Progress is written to the Job; UI subscribes (poll or SSE).
5. On completion, output is stored in the object store and an `Asset` row is created.

---

## 11. MCP Tool Surface (scaffolded in v1)

Exposed by `apps/mcp`, wrapping the Spine API. v1 ships these tools (usable by Claude Code
immediately, even before the in-app agent exists):

- `list_projects`, `create_project`
- `generate_image(project_id, prompt, provider?, params?)` → job
- `generate_short_video(project_id, topic|script, aspect, provider?, params?)` → job
- `get_job(job_id)`, `list_assets(project_id)`
- `get_asset(asset_id)` (returns a download/preview URL)

M2 adds `publish_*` tools; M3 adds an orchestrating agent that *consumes* these tools.

---

## 12. Self-Hosting / Deployment

- **Primary story:** `git clone && cp .env.example .env && docker compose up`.
- Cloud adapters need only the user's own API keys in `.env` (or via the UI settings).
- GPU is **not** required for the default stack; local adapters document their own GPU needs.
- **Auth (v1):** single-tenant. Optional simple gate via an env-set password; multi-user is
  out of scope for the OSS core.

### 12.1 Cloud Deployment Profiles (Cloudflare + GCP) — designed-for in v1, implemented in M1.5

**Decision:** v1 ships **local/portable only** (no cloud-specific code). Cloudflare + GCP
support arrives in **M1.5** as additive adapters + a `profiles/` layer — **no core rework**,
because v1 already builds the enabling seams. The OSS core stays cloud-agnostic; CF/GCP are an
optional profile (powered by Baxter Labs' credits), never a requirement to self-host.

**Two profiles:**
- **`local`** (v1 default): MinIO + Redis + Postgres + free/BYO providers, no GPU.
- **`baxter-cloud`** (M1.5): Baxter's credits power a hosted instance.

**Credit → layer mapping (the M1.5 plan):**

| Layer | Cloudflare | GCP |
|-------|-----------|-----|
| Media storage + delivery | **R2** (S3-compatible, zero egress) + CDN | GCS (alt) |
| AI generation | Workers AI (cheap edge LLM/image) | **Vertex AI**: Imagen (image), Veo (video), Gemini (script), Cloud TTS (voice), Speech-to-Text/Chirp (subtitles) — *one integration covers ~5 provider slots* |
| Heavy / local-model workers (SD, VibeVoice, video) | — | **GPU** on Cloud Run / GKE / Compute Engine |
| Managed data | — | Cloud SQL (Postgres) + Memorystore (Redis) |
| Secure self-host exposure | **Cloudflare Tunnel** (no public IP/ports) | — |

**Enabling seams already built in v1 (so M1.5 is purely additive):**
1. Storage is an **S3-compatible interface** → R2 / GCS drop in by config.
2. Every capability is behind a **provider interface** → Vertex / Workers AI are new adapters.
3. The shorts worker (and future model workers) are **containerized HTTP services** → they run
   unchanged on GCP GPU compute.

**M1.5 open questions:** R2 vs GCS as the media default (*lean R2 for zero egress*); whether
the Vertex provider family becomes the `baxter-cloud` default (*lean yes — simplest + uses
credits*).

---

## 13. Licensing & Attribution

- **Forgecast license:** MIT (or Apache-2.0 — final pick at scaffold time; both satisfy the
  goals).
- **`NOTICE` must credit:**
  - MoneyPrinterTurbo — © harry0703 — MIT (run as a service; its LICENSE ships with it).
  - Open-Generative-AI — © Anil-matcha — MIT (gateway logic / catalog reused; preserve notice
    in any vendored files).
  - VibeVoice — © Microsoft — MIT, **with research-only usage disclaimer surfaced in-product**.
- **Excluded:** OpenMontage (AGPLv3) — no code used.
- **Runtime content licenses (not covered by the above), enforced/ documented per provider:**
  Pexels/Pixabay stock ToS; Edge TTS uses an unofficial endpoint (prefer licensed Azure/local
  for commercial use); bundled fonts/music from MoneyPrinter must be independently cleared or
  excluded.

---

## 14. v1 Acceptance Criteria

- `docker compose up` brings up web, shorts-worker, redis, postgres, minio with no GPU.
- A user can: create a project; generate an **image** (cloud adapter, own key); generate a
  **short video** (topic → script → stock → TTS → subtitles → MP4, 9:16 and 16:9); see both
  in the project library; download them.
- Providers are swappable via config; missing keys degrade gracefully (adapter shown
  unavailable, no crash). At least one local adapter is wired as a reference (may be optional).
- The MCP server exposes the §11 tools and can be driven by Claude Code end-to-end.
- `LICENSE` (MIT) and a correct `NOTICE` are present.

---

## 15. Risks, Open Questions & Verification Checklist

### Open questions (resolve during M1 planning; defaults noted)
- **Default cloud image provider:** recommend abstracting and shipping fal.ai *or* Replicate
  as the default (simple keys, pay-per-use), Muapi optional. *Default if undecided: fal.ai.*
- **Forgecast license:** MIT vs Apache-2.0. *Default: MIT.*
- **Subtitle default:** Edge timestamps (no model) vs faster-whisper. *Default: Edge
  timestamps for the zero-GPU path; Whisper/VibeVoice optional.*

### Risks
- MoneyPrinter packaging (FFmpeg + possible ImageMagick + fonts) is the heaviest part →
  mitigated by isolating it in its own container.
- Open-Gen-AI gateway is coupled to Muapi → mitigated by the provider interface + a second
  adapter.
- Edge TTS unofficial endpoint may rate-limit → documented; licensed/local alternatives exist.

### Verification checklist (run on first clone, before implementation)
```
git clone --depth 1 https://github.com/harry0703/MoneyPrinterTurbo /tmp/mpt
grep -rn "def start" /tmp/mpt/app/services/task.py        # orchestrator signature
grep -rn "class VideoParams" /tmp/mpt/app/models/schema.py # exact param fields
grep -rni "TextClip\|imagemagick\|magick" /tmp/mpt/app/    # is ImageMagick still required?
grep -rni "pexels\|pixabay\|coverr" /tmp/mpt/app/services/material.py
sed -n '1,5p' /tmp/mpt/LICENSE                             # confirm MIT + holder

git clone --depth 1 https://github.com/Anil-matcha/Open-Generative-AI /tmp/ogai
ls /tmp/ogai/app/api                                       # gateway route handlers
sed -n '1,40p' /tmp/ogai/models_dump.json                  # catalog shape
grep -rni "muapi" /tmp/ogai/app                            # gateway integration points
sed -n '1,5p' /tmp/ogai/LICENSE                            # confirm MIT + holder
```

---

## 16. Milestone Roadmap

- **M1 — Creation Studio** *(this spec)*: spine, image + short-video generation,
  projects/library, cloud provider adapters, MCP tool surface scaffolded, docker-compose.
- **M1.5 — Cloud deployment profiles:** add the `baxter-cloud` profile — Cloudflare R2 + CDN +
  Tunnel and GCP Vertex AI + GPU workers + Cloud SQL, on Baxter's credits. Additive only (§12.1).
- **M2 — Distribution:** pluggable publisher → omnisocials adapter first (fast), then native
  Instagram/Meta, LinkedIn, YouTube adapters + agent skills (the API-approval marathon).
  Mine MoneyPrinter's `upload_post.py` for patterns.
- **M3 — In-app Agent:** "describe it → it makes it," orchestrating the MCP tools. Borrow
  AgentHarness tool-wiring patterns; optional Apodex-1.0 research-LLM provider.
- **M4 — Montage:** longer-form video via Remotion + the MoneyPrinter pipeline (the
  OpenMontage capability, none of its AGPL code).

---

## 17. Units & Boundaries (for isolation/testability)

- **`packages/core`** — pure types/contracts (Project/Asset/Job + provider interfaces). No I/O.
- **`packages/providers`** — adapters implementing the contracts; each adapter is independently
  testable with a fake key/mock and has one job (talk to one backend).
- **`apps/web` Spine** — owns the data model + job lifecycle; depends on core + providers via
  interfaces only.
- **`workers/shorts`** — a black box behind an HTTP contract; replaceable without touching the
  Spine.
- **`apps/mcp`** — a thin translation of Spine API → MCP tools; no business logic of its own.

Each unit can be understood and changed without reading the others' internals, because they
communicate only through the typed contracts in `packages/core` and the HTTP boundary to the
worker.
```
