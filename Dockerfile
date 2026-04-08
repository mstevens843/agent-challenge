# syntax=docker/dockerfile:1

FROM node:23-slim AS base

# Install system dependencies needed for native modules (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  curl \
  zstd \
  && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Disable telemetry
ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

# Install pnpm and bun (ElizaOS CLI requires bun runtime)
RUN npm install -g pnpm
COPY --from=oven/bun:latest /usr/local/bin/bun /usr/local/bin/bun

# Copy package manifest and install dependencies
COPY package.json ./
RUN pnpm install

# Copy all source files
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Replace default ElizaOS client with custom Soliza frontend
COPY frontend/ /tmp/frontend/
RUN CLIENT_PATH=$(find /app/node_modules/.pnpm -path "*/@elizaos/server/dist/client" -type d | head -1) && \
    if [ -n "$CLIENT_PATH" ]; then \
      echo "Found client path: $CLIENT_PATH" && \
      rm -rf "$CLIENT_PATH"/* && \
      cp -r /tmp/frontend/* "$CLIENT_PATH"/ && \
      echo "Frontend replaced successfully"; \
    else \
      echo "WARNING: Client path not found"; \
    fi && \
    rm -rf /tmp/frontend

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

ENV NODE_ENV=production
ENV SERVER_PORT=3000
ENV OLLAMA_MODEL=qwen2.5:1.5b

ENTRYPOINT ["/app/entrypoint.sh"]
