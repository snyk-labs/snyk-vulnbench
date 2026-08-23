import pytest

from backend.services.reports import search_reports


@pytest.mark.asyncio
async def test_search_reports_matches_title(db_session):
    results = await search_reports(db_session, "Revenue")
    assert len(results) == 1
    assert results[0].title == "Quarterly Revenue Summary"


@pytest.mark.asyncio
async def test_search_reports_is_case_insensitive(db_session):
    results = await search_reports(db_session, "revenue")
    assert len(results) == 1


@pytest.mark.asyncio
async def test_search_reports_no_match_returns_empty(db_session):
    results = await search_reports(db_session, "does-not-exist")
    assert results == []


@pytest.mark.asyncio
async def test_search_reports_empty_query_matches_all(db_session):
    results = await search_reports(db_session, "")
    assert len(results) == 3
