"""Supervision router — staff supervision session management."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.law import SupervisionRecord

router = APIRouter()

# Pydantic schemas
class SupervisionSchedule(BaseModel):
    staff_id: str
    staff_name: str
    supervisor: str
    frequency: str  # monthly, quarterly, annual
    next_due: datetime

class SupervisionComplete(BaseModel):
    pass

class SupervisionResponse(BaseModel):
    id: str
    firm_id: str
    staff_id: str
    staff_name: str
    supervisor: str
    frequency: str
    last_session: datetime | None
    next_due: datetime
    status: str
    notes_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/supervision")
async def list_supervision_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all supervision sessions for the firm."""
    stmt = (
        select(SupervisionRecord)
        .where(SupervisionRecord.firm_id == current_user.firm_id)
        .order_by(SupervisionRecord.next_due.asc())
    )

    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return [
        {
            "id": s.id,
            "firm_id": s.firm_id,
            "staff_id": s.staff_id,
            "staff_name": s.staff_name,
            "supervisor": s.supervisor,
            "frequency": s.frequency,
            "last_session": s.last_session,
            "next_due": s.next_due,
            "status": s.status,
            "notes_count": s.notes_count,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ]

@router.get("/compliance/supervision/sessions")
async def list_supervision_session_log(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Individual supervision session log (frontend polls this on load).

    Session-level records aren't persisted separately yet, so this returns an
    empty log rather than 404ing. No demo data.
    """
    return []


@router.get("/compliance/supervision/relationships/{relationship_id}/sessions")
async def list_relationship_sessions(
    relationship_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Sessions for a single supervision relationship. Empty until recorded."""
    return []


@router.get("/compliance/supervision/overdue")
async def list_overdue_sessions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List overdue supervision sessions."""
    now = datetime.utcnow()
    stmt = (
        select(SupervisionRecord)
        .where(
            and_(
                SupervisionRecord.firm_id == current_user.firm_id,
                SupervisionRecord.next_due <= now,
                SupervisionRecord.status != "completed",
            )
        )
        .order_by(SupervisionRecord.next_due.asc())
    )

    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return [
        {
            "id": s.id,
            "firm_id": s.firm_id,
            "staff_id": s.staff_id,
            "staff_name": s.staff_name,
            "supervisor": s.supervisor,
            "frequency": s.frequency,
            "last_session": s.last_session,
            "next_due": s.next_due,
            "status": s.status,
            "notes_count": s.notes_count,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s in sessions
    ]

@router.post("/compliance/briefing/schedule-supervision")
async def schedule_supervision(
    supervision: SupervisionSchedule,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Schedule a supervision session for a staff member."""
    new_session = SupervisionRecord(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        staff_id=supervision.staff_id,
        staff_name=supervision.staff_name,
        supervisor=supervision.supervisor,
        frequency=supervision.frequency,
        next_due=supervision.next_due,
        status="pending",
        notes_count=0,
    )

    db.add(new_session)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="scheduled",
        entity_type="supervision",
        entity_id=new_session.id,
        user_id=current_user.user_id,
        details=f"Supervision scheduled for {supervision.staff_name}",
    )

    return {
        "id": new_session.id,
        "firm_id": new_session.firm_id,
        "staff_id": new_session.staff_id,
        "staff_name": new_session.staff_name,
        "supervisor": new_session.supervisor,
        "frequency": new_session.frequency,
        "last_session": new_session.last_session,
        "next_due": new_session.next_due,
        "status": new_session.status,
        "notes_count": new_session.notes_count,
        "created_at": new_session.created_at,
        "updated_at": new_session.updated_at,
    }

@router.post("/compliance/supervision/{supervision_id}/complete")
async def complete_supervision(
    supervision_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Complete a supervision session."""
    stmt = (
        select(SupervisionRecord)
        .where(
            (SupervisionRecord.id == supervision_id)
            & (SupervisionRecord.firm_id == current_user.firm_id)
        )
    )

    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Supervision session not found")

    # Calculate next due date based on frequency
    from dateutil.relativedelta import relativedelta

    last_session = datetime.utcnow()
    frequency_map = {
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "annual": relativedelta(years=1),
    }
    next_due = last_session + frequency_map.get(
        session.frequency, relativedelta(months=1)
    )

    # Update session
    stmt_update = (
        update(SupervisionRecord)
        .where(SupervisionRecord.id == supervision_id)
        .values(
            status="completed",
            last_session=last_session,
            next_due=next_due,
        )
        .returning(SupervisionRecord)
    )

    result_update = await db.execute(stmt_update)
    updated_session = result_update.scalar_one_or_none()

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="completed",
        entity_type="supervision",
        entity_id=supervision_id,
        user_id=current_user.user_id,
        details="Supervision session completed",
    )

    return {
        "id": updated_session.id,
        "firm_id": updated_session.firm_id,
        "staff_id": updated_session.staff_id,
        "staff_name": updated_session.staff_name,
        "supervisor": updated_session.supervisor,
        "frequency": updated_session.frequency,
        "last_session": updated_session.last_session,
        "next_due": updated_session.next_due,
        "status": updated_session.status,
        "notes_count": updated_session.notes_count,
        "created_at": updated_session.created_at,
        "updated_at": updated_session.updated_at,
    }
