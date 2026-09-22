export interface PrivilegedGitWork {
  kind: string
}

export interface PrivilegedGitState {
  activeWork: PrivilegedGitWork[]
  devServerRunning: boolean
  terminalOpen: boolean
}

export function privilegedGitBlockers(state: PrivilegedGitState): string[] {
  const blockers = new Set<string>()
  if (state.devServerRunning) blockers.add("dev_server")
  if (state.terminalOpen) blockers.add("terminal")

  for (const work of state.activeWork) {
    if (work.kind === "git") continue
    blockers.add(work.kind)
  }

  return [...blockers].sort()
}
