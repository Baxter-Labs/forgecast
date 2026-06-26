# forgecast-mcp-server

An [MCP](https://modelcontextprotocol.io/) server that makes the whole Forgecast platform **agent-drivable**. Point any MCP client — **Claude Desktop, Claude Code, Cursor**, or any other — at it, and the agent can create projects, set a brand kit, generate images & video, turn a URL into ready-to-post assets, and **cross-post to your social channels** — all from chat, without touching the UI or the code.

It's a thin HTTP client over the Forgecast spine API: keys live on the **web app** side; this server just exposes the platform as tools.

---

## 1. Prerequisites — run the web app

The **Forgecast web app must be running** (it holds all the provider keys). By default it listens on `http://localhost:3210`; set `FORGECAST_API_URL` if it's elsewhere (e.g. your deployed Cloudflare/Vercel URL).

```bash
pnpm -C apps/web dev          # local, http://localhost:3210
# …or point the MCP server at your hosted instance via FORGECAST_API_URL
```

> For cross-posting and for providers to fetch your media, the web app should set `FORGECAST_BASE_URL` (its own public URL) and at least one publisher key (`OMNISOCIALS_API_KEY` is the fast path). See the repo [README → Configure](../../README.md#configure-it--api-keys-cheat-sheet).

---

## 2. Connect your agent

The server runs over stdio with `npx tsx`. Replace `/ABS/PATH/forgecast` with the absolute path to this repo on your machine.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "forgecast": {
      "command": "npx",
      "args": ["-y", "tsx", "/ABS/PATH/forgecast/apps/mcp/src/index.ts"],
      "env": { "FORGECAST_API_URL": "http://localhost:3210" }
    }
  }
}
```

Restart Claude Desktop — "forgecast" appears in the tools (🔌) menu.

### Claude Code

```bash
claude mcp add forgecast \
  -e FORGECAST_API_URL=http://localhost:3210 \
  -- npx -y tsx /ABS/PATH/forgecast/apps/mcp/src/index.ts
```

Then `claude mcp list` to confirm it's connected.

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) — same block as Claude Desktop above.

> Any MCP client works; they all take the same `command` / `args` / `env`. `tsx` is fetched by `npx -y`, so there's nothing to install globally.

---

## 3. Cross-post in three steps

A typical agent flow to create something and fan it out across your networks:

1. **Discover what's wired up** — `forgecast_health` → `publishers` lists the channels you can cross-post to (e.g. `["omnisocials","instagram","linkedin","youtube"]`) and `providers` lists what you can generate.
2. **Make or pick an asset** — generate one (`forgecast_generate_image` / `forgecast_generate_video` / `forgecast_generate_from_website`) or list existing ones with `forgecast_list_assets`.
3. **Write the caption** *(optional)* — `forgecast_generate_ad_copy({ project_id, brief, platform })` returns A/B-tagged variants that fit the platform's character limit. Pick one and use its `text` as the `content` below.
4. **Cross-post it** — `forgecast_publish_asset({ asset_id, content, channels })`, passing the channel names from step 1 to fan one post out across all of them at once.

> Example prompt to your agent: *"Set the brand kit from acme.com, generate a launch image, then cross-post it to Instagram and LinkedIn with a punchy caption."*

### …or hand off the whole job

Instead of orchestrating the granular tools, delegate to **Forgecast's own agent**:

- `forgecast_agent_plan(brief, platforms)` → a reviewable campaign plan (it researches a URL in the brief).
- `forgecast_agent_execute(plan, …, publish)` → produces the plan's assets and (with `publish: true`) cross-posts them.
- `forgecast_agent_run(brief, …)` → the autonomous one-shot: brainstorm **and** produce in a single call.

These need an LLM key on the web app (`OPENAI_API_KEY`, or `FORGECAST_AGENT_LLM=anthropic` + `ANTHROPIC_API_KEY`).

---

## Tools

| Tool | Description |
|------|-------------|
| `forgecast_health` | Reachability + what's configured: `providers` (image/video/montage/voice/transcribe/presenter) and **`publishers`** (cross-post channels). Call first. |
| `forgecast_list_projects` / `forgecast_create_project` | List / create projects |
| `forgecast_get_brand_kit` / `forgecast_set_brand_kit` | Read / set the project **brand kit** — grounds every generation on-brand |
| `forgecast_brand_kit_from_website` | Seed the brand kit from a brand's website |
| `forgecast_generate_image` | Generate an image (sync; returns asset + URL) |
| `forgecast_generate_video` / `forgecast_generate_short_video` | Start a video / short-video job (async → poll `forgecast_get_job`) |
| `forgecast_generate_montage` | Stitch a project's assets into a montage (async) |
| `forgecast_generate_from_website` | URL → assets: import product images + generate on-brand images + enhance |
| `forgecast_enhance_image` / `forgecast_edit_image` / `forgecast_cutout_image` | Upscale / instruction-edit / background-remove an image |
| `forgecast_narrate_video` | Add an AI voice-over to a video (async) |
| `forgecast_list_assets` | List a project's assets, each with a direct media URL |
| `forgecast_get_job` | Poll any async job by id |
| `forgecast_generate_ad_copy` | **Write the caption:** N on-brand, A/B-tagged ad-copy variants that fit the platform's char limit (IG/LinkedIn/X/FB/TikTok/YouTube/Google RSA) |
| `forgecast_publish_asset` | **Publish / cross-post** an asset's media + caption to one or more channels at once |
| `forgecast_agent_plan` | **Agent — Plan:** brief → a reviewable campaign plan (researches a URL in the brief) |
| `forgecast_agent_execute` | **Agent — Execute:** produce a plan's assets and (with `publish`) cross-post them |
| `forgecast_agent_run` | **Agent — Auto-run:** brief → brainstorm **and** produce in one shot |
| `forgecast_ads_audit` | **Measure:** audit ad performance → health score + grade, per-creative **fatigue** diagnosis, recommendations (keyless via `metrics`, or auto-pull `source` meta/google) |
| `forgecast_ads_insights` | Pull normalized per-creative/day ad metrics from a connected account, or echo provided `metrics` |

Every tool returns structured JSON; async ones return a job to poll with `forgecast_get_job`. The three agent tools need an LLM key on the web app.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGECAST_API_URL` | `http://localhost:3210` | Base URL of the Forgecast spine API (local or your hosted instance) |

All provider and publisher keys (`FAL_KEY`, `OMNISOCIALS_API_KEY`, social tokens, etc.) are set on the **web app**, not here — the MCP server is a thin HTTP client.
