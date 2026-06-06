"""Undertakings router — undertaking register management."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.undertakings import Undertaking

router = APIRouter()

# Pydantic schemas
class UndertakingCreate(BaseModel):
    description: str
    matter_ref: str | None = None
    given_to: str
    given_by: str
    given_date: datetime
    due_date: datetime | None = None

class UndertakingFulfil(BaseModel):
    pass

class UndertakingBreach(BaseModel):
    pass

class UndertakingResponse(BaseModel):
    id: str
    firm_id: str
    description: str
    matter_ref: str | None
    given_to: str
    given_by: str
    given_date: datetime
    due_date: datetime | None
    status: str
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/undertakings")
async def list_undertakings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all undertakings for the firm."""
    stmt = (
        select(Undertaking)
        .where(Undertaking.firm_id == current_user.firm_id)
        .order_by(Undertaking.due_date.asc())
    )

    result = await db.execute(stmt)
    undertakings = result.scalars().all()

    return [
        {
            "id": u.id,
            "firm_id": u.firm_id,
            "description": u.description,
            "matter_ref": u.matter_ref,
            "given_to": u.given_to,
            "given_by": u.given_by,
            "given_date": u.given_date,
            "due_date": u.due_date,
            "status": u.status,
            "completed_at": u.completed_at,
            "created_at": u.created_at,
            "updated_at": u.updated_at,
        }
        for u in undertakings
    ]

@router.post("/compliance/undertakings")
async def create_undertaking(
    undertaking: UndertakingCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new undertaking."""
    new_undertaking = Undertaking(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        description=undertaking.description,
        matter_ref=undertaking.matter_ref,
        given_to=undertaking.given_to,
        given_by=undertaking.given_by,
        given_date=undertaking.given_date,
        due_date=undertaking.due_date,
        status="pending",
    )

    db.add(new_undertaking)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="undertaking",
        entity_id=new_undertaking.id,
        user_id=current_user.user_id,
        details=f"Undertaking given to {undertaking.given_to}",
    )

    return {
        "id": new_undertaking.id,
        "firm_id": new_undertaking.firm_id,
        "description": new_undertaking.description,
        "matter_ref": new_undertaking.matter_ref,
        "given_to": new_undertaking.given_to,
        "given_by": new_undertaking.given_by,
        "given_date": new_undertaking.given_date,
        "due_date": new_undertaking.due_date,
        "status": new_undertaking.status,
        "completed_at": new_undertaking.completed_at,
        "created_at": new_undertaking.created_at,
        "updated_at": new_undertaking.updated_at,
    }

@router.post("/compliance/undertakings/{undertaking_id}/fulfil")
async def fulfil_undertaking(
    undertaking_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark an undertaking as fulfilled."""
    stmt = (
        update(Undertaking)
        .where(
            (Undertaking.id == undertaking_id)
            & (Undertaking.firm_id == current_user.firm_id)
        )
        .values(
            status="fulfilled",
            completed_at=datetime.now(timezone.utc),
        )
        .returning(Undertaking)
    )

    result = await db.execute(stmt)
    undertaking = result.scalar_one_or_none()

    if not undertaking:
        raise HTTPException(status_code=404, detail="Undertaking not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="fulfilled",
        entity_type="undertaking",
        entity_id=undertaking_id,
        user_id=current_user.user_id,
        details="Undertaking marked as fulfilled",
    )

    return {
        "id": undertaking.id,
        "firm_id": undertaking.firm_id,
        "description": undertaking.description,
        "matter_ref": undertaking.matter_ref,
        "given_to": undertaking.given_to,
        "given_by": undertaking.given_by,
        "given_date": undertaking.given_date,
        "due_date": undertaking.due_date,
        "status": undertaking.status,
        "completed_at": undertaking.completed_at,
        "created_at": undertaking.created_at,
        "updated_at": undertaking.updated_at,
    }

@router.post("/compliance/undertakings/{undertaking_id}/breach")
async def record_undertaking_breach(
    undertaking_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record a breach of an undertaking."""
    stmt = (
        update(Undertaking)
        .where(
            (Undertaking.id == undertaking_id)
            & (Undertaking.firm_id == current_user.firm_id)
        )
        .values(status="breached")
        .returning(Undertaking)
    )

    result = await db.execute(stmt)
    undertaking = result.scalar_one_or_none()

    if not undertaking:
        raise HTTPException(status_code=404, detail="Undertaking not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="breached",
        entity_type="undertaking",
        entity_id=undertaking_id,
        user_id=current_user.user_id,
        details="Undertaking breach recorded",
    )

    return {
        "id": undertaking.id,
        "firm_id": undertaking.firm_id,
        "description": undertaking.description,
        "matter_ref": undertaking.matter_ref,
        "given_to": undertaking.given_to,
        "given_by": undertaking.given_by,
        "given_date": undertaking.given_date,
        "due_date": undertaking.due_date,
        "status": undertaking.status,
        "completed_at": undertaking.completed_at,
        "created_at": undertaking.created_at,
        "updated_at": undertaking.updated_at,
    }
