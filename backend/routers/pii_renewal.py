"""PII Renewal Pack — aggregates the firm's compliance posture into the bundle
a firm submits at professional-indemnity-insurance renewal. All sections are
real firm data (empty/zero until the firm has records); no demo data.
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.firm import Firm
from models.staff import StaffMember, StaffTraining
from models.breach import BreachReport
from models.complaints import Complaint
from models.aml import CDDRecord
from models.law import SupervisionRecord
from models.policies import PolicyDocument
from models.compliance import RiskScore
from models.conflicts import ConflictCheck

router = APIRouter()


async def _count(db: AsyncSession, model, firm_id: str) -> int:
    return (await db.execute(
        select(func.count(model.id)).where(model.firm_id == firm_id)
    )).scalar() or 0


def _iso(dt):
    return dt.isoformat() if dt else None


@router.post("/compliance/pii-renewal-pack/generate")
async def generate_pii_pack(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate the PII renewal pack from the firm's real compliance data (was 404)."""
    fid = current_user.firm_id
    firm = (await db.execute(select(Firm).where(Firm.id == fid))).scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    try:
        areas = json.loads(firm.practice_areas) if firm.practice_areas else []
    except (json.JSONDecodeError, TypeError):
        areas = []

    staff = (await db.execute(
        select(StaffMember).where(StaffMember.firm_id == fid, StaffMember.status == "active")
    )).scalars().all()

    breaches = (await db.execute(
        select(BreachReport).where(BreachReport.firm_id == fid)
        .order_by(BreachReport.created_at.desc())
    )).scalars().all()
    by_sev: dict = {}
    for b in breaches:
        key = b.severity or "unknown"
        by_sev[key] = by_sev.get(key, 0) + 1

    policies = (await db.execute(
        select(PolicyDocument).where(PolicyDocument.firm_id == fid)
    )).scalars().all()

    rs = (await db.execute(
        select(RiskScore).where(RiskScore.firm_id == fid)
        .order_by(RiskScore.calculated_at.desc())
    )).scalars().first()

    pack = {
        "generated_at": datetime.utcnow().isoformat(),
        "firm": {
            "id": firm.id, "name": firm.name, "sra_number": firm.sra_number,
            "firm_size": getattr(firm, "firm_size", None), "practice_areas": areas,
            "colp_name": firm.colp_name, "cofa_name": firm.cofa_name, "mlro_name": firm.mlro_name,
            "subscription_tier": getattr(firm, "subscription_tier", None),
        },
        "staff": {
            "total_active": len(staff),
            "solicitor_count": sum(1 for s in staff if (s.role or "").lower() == "solicitor"),
            "trainee_count": sum(1 for s in staff if "trainee" in (s.role or "").lower()),
            "average_pqe": None,
            "staff_list": [
                {"id": s.id, "name": s.name, "role": s.role,
                 "pqe": str(s.pqe) if s.pqe is not None else None, "sra_id": s.sra_id}
                for s in staff
            ],
        },
        "training": {
            "total_last_12m": await _count(db, StaffTraining, fid),
            "overdue_count": (await db.execute(
                select(func.count(StaffTraining.id)).where(
                    StaffTraining.firm_id == fid, StaffTraining.status == "overdue"
                )
            )).scalar() or 0,
        },
        "breaches": {
            "total_last_12m": len(breaches),
            "open_count": sum(1 for b in breaches if b.status == "open"),
            "by_severity": by_sev,
            "items": [
                {"id": b.id, "title": b.title, "severity": b.severity, "status": b.status,
                 "reported_date": _iso(b.reported_date), "ico_deadline": _iso(b.ico_deadline),
                 "resolution_date": _iso(getattr(b, "resolution_date", None))}
                for b in breaches[:10]
            ],
        },
        "complaints": {"total_last_12m": await _count(db, Complaint, fid)},
        "aml": {"total_cdd_records": await _count(db, CDDRecord, fid)},
        "supervision": {"active_count": await _count(db, SupervisionRecord, fid)},
        "policies": {
            "total_count": len(policies),
            "items": [
                {"id": p.id, "title": getattr(p, "title", None),
                 "category": getattr(p, "policy_type", None) or getattr(p, "category", None),
                 "status": getattr(p, "status", None),
                 "last_reviewed": _iso(getattr(p, "last_reviewed", None)),
                 "next_review": _iso(getattr(p, "next_review_date", None))}
                for p in policies[:20]
            ],
        },
        "risk_management": {
            "latest_firm_risk_score": ({
                "overall_score": rs.overall_score,
                "sra_score": getattr(rs, "sra_score", None),
                "aml_score": getattr(rs, "aml_score", None),
                "gdpr_score": getattr(rs, "gdpr_score", None),
                "calculated_at": _iso(getattr(rs, "calculated_at", None)),
            } if rs else None),
        },
        "conflict_checks": {"total_last_12m": await _count(db, ConflictCheck, fid)},
    }

    await log_audit(
        db=db, firm_id=fid, action="generated", entity_type="pii_renewal_pack",
        entity_id=fid, user_id=current_user.user_id, details="PII renewal pack generated",
    )
    return pack
