# Web

Next.js and React frontend for ForgeAI. It provides authentication screens,
project/workspace management and a browser workspace with Monaco editing, a shared
terminal, preview, team chat, version history and agent activity.

## Local development

Complete the [repository setup](../../README.md). Copy [.env.example](.env.example)
to `.env` in this directory and configure:

| Setting                   | Local default           | Purpose                          |
| ------------------------- | ----------------------- | -------------------------------- |
| `NEXT_PUBLIC_AUTH_URL`    | `http://localhost:3002` | API and authentication origin    |
| `NEXT_PUBLIC_WS_URL`      | `ws://localhost:3003`   | Socket.IO endpoint               |
| `NEXT_PUBLIC_PREVIEW_URL` | API origin when omitted | Optional separate preview origin |

Public settings are included in the browser build. Keep server credentials in the
backend service environments. The API's `CLIENT_ORIGIN` must match the web origin.

From the repository root:

```powershell
bun run --cwd apps/web dev
```

Open `http://localhost:3000`. Project features need the API and WebSocket services;
editing, terminal and preview also need the orchestrator and a published sandbox
template. Agent runs additionally need the agent worker and its configured providers.

## Source map

| Path                                         | Responsibility                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| [app](app)                                   | App Router layouts and pages; auth, marketing, secure and project routes |
| [components/builder](components/builder)     | Editor, terminal, preview, history and agent panels                      |
| [components](components)                     | Product screens and shared page components                               |
| [hooks](hooks)                               | Project lifecycle, collaboration, sockets and live agent state           |
| [lib/api-client.ts](lib/api-client.ts)       | HTTP request handling                                                    |
| [lib/env.ts](lib/env.ts)                     | Public configuration                                                     |
| [lib/project-store.ts](lib/project-store.ts) | Workspace state                                                          |
| [next.config.ts](next.config.ts)             | Next.js configuration and response headers                               |

Shared UI primitives and styles live in [@forgeAI/ui](../../packages/ui/README.md).
Cross-service event and request contracts live in [@forgeAI/shared](../../packages/shared/README.md).
The API remains responsible for authorization; hiding a UI action is not an access check.

## Checks and build

```powershell
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun run --cwd apps/web build
bun run --cwd apps/web start
```

`start` serves the completed production build. Set public environment values before
building. Deployment/export screens and some planning screens contain demonstration
behavior, and the full GitHub import/runtime journey is still being completed.
