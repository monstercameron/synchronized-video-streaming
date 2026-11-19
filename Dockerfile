# syntax=docker/dockerfile:1
#
# The screening room as a container. Built by GitHub Actions (.github/workflows/docker.yml) and published to
# ghcr.io/monstercameron/synchronized-video-streaming. See deploy/DOCKER.md for running it on a droplet.

# ---- build ---------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# git does not keep empty folders, and the app has no static files of its own: make sure the folder exists for the copy below.
RUN mkdir -p public && npm run build

# ---- run -----------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS run
# ffprobe/ffmpeg: the library scan reads every video with ffprobe, and `npm run media:prepare` (ffmpeg) works inside the
# container too. This is the biggest part of the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    MEDIA_DIR=/data/media \
    SCREENING_DB_PATH=/data/screening.sqlite \
    NODE_OPTIONS="--max-old-space-size=160 --max-semi-space-size=2"

# The whole node_modules is kept (not pruned): next.config.ts is read at start-up, and this is the layout the app is tested in.
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/samples ./samples

# Videos and the database live in /data, which is a mounted folder (see compose.yaml), never inside the image.
RUN mkdir -p /data/media && chown -R node:node /data /app/.next
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"

CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
