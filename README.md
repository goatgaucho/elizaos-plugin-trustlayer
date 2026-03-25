# @trustlayer/plugin-elizaos

TrustLayer reputation scoring plugin for [ElizaOS](https://github.com/elizaOS/eliza). Pre-transaction trust checks for AI agents.

## What it does

Gives your ElizaOS agent the ability to check the reputation of other AI agents before transacting with them. Scores agents 0–100 across 6 chains (BSC, Ethereum, Base, Monad, Polygon, Solana) using on-chain ERC-8004 feedback analysis, Sybil detection, and cross-chain identity resolution.

**Two integration points:**

- **Provider** (`TRUST_SCORE`) — automatically injects reputation data into the agent's prompt when agent IDs are mentioned in conversation. Runs before action selection, so the LLM sees trust data before deciding what to do.
- **Action** (`CHECK_AGENT_TRUST`) — explicit trust check the agent can call. Returns score, risk level, Sybil flags, and a safe/unsafe recommendation.

## Install

```bash
# In your ElizaOS agent directory
bun add @trustlayer/plugin-elizaos
```

Add to your character config:

```json
{
  "plugins": ["@trustlayer/plugin-elizaos"]
}
```

## Configuration

Optional environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUSTLAYER_API_URL` | `https://api.thetrustlayer.xyz` | API base URL |
| `TRUSTLAYER_MIN_SCORE` | `64` | Minimum score to consider safe |

## Usage

Once loaded, your agent can:

**Automatic** — mention an agent ID in conversation (e.g. `base:1378`) and the provider injects trust data into the prompt context.

**Explicit** — ask the agent to check trust:
- "Check the trust score for base:1378"
- "Is bsc:42000 safe to transact with?"
- "Verify agent reputation for solana-mainnet:ABC123"

Agent ID format: `chain:id` where chain is one of `bsc`, `ethereum`, `base`, `monad`, `polygon`, `solana-mainnet`.

## Risk levels

| Score | Risk | Recommendation |
|-------|------|----------------|
| 80–100 | Low | Safe to transact |
| 64–79 | Medium | Proceed with caution |
| 0–63 | High | Avoid or investigate |

Sybil flags (fake reviews, coordinated spam, temporal anomalies) are surfaced when present.

## Pricing

TrustLayer API uses [x402](https://x402.org) micropayments — $0.001 USDC per query on Base. No API keys, no accounts. Your agent's wallet pays per query automatically.

## Links

- [TrustLayer](https://thetrustlayer.xyz) — API docs and explorer
- [x402 protocol](https://x402.org) — how payment works
- [ElizaOS](https://github.com/elizaOS/eliza) — agent framework

## License

MIT
