"""
graph_rag/api.py
================

THE HTTP API that ForgeAI calls (work plan Q4). The command line tools stay
for local use; this is how the agent worker reaches the graph.

    POST   /projects/{id}/index    index a project from a source archive,
                                   streaming one JSON line per step
    POST   /projects/{id}/search   look a query up: context block + hits
    GET    /projects/{id}/status   when it was last indexed, and counts
    DELETE /projects/{id}          remove the project's graph
    GET    /healthz, /readyz       alive? can it reach Neo4j?

Run it with `graph-rag-serve` (host and port from config.py).

THE RULE: IT FINDS, IT NEVER THINKS
-----------------------------------
There is no answer, chat or review endpoint, on purpose. A search is one pass
- the query in, the matching code and docs out - and the agent's main model
decides what they mean. See the README.

WHY INDEXING STREAMS
--------------------
A first index can take a minute. Rather than one long silent request, the
index endpoint answers with NDJSON: one JSON object per line, sent as each
step happens, so ForgeAI can show "embedding 120/300" while it works:

    {"type": "progress", "phase": "downloading", "done": 524288, "total": 1048576}
    {"type": "progress", "phase": "parsing", "done": 3, "total": 10}
    {"type": "done", "state": "indexed", "etag": "...", "report": {...}}

The last line is always `done` (state "indexed" or "up_to_date") or
`failed` (with "error"), so a reader knows when to stop.

SECURITY
--------
- Every request but the health checks needs the `x-rag-secret` header to equal
  RAG_SERVICE_SECRET, compared in constant time. The service will not start
  without a secret.
- A source archive is fetched only from configured origins. The initial URL
  and every redirect are DNS/IP checked so private, loopback, link-local and
  metadata addresses are refused. Download size, file count and unpacked size
  are checked before anything is written from the archive, and extraction
  rejects traversal, symlinks, hardlinks and special files.
- The indexer already refuses secrets (.env files, keys) and vendored folders.
- Nothing logged includes file contents.
"""

import hmac
import json
import queue
import shutil
import tempfile
import threading
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

import uvicorn
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import config
from .archive_source import download_archive, unpack_archive
from .pipeline import run_indexing
from .retrieval import retrieve
from .storage import GraphStore

# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------


def require_secret(x_rag_secret: str = Header(default="")) -> None:
    """Refuse any request that does not carry the shared secret."""
    if not hmac.compare_digest(x_rag_secret.encode(), config.RAG_SERVICE_SECRET.encode()):
        raise HTTPException(status_code=401, detail="missing or wrong x-rag-secret")


def open_store(project_id: str) -> GraphStore:
    """A store for one project, or a 400 if the id is not a valid project id."""
    try:
        return GraphStore.from_config(project_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# One index at a time per project: two runs over the same files would race on
# the same nodes. A set guarded by a lock is all that needs.
_indexing: set[str] = set()
_indexing_lock = threading.Lock()


def _claim(project_id: str) -> bool:
    with _indexing_lock:
        if project_id in _indexing:
            return False
        _indexing.add(project_id)
        return True


def _release(project_id: str) -> None:
    with _indexing_lock:
        _indexing.discard(project_id)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """At startup: refuse to run without a secret, and create the schema once."""
    if not config.RAG_SERVICE_SECRET:
        raise SystemExit("RAG_SERVICE_SECRET is not set; the API refuses to start without one.")
    config.validate()
    config.validate_archive_source_allowlist()
    with GraphStore.from_config("startup") as store:
        store.verify_connection()
        store.ensure_schema()
    yield


app = FastAPI(title="ForgeAI knowledge graph", lifespan=lifespan)
projects = APIRouter(prefix="/projects/{project_id}", dependencies=[Depends(require_secret)])


# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------


class IndexRequest(BaseModel):
    # A short-lived link to the project's source as a .tar.gz (work plan Q5).
    sourceUrl: str = Field(min_length=1, max_length=4000)
    # The archive's ETag: the same one as the last finished index means
    # nothing changed, and the answer is "up to date" straight away.
    etag: str | None = Field(default=None, max_length=200)
    # Re-parse and re-embed everything (after a parser or model change).
    force: bool = False


def _report_dict(report) -> dict:
    """The IndexReport as plain JSON, plus the derived total it exposes."""
    data = asdict(report)
    data["calls_unresolved"] = report.calls_unresolved
    return data


def _index_job(project_id: str, body: IndexRequest, emit) -> None:
    """The whole index run, in a worker thread. Reports through `emit`."""
    emit({"type": "progress", "phase": "checking", "done": None, "total": None})
    with GraphStore.from_config(project_id) as store:
        state = store.get_index_state()

    if body.etag and not body.force and state and state.get("etag") == body.etag:
        emit({"type": "done", "state": "up_to_date", "etag": body.etag})
        return

    work = Path(tempfile.mkdtemp(prefix="rag-index-"))
    try:
        archive = work / "source.tar.gz"
        source = work / "source"
        download_archive(body.sourceUrl, archive, emit)
        unpack_archive(archive, source, emit)

        report = run_indexing(
            source,
            project_id=project_id,
            force=body.force,
            verbose=False,
            on_progress=lambda step: emit({"type": "progress", **step}),
        )
        # Only now: a stored ETag promises the graph matches that archive.
        with GraphStore.from_config(project_id) as store:
            store.save_index_state(body.etag)
        emit(
            {"type": "done", "state": "indexed", "etag": body.etag, "report": _report_dict(report)}
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


@projects.post("/index")
def index_project(project_id: str, body: IndexRequest):
    """Index (or refresh) a project, streaming progress as NDJSON."""
    open_store(project_id).close()  # a bad id fails here, as a 400
    if not _claim(project_id):
        raise HTTPException(status_code=409, detail="this project is already being indexed")

    events: queue.Queue = queue.Queue()

    def work() -> None:
        try:
            _index_job(project_id, body, events.put)
        except BaseException as error:  # noqa: BLE001 - the indexer can raise SystemExit
            events.put({"type": "failed", "error": str(error) or type(error).__name__})
        finally:
            _release(project_id)
            events.put(None)  # end of stream

    # A thread rather than the request: the run finishes even if the caller
    # goes away, so a dropped connection never leaves half an index.
    threading.Thread(target=work, name=f"index-{project_id}", daemon=True).start()

    def stream():
        while (event := events.get()) is not None:
            yield json.dumps(event, default=str) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# ---------------------------------------------------------------------------
# Search: one pass, no model call besides embedding the query
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    topK: int = Field(default=config.DEFAULT_TOP_K, ge=1, le=20)
    docTopK: int = Field(default=config.DEFAULT_DOC_TOP_K, ge=0, le=20)
    hops: int = Field(default=config.DEFAULT_HOPS, ge=1, le=2)
    maxChars: int = Field(default=config.MAX_CONTEXT_CHARS, ge=1000, le=200_000)


@projects.post("/search")
def search_project(project_id: str, body: SearchRequest):
    """
    Look a query up. Returns the context block (what the agent reads), the hits
    (for the UI's "found these" list) and how much was dropped to fit.
    """
    with open_store(project_id) as store:
        result = retrieve(
            body.query,
            store,
            top_k=body.topK,
            hops=body.hops,
            doc_top_k=body.docTopK,
            max_chars=body.maxChars,
        )

    hits = (
        [
            {
                "kind": "code",
                "path": item.entity.file_path,
                "name": item.entity.name,
                "entityKind": item.entity.kind,
                "startLine": item.entity.start_line,
                "endLine": item.entity.end_line,
                "hop": item.hop,
                "score": item.score,
                "reason": item.reason,
            }
            for item in result.items
        ]
        + [
            {
                "kind": "doc",
                "path": doc.chunk.file_path,
                "name": doc.chunk.heading_path,
                "startLine": doc.chunk.start_line,
                "endLine": doc.chunk.end_line,
                "hop": doc.hop,
                "score": doc.score,
                "reason": doc.reason,
            }
            for doc in result.docs
        ]
        + [
            {
                "kind": "summary",
                "path": summary.summary.path,
                "name": None,
                "score": summary.score,
                "reason": summary.reason,
            }
            for summary in result.summaries
        ]
    )
    return {"contextText": result.context_text, "hits": hits, "droppedCount": result.dropped_count}


# ---------------------------------------------------------------------------
# Status and delete
# ---------------------------------------------------------------------------


@projects.get("/status")
def project_status(project_id: str):
    """When the project was last indexed, from which ETag, and how big it is."""
    with open_store(project_id) as store:
        state = store.get_index_state()
        counts = store.stats()
    indexed_at = state.get("indexedAt") if state else None
    return {
        "indexed": state is not None,
        "etag": state.get("etag") if state else None,
        "indexedAt": indexed_at.iso_format() if hasattr(indexed_at, "iso_format") else indexed_at,
        "indexing": project_id in _indexing,
        "counts": {
            "files": counts["files"],
            "codeBlocks": counts["entities"],
            "docSections": counts["doc chunks"],
            "folderSummaries": counts["folder summaries"],
        },
    }


@projects.delete("")
def delete_project(project_id: str):
    """Remove the project's graph. Refused while it is being indexed."""
    if not _claim(project_id):
        raise HTTPException(status_code=409, detail="this project is being indexed")
    try:
        with open_store(project_id) as store:
            return {"removed": store.delete_project()}
    finally:
        _release(project_id)


app.include_router(projects)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/healthz")
def healthz():
    """The process is up."""
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    """It can serve: Neo4j answers. No secret, so probes can call it."""
    with GraphStore.from_config("health") as store:
        ok = store.reachable()
    return JSONResponse(
        {"status": "ok" if ok else "neo4j unreachable"}, status_code=200 if ok else 503
    )


def main() -> None:
    """`graph-rag-serve`: run the API on config's host and port."""
    uvicorn.run("graph_rag.api:app", host=config.RAG_SERVICE_HOST, port=config.RAG_SERVICE_PORT)


if __name__ == "__main__":
    main()
