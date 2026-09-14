import type { SandboxProvider } from "@forgeAI/sandbox-provider"

// The image contract (work plan F1, docs/09 §5): what every sandbox image must contain, on any
// provider. Snapshots, restores, git and the agent's search all run as shell scripts inside the
// sandbox, so a missing tool breaks them only later, for a user. templates:sync checks each new
// image here before publishing it.

/** Tools the in-sandbox scripts call. */
const REQUIRED_TOOLS = ["bash", "git", "curl", "tar", "gzip", "rg"]
/** The oldest git our scripts work with: 2.30. */
const MIN_GIT_MAJOR = 2
const MIN_GIT_MINOR = 30
/** Where every orchestrator path expects the project, writable by the sandbox's user. */
const PROJECT_ROOT = "/home/user/app"
const SANDBOX_USER = "user"

// One script, one round trip: prints a line per requirement for parseReport to read.
function contractScript(r2Endpoint: string): string {
  const reach = (url: string) =>
    `$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 '${url}' || true)`
  return [
    `missing=""; for tool in ${REQUIRED_TOOLS.join(" ")}; do command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"; done`,
    `echo "missing:$missing"`,
    `echo "git:$(git --version 2>/dev/null)"`,
    `echo "user:$(id -un)"`,
    `if [ -d ${PROJECT_ROOT} ] && [ -w ${PROJECT_ROOT} ]; then echo "project:ok"; else echo "project:no"; fi`,
    `echo "github:${reach("https://github.com")}"`,
    `echo "r2:${reach(r2Endpoint)}"`,
  ].join("\n")
}

// Turns the script's output into problems; an empty list means the image meets the contract.
function parseReport(stdout: string): string[] {
  const field = (key: string) =>
    stdout.match(new RegExp(`^${key}:(.*)$`, "m"))?.[1]?.trim() ?? ""
  const problems: string[] = []

  const missing = field("missing")
  if (missing)
    problems.push(`missing tools: ${missing.split(/\s+/).join(", ")}`)

  const [major = 0, minor = 0] = (field("git").match(/(\d+)\.(\d+)/) ?? [])
    .slice(1)
    .map(Number)
  if (
    field("git") &&
    (major < MIN_GIT_MAJOR ||
      (major === MIN_GIT_MAJOR && minor < MIN_GIT_MINOR))
  ) {
    problems.push(
      `git ${major}.${minor} is older than ${MIN_GIT_MAJOR}.${MIN_GIT_MINOR}`,
    )
  }
  if (field("user") !== SANDBOX_USER)
    problems.push(`commands run as "${field("user")}", not "${SANDBOX_USER}"`)
  if (field("project") !== "ok")
    problems.push(
      `${PROJECT_ROOT} is missing or not writable by ${SANDBOX_USER}`,
    )
  // Any HTTP answer proves the network path; "000" means no answer at all.
  if (["", "000"].includes(field("github")))
    problems.push("no outbound HTTPS to github.com")
  if (["", "000"].includes(field("r2")))
    problems.push("no outbound HTTPS to the R2 endpoint")
  return problems
}

// Opens one sandbox from \`image\`, checks the contract, and kills it. Returns the problems found
// (empty when the image is fine).
export async function checkImageContract(
  provider: SandboxProvider,
  image: string,
  r2Endpoint: string,
): Promise<string[]> {
  const pod = await provider.createPod(`image-check:${image}`, image, 120_000)
  try {
    const { stdout, stderr, exitCode } = await provider.runPodCommand(
      pod.sandboxId,
      contractScript(r2Endpoint),
      { timeoutMs: 60_000 },
    )
    if (exitCode !== 0)
      return [
        `the check script failed (exit ${exitCode}): ${stderr.trim().slice(0, 200)}`,
      ]
    return parseReport(stdout)
  } finally {
    await provider.killPod(pod.sandboxId).catch(() => undefined)
  }
}
