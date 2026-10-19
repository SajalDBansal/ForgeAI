# Starter Shared

TypeScript source shared by the starter web and API apps. It currently exports
`productName` from [src/index.ts](src/index.ts).

```ts
import { productName } from "@forgeai-template/shared"
```

Install dependencies at the [starter root](../../README.md), then run from that
same root:

```bash
npm run typecheck --workspace @forgeai-template/shared
```

This package has no server or build output. Keep browser-compatible constants and
contracts here; service credentials and database clients belong in the API app.
