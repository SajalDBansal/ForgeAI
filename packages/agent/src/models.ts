// Finds the model a setting names, in pi-ai's catalog (which also knows each model's prices).

import {
  createProvider,
  type Api,
  type Model,
  type Models,
} from "@earendil-works/pi-ai"
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy"
import { builtinModels } from "@earendil-works/pi-ai/providers/all"

import type { AgentConfig } from "./config.js"

/** Every built-in provider, created once. Provider SDKs load on the first request to them. */
let catalog: ReturnType<typeof builtinModels> | undefined

// Returns the shared model collection, registering a custom provider for AGENT_BASE_URL if needed.
export function agentModels(config: AgentConfig): Models {
  catalog ??= builtinModels()
  if (config.baseUrl && !catalog.getProvider(config.provider)) {
    // A provider pi-ai doesn't know (Ollama, vLLM, a proxy): treat it as OpenAI-compatible.
    catalog.setProvider(
      createProvider({
        id: config.provider,
        baseUrl: config.baseUrl,
        auth: {
          apiKey: {
            name: config.provider,
            resolve: async () => ({ auth: { apiKey: config.apiKey } }),
          },
        },
        models: [],
        api: openAICompletionsApi(),
      }),
    )
  }
  return catalog
}

// Returns the model for an id. With AGENT_BASE_URL set, a model the catalog doesn't list is used as
// an OpenAI-compatible one (free, unknown limits); without it, an unknown id is a setup mistake.
export function resolveModel(config: AgentConfig, id: string): Model<Api> {
  const known = agentModels(config).getModel(config.provider, id)
  if (known)
    return config.baseUrl ? { ...known, baseUrl: config.baseUrl } : known
  if (!config.baseUrl) {
    throw new Error(
      `Model "${id}" isn't in pi-ai's catalog for provider "${config.provider}". Check AGENT_MODEL_* or set AGENT_BASE_URL.`,
    )
  }
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: config.provider,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_000,
  }
}
