/**
 * SolWatch - Solana DeFi Portfolio Intelligence Plugin
 *
 * Custom ElizaOS plugin that provides Solana wallet monitoring,
 * token price checking, and DeFi portfolio intelligence.
 */

import { type Plugin, type Action, type HandlerCallback, type HandlerOptions, type IAgentRuntime, type Memory, type State } from "@elizaos/core";

/**
 * Check SOL balance for a given wallet address
 */
const checkWalletAction: Action = {
  name: "CHECK_WALLET",
  description: "Check a Solana wallet's SOL balance and token holdings. Use when the user asks about a wallet balance or wants to see what tokens they hold.",
  similes: ["CHECK_BALANCE", "WALLET_BALANCE", "MY_WALLET", "SHOW_BALANCE"],
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<void> => {
    const text = message.content?.text || "";
    // Extract wallet address (base58, 32-44 chars)
    const addressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);

    if (!addressMatch) {
      if (callback) {
        callback({ text: "Please provide a Solana wallet address and I'll check the balance for you." });
      }
      return;
    }

    const address = addressMatch[0];

    try {
      const response = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        }),
      });

      const data = await response.json();
      const lamports = data.result?.value || 0;
      const sol = lamports / 1_000_000_000;

      // Also get token accounts
      const tokenResponse = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "getTokenAccountsByOwner",
          params: [
            address,
            { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
            { encoding: "jsonParsed" },
          ],
        }),
      });

      const tokenData = await tokenResponse.json();
      const tokenAccounts = tokenData.result?.value || [];
      const nonZeroTokens = tokenAccounts.filter(
        (t: any) => t.account.data.parsed.info.tokenAmount.uiAmount > 0
      );

      let reply = `Wallet: ${address.slice(0, 4)}...${address.slice(-4)}\nSOL Balance: ${sol.toFixed(4)} SOL\nToken Accounts: ${nonZeroTokens.length} tokens with balance`;

      if (nonZeroTokens.length > 0 && nonZeroTokens.length <= 10) {
        reply += "\n\nTokens:";
        for (const t of nonZeroTokens) {
          const info = t.account.data.parsed.info;
          const amount = info.tokenAmount.uiAmountString;
          const mint = info.mint;
          reply += `\n  ${mint.slice(0, 8)}... : ${amount}`;
        }
      }

      if (callback) {
        callback({ text: reply });
      }
    } catch (error: any) {
      if (callback) {
        callback({ text: `Error checking wallet: ${error.message}` });
      }
    }

  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Check wallet 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "SolWatch", content: { text: "Wallet: 7etj...Fm3w\nSOL Balance: 1.2345 SOL\nToken Accounts: 3 tokens with balance" } },
    ],
  ],
};

/**
 * Check token price via Jupiter Price API
 */
const checkPriceAction: Action = {
  name: "CHECK_PRICE",
  description: "Check the current price of a Solana token. Use when the user asks about token prices, SOL price, or any token value.",
  similes: ["TOKEN_PRICE", "PRICE_CHECK", "SOL_PRICE", "WHAT_PRICE"],
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<void> => {
    const text = (message.content?.text || "").toLowerCase();

    // Map common names to mint addresses
    const tokenMap: Record<string, string> = {
      sol: "So11111111111111111111111111111111111111112",
      usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      bonk: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      jup: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      ray: "4k3Dyjzvzp8eMZFUEN6Rg8rBqAhxh3p9c3XLf4SArtDF",
      orca: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    };

    // Find token in message
    let mintAddress = "";
    let tokenName = "";

    for (const [name, mint] of Object.entries(tokenMap)) {
      if (text.includes(name)) {
        mintAddress = mint;
        tokenName = name.toUpperCase();
        break;
      }
    }

    // Check if message contains a mint address directly
    if (!mintAddress) {
      const mintMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
      if (mintMatch) {
        mintAddress = mintMatch[0];
        tokenName = mintAddress.slice(0, 8) + "...";
      }
    }

    if (!mintAddress) {
      if (callback) {
        callback({ text: "Which token? I can check SOL, USDC, USDT, BONK, JUP, RAY, ORCA, or paste any token mint address." });
      }
      return;
    }

    try {
      const response = await fetch(
        `https://api.jup.ag/price/v2?ids=${mintAddress}`
      );
      const data = await response.json();
      const priceData = data.data?.[mintAddress];

      if (priceData && priceData.price) {
        const price = parseFloat(priceData.price);
        if (callback) {
          callback({ text: `${tokenName} Price: $${price.toFixed(price < 0.01 ? 8 : 2)} USD` });
        }
      } else {
        if (callback) {
          callback({ text: `Could not find price data for ${tokenName}.` });
        }
      }
    } catch (error: any) {
      if (callback) {
        callback({ text: `Error fetching price: ${error.message}` });
      }
    }

  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What's the price of SOL?" } },
      { name: "SolWatch", content: { text: "SOL Price: $142.50 USD" } },
    ],
  ],
};

/**
 * Portfolio summary with USD values
 */
const portfolioSummaryAction: Action = {
  name: "PORTFOLIO_SUMMARY",
  description: "Get a full portfolio summary for a Solana wallet including SOL balance and total USD value. Use when the user asks for a portfolio overview or total value.",
  similes: ["PORTFOLIO", "TOTAL_VALUE", "NET_WORTH", "PORTFOLIO_VALUE"],
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<void> => {
    const text = message.content?.text || "";
    const addressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);

    if (!addressMatch) {
      if (callback) {
        callback({ text: "Please provide a Solana wallet address to get the portfolio summary." });
      }
      return;
    }

    const address = addressMatch[0];

    try {
      // Get SOL balance
      const balResponse = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getBalance",
          params: [address],
        }),
      });
      const balData = await balResponse.json();
      const sol = (balData.result?.value || 0) / 1_000_000_000;

      // Get SOL price
      const priceResponse = await fetch(
        "https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112"
      );
      const priceData = await priceResponse.json();
      const solPrice = parseFloat(priceData.data?.["So11111111111111111111111111111111111111112"]?.price || "0");

      const solValue = sol * solPrice;

      let reply = `Portfolio Summary for ${address.slice(0, 4)}...${address.slice(-4)}`;
      reply += `\n\nSOL: ${sol.toFixed(4)} ($${solValue.toFixed(2)})`;
      reply += `\nSOL Price: $${solPrice.toFixed(2)}`;
      reply += `\n\nEstimated Total (SOL only): $${solValue.toFixed(2)}`;

      if (callback) {
        callback({ text: reply });
      }
    } catch (error: any) {
      if (callback) {
        callback({ text: `Error getting portfolio: ${error.message}` });
      }
    }

  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Show portfolio for 7etjMSp87AUE135iW5dNeKridbW16rwSFVUN9ivfFm3w" } },
      { name: "SolWatch", content: { text: "Portfolio Summary for 7etj...Fm3w\n\nSOL: 5.0000 ($710.00)\nSOL Price: $142.00\n\nEstimated Total: $710.00" } },
    ],
  ],
};

/**
 * Check top DeFi yields on Solana
 */
const yieldCheckAction: Action = {
  name: "YIELD_CHECK",
  description: "Check top DeFi yield opportunities on Solana. Use when the user asks about yields, staking, farming, or earning on Solana.",
  similes: ["DEFI_YIELDS", "STAKING", "FARMING", "APY", "EARN"],
  validate: async () => true,
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<void> => {
    // Curated yield data (could be replaced with live API)
    const yields = [
      { protocol: "Marinade Finance", asset: "mSOL (Liquid Staking)", apy: "7.2%", risk: "Low" },
      { protocol: "Jito", asset: "JitoSOL (Liquid Staking)", apy: "7.8%", risk: "Low" },
      { protocol: "Raydium", asset: "SOL-USDC LP", apy: "12.5%", risk: "Medium" },
      { protocol: "Orca", asset: "SOL-USDC Whirlpool", apy: "15.3%", risk: "Medium" },
      { protocol: "Kamino", asset: "USDC Lending", apy: "8.1%", risk: "Low-Medium" },
      { protocol: "Drift", asset: "USDC Vault", apy: "9.4%", risk: "Medium" },
    ];

    let reply = "Top Solana DeFi Yields:\n";
    for (const y of yields) {
      reply += `\n${y.protocol} | ${y.asset} | APY: ${y.apy} | Risk: ${y.risk}`;
    }
    reply += "\n\nNote: APYs are approximate and change frequently. Always DYOR.";

    if (callback) {
      callback({ text: reply });
    }

  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "What are the best yields on Solana?" } },
      { name: "SolWatch", content: { text: "Top Solana DeFi Yields:\n\nMarinade Finance | mSOL | APY: 7.2% | Risk: Low\nJito | JitoSOL | APY: 7.8% | Risk: Low" } },
    ],
  ],
};

/**
 * SolWatch Plugin
 */
export const solwatchPlugin: Plugin = {
  name: "solwatch",
  description: "Solana DeFi portfolio intelligence - wallet monitoring, price checking, portfolio analysis, and yield discovery",
  actions: [checkWalletAction, checkPriceAction, portfolioSummaryAction, yieldCheckAction],
  providers: [],
  evaluators: [],
};

export default solwatchPlugin;
