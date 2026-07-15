# SkyReels-V2 video worker for Forgecast — GPU REQUIRED (~15 GB+ VRAM for the small
# model; the 14B variant needs ~43-51 GB). Run with the NVIDIA container runtime:
#   docker run --gpus all -p 8780:8780 forgecast-skyreels
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# Weights (multi-GB) download on first generation, not at build time.
RUN pip3 install --no-cache-dir -r requirements.txt

COPY server.py ./
RUN mkdir -p out

EXPOSE 8780

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8780"]
