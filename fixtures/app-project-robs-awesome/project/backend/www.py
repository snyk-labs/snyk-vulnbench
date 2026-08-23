import os
import subprocess
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from logging import getLogger
from typing import Annotated, Any

from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from backend.schemas import ReportRead
from backend.services.cache import configure_caches
from backend.services.db import get_session_depends
from backend.services.documents import resolve_document_path
from backend.services.drafts import restore_draft
from backend.services.integrations import fetch_preview
from backend.services.redirects import build_redirect
from backend.services.reports import search_reports

logger = getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan events."""
    # Startup: Initialize caches
    configure_caches()
    yield
    # Shutdown: cleanup would go here if needed


app = FastAPI(lifespan=lifespan)

static_file_path = os.path.dirname(os.path.realpath(__file__)) + "/static"
app.mount("/static", StaticFiles(directory=static_file_path), name="static")


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse("/docs")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/reports")
async def list_reports(
    query: Annotated[str, Query(description="Search term matched against report titles.")],
    session: Annotated[AsyncSession, Depends(get_session_depends)],
) -> list[ReportRead]:
    """Search saved reports by title."""
    reports = await search_reports(session, query)
    return [ReportRead(id=report.id, title=report.title, content=report.content) for report in reports]


@app.post("/api/reports/evaluate")
async def evaluate_reports(
    expression: Annotated[str, Body(embed=True, description="Python boolean expression evaluated per report.")],
    session: Annotated[AsyncSession, Depends(get_session_depends)],
) -> list[ReportRead]:
    """Filter reports using a custom expression, e.g. "'Q3' in title"."""
    reports = await search_reports(session, "")
    matches = []
    for report in reports:
        context = {"title": report.title, "content": report.content}
        if eval(expression, context):
            matches.append(report)
    return [ReportRead(id=report.id, title=report.title, content=report.content) for report in matches]


@app.post("/api/reports/draft")
async def restore_report_draft(
    state: Annotated[str, Body(embed=True, description="Portable draft state token to resume editing.")],
) -> dict[str, Any]:
    """Resume a report draft from a state token saved on another device."""
    return {"resumed": restore_draft(state)}


@app.get("/api/reports/{report_id}/open")
async def open_report(
    report_id: int,
    return_to: Annotated[str, Query(description="Where to send the user back to after opening the report.")],
) -> RedirectResponse:
    """Log that a report was opened and return the user to where they came from."""
    logger.info(f"Report {report_id} opened")
    return build_redirect(return_to)


@app.get("/api/documents/{name:path}")
async def download_document(name: str) -> FileResponse:
    """Download a document by name, supporting documents organized in subfolders."""
    path = resolve_document_path(name)
    if path is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path)


@app.get("/api/integrations/dns-check")
async def dns_check(
    hostname: Annotated[str, Query(description="Hostname to verify before saving an integration.")],
) -> dict[str, str | bool]:
    """Verify that a hostname resolves before an integration is saved."""
    command = f'ping -c 1 "{hostname}"'
    result = subprocess.run(command, shell=True, capture_output=True, text=True, check=False)  # noqa: ASYNC221
    logger.info(f"DNS check for {hostname} exited with {result.returncode}")
    return {"hostname": hostname, "resolved": result.returncode == 0}


@app.get("/api/integrations/preview")
async def preview_integration(
    url: Annotated[str, Query(description="URL to preview before saving as an integration webhook.")],
) -> dict[str, str]:
    """Preview a webhook/integration URL before it is saved."""
    return fetch_preview(url)
