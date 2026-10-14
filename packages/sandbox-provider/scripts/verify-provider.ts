// Smoke test that the configured provider works: create a sandbox, run a command, destroy it.
// Run from the repo root: bun run --cwd apps/orchestrator ../../packages/sandbox-provider/scripts/verify-provider.ts
import {
  createSandboxProvider,
  type SandboxProviderName,
} from "../src/index.js"

// Creates a sandbox, checks an echo command's output, then kills the sandbox.
// Throws if the output doesn't match, so the script exits non-zero.
async function main() {
  const provider = createSandboxProvider({
    provider: (process.env.SANDBOX_PROVIDER ?? "e2b") as SandboxProviderName,
    apiKey: process.env.E2B_API_KEY ?? "",
    environment: "verify-provider",
    maxLifetimeMinutes: null,
  })

  console.log(`Creating a sandbox on ${provider.name}...`)
  const pod = await provider.createPod("verify-provider", "base", 60_000)
  console.log("Sandbox created:", pod.sandboxId)

  try {
    const result = await provider.runPodCommand(
      pod.sandboxId,
      'echo "hello from the sandbox"',
      { timeoutMs: 30_000 },
    )
    console.log("exit code:", result.exitCode)
    console.log("stdout:", result.stdout.trim())
    if (result.stderr) console.log("stderr:", result.stderr.trim())

    if (
      result.exitCode !== 0 ||
      result.stdout.trim() !== "hello from the sandbox"
    ) {
      throw new Error("Sandbox ran but output did not match expectations")
    }
  } finally {
    await provider.killPod(pod.sandboxId)
    console.log("Sandbox destroyed.")
  }

  console.log("Provider verification passed.")
}

main().catch((err) => {
  console.error("Provider verification failed:", err)
  process.exit(1)
})
