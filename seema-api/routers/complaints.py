"""Complaints router — complaint management and tracking."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.complaints import Complaint

router = APIRouter()

# Pydantic schemas
class ComplaintCreate(BaseModel):
    complainant_name: str
    complainant_type: str  # client, third_party, staff
    category: str
    description: str
    priority: str = "medium"  # low, medium, high, urgent

class ComplaintAcknowledge(BaseModel):
    assigned_to: str

class ComplaintResolve(BaseModel):
    resolution: str

class ComplaintResponse(BaseModel):
    id: str
    firm_id: str
    complainant_name: str
    complainant_type: str
    category: str
    description: str
    priority: str
    status: str
    assigned_to: str | None
    opened_date: datetime
    closed_date: datetime | None
    resolution: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/complaints/stats")
async def get_complaints_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get complaint statistics for the firm."""
    stmt = select(
        func.count(Complaint.id).label("total"),
        func.count(func.nullif(Complaint.status != "resolved", True)).label("open"),
        func.count(func.nullif(Complaint.status == "resolved", True)).label("resolved"),
    ).where(Complaint.firm_id == current_user.firm_id)

    result = await db.execute(stmt)
    row = result.first()

    # Calculate average resolution time
    resolution_times = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Complaint.closed_date - Complaint.opened_date)
            )
        ).where(
            (Complaint.firm_id == current_user.firm_id)
            & (Complaint.closed_date.isnot(None))
        )
    )
    avg_time = resolution_times.scalar() or 0

    return {
        "total": row[0],
        "open": row[1],
        "resolved": row[2],
        "avg_resolution_hours": round(avg_time / 3600) if avg_time else 0,
    }

@router.get("/compliance/complaints")
async def list_complaints(
    status: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List complaints for the firm, optionally filtered by status."""
    query = select(Complaint).where(Complaint.firm_id == current_user.firm_id)

    if status:
        query = query.where(Complaint.status == status)

    query = query.order_by(Complaint.created_at.desc())
    result = await db.execute(query)
    complaints = result.scalars().all()

    return [
        {
            "id": c.id,
            "firm_id": c.firm_id,
            "complainant_name": c.complainant_name,
            "complainant_type": c.complainant_type,
            "category": c.category,
            "description": c.description,
            "priority": c.priority,
            "status": c.status,
            "assigned_to": c.assigned_to,
            "opened_date": c.opened_date,
            "closed_date": c.closed_date,
            "resolution": c.resolution,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        }
        for c in complaints
    ]

@router.post("/compliance/complaints")
async def create_complaint(
    complaint: ComplaintCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new complaint."""
    new_complaint = Complaint(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        complainant_name=complaint.complainant_name,
        complainant_type=complaint.complainant_type,
        category=complaint.category,
        description=complaint.description,
        priority=complaint.priority,
        status="open",
    )

    db.add(new_complaint)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="complaint",
        entity_id=new_complaint.id,
        user_id=current_user.user_id,
        details=f"Complaint from {complaint.complainant_name}",
    )

    return {
        "id": new_complaint.id,
        "firm_id": new_complaint.firm_id,
        "complainant_name": new_complaint.complainant_name,
        "complainant_type": new_complaint.complainant_type,
        "category": new_complaint.category,
        "description": new_complaint.description,
        "priority": new_complaint.priority,
        "status": new_complaint.status,
        "assigned_to": new_complaint.assigned_to,
        "opened_date": new_complaint.opened_date,
        "closed_date": new_complaint.closed_date,
        "resolution": new_complaint.resolution,
        "created_at": new_complaint.created_at,
        "updated_at": new_complaint.updated_at,
    }

@router.post("/compliance/complaints/{complaint_id}/acknowledge")
async def acknowledge_complaint(
    complaint_id: str,
    data: ComplaintAcknowledge,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Acknowledge a complaint by assigning it."""
    stmt = (
        update(Complaint)
        .where(
            (Complaint.id == complaint_id) & (Complaint.firm_id == current_user.firm_id)
        )
        .values(assigned_to=data.assigned_to)
        .returning(Complaint)
    )

    result = await db.execute(stmt)
    complaint = result.scalar_one_or_none()

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="acknowledged",
        entity_type="complaint",
        entity_id=complaint_id,
        user_id=current_user.user_id,
        details=f"Assigned to {data.assigned_to}",
    )

    return {
        "id": complaint.id,
        "firm_id": complaint.firm_id,
        "complainant_name": complaint.complainant_name,
        "complainant_type": complaint.complainant_type,
        "category": complaint.category,
        "description": complaint.description,
        "priority": complaint.priority,
        "status": complaint.status,
        "assigned_to": complaint.assigned_to,
        "opened_date": complaint.opened_date,
        "closed_date": complaint.closed_date,
        "resolution": complaint.resolution,
        "created_at": complaint.created_at,
        "updated_at": complaint.updated_at,
    }

@router.post("/compliance/complaints/{complaint_id}/resolve")
async def resolve_complaint(
    complaint_id: str,
    data: ComplaintResolve,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Resolve a complaint with notes."""
    stmt = (
        update(Complaint)
        .where(
            (Complaint.id == complaint_id) & (Complaint.firm_id == current_user.firm_id)
        )
        .values(
            status="resolved",
            resolution=data.resolution,
            closed_date=datetime.now(timezone.utc),
        )
        .returning(Complaint)
    )

    result = await db.execute(stmt)
    complaint = result.scalar_one_or_none()

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="resolved",
        entity_type="complaint",
        entity_id=complaint_id,
        user_id=current_user.user_id,
        details="Complaint resolved",
    )

    return {
        "id": complaint.id,
        "firm_id": complaint.firm_id,
        "complainant_name": complaint.complainant_name,
        "complainant_type": complaint.complainant_type,
        "category": complaint.category,
        "description": complaint.description,
        "priority": complaint.priority,
        "status": complaint.status,
        "assigned_to": complaint.assigned_to,
        "opened_date": complaint.opened_date,
        "closed_date": complaint.closed_date,
        "resolution": complaint.resolution,
        "created_at": complaint.created_at,
        "updated_at": complaint.updated_at,
    }
