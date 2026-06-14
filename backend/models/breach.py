"""BreachReport model for GDPR compliance."""
import uuid
from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from database import Base


class BreachReport(Base):
    __tablename__ = "breach_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    breach_type = Column(String(100))
    severity = Column(String(50), default="medium")  # low, medium, high, critical
    status = Column(String(50), default="open")  # open, reported, resolved, archived
    reported_date = Column(DateTime)
    ico_deadline = Column(DateTime)
    notification_status = Column(String(50), default="pending")  # pending, notified, completed
    affected_records = Column(Integer, default=0)
    root_cause = Column(Text)
    resolution_date = Column(DateTime)
    remediation_plan_id = Column(String(36))
    # Task #48 (Alembic migration `add_breach_ico_fields`): ICO 72-hour
    # notification workflow. Draft is the JSON-serialised structured letter
    # so the UI can rehydrate it without re-calling the AI; drafted_at lets
    # us show "Drafted N minutes ago"; notified_at is the COLP's confirmation
    # that the notification has actually been submitted to the ICO.
    ico_notification_draft = Column(Text, nullable=True)
    ico_notification_drafted_at = Column(DateTime, nullable=True)
    ico_notified_at = Column(DateTime, nullable=True)

    # ── Full breach-workflow columns (added in migration 0003) ──
    # The 8-phase breach register (initial response → triage/classify →
    # notifications → investigation → SRA report → submission → response &
    # remediation → close). Most of the rich per-phase form state lives in the
    # workflow_data JSON blob; the columns below are the few fields we query or
    # display directly.
    breach_ref = Column(String(40))            # human reference, e.g. "BR-2026-0042"
    phase = Column(Integer, default=1)          # current workflow phase 1..8
    classification = Column(String(50))         # minor, serious, not_breach
    tracks = Column(Text)                        # JSON array, e.g. ["ICO", "SRA"]
    detected_at = Column(DateTime)
    workflow_data = Column(Text)                 # JSON object — full per-phase state
    sra_report_draft = Column(Text)             # AI-drafted SRA report (markdown)
    sra_report_drafted_at = Column(DateTime)
    signed_off_by = Column(String(255))         # COLP name captured at sign-off
    signed_off_at = Column(DateTime)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
