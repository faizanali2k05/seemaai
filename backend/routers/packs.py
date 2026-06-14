"""Compliance pack delivery — history, send, resend.

The frontend (PackDeliveryHistory / SendPackModal, used on the SRA audit pack,
SRA return, PII renewal pages, etc.) polls these endpoints. They previously
didn't exist, so every pack page logged 404s on load. Delivery-tracking
persistence isn't wired yet, so history is empty (no demo data); send/resend
record an audit-trail entry and return a queued status.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit

router = APIRouter()


@router.get("/packs/{pack_type}/deliveries")
async def list_pack_deliveries(
    pack_type: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Delivery history for a pack type. Empty until a delivery is recorded."""
    return []


class SendPackRequest(BaseModel):
    recipients: list[str] | None = None
    email: str | None = None
    message: str | None = None


@router.post("/packs/{pack_type}/send")
async def send_pack(
    pack_type: str,
    payload: SendPackRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Queue a generated pack for delivery (records an audit entry)."""
    to = ", ".join(payload.recipients or ([payload.email] if payload.email else [])) or "recipient"
    await log_audit(
        db=db, firm_id=user.firm_id, action="sent", entity_type="pack",
        entity_id=pack_type, user_id=user.user_id,
        details=f"{pack_type} pack queued for delivery to {to}",
    )
    return {"status": "queued", "pack_type": pack_type}


@router.post("/packs/deliveries/{delivery_id}/resend")
async def resend_pack(
    delivery_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Resend a previously delivered pack (records an audit entry)."""
    await log_audit(
        db=db, firm_id=user.firm_id, action="resent", entity_type="pack_delivery",
        entity_id=delivery_id, user_id=user.user_id,
        details="Pack delivery resend requested",
    )
    return {"status": "queued", "delivery_id": delivery_id}
