# Starter API

Fastify service on port 3001. [src/index.ts](src/index.ts) defines `GET /` and
`GET /healthz`, and imports the product name from `@forgeai-template/shared`.

Install dependencies with `npm ci` from the [starter root](../../README.md), then
run from that same root in the Linux sandbox, WSL or a Unix shell:

```bash
npm run dev --workspace @forgeai-template/api
npm run typecheck --workspace @forgeai-template/api
```

The development script sets `PORT=3001` and watches source with `tsx`. Both
`build` and `typecheck` run TypeScript without emitting output. Add routes here
and put contracts shared with the web app in the shared package.
