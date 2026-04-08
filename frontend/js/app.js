/**
 * app.js — Main application logic with 4-tab dashboard
 */

let currentWallet = null;

// ─── Initialization ───

document.addEventListener("DOMContentLoaded", async () => {
  const healthy = await checkHealth();
  const dot = document.getElementById("statusDot");
  const txt = document.getElementById("statusText");
  if (healthy) { dot.className = "status-dot online"; txt.textContent = "Online"; await initializeAgent(); }
  else { dot.className = "status-dot offline"; txt.textContent = "Offline"; }

  // Auto-load Tab 1 data
  loadMarketOverview();
  loadYields();
  loadPredictions();

  // Restore last tab
  const savedTab = localStorage.getItem("soliza_tab") || "market";
  switchTab(savedTab);

  // Restore saved wallet/token
  const savedWallet = localStorage.getItem("soliza_wallet");
  if (savedWallet) document.getElementById("walletInput").value = savedWallet;
  const savedToken = localStorage.getItem("soliza_token");
  if (savedToken) document.getElementById("tokenInput").value = savedToken;
});

// ─── Tab Switching ───

function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));

  const content = document.getElementById(`tab-${tabName}`);
  const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (content) content.classList.add("active");
  if (btn) btn.classList.add("active");

  localStorage.setItem("soliza_tab", tabName);
  console.log(`[APP] Switched to tab: ${tabName}`);
}

// ─── Chat Functions ───

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addChatMessage(text, "user");
  const typingId = addTypingIndicator();
  const response = await sendChatMessage(text);
  removeTypingIndicator(typingId);
  addChatMessage(response, "agent");
}

function addChatMessage(text, role) {
  const container = document.getElementById("chatMessages");
  const msg = document.createElement("div");
  msg.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "agent" ? "SZ" : "You";
  const content = document.createElement("div");
  content.className = "message-content";
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
  content.innerHTML = `<p>${formatted}</p>`;
  msg.appendChild(avatar);
  msg.appendChild(content);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function addTypingIndicator() {
  const container = document.getElementById("chatMessages");
  const msg = document.createElement("div");
  msg.className = "message agent";
  msg.id = "typing-indicator";
  msg.innerHTML = `<div class="message-avatar">SZ</div><div class="message-content"><p class="loading">Thinking</p></div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return "typing-indicator";
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ─── TAB 1: Market Overview ───

async function loadMarketOverview() {
  console.log("[APP] loadMarketOverview");
  try {
    const [solPrice, fg, btcDom, tvl] = await Promise.all([
      fetchSOLPrice(),
      fetchFearAndGreed(),
      fetchBTCDominance(),
      fetchSolanaTVL(),
    ]);

    animateValue("mpSolPrice", `$${solPrice.toFixed(2)}`);

    // SOL 24h change from Birdeye overview
    try {
      const solOverview = await fetchBirdeyeOverview("So11111111111111111111111111111111111111112");
      if (solOverview?.priceChange24hPercent != null) {
        const change = solOverview.priceChange24hPercent;
        const el = document.getElementById("mpSolChange");
        el.textContent = `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
        el.style.color = change >= 0 ? "var(--green)" : "var(--red)";
      }
    } catch {}

    // Fear & Greed
    const fgEl = document.getElementById("mpFearGreed");
    fgEl.textContent = `${fg.value}`;
    fgEl.style.color = fg.value >= 70 ? "var(--green)" : fg.value >= 40 ? "var(--yellow)" : "var(--red)";
    fgEl.title = fg.classification;

    animateValue("mpBtcDom", `${btcDom.toFixed(1)}%`);
    animateValue("mpTvl", tvl > 0 ? `$${(tvl / 1e9).toFixed(2)}B` : "—");
  } catch (err) {
    console.error("[APP] Market overview error:", err);
  }
}

// ─── TAB 2: Predictions ───

async function loadPredictions() {
  const container = document.getElementById("predictionsList");
  const category = document.getElementById("predCategorySelect")?.value || "crypto";
  container.innerHTML = '<div class="empty-state loading">Loading predictions</div>';
  try {
    const events = await fetchPredictionMarkets(category, "trending");
    if (events.length === 0) { container.innerHTML = '<div class="empty-state">No prediction markets found</div>'; return; }
    container.innerHTML = "";
    for (const event of events) {
      const div = document.createElement("div");
      div.className = "prediction-event";
      const vol = event.volumeUsd > 1000 ? `$${(event.volumeUsd / 1000).toFixed(0)}k` : `$${event.volumeUsd.toFixed(0)}`;
      let marketsHtml = "";
      for (const m of event.markets.slice(0, 3)) {
        const probClass = m.yesPct >= 70 ? "high" : m.yesPct >= 40 ? "mid" : "low";
        marketsHtml += `
          <div class="prediction-outcome">
            <span style="width:80px;font-size:0.75rem">${m.title}</span>
            <div class="prediction-bar"><div class="prediction-bar-fill yes" style="width:${m.yesPct}%"></div></div>
            <span class="prediction-prob ${probClass}">${m.yesPct.toFixed(0)}%</span>
          </div>`;
      }
      div.innerHTML = `
        <div class="prediction-title">${event.title}</div>
        <div class="prediction-meta">${event.category} | Vol: ${vol}</div>
        <div class="prediction-outcomes">${marketsHtml}</div>`;
      container.appendChild(div);
    }
  } catch (err) {
    console.error("[APP] Predictions error:", err);
    container.innerHTML = '<div class="empty-state">Error loading predictions</div>';
  }
}

// ─── TAB 1: Yields ───

async function loadYields() {
  const container = document.getElementById("yieldsTable");
  container.innerHTML = '<div class="empty-state loading">Fetching live yields</div>';
  try {
    const yields = await fetchSolanaYields();
    container.innerHTML = `<div class="yield-row header"><span>Protocol</span><span>Pool</span><span>APY</span><span>TVL</span></div>`;
    for (const y of yields) {
      const row = document.createElement("div");
      row.className = "yield-row";
      const tvl = y.tvl > 1e9 ? `$${(y.tvl / 1e9).toFixed(1)}B` : `$${(y.tvl / 1e6).toFixed(1)}M`;
      row.innerHTML = `<span><strong>${y.project}</strong></span><span>${y.symbol}</span><span class="yield-apy">${y.apy.toFixed(2)}%</span><span class="yield-tvl">${tvl}</span>`;
      container.appendChild(row);
    }
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Could not load yield data</div>';
  }
}

// ─── TAB 3: Wallet Investigation ───

async function loadWalletDashboard() {
  const address = document.getElementById("walletInput").value.trim();
  if (!address || address.length < 32) return;
  const btn = document.querySelector("#tab-wallet .tab-search button");
  btn.innerHTML = '<span class="loading">Analyzing</span>';
  btn.disabled = true;

  currentWallet = address;
  localStorage.setItem("soliza_wallet", address);
  document.getElementById("walletLabel").textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;

  // Loading states
  document.getElementById("totalValue").textContent = "...";
  document.getElementById("solBalance").textContent = "...";
  document.getElementById("tokenCount").textContent = "...";
  document.getElementById("solPriceDisplay").textContent = "...";
  document.getElementById("holdingsList").innerHTML = '<div class="empty-state loading">Loading</div>';
  document.getElementById("txList").innerHTML = '<div class="empty-state loading">Loading</div>';
  document.getElementById("walletIntelContent").innerHTML = '<div class="empty-state loading">Analyzing trades</div>';

  try {
    const [walletData, solPrice] = await Promise.all([fetchWalletData(address), fetchSOLPrice()]);
    const allMints = ["So11111111111111111111111111111111111111112", ...walletData.tokens.map(t => t.mint)];
    const prices = await fetchTokenPrices(allMints);
    prices["So11111111111111111111111111111111111111112"] = solPrice;

    const solValue = walletData.sol * solPrice;
    let totalUSD = solValue;
    const enrichedTokens = walletData.tokens.map(t => {
      const price = prices[t.mint] || 0;
      const usd = t.amount * price;
      totalUSD += usd;
      return { ...t, price, usd };
    }).sort((a, b) => b.usd - a.usd);

    // Overview
    animateValue("totalValue", `$${totalUSD.toFixed(2)}`);
    animateValue("solBalance", `${walletData.sol.toFixed(4)}`);
    animateValue("tokenCount", `${walletData.tokens.length + (walletData.sol > 0 ? 1 : 0)}`);
    animateValue("solPriceDisplay", `$${solPrice.toFixed(2)}`);

    // Holdings
    const holdingsEl = document.getElementById("holdingsList");
    holdingsEl.innerHTML = "";
    holdingsEl.appendChild(createHoldingRow("SOL", "Solana", walletData.sol.toFixed(4), `$${solValue.toFixed(2)}`));
    for (const t of enrichedTokens.slice(0, 12)) {
      if (t.usd > 0.001 || t.amount > 0) {
        holdingsEl.appendChild(createHoldingRow(t.symbol, t.name,
          t.amount > 1e6 ? `${(t.amount / 1e6).toFixed(2)}M` : t.amount.toFixed(t.amount < 1 ? 6 : 2),
          t.usd > 0.01 ? `$${t.usd.toFixed(2)}` : "< $0.01"
        ));
      }
    }

    // Risk
    const risk = calculateRiskScore(walletData.sol, walletData.tokens, prices);
    updateRiskScore(risk);

    // Async: transactions + wallet intelligence
    loadTransactions(address);
    loadWalletIntelligence(address);
  } catch (err) {
    console.error("[APP] Wallet dashboard error:", err);
    document.getElementById("walletLabel").textContent = "Error";
  }
  btn.innerHTML = "Analyze";
  btn.disabled = false;
}

function createHoldingRow(symbol, name, amount, value) {
  const row = document.createElement("div");
  row.className = "holding-row";
  row.innerHTML = `
    <div class="holding-icon">${symbol.slice(0, 3)}</div>
    <div class="holding-info"><div class="holding-name">${symbol}</div><div class="holding-amount">${name}</div></div>
    <div class="holding-value">${amount}<br><span style="font-size:0.75rem;color:var(--text-dim)">${value}</span></div>`;
  return row;
}

function updateRiskScore(risk) {
  const fill = document.getElementById("riskBarFill");
  const number = document.getElementById("riskNumber");
  const label = document.getElementById("riskLabel");
  const factors = document.getElementById("riskFactors");
  fill.style.width = `${risk.score}%`;
  fill.className = "risk-bar-fill" + (risk.score >= 75 ? " high" : risk.score >= 50 ? " medium" : "");
  number.textContent = risk.score;
  number.style.color = risk.score >= 75 ? "var(--red)" : risk.score >= 50 ? "var(--yellow)" : "var(--green)";
  label.textContent = `/ 100 (${risk.level})`;
  factors.innerHTML = `
    <div class="risk-factor"><span>Concentration (largest holding)</span><span>${risk.factors.concentration}%</span></div>
    <div class="risk-factor"><span>Stablecoin buffer</span><span>${risk.factors.stablecoins}%</span></div>
    <div class="risk-factor"><span>Asset diversity</span><span>${risk.factors.diversity} tokens</span></div>`;
}

async function loadTransactions(address) {
  const container = document.getElementById("txList");
  try {
    const txs = await fetchTransactionHistory(address, 8);
    if (txs.length === 0) { container.innerHTML = '<div class="empty-state">No recent transactions</div>'; return; }
    container.innerHTML = `<div class="tx-row header"><span>Date</span><span>Type</span><span>Status</span><span>Signature</span></div>`;
    for (const tx of txs) {
      const row = document.createElement("div");
      row.className = "tx-row";
      const typeClass = tx.type === "Swap" ? "swap" : tx.type === "Stake" ? "stake" : "transfer";
      const dateStr = tx.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      row.innerHTML = `
        <span>${dateStr}</span>
        <span><span class="tx-type-badge ${typeClass}">${tx.type}</span></span>
        <span style="color:${tx.status === 'Success' ? 'var(--green)' : 'var(--red)'}">${tx.status}</span>
        <span class="tx-sig">${tx.signature.slice(0, 8)}...</span>`;
      container.appendChild(row);
    }
  } catch { container.innerHTML = '<div class="empty-state">Error loading transactions</div>'; }
}

// ─── Wallet Intelligence ───

const PERSONALITY_COLORS = {
  ELITE_SNIPER: "#14F195", WHALE: "#5b9cf5", BOT_TRADER: "#9945FF",
  ACCUMULATOR: "#ffd60a", RETAIL_FOLLOWER: "#8888a0", UNKNOWN: "#555",
};
const PERSONALITY_NAMES = {
  ELITE_SNIPER: "Elite Sniper", WHALE: "Whale", BOT_TRADER: "Bot Trader",
  ACCUMULATOR: "Accumulator", RETAIL_FOLLOWER: "Retail Follower", UNKNOWN: "Unknown",
};

async function loadWalletIntelligence(address) {
  const container = document.getElementById("walletIntelContent");
  try {
    const profile = await fetchWalletProfile(address);
    if (!profile || profile.tradeCount === 0) {
      container.innerHTML = '<div class="empty-state">No swap history found</div>';
      return;
    }
    const type = profile.personalityType;
    const color = PERSONALITY_COLORS[type] || "#888";
    const label = PERSONALITY_NAMES[type] || type;
    const wr = profile.winRate != null ? `${(profile.winRate * 100).toFixed(0)}%` : "N/A";
    const pf = profile.profitFactor != null ? (profile.profitFactor >= 999 ? "∞" : profile.profitFactor.toFixed(2)) : "N/A";
    const pnlSign = profile.totalPnlSol >= 0 ? "+" : "";
    const pnlColor = profile.totalPnlSol >= 0 ? "var(--green)" : "var(--red)";

    // Wallet Intelligence card — clean, just badge + 4 big stats
    container.innerHTML = `
      <div style="padding:20px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
          <span style="background:${color};color:#000;padding:6px 18px;border-radius:20px;font-weight:800;font-size:1rem;letter-spacing:0.5px">${label}</span>
          <span style="color:var(--text-dim);font-size:0.85rem">${(profile.personalityConfidence * 100).toFixed(0)}% confidence</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border-radius:10px;overflow:hidden">
          <div style="background:rgba(20,20,30,0.8);padding:16px;text-align:center">
            <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">PNL</div>
            <div style="font-size:1.5rem;font-weight:800;color:${pnlColor}">${pnlSign}${profile.totalPnlSol} SOL</div>
          </div>
          <div style="background:rgba(20,20,30,0.8);padding:16px;text-align:center">
            <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Win Rate</div>
            <div style="font-size:1.5rem;font-weight:800;color:var(--green)">${wr}</div>
          </div>
          <div style="background:rgba(20,20,30,0.8);padding:16px;text-align:center">
            <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Profit Factor</div>
            <div style="font-size:1.5rem;font-weight:800">${pf}</div>
          </div>
          <div style="background:rgba(20,20,30,0.8);padding:16px;text-align:center">
            <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Risk Score</div>
            <div style="font-size:1.5rem;font-weight:800">${(profile.riskScore * 100).toFixed(0)}/100</div>
          </div>
        </div>
      </div>`;

    // Trade Stats card — separate card next to Risk Score
    const statsEl = document.getElementById("tradeStatsContent");
    statsEl.innerHTML = `
      <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.85rem">
        <div><span style="color:var(--text-dim)">Total Trades</span><br><strong style="font-size:1.1rem">${profile.tradeCount}</strong><br><span style="font-size:0.7rem;color:var(--text-dim)">${profile.txsFetched} txs analyzed</span></div>
        <div><span style="color:var(--text-dim)">Volume</span><br><strong style="font-size:1.1rem">${profile.totalVolume} SOL</strong><br><span style="font-size:0.7rem;color:var(--text-dim)">Avg: ${profile.avgTradeSize} SOL</span></div>
        <div><span style="color:var(--text-dim)">Unique Tokens</span><br><strong style="font-size:1.1rem">${profile.uniqueTokens || 0}</strong></div>
        <div><span style="color:var(--text-dim)">Completed</span><br><strong style="font-size:1.1rem">${profile.completedTrades || 0}</strong></div>
        ${profile.biggestWinSol ? `<div><span style="color:var(--text-dim)">Biggest Win</span><br><strong style="font-size:1.1rem;color:var(--green)">+${profile.biggestWinSol} SOL</strong></div>` : ""}
        ${profile.biggestLossSol ? `<div><span style="color:var(--text-dim)">Biggest Loss</span><br><strong style="font-size:1.1rem;color:var(--red)">${profile.biggestLossSol} SOL</strong></div>` : ""}
      </div>`;
  } catch (err) {
    console.error("[APP] Wallet intelligence error:", err);
    container.innerHTML = '<div class="empty-state">Error loading profile</div>';
  }
}

// ─── TAB 4: Token Deep Dive ───

async function loadTokenDashboard() {
  const mint = document.getElementById("tokenInput").value.trim();
  if (!mint || mint.length < 32) return;
  const btn = document.querySelector("#tab-token .tab-search button");
  btn.innerHTML = '<span class="loading">Analyzing</span>';
  btn.disabled = true;

  localStorage.setItem("soliza_token", mint);
  document.getElementById("tokenMintLabel").textContent = `${mint.slice(0, 8)}...${mint.slice(-4)}`;

  try {
    const info = await fetchTokenInfo(mint);

    // Overview
    const ov = info.overview;
    if (ov) {
      document.getElementById("tokenName").textContent = `${ov.symbol || "Unknown"} — ${ov.name || "Token"}`;
      const p = ov.price || 0;
      animateValue("tokenPrice", `$${p.toFixed(p < 0.01 ? 8 : 4)}`);
      const change = ov.priceChange24hPercent;
      const changeEl = document.getElementById("tokenChange");
      if (change != null) {
        changeEl.textContent = `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
        changeEl.style.color = change >= 0 ? "var(--green)" : "var(--red)";
      }
      animateValue("tokenMC", ov.mc ? `$${(ov.mc / 1e6).toFixed(1)}M` : "—");
      animateValue("tokenLiq", ov.liquidity ? `$${(ov.liquidity / 1e6).toFixed(1)}M` : "—");
      animateValue("tokenVol", ov.v24hUSD ? `$${(ov.v24hUSD / 1e6).toFixed(1)}M` : "—");
      animateValue("tokenHolders", ov.holder ? ov.holder.toLocaleString() : "—");
    }

    // Security
    let secScore = 0;
    const checks = [];
    const sec = info.security;
    if (sec) {
      if (sec.mutableMetadata) { secScore += 15; checks.push(`${icon("x-circle","icon-red")} Mutable metadata`); }
      else checks.push(`${icon("check-circle","icon-green")} Immutable metadata`);
    }
    const mintData = await rpcCall("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
    const parsed = mintData.result?.value?.data?.parsed?.info;
    if (parsed) {
      if (parsed.mintAuthority) { secScore += 30; checks.push(`${icon("x-circle","icon-red")} Mint authority active`); }
      else checks.push(`${icon("check-circle","icon-green")} Mint authority revoked`);
      if (parsed.freezeAuthority) { secScore += 20; checks.push(`${icon("x-circle","icon-red")} Freeze authority active`); }
      else checks.push(`${icon("check-circle","icon-green")} No freeze authority`);
    }
    if (info.holders.length > 0) {
      const top5Pct = info.holders.slice(0, 5).reduce((s, h) => s + h.pct, 0);
      if (top5Pct > 70) { secScore += 25; checks.push(`${icon("x-circle","icon-red")} Top 5 hold ${top5Pct.toFixed(1)}%`); }
      else if (top5Pct > 40) { secScore += 12; checks.push(`${icon("alert-triangle","icon-yellow")} Top 5 hold ${top5Pct.toFixed(1)}%`); }
      else checks.push(`${icon("check-circle","icon-green")} Top 5 hold ${top5Pct.toFixed(1)}%`);
    }
    const ageHours = info.ageSeconds / 3600;
    const ageDays = ageHours / 24;
    if (ageHours < 2) { secScore += 10; checks.push(`${icon("x-circle","icon-red")} Extremely new token`); }
    else if (ageDays < 1) { secScore += 5; checks.push(`${icon("alert-triangle","icon-yellow")} Less than 1 day old`); }
    else checks.push(`${icon("check-circle","icon-green")} ${ageDays.toFixed(0)} days old`);

    secScore = Math.min(secScore, 100);
    const secLevel = secScore >= 60 ? "DANGEROUS" : secScore >= 40 ? "RISKY" : secScore >= 20 ? "CAUTION" : "LOW RISK";
    document.getElementById("tokenSecFill").style.width = `${secScore}%`;
    document.getElementById("tokenSecFill").className = "risk-bar-fill" + (secScore >= 60 ? " high" : secScore >= 40 ? " medium" : "");
    const numEl = document.getElementById("tokenSecScore");
    numEl.textContent = secScore;
    numEl.style.color = secScore >= 60 ? "var(--red)" : secScore >= 40 ? "var(--yellow)" : "var(--green)";
    document.getElementById("tokenSecLabel").textContent = `/ 100 (${secLevel})`;
    document.getElementById("tokenSecChecks").innerHTML = checks.map(c => `<div class="risk-factor"><span>${c}</span></div>`).join("");

    // Lifecycle
    let lifecycle = "";
    if (ageHours < 1) lifecycle = `${lifecycleIcon("zap","icon-purple")} Just Born (< 1hr)`;
    else if (ageHours < 24) lifecycle = `${lifecycleIcon("sunrise","icon-blue")} Early Discovery (< 24hr)`;
    else if (ageDays < 7) lifecycle = `${lifecycleIcon("trending-up","icon-green")} Momentum Phase (< 7d)`;
    else if (ageDays < 30) lifecycle = `${lifecycleIcon("shield","icon-yellow")} Established (< 30d)`;
    else if (ageDays < 90) lifecycle = `${lifecycleIcon("award","icon-yellow")} Mature (< 90d)`;
    else lifecycle = `${lifecycleIcon("crown","icon-dim")} Veteran (90d+)`;

    document.getElementById("tokenLifecycleContent").innerHTML = `
      <div style="font-size:1.5rem;margin-bottom:8px">${lifecycle}</div>
      <div style="color:var(--text-dim)">Age: ${ageDays > 1 ? `${ageDays.toFixed(0)} days` : `${ageHours.toFixed(1)} hours`}</div>`;

    // Top Holders
    const holdersEl = document.getElementById("tokenHoldersList");
    if (info.holders.length > 0) {
      holdersEl.innerHTML = info.holders.map(h => `
        <div class="holding-row">
          <div class="holding-icon">#${h.rank}</div>
          <div class="holding-info"><div class="holding-name" style="font-family:monospace;font-size:0.8rem">${h.address.slice(0, 8)}...${h.address.slice(-4)}</div></div>
          <div class="holding-value">${h.amount > 1e6 ? `${(h.amount/1e6).toFixed(1)}M` : h.amount.toLocaleString()}<br><span style="font-size:0.75rem;color:var(--text-dim)">${h.pct.toFixed(1)}%</span></div>
        </div>`).join("");
    } else {
      holdersEl.innerHTML = '<div class="empty-state">No holder data</div>';
    }

    renderIcons();
  } catch (err) {
    console.error("[APP] Token dashboard error:", err);
    document.getElementById("tokenName").textContent = "Error loading token";
  }
  btn.innerHTML = "Analyze";
  btn.disabled = false;
}

// ─── Icon Helpers ───

function icon(name, colorClass = "") {
  return `<span class="icon-inline ${colorClass}" data-lucide-pending="${name}"></span>`;
}

function lifecycleIcon(name, colorClass = "") {
  return `<span class="icon-lifecycle ${colorClass}" data-lucide-pending="${name}"></span>`;
}

function renderIcons() {
  document.querySelectorAll("[data-lucide-pending]").forEach(el => {
    const name = el.getAttribute("data-lucide-pending");
    el.removeAttribute("data-lucide-pending");
    el.innerHTML = `<i data-lucide="${name}"></i>`;
  });
  lucide.createIcons();
}

// ─── Utilities ───

function animateValue(elementId, targetText) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.opacity = "0";
  el.style.transform = "translateY(4px)";
  setTimeout(() => {
    el.textContent = targetText;
    el.style.transition = "opacity 0.4s, transform 0.4s";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  }, 100);
}
