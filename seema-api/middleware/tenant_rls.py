"""
Row-Level Security (RLS) tenant context for FastAPI / SQLAlchemy.

Mirrors the behaviour of seema-node/src/lib/tenantContext.ts:

    * `set_current_firm(session, firm_id)` runs `SELECT set_config(...)` on
      the session's current connection so every subsequent query in the same
      transaction is scoped by `app.current_firm_id`.
    * `tenant_db(firm_id)` is the FastAPI dependency to use in route handlers
      that operate on tenant-scoped data.
    * `bypass_db()` is the FastAPI dependency to use when the request runs
      outside any tenant scope (e.g. ingesting a regulatory feed for all
      firms). It connects via a separate engine using ADMIN_DATABASE_URL
      (seema_admin role with BYPASSRLS).

Usage in a router:

    from fastapi import Depends
    from middleware.tenant_rls import tenant_db

    @router.post("/regulatory/interpret")
    async def interpret(payload: ..., db: AsyncSession = Depends(tenant_db_from_jwt)):
        ...
"""

from __future__ import annotations

import os
import re
from typing import AsyncIterator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from database import async_session, engine  # noqa: F401  (re-exported by database.py)
from config import get_settings

_settings = get_settings()

# Validate firm_id format before inlining into SQL. firm_id is VARCHAR(36)
# storing UUID strings.
_FIRM_ID_RE = re.compile(r"^[0-9a-fA-F-]{32,40}$")


def _safe_firm_id(firm_id: str) -> str:
    if not firm_id or not _FIRM_ID_RE.match(firm_id):
        raise ValueError(f"Refusing to use suspicious firm_id in SQL: {firm_id!r}")
    return firm_id


async def set_current_firm(session: AsyncSession, firm_id: str) -> None:
    """
    Set the per-transaction GUC `app.current_firm_id` on the given session's
    connection. Must be called BEFORE any tenant-scoped query in the
    transaction. The value is automatically discarded at COMMIT/ROLLBACK
    because we use set_config(..., is_local=true).
    """
    safe = _safe_firm_id(firm_id)
    await session.execute(
        text("SELECT set_config('app.current_firm_id', :firm_id, true)"),
        {"firm_id": safe},
    )


# ---------------------------------------------------------------------------
# Admin engine for RLS bypass operations (regulatory feed ingestion, etc.)
# ---------------------------------------------------------------------------
_admin_db_url = os.getenv("ADMIN_DATABASE_URL", "").strip()
if _admin_db_url:
    admin_engine = create_async_engine(
        _admin_db_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
    admin_session = async_sessionmaker(
        admin_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
else:
    admin_engine = None
    admin_session = None  # type: ignore


async def tenant_db(firm_id: str) -> AsyncIterator[AsyncSession]:
    """
    Yield a session with `app.current_firm_id` set to firm_id for the duration
    of the request's transaction. Use as a FastAPI dependency factory:

        async def route(
            payload: Schema,
            db: AsyncSession = Depends(lambda req: tenant_db(req.state.firm_id)),
        ): ...

    Or wrap with a per-request dependency that reads the firm from the
    authenticated JWT (see tenant_db_from_jwt below).
    """
    async with async_session() as session:
        try:
            await set_current_firm(session, firm_id)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def bypass_db() -> AsyncIterator[AsyncSession]:
    """
    Yield a session connected as seema_admin (BYPASSRLS). Use ONLY for
    system-wide operations (regulatory_updates ingestion, sra_feed_log,
    cross-firm migrations).
    """
    if admin_session is None:
        raise RuntimeError(
            "ADMIN_DATABASE_URL is not configured — bypass_db requested but "
            "no admin engine available. Set ADMIN_DATABASE_URL in seema-api/.env "
            "to a connection string for the seema_admin role."
        )
    async with admin_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Convenience: extract firm_id from the JWT (via the existing auth dependency)
# and yield a tenant-scoped session. Routes only need this one dependency for
# any tenant-scoped query — FastAPI's dependency cache means get_current_user
# is called exactly once per request even if the route also lists it directly.
# ---------------------------------------------------------------------------
from fastapi import Depends, HTTPException, Request, status

from middleware.auth import get_current_user, CurrentUser


async def tenant_db_from_jwt(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> AsyncIterator[AsyncSession]:
    """Yield a tenant-scoped AsyncSession.

    Order of operations:
      1. FastAPI resolves get_current_user (raises 401 if no/invalid Bearer).
      2. Open a session against the RLS engine.
      3. SET LOCAL app.current_firm_id = <user.firm_id>.
      4. Yield the session to the route handler.
      5. COMMIT on success, ROLLBACK on exception (the GUC is `is_local=true`
         so it's discarded with the transaction either way).
    """
    if not user.firm_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant context unavailable — token missing firm_id",
        )
    # Mirror onto request.state so other code paths (logging, audit, etc.)
    # can read it without re-decoding the token.
    request.state.firm_id = user.firm_id
    request.state.user_id = user.user_id
    async for session in tenant_db(user.firm_id):
        yield session
