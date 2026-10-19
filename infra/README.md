# Local Infrastructure

[docker-compose.dev.yml](docker-compose.dev.yml) runs the local data services.
Application processes run through Bun and the Python environment described in the
[root setup guide](../README.md#local-setup).

## Services

| Service           | Local endpoint                                         | Default development credentials                |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------- |
| PostgreSQL (`db`) | `localhost:5432`, database `turbo_starter`             | User/password `starter` / `starter`            |
| Redis (`redis`)   | `redis://localhost:6379`                               | No password in this development configuration  |
| Neo4j (`neo4j`)   | Bolt `localhost:7687`; browser `http://localhost:7474` | User/password `neo4j` / `forgeai-dev-password` |

PostgreSQL settings can be overridden with `POSTGRES_USER`, `POSTGRES_PASSWORD`
and `POSTGRES_DB`; Neo4j accepts `NEO4J_PASSWORD`. Keep the application `.env` values
aligned with any overrides. These are local development defaults, not a deployment
configuration.

## Commands

Run from the repository root:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps
docker compose -f infra/docker-compose.dev.yml logs --tail 100
```

Each service uses a persistent named volume. To stop the stack while retaining data:

```powershell
docker compose -f infra/docker-compose.dev.yml down
```

Adding `--volumes` deletes the stored development data. It is not needed for normal
startup or shutdown.

After configuring environments, generate the client and apply migrations using the
[database guide](../packages/database/README.md). Start TypeScript processes with
root `bun run dev` and the [RAG service](../apps/rag-service/README.md) separately.

Application Dockerfiles, cloud provisioning and deployment manifests are not part
of this directory. The Dockerfiles under [templates](../packages/templates/README.md)
build project sandbox images.
