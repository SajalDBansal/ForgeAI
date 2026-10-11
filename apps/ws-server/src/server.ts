import { createServer, type ServerResponse } from "node:http"
import {
  Server as SocketIOServer,
  type DefaultEventsMap,
  type Socket,
} from "socket.io"
import {
  beginShutdown,
  browserCorsOriginAllowed,
  checkReadiness,
  DOC_UPDATE_MAX_CHARS,
  isWriteCommand,
  readinessResponse,
  terminalCommandSchema,
} from "@forgeAI/shared"
import type {
  AgentEvent,
  ClientToServerEvents,
  ProjectEvent,
  SandboxEvent,
  ServerToClientEvents,
  SocketData,
} from "@forgeAI/shared"
import { ENV_CONFIG } from "./envConfig.js"
import {
  checkRedis,
  getAgentSnapshot,
  getProjectAccessVersion,
  publishTerminalCommand,
  setAgentEventHandler,
  setProjectEventHandler,
  setSandboxEventHandler,
  subscribeToProject,
  unsubscribeFromProject,
} from "./redis.js"
import {
  checkPresenceRedis,
  closePresence,
  joinPresence,
  leavePresence,
} from "./presence.js"
import { createMessageBudget } from "./message-budget.js"
import {
  authenticateProjectTicket,
  disconnectAffectedProjectSockets,
} from "./access-policy.js"

type ProjectSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>

// Sends a JSON answer from the plain HTTP server (Socket.IO handles everything else).
function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify(body))
}

// GET /readyz: Redis answers on every connection this instance uses; 503 names what failed.
async function answerReadiness(response: ServerResponse): Promise<void> {
  const report = await checkReadiness({
    redis: () => Promise.all([checkRedis(), checkPresenceRedis()]),
  })
  if (!report.ready) console.warn("[readyz] not ready:", report.errors)

  const { status, body } = readinessResponse(report)
  sendJson(response, status, body)
}

const httpServer = createServer((request, response) => {
  // Liveness: the process is up. Checks nothing else, so a Redis blip never gets it restarted.
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { status: "ok" })
    return
  }
  if (request.method === "GET" && request.url === "/readyz") {
    void answerReadiness(response)
    return
  }
  // Always answer, so stray requests don't hang until they time out.
  response.writeHead(404, { "content-type": "text/plain" }).end("not found")
})

const io = new SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>(httpServer, {
  cors: { origin: ENV_CONFIG.CLIENT_ORIGIN },
  allowRequest: (request, callback) => {
    callback(
      null,
      browserCorsOriginAllowed(request.headers.origin, [
        ENV_CONFIG.CLIENT_ORIGIN,
      ]),
    )
  },
  transports: ["websocket"],
  pingInterval: ENV_CONFIG.WS_PING_INTERVAL_MS,
  pingTimeout: ENV_CONFIG.WS_PING_TIMEOUT_MS,
  // Largest message a tab may send. Socket.IO drops the whole connection above it (default
  // 1 MB), so it sits just above the biggest valid one: a doc.update, plus room for the envelope.
  maxHttpBufferSize: DOC_UPDATE_MAX_CHARS + 512 * 1024,
})

async function authenticateProjectSocket(socket: ProjectSocket): Promise<void> {
  const { projectId, ticket } = socket.handshake.auth as {
    projectId?: string
    ticket?: string
  }

  const auth = await authenticateProjectTicket({
    secret: ENV_CONFIG.WS_TICKET_SECRET,
    projectId,
    ticket,
    currentAccessVersion: getProjectAccessVersion,
  })
  if (!auth.ok) throw new Error("unauthorized")

  socket.data.projectId = auth.projectId
  socket.data.userId = auth.userId
  socket.data.canWrite = auth.canWrite
}

// Verifies the handshake ticket and stores the project, user and write access on the socket.
// Runs as Socket.IO middleware, so unauthorized sockets never connect.
function authenticateSocket(
  socket: ProjectSocket,
  next: (err?: Error) => void,
): void {
  void authenticateProjectSocket(socket).then(
    () => next(),
    () => next(new Error("unauthorized")),
  )
}

// Closes the socket after the max connection lifetime (with ±10% jitter).
// Backstop so stale access can't outlive a missed `access.changed` event.
function scheduleMaxLifetime(socket: ProjectSocket): NodeJS.Timeout {
  return setTimeout(
    () => socket.disconnect(true),
    ENV_CONFIG.WS_MAX_CONNECTION_MINUTES * 60_000 * (0.9 + Math.random() * 0.2),
  )
}

// Validates a browser's terminal command and forwards it to the orchestrator.
// Viewers are refused write commands; project and user come from the ticket and the tab id from the socket, never the payload.
function handleTerminalCommand(socket: ProjectSocket, payload: unknown): void {
  const parsed = terminalCommandSchema.safeParse(payload)
  if (!parsed.success) return
  if (!socket.data.canWrite && isWriteCommand(parsed.data.type)) return

  publishTerminalCommand({
    ...parsed.data,
    projectId: socket.data.projectId,
    userId: socket.data.userId,
    connectionId: socket.id,
  })
}

// Disconnects a tab that sent too much in one second (see message-budget.ts). Disconnecting is
// safe where dropping a message isn't: the tab reconnects and catches up, and each reconnect
// needs a ticket, which api-server limits, so a runaway loop slows itself down.
function disconnectOverBudget(socket: ProjectSocket): void {
  console.warn(
    `[ws-server] tab sent too much, disconnecting: user ${socket.data.userId}, project ${socket.data.projectId}`,
  )
  socket.disconnect(true)
}

// Checks whether this instance has no sockets left in a project's room.
// Drives per-process Redis subscribe/unsubscribe for that project.
function isRoomEmpty(projectId: string): boolean {
  return !io.sockets.adapter.rooms.get(projectId)?.size
}

// Joins a socket to its project room, subscribes Redis, and wires its events.
// Runs once per successful connection.
function handleConnection(socket: ProjectSocket): void {
  const { projectId } = socket.data

  void socket.join(projectId)
  const subscribed = subscribeToProject(projectId)

  // Presence is shared across instances via Redis, unlike rooms.
  joinPresence(socket.id, projectId)

  // Tell the tab its own access so it can notice when that changes.
  socket.emit("access", { canWrite: socket.data.canWrite })
  // Subscribe before reading the snapshot so no event can fall between the two.
  void subscribed.then(() => sendAgentSnapshot(socket))

  const lifetime = scheduleMaxLifetime(socket)

  const withinBudget = createMessageBudget()
  socket.on("agent:sync", () => {
    if (!withinBudget({ type: "agent:sync" }))
      return disconnectOverBudget(socket)
    void subscribed.then(() => sendAgentSnapshot(socket))
  })
  socket.on("terminal:command", (payload) => {
    if (!withinBudget(payload)) return disconnectOverBudget(socket)
    handleTerminalCommand(socket, payload)
  })

  socket.on("disconnect", () => {
    clearTimeout(lifetime)
    leavePresence(socket.id)
    if (isRoomEmpty(projectId)) unsubscribeFromProject(projectId)
  })
}

async function sendAgentSnapshot(socket: ProjectSocket): Promise<void> {
  try {
    const snapshot = await getAgentSnapshot(socket.data.projectId)
    if (socket.connected) socket.emit("agent:snapshot", snapshot)
  } catch (error) {
    console.error(
      `[ws-server] failed to read agent snapshot for ${socket.data.projectId}:`,
      error,
    )
    if (socket.connected)
      socket.emit("agent:snapshot", { events: [], revision: 0 })
  }
}

// Disconnects this instance's sockets affected by an access change.
// Tabs reconnect with a fresh ticket that reflects their new access.
function disconnectAffectedSockets(
  projectId: string,
  userId: string | null,
): void {
  disconnectAffectedProjectSockets(
    io.sockets.sockets.values(),
    projectId,
    userId,
  )
}

// The browser should know that the dev server is live, but not the provider's raw public URL.
function browserSafeSandboxEvent(event: SandboxEvent): SandboxEvent {
  if (event.type !== "dev.status" || !event.previewUrl) return event
  const safeEvent = { ...event }
  delete safeEvent.previewUrl
  return safeEvent
}

/** Set on shutdown: new sockets are refused, so tabs reconnect to another instance. */
let draining = false

// The browser treats this like any failed connect and retries, landing on an instance that's staying.
io.use((_socket, next) =>
  draining ? next(new Error("This server is restarting.")) : next(),
)
io.use(authenticateSocket)
io.on("connection", handleConnection)

setProjectEventHandler((projectId, event) => {
  const projectEvent = event as ProjectEvent

  // Access changes are handled here and never forwarded to browsers.
  if (projectEvent.type === "access.changed") {
    disconnectAffectedSockets(projectId, projectEvent.userId)
    return
  }

  io.to(projectId).emit("project:event", projectEvent)
})

// Sandbox output goes to the whole room: a PTY is one shared screen.
setSandboxEventHandler((projectId, event) => {
  const sandboxEvent = browserSafeSandboxEvent(
    event as Parameters<ServerToClientEvents["sandbox:event"]>[0],
  )
  // A late joiner's terminal history is for that one tab; every socket has a room of its own id.
  // On other instances that room is empty, so only the instance holding the tab delivers it.
  if (sandboxEvent.type === "terminal.history") {
    io.to(sandboxEvent.connectionId).emit("sandbox:event", sandboxEvent)
    return
  }
  io.to(projectId).emit("sandbox:event", sandboxEvent)
})

// The agent's live activity goes to everyone on the project, viewers included, like its chat.
setAgentEventHandler((projectId, event) => {
  io.to(projectId).emit("agent:event", event as AgentEvent)
})

// Starts listening for WebSocket connections on the configured port.
// Called once from index.ts at boot.
export function startServer(): void {
  const port = Number(ENV_CONFIG.PORT)
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[ws-server] listening on :${port}`)
  })
}

/** Gap between disconnect batches while draining. */
const DRAIN_STEP_MS = 500

// Fails /readyz, refuses new sockets, disconnects the open ones in batches over drainMs, then closes.
// Browsers reconnect by themselves; spreading it out stops them all hitting the other instances at once.
export async function stopServer(drainMs: number): Promise<void> {
  beginShutdown()
  draining = true

  const sockets = [...io.sockets.sockets.values()]
  const rounds = Math.max(1, Math.ceil(drainMs / DRAIN_STEP_MS))
  const perRound = Math.max(1, Math.ceil(sockets.length / rounds))
  for (let i = 0; i < sockets.length; i += perRound) {
    for (const socket of sockets.slice(i, i + perRound)) socket.disconnect(true)
    if (i + perRound < sockets.length)
      await new Promise((resolve) => setTimeout(resolve, DRAIN_STEP_MS))
  }

  // Also closes the HTTP server; then clear this instance's presence so projects don't look occupied.
  await new Promise<void>((resolve) => io.close(() => resolve()))
  await closePresence()
}
