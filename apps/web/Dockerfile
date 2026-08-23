# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4.0
ARG NODE_VERSION=24-alpine

FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app

# --- Prune the workspace down to what `web` actually needs ---
FROM base AS prepare
RUN bun add -g turbo
COPY . .
RUN turbo prune web --docker

# --- Install deps and build ---
FROM base AS builder
WORKDIR /app
COPY --from=prepare /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=prepare /app/out/full/ .

# `prisma generate` (run as part of `build`) needs DATABASE_URL to resolve
# prisma.config.ts, even though it never connects to a database.
ARG DATABASE_URL="postgresql://user:password@localhost:5432/db"
ARG NEXT_PUBLIC_API_HOST="http://localhost:3001"
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_PUBLIC_API_HOST=${NEXT_PUBLIC_API_HOST}

RUN bunx turbo run build --filter=web...

# --- Runtime image ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
USER nextjs

# Next.js standalone output traces only what's needed to run the server.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
