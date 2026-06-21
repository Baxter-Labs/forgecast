<div align="center">

# Forgecast

### Speak it. Forge it. Cast it.

**A self-hosted, open-source content studio: generate images, video, and montages — driven by voice or a chat agent — and broadcast to Instagram, LinkedIn, and YouTube.**

[![CI](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml/badge.svg)](https://github.com/eshwarpk/forgecast/actions/workflows/ci.yml)

`MIT licensed` · `runs on any laptop (no GPU)` · `provider-agnostic` · `agent-native`

</div>

---

## What is Forgecast?

Forgecast is a **content studio you own**. Describe what you want — by text or voice — and a planning agent checks what's trending, generates images and video, stitches a montage, and publishes across platforms. Every step is a swappable adapter, and the whole system runs on **any machine with no GPU** (cloud-default, bring-your-own-keys).

It's MIT-licensed, `git clone`-and-run, and never locks you to one vendor or model.

> **Status:** full end-to-end pipeline — image, video, montage, voice, agent, publishing — is built and tested. See [What's built](#whats-built) and the [BUILDLOG](BUILDLOG.md).

---

## What's built

| Capability | Status |
|---|---|
| AI image generation (fal.ai) | ✅ |
| AI video generation (fal.ai Veo3.1, PixVerse) | ✅ |
| Short-form video via MoneyPrinterTurbo worker | ✅ |
| Montage stitching via Remotion worker | ✅ |
| Voice interface (Vapi webhook + WisprFlow transcription) | ✅ |
| TTS voiceover (fal.ai) | ✅ |
| AI presenter / avatar (OmniHuman) | ✅ |
| Content agent (LLM plan → generate → publish) | ✅ |
| Trend intelligence (Agent-Reach) | ✅ |
| Publishing: Instagram, LinkedIn, YouTube, OmniSocials | ✅ |
| Pro tier billing (Mollie) | ✅ |
| MCP server (agent-drivable tools) | ✅ |
| Durable storage: SQLite + filesystem, Cloudflare D1 + R2 | ✅ |
| Cloudflare Workers deployment (OpenNext) | ✅ |
| 141 tests, strict TypeScript, CI on Node 24 | ✅ |

---

## Monorepo layout

```
forgecast/
├─ apps/
│  ├─ web/              # Next.js 16 Studio UI + spine HTTP API
│  └─ mcp/              # MCP server — agent-drivable tool surface
├─ packages/
│  ├─ core/             # pure types + contracts (no I/O)
│  ├─ providers/        # all adapters: image, video, TTS, montage, publish, presenter
│  ├─ store/            # repositories + storage (in-memory, SQLite/FS, D1/R2)
│  ├─ jobs/             # JobRunner + all JobHandlers
│  ├─ catalog/          # typed text-to-image model catalog
│  └─ agent/            # ContentAgent: LLM plan + execute + publish
├─ workers/
│  ├─ montage/          # Remotion render service (Docker, for long montages)
│  └─ shorts/           # MoneyPrinterTurbo setup (Docker, for short-form video)
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
  Agents ──▶ MCP Server ───────────┘   (projects, assets,   (image | video |   ├─ fal.ai (image, video, TTS)
  Voice  ──▶ Vapi Webhook ─────────┘    jobs, voice,         short_video |      ├─ PixVerse (video)
                                         agent, billing)      montage |          ├─ MoneyPrinterTurbo (shorts)
                                               │              voiceover |        ├─ Remotion (montage)
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
pnpm test          # 141 tests, all offline
pnpm typecheck     # strict tsc across every package
```

**Run the Studio:**

```bash
cp apps/web/.env.example apps/web/.env   # fill in keys (see below)
pnpm -C apps/web dev                      # http://localhost:3210
```

Without any API keys the Studio starts and shows graceful "not configured" states. Add keys to unlock each capability.

---

## Environment variables (`apps/web/.env`)

| Variable | Required for |
|---|---|
| `FAL_KEY` | AI image generation (fal.ai) |
| `FAL_KEY_VIDEO` | AI video generation via fal.ai (falls back to `FAL_KEY`) |
| `PIXVERSE_API_KEY` | Video generation via PixVerse |
| `OPENAI_API_KEY` | Content agent (LLM planning) |
| `FORGECAST_BASE_URL` | Public URL — needed for publishers and media URLs |
| `FORGECAST_DATA_DIR` | Filesystem path for durable asset storage (omit → in-memory) |
| `OMNISOCIALS_API_KEY` | Publishing to 10+ platforms via OmniSocials |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_IG_USER_ID` | Native Instagram publishing |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR_URN` | Native LinkedIn publishing |
| `YOUTUBE_ACCESS_TOKEN` | Native YouTube publishing |
| `MOLLIE_API_KEY` | Mollie Pro-tier billing |
| `AGENT_REACH_ENABLED` / `AGENT_REACH_BIN` | Trend intelligence (Agent-Reach) |
| `FORGECAST_VIDEO_WORKER_URL` | MoneyPrinterTurbo short-video worker URL |
| `MONTAGE_WORKER_URL` | Remotion montage worker URL |

**Cloudflare deployment:** replace filesystem/SQLite with R2 + D1 — see [`docs/DEPLOY-CLOUDFLARE.md`](docs/DEPLOY-CLOUDFLARE.md).

---

## Optional workers (Docker)

Forgecast's job engine calls these workers over HTTP. The main app is fully functional without them — the relevant job types return a clear 503 when a worker isn't configured.

### Short-form video (MoneyPrinterTurbo)

```bash
cd workers/shorts
git clone --depth 1 https://github.com/harry0703/MoneyPrinterTurbo moneyprinter
cp moneyprinter/config.example.toml config.toml   # add LLM + Pexels keys
docker compose up --build                          # FastAPI on :8080
```

Then set `FORGECAST_VIDEO_WORKER_URL=http://localhost:8080` and restart the app.

### Montage (Remotion)

```bash
cd workers/montage
docker compose up --build   # HTTP render service on :3000
```

Then set `MONTAGE_WORKER_URL=http://localhost:3000`.

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
- **Voice (Vapi):** [`docs/vapi-setup.md`](docs/vapi-setup.md)
- **Trend intelligence (Agent-Reach):** [`docs/agent-reach-setup.md`](docs/agent-reach-setup.md)
- **Cloudflare deployment:** [`docs/DEPLOY-CLOUDFLARE.md`](docs/DEPLOY-CLOUDFLARE.md)

---

## Tech stack

**TypeScript** monorepo (pnpm workspaces, `strict` + `noUncheckedIndexedAccess`, Vitest) · **Next.js 16** (App Router) + **Tailwind v4** + **shadcn/ui** · **SQLite** (`node:sqlite`, zero extra deps) + **Filesystem** for durable local storage · **Cloudflare Workers** (OpenNext) + **D1** + **R2** for edge deployment · **MCP SDK** (`@modelcontextprotocol/sdk`) · **Remotion** montage worker · **MoneyPrinterTurbo** short-video worker · **Mollie** payments · **Vapi** voice.

---

## Contributing

The fastest way to contribute: add a **provider adapter**. Each is a small class implementing one interface in `@forgecast/core`. Nothing upstream changes — the registry picks it up by name, and `isAvailable()` makes it degrade gracefully when unconfigured.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

---

## License

[MIT](LICENSE) © Baxter Labs. Generated content and provider usage are governed by each provider's own terms.
