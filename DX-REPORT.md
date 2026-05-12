# DX Report: Jupiter Signal Scout

Built on 2026-05-12 for the Jupiter "Not Your Regular Bounty" on Superteam Earn / Frontier.

## Project Summary

Jupiter Signal Scout is a small CLI that compares token metadata, Price V3, and Swap V2 `/order` output for a small USDC test amount. It calls `/order` without `taker`, which the docs describe as the quote-only path where `transaction` is null. The project intentionally uses the new Developer Platform surfaces in the way a coding agent would: discover docs from `llms.txt`, make JSON calls directly, and use keyless access before upgrading to an API key.

## Time to First Successful API Call

The first successful docs-driven call was fast once I found `https://dev.jup.ag/docs/llms.txt`. The older-looking `https://developers.jup.ag/llms.txt` path returned a 404-style app shell, while the Superteam listing pointed to `developers.jup.ag`. The docs themselves correctly say the complete index is at `https://dev.jup.ag/docs/llms.txt`, but this mismatch is easy to trip over.

Actionable fix: add a redirect from `developers.jup.ag/llms.txt` to `dev.jup.ag/docs/llms.txt`, or expose the same file from both hostnames.

## What Worked

The `llms.txt` entrypoint is the strongest part of the DX. It gives a compact map of Swap V2, Tokens V2, Price V3, Trigger, Recurring, Lend, Portfolio, and Prediction without forcing a browser-heavy docs crawl.

The API shape is also agent-friendly. The endpoints are normal REST + JSON, and the important prototype path works without an RPC node.

Keyless access is useful for an agent build. The docs state that keyless access is available for prototyping at low rate limits, so I could build and test without asking a human for payment details or KYC.

## Friction and Bugs

### 1. Hostname Drift Around Docs and Portal

During discovery, the public surfaces used both `developers.jup.ag` and `dev.jup.ag`. The live app at `developers.jup.ag` is a dashboard shell, while the raw documentation entrypoint is under `dev.jup.ag/docs`.

Impact: an agent following a bounty description literally can waste time on the wrong host and incorrectly mark `llms.txt` as missing.

Recommendation: publish a tiny canonical doc URL block on the dashboard shell and add redirects for the raw Markdown paths.

### 2. API Key Signup Is Not Required for Prototyping, But the Bounty Implies It Is

The bounty says to get an API key and include the email tied to the Developer Platform account. The docs say keyless access is explicitly valid for prototypes, but also that dashboard analytics require an API key.

Impact: for hackathon-style submissions, builders are unsure whether keyless prototype runs count, even if the project uses the correct gateway.

Recommendation: add a one-line rule to the bounty and docs: "Keyless submissions are accepted for prototypes, but include an API key if you want usage analytics considered."

### 3. Swap `/order` Is Powerful, But the Minimal Read-Only Probe Needs Its Own Guide

The project uses `/swap/v2/order` as a market-data probe without executing a transaction. This is useful for agents and dashboards that want route-aware checks before a wallet is connected. The key discovery was that `taker` should be omitted, not filled with a placeholder address; with `taker` omitted, Jupiter returns a quote and `transaction: null`.

The current docs understandably frame `/order` as step one of signing and executing. A short "quote-only / route-quality probe" page would help builders avoid accidental transaction flows while still getting realistic route data.

Recommendation: document a "no-sign, no-execute" pattern with a placeholder taker, required params, and caveats.

### 4. Error Messages Need More Human and Agent Context

When an endpoint fails, the response shape is JSON, but error text can still be too low-level for an agent to classify. For example, route failures should distinguish "no route for this size", "invalid taker", "unsupported mint", "rate limited", and "auth required".

Recommendation: include stable `error.code`, `error.category`, and `retryable` fields on all API failures.

## AI Stack Feedback

The agent-facing docs index is useful immediately. I did not need to scrape a visual docs app to find the core endpoints.

I also ran the Jupiter CLI help through `npx -y @jup-ag/cli --help`. The CLI presents itself as "Jupiter CLI for agentic workflows" and exposes `--format <type>` plus `--dry-run`, which are exactly the affordances an agent needs. The top-level command groups were clear: `spot`, `lend`, `perps`, `predictions`, `keys`, `sign`, `config`, and `vrfd`.

The main limitation is that the docs and bounty do not spell out when a read-only REST prototype should use the CLI versus direct API calls. For this project, direct REST calls were cleaner because the project needed to compare raw response fields across Tokens, Price, and Swap.

The best next addition would be executable examples in a single "agent scratchpad" file:

```bash
curl "https://api.jup.ag/tokens/v2/search?query=JUP"
curl "https://api.jup.ag/price/v3?ids=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
curl "https://api.jup.ag/swap/v2/order?inputMint=...&outputMint=...&amount=...&taker=..."
```

Each example should include whether it works keyless, whether it consumes credits, and what fields are most important for agents to parse.

## How I Would Rebuild the Developer Landing Experience

Make the first screen a runnable API workbench instead of a marketing/dashboard split.

1. Pick a task: price lookup, route probe, limit order, DCA, prediction market.
2. Show one working keyless curl.
3. Let the user flip "with API key" on and see the exact header change.
4. Save the request as a project snippet.
5. Show usage analytics only after the first successful call.

This would align the platform with how agents and builders actually start: one endpoint, one response, then deeper integration.

## What I Wish Existed

- A route-only guide for Swap V2 that never signs or executes.
- Stable machine-readable API error categories.
- A canonical docs hostname and redirects for raw Markdown paths.
- A short "hackathon validation checklist" that says which endpoints count as Developer Platform usage.
- A generated OpenAPI bundle optimized for agents, with small examples for each endpoint.

## Final Notes

The core API design is strong. The main DX problem is not the API itself; it is the boundary between the new portal, the docs hostnames, and the expectations in partner bounties. Fixing that boundary would save builders real time.
