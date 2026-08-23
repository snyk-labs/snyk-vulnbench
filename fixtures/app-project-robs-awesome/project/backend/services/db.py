import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from ..models.report import Report
from ..settings import settings

# SQLAlchemy async engine requires non-standard driver DSN that don't work with other libraries.
# We use the standard but transform it for the async engine.
engine_mappings = {
    "sqlite": "sqlite+aiosqlite",
    "postgresql": "postgresql+asyncpg",
}

db_url = settings.database_url
for find, replace in engine_mappings.items():
    db_url = db_url.replace(find, replace)


engine = create_async_engine(db_url, future=True, echo=settings.debug)


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


async def get_session_depends() -> AsyncGenerator[AsyncSession, None]:
    async with get_session() as session:
        yield session


async def test_data(session: AsyncSession) -> None:
    """Populate the test database with initial data."""
    if os.environ.get("IS_DEV", "") == "":
        raise ValueError("This function should not be called in production. Enable IS_DEV to run it in development.")

    session.add_all(
        [
            Report(title="Quarterly Revenue Summary", content="Revenue increased 12% year over year."),
            Report(title="Infrastructure Incident Report", content="Postmortem for the March outage."),
            Report(title="Customer Onboarding Notes", content="Common questions from new customer calls."),
        ]
    )
    await session.commit()
