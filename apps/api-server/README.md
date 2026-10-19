# API Server

Fastify API for authentication, workspaces, projects, membership, integrations and
persisted project activity. It authorizes browser requests, admits agent runs and
delegates sandbox operations to the [orchestrator](../orchestrator/README.md).

## Local development

Complete the [repository setup](../../README.md), then copy [.env.example](.env.example)
to `.env` in this directory. PostgreSQL and Redis must be running and database
migrations must be applied.

Configure `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and
`CLIENT_ORIGIN`. The example also documents integration credentials and separate
encryption keys for connections, team chat and project secrets.

These settings must agree across services:

| Setting                                  | Shared with                   |
| ---------------------------------------- | ----------------------------- |
| `ORCHESTRATOR_URL`, `ORCHESTRATOR_TOKEN` | Orchestrator and agent worker |
| `WS_TICKET_SECRET`                       | WebSocket server              |
| `INTERNAL_API_TOKEN`                     | Agent worker                  |
| `RAG_SERVICE_URL`, `RAG_SERVICE_SECRET`  | RAG service and agent worker  |
| `R2_*` storage settings                  | Orchestrator                  |
| `SANDBOX_PLAN` and capacity overrides    | Orchestrator                  |

From the repository root:

```powershell
bun run --cwd apps/api-server dev
```

The default address is `http://localhost:3002`. `GET /healthz` checks liveness;
`GET /readyz` checks PostgreSQL and Redis. Sandbox availability is handled by
individual sandbox routes rather than the API readiness probe.

## Routes and source

Browser routes are registered under `/api/v1` in [router/index.ts](src/router/index.ts).
The `/api/v1/internal` group requires `INTERNAL_API_TOKEN` and is used by service callers.

| Path                                                          | Responsibility                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| [src/server.ts](src/server.ts)                                | Fastify setup and route registration                       |
| [src/router](src/router) and [src/controller](src/controller) | Route definitions and HTTP handling                        |
| [src/service](src/service)                                    | Product operations, access rules and persistence           |
| [src/plugins](src/plugins)                                    | Request context, origin checks and orchestrator connection |
| [src/lib/auth.ts](src/lib/auth.ts)                            | Better Auth configuration                                  |
| [src/lib/envConfig.ts](src/lib/envConfig.ts)                  | Validated settings and defaults                            |
| [src/workers](src/workers)                                    | Background task handlers                                   |

## Background processes

Run each required role in its own terminal, or use root `bun run dev` to start all roles:

```powershell
bun run --cwd apps/api-server worker:audit
bun run --cwd apps/api-server worker:cleanup
bun run --cwd apps/api-server worker:github
bun run --cwd apps/api-server worker:notification
```

These roles use the [jobs package](../../packages/jobs/README.md) and default health
ports 3007–3010 respectively. New audit records are written within business
transactions; the audit role also handles legacy queued audit work. AI runs use
the separate [agent worker](../agent-worker/README.md).

## Checks

```powershell
bun run --cwd apps/api-server typecheck
bun run --cwd apps/api-server lint
bun run --cwd apps/api-server build
```

After building, `bun run --cwd apps/api-server start` starts the compiled server.
Administrative scripts for job retries and encryption-key rotation
are listed in [package.json](package.json); inspect their arguments before running them.
