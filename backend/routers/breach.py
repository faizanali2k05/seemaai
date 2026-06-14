"""Breach register router — the 8-phase breach reporting workflow.

Backs /breaches: list + create breaches, advance them through the workflow
(triage/classification, notifications, investigation), draft the SRA report with
AI, and record the COLP electronic sign-off. Every breach auto-creates a linked
remediation plan and a COLP alert. Tenant isolation via RLS (firm_id column).
"""
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from services.cross_module import build_breach_remediation
from models.breach import BreachReport
from models.compliance import ComplianceAlert
from models.firm import Firm

logger = logging.getLogger("seema.breach")

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────
class CreateBreachReportRequest(BaseModel):
    title: str
    description: str | None = None
    breach_type: str | None = None
    severity: str = "medium"
    reported_date: datetime | None = None
    detected_at: datetime | None = None
    ico_deadline: datetime | None = None
    affected_records: int = 0
    root_cause: str | None = None
    classification: str | None = None
    tracks: list[str] | None = None
    phase: int | None = 1
    workflow_data: dict | None = None


class UpdateBreachRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    breach_type: str | None = None
    severity: str | None = None
    status: str | None = None
    classification: str | None = None
    tracks: list[str] | None = None
    phase: int | None = None
    detected_at: datetime | None = None
    root_cause: str | None = None
    affected_records: int | None = None
    notification_status: str | None = None
    workflow_data: dict | None = None


class BreachSignOffRequest(BaseModel):
    signed_off_by: str
    confirm: bool = True


# ── Helpers ────────────────────────────────────────────────────────
def _loads(val, default):
    if not val:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default


def _serialize_breach(b: BreachReport) -> dict:
    return {
        "id": b.id,
        "breach_ref": b.breach_ref,
        "title": b.title,
        "description": b.description,
        "breach_type": b.breach_type,
        "severity": b.severity,
        "status": b.status,
        "classification": b.classification,
        "tracks": _loads(b.tracks, []),
        "phase": b.phase or 1,
        "reported_date": str(b.reported_date) if b.reported_date else None,
        "detected_at": str(b.detected_at) if b.detected_at else None,
        "ico_deadline": str(b.ico_deadline) if b.ico_deadline else None,
        "notification_status": b.notification_status,
        "affected_records": b.affected_records,
        "root_cause": b.root_cause,
        "resolution_date": str(b.resolution_date) if b.resolution_date else None,
        "remediation_plan_id": b.remediation_plan_id,
        "ico_notification_draft": _loads(b.ico_notification_draft, None),
        "ico_notification_drafted_at": str(b.ico_notification_drafted_at) if b.ico_notification_drafted_at else None,
        "ico_notified_at": str(b.ico_notified_at) if b.ico_notified_at else None,
        "workflow_data": _loads(b.workflow_data, {}),
        "sra_report_draft": b.sra_report_draft,
        "sra_report_drafted_at": str(b.sra_report_drafted_at) if b.sra_report_drafted_at else None,
        "signed_off_by": b.signed_off_by,
        "signed_off_at": str(b.signed_off_at) if b.signed_off_at else None,
        "created_at": str(b.created_at) if b.created_at else None,
        "updated_at": str(b.updated_at) if b.updated_at else None,
    }


async def _get_owned_breach(db: AsyncSession, breach_id: str, firm_id: str) -> BreachReport:
    res = await db.execute(
        select(BreachReport).where(
            BreachReport.id == breach_id, BreachReport.firm_id == firm_id
        )
    )
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Breach not found")
    return b


async def _next_breach_ref(db: AsyncSession, firm_id: str, when: datetime) -> str:
    """Generate a per-firm human reference like BR-2026-0042."""
    res = await db.execute(
        select(func.count()).select_from(BreachReport).where(
            BreachReport.firm_id == firm_id
        )
    )
    count = res.scalar() or 0
    return f"BR-{when.year}-{count + 1:04d}"


# ── Endpoints ──────────────────────────────────────────────────────
@router.get("/compliance/breach-reports")
async def get_breach_reports(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List breach reports for the firm, most recent first."""
    result = await db.execute(
        select(BreachReport)
        .where(BreachReport.firm_id == user.firm_id)
        .order_by(BreachReport.created_at.desc())
    )
    return [_serialize_breach(b) for b in result.scalars().all()]


@router.post("/compliance/breach-report")
async def create_breach_report(
    req: CreateBreachReportRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a breach: ICO deadline, reference, linked remediation, COLP alert."""
    reported = req.reported_date or datetime.utcnow()
    detected = req.detected_at or reported
    ico_deadline = req.ico_deadline or (detected + timedelta(hours=72))
    breach_ref = await _next_breach_ref(db, user.firm_id, reported)

    breach = BreachReport(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        breach_ref=breach_ref,
        title=req.title,
        description=req.description,
        breach_type=req.breach_type,
        severity=req.severity,
        status="open",
        classification=req.classification,
        tracks=json.dumps(req.tracks) if req.tracks is not None else None,
        phase=req.phase or 1,
        reported_date=reported,
        detected_at=detected,
        ico_deadline=ico_deadline,
        affected_records=req.affected_records,
        root_cause=req.root_cause,
        notification_status="pending",
        workflow_data=json.dumps(req.workflow_data) if req.workflow_data is not None else None,
    )
    db.add(breach)

    # Cross-module sync: linked remediation plan (visible in /remediation).
    remediation = build_breach_remediation(
        firm_id=user.firm_id,
        breach_title=req.title,
        severity=req.severity,
        due_date=ico_deadline,
    )
    breach.remediation_plan_id = remediation.id
    db.add(remediation)

    # COLP alert.
    alert_severity = "critical" if req.severity in ("high", "critical") else "high"
    alert = ComplianceAlert(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        alert_type="breach_reported",
        severity=alert_severity,
        title=f"Breach Reported: {req.title}",
        description=(
            f"A {req.breach_type or 'data'} breach has been reported ({breach_ref}). "
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
        db=db, firm_id=user.firm_id, action="created", entity_type="breach_report",
        entity_id=breach.id, user_id=user.user_id,
        details=f"Breach {breach_ref} created: {req.title} — Severity: {req.severity}.",
    )

    # Breach alert email (best-effort).
    try:
        firm_result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
        firm = firm_result.scalar_one_or_none()
        if firm and firm.email:
            from services.email_service import EmailService
            EmailService().send_breach_alert(
                to_email=firm.email,
                to_name=firm.colp_name or "COLP",
                breach_title=req.title,
                breach_category=req.breach_type or "data",
                reported_at=reported.strftime("%d %B %Y %H:%M UTC"),
                ico_deadline=ico_deadline.strftime("%d %B %Y %H:%M UTC"),
                firm_name=firm.name,
            )
    except Exception as e:
        logger.warning(f"Failed to send breach alert email: {e}")

    await db.refresh(breach)
    return _serialize_breach(breach)


@router.patch("/compliance/breach-reports/{breach_id}")
async def update_breach_report(
    breach_id: str,
    req: UpdateBreachRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Advance/update a breach through the workflow (phase, classification,
    tracks, status, per-phase workflow_data, etc.)."""
    b = await _get_owned_breach(db, breach_id, user.firm_id)

    if req.title is not None:
        b.title = req.title
    if req.description is not None:
        b.description = req.description
    if req.breach_type is not None:
        b.breach_type = req.breach_type
    if req.severity is not None:
        b.severity = req.severity
    if req.status is not None:
        b.status = req.status
        if req.status in ("resolved", "closed") and not b.resolution_date:
            b.resolution_date = datetime.utcnow()
    if req.classification is not None:
        b.classification = req.classification
    if req.tracks is not None:
        b.tracks = json.dumps(req.tracks)
    if req.phase is not None:
        b.phase = max(1, min(8, req.phase))
    if req.detected_at is not None:
        b.detected_at = req.detected_at
    if req.root_cause is not None:
        b.root_cause = req.root_cause
    if req.affected_records is not None:
        b.affected_records = req.affected_records
    if req.notification_status is not None:
        b.notification_status = req.notification_status
    if req.workflow_data is not None:
        # Merge so a partial phase save doesn't clobber other phases' data.
        existing = _loads(b.workflow_data, {})
        existing.update(req.workflow_data)
        b.workflow_data = json.dumps(existing)

    await db.flush()
    await log_audit(
        db=db, firm_id=user.firm_id, action="updated", entity_type="breach_report",
        entity_id=b.id, user_id=user.user_id,
        details=f"Breach {b.breach_ref or b.id} updated (phase {b.phase}, status {b.status}).",
    )
    await db.refresh(b)
    return _serialize_breach(b)


@router.post("/compliance/breach-reports/{breach_id}/sra-report")
async def generate_breach_sra_report(
    breach_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate (and persist) the AI-drafted SRA report for a breach."""
    b = await _get_owned_breach(db, breach_id, user.firm_id)
    firm_res = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = firm_res.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    from services.ai_analysis import draft_breach_sra_report
    result = await draft_breach_sra_report(_serialize_breach(b), firm)

    b.sra_report_draft = result.get("content")
    b.sra_report_drafted_at = datetime.utcnow()
    await db.flush()
    await log_audit(
        db=db, firm_id=user.firm_id, action="sra_report_generated",
        entity_type="breach_report", entity_id=b.id, user_id=user.user_id,
        details=f"SRA report drafted ({'AI' if result.get('ai_generated') else 'fallback'}) for {b.breach_ref or b.id}.",
    )
    await db.refresh(b)
    return {"breach": _serialize_breach(b), "report": result}


@router.post("/compliance/breach-reports/{breach_id}/sign-off")
async def sign_off_breach_report(
    breach_id: str,
    req: BreachSignOffRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record the COLP electronic sign-off of the SRA report."""
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Sign-off must be confirmed")
    b = await _get_owned_breach(db, breach_id, user.firm_id)
    if not b.sra_report_draft:
        raise HTTPException(status_code=400, detail="Generate the SRA report before signing off")

    now = datetime.utcnow()
    b.signed_off_by = req.signed_off_by
    b.signed_off_at = now
    b.status = "reported"
    b.phase = max(b.phase or 1, 6)

    await db.flush()
    await log_audit(
        db=db, firm_id=user.firm_id, action="signed_off", entity_type="breach_report",
        entity_id=b.id, user_id=user.user_id,
        details=f"SRA report signed off by {req.signed_off_by} for {b.breach_ref or b.id}.",
    )
    await db.refresh(b)
    return _serialize_breach(b)
