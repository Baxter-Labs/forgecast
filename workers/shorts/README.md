# Short-Video Worker (MoneyPrinterTurbo)

Forgecast generates short-form videos by driving **[MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)** (MIT) as a separate worker over its HTTP API — its heavy dependencies (FFmpeg, ImageMagick, Whisper, fonts) stay quarantined in the worker container, and **no MoneyPrinter code is vendored** into Forgecast.

Forgecast speaks the worker's contract:
- `POST /api/v1/videos` (body: `{ "video_subject": "..." }`) → `{ data: { task_id } }`
- `GET /api/v1/tasks/{id}` → `{ data: { state, progress, combined_videos:[...] } }` (`state`: `1`=done, `-1`=failed, `4`=processing)
- the finished MP4 is fetched from the worker's `/tasks/...` URL

This is implemented in `@forgecast/providers` (`MoneyPrinterWorker`) and `@forgecast/jobs` (`ShortVideoJobHandler`) — both fully unit-tested with a mocked worker, so Forgecast's side needs no MoneyPrinter to develop or test against.

### What you can control (the best parts)

Forgecast exposes MoneyPrinterTurbo's standout features as a typed, vendor-neutral `options` object (mapped to its `VideoParams`): **aspect** (`9:16` vertical default / `16:9` / `1:1`), **burned-in styled captions** (`subtitles` + `subtitlePosition` / `fontSize` / `textColor` / `strokeColor`), **batch** (`count` 1–10), **clip length** (`clipDuration`), **stock source** (`pexels` / `pixabay` / `local`), **voice** (`voiceName` / `voiceVolume` / `voiceRate`), **background music** (`bgmType` / `bgmVolume`), your own **script** / search **terms**, **paragraphs** (1–10 script length), **transition**, and **concatMode**. All optional — omit any to keep the worker's defaults. Available via `POST /api/projects/:id/generate-video` and the `forgecast_generate_short_video` MCP tool.

## Run the worker

**Requirements:** Docker, plus an LLM for the script and a stock-footage source. **Every stage has a free path — see below.**

### 💸 Run it 100% free (no paid API)

Short videos can be generated end-to-end for free — you just supply the compute (the worker runs on your machine):

- **Script (LLM)** → point it at a local **[Ollama](https://github.com/ollama/ollama)** model (`llm_provider = "ollama"` in `config.toml`). Free, no key. (Any free-tier cloud LLM also works.)
- **Narration (TTS)** → **Edge-TTS** is the worker's **default**. Free, no key.
- **Footage** → a free **[Pexels](https://www.pexels.com/api/)** API key (free tier), **or** set the source to `local` (Forgecast: `options.source = "local"`) and use your own clips — **zero keys**.
- **Subtitles + rendering** → Whisper + FFmpeg run locally in the worker. Free.

So the only non-compute cost is an *optional* free Pexels signup. Pair it with Forgecast's free local agent (`FORGECAST_AGENT_LLM=ollama`) and self-hosted Stable Diffusion images (`SD_WEBUI_URL`), and the whole create stack runs with **no paid keys**.

```bash
cd workers/shorts

# 1. Clone MoneyPrinter into ./moneyprinter (gitignored — not vendored)
git clone --depth 1 https://github.com/harry0703/MoneyPrinterTurbo moneyprinter

# 2. Create config.toml from their example and configure it
cp moneyprinter/config.example.toml config.toml
#   Free path: set llm_provider = "ollama" (no key) and pexels_api_keys = ["<free key>"]
#   (or video_source = "local" for zero keys). Edge-TTS is already the free default.
#   Paid path: set any cloud LLM provider + its api key instead.

# 3. Build + run the API worker (FastAPI on :8080)
docker compose up --build
```

> **ImageMagick note:** MoneyPrinter's Dockerfile installs ImageMagick + FFmpeg for you. If you run it outside Docker, you may need to relax ImageMagick's `policy.xml` for text rendering (a known MoviePy footgun) — Docker avoids this.

## Connect Forgecast to it

Point Forgecast at the worker and restart it:

```dotenv
# apps/web/.env
FORGECAST_VIDEO_WORKER_URL=http://localhost:8080
```

Then `POST /api/projects/:id/generate-video` (body `{ "subject": "..." }`) creates a `short_video` job, Forgecast polls the worker until the MP4 is ready, downloads it, stores it, and records a **video** asset — retrievable at `/api/assets/:id/raw`. If `FORGECAST_VIDEO_WORKER_URL` is unset, the endpoint returns `503` (clearly: "short-video worker not configured").

## Notes

- The worker is not exercised by Forgecast's CI (it needs Docker + provider keys to actually render). The **integration** with it is fully tested via mocks; the **rendering** is MoneyPrinter's job.
- For production, run the worker on a host with FFmpeg-friendly resources; short videos take from tens of seconds to a few minutes, which is why Forgecast runs these jobs asynchronously and the client polls `GET /api/jobs/:id`.
- MoneyPrinterTurbo © harry0703, MIT — see the repository root `NOTICE`.
