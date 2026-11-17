# Rem Server — Express API + WebSocket party server.
# Deploys to Render/Railway/Fly as a long-running web service.
#
# Note: yt-dlp is REQUIRED at runtime (stream resolution, info, suggestions,
# search fallback), so the image ships the official standalone Linux binary.

FROM node:22-bookworm-slim

# yt-dlp standalone binary (self-contained, no Python required).
# "latest" is intentional: YouTube changes frequently and yt-dlp
# releases fixes almost weekly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && yt-dlp --version

# YouTube requires solving JS challenges (EJS). The standalone binary bundles
# the solver scripts, but needs a JS runtime enabled — Node 22 is in this image,
# and deno is the only runtime yt-dlp enables by default. Without this, every
# extraction fails with "Failed to extract any player response".
RUN printf -- '--js-runtimes node\n' > /etc/yt-dlp.conf

# The server declares "yt-client": "file:.." — keep the repo layout so npm resolves it.
WORKDIR /app
COPY package.json /app/package.json

WORKDIR /app/server

# Install deps (dev deps included — tsc is needed for the build step)
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Build TypeScript
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
