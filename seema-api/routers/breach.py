"""Breach reporting router for GDPR and data protection compliance."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.breach import BreachReport
from models.compliance import ComplianceAlert

logger = logging.getLogger("seema.breach")

router = APIRouter()

class CreateBreachReportRequest(BaseModel):
    title: str
    description: str | None = None
    breach_type: str | None = None
    severity: str = "medium"
    reported_date: datetime | None = None
    ico_deadline: datetime | None = None
    affected_records: int = 0
    root_cause: str | None = None

@router.get("/compliance/breach-reports")
async def get_breach_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List breach reports."""
    result = await db.execute(
        select(BreachReport).where(
            BreachReport.firm_id == user.firm_id
        ).order_by(BreachReport.created_at.desc())
    )
    breaches = result.scalars().all()

    return [
        {
            "id": b.id,
            "title": b.title,
            "description": b.description,
            "breach_type": b.breach_type,
            "severity": b.severity,
            "status": b.status,
            "reported_date": str(b.reported_date) if b.reported_date else None,
            "ico_deadline": str(b.ico_deadline) if b.ico_deadline else None,
            "notification_status": b.notification_status,
            "affected_records": b.affected_records,
            "root_cause": b.root_cause,
            "resolution_date": str(b.resolution_date) if b.resolution_date else None,
            "remediation_plan_id": b.remediation_plan_id,
            "created_at": str(b.created_at),
            "updated_at": str(b.updated_at),
        }
        for b in breaches
    ]

@router.post("/compliance/breach-report")
async def create_breach_report(
    req: CreateBreachReportRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create breach report with auto-calculated ICO deadline and alert generation."""
    reported = req.reported_date or datetime.now(timezone.utc)
    # Auto-calculate ICO 72-hour deadline if not provided
    ico_deadline = req.ico_deadline or (reported + timedelta(hours=72))

    breach_id = str(uuid.uuid4())
    breach = BreachReport(
        id=breach_id,
        firm_id=user.firm_id,
        title=req.title,
        description=req.description,
        breach_type=req.breach_type,
        severity=req.severity,
        status="open",
        reported_date=reported,
        ico_deadline=ico_deadline,
        affected_records=req.affected_records,
        root_cause=req.root_cause,
        notification_status="pending",
    )
    db.add(breach)

    # Auto-create a CRITICAL compliance alert for the COLP
    alert_severity = "critical" if req.severity in ("high", "critical") else "high"
    alert = ComplianceAlert(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        alert_type="breach_reported",
        severity=alert_severity,
        title=f"Breach Reported: {req.title}",
        description=(
            f"A {req.breach_type or 'data'} breach has been reported. "
            f"Severity: {req.severity}. "
            f"ICO 72-hour notification deadline: {ico_deadline.strftime('%d %B %Y %H:%M UTC')}. "
            f"Immediate assessment required."
        ),
        action_required=(
            "1. Assess whether ICO notification is required under UK GDPR Article 33. "
            "2. If notifiable, submit via ICO breach reporting tool within 72 hours. "
            "3. Assess whether affected individuals must be notified under Article 34. "
            "4. Document all decisions in Seema."
        ),
        status="open",
    )
    db.add(alert)

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="breach_report",
        entity_id=breach.id,
        user_id=user.user_id,
        details=f"Breach report created: {req.title} - Severity: {req.severity}. ICO deadline: {ico_deadline.isoformat()}",
    )

    # Fire breach alert email asynchronously (best-effort, don't block response)
    try:
        from models.firm import Firm
        firm_result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
        firm = firm_result.scalar_one_or_none()
        if firm and firm.email:
            from services.email_service import EmailService
            email_svc = EmailService()
            email_svc.send_breach_alert(
                to_email=firm.email,
                to_name=firm.colp_name or "COLP",
                breach_title=req.title,
                breach_category=req.breach_type or "data",
                reported_at=reported.strftime("%d %B %Y %H:%M UTC"),
                ico_deadline=ico_deadline.strftime("%d %B %Y %H:%M UTC"),
                firm_name=firm.name,
            )
            logger.info(f"Breach alert email sent to COLP ({firm.email}) for breach {breach_id}")
    except Exception as e:
        # Email failure should not block breach creation
        logger.warning(f"Failed to send breach alert email: {e}")

    return {
        "id": breach.id,
        "title": breach.title,
        "severity": breach.severity,
        "status": breach.status,
        "ico_deadline": str(ico_deadline),
        "alert_id": alert.id,
        "created_at": str(breach.created_at),
    }
