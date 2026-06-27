# syntax=docker/dockerfile:1

# --- production dependencies (compiles the better-sqlite3 native binding) -----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Build toolchain for native modules; lives only in this stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

# --- build stage: compile TypeScript ----------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime: slim image, no build tools ------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/clinic.db

COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Writable data dir for the SQLite file; owned by the unprivileged user so the
# mounted volume inherits that ownership.
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
