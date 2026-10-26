import { FILE_WRITE_BODY_LIMIT_BYTES } from "@forgeAI/shared"
import { FastifyInstance } from "fastify"
import {
  archiveProjectHandler,
  createProjectHandler,
  deleteProjectHandler,
  restoreProjectHandler,
  updateProjectHandler,
} from "../controller/project.controller.js"
import {
  commitProjectHandler,
  ensureProjectPodHandler,
  getProjectDevCommandHandler,
  getProjectPodHandler,
  listProjectFilesHandler,
  readProjectFileHandler,
  rollbackProjectHandler,
  connectProjectGithubHandler,
  githubStatusHandler,
  resolveShiftHandler,
  restoreShiftFileHandler,
  resetProjectDevCommandHandler,
  restartProjectPodHandler,
  setProjectDevCommandHandler,
  writeProjectFileHandler,
} from "../controller/sandbox.controller.js"
import {
  createGlobalPreviewLinkHandler,
  getPreviewLinkStatusHandler,
  stopGlobalPreviewLinkHandler,
} from "../controller/preview.controller.js"
import {
  cancelAgentRunHandler,
  createChatMessageHandler,
  startAgentRunHandler,
  undoAgentRunHandler,
  createTeamMessageHandler,
  deleteProjectSecretHandler,
  getProjectDetailHandler,
  listChatMessagesHandler,
  listProjectCommitsHandler,
  listProjectMembersHandler,
  listProjectSecretsHandler,
  listTeamMessagesHandler,
  markTeamChatReadHandler,
  mintWsTicketHandler,
  revealProjectSecretHandler,
  upsertProjectSecretHandler,
} from "../controller/build.controller.js"

// Registers project CRUD, sandbox, chat, secrets and history routes.
// Every route is keyed by project id and checks access in its controller.
export async function projectRouter(app: FastifyInstance): Promise<void> {
  app.post("/", createProjectHandler)
  app.get("/:id", getProjectDetailHandler)
  // Ticket for the project's live WebSocket (served by apps/ws-server).
  app.post("/:id/ws-ticket", mintWsTicketHandler)
  app.patch("/:id", updateProjectHandler)
  app.post("/:id/archive", archiveProjectHandler)
  app.post("/:id/restore", restoreProjectHandler)
  app.delete("/:id", deleteProjectHandler)

  // ---------- BUILD: SANDBOX ----------
  // Forwarded to apps/orchestrator, the only service that talks to E2B.
  app.post("/:id/sandbox", ensureProjectPodHandler)
  app.get("/:id/sandbox", getProjectPodHandler)
  app.post("/:id/sandbox/restart", restartProjectPodHandler)
  app.get("/:id/preview-link", getPreviewLinkStatusHandler)
  app.post("/:id/preview-link", createGlobalPreviewLinkHandler)
  app.delete("/:id/preview-link", stopGlobalPreviewLinkHandler)
  app.get("/:id/sandbox/fs/list", listProjectFilesHandler)
  app.get("/:id/sandbox/fs", readProjectFileHandler)
  // A whole file in one body, so a bigger limit than the rest of the API.
  app.put(
    "/:id/sandbox/fs",
    { bodyLimit: FILE_WRITE_BODY_LIMIT_BYTES },
    writeProjectFileHandler,
  )
  // The saved dev command; starting the server itself goes over the socket.
  app.get("/:id/sandbox/dev-command", getProjectDevCommandHandler)
  app.put("/:id/sandbox/dev-command", setProjectDevCommandHandler)
  app.delete("/:id/sandbox/dev-command", resetProjectDevCommandHandler)

  // ---------- BUILD: CHAT ----------
  app.get("/:id/messages", listChatMessagesHandler)
  app.post("/:id/messages", createChatMessageHandler)
  // A message for the agent: saved, and a run queued for the agent worker (I5).
  app.post("/:id/agent", startAgentRunHandler)
  // Stops queued, running or waiting agent work.
  app.post("/:id/agent-runs/:runId/cancel", cancelAgentRunHandler)
  // Undo one successful agent run back to its local checkpoint; no commit or push.
  app.post("/:id/agent-runs/:runId/undo", undoAgentRunHandler)

  // ---------- TEAM CHAT (collaborators talking to each other) ----------
  // History over HTTP; new messages are pushed as `team.message.created`.
  app.get("/:id/members", listProjectMembersHandler)
  app.get("/:id/team-messages", listTeamMessagesHandler)
  app.post("/:id/team-messages", createTeamMessageHandler)
  app.put("/:id/team-messages/read", markTeamChatReadHandler)

  // ---------- BUILD: CLOUD SECRETS ----------
  app.get("/:id/secrets", listProjectSecretsHandler)
  app.put("/:id/secrets", upsertProjectSecretHandler)
  app.get("/:id/secrets/:secretId/value", revealProjectSecretHandler)
  app.delete("/:id/secrets/:secretId", deleteProjectSecretHandler)

  // ---------- BUILD: HISTORY ----------
  app.get("/:id/commits", listProjectCommitsHandler)
  // Commits the sandbox's files to the project's GitHub repo.
  app.post("/:id/commits", commitProjectHandler)
  // Owner only: restores a commit's files and commits them as a new entry.
  app.post("/:id/commits/:commitId/rollback", rollbackProjectHandler)
  // Owner only: create the project's GitHub repo and push its files as the first commit.
  app.post("/:id/github/connect", connectProjectGithubHandler)
  // Detecting and resolving commits pushed to GitHub outside ForgeAI.
  app.get("/:id/github/status", githubStatusHandler)
  app.post("/:id/github/resolve", resolveShiftHandler)
  app.post("/:id/github/restore-file", restoreShiftFileHandler)
}
