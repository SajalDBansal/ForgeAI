# Starter Web

React and Vite app on port 3000. [src/main.tsx](src/main.tsx) mounts the page and
imports the product name from `@forgeai-template/shared`; styling is in
[src/styles.css](src/styles.css).

Install dependencies with `npm ci` from the [starter root](../../README.md), then
run from that same root:

```bash
npm run dev --workspace @forgeai-template/web
npm run typecheck --workspace @forgeai-template/web
npm run build --workspace @forgeai-template/web
```

Open `http://localhost:3000`. The build command checks TypeScript and creates the
Vite production bundle in this app's `dist/` directory. The initial page does not
call the sibling API; add request handling when building product features.
