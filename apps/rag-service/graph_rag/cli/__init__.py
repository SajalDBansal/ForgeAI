"""
cli/
====

The two commands a human actually types. THIS IS WHERE THE PROGRAM STARTS.

  index_command.py    graph-rag-index  -> build the graph and the embeddings
  ask_command.py      graph-rag-ask    -> look a question up (retrieval only)

Each file has one `main()` function, and pyproject.toml points a console
command at it. That is how typing `graph-rag-index` in a terminal ends up
running Python code.

These files do NOTHING except read command line arguments, call into
pipeline/ or retrieval/, and print the result. All the real
logic lives in those folders, which keeps it testable without pretending to
type commands.
"""

from .ask_command import main as ask_main
from .index_command import main as index_main

__all__ = ["ask_main", "index_main"]
