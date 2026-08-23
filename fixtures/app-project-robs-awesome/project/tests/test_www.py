"""Tests for FastAPI web application."""

import base64
import pickle
from typing import ClassVar

from backend.www import app


def test_app_exists():
    """Test that the FastAPI app is properly instantiated."""
    assert app is not None
    assert hasattr(app, "router")


def test_static_files_mounted():
    """Test that static files are properly mounted."""
    routes = [route.path for route in app.routes]
    assert "/static" in routes or any("/static" in route for route in routes)


def test_root_redirects_to_docs(fastapi_client):
    """Test that root path redirects to /docs."""
    response = fastapi_client.get("/", follow_redirects=False)
    assert response.status_code == 307  # Temporary redirect
    assert response.headers["location"] == "/docs"


def test_root_redirect_follows(fastapi_client):
    """Test that following redirect from root goes to docs."""
    response = fastapi_client.get("/", follow_redirects=True)
    assert response.status_code == 200
    # Should reach the OpenAPI docs page


def test_docs_accessible(fastapi_client):
    """Test that /docs endpoint is accessible."""
    response = fastapi_client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


def test_openapi_schema(fastapi_client):
    """Test that OpenAPI schema is accessible."""
    response = fastapi_client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "openapi" in schema
    assert "info" in schema
    assert "paths" in schema


def test_static_route_exists():
    """Test that static route is configured."""
    routes = {route.path: route for route in app.routes}
    # Static files might be mounted at /static or have a prefix
    has_static = any("/static" in path for path in routes)
    assert has_static, "Static files route should be configured"


def test_lifespan_configured():
    """Test that lifespan context manager is configured."""
    # Check that the app has a lifespan handler
    assert app.router.lifespan_context is not None, "Should have lifespan context configured"


def test_app_can_start(fastapi_client):
    """Test that the app can start successfully."""
    # Making any request will trigger startup event
    response = fastapi_client.get("/docs")
    assert response.status_code == 200


def test_basic_health(fastapi_client):
    """Test basic application health by accessing root."""
    response = fastapi_client.get("/")
    assert response.status_code in [200, 307], "App should respond to requests"


def test_health_check(fastapi_client):
    """Test that the health endpoint returns ok."""
    response = fastapi_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_reports_matches_query(fastapi_client):
    """Test that the reports API returns reports matching the search term."""
    response = fastapi_client.get("/api/reports", params={"query": "Revenue"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Quarterly Revenue Summary"


def test_list_reports_requires_query_param(fastapi_client):
    """Test that the reports API requires the query parameter."""
    response = fastapi_client.get("/api/reports")
    assert response.status_code == 422


def test_evaluate_reports_matches_expression(fastapi_client):
    """Test that the evaluate API returns reports matching a custom filter expression."""
    response = fastapi_client.post("/api/reports/evaluate", json={"expression": "'Revenue' in title"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Quarterly Revenue Summary"


def test_evaluate_reports_no_match_returns_empty(fastapi_client):
    """Test that a non-matching expression returns no reports."""
    response = fastapi_client.post("/api/reports/evaluate", json={"expression": "'does-not-exist' in title"})
    assert response.status_code == 200
    assert response.json() == []


def test_evaluate_reports_requires_expression(fastapi_client):
    """Test that the evaluate API requires the expression field."""
    response = fastapi_client.post("/api/reports/evaluate", json={})
    assert response.status_code == 422


def test_restore_report_draft_resumes_saved_state(fastapi_client):
    """Test that a report draft saved as a state token can be resumed."""
    state = base64.b64encode(pickle.dumps({"title": "Draft", "content": "In progress"})).decode()
    response = fastapi_client.post("/api/reports/draft", json={"state": state})
    assert response.status_code == 200
    assert response.json() == {"resumed": {"title": "Draft", "content": "In progress"}}


def test_open_report_redirects_to_return_to(fastapi_client):
    """Test that opening a report redirects the user back to where they came from."""
    response = fastapi_client.get("/api/reports/1/open", params={"return_to": "/dashboard"}, follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/dashboard"


def test_dns_check_resolves_localhost(fastapi_client):
    """Test that the DNS check reports a resolvable hostname."""
    response = fastapi_client.get("/api/integrations/dns-check", params={"hostname": "localhost"})
    assert response.status_code == 200
    assert response.json() == {"hostname": "localhost", "resolved": True}


def test_preview_integration_returns_status_and_content_type(fastapi_client, monkeypatch):
    """Test that previewing an integration URL returns its status and content type."""

    class _FakeResponse:
        status_code = 200
        headers: ClassVar[dict[str, str]] = {"content-type": "text/plain"}

    monkeypatch.setattr("backend.services.integrations.requests.get", lambda url: _FakeResponse())
    response = fastapi_client.get("/api/integrations/preview", params={"url": "http://example.test"})
    assert response.status_code == 200
    assert response.json() == {"status": "200", "content_type": "text/plain"}


def test_download_document_returns_file(fastapi_client):
    """Test that a known document can be downloaded."""
    response = fastapi_client.get("/api/documents/welcome.txt")
    assert response.status_code == 200
    assert "Welcome" in response.text


def test_download_document_missing_returns_404(fastapi_client):
    """Test that requesting an unknown document returns 404."""
    response = fastapi_client.get("/api/documents/does-not-exist.txt")
    assert response.status_code == 404


def test_download_document_supports_subfolders(fastapi_client):
    """Test that documents organized in subfolders can be downloaded."""
    response = fastapi_client.get("/api/documents/reports/monthly.txt")
    assert response.status_code == 200
    assert "Monthly summary" in response.text
