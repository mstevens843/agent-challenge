# syntax=docker/dockerfile:1

FROM node:23-slim AS base

# Install system dependencies needed for native modules (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

# Disable telemetry
ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

# Install pnpm and bun (ElizaOS CLI requires bun runtime)
RUN npm install -g pnpm
RUN npm install -g bun

# Copy package manifest and install dependencies
COPY package.json ./
RUN pnpm install

# Copy all source files
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Replace default ElizaOS client with custom Soliza frontend
# pnpm stores packages in .pnpm/ — resolve the actual path and replace
COPY frontend/ /tmp/frontend/
RUN CLIENT_PATH=$(find /app/node_modules/.pnpm -path "*/@elizaos/server/dist/client" -type d | head -1) && \
    echo "Found client path: $CLIENT_PATH" && \
    rm -rf "$CLIENT_PATH"/* && \
    cp -r /tmp/frontend/* "$CLIENT_PATH"/ && \
    rm -rf /tmp/frontend

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVER_PORT=3000

CMD ["pnpm", "start"]
