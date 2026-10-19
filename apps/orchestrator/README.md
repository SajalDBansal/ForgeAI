# orchestrator

The only service that talks to sandboxes. It opens, adopts, watches, saves and shuts down
each project's E2B sandbox. It also holds the state several people share live: the
terminal, the open files (Yjs documents), presence and the dev server.

- **Internal only:** it listens on port 3004. Sandbox routes require
  `Authorization: Bearer $ORCHESTRATOR_TOKEN`; health endpoints are exempt.
- **HTTP callers:** the API authorizes user operations, and the agent worker uses
  the typed client for admitted agent runs.
- **Browser commands** (keystrokes, edits, presence pings) arrive over Redis, and **events**
  go back out over Redis to `apps/ws-server`.

The [sandbox-provider package](../../packages/sandbox-provider/README.md) owns provider
integration. The [orchestrator client](../../packages/orchestrator-client/README.md)
exposes typed agent tool calls.

## One copy only, for now

Its state lives in memory, so **run exactly one copy.** A second copy would run every
keystroke twice. After a restart it adopts the sandboxes that are still running (from their
E2B metadata), and on SIGTERM it saves open work before exiting. Multiple replicas
would require project ownership and command routing beyond the current process-local state.

## HTTP routes

`GET /healthz` (alive) and `GET /readyz` (Redis answers and the command subscription
is acknowledged; 503 otherwise, or while shutting down) are at the root, and are the
only paths that don't need the token. Subscriptions are established after the Redis
handshake and restored on reconnect before readiness returns.

Everything else is under `/api/v1/sandbox`:

| Route                                                                                                        | Does                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /:projectId/ensure`                                                                                    | Returns the project's sandbox. Reuses, joins an opening in progress, resumes, or creates and restores the last autosave |
| `GET /:projectId`                                                                                            | The sandbox record, if any                                                                                              |
| `DELETE /:projectId[?save=true]`                                                                             | Shut down (archive saves first; delete doesn't)                                                                         |
| `POST /:projectId/restart`                                                                                   | Save, replace the sandbox, restore                                                                                      |
| `GET /:projectId/fs/list`, `GET /:projectId/fs`, `PUT /:projectId/fs`                                        | List, read and write files                                                                                              |
| `POST /:projectId/exec`, `POST /:projectId/fs/edit`, `GET /:projectId/search`, `POST /:projectId/checkpoint` | Agent tool endpoints: command runs, document-safe edits, ripgrep search and checkpoints with durable bundle artifacts   |
| `GET /:projectId/dev`, `POST /:projectId/dev/start`, `POST /:projectId/dev/stop`, `GET /:projectId/dev/logs` | Dev-server status for the API preview proxy, plus agent access to start/stop/read logs                                  |
| `POST /:projectId/git/{prepare,commit,rollback,check,resolve,restore-file}`                                  | Git version control, run inside the sandbox                                                                             |
| `POST /:projectId/restore-commit`                                                                            | Roll back to an old tar-era ("LEGACY") commit                                                                           |

## Redis

| Channel                        | Direction | Carries                                                                                                         |
| ------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| `sandbox-commands:<projectId>` | in        | terminal input and resize, `doc.*` editor updates, `dev.start` and `dev.stop`, presence pings, snapshot answers |
| `sandbox-events:<projectId>`   | out       | terminal output, file changes, document updates, presence, dev-server status, `sandbox.reset`                   |
| `agent-events:<projectId>`     | out       | agent tool output from orchestrator-owned work                                                                  |

## Code map

| File                                                    | Job                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/index.ts`                                          | Start-up (adopt, subscribe, reaper) and shutdown (save, then exit)                  |
| `src/state.ts`                                          | In-memory records: pods, openings, unsaved-changes flags                            |
| `src/service/sandbox.service.ts`                        | Ensure, restart and destroy                                                         |
| `src/service/file.service.ts`                           | List, read and write files (capped reads, hidden folders, the 100-per-folder limit) |
| `src/service/lifecycle.service.ts`                      | Adopt after restart; save on shutdown                                               |
| `src/service/document.service.ts`                       | Shared Yjs documents, saving, conflicts with changes on disk                        |
| `src/service/terminal.service.ts`                       | The shared terminal: opening, input, who holds the keyboard                         |
| `src/service/terminal-output.service.ts`                | Terminal output batching, and the recent history for late joiners                   |
| `src/service/watcher.service.ts`                        | File watching                                                                       |
| `src/service/presence.service.ts`                       | Who has which file open, and what they're doing                                     |
| `src/service/dev.service.ts`                            | Dev server start, stop and status; preview URL; agent dev-server wrappers           |
| `src/service/snapshot.service.ts`, `restore.service.ts` | Autosave to R2 and restore                                                          |
| `src/service/reaper.service.ts`, `activity.service.ts`  | Idle shutdown, recycling before E2B's lifetime limit, keep-alive                    |
| `src/service/git.service.ts`, `src/lib/git-scripts.ts`  | Git version control                                                                 |
| `src/service/agent.service.ts`                          | Agent tool endpoints: exec, edit, search and checkpoint                             |
| `src/lib/auth.ts`                                       | The `ORCHESTRATOR_TOKEN` check (`/healthz` and `/readyz` are exempt)                |
| `src/controller/health.controller.ts`                   | `/healthz` and `/readyz`                                                            |

## Settings

See [.env.example](.env.example):

- `PORT`, `ORCHESTRATOR_TOKEN`, `REDIS_URL`, `E2B_API_KEY`;
- the sandbox timings (`SANDBOX_*`, `DEV_SERVER_UNWATCHED_GRACE_SECONDS`,
  `SHUTDOWN_SAVE_SECONDS`);
- R2 (`R2_*`).

Keep `ORCHESTRATOR_TOKEN` aligned with the API and worker, R2 settings aligned with
storage consumers, and sandbox plan limits aligned with the API. Timeout defaults
and validation live in [src/envConfig.ts](src/envConfig.ts).

## Local development and checks

Complete the [repository setup](../../README.md), copy `.env.example` to `.env` here,
and configure Redis, E2B and R2. Project creation needs a published
[template](../../packages/templates/README.md).

From the repository root:

```powershell
bun run --cwd apps/orchestrator dev
bun run --cwd apps/orchestrator typecheck
bun run --cwd apps/orchestrator lint
bun run --cwd apps/orchestrator build
```

Opening a project can create a billable provider sandbox. Static typechecking, linting
and compilation do not open sandboxes.
