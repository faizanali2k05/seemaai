"""
Knowledge Engine — Compliance Q&A powered by Claude.

Provides an intelligent Q&A interface where COLPs and compliance staff can ask
natural-language questions about:
  - SRA Standards and Regulations
  - GDPR / Data Protection Act 2018
  - Anti-Money Laundering (POCA, MLR 2017)
  - Professional conduct and ethics
  - Firm-specific compliance status

The engine retrieves relevant firm data from the database, injects it as context,
and sends the query to Claude for a grounded, firm-specific answer.
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from services.ai_analysis import _get_client, _ai_model, _parse_json_response, _build_firm_context

logger = logging.getLogger(__name__)


# ── System prompt for compliance Q&A ───────────────────────────────

KNOWLEDGE_SYSTEM_PROMPT = """You are Seema AI, a specialist compliance assistant for UK solicitors' firms
regulated by the Solicitors Regulation Authority (SRA).

Your knowledge covers:
- SRA Standards and Regulations 2019
- SRA Code of Conduct for Solicitors
- SRA Code of Conduct for Firms
- SRA Accounts Rules 2019
- SRA Transparency Rules
- UK GDPR and Data Protection Act 2018
- Proceeds of Crime Act 2002 (POCA)
- Money Laundering Regulations 2017 (as amended)
- Terrorism Act 2000
- Legal Services Act 2007
- SRA Enforcement Strategy
- ICO enforcement powers and breach notification requirements
- Legal Ombudsman complaints process

When answering questions:
1. Be specific and cite relevant regulations/rules by name and paragraph where possible
2. Tailor advice to the firm's profile (size, practice areas, structure)
3. If the firm's compliance data is provided, reference it in your answer
4. Always note when a question might require formal legal advice
5. Be practical — suggest concrete next steps
6. If you're not sure, say so — never fabricate regulatory references

Return valid JSON:
{
    "answer": "your comprehensive answer in markdown",
    "confidence": "high|medium|low",
    "regulatory_references": ["specific rules/regulations cited"],
    "related_topics": ["up to 3 related compliance areas the user might want to explore"],
    "action_items": ["any concrete actions suggested"],
    "disclaimer": "standard disclaimer if applicable"
}"""


# ── Data gathering helpers ─────────────────────────────────────────

def _gather_firm_compliance_data(session, firm_id: str) -> dict:
    """Gather current compliance metrics from the database for context injection."""
    from models.compliance import ComplianceAlert
    from models.workflow import Deadline
    from models.undertakings import Undertaking
    from models.staff import StaffTraining
    from models.breach import BreachReport
    from models.aml import CDDRecord, SARRecord
    from models.policies import PolicyDocument
    from models.remediation import RemediationPlan
    from models.complaints import Complaint
    from sqlalchemy import select, func

    now = datetime.now(timezone.utc)

    def _count(model, *filters):
        result = session.execute(
            select(func.count()).select_from(model).where(
                model.firm_id == firm_id, *filters
            )
        )
        return result.scalar() or 0

    data = {
        "open_alerts": _count(ComplianceAlert, ComplianceAlert.status == "open"),
        "critical_alerts": _count(ComplianceAlert, ComplianceAlert.status == "open", ComplianceAlert.severity == "critical"),
        "overdue_deadlines": _count(Deadline, Deadline.status.in_(["pending", "in_progress"]), Deadline.due_date < now),
        "upcoming_deadlines_7d": _count(Deadline, Deadline.status.in_(["pending", "in_progress"]), Deadline.due_date <= now + timedelta(days=7), Deadline.due_date >= now),
        "pending_undertakings": _count(Undertaking, Undertaking.status == "pending"),
        "overdue_undertakings": _count(Undertaking, Undertaking.status == "pending", Undertaking.due_date < now),
        "pending_cdd": _count(CDDRecord, CDDRecord.status == "pending"),
        "open_sars": _count(SARRecord, SARRecord.status == "submitted"),
        "open_breaches": _count(BreachReport, BreachReport.status == "open"),
        "overdue_training": _count(StaffTraining, StaffTraining.status == "pending", StaffTraining.due_date < now),
        "overdue_policies": _count(PolicyDocument, PolicyDocument.status == "active", PolicyDocument.next_review < now),
        "active_remediation": _count(RemediationPlan, RemediationPlan.status.in_(["pending", "in_progress"])),
        "open_complaints": _count(Complaint, Complaint.status == "open") if hasattr(Complaint, 'status') else 0,
    }
    return data


async def _gather_firm_compliance_data_async(db, firm_id: str) -> dict:
    """Async version for use in FastAPI endpoints."""
    from models.compliance import ComplianceAlert
    from models.workflow import Deadline
    from models.undertakings import Undertaking
    from models.staff import StaffTraining
    from models.breach import BreachReport
    from models.aml import CDDRecord, SARRecord
    from models.policies import PolicyDocument
    from models.remediation import RemediationPlan
    from sqlalchemy import select, func

    now = datetime.now(timezone.utc)

    async def _count(model, *filters):
        result = await db.execute(
            select(func.count()).select_from(model).where(
                model.firm_id == firm_id, *filters
            )
        )
        return result.scalar() or 0

    data = {
        "open_alerts": await _count(ComplianceAlert, ComplianceAlert.status == "open"),
        "critical_alerts": await _count(ComplianceAlert, ComplianceAlert.status == "open", ComplianceAlert.severity == "critical"),
        "overdue_deadlines": await _count(Deadline, Deadline.status.in_(["pending", "in_progress"]), Deadline.due_date < now),
        "upcoming_deadlines_7d": await _count(Deadline, Deadline.status.in_(["pending", "in_progress"]), Deadline.due_date <= now + timedelta(days=7), Deadline.due_date >= now),
        "pending_undertakings": await _count(Undertaking, Undertaking.status == "pending"),
        "overdue_undertakings": await _count(Undertaking, Undertaking.status == "pending", Undertaking.due_date < now),
        "pending_cdd": await _count(CDDRecord, CDDRecord.status == "pending"),
        "open_sars": await _count(SARRecord, SARRecord.status == "submitted"),
        "open_breaches": await _count(BreachReport, BreachReport.status == "open"),
        "overdue_training": await _count(StaffTraining, StaffTraining.status == "pending", StaffTraining.due_date < now),
        "overdue_policies": await _count(PolicyDocument, PolicyDocument.status == "active", PolicyDocument.next_review < now),
        "active_remediation": await _count(RemediationPlan, RemediationPlan.status.in_(["pending", "in_progress"])),
    }
    return data


# ── Core Q&A function ──────────────────────────────────────────────

async def ask_compliance_question(
    question: str,
    firm,
    db=None,
    compliance_data: dict = None,
    conversation_history: list = None,
) -> dict:
    """Answer a compliance question with firm-specific context.

    Args:
        question: The user's natural-language question.
        firm: Firm ORM object.
        db: Optional async DB session — if provided, gathers live compliance data.
        compliance_data: Pre-gathered compliance data (alternative to db).
        conversation_history: Optional list of prior Q&A pairs for multi-turn.

    Returns:
        dict with structured answer.
    """
    client = _get_client()
    if client is None:
        return _fallback_answer(question)

    firm_context = _build_firm_context(firm)

    # Gather compliance data if DB provided
    if compliance_data is None and db is not None:
        compliance_data = await _gather_firm_compliance_data_async(db, firm.id)

    compliance_context = ""
    if compliance_data:
        compliance_context = f"""
--- CURRENT COMPLIANCE STATUS ---
{json.dumps(compliance_data, indent=2)}
"""

    # Build messages
    messages = []

    # Add conversation history if provided (for multi-turn)
    if conversation_history:
        for entry in conversation_history[-5:]:  # Keep last 5 turns
            if entry.get("question"):
                messages.append({"role": "user", "content": entry["question"]})
            if entry.get("answer"):
                messages.append({"role": "assistant", "content": entry["answer"]})

    user_content = f"""--- FIRM PROFILE ---
{firm_context}
{compliance_context}
--- QUESTION ---
{question}

Return valid JSON only."""

    messages.append({"role": "user", "content": user_content})

    try:
        response = client.messages.create(
            model=_ai_model,
            max_tokens=2048,
            system=KNOWLEDGE_SYSTEM_PROMPT,
            messages=messages,
        )
        text = response.content[0].text
        result = _parse_json_response(text)
        result["ai_generated"] = True
        result["model"] = _ai_model
        result["question"] = question
        result["answered_at"] = datetime.now(timezone.utc).isoformat()
        return result

    except Exception as e:
        logger.error("Knowledge engine query failed: %s", e)
        return _fallback_answer(question)


def _fallback_answer(question: str) -> dict:
    """Provide a basic response when AI is unavailable."""
    q_lower = question.lower()

    # Basic keyword routing to general guidance
    if any(w in q_lower for w in ["aml", "money laundering", "cdd", "sar", "mlro", "proceeds of crime"]):
        topic = "Anti-Money Laundering"
        answer = ("For AML compliance, UK solicitors must comply with the Money Laundering Regulations 2017, "
                  "the Proceeds of Crime Act 2002, and the Terrorism Act 2000. Key obligations include: "
                  "appointing an MLRO, conducting client due diligence (CDD), filing Suspicious Activity Reports "
                  "(SARs) where required, maintaining records for 5 years, and providing annual AML training to staff. "
                  "Enhanced due diligence is required for high-risk clients, PEPs, and clients from high-risk jurisdictions.")
        refs = ["Money Laundering Regulations 2017", "Proceeds of Crime Act 2002", "SRA Code of Conduct para 7.5"]

    elif any(w in q_lower for w in ["gdpr", "data protection", "breach", "ico", "subject access"]):
        topic = "Data Protection"
        answer = ("Under UK GDPR and the Data Protection Act 2018, solicitors must: process personal data lawfully "
                  "and transparently, implement appropriate security measures, respond to subject access requests "
                  "within one calendar month, report qualifying data breaches to the ICO within 72 hours, and "
                  "maintain records of processing activities. The ICO can impose fines of up to £17.5 million "
                  "for serious breaches.")
        refs = ["UK GDPR", "Data Protection Act 2018", "SRA Code of Conduct para 6.3-6.5"]

    elif any(w in q_lower for w in ["undertaking", "undertake"]):
        topic = "Undertakings"
        answer = ("Professional undertakings are binding obligations. Under SRA rules, failure to honour an "
                  "undertaking is a serious matter that may lead to disciplinary action. Undertakings should be "
                  "recorded, tracked, and fulfilled within the agreed timeframe. The firm should maintain a "
                  "register of all undertakings given and received.")
        refs = ["SRA Code of Conduct para 1.3", "SRA Standards and Regulations"]

    elif any(w in q_lower for w in ["sra", "regulation", "standard", "code of conduct"]):
        topic = "SRA Regulation"
        answer = ("The SRA Standards and Regulations (November 2019) set out the requirements for solicitors "
                  "and firms. Key areas include: the SRA Principles (7 overarching principles), the Code of "
                  "Conduct for Solicitors, the Code of Conduct for Firms, the SRA Accounts Rules, and the "
                  "Transparency Rules. Every firm must have a COLP (Compliance Officer for Legal Practice) "
                  "and a COFA (Compliance Officer for Finance and Administration).")
        refs = ["SRA Standards and Regulations 2019", "SRA Principles", "SRA Code of Conduct for Firms"]

    elif any(w in q_lower for w in ["complaint", "ombudsman", "client care"]):
        topic = "Complaints & Client Care"
        answer = ("Firms must have a written complaints procedure and inform clients of their right to complain "
                  "to the Legal Ombudsman. Complaints must be acknowledged promptly and resolved within 8 weeks. "
                  "If unresolved, clients can escalate to the Legal Ombudsman within 6 months. The firm must "
                  "also comply with SRA Transparency Rules regarding published complaints data.")
        refs = ["SRA Code of Conduct para 8.1-8.5", "Legal Ombudsman Scheme Rules"]

    else:
        topic = "General Compliance"
        answer = ("I can help with questions about SRA regulations, GDPR/data protection, anti-money laundering, "
                  "professional conduct, undertakings, complaints handling, and other compliance areas for UK "
                  "solicitors' firms. Please configure your ANTHROPIC_API_KEY for AI-powered, firm-specific "
                  "answers, or ask a more specific question about a compliance topic.")
        refs = []

    return {
        "answer": answer,
        "confidence": "low",
        "regulatory_references": refs,
        "related_topics": [topic, "SRA Standards and Regulations", "Firm Compliance"],
        "action_items": ["Configure ANTHROPIC_API_KEY for AI-powered compliance guidance"],
        "disclaimer": "This is general guidance only. For specific legal advice, consult a compliance specialist.",
        "ai_generated": False,
        "question": question,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Topic classification (for routing and analytics) ───────────────

COMPLIANCE_TOPICS = {
    "aml": ["aml", "money laundering", "cdd", "sar", "mlro", "proceeds of crime", "pep", "sanctions", "terrorist financing"],
    "data_protection": ["gdpr", "data protection", "breach", "ico", "subject access", "dsar", "privacy", "personal data"],
    "sra": ["sra", "regulation", "standard", "code of conduct", "colp", "cofa", "practising certificate"],
    "accounts": ["client money", "client account", "accounts rules", "reconciliation", "cofa"],
    "undertakings": ["undertaking", "undertake", "promise"],
    "complaints": ["complaint", "ombudsman", "client care", "dissatisfied"],
    "training": ["training", "cpd", "competence", "supervision"],
    "conflicts": ["conflict", "conflict of interest", "duty to client"],
    "professional_conduct": ["conduct", "ethics", "integrity", "principle", "professional"],
}


def classify_question(question: str) -> list[str]:
    """Classify a question into compliance topic areas."""
    q_lower = question.lower()
    topics = []
    for topic, keywords in COMPLIANCE_TOPICS.items():
        if any(kw in q_lower for kw in keywords):
            topics.append(topic)
    return topics or ["general"]
