# node-api-starter

A small Fastify API with TypeScript.

```bash
npm ci
npm run dev
```

Run from this project's root. The server listens on port 3000 by default; set
`PORT` in your shell to override it. Add routes in [src/index.ts](src/index.ts).

Routes:

- `GET /`
- `GET /healthz`

`npm run build` typechecks without emitting JavaScript. `npm run start` runs the
server with `tsx` without the development watcher.
