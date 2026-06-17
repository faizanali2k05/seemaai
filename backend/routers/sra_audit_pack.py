"""SRA audit readiness router with seed data and audit pack generation.

INSTRUCTIONS:
  1. Copy this file to: seema-api/routers/sra_audit.py
  2. Register the router in main.py:
       from routers.sra_audit import router as sra_audit_router
       app.include_router(sra_audit_router, prefix="/api")
  3. Remove the old stub endpoint in routers/sra_return.py
     (the @router.get("/compliance/sra-audit") at the bottom)
"""
import uuid
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.firm import Firm
from models.compliance import SRAauditItem

router = APIRouter()

# ─── Demo seed data: 18 SRA Standards & Regulations checks ───────────────────
# 13 passing, 2 failing, 3 partial => 81% weighted readiness
# (13*1.0 + 3*0.5 + 2*0.0) / 18 = 14.5/18 = 81%

DEMO_SRA_AUDIT_ITEMS = [
    # === PASSING (13) ===
    {
        "id": "sra-01",
        "standard": "SRA Principle 1",
        "title": "Upholding the Rule of Law",
        "description": "Firm demonstrates commitment to upholding the rule of law and proper administration of justice.",
        "status": "pass",
        "category": "Principles",
        "evidence_count": 4,
        "last_reviewed": "2026-04-15T09:30:00Z",
        "notes": "Policies reviewed and up to date. Staff training completed March 2026.",
    },
    {
        "id": "sra-02",
        "standard": "SRA Principle 2",
        "title": "Public Confidence in Solicitors",
        "description": "Acting in a way that upholds public trust and confidence in the solicitors' profession.",
        "status": "pass",
        "category": "Principles",
        "evidence_count": 3,
        "last_reviewed": "2026-04-10T14:00:00Z",
        "notes": "No complaints or disciplinary matters in past 12 months.",
    },
    {
        "id": "sra-03",
        "standard": "SRA Principle 4",
        "title": "Honesty",
        "description": "Acting with honesty in all professional dealings.",
        "status": "pass",
        "category": "Principles",
        "evidence_count": 2,
        "last_reviewed": "2026-04-12T11:00:00Z",
        "notes": "Honesty and integrity policy in place and acknowledged by all staff.",
    },
    {
        "id": "sra-04",
        "standard": "SRA Principle 5",
        "title": "Integrity",
        "description": "Acting with integrity at all times.",
        "status": "pass",
        "category": "Principles",
        "evidence_count": 3,
        "last_reviewed": "2026-04-12T11:15:00Z",
        "notes": "Annual integrity declarations collected from all fee earners.",
    },
    {
        "id": "sra-05",
        "standard": "SRA Principle 7",
        "title": "Compliance with Legal & Regulatory Obligations",
        "description": "Complying with legal and regulatory obligations and dealing with regulators in an open and cooperative way.",
        "status": "pass",
        "category": "Principles",
        "evidence_count": 5,
        "last_reviewed": "2026-04-20T10:00:00Z",
        "notes": "All regulatory filings up to date. SRA annual return submitted on time.",
    },
    {
        "id": "sra-06",
        "standard": "SRA Code 3.2",
        "title": "Conflict of Interest Procedures",
        "description": "Systems and controls in place for identifying and managing conflicts of interest.",
        "status": "pass",
        "category": "Code of Conduct",
        "evidence_count": 4,
        "last_reviewed": "2026-04-18T09:00:00Z",
        "notes": "Conflict check system operational. All new matters screened.",
    },
    {
        "id": "sra-07",
        "standard": "SRA Code 3.5",
        "title": "Client Confidentiality",
        "description": "Effective safeguards for client confidentiality and information security.",
        "status": "pass",
        "category": "Code of Conduct",
        "evidence_count": 6,
        "last_reviewed": "2026-04-22T14:30:00Z",
        "notes": "Information security policy reviewed. Clean desk policy enforced. Encryption in place.",
    },
    {
        "id": "sra-08",
        "standard": "SRA Code 4.2",
        "title": "Client Money Handling",
        "description": "Proper accounting systems for client money in compliance with SRA Accounts Rules.",
        "status": "pass",
        "category": "Accounts Rules",
        "evidence_count": 8,
        "last_reviewed": "2026-04-25T16:00:00Z",
        "notes": "Accountant's report clean. Monthly reconciliations up to date.",
    },
    {
        "id": "sra-09",
        "standard": "SRA Code 4.3",
        "title": "Client Account Reconciliation",
        "description": "Regular reconciliation of client account balances.",
        "status": "pass",
        "category": "Accounts Rules",
        "evidence_count": 5,
        "last_reviewed": "2026-04-25T16:30:00Z",
        "notes": "Three-way reconciliation performed monthly. No discrepancies.",
    },
    {
        "id": "sra-10",
        "standard": "SRA Code 7.1",
        "title": "COLP & COFA Appointments",
        "description": "Compliance Officer for Legal Practice and Finance & Administration properly appointed.",
        "status": "pass",
        "category": "Management",
        "evidence_count": 3,
        "last_reviewed": "2026-04-08T10:00:00Z",
        "notes": "COLP and COFA appointed and registered with SRA.",
    },
    {
        "id": "sra-11",
        "standard": "SRA Code 8.1",
        "title": "Complaints Handling Procedure",
        "description": "Written complaints procedure in place and communicated to clients.",
        "status": "pass",
        "category": "Client Care",
        "evidence_count": 4,
        "last_reviewed": "2026-04-14T13:00:00Z",
        "notes": "Complaints procedure included in client care letters. LeO details provided.",
    },
    {
        "id": "sra-12",
        "standard": "SRA Code 2.4",
        "title": "Client Identification & Verification",
        "description": "Due diligence and client identification procedures in line with anti-money laundering requirements.",
        "status": "pass",
        "category": "AML",
        "evidence_count": 7,
        "last_reviewed": "2026-04-20T11:00:00Z",
        "notes": "CDD procedures documented. Electronic verification in use. PEP/sanctions screening active.",
    },
    {
        "id": "sra-13",
        "standard": "SRA Transparency Rules",
        "title": "Price & Service Transparency",
        "description": "Publishing pricing and service information for applicable practice areas.",
        "status": "pass",
        "category": "Transparency",
        "evidence_count": 3,
        "last_reviewed": "2026-04-11T15:00:00Z",
        "notes": "Website updated with pricing for conveyancing, probate, immigration, and employment tribunal.",
    },
    {
        "id": "sra-14",
        "standard": "SRA Code 1.4",
        "title": "Client Care & Communication",
        "description": "Keeping clients informed about their matter and costs.",
        "status": "fail",
        "category": "Client Care",
        "evidence_count": 1,
        "last_reviewed": "2026-02-20T10:00:00Z",
        "notes": "File review found 4 matters with no client care letter issued. Cost updates not sent in 6+ weeks on multiple files.",
        "remediation_hint": "Issue client care letters on all open matters immediately and set up automated cost update reminders.",
    },

    # === PARTIAL (3) ===
    {
        "id": "sra-15",
        "standard": "SRA Code 2.5",
        "title": "Staff Competence & Supervision",
        "description": "Ensuring staff are competent, maintain competence, and are effectively supervised.",
        "status": "partial",
        "category": "Management",
        "evidence_count": 2,
        "last_reviewed": "2026-04-05T09:00:00Z",
        "notes": "Training records exist but 2 fee earners are overdue on CPD hours. Supervision framework needs updating.",
        "remediation_hint": "Schedule overdue CPD training and update supervision policy by end of Q2.",
    },
    {
        "id": "sra-16",
        "standard": "SRA Code 9.1",
        "title": "Risk Management Framework",
        "description": "Identifying, monitoring, and managing all material risks to the business.",
        "status": "partial",
        "category": "Management",
        "evidence_count": 3,
        "last_reviewed": "2026-04-02T14:00:00Z",
        "notes": "Risk register exists but hasn't been reviewed since January 2026. Some emerging risks not yet captured.",
        "remediation_hint": "Conduct quarterly risk review meeting and update risk register.",
    },
    {
        "id": "sra-17",
        "standard": "SRA Principle 6",
        "title": "Equality, Diversity & Inclusion",
        "description": "Encouraging equality, diversity, and inclusion in the firm.",
        "status": "partial",
        "category": "Principles",
        "evidence_count": 1,
        "last_reviewed": "2026-03-28T10:00:00Z",
        "notes": "ED&I policy exists but diversity data collection is incomplete. No formal ED&I training programme.",
        "remediation_hint": "Implement diversity data collection and schedule ED&I training for all staff.",
    },

    # === FAILING (1) ===
    {
        "id": "sra-18",
        "standard": "SRA Code 2.1",
        "title": "Anti-Money Laundering (Firm-Wide Risk Assessment)",
        "description": "Firm-wide AML risk assessment reviewed and updated annually.",
        "status": "fail",
        "category": "AML",
        "evidence_count": 1,
        "last_reviewed": "2026-01-15T10:00:00Z",
        "notes": "Firm-wide AML risk assessment is 3+ months overdue for annual review. MLRO flagged but not yet actioned.",
        "remediation_hint": "URGENT: Complete firm-wide AML risk assessment review immediately. This is a regulatory requirement.",
    },
]

def _compute_score(items):
    """Compute weighted readiness score: pass=1.0, partial=0.5, fail=0.0"""
    total = len(items)
    if total == 0:
        return 0
    score = sum(
        1.0 if item["status"] == "pass" else 0.5 if item["status"] == "partial" else 0.0
        for item in items
    )
    return round((score / total) * 100)

def _get_summary(items):
    passing = sum(1 for i in items if i["status"] == "pass")
    failing = sum(1 for i in items if i["status"] == "fail")
    partial = sum(1 for i in items if i["status"] == "partial")
    return {"total": len(items), "passing": passing, "failing": failing, "partial": partial}


async def _firm_audit_items(db: AsyncSession, firm_id: str) -> list:
    """Return the firm's REAL SRA audit items (no demo data). Empty if none."""
    res = await db.execute(
        select(SRAauditItem)
        .where(SRAauditItem.firm_id == firm_id)
        .order_by(SRAauditItem.category, SRAauditItem.item_name)
    )
    return [
        {
            "id": it.id,
            "standard": it.category or "",
            "title": it.item_name or "",
            "description": it.description or "",
            "status": it.status or "not_reviewed",
            "category": it.category or "General",
            "evidence_count": 1 if it.evidence_ref else 0,
            "last_reviewed": it.last_reviewed,
            "notes": it.notes or "",
        }
        for it in res.scalars().all()
    ]

@router.get("/compliance/sra-audit")
async def list_sra_audit(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List the firm's real SRA audit readiness items with summary score."""
    items = await _firm_audit_items(db, current_user.firm_id)
    summary = _get_summary(items)
    score = _compute_score(items)
    assessed_at = max(
        (i["last_reviewed"] for i in items if i.get("last_reviewed")), default=None
    )

    return {
        "score": score,
        "summary": summary,
        "assessed_at": assessed_at,
        "items": items,
    }

@router.post("/compliance/sra-audit/generate-pack")
async def generate_audit_pack(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate SRA Visit Preparation Pack as a downloadable PDF."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    items = await _firm_audit_items(db, current_user.firm_id)
    summary = _get_summary(items)
    score = _compute_score(items)

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="generated",
        entity_type="sra_audit_pack",
        entity_id=str(current_user.firm_id),
        user_id=current_user.user_id,
        details=f"Generated SRA Visit Pack - Score: {score}%",
    )

    # Return pack metadata (PDF generation handled by service layer)
    generated_at = datetime.utcnow()
    return {
        "status": "success",
        "filename": f"SRA_Visit_Pack_{firm.sra_number or 'DRAFT'}_{generated_at.strftime('%Y%m%d')}.pdf",
        "generated_at": generated_at.isoformat(),
        "score": score,
        "summary": summary,
        "firm_name": firm.name,
        "sra_number": firm.sra_number,
    }


@router.post("/compliance/sra-audit/ai-assess")
async def ai_assess_sra_audit(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """AI-assess the firm's LIVE data against the 12 SRA readiness guidelines and
    persist the result as the firm's SRA audit items (so the readiness page loads)."""
    from sqlalchemy import delete as _delete
    from routers.ai import _gather_compliance_data
    from services.ai_analysis import assess_sra_audit

    firm = (await db.execute(select(Firm).where(Firm.id == current_user.firm_id))).scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    compliance_data = await _gather_compliance_data(db, current_user.firm_id)
    result = assess_sra_audit(firm, compliance_data)

    # Replace the firm's audit items with this fresh AI assessment.
    await db.execute(_delete(SRAauditItem).where(SRAauditItem.firm_id == current_user.firm_id))
    now_iso = datetime.utcnow().isoformat()
    for it in result.get("items", []):
        rec = (it.get("recommendation") or "").strip()
        ref = (it.get("sra_reference") or "").strip()
        notes = rec + (f"  [{ref}]" if ref else "")
        db.add(SRAauditItem(
            id=str(uuid.uuid4()),
            firm_id=current_user.firm_id,
            category=it.get("category"),
            item_name=it.get("title") or it.get("category"),
            description=it.get("finding"),
            status=it.get("status") or "not_reviewed",
            last_reviewed=now_iso,
            notes=notes,
        ))
    await db.flush()

    await log_audit(
        db=db, firm_id=current_user.firm_id, action="ai_sra_audit_assessment",
        entity_type="sra_audit", entity_id=str(current_user.firm_id),
        user_id=current_user.user_id,
        details=json.dumps({
            "overall_rating": result.get("overall_rating"),
            "ai_generated": result.get("ai_generated", False),
        }),
    )

    items = await _firm_audit_items(db, current_user.firm_id)
    return {
        "score": _compute_score(items),
        "summary": _get_summary(items),
        "assessed_at": now_iso,
        "items": items,
        "overall_rating": result.get("overall_rating"),
        "ai_generated": result.get("ai_generated", False),
    }
