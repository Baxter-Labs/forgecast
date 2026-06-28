<div align="center">

# 🔥 Forgecast

### Forge it, cast it.

**A self-hosted, open-source platform to generate images, video, and voice — and broadcast them everywhere.**

[![CI](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml/badge.svg)](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml)

`MIT licensed` · `self-hosted — own your stack` · `provider-agnostic — no lock-in` · `agent-native`

</div>

---

## What is Forgecast?

Forgecast is a **content forge you own**. Describe what you want — by text or voice — generate it (images, video, voice-over, montages, even an AI presenter), organize it into projects, and cast it across Instagram, LinkedIn, and YouTube from one place.

It's not another hosted AI tool you rent. It's a clean, MIT-licensed platform you `git clone` and run, that works on **any machine** (cloud-default, bring-your-own-keys — or self-host the open-source engines for zero per-use cost) and that **never locks you to one vendor or one model**. Every capability is a swappable adapter.

Built by [Baxter Labs](https://baxter-labs.com). Reuses proven open-source engines — **VoxCPM-2** (voice), **Remotion** + **ffmpeg** (montage), **MoneyPrinterTurbo** (short-form video), **Open-Generative-AI** (catalog) — wrapped as one cohesive, owned product, free of copyleft entanglements.

> **Status:** real and complete. The full pipeline — image, video (text→video & image→video), voice-over, narrated video, AI presenter, montage, platform-aware ad copy, a tool-calling agent, cross-platform publishing, and an ads measure→optimize loop (creative-fatigue diagnosis + account audit) — is built, tested, and live. **386 tests, strict TypeScript.**

---

## Why Forgecast is different

Most tools make you pick one compromise. Forgecast refuses the trade-offs:

|  | **Forgecast** | Hosted SaaS<br/>(Runway, Synthesia, Canva, Jasper) | OSS point tools<br/>(ComfyUI, A1111, InvokeAI) | The source engines<br/>(MoneyPrinter, Remotion, VoxCPM) |
|---|:---:|:---:|:---:|:---:|
| **Self-hosted, own your stack & outputs** | ✅ | ❌ rented | ✅ | ✅ / partial |
| **License** | **MIT** | proprietary | mixed (often GPL/AGPL) | MIT / Apache / single-purpose |
| **Runs anywhere (no GPU required)** | ✅ cloud-default | n/a (hosted) | ❌ needs GPU | varies |
| **Open-source self-hosted engines** | ✅ (voice, montage, shorts) | ❌ | ✅ (only mode) | ✅ each on its own |
| **Provider-agnostic (no lock-in)** | ✅ swap any model | ❌ | SD-only | ❌ single-purpose |
| **Multi-modal: image → video → voice → presenter** | ✅ | partial | image-only | single-purpose |
| **Agent-native (MCP tool surface)** | ✅ day one | ❌ | ❌ | ❌ |
| **Create → cross-platform distribution** | ✅ | ❌ | ❌ | upload hook only |

### The five ideas that make it unique

1. **A provider-adapter spine.** Image, video, voice, montage, presenter, publishing, and storage are all *interfaces*. Cloud adapters run anywhere with a key; **self-hosted open-source adapters** (VoxCPM-2 voice, Remotion/ffmpeg montage, MoneyPrinterTurbo shorts — and Stable Diffusion / Ollama / Piper as the contribution surface) are the way to own the whole stack. No vendor, no model, no cloud is hard-wired.
2. **Agent-native from day one.** Every action exists twice — as a web API for humans *and* as an **MCP tool surface** for agents. The same platform that powers the Studio UI is driven by a built-in tool-calling agent (or Claude Code, Cursor, any MCP client).
3. **Forge → Cast.** Generation and *distribution* are one story. Forgecast unifies "make the content" with "post it across platforms" — most tools stop at generation.
4. **Cloud-agnostic core, cloud-optional power.** It runs on your laptop or your server. Optional deployment profiles light up Cloudflare Workers + R2 + D1 for those who want the edge — *without* tying the open-source core to any cloud.
5. **Reuse, don't rewrite — and stay clean MIT.** Forgecast stands on proven OSS engines but wraps them in one architecture it owns, deliberately avoiding AGPL copyleft so anyone can build on it.

---

## The spine (architecture)

Two interfaces over one spine, driving generation modules through pluggable providers, backed by storage:

```
        Humans ─▶ Web UI (Studio) ─┐
                                   ├─▶  Platform Spine  ──▶  Job Engine ──▶  Provider Adapters
        Agents ─▶ MCP Tools ───────┤   (API · projects ·     (async, with     ├─ Self-hosted (open-source): VoxCPM-2 voice · Remotion/ffmpeg montage · MoneyPrinter shorts
        Voice  ─▶ Wispr / Vapi ────┘    jobs · agent · auth)   progress)        └─ Cloud (optional): fal (image/video/TTS) · OmniHuman (presenter) · OpenAI (agent) · IG/LI/YT
                                              │                                          │
                                  SQLite / D1 (metadata)  ◀──────────────────▶  Filesystem / R2 (asset bytes)
```

### Package graph (the build of the spine)

```
@forgecast/core      ← pure types + contracts (Project/Asset/Job, every Provider,
   ▲  ▲  ▲  ▲           repositories, StorageDriver, JobHandler). Zero I/O.
   │  │  │  │
providers store catalog agent   providers: image · video · voice · montage · presenter · publish · transcribe
   ▲  ▲                          store:     in-memory · SQLite+FS · Cloudflare D1+R2
   └┬─┘                          catalog:   typed image + video model catalogs
   jobs                          agent:     the tool-calling content agent
     ▲
  apps/web  +  apps/mcp   ← Next.js spine API + Studio UI   ·   MCP tool server
     ▲
  workers/  ← self-hosted services: voice (VoxCPM-2) · montage (Remotion) · shorts (MoneyPrinter)
```

Dependencies point **inward** to `core`'s contracts — so a new provider, a Postgres repo, or a local-model adapter drops in behind the *same* interface with zero changes to everything above it. That's the whole point.

**Read the deep dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the provider contract, the job lifecycle, the data model, how to add an adapter, and the deployment profiles.

---

## What's built today

- ✅ **Typed core** — domain model + the pluggable-provider, repository, storage, and job contracts. Zero I/O, fully mock-testable.
- ✅ **Image generation** — model-agnostic fal.ai adapter (50+ models); graceful "unavailable" when no key.
- ✅ **Asset Studio** — bring your own product: **upload** an image or clip, then **enhance/upscale** it, **edit** it from a text instruction, **cut out** the background to a transparent PNG, **animate** it to video (image→video), **compose** a montage from any selection, **narrate** any clip with a voice-over, and **download** the result. Every step works with just a fal key — no public URL (assets resolve to a `data:` URI when no `FORGECAST_BASE_URL` is set).
- ✅ **Video generation** — text→video **and** image→video, model-agnostic (WAN, Veo 3.1, PixVerse, Kling, Seedance, Hailuo).
- ✅ **Voice-over** — self-hosted **VoxCPM-2** (open-source, Apache-2.0); cloud fal TTS only as a fallback.
- ✅ **Narrated video** — voice-over muxed onto a clip via in-process ffmpeg. **AI presenter** — talking-head avatar (OmniHuman).
- ✅ **Montage** — in-process ffmpeg by default, or a Remotion render worker for longer pieces.
- ✅ **Tool-calling agent** — reads your product website, brainstorms, decides b-roll vs presenter, generates, and publishes.
- ✅ **Voice input** — talk into the agent (Wispr Flow, with a browser-speech fallback).
- ✅ **Publishing** — Instagram, LinkedIn, YouTube, OmniSocials. **Pro tier** billing (Mollie).
- ✅ **Ads measure→optimize loop** — audit ad performance (0–100 health score + grade, per-creative **creative-fatigue** diagnosis, recommendations), then **regenerate** fatigued creatives on-brand in one click — closing create → publish → measure → optimize. Works **keyless** on metrics you provide, or auto-pulls from Meta / Google Ads.
- ✅ **MCP server** — the whole platform as agent-drivable tools.
- ✅ **Durable storage** — SQLite + filesystem by default; Cloudflare D1 + R2 as an optional profile.
- ✅ **Studio UI** — a distinctive "Molten Forge" front-end, responsive, accessible, with graceful error states.

**386 tests, strict TypeScript, every commit a passing TDD cycle.**

---

## Models & generation — defaults, best, and how voice works

Forgecast is **model-agnostic** (every model is a swappable adapter), but it ships with sensible defaults and a clear "best" option you can opt into:

| Modality | Default | Best (opt-in) | Engine |
|---|---|---|---|
| **Image** | **`fal-ai/nano-banana`** (Google Gemini 2.5 Flash Image) — fast, low-cost, great | **`fal-ai/nano-banana-pro`** — state-of-the-art detail + text · FLUX.1 [dev]/[schnell] also in the picker | fal.ai text-to-image |
| **Video** | **`bytedance/seedance/v1.5/pro`** — best value, native audio (the Studio's standard) | **`fal-ai/veo3.1/fast`** — 4K + native audio (the **Boost Quality** toggle) · **Kling 3 Pro** for cinematic motion (premium) | fal.ai text→video **and** image→video |
| **Voice** | self-hosted **VoxCPM-2** (open-source, Apache-2.0) | cloud **fal TTS** (automatic fallback) | `VoiceProvider` |

> Image models come in two sizing families: **Nano Banana** uses an `aspect_ratio` enum, **FLUX** uses pixel `image_size` — Forgecast sends the right one per model, and the picked model now flows all the way to fal (it previously always fell back to FLUX schnell). The Studio's image picker is a **curated, fal-runnable** set; the full vendored open-model list stays available as `openImageModels`.

**How voice is generated.** Type a script in the Studio's **Voice** tab (or call `POST /api/projects/:id/generate-voiceover`). Forgecast runs it through the `VoiceProvider` — **VoxCPM-2** when `VOXCPM_URL` is set (self-hosted, zero per-use cost), otherwise cloud **fal TTS** — and produces a playable **audio asset**. You can cast it on its own, or **render** it onto a video clip as a narration (in-process ffmpeg mux). Voice generation is wired on **both** sides: the Studio UI (Voice tab + an in-gallery audio player) and the backend route/provider/job, plus the `narrate` flow for muxing voice onto a clip.

**Rendering.** The **Montage** tab is the renderer: it generates clips and stitches them into a finished video via **Remotion**, or **in-process ffmpeg** by default (no Chromium worker needed). Narrated-video rendering muxes a voice-over onto a clip the same way. Everything resolves to a downloadable asset.

**Short-form videos (MoneyPrinterTurbo).** Hand it a topic and the optional [`workers/shorts`](workers/shorts/) worker turns it into a finished vertical clip — LLM script → stock footage (Pexels/Pixabay) → TTS narration → **burned-in styled captions** → background music. Forgecast exposes the engine's best knobs as a typed `options` object: aspect (`9:16` default), captions on/off + style, **batch count**, clip length, voice, music, your own script/terms, and more — via `POST /api/projects/:id/generate-video` and the `forgecast_generate_short_video` MCP tool.

---

## Monorepo layout

```
forgecast/
├─ apps/
│  ├─ web/              # Next.js 16 Studio UI + spine HTTP API
│  └─ mcp/              # MCP server — agent-drivable tool surface
├─ packages/
│  ├─ core/             # pure types + contracts (no I/O)
│  ├─ providers/        # all adapters: image · video · voice · montage · presenter · publish · transcribe
│  ├─ store/            # repositories + storage (in-memory · SQLite/FS · Cloudflare D1/R2)
│  ├─ jobs/             # JobRunner + all JobHandlers
│  ├─ catalog/          # typed image + video model catalogs
│  └─ agent/            # the tool-calling content agent
├─ workers/             # self-hosted, optional, language-agnostic services
│  ├─ voice/            # VoxCPM-2 voice-over (Python/FastAPI) — open-source TTS
│  ├─ montage/          # Remotion render service (Docker)
│  └─ shorts/           # MoneyPrinterTurbo setup (Docker)
├─ docs/                # specs, plans, architecture
├─ LICENSE              # MIT
└─ NOTICE               # third-party attributions
```

---

## Quickstart

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9.

```bash
git clone https://github.com/eshwarpk/forgecast.git
cd forgecast
pnpm install
pnpm test          # 386 tests, all offline — no keys, no GPU, no Docker
pnpm typecheck     # strict tsc across every package
```

**Run the Studio:**

```bash
cp .env.example apps/web/.env.local        # add the keys you have (all optional)
pnpm -C apps/web dev                       # http://localhost:3210
```

Without any keys the Studio runs fine and shows clear "not configured" states — the whole pipeline executes, it just can't reach a provider. The next section is the wiring cheat sheet.

---

## Configure it — API keys (cheat sheet)

Every capability is a swappable adapter. **You set keys once, as server-side environment variables** — they live on the server and are never sent to the browser. Set only the ones you want; anything missing degrades to a clean "not configured" state in the UI. Locally they go in `apps/web/.env.local`; in the cloud they go in your host's secrets (see [Deploy](#deploy-to-the-cloud)).

### Generation — the core

| Env var | Unlocks | Where to get it | Need it? |
|---|---|---|---|
| `FAL_KEY` | Image generation + **Enhance / Edit / Cutout / Variations**, From-Website & Brand-Kit images | [fal.ai → keys](https://fal.ai/dashboard/keys) | **Start here** |
| `FAL_KEY_VIDEO` | Text→video, image→video (**Animate**), **AI presenter** | same fal.ai dashboard | for video |
| `VOXCPM_URL` | Self-hosted open-source **voice-over** (VoxCPM-2, preferred) | run [`workers/voice`](workers/voice/) | optional |
| `FAL_KEY_VOICE` | Cloud voice-over fallback (if you don't run VoxCPM) | fal.ai | optional |

### Agent brain — the PLAN / AUTO-RUN agent

| Env var | Unlocks | Where to get it | Need it? |
|---|---|---|---|
| `OPENAI_API_KEY` | The tool-calling agent (**default**) | [platform.openai.com](https://platform.openai.com/api-keys) | for the agent |
| `FORGECAST_AGENT_LLM=anthropic` + `ANTHROPIC_API_KEY` | Switch the agent to **Claude** | [console.anthropic.com](https://console.anthropic.com) | optional |

### Voice input & publishing

| Env var | Unlocks | Where to get it |
|---|---|---|
| `WISPRFLOW_API_KEY` | Talk into the agent (speech→text; browser-speech fallback otherwise) | [wisprflow.ai/developers](https://wisprflow.ai/developers) |
| `WEBHOOK_PUBLISH_URL` (+ `WEBHOOK_PUBLISH_SECRET`) | **Cross-post to any endpoint** — Zapier / Make / n8n / Slack / Discord / your backend (the easiest way to wire up publishing) | your automation tool |
| `OMNISOCIALS_API_KEY` | One key → 10+ platforms (the fast path to publish) | OmniSocials |
| `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_IG_USER_ID` | Instagram posting | Meta for Developers |
| `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_AUTHOR_URN` | LinkedIn posting | LinkedIn Developers |
| `YOUTUBE_ACCESS_TOKEN` | YouTube upload | Google Cloud Console |

### Make money & host

| Env var | Unlocks | Where to get it |
|---|---|---|
| `MOLLIE_API_KEY` | **Pro tier billing** — free/Pro gating, checkout, webhook | [mollie.com](https://www.mollie.com) |
| `FORGECAST_BASE_URL` | Public URL of your deployment (lets providers/the montage worker fetch your assets; without it Forgecast inlines bytes as data-URIs) | your domain |
| `FORGECAST_DB` + `FORGECAST_DATA_DIR` | Durable on-disk storage (SQLite metadata + filesystem bytes) | local paths / a mounted volume |
| `FORGECAST_PROFILE=baxter-cloud` + `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare **R2** asset storage + **D1** metadata at the edge | Cloudflare dashboard |
| `MONTAGE_WORKER_URL` / `FORGECAST_VIDEO_WORKER_URL` | Remotion render worker / MoneyPrinter short-video worker (else bundled ffmpeg) | [`workers/`](workers/) |

### 60-second wiring — copy-paste `.env.local`

```bash
# 1) minimum to make anything — images + enhance/edit/cutout/variations
FAL_KEY=...
# 2) add video — animate / text→video / AI presenter
FAL_KEY_VIDEO=...
# 3) add the agent (PLAN / AUTO-RUN)
OPENAI_API_KEY=...              # or: FORGECAST_AGENT_LLM=anthropic + ANTHROPIC_API_KEY=...
# 4) turn it into a business — Pro tier
MOLLIE_API_KEY=...
# 5) production essentials
FORGECAST_BASE_URL=https://your-domain.com
FORGECAST_DB=./.forgecast/forgecast.db
FORGECAST_DATA_DIR=./.forgecast/objects
```

> **Tip:** add `FAL_KEY` first and you've got the whole image studio (generate → enhance → edit → cutout → variations → brand-kit), working locally with no public URL.

---

## Deploy to the cloud

Forgecast is a standard **Next.js 16** app, so it runs anywhere Next runs. Two supported paths:

### A) Cloudflare Workers (built-in edge path) — recommended

OpenNext is already wired (`@opennextjs/cloudflare`). From `apps/web/`:

```bash
pnpm -C apps/web cf:preview     # build + preview on the real Workers runtime
pnpm -C apps/web cf:deploy      # build + deploy to your Cloudflare account
```

- **Keys** → store as Worker secrets: `wrangler secret put FAL_KEY` (repeat per key), or paste them in the Cloudflare dashboard.
- **Durable edge storage** → set `FORGECAST_PROFILE=baxter-cloud`, bind an **R2** bucket (the `R2_*` vars) and a **D1** database named `DB` in `wrangler.jsonc`. Without them, metadata is ephemeral in-memory — fine for a demo, not for production.
- Set **`FORGECAST_BASE_URL`** to your Worker's public URL so publishing and the montage worker can fetch generated assets.

### B) Any Node host (Vercel, Fly, a VPS, Docker)

```bash
pnpm -C apps/web build && pnpm -C apps/web start    # serves on :3000
```

Set the env vars in your host's dashboard. For durable storage, point `FORGECAST_DB` + `FORGECAST_DATA_DIR` at a mounted volume (don't use ephemeral container disk for production).

### ⚠️ Before you expose it publicly

Forgecast ships as a **single instance with one global key set and no built-in per-user auth** (intentional — see the next section). So **anyone who can reach the URL can generate, and every generation spends *your* API keys.**

- Private demo / internal tool / small team → deploy as-is, just keep the URL private.
- Public launch → put an auth layer in front first (Cloudflare Access, reverse-proxy basic-auth, or your own login) and set spend caps on your provider keys. The optional **Pro tier** (`MOLLIE_API_KEY`) gates *premium features*, not access itself.

---

## Ship it as a product — and make money

Forgecast is built to be **handed to non-technical users as a hosted website** — nobody edits code or env files but you.

- **You wire the keys once.** As the operator you set the keys (above) at deploy time. **Your users never see, enter, or touch a key or a line of code** — they just open the Studio, type a prompt or paste a URL, and create. Whatever you haven't configured simply shows a graceful "not configured" badge, so you light up exactly the capabilities you're paying for.
- **Monetize with the built-in Pro tier.** Set `MOLLIE_API_KEY` and the Studio gains a free/Pro split out of the box: a "GO PRO" call-to-action and Pro badge in the header, a Mollie checkout (`POST /api/billing/checkout`), entitlement status (`GET /api/billing/status`), and a payment webhook (`POST /api/billing/webhook`). Gate your premium features behind Pro and charge for it.
- **Resell the agent surface.** Every action also exists as an **MCP tool** ([`apps/mcp`](apps/mcp/)), so you can offer Forgecast as an agent-drivable API to other builders, not just a UI.
- **What's deliberately yours to add.** Forgecast ships as a single hosted instance with one global key set + a Pro gate — *not* a multi-tenant SaaS. Per-user accounts/auth, per-user API keys, and team workspaces are intentionally left out so they can be your differentiation layer. (The MIT license lets you build and sell all of it.)

---

## Roadmap

| Milestone | What it delivers | Status |
|---|---|---|
| **M1 · Creation Studio** | Image + video generation, projects/library, provider adapters, MCP | ✅ done |
| **M2 · Distribution** | Cross-platform posting — Instagram, LinkedIn, YouTube, OmniSocials | ✅ done |
| **M3 · Agent** | "Describe it → it makes it" — a tool-calling agent over the platform | ✅ done |
| **M4 · Montage + Voice** | Longer-form montage (Remotion/ffmpeg) + voice-over (VoxCPM-2) + AI presenter | ✅ done |
| **Next** | More self-hosted/local adapters (SD, Ollama, Piper), scheduling, analytics | 🔜 |

---

## Tech stack

**TypeScript** monorepo (pnpm workspaces, strict + `noUncheckedIndexedAccess`, Vitest) · **Next.js 16** (App Router) + **Tailwind v4** + **shadcn/ui** · **SQLite** (`node:sqlite`, zero extra deps) + filesystem for durable local storage · **VoxCPM-2** (Python/FastAPI worker) for self-hosted voice · **Remotion** + **ffmpeg** for montage · **MoneyPrinterTurbo** for short-video · an **MCP** server for the agent surface · optional **Cloudflare Workers** (OpenNext) + **D1** + **R2** for the edge.

---

## Built on the shoulders of

Forgecast reuses logic and ideas from these permissively-licensed projects (see [`NOTICE`](NOTICE)):

- [VoxCPM-2](https://github.com/OpenBMB/VoxCPM) — self-hosted open-source voice-over / TTS (Apache-2.0)
- [Remotion](https://github.com/remotion-dev/remotion) + **ffmpeg** — montage rendering and voice-over muxing
- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — short-video pipeline (worker)
- [Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) — the model catalog metadata
- [Model Context Protocol](https://github.com/modelcontextprotocol) — the agent-drivable tool surface

We deliberately **do not** vendor AGPL code, keeping Forgecast cleanly MIT.

---

## Contributing

The single best place to start: **add a provider adapter.** A local Stable Diffusion image provider, an Ollama LLM, a Piper or local-VoxCPM voice — each is a small class implementing one interface in `@forgecast/core`, with no changes needed elsewhere. The registry picks it up by name, and `isAvailable()` makes it degrade gracefully when unconfigured. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

[MIT](LICENSE) © Baxter Labs. Generated content and provider usage are governed by each provider's own terms.

---

## Demo

A scroll-stopping vertical social ad, forged end-to-end with Forgecast — generate → brand → cast:

<video src="https://github.com/eshwarpk/forgecast/raw/main/docs/media/forgecast-social-ad.mp4" controls muted loop width="320"></video>

> Player not loading in your viewer? [Watch the clip here.](docs/media/forgecast-social-ad.mp4)
