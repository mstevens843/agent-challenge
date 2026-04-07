# Nosana x ElizaOS Agent Challenge - Full Plan

## What We're Building
**Solana DeFi Portfolio Agent** - A personal AI agent that monitors your Solana wallet, tracks token prices, alerts on portfolio changes, and answers DeFi questions. Deployed on Nosana decentralized GPU network.

## Competition Details
- **Deadline:** April 14, 2026
- **Prize:** 1st $1,000 / 2nd $750 / 3rd $450 / 4th $200 / 5th-10th $100 each
- **Total Pool:** $3,000 USDC

## Tech Stack
- **Framework:** ElizaOS v2 (TypeScript)
- **Model:** Qwen3.5-27B-AWQ-4bit (hosted by Nosana, no local GPU needed)
- **Runtime:** Node.js 23, pnpm
- **Database:** SQLite (bundled)
- **Container:** Docker, deployed on Nosana network
- **Port:** 3000

## Judging Criteria
| Category | Weight | Our Strategy |
|---|---|---|
| Technical Implementation | 25% | Custom plugin with 4+ actions, clean TypeScript, error handling |
| Nosana Integration | 25% | Full deployment, environment-aware config, Nosana endpoint usage |
| Usefulness & UX | 25% | Chat UI + portfolio dashboard, real wallet data |
| Creativity | 15% | DeFi intelligence with on-chain data, not just a chatbot |
| Documentation | 10% | Clean README with setup, architecture, screenshots |

## Submission Checklist
- [ ] Public GitHub fork of nosana-ci/agent-challenge
- [ ] Live Nosana deployment URL
- [ ] Project description (300 words max)
- [ ] Demo video (under 1 minute)
- [ ] Social media post with #NosanaAgentChallenge and @nosana_ai
- [ ] Star repos: agent-challenge, nosana-programs, nosana-kit, nosana-cli

## Environment Variables (from template)
```
# LLM (Nosana hosted)
OPENAI_API_KEY=nosana
OPENAI_API_URL=https://4ksj3tve5bazqwkuyqdhwdpcar4yutcuxphwhckrdxmu.node.k8s.prd.nos.ci/v1
MODEL_NAME=Qwen/Qwen3.5-4B

# Embeddings (Nosana hosted)
OPENAI_EMBEDDING_URL=https://4yiccatpyxx773jtewo5ccwhw1s2hezq5pehndb6fcfq.node.k8s.prd.nos.ci/v1
OPENAI_EMBEDDING_API_KEY=nosana
OPENAI_EMBEDDING_MODEL=Qwen3-Embedding-0.6B
OPENAI_EMBEDDING_DIMENSIONS=1024

# Server
SERVER_PORT=3000
```

## Key Constraints
- MUST deploy on Nosana only (AWS/GCP/Azure = auto-disqualified)
- Docker image MUST be public
- GitHub fork MUST remain public through judging
- Nosana builder credits: claim at nosana.com/builders-credits (distributed 2x daily)

## Custom Plugin: solana-defi-agent

### Actions
1. **CHECK_WALLET** - Query any Solana wallet for SOL balance + token holdings via public RPC
2. **CHECK_PRICE** - Get token price via Jupiter Price API (free, no key needed)
3. **PORTFOLIO_SUMMARY** - Aggregate wallet holdings with USD values
4. **YIELD_CHECK** - Query top DeFi yields on Solana (Marinade, Raydium, Orca)

### Providers
- **walletProvider** - Supplies current wallet state to agent context
- **priceProvider** - Supplies latest token prices

### Character
- Name: SolWatch
- Personality: concise DeFi analyst, Solana-native, privacy-focused
- Knows: Solana ecosystem, DeFi protocols, token analytics
- Tone: direct, data-driven, no fluff

## Links
- Template: https://github.com/nosana-ci/agent-challenge
- Nosana Dashboard: https://dashboard.nosana.com/deploy
- Builder Credits: https://nosana.com/builders-credits
- ElizaOS Docs: https://docs.elizaos.ai
- Nosana Docs: https://learn.nosana.com
- Submit: https://superteam.fun/earn/listing/nosana-builders-elizaos-challenge/
