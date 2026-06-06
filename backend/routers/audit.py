"""Audit trail and audit reports router."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.audit import AuditLog

router = APIRouter()

class AuditReportCreate(BaseModel):
    title: str
    period_start: datetime = None
    period_end: datetime = None

@router.get("/compliance/audit-trail")
async def list_audit_trail(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List audit log entries."""
    stmt = select(AuditLog).where(
        AuditLog.firm_id == current_user.firm_id
    ).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "firm_id": log.firm_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "user_id": log.user_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        }
        for log in logs
    ]

@router.get("/compliance/audit-trail/summary")
async def audit_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get audit summary statistics."""
    stmt = select(func.count(AuditLog.id)).where(
        AuditLog.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    total_actions = result.scalar() or 0
    
    stmt = select(func.count(func.distinct(AuditLog.user_id))).where(
        AuditLog.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    total_users = result.scalar() or 0
    
    stmt = select(AuditLog.action, func.count(AuditLog.id)).where(
        AuditLog.firm_id == current_user.firm_id
    ).group_by(AuditLog.action)
    result = await db.execute(stmt)
    action_counts = dict(result.all())
    
    return {
        "total_actions": total_actions,
        "total_users": total_users,
        "action_counts": action_counts,
    }

@router.get("/compliance/audit-reports")
async def list_audit_reports(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List audit reports."""
    return []

@router.post("/compliance/generate-audit-report")
async def generate_audit_report(
    payload: AuditReportCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate audit report."""
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="generated_report",
        entity_type="audit_report",
        entity_id=str(uuid.uuid4()),
        user_id=current_user.user_id,
        details=f"Generated audit report: {payload.title}",
    )
    return {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "period_start": payload.period_start,
        "period_end": payload.period_end,
        "generated_at": datetime.now(timezone.utc),
    }
