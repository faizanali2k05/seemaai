"""Compliance router — alerts, checks, and compliance scans."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.compliance import ComplianceAlert, ComplianceScanResult

router = APIRouter()

@router.get("/compliance/alerts")
async def get_alerts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List compliance alerts for firm."""
    result = await db.execute(
        select(ComplianceAlert).where(
            ComplianceAlert.firm_id == user.firm_id
        ).order_by(ComplianceAlert.created_at.desc())
    )
    alerts = result.scalars().all()

    return [
        {
            "id": a.id,
            "title": a.title,
            "alert_type": a.alert_type,
            "severity": a.severity,
            "status": a.status,
            "description": a.description,
            "acknowledged_by": a.acknowledged_by,
            "resolved_by": a.resolved_by,
            "created_at": str(a.created_at),
            "updated_at": str(a.updated_at),
        }
        for a in alerts
    ]

@router.post("/compliance/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Acknowledge an alert by setting acknowledged_by."""
    result = await db.execute(
        select(ComplianceAlert).where(
            ComplianceAlert.id == alert_id,
            ComplianceAlert.firm_id == user.firm_id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged_by = user.user_id
    alert.status = "acknowledged"
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="acknowledged",
        entity_type="compliance_alert",
        entity_id=alert_id,
        user_id=user.user_id,
        details=f"Alert acknowledged: {alert.title}",
    )

    return {"id": alert.id, "status": alert.status, "acknowledged_by": alert.acknowledged_by}

@router.post("/compliance/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Resolve an alert by setting status=resolved."""
    result = await db.execute(
        select(ComplianceAlert).where(
            ComplianceAlert.id == alert_id,
            ComplianceAlert.firm_id == user.firm_id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "resolved"
    alert.resolved_by = user.user_id
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="resolved",
        entity_type="compliance_alert",
        entity_id=alert_id,
        user_id=user.user_id,
        details=f"Alert resolved: {alert.title}",
    )

    return {"id": alert.id, "status": alert.status, "resolved_by": alert.resolved_by}

@router.post("/compliance/alerts/{alert_id}/escalate")
async def escalate_alert(
    alert_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Escalate alert severity by one level."""
    result = await db.execute(
        select(ComplianceAlert).where(
            ComplianceAlert.id == alert_id,
            ComplianceAlert.firm_id == user.firm_id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    severity_order = ["low", "medium", "high", "critical"]
    current_index = severity_order.index(alert.severity) if alert.severity in severity_order else 1
    if current_index < len(severity_order) - 1:
        alert.severity = severity_order[current_index + 1]
    else:
        alert.severity = "critical"

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="escalated",
        entity_type="compliance_alert",
        entity_id=alert_id,
        user_id=user.user_id,
        details=f"Alert escalated to {alert.severity}: {alert.title}",
    )

    return {"id": alert.id, "severity": alert.severity}

@router.get("/compliance/checks")
async def get_compliance_checks(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List compliance scan results."""
    result = await db.execute(
        select(ComplianceScanResult).where(
            ComplianceScanResult.firm_id == user.firm_id
        ).order_by(ComplianceScanResult.scan_date.desc())
    )
    results = result.scalars().all()

    return [
        {
            "id": r.id,
            "category": r.category,
            "check_name": r.check_name,
            "status": r.status,
            "details": r.details,
            "recommendation": r.recommendation,
            "scan_date": str(r.scan_date),
            "created_at": str(r.created_at),
        }
        for r in results
    ]

@router.get("/compliance/risk-scores")
async def get_risk_scores(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get aggregate pass/fail/warning counts."""
    pass_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "pass"
        )
    )
    pass_count = pass_result.scalar() or 0

    fail_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "fail"
        )
    )
    fail_count = fail_result.scalar() or 0

    warning_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "warning"
        )
    )
    warning_count = warning_result.scalar() or 0

    total = pass_count + fail_count + warning_count
    pass_rate = (pass_count / total * 100) if total > 0 else 0

    return {
        "pass": pass_count,
        "fail": fail_count,
        "warning": warning_count,
        "total": total,
        "pass_rate": round(pass_rate, 2),
    }

@router.post("/compliance/checks/run")
async def run_compliance_scan(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create new scan results (stub returns job_id)."""
    job_id = str(uuid.uuid4())

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="scan_initiated",
        entity_type="compliance_scan",
        entity_id=job_id,
        user_id=user.user_id,
        details="Compliance scan initiated",
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Compliance scan initiated. Check status via job_id.",
    }
