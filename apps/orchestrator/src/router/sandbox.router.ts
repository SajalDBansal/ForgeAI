import { FILE_WRITE_BODY_LIMIT_BYTES } from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"
import {
  agentCheckpointHandler,
  agentCheckpointDiffHandler,
  agentCheckpointRestoreHandler,
  agentDevLogsHandler,
  agentDevStartHandler,
  agentDevStopHandler,
  agentEditFileHandler,
  agentExecHandler,
  agentSearchHandler,
  restoreCommitHandler,
  gitCheckHandler,
  gitCommitHandler,
  gitPrepareHandler,
  gitResolveHandler,
  gitRestoreFileHandler,
  gitRollbackHandler,
  listPodFilesHandler,
  destroyPodHandler,
  ensurePodHandler,
  getDevStatusHandler,
  getPodHandler,
  readPodFileHandler,
  ragSourceHandler,
  restartPodHandler,
  setPodSecretsHandler,
  writePodFileHandler,
} from "../controller/sandbox.controller.js"

// Registers the sandbox, file and git routes for a project.
// Every route is keyed by projectId; api-server has already authorized the user.
export async function sandboxRouter(app: FastifyInstance): Promise<void> {
  app.post("/:projectId/ensure", ensurePodHandler)
  app.get("/:projectId", getPodHandler)
  app.get("/:projectId/dev", getDevStatusHandler)
  app.delete("/:projectId", destroyPodHandler)
  app.post("/:projectId/restart", restartPodHandler)
  app.get("/:projectId/fs/list", listPodFilesHandler)
  app.get("/:projectId/fs", readPodFileHandler)
  // A whole file in one body, so a bigger limit than the default.
  app.put(
    "/:projectId/fs",
    { bodyLimit: FILE_WRITE_BODY_LIMIT_BYTES },
    writePodFileHandler,
  )
  // Agent tool endpoints (I7). The worker calls these through @forgeAI/orchestrator-client.
  app.post("/:projectId/exec", agentExecHandler)
  app.post(
    "/:projectId/fs/edit",
    { bodyLimit: FILE_WRITE_BODY_LIMIT_BYTES },
    agentEditFileHandler,
  )
  app.get("/:projectId/search", agentSearchHandler)
  app.post("/:projectId/checkpoint", agentCheckpointHandler)
  app.post("/:projectId/diff-checkpoint", agentCheckpointDiffHandler)
  app.post("/:projectId/restore-checkpoint", agentCheckpointRestoreHandler)
  app.post("/:projectId/dev/start", agentDevStartHandler)
  app.post("/:projectId/dev/stop", agentDevStopHandler)
  app.get("/:projectId/dev/logs", agentDevLogsHandler)
  // The project's secrets, for new terminals and the dev server (I1).
  app.put("/:projectId/secrets", setPodSecretsHandler)
  app.post("/:projectId/restore-commit", restoreCommitHandler)
  // A link to the saved source, for the knowledge graph (Q5).
  app.post("/:projectId/rag-source", ragSourceHandler)
  // Privileged Git runs in an orchestrator workspace; the sandbox receives token-free state.
  app.post("/:projectId/git/prepare", gitPrepareHandler)
  app.post("/:projectId/git/commit", gitCommitHandler)
  app.post("/:projectId/git/rollback", gitRollbackHandler)
  // Resolving commits pushed to GitHub outside ForgeAI.
  app.post("/:projectId/git/check", gitCheckHandler)
  app.post("/:projectId/git/resolve", gitResolveHandler)
  app.post("/:projectId/git/restore-file", gitRestoreFileHandler)
}
