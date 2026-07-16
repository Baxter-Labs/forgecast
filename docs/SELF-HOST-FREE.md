# Self-hosting Forgecast for free — the complete zero-cost stack

Every capability in Forgecast has a genuinely free path when you run it yourself.
This guide is the map: what runs where, what hardware it needs, and the exact env
var that switches it on. No API keys are required for anything on this page.

## The stack at a glance

| Capability | Engine | Hardware floor | Turn on with |
|---|---|---|---|
| Images | Stable Diffusion WebUI (Automatic1111) | ~6 GB VRAM (or CPU, slow) | `SD_WEBUI_URL` |
| Voice-over | VoxCPM-2 (`workers/voice`) | 12 GB+ VRAM (CPU works, slow) | `VOXCPM_URL` |
| Video (open models) | SkyReels-V2 (`workers/skyreels`) | ~15 GB VRAM (1.3B @ 540p) | `SKYREELS_URL` |
| Video (6 GB-friendly alternative) | [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) — Wan 2.1/2.2, LTX, Hunyuan 1.5 | **6 GB VRAM** | see below |
| Video (no GPU at all) | stills-reels: camera-motion presets + captions + voiceover via `workers/montage` | any machine (Chromium) | `MONTAGE_WORKER_URL` |
| Captioned shorts | MoneyPrinterTurbo (`workers/shorts`) | CPU | `FORGECAST_VIDEO_WORKER_URL` |
| Agent brain | Ollama | CPU/GPU | `FORGECAST_AGENT_LLM=ollama` |
| Editing + render | timeline editor + bundled ffmpeg / Remotion | any machine | built in |

## No GPU? You still get video.

The **stills-reel pipeline is real video, free and unlimited on any machine**:
generate stills (SD WebUI or the keyless Cloudflare path), arrange them on the
timeline with captions, camera-motion presets (`zoom-in`, `crash-zoom`, `pan-left`,
`dutch`, `handheld`, …) and a voice-over track, then render:

```bash
cd workers/montage && pnpm install && pnpm dev   # Remotion render service on :8600
# then in the app env:
MONTAGE_WORKER_URL=http://localhost:8600
```

For open-model diffusion video without your own GPU, add a **free Hugging Face
token** (`HF_TOKEN`, huggingface.co/settings/tokens) — LTX-Video/Wan run on
ZeroGPU Spaces with a per-account daily quota. Self-hosters who own their IP can
instead set `HF_SPACES_ALLOW_ANON=1` (smaller anonymous quota, no account).

## Voice-over

**On the Cloudflare deploy nothing is needed** — MeloTTS runs keyless on the `AI`
binding (~9 free hours of audio/day). Self-hosting elsewhere:

- **VoxCPM-2** (best quality, voice descriptions): `cd workers/voice && docker
  compose up` on a 12 GB+ GPU box, then `VOXCPM_URL=http://that-box:8790`. CPU
  works for batch use. Any HTTP service speaking the same tiny contract —
  `POST /tts {text, voice?} → {audio_url}` — slots into `VOXCPM_URL` too, so you
  can wrap **Kokoro-82M** (Apache-2.0, 327 MB, faster-than-realtime on CPU) or
  Piper behind the same interface with a few lines of FastAPI.
- Off-Workers keyless: set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN`
  and MeloTTS runs over the REST API against the same free allowance.

## Open-model video on your GPU

- **SkyReels-V2** (`workers/skyreels`, Apache-2.0): `docker run --gpus all -p 8780`,
  then `SKYREELS_URL=http://that-box:8780` (optionally
  `FORGECAST_VIDEO_PROVIDER=skyreels`). ~15 GB VRAM for the 1.3B 540p model.
- **Wan2GP** is the recommended low-VRAM alternative (Wan 2.1/2.2, LTX-2, Hunyuan
  1.5 from **6 GB VRAM**, quantized): run it as a service and front it with the
  SkyReels worker contract (`POST /generate {prompt, aspect_ratio?, duration?,
  image?} → {task_id}`, `GET /tasks/{id} → {state, video_url}`) — the
  `SKYREELS_URL` adapter will drive it unchanged.

## Captioned shorts (MoneyPrinterTurbo)

```bash
cd workers/shorts && docker compose up      # FastAPI on :8080
# app env:
FORGECAST_VIDEO_WORKER_URL=http://localhost:8080
# free all the way down: Ollama for the script, Edge-TTS for narration,
# a free Pexels key (PEXELS_API_KEY) for footage.
```

## Licensing notes (for redistribution)

Apache-2.0 / MIT engines throughout the default stack: Wan, SkyReels-V2,
CogVideoX, MeloTTS, Kokoro-82M, VoxCPM. LTX-Video ships under the LTX open-weights
license (read it for commercial specifics); HunyuanVideo has commercial
restrictions — both are opt-in, never defaults. Edge-TTS (inside the shorts
worker) is an unofficial consumer endpoint — fine for personal self-hosting,
review Microsoft's terms before building a business on it.
