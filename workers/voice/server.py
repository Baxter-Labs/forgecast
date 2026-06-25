"""
VoxCPM-2 voice-over worker for Forgecast.

Wraps the OpenBMB VoxCPM-2 model (Apache-2.0) in a small FastAPI service.
Forgecast talks to this worker via VoxCpmVoiceProvider:
    POST /tts  { "text": "...", "voice": "..." } -> { "audio_url": "..." }
    GET  /audio/{name}                           -> wav file stream
    GET  /health                                 -> { "ok": true }

Set VOXCPM_URL=http://<this-host>:8770 in apps/web and restart Forgecast;
it will then prefer VoxCPM-2 over cloud fal TTS for all voice-over work.
"""

from __future__ import annotations

import os
import uuid
import wave
import struct
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# VoxCPM-2 model loading
# ---------------------------------------------------------------------------
# TODO: Adjust these two lines if the VoxCPM import path changes.
# Quickstart reference: https://github.com/OpenBMB/VoxCPM#quickstart
# Expected API (v0.1):
#   from voxcpm import VoxCPM
#   model = VoxCPM.from_pretrained("openbmb/VoxCPM2")
#   wav, sample_rate = model.generate(text="Hello", voice_desc="warm and clear")
#
# If the library ships a different entry-point, update the import and the
# model.generate() call inside /tts below accordingly — the HTTP contract
# (request body, response shape, file-serving) does not need to change.
try:
    from voxcpm import VoxCPM  # type: ignore[import]
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2")
    _model_loaded = True
    logging.info("VoxCPM-2 model loaded.")
except Exception as exc:  # noqa: BLE001
    # Allows the server to start even if the model is not yet installed,
    # so the container can be probed at /health before synthesis is requested.
    logging.warning("VoxCPM-2 model not loaded (%s). /tts will return 503.", exc)
    model = None  # type: ignore[assignment]
    _model_loaded = False

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

PORT = int(os.environ.get("PORT", "8770"))
PUBLIC_BASE = os.environ.get("VOXCPM_PUBLIC_URL", f"http://localhost:{PORT}")

OUT_DIR = Path("out")
OUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="forgecast-voice-worker", version="1.0.0")

logger = logging.getLogger("voxcpm-worker")
logging.basicConfig(level=logging.INFO)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None


class TtsResponse(BaseModel):
    audio_url: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/tts", response_model=TtsResponse)
def synthesize(req: TtsRequest) -> TtsResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="VoxCPM-2 model not loaded. Check server logs.")

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text must be non-empty.")

    # TODO: Adjust the model.generate() call if VoxCPM's API changes.
    # Reference: https://github.com/OpenBMB/VoxCPM#quickstart
    # The `voice_desc` parameter accepts a natural-language description of the
    # desired speaker style (e.g. "warm and calm female voice"); it maps to
    # VoxCPM's voice-design prompt. Omit it when no voice is specified.
    try:
        if req.voice:
            wav_array, sample_rate = model.generate(text=req.text, voice_desc=req.voice)
        else:
            wav_array, sample_rate = model.generate(text=req.text)
    except Exception as exc:  # noqa: BLE001
        logger.exception("VoxCPM synthesis failed")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}") from exc

    # Write 16-bit PCM WAV to out/<uuid>.wav
    name = f"{uuid.uuid4()}.wav"
    out_path = OUT_DIR / name
    wav_int16 = (np.array(wav_array) * 32767).astype(np.int16)
    sf.write(str(out_path), wav_int16, sample_rate, subtype="PCM_16")

    audio_url = f"{PUBLIC_BASE}/audio/{name}"
    logger.info("Synthesised %s -> %s", name, audio_url)
    return TtsResponse(audio_url=audio_url)


@app.get("/audio/{name}")
def serve_audio(name: str) -> FileResponse:
    # Guard against path traversal
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    path = OUT_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(str(path), media_type="audio/wav")


# ---------------------------------------------------------------------------
# Entry-point for local dev: python server.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
