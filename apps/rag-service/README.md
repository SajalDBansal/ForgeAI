# ForgeAI RAG Service

Python/FastAPI service for indexing project code into Neo4j and retrieving evidence for the agent.
**Retrieval only:** user answers and tool execution belong to `apps/agent-worker`.

The [agent worker](../agent-worker/README.md) consumes retrieval results; the
[orchestrator](../orchestrator/README.md) supplies source archives.

## Setup

Use Python 3.11+ and the Neo4j service in
[development Compose](../../infra/docker-compose.dev.yml). That configuration supports the project's
scoped vector-search schema; do not substitute the old standalone tutorial's Neo4j image.

From this directory, create `.env` from [.env.example](.env.example) and configure:
Neo4j URI/user/password, embedding-provider credentials and `RAG_SERVICE_SECRET`.
Use the same RAG URL/secret in the API and worker.
Set `RAG_SOURCE_ALLOWED_ORIGINS` to the exact origin that signs source archive downloads
for ForgeAI, usually the R2 endpoint origin.

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\graph-rag-serve.exe
```

On Unix, use `python3` and the corresponding `.venv/bin/` commands.
The root `bun run dev` command does not start this service.

It listens on loopback port 3005 by default. Keep it private; use
`/healthz` for liveness and `/readyz` for Neo4j readiness.

## Configuration

[.env.example](.env.example) documents configuration, and
[config.py](graph_rag/config.py) validates settings and defaults.

`EMBEDDING_MODEL`/`EMBEDDING_DIM` must match the graph indexes.
`CHAT_MODEL` controls optional folder summaries; `GENERATE_SUMMARIES=false` disables them.
Provider/model examples are configuration examples, not current price or quality recommendations.

Indexing stores code excerpts and embeddings and sends selected text to external model endpoints.
Treat the graph as sensitive project data.

## Using It

The worker sends a filtered source archive to `POST /projects/{id}/index`, reads NDJSON progress,
then calls `POST /projects/{id}/search`. The service also provides project status
and deletion routes. Request models, authentication and routes are defined in
[api.py](graph_rag/api.py).

For local inspection, the installed `graph-rag-index` and `graph-rag-ask` commands accept
`--project`; inspect `--help` for the current flags. Keep local projects under distinct IDs.
`graph-rag-ask --show-context` displays retrieved evidence, not a generated answer.

Indexing/lookup can incur embedding and summary costs. Use small fixtures and dedicated test project IDs.
The API deletion endpoint is internal and destructive; authorize the project in the caller first.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\python.exe -m ruff check graph_rag tests evals
.\.venv\Scripts\python.exe -m ruff format --check graph_rag tests evals
```

Tests and [evals](evals) answer different questions: tests protect behavior; evals measure useful
retrieval. Live service/provider checks need separate credentials and cost limits.

## Important Limits

- Index/delete exclusion is process-local: one API process until distributed coordination exists.
- Archive downloads are restricted to configured origins and public resolved addresses;
  keep `RAG_SOURCE_ALLOWED_ORIGINS` aligned with the orchestrator's signed-download host.
- A lost client does not stop the indexing thread; process death still interrupts it.
- A relevant graph relationship is evidence, not proof that code executes that way.
- Excluding known secret filenames is not a general secret scanner.

## Source map

| Path                                                       | Responsibility                                        |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [graph_rag/api.py](graph_rag/api.py)                       | FastAPI routes, authentication and index coordination |
| [graph_rag/archive_source.py](graph_rag/archive_source.py) | Validated source archive download and extraction      |
| [graph_rag/parsing](graph_rag/parsing)                     | Code and document parsing                             |
| [graph_rag/pipeline](graph_rag/pipeline)                   | Indexing, import resolution and optional summaries    |
| [graph_rag/embedding](graph_rag/embedding)                 | Embedding generation                                  |
| [graph_rag/storage](graph_rag/storage)                     | Neo4j schema and graph operations                     |
| [graph_rag/retrieval](graph_rag/retrieval)                 | Project-scoped search                                 |
| [graph_rag/cli](graph_rag/cli)                             | Local indexing and retrieval commands                 |
