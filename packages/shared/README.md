# @forgeAI/shared

Cross-service TypeScript types, Zod schemas and common utilities. HTTP payloads,
Redis messages and WebSocket events use these contracts so producers and consumers
agree on their shape. The package's only external runtime dependency is Zod.

## Contents

| Path                                                                                                | Responsibility                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [src/types](src/types)                                                                              | Product entities; project, sandbox, terminal, presence and agent events |
| [src/validations](src/validations)                                                                  | Request and message schemas                                             |
| [src/lib/ticket.ts](src/lib/ticket.ts)                                                              | Signed scoped tickets and verification                                  |
| [src/lib/access-version.ts](src/lib/access-version.ts)                                              | Project access-version contracts                                        |
| [src/lib/agent-live.ts](src/lib/agent-live.ts) and [agent-run-state.ts](src/lib/agent-run-state.ts) | Agent state and live revision handling                                  |
| [src/lib/secret-redaction.ts](src/lib/secret-redaction.ts) and [logging.ts](src/lib/logging.ts)     | Redaction and structured logging helpers                                |
| [src/lib/http-security.ts](src/lib/http-security.ts)                                                | Shared HTTP security helpers                                            |
| [src/lib/health.ts](src/lib/health.ts)                                                              | Readiness probes and response helpers                                   |
| [src/lib/sandbox-plan.ts](src/lib/sandbox-plan.ts)                                                  | Sandbox plan limits and validation                                      |
| [src/index.ts](src/index.ts)                                                                        | Public exports                                                          |

The filesystem contracts include `PROJECT_ROOT` (`/home/user/app`), path limits and
excluded folders. Template and snapshot contracts keep image names and storage
keys consistent across services.

## Usage

```ts
import {
  PROJECT_ROOT,
  sandboxEventsChannel,
  type TerminalCommand,
} from "@forgeAI/shared"
```

The package also exports `types/*`, `validations/*` and `lib/*` subpaths. Use
browser-compatible entries in frontend code; helpers that use Node facilities,
such as ticket signing, belong on the server. Callers supply any service clients
needed by utilities such as readiness checks.

Validate untrusted boundary inputs with the matching schemas. TypeScript types
alone do not validate a received request or Redis message.

## Checks

Install dependencies from the [repository root](../../README.md), then run:

```powershell
bun run --cwd packages/shared typecheck
bun run --cwd packages/shared lint
```

This is a source package with no standalone server or build output.
