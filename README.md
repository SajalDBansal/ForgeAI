# ForgeAI

A browser development workspace with an editor, terminal, preview and AI agent.
Projects run in E2B sandboxes; ForgeAI's services manage files, saves, collaboration
and model-driven code changes.

The application is under active development. Starter-based projects and agent work
are the main workflows; the complete GitHub import/runtime journey is still being
finished. Deployment/export UI includes demonstration behavior, and application
deployment infrastructure is not yet included.

## Local setup

Use Bun 1.4.0 (the version pinned in [package.json](package.json)), Node.js 20 or
newer, Docker with Compose, and Python 3.11+ for the RAG service. Sandbox projects
also need configured E2B and R2 accounts; agent and retrieval features need model
provider credentials.

1. Install workspace dependencies from this directory:

   ```powershell
   bun install --frozen-lockfile
   ```

2. Copy each service's `.env.example` to `.env`, plus
   [packages/database/.env.example](packages/database/.env.example). Use the app
   guides below to configure provider credentials and service addresses. Match
   `DATABASE_URL` and `REDIS_URL` across consumers, `WS_TICKET_SECRET` between API
   and WebSocket services, `ORCHESTRATOR_TOKEN` across its callers, and
   `INTERNAL_API_TOKEN` between API and agent worker. Match the RAG URL and secret
   between the RAG service and its callers. Keep `.env` files local.

3. Start local data services and apply the committed database migrations:

   ```powershell
   docker compose -f infra/docker-compose.dev.yml up -d
   bun run db:generate
   bun run db:migrate:deploy
   ```

4. Publish the starters you need using the [template guide](packages/templates/README.md#syncing).
   Publication builds provider images, writes R2 objects and updates the database;
   run it explicitly after configuration. It is not part of routine startup.

5. Start the TypeScript services and background workers:

   ```powershell
   bun run dev
   ```

6. Start [Python RAG](apps/rag-service/README.md#setup) in a separate terminal, then
   open `http://localhost:3000`. Root `dev` does not start Python.

For focused work, run an individual app's `dev` script as described in its README.
The [infrastructure guide](infra/README.md) lists local database addresses and
Compose lifecycle commands.

## Applications

| App                                         | Responsibility                                              | Default port |
| ------------------------------------------- | ----------------------------------------------------------- | ------------ |
| [web](apps/web/README.md)                   | Browser UI and development workspace                        | 3000         |
| [api-server](apps/api-server/README.md)     | Authentication, projects, authorization and persistent data | 3002         |
| [ws-server](apps/ws-server/README.md)       | Browser realtime connections and Redis relay                | 3003         |
| [orchestrator](apps/orchestrator/README.md) | Sandbox files, terminals, previews, Git and snapshots       | 3004         |
| [rag-service](apps/rag-service/README.md)   | Python code indexing and retrieval with Neo4j               | 3005         |
| [agent-worker](apps/agent-worker/README.md) | Queued model and tool runs; port serves health checks       | 3006         |

The API also owns separate audit, cleanup, GitHub and notification worker processes
on health ports 3007–3010. Run one orchestrator and one RAG API process: their
project coordination currently includes process-local state.

## Packages

| Package                                                       | Responsibility                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| [agent](packages/agent/README.md)                             | Model configuration, agent loop, context and retrieval events |
| [database](packages/database/README.md)                       | Prisma schema, migrations, client and demo seed               |
| [eslint-config](packages/eslint-config/README.md)             | Shared lint configurations                                    |
| [jobs](packages/jobs/README.md)                               | Transactional background jobs and BullMQ delivery             |
| [orchestrator-client](packages/orchestrator-client/README.md) | Typed sandbox HTTP client                                     |
| [sandbox-provider](packages/sandbox-provider/README.md)       | Sandbox provider interface, E2B adapter and R2 client         |
| [shared](packages/shared/README.md)                           | Cross-service types, validation and utilities                 |
| [templates](packages/templates/README.md)                     | Starter projects, image contracts and publication             |
| [typescript-config](packages/typescript-config/README.md)     | Shared compiler presets                                       |
| [ui](packages/ui/README.md)                                   | React components and styles                                   |

## Validation

From the repository root, after dependency installation and client generation:

```powershell
bun run typecheck
bun run lint
bun run build
```

Python tests and retrieval evaluations are documented in the
[RAG README](apps/rag-service/README.md#checks). Model/provider smoke checks and
template publication contact external services; they are separate from the
workspace's static checks and builds.
