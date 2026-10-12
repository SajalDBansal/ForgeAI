import type { GitRefusal } from "@forgeAI/shared"

import { activeProjectWork } from "./active-work.service.js"
import { isDevServerRunning } from "./dev.service.js"
import { isTerminalOpen } from "./terminal.service.js"
import { privilegedGitBlockers } from "./privileged-git-policy-core.js"

export function privilegedGitRefusal(
  projectId: string,
): Extract<GitRefusal, { reason: "privileged_busy" }> | undefined {
  const blockers = privilegedGitBlockers({
    activeWork: activeProjectWork(projectId),
    devServerRunning: isDevServerRunning(projectId),
    terminalOpen: isTerminalOpen(projectId),
  })
  return blockers.length ? { reason: "privileged_busy", blockers } : undefined
}
