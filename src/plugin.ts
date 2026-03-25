import type {
  Plugin,
  Action,
  Provider,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";

const DEFAULT_API_URL = "https://api.thetrustlayer.xyz";
const DEFAULT_MIN_SCORE = 64;

let apiUrl = DEFAULT_API_URL;
let minScore = DEFAULT_MIN_SCORE;

// --- API client ---

interface TrustScore {
  agent_id: string;
  score: number;
  risk_level: string;
  chain: string;
  feedback_count: number;
  sybil_flags: string[];
  last_updated: string;
}

async function fetchTrustScore(agentId: string): Promise<TrustScore | null> {
  try {
    const res = await fetch(`${apiUrl}/score/${agentId}`);
    if (res.status === 402) {
      // x402 payment required — agent needs to pay $0.001 USDC on Base
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as TrustScore;
  } catch {
    return null;
  }
}

async function fetchTrustReport(agentId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${apiUrl}/trust/${agentId}`);
    if (res.status === 402) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Provider: injects trust context into agent prompts ---

export const trustScoreProvider: Provider = {
  name: "TRUST_SCORE",
  description:
    "Provides TrustLayer reputation scores for agents mentioned in conversation. " +
    "Scores range 0-100. Below 64 = high risk, 64-79 = medium risk, 80+ = low risk.",
  dynamic: true,

  get: async (_runtime: IAgentRuntime, message: Memory, _state?: State) => {
    // Extract agent IDs from message text (format: chain:id, e.g. base:1378)
    const text = typeof message.content === "string"
      ? message.content
      : message.content?.text ?? "";

    const agentIdPattern = /\b(bsc|ethereum|base|monad|polygon|solana-mainnet):[a-zA-Z0-9_-]+\b/g;
    const matches = text.match(agentIdPattern);

    if (!matches || matches.length === 0) {
      return { text: "", values: {}, data: {} };
    }

    const scores: TrustScore[] = [];
    for (const agentId of [...new Set(matches)].slice(0, 3)) {
      const score = await fetchTrustScore(agentId);
      if (score) scores.push(score);
    }

    if (scores.length === 0) {
      return { text: "", values: {}, data: {} };
    }

    const lines = scores.map((s) => {
      const flags = s.sybil_flags.length > 0
        ? ` [SYBIL FLAGS: ${s.sybil_flags.join(", ")}]`
        : "";
      return `- ${s.agent_id}: score ${s.score}/100 (${s.risk_level} risk), ${s.feedback_count} reviews${flags}`;
    });

    return {
      text: `TrustLayer reputation data:\n${lines.join("\n")}`,
      values: { trustScores: scores },
      data: { trustScores: scores },
    };
  },
};

// --- Action: explicit trust check ---

export const trustCheckAction: Action = {
  name: "CHECK_AGENT_TRUST",
  description:
    "Check the TrustLayer reputation score of an AI agent before transacting. " +
    "Use this before sending payments, hiring agents, or accepting work from unknown agents. " +
    "Requires an agent ID in chain:id format (e.g. base:1378, bsc:42000, solana-mainnet:ABC123).",
  similes: [
    "check trust score",
    "verify agent reputation",
    "is this agent safe",
    "agent risk check",
    "trust check",
    "reputation lookup",
    "sybil check",
  ],

  examples: [
    [
      {
        name: "user",
        content: { text: "Check the trust score for base:1378" },
      },
      {
        name: "agent",
        content: {
          text: "I'll check the TrustLayer reputation for base:1378.",
          actions: ["CHECK_AGENT_TRUST"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "Is bsc:42000 safe to transact with?" },
      },
      {
        name: "agent",
        content: {
          text: "Let me look up the trust score for bsc:42000.",
          actions: ["CHECK_AGENT_TRUST"],
        },
      },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = typeof message.content === "string"
      ? message.content
      : message.content?.text ?? "";
    return /\b(bsc|ethereum|base|monad|polygon|solana-mainnet):[a-zA-Z0-9_-]+\b/.test(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const text = typeof message.content === "string"
      ? message.content
      : message.content?.text ?? "";

    const match = text.match(
      /\b(bsc|ethereum|base|monad|polygon|solana-mainnet):[a-zA-Z0-9_-]+\b/
    );

    if (!match) {
      return {
        text: "No agent ID found. Use format chain:id (e.g. base:1378, bsc:42000).",
        success: false,
      };
    }

    const agentId = match[0];

    if (callback) {
      callback({ text: `Looking up trust score for ${agentId}...` });
    }

    const report = await fetchTrustReport(agentId);

    if (!report) {
      const score = await fetchTrustScore(agentId);
      if (!score) {
        return {
          text: `Could not retrieve trust data for ${agentId}. The agent may not be registered on-chain, or x402 payment is required.`,
          success: false,
          error: "Agent not found or payment required",
        };
      }

      const safe = score.score >= minScore;
      const flags = score.sybil_flags.length > 0
        ? `\nSybil flags: ${score.sybil_flags.join(", ")}`
        : "";

      return {
        text: `Trust score for ${agentId}: ${score.score}/100 (${score.risk_level} risk)\n` +
          `Feedback: ${score.feedback_count} reviews${flags}\n` +
          `Recommendation: ${safe ? "Safe to transact." : "CAUTION — score below minimum threshold."}`,
        data: { score, safe },
        success: true,
      };
    }

    const score = (report as any).score ?? 0;
    const riskLevel = (report as any).risk_level ?? "unknown";
    const safe = score >= minScore;

    return {
      text: `Trust report for ${agentId}: ${score}/100 (${riskLevel} risk)\n` +
        `Recommendation: ${safe ? "Safe to transact." : "CAUTION — score below minimum threshold."}`,
      data: { report, safe },
      success: true,
    };
  },
};

// --- Plugin definition ---

export const trustlayerPlugin: Plugin = {
  name: "plugin-trustlayer",
  description:
    "TrustLayer reputation scoring for AI agents. Provides pre-transaction trust checks, " +
    "Sybil detection flags, and cross-chain agent reputation data across 6 chains " +
    "(BSC, Ethereum, Base, Monad, Polygon, Solana). Scores agents 0-100 using on-chain " +
    "ERC-8004 feedback analysis. Paid via x402 micropayments ($0.001 USDC per query).",

  config: {
    TRUSTLAYER_API_URL: process.env.TRUSTLAYER_API_URL ?? null,
    TRUSTLAYER_MIN_SCORE: process.env.TRUSTLAYER_MIN_SCORE ?? null,
  },

  init: async (config: Record<string, string>) => {
    if (config.TRUSTLAYER_API_URL) {
      apiUrl = config.TRUSTLAYER_API_URL;
    }
    if (config.TRUSTLAYER_MIN_SCORE) {
      const parsed = parseInt(config.TRUSTLAYER_MIN_SCORE, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        minScore = parsed;
      }
    }
    console.log(`[TrustLayer] Plugin initialized — API: ${apiUrl}, min score: ${minScore}`);
  },

  actions: [trustCheckAction],
  providers: [trustScoreProvider],
};

export default trustlayerPlugin;
