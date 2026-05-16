"""Matters router — matter/case management and checklists."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.matters import Matter, MatterItem

router = APIRouter()

class CreateMatterRequest(BaseModel):
    client_name: str
    matter_type: str
    reference: str | None = None
    assigned_to: str | None = None
    risk_level: str = "medium"
    fee_estimate: float | None = None

class UpdateMatterRequest(BaseModel):
    client_name: str | None = None
    matter_type: str | None = None
    status: str | None = None
    assigned_to: str | None = None
    risk_level: str | None = None
    fee_estimate: float | None = None

@router.get("/compliance/matters")
async def get_matters(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List matters."""
    result = await db.execute(
        select(Matter).where(
            Matter.firm_id == user.firm_id
        ).order_by(Matter.created_at.desc())
    )
    matters = result.scalars().all()

    return [
        {
            "id": m.id,
            "client_name": m.client_name,
            "matter_type": m.matter_type,
            "reference": m.reference,
            "status": m.status,
            "assigned_to": m.assigned_to,
            "risk_level": m.risk_level,
            "fee_estimate": float(m.fee_estimate) if m.fee_estimate else None,
            "created_at": str(m.created_at),
            "updated_at": str(m.updated_at),
        }
        for m in matters
    ]

@router.post("/compliance/matters")
async def create_matter(
    req: CreateMatterRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create matter."""
    matter = Matter(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        client_name=req.client_name,
        matter_type=req.matter_type,
        reference=req.reference,
        assigned_to=req.assigned_to,
        risk_level=req.risk_level,
        fee_estimate=req.fee_estimate,
        status="open",
    )
    db.add(matter)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="matter",
        entity_id=matter.id,
        user_id=user.user_id,
        details=f"Matter created: {req.client_name} - {req.matter_type}",
    )

    return {
        "id": matter.id,
        "client_name": matter.client_name,
        "matter_type": matter.matter_type,
        "status": matter.status,
        "created_at": str(matter.created_at),
    }

@router.post("/compliance/matter-items/{item_id}/complete")
async def toggle_matter_item_complete(
    item_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Toggle matter item completion status."""
    result = await db.execute(
        select(MatterItem).where(
            MatterItem.id == item_id,
            MatterItem.firm_id == user.firm_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Matter item not found")

    # Toggle complete status
    item.is_complete = not item.is_complete
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="toggled",
        entity_type="matter_item",
        entity_id=item_id,
        user_id=user.user_id,
        details=f"Matter item toggled: {item.title} - complete={item.is_complete}",
    )

    return {
        "id": item.id,
        "title": item.title,
        "is_complete": item.is_complete,
        "updated_at": str(item.updated_at),
    }
