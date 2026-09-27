import { createSandboxProvider } from "@forgeAI/sandbox-provider"

import { ENV_CONFIG } from "../envConfig.js"

// The one sandbox provider this orchestrator uses (work plan F4). Which provider is a setting
// (SANDBOX_PROVIDER, "e2b" today), and its credentials are read here and nowhere else. Services
// call provider.method(sandboxId, …) and never see an API key.
export const provider = createSandboxProvider({
  provider: ENV_CONFIG.SANDBOX_PROVIDER,
  apiKey: ENV_CONFIG.E2B_API_KEY,
  environment: ENV_CONFIG.SANDBOX_ENVIRONMENT,
  maxLifetimeMinutes: ENV_CONFIG.SANDBOX_PLAN.maxLifetimeMinutes,
})
