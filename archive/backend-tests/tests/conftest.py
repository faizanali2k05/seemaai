"""
Shared test fixtures for Seema API integration tests.

Uses an in-memory SQLite database so tests never touch production data.
Overrides FastAPI dependencies to inject the test DB session and bypass
real external services (SendGrid, Stripe, Anthropic).
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Force test settings BEFORE importing the app
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-do-not-use-in-production-1234567890"
os.environ["APP_ENV"] = "test"
os.environ["CORS_ORIGINS"] = '["http://localhost:3000"]'
os.environ["ANTHROPIC_API_KEY"] = ""  # Disable AI — tests use fallbacks
os.environ["SENDGRID_API_KEY"] = ""
os.environ["STRIPE_SECRET_KEY"] = ""

from database import Base, get_db
from main import app


# ── Test database engine ──────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite://"  # In-memory

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    """Dependency override — yields a test database session."""
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Apply the override
app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client():
    """Async HTTP client that talks to the FastAPI app in-process."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db():
    """Raw database session for direct DB operations in tests."""
    async with TestSessionLocal() as session:
        yield session
        await session.commit()


# ── Helper: seed a test firm ──────────────────────────────────────

@pytest_asyncio.fixture
async def test_firm(db):
    """Create and return a test firm."""
    from models.firm import Firm
    firm = Firm(
        id=str(uuid.uuid4()),
        name="Test Law Firm LLP",
        sra_number="123456",
        firm_type="llp",
        size="small",
        practice_areas="conveyancing,litigation",
        subscription_tier="professional",
        subscription_status="active",
    )
    db.add(firm)
    await db.flush()
    return firm


# ── Helper: seed a test user and get auth token ──────────────────

@pytest_asyncio.fixture
async def test_user(db, test_firm):
    """Create a test user (COLP role) and return user + firm."""
    from models.auth import User
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        id=str(uuid.uuid4()),
        firm_id=test_firm.id,
        email="colp@testfirm.co.uk",
        hashed_password=pwd_context.hash("TestPassword123!"),
        full_name="Test COLP",
        role="colp",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return {"user": user, "firm": test_firm, "password": "TestPassword123!"}


@pytest_asyncio.fixture
async def auth_headers(client, test_user):
    """Log in the test user and return Authorization headers."""
    response = await client.post("/api/auth/login", json={
        "email": test_user["user"].email,
        "password": test_user["password"],
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Helper: seed a second firm for multi-tenancy tests ───────────

@pytest_asyncio.fixture
async def second_firm(db):
    """Create a second firm for isolation tests."""
    from models.firm import Firm
    firm = Firm(
        id=str(uuid.uuid4()),
        name="Other Law Firm Ltd",
        sra_number="654321",
        firm_type="limited",
        size="medium",
        practice_areas="family,criminal",
        subscription_tier="starter",
        subscription_status="active",
    )
    db.add(firm)
    await db.flush()
    return firm


@pytest_asyncio.fixture
async def second_user(db, second_firm):
    """Create a user in the second firm."""
    from models.auth import User
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        id=str(uuid.uuid4()),
        firm_id=second_firm.id,
        email="colp@otherfirm.co.uk",
        hashed_password=pwd_context.hash("OtherPassword456!"),
        full_name="Other COLP",
        role="colp",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return {"user": user, "firm": second_firm, "password": "OtherPassword456!"}


@pytest_asyncio.fixture
async def second_auth_headers(client, second_user):
    """Auth headers for the second firm's user."""
    response = await client.post("/api/auth/login", json={
        "email": second_user["user"].email,
        "password": second_user["password"],
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
