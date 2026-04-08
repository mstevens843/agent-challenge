# Soliza - Solana DeFi Portfolio Intelligence Agent

![ElizaOS](./assets/NosanaXEliza.jpg)

A personal AI agent that monitors Solana wallets, tracks token prices, analyzes portfolio performance, and discovers DeFi yield opportunities. Built with ElizaOS, powered by Qwen3.5 on Nosana's decentralized GPU network.

---

## Project Description

Soliza is a privacy-first Solana DeFi portfolio intelligence agent that runs entirely on decentralized infrastructure. Unlike centralized portfolio trackers that harvest your data, Soliza operates on Nosana's GPU network — your wallet queries and financial data never touch a corporate server.

The agent provides four core capabilities through natural conversation: real-time wallet balance checking via Solana's public RPC, token price lookups through Jupiter's DEX aggregator API, full portfolio summaries with USD valuations, and curated DeFi yield discovery across major Solana protocols including Marinade, Jito, Raydium, Orca, Kamino, and Drift.

Built as a custom ElizaOS plugin, Soliza demonstrates how personal AI agents can provide genuine financial utility while respecting user privacy. Every query hits public, permissionless APIs — no API keys, no account creation, no data collection. Just paste a wallet address and get instant intelligence.

The agent is designed for Solana-native users who want quick, conversational access to on-chain data without switching between block explorers, DEX interfaces, and yield aggregators. Ask "check my wallet" or "what are the best yields on Solana" and get concise, data-driven responses.

Powered by Qwen3.5-27B running on Nosana's decentralized compute network, Soliza proves that personal AI doesn't require Big Tech infrastructure. It's your agent, your data, your infrastructure.

---

## Features

| Action | Description | Data Source |
|--------|-------------|-------------|
| **CHECK_WALLET** | Query any Solana wallet for SOL balance + token holdings | Solana RPC (mainnet) |
| **CHECK_PRICE** | Get real-time token prices (SOL, USDC, BONK, JUP, RAY, ORCA, or any mint address) | Jupiter Price API |
| **PORTFOLIO_SUMMARY** | Aggregate wallet holdings with USD valuations | Solana RPC + Jupiter |
| **YIELD_CHECK** | Discover top DeFi yields across Solana protocols | Curated protocol data |

---

## Architecture

```
User <-> ElizaOS Web UI (:3000) <-> Soliza Plugin
                                        |
                          +--------------+--------------+
                          |              |              |
                    Solana RPC     Jupiter API    Qwen3.5 (Nosana)
                   (balances)      (prices)        (reasoning)
```

- **Framework:** ElizaOS v2 (TypeScript)
- **LLM:** Qwen3.5-27B-AWQ-4bit via Nosana decentralized inference
- **Embeddings:** Qwen3-Embedding-0.6B via Nosana
- **Runtime:** Node.js 23, pnpm
- **Database:** SQLite (bundled)
- **Container:** Docker, deployed on Nosana network

---

## Setup

### Prerequisites

- Node.js 23+
- pnpm (`npm install -g pnpm`)
- Docker (for deployment)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/mstevens843/agent-challenge
cd agent-challenge

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# .env is pre-configured with Nosana endpoints

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to chat with Soliza.

### Example Queries

- "Check wallet 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w"
- "What's the price of SOL?"
- "Show portfolio for [wallet address]"
- "What are the best yields on Solana?"

---

## Deploy to Nosana

### 1. Build & Push Docker Image

```bash
docker build -t mattinfra/soliza-agent:latest .
docker login
docker push mattinfra/soliza-agent:latest
```

### 2. Deploy via Nosana Dashboard

1. Visit [dashboard.nosana.com/deploy](https://dashboard.nosana.com/deploy)
2. Connect your Solana wallet
3. Paste contents of `nos_job_def/nosana_eliza_job_definition.json`
4. Select GPU market (nvidia-3090 recommended)
5. Click Deploy

### 3. Verify

Visit the public URL provided by Nosana and send a test message.

---

## Project Structure

```
nosana_aiagent/
  characters/
    agent.character.json    # Soliza personality & knowledge
  src/
    index.ts                # Custom plugin: 4 actions (wallet, price, portfolio, yield)
  nos_job_def/
    nosana_eliza_job_definition.json  # Nosana deployment config
  Dockerfile                # Container setup (Node 23)
  .env                      # Nosana endpoint configuration
  package.json              # ElizaOS dependencies
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Framework | ElizaOS v2 |
| Language | TypeScript |
| LLM | Qwen3.5-27B-AWQ-4bit (Nosana hosted) |
| Embeddings | Qwen3-Embedding-0.6B (Nosana hosted) |
| Blockchain Data | Solana RPC (public mainnet) |
| Price Data | Jupiter Price API v2 |
| Database | SQLite |
| Deployment | Docker + Nosana decentralized compute |

---

## License

MIT

---

**Built with ElizaOS | Deployed on Nosana | Powered by Qwen3.5**
