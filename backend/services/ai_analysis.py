"""
AI Analysis Service — Claude-powered compliance intelligence for Seema.

Provides:
  - Regulatory impact analysis (when new SRA/ICO/FCA updates arrive)
  - Policy document generation (firm-specific, not templates)
  - Compliance scan analysis (matter-level risk assessment)
  - Remediation plan suggestion (AI-generated action steps)
  - Risk scoring and executive summaries

All functions accept firm context and return structured JSON-parseable results.
Gracefully degrades when ANTHROPIC_API_KEY is not configured.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Lazy client initialisation ─────────────────────────────────────
# Provider-agnostic: the service prefers OpenAI when AI_PROVIDER=openai and an
# OPENAI_API_KEY is set, and falls back to Anthropic, then to rule-based
# responses. All call sites go through `_call_ai()` so the rest of the file is
# unaffected by which provider is active. (`_call_claude` kept as an alias.)
_client = None
_ai_model = None
_ai_provider = None


def _get_client():
    """Lazily initialise the AI client (OpenAI or Anthropic)."""
    global _client, _ai_model, _ai_provider
    if _client is not None:
        return _client

    from config import get_settings
    settings = get_settings()

    provider = (getattr(settings, "AI_PROVIDER", "openai") or "openai").lower()

    # ── OpenAI ──
    if provider == "openai" and settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            _client = OpenAI(api_key=settings.OPENAI_API_KEY)
            _ai_model = getattr(settings, "OPENAI_MODEL", "gpt-4o")
            _ai_provider = "openai"
            logger.info("OpenAI client initialised (model: %s)", _ai_model)
            return _client
        except ImportError:
            logger.error("openai package not installed — pip install openai")
        except Exception as e:
            logger.error("Failed to initialise OpenAI client: %s", e)

    # ── Anthropic (fallback) ──
    if settings.ANTHROPIC_API_KEY:
        try:
            from anthropic import Anthropic
            _client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            _ai_model = getattr(settings, "AI_MODEL", "claude-sonnet-4-6")
            _ai_provider = "anthropic"
            logger.info("Anthropic client initialised (model: %s)", _ai_model)
            return _client
        except ImportError:
            logger.error("anthropic package not installed — pip install anthropic")
        except Exception as e:
            logger.error("Failed to initialise Anthropic client: %s", e)

    logger.warning("No AI provider configured — AI features will return fallback responses")
    return None


def _call_ai(system_prompt: str, user_prompt: str, max_tokens: int = 2048) -> Optional[str]:
    """Send a prompt to the active AI provider and return the text response."""
    client = _get_client()
    if client is None:
        return None

    try:
        if _ai_provider == "openai":
            response = client.chat.completions.create(
                model=_ai_model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content
        # Anthropic
        response = client.messages.create(
            model=_ai_model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text
    except Exception as e:
        logger.error("AI API call failed (%s): %s", _ai_provider, e)
        return None


# Backwards-compatible alias — existing call sites use `_call_claude`.
_call_claude = _call_ai


def _call_ai_messages(system_prompt: str, messages: list, max_tokens: int = 2048) -> Optional[str]:
    """Multi-turn variant of _call_ai. `messages` is a list of
    {"role": "user"|"assistant", "content": str}. The system prompt is applied
    in the way each provider expects."""
    client = _get_client()
    if client is None:
        return None

    try:
        if _ai_provider == "openai":
            response = client.chat.completions.create(
                model=_ai_model,
                max_tokens=max_tokens,
                messages=[{"role": "system", "content": system_prompt}, *messages],
            )
            return response.choices[0].message.content
        # Anthropic
        response = client.messages.create(
            model=_ai_model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        logger.error("AI API call failed (%s): %s", _ai_provider, e)
        return None


def get_active_model() -> Optional[str]:
    """Return the active model id (initialising the client if needed)."""
    if _client is None:
        _get_client()
    return _ai_model


def _parse_json_response(text: str) -> dict:
    """Extract JSON from Claude's response (handles markdown fences).

    When the model's `content` field contains markdown with unescaped quotes
    or literal newlines, `json.loads` fails. In that case we fall back to a
    regex extraction of the `"content":` field (and any siblings we can
    cheaply recover) so callers don't see the raw JSON wrapper.
    """
    import re

    if not text:
        return {}
    # Strip markdown code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove the first line (```json) and the closing ``` line.
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Salvage path: regex out the `content` field. Claude usually escapes
    # newlines as \n inside the JSON string but leaves quotes raw if the
    # markdown body contains them — `json.loads` chokes on the unescaped
    # quotes. We grab everything between `"content": "` and the next
    # unescaped `",` followed by a key (e.g. `"review_frequency_months":`).
    logger.warning("Claude response was not strict JSON — attempting field salvage")
    out: dict = {}

    # Title
    m = re.search(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"', cleaned)
    if m:
        out["title"] = m.group(1).encode().decode("unicode_escape", errors="ignore")

    # Content — greedy match up to the next sibling key OR end of object.
    m = re.search(
        r'"content"\s*:\s*"(.*?)"\s*,\s*"(?:review_frequency_months|regulatory_references|key_sections|ai_generated|model|policy_type)"',
        cleaned, re.DOTALL,
    )
    if not m:
        # Fall back to: content up to the closing brace.
        m = re.search(r'"content"\s*:\s*"(.*?)"\s*\}\s*\Z', cleaned, re.DOTALL)
    if m:
        # Decode escape sequences (\n, \", \\) back to real characters.
        raw = m.group(1)
        try:
            out["content"] = raw.encode().decode("unicode_escape")
        except Exception:
            out["content"] = raw

    # Review frequency
    m = re.search(r'"review_frequency_months"\s*:\s*(\d+)', cleaned)
    if m:
        out["review_frequency_months"] = int(m.group(1))

    # If we still have nothing useful, return raw_text so the caller can
    # decide how to handle it.
    if not out.get("content"):
        out["raw_text"] = text
    return out


# ── Firm context builder ───────────────────────────────────────────

def _build_firm_context(firm) -> str:
    """Build a concise firm profile string for prompt context."""
    practice_areas = "general practice"
    if firm.practice_areas:
        try:
            areas = json.loads(firm.practice_areas)
            if areas:
                practice_areas = ", ".join(areas)
        except (json.JSONDecodeError, TypeError):
            pass

    return (
        f"Firm: {firm.name}\n"
        f"SRA Number: {firm.sra_number}\n"
        f"Size: {firm.firm_size or 'unknown'} staff\n"
        f"Practice Areas: {practice_areas}\n"
        f"COLP: {firm.colp_name or 'not set'}\n"
        f"COFA: {firm.cofa_name or 'not set'}\n"
        f"MLRO: {firm.mlro_name or 'not set'}\n"
        f"Subscription: {firm.subscription_tier or 'essentials'}\n"
    )


# ═══════════════════════════════════════════════════════════════════
# 1. REGULATORY IMPACT ANALYSIS
# ═══════════════════════════════════════════════════════════════════

REGULATORY_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance expert specialising in SRA regulations,
GDPR/ICO requirements, anti-money laundering (AML), and Law Society guidance for solicitors' firms.

You are speaking to law firms — they will use your output in regulatory filings,
attendance notes, and decisions that could expose them to professional liability.
You MUST cite authority for every claim. If you cannot cite a specific provision,
say so explicitly rather than guessing.

Return valid JSON with this exact structure:
{
    "summary": "2-3 sentence plain-English summary of what changed",
    "impact_level": "high|medium|low",
    "affected_practice_areas": ["list of practice areas affected"],
    "affected_policies": ["list of internal policies that may need updating"],
    "key_deadlines": ["any compliance deadlines mentioned, with dates if available"],
    "recommended_actions": [
        {"action": "what to do", "priority": "high|medium|low", "deadline_days": 30}
    ],
    "staff_to_notify": ["roles that should be informed, e.g. COLP, MLRO, all solicitors"],
    "risk_if_ignored": "what happens if the firm takes no action",
    "source_citation": "REQUIRED. Full legal-citation form, e.g. 'SRA Code of Conduct for Solicitors 2019, paragraph 6.3' or 'UK GDPR Article 33'. If the source is a regulator notice rather than codified rule, cite as 'SRA, \\"Notice title\\", published [date]'. Never leave this empty — if you genuinely cannot identify a citable authority, return 'Authority not identified — verify against the primary source URL before relying on this interpretation.'"
}

Be specific to UK law. Reference SRA Standards and Regulations, SRA Code of Conduct,
SRA Accounts Rules, UK GDPR, Data Protection Act 2018, Proceeds of Crime Act 2002,
Money Laundering Regulations 2017, and other relevant legislation. Cite by section
or paragraph number, not just by Act name."""


async def analyze_regulatory_impact(
    regulatory_text: str,
    regulatory_source: str,
    firm,
) -> dict:
    """Analyse a regulatory update's impact on a specific firm.

    Args:
        regulatory_text: The full text or summary of the regulatory update.
        regulatory_source: Source body (SRA, ICO, GOV.UK, Law Society).
        firm: Firm ORM object with profile data.

    Returns:
        dict with impact analysis or fallback response.
    """
    firm_context = _build_firm_context(firm)

    user_prompt = f"""Analyse this regulatory update for the following law firm:

--- FIRM PROFILE ---
{firm_context}

--- REGULATORY UPDATE ---
Source: {regulatory_source}
Date: {datetime.utcnow().strftime('%d %B %Y')}

{regulatory_text}

--- INSTRUCTIONS ---
Assess the impact on this specific firm given their size, practice areas, and compliance structure.
Return your analysis as valid JSON only (no markdown, no explanation outside the JSON)."""

    text = _call_claude(REGULATORY_SYSTEM_PROMPT, user_prompt, max_tokens=1500)
    if text is None:
        return _fallback_regulatory_analysis(regulatory_text, regulatory_source)

    result = _parse_json_response(text)
    result["ai_generated"] = True
    result["model"] = _ai_model
    return result


def _fallback_regulatory_analysis(text: str, source: str) -> dict:
    """Fallback when AI is unavailable — basic keyword-based analysis."""
    text_lower = text.lower()
    impact = "medium"
    if any(w in text_lower for w in ["mandatory", "enforcement", "fine", "penalty", "deadline"]):
        impact = "high"
    elif any(w in text_lower for w in ["consultation", "guidance", "proposed"]):
        impact = "low"

    return {
        "summary": f"New regulatory update from {source}. Review required.",
        "impact_level": impact,
        "affected_practice_areas": ["all"],
        "affected_policies": [],
        "key_deadlines": [],
        "recommended_actions": [
            {"action": f"Review the {source} update and assess firm impact", "priority": "medium", "deadline_days": 14}
        ],
        "staff_to_notify": ["COLP"],
        "risk_if_ignored": "Potential non-compliance if update introduces new requirements.",
        "ai_generated": False,
    }


# ═══════════════════════════════════════════════════════════════════
# 2. POLICY GENERATION
# ═══════════════════════════════════════════════════════════════════

POLICY_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance policy drafter.
You create professional, firm-specific compliance policies for solicitors' firms
regulated by the SRA.

Return ONLY the policy text as markdown. Do NOT wrap your response in JSON or
code fences. Start directly with the policy title as a markdown H1 heading.

Policies must:
- Start with a markdown H1 title (# Title)
- Reference specific SRA Standards and Regulations where relevant
- Be practical and proportionate to firm size
- Include clear responsibilities (COLP, COFA, MLRO where relevant)
- Specify review frequency near the end
- Use plain English suitable for all staff levels
- Include a version control section at the bottom"""


async def generate_policy(
    policy_type: str,
    firm,
    additional_context: str = "",
) -> dict:
    """Generate a firm-specific compliance policy using AI.

    Args:
        policy_type: Type of policy (e.g. "anti-money-laundering", "data-protection").
        firm: Firm ORM object.
        additional_context: Any extra requirements from the user.

    Returns:
        dict with generated policy content or fallback template.
    """
    firm_context = _build_firm_context(firm)

    user_prompt = f"""Generate a comprehensive {policy_type.replace('-', ' ')} policy for this firm:

--- FIRM PROFILE ---
{firm_context}

--- ADDITIONAL REQUIREMENTS ---
{additional_context or 'None specified — use standard best practice.'}

--- INSTRUCTIONS ---
Create a complete, ready-to-use policy document appropriate for this firm's size and practice areas.
Return as valid JSON only."""

    # 8192 tokens gives comfortable room for a multi-page firm policy without
    # truncation. The previous 4096 cap caused mid-response truncation which
    # broke JSON parsing — now that we ask for plain markdown that's moot,
    # but we still want full policies.
    text = _call_claude(POLICY_SYSTEM_PROMPT, user_prompt, max_tokens=8192)
    if text is None:
        return _fallback_policy(policy_type, firm)

    # The prompt now asks for raw markdown. Defensively strip any ```markdown
    # / ```json fences Claude might still wrap in.
    content = text.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines).strip()
    # If we somehow got JSON anyway, try to pull `content` out.
    if content.startswith("{") and '"content"' in content[:200]:
        import re as _re
        m = _re.search(r'"content"\s*:\s*"(.*?)"\s*[,}]', content, _re.DOTALL)
        if m:
            try:
                content = m.group(1).encode().decode("unicode_escape")
            except Exception:
                content = m.group(1)

    # Derive a title from the first markdown heading if present.
    derived_title = f"{policy_type.replace('-', ' ').title()} Policy"
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            derived_title = stripped.lstrip("# ").strip()
            break

    return {
        "title": derived_title,
        "content": content,
        "review_frequency_months": 12,
        "regulatory_references": [],
        "key_sections": [],
        "ai_generated": True,
        "model": _ai_model,
        "policy_type": policy_type,
    }


def _fallback_policy(policy_type: str, firm) -> dict:
    """Return a basic template when AI is unavailable."""
    title = f"{policy_type.replace('-', ' ').title()} Policy"
    templates = {
        "anti-money-laundering": f"""# {title}\n\n## 1. Purpose\nThis policy sets out {firm.name}'s procedures for complying with anti-money laundering legislation including the Proceeds of Crime Act 2002, the Terrorism Act 2000, and the Money Laundering Regulations 2017.\n\n## 2. MLRO\nThe firm's Money Laundering Reporting Officer is {firm.mlro_name or '[TO BE APPOINTED]'}.\n\n## 3. Client Due Diligence\nAll new clients must undergo CDD before the firm accepts instructions.\n\n## 4. Suspicious Activity Reports\nAny member of staff who suspects money laundering must report to the MLRO immediately.\n\n## 5. Record Keeping\nAll CDD records must be retained for 5 years after the end of the business relationship.\n\n## 6. Training\nAll staff must complete AML training annually.\n\n## 7. Review\nThis policy will be reviewed annually by the COLP.""",

        "data-protection": f"""# {title}\n\n## 1. Purpose\nThis policy sets out {firm.name}'s procedures for complying with the UK GDPR and Data Protection Act 2018.\n\n## 2. Data Protection Officer\nThe firm's data protection lead is {firm.colp_name or '[TO BE APPOINTED]'}.\n\n## 3. Lawful Basis\nThe firm processes personal data under legitimate interest and contractual necessity.\n\n## 4. Data Subject Rights\nThe firm will respond to subject access requests within one calendar month.\n\n## 5. Breach Notification\nData breaches must be reported to the ICO within 72 hours where there is a risk to individuals.\n\n## 6. Review\nThis policy will be reviewed annually.""",

        "client-care": f"""# {title}\n\n## 1. Purpose\nThis policy ensures {firm.name} provides clear information to clients in accordance with SRA Transparency Rules.\n\n## 2. Client Information\nAll clients will receive a client care letter setting out costs, complaints procedure, and regulatory information.\n\n## 3. Complaints\nClients may complain to the Legal Ombudsman if dissatisfied with the firm's handling of their complaint.\n\n## 4. Review\nThis policy will be reviewed annually by the COLP.""",
    }

    content = templates.get(policy_type, f"# {title}\n\n[This is a template policy for {firm.name}. Configure ANTHROPIC_API_KEY for AI-generated, firm-specific policies.]\n\n## 1. Purpose\n\n## 2. Scope\n\n## 3. Procedures\n\n## 4. Responsibilities\n\n## 5. Review\nThis policy will be reviewed annually.")

    return {
        "title": title,
        "content": content,
        "review_frequency_months": 12,
        "regulatory_references": [],
        "key_sections": [],
        "ai_generated": False,
        "policy_type": policy_type,
    }


# ═══════════════════════════════════════════════════════════════════
# 2b. BREACH ANALYSIS
# ═══════════════════════════════════════════════════════════════════

BREACH_ANALYSIS_SYSTEM_PROMPT = """You are Seema AI, a UK data protection and compliance expert
specialising in breach assessment for solicitors' firms regulated by the SRA.

When analysing a breach, you MUST return valid JSON with this exact structure:
{
    "risk_level": "critical|high|medium|low",
    "ico_notification_required": true|false,
    "ico_notification_reasoning": "Detailed reasoning citing UK GDPR Article 33, explaining why ICO notification is or is not required. Be specific about the risk to individuals' rights and freedoms.",
    "sra_implications": "Assessment of SRA Code of Conduct implications, citing specific paragraphs. Include whether COLP self-report to SRA is required under Rule 3.9.",
    "recommended_actions": [
        {"action": "specific action", "priority": "critical|high|medium", "deadline": "Immediate|24 hours|48 hours|7 days|14 days|30 days"}
    ],
    "root_cause_analysis": "Analysis of the systemic factors that led to this breach, not just the immediate cause.",
    "similar_risk_areas": ["other areas of the firm's operations that may have similar vulnerabilities"]
}

Be specific to UK law. Reference UK GDPR, DPA 2018, SRA Standards and Regulations,
SRA Code of Conduct, and SRA Accounts Rules where applicable.
ICO notification is required under Article 33 unless the breach is unlikely to result
in a risk to the rights and freedoms of natural persons."""


async def analyze_breach(
    breach_title: str,
    breach_description: str,
    breach_type: str,
    severity: str,
    affected_records: int,
    root_cause: str,
    firm,
) -> dict:
    """Analyse a breach and provide ICO notification assessment and remediation guidance.

    Args:
        breach_title: Title/summary of the breach.
        breach_description: Full description.
        breach_type: Type (data, regulatory, conduct).
        severity: Severity level.
        affected_records: Number of affected records.
        root_cause: Known root cause if any.
        firm: Firm ORM object with profile data.

    Returns:
        dict with breach analysis or fallback response.
    """
    firm_context = _build_firm_context(firm)

    user_prompt = f"""Analyse this breach for the following law firm:

--- FIRM PROFILE ---
{firm_context}

--- BREACH DETAILS ---
Title: {breach_title}
Type: {breach_type}
Severity: {severity}
Description: {breach_description or 'Not provided'}
Affected Records: {affected_records}
Root Cause: {root_cause or 'Under investigation'}

--- INSTRUCTIONS ---
Assess whether ICO notification is required under UK GDPR Article 33.
Assess SRA implications and whether COLP self-report is needed.
Provide prioritised remediation actions with deadlines.
Return valid JSON only (no markdown, no explanation outside the JSON)."""

    text = _call_claude(BREACH_ANALYSIS_SYSTEM_PROMPT, user_prompt, max_tokens=2000)
    if text is None:
        return _fallback_breach_analysis(breach_type, severity, affected_records)

    result = _parse_json_response(text)
    result["ai_generated"] = True
    result["model"] = _ai_model
    return result


def _fallback_breach_analysis(breach_type: str, severity: str, affected_records: int) -> dict:
    """Fallback breach analysis when AI is unavailable."""
    is_data_breach = breach_type == "data"
    ico_required = is_data_breach and (severity in ("high", "critical") or affected_records > 0)

    return {
        "risk_level": severity,
        "ico_notification_required": ico_required,
        "ico_notification_reasoning": (
            "This appears to be a personal data breach involving risk to individuals. "
            "Under UK GDPR Article 33, ICO notification within 72 hours is likely required. "
            "Please consult your DPO or legal advisor to confirm."
            if ico_required else
            "Based on initial assessment, this breach may not meet the ICO notification threshold. "
            "However, all breaches must be recorded in the breach register and the decision "
            "not to notify must be documented with reasoning."
        ),
        "sra_implications": (
            f"COLP should assess whether this constitutes a material breach requiring "
            f"SRA self-report under Rule 3.9 of the SRA Code of Conduct for Firms. "
            f"Review against SRA Standards and Regulations."
        ),
        "recommended_actions": [
            {"action": "Document the breach fully in the breach register", "priority": "critical", "deadline": "Immediate"},
            {"action": "Assess ICO notification requirement with DPO", "priority": "critical", "deadline": "24 hours"},
            {"action": "Identify and contain the breach to prevent further exposure", "priority": "high", "deadline": "24 hours"},
            {"action": "Notify affected individuals if required", "priority": "high", "deadline": "48 hours"},
            {"action": "Implement corrective measures to prevent recurrence", "priority": "medium", "deadline": "14 days"},
            {"action": "Conduct lessons learned review", "priority": "medium", "deadline": "30 days"},
        ],
        "root_cause_analysis": "Further investigation required to identify systemic factors contributing to this breach.",
        "similar_risk_areas": ["Access controls", "Data handling procedures", "Staff training"],
        "ai_generated": False,
    }


# ═══════════════════════════════════════════════════════════════════
# 2c. ICO NOTIFICATION DRAFTING (UK GDPR Article 33)
# ═══════════════════════════════════════════════════════════════════

ICO_NOTIFICATION_SYSTEM_PROMPT = """You are Seema AI, a UK data protection specialist.
You draft personal data breach notifications to the Information Commissioner's Office
under UK GDPR Article 33. The output will be sent to the ICO via the ICO's breach
notification form — it must be precise, factually grounded, and structured to the
ICO's required headings.

Return ONLY a JSON object (no code fences) with this exact shape:
{
  "summary": "1-sentence high-level description",
  "sections": {
    "what_happened": "factual account of the breach in chronological order",
    "when_did_it_happen": "date/time the breach occurred",
    "when_was_it_discovered": "date/time the firm became aware",
    "how_was_it_discovered": "who/what alerted the firm",
    "nature_of_data": "categories of personal data involved (names, contact info, special category data, etc.)",
    "approx_subjects_affected": "estimate of how many data subjects are affected",
    "approx_records_affected": "estimate of how many personal data records",
    "likely_consequences": "potential harm to data subjects",
    "measures_taken": "what the firm has done since discovery to contain and remediate",
    "measures_planned": "further actions planned",
    "data_subjects_informed": "whether data subjects have been notified and when/how"
  },
  "recommended_next_steps": ["short actionable items for the COLP, e.g. 'Notify affected clients within 72h if high risk'"],
  "regulatory_references": ["e.g. 'UK GDPR Art 33', 'Data Protection Act 2018 s.67'"],
  "confidence_note": "Caveat about gaps in the input that the COLP must fill in before submitting."
}

If a field is unknown from the input, write '[TO BE COMPLETED BY COLP — supply factual answer]' rather than fabricating. Better to leave a blank than misrepresent to a regulator."""


# Canonical placeholder string — used by the fallback and as the value AI
# is instructed to emit when a field is unknown. Centralised so the modal
# and any future consumers can search/replace consistently.
ICO_PLACEHOLDER = "[TO BE COMPLETED BY COLP — supply factual answer]"


def _ico_section_keys() -> list:
    """Required ICO notification section keys in the order they appear on the
    ICO breach notification form. Kept here so fallback + shape-coercion
    stay in lock-step with the prompt contract."""
    return [
        "what_happened",
        "when_did_it_happen",
        "when_was_it_discovered",
        "how_was_it_discovered",
        "nature_of_data",
        "approx_subjects_affected",
        "approx_records_affected",
        "likely_consequences",
        "measures_taken",
        "measures_planned",
        "data_subjects_informed",
    ]


async def draft_ico_notification(breach: dict, firm) -> dict:
    """Draft an ICO breach notification under UK GDPR Article 33.

    Args:
        breach: dict of the breach_reports row (title, description, breach_type,
            reported_date, ico_deadline, affected_records, root_cause, etc.).
        firm: Firm ORM object with profile data.

    Returns:
        Dict matching ICO_NOTIFICATION_SYSTEM_PROMPT contract, plus
        `ai_generated` and `model` keys. Falls back to a structured template
        with placeholders when Claude is unavailable.
    """
    firm_context = _build_firm_context(firm)

    title = breach.get("title") or "Personal data breach"
    description = breach.get("description") or ""
    breach_type = breach.get("breach_type") or "data"
    severity = breach.get("severity") or "medium"
    reported_date = breach.get("reported_date") or "Not provided"
    ico_deadline = breach.get("ico_deadline") or "Not provided"
    affected_records = breach.get("affected_records")
    if affected_records is None:
        affected_records = "Unknown"
    root_cause = breach.get("root_cause") or "Under investigation"

    user_prompt = f"""Draft an ICO breach notification (UK GDPR Article 33) for this firm.

--- FIRM PROFILE ---
{firm_context}

--- BREACH RECORD ---
Title: {title}
Type: {breach_type}
Severity: {severity}
Reported Date (when the firm logged it internally): {reported_date}
ICO 72-hour Deadline: {ico_deadline}
Affected Records (firm's current estimate): {affected_records}
Root Cause (if known): {root_cause}

Description / known facts:
{description or '(no description recorded)'}

--- INSTRUCTIONS ---
Produce a draft that the COLP will review and submit to the ICO. Use the JSON
shape defined in your system prompt. Where the breach record does not contain
the answer (for example exact date/time of occurrence, specific data categories,
or number of data subjects), DO NOT GUESS — emit the placeholder string
'{ICO_PLACEHOLDER}' for that field. The COLP must supply factual answers before
submission.

Be factually grounded. Cite UK GDPR Art 33 and other relevant authority in
regulatory_references. Return valid JSON only — no markdown, no code fences."""

    text = _call_claude(ICO_NOTIFICATION_SYSTEM_PROMPT, user_prompt, max_tokens=3072)
    if text is None:
        return _fallback_ico_notification(breach, firm)

    result = _parse_json_response(text)

    # Defensive shape coercion — if Claude returned something off-contract,
    # fall back so the UI never receives a half-shaped payload.
    if not isinstance(result, dict) or "sections" not in result:
        return _fallback_ico_notification(breach, firm)

    if not isinstance(result.get("sections"), dict):
        result["sections"] = {}

    # Ensure every required key exists — fill missing keys with the placeholder.
    for key in _ico_section_keys():
        if not result["sections"].get(key):
            result["sections"][key] = ICO_PLACEHOLDER

    result.setdefault("summary", title)
    if not isinstance(result.get("recommended_next_steps"), list):
        result["recommended_next_steps"] = []
    if not isinstance(result.get("regulatory_references"), list):
        result["regulatory_references"] = ["UK GDPR Article 33", "Data Protection Act 2018 s.67"]
    result.setdefault(
        "confidence_note",
        "Draft only — verify every section against the source incident record before submitting to the ICO.",
    )

    result["ai_generated"] = True
    result["model"] = _ai_model
    return result


def _fallback_ico_notification(breach: dict, firm) -> dict:
    """Rule-based ICO notification template when AI is unavailable.

    Pre-fills sections from breach-record fields where we have ground truth
    (title, description, reported_date, affected_records, root_cause); every
    other section is the canonical placeholder so the COLP knows exactly what
    they need to add before submitting.
    """
    title = breach.get("title") or "Personal data breach"
    description = breach.get("description") or ""
    reported_date = breach.get("reported_date")
    affected_records = breach.get("affected_records")
    root_cause = breach.get("root_cause") or ""

    sections = {key: ICO_PLACEHOLDER for key in _ico_section_keys()}
    if description:
        sections["what_happened"] = description
    if reported_date:
        sections["when_was_it_discovered"] = str(reported_date)
    if affected_records:
        sections["approx_records_affected"] = str(affected_records)
        sections["approx_subjects_affected"] = (
            f"Estimated based on {affected_records} affected records — "
            f"{ICO_PLACEHOLDER}"
        )
    if root_cause:
        sections["measures_taken"] = (
            f"Root cause identified as: {root_cause}. Further containment measures: "
            f"{ICO_PLACEHOLDER}"
        )

    firm_name = getattr(firm, "name", "the firm") if firm else "the firm"
    colp_name = getattr(firm, "colp_name", None) if firm else None

    return {
        "summary": f"{firm_name} is notifying the ICO of a personal data breach: {title}.",
        "sections": sections,
        "recommended_next_steps": [
            "Verify and complete every '[TO BE COMPLETED BY COLP]' section with factual answers from the incident record.",
            "Assess whether affected data subjects must be notified under UK GDPR Article 34 (high risk to rights and freedoms).",
            "Preserve all forensic evidence and contemporaneous notes for the ICO investigation file.",
            f"COLP {colp_name or '[name]'} to review and submit via the ICO breach notification form within the 72-hour window.",
        ],
        "regulatory_references": [
            "UK GDPR Article 33 (notification to supervisory authority)",
            "UK GDPR Article 34 (communication to data subjects)",
            "Data Protection Act 2018 s.67",
            "SRA Code of Conduct paragraph 6.3 (duty of confidentiality)",
        ],
        "confidence_note": (
            "AI service unavailable — this is a rule-based template with placeholders "
            "for every field the system cannot infer from the breach record. The COLP "
            "MUST replace every '[TO BE COMPLETED BY COLP]' marker with factually "
            "verified information before submission. Do not send this draft to the "
            "ICO without that review."
        ),
        "ai_generated": False,
    }


# ═══════════════════════════════════════════════════════════════════
# 3. COMPLIANCE SCAN
# ═══════════════════════════════════════════════════════════════════

SCAN_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance auditor. You perform compliance
scans against SRA Standards and Regulations, assessing a firm's current state.

Given the firm profile and compliance data, return valid JSON:
{
    "overall_risk_score": 0-100,
    "overall_rating": "excellent|good|fair|poor|critical",
    "categories": [
        {
            "category": "category name",
            "score": 0-100,
            "status": "pass|warning|fail",
            "findings": ["specific finding"],
            "recommendations": ["specific action"]
        }
    ],
    "urgent_actions": ["any actions needed within 7 days"],
    "summary": "2-3 sentence executive summary"
}

Categories to assess: AML/CDD, Data Protection, Professional Standards,
Training & CPD, Undertakings, Client Money, Conflicts, Complaints Handling,
File Management, Supervision."""


async def scan_compliance(
    firm,
    compliance_data: dict,
) -> dict:
    """Run an AI-powered compliance scan across all regulatory areas.

    Args:
        firm: Firm ORM object.
        compliance_data: dict with current compliance metrics:
            - open_alerts, resolved_alerts
            - overdue_deadlines, upcoming_deadlines
            - pending_cdd, approved_cdd
            - open_breaches
            - overdue_training
            - overdue_undertakings
            - overdue_policies
            - pending_remediation
            - open_complaints

    Returns:
        dict with comprehensive compliance assessment.
    """
    firm_context = _build_firm_context(firm)

    data_summary = json.dumps(compliance_data, indent=2, default=str)

    user_prompt = f"""Perform a comprehensive compliance scan for this firm:

--- FIRM PROFILE ---
{firm_context}

--- CURRENT COMPLIANCE DATA ---
{data_summary}

--- INSTRUCTIONS ---
Assess each compliance category, assign risk scores (0=no risk, 100=critical risk),
and provide specific, actionable recommendations. Consider SRA reporting thresholds
and regulatory deadlines. Return valid JSON only."""

    text = _call_claude(SCAN_SYSTEM_PROMPT, user_prompt, max_tokens=3000)
    if text is None:
        return _fallback_scan(compliance_data)

    result = _parse_json_response(text)
    result["ai_generated"] = True
    result["model"] = _ai_model
    result["scanned_at"] = datetime.utcnow().isoformat()
    return result


def _fallback_scan(data: dict) -> dict:
    """Rule-based compliance scoring when AI is unavailable."""
    categories = []
    urgent = []
    total_score = 0

    # AML
    pending_cdd = data.get("pending_cdd", 0)
    aml_score = min(pending_cdd * 15, 100)
    categories.append({
        "category": "AML/CDD",
        "score": aml_score,
        "status": "fail" if aml_score > 60 else "warning" if aml_score > 30 else "pass",
        "findings": [f"{pending_cdd} CDD records pending"] if pending_cdd else ["CDD records up to date"],
        "recommendations": ["Complete outstanding CDD checks"] if pending_cdd else [],
    })
    total_score += aml_score

    # Breaches
    breaches = data.get("open_breaches", 0)
    breach_score = min(breaches * 25, 100)
    categories.append({
        "category": "Data Protection",
        "score": breach_score,
        "status": "fail" if breach_score > 60 else "warning" if breach_score > 0 else "pass",
        "findings": [f"{breaches} open breach reports"] if breaches else ["No open breaches"],
        "recommendations": ["Address open breach reports urgently"] if breaches else [],
    })
    if breaches:
        urgent.append("Address open data breach reports within ICO 72-hour window")
    total_score += breach_score

    # Training
    overdue_training = data.get("overdue_training", 0)
    training_score = min(overdue_training * 10, 100)
    categories.append({
        "category": "Training & CPD",
        "score": training_score,
        "status": "fail" if training_score > 60 else "warning" if training_score > 20 else "pass",
        "findings": [f"{overdue_training} overdue training items"] if overdue_training else ["Training up to date"],
        "recommendations": ["Chase staff for overdue training"] if overdue_training else [],
    })
    total_score += training_score

    # Undertakings
    overdue_ut = data.get("overdue_undertakings", 0)
    ut_score = min(overdue_ut * 20, 100)
    categories.append({
        "category": "Undertakings",
        "score": ut_score,
        "status": "fail" if ut_score > 40 else "warning" if ut_score > 0 else "pass",
        "findings": [f"{overdue_ut} overdue undertakings"] if overdue_ut else ["All undertakings on track"],
        "recommendations": ["Fulfil or report breached undertakings"] if overdue_ut else [],
    })
    if overdue_ut:
        urgent.append("Overdue undertakings — potential SRA reporting obligation")
    total_score += ut_score

    # Deadlines
    overdue_dl = data.get("overdue_deadlines", 0)
    dl_score = min(overdue_dl * 12, 100)
    categories.append({
        "category": "File Management",
        "score": dl_score,
        "status": "fail" if dl_score > 60 else "warning" if dl_score > 20 else "pass",
        "findings": [f"{overdue_dl} overdue deadlines"] if overdue_dl else ["Deadlines on track"],
        "recommendations": ["Address overdue deadlines"] if overdue_dl else [],
    })
    total_score += dl_score

    # Policies
    overdue_pol = data.get("overdue_policies", 0)
    pol_score = min(overdue_pol * 15, 100)
    categories.append({
        "category": "Professional Standards",
        "score": pol_score,
        "status": "warning" if pol_score > 20 else "pass",
        "findings": [f"{overdue_pol} policies overdue for review"] if overdue_pol else ["Policies current"],
        "recommendations": ["Schedule overdue policy reviews"] if overdue_pol else [],
    })
    total_score += pol_score

    num_cats = len(categories)
    avg_score = total_score // num_cats if num_cats else 0

    rating = "excellent"
    if avg_score > 60:
        rating = "critical"
    elif avg_score > 40:
        rating = "poor"
    elif avg_score > 25:
        rating = "fair"
    elif avg_score > 10:
        rating = "good"

    return {
        "overall_risk_score": avg_score,
        "overall_rating": rating,
        "categories": categories,
        "urgent_actions": urgent,
        "summary": f"Compliance scan completed with an average risk score of {avg_score}/100 ({rating}).",
        "ai_generated": False,
        "scanned_at": datetime.utcnow().isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# 4. REMEDIATION SUGGESTION
# ═══════════════════════════════════════════════════════════════════

REMEDIATION_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance advisor. You create
actionable remediation plans for compliance gaps identified in solicitors' firms.

Return valid JSON:
{
    "title": "Remediation plan title",
    "priority": "critical|high|medium|low",
    "estimated_days": 14,
    "steps": [
        {
            "order": 1,
            "action": "specific action to take",
            "responsible": "COLP|COFA|MLRO|all staff|specific role",
            "deadline_days": 7,
            "evidence_required": "what evidence to collect"
        }
    ],
    "regulatory_basis": "why this remediation is needed (cite regulations)",
    "risk_if_not_addressed": "consequences of inaction"
}

Steps should be specific, measurable, and proportionate to the firm's size."""


async def suggest_remediation(
    compliance_gap: str,
    gap_severity: str,
    firm,
    additional_context: str = "",
) -> dict:
    """Generate an AI-powered remediation plan for a compliance gap.

    Args:
        compliance_gap: Description of the compliance issue.
        gap_severity: Severity level (critical, high, medium, low).
        firm: Firm ORM object.
        additional_context: Extra context (e.g. related alert details).

    Returns:
        dict with structured remediation steps.
    """
    firm_context = _build_firm_context(firm)

    user_prompt = f"""Create a remediation plan for this compliance gap:

--- FIRM PROFILE ---
{firm_context}

--- COMPLIANCE GAP ---
Issue: {compliance_gap}
Severity: {gap_severity}
{f"Additional context: {additional_context}" if additional_context else ""}

--- INSTRUCTIONS ---
Provide a practical, step-by-step remediation plan appropriate for this firm's size.
Include evidence requirements for each step (for the evidence locker).
Return valid JSON only."""

    text = _call_claude(REMEDIATION_SYSTEM_PROMPT, user_prompt, max_tokens=2000)
    if text is None:
        return _fallback_remediation(compliance_gap, gap_severity)

    result = _parse_json_response(text)
    result["ai_generated"] = True
    result["model"] = _ai_model
    return result


def _fallback_remediation(gap: str, severity: str) -> dict:
    """Basic remediation template when AI is unavailable."""
    return {
        "title": f"Remediation: {gap[:80]}",
        "priority": severity,
        "estimated_days": 14 if severity in ("low", "medium") else 7,
        "steps": [
            {"order": 1, "action": "Review the compliance gap and gather relevant documentation", "responsible": "COLP", "deadline_days": 3, "evidence_required": "Gap assessment document"},
            {"order": 2, "action": "Identify root cause and affected areas", "responsible": "COLP", "deadline_days": 5, "evidence_required": "Root cause analysis"},
            {"order": 3, "action": "Implement corrective measures", "responsible": "COLP", "deadline_days": 10, "evidence_required": "Corrective action records"},
            {"order": 4, "action": "Verify remediation is effective", "responsible": "COLP", "deadline_days": 14, "evidence_required": "Verification report"},
        ],
        "regulatory_basis": "SRA Standards and Regulations — firms must have effective compliance systems.",
        "risk_if_not_addressed": "Potential SRA enforcement action or regulatory sanction.",
        "ai_generated": False,
    }


# ═══════════════════════════════════════════════════════════════════
# 5. RISK SUMMARY / EXECUTIVE BRIEFING
# ═══════════════════════════════════════════════════════════════════

SUMMARY_SYSTEM_PROMPT = """You are Seema AI, providing a concise executive compliance briefing
for the COLP (Compliance Officer for Legal Practice) of a UK solicitors' firm.

Return valid JSON:
{
    "headline": "one-line compliance status",
    "risk_level": "green|amber|red",
    "key_concerns": ["top 3 concerns, most urgent first"],
    "positive_highlights": ["things going well"],
    "recommended_focus": "what the COLP should prioritise this week",
    "briefing": "2-3 paragraph executive summary in plain English"
}

Be direct, actionable, and specific. The COLP needs to know what to do TODAY."""


async def generate_risk_summary(
    firm,
    compliance_data: dict,
) -> dict:
    """Generate an executive-level risk summary for the COLP dashboard.

    Args:
        firm: Firm ORM object.
        compliance_data: Current metrics (same shape as scan_compliance).

    Returns:
        dict with executive briefing.
    """
    firm_context = _build_firm_context(firm)
    data_summary = json.dumps(compliance_data, indent=2, default=str)

    user_prompt = f"""Prepare a COLP executive briefing based on this compliance data:

--- FIRM PROFILE ---
{firm_context}

--- COMPLIANCE METRICS ---
{data_summary}

--- INSTRUCTIONS ---
Provide a concise, actionable briefing. Focus on what the COLP needs to act on today.
Return valid JSON only."""

    text = _call_claude(SUMMARY_SYSTEM_PROMPT, user_prompt, max_tokens=1500)
    if text is None:
        return _fallback_summary(compliance_data)

    result = _parse_json_response(text)
    result["ai_generated"] = True
    result["model"] = _ai_model
    result["generated_at"] = datetime.utcnow().isoformat()
    return result


# ═══════════════════════════════════════════════════════════════════
# 6. PER-MATTER COMPLIANCE REVIEW
# ═══════════════════════════════════════════════════════════════════

MATTER_REVIEW_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance reviewer.
You analyze a single legal matter and identify compliance gaps under SRA Standards
and Regulations 2019, AML regulations, and conflict-of-interest rules.

Return ONLY a JSON object with this exact shape (no code fences, no extra text):
{
  "overall_risk": "low" | "medium" | "high",
  "summary": "1-2 sentence assessment",
  "findings": [
    {
      "category": "cdd" | "conflict" | "undertaking" | "checklist" | "regulatory" | "supervision" | "other",
      "severity": "low" | "medium" | "high" | "critical",
      "title": "short headline",
      "detail": "explanation in plain English",
      "recommended_action": "concrete next step"
    }
  ],
  "regulatory_references": ["e.g. SRA Code 8.3"]
}

If there are no findings, return an empty findings array with overall_risk='low' and a reassuring summary."""


async def review_matter(matter: dict, related: dict, firm) -> dict:
    """Review a single legal matter for compliance gaps using AI.

    Args:
        matter: Serialized dict of the Matter row (id, reference, client_name,
            matter_type, status, open_date, age_days, risk_level, fee_estimate,
            practice_area, etc.).
        related: Dict of related records — keys may include `cdd_records`,
            `conflict_checks`, `undertakings`, `checklist_items`.
        firm: Firm ORM object.

    Returns:
        Dict matching MATTER_REVIEW_SYSTEM_PROMPT contract, plus `ai_generated`
        and `model` keys.
    """
    firm_context = _build_firm_context(firm)

    # ── Matter section ────────────────────────────────────────────
    matter_lines = [
        f"Reference: {matter.get('reference') or 'n/a'}",
        f"Client: {matter.get('client_name') or 'n/a'}",
        f"Matter Type: {matter.get('matter_type') or 'n/a'}",
        f"Practice Area: {matter.get('practice_area') or 'n/a'}",
        f"Status: {matter.get('status') or 'unknown'}",
        f"Open Date: {matter.get('open_date') or 'n/a'}",
        f"Age (days): {matter.get('age_days') if matter.get('age_days') is not None else 'n/a'}",
        f"Risk Level: {matter.get('risk_level') or 'not set'}",
        f"Fee Estimate: {matter.get('fee_estimate') if matter.get('fee_estimate') is not None else 'not set'}",
    ]
    matter_block = "\n".join(matter_lines)

    # ── CDD section ───────────────────────────────────────────────
    cdd_records = related.get("cdd_records") or []
    if cdd_records:
        cdd_lines = []
        for c in cdd_records:
            cdd_lines.append(
                f"  - Client: {c.get('client_name')}, "
                f"Level: {c.get('cdd_level') or 'standard'}, "
                f"Status: {c.get('status') or 'pending'}, "
                f"Risk: {c.get('risk_level') or 'medium'}, "
                f"ID verified: {c.get('id_verified', False)}, "
                f"Address verified: {c.get('address_verified', False)}, "
                f"SOF verified: {c.get('sof_verified', False)}, "
                f"Created: {c.get('created_at') or 'n/a'}"
            )
        cdd_block = "\n".join(cdd_lines)
    else:
        cdd_block = "  (none found for this client — possible CDD gap)"

    # ── Conflict check section ────────────────────────────────────
    conflict_checks = related.get("conflict_checks") or []
    if conflict_checks:
        conflict_lines = []
        for c in conflict_checks:
            conflict_lines.append(
                f"  - Client: {c.get('client_name')}, "
                f"Status: {c.get('status') or 'pending'}, "
                f"Type: {c.get('conflict_type') or 'n/a'}, "
                f"Resolved at: {c.get('resolved_at') or 'unresolved'}, "
                f"Checked: {c.get('created_at') or 'n/a'}"
            )
        conflict_block = "\n".join(conflict_lines)
    else:
        conflict_block = "  (no conflict check recorded for this client)"

    # ── Undertakings section ──────────────────────────────────────
    undertakings = related.get("undertakings") or []
    if undertakings:
        ut_lines = []
        for u in undertakings:
            ut_lines.append(
                f"  - {u.get('description', '')[:120]}, "
                f"Status: {u.get('status') or 'pending'}, "
                f"Given to: {u.get('given_to') or 'n/a'}, "
                f"Due: {u.get('due_date') or 'no deadline'}, "
                f"Completed: {u.get('completed_at') or 'not completed'}"
            )
        ut_block = "\n".join(ut_lines)
    else:
        ut_block = "  (no undertakings recorded against this matter reference)"

    # ── Checklist section ─────────────────────────────────────────
    checklist_items = related.get("checklist_items") or []
    if checklist_items:
        total = len(checklist_items)
        completed = sum(1 for i in checklist_items if i.get("completed"))
        cl_lines = [f"  Total: {total}, Completed: {completed}, Outstanding: {total - completed}"]
        # Include up to 10 outstanding items for context
        outstanding = [i for i in checklist_items if not i.get("completed")][:10]
        for i in outstanding:
            cl_lines.append(f"  - [open] {i.get('description', '')[:160]}")
        cl_block = "\n".join(cl_lines)
    else:
        cl_block = "  (no checklist items linked to this matter)"

    user_prompt = f"""Review this single legal matter for compliance gaps.

--- FIRM PROFILE ---
{firm_context}

--- MATTER ---
{matter_block}

--- RELATED CDD RECORDS ---
{cdd_block}

--- RELATED CONFLICT CHECKS ---
{conflict_block}

--- OPEN UNDERTAKINGS ON THIS MATTER ---
{ut_block}

--- CHECKLIST PROGRESS ---
{cl_block}

--- INSTRUCTIONS ---
Identify compliance gaps specific to this matter. Consider:
- Whether CDD is complete and proportionate to the risk level
- Whether a conflict check was performed and remains current
- Whether any undertakings are overdue or unfulfilled
- Whether checklist items are overdue given the matter's age
- Any SRA Standards and Regulations 2019 obligations that may be at risk
- Any supervision concerns given matter age, value, or risk level

Be proportionate — a new low-risk matter with no findings should return overall_risk='low'
and an empty findings array. Return valid JSON only (no markdown, no code fences)."""

    text = _call_claude(MATTER_REVIEW_SYSTEM_PROMPT, user_prompt, max_tokens=2048)
    if text is None:
        return _fallback_matter_review(matter, related)

    result = _parse_json_response(text)

    # Defensive shape coercion — if Claude returned something that doesn't
    # match the contract, salvage what we can so the UI never sees a 500.
    if not isinstance(result, dict) or "summary" not in result:
        return _fallback_matter_review(matter, related)

    result.setdefault("overall_risk", "low")
    result.setdefault("summary", "No significant issues identified.")
    result.setdefault("findings", [])
    result.setdefault("regulatory_references", [])
    # Normalise findings to a list of dicts.
    if not isinstance(result.get("findings"), list):
        result["findings"] = []
    if not isinstance(result.get("regulatory_references"), list):
        result["regulatory_references"] = []

    result["ai_generated"] = True
    result["model"] = _ai_model
    return result


def _fallback_matter_review(matter: dict, related: dict) -> dict:
    """Rule-based matter review when AI is unavailable or returns nothing usable."""
    findings = []
    refs = set()

    # CDD gap
    cdd_records = related.get("cdd_records") or []
    if not cdd_records:
        findings.append({
            "category": "cdd",
            "severity": "high",
            "title": "No CDD record on file for this client",
            "detail": (
                "We could not find any Client Due Diligence record matching this matter's "
                "client name. Under the Money Laundering Regulations 2017, CDD must be "
                "completed before establishing a business relationship."
            ),
            "recommended_action": "Complete and document CDD for this client before further work.",
        })
        refs.add("MLR 2017 reg. 27")
        refs.add("SRA Code 8.1")
    else:
        # Check if any CDD is approved
        approved = [c for c in cdd_records if (c.get("status") or "").lower() == "approved"]
        if not approved:
            findings.append({
                "category": "cdd",
                "severity": "medium",
                "title": "CDD pending for this client",
                "detail": "CDD record exists but is not yet approved.",
                "recommended_action": "Complete outstanding verification and approve the CDD record.",
            })
            refs.add("MLR 2017 reg. 27")

    # Conflict check
    conflict_checks = related.get("conflict_checks") or []
    if not conflict_checks:
        findings.append({
            "category": "conflict",
            "severity": "medium",
            "title": "No conflict check on file",
            "detail": (
                "No conflict-of-interest check was found for this client. Under SRA "
                "Standards and Regulations 2019, a conflict check is required before "
                "accepting instructions."
            ),
            "recommended_action": "Run and document a conflict check before progressing.",
        })
        refs.add("SRA Code 6.1")
        refs.add("SRA Code 6.2")

    # Undertakings
    undertakings = related.get("undertakings") or []
    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc)
    for u in undertakings:
        if (u.get("status") or "").lower() in ("fulfilled", "completed"):
            continue
        due_raw = u.get("due_date")
        is_overdue = False
        if due_raw:
            try:
                if isinstance(due_raw, str):
                    due_dt = _dt.fromisoformat(due_raw.replace("Z", "+00:00"))
                else:
                    due_dt = due_raw
                if due_dt.tzinfo is None:
                    due_dt = due_dt.replace(tzinfo=_tz.utc)
                is_overdue = due_dt < now
            except Exception:
                is_overdue = False
        if is_overdue:
            findings.append({
                "category": "undertaking",
                "severity": "high",
                "title": "Overdue undertaking on this matter",
                "detail": f"Undertaking past its due date: {(u.get('description') or '')[:160]}",
                "recommended_action": "Fulfil the undertaking immediately or escalate to the COLP.",
            })
            refs.add("SRA Code 1.3")

    # Checklist
    checklist_items = related.get("checklist_items") or []
    if checklist_items:
        total = len(checklist_items)
        completed = sum(1 for i in checklist_items if i.get("completed"))
        if total > 0 and completed < total:
            age_days = matter.get("age_days") or 0
            if age_days and age_days > 30 and completed / max(total, 1) < 0.5:
                findings.append({
                    "category": "checklist",
                    "severity": "medium",
                    "title": "Checklist progress lagging matter age",
                    "detail": (
                        f"{total - completed} of {total} checklist items remain outstanding "
                        f"after {age_days} days."
                    ),
                    "recommended_action": "Review outstanding checklist items and close those no longer required.",
                })

    # Risk rollup
    severities = [f["severity"] for f in findings]
    if "critical" in severities or severities.count("high") >= 2:
        overall = "high"
    elif "high" in severities or "medium" in severities:
        overall = "medium"
    else:
        overall = "low"

    summary = (
        "No compliance concerns identified for this matter."
        if not findings
        else f"{len(findings)} compliance issue(s) found — review recommended."
    )

    return {
        "overall_risk": overall,
        "summary": summary,
        "findings": findings,
        "regulatory_references": sorted(refs),
        "ai_generated": False,
    }


def _fallback_summary(data: dict) -> dict:
    """Basic summary when AI is unavailable."""
    concerns = []
    if data.get("open_breaches", 0) > 0:
        concerns.append(f"{data['open_breaches']} open breach report(s) — check ICO deadlines")
    if data.get("overdue_undertakings", 0) > 0:
        concerns.append(f"{data['overdue_undertakings']} overdue undertaking(s)")
    if data.get("overdue_deadlines", 0) > 0:
        concerns.append(f"{data['overdue_deadlines']} overdue deadline(s)")

    risk = "green"
    if data.get("open_breaches", 0) > 0 or data.get("overdue_undertakings", 0) > 0:
        risk = "red"
    elif data.get("overdue_deadlines", 0) > 0 or data.get("overdue_training", 0) > 0:
        risk = "amber"

    return {
        "headline": f"{'Action required' if risk == 'red' else 'Monitor' if risk == 'amber' else 'On track'} — {len(concerns)} concern(s)",
        "risk_level": risk,
        "key_concerns": concerns or ["No urgent concerns identified"],
        "positive_highlights": [],
        "recommended_focus": concerns[0] if concerns else "Continue routine compliance monitoring",
        "briefing": f"Your firm currently has {data.get('open_alerts', 0)} open alerts and {data.get('overdue_deadlines', 0)} overdue deadlines. {'Immediate attention required.' if risk == 'red' else 'Situation is manageable but monitor closely.' if risk == 'amber' else 'Compliance posture is healthy.'}",
        "ai_generated": False,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# 7. RECONCILIATION — SRA ACCOUNTS RULES REPORT DRAFT
# ═══════════════════════════════════════════════════════════════════

RECONCILIATION_REPORT_SYSTEM_PROMPT = """You are Seema AI, a UK legal compliance expert specialising in the
SRA Accounts Rules 2019 and client-account reconciliation for solicitors' firms.

You are drafting the narrative reconciliation report that the COFA (Compliance
Officer for Finance and Administration) reviews and signs. It records the
firm's compliance with the SRA Accounts Rules for the period — in particular
Rule 8.3 (reconciliation at least every five weeks, three-way agreement of
bank statement, cashbook and client-ledger totals), Rule 5.1 (no residual
client balances), and Rule 13 (six-year retention of records).

Return ONLY the report as markdown. Do NOT wrap your response in JSON or code
fences. Start directly with a markdown H1 title.

The report MUST include, as clearly headed markdown sections:
1. Period and scope (which client/designated accounts were reconciled)
2. Three-way reconciliation result (whether bank, cashbook and client-ledger
   totals agree; state the variance for each account)
3. Exceptions and how they were resolved
4. Aged / residual balances (Rule 5.1) and the action taken
5. Breach assessment — whether any matter must be reported to the SRA, and a
   clear statement if a Rule 8.3 breach has occurred (e.g. reconciliation late)
6. COFA declaration block for sign-off

Be specific to UK law and cite the relevant SRA Accounts Rule by number. Where
a figure shows a non-zero variance or an aged residual, flag it explicitly as a
compliance concern rather than glossing over it. Do not invent figures — work
only from the data provided; if a figure is missing, say so."""


def _reconciliation_context(reconciliation: dict) -> str:
    """Build a plain-text block describing a reconciliation run for the prompt."""
    accounts = reconciliation.get("accounts") or []
    if isinstance(accounts, str):
        try:
            accounts = json.loads(accounts)
        except (json.JSONDecodeError, TypeError):
            accounts = []

    acct_lines = []
    for a in accounts:
        acct_lines.append(
            f"  - {a.get('name', 'Account')} ({a.get('number', 'n/a')}): "
            f"bank {a.get('bank', 'n/a')}, cashbook {a.get('cashbook', 'n/a')}, "
            f"ledger {a.get('ledger', 'n/a')}, variance {a.get('variance', 'n/a')}, "
            f"status {a.get('status', 'n/a')}"
        )
    acct_block = "\n".join(acct_lines) if acct_lines else "  (no per-account lines recorded)"

    return (
        f"Period: {reconciliation.get('period_label') or reconciliation.get('period') or 'n/a'}\n"
        f"Status: {reconciliation.get('status') or 'in_progress'}\n"
        f"Current phase: {reconciliation.get('phase') or 'n/a'} of 8\n"
        f"Client money held: {reconciliation.get('client_money_held') or 'n/a'}\n"
        f"Total variance across in-scope accounts: {reconciliation.get('variance_total') or '0'}\n"
        f"Open exceptions: {reconciliation.get('open_exceptions') or 0}\n"
        f"Aged residual balances (Rule 5.1): {reconciliation.get('aged_residuals') or '0'}\n"
        f"COFA notes: {reconciliation.get('notes') or '(none)'}\n"
        f"\nIn-scope accounts:\n{acct_block}\n"
    )


async def draft_reconciliation_sra_report(reconciliation: dict, firm) -> dict:
    """Draft the SRA Accounts Rules reconciliation report for a reconciliation run.

    Args:
        reconciliation: Serialized dict of the Reconciliation row (period_label,
            status, phase, accounts, variance_total, open_exceptions,
            aged_residuals, client_money_held, notes).
        firm: Firm ORM object with profile data.

    Returns:
        dict with `title`, `content` (markdown), `ai_generated`, `model`,
        `generated_at`. Falls back to a structured template when AI is
        unavailable.
    """
    firm_context = _build_firm_context(firm)
    recon_context = _reconciliation_context(reconciliation)

    user_prompt = f"""Draft the client-account reconciliation report for this firm and period.

--- FIRM PROFILE ---
{firm_context}

--- RECONCILIATION DATA ---
{recon_context}

--- INSTRUCTIONS ---
Produce the COFA's narrative reconciliation report for this period as markdown.
Assess three-way agreement, exceptions, aged balances, and whether any SRA
report or breach record is required. Cite SRA Accounts Rules by number. Work
only from the figures above — do not fabricate amounts."""

    text = _call_claude(RECONCILIATION_REPORT_SYSTEM_PROMPT, user_prompt, max_tokens=4096)
    if text is None:
        return _fallback_reconciliation_report(reconciliation, firm)

    content = text.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines).strip()

    derived_title = f"Client Account Reconciliation — {reconciliation.get('period_label') or 'Report'}"
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            derived_title = stripped.lstrip("# ").strip()
            break

    return {
        "title": derived_title,
        "content": content,
        "ai_generated": True,
        "model": _ai_model,
        "generated_at": datetime.utcnow().isoformat(),
    }


def _fallback_reconciliation_report(reconciliation: dict, firm) -> dict:
    """Rule-based reconciliation report when AI is unavailable."""
    period = reconciliation.get("period_label") or reconciliation.get("period") or "the current period"
    firm_name = getattr(firm, "name", "the firm") if firm else "the firm"
    cofa = getattr(firm, "cofa_name", None) if firm else None

    try:
        variance = float(reconciliation.get("variance_total") or 0)
    except (TypeError, ValueError):
        variance = 0.0
    try:
        aged = float(reconciliation.get("aged_residuals") or 0)
    except (TypeError, ValueError):
        aged = 0.0
    exceptions = reconciliation.get("open_exceptions") or 0

    variance_line = (
        "All in-scope accounts reconciled to a **zero variance**; bank statement, "
        "cashbook and client-ledger totals agree (three-way agreement satisfied "
        "under SRA Accounts Rule 8.3)."
        if variance == 0 else
        f"A non-zero variance of **{variance:.2f}** remains across in-scope accounts. "
        f"This MUST be investigated and cleared before COFA sign-off — a persisting "
        f"variance is a breach of SRA Accounts Rule 8.3 (three-way agreement)."
    )
    aged_line = (
        "No residual client balances were identified (SRA Accounts Rule 5.1 satisfied)."
        if aged == 0 else
        f"Aged residual balances totalling **{aged:.2f}** remain on the client ledger. "
        f"Under SRA Accounts Rule 5.1 these must be returned promptly; document the "
        f"tracing effort or charity-payment decision for each item."
    )

    content = f"""# Client Account Reconciliation — {period}

## 1. Period and scope
This report records the reconciliation of {firm_name}'s client and designated
deposit accounts for {period}, prepared under the SRA Accounts Rules 2019.

## 2. Three-way reconciliation result
{variance_line}

## 3. Exceptions
{exceptions} exception(s) were identified during matching. Each unmatched item
should be recorded with a documented reason (timing difference, bank charge,
unidentified receipt, etc.) before sign-off.

## 4. Aged / residual balances (Rule 5.1)
{aged_line}

## 5. Breach assessment
The COFA must consider whether any matter in this period requires a report to
the SRA under the Accounts Rules or a record in the firm's breach register —
for example a reconciliation completed later than the five-weekly maximum
(Rule 8.3) or a shortfall on the client account.

## 6. COFA declaration
I, {cofa or '[COFA name]'}, COFA of {firm_name}, confirm that I have reviewed
this reconciliation for {period} and that, to the best of my knowledge, the
records are accurate and the requirements of the SRA Accounts Rules have been
met for the in-scope accounts.

---
*Generated without AI (no provider configured) — verify every figure against
the working papers before relying on this draft. Records must be retained for
six years (SRA Accounts Rule 13).*"""

    return {
        "title": f"Client Account Reconciliation — {period}",
        "content": content,
        "ai_generated": False,
        "generated_at": datetime.utcnow().isoformat(),
    }
