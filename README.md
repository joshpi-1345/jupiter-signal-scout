# Jupiter Signal Scout

Jupiter Signal Scout is a small agent-built CLI that cross-checks three Jupiter Developer Platform surfaces:

- Tokens V2 for token discovery and metadata
- Price V3 for the canonical USD price
- Swap V2 `/order` for a real route-quality probe

The script does not sign or submit transactions. It calls Swap V2 `/order` without `taker`, which returns a quote with `transaction: null`, then compares the route-implied output value against Price V3.

## Run

```bash
npm run demo
```

Optional:

```bash
node jupiter-signal-scout.mjs --tokens SOL,JUP,BONK,WIF --amount-usdc 5 --json
```

If you have a Jupiter Developer Platform API key, set it as:

```bash
export JUPITER_API_KEY="..."
```

Without a key, the tool uses official keyless access and waits between requests to stay under the prototype rate limit.

## Why This Exists

Price APIs and executable routes answer different questions. Price V3 is the clean display price; Swap V2 `/order` is what a real route returns for a concrete size. The interesting signal is the gap between those two values, especially for long-tail tokens or tokens with weak liquidity.

The output is meant to be a short triage report, not an automated trading system.

## Example Output

See `RUN-OUTPUT.json` for a live run captured during the Frontier/Jupiter bounty work.

## Files

- `jupiter-signal-scout.mjs`: standalone Node.js CLI
- `DX-REPORT.md`: developer experience findings from building this
- `RUN-OUTPUT.json`: captured live run
- `JUP-CLI-HELP.txt`: captured `@jup-ag/cli --help` output from the AI-stack check

## Safety

This tool omits `taker`, never receives a signable transaction, and never calls `/execute`. Treat any route output as market data only.
