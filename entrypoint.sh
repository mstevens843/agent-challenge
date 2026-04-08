#!/bin/bash
set -e

# ─── Start Ollama in background (always, as fallback) ───
echo "[ENTRYPOINT] Starting Ollama daemon..."
ollama serve &

# Wait for Ollama to be ready (up to 30s)
echo "[ENTRYPOINT] Waiting for Ollama..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[ENTRYPOINT] Ollama ready (${i}s)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "[ENTRYPOINT] WARNING: Ollama failed to start after 30s"
  fi
  sleep 1
done

# ─── Check if Nosana LLM endpoint is available ───
NOSANA_URL="${NOSANA_LLM_ENDPOINT:-https://6vq2bcqphcansrs9b88ztxfs88oqy7etah2ugudytv2x.node.k8s.prd.nos.ci/v1}"
echo "[ENTRYPOINT] Testing Nosana LLM endpoint: $NOSANA_URL/models"

NOSANA_OK=false
for attempt in 1 2 3; do
  if curl -sf --max-time 10 "$NOSANA_URL/models" > /dev/null 2>&1; then
    echo "[ENTRYPOINT] Nosana endpoint is ALIVE (attempt $attempt)"
    NOSANA_OK=true
    break
  fi
  echo "[ENTRYPOINT] Nosana endpoint attempt $attempt failed, retrying..."
  sleep 2
done

if [ "$NOSANA_OK" = true ]; then
  # ─── Use Nosana hosted endpoint (better for judging) ───
  echo "[ENTRYPOINT] Using Nosana hosted LLM endpoint"
  export OPENAI_API_KEY="${NOSANA_API_KEY:-nos_k9__Rp0hnoBg9fIpYtWk-Ltt2gCdztdE0nscdsM4SEI}"
  export OPENAI_API_URL="$NOSANA_URL"
  export OPENAI_BASE_URL="$NOSANA_URL"
  export OPENAI_SMALL_MODEL="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
  export OPENAI_LARGE_MODEL="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
  export MODEL_NAME="${NOSANA_MODEL:-Qwen3.5-27B-AWQ-4bit}"
else
  # ─── Fallback to local Ollama ───
  echo "[ENTRYPOINT] Nosana endpoint unavailable — falling back to local Ollama"
  MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"
  echo "[ENTRYPOINT] Pulling model: $MODEL"
  ollama pull "$MODEL"
  echo "[ENTRYPOINT] Model $MODEL ready"

  export OPENAI_API_KEY="ollama"
  export OPENAI_API_URL="http://localhost:11434/v1"
  export OPENAI_BASE_URL="http://localhost:11434/v1"
  export OPENAI_SMALL_MODEL="$MODEL"
  export OPENAI_LARGE_MODEL="$MODEL"
  export MODEL_NAME="$MODEL"
fi

echo "[ENTRYPOINT] Final config:"
echo "[ENTRYPOINT]   OPENAI_BASE_URL=$OPENAI_BASE_URL"
echo "[ENTRYPOINT]   MODEL_NAME=$MODEL_NAME"
echo "[ENTRYPOINT] Starting ElizaOS..."
exec pnpm start
