# forgecast-voice-worker

Open-source, self-hosted voice-over engine for Forgecast, powered by
**[VoxCPM-2](https://github.com/OpenBMB/VoxCPM)** (OpenBMB, Apache-2.0).

Running this worker lets Forgecast generate all voice-overs and narrations
locally — no cloud TTS subscription or per-character billing required.
When `VOXCPM_URL` is set, Forgecast prefers VoxCPM-2 over the cloud
fal TTS provider for every voice-over and presenter pipeline job.

---

## HTTP API contract

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tts` | Synthesise speech. Body: `{ "text": "...", "voice": "..." }` (voice optional). Returns `{ "audio_url": "<absolute URL>" }`. |
| `GET` | `/audio/:name` | Download a synthesised WAV file. |
| `GET` | `/health` | Liveness check → `{ "ok": true }`. |

### POST /tts

```json
// Request
{ "text": "Welcome to Forgecast.", "voice": "warm and calm female voice" }

// Response
{ "audio_url": "http://localhost:8770/audio/3f2a1b4c-....wav" }
```

The optional `voice` field is a natural-language description of the desired
speaker style — it maps directly to VoxCPM's voice-design prompt. Omit it to
use the model's default voice.

---

## Run with Docker

```bash
cd workers/voice
docker build -t forgecast-voice .
docker run -p 8770:8770 \
  -e VOXCPM_PUBLIC_URL=http://localhost:8770 \
  forgecast-voice
```

> **First-run note:** VoxCPM-2 downloads approximately 2 GB of model weights
> on the first synthesis request (or container start). Subsequent runs reuse
> the cached weights.

GPU is strongly recommended for real-time synthesis. To use a CUDA base image,
replace the `FROM` line in the `Dockerfile` with:
```
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
```
and ensure the host has the NVIDIA container runtime (`--gpus all`).

---

## Run locally (without Docker)

```bash
cd workers/voice
pip install -r requirements.txt
python server.py
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8770` | HTTP port the worker listens on. |
| `VOXCPM_PUBLIC_URL` | `http://localhost:8770` | Base URL used to construct `audio_url` values returned to Forgecast. Set this to the externally reachable address of the worker if it runs on a different host. |

---

## Connect Forgecast to the worker

Set `VOXCPM_URL` in `apps/web/.env` and restart the app:

```dotenv
# apps/web/.env
VOXCPM_URL=http://localhost:8770
```

Forgecast's `buildServices` function instantiates `VoxCpmVoiceProvider` first;
if `VOXCPM_URL` is set the provider reports `isAvailable() = true` and is used
for **all** voice-over and narrated-video jobs. If `VOXCPM_URL` is unset,
Forgecast falls back automatically to cloud fal TTS (requires `FAL_KEY`).

---

## Architecture

```
POST /tts
  → validate request
  → model.generate(text, voice_desc?)   # VoxCPM-2 inference
  → write 16-bit PCM WAV to out/<uuid>.wav
  → return { audio_url: "<VOXCPM_PUBLIC_URL>/audio/<uuid>.wav" }

GET /audio/<name>
  → stream out/<name> as audio/wav

Forgecast VoxCpmVoiceProvider
  → create()  POST /tts  → { taskId: audio_url }   (sync — no queue)
  → getTask() returns { state: "complete", audioUrl: taskId } immediately
```

VoxCPM synthesises audio synchronously, so there is no async queue to poll.
`create()` returns the finished audio URL as `taskId`; `getTask()` simply
reflects it back as `state: "complete"`.

---

## License

VoxCPM-2 is released by OpenBMB under the **Apache-2.0** licence.
See https://github.com/OpenBMB/VoxCPM for the model card and quickstart.
