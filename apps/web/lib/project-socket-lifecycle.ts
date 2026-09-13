export const ACCESS_LOST_MESSAGE = "You no longer have access to this project."
export const ACCESS_GAINED_WRITE_MESSAGE = "You can now edit this project."
export const ACCESS_CHANGED_MESSAGE = "Your access to this project changed."

export interface TicketRequestSuccess {
  ok: true
  data: { ticket: string }
}

export interface TicketRequestFailure {
  ok: false
  status?: number
}

export type TicketRequestResult = TicketRequestSuccess | TicketRequestFailure
export type RequestProjectTicket = (
  projectId: string,
) => Promise<TicketRequestResult>
export type SocketAuth = (callback: (data: object) => void) => void

export function isAccessRefusedStatus(status: number | undefined): boolean {
  return status === 401 || status === 404
}

// Returns a Socket.IO auth function that fetches a fresh project ticket for every connect.
export function createTicketAuth(
  projectId: string,
  requestTicket: RequestProjectTicket,
  onRefused: () => void,
): SocketAuth {
  return (callback) => {
    void requestTicket(projectId).then((result) => {
      if (!result.ok && isAccessRefusedStatus(result.status)) onRefused()
      callback(result.ok ? { projectId, ticket: result.data.ticket } : {})
    })
  }
}

export function accessChangeMessage(canWrite: boolean): string {
  return canWrite ? ACCESS_GAINED_WRITE_MESSAGE : ACCESS_CHANGED_MESSAGE
}

export function createAccessChangeTracker(
  onAccessChanged: (message: string) => void,
): (payload: { canWrite: boolean }) => void {
  let lastCanWrite: boolean | undefined
  return ({ canWrite }) => {
    if (lastCanWrite !== undefined && lastCanWrite !== canWrite)
      onAccessChanged(accessChangeMessage(canWrite))
    lastCanWrite = canWrite
  }
}

export function shouldReconnectAfterDisconnect(reason: string): boolean {
  return reason === "io server disconnect"
}
