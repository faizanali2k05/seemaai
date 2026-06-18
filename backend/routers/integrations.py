"""Integration endpoints — Clio PMS OAuth2 flow, sync triggers, status."""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user
from services.clio import (
    get_clio_auth_url,
    connect_clio,
    disconnect_clio,
    run_clio_sync,
    get_firm_integration,
    get_sync_history,
    get_sync_stats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/clio/auth-url")
async def clio_auth_url(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate the Clio OAuth2 authorization URL.

    The frontend redirects the user's browser to this URL.
    After the user authorizes Seema, Clio redirects back to /clio/callback.
    """
    from config import get_settings
    settings = get_settings()
    if not settings.CLIO_CLIENT_ID:
        raise HTTPException(400, "Clio integration is not configured. Set CLIO_CLIENT_ID in environment.")

    # Use firm_id as state parameter (CSRF protection)
    state = f"{user.firm_id}:{uuid.uuid4().hex[:16]}"
    auth_url = get_clio_auth_url(state)
    return {"data": {"auth_url": auth_url}}


@router.get("/clio/callback")
async def clio_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(bypass_db),  # bypass: OAuth callback, firm_id is in `state` param not JWT
):
    """OAuth2 callback — Clio redirects here after the user authorizes.

    Exchanges the auth code for tokens, fetches the Clio user/firm info,
    and saves the integration record. Then redirects to the frontend settings page.
    """
    # Extract firm_id from state
    parts = state.split(":")
    if len(parts) < 1:
        raise HTTPException(400, "Invalid state parameter")
    firm_id = parts[0]

    try:
        integration = await connect_clio(db, firm_id, code)
        logger.info(f"Clio connected for firm {firm_id}: {integration.provider_firm_name}")
        # Redirect to frontend settings page with success indicator
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/settings?clio=connected", status_code=302)
    except Exception as e:
        logger.error(f"Clio OAuth callback failed: {e}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/settings?clio=error", status_code=302)


@router.get("/clio/status")
async def clio_status(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get the current Clio integration status for the authenticated firm.

    Returns connection state, provider info, last sync details, and aggregate stats.
    """
    integration = await get_firm_integration(db, user.firm_id)

    if not integration or integration.status != "connected":
        return {"data": {"connected": False}}

    # Get last sync and stats
    history = await get_sync_history(db, user.firm_id, limit=1)
    last_sync = None
    if history:
        ls = history[0]
        last_sync = {
            "sync_type": ls.sync_type,
            "status": ls.status,
            "records_synced": ls.records_synced or 0,
            "started_at": ls.started_at.isoformat() if ls.started_at else None,
            "completed_at": ls.completed_at.isoformat() if ls.completed_at else None,
            "duration_seconds": ls.duration_seconds or 0,
        }

    stats = await get_sync_stats(db, user.firm_id)

    return {
        "data": {
            "connected": True,
            "clio_firm_name": integration.provider_firm_name,
            "clio_user_name": integration.provider_user_name,
            "status": integration.status,
            "connected_at": integration.connected_at.isoformat() if integration.connected_at else None,
            "last_sync": last_sync,
            "sync_stats": stats,
        }
    }


@router.delete("/clio/disconnect")
async def clio_disconnect(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Disconnect from Clio — revoke tokens and clear integration."""
    await disconnect_clio(db, user.firm_id)
    logger.info(f"Clio disconnected for firm {user.firm_id}")
    return {"data": {"disconnected": True}}


@router.post("/clio/sync")
async def clio_sync(
    request: Request,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Trigger a Clio data sync.

    Body (optional):
        {"sync_type": "full"}  — full pulls everything (matters, contacts, staff,
        bank accounts, transactions, calendar, activities, bills). Individual
        types can also be requested for a targeted re-sync.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    valid_types = (
        "full", "matters", "contacts", "staff",
        "bank_accounts", "bank_transactions", "calendar",
        "activities", "bills", "financials",
    )
    sync_type = body.get("sync_type", "full")
    if sync_type not in valid_types:
        raise HTTPException(400, f"Invalid sync_type: {sync_type}")

    try:
        sync_log = await run_clio_sync(db, user.firm_id, sync_type)
        return {
            "data": {
                "success": True,
                "sync_id": sync_log.id,
                "sync_type": sync_log.sync_type,
                "status": sync_log.status,
                "records_synced": sync_log.records_synced or 0,
                "records_created": sync_log.records_created or 0,
                "records_updated": sync_log.records_updated or 0,
                "duration_seconds": sync_log.duration_seconds or 0,
            }
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Clio sync failed: {e}")
        return {
            "data": {
                "success": False,
                "error": str(e),
            }
        }


@router.get("/clio/activities")
async def clio_activities(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List synced Clio time/expense activities for the firm."""
    from sqlalchemy import select, desc
    from models.clio_data import ClioActivity

    rows = (await db.execute(
        select(ClioActivity)
        .where(ClioActivity.firm_id == user.firm_id)
        .order_by(desc(ClioActivity.date))
        .limit(500)
    )).scalars().all()
    return {
        "data": [
            {
                "id": a.id,
                "type": a.activity_type,
                "date": a.date.isoformat() if a.date else None,
                "quantity": float(a.quantity) if a.quantity is not None else None,
                "total": float(a.total) if a.total is not None else None,
                "note": a.note,
                "matter_ref": a.matter_ref,
                "user_name": a.user_name,
            }
            for a in rows
        ]
    }


@router.get("/clio/bills")
async def clio_bills(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List synced Clio bills/invoices for the firm."""
    from sqlalchemy import select, desc
    from models.clio_data import ClioBill

    rows = (await db.execute(
        select(ClioBill)
        .where(ClioBill.firm_id == user.firm_id)
        .order_by(desc(ClioBill.issued_at))
        .limit(500)
    )).scalars().all()
    return {
        "data": [
            {
                "id": b.id,
                "number": b.number,
                "state": b.state,
                "total": float(b.total) if b.total is not None else None,
                "balance": float(b.balance) if b.balance is not None else None,
                "issued_at": b.issued_at.isoformat() if b.issued_at else None,
                "due_at": b.due_at.isoformat() if b.due_at else None,
                "client_name": b.client_name,
            }
            for b in rows
        ]
    }


@router.get("/clio/sync-history")
async def clio_sync_history(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get recent sync history for the authenticated firm."""
    history = await get_sync_history(db, user.firm_id, limit=20)
    return {
        "data": [
            {
                "id": log.id,
                "sync_type": log.sync_type,
                "status": log.status,
                "records_synced": log.records_synced or 0,
                "records_created": log.records_created or 0,
                "records_updated": log.records_updated or 0,
                "started_at": log.started_at.isoformat() if log.started_at else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                "duration_seconds": log.duration_seconds or 0,
            }
            for log in history
        ]
    }
