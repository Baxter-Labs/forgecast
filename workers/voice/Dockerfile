# VoxCPM-2 voice-over worker for Forgecast
# GPU is strongly recommended (NVIDIA runtime). To use the CUDA base instead,
# replace the FROM line with:
#   FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
# and ensure the host has the NVIDIA container runtime installed.
FROM python:3.11-slim

WORKDIR /app

# Install system packages needed by soundfile / numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

# The voxcpm package pulls in PyTorch + the VoxCPM-2 model weights (~2 GB)
# on first use (model downloads at container start-up, not build time).
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

# Create the output directory for synthesised WAV files
RUN mkdir -p out

EXPOSE 8770

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8770"]
