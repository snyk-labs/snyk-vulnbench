from backend.services.documents import DOCUMENTS_DIR, resolve_document_path


def test_resolve_document_path_returns_existing_file():
    path = resolve_document_path("welcome.txt")
    assert path is not None
    assert path == DOCUMENTS_DIR / "welcome.txt"


def test_resolve_document_path_missing_file_returns_none():
    assert resolve_document_path("does-not-exist.txt") is None


def test_resolve_document_path_supports_subfolders():
    path = resolve_document_path("reports/monthly.txt")
    assert path is not None
    assert path == DOCUMENTS_DIR / "reports" / "monthly.txt"
