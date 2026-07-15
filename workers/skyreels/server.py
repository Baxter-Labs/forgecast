"""
SkyReels-V2 video worker for Forgecast.

Wraps SkyworkAI's SkyReels-V2 (Skywork Community License — commercial use permitted)
in a small FastAPI service. SkyReels-V2 is a GPU-only open video model
(text-to-video, image-to-video, infinite-length) that CANNOT run on Cloudflare
Workers — run it on your own GPU and point Forgecast at it.

Forgecast talks to this worker via SkyReelsVideoProvider (async create -> poll):
    POST /generate   { "prompt": "...", "aspect_ratio": "9:16", "duration": 5, "image": "..." } -> { "task_id": "..." }
    GET  /tasks/{id}                                                                             -> { "state": "...", "video_url": "..." }
    GET  /files/{name}                                                                           -> mp4 stream
    GET  /health                                                                                  -> { "ok": true, "model_loaded": bool }

Enable it in Forgecast:
    SKYREELS_URL=http://<this-host>:8780      # makes 'skyreels' a selectable video provider
    FORGECAST_VIDEO_PROVIDER=skyreels         # (optional) make it the DEFAULT video provider
"""

from __future__ import annotations

import os
import uuid
import threading
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

PORT = int(os.environ.get("PORT", "8780"))
PUBLIC_BASE = os.environ.get("SKYREELS_PUBLIC_URL", f"http://localhost:{PORT}")
MODEL_ID = os.environ.get("SKYREELS_MODEL", "Skywork/SkyReels-V2-T2V-14B-540P")

OUT_DIR = Path("out")
OUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="forgecast-skyreels-worker", version="1.0.0")
logger = logging.getLogger("skyreels-worker")
logging.basicConfig(level=logging.INFO)

# task_id -> { "state": "processing"|"complete"|"failed", "video_url": str|None, "error": str|None }
_tasks: dict[str, dict] = {}
_tasks_lock = threading.Lock()

# Lazily-loaded pipeline singleton — loading pulls multi-GB weights and needs a GPU.
_pipe = None
_pipe_lock = threading.Lock()


def _load_pipe():
    """Load the SkyReels-V2 diffusers pipeline once.

    Adjust the import/class if the SkyReels-V2 diffusers API changes — see the repo
    README (diffusers integration): https://github.com/SkyworkAI/SkyReels-V2
    The HTTP contract below does not need to change.
    """
    global _pipe
    if _pipe is not None:
        return _pipe
    with _pipe_lock:
        if _pipe is not None:
            return _pipe
        import torch  # type: ignore[import]
        from diffusers import SkyReelsV2Pipeline  # type: ignore[import]
        logger.info("Loading SkyReels-V2 pipeline: %s", MODEL_ID)
        pipe = SkyReelsV2Pipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16)
        _pipe = pipe.to("cuda")
        return _pipe


class GenerateRequest(BaseModel):
    prompt: str
    aspect_ratio: Optional[str] = None
    duration: Optional[int] = None
    image: Optional[str] = None  # image-to-video source (URL or data URI)


class GenerateResponse(BaseModel):
    task_id: str


def _dims_for(aspect_ratio: Optional[str]) -> tuple[int, int]:
    # 540P presets; tune for your VRAM budget.
    if aspect_ratio == "9:16":
        return (544, 960)
    if aspect_ratio == "1:1":
        return (720, 720)
    return (960, 544)  # default 16:9


def _run(task_id: str, req: GenerateRequest) -> None:
    try:
        pipe = _load_pipe()
        from diffusers.utils import export_to_video  # type: ignore[import]
        width, height = _dims_for(req.aspect_ratio)
        num_frames = max(1, int((req.duration or 5) * 24))
        # TODO: for image-to-video, load req.image and hand it to the I2V pipeline.
        result = pipe(prompt=req.prompt, width=width, height=height, num_frames=num_frames)
        frames = result.frames[0]
        out_path = OUT_DIR / f"{task_id}.mp4"
        export_to_video(frames, str(out_path), fps=24)
        with _tasks_lock:
            _tasks[task_id] = {"state": "complete", "video_url": f"{PUBLIC_BASE}/files/{task_id}.mp4", "error": None}
        logger.info("SkyReels generated %s", out_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("SkyReels generation failed")
        with _tasks_lock:
            _tasks[task_id] = {"state": "failed", "video_url": None, "error": str(exc)}


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model_loaded": _pipe is not None}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt must be non-empty.")
    task_id = uuid.uuid4().hex
    with _tasks_lock:
        _tasks[task_id] = {"state": "processing", "video_url": None, "error": None}
    threading.Thread(target=_run, args=(task_id, req), daemon=True).start()
    return GenerateResponse(task_id=task_id)


@app.get("/tasks/{task_id}")
def get_task(task_id: str) -> dict:
    with _tasks_lock:
        task = _tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return {"state": task["state"], "video_url": task["video_url"], "error": task["error"]}


@app.get("/files/{name}")
def serve_file(name: str) -> FileResponse:
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    path = OUT_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(str(path), media_type="video/mp4")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
