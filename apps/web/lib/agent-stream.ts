import type { AgentEvent, AgentSnapshot } from "@forgeAI/shared"

// Buffer live events during catch-up and replay only those newer than the snapshot.
export function createAgentStream(
  onSnapshot: (events: AgentEvent[]) => void,
  onEvent: (event: AgentEvent) => void,
) {
  let pending: AgentEvent[] | undefined = []
  let revision = 0

  function event(value: AgentEvent): void {
    if (pending) {
      pending.push(value)
      return
    }
    if (value.revision !== undefined && value.revision <= revision) return
    revision = value.revision ?? revision
    onEvent(value)
  }

  function snapshot(value: AgentSnapshot): void {
    if (!pending && value.revision <= revision) return
    const buffered = pending ?? []
    pending = undefined
    revision = value.revision
    onSnapshot(value.events)
    for (const item of buffered) event(item)
  }

  function reset(): void {
    pending = []
    revision = 0
    onSnapshot([])
  }

  return { event, snapshot, reset }
}
