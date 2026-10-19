# WebSocket Server

Socket.IO gateway between browser project sessions and Redis. It delivers project
changes, shared-document updates, terminal output, presence, dev-server state and
agent events. Browser sandbox commands travel back through Redis to the orchestrator.

## Local development

Complete the [repository setup](../../README.md), then copy [.env.example](.env.example)
to `.env` here. Set `REDIS_URL`, `CLIENT_ORIGIN` and `WS_TICKET_SECRET`; the origin
and ticket secret must match the API configuration.

From the repository root:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d redis
bun run --cwd apps/ws-server dev
```

The default port is 3003. `GET /healthz` checks liveness; `GET /readyz` checks the
Redis connections. API access is needed to obtain a browser connection ticket.

## Connection and event flow

1. An authenticated browser requests `POST /api/v1/project/:id/ws-ticket` from
   [api-server](../api-server/README.md), which checks project access.
2. The browser sends the short-lived ticket and project ID in Socket.IO's `auth`
   payload. The gateway checks signature, expiry, project scope and the current
   access version in Redis before accepting it.
3. Accepted sockets join a project room. Redis subscriptions relay project,
   sandbox and agent events to the sockets connected to that instance.
4. Browser commands are validated and checked against write permissions and
   message budgets before publication to `sandbox-commands:<projectId>`.

Access revocation disconnects affected sessions. Connections are periodically
renewed with fresh tickets using `WS_MAX_CONNECTION_MINUTES`. Multiple gateway
instances independently subscribe for their local project rooms; this service does
not use `@socket.io/redis-adapter`.

## Source map

| File                                           | Responsibility                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [src/index.ts](src/index.ts)                   | Startup and shutdown                                               |
| [src/server.ts](src/server.ts)                 | HTTP health endpoints, Socket.IO authentication and event handlers |
| [src/redis.ts](src/redis.ts)                   | Redis subscription and command publication                         |
| [src/access-policy.ts](src/access-policy.ts)   | Ticket claims, access versions and revocation                      |
| [src/message-budget.ts](src/message-budget.ts) | Incoming message budgets                                           |
| [src/presence.ts](src/presence.ts)             | Connection and presence lifecycle                                  |
| [src/envConfig.ts](src/envConfig.ts)           | Validated configuration                                            |

Event types and validation live in [@forgeAI/shared](../../packages/shared/README.md).
The [orchestrator](../orchestrator/README.md) owns sandbox state and executes commands.

## Checks

```powershell
bun run --cwd apps/ws-server typecheck
bun run --cwd apps/ws-server lint
bun run --cwd apps/ws-server build
```

Run these commands from the repository root. Root `bun run dev` starts this service
alongside the other TypeScript apps.
