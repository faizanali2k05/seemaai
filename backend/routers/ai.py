"""
AI-powered compliance endpoints.

All AI endpoints are async and call into services/ai_analysis.py or
services/knowledge_engine.py. They gracefully degrade when
ANTHROPIC_API_KEY is not configured (returning rule-based fallbacks).
"""
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.firm import Firm

router = APIRouter()

# ── Request / response models ──────────────────────────────────────

class RegulatoryAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=10, description="Regulatory update text to analyse")
    source: str = Field(default="SRA", description="Regulatory body (SRA, ICO, GOV.UK, Law Society)")

class PolicyGenerationRequest(BaseModel):
    policy_type: str = Field(..., description="Type of policy (e.g. anti-money-laundering, data-protection)")
    additional_context: str = Field(default="", description="Extra requirements or instructions")

class BreachAnalysisRequest(BaseModel):
    breach_id: str = Field(..., description="ID of the breach to analyse")

class ComplianceScanRequest(BaseModel):
    """Optional overrides — if omitted, data is gathered from the database."""
    pass

class RemediationSuggestionRequest(BaseModel):
    compliance_gap: str = Field(..., min_length=5, description="Description of the compliance issue")
    severity: str = Field(default="medium", description="Severity: critical, high, medium, low")
    additional_context: str = Field(default="", description="Extra context")

class KnowledgeQuestionRequest(BaseModel):
    question: str = Field(..., min_length=3, description="Your compliance question")
    conversation_history: list = Field(default=[], description="Prior Q&A for multi-turn context")

class MatterReviewRequest(BaseModel):
    matter_id: str = Field(..., description="ID of the matter to review")

class ICONotificationRequest(BaseModel):
    breach_id: str = Field(..., description="ID of the breach to draft an ICO notification for")


def breach_to_dict(breach) -> dict:
    """Serialize a BreachReport ORM row to a plain dict for AI prompts.

    Kept here (rather than on the model) so the AI service stays free of
    SQLAlchemy imports — the AI prompt code only needs plain dicts.
    """
    def _iso(value):
        if value is None:
            return None
        try:
            return value.isoformat()
        except Exception:
            return str(value)

    return {
        "id": getattr(breach, "id", None),
        "title": getattr(breach, "title", None),
        "description": getattr(breach, "description", None),
        "breach_type": getattr(breach, "breach_type", None),
        "severity": getattr(breach, "severity", None),
        "status": getattr(breach, "status", None),
        "reported_date": _iso(getattr(breach, "reported_date", None)),
        "ico_deadline": _iso(getattr(breach, "ico_deadline", None)),
        "notification_status": getattr(breach, "notification_status", None),
        "affected_records": getattr(breach, "affected_records", None),
        "root_cause": getattr(breach, "root_cause", None),
        "resolution_date": _iso(getattr(breach, "resolution_date", None)),
    }

# ── Helper: get firm object ────────────────────────────────────────

async def _get_firm(db: AsyncSession, firm_id: str) -> Firm:
    result = await db.execute(select(Firm).where(Firm.id == firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    return firm

# ── Helper: gather compliance data for scan/summary ────────────────

async def _gather_compliance_data(db: AsyncSession, firm_id: str) -> dict:
    """Gather live compliance metrics from the database."""
    from services.knowledge_engine import _gather_firm_compliance_data_async
    return await _gather_firm_compliance_data_async(db, firm_id)

# ═══════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@router.post("/ai/analyze-regulatory")
async def analyze_regulatory_update(
    req: RegulatoryAnalysisRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Analyse a regulatory update's impact on the firm using AI."""
    from services.ai_analysis import analyze_regulatory_impact

    firm = await _get_firm(db, current_user.firm_id)
    result = await analyze_regulatory_impact(req.text, req.source, firm)

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_regulatory_analysis",
        entity_type="regulatory_update",
        entity_id=current_user.firm_id,
        user_id=current_user.user_id,
        details=json.dumps({
            "source": req.source,
            "ai_generated": result.get("ai_generated", False),
            "impact_level": result.get("impact_level", "unknown"),
        }),
    )

    return result

@router.post("/ai/analyze-breach")
async def ai_analyze_breach(
    req: BreachAnalysisRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Analyse a breach — ICO notification assessment, SRA implications, remediation."""
    from services.ai_analysis import analyze_breach
    from models.breach import BreachReport

    firm = await _get_firm(db, current_user.firm_id)

    # Fetch the breach from DB
    result_row = await db.execute(
        select(BreachReport).where(
            BreachReport.id == req.breach_id,
            BreachReport.firm_id == current_user.firm_id,
        )
    )
    breach = result_row.scalar_one_or_none()
    if not breach:
        raise HTTPException(status_code=404, detail="Breach not found")

    result = await analyze_breach(
        breach_title=breach.title,
        breach_description=breach.description or "",
        breach_type=breach.breach_type or "data",
        severity=breach.severity or "medium",
        affected_records=breach.affected_records or 0,
        root_cause=breach.root_cause or "",
        firm=firm,
    )

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_breach_analysis",
        entity_type="breach_report",
        entity_id=breach.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "breach_type": breach.breach_type,
            "severity": breach.severity,
            "ai_generated": result.get("ai_generated", False),
            "risk_level": result.get("risk_level", "unknown"),
            "ico_notification_required": result.get("ico_notification_required", None),
        }),
    )

    return result

@router.post("/ai/generate-policy")
async def ai_generate_policy(
    req: PolicyGenerationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate a firm-specific compliance policy using AI."""
    from services.ai_analysis import generate_policy
    from models.policies import PolicyDocument

    firm = await _get_firm(db, current_user.firm_id)
    result = await generate_policy(req.policy_type, firm, req.additional_context)

    # Auto-save as draft policy document
    policy = PolicyDocument(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=result.get("title", f"{req.policy_type.replace('-', ' ').title()} Policy"),
        category=req.policy_type,
        content=result.get("content", ""),
        status="draft",
        version="1.0",
        owner=current_user.user_id,
    )
    db.add(policy)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_policy_generation",
        entity_type="policy",
        entity_id=policy.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "policy_type": req.policy_type,
            "ai_generated": result.get("ai_generated", False),
        }),
    )

    result["policy_id"] = policy.id
    return result

@router.post("/ai/scan-compliance")
async def ai_scan_compliance(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Run an AI-powered comprehensive compliance scan."""
    from services.ai_analysis import scan_compliance
    from models.compliance import ComplianceScanResult

    firm = await _get_firm(db, current_user.firm_id)
    compliance_data = await _gather_compliance_data(db, current_user.firm_id)
    result = await scan_compliance(firm, compliance_data)

    # Store scan result
    scan = ComplianceScanResult(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        scan_date=datetime.now(timezone.utc),
        category="ai_comprehensive_scan",
        check_name="AI Compliance Scan",
        status=result.get("overall_rating", "unknown"),
        details=json.dumps(result),
        recommendation="; ".join(result.get("urgent_actions", [])),
    )
    db.add(scan)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_compliance_scan",
        entity_type="compliance_scan",
        entity_id=scan.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "overall_risk_score": result.get("overall_risk_score"),
            "overall_rating": result.get("overall_rating"),
            "ai_generated": result.get("ai_generated", False),
        }),
    )

    result["scan_id"] = scan.id
    result["compliance_data"] = compliance_data
    return result

@router.post("/ai/suggest-remediation")
async def ai_suggest_remediation(
    req: RemediationSuggestionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get AI-suggested remediation steps for a compliance gap."""
    from services.ai_analysis import suggest_remediation
    from models.remediation import RemediationPlan

    firm = await _get_firm(db, current_user.firm_id)
    result = await suggest_remediation(
        req.compliance_gap, req.severity, firm, req.additional_context
    )

    # Auto-create a draft remediation plan
    plan = RemediationPlan(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=result.get("title", f"Remediation: {req.compliance_gap[:80]}"),
        source="ai_suggestion",
        priority=result.get("priority", req.severity),
        status="pending",
        assigned_to=current_user.user_id,
        steps=json.dumps(result.get("steps", [])),
    )
    db.add(plan)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_remediation_suggestion",
        entity_type="remediation_plan",
        entity_id=plan.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "compliance_gap": req.compliance_gap[:100],
            "severity": req.severity,
            "ai_generated": result.get("ai_generated", False),
        }),
    )

    result["plan_id"] = plan.id
    return result

@router.post("/ai/ask")
async def ai_ask_question(
    req: KnowledgeQuestionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Ask a compliance question — the AI knowledge engine answers with firm context."""
    from services.knowledge_engine import ask_compliance_question, classify_question

    firm = await _get_firm(db, current_user.firm_id)
    topics = classify_question(req.question)

    result = await ask_compliance_question(
        question=req.question,
        firm=firm,
        db=db,
        conversation_history=req.conversation_history,
    )

    result["topics"] = topics

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_knowledge_query",
        entity_type="knowledge_engine",
        entity_id=current_user.firm_id,
        user_id=current_user.user_id,
        details=json.dumps({
            "question": req.question[:200],
            "topics": topics,
            "ai_generated": result.get("ai_generated", False),
            "confidence": result.get("confidence", "unknown"),
        }),
    )

    return result

@router.get("/ai/risk-summary")
async def ai_risk_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get an AI-generated executive risk summary for the COLP dashboard."""
    from services.ai_analysis import generate_risk_summary

    firm = await _get_firm(db, current_user.firm_id)
    compliance_data = await _gather_compliance_data(db, current_user.firm_id)
    result = await generate_risk_summary(firm, compliance_data)

    result["compliance_data"] = compliance_data
    return result

def _matter_to_dict(matter) -> dict:
    """Serialize a Matter ORM row to a plain dict for AI prompts."""
    # Compute age in days from open_date (string) or created_at (datetime).
    age_days = None
    open_date = getattr(matter, "open_date", None)
    if open_date:
        try:
            od = datetime.fromisoformat(str(open_date).replace("Z", "+00:00"))
            if od.tzinfo is None:
                od = od.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - od).days
        except Exception:
            age_days = None
    if age_days is None:
        created = getattr(matter, "created_at", None)
        if created:
            try:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                age_days = (datetime.now(timezone.utc) - created).days
            except Exception:
                age_days = None

    return {
        "id": getattr(matter, "id", None),
        "reference": getattr(matter, "reference", None),
        "client_name": getattr(matter, "client_name", None),
        "matter_type": getattr(matter, "matter_type", None),
        "status": getattr(matter, "status", None),
        "open_date": str(open_date) if open_date else None,
        "age_days": age_days,
        "risk_level": getattr(matter, "risk_level", None),
        "fee_estimate": getattr(matter, "fee_estimate", None),
        "practice_area": getattr(matter, "practice_area", None),
        "title": getattr(matter, "title", None),
    }


async def _load_matter_related(db: AsyncSession, firm_id: str, matter) -> dict:
    """Best-effort loader for records related to a matter.

    Each lookup is wrapped in try/except so that a missing table or column on
    a freshly-seeded firm produces an empty list rather than a 500.
    """
    related: dict = {"cdd_records": [], "conflict_checks": [], "undertakings": [], "checklist_items": []}

    client_name = (getattr(matter, "client_name", None) or "").strip()
    matter_ref = getattr(matter, "reference", None)

    # CDD records — match by case-insensitive client_name contains.
    try:
        from models.aml import CDDRecord
        from sqlalchemy import func as _func
        if client_name:
            rows = (await db.execute(
                select(CDDRecord).where(
                    CDDRecord.firm_id == firm_id,
                    _func.lower(CDDRecord.client_name).contains(client_name.lower()),
                ).limit(20)
            )).scalars().all()
            related["cdd_records"] = [
                {
                    "client_name": r.client_name,
                    "client_type": r.client_type,
                    "cdd_level": r.cdd_level,
                    "risk_level": r.risk_level,
                    "id_verified": r.id_verified,
                    "address_verified": r.address_verified,
                    "sof_verified": r.sof_verified,
                    "status": r.status,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception:
        related["cdd_records"] = []

    # Conflict checks — match by case-insensitive client_name contains.
    try:
        from models.conflicts import ConflictCheck
        from sqlalchemy import func as _func
        if client_name:
            rows = (await db.execute(
                select(ConflictCheck).where(
                    ConflictCheck.firm_id == firm_id,
                    _func.lower(ConflictCheck.client_name).contains(client_name.lower()),
                ).limit(20)
            )).scalars().all()
            related["conflict_checks"] = [
                {
                    "client_name": r.client_name,
                    "matter_type": r.matter_type,
                    "status": r.status,
                    "conflict_type": r.conflict_type,
                    "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception:
        related["conflict_checks"] = []

    # Undertakings — match by matter reference.
    try:
        from models.undertakings import Undertaking
        if matter_ref:
            rows = (await db.execute(
                select(Undertaking).where(
                    Undertaking.firm_id == firm_id,
                    Undertaking.matter_ref == matter_ref,
                ).limit(20)
            )).scalars().all()
            related["undertakings"] = [
                {
                    "description": r.description,
                    "given_to": r.given_to,
                    "given_by": r.given_by,
                    "given_date": r.given_date.isoformat() if r.given_date else None,
                    "due_date": r.due_date.isoformat() if r.due_date else None,
                    "status": r.status,
                    "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                }
                for r in rows
            ]
    except Exception:
        related["undertakings"] = []

    return related


@router.post("/ai/review-matter")
async def ai_review_matter(
    req: MatterReviewRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Review a single matter for compliance gaps using AI."""
    from services.ai_analysis import review_matter
    from models.matters import Matter

    # Load the matter (RLS scopes to firm at the session level, but we also
    # explicitly filter to be defensive against any RLS bypass scenario).
    matter = (await db.execute(
        select(Matter).where(
            Matter.id == req.matter_id,
            Matter.firm_id == current_user.firm_id,
        )
    )).scalar_one_or_none()
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")

    firm = await _get_firm(db, current_user.firm_id)
    related = await _load_matter_related(db, current_user.firm_id, matter)
    result = await review_matter(_matter_to_dict(matter), related, firm)

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_matter_review",
        entity_type="matter",
        entity_id=matter.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "ai_generated": result.get("ai_generated", False),
            "overall_risk": result.get("overall_risk", "unknown"),
            "findings_count": len(result.get("findings", []) or []),
        }),
    )

    return result


@router.post("/ai/draft-ico-notification")
async def ai_draft_ico_notification(
    req: ICONotificationRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Draft an ICO breach notification under UK GDPR Article 33.

    Pulls the breach record + firm context, asks Seema AI to produce a
    structured draft mapped to the ICO breach notification form headings,
    and returns it for the COLP to review and submit.
    """
    from services.ai_analysis import draft_ico_notification
    from models.breach import BreachReport

    breach = (await db.execute(
        select(BreachReport).where(
            BreachReport.id == req.breach_id,
            BreachReport.firm_id == current_user.firm_id,
        )
    )).scalar_one_or_none()
    if not breach:
        raise HTTPException(status_code=404, detail="Breach not found")

    firm = await _get_firm(db, current_user.firm_id)
    result = await draft_ico_notification(breach_to_dict(breach), firm)

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_draft_ico_notification",
        entity_type="breach_report",
        entity_id=breach.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "breach_type": breach.breach_type,
            "severity": breach.severity,
            "ai_generated": result.get("ai_generated", False),
        }),
    )

    return result


@router.get("/ai/status")
async def ai_status():
    """Check whether AI features are available (API key configured)."""
    from services.ai_analysis import _get_client
    client = _get_client()
    return {
        "ai_available": client is not None,
        "model": _ai_model if client else None,
        "features": [
            "regulatory_analysis",
            "breach_analysis",
            "policy_generation",
            "compliance_scan",
            "remediation_suggestion",
            "knowledge_engine",
            "risk_summary",
            "matter_review",
            "draft_ico_notification",
        ] if client else [],
    }
