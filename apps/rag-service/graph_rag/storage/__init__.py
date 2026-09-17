"""
storage/
========

"Where does everything live?"

EVERY line of Cypher in this project is in this folder. Nothing outside
storage/ is allowed to talk to Neo4j directly. That rule is what lets you
change the database schema by editing two files instead of hunting queries
scattered across the codebase.

  schema.py       The shape of the graph: node labels, property names, the
                  constraints and the vector index. Read this first - it is
                  the map of what is in the database.

  graph_store.py  A class with one method per thing we need to do
                  (save a file, fetch the stored hashes, run a vector
                  search, walk the neighbours...).
"""

from .graph_store import GraphStore

__all__ = ["GraphStore"]
