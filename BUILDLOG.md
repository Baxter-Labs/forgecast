# Forgecast — Build Log

> Built in public for **Megathon Amsterdam 2026**. Forgecast is an open-source, self-hostable, **agent-native** content studio: generate images + video → durable storage → stitch a montage → cast across platforms — driven by a chat/voice agent, and exposed as both a web app *and* an MCP tool surface.
>
> **Hero loop:** *speak it · forge it · cast it.* Talk to Forgecast → a planning agent checks what's trending, plans the content, generates it, stitches a montage, and casts it everywhere — with a Pro tier and a fully offline-testable core.

178 commits · 375 tests green · strict TypeScript · CI on Node 24. Repo: https://github.com/eshwarpk/forgecast

---

## Architecture in one paragraph

A pnpm/TypeScript monorepo. `@forgecast/core` holds **pure contracts** (providers, workers, repos, storage, jobs, publishers) and everything depends inward. Every integration is a thin **adapter** with injectable I/O (`fetch`, clock, id-gen) — so the whole system is **mock-tested offline** and "just needs a key to go live." Generation runs through a job engine (`image | short_video | video | montage`); persistence is Node's built-in `node:sqlite` + filesystem (zero Docker, zero new deps). Two front doors over the same spine: a Next.js Studio for humans and an MCP server (`forgecast_*` tools) for agents.

## Timeline

### Pre-hackathon — the foundation (Jun 17–19)
- **M1 Creation Studio** shipped: provider-adapter image generation (fal default), the job engine, durable SQLite+FS persistence, and the **Molten Forge** Studio UI.
- **MCP surface**: an agent-native tool layer (`forgecast_*`) over the spine HTTP API.
- **M2 Distribution (start)**: a pluggable `Publisher` contract + the omnisocials adapter (one integration → many platforms).
- README + ARCHITECTURE + CONTRIBUTING (an add-a-provider-adapter guide) + CI.

### Hackathon sprint (Jun 19–21) — every addition reuses a proven seam
- **Pixverse AI video** — a `VideoProvider` adapter + async `video` job + Studio toggle + `forgecast_generate_video` MCP tool.
- **The agent (`@forgecast/agent`)** — planning mode (LLM → a structured content plan) then execute (generate → store → cast). Surfaced as a `/api/agent` chat route and a Studio chat panel.
- **Agent-Reach trend intelligence** — a `trending(topic, platform)` tool the agent calls during planning.
- **Vapi voice** — webhook tools that drive the same plan→generate→cast flow by voice.
- **Mollie Pro tier** — hosted-checkout + webhook + entitlement; a premium gate and a real revenue path.
- **M4 Montage** (the capability most tools lack) — longer-form video via a Remotion render service + the MoneyPrinter-style render→poll→download→store pipeline; contract → provider → job → web/MCP → a standalone `workers/montage/` engine (deterministic timeline TDD'd, Chromium render at the event).
- **Studio UI v2** — Image/Video/Montage mode toggle, the agent chat panel ("speak it · forge it · cast it"), and a Pro badge — all in the Molten Forge aesthetic, verified live.
- **Montage-in-agent** — the planning agent can now request a `montage` directive and stitch its generated scenes into one longer-form video; the voice flow speaks it too.
- **Devin** → native IG/LinkedIn/YouTube publisher adapters (autonomous, commits in this repo — see `docs/devin/native-publishers.md`).

### Post-hackathon — depth & ownership (Jun 21–26) — same seams, more product
- **Open-source voice** — self-hosted **VoxCPM-2** `VoiceProvider` (Apache-2.0); cloud fal TTS demoted to a fallback. Voice-over muxed onto clips via in-process **ffmpeg**.
- **Talking-head presenter** — an OmniHuman `PresenterProvider` + job; the tool-calling agent (`ToolCallingAgent`, AUTO-RUN) decides b-roll vs. presenter per scene.
- **Model-agnostic video** — a curated fal text→video + image→video catalog (WAN, Veo, Kling, Seedance, Hailuo); montage now renders in-process by default (no Chromium worker required).
- **Asset Studio** — bring your own product: **upload → enhance/upscale → instruction-edit → background-cutout → animate (image→video) → compose → narrate → download**, all keyless-friendly (assets resolve to a `data:` URI without a public URL).
- **Website-grounded campaigns** — `read_website` tool + a "From Website" flow: URL → import + generate on-brand assets.
- **Brand Kit** — per-project identity (palette, fonts, tone, key messages) folded into every image/video/presenter prompt; seed it from a website.
- **Smart ad copy** — platform-aware, character-limited, A/B-tagged ad-copy generation (IG/LinkedIn/X/FB/TikTok/YouTube/Google RSA), wired into publish + MCP. *(inspired by NotFair)*
- **Ads measure → optimize loop** — audit ad performance (health score + **creative-fatigue** diagnosis + recommendations), then **regenerate fatigued creatives on-brand** — closing create → publish → measure → optimize. Keyless on provided metrics; auto-pulls from Meta / Google Ads. A Studio "Ad Performance" panel + 3 MCP tools. *(the NotFair-complement half)*
- **Agent LLM choice** — pluggable `LlmClient`: OpenAI default, **Claude (Anthropic) opt-in** — explicit, never auto-billed.

## Track stack (one build → many tracks)
Startup (Mollie revenue path) · Pixverse (creative product + a Pixverse-made video) · Vapi (voice-first interface) · Best Build with Devin (Devin commits) · Build-in-Public (this log + a public repo) · Wispr Flow (booth).

## Principles we held
- **Reuse proven engines, own a cohesive MIT repo** — not a fork, not docker-glue.
- **Dependency-inverted core** — adapters are swappable; the core never imports a vendor.
- **Agent-native from day one** — every capability is both a web action and an MCP tool.
- **Graceful degradation everywhere** — no key → a clean 503 / disabled control, never a crash.
- **TDD with injectable I/O** — green offline; a key flips it live.
