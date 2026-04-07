# Build Phases

## Phase 1: Setup (30 min) - DONE
- [x] Fork nosana-ci/agent-challenge on GitHub
- [x] Clone fork to this directory
- [x] Install dependencies (pnpm install)
- [x] Copy .env.example to .env, configure Nosana endpoints
- [x] Run locally (pnpm dev), verify base agent responds
- [x] Star required repos: agent-challenge, nosana-programs, nosana-kit, nosana-cli
- [x] Claim builder credits at nosana.com/builders-credits

## Phase 2: Agent Character & Custom Plugin (2-3 hrs) - DONE
- [x] Design character file (characters/agent.character.json)
  - Name: SolWatch
  - Bio: Solana DeFi portfolio intelligence agent
  - Personality: concise, data-driven, privacy-first
  - Knowledge: Solana ecosystem, DeFi protocols, token analytics
- [x] Create custom plugin (src/index.ts)
  - [x] CHECK_WALLET action: query Solana RPC for wallet balance + tokens
  - [x] CHECK_PRICE action: Jupiter Price API for token prices
  - [x] PORTFOLIO_SUMMARY action: aggregate wallet value in USD
  - [x] YIELD_CHECK action: top Solana DeFi yields
- [x] Test all actions locally

## Phase 3: Frontend UI (1-2 hrs)
- [ ] Build chat interface (connect to agent API at :3000)
- [ ] Add portfolio dashboard view (wallet balances, token list, USD values)
- [ ] Mobile-friendly responsive design
- [ ] Clean dark theme (matches Solana aesthetic)
- [ ] Test full flow: ask agent about wallet, see portfolio, get DeFi suggestions

## Phase 4: Docker & Nosana Deploy (1 hr)
- [ ] Update Dockerfile if needed
- [ ] Build Docker image: docker build -t mstevens843/solwatch-agent:latest .
- [ ] Push to Docker Hub: docker push mstevens843/solwatch-agent:latest
- [ ] Update nos_job_def/nosana_eliza_job_definition.json with correct image
- [ ] Deploy via dashboard.nosana.com/deploy
- [ ] Verify live Nosana deployment URL works
- [ ] Test agent through live URL

## Phase 5: Documentation & Submission (30 min) - IN PROGRESS
- [x] Write README.md with architecture, setup, features, deployment
- [x] Write 300 word project description (in README)
- [ ] Record 1 min demo video showing all features
- [ ] Post on X with #NosanaAgentChallenge @nosana_ai
- [ ] Submit on SuperteamDAO: superteam.fun/earn/listing/nosana-builders-elizaos-challenge/
- [ ] Verify GitHub fork is public
- [ ] Verify Nosana deployment is live

## Current Status
Phase 1: DONE
Phase 2: DONE
Phase 3: DONE (using ElizaOS built-in web UI)
Phase 4: READY (need Docker build + Nosana deploy)
Phase 5: IN PROGRESS (README done, need video + social + submit)
