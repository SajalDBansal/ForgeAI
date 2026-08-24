# @workspace/shared

The single source of truth for cross-service contracts. Every TypeScript type and every runtime
`zod` validation schema that more than one service needs lives here — `core-backend`,
`core-trading-engine`, `database-engine`, `ws-server` and `ws-index-poller` all depend on this
package instead of redefining these shapes locally.

## What's in here

**Types** (`src/types/`):

| File | Covers |
|---|---|
| `engine.ts` | `EVENT_SUBJECT` enum, `EVENT_REJECT_CODES` |
| `engine-payload.ts` / `engine-response.ts` | Per-event request payload / response shapes for every `EVENT_SUBJECT` the trading engine handles |
| `market.ts` / `order.ts` / `position.ts` / `balance.ts` | Core trading domain types |
| `depth.ts` | Order-book depth delta shapes |
| `snapshot.ts` | `EngineSnapshot` shape used for R2 crash-recovery snapshots |
| `redis.ts` | `REDIS_STREAMS` / `CONSUMER_GROUPS` name constants |
| `idempotency.ts` | Idempotency-key request/response types |
| `ws-poller.ts` | Health-state shape used by `ws-index-poller` |
| `backend-payload.ts` / `backend-request.ts` | `core-backend` <-> engine request/response contracts |
| `database-engine.ts` | Types specific to persisting the engine's update bundle |

**Validations** (`src/validations/`): `zod` schemas — `asset.ts`, `auth.ts`, `market.ts`,
`order.ts` — used by `core-backend` to validate REST input before it's turned into an engine
request.

## Usage

```ts
import { EVENT_SUBJECT, type CreateOrderRequestPayload } from "@workspace/shared";
import { createOrderSchema } from "@workspace/shared";
```

Everything is re-exported from `src/index.ts`, so a single `@workspace/shared` import covers
types and validations alike.

## Notes

- This package has no runtime dependency beyond `zod` — it's pure types + schemas, no I/O.
- If you're adding a new event subject, payload or response shape, it belongs here first; the
  engine, backend and any consumer should import it rather than declaring their own copy.
