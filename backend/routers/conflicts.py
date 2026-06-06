"""Conflicts of interest router."""
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.conflicts import ConflictCheck, ConflictParty

router = APIRouter()

def _safe_json(val, default=None):
    """Safely parse JSON, returning default on failure."""
    if default is None:
        default = []
    if not val:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, ValueError, TypeError):
        return default

class CreateConflictCheckRequest(BaseModel):
    client_name: str
    matter_type: str | None = None
    parties: list[str] | None = None

class AddPartyRequest(BaseModel):
    party_name: str
    party_type: str = "individual"

class ResolveConflictRequest(BaseModel):
    resolution_text: str | None = None

@router.get("/compliance/conflicts/stats")
async def get_conflict_stats(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get aggregate conflict statistics."""
    pending_result = await db.execute(
        select(func.count(ConflictCheck.id)).where(
            ConflictCheck.firm_id == user.firm_id,
            ConflictCheck.status == "pending"
        )
    )
    pending = pending_result.scalar() or 0

    clear_result = await db.execute(
        select(func.count(ConflictCheck.id)).where(
            ConflictCheck.firm_id == user.firm_id,
            ConflictCheck.status == "clear"
        )
    )
    clear = clear_result.scalar() or 0

    conflicted_result = await db.execute(
        select(func.count(ConflictCheck.id)).where(
            ConflictCheck.firm_id == user.firm_id,
            ConflictCheck.status == "conflicted"
        )
    )
    conflicted = conflicted_result.scalar() or 0

    total = pending + clear + conflicted

    return {
        "pending": pending,
        "clear": clear,
        "conflicted": conflicted,
        "total": total,
    }

@router.get("/compliance/conflicts")
async def get_conflicts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List conflict checks."""
    result = await db.execute(
        select(ConflictCheck).where(
            ConflictCheck.firm_id == user.firm_id
        ).order_by(ConflictCheck.created_at.desc())
    )
    checks = result.scalars().all()

    return [
        {
            "id": c.id,
            "client_name": c.client_name,
            "matter_type": c.matter_type,
            "parties": _safe_json(c.parties),
            "status": c.status,
            "conflict_type": c.conflict_type,
            "checked_by": c.checked_by,
            "resolution": c.resolution,
            "resolved_at": str(c.resolved_at) if c.resolved_at else None,
            "created_at": str(c.created_at),
            "updated_at": str(c.updated_at),
        }
        for c in checks
    ]

@router.post("/compliance/conflicts/check")
async def run_conflict_check(
    req: CreateConflictCheckRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Run new conflict check."""
    check = ConflictCheck(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        client_name=req.client_name,
        matter_type=req.matter_type,
        parties=json.dumps(req.parties) if req.parties else json.dumps([]),
        status="pending",
        checked_by=user.user_id,
    )
    db.add(check)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="conflict_check",
        entity_id=check.id,
        user_id=user.user_id,
        details=f"Conflict check initiated for {req.client_name}",
    )

    return {
        "id": check.id,
        "client_name": check.client_name,
        "status": check.status,
        "created_at": str(check.created_at),
    }

@router.post("/compliance/conflicts/{check_id}/resolve")
async def resolve_conflict(
    check_id: str,
    req: ResolveConflictRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Resolve a conflict check."""
    result = await db.execute(
        select(ConflictCheck).where(
            ConflictCheck.id == check_id,
            ConflictCheck.firm_id == user.firm_id,
        )
    )
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(status_code=404, detail="Conflict check not found")

    check.status = "clear"
    check.resolution = req.resolution_text or "Resolved"
    check.resolved_at = datetime.now(timezone.utc)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="resolved",
        entity_type="conflict_check",
        entity_id=check_id,
        user_id=user.user_id,
        details=f"Conflict resolved for {check.client_name}",
    )

    return {
        "id": check.id,
        "status": check.status,
        "resolved_at": str(check.resolved_at),
    }

@router.get("/compliance/conflicts/parties")
async def get_conflict_parties(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List conflict of interest parties."""
    result = await db.execute(
        select(ConflictParty).where(
            ConflictParty.firm_id == user.firm_id
        ).order_by(ConflictParty.party_name)
    )
    parties = result.scalars().all()

    return [
        {
            "id": p.id,
            "party_name": p.party_name,
            "party_type": p.party_type,
            "date_added": str(p.date_added),
            "created_at": str(p.created_at),
        }
        for p in parties
    ]

@router.post("/compliance/conflicts/parties")
async def add_conflict_party(
    req: AddPartyRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Add a party to conflict registry."""
    party = ConflictParty(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        party_name=req.party_name,
        party_type=req.party_type,
    )
    db.add(party)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="conflict_party",
        entity_id=party.id,
        user_id=user.user_id,
        details=f"Conflict party added: {req.party_name}",
    )

    return {
        "id": party.id,
        "party_name": party.party_name,
        "party_type": party.party_type,
        "created_at": str(party.created_at),
    }
