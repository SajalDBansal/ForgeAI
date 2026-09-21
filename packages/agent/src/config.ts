// The agent's settings (work plan I4). Which provider and models to use is configuration, not
// code: switching from a free OpenRouter model to Claude is a change of four settings.

import type { ThinkingLevel } from "@earendil-works/pi-agent-core"

/** How hard the main model thinks. Providers without reasoning ignore it. */
export const AGENT_THINKING_LEVELS = [
  "off",
  "low",
  "medium",
  "high",
] as const satisfies readonly ThinkingLevel[]
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number]

export interface AgentConfig {
  /** A pi-ai provider id: openrouter, anthropic, openai, google, groq, ... */
  provider: string
  apiKey: string
  /** An OpenAI-compatible endpoint, for a provider or model pi-ai doesn't list (e.g. Ollama). */
  baseUrl?: string
  /** The main model: writes code and uses tools. */
  modelCode: string
  /** The small, fast model: sorting requests, short summaries. */
  modelFast: string
  /** Optional last try when the main model is rate-limited before writing anything. */
  modelFallback?: string
  thinking: AgentThinkingLevel
}

// Reads the agent's settings from an environment (the worker passes `process.env`).
// Throws naming every missing setting, so a bad deploy fails at startup, not on the first message.
export function agentConfigFromEnv(env: NodeJS.ProcessEnv): AgentConfig {
  const missing = [
    "AGENT_PROVIDER",
    "AGENT_API_KEY",
    "AGENT_MODEL_CODE",
    "AGENT_MODEL_FAST",
  ].filter((name) => !env[name]?.trim())
  if (missing.length > 0)
    throw new Error(
      `Missing agent settings: ${missing.join(", ")} (see packages/agent/.env.example)`,
    )

  const thinking = (env.AGENT_THINKING?.trim() || "low") as AgentThinkingLevel
  if (!AGENT_THINKING_LEVELS.includes(thinking)) {
    throw new Error(
      `AGENT_THINKING must be one of ${AGENT_THINKING_LEVELS.join(", ")}, not "${thinking}"`,
    )
  }

  return {
    provider: env.AGENT_PROVIDER!.trim(),
    apiKey: env.AGENT_API_KEY!.trim(),
    baseUrl: env.AGENT_BASE_URL?.trim() || undefined,
    modelCode: env.AGENT_MODEL_CODE!.trim(),
    modelFast: env.AGENT_MODEL_FAST!.trim(),
    modelFallback: env.AGENT_MODEL_FALLBACK?.trim() || undefined,
    thinking,
  }
}
