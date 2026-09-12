import type { SandboxProvider, SandboxProviderConfig } from "../provider.js"
import { forgetPodConnection } from "./connection.js"
import { startPodProcess } from "./process.js"
import {
  createPod,
  findPodByProject,
  isPodAlive,
  keepPodAlive,
  killPod,
  listPodFiles,
  listProjectPods,
  podPreviewUrl,
  readFileFromPod,
  resumePod,
  runPodCommand,
  watchPodDir,
  writeFileToPod,
} from "./sandbox.js"
import { buildImage, imageExists, listImageTags } from "./template.js"
import { openPodTerminal } from "./terminal.js"

// The E2B provider: binds the API key and environment to E2B's functions, so callers only pass
// sandbox ids. Everything E2B-specific (its timers, the detached dev server, metadata searches,
// the connection cache) stays inside src/e2b/.
export function createE2bProvider({
  apiKey,
  environment,
  maxLifetimeMinutes,
}: SandboxProviderConfig): SandboxProvider {
  return {
    name: "e2b",
    capabilities: {
      // E2B ends every sandbox this long after it was created: 1 h on Hobby, 24 h on Pro (E2).
      maxLifetimeMs:
        maxLifetimeMinutes === null ? null : maxLifetimeMinutes * 60_000,
    },

    createPod: (projectId, image, timeoutMs, tags) =>
      createPod(apiKey, environment, projectId, image, timeoutMs, tags),
    findPodByProject: (projectId) =>
      findPodByProject(apiKey, environment, projectId),
    listProjectPods: () => listProjectPods(apiKey, environment),
    resumePod: (sandboxId) => resumePod(apiKey, sandboxId),
    isPodAlive: (sandboxId) => isPodAlive(apiKey, sandboxId),
    keepPodAlive: (sandboxId, timeoutMs) =>
      keepPodAlive(apiKey, sandboxId, timeoutMs),
    killPod: (sandboxId) => killPod(apiKey, sandboxId),
    forgetPodConnection,
    podPreviewUrl: (sandboxId, port) => podPreviewUrl(apiKey, sandboxId, port),

    runPodCommand: (sandboxId, command, opts) =>
      runPodCommand(apiKey, sandboxId, command, opts),
    startPodProcess: (sandboxId, opts) =>
      startPodProcess(apiKey, sandboxId, opts),
    openPodTerminal: (sandboxId, opts) =>
      openPodTerminal(apiKey, sandboxId, opts),
    readFileFromPod: (sandboxId, path, opts) =>
      readFileFromPod(apiKey, sandboxId, path, opts),
    writeFileToPod: (sandboxId, path, content) =>
      writeFileToPod(apiKey, sandboxId, path, content),
    listPodFiles: (sandboxId, path, depth) =>
      listPodFiles(apiKey, sandboxId, path, depth),
    watchPodDir: (sandboxId, path, handlers) =>
      watchPodDir(apiKey, sandboxId, path, handlers),

    imageExists: (name) => imageExists(apiKey, name),
    listImageTags: (name) => listImageTags(apiKey, name),
    buildImage: (name, opts) => buildImage(apiKey, name, opts),
  }
}
