"""Remediation plan tracking router."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.remediation import RemediationPlan

router = APIRouter()

class RemediationPlanCreate(BaseModel):
    title: str
    source: str = None
    priority: str = "medium"
    assigned_to: str = None
    due_date: datetime = None
    steps: str = None

@router.get("/compliance/remediation-plans")
async def list_remediation_plans(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List remediation plans."""
    stmt = select(RemediationPlan).where(
        RemediationPlan.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    plans = result.scalars().all()
    return [
        {
            "id": p.id,
            "firm_id": p.firm_id,
            "title": p.title,
            "source": p.source,
            "priority": p.priority,
            "status": p.status,
            "assigned_to": p.assigned_to,
            "due_date": p.due_date,
            "steps": p.steps,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        for p in plans
    ]

@router.post("/compliance/remediation-plans")
async def create_remediation_plan(
    payload: RemediationPlanCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create remediation plan."""
    plan = RemediationPlan(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=payload.title,
        source=payload.source,
        priority=payload.priority,
        assigned_to=payload.assigned_to,
        due_date=payload.due_date,
        steps=payload.steps,
        status="pending",
    )
    db.add(plan)
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="remediation_plan",
        entity_id=plan.id,
        user_id=current_user.user_id,
        details=f"Created remediation plan: {plan.title}",
    )
    return {
        "id": plan.id,
        "firm_id": plan.firm_id,
        "title": plan.title,
        "source": plan.source,
        "priority": plan.priority,
        "status": plan.status,
        "assigned_to": plan.assigned_to,
        "due_date": plan.due_date,
        "steps": plan.steps,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }

@router.post("/compliance/remediation-steps/{step_id}/complete")
async def complete_remediation_step(
    step_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark remediation step complete."""
    stmt = select(RemediationPlan).where(
        RemediationPlan.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Not found")
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="completed_step",
        entity_type="remediation_plan",
        entity_id=plan.id,
        user_id=current_user.user_id,
        details=f"Completed step {step_id}",
    )
    return {"status": "success", "step_id": step_id}

class MarkResolvedRequest(BaseModel):
    plan_id: str

@router.post("/compliance/remediate")
async def mark_plan_resolved(
    req: MarkResolvedRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Mark remediation plan resolved."""
    stmt = select(RemediationPlan).where(
        RemediationPlan.id == req.plan_id,
        RemediationPlan.firm_id == current_user.firm_id,
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Not found")
    plan.status = "completed"
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="resolved",
        entity_type="remediation_plan",
        entity_id=plan.id,
        user_id=current_user.user_id,
        details=f"Marked plan resolved: {plan.title}",
    )
    return {
        "id": plan.id,
        "status": plan.status,
        "completed_at": datetime.utcnow(),
    }
