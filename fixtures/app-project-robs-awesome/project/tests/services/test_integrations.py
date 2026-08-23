from typing import ClassVar

from backend.services.integrations import fetch_preview


class _FakeResponse:
    status_code = 200
    headers: ClassVar[dict[str, str]] = {"content-type": "text/plain"}


def test_fetch_preview_returns_status_and_content_type(monkeypatch):
    monkeypatch.setattr("backend.services.integrations.requests.get", lambda url: _FakeResponse())
    result = fetch_preview("http://example.test")
    assert result == {"status": "200", "content_type": "text/plain"}
