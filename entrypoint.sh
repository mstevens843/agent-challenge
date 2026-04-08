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
  ls "$CLIENT_PATH"/
else
  echo "[ENTRYPOINT] ERROR: Client path='$CLIENT_PATH' frontend exists=$([ -d /app/frontend ] && echo yes || echo no)"
fi

# ─── 2. Start Ollama ───
echo "[ENTRYPOINT] Starting Ollama daemon..."
ollama serve &

echo "[ENTRYPOINT] Waiting for Ollama..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[ENTRYPOINT] Ollama ready (${i}s)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "[ENTRYPOINT] WARNING: Ollama failed to start"
  fi
  sleep 1
done

# ─── 3. Check Nosana LLM endpoint ───
NOSANA_URL="${NOSANA_LLM_ENDPOINT:-https://6vq2bcqphcansrs9b88ztxfs88oqy7etah2ugudytv2x.node.k8s.prd.nos.ci/v1}"
echo "[ENTRYPOINT] Testing Nosana LLM: $NOSANA_URL/models"

NOSANA_OK=false
for attempt in 1 2 3; do
  if curl -sf --max-time 10 "$NOSANA_URL/models" > /dev/null 2>&1; then
    echo "[ENTRYPOINT] Nosana is ALIVE (attempt $attempt)"
    NOSANA_OK=true
    break
  fi
  echo "[ENTRYPOINT] Nosana attempt $attempt failed..."
  sleep 2
done

if [ "$NOSANA_OK" = true ]; then
  echo "[ENTRYPOINT] Using Nosana hosted LLM"
  export OPENAI_API_KEY="${NOSANA_API_KEY:-nos_k9__Rp0hnoBg9fIpYtWk-Ltt2gCdztdE0nscdsM4SEI}"
  export OPENAI_API_URL="$NOSANA_URL"
  export OPENAI_BASE_URL="$NOSANA_URL"
  export OPENAI_SMALL_MODEL="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
  export OPENAI_LARGE_MODEL="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
  export MODEL_NAME="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
else
  # ─── 4. Fallback: pull Ollama model and VERIFY it works ───
  echo "[ENTRYPOINT] Nosana unavailable — using local Ollama"
  MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
  echo "[ENTRYPOINT] Pulling model: $MODEL"
  ollama pull "$MODEL"
  echo "[ENTRYPOINT] Model pulled. Verifying it can respond..."

  for i in $(seq 1 12); do
    RESPONSE=$(curl -sf --max-time 30 http://localhost:11434/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":5}" 2>/dev/null)
    if [ -n "$RESPONSE" ]; then
      echo "[ENTRYPOINT] Model verified OK"
      break
    fi
    echo "[ENTRYPOINT] Waiting for model to load ($((i*10))s)..."
    sleep 10
  done

  export OPENAI_API_KEY="ollama"
  export OPENAI_API_URL="http://localhost:11434/v1"
  export OPENAI_BASE_URL="http://localhost:11434/v1"
  export OPENAI_SMALL_MODEL="$MODEL"
  export OPENAI_LARGE_MODEL="$MODEL"
  export MODEL_NAME="$MODEL"
fi

echo "[ENTRYPOINT] OPENAI_BASE_URL=$OPENAI_BASE_URL"
echo "[ENTRYPOINT] MODEL_NAME=$MODEL_NAME"
echo "[ENTRYPOINT] Starting ElizaOS..."
exec pnpm start
