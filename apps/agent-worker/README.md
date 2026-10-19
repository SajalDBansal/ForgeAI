# Agent Worker

Consumes the Redis/BullMQ `agent-runs` queue and carries out model work for a project.
Uses [@forgeAI/agent](../../packages/agent/README.md) for model orchestration and the
[typed orchestrator client](../../packages/orchestrator-client/README.md) for sandbox tools.

## Flow

1. Acquire the project's turn with a unique worker-attempt lease token.
2. Open the authorized sandbox through the internal API, prepare bounded context and retrieve code evidence.
3. Classify the request, answer or plan, then run permitted model/tool turns.
4. Stream redacted revisioned updates and persist messages, tool steps, transcript and usage.
5. Pause for questions/permissions or save a final success/failure state.

Sandbox operations go through the orchestrator, not directly through a provider SDK.
The worker does write run/chat/usage records to PostgreSQL.

Mid-run messages join the active run and are consumed at a step boundary.
Paused replies enqueue a message-specific continuation. Late tabs synchronize from Redis live state;
durable final history comes from PostgreSQL.

Busy provider requests retry only while replay is safe: no emitted response and no already-executed
tool results. Optional model fallback does not justify repeating mutations.
Partial failed answers are retained with a readable failure.

## Source Map

| File                                 | Responsibility                                      |
| ------------------------------------ | --------------------------------------------------- |
| [index.ts](src/index.ts)             | Worker process, health and shutdown                 |
| [runs.ts](src/runs.ts)               | Run delivery, ordering, ownership and completion    |
| [prepare.ts](src/prepare.ts)         | Sandbox/context/retrieval preparation               |
| [answer.ts](src/answer.ts)           | Model flow, live output and saved results           |
| [tools.ts](src/tools.ts)             | Model tool definitions and orchestrator calls       |
| [guardrails.ts](src/guardrails.ts)   | Context/output redaction and command-consent checks |
| [permissions.ts](src/permissions.ts) | Once-only approval consumption                      |
| [redis.ts](src/redis.ts)             | Redis coordination and publication                  |
| [envConfig.ts](src/envConfig.ts)     | Worker configuration                                |

Model credentials/settings are validated at startup through the shared agent package.
Secret-redaction lookup failure is not silently ignored. RAG/tree/notes failures have their own
degraded handling; do not describe every preparation failure as harmless.

## Ownership and recovery

Lease loss aborts the active run, and orchestrator calls carry a project lease fence.
The orchestrator tracks active work when deciding whether to retire a sandbox.
Before/after checkpoints can store Git bundles in R2 for recovery after replacement.

Database run state and agent-queue delivery are still separate operations. A forced
shutdown can need recovery, and run budgets are not strict end-to-end spending ceilings.
Command-consent checks do not isolate the runtime from hostile scripts.

## Run And Check

Complete the [repository setup](../../README.md) and copy [.env.example](.env.example)
to `.env` here. Configure PostgreSQL, Redis and the `AGENT_*` provider settings.
Match `ORCHESTRATOR_TOKEN`, `INTERNAL_API_TOKEN` and `RAG_SERVICE_SECRET` with their
respective services, and set the corresponding URLs. The API, orchestrator and RAG
service supply sandbox admission, tools and retrieval.

From the repository root:

```powershell
bun run --cwd apps/agent-worker dev
bun run --cwd apps/agent-worker typecheck
bun run --cwd apps/agent-worker lint
bun run --cwd apps/agent-worker build
```

Default health endpoints: `http://localhost:3006/healthz` and `/readyz`.
Readiness checks Redis/PostgreSQL. Shutdown stops accepting work and waits up to the configured
grace period; forced termination can still leave work needing conservative recovery.

The static checks above do not execute model runs. Running a real agent request can
use model tokens, sandbox runtime and retrieval-provider resources.
