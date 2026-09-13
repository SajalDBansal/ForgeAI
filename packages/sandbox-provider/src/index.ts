import { createE2bProvider } from "./e2b/index.js"
import {
  SANDBOX_PROVIDERS,
  type SandboxProvider,
  type SandboxProviderConfig,
} from "./provider.js"

// The sandbox provider package. Callers create one provider and use only its methods; which
// vendor sits behind it is a setting (SANDBOX_PROVIDER). Today that's E2B (src/e2b/).

// Creates the configured provider. Throws on an unknown name, so a typo stops start-up.
export function createSandboxProvider(
  config: SandboxProviderConfig,
): SandboxProvider {
  switch (config.provider) {
    case "e2b":
      return createE2bProvider(config)
    default:
      throw new Error(
        `Unknown sandbox provider "${String(config.provider)}"; use one of: ${SANDBOX_PROVIDERS.join(", ")}`,
      )
  }
}

export { COMMAND_TIMED_OUT_EXIT_CODE, SANDBOX_PROVIDERS } from "./provider.js"
export type {
  BuildImageOpts,
  CreatePodTags,
  OpenPodTerminalOpts,
  PodFileChange,
  PodFileChangeType,
  PodFileEntry,
  PodHandle,
  PodProcess,
  PodRef,
  PodResources,
  PodTerminal,
  PodWatcher,
  ProjectPod,
  ReadFileFromPodOpts,
  RunPodCommandOpts,
  SandboxCapabilities,
  SandboxProvider,
  SandboxProviderConfig,
  SandboxProviderName,
  StartPodProcessOpts,
  WatchPodDirHandlers,
} from "./provider.js"

export {
  BinaryFileError,
  FileNotFoundError,
  FileTooLargeError,
  ProviderCapacityError,
} from "./errors.js"

export { createR2Client } from "./lib/r2.js"
export type { R2Client, R2Config } from "./lib/r2.js"
