# @forgeAI/jobs

Durable background-task records and BullMQ delivery for audit, cleanup, GitHub and
notification work. PostgreSQL stores task state; Redis carries job IDs to workers.

## How delivery works

1. Call `enqueueTask(tx, task)` inside the same Prisma transaction as the business change.
2. A role's worker polls eligible `BackgroundJob` rows and delivers their IDs to BullMQ.
3. The worker validates the stored payload, invokes its handler and records completion
   or a delayed retry. Permanent failures and exhausted attempts become `FAILED`.

Handlers must tolerate retries: an external operation may succeed before its database
completion update is saved. `recordAudit(tx, event)` writes audit history directly
inside a transaction. `retryFailedJob(id)` makes a failed task eligible for delivery again.

AI runs use the separate `agent-runs` queue in [agent-worker](../../apps/agent-worker/README.md),
not this background-job outbox.

## Entry points

| Import or file                       | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `@forgeAI/jobs`                      | Task contracts, `enqueueTask`, `recordAudit`, `retryFailedJob` |
| `@forgeAI/jobs/worker`               | `createBackgroundWorker` and `processBackgroundJob`            |
| [src/contracts.ts](src/contracts.ts) | Payload schemas, queue names, roles and retry policy           |
| [src/index.ts](src/index.ts)         | Transactional writes and retry requests                        |
| [src/worker.ts](src/worker.ts)       | Outbox polling, BullMQ delivery, processing and shutdown       |

## Running and checking

This package has no standalone server. Configure PostgreSQL and Redis through the
consumer, then start the [API worker roles](../../apps/api-server/README.md#background-processes).
`createBackgroundWorker` accepts the role, Redis URL, concurrency and task handler;
the caller owns readiness and shutdown.

From the repository root:

```powershell
bun run --cwd packages/jobs typecheck
bun run --cwd packages/jobs lint
```

Generate the [database client](../database/README.md) before typechecking a fresh checkout.
