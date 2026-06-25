<div align="center">

# Forgecast

### Speak it. Forge it. Cast it.

**An open-source, self-hosted content studio you _own_: generate images, video, voice-over and montages — driven by voice or a chat agent — and broadcast to Instagram, LinkedIn, and YouTube. Bring your own keys, swap any model, run it anywhere.**

[![CI](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml/badge.svg)](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml)

`MIT licensed` · `self-hosted` · `provider-agnostic — no lock-in` · `agent-native`

</div>

---

## What is Forgecast?

Forgecast is a **content studio you own** — not another hosted tool you rent. Describe what you want (by text or voice) and a planning agent reads your product, generates images and video, voices it over, stitches a montage, and publishes across platforms.

It's **MIT-licensed**, `git clone`-and-run, and built on a **provider-agnostic spine**: image, video, voice, montage, storage and publishing are all *swappable adapters*. No vendor, no model, and no cloud is hard-wired — run it on your laptop, your server, or the edge, with the open-source engines below or a cloud key when you want one.

> **Status:** the full pipeline — image, video, voice-over, montage, AI presenter, agent, publishing — is built and tested (260 tests, all offline). See [What's built](#whats-built) and the [BUILDLOG](BUILDLOG.md).

---

## Built on open-source engines

Forgecast stands on proven, permissively-licensed open-source projects, wrapped in one cohesive architecture it owns — deliberately avoiding copyleft entanglements so anyone can build on it:

| Engine | Used for | License |
|---|---|---|
| **[VoxCPM-2](https://github.com/OpenBMB/VoxCPM)** (OpenBMB) | **Self-hosted voice-over / TTS** — 30 languages, voice design + cloning, 48 kHz | Apache-2.0 |
| **[Remotion](https://github.com/remotion-dev/remotion)** | Longer-form montage render worker | (free for many uses) |
| **ffmpeg** | In-process montage + voice-over muxing — no Chromium needed | LGPL/GPL |
| **[MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)** | Short-form stock-footage video worker | MIT |
| **[Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI)** | The text-to-image model catalog metadata | MIT |
| **[MCP SDK](https://github.com/modelcontextprotocol)** | The agent-drivable tool surface | MIT |

**Voice-over is open-source by default.** Run [`workers/voice`](workers/voice/) (VoxCPM-2) and Forgecast uses it for all TTS, narrated video, and AI-presenter audio — no cloud TTS, no per-character bill. A cloud TTS (fal.ai) is only a *fallback* when you don't run the self-hosted engine.

Cloud model APIs (fal.ai for image/video) are optional providers behind the same interface — bring a key when you want them, swap in a local model when you don't.

---

## What's built

| Capability | Engine | Status |
|---|---|:--:|
| AI image generation | fal.ai (50+ models, model-agnostic) | ✅ |
| AI video — text→video & image→video | fal.ai (WAN, Veo 3.1, PixVerse, Kling, Seedance, Hailuo) | ✅ |
| Short-form video | MoneyPrinterTurbo worker (self-hosted) | ✅ |
| Montage stitching | Remotion worker **or** in-process ffmpeg | ✅ |
| **Voice-over / TTS** | **VoxCPM-2 (self-hosted, open-source)** · fal TTS fallback | ✅ |
| Narrated video (voice-over muxed onto a clip) | ffmpeg | ✅ |
| AI presenter / talking-head avatar | OmniHuman | ✅ |
| Tool-calling content agent | OpenAI function-calling — reads your website, decides b-roll vs presenter | ✅ |
| Voice input (talk into the agent) | Wispr Flow (+ browser-speech fallback) | ✅ |
| Trend intelligence | Agent-Reach | ✅ |
| Publishing | Instagram · LinkedIn · YouTube · OmniSocials | ✅ |
| Pro-tier billing | Mollie | ✅ |
| Agent-drivable tools | MCP server | ✅ |
| Durable storage | SQLite + filesystem (default) · Cloudflare D1 + R2 (optional) | ✅ |
| 260 tests, strict TypeScript, CI on Node 24 | | ✅ |

---

## Monorepo layout

```
forgecast/
├─ apps/
│  ├─ web/              # Next.js 16 Studio UI + spine HTTP API
│  └─ mcp/              # MCP server — agent-drivable tool surface
├─ packages/
│  ├─ core/             # pure types + contracts (no I/O)
│  ├─ providers/        # all adapters: image, video, TTS, montage, publish, presenter, transcribe
│  ├─ store/            # repositories + storage (in-memory, SQLite/FS, D1/R2)
│  ├─ jobs/             # JobRunner + all JobHandlers
│  ├─ catalog/          # typed image + video model catalogs
│  └─ agent/            # the tool-calling content agent
├─ workers/             # self-hosted, optional, language-agnostic services
│  ├─ voice/            # VoxCPM-2 voice-over (Python/FastAPI) — open-source TTS
│  ├─ montage/          # Remotion render service (Docker)
│  └─ shorts/           # MoneyPrinterTurbo setup (Docker)
├─ docs/                # architecture, deploy, integration setup guides
├─ LICENSE              # MIT
└─ NOTICE               # third-party attributions
```

---

## Architecture (the spine)

Two front doors over one dependency-inverted core:

```
  Humans ──▶ Studio UI (Next.js) ──┐
                                    ├──▶ Spine HTTP API ──▶ Job Engine ──▶ Provider Adapters
  Agents ──▶ MCP Server ───────────┤   (projects, assets,   (image | video |   ├─ VoxCPM-2 (voice-over, self-hosted)
  Voice  ──▶ Wispr / Vapi ─────────┘    jobs, voice,         short_video |      ├─ fal.ai (image, video, TTS fallback)
                                         agent, billing)      montage |          ├─ MoneyPrinterTurbo (shorts)
                                               │              voiceover |        ├─ Remotion / ffmpeg (montage)
                                        SQLite / D1           narrate |          ├─ OmniHuman (presenter)
                                        (metadata)            presenter)         └─ OmniSocials / IG / LI / YT
                                               │
                                        Filesystem / R2
                                        (asset bytes)
```

`@forgecast/core` defines all contracts (providers, repos, storage, job engine). Every other package implements a contract and depends inward. Adapters inject their I/O (`fetch`, clock, id-gen) so the entire suite is **mock-tested offline** — no keys, no GPU, no Docker needed to run `pnpm test`.

**Deep dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Quickstart

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io) ≥ 9.

```bash
git clone https://github.com/eshwarpk/forgecast.git
cd forgecast
pnpm install
pnpm test          # 260 tests, all offline
pnpm typecheck     # strict tsc across every package
```

**Run the Studio:**

```bash
cp apps/web/.env.example apps/web/.env   # fill in keys (see below)
pnpm -C apps/web dev                      # http://localhost:3210
```

Without any API keys the Studio starts and shows graceful "not configured" states. Add keys to unlock each capability — or run the self-hosted workers for the open-source path.

---

## Environment variables (`apps/web/.env`)

| Variable | Required for |
|---|---|
| `VOXCPM_URL` | **Self-hosted open-source voice-over (VoxCPM-2).** When set, it's preferred over cloud TTS. See [`workers/voice`](workers/voice/) |
| `FAL_KEY` | AI image generation (fal.ai) |
| `FAL_KEY_VIDEO` | AI video generation via fal.ai (falls back to `FAL_KEY`) |
| `FAL_KEY_VOICE` | Cloud TTS fallback when `VOXCPM_URL` is unset (falls back to `FAL_KEY`) |
| `OPENAI_API_KEY` | The tool-calling content agent |
| `FORGECAST_BASE_URL` | Public URL — needed for publishers and media URLs |
| `FORGECAST_DB` / `FORGECAST_DATA_DIR` | Durable local persistence (SQLite + filesystem; omit → in-memory) |
| `WISPRFLOW_API_KEY` | Voice input — talk into the agent (browser-speech fallback otherwise) |
| `OMNISOCIALS_API_KEY` | Publishing to 10+ platforms via OmniSocials |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_IG_USER_ID` | Native Instagram publishing |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR_URN` | Native LinkedIn publishing |
| `YOUTUBE_ACCESS_TOKEN` | Native YouTube publishing |
| `MOLLIE_API_KEY` | Mollie Pro-tier billing |
| `AGENT_REACH_ENABLED` / `AGENT_REACH_BIN` | Trend intelligence (Agent-Reach) |
| `FORGECAST_VIDEO_WORKER_URL` | MoneyPrinterTurbo short-video worker URL |
| `MONTAGE_WORKER_URL` | Remotion montage worker URL (omit → in-process ffmpeg) |

---

## Self-hosted workers (the open-source path)

Forgecast's job engine calls these workers over HTTP. The main app runs fine without them — the relevant job types return a clear 503 when a worker isn't configured.

### Voice-over (VoxCPM-2) — open-source TTS, no cloud

```bash
cd workers/voice
docker compose up --build         # or: pip install -r requirements.txt && python server.py
```

Then set `VOXCPM_URL=http://localhost:8770` and restart the app. Forgecast now uses self-hosted VoxCPM-2 for every voice-over, narrated video, and AI-presenter — no cloud TTS key needed. See [`workers/voice/README.md`](workers/voice/README.md).

### Short-form video (MoneyPrinterTurbo)

```bash
cd workers/shorts
git clone --depth 1 https://github.com/harry0703/MoneyPrinterTurbo moneyprinter
cp moneyprinter/config.example.toml config.toml   # add LLM + Pexels keys
docker compose up --build                          # FastAPI on :8080
```

Then set `FORGECAST_VIDEO_WORKER_URL=http://localhost:8080`.

### Montage (Remotion)

```bash
cd workers/montage
docker compose up --build   # HTTP render service
```

Then set `MONTAGE_WORKER_URL=http://localhost:3000`. (Or skip it — montages render in-process with the bundled ffmpeg by default.)

---

## MCP server (agent-drivable)

Expose Forgecast to Claude Desktop, Cursor, or any MCP client:

```json
{
  "mcpServers": {
    "forgecast": {
      "command": "npx",
      "args": ["tsx", "/path/to/forgecast/apps/mcp/src/index.ts"],
      "env": { "FORGECAST_API_URL": "http://localhost:3210" }
    }
  }
}
```

See [`apps/mcp/README.md`](apps/mcp/README.md) for the full tool list.

---

## Integration setup

- **Social publishing:** [`docs/social-setup.md`](docs/social-setup.md)
- **Voice input (Wispr):** [`apps/web/.env.example`](apps/web/.env.example)
- **Trend intelligence (Agent-Reach):** [`docs/agent-reach-setup.md`](docs/agent-reach-setup.md)
- **Optional edge deploy (Cloudflare):** [`docs/DEPLOY-CLOUDFLARE.md`](docs/DEPLOY-CLOUDFLARE.md) — R2 + D1 swap in behind the same storage interface; the open-source core never depends on it.

---

## Tech stack

**TypeScript** monorepo (pnpm workspaces, `strict` + `noUncheckedIndexedAccess`, Vitest) · **Next.js 16** (App Router) + **Tailwind v4** + **shadcn/ui** · **SQLite** (`node:sqlite`, zero extra deps) + **Filesystem** for durable local storage · **VoxCPM-2** (Python/FastAPI worker) for self-hosted voice · **Remotion** + **ffmpeg** for montage · **MoneyPrinterTurbo** for short-video · **MCP SDK** for the agent surface · optional **Cloudflare Workers** (OpenNext) + **D1** + **R2** for edge deployment.

---

## Contributing

The fastest way to contribute: add a **provider adapter**. Each is a small class implementing one interface in `@forgecast/core` — a local Stable Diffusion image provider, an Ollama LLM, a Piper or local-VoxCPM voice. Nothing upstream changes — the registry picks it up by name, and `isAvailable()` makes it degrade gracefully when unconfigured.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

---

## License

[MIT](LICENSE) © Baxter Labs. Generated content and provider usage are governed by each provider's own terms.
