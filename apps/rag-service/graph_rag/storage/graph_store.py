"""
storage/graph_store.py
======================

Every Neo4j query in the project lives here, wrapped in one class.

HOW TO READ A CYPHER QUERY
--------------------------
Cypher draws the pattern it is looking for using ASCII art:

    MATCH (a:CodeEntity)-[:CALLS]->(b:CodeEntity)

means "find a CodeEntity node `a` with a CALLS arrow pointing at another
CodeEntity node `b`". Round brackets are nodes, square brackets are
relationships, and the arrow shows direction.

`$name` is a parameter - a value we pass in from Python separately from the
query text. Always use parameters instead of pasting values into the string:
it is safer (no injection) and faster (Neo4j caches the query plan).

`UNWIND $rows AS row` takes a LIST we pass from Python and turns it into one
row per item, so a single query can write hundreds of nodes. Doing 500
separate queries would be many times slower because each one is a round trip
to the database.
"""

import re
from typing import Self

from neo4j import GraphDatabase

from .. import config
from ..models import CodeEntity, DocChunk, Relationship
from ..parsing import language_family
from . import schema


def _chunked(items: list, size: int):
    """
    Cut a long list into smaller lists of at most `size` items.

    We send writes in chunks so a single query never has to carry tens of
    thousands of rows, which would use a lot of memory on the server.
    """
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _component_sizes(adjacency: dict[str, set[str]]) -> list[int]:
    """
    The size of every connected group in an undirected adjacency map.

    Done in Python rather than Cypher on purpose. Neo4j can only count
    components with the GDS plugin, which is a separate install this project
    does not require anyone to have, and the alternative - a variable-length
    path query - is quadratic and will hang on a real repository. Walking the
    edges here is linear in their number and needs no plugin at all.

    Iterative rather than recursive: a chain of a few thousand functions that
    call each other is perfectly ordinary, and it would blow Python's
    recursion limit.
    """
    seen: set[str] = set()
    sizes: list[int] = []

    for start in adjacency:
        if start in seen:
            continue
        size = 0
        stack = [start]
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            size += 1
            stack.extend(adjacency.get(node, ()))
        sizes.append(size)

    return sizes


# A project id goes into Lucene queries and log lines, so it is held to a
# plain shape: letters, digits, "_" and "-". ForgeAI's ids (cuids) fit.
_PROJECT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class _ProjectSession:
    """
    A Neo4j session that hands every query its project as `$project`.

    ONE GRAPH, MANY PROJECTS (ForgeAI work plan Q3). Every node carries a
    `projectId`, and every query in GraphStore names `$project` in its
    patterns. This wrapper is what fills that parameter in, so no query can
    forget it: the value comes from the store, never from the caller.
    """

    def __init__(self, session, project_id: str):
        self._session = session
        self._project_id = project_id

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._session.close()

    def run(self, query: str, **params):
        params.setdefault("project", self._project_id)
        return self._session.run(query, **params)


class GraphStore:
    """
    The connection to Neo4j, plus one method per thing we need to do.

    A store belongs to ONE project: everything it reads and writes is scoped
    to `project_id`, so many projects share one database without ever seeing
    each other's nodes. Use it with `with`, so the connection is always
    closed properly:

        with GraphStore.from_config("my-project") as store:
            store.ensure_schema()
    """

    def __init__(self, uri: str, user: str, password: str, project_id: str):
        if not _PROJECT_ID_RE.match(project_id or ""):
            raise ValueError(f"project id must be 1-64 of A-Z a-z 0-9 _ -, got {project_id!r}")
        self.project_id = project_id
        # The driver holds a pool of connections. Create ONE and reuse it -
        # creating a driver per query would be very slow.
        #
        # "UNRECOGNIZED" notices are switched off: Neo4j warns that a
        # relationship type "does not exist" whenever a query names one no
        # project has used yet (EXTENDS in a codebase with no inheritance), and
        # on every search that flooded the logs with a non-problem.
        self._driver = GraphDatabase.driver(
            uri,
            auth=(user, password),
            notifications_disabled_classifications=["UNRECOGNIZED"],
        )

    @classmethod
    def from_config(cls, project_id: str) -> "GraphStore":
        """Build a store for one project using the settings in config.py / your .env file."""
        return cls(config.NEO4J_URI, config.NEO4J_USER, config.NEO4J_PASSWORD, project_id)

    def _session(self) -> _ProjectSession:
        """A session whose every query gets this store's project as `$project`."""
        return _ProjectSession(self._driver.session(), self.project_id)

    def _project_lucene(self, query: str) -> str:
        """
        Limit a full-text query to this project.

        Neo4j's full-text indexes cannot filter by a property, but Lucene can
        require a term in a field. The indexes include `projectId` (see
        schema.FULLTEXT_INDEXES), so `+projectId:"x" +(...)` keeps the search
        inside the project in the index itself - other projects' matches can
        never fill the result slots.
        """
        if not query:
            return ""
        return f'+projectId:"{self.project_id}" +({query})'

    # --- context manager plumbing (what makes `with` work) -----------------

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.close()

    def close(self) -> None:
        self._driver.close()

    def verify_connection(self) -> None:
        """
        Fail fast with a readable message if Neo4j is not reachable.

        Without this you would get a confusing timeout in the middle of
        indexing instead of "your database is not running".
        """
        try:
            self._driver.verify_connectivity()
        except Exception as error:  # noqa: BLE001 - we re-raise with context
            raise SystemExit(
                f"Could not connect to Neo4j at {config.NEO4J_URI}.\n"
                f"Is the container running?  docker ps\n"
                f"Original error: {error}"
            )

    # -----------------------------------------------------------------
    # One-time setup
    # -----------------------------------------------------------------

    def ensure_schema(self) -> None:
        """
        Create the constraints and indexes if they do not exist yet.

        Safe to call on every run: every statement ends in `IF NOT EXISTS`,
        so this does nothing at all the second time.
        """
        with self._session() as session:
            # Indexes and constraints from before Q3 (one repository per
            # database). `IF NOT EXISTS` only checks a NAME, so an old
            # single-property constraint would quietly stay and make two
            # projects' `app/page.tsx` collide. Dropped if present.
            for statement in schema.LEGACY_DROPS:
                session.run(statement)
            for statement in schema.CONSTRAINTS:
                session.run(statement)
            for statement in schema.INDEXES:
                session.run(statement)
            for statement in schema.FULLTEXT_INDEXES:
                session.run(statement)
            session.run(schema.vector_index_query())
            session.run(schema.doc_vector_index_query())
            session.run(schema.summary_vector_index_query())

        self._check_embedding_model()

    def _check_embedding_model(self) -> None:
        """
        Refuse to run against a graph built with a different embedding model.

        Every vector index is created with `IF NOT EXISTS` and a fixed
        dimension, so changing EMBEDDING_MODEL in .env does NOT rebuild them.
        The old index quietly stays at the old dimension while new vectors
        arrive at the new one, and the two are not comparable even where the
        sizes happen to match: vectors from different models occupy different
        spaces, so every similarity score becomes meaningless.

        Nothing detected that. This turns a silent corruption of every search
        result into an error that says what to do about it.
        """
        with self._session() as session:
            record = session.run(
                """
                MERGE (m:IndexMeta {id: 'embedding'})
                ON CREATE SET m.model = $model, m.dimensions = $dim
                RETURN m.model AS model, m.dimensions AS dimensions
                """,
                model=config.EMBEDDING_MODEL,
                dim=config.EMBEDDING_DIM,
            ).single()

        if record is None:
            return

        stored_model = record["model"]
        stored_dim = record["dimensions"]
        if stored_model == config.EMBEDDING_MODEL and stored_dim == config.EMBEDDING_DIM:
            return

        raise SystemExit(
            "This graph was built with a different embedding model.\n"
            f"  stored:  {stored_model} ({stored_dim} dimensions)\n"
            f"  current: {config.EMBEDDING_MODEL} ({config.EMBEDDING_DIM} dimensions)\n"
            "\nVectors from two different models are not comparable, so every\n"
            "search result would be meaningless. Either put the original model\n"
            "back in your .env, or rebuild from scratch:\n"
            "  1. drop the vector indexes and delete every node, then\n"
            "  2. re-run the indexer with --force."
        )

    def reachable(self) -> bool:
        """Whether Neo4j answers right now. For a health check: never raises."""
        try:
            self._driver.verify_connectivity()
            return True
        except Exception:  # noqa: BLE001 - any failure means "not ready"
            return False

    def get_index_state(self) -> dict | None:
        """
        What this project was last indexed from: {"etag", "indexedAt"}, or None.

        The ETag is the source archive's (ForgeAI work plan Q5). The same ETag
        as the last FINISHED index means nothing changed, so the API answers
        "up to date" without downloading or reading anything.
        """
        with self._session() as session:
            record = session.run(
                """
                MATCH (s:IndexState {projectId: $project})
                RETURN s.etag AS etag, s.indexedAt AS indexedAt
                """
            ).single()
            return dict(record) if record else None

    def save_index_state(self, etag: str | None) -> None:
        """Record a finished index, so the next one with the same ETag can skip."""
        with self._session() as session:
            session.run(
                """
                MERGE (s:IndexState {projectId: $project})
                SET s.etag = $etag, s.indexedAt = datetime()
                """,
                etag=etag,
            )

    def delete_project(self) -> int:
        """
        Remove everything this project has in the graph, and nothing else.

        Batched so a large project never needs one huge transaction. Returns
        how many nodes were removed. The shared IndexMeta node is untouched.
        """
        with self._session() as session:
            record = session.run(
                """
                MATCH (n {projectId: $project})
                CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS
                RETURN count(*) AS removed
                """
            ).single()
            return record["removed"] if record else 0

    # -----------------------------------------------------------------
    # Reading the hashes stored from the previous run
    # -----------------------------------------------------------------

    def get_folder_hashes(self) -> dict[str, str]:
        """{folder path: Merkle hash} for every folder we stored last run."""
        with self._session() as session:
            result = session.run(
                "MATCH (d:Folder {projectId: $project}) RETURN d.path AS path, d.hash AS hash"
            )
            return {record["path"]: record["hash"] for record in result}

    def get_file_hashes(self) -> dict[str, str]:
        """{file path: sha256 of the file} for every file we stored last run."""
        with self._session() as session:
            result = session.run(
                "MATCH (f:File {projectId: $project}) RETURN f.path AS path, f.hash AS hash"
            )
            return {record["path"]: record["hash"] for record in result}

    def get_entity_hashes(self, file_path: str) -> dict[str, str]:
        """
        {entity id: block hash} for one file.

        This is the third and finest level of the Merkle comparison: even
        inside a file we know changed, we only re-embed the functions whose
        own hash moved.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (e:CodeEntity {projectId: $project, filePath: $filePath})
                RETURN e.id AS id, e.contentHash AS hash
                """,
                filePath=file_path,
            )
            return {record["id"]: record["hash"] for record in result}

    def get_entity_hashes_for_files(self, file_paths: list[str]) -> dict[str, dict[str, str]]:
        """
        {file path: {entity id: block hash}} for many files at once.

        The per-file version below is one round trip per changed file, and the
        indexer needs two of them for every file. On a cold index of a few
        thousand files that is tens of thousands of round trips, and the
        latency dominates the whole run. One query for the batch instead.
        """
        if not file_paths:
            return {}

        result: dict[str, dict[str, str]] = {path: {} for path in file_paths}
        with self._session() as session:
            for batch in _chunked(file_paths, 1000):
                records = session.run(
                    """
                    MATCH (e:CodeEntity {projectId: $project})
                    WHERE e.filePath IN $paths
                    RETURN e.filePath AS filePath, e.id AS id,
                           e.contentHash AS hash,
                           e.embedding IS NOT NULL AS embedded
                    """,
                    paths=batch,
                )
                for record in records:
                    result[record["filePath"]][record["id"]] = (
                        record["hash"] if record["embedded"] else None
                    )
        return result

    def get_doc_hashes_for_files(self, file_paths: list[str]) -> dict[str, dict[str, str]]:
        """The document twin of get_entity_hashes_for_files."""
        if not file_paths:
            return {}

        result: dict[str, dict[str, str]] = {path: {} for path in file_paths}
        with self._session() as session:
            for batch in _chunked(file_paths, 1000):
                records = session.run(
                    """
                    MATCH (d:Doc {projectId: $project})
                    WHERE d.filePath IN $paths
                    RETURN d.filePath AS filePath, d.id AS id,
                           d.contentHash AS hash,
                           d.embedding IS NOT NULL AS embedded
                    """,
                    paths=batch,
                )
                for record in records:
                    result[record["filePath"]][record["id"]] = (
                        record["hash"] if record["embedded"] else None
                    )
        return result

    def get_entity_ids_with_embeddings(self, file_path: str) -> set[str]:
        """
        Which entities in this file already have an embedding stored.

        Needed for the case where a previous run was interrupted after
        writing a node but before embedding it: the hash matches, but the
        vector is missing, so it must still be embedded.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (e:CodeEntity {projectId: $project, filePath: $filePath})
                WHERE e.embedding IS NOT NULL
                RETURN e.id AS id
                """,
                filePath=file_path,
            )
            return {record["id"] for record in result}

    # -----------------------------------------------------------------
    # Writing the folder / file skeleton
    # -----------------------------------------------------------------

    def save_folder_hashes(self, folders: list[dict]) -> None:
        """
        Write folder Merkle hashes, and nothing else.

        Split out from save_folders because WHEN a hash is written matters.
        A stored hash means "everything under here is already in the graph",
        so it is only true once the run has finished its expensive work. See
        the hash-writing rule in pipeline/indexer.py.
        """
        self._save_hashes(folders, "Folder")

    def save_file_hashes(self, files: list[dict]) -> None:
        """Write file hashes, and nothing else. See save_folder_hashes."""
        self._save_hashes(files, "File")

    def _save_hashes(self, rows: list[dict], label: str) -> None:
        if not rows:
            return
        payload = [{"path": row["path"], "hash": row["hash"]} for row in rows]
        with self._session() as session:
            for batch in _chunked(payload, 1000):
                session.run(
                    f"""
                    UNWIND $rows AS row
                    MATCH (n:{label} {{projectId: $project, path: row.path}})
                    SET n.hash = row.hash
                    """,
                    rows=batch,
                )

    def save_folders(self, folders: list[dict], with_hash: bool = True) -> None:
        """
        Save folder nodes and their nesting.

        Each item looks like {"path": "src/auth", "hash": "ab12...",
                             "parent": "src"}
        `parent` is None for the repository root.

        `with_hash=False` creates the node but leaves its hash alone, so the
        indexer can build the skeleton first and commit hashes only after the
        run has actually succeeded.
        """
        if not folders:
            return

        set_hash = "SET d.hash = row.hash" if with_hash else ""

        with self._session() as session:
            for batch in _chunked(folders, 500):
                session.run(
                    f"""
                    UNWIND $rows AS row
                    MERGE (d:Folder {{projectId: $project, path: row.path}})
                    {set_hash}
                    // Link it to its parent folder, when it has one.
                    // FOREACH over a 0-or-1 element list is the standard
                    // Cypher trick for "do this only if the value exists".
                    FOREACH (_ IN CASE WHEN row.parent IS NULL THEN [] ELSE [1] END |
                        MERGE (parent:Folder {{projectId: $project, path: row.parent}})
                        MERGE (parent)-[:CONTAINS]->(d)
                    )
                    """,
                    rows=batch,
                )

    def save_files(self, files: list[dict], with_hash: bool = True) -> None:
        """
        Save file nodes and attach them to their folder.

        Each item: {"path": "src/auth/user.py", "hash": "...",
                    "language": "python", "parent": "src/auth"}

        `with_hash=False` creates the node without promising that its contents
        are fully indexed - see save_folder_hashes.
        """
        if not files:
            return

        set_hash = "f.hash = row.hash," if with_hash else ""

        with self._session() as session:
            for batch in _chunked(files, 500):
                session.run(
                    f"""
                    UNWIND $rows AS row
                    MERGE (f:File {{projectId: $project, path: row.path}})
                    SET {set_hash}
                        f.language = row.language
                    FOREACH (_ IN CASE WHEN row.parent IS NULL THEN [] ELSE [1] END |
                        MERGE (parent:Folder {{projectId: $project, path: row.parent}})
                        MERGE (parent)-[:CONTAINS]->(f)
                    )
                    """,
                    rows=batch,
                )

    def delete_missing_folders(self, existing_paths: list[str]) -> int:
        """
        Remove Folder nodes for directories that no longer exist on disk.

        `DETACH DELETE` deletes the node AND every relationship attached to
        it. Plain `DELETE` refuses to remove a node that still has
        relationships, so DETACH is what you almost always want.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (d:Folder {projectId: $project})
                WHERE NOT d.path IN $paths
                DETACH DELETE d
                RETURN count(*) AS removed
                """,
                paths=existing_paths,
            )
            return result.single()["removed"]

    def delete_file(self, file_path: str) -> None:
        """
        Remove a file and everything defined in it.

        Called when a file is deleted from the repo. Without this the graph
        would slowly fill with "ghost" functions that no longer exist, and
        the LLM would confidently answer questions using deleted code.
        """
        # Three separate statements rather than one.
        #
        # The single-statement version started `MATCH (f:File {path: $path})`,
        # so if the File node was missing - an earlier run interrupted between
        # writing entities and writing the file, say - the whole match failed
        # and its orphaned entities and doc chunks were never cleaned up.
        # It also built a cartesian product of entities x docs, which does
        # pointless work on any file with a lot of both.
        with self._session() as session:
            session.run(
                "MATCH (e:CodeEntity {projectId: $project, filePath: $path}) DETACH DELETE e",
                path=file_path,
            )
            session.run(
                "MATCH (d:Doc {projectId: $project, filePath: $path}) DETACH DELETE d",
                path=file_path,
            )
            session.run(
                "MATCH (f:File {projectId: $project, path: $path}) DETACH DELETE f",
                path=file_path,
            )

    # -----------------------------------------------------------------
    # Writing code entities
    # -----------------------------------------------------------------

    def save_entities(self, entities: list[CodeEntity]) -> None:
        """
        Create or update CodeEntity nodes, and link each to its file.

        The embedding is set separately (see `save_embeddings`) because we
        often save the node first and embed only the subset that changed.
        """
        if not entities:
            return

        rows = []
        for entity in entities:
            properties = schema.entity_to_properties(entity)
            properties.pop("embedding")  # handled by save_embeddings
            rows.append(properties)

        with self._session() as session:
            for batch in _chunked(rows, 200):
                session.run(
                    """
                    UNWIND $rows AS row
                    // MERGE on id = "update it if it exists, create it if not".
                    MERGE (e:CodeEntity {projectId: $project, id: row.id})
                    SET e.kind        = row.kind,
                        e.name        = row.name,
                        e.filePath    = row.filePath,
                        e.language    = row.language,
                        e.startLine   = row.startLine,
                        e.endLine     = row.endLine,
                        e.code        = row.code,
                        e.docstring   = row.docstring,
                        e.contentHash = row.contentHash,
                        e.unresolvedCalls   = row.unresolvedCalls,
                        e.unresolvedExtends = row.unresolvedExtends,
                        e.unresolvedTypes   = row.unresolvedTypes,
                        e.externalCalls     = row.externalCalls,
                        e.externalTypes     = row.externalTypes,
                        e.isRecursive       = row.isRecursive,
                        e.ownerName         = row.ownerName,
                        // The evidence that lets an ambiguous call name be
                        // resolved later: what each receiver was declared to
                        // be, how many arguments each call passed, and this
                        // definition's own signature shape. Written here
                        // because a pending reference is usually settled on
                        // a LATER run, by which time the calling file is
                        // unchanged and will not be parsed again.
                        e.callOwnerHints    = row.callOwnerHints,
                        e.callArityHints    = row.callArityHints,
                        e.paramCount        = row.paramCount,
                        e.flexibleArity     = row.flexibleArity
                    WITH e, row
                    MATCH (f:File {projectId: $project, path: row.filePath})
                    MERGE (f)-[:CONTAINS]->(e)
                    """,
                    rows=batch,
                )

    def save_embeddings(self, id_to_vector: dict[str, list[float]]) -> None:
        """
        Attach embedding vectors to nodes that already exist.

        A Neo4j vector property is just a list of numbers; the vector index
        picks it up automatically once it is set.
        """
        if not id_to_vector:
            return

        rows = [{"id": key, "embedding": value} for key, value in id_to_vector.items()]

        with self._session() as session:
            # Smaller chunks here: each row carries 1536 floats, so these
            # payloads are far bigger than ordinary property writes.
            for batch in _chunked(rows, 100):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (e:CodeEntity {projectId: $project, id: row.id})
                    SET e.embedding = row.embedding
                    """,
                    rows=batch,
                )

    def delete_entities(self, entity_ids: list[str]) -> None:
        """Remove specific entities - used when a function is deleted from a file."""
        if not entity_ids:
            return

        with self._session() as session:
            session.run(
                """
                UNWIND $ids AS id
                MATCH (e:CodeEntity {projectId: $project, id: id})
                DETACH DELETE e
                """,
                ids=entity_ids,
            )

    def get_pending_references(self) -> list[dict]:
        """
        The AMBIGUOUS references - names that exist in the graph more than
        once, so we refused to guess which was meant.

        Returns [{"id", "language", "names", "kind"}, ...].

        THIS IS WHAT STOPS THE CALL GRAPH FROM DECAYING.
        ------------------------------------------------
        A call can only be linked once BOTH ends are in the graph. The caller
        is parsed when its own file changes, but the callee may not be added
        until a later run - and by then the caller is unchanged, so it is
        never looked at again. Every such pair was a permanently missing edge.
        Retrying the pending names makes the call graph converge instead.

        WHY THIS IS NOW ONLY THE AMBIGUOUS ONES
        ---------------------------------------
        `unresolvedCalls` used to hold two completely different things at
        once: "not resolvable YET" (the target is not indexed yet - worth
        retrying) and "not resolvable AT ALL" (a call into the standard
        library - will never resolve). Both were stored the same way and
        retried the same way, forever. Nothing pruned a name once it DID
        resolve either, because resolution happened in a later step that
        never wrote its results back.

        The effect was that step 7a of the indexer re-resolved every reference
        in the entire repository on every run, including `len` and `print`.
        Scanning this project's own source produced 702 permanently-pending
        names from 8,900 lines; at that ratio a 500k-line repository would
        re-query about 40,000 names on every run, for ever, and the set only
        ever grew. Steps 2-6 scale with what CHANGED; this one scaled with
        repository SIZE, which quietly undid the whole point of the Merkle
        tree.

        Now the two are stored apart. Ambiguous names stay here and are
        retried every run - there are few of them, and they are the ones that
        can genuinely be resolved by a later run. External names go to
        `externalCalls` and are retried only when a matching name actually
        enters the graph. See get_external_references.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (e:CodeEntity {projectId: $project})
                WHERE (e.unresolvedCalls IS NOT NULL AND size(e.unresolvedCalls) > 0)
                   OR (e.unresolvedExtends IS NOT NULL AND size(e.unresolvedExtends) > 0)
                RETURN e.id AS id, e.language AS language,
                       coalesce(e.unresolvedCalls, [])   AS calls,
                       coalesce(e.unresolvedExtends, []) AS extends
                """
            )
            pending: list[dict] = []
            for record in result:
                if record["calls"]:
                    pending.append(
                        {
                            "id": record["id"],
                            "language": record["language"],
                            "names": record["calls"],
                            "kind": "CALLS",
                        }
                    )
                if record["extends"]:
                    pending.append(
                        {
                            "id": record["id"],
                            "language": record["language"],
                            "names": record["extends"],
                            "kind": "EXTENDS",
                        }
                    )
            return pending

    # -----------------------------------------------------------------
    # Writing relationships (edges)
    # -----------------------------------------------------------------

    def clear_outgoing_edges(self, file_path: str) -> None:
        """
        Delete the edges that START at entities in this file.

        We do this before re-writing a changed file's edges. If we only added
        edges, a call that was DELETED from the code would keep its edge in
        the graph forever.

        We only clear OUTGOING edges because those are the ones this file is
        responsible for. Incoming edges belong to whichever other file makes
        the call, and that file will refresh its own edges when it changes.
        """
        with self._session() as session:
            session.run(
                """
                MATCH (e:CodeEntity {projectId: $project, filePath: $path})-[r:CALLS|CONTAINS|EXTENDS|USES_TYPE]->()
                DELETE r
                """,
                path=file_path,
            )

    def get_external_references(self, new_names: list[str]) -> list[dict]:
        """
        Pending references that were classified "external" and whose name has
        just appeared in the graph for the first time.

        This is the other half of the fix described in
        get_pending_references. A name we could not find anywhere is almost
        always a library call, and retrying it on every run for the life of
        the repository is pure waste. But it is not ALWAYS a library call:
        sometimes the file defining it simply had not been indexed yet, and
        refusing to ever look again would reintroduce exactly the graph decay
        that pending references exist to prevent.

        So we retry an external name on precisely the run where retrying
        could newly succeed: the one where an entity with that name was
        written. `new_names` is what the indexer just saved, so the work here
        is proportional to what CHANGED rather than to repository size.
        """
        if not new_names:
            return []

        with self._session() as session:
            result = session.run(
                """
                UNWIND $names AS wanted
                MATCH (e:CodeEntity {projectId: $project})
                WHERE wanted IN e.externalCalls
                WITH e, collect(DISTINCT wanted) AS names
                RETURN e.id AS id, e.language AS language, names
                """,
                names=list(set(new_names)),
            )
            return [
                {"id": r["id"], "language": r["language"], "names": r["names"], "kind": "CALLS"}
                for r in result
            ]

    def get_unowned_members(self) -> list[dict]:
        """
        Definitions that name an owning type which is not yet linked to them.

        A Go method declares its type in a receiver and a Rust `impl` block
        declares the type it belongs to, so in both languages the owner can
        live in a different file from the member. When it does, the member
        cannot be linked at parse time - the parser only ever sees one file.

        This is the same "both ends must exist" problem that pending call
        references solve, and it converges the same way: the set shrinks to
        empty as the owning types get indexed, so it costs nothing on a
        settled repository.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (e:CodeEntity {projectId: $project})
                WHERE e.ownerName IS NOT NULL
                  AND NOT EXISTS {
                        MATCH (o:CodeEntity {projectId: $project, name: e.ownerName})-[:CONTAINS]->(e)
                  }
                RETURN e.id AS id, e.ownerName AS ownerName,
                       e.language AS language, e.filePath AS filePath
                """
            )
            return [dict(record) for record in result]

    def get_reference_state(self, new_names: list[str]) -> list[dict]:
        """
        Everything resolution needs to reconsider on THIS run, in one query.

        Returns [{"id", "language", "unresolvedCalls", "unresolvedExtends",
        "externalCalls"}, ...] for every entity that either

          - still has an AMBIGUOUS name (those are always worth retrying:
            there are few of them and a later run can genuinely settle them),
            or
          - has an EXTERNAL name that has just appeared in the graph, because
            `new_names` is what this run wrote, and that is the only event
            that can turn "nowhere to be found" into "found".

        The whole external list comes back, not only the matching names, so
        the caller can rewrite the property without losing the ones it did
        not reconsider.

        This is the query that puts step 7a back on the Merkle budget: its
        cost tracks what changed, not how big the repository is.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (e:CodeEntity {projectId: $project})
                WHERE size(coalesce(e.unresolvedCalls, [])) > 0
                   OR size(coalesce(e.unresolvedTypes, [])) > 0
                   OR size(coalesce(e.unresolvedExtends, [])) > 0
                   OR any(n IN coalesce(e.externalCalls, []) WHERE n IN $newNames)
                   OR any(n IN coalesce(e.externalTypes, []) WHERE n IN $newNames)
                RETURN e.id       AS id,
                       e.language AS language,
                       // The receiver types this entity's own source
                       // declared. This is the evidence that settles an
                       // override collision - see models.CodeEntity.
                       coalesce(e.callOwnerHints, [])    AS callOwnerHints,
                       coalesce(e.callArityHints, [])    AS callArityHints,
                       coalesce(e.unresolvedCalls, [])   AS unresolvedCalls,
                       coalesce(e.unresolvedTypes, [])   AS unresolvedTypes,
                       coalesce(e.unresolvedExtends, []) AS unresolvedExtends,
                       coalesce(e.externalCalls, [])     AS externalCalls,
                       coalesce(e.externalTypes, [])     AS externalTypes
                """,
                newNames=list(set(new_names)),
            )
            return [dict(record) for record in result]

    def save_reference_state(self, rows: list[dict]) -> None:
        """
        Write back what resolution concluded about each entity's pending names.

        Rows are {"id", "unresolvedCalls", "unresolvedExtends",
        "unresolvedTypes", "externalCalls"}.

        WHY WRITING BACK MATTERS
        ------------------------
        Resolution used to be a read-only pass: it worked out which names now
        linked, created the edges, and then threw that knowledge away. The
        node kept claiming those names were unresolved, so the next run did
        the identical work again and reached the identical conclusion. Three
        names in a 52-entity demo graph were still listed as unresolved after
        their CALLS edge had already been created.

        Persisting the verdict is what makes the pending set SHRINK as the
        graph converges, instead of only ever growing.
        """
        if not rows:
            return

        with self._session() as session:
            for batch in _chunked(rows, 500):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (e:CodeEntity {projectId: $project, id: row.id})
                    SET e.unresolvedCalls   = row.unresolvedCalls,
                        e.unresolvedExtends = row.unresolvedExtends,
                        e.unresolvedTypes   = row.unresolvedTypes,
                        e.externalCalls     = row.externalCalls,
                        e.externalTypes     = row.externalTypes
                    """,
                    rows=batch,
                )

    def save_relationships(self, relationships: list[Relationship]) -> None:
        """
        Create edges between entities.

        Cypher cannot take a relationship type as a parameter, so we group
        the edges by type and paste the type into the query - after checking
        it against a fixed whitelist in schema.py, which makes injection
        impossible.
        """
        if not relationships:
            return

        # Group by kind: {"CALLS": [...], "CONTAINS": [...]}
        by_kind: dict[str, list[dict]] = {}
        for rel in relationships:
            if rel.kind not in schema.ALLOWED_ENTITY_RELATIONSHIPS:
                continue  # unknown edge type - ignore rather than trust it
            by_kind.setdefault(rel.kind, []).append(
                {
                    "source": rel.source_id,
                    "target": rel.target_id,
                    # How much the edge is worth, and which rule made it.
                    # Retrieval reads the first to rank neighbours; the
                    # second is there so a surprising link can be explained
                    # by querying the graph rather than re-running the
                    # indexer with a debugger attached.
                    "confidence": rel.confidence,
                    "resolvedBy": rel.resolved_by,
                }
            )

        with self._session() as session:
            for kind, rows in by_kind.items():
                for batch in _chunked(rows, 500):
                    session.run(
                        f"""
                        UNWIND $rows AS row
                        MATCH (a:CodeEntity {{projectId: $project, id: row.source}})
                        MATCH (b:CodeEntity {{projectId: $project, id: row.target}})
                        MERGE (a)-[r:{kind}]->(b)
                        SET r.confidence = row.confidence,
                            r.resolvedBy  = row.resolvedBy
                        """,
                        rows=batch,
                    )

    def clear_file_imports(self, file_path: str) -> None:
        """
        Drop this file's IMPORTS edges before rewriting them.

        Nothing used to remove them, so deleting an import statement left its
        IMPORTS edge in the graph forever. Every edge here is derived purely
        from the importing file's own text, so replacing them wholesale is
        both correct and simple.
        """
        with self._session() as session:
            session.run(
                """
                MATCH (f:File {projectId: $project, path: $path})-[r:IMPORTS]->()
                DELETE r
                """,
                path=file_path,
            )

    def save_file_imports(self, file_path: str, imported_paths: list[str]) -> None:
        """Create (:File)-[:IMPORTS]->(:File) edges."""
        if not imported_paths:
            return

        with self._session() as session:
            session.run(
                """
                MATCH (source:File {projectId: $project, path: $path})
                UNWIND $targets AS target
                MATCH (t:File {projectId: $project, path: target})
                MERGE (source)-[:IMPORTS]->(t)
                """,
                path=file_path,
                targets=imported_paths,
            )

    # -----------------------------------------------------------------
    # Interface tokens: the cross-language join
    # -----------------------------------------------------------------

    def clear_interface_refs(self, file_path: str) -> None:
        """
        Drop this file's REFERENCES edges before rewriting them.

        Same reasoning as clear_outgoing_edges: a route deleted from the code
        has to lose its edge, and only delete-then-recreate guarantees that.
        """
        with self._session() as session:
            session.run(
                """
                MATCH (n)-[r:REFERENCES]->(:Interface {projectId: $project})
                WHERE (n:CodeEntity OR n:Doc) AND n.projectId = $project AND n.filePath = $path
                DELETE r
                """,
                path=file_path,
            )

    def save_interface_refs(self, refs: list[tuple[str, str, str]]) -> None:
        """
        Create the Interface nodes and the REFERENCES edges into them.

        `refs` is [(source_node_id, kind, value), ...] where the source is a
        CodeEntity id or a Doc id.

        This is the only place in the project that creates an edge between
        two different languages. It does it WITHOUT ever claiming two
        functions are the same: the claim is only that both of them mention
        the same literal value, which is a fact, and the edge type says
        exactly that. See parsing/interfaces.py.
        """
        if not refs:
            return

        rows = [
            {"source": source, "id": schema.interface_id(kind, value), "kind": kind, "value": value}
            for source, kind, value in refs
        ]

        with self._session() as session:
            for batch in _chunked(rows, 500):
                session.run(
                    """
                    UNWIND $rows AS row
                    MERGE (i:Interface {projectId: $project, id: row.id})
                      ON CREATE SET i.kind = row.kind, i.value = row.value
                    WITH i, row
                    MATCH (n {projectId: $project, id: row.source})
                    WHERE n:CodeEntity OR n:Doc
                    MERGE (n)-[:REFERENCES]->(i)
                    """,
                    rows=batch,
                )

    def prune_noisy_interfaces(self, max_fanout: int) -> int:
        """
        Delete interface tokens that too many things reference.

        A route mentioned by three files is a real seam between them. A token
        mentioned by two hundred is a common word that happens to look like
        one, and linking all two hundred to each other would make the graph
        denser without making it more informative - every one of those nodes
        would then be a two-hop neighbour of every other.

        Run after each indexing pass, over the whole graph, because fan-out
        is a global property: a token can only be judged once every file that
        mentions it has been seen.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (i:Interface {projectId: $project})
                WITH i, count { (i)<-[:REFERENCES]-() } AS fanout
                WHERE fanout > $maxFanout OR fanout < 2
                DETACH DELETE i
                RETURN count(i) AS removed
                """,
                maxFanout=max_fanout,
            )
            record = result.single()
            return record["removed"] if record else 0

    def entities_sharing_interfaces(self, entity_ids: list[str], limit: int) -> list[dict]:
        """
        Code reachable from these entities through a shared interface token.

        This is the hop that crosses a language boundary: a TypeScript client
        that fetches "/api/cart" and the Python handler that serves it are
        two hops apart through the route's node, and nothing else in the
        graph connects them at all.

        The reason string names the token, so the model can say WHY the two
        were shown together instead of inferring a relationship that might
        not exist - which is exactly what it did when the graph offered no
        cross-language edges and it had to guess.
        """
        if not entity_ids:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                UNWIND $ids AS seedId
                MATCH (seed {{projectId: $project, id: seedId}})-[:REFERENCES]->(i:Interface {{projectId: $project}})
                MATCH (e:CodeEntity {{projectId: $project}})-[:REFERENCES]->(i)
                WHERE NOT e.id IN $ids
                  // Only worth reporting when it actually crosses a boundary
                  // or a file - two functions in one file sharing a route are
                  // already connected by ordinary edges.
                  AND (seed.language IS NULL OR e.language <> seed.language
                       OR e.filePath <> seed.filePath)
                WITH e, i, count(*) AS weight
                ORDER BY weight DESC
                WITH e, collect(i)[0] AS token
                RETURN {schema.ENTITY_RETURN_FIELDS},
                       token.kind  AS tokenKind,
                       token.value AS tokenValue
                LIMIT $limit
                """,
                ids=entity_ids,
                limit=limit,
            )
            return [
                {
                    "entity": schema.record_to_entity(record),
                    "reason": (
                        f"shares the {record['tokenKind']} `{record['tokenValue']}` with a match"
                    ),
                }
                for record in result
            ]

    def resolve_names(self, names: list[str]) -> dict[str, list[dict]]:
        """
        Look up entities by name across the WHOLE graph.

        This is how a call gets connected to a function in a different file.
        The parser could only see one file at a time; here we can see
        everything that has ever been indexed.

        Returns {name: {"candidates": [...], "total": n}}, where `candidates`
        is capped at config.MAX_NAME_CANDIDATES and `total` is how many there
        really were.

        THE TOTAL IS NOT DECORATION. Candidates come back ordered by id, which
        is an ordering chosen so that "is this name ambiguous?" does not
        depend on which rows the database happened to return first. It is not
        a relevance ranking, so a truncated sample is an arbitrary, path-biased
        slice - and narrowing that slice by imports could confidently produce
        exactly one survivor that is the WRONG definition. Callers use `total`
        to notice they are looking at a sample and decline instead.

        The LANGUAGE is returned, not just the id, and it matters. A Python
        `AuthService.login` and a TypeScript `api.ts::login` collide on the
        bare name `login`. Without the language both look ambiguous and
        NEITHER gets linked, leaving real calls unconnected. With it, the
        caller can narrow to its own language first - a TypeScript call to
        `login` can only mean the TypeScript one.
        """
        if not names:
            return {}

        with self._session() as session:
            result = session.run(
                """
                UNWIND $names AS wanted
                MATCH (e:CodeEntity {projectId: $project, name: wanted})
                // Ordered so the candidate list is stable between runs -
                // an arbitrary order made "is this name ambiguous?" depend on
                // which rows the database happened to return first.
                WITH wanted, e ORDER BY e.id
                WITH wanted, collect({
                    id: e.id, language: e.language, filePath: e.filePath,
                    kind: e.kind, ownerName: e.ownerName,
                    // Arity, for the last-resort tie-break. `flexibleArity`
                    // says the count cannot be relied on - see
                    // parsing.code_parser._arity.
                    paramCount: e.paramCount, flexibleArity: e.flexibleArity
                }) AS everything
                RETURN wanted AS name,
                       everything[0..$cap] AS candidates,
                       size(everything)    AS total
                """,
                names=list(set(names)),  # de-duplicate before asking
                cap=config.MAX_NAME_CANDIDATES,
            )
            return {
                record["name"]: {
                    "candidates": record["candidates"],
                    "total": record["total"],
                }
                for record in result
            }

    # -----------------------------------------------------------------
    # Documentation chunks
    # -----------------------------------------------------------------
    # These mirror the CodeEntity methods above almost exactly. Docs get
    # their own label and their own vector index so that prose and code can
    # be retrieved in controlled proportions rather than competing in one
    # ranking - see schema.doc_vector_index_query for why that matters.

    def get_import_map(self) -> dict[str, set[str]]:
        """
        {file path: the set of file paths it imports}.

        Used to disambiguate call targets. The parser reduces a call to a bare
        NAME, so `save` may match a dozen entities across the repo; but a file
        can only call what it can see, and what it can see is overwhelmingly
        what it imports. Narrowing the candidates to imported files turns most
        "ambiguous, create no edge" verdicts into correct links.
        """
        with self._session() as session:
            result = session.run(
                """
                MATCH (a:File {projectId: $project})-[:IMPORTS]->(b:File {projectId: $project})
                RETURN a.path AS source, collect(b.path) AS targets
                """
            )
            return {record["source"]: set(record["targets"]) for record in result}

    def get_doc_hashes(self, file_path: str) -> dict[str, str]:
        """{doc chunk id: block hash} for one file - the Merkle check for docs."""
        with self._session() as session:
            result = session.run(
                """
                MATCH (d:Doc {projectId: $project, filePath: $filePath})
                RETURN d.id AS id, d.contentHash AS hash
                """,
                filePath=file_path,
            )
            return {record["id"]: record["hash"] for record in result}

    def get_doc_ids_with_embeddings(self, file_path: str) -> set[str]:
        """Which doc chunks in this file already have a vector stored."""
        with self._session() as session:
            result = session.run(
                """
                MATCH (d:Doc {projectId: $project, filePath: $filePath})
                WHERE d.embedding IS NOT NULL
                RETURN d.id AS id
                """,
                filePath=file_path,
            )
            return {record["id"] for record in result}

    def save_docs(self, chunks: list[DocChunk]) -> None:
        """Create or update Doc nodes and link each to its file."""
        if not chunks:
            return

        rows = []
        for chunk in chunks:
            properties = schema.doc_to_properties(chunk)
            properties.pop("embedding")  # set separately, like entities
            rows.append(properties)

        with self._session() as session:
            for batch in _chunked(rows, 200):
                session.run(
                    """
                    UNWIND $rows AS row
                    MERGE (d:Doc {projectId: $project, id: row.id})
                    SET d.filePath    = row.filePath,
                        d.docType     = row.docType,
                        d.title       = row.title,
                        d.headingPath = row.headingPath,
                        d.level       = row.level,
                        d.startLine   = row.startLine,
                        d.endLine     = row.endLine,
                        d.text        = row.text,
                        d.contentHash = row.contentHash
                    WITH d, row
                    MATCH (f:File {projectId: $project, path: row.filePath})
                    MERGE (f)-[:CONTAINS]->(d)
                    """,
                    rows=batch,
                )

    def save_doc_embeddings(self, id_to_vector: dict[str, list[float]]) -> None:
        """Attach embedding vectors to Doc nodes that already exist."""
        if not id_to_vector:
            return

        rows = [{"id": key, "embedding": value} for key, value in id_to_vector.items()]

        with self._session() as session:
            for batch in _chunked(rows, 100):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (d:Doc {projectId: $project, id: row.id})
                    SET d.embedding = row.embedding
                    """,
                    rows=batch,
                )

    def delete_docs(self, doc_ids: list[str]) -> None:
        """Remove doc chunks - used when a section is deleted from a file."""
        if not doc_ids:
            return

        with self._session() as session:
            session.run(
                """
                UNWIND $ids AS id
                MATCH (d:Doc {projectId: $project, id: id})
                DETACH DELETE d
                """,
                ids=doc_ids,
            )

    def clear_doc_outgoing_edges(self, file_path: str) -> None:
        """
        Drop the edges starting at this file's doc chunks, before rewriting.

        Same reasoning as clear_outgoing_edges for code: if a README stops
        mentioning `save_entities`, the MENTIONS edge has to go away too, and
        only a delete-then-recreate guarantees that.
        """
        with self._session() as session:
            session.run(
                """
                MATCH (d:Doc {projectId: $project, filePath: $path})-[r:CONTAINS|MENTIONS]->()
                DELETE r
                """,
                path=file_path,
            )

    def save_doc_relationships(self, relationships: list[Relationship]) -> None:
        """
        Create Doc -> Doc (CONTAINS) and Doc -> CodeEntity (MENTIONS) edges.

        The target label differs by edge type, so the two are handled
        separately rather than with one clever query.
        """
        if not relationships:
            return

        contains = [
            {"source": r.source_id, "target": r.target_id}
            for r in relationships
            if r.kind == "CONTAINS"
        ]
        mentions = [
            {"source": r.source_id, "target": r.target_id}
            for r in relationships
            if r.kind == "MENTIONS"
        ]

        with self._session() as session:
            for batch in _chunked(contains, 500):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (a:Doc {projectId: $project, id: row.source})
                    MATCH (b:Doc {projectId: $project, id: row.target})
                    MERGE (a)-[:CONTAINS]->(b)
                    """,
                    rows=batch,
                )
            for batch in _chunked(mentions, 500):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (a:Doc {projectId: $project, id: row.source})
                    MATCH (b:CodeEntity {projectId: $project, id: row.target})
                    MERGE (a)-[:MENTIONS]->(b)
                    """,
                    rows=batch,
                )

    # -----------------------------------------------------------------
    # Retrieval (used by the "ask" command)
    # -----------------------------------------------------------------

    def vector_search(
        self, query_embedding: list[float], top_k: int
    ) -> list[tuple[CodeEntity, float]]:
        """
        Find the `top_k` code entities most similar to the question.

        `db.index.vector.queryNodes` is Neo4j's built-in nearest-neighbour
        search. It returns each node plus a similarity `score` between 0 and
        1, where 1 means identical direction in vector space.

        This is the FUZZY half of the system. It is good at "find something
        that means roughly this" and bad at precision - which is exactly why
        we follow it with exact graph traversal.
        """
        with self._session() as session:
            result = session.run(
                f"""
                CYPHER 25
                MATCH (e:CodeEntity)
                  SEARCH e IN (
                    VECTOR INDEX {config.VECTOR_INDEX_NAME}
                    FOR $embedding
                    WHERE e.projectId = $project
                    LIMIT $topK
                  ) SCORE AS score
                RETURN {schema.ENTITY_RETURN_FIELDS}, score
                """,
                topK=top_k,
                embedding=query_embedding,
            )
            return [(schema.record_to_entity(record), record["score"]) for record in result]

    def fulltext_search(self, question: str, top_k: int) -> list[tuple[CodeEntity, float]]:
        """
        Find code entities whose TEXT matches the question's words.

        The keyword half of hybrid retrieval. See schema.FULLTEXT_INDEXES for
        why this exists alongside the vector search: an embedding cannot
        reliably find `MAX_CART_ITEMS` when you ask for `MAX_CART_ITEMS`,
        because it is matching meaning rather than tokens.
        """
        query = self._project_lucene(_lucene_query(question))
        if not query:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                CALL db.index.fulltext.queryNodes($indexName, $searchQuery, {{limit: $topK}})
                YIELD node AS e, score
                WHERE e:CodeEntity AND e.projectId = $project
                RETURN {schema.ENTITY_RETURN_FIELDS}, score
                """,
                indexName=schema.CODE_FULLTEXT_INDEX,
                searchQuery=query,
                topK=top_k,
            )
            return [(schema.record_to_entity(record), record["score"]) for record in result]

    def doc_fulltext_search(self, question: str, top_k: int) -> list[tuple[DocChunk, float]]:
        """The document twin of fulltext_search."""
        query = self._project_lucene(_lucene_query(question))
        if not query:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                CALL db.index.fulltext.queryNodes($indexName, $searchQuery, {{limit: $topK}})
                YIELD node AS d, score
                WHERE d:Doc AND d.projectId = $project
                RETURN {schema.DOC_RETURN_FIELDS}, score
                """,
                indexName=schema.DOC_FULLTEXT_INDEX,
                searchQuery=query,
                topK=top_k,
            )
            return [(schema.record_to_doc(record), record["score"]) for record in result]

    def expand_neighbours(
        self,
        seed_ids: list[str],
        hops: int,
        limit: int,
        query_embedding: list[float] | None = None,
    ) -> list[dict]:
        """
        Walk outwards from the seeds and collect everything connected.

        This is the EXACT half of the system, and the reason this project is
        graph RAG. Vector search found a function that looks relevant; this
        adds the function's callers, the functions it calls, and the class it
        belongs to - the context a human would naturally go and look up.

        Returns a list of dicts: entity, hop, reason, relevance, relType.

        `hops` is capped at 2 on purpose. At 3+ the number of reachable nodes
        explodes and the context fills with code unrelated to the question.

        TWO THINGS THIS DOES BEYOND WALKING
        -----------------------------------
        1. IT SCORES NEIGHBOURS AGAINST THE QUESTION.

           Neighbours used to come back ordered by hop alone. Hop is a graph
           DISTANCE, not a relevance measure, so the context budget was being
           allocated by topology: a seed's twenty siblings all sit at hop 1
           beside the one function that actually answers the question, and
           whichever the database happened to return first won. Scoring them
           costs nothing extra - the embeddings are already stored here and
           the question vector was already computed for the seed search - so
           we compare them in the database and hand back a real number.

        2. IT CAPS HOW MUCH ONE `<module>` SEED CAN DRAG IN.

           A module node CONTAINS every top-level definition in its file.
           That is co-location, not a semantic relationship, so expanding it
           without a limit hands back the whole file as "neighbours".
           Measured on the demo repository, 9 of 19 retrieved blocks arrived
           this way and crowded out genuinely related code. The cap keeps the
           best few - best by relevance, now that we have it - and drops the
           rest.
        """
        if not seed_ids:
            return []

        # Clamp to 1 or 2. This value is pasted into the query (Cypher will
        # not take a variable-length range as a parameter), so it must be a
        # plain integer we control - never anything typed by a user.
        hops = max(1, min(int(hops), 2))

        with self._session() as session:
            result = session.run(
                f"""
                UNWIND $seedIds AS seedId
                MATCH (seed:CodeEntity {{projectId: $project, id: seedId}})
                // `*1..{hops}` means "follow between 1 and {hops} relationships".
                // No arrow direction, so we walk edges BOTH ways: we want the
                // callers of a function as much as the things it calls.
                MATCH path = (seed)-[:CALLS|CONTAINS|EXTENDS|USES_TYPE*1..{hops}]-(e:CodeEntity {{projectId: $project}})
                WHERE NOT e.id IN $seedIds
                  // Constrain the nodes we travel THROUGH, not just the ends.
                  //
                  // (:File)-[:CONTAINS]->(:CodeEntity) is a real edge, so a
                  // two-hop path could otherwise run seed -> its File -> every
                  // other entity in that file, and hand back the whole file as
                  // "neighbours" of one function. Measured on a small graph,
                  // 11 of 26 nodes reached at two hops arrived that way; on a
                  // large file it fills the entire context budget with code
                  // that has no relationship to the question at all.
                  AND all(n IN nodes(path)[1..-1] WHERE n:CodeEntity)
                WITH e, seed, seedId,
                     length(path)          AS hop,
                     relationships(path)[0] AS firstRel
                WITH e, seedId, hop,
                     type(firstRel)                     AS relType,
                     (startNode(firstRel).id = seedId)  AS outgoing,
                     seed.kind                          AS seedKind,
                     // How much the edge that reached this neighbour is
                     // trusted. Edges written before confidence existed have
                     // no property, and default to 1.0 so an older graph
                     // ranks exactly as it did.
                     coalesce(firstRel.confidence, 1.0)  AS confidence
                // Sort by hop so that, when the same node is reachable by
                // several paths, the first one we keep is the shortest.
                ORDER BY hop
                WITH e, collect({{seedId: seedId, hop: hop, relType: relType,
                                  outgoing: outgoing, seedKind: seedKind,
                                  confidence: confidence}})[0] AS best

                // How close is this neighbour to the QUESTION? Null-safe: a
                // node with no embedding yet, or a call with no question
                // vector, simply scores zero rather than failing.
                WITH e, best,
                     CASE
                       WHEN $queryEmbedding IS NULL OR e.embedding IS NULL THEN 0.0
                       ELSE vector.similarity.cosine(e.embedding, $queryEmbedding)
                     END AS relevance

                // Group each seed's children so a single `<module>` cannot
                // contribute its entire file.
                ORDER BY relevance DESC
                WITH best.seedId AS groupSeed, best.relType AS groupRel,
                     best.seedKind AS groupKind,
                     collect({{node: e, best: best, relevance: relevance}}) AS members
                WITH CASE
                       WHEN groupKind = 'module' AND groupRel = 'CONTAINS'
                       THEN members[0..$moduleCap]
                       ELSE members
                     END AS kept
                UNWIND kept AS row
                WITH row.node AS e, row.best AS best, row.relevance AS relevance

                RETURN {schema.ENTITY_RETURN_FIELDS},
                       best.hop      AS hop,
                       best.relType  AS relType,
                       best.outgoing AS outgoing,
                       best.seedId   AS seedId,
                       best.confidence AS confidence,
                       relevance     AS relevance
                ORDER BY hop, relevance DESC
                LIMIT $limit
                """,
                seedIds=seed_ids,
                limit=limit,
                queryEmbedding=query_embedding,
                moduleCap=config.MAX_MODULE_EXPANSION,
            )

            neighbours: list[dict] = []
            for record in result:
                neighbours.append(
                    {
                        "entity": schema.record_to_entity(record),
                        "hop": record["hop"],
                        "confidence": record["confidence"],
                        "reason": _describe_connection(
                            record["relType"], record["outgoing"], record["seedId"]
                        ),
                        "relevance": record["relevance"] or 0.0,
                        "rel_type": record["relType"],
                    }
                )
            return neighbours

    def doc_vector_search(
        self, query_embedding: list[float], top_k: int
    ) -> list[tuple[DocChunk, float]]:
        """
        Find the `top_k` documentation sections most similar to the question.

        A completely separate search from vector_search, against the separate
        doc index. Running both and merging the results is what lets a single
        question return "here is the code, AND here is the README section
        that explains it".
        """
        with self._session() as session:
            result = session.run(
                f"""
                CYPHER 25
                MATCH (d:Doc)
                  SEARCH d IN (
                    VECTOR INDEX {config.DOC_VECTOR_INDEX_NAME}
                    FOR $embedding
                    WHERE d.projectId = $project
                    LIMIT $topK
                  ) SCORE AS score
                RETURN {schema.DOC_RETURN_FIELDS}, score
                """,
                topK=top_k,
                embedding=query_embedding,
            )
            return [(schema.record_to_doc(record), record["score"]) for record in result]

    def docs_mentioning(self, entity_ids: list[str], limit: int) -> list[tuple[DocChunk, str]]:
        """
        Find the documentation that talks about these code entities.

        This is the code -> docs direction of the MENTIONS edge: you asked a
        question, vector search found a function, and this pulls in the
        README section that documents it. Plain RAG cannot do this - it would
        only find the docs if the docs happened to match the question text.
        """
        if not entity_ids:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                MATCH (d:Doc {{projectId: $project}})-[:MENTIONS]->(e:CodeEntity {{projectId: $project}})
                WHERE e.id IN $entityIds
                WITH d, collect(DISTINCT e.name)[0..3] AS names
                RETURN {schema.DOC_RETURN_FIELDS}, names
                LIMIT $limit
                """,
                entityIds=entity_ids,
                limit=limit,
            )
            return [
                (schema.record_to_doc(record), "documents " + ", ".join(record["names"]))
                for record in result
            ]

    def entities_mentioned_by(self, doc_ids: list[str], limit: int) -> list[tuple[CodeEntity, str]]:
        """
        Find the code that these documentation sections talk about.

        The docs -> code direction. If the question matched a README section,
        this hands back the actual implementation it refers to, so the answer
        can quote real code instead of only repeating the documentation.
        """
        if not doc_ids:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                MATCH (d:Doc {{projectId: $project}})-[:MENTIONS]->(e:CodeEntity {{projectId: $project}})
                WHERE d.id IN $docIds
                WITH e, collect(DISTINCT d.title)[0] AS docTitle
                RETURN {schema.ENTITY_RETURN_FIELDS}, docTitle
                LIMIT $limit
                """,
                docIds=doc_ids,
                limit=limit,
            )
            return [
                (schema.record_to_entity(record), f'mentioned in "{record["docTitle"]}"')
                for record in result
            ]

    # -----------------------------------------------------------------
    # Reporting
    # -----------------------------------------------------------------

    # -----------------------------------------------------------------
    # Folder summaries
    # -----------------------------------------------------------------

    def get_summary_hashes(self) -> dict[str, str]:
        """{folder path: the Merkle hash the stored summary was written from}."""
        with self._session() as session:
            result = session.run(
                "MATCH (s:Summary {projectId: $project}) RETURN s.path AS path, s.contentHash AS hash"
            )
            return {record["path"]: record["hash"] for record in result}

    def save_summaries(self, summaries: list) -> None:
        """Create or update Summary nodes and hang each off its Folder."""
        if not summaries:
            return

        rows = []
        for summary in summaries:
            properties = schema.summary_to_properties(summary)
            properties.pop("embedding")
            rows.append(properties)

        with self._session() as session:
            session.run(
                """
                UNWIND $rows AS row
                MERGE (s:Summary {projectId: $project, id: row.id})
                SET s.path        = row.path,
                    s.text        = row.text,
                    s.entityCount = row.entityCount,
                    s.contentHash = row.contentHash
                WITH s, row
                MATCH (f:Folder {projectId: $project, path: row.path})
                MERGE (f)-[:CONTAINS]->(s)
                """,
                rows=rows,
            )

    def save_summary_embeddings(self, id_to_vector: dict) -> None:
        """Attach vectors to Summary nodes."""
        if not id_to_vector:
            return

        rows = [{"id": key, "embedding": value} for key, value in id_to_vector.items()]
        with self._session() as session:
            for batch in _chunked(rows, 100):
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (s:Summary {projectId: $project, id: row.id})
                    CALL db.create.setNodeVectorProperty(s, 'embedding', row.embedding)
                    """,
                    rows=batch,
                )

    def delete_missing_summaries(self, existing_paths: list[str]) -> int:
        """Remove summaries for folders that are no longer in the repository."""
        with self._session() as session:
            result = session.run(
                """
                MATCH (s:Summary {projectId: $project})
                WHERE NOT s.path IN $paths
                DETACH DELETE s
                RETURN count(s) AS removed
                """,
                paths=existing_paths,
            )
            record = result.single()
            return record["removed"] if record else 0

    def summary_vector_search(self, query_embedding: list[float], top_k: int) -> list:
        """
        Find the folder summaries closest to the question.

        The half of retrieval that answers "what is all this?" rather than
        "where is X?". Searched separately from code and docs so that a broad
        question and a specific one do not compete for the same slots.
        """
        if top_k <= 0:
            return []

        with self._session() as session:
            result = session.run(
                f"""
                CYPHER 25
                MATCH (s:Summary)
                  SEARCH s IN (
                    VECTOR INDEX {config.SUMMARY_VECTOR_INDEX_NAME}
                    FOR $embedding
                    WHERE s.projectId = $project
                    LIMIT $topK
                  ) SCORE AS score
                RETURN {schema.SUMMARY_RETURN_FIELDS}, score
                """,
                topK=top_k,
                embedding=query_embedding,
            )
            return [(schema.record_to_summary(r), r["score"]) for r in result]

    def stats(self) -> dict[str, int]:
        """
        Counts for the summary printed at the end of an indexing run.

        Deliberately written as several small queries instead of one clever
        one: each line is obvious on its own, and none of them depend on a
        newer Neo4j syntax feature that your version might not have.
        """
        counts = {
            "folders": "MATCH (d:Folder {projectId: $project})     RETURN count(d) AS n",
            "files": "MATCH (f:File {projectId: $project})       RETURN count(f) AS n",
            "entities": "MATCH (e:CodeEntity {projectId: $project}) RETURN count(e) AS n",
            "embedded": "MATCH (e:CodeEntity {projectId: $project}) WHERE e.embedding IS NOT NULL RETURN count(e) AS n",
            "doc chunks": "MATCH (d:Doc {projectId: $project}) RETURN count(d) AS n",
            "docs embedded": "MATCH (d:Doc {projectId: $project}) WHERE d.embedding IS NOT NULL RETURN count(d) AS n",
            "CALLS edges": "MATCH (a {projectId: $project})-[r:CALLS]->() RETURN count(r) AS n",
            "CONTAINS edges": "MATCH (a {projectId: $project})-[r:CONTAINS]->() RETURN count(r) AS n",
            "EXTENDS edges": "MATCH (a {projectId: $project})-[r:EXTENDS]->() RETURN count(r) AS n",
            "USES_TYPE edges": "MATCH (a {projectId: $project})-[r:USES_TYPE]->() RETURN count(r) AS n",
            "IMPORTS edges": "MATCH (a {projectId: $project})-[r:IMPORTS]->() RETURN count(r) AS n",
            "MENTIONS edges": "MATCH (a {projectId: $project})-[r:MENTIONS]->() RETURN count(r) AS n",
            "interfaces": "MATCH (i:Interface {projectId: $project}) RETURN count(i) AS n",
            "folder summaries": "MATCH (s:Summary {projectId: $project}) RETURN count(s) AS n",
            "REFERENCES edges": "MATCH (a {projectId: $project})-[r:REFERENCES]->() RETURN count(r) AS n",
        }

        result: dict[str, int] = {}
        with self._session() as session:
            for label, query in counts.items():
                result[label] = session.run(query).single()["n"]
        return result

    def connectivity_stats(self) -> dict[str, int]:
        """
        Is this actually ONE graph, or several graphs in one database?

        WHY THIS EXISTS - the failure it is built to expose
        --------------------------------------------------
        Every other number in the run summary counts things that were
        CREATED, and every one of them can look healthy while the graph is
        broken in the way that matters most. Measured on a five-language demo
        repository: 74 entities, 21 CALLS edges, 100% edge precision, a clean
        summary, all tests passing - and the code graph in FIVE disconnected
        islands split exactly along language lines, with zero edges crossing
        a language boundary.

        Nothing reported that. The cross-language mechanism had silently
        produced one node and no useful edges, and the only symptom was that
        answers to "how do these services fit together?" were invented. A
        single line saying `components 5 | cross-language edges 0` would have
        made it obvious on the very first run, which is what this method is
        for.

        WHAT IS COUNTED AS A CONNECTION, AND WHY DOCS ARE COUNTED SEPARATELY
        -------------------------------------------------------------------
        Two entities are connected if a CALLS / CONTAINS / EXTENDS edge joins
        them, or if they both reference the same Interface token (a shared
        route, topic, table, env var or gRPC method) - that bridge is two
        hops through the Interface node, so it has to be walked explicitly.

        Documentation is deliberately NOT part of that count, and is reported
        as a second number instead. A MENTIONS edge from a hand-written
        architecture document will happily join every service in the
        repository, so folding docs into the main figure hides exactly the
        problem this exists to reveal: on that same demo repo the code graph
        was in five pieces, and one README pulled it into one. Seeing both
        numbers says whether the structure is real or whether prose is
        carrying it - and prose goes stale, which is the failure this whole
        system exists to prevent.
        """
        adjacency: dict[str, set[str]] = {}
        language_of: dict[str, str] = {}

        def link(a: str, b: str) -> None:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)

        with self._session() as session:
            # Every entity, so ones with no edges at all still get counted.
            for record in session.run(
                "MATCH (e:CodeEntity {projectId: $project}) RETURN e.id AS id, e.language AS language"
            ):
                adjacency.setdefault(record["id"], set())
                language_of[record["id"]] = record["language"] or "unknown"

            # Direct structural edges between two code entities. The endpoint
            # labels are checked because CONTAINS also runs File -> entity and
            # Folder -> Folder, which are not statements about code structure.
            direct_pairs = [
                (record["a"], record["b"])
                for record in session.run(
                    """
                    MATCH (a:CodeEntity {projectId: $project})-[:CALLS|CONTAINS|EXTENDS|USES_TYPE]->(b:CodeEntity {projectId: $project})
                    RETURN a.id AS a, b.id AS b
                    """
                )
            ]

            # The Interface bridge: a -> (:Interface) <- b.
            bridge_pairs = [
                (record["a"], record["b"])
                for record in session.run(
                    """
                    MATCH (a:CodeEntity {projectId: $project})-[:REFERENCES]->(:Interface {projectId: $project})<-[:REFERENCES]-(b:CodeEntity {projectId: $project})
                    WHERE a.id < b.id
                    RETURN DISTINCT a.id AS a, b.id AS b
                    """
                )
            ]

            # The same question again, but allowing documentation to join
            # things up. Kept apart for the reason in the docstring.
            doc_pairs = [
                (record["a"], record["b"])
                for record in session.run(
                    """
                    MATCH (a:CodeEntity {projectId: $project})<-[:MENTIONS]-(:Doc {projectId: $project})-[:MENTIONS]->(b:CodeEntity {projectId: $project})
                    WHERE a.id < b.id
                    RETURN DISTINCT a.id AS a, b.id AS b
                    """
                )
            ]

        for a, b in direct_pairs + bridge_pairs:
            link(a, b)

        # Compared by FAMILY, not by exact language.
        #
        # `.ts` and `.tsx` are two grammars and one module system, so an edge
        # between them is an ordinary same-project import - not the boundary
        # this number exists to measure. Counting them inflated the figure
        # with edges that were never in doubt, which is the worst thing a
        # diagnostic can do: report progress that has not happened.
        cross_language = 0
        language_pairs: set[tuple[str, str]] = set()
        for a, b in direct_pairs + bridge_pairs:
            first = language_family(language_of.get(a)) or "unknown"
            second = language_family(language_of.get(b)) or "unknown"
            if first != second:
                cross_language += 1
                language_pairs.add(tuple(sorted((first, second))))

        # Measured BEFORE documentation is folded in, so every figure below
        # describes the code structure alone.
        sizes = _component_sizes(adjacency)
        components = len(sizes)
        isolated = sum(1 for neighbours in adjacency.values() if not neighbours)

        # Now fold documentation in and ask the same question again.
        for a, b in doc_pairs:
            link(a, b)
        components_with_docs = len(_component_sizes(adjacency))

        return {
            "entities": len(adjacency),
            "languages": len({lang for lang in language_of.values()}),
            "components": components,
            "components_with_docs": components_with_docs,
            "largest_component": max(sizes, default=0),
            "isolated_entities": isolated,
            "cross_language_edges": cross_language,
            "language_pairs_linked": len(language_pairs),
        }


# Words that carry no signal in a code search and only dilute the ranking.
_STOP_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "do",
        "does",
        "did",
        "how",
        "what",
        "where",
        "when",
        "why",
        "which",
        "who",
        "whom",
        "this",
        "that",
        "these",
        "those",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "with",
        "from",
        "by",
        "and",
        "or",
        "not",
        "it",
        "its",
        "i",
        "we",
        "you",
        "can",
        "could",
        "should",
        "would",
        "will",
        "shall",
        "get",
        "show",
        "me",
        "my",
        "our",
        "please",
        "tell",
        "about",
    }
)

_WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _lucene_query(question: str) -> str:
    """
    Turn a plain English question into a safe Lucene query string.

    Two jobs:

    1. ESCAPING. The full-text index speaks Lucene, where characters like
       `:`, `~`, `(` and `"` are operators. Passing a raw question through
       would either throw a parse error or quietly mean something else. We
       only ever emit quoted, alphanumeric terms, so nothing can be
       misinterpreted.

    2. WEIGHTING. Identifier-shaped words - `snake_case`, `camelCase`,
       `ALL_CAPS` - are the strongest signal a code question carries, so they
       are boosted. Ordinary English filler is dropped entirely.
    """
    terms: list[str] = []
    seen: set[str] = set()

    for word in _WORD_RE.findall(question):
        lowered = word.lower()
        if len(word) < 2 or lowered in _STOP_WORDS or lowered in seen:
            continue
        seen.add(lowered)

        looks_like_identifier = (
            "_" in word
            or (word != word.lower() and word != word.upper())  # camelCase
            or (word.isupper() and len(word) > 2)  # ALL_CAPS
        )
        terms.append(f'"{word}"^3' if looks_like_identifier else f'"{word}"')

    return " OR ".join(terms)


def reciprocal_rank_fusion(
    rankings: list[list[str]],
    k: int | None = None,
    weights: list[float] | None = None,
) -> dict[str, float]:
    """
    Merge several ranked lists of ids into one score per id.

    Reciprocal Rank Fusion is the standard way to combine a vector search
    with a keyword search, and it is used here because the two produce
    scores that are NOT comparable: cosine similarity lives in 0..1 while a
    Lucene score is unbounded and depends on corpus statistics. Normalising
    them against each other would be guesswork.

    RRF sidesteps that entirely by throwing the scores away and keeping only
    the RANKS: an item scores 1/(k + rank) in each list it appears in, and
    the scores are added. So an item both searches rank highly beats one that
    only a single search liked, whatever the raw numbers said.

    `k` damps the difference between the top few positions so that rank 1
    does not overwhelm rank 3. The original paper's value of 60 was tuned for
    TREC runs a THOUSAND results deep; on the ~15-item lists fused here it
    flattens rank 1 and rank 15 to within 19% of each other, while merely
    appearing in both lists is worth about 100%. That is how a rank-1 hit
    gets outvoted by weaker agreement, so the default now comes from
    config.RRF_K, which is much smaller.

    `weights` scales each list's contribution, so a project whose questions
    usually name identifiers can lean on the keyword ranking without
    abandoning the vector one. Defaults to equal weight.
    """
    if weights is None:
        weights = [1.0] * len(rankings)
    if k is None:
        k = config.RRF_K

    scores: dict[str, float] = {}
    for ranking, weight in zip(rankings, weights):
        for position, identifier in enumerate(ranking):
            scores[identifier] = scores.get(identifier, 0.0) + weight / (k + position + 1)
    return scores


def _describe_connection(rel_type: str, outgoing: bool, seed_id: str) -> str:
    """
    Turn an edge into a short English phrase for the prompt.

    Telling the LLM "this function is CALLED BY the one you matched" rather
    than just dumping code helps it reason about direction - e.g. that a
    change here would affect the caller, not the other way round.
    """
    seed_name = seed_id.split("::")[-1]

    if rel_type == "CALLS":
        return f"calls {seed_name}" if not outgoing else f"called by {seed_name}"
    if rel_type == "CONTAINS":
        return f"defined inside {seed_name}" if outgoing else f"contains {seed_name}"
    if rel_type == "EXTENDS":
        return f"parent class of {seed_name}" if outgoing else f"extends {seed_name}"
    if rel_type == "USES_TYPE":
        # Direction matters more here than for any other edge. "the type
        # `Order` used by checkout" and "checkout, which works on this type"
        # send the model looking in opposite directions, and getting it
        # backwards is how an answer ends up describing the wrong end of a
        # dependency.
        return (
            f"the type used by {seed_name}"
            if outgoing
            else f"declares {seed_name} in its signature"
        )
    return f"connected to {seed_name}"
