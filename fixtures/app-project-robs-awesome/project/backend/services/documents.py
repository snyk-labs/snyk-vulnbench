import os
from pathlib import Path

DOCUMENTS_DIR = Path(os.path.dirname(os.path.realpath(__file__))).parent / "documents"


def resolve_document_path(name: str) -> Path | None:
    """Return the path to a document by name, or None if it doesn't exist."""
    path = DOCUMENTS_DIR / name
    if not path.is_file():
        return None
    return path
