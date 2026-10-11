import type { SecretRedaction } from "@forgeAI/shared"

export type RuntimeSecretConsumer =
  "dev-server" | "human-terminal" | "agent-command"

// Only the app runtime receives project env values. Other sandbox entry points stay useful for
// development, but should not become another way for the agent or a shared shell to read secrets.
export function projectSecretEnvFor(
  consumer: RuntimeSecretConsumer,
  secrets: Record<string, string>,
): Record<string, string> | undefined {
  return consumer === "dev-server" ? secrets : undefined
}

export function projectSecretRedactions(
  secrets: Record<string, string>,
): SecretRedaction[] {
  return Object.entries(secrets).map(([key, value]) => ({ key, value }))
}
