/**
 * Direct API test — no ElizaOS, no LLM, just raw calls
 * Run: node test-apis.mjs
 */

import { readFileSync } from 'fs';
const envFile = readFileSync('.env', 'utf-8');
for (const line of envFile.split('\n')) {
  if (line && !line.startsWith('#')) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
}

const CHAINSTACK_RPC = process.env.CHAINSTACK_RPC_URL || "https://api.mainnet-beta.solana.com";
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";

const TEST_WALLET = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg";
const TEST_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function test(name, fn) {
  try {
    console.log(`\n── ${name} ──`);
    const result = await fn();
    console.log("✅ OK:", JSON.stringify(result, null, 2).slice(0, 500));
  } catch (e) {
    console.log("❌ FAIL:", e.message);
  }
}

// ── RPC (Chainstack) ──
await test("Chainstack RPC — getBalance", async () => {
  const res = await fetch(CHAINSTACK_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [TEST_WALLET] }),
  });
  const data = await res.json();
  return { sol: (data.result?.value || 0) / 1e9, raw: data.result };
});

await test("Chainstack RPC — getTokenAccountsByOwner", async () => {
  const res = await fetch(CHAINSTACK_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
      params: [TEST_WALLET, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }],
    }),
  });
  const data = await res.json();
  const tokens = (data.result?.value || []).filter(t => t.account.data.parsed.info.tokenAmount.uiAmount > 0);
  return { tokenCount: tokens.length, first: tokens[0]?.account.data.parsed.info };
});

// ── Helius ──
await test("Helius — wallet identity", async () => {
  if (!HELIUS_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://api.helius.xyz/v0/addresses/${TEST_WALLET}/names?api-key=${HELIUS_API_KEY}`);
  return { status: res.status, data: await res.json() };
});

await test("Helius — enhanced transactions", async () => {
  if (!HELIUS_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://api.helius.xyz/v0/addresses/${TEST_WALLET}/transactions?api-key=${HELIUS_API_KEY}&limit=3`);
  const data = await res.json();
  return { status: res.status, count: data.length, first: data[0]?.type };
});

// ── Birdeye ──
const birdHeaders = { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" };

await test("Birdeye — token overview (SOL)", async () => {
  if (!BIRDEYE_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${SOL_MINT}`, { headers: birdHeaders });
  const data = await res.json();
  return { status: res.status, success: data.success, price: data.data?.price, mc: data.data?.mc, liq: data.data?.liquidity };
});

await test("Birdeye — token security (BONK)", async () => {
  if (!BIRDEYE_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://public-api.birdeye.so/defi/token_security?address=${TEST_TOKEN}`, { headers: birdHeaders });
  const data = await res.json();
  return { status: res.status, success: data.success, data: data.data };
});

await test("Birdeye — wallet portfolio", async () => {
  if (!BIRDEYE_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://public-api.birdeye.so/v1/wallet/token_list?wallet=${TEST_WALLET}`, { headers: birdHeaders });
  const data = await res.json();
  return { status: res.status, success: data.success, items: data.data?.items?.length, totalUsd: data.data?.totalUsd };
});

await test("Birdeye — smart money", async () => {
  if (!BIRDEYE_API_KEY) return "SKIPPED (no key)";
  const res = await fetch(`https://public-api.birdeye.so/smart-money/v1/token/list?interval=1d&trader_style=all&sort_by=smart_traders_no&sort_type=desc&offset=0&limit=5`, { headers: birdHeaders });
  const data = await res.json();
  return { status: res.status, success: data.success, count: data.data?.items?.length, first: data.data?.items?.[0]?.symbol };
});

// ── Birdeye public (no key) ──
await test("Birdeye — defi/multi_price POST (with key)", async () => {
  if (!BIRDEYE_API_KEY) return "SKIPPED (no key)";
  const res = await fetch("https://public-api.birdeye.so/defi/multi_price?include_liquidity=true", {
    method: "POST",
    headers: { ...birdHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ list_address: `${SOL_MINT},${TEST_TOKEN}` }),
  });
  console.log("  status:", res.status);
  const data = await res.json();
  console.log("  success:", data.success);
  return { status: res.status, success: data.success, solPrice: data.data?.[SOL_MINT]?.value, bonkPrice: data.data?.[TEST_TOKEN]?.value };
});

// ── DefiLlama ──
await test("DefiLlama — Solana yields", async () => {
  const res = await fetch("https://yields.llama.fi/pools");
  const data = await res.json();
  const solana = data.data.filter(p => p.chain === "Solana" && p.tvlUsd > 1_000_000).slice(0, 3);
  return { totalPools: data.data.length, solanaPools: solana.length, top: solana.map(p => ({ project: p.project, apy: p.apy })) };
});

// ── Jupiter ──
await test("Jupiter V3 — SOL price", async () => {
  const url = `https://api.jup.ag/price/v3?ids=${SOL_MINT}`;
  console.log("  URL:", url);
  const res = await fetch(url);
  console.log("  status:", res.status);
  const data = await res.json();
  return { usdPrice: data[SOL_MINT]?.usdPrice, priceChange24h: data[SOL_MINT]?.priceChange24h, liquidity: data[SOL_MINT]?.liquidity };
});

// ── Jupiter Prediction Markets ──
// ── Jupiter Perps ──
await test("Jupiter Perps — JLP pool info", async () => {
  const res = await fetch("https://perps-api.jup.ag/v1/jlp-info");
  const data = await res.json();
  return {
    status: res.status,
    tvl: `$${parseFloat(data.aumUsdFormatted || "0").toLocaleString()}`,
    apr: `${data.jlpAprPct}%`,
    apy: `${data.jlpApyPct}%`,
    jlpPrice: `$${data.jlpPriceUsdFormatted}`,
    custodies: data.custodies?.map(c => `${c.symbol}: ${c.utilizationPct}% util`),
  };
});

await test("Jupiter Perps — SOL pool details", async () => {
  const res = await fetch(`https://perps-api.jup.ag/v1/pool-info?mint=${SOL_MINT}`);
  const data = await res.json();
  return { status: res.status, ...data };
});

await test("Jupiter Perps — wallet positions", async () => {
  const res = await fetch(`https://perps-api.jup.ag/v1/positions?walletAddress=${TEST_WALLET}`);
  const data = await res.json();
  return { status: res.status, positions: Array.isArray(data) ? data.length : "object", preview: JSON.stringify(data).slice(0, 200) };
});

await test("Jupiter Perps — loans/lending info", async () => {
  const res = await fetch("https://perps-api.jup.ag/v1/loans/info");
  console.log("  status:", res.status);
  const data = await res.json();
  return { status: res.status, dataType: typeof data, preview: JSON.stringify(data).slice(0, 300) };
});

await test("Jupiter Portfolio — wallet DeFi positions", async () => {
  const res = await fetch(`https://api.jup.ag/portfolio/v1/positions/${TEST_WALLET}`);
  const data = await res.json();
  return { status: res.status, elements: data.elements?.length || 0, duration: data.duration, tokens: Object.keys(data.tokenInfo?.solana || {}).length };
});

// ── Jupiter Prediction Markets ──
await test("Jupiter Prediction — trending crypto events", async () => {
  const res = await fetch("https://api.jup.ag/prediction/v1/events?category=crypto&includeMarkets=true&sortBy=volume&sortDirection=desc&filter=trending&start=0&end=3");
  console.log("  status:", res.status);
  if (!res.ok) {
    const text = await res.text();
    return { status: res.status, error: text.slice(0, 200) };
  }
  const text = await res.text();
  if (!text || text[0] !== '{' && text[0] !== '[') {
    return { status: res.status, error: `Non-JSON response: "${text.slice(0, 100)}"` };
  }
  const data = JSON.parse(text);
  const events = data.data || [];
  return {
    status: res.status,
    count: events.length,
    first: events[0] ? {
      title: events[0].metadata?.title,
      volume: `$${(parseInt(events[0].volumeUsd || "0") / 1_000_000_000_000).toFixed(1)}M`,
      markets: events[0].markets?.length,
      firstMarket: events[0].markets?.[0]?.pricing ? {
        title: events[0].markets[0].title,
        yesPct: `${(events[0].markets[0].pricing.buyYesPriceUsd / 1_000_000 * 100).toFixed(0)}%`,
      } : null,
    } : null,
  };
});

await test("Jupiter Prediction — search 'solana'", async () => {
  const res = await fetch("https://api.jup.ag/prediction/v1/events/search?query=solana&limit=3");
  const data = await res.json();
  return {
    status: res.status,
    count: (data.data || data || []).length,
    titles: (data.data || data || []).slice(0, 3).map(e => e.metadata?.title || e.title),
  };
});

console.log("\n══ DONE ══\n");
