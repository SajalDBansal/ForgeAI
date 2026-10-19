# @forgeAI/orchestrator-client

Typed HTTP client used by the agent worker to access the
[orchestrator](../../apps/orchestrator/README.md). It exposes file reads, command
execution, edits, search, checkpoints, retrieval source archives and dev-server controls.

## Usage

```ts
import { createOrchestratorClient } from "@forgeAI/orchestrator-client"

const client = createOrchestratorClient({
  baseUrl: orchestratorUrl,
  token: orchestratorToken,
  timeoutMs: 30_000,
})

const files = await client.listFiles(projectId)
const source = await client.readFile(projectId, "package.json")
```

The caller supplies configuration; this package does not load `.env` files.
`baseUrl` normally comes from `ORCHESTRATOR_URL`, and `token` must match the
orchestrator's `ORCHESTRATOR_TOKEN`. Keep this client in server-side code.

## Request behavior

- Calls use `/api/v1/sandbox/:projectId` and bearer authentication.
- `timeoutMs` defaults to 30 seconds per request.
- The optional `fence` callback supplies a project lease token and abort signal for
  calls made while a worker holds a project lease.
- Missing file/list responses can return `undefined`; other failures throw
  `OrchestratorError`. Status `0` indicates a transport failure.

There is no automatic mutation retry. Callers must decide whether repeating an
operation is safe after a timeout or lost response.

The interfaces and implementation are in [src/index.ts](src/index.ts); shared request
and result types come from [@forgeAI/shared](../shared/README.md).

## Checks

From the repository root:

```powershell
bun run --cwd packages/orchestrator-client typecheck
bun run --cwd packages/orchestrator-client lint
```
