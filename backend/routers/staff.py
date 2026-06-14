"""Staff management and training router."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.staff import StaffMember, StaffTraining

router = APIRouter()


@router.get("/compliance/training/cpd-dashboard")
async def cpd_dashboard(
    year: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """CPD dashboard for the Staff & Training page (previously 404'd).

    Lists the firm's staff with their training-record counts. Hours aggregation
    by category is a baseline (0) until CPD hours are captured — no demo data.
    """
    yr = year or datetime.utcnow().year
    staff = (
        await db.execute(select(StaffMember).where(StaffMember.firm_id == current_user.firm_id))
    ).scalars().all()
    rows = []
    for s in staff:
        cnt = (
            await db.execute(
                select(func.count(StaffTraining.id)).where(
                    StaffTraining.firm_id == current_user.firm_id,
                    StaffTraining.staff_id == s.id,
                )
            )
        ).scalar() or 0
        rows.append({
            "staff_id": s.id, "staff_name": s.name, "role": getattr(s, "role", None),
            "total_hours": 0, "hours_by_category": {}, "target_hours": 16, "gap_hours": 16,
            "records_count": cnt, "missing_reflections": 0, "last_record_date": None,
            "status": "no_records" if cnt == 0 else "at_risk",
        })
    return {
        "year": yr, "firm_target_hours": 16, "uncategorised_records": 0,
        "summary": {"total_hours": 0, "avg_per_fee_earner": 0, "on_track_pct": 0, "staff_count": len(staff)},
        "staff": rows,
    }


@router.get("/compliance/training/cpd-targets")
async def cpd_targets(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """CPD targets (previously 404'd). Firm default until targets are set."""
    return {"firm_target_hours": 16, "targets": []}


@router.post("/compliance/staff/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark a staff member inactive (was 404)."""
    res = await db.execute(
        select(StaffMember).where(
            StaffMember.id == staff_id,
            StaffMember.firm_id == current_user.firm_id,
        )
    )
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Staff member not found")
    s.status = "inactive"
    await db.flush()
    await log_audit(
        db=db, firm_id=current_user.firm_id, action="deactivated",
        entity_type="staff_member", entity_id=s.id, user_id=current_user.user_id,
        details=f"Staff member {s.name} deactivated",
    )
    return {"id": s.id, "status": s.status}


class _TrainingPatchBody(BaseModel):
    category: str | None = None
    cpd_category: str | None = None
    reflection_notes: str | None = None
    cpd_hours: int | None = None
    status: str | None = None


@router.patch("/compliance/training/{training_id}")
async def update_training_record(
    training_id: str,
    body: _TrainingPatchBody,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Edit a CPD/training record — category, reflection, hours (was 404)."""
    res = await db.execute(
        select(StaffTraining).where(
            StaffTraining.id == training_id,
            StaffTraining.firm_id == current_user.firm_id,
        )
    )
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Training record not found")
    if body.cpd_category is not None or body.category is not None:
        t.cpd_category = body.cpd_category or body.category
    if body.reflection_notes is not None:
        t.reflection_notes = body.reflection_notes
    if body.cpd_hours is not None:
        t.cpd_hours = body.cpd_hours
    if body.status is not None:
        t.status = body.status
    await db.flush()
    await log_audit(
        db=db, firm_id=current_user.firm_id, action="updated",
        entity_type="staff_training", entity_id=t.id, user_id=current_user.user_id,
        details="CPD/training record updated",
    )
    return {
        "id": t.id, "cpd_category": t.cpd_category,
        "reflection_notes": t.reflection_notes, "cpd_hours": t.cpd_hours, "status": t.status,
    }

class CreateStaffRequest(BaseModel):
    name: str
    email: str | None = None
    role: str
    department: str | None = None
    pqe: str | None = None
    sra_id: str | None = None
    phone: str | None = None

class UpdateStaffRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    department: str | None = None
    pqe: str | None = None
    sra_id: str | None = None
    phone: str | None = None
    status: str | None = None

class CreateTrainingRequest(BaseModel):
    staff_id: str
    title: str
    training_type: str | None = None
    due_date: datetime | None = None
    cpd_hours: int = 0

@router.get("/compliance/staff")
async def get_staff(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List staff members."""
    result = await db.execute(
        select(StaffMember).where(
            StaffMember.firm_id == user.firm_id
        ).order_by(StaffMember.name)
    )
    staff = result.scalars().all()

    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "role": s.role,
            "department": s.department,
            "status": s.status,
            "pqe": s.pqe,
            "sra_id": s.sra_id,
            "phone": s.phone,
            "last_training": str(s.last_training) if s.last_training else None,
            "start_date": str(s.start_date) if s.start_date else None,
            "created_at": str(s.created_at),
            "updated_at": str(s.updated_at),
        }
        for s in staff
    ]

@router.post("/compliance/staff")
async def create_staff(
    req: CreateStaffRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create staff member."""
    staff = StaffMember(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        name=req.name,
        email=req.email,
        role=req.role,
        department=req.department,
        pqe=req.pqe,
        sra_id=req.sra_id,
        phone=req.phone,
        status="active",
    )
    db.add(staff)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="staff_member",
        entity_id=staff.id,
        user_id=user.user_id,
        details=f"Staff member created: {req.name}",
    )

    return {
        "id": staff.id,
        "name": staff.name,
        "role": staff.role,
        "created_at": str(staff.created_at),
    }

@router.put("/compliance/staff/{staff_id}")
async def update_staff(
    staff_id: str,
    req: UpdateStaffRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update staff member."""
    result = await db.execute(
        select(StaffMember).where(
            StaffMember.id == staff_id,
            StaffMember.firm_id == user.firm_id,
        )
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    if req.name is not None:
        staff.name = req.name
    if req.email is not None:
        staff.email = req.email
    if req.role is not None:
        staff.role = req.role
    if req.department is not None:
        staff.department = req.department
    if req.pqe is not None:
        staff.pqe = req.pqe
    if req.sra_id is not None:
        staff.sra_id = req.sra_id
    if req.phone is not None:
        staff.phone = req.phone
    if req.status is not None:
        staff.status = req.status

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="staff_member",
        entity_id=staff_id,
        user_id=user.user_id,
        details=f"Staff member updated: {staff.name}",
    )

    return {
        "id": staff.id,
        "name": staff.name,
        "role": staff.role,
        "updated_at": str(staff.updated_at),
    }

@router.get("/compliance/training")
async def get_training(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all training records."""
    result = await db.execute(
        select(StaffTraining).where(
            StaffTraining.firm_id == user.firm_id
        ).order_by(StaffTraining.due_date)
    )
    training = result.scalars().all()

    return [
        {
            "id": t.id,
            "staff_id": t.staff_id,
            "staff_name": t.staff_name,
            "title": t.title,
            "training_type": t.training_type,
            "status": t.status,
            "due_date": str(t.due_date) if t.due_date else None,
            "completed_at": str(t.completed_at) if t.completed_at else None,
            "cpd_hours": t.cpd_hours,
            "created_at": str(t.created_at),
        }
        for t in training
    ]

@router.post("/compliance/training")
async def create_training(
    req: CreateTrainingRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create training record."""
    # Get staff name
    staff_result = await db.execute(
        select(StaffMember).where(
            StaffMember.id == req.staff_id,
            StaffMember.firm_id == user.firm_id,
        )
    )
    staff = staff_result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    training = StaffTraining(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        staff_id=req.staff_id,
        staff_name=staff.name,
        title=req.title,
        course_name=req.title,  # keep course_name populated for chase_engine / SRA audit pack
        training_type=req.training_type,
        due_date=req.due_date,
        cpd_hours=req.cpd_hours,
        status="pending",
    )
    db.add(training)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="staff_training",
        entity_id=training.id,
        user_id=user.user_id,
        details=f"Training created for {staff.name}: {req.title}",
    )

    return {
        "id": training.id,
        "staff_id": training.staff_id,
        "title": training.title,
        "status": training.status,
        "created_at": str(training.created_at),
    }

@router.post("/compliance/training/{training_id}/complete")
async def complete_training(
    training_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark training as complete."""
    result = await db.execute(
        select(StaffTraining).where(
            StaffTraining.id == training_id,
            StaffTraining.firm_id == user.firm_id,
        )
    )
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=404, detail="Training record not found")

    training.status = "completed"
    training.completed_at = datetime.utcnow()
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="completed",
        entity_type="staff_training",
        entity_id=training_id,
        user_id=user.user_id,
        details=f"Training completed: {training.title} for {training.staff_name}",
    )

    return {
        "id": training.id,
        "status": training.status,
        "completed_at": str(training.completed_at),
    }

@router.get("/admin/export/staff")
async def export_staff_csv(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Export staff as CSV."""
    user.require_role("admin")

    result = await db.execute(
        select(StaffMember).where(
            StaffMember.firm_id == user.firm_id
        ).order_by(StaffMember.name)
    )
    staff = result.scalars().all()

    # Build CSV content
    csv_lines = ["Name,Email,Role,Department,Status,PQE,SRA ID,Phone,Last Training"]
    for s in staff:
        last_training = str(s.last_training.date()) if s.last_training else ""
        csv_lines.append(
            f'"{s.name}","{s.email or ""}","{s.role or ""}","{s.department or ""}","{s.status}","{s.pqe or ""}","{s.sra_id or ""}","{s.phone or ""}","{last_training}"'
        )

    csv_content = "\n".join(csv_lines)

    return {
        "content_type": "text/csv",
        "filename": f"staff_export_{datetime.utcnow().strftime('%Y%m%d')}.csv",
        "data": csv_content,
    }
