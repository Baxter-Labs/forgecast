# forgecast-skyreels-worker

Optional, self-hosted **video** engine for Forgecast, powered by
**[SkyReels-V2](https://github.com/SkyworkAI/SkyReels-V2)** (SkyworkAI — Skywork
Community License, commercial use permitted). A **bring-your-own-GPU** alternative
to Forgecast's keyless Cloudflare Workers AI default and the cloud (fal / Replicate)
providers: no per-call API fee, you run the open model on your own hardware.

> **SkyReels-V2 is GPU-only.** It cannot run on Cloudflare Workers (or any
> serverless host) — it needs a real GPU (~15 GB+ VRAM for the 1.3B model, ~43-51 GB
> for the 14B). Run this worker on that GPU box and point Forgecast at it by URL.

---

## HTTP API contract

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Start a generation. Body: `{ "prompt": "...", "aspect_ratio": "9:16", "duration": 5, "image": "..." }` (all but `prompt` optional; `image` = image-to-video source). Returns `{ "task_id": "..." }`. |
| `GET` | `/tasks/:id` | Poll a task → `{ "state": "processing"｜"complete"｜"failed", "video_url": "...", "error": null }`. |
| `GET` | `/files/:name` | Download a generated mp4. |
| `GET` | `/health` | Liveness → `{ "ok": true, "model_loaded": bool }`. |

Generation is asynchronous: `/generate` returns immediately with a `task_id`; poll
`/tasks/:id` until `state` is `complete` (then fetch `video_url`) or `failed`.

---

## Run with Docker (GPU)

```bash
cd workers/skyreels
docker build -t forgecast-skyreels .
docker run --gpus all -p 8780:8780 \
  -e SKYREELS_PUBLIC_URL=http://<this-host>:8780 \
  -e SKYREELS_MODEL=Skywork/SkyReels-V2-T2V-14B-540P \
  forgecast-skyreels
```

> **First-run note:** SkyReels-V2 downloads multi-GB weights on the first
> generation request. Subsequent runs reuse the cache.

For lower VRAM, set `SKYREELS_MODEL=Skywork/SkyReels-V2-DF-1.3B-540P` (~15 GB).

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8780` | HTTP port the worker listens on. |
| `SKYREELS_PUBLIC_URL` | `http://localhost:8780` | Externally reachable base URL, used to build the `video_url` returned to Forgecast. Set this to the address Forgecast can reach. |
| `SKYREELS_MODEL` | `Skywork/SkyReels-V2-T2V-14B-540P` | HF model id / variant to load. |

---

## Connect Forgecast to the worker

Set `SKYREELS_URL` in `apps/web/.env` (or as a Worker secret) and restart Forgecast:

```dotenv
# apps/web/.env
SKYREELS_URL=http://<this-host>:8780
# Optional — make SkyReels the DEFAULT video provider (else keyless Cloudflare stays default):
FORGECAST_VIDEO_PROVIDER=skyreels
```

With `SKYREELS_URL` set, `skyreels` becomes a selectable video provider (visible in
`/api/health` and usable via `provider: "skyreels"`). With
`FORGECAST_VIDEO_PROVIDER=skyreels` it becomes the default. Otherwise Forgecast's
default video provider is the keyless **Cloudflare Workers AI** (a configured
BYO fal / Replicate key takes precedence over Cloudflare).

---

## Architecture

```
POST /generate
  → create task_id, spawn a background thread
  → SkyReelsV2Pipeline(prompt, width, height, num_frames)   # GPU inference
  → export_to_video(frames) → out/<task_id>.mp4
  → task = { state: "complete", video_url: "<SKYREELS_PUBLIC_URL>/files/<id>.mp4" }

GET /tasks/<id>  → the task's state (+ video_url when complete)
GET /files/<id>.mp4  → stream the mp4

Forgecast SkyReelsVideoProvider
  → create()  POST /generate  → { taskId }
  → getTask() GET /tasks/{taskId} → processing | complete(+videoUrl) | failed
```

The `server.py` model-loading block is intentionally thin — if the SkyReels-V2
diffusers entry-point differs from `SkyReelsV2Pipeline`, adjust the import and the
`pipe(...)` call; the HTTP contract stays the same.

---

## License

SkyReels-V2 is released by SkyworkAI under the **Skywork Community License**
(commercial use permitted, with an acceptable-use clause). Review
[`LICENSE.txt`](https://github.com/SkyworkAI/SkyReels-V2) before deploying. This
worker is a thin, unmodified HTTP wrapper — it does not redistribute the weights.
