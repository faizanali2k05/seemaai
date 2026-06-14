"""Cross-module compliance wiring.

Helpers that link one compliance record to another so the modules stay in sync:
  * `build_breach_remediation` — a breach automatically spins up a linked
    remediation plan (the breach's `remediation_plan_id` points at it).

The functions only CONSTRUCT ORM objects; the caller adds them to its own
session. That keeps them usable from both the async API routers and the sync
Celery tasks (the ORM model class is session-agnostic).
"""
import json
import uuid
from datetime import datetime, timedelta

from models.remediation import RemediationPlan

_VALID_PRIORITY = {"low", "medium", "high", "critical"}


def _breach_remediation_steps(breach_title: str) -> str:
    """Default, SRA/ICO-aligned remediation steps for a reported breach."""
    steps = [
        {"order": 1, "action": f"Contain and assess the breach: {breach_title}",
         "responsible": "COLP", "deadline_days": 1, "evidence_required": "Incident assessment note"},
        {"order": 2, "action": "Determine whether ICO notification is required under UK GDPR Article 33",
         "responsible": "COLP", "deadline_days": 2, "evidence_required": "Article 33 decision record"},
        {"order": 3, "action": "Notify affected individuals if required under UK GDPR Article 34",
         "responsible": "COLP", "deadline_days": 3, "evidence_required": "Notification log"},
        {"order": 4, "action": "Identify the root cause and implement corrective measures",
         "responsible": "COLP", "deadline_days": 14, "evidence_required": "Corrective action record"},
        {"order": 5, "action": "Conduct a lessons-learned review and update controls",
         "responsible": "COLP", "deadline_days": 30, "evidence_required": "Review minutes"},
    ]
    return json.dumps(steps)


def build_breach_remediation(
    firm_id: str,
    breach_title: str,
    severity: str = "medium",
    due_date: datetime | None = None,
    plan_id: str | None = None,
) -> RemediationPlan:
    """Construct (but do not persist) a RemediationPlan linked to a breach.

    The caller is responsible for `db.add(...)` and for setting the breach's
    `remediation_plan_id` to the returned plan's `id`.
    """
    if due_date is None:
        due_date = datetime.utcnow() + timedelta(days=14)
    priority = severity if severity in _VALID_PRIORITY else "medium"
    return RemediationPlan(
        id=plan_id or str(uuid.uuid4()),
        firm_id=firm_id,
        title=f"Remediation: {breach_title}"[:255],
        source="breach report",
        priority=priority,
        status="pending",
        due_date=due_date,
        steps=_breach_remediation_steps(breach_title),
    )
