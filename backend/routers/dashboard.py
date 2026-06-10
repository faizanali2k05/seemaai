"""Dashboard router — aggregate compliance statistics and daily briefing."""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.compliance import ComplianceAlert, ComplianceScanResult
from models.intake import ClientIntake
from models.breach import BreachReport
from models.staff import StaffTraining

router = APIRouter()

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get dashboard statistics: aggregate counts from alerts, breaches, deadlines, intake, staff training."""

    # Count open alerts
    alerts_result = await db.execute(
        select(func.count(ComplianceAlert.id)).where(
            ComplianceAlert.firm_id == user.firm_id,
            ComplianceAlert.status == "open"
        )
    )
    open_alerts = alerts_result.scalar() or 0

    # Count high/critical severity alerts
    critical_result = await db.execute(
        select(func.count(ComplianceAlert.id)).where(
            ComplianceAlert.firm_id == user.firm_id,
            ComplianceAlert.severity.in_(["high", "critical"])
        )
    )
    critical_alerts = critical_result.scalar() or 0

    # Count breach reports
    breaches_result = await db.execute(
        select(func.count(BreachReport.id)).where(
            BreachReport.firm_id == user.firm_id,
            BreachReport.status.in_(["open", "reported"])
        )
    )
    open_breaches = breaches_result.scalar() or 0

    # Count pending intakes
    intakes_result = await db.execute(
        select(func.count(ClientIntake.id)).where(
            ClientIntake.firm_id == user.firm_id,
            ClientIntake.status == "pending"
        )
    )
    pending_intakes = intakes_result.scalar() or 0

    # Count overdue/pending training
    training_result = await db.execute(
        select(func.count(StaffTraining.id)).where(
            StaffTraining.firm_id == user.firm_id,
            StaffTraining.status == "pending",
            StaffTraining.due_date <= datetime.utcnow()
        )
    )
    overdue_training = training_result.scalar() or 0

    # Compliance scan pass/fail/warning counts
    pass_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "pass"
        )
    )
    scan_pass = pass_result.scalar() or 0

    fail_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "fail"
        )
    )
    scan_fail = fail_result.scalar() or 0

    warning_result = await db.execute(
        select(func.count(ComplianceScanResult.id)).where(
            ComplianceScanResult.firm_id == user.firm_id,
            ComplianceScanResult.status == "warning"
        )
    )
    scan_warning = warning_result.scalar() or 0

    return {
        "alerts": {
            "open": open_alerts,
            "critical": critical_alerts,
        },
        "breaches": {
            "open": open_breaches,
        },
        "intake": {
            "pending": pending_intakes,
        },
        "training": {
            "overdue": overdue_training,
        },
        "compliance_scans": {
            "pass": scan_pass,
            "fail": scan_fail,
            "warning": scan_warning,
        },
    }

@router.get("/compliance/daily-briefing")
async def get_daily_briefing(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get today's alerts, overdue items, and upcoming deadlines."""
    today = datetime.utcnow().date()
    tomorrow = today + timedelta(days=1)

    # Today's alerts (last 24 hours)
    alerts_result = await db.execute(
        select(ComplianceAlert).where(
            ComplianceAlert.firm_id == user.firm_id,
            ComplianceAlert.created_at >= datetime(today.year, today.month, today.day)
        ).order_by(ComplianceAlert.created_at.desc())
    )
    today_alerts = alerts_result.scalars().all()

    # Overdue training
    overdue_result = await db.execute(
        select(StaffTraining).where(
            StaffTraining.firm_id == user.firm_id,
            StaffTraining.status == "pending",
            StaffTraining.due_date <= datetime.utcnow()
        ).order_by(StaffTraining.due_date)
    )
    overdue_items = overdue_result.scalars().all()

    # Upcoming deadlines (next 7 days)
    next_week = today + timedelta(days=7)
    upcoming_result = await db.execute(
        select(StaffTraining).where(
            StaffTraining.firm_id == user.firm_id,
            StaffTraining.status == "pending",
            StaffTraining.due_date > datetime.utcnow(),
            StaffTraining.due_date <= datetime(next_week.year, next_week.month, next_week.day, 23, 59, 59)
        ).order_by(StaffTraining.due_date)
    )
    upcoming_deadlines = upcoming_result.scalars().all()

    return {
        "today_alerts": [
            {
                "id": a.id,
                "title": a.title,
                "severity": a.severity,
                "description": a.description,
                "created_at": str(a.created_at),
            }
            for a in today_alerts
        ],
        "overdue_items": [
            {
                "id": t.id,
                "staff_name": t.staff_name,
                "title": t.title,
                "due_date": str(t.due_date),
                "status": t.status,
            }
            for t in overdue_items
        ],
        "upcoming_deadlines": [
            {
                "id": t.id,
                "staff_name": t.staff_name,
                "title": t.title,
                "due_date": str(t.due_date),
                "days_until_due": (t.due_date.date() - today).days if t.due_date else 0,
            }
            for t in upcoming_deadlines
        ],
    }
