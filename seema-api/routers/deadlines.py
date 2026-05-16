"""Deadlines router — deadline tracking and management."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.workflow import Deadline

router = APIRouter()

# Pydantic schemas
class DeadlineCreate(BaseModel):
    title: str
    due_date: datetime
    priority: str = "medium"  # low, medium, high, urgent
    category: str | None = None
    assigned_to: str | None = None

class DeadlineUpdate(BaseModel):
    title: str | None = None
    due_date: datetime | None = None
    priority: str | None = None
    category: str | None = None
    assigned_to: str | None = None
    status: str | None = None

class DeadlineComplete(BaseModel):
    pass

class DeadlineResponse(BaseModel):
    id: str
    firm_id: str
    title: str
    due_date: datetime
    priority: str
    status: str
    assigned_to: str | None
    category: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/deadlines")
async def list_deadlines(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all deadlines for the firm."""
    stmt = (
        select(Deadline)
        .where(Deadline.firm_id == current_user.firm_id)
        .order_by(Deadline.due_date.asc())
    )

    result = await db.execute(stmt)
    deadlines = result.scalars().all()

    return [
        {
            "id": d.id,
            "firm_id": d.firm_id,
            "title": d.title,
            "due_date": d.due_date,
            "priority": d.priority,
            "status": d.status,
            "assigned_to": d.assigned_to,
            "category": d.category,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        }
        for d in deadlines
    ]

@router.post("/compliance/deadlines")
async def create_deadline(
    deadline: DeadlineCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new deadline."""
    new_deadline = Deadline(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=deadline.title,
        due_date=deadline.due_date,
        priority=deadline.priority,
        category=deadline.category,
        assigned_to=deadline.assigned_to,
        status="pending",
    )

    db.add(new_deadline)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="deadline",
        entity_id=new_deadline.id,
        user_id=current_user.user_id,
        details=f"Deadline: {deadline.title}",
    )

    return {
        "id": new_deadline.id,
        "firm_id": new_deadline.firm_id,
        "title": new_deadline.title,
        "due_date": new_deadline.due_date,
        "priority": new_deadline.priority,
        "status": new_deadline.status,
        "assigned_to": new_deadline.assigned_to,
        "category": new_deadline.category,
        "created_at": new_deadline.created_at,
        "updated_at": new_deadline.updated_at,
    }

@router.put("/compliance/deadlines/{deadline_id}")
async def update_deadline(
    deadline_id: str,
    updates: DeadlineUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update a deadline."""
    # Build update values
    update_values = {}
    if updates.title:
        update_values["title"] = updates.title
    if updates.due_date:
        update_values["due_date"] = updates.due_date
    if updates.priority:
        update_values["priority"] = updates.priority
    if updates.category:
        update_values["category"] = updates.category
    if updates.assigned_to:
        update_values["assigned_to"] = updates.assigned_to
    if updates.status:
        update_values["status"] = updates.status

    if not update_values:
        raise HTTPException(status_code=400, detail="No fields to update")

    stmt = (
        update(Deadline)
        .where(
            (Deadline.id == deadline_id) & (Deadline.firm_id == current_user.firm_id)
        )
        .values(**update_values)
        .returning(Deadline)
    )

    result = await db.execute(stmt)
    deadline = result.scalar_one_or_none()

    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="updated",
        entity_type="deadline",
        entity_id=deadline_id,
        user_id=current_user.user_id,
        details="Deadline updated",
    )

    return {
        "id": deadline.id,
        "firm_id": deadline.firm_id,
        "title": deadline.title,
        "due_date": deadline.due_date,
        "priority": deadline.priority,
        "status": deadline.status,
        "assigned_to": deadline.assigned_to,
        "category": deadline.category,
        "created_at": deadline.created_at,
        "updated_at": deadline.updated_at,
    }

@router.post("/compliance/deadlines/{deadline_id}/complete")
async def complete_deadline(
    deadline_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark a deadline as completed."""
    stmt = (
        update(Deadline)
        .where(
            (Deadline.id == deadline_id) & (Deadline.firm_id == current_user.firm_id)
        )
        .values(status="completed")
        .returning(Deadline)
    )

    result = await db.execute(stmt)
    deadline = result.scalar_one_or_none()

    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="completed",
        entity_type="deadline",
        entity_id=deadline_id,
        user_id=current_user.user_id,
        details="Deadline marked as completed",
    )

    return {
        "id": deadline.id,
        "firm_id": deadline.firm_id,
        "title": deadline.title,
        "due_date": deadline.due_date,
        "priority": deadline.priority,
        "status": deadline.status,
        "assigned_to": deadline.assigned_to,
        "category": deadline.category,
        "created_at": deadline.created_at,
        "updated_at": deadline.updated_at,
    }
