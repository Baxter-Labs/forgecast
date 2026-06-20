FROM node:22-bookworm-slim

# Install Chromium runtime dependencies required by Remotion's headless renderer.
# Remotion downloads its own Chromium (Thorium) on first use — these are the
# shared libraries that binary needs to run on a minimal Debian image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libasound2 \
      libxss1 \
      libxtst6 \
      libgtk-3-0 \
      libx11-xcb1 \
      libxcb-dri3-0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      xdg-utils \
      ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["npx", "tsx", "src/server.ts"]
