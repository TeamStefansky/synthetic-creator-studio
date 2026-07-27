"""Pytest fixtures.

Testcontainers cannot pull images in this environment, so the suite points at a
running Postgres (the ``docker compose`` service, or an equivalent on the same host
and port) via the ``TEST_DATABASE_URL`` env var. A dedicated ``newsradar_test``
database is created and migrated with the real Alembic migration before each session.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Iterator

# Point the whole app at the throwaway test database *before* importing app modules.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://newsradar:newsradar@localhost:5433/newsradar_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("REDIS_URL", "redis://localhost:6380/0")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from newsradar.db.session import get_engine, get_sessionmaker  # noqa: E402

_DB_NAME = TEST_DATABASE_URL.rsplit("/", 1)[1]
_ADMIN_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"


async def _run_admin(sql: str) -> None:
    engine = create_async_engine(_ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            await conn.execute(text(sql))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[None]:
    """Create a fresh test database, run the migration, drop it on teardown."""

    asyncio.run(_run_admin(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)'))
    asyncio.run(_run_admin(f'CREATE DATABASE "{_DB_NAME}"'))

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")

    yield

    asyncio.run(_run_admin(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)'))


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine() -> AsyncIterator[None]:
    """Dispose and rebuild the cached engine per test so it binds to the test's loop."""

    yield
    await get_engine().dispose()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()


@pytest_asyncio.fixture
async def session(migrated_database: None) -> AsyncIterator[AsyncSession]:
    """Yield an async session bound to the migrated test database."""

    factory = get_sessionmaker()
    async with factory() as sess:
        yield sess
