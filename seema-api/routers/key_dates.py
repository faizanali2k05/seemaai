"""Key dates, limitation periods, and CPR router."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit

router = APIRouter()

class LimitationPeriodCreate(BaseModel):
    description: str
    expiry_date: datetime
    matter_id: str = None

class PreActionProtocolCreate(BaseModel):
    description: str
    deadline: datetime
    status: str = "pending"

class CPRDeadlineCreate(BaseModel):
    description: str
    deadline: datetime
    case_reference: str = None

@router.get("/compliance/key-dates/limitation-periods")
async def list_limitation_periods(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List limitation periods."""
    return []

@router.get("/compliance/key-dates/pre-action-protocols")
async def list_pre_action_protocols(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List pre-action protocols."""
    return []

@router.post("/compliance/key-dates/limitation")
async def create_limitation(
    payload: LimitationPeriodCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create limitation period record."""
    limitation_id = str(uuid.uuid4())
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="limitation_period",
        entity_id=limitation_id,
        user_id=current_user.user_id,
        details=f"Created limitation: {payload.description}",
    )
    
    return {
        "id": limitation_id,
        "description": payload.description,
        "expiry_date": payload.expiry_date,
        "matter_id": payload.matter_id,
        "created_at": datetime.now(timezone.utc),
    }

@router.post("/compliance/key-dates/cpr")
async def create_cpr_deadline(
    payload: CPRDeadlineCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create CPR deadline."""
    cpr_id = str(uuid.uuid4())
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="cpr_deadline",
        entity_id=cpr_id,
        user_id=current_user.user_id,
        details=f"Created CPR deadline: {payload.description}",
    )
    
    return {
        "id": cpr_id,
        "description": payload.description,
        "deadline": payload.deadline,
        "case_reference": payload.case_reference,
        "created_at": datetime.now(timezone.utc),
    }

@router.post("/compliance/key-dates/pre-action")
async def create_pre_action(
    payload: PreActionProtocolCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create pre-action protocol."""
    protocol_id = str(uuid.uuid4())
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="pre_action_protocol",
        entity_id=protocol_id,
        user_id=current_user.user_id,
        details=f"Created pre-action: {payload.description}",
    )
    
    return {
        "id": protocol_id,
        "description": payload.description,
        "deadline": payload.deadline,
        "status": payload.status,
        "created_at": datetime.now(timezone.utc),
    }
