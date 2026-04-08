#!/bin/bash
set -e

# ─── 1. Replace ElizaOS default client with custom Soliza frontend ───
echo "[ENTRYPOINT] Replacing ElizaOS client with Soliza frontend..."
CLIENT_PATH=$(find /app/node_modules/.pnpm -path "*/@elizaos/server/dist/client" -type d | head -1)

if [ -z "$CLIENT_PATH" ]; then
  echo "[ENTRYPOINT] WARNING: pnpm path not found, trying broader search..."
  CLIENT_PATH=$(find /app/node_modules -path "*/server/dist/client" -type d | head -1)
fi

if [ -n "$CLIENT_PATH" ] && [ -d "/app/frontend" ]; then
  echo "[ENTRYPOINT] Found client at: $CLIENT_PATH"
  rm -rf "$CLIENT_PATH"/*
  cp -r /app/frontend/* "$CLIENT_PATH"/
  echo "[ENTRYPOINT] Frontend replaced successfully"
else
  echo "[ENTRYPOINT] ERROR: Client path='$CLIENT_PATH' frontend exists=$([ -d /app/frontend ] && echo yes || echo no)"
fi

# ─── 2. Start ElizaOS ───
echo "[ENTRYPOINT] Starting ElizaOS..."
exec elizaos start --character ./characters/agent.character.json
