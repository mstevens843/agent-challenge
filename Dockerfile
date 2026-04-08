# syntax=docker/dockerfile:1

FROM node:23-slim AS base

# Install system dependencies needed for native modules (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  curl \
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

# Patch plugin-openai to use /v1/chat/completions instead of /v1/responses (vLLM doesn't support responses API)
RUN sed -i 's/createOpenAI({ apiKey: apiKey ?? "", baseURL })/createOpenAI({ apiKey: apiKey ?? "", baseURL, compatibility: "compatible" })/' $(find /app/node_modules/.pnpm -path "*plugin-openai*/dist/node/index.node.js" | head -1)

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
CMD ["pnpm", "start"]
