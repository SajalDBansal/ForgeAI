import { FastifyReply, FastifyRequest } from "fastify"
import {
  agentProjectActorSchema,
  createChatMessageSchema,
  createTeamMessageSchema,
  encodeProjectTicketClaims,
  listChatMessagesQuerySchema,
  listTeamMessagesQuerySchema,
  markTeamChatReadSchema,
  signTicket,
  upsertProjectSecretSchema,
  WS_PROJECT_TICKET_SCOPE,
} from "@forgeAI/shared"
import { requireSession } from "../lib/session.js"
import { pushProjectSecrets } from "../service/sandbox.service.js"
import { RATE_LIMITS, withinLimit } from "../lib/rate-limit.js"
import { firstIssue } from "../lib/http.js"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { accessVersionForTicket } from "../lib/project-events.js"
import {
  cancelAgentRun,
  canAccessProject,
  canAccessLiveProject,
  createUserChatMessage,
  startAgentRun,
  deleteProjectSecret,
  getProjectDetail,
  listChatMessages,
  listProjectCommits,
  listProjectSecrets,
  revealProjectSecret,
  secretRedactionsForAgent,
  undoAgentRun,
  upsertProjectSecret,
} from "../service/build.service.js"
import {
  canPostTeamMessage,
  createTeamMessage,
  listProjectMembers,
  listTeamMessages,
  markTeamChatRead,
} from "../service/team-chat.service.js"
import { checkAgentModelBudget } from "../service/usage.service.js"

interface ProjectParams {
  id: string
}

interface SecretParams extends ProjectParams {
  secretId: string
}

interface AgentRunParams extends ProjectParams {
  runId: string
}

// Requires a session and read/write access to the project, else sends 401/404.
// Returns the session so handlers can use the user id.
async function authorize(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
  access: "read" | "write",
) {
  const session = await requireSession(request, reply)
  if (!session) return null

  if (!(await canAccessProject(session.user.id, request.params.id, access))) {
    reply.status(404).send({ error: "Project not found" })
    return null
  }
  return session
}

// POST /project/:id/ws-ticket: mints a short-lived WebSocket ticket for this project.
// Write access is decided here (where the database is) and signed into the ticket.
export async function mintWsTicketHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await canAccessLiveProject(session.user.id, request.params.id))) {
    return reply.status(404).send({ error: "Project not found" })
  }
  if (!(await withinLimit(reply, RATE_LIMITS.wsTicket, session.user.id))) return

  const canWrite = await canAccessProject(
    session.user.id,
    request.params.id,
    "write",
  )

  const ticket = signTicket(
    ENV_CONFIG.WS_TICKET_SECRET,
    session.user.id,
    WS_PROJECT_TICKET_SCOPE,
    encodeProjectTicketClaims({
      projectId: request.params.id,
      canWrite,
      accessVersion: await accessVersionForTicket(
        request.params.id,
        session.user.id,
      ),
    }),
  )
  return { ticket }
}

// GET /project/:id: returns the project, its repo and Info document.
// Open to anyone who can read the project.
export async function getProjectDetailHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const detail = await getProjectDetail(session.user.id, request.params.id)
  if (!detail) {
    return reply.status(404).send({ error: "Project not found" })
  }
  return detail
}

// ---------- CHAT ----------

// GET /project/:id/messages: pages backwards through the agent chat.
// Open to viewers.
export async function listChatMessagesHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  if (!(await authorize(request, reply, "read"))) return

  const parsed = listChatMessagesQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }
  return listChatMessages(request.params.id, parsed.data)
}

// POST /project/:id/messages: posts a user message to the agent chat.
// Editors and the owner only.
export async function createChatMessageHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.chatMessage, session.user.id)))
    return

  const parsed = createChatMessageSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const message = await createUserChatMessage(
    request.params.id,
    session.user.id,
    parsed.data,
  )
  return reply.status(201).send(message)
}

// POST /project/:id/agent: a message for the agent (I5). Saved like any chat message, and also
// starts a run: the agent worker answers it. Editors and the owner only.
export async function startAgentRunHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.chatMessage, session.user.id)))
    return

  const parsed = createChatMessageSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const budget = await checkAgentModelBudget(session.user.id, request.params.id)
  if (!budget.ok) {
    return reply
      .status(503)
      .send({ error: budget.message, code: "MODEL_BUDGET_PAUSED", budget })
  }

  const message = await startAgentRun(
    request.params.id,
    session.user.id,
    parsed.data,
  )
  return reply.status(201).send(message)
}

// POST /project/:id/agent-runs/:runId/undo: restores the files to the run's checkpoint.
// Editors and the owner only; this never commits or pushes.
export async function undoAgentRunHandler(
  request: FastifyRequest<{ Params: AgentRunParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return

  const result = await undoAgentRun(
    request.server,
    session.user.id,
    request.params.id,
    request.params.runId,
  )
  if (result.ok) return result
  if (result.reason === "not_found")
    return reply.status(404).send({ error: "Agent run not found" })
  if (result.reason === "no_checkpoint")
    return reply
      .status(409)
      .send({ error: "That run has no checkpoint to restore." })
  if (result.reason === "unsafe")
    return reply.status(409).send({
      error:
        result.message ?? "That run cannot be safely undone automatically.",
    })
  if (result.reason === "active_run")
    return reply.status(409).send({
      error:
        result.message ??
        "Wait for the active agent run to finish before undoing earlier work.",
    })
  if (result.reason === "conflict")
    return reply.status(409).send({
      error:
        result.message ??
        "Undo has conflicts with newer changes. Keep the newer changes or undo manually.",
    })
  if (result.reason === "no_pod")
    return reply.status(409).send({
      error: result.message ?? "Open the project first, then try undo again.",
    })
  return reply
    .status(502)
    .send({ error: result.message ?? "Couldn't undo that agent run." })
}

// POST /project/:id/agent-runs/:runId/cancel: stops queued, running or waiting agent work.
// Editors and the owner only. Already-finished runs are idempotent no-ops.
export async function cancelAgentRunHandler(
  request: FastifyRequest<{ Params: AgentRunParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return

  const result = await cancelAgentRun(
    session.user.id,
    request.params.id,
    request.params.runId,
  )
  if (result.ok) return result
  return reply.status(404).send({ error: "Agent run not found" })
}

// ---------- TEAM CHAT ----------

// GET /project/:id/members: everyone who can open the project.
// Used for the "N active" list and @-mentions.
export async function listProjectMembersHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  if (!(await authorize(request, reply, "read"))) return
  return listProjectMembers(request.params.id)
}

// GET /project/:id/team-messages: pages through the Team chat with read state.
// Open to viewers.
export async function listTeamMessagesHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "read")
  if (!session) return

  const parsed = listTeamMessagesQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }
  return listTeamMessages(request.params.id, session.user.id, parsed.data)
}

// POST /project/:id/team-messages: posts to the Team chat.
// Viewers may post here too; canPostTeamMessage decides.
export async function createTeamMessageHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.teamMessage, session.user.id)))
    return
  if (!(await canPostTeamMessage(session.user.id, request.params.id))) {
    return reply.status(404).send({ error: "Project not found" })
  }

  const parsed = createTeamMessageSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }
  const message = await createTeamMessage(
    request.params.id,
    session.user.id,
    parsed.data,
  )
  return reply.status(201).send(message)
}

// PUT /project/:id/team-messages/read: moves the user's read marker forward.
// Drives the unread badge on the Team tab.
export async function markTeamChatReadHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "read")
  if (!session) return

  const parsed = markTeamChatReadSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }
  await markTeamChatRead(request.params.id, session.user.id, parsed.data.seq)
  return reply.status(204).send()
}

// ---------- SECRETS ----------

// GET /project/:id/secrets: lists secret keys and scopes (never values).
// Open to viewers.
export async function listProjectSecretsHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  if (!(await authorize(request, reply, "read"))) return
  return listProjectSecrets(request.params.id)
}

// PUT /project/:id/secrets: creates or updates a secret.
// Editors and the owner only.
export async function upsertProjectSecretHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return

  const parsed = upsertProjectSecretSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }
  const saved = await upsertProjectSecret(
    request.params.id,
    parsed.data,
    session.user.id,
  )
  // New terminals and the next dev-server start see the change (I1).
  await pushProjectSecrets(request.server, request.params.id)
  return saved
}

// GET /project/:id/secrets/:secretId/value: decrypts and returns one secret's value.
// Editors and the owner only.
export async function revealProjectSecretHandler(
  request: FastifyRequest<{ Params: SecretParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return

  const value = await revealProjectSecret(
    request.params.id,
    request.params.secretId,
    session.user.id,
  )
  if (value === null) {
    return reply.status(404).send({ error: "Secret not found" })
  }
  return { value }
}

// POST /internal/agent/projects/:id/secret-redactions: values for the agent-worker's output scrubber.
// Internal-token only; never mounted on browser routes.
export async function secretRedactionsForAgentHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const parsed = agentProjectActorSchema.safeParse(request.body)
  if (!parsed.success)
    return reply.status(400).send({ error: firstIssue(parsed.error) })

  const secrets = await secretRedactionsForAgent(
    request.params.id,
    parsed.data.userId,
  )
  if (!secrets) return reply.status(404).send({ error: "Project not found" })
  return { secrets }
}

// DELETE /project/:id/secrets/:secretId: deletes a secret.
// Editors and the owner only.
export async function deleteProjectSecretHandler(
  request: FastifyRequest<{ Params: SecretParams }>,
  reply: FastifyReply,
) {
  const session = await authorize(request, reply, "write")
  if (!session) return

  const deleted = await deleteProjectSecret(
    request.params.id,
    request.params.secretId,
    session.user.id,
  )
  if (!deleted) {
    return reply.status(404).send({ error: "Secret not found" })
  }
  await pushProjectSecrets(request.server, request.params.id)
  return reply.status(204).send()
}

// ---------- HISTORY ----------

// GET /project/:id/commits: the project's History, newest first.
// Open to viewers.
export async function listProjectCommitsHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  if (!(await authorize(request, reply, "read"))) return
  return listProjectCommits(request.params.id)
}
