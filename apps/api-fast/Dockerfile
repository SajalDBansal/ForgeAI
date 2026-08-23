# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4.0
ARG NODE_VERSION=24-alpine

FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app

# --- Prune the workspace down to what `api-fast` actually needs ---
FROM base AS prepare
RUN bun add -g turbo
COPY . .
RUN turbo prune api-fast --docker

# --- Install deps and build ---
FROM base AS builder
WORKDIR /app
COPY --from=prepare /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=prepare /app/out/full/ .

# `prisma generate` (run as part of `build`) needs DATABASE_URL to resolve
# prisma.config.ts, even though it never connects to a database.
ARG DATABASE_URL="postgresql://user:password@localhost:5432/db"
ENV DATABASE_URL=${DATABASE_URL}

RUN bunx turbo run build --filter=api-fast...

# --- Runtime image ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN addgroup -S fastify && adduser -S fastify -G fastify
USER fastify

COPY --from=builder --chown=fastify:fastify /app .

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "apps/api-fast/dist/index.js"]
