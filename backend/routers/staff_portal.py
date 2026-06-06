"""Staff portal routes."""
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.staff import StaffTraining
from models.chaser import ChaserLog

router = APIRouter()

class StaffPortalResponse(BaseModel):
    user_id: str
    pending_trainings: int
    pending_chasers: int

class ActionLogRequest(BaseModel):
    action_type: str
    details: dict

@router.get("/staff/portal")
async def get_staff_portal(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    trainings_result = await db.execute(select(StaffTraining).where((StaffTraining.staff_id == current_user.user_id) & (StaffTraining.status == "pending")))
    trainings = trainings_result.scalars().all()
    chasers_result = await db.execute(select(ChaserLog).where((ChaserLog.firm_id == current_user.firm_id) & (ChaserLog.status == "pending")))
    chasers = chasers_result.scalars().all()
    return {
        "user_id": current_user.user_id,
        "pending_trainings": len(trainings),
        "pending_chasers": len(chasers),
        "trainings": [{"id": t.id, "title": t.title, "due_date": t.due_date.isoformat() if t.due_date else None} for t in trainings],
        "chasers": [{"id": c.id, "chaser_type": c.chaser_type, "subject": c.subject} for c in chasers],
    }

@router.post("/staff/complete-training/{training_id}")
async def complete_training(
    training_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    result = await db.execute(select(StaffTraining).where((StaffTraining.id == training_id) & (StaffTraining.staff_id == current_user.user_id)))
    training = result.scalar_one_or_none()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")
    await db.execute(update(StaffTraining).where(StaffTraining.id == training_id).values(status="completed", completed_at=datetime.now(timezone.utc)))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="training_completed", entity_type="training", entity_id=training_id, user_id=current_user.user_id, details=json.dumps({"title": training.title}))
    return {"message": "Training marked complete", "training_id": training_id}

@router.post("/staff/log-action")
async def log_action(
    request: ActionLogRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    await log_audit(db=db, firm_id=current_user.firm_id, action=request.action_type, entity_type="staff_action", user_id=current_user.user_id, details=json.dumps(request.details))
    return {"message": "Action logged"}

@router.post("/staff/acknowledge-chaser/{chaser_id}")
async def acknowledge_chaser(
    chaser_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    result = await db.execute(select(ChaserLog).where((ChaserLog.id == chaser_id) & (ChaserLog.firm_id == current_user.firm_id)))
    chaser = result.scalar_one_or_none()
    if not chaser:
        raise HTTPException(status_code=404, detail="Chaser not found")
    await db.execute(update(ChaserLog).where(ChaserLog.id == chaser_id).values(status="acknowledged"))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="chaser_acknowledged", entity_type="chaser", entity_id=chaser_id, user_id=current_user.user_id, details=json.dumps({}))
    return {"message": "Chaser acknowledged", "chaser_id": chaser_id}
