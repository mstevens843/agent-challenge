/**
 * solana.js — Direct Solana RPC, Jupiter, and DefiLlama API calls for dashboard
 * These bypass the agent and fetch data directly for real-time dashboard display.
 */

const RPC_URL = "https://solana-mainnet.core.chainstack.com/451cff0d6266cda453c02a8b34074bff";
const BIRDEYE_BASE = "https://public-api.birdeye.so";
const BIRDEYE_API_KEY = "9686a7e74eb741acaf12417b0f80d93d";
const JUPITER_V3 = "https://api.jup.ag/price/v3";
const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

const KNOWN_TOKENS = {
  "So11111111111111111111111111111111111111112": { symbol: "SOL", name: "Solana" },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", name: "Tether" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK", name: "Bonk" },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": { symbol: "JUP", name: "Jupiter" },
  "4k3Dyjzvzp8eMZFUEN6Rg8rBqAhxh3p9c3XLf4SArtDF": { symbol: "RAY", name: "Raydium" },
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": { symbol: "ORCA", name: "Orca" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL", name: "Marinade SOL" },
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": { symbol: "jitoSOL", name: "Jito SOL" },
};

const STABLECOIN_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

const KNOWN_PROGRAMS = {
  "11111111111111111111111111111111": "Transfer",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "Token",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Swap",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Swap",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Swap",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Swap",
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD": "Stake",
};

async function rpcCall(method, params) {
  console.log(`[DASH-RPC] ${method} → ${RPC_URL.slice(0, 40)}...`);
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) console.log(`[DASH-RPC] ${method} ERROR:`, data.error);
  else console.log(`[DASH-RPC] ${method} OK`);
  return data;
}

// ─── Wallet Data ───

async function fetchWalletData(address) {
  console.log(`[DASH] fetchWalletData(${address.slice(0, 8)}...)`);

  const [balData, tokenData] = await Promise.all([
    rpcCall("getBalance", [address]),
    rpcCall("getTokenAccountsByOwner", [
      address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]),
  ]);

  const sol = (balData.result?.value || 0) / 1_000_000_000;
  const tokens = (tokenData.result?.value || [])
    .filter(t => t.account.data.parsed.info.tokenAmount.uiAmount > 0)
    .map(t => {
      const info = t.account.data.parsed.info;
      return {
        mint: info.mint,
        amount: info.tokenAmount.uiAmount,
        symbol: KNOWN_TOKENS[info.mint]?.symbol || info.mint.slice(0, 6) + "...",
        name: KNOWN_TOKENS[info.mint]?.name || "Unknown Token",
        isStable: STABLECOIN_MINTS.has(info.mint),
      };
    });

  return { sol, tokens };
}

// ─── Token Prices ───

async function fetchTokenPrices(mints) {
  console.log(`[DASH-PRICE] fetchTokenPrices for ${mints.length} mints`);
  if (mints.length === 0) return {};
  const prices = {};

  // Try Birdeye defi/multi_price (POST, authenticated)
  try {
    const url = `${BIRDEYE_BASE}/defi/multi_price?include_liquidity=true`;
    console.log(`[DASH-BIRDEYE] POST multi_price → ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": BIRDEYE_API_KEY,
        "x-chain": "solana",
      },
      body: JSON.stringify({ list_address: mints.join(",") }),
    });
    console.log(`[DASH-BIRDEYE] multi_price status=${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`[DASH-BIRDEYE] multi_price success=${data.success}`);
      if (data.data) {
        for (const mint of mints) {
          const p = data.data[mint]?.value;
          if (p) prices[mint] = p;
        }
      }
      console.log(`[DASH-BIRDEYE] Got prices for ${Object.keys(prices).length}/${mints.length} mints`);
      if (Object.keys(prices).length > 0) return prices;
    }
  } catch (e) {
    console.log(`[DASH-BIRDEYE] multi_price failed: ${e.message}`);
  }

  // Fallback: Jupiter V3
  try {
    console.log(`[DASH-JUPITER] Fallback → ${JUPITER_V3}`);
    const res = await fetch(`${JUPITER_V3}?ids=${mints.join(",")}`);
    console.log(`[DASH-JUPITER] status=${res.status}`);
    if (res.ok) {
      const data = await res.json();
      for (const mint of mints) {
        const p = data[mint]?.usdPrice;
        if (p) prices[mint] = p;
      }
      console.log(`[DASH-JUPITER] Got prices for ${Object.keys(prices).length}/${mints.length} mints`);
    }
  } catch (e) {
    console.log(`[DASH-JUPITER] fallback failed: ${e.message}`);
  }

  return prices;
}

async function fetchSOLPrice() {
  console.log(`[DASH-PRICE] fetchSOLPrice`);
  const prices = await fetchTokenPrices(["So11111111111111111111111111111111111111112"]);
  const price = prices["So11111111111111111111111111111111111111112"] || 0;
  console.log(`[DASH-PRICE] SOL price = $${price}`);
  return price;
}

// ─── DeFi Yields ───

async function fetchSolanaYields() {
  console.log(`[DASH-DEFILLAMA] fetchSolanaYields → ${DEFILLAMA_POOLS_URL}`);
  const res = await fetch(DEFILLAMA_POOLS_URL);
  const data = await res.json();
  return data.data
    .filter(p => p.chain === "Solana" && p.tvlUsd > 1_000_000 && p.apy > 0)
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 15)
    .map(p => ({
      project: p.project,
      symbol: p.symbol,
      apy: p.apy,
      tvl: p.tvlUsd,
      pool: p.pool,
    }));
}

// ─── Transaction History ───

async function fetchTransactionHistory(address, limit = 10) {
  console.log(`[DASH-RPC] fetchTransactionHistory(${address.slice(0, 8)}..., limit=${limit})`);
  const sigData = await rpcCall("getSignaturesForAddress", [address, { limit }]);
  const sigs = sigData.result || [];

  const txs = [];
  for (const sig of sigs) {
    const txData = await rpcCall("getTransaction", [
      sig.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);

    let type = "Unknown";
    if (txData.result?.transaction?.message?.instructions) {
      for (const ix of txData.result.transaction.message.instructions) {
        if (KNOWN_PROGRAMS[ix.programId]) {
          type = KNOWN_PROGRAMS[ix.programId];
          break;
        }
      }
    }

    txs.push({
      signature: sig.signature,
      date: new Date((sig.blockTime || 0) * 1000),
      status: sig.err ? "Failed" : "Success",
      type,
      fee: txData.result?.meta?.fee ? txData.result.meta.fee / 1_000_000_000 : 0,
    });
  }

  return txs;
}

// ─── Risk Score Calculation ───

function calculateRiskScore(sol, tokens, prices) {
  const solMint = "So11111111111111111111111111111111111111112";
  const solPrice = prices[solMint] || 0;
  const solValue = sol * solPrice;

  let totalUSD = solValue;
  const holdings = [{ mint: solMint, usd: solValue, isStable: false }];

  for (const t of tokens) {
    const price = prices[t.mint] || 0;
    const usd = t.amount * price;
    totalUSD += usd;
    holdings.push({ mint: t.mint, usd, isStable: t.isStable });
  }

  if (totalUSD < 0.01) return { score: 0, level: "N/A", factors: {} };

  const largestPct = Math.max(...holdings.map(h => h.usd / totalUSD * 100));
  const stablePct = holdings.filter(h => h.isStable).reduce((s, h) => s + h.usd, 0) / totalUSD * 100;
  const tokenCount = holdings.filter(h => h.usd > 1).length;
  const diversityScore = tokenCount >= 8 ? 20 : tokenCount >= 5 ? 40 : tokenCount >= 3 ? 60 : 80;

  const score = Math.round(
    largestPct * 0.40 +
    (100 - stablePct) * 0.25 +
    diversityScore * 0.35
  );

  const level = score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : score >= 25 ? "LOW-MEDIUM" : "LOW";

  return {
    score,
    level,
    totalUSD,
    factors: {
      concentration: largestPct.toFixed(1),
      stablecoins: stablePct.toFixed(1),
      diversity: tokenCount,
    },
  };
}

// ─── Wallet Intelligence (Helius-powered) ───

const HELIUS_KEY = "39cdc116-aafd-4585-8452-887e57ff0bab";
const HELIUS_URL = "https://api.helius.xyz";
const WSOL = "So11111111111111111111111111111111111111112";

async function fetchWalletProfile(address) {
  console.log(`[DASH-INTEL] fetchWalletProfile(${address.slice(0, 8)}...)`);
  if (!HELIUS_KEY) return null;

  // Fetch up to 300 txs (3 pages)
  const allTxs = [];
  let beforeSig;
  for (let page = 0; page < 3; page++) {
    const url = `${HELIUS_URL}/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=100${beforeSig ? `&before=${beforeSig}` : ""}`;
    console.log(`[DASH-INTEL] Helius page ${page + 1}`);
    const res = await fetch(url);
    if (!res.ok) break;
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;
    allTxs.push(...txs);
    beforeSig = txs[txs.length - 1].signature;
    if (txs.length < 100) break;
  }

  console.log(`[DASH-INTEL] Fetched ${allTxs.length} txs`);
  const swaps = allTxs.filter(tx => tx.type === "SWAP");
  console.log(`[DASH-INTEL] ${swaps.length} swaps`);

  if (swaps.length === 0) return { tradeCount: 0, personalityType: "UNKNOWN" };

  const tokenTrades = {};
  let totalVolume = 0;

  for (const tx of swaps) {
    let solOut = 0, solIn = 0;
    for (const nt of (tx.nativeTransfers || [])) {
      const amt = (nt.amount || 0) / 1e9;
      if (nt.fromUserAccount === address) solOut += amt;
      if (nt.toUserAccount === address) solIn += amt;
    }
    for (const tt of (tx.tokenTransfers || [])) {
      if (tt.mint === WSOL) {
        if (tt.fromUserAccount === address) solOut += (tt.tokenAmount || 0);
        if (tt.toUserAccount === address) solIn += (tt.tokenAmount || 0);
      }
    }
    const other = (tx.tokenTransfers || []).find(tt => tt.mint && tt.mint !== WSOL);
    const mint = other?.mint || "unknown";
    if (!tokenTrades[mint]) tokenTrades[mint] = { buySol: 0, sellSol: 0, buyCount: 0, sellCount: 0 };
    if (solOut > solIn) { tokenTrades[mint].buySol += solOut - solIn; tokenTrades[mint].buyCount++; }
    else if (solIn > solOut) { tokenTrades[mint].sellSol += solIn - solOut; tokenTrades[mint].sellCount++; }
    totalVolume += solOut + solIn;
  }

  let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0, totalPnl = 0;
  let biggestWin = 0, biggestLoss = 0, completed = 0, unique = 0;

  for (const trades of Object.values(tokenTrades)) {
    if (trades.buyCount > 0 && trades.sellCount > 0) {
      completed++; unique++;
      const pnl = trades.sellSol - trades.buySol;
      totalPnl += pnl;
      if (pnl > 0) { wins++; grossProfit += pnl; if (pnl > biggestWin) biggestWin = pnl; }
      else { losses++; grossLoss += Math.abs(pnl); if (pnl < biggestLoss) biggestLoss = pnl; }
    } else { unique++; }
  }

  const tradeCount = swaps.length;
  const winRate = completed > 0 ? wins / completed : null;
  const riskScore = winRate != null ? Math.max(0, 1 - winRate) : 0.5;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : null);
  const avgSize = tradeCount > 0 ? totalVolume / tradeCount : 0;

  let personality = "UNKNOWN", confidence = 0.3;
  if (tradeCount >= 5) {
    if (winRate >= 0.7 && tradeCount >= 20) { personality = "ELITE_SNIPER"; confidence = 0.8; }
    else if (avgSize >= 10) { personality = "WHALE"; confidence = tradeCount >= 20 ? 0.8 : 0.5; }
    else if (tradeCount >= 50) { personality = "BOT_TRADER"; confidence = 0.8; }
    else if (winRate >= 0.5) { personality = "ACCUMULATOR"; confidence = tradeCount >= 20 ? 0.8 : 0.5; }
    else { personality = "RETAIL_FOLLOWER"; confidence = tradeCount >= 20 ? 0.8 : 0.5; }
  }

  console.log(`[DASH-INTEL] Result: ${personality} | PNL=${totalPnl.toFixed(3)} | WR=${winRate != null ? (winRate*100).toFixed(0)+"%" : "N/A"}`);

  return {
    tradeCount, totalVolume: Math.round(totalVolume * 100) / 100,
    avgTradeSize: Math.round(avgSize * 1000) / 1000,
    winRate, riskScore, personalityType: personality, personalityConfidence: confidence,
    completedTrades: completed, totalPnlSol: Math.round(totalPnl * 1000) / 1000,
    profitFactor: profitFactor != null ? Math.round(profitFactor * 100) / 100 : null,
    biggestWinSol: biggestWin > 0 ? Math.round(biggestWin * 1000) / 1000 : null,
    biggestLossSol: biggestLoss < 0 ? Math.round(biggestLoss * 1000) / 1000 : null,
    uniqueTokens: unique, txsFetched: allTxs.length,
  };
}

// ─── Prediction Markets ───

const JUP_PREDICTION_URL = "https://api.jup.ag/prediction/v1";

async function fetchPredictionMarkets(category = "", filter = "trending") {
  const params = new URLSearchParams({
    includeMarkets: "true",
    sortBy: "volume",
    sortDirection: "desc",
    start: "0",
    end: "10",
    filter,
  });
  if (category) params.set("category", category);
  const url = `${JUP_PREDICTION_URL}/events?${params}`;
  console.log(`[DASH-PREDICTION] Fetching → ${url}`);

  const res = await fetch(url);
  console.log(`[DASH-PREDICTION] status=${res.status}`);
  if (!res.ok) {
    console.log(`[DASH-PREDICTION] Failed: ${res.status}`);
    return [];
  }
  const text = await res.text();
  if (!text || (text[0] !== '{' && text[0] !== '[')) {
    console.log(`[DASH-PREDICTION] Non-JSON response: "${text.slice(0, 80)}"`);
    return [];
  }
  const data = JSON.parse(text);
  const events = data.data || [];
  console.log(`[DASH-PREDICTION] Got ${events.length} events`);

  return events.map(event => {
    const markets = (event.markets || []).map(m => {
      const yesPrice = m.pricing?.buyYesPriceUsd || 0;
      const noPrice = m.pricing?.buyNoPriceUsd || 0;
      return {
        title: m.title || "YES",
        yesPct: (yesPrice / 1_000_000 * 100),
        noPct: (noPrice / 1_000_000 * 100),
        yesPrice: yesPrice / 1_000_000,
        noPrice: noPrice / 1_000_000,
        volume: m.pricing?.volume || 0,
      };
    });

    return {
      title: event.metadata?.title || "Untitled",
      category: event.category || "",
      imageUrl: event.metadata?.imageUrl || "",
      volumeUsd: parseInt(event.volumeUsd || "0") / 1_000_000_000_000,
      volume24h: parseInt(event.volume24hr || "0") / 1_000_000_000_000,
      markets,
    };
  });
}

// ─── Market Overview Data ───

async function fetchFearAndGreed() {
  console.log("[DASH-MARKET] Fetching Fear & Greed");
  try {
    const res = await fetch("https://api.alternative.me/fng/");
    const data = await res.json();
    const fg = data.data?.[0];
    console.log(`[DASH-MARKET] Fear & Greed: ${fg?.value} (${fg?.value_classification})`);
    return { value: parseInt(fg?.value || "0"), classification: fg?.value_classification || "Unknown" };
  } catch (e) {
    console.log(`[DASH-MARKET] Fear & Greed ERROR: ${e.message}`);
    return { value: 0, classification: "Error" };
  }
}

async function fetchBTCDominance() {
  console.log("[DASH-MARKET] Fetching BTC Dominance");
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global");
    const data = await res.json();
    const btc = data.data?.market_cap_percentage?.btc || 0;
    console.log(`[DASH-MARKET] BTC Dominance: ${btc.toFixed(1)}%`);
    return btc;
  } catch (e) {
    console.log(`[DASH-MARKET] BTC Dominance ERROR: ${e.message}`);
    return 0;
  }
}

async function fetchSolanaTVL() {
  console.log("[DASH-MARKET] Fetching Solana TVL");
  try {
    const res = await fetch("https://api.llama.fi/v2/historicalChainTvl/Solana");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      console.log(`[DASH-MARKET] Solana TVL: $${(latest.tvl / 1e9).toFixed(2)}B`);
      return latest.tvl;
    }
    return 0;
  } catch (e) {
    console.log(`[DASH-MARKET] Solana TVL ERROR: ${e.message}`);
    return 0;
  }
}

// ─── Token Info (for token mode) ───

async function fetchTokenInfo(mint) {
  console.log(`[DASH-TOKEN] fetchTokenInfo(${mint.slice(0, 8)}...)`);

  const [overview, security, holders] = await Promise.all([
    fetchBirdeyeOverview(mint),
    fetchBirdeyeSecurity(mint),
    fetchTopHolders(mint),
  ]);

  // Get age from Birdeye security.creationTime (accurate)
  const ageSeconds = getTokenAgeFromSecurity(security);

  return { overview, security, holders, ageSeconds };
}

async function fetchBirdeyeOverview(mint) {
  console.log(`[DASH-BIRDEYE] token_overview(${mint.slice(0, 8)}...)`);
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/token_overview?address=${mint}`, {
      headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" },
    });
    console.log(`[DASH-BIRDEYE] token_overview status=${res.status}`);
    const data = await res.json();
    console.log(`[DASH-BIRDEYE] token_overview success=${data.success} price=${data.data?.price}`);
    return data.data || null;
  } catch (e) {
    console.log(`[DASH-BIRDEYE] token_overview ERROR: ${e.message}`);
    return null;
  }
}

async function fetchBirdeyeSecurity(mint) {
  console.log(`[DASH-BIRDEYE] token_security(${mint.slice(0, 8)}...)`);
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/token_security?address=${mint}`, {
      headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" },
    });
    console.log(`[DASH-BIRDEYE] token_security status=${res.status}`);
    const data = await res.json();
    return data.data || null;
  } catch (e) {
    console.log(`[DASH-BIRDEYE] token_security ERROR: ${e.message}`);
    return null;
  }
}

async function fetchTopHolders(mint) {
  console.log(`[DASH-RPC] getTokenLargestAccounts(${mint.slice(0, 8)}...)`);
  // Get total supply (the CORRECT denominator)
  const [holdersData, supplyData] = await Promise.all([
    rpcCall("getTokenLargestAccounts", [mint]),
    rpcCall("getTokenSupply", [mint]),
  ]);
  const accounts = holdersData.result?.value || [];
  const totalSupply = parseFloat(supplyData.result?.value?.uiAmountString || "0");
  console.log(`[DASH-RPC] totalSupply=${totalSupply}, topAccounts=${accounts.length}`);
  return accounts.slice(0, 10).map((a, i) => ({
    rank: i + 1,
    address: a.address,
    amount: parseFloat(a.uiAmountString || "0"),
    pct: totalSupply > 0 ? (parseFloat(a.uiAmountString || "0") / totalSupply * 100) : 0,
  }));
}

function getTokenAgeFromSecurity(security) {
  // Birdeye security response includes creationTime (unix seconds)
  if (security?.creationTime) {
    const age = Date.now() / 1000 - security.creationTime;
    console.log(`[DASH-TOKEN] Token age from Birdeye creationTime: ${(age / 86400).toFixed(0)} days (created ${new Date(security.creationTime * 1000).toISOString()})`);
    return age;
  }
  console.log("[DASH-TOKEN] No creationTime in security data");
  return 0;
}
