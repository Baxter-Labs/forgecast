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

**Requirements:** Docker, plus provider keys — an LLM (OpenAI / Gemini / DeepSeek / Moonshot / Ollama / …) for the script, and a stock source (a free [Pexels](https://www.pexels.com/api/) key). TTS uses free Edge-TTS by default.

```bash
cd workers/shorts

# 1. Clone MoneyPrinter into ./moneyprinter (gitignored — not vendored)
git clone --depth 1 https://github.com/harry0703/MoneyPrinterTurbo moneyprinter

# 2. Create config.toml from their example and add your keys
cp moneyprinter/config.example.toml config.toml
#   then edit config.toml: set an LLM provider + api key, and pexels_api_keys = ["..."]

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
