# turborepo-starter

A compact Turborepo with:

- [apps/web](apps/web/README.md): React + Vite on port 3000
- [apps/api](apps/api/README.md): Fastify on port 3001
- [packages/shared](packages/shared/README.md): shared TypeScript exports

Run from this starter's root in the Linux sandbox, WSL or a Unix shell. The API's
development script uses POSIX environment-variable syntax.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` for the web app and `http://localhost:3001/healthz`
for the API health check. The starter web page does not call the API yet.

`npm run typecheck` checks all workspaces. `npm run build` builds the web app and
checks the API; shared source is consumed directly by the apps.
