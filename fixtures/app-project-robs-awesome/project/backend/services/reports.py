from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.report import Report


async def search_reports(session: AsyncSession, query: str) -> list[Report]:
    """Find reports whose title contains the given search term."""
    result = await session.execute(text(f"SELECT id, title, content FROM reports WHERE title LIKE '%{query}%'"))
    return [Report(id=row.id, title=row.title, content=row.content) for row in result.all()]
