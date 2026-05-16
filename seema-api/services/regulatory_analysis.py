"""Regulatory analysis service — AI-powered firm-specific interpretation.

Takes a regulatory notice and the firm's profile, sends both to the Anthropic
API, and parses the structured response into:
  - Summary
  - Applicability (yes / no / maybe + reasoning)
  - Action items
  - Source citation
  - Confidence score (0.0-1.0) + label (high/medium/low)
"""
import json
import logging
import time
import uuid
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

INTERPRETATION_PROMPT = """You are a UK legal compliance analyst specialising in SRA-regulated law firms.

A new regulatory notice has been published. Analyse it in the context of the firm profile provided and produce a structured assessment.

## Regulatory Notice
- **Source**: {source} ({source_url})
- **Title**: {title}
- **Published**: {published_date}
- **Category**: {category}
- **Content**: {body}

## Firm Profile
- **Firm Name**: {firm_name}
- **SRA Number**: {sra_number}
- **Practice Areas**: {practice_areas}
- **Firm Size**: {firm_size} staff members
- **Subscription Tier**: {subscription_tier}

## Your Task
Produce a JSON response with exactly these fields:

{{
  "summary": "A clear, 2-3 sentence plain-English summary of what this notice means. Avoid jargon. Write as if briefing a busy partner.",
  "applicability": "yes" | "no" | "maybe",
  "applicability_reasoning": "1-2 sentences explaining WHY this does or doesn't apply to this specific firm, referencing their practice areas and size.",
  "action_items": ["Specific action item 1", "Specific action item 2", ...],
  "source_citation": "Formatted citation: [Source Name], '[Title]', published [date]. Available at: [URL]",
  "confidence_score": 0.0 to 1.0,
  "confidence_label": "high" | "medium" | "low"
}}

Rules:

### Applicability
- "yes" ONLY when the notice creates a concrete obligation, changes an existing rule, or explicitly requires firms to do something by a date. The notice must contain a clear "you must" or "firms are required to" or equivalent mandatory language.
- "no" when the notice is about a practice area the firm doesn't handle, or when the notice explicitly states it does not apply to firms like this one.
- "maybe" for everything else — including: discussion papers, pre-announcements, consultations with no clear legal-sector impact, reports with soft "should consider" language, notices where full details are pending, and notices that are tangentially related but not directly relevant.
- When in doubt between "yes" and "maybe", ALWAYS choose "maybe". Overcalling applicability erodes trust.

### Confidence calibration — BE HONEST ABOUT UNCERTAINTY
- "high" (0.8-1.0): Reserve for clear-cut cases ONLY — e.g. a mandatory AML rule change that obviously applies, or a niche practice area notice that obviously doesn't. You should be RARE with high confidence.
- "medium" (0.5-0.79): The default for most notices. Use when the notice is relevant but the firm's obligation is unclear, the notice uses soft/aspirational language, or when you are making reasonable inferences.
- "low" (0.0-0.49): Use when the notice lacks sufficient detail to assess (e.g. pre-announcements, placeholder notices), when the connection to this firm is speculative, or when you are guessing.
- CRITICAL: If the notice itself says "no action required at this time" or "further details to follow", your confidence CANNOT be "high". The source is telling you the picture is incomplete.
- If applicability is "maybe", confidence_score should almost never exceed 0.75. You are uncertain — your score must reflect that.
- STRONGER: If the notice explicitly disclaims obligation (phrases like "no new regulatory obligations", "not required to respond", "no action required at this time"), confidence MUST be 0.65 or below, regardless of applicability. When the source itself says nothing is required, you cannot be 70%+ confident that something is relevant.

### Informational notices
- If the notice is purely informational or educational (e.g. exam results, appointment announcements, statistical reports, annual data reports, discussion papers) with NO compliance obligation, regulatory change, or required action, applicability should be "no" or "maybe" — never "yes".
- Soft language like "firms should reflect", "consider whether", "be aware" does NOT create an obligation. Do not treat aspirational suggestions as requirements.

### Pre-announcements and incomplete notices
- If a notice announces upcoming changes but provides no details of what those changes are, applicability should be "maybe" and confidence should be "low" (0.3-0.49). You cannot assess impact without knowing what the change is.
- Do NOT invent specific action items for notices that lack specific content. "Monitor for further details" is the appropriate action.

### Action items
- Must be specific and actionable (e.g. "Review your AML policy by [date]" not "Consider implications").
- If the notice is informational, a pre-announcement, or has no required action, provide at most 1-2 awareness items (e.g. "Monitor for the full announcement expected in [timeframe]").
- Do NOT generate 3+ action items for a notice that explicitly says no action is required.

### Incomplete firm profiles
- If the firm profile is missing key data (practice areas are blank/N/A, firm size is 0, SRA number is missing), you MUST:
  1. Explicitly state in applicability_reasoning what data is missing and how it limits your assessment (e.g. "Without knowing this firm's practice areas, I cannot determine whether they handle the high-risk work mentioned in this notice").
  2. Lower your confidence proportionally. Missing practice areas alone should cap confidence at 0.70. Missing practice areas AND firm size should cap at 0.55. If 3+ fields are missing, confidence should be 0.50 or below.
  3. Use "maybe" for applicability when practice areas are unknown — even for notices that apply to "all firms" — because you cannot assess the firm-specific impact without knowing what the firm does.
  4. Do NOT assume a firm handles specific practice areas based on its name. A firm called "Henderson & Clarke Solicitors" could do anything — do not infer conveyancing, family law, or any other area unless explicitly stated in the profile.
  5. Keep action items generic when the profile is incomplete (e.g. "Confirm whether your firm handles financial transactions or property work, and if so, review sanctions screening procedures"). Do not write firm-specific action items when you don't know what the firm does.

### Summary language
- When applicability is "maybe", the summary MUST include hedging language (e.g. "may affect", "could potentially", "firms should monitor", "it is unclear whether"). Do not write definitive summaries for uncertain assessments.

- Respond with ONLY the JSON object, no markdown fences, no preamble."""


# ---------------------------------------------------------------------------
# Core interpretation function
# ---------------------------------------------------------------------------

def interpret(session: Session, update_id: str, firm_id: str) -> dict:
    """Generate an AI interpretation for a regulatory update + firm pair.

    Creates or updates a RegulatoryInterpretation record.
    Returns the interpretation data dict.
    """
    from models.regulatory import RegulatoryUpdate, RegulatoryInterpretation
    from models.firm import Firm
    from models.staff import StaffMember
    from config import get_settings
    from sqlalchemy import func

    settings = get_settings()

    # Fetch the notice
    update = session.query(RegulatoryUpdate).filter_by(id=update_id).first()
    if not update:
        raise ValueError(f"Regulatory update {update_id} not found")

    # Fetch firm profile
    firm = session.query(Firm).filter_by(id=firm_id).first()
    if not firm:
        raise ValueError(f"Firm {firm_id} not found")

    # Count staff
    staff_count = session.query(func.count(StaffMember.id)).filter_by(
        firm_id=firm_id, status="active"
    ).scalar() or 0

    # Check for existing interpretation
    interp = session.query(RegulatoryInterpretation).filter_by(
        update_id=update_id, firm_id=firm_id
    ).first()

    if not interp:
        interp = RegulatoryInterpretation(
            id=str(uuid.uuid4()),
            firm_id=firm_id,
            update_id=update_id,
            summary="",
            applicability="maybe",
            status="processing",
        )
        session.add(interp)
        session.flush()
    else:
        interp.status = "processing"
        interp.error_message = None
        session.flush()

    # Build the prompt
    practice_areas_str = ", ".join(firm.practice_areas.split(",")) if firm.practice_areas else "General practice"

    prompt = INTERPRETATION_PROMPT.format(
        source=update.source.upper(),
        source_url=update.source_url or "N/A",
        title=update.title,
        published_date=update.published_date or "Unknown",
        category=update.category or "General",
        body=update.body or update.summary or update.title,
        firm_name=firm.name or "Unknown",
        sra_number=firm.sra_number or "N/A",
        practice_areas=practice_areas_str,
        firm_size=staff_count,
        subscription_tier=firm.subscription_tier or "essentials",
    )

    # Call the Anthropic API
    if not settings.ANTHROPIC_API_KEY:
        # No API key — produce a fallback interpretation
        return _fallback_interpretation(session, interp, update)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        start_time = time.time()
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        elapsed_ms = int((time.time() - start_time) * 1000)

        # Parse the response
        raw_text = response.content[0].text.strip()

        # Strip markdown fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        data = json.loads(raw_text)

        # Populate the interpretation record
        interp.summary = data.get("summary", "")
        interp.applicability = data.get("applicability", "maybe")
        interp.applicability_reasoning = data.get("applicability_reasoning", "")
        interp.action_items = json.dumps(data.get("action_items", []))
        interp.source_citation = data.get("source_citation", "")
        interp.confidence_score = float(data.get("confidence_score", 0.5))
        interp.confidence_label = data.get("confidence_label", "medium")
        interp.model_used = "claude-sonnet-4-5-20250929"
        interp.prompt_tokens = response.usage.input_tokens
        interp.completion_tokens = response.usage.output_tokens
        interp.processing_time_ms = elapsed_ms
        interp.status = "completed"

        session.flush()

        return {
            "id": interp.id,
            "update_id": update_id,
            "firm_id": firm_id,
            "summary": interp.summary,
            "applicability": interp.applicability,
            "applicability_reasoning": interp.applicability_reasoning,
            "action_items": data.get("action_items", []),
            "source_citation": interp.source_citation,
            "confidence_score": interp.confidence_score,
            "confidence_label": interp.confidence_label,
            "status": "completed",
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        interp.status = "failed"
        interp.error_message = f"JSON parse error: {e}"
        session.flush()
        raise

    except Exception as e:
        logger.error(f"AI interpretation failed: {e}")
        interp.status = "failed"
        interp.error_message = str(e)
        session.flush()
        raise


def _fallback_interpretation(session: Session, interp, update) -> dict:
    """Produce a basic interpretation without the AI API (dev/demo mode)."""
    interp.summary = (
        f"New regulatory notice from {update.source.upper()}: {update.title}. "
        f"Review the full notice to determine impact on your firm."
    )
    interp.applicability = "maybe"
    interp.applicability_reasoning = (
        "Automated analysis unavailable — the Anthropic API key is not configured. "
        "Please review this notice manually or configure ANTHROPIC_API_KEY for AI-powered analysis."
    )
    interp.action_items = json.dumps([
        f"Read the full notice at {update.source_url}" if update.source_url else "Locate and read the original notice",
        "Assess whether this affects your firm's practice areas",
        "If applicable, update relevant compliance policies",
    ])
    interp.source_citation = (
        f"{update.source.upper()}, '{update.title}', "
        f"published {update.published_date or 'date unknown'}. "
        f"Available at: {update.source_url or 'URL not available'}"
    )
    interp.confidence_score = 0.2
    interp.confidence_label = "low"
    interp.model_used = "fallback"
    interp.status = "completed"

    session.flush()

    return {
        "id": interp.id,
        "update_id": interp.update_id,
        "firm_id": interp.firm_id,
        "summary": interp.summary,
        "applicability": interp.applicability,
        "applicability_reasoning": interp.applicability_reasoning,
        "action_items": json.loads(interp.action_items),
        "source_citation": interp.source_citation,
        "confidence_score": interp.confidence_score,
        "confidence_label": interp.confidence_label,
        "status": "completed",
    }


def get_interpretation(session: Session, update_id: str, firm_id: str) -> Optional[dict]:
    """Fetch an existing interpretation if available."""
    from models.regulatory import RegulatoryInterpretation

    interp = session.query(RegulatoryInterpretation).filter_by(
        update_id=update_id, firm_id=firm_id
    ).first()

    if not interp:
        return None

    action_items = []
    if interp.action_items:
        try:
            action_items = json.loads(interp.action_items)
        except json.JSONDecodeError:
            action_items = [interp.action_items]

    return {
        "id": interp.id,
        "update_id": interp.update_id,
        "firm_id": interp.firm_id,
        "summary": interp.summary,
        "applicability": interp.applicability,
        "applicability_reasoning": interp.applicability_reasoning,
        "action_items": action_items,
        "source_citation": interp.source_citation,
        "confidence_score": interp.confidence_score,
        "confidence_label": interp.confidence_label,
        "model_used": interp.model_used,
        "processing_time_ms": interp.processing_time_ms,
        "status": interp.status,
        "error_message": interp.error_message,
        "created_at": interp.created_at.isoformat() if interp.created_at else None,
    }
