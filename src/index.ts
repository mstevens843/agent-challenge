/**
 * Soliza - Solana DeFi Portfolio Intelligence Plugin
 *
 * 12 actions powered by Helius, Birdeye, Chainstack, Jupiter, DefiLlama
 * Falls back to free public APIs when paid keys are not configured.
 */

import { type Plugin, type Action, type HandlerCallback, type HandlerOptions, type IAgentRuntime, type Memory, type State } from "@elizaos/core";

// ─── CONFIG (paid APIs with free fallbacks) ───
const RPC = process.env.CHAINSTACK_RPC_URL || process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const HELIUS_BASE = "https://api.helius.xyz";
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";
const BIRDEYE_BASE = "https://public-api.birdeye.so";
const JUPITER_PRICE = "https://api.jup.ag/price/v3";
const JUPITER_QUOTE = "https://quote-api.jup.ag/v6/quote";
const DEFILLAMA_POOLS = "https://yields.llama.fi/pools";
const DEFILLAMA_TVL = "https://api.llama.fi/v2/historicalChainTvl/Solana";
const JUP_PREDICTION = "https://api.jup.ag/prediction/v1";
const JUP_PERPS = "https://perps-api.jup.ag/v1";
const JUP_PORTFOLIO = "https://api.jup.ag/portfolio/v1";

const TOKEN_MAP: Record<string, string> = {
  sol: "So11111111111111111111111111111111111111112",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  bonk: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  jup: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  ray: "4k3Dyjzvzp8eMZFUEN6Rg8rBqAhxh3p9c3XLf4SArtDF",
  orca: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
};

const STABLECOIN_MINTS = new Set([TOKEN_MAP.usdc, TOKEN_MAP.usdt]);

// ─── STARTUP LOG ───
console.log("[CONFIG] RPC endpoint:", RPC);
console.log("[CONFIG] HELIUS_API_KEY:", HELIUS_API_KEY ? `SET (${HELIUS_API_KEY.slice(0, 8)}...)` : "MISSING");
console.log("[CONFIG] BIRDEYE_API_KEY:", BIRDEYE_API_KEY ? `SET (${BIRDEYE_API_KEY.slice(0, 8)}...)` : "MISSING");
console.log("[CONFIG] CHAINSTACK_RPC_URL:", process.env.CHAINSTACK_RPC_URL ? "SET" : "MISSING");
console.log("[CONFIG] HELIUS_RPC_URL:", process.env.HELIUS_RPC_URL ? "SET" : "MISSING");

// Nosana / ElizaOS LLM config
const NOSANA_LLM_URL = process.env.OPENAI_API_URL || "NOT SET";
const NOSANA_LLM_KEY = process.env.OPENAI_API_KEY || "NOT SET";
const NOSANA_MODEL = process.env.MODEL_NAME || "NOT SET";
const NOSANA_EMBED_URL = process.env.OPENAI_EMBEDDING_URL || "NOT SET";
const NOSANA_EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "NOT SET";

console.log("[NOSANA] LLM URL:", NOSANA_LLM_URL);
console.log("[NOSANA] LLM API Key:", NOSANA_LLM_KEY === "nosana" ? "nosana (challenge default)" : NOSANA_LLM_KEY ? `SET (${NOSANA_LLM_KEY.slice(0, 8)}...)` : "MISSING");
console.log("[NOSANA] Model:", NOSANA_MODEL);
console.log("[NOSANA] Embedding URL:", NOSANA_EMBED_URL);
console.log("[NOSANA] Embedding Model:", NOSANA_EMBED_MODEL);

// Probe Nosana LLM endpoint on startup
(async () => {
  // Test LLM endpoint
  try {
    console.log("[NOSANA] Probing LLM endpoint...");
    const res = await fetch(`${NOSANA_LLM_URL}/models`, {
      headers: { "Authorization": `Bearer ${NOSANA_LLM_KEY}` },
    });
    console.log(`[NOSANA] LLM probe status=${res.status}`);
    if (res.ok) {
      const data = await res.json();
      const models = data.data?.map((m: any) => m.id) || [];
      console.log(`[NOSANA] LLM models available: ${models.join(", ") || "none"}`);
    } else {
      const body = await res.text();
      console.log(`[NOSANA] LLM probe FAILED: ${body.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`[NOSANA] LLM probe ERROR: ${e.message}`);
  }

  // Test embedding endpoint
  try {
    console.log("[NOSANA] Probing embedding endpoint...");
    const res = await fetch(`${NOSANA_EMBED_URL}/models`, {
      headers: { "Authorization": `Bearer ${process.env.OPENAI_EMBEDDING_API_KEY || NOSANA_LLM_KEY}` },
    });
    console.log(`[NOSANA] Embedding probe status=${res.status}`);
    if (res.ok) {
      const data = await res.json();
      const models = data.data?.map((m: any) => m.id) || [];
      console.log(`[NOSANA] Embedding models: ${models.join(", ") || "none"}`);
    } else {
      const body = await res.text();
      console.log(`[NOSANA] Embedding probe FAILED: ${body.slice(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`[NOSANA] Embedding probe ERROR: ${e.message}`);
  }

  // Test RPC endpoint
  try {
    console.log("[RPC] Probing Solana RPC...");
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
    });
    const data = await res.json();
    console.log(`[RPC] Health: ${data.result || data.error?.message || "unknown"}`);
  } catch (e: any) {
    console.log(`[RPC] Probe ERROR: ${e.message}`);
  }
})();

function extractAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match ? match[0] : null;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

async function rpcCall(method: string, params: any[]): Promise<any> {
  console.log(`[RPC] ${method} → ${RPC.slice(0, 50)}...`);
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) console.log(`[RPC] ${method} ERROR:`, data.error);
  else console.log(`[RPC] ${method} OK (hasResult: ${!!data.result})`);
  return data;
}

async function getSOLBalance(address: string): Promise<number> {
  const data = await rpcCall("getBalance", [address]);
  const sol = (data.result?.value || 0) / 1_000_000_000;
  console.log(`[RPC] getSOLBalance(${address.slice(0, 8)}...) = ${sol}`);
  return sol;
}

async function getTokenAccounts(address: string): Promise<any[]> {
  const data = await rpcCall("getTokenAccountsByOwner", [
    address,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ]);
  const tokens = (data.result?.value || []).filter(
    (t: any) => t.account.data.parsed.info.tokenAmount.uiAmount > 0
  );
  console.log(`[RPC] getTokenAccounts(${address.slice(0, 8)}...) = ${tokens.length} tokens`);
  return tokens;
}

async function getSOLPrice(): Promise<number> {
  console.log(`[JUPITER] getSOLPrice → ${JUPITER_PRICE}/v3`);
  const res = await fetch(`${JUPITER_PRICE}?ids=${TOKEN_MAP.sol}`);
  const data = await res.json();
  const price = data[TOKEN_MAP.sol]?.usdPrice || 0;
  console.log(`[JUPITER] SOL price = $${price}`);
  return price;
}

async function getTokenPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  console.log(`[JUPITER] getTokenPrices for ${mints.length} mints`);
  const res = await fetch(`${JUPITER_PRICE}?ids=${mints.join(",")}`);
  const data = await res.json();
  const prices: Record<string, number> = {};
  for (const mint of mints) {
    const p = data[mint]?.usdPrice;
    if (p) prices[mint] = p;
  }
  console.log(`[JUPITER] Got prices for ${Object.keys(prices).length}/${mints.length} mints`);
  return prices;
}

// ─── HELIUS HELPERS ───

async function heliusGetIdentity(address: string): Promise<{ name?: string; type?: string } | null> {
  if (!HELIUS_API_KEY) { console.log("[HELIUS] getIdentity SKIPPED (no key)"); return null; }
  const url = `${HELIUS_BASE}/v0/addresses/${address}/names?api-key=${HELIUS_API_KEY.slice(0, 8)}...`;
  console.log(`[HELIUS] getIdentity(${address.slice(0, 8)}...) → ${url}`);
  try {
    const res = await fetch(`${HELIUS_BASE}/v0/addresses/${address}/names?api-key=${HELIUS_API_KEY}`);
    console.log(`[HELIUS] getIdentity status=${res.status}`);
    const data = await res.json();
    if (data && data.length > 0) {
      console.log(`[HELIUS] getIdentity result: name=${data[0].name}, source=${data[0].source}`);
      return { name: data[0].name, type: data[0].source };
    }
    console.log("[HELIUS] getIdentity: no names found");
    return null;
  } catch (e: any) { console.log(`[HELIUS] getIdentity ERROR: ${e.message}`); return null; }
}

async function heliusGetTransactions(address: string, limit = 15): Promise<any[]> {
  if (!HELIUS_API_KEY) { console.log("[HELIUS] getTransactions SKIPPED (no key)"); return []; }
  console.log(`[HELIUS] getTransactions(${address.slice(0, 8)}..., limit=${limit})`);
  try {
    const res = await fetch(`${HELIUS_BASE}/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`);
    console.log(`[HELIUS] getTransactions status=${res.status}`);
    const data = await res.json();
    console.log(`[HELIUS] getTransactions: ${Array.isArray(data) ? data.length : 0} txs returned`);
    return Array.isArray(data) ? data : [];
  } catch (e: any) { console.log(`[HELIUS] getTransactions ERROR: ${e.message}`); return []; }
}

// ─── BIRDEYE HELPERS ───

function birdeyeHeaders(): Record<string, string> {
  return {
    "X-API-KEY": BIRDEYE_API_KEY,
    "x-chain": "solana",
  };
}

async function birdeyeTokenOverview(mint: string): Promise<any | null> {
  if (!BIRDEYE_API_KEY) { console.log("[BIRDEYE] tokenOverview SKIPPED (no key)"); return null; }
  const url = `${BIRDEYE_BASE}/defi/token_overview?address=${mint}`;
  console.log(`[BIRDEYE] tokenOverview(${mint.slice(0, 8)}...) → ${url}`);
  try {
    const res = await fetch(url, { headers: birdeyeHeaders() });
    console.log(`[BIRDEYE] tokenOverview status=${res.status}`);
    const data = await res.json();
    const d = data.data || null;
    console.log(`[BIRDEYE] tokenOverview: ${d ? `price=${d.price}, mc=${d.mc}, liq=${d.liquidity}` : "NO DATA"} success=${data.success}`);
    return d;
  } catch (e: any) { console.log(`[BIRDEYE] tokenOverview ERROR: ${e.message}`); return null; }
}

async function birdeyeTokenSecurity(mint: string): Promise<any | null> {
  if (!BIRDEYE_API_KEY) { console.log("[BIRDEYE] tokenSecurity SKIPPED (no key)"); return null; }
  const url = `${BIRDEYE_BASE}/defi/token_security?address=${mint}`;
  console.log(`[BIRDEYE] tokenSecurity(${mint.slice(0, 8)}...)`);
  try {
    const res = await fetch(url, { headers: birdeyeHeaders() });
    console.log(`[BIRDEYE] tokenSecurity status=${res.status}`);
    const data = await res.json();
    const d = data.data || null;
    console.log(`[BIRDEYE] tokenSecurity: ${d ? `ownerPct=${d.ownerPercentage}` : "NO DATA"} success=${data.success}`);
    return d;
  } catch (e: any) { console.log(`[BIRDEYE] tokenSecurity ERROR: ${e.message}`); return null; }
}

async function birdeyeWalletPortfolio(address: string): Promise<any | null> {
  if (!BIRDEYE_API_KEY) { console.log("[BIRDEYE] walletPortfolio SKIPPED (no key)"); return null; }
  const url = `${BIRDEYE_BASE}/v1/wallet/token_list?wallet=${address}`;
  console.log(`[BIRDEYE] walletPortfolio(${address.slice(0, 8)}...)`);
  try {
    const res = await fetch(url, { headers: birdeyeHeaders() });
    console.log(`[BIRDEYE] walletPortfolio status=${res.status}`);
    const data = await res.json();
    const d = data.data || null;
    console.log(`[BIRDEYE] walletPortfolio: ${d?.items ? `${d.items.length} items, totalUsd=${d.totalUsd}` : "NO DATA"} success=${data.success}`);
    return d;
  } catch (e: any) { console.log(`[BIRDEYE] walletPortfolio ERROR: ${e.message}`); return null; }
}

// ─── ACTION 1: CHECK_WALLET ───

const checkWalletAction: Action = {
  name: "CHECK_WALLET",
  description: "Check a Solana wallet's SOL balance and token holdings.",
  similes: ["CHECK_BALANCE", "WALLET_BALANCE", "MY_WALLET", "SHOW_BALANCE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    const text = message.content?.text || "";
    console.log(`[ACTION] CHECK_WALLET fired | input: "${text.slice(0, 60)}"`);
    const address = extractAddress(text);
    console.log(`[ACTION] CHECK_WALLET extracted address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address." });
      return;
    }

    try {
      const [sol, tokens, identity, portfolio] = await Promise.all([
        getSOLBalance(address),
        getTokenAccounts(address),
        heliusGetIdentity(address),
        birdeyeWalletPortfolio(address),
      ]);

      let reply = `**Wallet: ${shortAddr(address)}**`;
      if (identity?.name) reply += ` (${identity.name})`;
      reply += `\nSOL Balance: ${sol.toFixed(4)} SOL`;

      // Use Birdeye portfolio if available (richer data with names + prices)
      if (portfolio?.items && portfolio.items.length > 0) {
        const items = portfolio.items.filter((i: any) => i.valueUsd > 0.01).sort((a: any, b: any) => b.valueUsd - a.valueUsd);
        reply += `\nTotal Value: $${portfolio.totalUsd?.toFixed(2) || "?"}\nTokens: ${items.length}`;
        for (const item of items.slice(0, 12)) {
          reply += `\n  **${item.symbol || "???"}** — ${item.uiAmount?.toFixed(item.uiAmount < 1 ? 6 : 2)} ($${item.valueUsd?.toFixed(2)})`;
        }
        if (items.length > 12) reply += `\n  ...and ${items.length - 12} more`;
      } else {
        reply += `\nToken Holdings: ${tokens.length} tokens`;
        for (const t of tokens.slice(0, 15)) {
          const info = t.account.data.parsed.info;
          reply += `\n  \`${info.mint.slice(0, 8)}...\` — ${info.tokenAmount.uiAmountString}`;
        }
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error checking wallet: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Check wallet 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "Soliza", content: { text: "**Wallet: 7etj...Fm3w** (Phantom User)\nSOL Balance: 1.2345 SOL\nTotal Value: $185.20" } },
    ],
  ],
};

// ─── ACTION 2: CHECK_PRICE ───

const checkPriceAction: Action = {
  name: "CHECK_PRICE",
  description: "Check the current price of a Solana token.",
  similes: ["TOKEN_PRICE", "PRICE_CHECK", "SOL_PRICE", "WHAT_PRICE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    const text = (message.content?.text || "").toLowerCase();
    console.log(`[ACTION] CHECK_PRICE fired | input: "${text.slice(0, 60)}"`);

    let mintAddress = "";
    let tokenName = "";

    for (const [name, mint] of Object.entries(TOKEN_MAP)) {
      if (text.includes(name)) {
        mintAddress = mint;
        tokenName = name.toUpperCase();
        break;
      }
    }

    if (!mintAddress) {
      const mint = extractAddress(text);
      if (mint) { mintAddress = mint; tokenName = mint.slice(0, 8) + "..."; }
    }

    console.log(`[ACTION] CHECK_PRICE resolved: token=${tokenName || "NONE"} mint=${mintAddress.slice(0, 8) || "NONE"}`);
    if (!mintAddress) {
      if (callback) callback({ text: "Which token? I can check SOL, USDC, USDT, BONK, JUP, RAY, ORCA, or paste any mint address." });
      return;
    }

    try {
      // Try Birdeye first for rich data
      const overview = await birdeyeTokenOverview(mintAddress);
      if (overview && overview.price) {
        const p = overview.price;
        const mc = overview.mc ? `$${(overview.mc / 1_000_000).toFixed(1)}M` : "?";
        const liq = overview.liquidity ? `$${(overview.liquidity / 1_000_000).toFixed(1)}M` : "?";
        const vol = overview.v24hUSD ? `$${(overview.v24hUSD / 1_000_000).toFixed(1)}M` : "?";
        const change = overview.priceChange24hPercent ? `${overview.priceChange24hPercent > 0 ? "+" : ""}${overview.priceChange24hPercent.toFixed(2)}%` : "?";
        if (callback) callback({ text: `**${tokenName}** — $${p.toFixed(p < 0.01 ? 8 : 2)} USD (${change} 24h)\nMkt Cap: ${mc} | Liquidity: ${liq} | 24h Vol: ${vol}` });
      } else {
        // Fallback to Jupiter
        const prices = await getTokenPrices([mintAddress]);
        const price = prices[mintAddress];
        if (price) {
          if (callback) callback({ text: `**${tokenName}** — $${price.toFixed(price < 0.01 ? 8 : 2)} USD` });
        } else {
          if (callback) callback({ text: `No price data found for ${tokenName}.` });
        }
      }
    } catch (error: any) {
      if (callback) callback({ text: `Error fetching price: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What's the price of SOL?" } },
      { name: "Soliza", content: { text: "**SOL** — $142.50 USD" } },
    ],
  ],
};

// ─── ACTION 3: PORTFOLIO_SUMMARY ───

const portfolioSummaryAction: Action = {
  name: "PORTFOLIO_SUMMARY",
  description: "Get a full portfolio summary with USD values for all holdings.",
  similes: ["PORTFOLIO", "TOTAL_VALUE", "NET_WORTH", "PORTFOLIO_VALUE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] PORTFOLIO_SUMMARY fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] PORTFOLIO_SUMMARY address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address." });
      return;
    }

    try {
      const [sol, tokens, solPrice] = await Promise.all([
        getSOLBalance(address),
        getTokenAccounts(address),
        getSOLPrice(),
      ]);

      const solValue = sol * solPrice;
      const mints = tokens.map((t: any) => t.account.data.parsed.info.mint);
      const prices = await getTokenPrices(mints);

      let totalUSD = solValue;
      const holdings: { mint: string; amount: number; usd: number }[] = [];

      for (const t of tokens) {
        const info = t.account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount;
        const price = prices[info.mint] || 0;
        const usd = amount * price;
        totalUSD += usd;
        holdings.push({ mint: info.mint, amount, usd });
      }

      holdings.sort((a, b) => b.usd - a.usd);

      let reply = `**Portfolio: ${shortAddr(address)}**\n`;
      reply += `\nSOL: ${sol.toFixed(4)} — $${solValue.toFixed(2)}`;

      for (const h of holdings.slice(0, 10)) {
        if (h.usd > 0.01) {
          reply += `\n\`${h.mint.slice(0, 8)}...\`: ${h.amount.toFixed(4)} — $${h.usd.toFixed(2)}`;
        }
      }

      reply += `\n\n**Total Estimated Value: $${totalUSD.toFixed(2)}**`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error getting portfolio: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show portfolio for 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "Soliza", content: { text: "**Portfolio: 7etj...Fm3w**\n\nSOL: 5.0000 — $710.00\n\n**Total Estimated Value: $710.00**" } },
    ],
  ],
};

// ─── ACTION 4: LIVE_YIELDS (DefiLlama) ───

const liveYieldsAction: Action = {
  name: "YIELD_CHECK",
  description: "Check real-time DeFi yield opportunities on Solana with live APY data.",
  similes: ["DEFI_YIELDS", "STAKING", "FARMING", "APY", "EARN", "YIELDS"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] YIELD_CHECK fired`);
    try {
      console.log(`[DEFILLAMA] Fetching pools → ${DEFILLAMA_POOLS}`);
      const res = await fetch(DEFILLAMA_POOLS);
      const data = await res.json();

      const solanaPools = data.data
        .filter((p: any) => p.chain === "Solana" && p.tvlUsd > 1_000_000 && p.apy > 0)
        .sort((a: any, b: any) => b.apy - a.apy)
        .slice(0, 12);

      if (solanaPools.length === 0) {
        if (callback) callback({ text: "Could not fetch live yield data. Try again shortly." });
        return;
      }

      let reply = "**Top Solana DeFi Yields (Live)**\n";
      for (const p of solanaPools) {
        const tvl = p.tvlUsd > 1_000_000_000
          ? `$${(p.tvlUsd / 1_000_000_000).toFixed(1)}B`
          : `$${(p.tvlUsd / 1_000_000).toFixed(1)}M`;
        reply += `\n**${p.project}** | ${p.symbol} | APY: ${p.apy.toFixed(2)}% | TVL: ${tvl}`;
      }
      reply += "\n\n_Live data from DefiLlama. APYs change frequently. DYOR._";

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error fetching yields: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What are the best yields on Solana?" } },
      { name: "Soliza", content: { text: "**Top Solana DeFi Yields (Live)**\n\n**jito** | jitoSOL | APY: 7.80% | TVL: $1.2B" } },
    ],
  ],
};

// ─── ACTION 5: TRANSACTION_HISTORY ───

const KNOWN_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System Transfer",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "Token Transfer",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter Swap",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Jupiter Swap",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca Whirlpool",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium Swap",
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD": "Marinade Staking",
};

const transactionHistoryAction: Action = {
  name: "TRANSACTION_HISTORY",
  description: "Analyze recent transaction history for a Solana wallet. Shows last transactions with type classification.",
  similes: ["TX_HISTORY", "RECENT_TRANSACTIONS", "ACTIVITY", "HISTORY"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] TRANSACTION_HISTORY fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] TRANSACTION_HISTORY address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address to see transaction history." });
      return;
    }

    try {
      // Try Helius enhanced transactions first
      const heliusTxs = await heliusGetTransactions(address, 12);

      if (heliusTxs.length > 0) {
        let reply = `**Recent Transactions: ${shortAddr(address)}**\n`;
        for (const tx of heliusTxs.slice(0, 10)) {
          const date = new Date((tx.timestamp || 0) * 1000);
          const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const type = tx.type || "UNKNOWN";
          const desc = tx.description || "";
          const fee = tx.fee ? (tx.fee / 1_000_000_000).toFixed(6) : "?";
          const sig = tx.signature?.slice(0, 8) || "?";

          reply += `\n${dateStr} | **${type}** | Fee: ${fee} SOL | \`${sig}...\``;
          if (desc && desc.length < 120) reply += `\n  _${desc}_`;
        }
        reply += `\n\n_Showing ${Math.min(10, heliusTxs.length)} transactions (Helius enhanced)_`;
        if (callback) callback({ text: reply });
        return;
      }

      // Fallback to raw RPC
      const sigData = await rpcCall("getSignaturesForAddress", [address, { limit: 15 }]);
      const signatures = sigData.result || [];

      if (signatures.length === 0) {
        if (callback) callback({ text: `No recent transactions found for ${shortAddr(address)}.` });
        return;
      }

      let reply = `**Recent Transactions: ${shortAddr(address)}**\n`;
      for (const sig of signatures.slice(0, 10)) {
        const txData = await rpcCall("getTransaction", [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
        const tx = txData.result;
        const date = new Date((sig.blockTime || 0) * 1000);
        const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const status = sig.err ? "Failed" : "Success";
        let txType = "Unknown";
        if (tx?.transaction?.message?.instructions) {
          for (const ix of tx.transaction.message.instructions) {
            if (KNOWN_PROGRAMS[ix.programId]) { txType = KNOWN_PROGRAMS[ix.programId]; break; }
          }
        }
        const fee = tx?.meta?.fee ? (tx.meta.fee / 1_000_000_000).toFixed(6) : "?";
        reply += `\n${dateStr} | ${txType} | ${status} | Fee: ${fee} SOL | \`${sig.signature.slice(0, 8)}...\``;
      }
      reply += `\n\n_Showing ${Math.min(10, signatures.length)} transactions_`;
      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error fetching transactions: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show transaction history for 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "Soliza", content: { text: "**Recent Transactions: 7etj...Fm3w**\n\nApr 5 | Jupiter Swap | Success | Fee: 0.000005 SOL" } },
    ],
  ],
};

// ─── ACTION 6: RISK_SCORE ───

const riskScoreAction: Action = {
  name: "RISK_SCORE",
  description: "Calculate a portfolio risk score (1-100) for a Solana wallet analyzing concentration, liquidity, whale exposure, and diversification.",
  similes: ["RISK", "RISK_ANALYSIS", "PORTFOLIO_RISK", "HOW_RISKY", "RISK_CHECK"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] RISK_SCORE fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] RISK_SCORE address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address for risk analysis." });
      return;
    }

    try {
      const [sol, tokens, solPrice] = await Promise.all([
        getSOLBalance(address),
        getTokenAccounts(address),
        getSOLPrice(),
      ]);

      const solValue = sol * solPrice;
      const mints = tokens.map((t: any) => t.account.data.parsed.info.mint);
      const prices = await getTokenPrices(mints);

      let totalUSD = solValue;
      const holdingValues: { mint: string; usd: number; isStable: boolean }[] = [
        { mint: TOKEN_MAP.sol, usd: solValue, isStable: false }
      ];

      for (const t of tokens) {
        const info = t.account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount;
        const price = prices[info.mint] || 0;
        const usd = amount * price;
        totalUSD += usd;
        holdingValues.push({ mint: info.mint, usd, isStable: STABLECOIN_MINTS.has(info.mint) });
      }

      if (totalUSD < 0.01) {
        if (callback) callback({ text: `Wallet ${shortAddr(address)} appears empty or has negligible value.` });
        return;
      }

      // Factor 1: Concentration (largest holding %)
      const largestPct = Math.max(...holdingValues.map(h => h.usd / totalUSD * 100));
      const concentrationScore = Math.min(largestPct, 100); // 100% = max risk

      // Factor 2: Stablecoin ratio (more stables = less risk)
      const stablePct = holdingValues.filter(h => h.isStable).reduce((sum, h) => sum + h.usd, 0) / totalUSD * 100;
      const stableScore = 100 - stablePct; // 0% stables = 100 risk

      // Factor 3: Diversification (more tokens = less risk)
      const tokenCount = holdingValues.filter(h => h.usd > 1).length;
      const diversityScore = tokenCount >= 8 ? 20 : tokenCount >= 5 ? 40 : tokenCount >= 3 ? 60 : 80;

      // Factor 4: Whale check on largest non-SOL token
      let whaleScore = 50; // neutral default
      const largestToken = holdingValues.filter(h => h.mint !== TOKEN_MAP.sol).sort((a, b) => b.usd - a.usd)[0];
      if (largestToken && largestToken.usd > 10) {
        try {
          const whaleData = await rpcCall("getTokenLargestAccounts", [largestToken.mint]);
          const accounts = whaleData.result?.value || [];
          const totalSupply = accounts.reduce((sum: number, a: any) => sum + parseFloat(a.uiAmountString || "0"), 0);
          if (totalSupply > 0) {
            const top5Pct = accounts.slice(0, 5).reduce((sum: number, a: any) => sum + parseFloat(a.uiAmountString || "0"), 0) / totalSupply * 100;
            whaleScore = Math.min(top5Pct, 100);
          }
        } catch { /* whale check is best-effort */ }
      }

      // Weighted score
      const riskScore = Math.round(
        concentrationScore * 0.35 +
        stableScore * 0.20 +
        diversityScore * 0.25 +
        whaleScore * 0.20
      );

      const riskLevel = riskScore >= 75 ? "HIGH" : riskScore >= 50 ? "MEDIUM" : riskScore >= 25 ? "LOW-MEDIUM" : "LOW";
      const bar = "█".repeat(Math.round(riskScore / 5)) + "░".repeat(20 - Math.round(riskScore / 5));

      let reply = `**Risk Analysis: ${shortAddr(address)}**\n`;
      reply += `\n[${bar}] **${riskScore}/100 (${riskLevel})**\n`;
      reply += `\n**Breakdown:**`;
      reply += `\n  Concentration: ${largestPct.toFixed(1)}% in largest holding ${largestPct > 70 ? "⚠️" : "✓"}`;
      reply += `\n  Stablecoin Buffer: ${stablePct.toFixed(1)}% ${stablePct < 10 ? "⚠️" : "✓"}`;
      reply += `\n  Diversification: ${tokenCount} assets ${tokenCount < 3 ? "⚠️" : "✓"}`;
      reply += `\n  Whale Risk: ${whaleScore.toFixed(0)}% top-holder concentration ${whaleScore > 60 ? "⚠️" : "✓"}`;
      reply += `\n\nTotal Portfolio: $${totalUSD.toFixed(2)}`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error calculating risk: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What's the risk score for 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w?" } },
      { name: "Soliza", content: { text: "**Risk Analysis: 7etj...Fm3w**\n\n[████████████████░░░░] **72/100 (HIGH)**" } },
    ],
  ],
};

// ─── ACTION 7: STRATEGY_ADVISOR ───

const strategyAdvisorAction: Action = {
  name: "STRATEGY_ADVISOR",
  description: "Get personalized DeFi strategy suggestions based on wallet holdings. Analyzes your portfolio and recommends yield opportunities, rebalancing, and risk reduction.",
  similes: ["STRATEGY", "ADVICE", "SUGGEST", "WHAT_SHOULD_I_DO", "OPTIMIZE", "REBALANCE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] STRATEGY_ADVISOR fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] STRATEGY_ADVISOR address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address for strategy advice." });
      return;
    }

    try {
      const [sol, tokens, solPrice] = await Promise.all([
        getSOLBalance(address),
        getTokenAccounts(address),
        getSOLPrice(),
      ]);

      const solValue = sol * solPrice;
      const mints = tokens.map((t: any) => t.account.data.parsed.info.mint);
      const prices = await getTokenPrices(mints);

      let totalUSD = solValue;
      const holdings: { mint: string; amount: number; usd: number; isStable: boolean }[] = [
        { mint: TOKEN_MAP.sol, amount: sol, usd: solValue, isStable: false }
      ];

      for (const t of tokens) {
        const info = t.account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount;
        const price = prices[info.mint] || 0;
        const usd = amount * price;
        totalUSD += usd;
        holdings.push({ mint: info.mint, amount, usd, isStable: STABLECOIN_MINTS.has(info.mint) });
      }

      holdings.sort((a, b) => b.usd - a.usd);

      const suggestions: string[] = [];
      const solPct = totalUSD > 0 ? (solValue / totalUSD * 100) : 0;
      const stablePct = holdings.filter(h => h.isStable).reduce((sum, h) => sum + h.usd, 0) / (totalUSD || 1) * 100;
      const tokenCount = holdings.filter(h => h.usd > 1).length;

      // Concentration advice
      if (solPct > 80 && sol > 1) {
        suggestions.push(`**Concentration Alert:** ${solPct.toFixed(0)}% of your portfolio is SOL. Consider liquid staking ${(sol * 0.5).toFixed(2)} SOL with Jito (~7.8% APY) or Marinade (~7.2% APY) to earn yield while staying exposed.`);
      } else if (solPct > 60) {
        suggestions.push(`**Diversify:** ${solPct.toFixed(0)}% in SOL. Consider moving some into stablecoin lending (Kamino ~8% APY) for balance.`);
      }

      // Idle SOL
      if (sol > 2 && solPct > 30) {
        suggestions.push(`**Idle SOL:** You have ${sol.toFixed(2)} SOL not earning yield. Liquid staking (JitoSOL, mSOL) earns 7-8% APY with instant unstaking.`);
      }

      // Stablecoin advice
      if (stablePct < 5 && totalUSD > 100) {
        suggestions.push(`**No Safety Net:** ${stablePct.toFixed(0)}% stablecoins. Consider holding 10-20% in USDC for buying dips and reducing drawdown risk.`);
      } else if (stablePct > 50) {
        suggestions.push(`**Underdeployed Capital:** ${stablePct.toFixed(0)}% in stablecoins. Deploy into lending (Kamino, Drift) for 8-10% APY, or LP positions for higher yields.`);
      }

      // Diversification
      if (tokenCount < 3 && totalUSD > 50) {
        suggestions.push(`**Low Diversity:** Only ${tokenCount} asset(s). Consider adding 2-3 uncorrelated positions to reduce risk.`);
      }

      // Small portfolio advice
      if (totalUSD < 10 && totalUSD > 0) {
        suggestions.push(`**Small Portfolio:** At $${totalUSD.toFixed(2)}, focus on accumulating before optimizing. Gas fees can eat into small positions.`);
      }

      if (suggestions.length === 0) {
        suggestions.push("Your portfolio looks reasonably balanced. Keep monitoring and consider rebalancing quarterly.");
      }

      let reply = `**Strategy Advice: ${shortAddr(address)}**\n`;
      reply += `Portfolio: $${totalUSD.toFixed(2)} | ${tokenCount} assets | ${stablePct.toFixed(0)}% stablecoins\n`;
      for (const s of suggestions) {
        reply += `\n${s}`;
      }
      reply += `\n\n_Not financial advice. Always DYOR._`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error generating strategy: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Give me strategy advice for 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "Soliza", content: { text: "**Strategy Advice: 7etj...Fm3w**\n\n**Idle SOL:** You have 5.23 SOL not earning yield. Liquid staking earns 7-8% APY." } },
    ],
  ],
};

// ─── ACTION 8: WHALE_TRACKER ───

const whaleTrackerAction: Action = {
  name: "WHALE_TRACKER",
  description: "Check whale concentration for any Solana token. Shows top holders and ownership distribution.",
  similes: ["WHALES", "TOP_HOLDERS", "WHALE_CHECK", "WHO_HOLDS", "TOKEN_HOLDERS"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] WHALE_TRACKER fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const text = (message.content?.text || "").toLowerCase();

    let mintAddress = "";
    let tokenName = "";

    for (const [name, mint] of Object.entries(TOKEN_MAP)) {
      if (text.includes(name)) {
        mintAddress = mint;
        tokenName = name.toUpperCase();
        break;
      }
    }

    if (!mintAddress) {
      const mint = extractAddress(text);
      if (mint) { mintAddress = mint; tokenName = mint.slice(0, 8) + "..."; }
    }

    console.log(`[ACTION] WHALE_TRACKER resolved: token=${tokenName || "NONE"}`);
    if (!mintAddress) {
      if (callback) callback({ text: "Which token? Provide a name (SOL, BONK, JUP, etc.) or paste a mint address." });
      return;
    }

    try {
      const [whaleData, totalSupply] = await Promise.all([
        rpcCall("getTokenLargestAccounts", [mintAddress]),
        getTokenTotalSupply(mintAddress),
      ]);
      const accounts = whaleData.result?.value || [];

      if (accounts.length === 0) {
        if (callback) callback({ text: `No holder data found for ${tokenName}.` });
        return;
      }

      const denominator = totalSupply > 0 ? totalSupply : accounts.reduce((sum: number, a: any) => sum + parseFloat(a.uiAmountString || "0"), 0);
      const top5Amount = accounts.slice(0, 5).reduce((sum: number, a: any) => sum + parseFloat(a.uiAmountString || "0"), 0);
      const top5Pct = denominator > 0 ? (top5Amount / denominator * 100) : 0;

      const concentration = top5Pct > 70 ? "HIGH ⚠️" : top5Pct > 40 ? "MEDIUM" : "LOW ✓";

      let reply = `**Whale Analysis: ${tokenName}**\n`;
      reply += `Top 5 Holder Concentration: **${top5Pct.toFixed(1)}% (${concentration})**\n`;
      reply += `\n**Top Holders:**`;

      for (let i = 0; i < Math.min(10, accounts.length); i++) {
        const a = accounts[i];
        const pct = denominator > 0 ? (parseFloat(a.uiAmountString || "0") / denominator * 100) : 0;
        reply += `\n  #${i + 1} \`${a.address.slice(0, 8)}...\` — ${parseFloat(a.uiAmountString || "0").toLocaleString()} (${pct.toFixed(1)}%)`;
      }

      if (top5Pct > 60) {
        reply += `\n\n⚠️ **High concentration risk.** A single whale selling could significantly impact price.`;
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error checking whale data: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me the whales for BONK" } },
      { name: "Soliza", content: { text: "**Whale Analysis: BONK**\nTop 5 Holder Concentration: **42.3% (MEDIUM)**" } },
    ],
  ],
};

// ─── ACTION 9: RUG_SCANNER (SolPulse-inspired) ───

async function getMintInfo(mint: string): Promise<{ mintAuthority: boolean; freezeAuthority: boolean }> {
  const data = await rpcCall("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const parsed = data.result?.value?.data?.parsed?.info;
  return {
    mintAuthority: !!parsed?.mintAuthority,
    freezeAuthority: !!parsed?.freezeAuthority,
  };
}

async function getTokenAge(mint: string): Promise<number> {
  const data = await rpcCall("getSignaturesForAddress", [mint, { limit: 1, before: undefined }]);
  const sigs = data.result || [];
  if (sigs.length === 0) return 0;
  // Get the oldest signature we can find
  const oldest = sigs[sigs.length - 1];
  return oldest.blockTime ? Date.now() / 1000 - oldest.blockTime : 0;
}

async function getTokenTotalSupply(mint: string): Promise<number> {
  const data = await rpcCall("getTokenSupply", [mint]);
  const supply = parseFloat(data.result?.value?.uiAmountString || "0");
  console.log(`[RPC] getTokenSupply(${mint.slice(0, 8)}...) = ${supply}`);
  return supply;
}

async function getLiquidityImpact(mint: string): Promise<number> {
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  try {
    const res = await fetch(`${JUPITER_QUOTE}?inputMint=${SOL_MINT}&outputMint=${mint}&amount=1000000000&slippageBps=500`);
    const data = await res.json();
    return parseFloat(data.priceImpactPct || "0") * 100;
  } catch { return -1; }
}

const rugScannerAction: Action = {
  name: "RUG_SCANNER",
  description: "Scan a Solana token for rug pull risk. Analyzes mint authority, freeze authority, holder concentration, token age, and liquidity depth. Inspired by professional-grade rug detection systems.",
  similes: ["RUG_CHECK", "IS_IT_SAFE", "TOKEN_SAFETY", "SCAM_CHECK", "RUG_RISK", "SAFE_TO_BUY"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] RUG_SCANNER fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const text = (message.content?.text || "").toLowerCase();

    let mintAddress = "";
    let tokenName = "";
    for (const [name, mint] of Object.entries(TOKEN_MAP)) {
      if (text.includes(name) && name !== "sol") {
        mintAddress = mint; tokenName = name.toUpperCase(); break;
      }
    }
    if (!mintAddress) {
      const mint = extractAddress(message.content?.text || "");
      if (mint) { mintAddress = mint; tokenName = mint.slice(0, 8) + "..."; }
    }
    console.log(`[ACTION] RUG_SCANNER resolved: token=${tokenName || "NONE"} mint=${mintAddress.slice(0, 8) || "NONE"}`);
    if (!mintAddress) {
      if (callback) callback({ text: "Provide a token name or mint address to scan for rug risk." });
      return;
    }

    try {
      const [mintInfo, whaleData, ageSeconds, impact, security, overview] = await Promise.all([
        getMintInfo(mintAddress),
        rpcCall("getTokenLargestAccounts", [mintAddress]),
        getTokenAge(mintAddress),
        getLiquidityImpact(mintAddress),
        birdeyeTokenSecurity(mintAddress),
        birdeyeTokenOverview(mintAddress),
      ]);

      const flags: string[] = [];
      let score = 0;

      // Indicator 1: Mint authority (weight: 25)
      if (mintInfo.mintAuthority) {
        score += 25;
        flags.push("🔴 **Mint authority NOT revoked** — creator can mint unlimited tokens");
      } else {
        flags.push("🟢 Mint authority revoked");
      }

      // Indicator 2: Freeze authority (weight: 20)
      if (mintInfo.freezeAuthority) {
        score += 20;
        flags.push("🔴 **Freeze authority active** — your tokens can be frozen");
      } else {
        flags.push("🟢 No freeze authority");
      }

      // Indicator 3: Holder concentration (weight: 25)
      const accounts = whaleData.result?.value || [];
      const rugSupply = await getTokenTotalSupply(mintAddress);
      const rugDenom = rugSupply > 0 ? rugSupply : accounts.reduce((s: number, a: any) => s + parseFloat(a.uiAmountString || "0"), 0);
      const top5Pct = rugDenom > 0 ? accounts.slice(0, 5).reduce((s: number, a: any) => s + parseFloat(a.uiAmountString || "0"), 0) / rugDenom * 100 : 0;
      if (top5Pct > 80) {
        score += 25; flags.push(`🔴 **Top 5 holders own ${top5Pct.toFixed(1)}%** — extreme concentration`);
      } else if (top5Pct > 50) {
        score += 15; flags.push(`🟡 Top 5 holders own ${top5Pct.toFixed(1)}% — moderate concentration`);
      } else {
        flags.push(`🟢 Top 5 holders own ${top5Pct.toFixed(1)}% — healthy distribution`);
      }

      // Indicator 4: Token age (weight: 15)
      const ageHours = ageSeconds / 3600;
      if (ageHours < 1) {
        score += 15; flags.push("🔴 **Token < 1 hour old** — extreme caution");
      } else if (ageHours < 24) {
        score += 10; flags.push(`🟡 Token is ${ageHours.toFixed(1)} hours old — very new`);
      } else if (ageHours < 168) {
        score += 5; flags.push(`🟢 Token is ${(ageHours / 24).toFixed(1)} days old`);
      } else {
        flags.push(`🟢 Token is ${(ageHours / 24).toFixed(0)} days old — established`);
      }

      // Indicator 5: Liquidity / Price impact (weight: 15)
      if (impact < 0) {
        score += 10; flags.push("🟡 Could not check liquidity — token may not be tradeable");
      } else if (impact > 10) {
        score += 15; flags.push(`🔴 **${impact.toFixed(1)}% price impact** on 1 SOL swap — extremely illiquid`);
      } else if (impact > 3) {
        score += 8; flags.push(`🟡 ${impact.toFixed(1)}% price impact — low liquidity`);
      } else {
        flags.push(`🟢 ${impact.toFixed(2)}% price impact — adequate liquidity`);
      }

      // Birdeye enrichment
      if (security) {
        if (security.ownerPercentage > 50) {
          score += 5; flags.push(`🔴 Owner holds ${(security.ownerPercentage * 100).toFixed(1)}% of supply`);
        }
      }
      if (overview) {
        if (overview.holder && overview.holder < 100) {
          score += 5; flags.push(`🟡 Only ${overview.holder} holders`);
        }
        if (overview.liquidity && overview.liquidity < 10000) {
          score += 5; flags.push(`🔴 Liquidity only $${overview.liquidity.toFixed(0)}`);
        }
      }

      score = Math.min(score, 100);
      const level = score >= 60 ? "DANGEROUS" : score >= 40 ? "RISKY" : score >= 20 ? "CAUTION" : "LOW RISK";
      const bar = "█".repeat(Math.round(score / 5)) + "░".repeat(20 - Math.round(score / 5));

      let reply = `**Rug Scan: ${tokenName}**\n`;
      reply += `\n[${bar}] **${score}/100 (${level})**\n`;
      if (overview) {
        reply += `\nPrice: $${overview.price?.toFixed(overview.price < 0.01 ? 8 : 4) || "?"} | MC: $${overview.mc ? (overview.mc / 1_000_000).toFixed(1) + "M" : "?"} | Holders: ${overview.holder || "?"} | Liq: $${overview.liquidity ? (overview.liquidity / 1000).toFixed(0) + "k" : "?"}\n`;
      }
      reply += `\n**Indicators:**`;
      for (const f of flags) reply += `\n  ${f}`;

      if (score >= 60) {
        reply += `\n\n⚠️ **HIGH RUG RISK.** Multiple red flags detected. Proceed with extreme caution.`;
      } else if (score >= 40) {
        reply += `\n\n⚠️ Some risk factors present. Do thorough research before investing.`;
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error scanning token: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Is BONK safe? Rug check BONK" } },
      { name: "Soliza", content: { text: "**Rug Scan: BONK**\n\n[████░░░░░░░░░░░░░░░░] **18/100 (LOW RISK)**" } },
    ],
  ],
};

// ─── ACTION 10: WALLET_INTELLIGENCE (Full PNL + Personality Profiler) ───

const WSOL_MINT = "So11111111111111111111111111111111111111112";

async function deepProfileWallet(address: string): Promise<any> {
  console.log(`[PROFILE] deepProfileWallet(${address.slice(0, 8)}...)`);

  // Fetch up to 500 parsed transactions from Helius
  const allTxs: any[] = [];
  let beforeSig: string | undefined;
  const pages = HELIUS_API_KEY ? 5 : 0;

  for (let page = 0; page < pages; page++) {
    const url = `${HELIUS_BASE}/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100${beforeSig ? `&before=${beforeSig}` : ""}`;
    console.log(`[PROFILE] Helius page ${page + 1}/${pages}`);
    const res = await fetch(url);
    if (!res.ok) { console.log(`[PROFILE] Helius page ${page + 1} failed: ${res.status}`); break; }
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;
    allTxs.push(...txs);
    beforeSig = txs[txs.length - 1].signature;
    if (txs.length < 100) break;
  }

  console.log(`[PROFILE] Fetched ${allTxs.length} transactions`);

  // Filter for swaps only
  const swaps = allTxs.filter((tx: any) => tx.type === "SWAP");
  console.log(`[PROFILE] ${swaps.length} swaps found`);

  if (swaps.length === 0) {
    return { tradeCount: 0, personalityType: "UNKNOWN", error: "No swap transactions found" };
  }

  // Track per-token trades
  const tokenTrades: Record<string, { buySol: number; sellSol: number; buyCount: number; sellCount: number }> = {};
  let totalVolume = 0;

  for (const tx of swaps) {
    const natives = tx.nativeTransfers || [];
    let solOut = 0; // wallet sending SOL = buying tokens
    let solIn = 0;  // wallet receiving SOL = selling tokens

    for (const nt of natives) {
      const amount = (nt.amount || 0) / 1_000_000_000;
      if (nt.fromUserAccount === address) solOut += amount;
      if (nt.toUserAccount === address) solIn += amount;
    }

    // Also check WSOL in tokenTransfers
    const tokenTransfers = tx.tokenTransfers || [];
    for (const tt of tokenTransfers) {
      if (tt.mint === WSOL_MINT) {
        const amount = tt.tokenAmount || 0;
        if (tt.fromUserAccount === address) solOut += amount;
        if (tt.toUserAccount === address) solIn += amount;
      }
    }

    // Find the non-SOL token involved
    const otherToken = tokenTransfers.find((tt: any) => tt.mint && tt.mint !== WSOL_MINT);
    const tokenMint = otherToken?.mint || "unknown";

    if (!tokenTrades[tokenMint]) tokenTrades[tokenMint] = { buySol: 0, sellSol: 0, buyCount: 0, sellCount: 0 };

    if (solOut > solIn) {
      // Net SOL out = buying tokens
      tokenTrades[tokenMint].buySol += solOut - solIn;
      tokenTrades[tokenMint].buyCount++;
    } else if (solIn > solOut) {
      // Net SOL in = selling tokens
      tokenTrades[tokenMint].sellSol += solIn - solOut;
      tokenTrades[tokenMint].sellCount++;
    }

    totalVolume += solOut + solIn;
  }

  // Calculate PNL for completed trades (tokens with both buys and sells)
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalPnlSol = 0;
  let biggestWinSol = 0;
  let biggestLossSol = 0;
  let completedTrades = 0;
  let uniqueTokens = 0;

  for (const [, trades] of Object.entries(tokenTrades)) {
    if (trades.buyCount > 0 && trades.sellCount > 0) {
      completedTrades++;
      uniqueTokens++;
      const pnl = trades.sellSol - trades.buySol;
      totalPnlSol += pnl;
      if (pnl > 0) { wins++; grossProfit += pnl; if (pnl > biggestWinSol) biggestWinSol = pnl; }
      else { losses++; grossLoss += Math.abs(pnl); if (pnl < biggestLossSol) biggestLossSol = pnl; }
    } else if (trades.buyCount > 0 || trades.sellCount > 0) {
      uniqueTokens++;
    }
  }

  const tradeCount = swaps.length;
  const winRate = completedTrades > 0 ? wins / completedTrades : null;
  const riskScore = winRate != null ? Math.max(0, 1 - winRate) : 0.5;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : null);
  const avgTradeSize = tradeCount > 0 ? totalVolume / tradeCount : 0;

  // Classify personality (SolPulse decision tree)
  let personalityType = "UNKNOWN";
  let personalityConfidence = 0.3;

  if (tradeCount >= 5) {
    if (winRate != null && winRate >= 0.7 && tradeCount >= 20) {
      personalityType = "ELITE_SNIPER"; personalityConfidence = 0.8;
    } else if (avgTradeSize >= 10) {
      personalityType = "WHALE"; personalityConfidence = tradeCount >= 20 ? 0.8 : 0.5;
    } else if (tradeCount >= 50) {
      personalityType = "BOT_TRADER"; personalityConfidence = 0.8;
    } else if (winRate != null && winRate >= 0.5) {
      personalityType = "ACCUMULATOR"; personalityConfidence = tradeCount >= 20 ? 0.8 : 0.5;
    } else {
      personalityType = "RETAIL_FOLLOWER"; personalityConfidence = tradeCount >= 20 ? 0.8 : 0.5;
    }
  }

  console.log(`[PROFILE] Result: ${personalityType} | PNL=${totalPnlSol.toFixed(3)} SOL | WR=${winRate != null ? (winRate * 100).toFixed(0) + "%" : "N/A"} | Trades=${tradeCount}`);

  return {
    tradeCount,
    totalVolume: Math.round(totalVolume * 100) / 100,
    avgTradeSize: Math.round(avgTradeSize * 1000) / 1000,
    winRate,
    riskScore,
    personalityType,
    personalityConfidence,
    completedTrades,
    totalPnlSol: Math.round(totalPnlSol * 1000) / 1000,
    profitFactor: profitFactor != null ? Math.round(profitFactor * 100) / 100 : null,
    biggestWinSol: biggestWinSol > 0 ? Math.round(biggestWinSol * 1000) / 1000 : null,
    biggestLossSol: biggestLossSol < 0 ? Math.round(biggestLossSol * 1000) / 1000 : null,
    uniqueTokens: uniqueTokens > 0 ? uniqueTokens : null,
    txsFetched: allTxs.length,
  };
}

const PERSONALITY_LABELS: Record<string, string> = {
  ELITE_SNIPER: "Elite Sniper",
  WHALE: "Whale",
  BOT_TRADER: "Bot Trader",
  ACCUMULATOR: "Accumulator",
  RETAIL_FOLLOWER: "Retail Follower",
  UNKNOWN: "Unknown",
};

const walletPersonalityAction: Action = {
  name: "WALLET_PERSONALITY",
  description: "Deep wallet intelligence — analyzes trading history to calculate PNL, win rate, risk score, profit factor, and personality type (Elite Sniper, Whale, Bot Trader, Accumulator, Retail). Powered by Helius transaction parsing.",
  similes: ["PROFILE_WALLET", "WALLET_TYPE", "TRADER_TYPE", "WHO_IS", "WALLET_PROFILE", "XRAY", "PNL", "WIN_RATE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] WALLET_PERSONALITY fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] WALLET_PERSONALITY address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address to profile." });
      return;
    }

    if (!HELIUS_API_KEY) {
      if (callback) callback({ text: "Wallet intelligence requires Helius API. Not configured." });
      return;
    }

    try {
      const profile = await deepProfileWallet(address);
      const identity = await heliusGetIdentity(address);

      if (profile.tradeCount === 0) {
        if (callback) callback({ text: `Wallet ${shortAddr(address)} has no swap transactions. Cannot generate trading profile.` });
        return;
      }

      const label = PERSONALITY_LABELS[profile.personalityType] || profile.personalityType;
      const wr = profile.winRate != null ? `${(profile.winRate * 100).toFixed(0)}%` : "N/A";
      const pf = profile.profitFactor != null ? (profile.profitFactor >= 999 ? "∞" : profile.profitFactor.toFixed(2)) : "N/A";
      const pnlSign = profile.totalPnlSol >= 0 ? "+" : "";

      let reply = `**Wallet Intelligence: ${shortAddr(address)}**`;
      if (identity?.name) reply += ` (${identity.name})`;

      reply += `\n\n**${label}** (${(profile.personalityConfidence * 100).toFixed(0)}% confidence)`;

      reply += `\n\n**Performance:**`;
      reply += `\n  PNL: **${pnlSign}${profile.totalPnlSol} SOL**`;
      reply += `\n  Win Rate: **${wr}** (${profile.completedTrades} completed trades)`;
      reply += `\n  Profit Factor: **${pf}**`;
      reply += `\n  Risk Score: **${(profile.riskScore * 100).toFixed(0)}/100**`;

      reply += `\n\n**Trading Stats:**`;
      reply += `\n  Total Trades: ${profile.tradeCount} (${profile.txsFetched} txs analyzed)`;
      reply += `\n  Volume: ${profile.totalVolume} SOL`;
      reply += `\n  Avg Trade: ${profile.avgTradeSize} SOL`;
      reply += `\n  Unique Tokens: ${profile.uniqueTokens || 0}`;

      if (profile.biggestWinSol || profile.biggestLossSol) {
        reply += `\n\n**Best / Worst:**`;
        if (profile.biggestWinSol) reply += `\n  Biggest Win: +${profile.biggestWinSol} SOL`;
        if (profile.biggestLossSol) reply += `\n  Biggest Loss: ${profile.biggestLossSol} SOL`;
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      console.log(`[PROFILE] ERROR: ${error.message}`);
      if (callback) callback({ text: `Error profiling wallet: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Profile wallet 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "Soliza", content: { text: "**Wallet Intelligence: 7etj...Fm3w**\n\n**Elite Sniper** (80% confidence)\n\nPNL: +12.5 SOL | Win Rate: 73%" } },
    ],
  ],
};

// ─── ACTION 11: TOKEN_SCANNER (SolPulse-inspired) ───

const tokenScannerAction: Action = {
  name: "TOKEN_SCANNER",
  description: "Comprehensive token health scan — safety checks, lifecycle stage, and investment readiness. Combines rug detection with lifecycle analysis.",
  similes: ["SCAN_TOKEN", "TOKEN_CHECK", "IS_SAFE", "TOKEN_HEALTH", "TOKEN_INFO", "ANALYZE_TOKEN"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] TOKEN_SCANNER fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    const text = (message.content?.text || "").toLowerCase();

    let mintAddress = "";
    let tokenName = "";
    for (const [name, mint] of Object.entries(TOKEN_MAP)) {
      if (text.includes(name) && name !== "sol") {
        mintAddress = mint; tokenName = name.toUpperCase(); break;
      }
    }
    if (!mintAddress) {
      const mint = extractAddress(message.content?.text || "");
      if (mint) { mintAddress = mint; tokenName = mint.slice(0, 8) + "..."; }
    }
    console.log(`[ACTION] TOKEN_SCANNER resolved: token=${tokenName || "NONE"}`);
    if (!mintAddress) {
      if (callback) callback({ text: "Provide a token name or mint address to scan." });
      return;
    }

    try {
      const [mintInfo, whaleData, ageSeconds, prices, impact, security, beOverview] = await Promise.all([
        getMintInfo(mintAddress),
        rpcCall("getTokenLargestAccounts", [mintAddress]),
        getTokenAge(mintAddress),
        getTokenPrices([mintAddress]),
        getLiquidityImpact(mintAddress),
        birdeyeTokenSecurity(mintAddress),
        birdeyeTokenOverview(mintAddress),
      ]);

      const price = beOverview?.price || prices[mintAddress] || 0;
      const ageHours = ageSeconds / 3600;
      const ageDays = ageHours / 24;
      const accounts = whaleData.result?.value || [];
      const scanSupply = await getTokenTotalSupply(mintAddress);
      const scanDenom = scanSupply > 0 ? scanSupply : accounts.reduce((s: number, a: any) => s + parseFloat(a.uiAmountString || "0"), 0);
      const top10Pct = scanDenom > 0 ? accounts.slice(0, 10).reduce((s: number, a: any) => s + parseFloat(a.uiAmountString || "0"), 0) / scanDenom * 100 : 0;

      // Lifecycle stage
      let lifecycle = "";
      if (ageHours < 1) lifecycle = "🟣 Just Born (< 1hr)";
      else if (ageHours < 24) lifecycle = "🔵 Early Discovery (< 24hr)";
      else if (ageDays < 7) lifecycle = "🟢 Momentum Phase (< 7d)";
      else if (ageDays < 30) lifecycle = "🟡 Established (< 30d)";
      else if (ageDays < 90) lifecycle = "🟠 Mature (< 90d)";
      else lifecycle = "⚪ Veteran (90d+)";

      // Safety score (0-100, lower = safer)
      let safetyScore = 0;
      const checks: string[] = [];

      if (mintInfo.mintAuthority) { safetyScore += 30; checks.push("❌ Mint authority active"); }
      else checks.push("✅ Mint authority revoked");

      if (mintInfo.freezeAuthority) { safetyScore += 20; checks.push("❌ Freeze authority active"); }
      else checks.push("✅ No freeze authority");

      if (top10Pct > 80) { safetyScore += 25; checks.push(`❌ Top 10 hold ${top10Pct.toFixed(0)}%`); }
      else if (top10Pct > 50) { safetyScore += 12; checks.push(`⚠️ Top 10 hold ${top10Pct.toFixed(0)}%`); }
      else checks.push(`✅ Top 10 hold ${top10Pct.toFixed(0)}%`);

      if (ageHours < 2) { safetyScore += 15; checks.push("❌ Extremely new token"); }
      else if (ageDays < 1) { safetyScore += 8; checks.push("⚠️ Less than 1 day old"); }
      else checks.push(`✅ ${ageDays.toFixed(0)} days old`);

      if (impact > 10) { safetyScore += 10; checks.push(`❌ High price impact (${impact.toFixed(1)}%)`); }
      else if (impact > 3) { safetyScore += 5; checks.push(`⚠️ Moderate price impact (${impact.toFixed(1)}%)`); }
      else if (impact >= 0) checks.push(`✅ Good liquidity (${impact.toFixed(2)}% impact)`);

      const verdict = safetyScore >= 50 ? "⛔ HIGH RISK" : safetyScore >= 30 ? "⚠️ MODERATE RISK" : safetyScore >= 15 ? "🟡 LOW-MODERATE RISK" : "🟢 LOW RISK";

      let reply = `**Token Scan: ${tokenName}**\n`;
      reply += `\n**Verdict: ${verdict}** (Safety Score: ${safetyScore}/100)`;
      reply += `\n**Lifecycle: ${lifecycle}**`;
      if (price > 0) reply += `\n**Price:** $${price.toFixed(price < 0.01 ? 8 : 4)}`;
      if (beOverview) {
        const mc = beOverview.mc ? `$${(beOverview.mc / 1_000_000).toFixed(1)}M` : "?";
        const liq = beOverview.liquidity ? `$${(beOverview.liquidity / 1000).toFixed(0)}k` : "?";
        const vol = beOverview.v24hUSD ? `$${(beOverview.v24hUSD / 1000).toFixed(0)}k` : "?";
        const holders = beOverview.holder || "?";
        reply += `\nMkt Cap: ${mc} | Liquidity: ${liq} | 24h Vol: ${vol} | Holders: ${holders}`;
      }
      reply += `\n\n**Safety Checks:**`;
      for (const c of checks) reply += `\n  ${c}`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error scanning token: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Scan token BONK" } },
      { name: "Soliza", content: { text: "**Token Scan: BONK**\n\n**Verdict: 🟢 LOW RISK**\n**Lifecycle: 🟠 Mature**" } },
    ],
  ],
};

// ─── ACTION 12: MARKET_PULSE (SolPulse-inspired) ───

const marketPulseAction: Action = {
  name: "MARKET_PULSE",
  description: "Get a macro market pulse for Solana — SOL price trend, DeFi TVL movement, top yield shifts, and position sizing guidance.",
  similes: ["MARKET", "MACRO", "MARKET_STATUS", "MARKET_CONDITIONS", "REGIME", "SENTIMENT"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] MARKET_PULSE fired`);
    try {
      console.log(`[DEFILLAMA] Fetching TVL → ${DEFILLAMA_TVL}`);
      const [solPrice, tvlRes, yieldsRes] = await Promise.all([
        getSOLPrice(),
        fetch(DEFILLAMA_TVL).then(r => r.json()).catch((e: any) => { console.log(`[DEFILLAMA] TVL fetch ERROR: ${e.message}`); return []; }),
        fetch(DEFILLAMA_POOLS).then(r => r.json()).catch((e: any) => { console.log(`[DEFILLAMA] Pools fetch ERROR: ${e.message}`); return { data: [] }; }),
      ]);

      // SOL price analysis
      const solTrend = solPrice > 150 ? "Strong" : solPrice > 100 ? "Moderate" : solPrice > 50 ? "Recovering" : "Weak";

      // TVL trend (last 7 days vs previous 7 days)
      let tvlTrend = "Unknown";
      let tvlCurrent = 0;
      let tvlChange = 0;
      if (Array.isArray(tvlRes) && tvlRes.length > 14) {
        const recent7 = tvlRes.slice(-7);
        const prev7 = tvlRes.slice(-14, -7);
        const recentAvg = recent7.reduce((s: number, d: any) => s + (d.tvl || 0), 0) / 7;
        const prevAvg = prev7.reduce((s: number, d: any) => s + (d.tvl || 0), 0) / 7;
        tvlCurrent = recent7[recent7.length - 1]?.tvl || 0;
        tvlChange = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg * 100) : 0;
        tvlTrend = tvlChange > 5 ? "📈 Growing" : tvlChange > -5 ? "➡️ Stable" : "📉 Declining";
      }

      // Top Solana yield average
      const solanaYields = (yieldsRes.data || [])
        .filter((p: any) => p.chain === "Solana" && p.tvlUsd > 5_000_000 && p.apy > 0);
      const avgYield = solanaYields.length > 0
        ? solanaYields.slice(0, 20).reduce((s: number, p: any) => s + p.apy, 0) / Math.min(20, solanaYields.length)
        : 0;

      // Regime classification
      let regime = "Neutral";
      let emoji = "😐";
      let positionAdvice = "Normal sizing";

      if (tvlChange > 10 && solPrice > 120) {
        regime = "Bull Momentum"; emoji = "🟢"; positionAdvice = "Full positions OK, but watch for FOMO entries";
      } else if (tvlChange > 3) {
        regime = "Cautious Optimism"; emoji = "🟡"; positionAdvice = "Normal sizing, focus on quality";
      } else if (tvlChange < -10) {
        regime = "Risk-Off"; emoji = "🔴"; positionAdvice = "Reduce positions 25-50%, increase stablecoin allocation";
      } else if (tvlChange < -3) {
        regime = "Caution"; emoji = "🟠"; positionAdvice = "Reduce position sizes by 25%, tighten stops";
      }

      let reply = `**Market Pulse — Solana Ecosystem**\n`;
      reply += `\n${emoji} **Regime: ${regime}**\n`;
      reply += `\n**SOL Price:** $${solPrice.toFixed(2)} (${solTrend})`;
      reply += `\n**DeFi TVL:** $${(tvlCurrent / 1_000_000_000).toFixed(2)}B (${tvlTrend}, ${tvlChange > 0 ? "+" : ""}${tvlChange.toFixed(1)}% 7d)`;
      reply += `\n**Avg Yield (Top 20):** ${avgYield.toFixed(2)}%`;
      reply += `\n\n**Position Sizing:** ${positionAdvice}`;

      if (tvlChange < -10) {
        reply += `\n\n⚠️ **Significant TVL outflow detected.** Capital is leaving Solana DeFi. Exercise caution.`;
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error fetching market pulse: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What's the market looking like?" } },
      { name: "Soliza", content: { text: "**Market Pulse — Solana Ecosystem**\n\n🟢 **Regime: Bull Momentum**\n\nSOL Price: $145.20" } },
    ],
  ],
};

// ─── ACTION 13: SMART_MONEY (Birdeye Smart Money API) ───

const TRADER_STYLES: Record<string, string> = {
  all: "All Styles",
  risk_averse: "Risk Averse",
  risk_balancers: "Risk Balancers",
  trenchers: "Trenchers (Degen)",
};

const smartMoneyAction: Action = {
  name: "SMART_MONEY",
  description: "Show what tokens smart money traders are buying on Solana right now. Filter by trader style: risk_averse, risk_balancers, trenchers. Powered by Birdeye smart money tracking.",
  similes: ["SMART_MONEY", "WHAT_ARE_WHALES_BUYING", "SMART_TRADERS", "HOT_TOKENS", "TRENDING", "ALPHA"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] SMART_MONEY fired | input: "${(message.content?.text || "").slice(0, 60)}"`);
    if (!BIRDEYE_API_KEY) {
      console.log("[BIRDEYE] SMART_MONEY SKIPPED (no key)");
      if (callback) callback({ text: "Smart money data requires Birdeye API. Not configured." });
      return;
    }

    const text = (message.content?.text || "").toLowerCase();

    // Detect trader style from message
    let traderStyle = "all";
    if (text.includes("degen") || text.includes("trench")) traderStyle = "trenchers";
    else if (text.includes("safe") || text.includes("conservative") || text.includes("risk averse")) traderStyle = "risk_averse";
    else if (text.includes("balance") || text.includes("moderate")) traderStyle = "risk_balancers";

    // Detect interval
    let interval = "1d";
    if (text.includes("7d") || text.includes("week")) interval = "7d";
    else if (text.includes("30d") || text.includes("month")) interval = "30d";

    // Detect sort preference
    let sortBy = "smart_traders_no";
    if (text.includes("flow") || text.includes("volume")) sortBy = "net_flow";
    else if (text.includes("cap") || text.includes("market")) sortBy = "market_cap";

    try {
      const url = `${BIRDEYE_BASE}/smart-money/v1/token/list?interval=${interval}&trader_style=${traderStyle}&sort_by=${sortBy}&sort_type=desc&offset=0&limit=15`;
      console.log(`[BIRDEYE] Smart Money → ${url}`);
      const res = await fetch(url, { headers: birdeyeHeaders() });
      console.log(`[BIRDEYE] Smart Money status=${res.status}`);
      const data = await res.json();
      console.log(`[BIRDEYE] Smart Money success=${data.success} items=${data.data?.items?.length || 0}`);

      if (!data.success || !data.data?.items?.length) {
        if (callback) callback({ text: "No smart money data available right now. Try again shortly." });
        return;
      }

      const tokens = data.data.items;

      let reply = `**Smart Money — ${TRADER_STYLES[traderStyle] || "All"} (${interval})**\n`;
      reply += `_Sorted by: ${sortBy === "smart_traders_no" ? "# Smart Traders" : sortBy === "net_flow" ? "Net Flow" : "Market Cap"}_\n`;

      for (const t of tokens) {
        const price = t.price || 0;
        const priceStr = price > 0 ? `$${price.toFixed(price < 0.01 ? 6 : 4)}` : "?";
        const change = t.price_change_percent != null ? `${t.price_change_percent > 0 ? "+" : ""}${t.price_change_percent.toFixed(1)}%` : "";
        const traders = t.smart_traders_no || 0;
        const flow = t.net_flow || 0;
        const flowStr = flow > 0 ? `+$${(flow / 1000).toFixed(1)}k` : `-$${(Math.abs(flow) / 1000).toFixed(1)}k`;
        const mc = t.market_cap ? `$${(t.market_cap / 1_000_000).toFixed(1)}M` : "?";

        reply += `\n**${t.symbol || t.name || "???"}** ${priceStr} ${change}`;
        reply += `\n  Traders: ${traders} | Flow: ${flowStr} | MC: ${mc}`;
      }

      reply += `\n\n_Live data from Birdeye Smart Money. Not financial advice._`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      if (callback) callback({ text: `Error fetching smart money data: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What are smart money traders buying?" } },
      { name: "Soliza", content: { text: "**Smart Money — All Styles (1d)**\n\n**BONK** $0.00001883 +43.0%\n  Traders: 308 | Flow: +$52.8k | MC: $18.6M" } },
    ],
    [
      { name: "{{user1}}", content: { text: "Show me degen smart money picks this week" } },
      { name: "Soliza", content: { text: "**Smart Money — Trenchers (Degen) (7d)**\n\n..." } },
    ],
  ],
};

// ─── ACTION 14: PREDICTION_MARKETS (Jupiter Prediction API) ───

const PREDICTION_CATEGORIES = ["crypto", "sports", "politics", "esports", "culture", "economics", "tech"];

const predictionMarketsAction: Action = {
  name: "PREDICTION_MARKETS",
  description: "Show live prediction markets from Jupiter — real-money bets on crypto, politics, sports, and more. Prices reflect crowd-sourced probabilities. Filter by category or search for specific topics.",
  similes: ["PREDICTIONS", "PREDICTION_MARKET", "BETTING_ODDS", "WILL_SOL", "PROBABILITY", "FORECAST", "WHAT_ARE_ODDS"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    const text = (message.content?.text || "").toLowerCase();
    console.log(`[ACTION] PREDICTION_MARKETS fired | input: "${text.slice(0, 60)}"`);

    // Detect category from message
    let category = "";
    for (const cat of PREDICTION_CATEGORIES) {
      if (text.includes(cat)) { category = cat; break; }
    }
    // Common aliases
    if (!category) {
      if (text.includes("sol") || text.includes("btc") || text.includes("eth") || text.includes("bitcoin") || text.includes("token")) category = "crypto";
      else if (text.includes("election") || text.includes("trump") || text.includes("president")) category = "politics";
      else if (text.includes("nfl") || text.includes("nba") || text.includes("game") || text.includes("match")) category = "sports";
    }

    // Detect if searching for something specific
    const searchMatch = text.match(/(?:search|find|about|will|predict)\s+(.+?)(?:\?|$)/);
    const searchQuery = searchMatch ? searchMatch[1].trim() : "";

    // Detect filter
    let filter = "trending";
    if (text.includes("new") || text.includes("latest")) filter = "new";
    else if (text.includes("live") || text.includes("active")) filter = "live";

    try {
      let events: any[] = [];

      if (searchQuery && searchQuery.length > 2) {
        // Search mode
        console.log(`[PREDICTION] Searching: "${searchQuery}"`);
        const res = await fetch(`${JUP_PREDICTION}/events/search?query=${encodeURIComponent(searchQuery)}&limit=10`);
        console.log(`[PREDICTION] Search status=${res.status}`);
        if (!res.ok) { console.log(`[PREDICTION] Search failed: ${res.status}`); }
        else {
          const text = await res.text();
          if (text && (text[0] === '{' || text[0] === '[')) {
            const data = JSON.parse(text);
            events = data.data || data || [];
          } else {
            console.log(`[PREDICTION] Search non-JSON: "${text.slice(0, 100)}"`);
          }
        }
      } else {
        // Browse mode
        const params = new URLSearchParams({
          includeMarkets: "true",
          sortBy: "volume",
          sortDirection: "desc",
          start: "0",
          end: "12",
          filter,
        });
        if (category) params.set("category", category);
        const url = `${JUP_PREDICTION}/events?${params}`;
        console.log(`[PREDICTION] Browse → ${url}`);
        const res = await fetch(url);
        console.log(`[PREDICTION] Browse status=${res.status}`);
        if (!res.ok) { console.log(`[PREDICTION] Browse failed: ${res.status}`); }
        else {
          const text = await res.text();
          if (text && (text[0] === '{' || text[0] === '[')) {
            const data = JSON.parse(text);
            events = data.data || [];
          } else {
            console.log(`[PREDICTION] Browse non-JSON: "${text.slice(0, 100)}"`);
          }
        }
      }

      if (!events.length) {
        if (callback) callback({ text: `No prediction markets found${category ? ` for ${category}` : ""}${searchQuery ? ` matching "${searchQuery}"` : ""}. Try a different category or search term.` });
        return;
      }

      console.log(`[PREDICTION] Got ${events.length} events`);
      if (events.length > 0) {
        const first = events[0];
        console.log(`[PREDICTION] First event: "${first.metadata?.title}" | vol=$${(parseInt(first.volumeUsd || "0") / 1_000_000_000_000).toFixed(1)}M | markets=${first.markets?.length || 0}`);
        if (first.markets?.[0]?.pricing) {
          const p = first.markets[0].pricing;
          console.log(`[PREDICTION] First market: "${first.markets[0].title}" | YES=${(p.buyYesPriceUsd / 1_000_000 * 100).toFixed(0)}% | NO=${(p.buyNoPriceUsd / 1_000_000 * 100).toFixed(0)}%`);
        }
      }

      let reply = `**Prediction Markets${category ? ` — ${category.charAt(0).toUpperCase() + category.slice(1)}` : ""}${searchQuery ? ` — "${searchQuery}"` : ""}**\n`;
      reply += `_Powered by Jupiter Prediction Markets (real-money bets)_\n`;

      for (const event of events.slice(0, 8)) {
        const title = event.metadata?.title || event.title || "Untitled";
        const vol = event.volumeUsd ? `$${(parseInt(event.volumeUsd) / 1_000_000_000_000).toFixed(1)}M` : "";
        const vol24 = event.volume24hr ? `$${(parseInt(event.volume24hr) / 1_000_000_000_000).toFixed(1)}M 24h` : "";

        reply += `\n**${title}**`;
        if (vol) reply += ` | Vol: ${vol}${vol24 ? ` (${vol24})` : ""}`;

        // Show markets (outcomes) with probabilities
        const markets = event.markets || [];
        for (const m of markets.slice(0, 4)) {
          const yesPrice = m.pricing?.buyYesPriceUsd;
          if (yesPrice != null) {
            const prob = (yesPrice / 1_000_000 * 100).toFixed(0);
            const mVol = m.pricing?.volume ? ` | ${m.pricing.volume.toLocaleString()} contracts` : "";
            reply += `\n  ${m.title || "YES"}: **${prob}%** ($${(yesPrice / 1_000_000).toFixed(2)})${mVol}`;
          }
        }
      }

      reply += `\n\n_Prices = implied probability (e.g. $0.73 = 73% chance). Backed by real money on Solana._`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      console.log(`[PREDICTION] ERROR: ${error.message}`);
      if (callback) callback({ text: `Error fetching prediction markets: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What do prediction markets say about crypto?" } },
      { name: "Soliza", content: { text: "**Prediction Markets — Crypto**\n\n**Will Bitcoin hit $100k by 2026?**\n  YES: **82%** ($0.82) | 45,230 contracts" } },
    ],
    [
      { name: "{{user1}}", content: { text: "Search prediction markets for Solana" } },
      { name: "Soliza", content: { text: "**Prediction Markets — \"Solana\"**\n\n**Will SOL reach $200?**\n  YES: **45%** ($0.45)" } },
    ],
  ],
};

// ─── ACTION 15: PERPS_INTEL (Jupiter Perpetuals) ───

const PERPS_MINTS: Record<string, string> = {
  sol: "So11111111111111111111111111111111111111112",
  eth: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  btc: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
};

const perpsIntelAction: Action = {
  name: "PERPS_INTEL",
  description: "Jupiter Perpetuals market intelligence — JLP pool TVL, APR, per-asset utilization (long vs short), borrow/funding rates, lending stats. Institutional-grade market structure data.",
  similes: ["PERPS", "PERPETUALS", "FUNDING_RATE", "JLP", "LEVERAGE", "LONG_SHORT", "OPEN_INTEREST", "BORROW_RATE"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    console.log(`[ACTION] PERPS_INTEL fired`);

    try {
      // Fetch JLP pool overview + per-asset pool info in parallel
      const [jlpRes, solPoolRes, loansRes] = await Promise.all([
        fetch(`${JUP_PERPS}/jlp-info`).then(r => r.json()).catch(() => null),
        fetch(`${JUP_PERPS}/pool-info?mint=${PERPS_MINTS.sol}`).then(r => r.json()).catch(() => null),
        fetch(`${JUP_PERPS}/loans/info`).then(r => r.json()).catch(() => null),
      ]);

      console.log(`[PERPS] jlp-info: ${jlpRes ? "OK" : "FAIL"}`);
      console.log(`[PERPS] pool-info: ${solPoolRes ? "OK" : "FAIL"}`);
      console.log(`[PERPS] loans-info: ${loansRes ? "OK" : "FAIL"}`);
      if (jlpRes) console.log(`[PERPS] TVL=$${jlpRes.aumUsdFormatted} | APR=${jlpRes.jlpAprPct}% | custodies=${jlpRes.custodies?.length}`);
      if (solPoolRes) console.log(`[PERPS] SOL longUtil=${solPoolRes.longUtilizationPercent}% | shortUtil=${solPoolRes.shortUtilizationPercent}% | longBorrow=${solPoolRes.longBorrowRatePercent}%/hr`);

      let reply = `**Jupiter Perps — Market Intelligence**\n`;

      // JLP Overview
      if (jlpRes) {
        reply += `\n**JLP Pool:** $${parseFloat(jlpRes.aumUsdFormatted || "0").toLocaleString()} TVL`;
        reply += ` | APR: ${jlpRes.jlpAprPct || "?"}% | APY: ${jlpRes.jlpApyPct || "?"}%`;
        reply += `\nJLP Price: $${parseFloat(jlpRes.jlpPriceUsdFormatted || "0").toFixed(4)}`;

        // Per-asset breakdown
        if (jlpRes.custodies && jlpRes.custodies.length > 0) {
          reply += `\n\n**Asset Utilization:**`;
          for (const c of jlpRes.custodies) {
            const aum = parseFloat(c.aumUsdFormatted || "0");
            const weight = c.currentWeightagePct || "?";
            const target = c.targetWeightagePct || "?";
            const util = c.utilizationPct || "?";
            reply += `\n  **${c.symbol}** | AUM: $${(aum / 1_000_000).toFixed(0)}M | Weight: ${weight}% (target ${target}%) | Util: ${util}%`;
          }
        }
      }

      // SOL-specific pool details
      if (solPoolRes) {
        reply += `\n\n**SOL Perps Detail:**`;
        reply += `\n  Long borrow: ${solPoolRes.longBorrowRatePercent || "?"}%/hr | Util: ${solPoolRes.longUtilizationPercent || "?"}%`;
        reply += `\n  Short borrow: ${solPoolRes.shortBorrowRatePercent || "?"}%/hr | Util: ${solPoolRes.shortUtilizationPercent || "?"}%`;
        reply += `\n  Open fee: ${solPoolRes.openFeePercent || "?"}%`;
      }

      // Lending
      if (loansRes) {
        const info = Array.isArray(loansRes) ? loansRes : [loansRes];
        const usdc = info.find((l: any) => l.symbol === "USDC" || l.mint?.includes("EPjFWdd5"));
        if (usdc) {
          reply += `\n\n**USDC Lending:** APR: ${usdc.borrowAprPct || usdc.apr || "?"}% | Util: ${usdc.utilizationPct || "?"}%`;
        }
      }

      reply += `\n\n_Live data from Jupiter Perps. All rates are variable._`;

      if (callback) callback({ text: reply });
    } catch (error: any) {
      console.log(`[PERPS] ERROR: ${error.message}`);
      if (callback) callback({ text: `Error fetching perps data: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "How's the Jupiter perps market?" } },
      { name: "Soliza", content: { text: "**Jupiter Perps — Market Intelligence**\n\nJLP Pool: $895M TVL | APR: 18.9%" } },
    ],
  ],
};

// ─── ACTION 16: DEFI_POSITIONS (Jupiter Portfolio + Perps) ───

const defiPositionsAction: Action = {
  name: "DEFI_POSITIONS",
  description: "Scan a wallet for active DeFi positions — Jupiter perps (longs/shorts with PNL), DCA orders, limit orders, locks, and LP positions. Shows position sizes, entry prices, and unrealized profit/loss.",
  similes: ["DEFI_POSITIONS", "POSITIONS", "ACTIVE_DEFI", "JUPITER_POSITIONS", "MY_POSITIONS", "OPEN_POSITIONS"],
  validate: async () => true,
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback): Promise<void> => {
    const address = extractAddress(message.content?.text || "");
    console.log(`[ACTION] DEFI_POSITIONS fired | address: ${address || "NONE"}`);
    if (!address) {
      if (callback) callback({ text: "Please provide a Solana wallet address to scan for DeFi positions." });
      return;
    }

    try {
      // Fetch Jupiter portfolio + perps positions in parallel
      const [portfolioRes, perpsRes] = await Promise.all([
        fetch(`${JUP_PORTFOLIO}/positions/${address}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${JUP_PERPS}/positions?walletAddress=${address}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      console.log(`[DEFI] Portfolio: ${portfolioRes ? `${portfolioRes.elements?.length || 0} elements, duration=${portfolioRes.duration}ms` : "FAIL"}`);
      console.log(`[DEFI] Perps: ${perpsRes ? `${Array.isArray(perpsRes) ? perpsRes.length + " positions" : "obj"}` : "FAIL"}`);
      if (portfolioRes?.elements?.length > 0) {
        const labels = portfolioRes.elements.map((e: any) => e.label || e.name).join(", ");
        const totalVal = portfolioRes.elements.reduce((s: number, e: any) => s + (e.value || 0), 0);
        console.log(`[DEFI] Portfolio labels: [${labels}] | totalValue=$${totalVal.toFixed(2)}`);
      }

      let reply = `**DeFi Positions: ${shortAddr(address)}**\n`;
      let totalValue = 0;
      let hasPositions = false;

      // Jupiter Perps positions — response is { dataList: [...], count: N }
      const perps = Array.isArray(perpsRes) ? perpsRes : perpsRes?.dataList || perpsRes?.positions || perpsRes?.data || [];
      if (perps.length > 0) {
        hasPositions = true;
        reply += `\n**Jupiter Perps:**`;
        for (const p of perps) {
          const side = p.side || (p.sizeUsd > 0 ? "Long" : "Short");
          const size = p.sizeUsd ? `$${(p.sizeUsd / 1_000_000).toFixed(2)}` : "?";
          const entry = p.price ? `$${(p.price / 1_000_000).toFixed(2)}` : "?";
          const pnl = p.pnlUsd || p.unrealizedPnlUsd || 0;
          const pnlStr = pnl !== 0 ? `${pnl > 0 ? "+" : ""}$${(pnl / 1_000_000).toFixed(2)}` : "?";
          const collateral = p.collateralUsd ? `$${(p.collateralUsd / 1_000_000).toFixed(2)}` : "";

          reply += `\n  **${side}** | Size: ${size} | Entry: ${entry} | PNL: ${pnlStr}${collateral ? ` | Collateral: ${collateral}` : ""}`;
          if (p.sizeUsd) totalValue += p.sizeUsd / 1_000_000;
        }
      }

      // Jupiter Portfolio positions (DCA, locks, limit orders, LP)
      const elements = portfolioRes?.elements || [];
      if (elements.length > 0) {
        hasPositions = true;
        // Group by label
        const grouped: Record<string, any[]> = {};
        for (const el of elements) {
          const label = el.label || el.name || "Other";
          if (!grouped[label]) grouped[label] = [];
          grouped[label].push(el);
        }

        const tokenInfo = portfolioRes?.tokenInfo?.solana || {};

        for (const [label, items] of Object.entries(grouped)) {
          reply += `\n\n**Jupiter ${label}:**`;
          for (const item of items) {
            const val = item.value ? `$${item.value.toFixed(2)}` : "";
            totalValue += item.value || 0;

            // Show individual assets in the position
            const assets = item.data?.assets || [];
            if (assets.length > 0) {
              for (const asset of assets.slice(0, 3)) {
                const mint = asset.data?.address || "";
                const sym = tokenInfo[mint]?.symbol || mint.slice(0, 6) + "...";
                const amount = asset.data?.amount || 0;
                const assetVal = asset.value ? `$${asset.value.toFixed(2)}` : "";
                reply += `\n  ${sym}: ${amount.toFixed(amount < 1 ? 6 : 2)} ${assetVal}`;
              }
            } else {
              reply += `\n  Value: ${val}`;
            }

            if (item.data?.link) {
              reply += `\n  _${item.data.link}_`;
            }
          }
        }
      }

      if (!hasPositions) {
        reply += `\nNo active DeFi positions found on Jupiter for this wallet.`;
      } else {
        reply += `\n\n**Total DeFi Value: ~$${totalValue.toFixed(2)}**`;
      }

      if (callback) callback({ text: reply });
    } catch (error: any) {
      console.log(`[DEFI] ERROR: ${error.message}`);
      if (callback) callback({ text: `Error fetching DeFi positions: ${error.message}` });
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show DeFi positions for vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg" } },
      { name: "Soliza", content: { text: "**DeFi Positions: vine...PTg**\n\n**Jupiter Perps:**\n  SOL Long | Size: $5,000 | PNL: +$312" } },
    ],
  ],
};

// ─── PLUGIN EXPORT ───

export const solwatchPlugin: Plugin = {
  name: "soliza",
  description: "Solana DeFi portfolio intelligence — 16 actions: wallet monitoring, price checking, portfolio analysis, risk scoring, strategy advice, whale tracking, live yields, transaction history, rug scanning, wallet profiling, token scanning, market pulse, smart money, prediction markets, perps intel, and DeFi position scanning",
  actions: [
    checkWalletAction,
    checkPriceAction,
    portfolioSummaryAction,
    liveYieldsAction,
    transactionHistoryAction,
    riskScoreAction,
    strategyAdvisorAction,
    whaleTrackerAction,
    rugScannerAction,
    walletPersonalityAction,
    tokenScannerAction,
    marketPulseAction,
    smartMoneyAction,
    predictionMarketsAction,
    perpsIntelAction,
    defiPositionsAction,
  ],
  providers: [],
  evaluators: [],
};

export default solwatchPlugin;
