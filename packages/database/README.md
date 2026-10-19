# @forgeAI/database

PostgreSQL schema, Prisma migrations and the shared database client. Backend services
import `prisma`, generated model types and `lockProjectRow` from this package.

## Setup

Install workspace dependencies from the [repository root](../../README.md). Copy
[.env.example](.env.example) to `.env` here and set `DATABASE_URL` to your development
database. Service processes also supply their own `DATABASE_URL`.

From the repository root:

```powershell
bun run --cwd packages/database db:generate
bun run --cwd packages/database db:migrate:deploy
```

`db:generate` creates the ignored Prisma client in `generated/client`. Run it after
installing dependencies or changing the schema. `db:migrate:deploy` applies the
committed migrations to the configured database.

## Commands

| Command from this directory                 | Purpose                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `bun run db:migrate:dev --name change_name` | Create a migration while developing a schema change                     |
| `bun run db:migrate:deploy`                 | Apply existing migrations                                               |
| `bun run db:seed`                           | Recreate demo users and their data under the `@forge.test` email domain |
| `bun run studio`                            | Open Prisma Studio for the configured database                          |
| `bun run typecheck`                         | Check the client and database utilities                                 |
| `bun run lint`                              | Lint package source                                                     |

Use migration creation and demo seeding on a development database. The seed script
deletes existing demo-domain users and their dependent data before recreating them;
it does not publish templates. Template publication belongs to
[@forgeAI/templates](../templates/README.md).

## Usage and source

```ts
import { prisma, type Project } from "@forgeAI/database"

const project: Project | null = await prisma.project.findUnique({
  where: { id: projectId },
})
```

| Path                                         | Responsibility                                                  |
| -------------------------------------------- | --------------------------------------------------------------- |
| [prisma/schema.prisma](prisma/schema.prisma) | Auth, product, template, agent, usage and background-job models |
| [prisma/migrations](prisma/migrations)       | Versioned schema changes                                        |
| [prisma.config.ts](prisma.config.ts)         | CLI datasource, schema and seed configuration                   |
| [src/client.ts](src/client.ts)               | PostgreSQL adapter and shared Prisma client                     |
| [src/project-lock.ts](src/project-lock.ts)   | Transactional project-row locking                               |
| [src/seed.ts](src/seed.ts)                   | Demo dataset                                                    |

Keep database imports in server code. Reuse the shared client rather than creating
a new connection pool for each request.
