# Vite 8 requires Node >=22.12; Debian/glibc supports native better-sqlite3/sharp.
FROM node:22.22.1-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build && npm prune --omit=dev

FROM node:22.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production BLOG_DATA_DIR=/app/data PUBLISHING_API_ENABLED=false LEGACY_JWT_ENABLED=true SESSION_COOKIE_SECURE=true
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node admin ./admin
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data/uploads /app/data/logs /app/data/backups && chown -R node:node /app/data
USER node
EXPOSE 9098
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:9098/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
