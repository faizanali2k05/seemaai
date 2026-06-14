"""Intake router — client intake and CDD management."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.intake import ClientIntake

router = APIRouter()


class _AssessIntakeBody(BaseModel):
    risk_assessment: str
    notes: str | None = None


@router.post("/compliance/intake/{intake_id}/assess")
async def assess_intake(
    intake_id: str,
    body: _AssessIntakeBody,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record a CDD risk assessment on an intake (was 404)."""
    res = await db.execute(
        select(ClientIntake).where(
            ClientIntake.id == intake_id,
            ClientIntake.firm_id == current_user.firm_id,
        )
    )
    intake = res.scalar_one_or_none()
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")
    intake.risk_level = body.risk_assessment
    intake.risk_score = {"low": 20, "medium": 50, "high": 80}.get(body.risk_assessment, 50)
    intake.status = "reviewed"
    intake.cdd_status = "assessed"
    if body.notes:
        intake.conflict_check_details = body.notes
    await db.flush()
    await log_audit(
        db=db, firm_id=current_user.firm_id, action="assessed",
        entity_type="client_intake", entity_id=intake.id, user_id=current_user.user_id,
        details=f"Risk assessed as {body.risk_assessment}",
    )
    return {"id": intake.id, "risk_level": intake.risk_level,
            "risk_score": intake.risk_score, "status": intake.status}

class CreateIntakeRequest(BaseModel):
    client_name: str
    client_email: str | None = None
    practice_area: str | None = None
    risk_level: str = "medium"
    source_of_funds: str | None = None

class UpdateIntakeRequest(BaseModel):
    client_name: str | None = None
    client_email: str | None = None
    practice_area: str | None = None
    risk_level: str | None = None
    source_of_funds: str | None = None
    assigned_to: str | None = None
    conflict_check_status: str | None = None
    cdd_status: str | None = None

@router.get("/compliance/intake")
async def get_intakes(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List intakes for firm."""
    result = await db.execute(
        select(ClientIntake).where(
            ClientIntake.firm_id == user.firm_id
        ).order_by(ClientIntake.created_at.desc())
    )
    intakes = result.scalars().all()

    return [
        {
            "id": i.id,
            "client_name": i.client_name,
            "client_email": i.client_email,
            "practice_area": i.practice_area,
            "status": i.status,
            "conflict_check_status": i.conflict_check_status,
            "client_care_letter_sent": i.client_care_letter_sent,
            "risk_level": i.risk_level,
            "risk_score": float(i.risk_score) if i.risk_score else 0,
            "assigned_to": i.assigned_to,
            "source_of_funds": i.source_of_funds,
            "pep_screening": i.pep_screening,
            "sanctions_check": i.sanctions_check,
            "cdd_status": i.cdd_status,
            "created_at": str(i.created_at),
            "updated_at": str(i.updated_at),
        }
        for i in intakes
    ]

@router.post("/compliance/intake")
async def create_intake(
    req: CreateIntakeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create new intake."""
    intake = ClientIntake(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        client_name=req.client_name,
        client_email=req.client_email,
        practice_area=req.practice_area,
        risk_level=req.risk_level,
        source_of_funds=req.source_of_funds,
        status="pending",
    )
    db.add(intake)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="client_intake",
        entity_id=intake.id,
        user_id=user.user_id,
        details=f"Client intake created: {req.client_name}",
    )

    return {
        "id": intake.id,
        "client_name": intake.client_name,
        "status": intake.status,
        "created_at": str(intake.created_at),
    }

@router.put("/compliance/intake/{intake_id}")
async def update_intake(
    intake_id: str,
    req: UpdateIntakeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update intake."""
    result = await db.execute(
        select(ClientIntake).where(
            ClientIntake.id == intake_id,
            ClientIntake.firm_id == user.firm_id,
        )
    )
    intake = result.scalar_one_or_none()
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")

    if req.client_name is not None:
        intake.client_name = req.client_name
    if req.client_email is not None:
        intake.client_email = req.client_email
    if req.practice_area is not None:
        intake.practice_area = req.practice_area
    if req.risk_level is not None:
        intake.risk_level = req.risk_level
    if req.source_of_funds is not None:
        intake.source_of_funds = req.source_of_funds
    if req.assigned_to is not None:
        intake.assigned_to = req.assigned_to
    if req.conflict_check_status is not None:
        intake.conflict_check_status = req.conflict_check_status
    if req.cdd_status is not None:
        intake.cdd_status = req.cdd_status

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="client_intake",
        entity_id=intake_id,
        user_id=user.user_id,
        details=f"Intake updated: {intake.client_name}",
    )

    return {
        "id": intake.id,
        "client_name": intake.client_name,
        "status": intake.status,
        "updated_at": str(intake.updated_at),
    }

@router.post("/compliance/intake/{intake_id}/approve")
async def approve_intake(
    intake_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Approve intake."""
    result = await db.execute(
        select(ClientIntake).where(
            ClientIntake.id == intake_id,
            ClientIntake.firm_id == user.firm_id,
        )
    )
    intake = result.scalar_one_or_none()
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")

    intake.status = "approved"
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="approved",
        entity_type="client_intake",
        entity_id=intake_id,
        user_id=user.user_id,
        details=f"Intake approved: {intake.client_name}",
    )

    return {"id": intake.id, "status": intake.status}

@router.post("/compliance/intake/{intake_id}/reject")
async def reject_intake(
    intake_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Reject intake."""
    result = await db.execute(
        select(ClientIntake).where(
            ClientIntake.id == intake_id,
            ClientIntake.firm_id == user.firm_id,
        )
    )
    intake = result.scalar_one_or_none()
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")

    intake.status = "rejected"
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="rejected",
        entity_type="client_intake",
        entity_id=intake_id,
        user_id=user.user_id,
        details=f"Intake rejected: {intake.client_name}",
    )

    return {"id": intake.id, "status": intake.status}
