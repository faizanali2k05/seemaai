"""Onboarding routes."""
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.firm import Firm

router = APIRouter()

class SraLookupResponse(BaseModel):
    sra_number: str
    firm_name: str
    found: bool

class OnboardingCompleteRequest(BaseModel):
    practice_areas: list = Field(default=[], alias="practiceAreas")

    model_config = {"populate_by_name": True}

@router.get("/onboarding/sra-lookup/{sra_number}")
async def sra_lookup(
    sra_number: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    result = await db.execute(select(Firm).where(Firm.sra_number == sra_number))
    firm = result.scalar_one_or_none()
    if firm:
        return {"sra_number": sra_number, "firm_name": firm.name, "found": True}
    return {"sra_number": sra_number, "firm_name": f"Firm {sra_number}", "found": False}

@router.post("/onboarding/complete")
async def complete_onboarding(
    request: OnboardingCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    result = await db.execute(select(Firm).where(Firm.id == current_user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    prefs = {}
    if firm.firm_preferences:
        try:
            prefs = json.loads(firm.firm_preferences)
        except:
            prefs = {}
    await db.execute(
        update(Firm).where(Firm.id == current_user.firm_id).values(
            onboarding_status="completed",
            onboarding_completed_at=datetime.utcnow(),
            practice_areas=json.dumps(request.practice_areas),
            updated_at=datetime.utcnow(),
        )
    )
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="onboarding_completed", entity_type="firm", entity_id=current_user.firm_id, user_id=current_user.user_id, details=json.dumps({"practice_areas": request.practice_areas}))
    return {"message": "Onboarding completed", "firm_id": current_user.firm_id}
