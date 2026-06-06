"""Core compliance models — alerts, checks, tasks, risk scores, SRA audit."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class ComplianceAlert(Base):
    __tablename__ = "compliance_alerts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    alert_type = Column(String(50))
    severity = Column(String(20))
    title = Column(String(255))
    description = Column(Text)
    case_id = Column(String(36))
    client_id = Column(String(36))
    regulation_ref = Column(String(100))
    action_required = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    acknowledged_at = Column(DateTime)
    resolved_at = Column(DateTime)
    status = Column(String(20), default="open")

    # Human override — COLP/COFA can correct AI-generated alerts
    override_severity = Column(String(20))                          # human-corrected severity
    override_action_required = Column(Text)                         # human-corrected action
    override_notes = Column(Text)                                   # free-text explanation
    overridden_by = Column(String(36), ForeignKey("user_accounts.id"))
    overridden_at = Column(DateTime)


class ComplianceCheck(Base):
    __tablename__ = "compliance_checks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    case_id = Column(String(36))
    client_id = Column(String(36))
    check_type = Column(String(50))
    check_name = Column(String(255))
    status = Column(String(20), default="pending")
    severity = Column(String(20))
    description = Column(Text)
    regulation_ref = Column(String(100))
    remediation = Column(Text)
    checked_at = Column(DateTime)
    due_date = Column(String(20))
    resolved_at = Column(DateTime)


class ComplianceTask(Base):
    __tablename__ = "compliance_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    task_type = Column(String(50))
    title = Column(String(255))
    description = Column(Text)
    assigned_to = Column(String(36))
    related_entity_type = Column(String(50))
    related_entity_id = Column(String(36))
    priority = Column(String(20), default="medium")
    status = Column(String(20), default="pending")
    due_date = Column(String(20))
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    entity_type = Column(String(50))
    entity_id = Column(String(36))
    overall_score = Column(Integer)
    sra_score = Column(Integer)
    aml_score = Column(Integer)
    cpr_score = Column(Integer)
    gdpr_score = Column(Integer)
    limitation_score = Column(Integer)
    calculated_at = Column(DateTime, server_default=func.now())

    # Human override — COLP/COFA can correct AI-calculated risk scores
    override_overall_score = Column(Integer)                        # human-corrected overall score
    override_notes = Column(Text)                                   # free-text explanation
    overridden_by = Column(String(36), ForeignKey("user_accounts.id"))
    overridden_at = Column(DateTime)


class SRAauditItem(Base):
    __tablename__ = "sra_audit_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    category = Column(String(100))
    item_name = Column(String(255))
    description = Column(Text)
    status = Column(String(20), default="not_reviewed")
    evidence_ref = Column(String(36))
    last_reviewed = Column(String(30))
    next_review_due = Column(String(20))
    notes = Column(Text)


class SRAFeedLog(Base):
    __tablename__ = "sra_feed_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feed_source = Column(String(100))
    last_checked = Column(DateTime)
    items_found = Column(Integer, default=0)
    new_items = Column(Integer, default=0)
    status = Column(String(20))
    error_message = Column(Text)


# Alias used by routers/data_mgmt.py for compliance item imports
ComplianceItem = ComplianceCheck


class ComplianceScanResult(Base):
    __tablename__ = "compliance_scan_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    scan_date = Column(DateTime, server_default=func.now())
    category = Column(String(100))
    check_name = Column(String(255))
    status = Column(String(20))
    details = Column(Text)
    recommendation = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    # Human override — COLP/COFA can correct AI scan results
    override_status = Column(String(20))                            # human-corrected status
    override_recommendation = Column(Text)                          # human-corrected recommendation
    override_notes = Column(Text)                                   # free-text explanation
    overridden_by = Column(String(36), ForeignKey("user_accounts.id"))
    overridden_at = Column(DateTime)
