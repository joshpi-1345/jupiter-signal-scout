#!/usr/bin/env node

const API_BASE = process.env.JUPITER_API_BASE || "https://api.jup.ag";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const args = parseArgs(process.argv.slice(2));
const tokenQueries = (args.tokens || "SOL,JUP,BONK,WIF")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const amountUsdc = Number(args["amount-usdc"] || "5");
const jsonMode = Boolean(args.json);
const requestDelayMs = Number(process.env.JUPITER_REQUEST_DELAY_MS || "2500");

if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
  fail("--amount-usdc must be a positive number");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const startedAt = new Date().toISOString();
  const tokens = [];

  for (const query of tokenQueries) {
    await sleep(requestDelayMs);
    const result = await getJson(`/tokens/v2/search?query=${encodeURIComponent(query)}`);
    const token = pickToken(result, query);
    if (token) tokens.push({ query, ...token });
  }

  const uniqueTokens = dedupeBy(tokens, (token) => token.id || token.address);
  const mints = uniqueTokens.map((token) => token.id || token.address).filter(Boolean);

  await sleep(requestDelayMs);
  const prices = mints.length
    ? await getJson(`/price/v3?ids=${encodeURIComponent(mints.join(","))}`)
    : {};

  const routeChecks = [];
  for (const token of uniqueTokens) {
    const mint = token.id || token.address;
    if (!mint || mint === USDC_MINT) continue;
    await sleep(requestDelayMs);
    const route = await getRouteQuote({ outputMint: mint, amountUsdc });
    routeChecks.push({ token, route });
  }

  const rows = routeChecks.map(({ token, route }) => summarizeToken(token, route, prices));
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "ok" ? -1 : 1;
    return Math.abs(b.routeVsPricePct ?? 0) - Math.abs(a.routeVsPricePct ?? 0);
  });

  const report = {
    generatedAt: startedAt,
    apiBase: API_BASE,
    amountUsdc,
    tokenQueries,
    notes: [
      "Uses Jupiter Tokens V2, Price V3, and Swap V2 /order in keyless mode.",
      "No transaction is signed or submitted. Swap /order is called without taker, so transaction is null.",
      "Keyless mode is intentionally rate-limited, so the script waits between requests."
    ],
    rows
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTable(report);
  }
}

async function getRouteQuote({ outputMint, amountUsdc }) {
  const params = new URLSearchParams({
    inputMint: USDC_MINT,
    outputMint,
    amount: String(Math.round(amountUsdc * 1_000_000))
  });

  try {
    return await getJson(`/swap/v2/order?${params.toString()}`);
  } catch (error) {
    return { error: error.message };
  }
}

async function getJson(path, attempt = 0) {
  const headers = { accept: "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (res.status === 429 && attempt < 3) {
    await sleep(requestDelayMs * 2);
    return getJson(path, attempt + 1);
  }

  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${res.status} ${res.statusText}: ${detail.slice(0, 300)}`);
  }
  return body;
}

function pickToken(result, query) {
  const list = Array.isArray(result) ? result : result?.tokens || result?.data || [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const normalized = query.toLowerCase();
  const ranked = [...list].sort((a, b) => scoreToken(b, normalized) - scoreToken(a, normalized));
  return ranked[0];
}

function scoreToken(token, normalizedQuery) {
  const symbol = String(token.symbol || "").toLowerCase();
  const cleanSymbol = symbol.replace(/^\$/, "");
  const name = String(token.name || "").toLowerCase();
  let score = Number(token.organicScore || token.organic_score || 0);
  if (token.isVerified || token.verified) score += 100;
  if (symbol === normalizedQuery || cleanSymbol === normalizedQuery) score += 1000;
  if (name === normalizedQuery) score += 250;
  if (name.includes(normalizedQuery)) score += 50;
  return score;
}

function summarizeToken(token, route, prices) {
  const mint = token.id || token.address;
  const price = prices?.[mint]?.usdPrice;
  const decimals = Number(token.decimals ?? prices?.[mint]?.decimals ?? 0);
  const outAmount = Number(route?.outAmount);
  const outUi = Number.isFinite(outAmount) && decimals >= 0 ? outAmount / 10 ** decimals : null;
  const routeUsd = outUi && price ? outUi * price : null;
  const routeVsPricePct =
    routeUsd && amountUsdc ? Number((((routeUsd - amountUsdc) / amountUsdc) * 100).toFixed(3)) : null;

  return {
    query: token.query,
    symbol: token.symbol,
    name: token.name,
    mint,
    tokenPriceUsd: price ?? null,
    routeOutAmountUi: outUi ? Number(outUi.toFixed(6)) : null,
    routeImpliedUsd: routeUsd ? Number(routeUsd.toFixed(4)) : null,
    routeVsPricePct,
    status: route?.error ? "route_error" : "ok",
    signal: route?.error ? route.error : signalFor(routeVsPricePct, token),
    organicScore: token.organicScore ?? token.organic_score ?? null,
    verified: token.isVerified ?? token.verified ?? null
  };
}

function signalFor(routeVsPricePct, token) {
  if (routeVsPricePct == null) return "missing price or route output";
  if (Math.abs(routeVsPricePct) > 2) {
    return "route output differs from Price V3 by more than 2%; inspect liquidity, slippage, and token risk";
  }
  if (token.audit?.isSus) return "token audit marks this mint as suspicious";
  return "route and Price V3 agree closely for this test size";
}

function printTable(report) {
  console.log(`Jupiter Signal Scout (${report.generatedAt})`);
  console.log(`Amount: ${report.amountUsdc} USDC`);
  console.log("");
  for (const row of report.rows) {
    console.log(`${row.symbol || row.query} - ${row.name || "unknown"}`);
    console.log(`  mint: ${row.mint}`);
    console.log(`  price: ${row.tokenPriceUsd ?? "n/a"} USD`);
    console.log(`  route implied: ${row.routeImpliedUsd ?? "n/a"} USD (${row.routeVsPricePct ?? "n/a"}%)`);
    console.log(`  signal: ${row.signal}`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function dedupeBy(items, fn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = fn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main().catch((error) => {
  fail(error.stack || error.message);
});
