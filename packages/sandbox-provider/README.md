# @forgeAI/sandbox-provider

Everything ForgeAI does with sandboxes, behind one interface, plus the Cloudflare R2 client.
The orchestrator uses it at runtime, and `packages/templates` uses it to build images.

Callers create **one provider** and use only its methods. Which vendor sits behind it is a
setting (`SANDBOX_PROVIDER`), and only `e2b` exists today. Nothing outside `src/e2b/`
imports the `e2b` SDK.

```ts
import { createSandboxProvider } from "@forgeAI/sandbox-provider"

const provider = createSandboxProvider({
  provider: "e2b",
  apiKey,
  environment,
  maxLifetimeMinutes: 60,
})
const pod = await provider.createPod(projectId, imageRef, timeoutMs)
await provider.runPodCommand(pod.sandboxId, "git --version", {
  timeoutMs: 15_000,
})
```

## What's in it

| File              | What                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/provider.ts` | **The contract.** `SandboxProvider` (every method ForgeAI uses), its types, `SandboxCapabilities`, and `SandboxProviderConfig`                                     |
| `src/index.ts`    | `createSandboxProvider(config)`, the types, the errors, and `createR2Client`                                                                                       |
| `src/errors.ts`   | Provider-neutral errors: `FileNotFoundError`, `FileTooLargeError`, `BinaryFileError`, `ProviderCapacityError` (the provider is full)                               |
| `src/e2b/`        | **The E2B adapter.** `index.ts` binds the API key and environment; `sandbox.ts`, `process.ts`, `terminal.ts`, `template.ts` and `connection.ts` hold the E2B calls |
| `src/lib/r2.ts`   | `createR2Client`: uploads, presigned URLs, head and copy                                                                                                           |

## The interface in short

- **Sandboxes:** `createPod`, `findPodByProject`, `listProjectPods`, `resumePod`, `isPodAlive`,
  `keepPodAlive`, `killPod`, `forgetPodConnection`, `podPreviewUrl`.
- **Inside a sandbox:** `runPodCommand`, `startPodProcess` (detached, e.g. the dev server),
  `openPodTerminal`, `readFileFromPod`, `writeFileToPod`, `listPodFiles`, `watchPodDir`.
- **Images:** `imageExists`, `listImageTags`, `buildImage` (from a **Dockerfile**).
- **Capabilities:** `maxLifetimeMs`, how long a sandbox may live (null = no limit). The
  reaper recycles sandboxes only when there is a limit.

The factory receives credentials once; runtime methods use sandbox IDs. The provider
tags every sandbox with its `environment`, and only finds or lists sandboxes with
the same tag.

## Adding a provider

1. Add its name to `SANDBOX_PROVIDERS` in `src/provider.ts`.
2. Implement `SandboxProvider` in `src/<name>/`, turning its own errors into the ones in
   `src/errors.ts`.
3. Add a case to `createSandboxProvider` in `src/index.ts`.
4. Make sure its images meet the [template image contract](../templates/src/image-contract.ts);
   `templates:sync` checks each new image before publishing it.

## Configuration and checks

The caller constructs `SandboxProviderConfig`; there is no standalone server or
package-local environment loader. The [orchestrator](../../apps/orchestrator/README.md)
owns runtime settings, and [templates](../templates/README.md) configures image builds.

From the repository root:

```powershell
bun run --cwd packages/sandbox-provider typecheck
bun run --cwd packages/sandbox-provider lint
```

Detached process behavior is implemented in [src/e2b/process.ts](src/e2b/process.ts).
Template Dockerfiles install system packages before switching to the project user;
the image contract verifies the runtime that ForgeAI's sandbox scripts require.
