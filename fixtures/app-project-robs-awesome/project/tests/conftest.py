import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import backend.services.db as db_service
from backend.models.base import Base
from backend.services.db import get_session_depends, test_data
from backend.www import app


@pytest_asyncio.fixture
async def db_session_maker(tmpdir, monkeypatch):
    """Creates a test database engine, complete with fake data."""
    test_database_url = f"sqlite+aiosqlite:///{tmpdir}/test_database.db"  # Use SQLite for testing; adjust as needed
    engine = create_async_engine(test_database_url, future=True, echo=False)
    # Point the module-level engine at the temp database too, so code paths that
    # call backend.services.db.get_session() directly (e.g. the CLI) hit the same schema.
    monkeypatch.setattr(db_service, "engine", engine)
    # test_data() refuses to run outside of a dev/test context.
    monkeypatch.setenv("IS_DEV", "1")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session_maker() as session:
        await test_data(session)

    yield async_session_maker

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_session_maker):
    async with db_session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def fastapi_client(db_session_maker):
    """Fixture to create a FastAPI test client."""
    client = TestClient(app)

    async def get_session_depends_override():
        async with db_session_maker() as session:
            yield session

    app.dependency_overrides[get_session_depends] = get_session_depends_override
    yield client
