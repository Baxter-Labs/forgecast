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

> **Status:** real and complete. The full pipeline — image, video (text→video & image→video), voice-over, narrated video, AI presenter, montage, a tool-calling agent, and cross-platform publishing — is built, tested, and live. **260 tests, strict TypeScript.**

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
- ✅ **Video generation** — text→video **and** image→video, model-agnostic (WAN, Veo 3.1, PixVerse, Kling, Seedance, Hailuo).
- ✅ **Voice-over** — self-hosted **VoxCPM-2** (open-source, Apache-2.0); cloud fal TTS only as a fallback.
- ✅ **Narrated video** — voice-over muxed onto a clip via in-process ffmpeg. **AI presenter** — talking-head avatar (OmniHuman).
- ✅ **Montage** — in-process ffmpeg by default, or a Remotion render worker for longer pieces.
- ✅ **Tool-calling agent** — reads your product website, brainstorms, decides b-roll vs presenter, generates, and publishes.
- ✅ **Voice input** — talk into the agent (Wispr Flow, with a browser-speech fallback).
- ✅ **Publishing** — Instagram, LinkedIn, YouTube, OmniSocials. **Pro tier** billing (Mollie).
- ✅ **MCP server** — the whole platform as agent-drivable tools.
- ✅ **Durable storage** — SQLite + filesystem by default; Cloudflare D1 + R2 as an optional profile.
- ✅ **Studio UI** — a distinctive "Molten Forge" front-end, responsive, accessible, with graceful error states.

**260 tests, strict TypeScript, every commit a passing TDD cycle.**

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
pnpm test          # 260 tests, all offline — no keys, no GPU, no Docker
pnpm typecheck     # strict tsc across every package
```

**Run the Studio:**

```bash
cp apps/web/.env.example apps/web/.env    # add the keys you have (all optional)
pnpm -C apps/web dev                       # http://localhost:3210
```

Without any keys the Studio runs fine and shows clear "not configured" states — the whole pipeline executes, it just can't reach a provider. Add a [fal.ai](https://fal.ai) key for image/video, run [`workers/voice`](workers/voice/) (VoxCPM-2) for open-source voice-over, and an `OPENAI_API_KEY` for the agent. Set `FORGECAST_DB` + `FORGECAST_DATA_DIR` for durable on-disk storage.

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
