"""
storage/schema.py
=================

THE MAP OF THE DATABASE. Read this file to understand what the graph
actually looks like before reading any query.

NODE LABELS
-----------
  (:Folder     {path, hash})
        One directory. `hash` is its Merkle folder hash. The repository root
        is stored with path = "" (an empty string).

  (:File       {path, hash, language})
        One source file. `hash` is the sha256 of the whole file.

  (:CodeEntity {id, kind, name, filePath, language,
                startLine, endLine, code, docstring,
                contentHash, embedding,
                unresolvedCalls, unresolvedExtends, unresolvedTypes,
                externalCalls, externalTypes,
                callOwnerHints, callArityHints, paramCount, flexibleArity})
        One named thing in the source. `contentHash` is the block hash;
        `embedding` is the vector from OpenAI.

        `kind` is one of:
          "function"  a free function
          "method"    a function that lives inside a class
          "class"     a class, struct, interface, trait, enum, impl block
          "constant"  a module-level or class-level named value. These are
                      entities in their own right because otherwise
                      `MAX_RETRIES = 3` had no name anywhere in the graph,
                      so nothing could find it, cite it or link to it.
          "module"    whatever is left over at the top of a file once every
                      other entity has been taken out of it.

        `unresolvedCalls` / `unresolvedExtends` are the names this entity
        referred to that have no edge yet - almost always because the target
        had not been indexed at the time. They are RETRIED on every later
        run, which is what stops the call graph from decaying as files are
        added one at a time. See GraphStore.get_pending_references.

  (:Doc        {id, filePath, docType, title, headingPath, level,
                startLine, endLine, text, contentHash, embedding})
        One section of a non-code file - a README heading and its prose, or
        a whole config file. The documentation twin of CodeEntity.

RELATIONSHIPS
-------------
  (:Folder)-[:CONTAINS]->(:Folder)      directory nesting
  (:Folder)-[:CONTAINS]->(:File)        a file sits in a directory
  (:File)-[:CONTAINS]->(:CodeEntity)    a file defines a function/class
  (:CodeEntity)-[:CONTAINS]->(:CodeEntity)   a class contains a method
  (:CodeEntity)-[:CALLS]->(:CodeEntity)      the highest-value edge
  (:CodeEntity)-[:EXTENDS]->(:CodeEntity)    class inheritance, and
                                             `implements` - the same
                                             relationship for our purposes
  (:CodeEntity)-[:USES_TYPE]->(:CodeEntity)  source NAMES target as a
                                             parameter type, a return type,
                                             or the type of one of its
                                             fields.

        The structural dependency no call records. `checkout(order: Order)`
        depends on Order without ever calling it, so before this edge existed
        a type was only connected to the code using it when that code
        happened to construct one. Measured on the demo repository, the
        TypeScript `Order` and `Session` interfaces had degree 1 - their
        file's CONTAINS edge and nothing else.

        Stricter than CALLS about what it may point at: only a `class`. A
        call may legitimately target a class, since that is how most
        languages spell "construct one"; a type annotation may not target a
        function that happens to share the name.

  (:File)-[:IMPORTS]->(:File)                file-level imports

  (:Interface  {id, kind, value})
        ONE shared literal value: a route path, an environment-variable key.

  (:CodeEntity)-[:REFERENCES]->(:Interface)  this code mentions that value
  (:Doc)-[:REFERENCES]->(:Interface)         this config declares it

        THE ONLY EDGE IN THE GRAPH THAT CROSSES A LANGUAGE BOUNDARY.
        Call resolution deliberately refuses to link a Python `login` to a
        TypeScript `login`, because sharing a name proves nothing - which
        left a multi-language repository as several disconnected graphs.
        Two services that read and write the same route DO have a real
        relationship, and this is where it is recorded.

  (:File)-[:CONTAINS]->(:Doc)                a file holds its doc sections
  (:Doc)-[:CONTAINS]->(:Doc)                 a section holds a subsection
  (:Doc)-[:MENTIONS]->(:CodeEntity)          prose names a function in
                                             `backticks`. THIS is the edge
                                             that makes documentation part of
                                             the graph rather than a second,
                                             unrelated pile of text.

SEARCH INDEXES
--------------
There are FOUR, not two. Each label gets both kinds of search:

  code_embeddings / doc_embeddings   vector, for "find something that MEANS
                                     roughly this"
  code_fulltext   / doc_fulltext     keyword, for "find the thing literally
                                     CALLED this"

Retrieval runs both against each label and fuses the rankings. See
FULLTEXT_INDEXES below for why either one alone leaves obvious questions
unanswered.

WHY camelCase PROPERTY NAMES?
-----------------------------
Python code conventionally uses snake_case (`file_path`) and Neo4j
conventionally uses camelCase (`filePath`). We follow each community's
convention on its own side of the line, and translate in exactly one place:
the small helper functions at the bottom of this file. If you ever wonder
"why is it filePath here and file_path there" - this is why.

ONE GRAPH, MANY PROJECTS (ForgeAI work plan Q3)
-----------------------------------------------
Every node above also carries `projectId`, and every query names it. Paths
and ids are only unique WITHIN a project (two projects can both have
`app/page.tsx`), so the constraints below are on (projectId, id) and
(projectId, path), the lookup indexes lead with projectId, the vector indexes
filter on it inside the index, and the full-text indexes include it so a
Lucene query can require it. The one exception is the IndexMeta node: one
embedding model for the whole database, since vectors from two models are
not comparable.

WHY MERGE AND NEVER CREATE?
---------------------------
`CREATE` always makes a new node. Running the indexer twice would give you
two copies of everything. `MERGE` means "find the node with this id, or make
it if it does not exist" - so re-running the indexer updates in place. That
property is called *idempotency* and it is what makes the whole incremental
design safe to re-run at any time.
"""

from .. import config

# ---------------------------------------------------------------------------
# One-time setup: constraints and indexes
# ---------------------------------------------------------------------------

# A uniqueness constraint does two jobs at once:
#   1. It stops duplicate nodes from ever existing.
#   2. It automatically creates an index, which makes MERGE on that property
#      fast. Without it, every MERGE would scan every node - unusably slow
#      once the graph has a few thousand nodes.
#
# Each is on (projectId, ...): an id or path is unique within ONE project.
CONSTRAINTS = [
    (
        "CREATE CONSTRAINT code_entity_project_id IF NOT EXISTS "
        "FOR (e:CodeEntity) REQUIRE (e.projectId, e.id) IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT file_project_path IF NOT EXISTS "
        "FOR (f:File) REQUIRE (f.projectId, f.path) IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT folder_project_path IF NOT EXISTS "
        "FOR (d:Folder) REQUIRE (d.projectId, d.path) IS UNIQUE"
    ),
    (
        "CREATE CONSTRAINT doc_project_id IF NOT EXISTS "
        "FOR (d:Doc) REQUIRE (d.projectId, d.id) IS UNIQUE"
    ),
    # One node per shared literal value - a route path, an env-var key - per
    # project. Two projects that both use "/api/login" must NOT be joined.
    # This is the join point between languages; see parsing/interfaces.py.
    (
        "CREATE CONSTRAINT interface_project_id IF NOT EXISTS "
        "FOR (i:Interface) REQUIRE (i.projectId, i.id) IS UNIQUE"
    ),
    # One short description per folder - what makes broad, whole-repository
    # questions answerable at all. See pipeline/summarizer.py.
    (
        "CREATE CONSTRAINT summary_project_id IF NOT EXISTS "
        "FOR (s:Summary) REQUIRE (s.projectId, s.id) IS UNIQUE"
    ),
]

# Plain indexes for lookups we do a lot but that are not unique.
# projectId first in each, because every lookup is within one project.
INDEXES = [
    # Used when resolving a call by name across the whole project.
    (
        "CREATE INDEX code_entity_project_name IF NOT EXISTS "
        "FOR (e:CodeEntity) ON (e.projectId, e.name)"
    ),
    # Used when we delete or refresh everything belonging to one file.
    (
        "CREATE INDEX code_entity_project_file IF NOT EXISTS "
        "FOR (e:CodeEntity) ON (e.projectId, e.filePath)"
    ),
    "CREATE INDEX doc_project_file IF NOT EXISTS FOR (d:Doc) ON (d.projectId, d.filePath)",
    # Used to find Go methods and Rust impl blocks whose owning type has not
    # been linked to them yet - see GraphStore.get_unowned_members.
    (
        "CREATE INDEX code_entity_project_owner IF NOT EXISTS "
        "FOR (e:CodeEntity) ON (e.projectId, e.ownerName)"
    ),
]

# Everything the one-repository schema (before Q3) created under names the
# new schema does not reuse. `IF NOT EXISTS` only compares names, so these
# would otherwise stay - and an old single-property uniqueness constraint
# would make two projects' `app/page.tsx` collide. Dropped by ensure_schema.
LEGACY_DROPS = [
    *(
        f"DROP CONSTRAINT {name} IF EXISTS"
        for name in (
            "code_entity_id",
            "file_path",
            "folder_path",
            "doc_id",
            "interface_id",
            "summary_id",
        )
    ),
    *(
        f"DROP INDEX {name} IF EXISTS"
        for name in (
            "code_entity_name",
            "code_entity_file",
            "doc_file",
            "code_entity_owner",
            "code_fulltext",
            "doc_fulltext",
            "code_embeddings",
            "doc_embeddings",
            "summary_embeddings",
        )
    ),
]


# ---------------------------------------------------------------------------
# Full-text indexes: the KEYWORD half of retrieval
# ---------------------------------------------------------------------------
#
# WHY A SECOND KIND OF SEARCH AT ALL
# ----------------------------------
# An embedding is good at "find something that MEANS roughly this" and bad at
# "find the thing literally called this". Those are different questions, and a
# codebase gets asked the second one constantly:
#
#     "where is MAX_CART_ITEMS set?"
#     "what calls resolve_reference?"
#     "show me the AuthTokenExpiredError class"
#
# A vector search for an exact identifier competes on general similarity, so
# it happily returns five functions that are vaguely about carts and misses
# the one line that defines MAX_CART_ITEMS. A full-text index finds it
# instantly, because it is matching the token, not the meaning.
#
# Running BOTH and fusing the rankings (see GraphStore.hybrid_search) is
# strictly better than either alone: the vector search covers the questions
# worded in English, the keyword search covers the ones worded in code.
#
# `projectId` is indexed too, so a query can REQUIRE the project as a Lucene
# term (`+projectId:"x" +(...)`, see GraphStore._project_lucene) and stay
# inside one project in the index itself.
FULLTEXT_INDEXES = [
    (
        "CREATE FULLTEXT INDEX code_fulltext_by_project IF NOT EXISTS "
        "FOR (e:CodeEntity) ON EACH [e.name, e.code, e.docstring, e.projectId]"
    ),
    (
        "CREATE FULLTEXT INDEX doc_fulltext_by_project IF NOT EXISTS "
        "FOR (d:Doc) ON EACH [d.title, d.headingPath, d.text, d.projectId]"
    ),
]

CODE_FULLTEXT_INDEX = "code_fulltext_by_project"
DOC_FULLTEXT_INDEX = "doc_fulltext_by_project"


def vector_index_query() -> str:
    """
    The Cypher that creates the vector index.

    This is what makes Neo4j able to answer "which stored code is most
    similar to this question?" - the job a separate vector database like
    pgvector or Pinecone would otherwise do. Because Neo4j does it natively
    (5.11+), the graph structure and the embeddings live in ONE database.

    `vector.dimensions` must match the embedding model exactly, and cannot be
    changed later - you would have to drop the index and rebuild it.

    `WITH [e.projectId]` makes projectId a FILTER property of the index
    (Neo4j 2026.01+, Community included), so a search can say
    `SEARCH e IN (VECTOR INDEX ... WHERE e.projectId = $project ...)` and only
    ever look at one project's nodes - another project's near matches can
    never crowd it out of the top k.
    """
    return f"""
    CREATE VECTOR INDEX {config.VECTOR_INDEX_NAME} IF NOT EXISTS
    FOR (e:CodeEntity) ON e.embedding
    WITH [e.projectId]
    OPTIONS {{
        indexConfig: {{
            `vector.dimensions`: {config.EMBEDDING_DIM},
            `vector.similarity_function`: 'cosine'
        }}
    }}
    """


def doc_vector_index_query() -> str:
    """
    The vector index for DOCUMENT chunks.

    Deliberately a SECOND index rather than putting docs into the code one.
    With a single shared index, docs and code compete in one ranking, and a
    README paragraph titled "How login works" will outrank the actual login
    function for the query "how does login work". Two indexes let retrieval
    ask for both explicitly: N code blocks AND M doc sections.

    Same dimensions and similarity function as the code index, because both
    are produced by the same embedding model - that is what makes a question
    comparable to either.
    """
    return f"""
    CREATE VECTOR INDEX {config.DOC_VECTOR_INDEX_NAME} IF NOT EXISTS
    FOR (d:Doc) ON d.embedding
    WITH [d.projectId]
    OPTIONS {{
        indexConfig: {{
            `vector.dimensions`: {config.EMBEDDING_DIM},
            `vector.similarity_function`: 'cosine'
        }}
    }}
    """


def summary_vector_index_query() -> str:
    """
    The vector index for FOLDER SUMMARIES.

    A third index, for the same reason docs got a second one: summaries and
    code answer different SHAPES of question, and putting them in one ranking
    means the broad question and the specific question compete. Keeping them
    apart lets retrieval ask for a couple of overviews AND the precise code,
    rather than trading one against the other.
    """
    return f"""
    CREATE VECTOR INDEX {config.SUMMARY_VECTOR_INDEX_NAME} IF NOT EXISTS
    FOR (s:Summary) ON s.embedding
    WITH [s.projectId]
    OPTIONS {{
        indexConfig: {{
            `vector.dimensions`: {config.EMBEDDING_DIM},
            `vector.similarity_function`: 'cosine'
        }}
    }}
    """


SUMMARY_RETURN_FIELDS = """
    s.id          AS id,
    s.path        AS path,
    s.text        AS text,
    s.entityCount AS entityCount,
    s.contentHash AS contentHash
"""


def summary_to_properties(summary) -> dict:
    """Turn a FolderSummary into Neo4j properties."""
    return {
        "id": summary.id,
        "path": summary.path,
        "text": summary.text,
        "entityCount": summary.entity_count,
        "contentHash": summary.content_hash,
        "embedding": summary.embedding,
    }


def record_to_summary(record):
    """Turn a row from Neo4j back into a FolderSummary."""
    from ..models import FolderSummary

    return FolderSummary(
        id=record["id"],
        path=record["path"],
        text=record["text"],
        entity_count=record["entityCount"] or 0,
        content_hash=record["contentHash"] or "",
    )


# ---------------------------------------------------------------------------
# Translating between our Python models and Neo4j properties
# ---------------------------------------------------------------------------

# The list of properties we read back for a CodeEntity. We write it out once
# here so every query returns the same shape and `record_to_entity()` below
# always works. Note that `embedding` is deliberately NOT in this list:
# it is 1536 numbers per node and we never need to look at it in Python.
ENTITY_RETURN_FIELDS = """
    e.id          AS id,
    e.kind        AS kind,
    e.name        AS name,
    e.filePath    AS filePath,
    e.language    AS language,
    e.startLine   AS startLine,
    e.endLine     AS endLine,
    e.code        AS code,
    e.docstring   AS docstring,
    e.contentHash AS contentHash
"""


def entity_to_properties(entity) -> dict:
    """
    Turn a CodeEntity (snake_case Python) into a dict of Neo4j properties
    (camelCase), ready to be handed to a query as a parameter.
    """
    return {
        # The names this entity referred to that we could not turn into an
        # edge while parsing its own file. Stored on the node so that LATER
        # runs can retry them - see GraphStore.get_pending_references.
        "unresolvedCalls": sorted(set(entity.unresolved_calls)),
        "unresolvedExtends": sorted(set(entity.unresolved_extends)),
        # Types named in a signature or a field whose definition is
        # in another file. Retried like the two above.
        "unresolvedTypes": sorted(set(entity.unresolved_types)),
        # Names that are nowhere in the graph - library and third-party
        # calls. Held apart from the list above because they must NOT be
        # retried on every run; see GraphStore.get_external_references.
        "externalCalls": sorted(set(entity.external_calls)),
        "externalTypes": sorted(set(entity.external_types)),
        "isRecursive": entity.is_recursive,
        "ownerName": entity.owner_name,
        # "which type was the receiver of this call declared to be", as a
        # list of "name>Type" strings.
        #
        # Neo4j has no map property, so the dict is flattened. A ">" is the
        # separator because it cannot occur in an identifier in any language
        # in the registry, so splitting is unambiguous and needs no escaping.
        # Sorted so an unchanged entity produces an unchanged property and
        # does not look like a write when nothing moved.
        "callOwnerHints": sorted(
            f"{name}>{owner}" for name, owner in entity.call_owner_hints.items()
        ),
        # "and it was called with N arguments", same flattening.
        "callArityHints": sorted(
            f"{name}>{count}" for name, count in entity.call_arity_hints.items()
        ),
        # What a caller passes, and whether that number can be relied on.
        # See code_parser._arity for why the second value matters more.
        "paramCount": entity.param_count,
        "flexibleArity": entity.flexible_arity,
        "id": entity.id,
        "kind": entity.kind,
        "name": entity.name,
        "filePath": entity.file_path,
        "language": entity.language,
        "startLine": entity.start_line,
        "endLine": entity.end_line,
        "code": entity.code,
        "docstring": entity.docstring,
        "contentHash": entity.content_hash,
        "embedding": entity.embedding,
    }


def parse_hint_list(rows, cast=str) -> dict:
    """
    Turn a stored ["name>value", ...] list back into {name: value}.

    Neo4j has no map property, so the two hint maps on a CodeEntity are
    flattened to lists of "key>value" strings on the way in. This is the way
    out. A row that does not split cleanly is skipped rather than raised on:
    these are an optimisation for edge resolution, and one malformed entry
    written by an older version of the indexer must not stop a run.
    """
    parsed: dict = {}
    for row in rows or ():
        name, separator, value = str(row).partition(">")
        if not separator or not name:
            continue
        try:
            parsed[name] = cast(value)
        except (TypeError, ValueError):
            continue
    return parsed


def record_to_entity(record) -> "object":
    """
    The reverse: turn a row from Neo4j back into a CodeEntity.

    Imported here rather than at the top of the file to avoid a circular
    import (models does not import storage, and this keeps it that way).
    """
    from ..models import CodeEntity

    return CodeEntity(
        id=record["id"],
        kind=record["kind"],
        name=record["name"],
        file_path=record["filePath"],
        language=record["language"],
        start_line=record["startLine"],
        end_line=record["endLine"],
        code=record["code"],
        docstring=record["docstring"],
        content_hash=record["contentHash"] or "",
    )


DOC_RETURN_FIELDS = """
    d.id          AS id,
    d.filePath    AS filePath,
    d.docType     AS docType,
    d.title       AS title,
    d.headingPath AS headingPath,
    d.level       AS level,
    d.startLine   AS startLine,
    d.endLine     AS endLine,
    d.text        AS text,
    d.contentHash AS contentHash
"""


def doc_to_properties(chunk) -> dict:
    """Turn a DocChunk (snake_case) into Neo4j properties (camelCase)."""
    return {
        "id": chunk.id,
        "filePath": chunk.file_path,
        "docType": chunk.doc_type,
        "title": chunk.title,
        "headingPath": chunk.heading_path,
        "level": chunk.level,
        "startLine": chunk.start_line,
        "endLine": chunk.end_line,
        "text": chunk.text,
        "contentHash": chunk.content_hash,
        "embedding": chunk.embedding,
    }


def record_to_doc(record):
    """Turn a row from Neo4j back into a DocChunk."""
    from ..models import DocChunk

    return DocChunk(
        id=record["id"],
        file_path=record["filePath"],
        doc_type=record["docType"],
        title=record["title"],
        heading_path=record["headingPath"],
        level=record["level"],
        start_line=record["startLine"],
        end_line=record["endLine"],
        text=record["text"],
        content_hash=record["contentHash"] or "",
    )


# Edges that start at a Doc node.
#   CONTAINS - a section contains a subsection (Doc -> Doc)
#   MENTIONS - a doc names a function in `backticks` (Doc -> CodeEntity).
#              This is the edge that stops documentation from being just
#              plain RAG: it connects prose to the code it describes, so
#              retrieving one can pull in the other.
ALLOWED_DOC_RELATIONSHIPS = {"CONTAINS", "MENTIONS"}


def interface_id(kind: str, value: str) -> str:
    """The stable node id for one interface token, e.g. "route:/api/cart"."""
    from ..parsing.interfaces import interface_id as _build

    return _build(kind, value)


# The only relationship types we are willing to create between code entities.
#
# WHY A WHITELIST? Cypher does not let you pass a relationship type as a
# parameter - `-[:$type]->` is not valid. So the type has to be pasted into
# the query string, and pasting user data into a query is how injection bugs
# happen. Checking against this fixed set first makes that impossible.
ALLOWED_ENTITY_RELATIONSHIPS = {"CALLS", "CONTAINS", "EXTENDS", "USES_TYPE"}
