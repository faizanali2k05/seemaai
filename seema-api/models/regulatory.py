"""Regulatory update and firm-specific interpretation models."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from database import Base


class RegulatoryUpdate(Base):
    """A regulatory notice scraped from SRA, ICO, HMRC, GOV.UK, or Law Society."""
    __tablename__ = "regulatory_updates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source = Column(String(50), nullable=False, index=True)       # sra, ico, hmrc, govuk, lawsociety
    source_url = Column(String(500))
    title = Column(String(500), nullable=False)
    summary = Column(Text)                                         # raw summary from scraper
    body = Column(Text)                                            # full text content
    category = Column(String(100))                                 # e.g. "enforcement", "guidance", "consultation"
    published_date = Column(String(20))
    effective_date = Column(String(20))
    impact_level = Column(String(20), default="medium")            # low, medium, high, critical
    tags = Column(Text)                                            # comma-separated tags
    content_hash = Column(String(64), unique=True, index=True)     # SHA-256 of title+source_url — dedup key
    scraped_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())


class RegulatoryInterpretation(Base):
    """AI-generated firm-specific interpretation of a regulatory notice."""
    __tablename__ = "regulatory_interpretations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    update_id = Column(String(36), ForeignKey("regulatory_updates.id"), nullable=False, index=True)

    # AI analysis output
    summary = Column(Text, nullable=False)                         # plain-English summary
    applicability = Column(String(10), nullable=False)             # "yes", "no", "maybe"
    applicability_reasoning = Column(Text)                         # why it applies or doesn't
    action_items = Column(Text)                                    # JSON array of action strings
    source_citation = Column(Text)                                 # formatted citation with URL
    confidence_score = Column(Float)                               # 0.0–1.0
    confidence_label = Column(String(20))                          # "high", "medium", "low"

    # Metadata
    model_used = Column(String(50))                                # e.g. "claude-sonnet-4-5-20250514"
    prompt_tokens = Column(Integer)
    completion_tokens = Column(Integer)
    processing_time_ms = Column(Integer)
    status = Column(String(20), default="pending")                 # pending, processing, completed, failed
    error_message = Column(Text)

    # Human override — COLP/COFA can correct the AI's assessment
    override_applicability = Column(String(10))                    # human-corrected: "yes", "no", "maybe"
    override_notes = Column(Text)                                  # free-text explanation of why the override was made
    override_action_items = Column(Text)                           # JSON array — human-edited action items (replaces AI's)
    overridden_by = Column(String(36), ForeignKey("user_accounts.id"))  # who made the override
    overridden_at = Column(DateTime)                               # when the override was made

    # Audit trail — "we told you about X on date Y"
    delivered_at = Column(DateTime)                                # when the interpretation was first shown to the firm
    acknowledged_at = Column(DateTime)                             # when a user explicitly acknowledged/reviewed it
    acknowledged_by = Column(String(36), ForeignKey("user_accounts.id"))  # who acknowledged

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SRAReturnResponse(Base):
    """COLP's per-section answer for the SRA Annual Return walk-through.

    Created by migration `20260513_add_sra_return_responses`. One row per
    (firm_id, return_year, section_key). The COLP either accepts the
    auto-filled value, overrides it (with a reason), or skips it (with a
    reason). The aggregated set of these rows is the firm's draft for the
    given reporting year.
    """
    __tablename__ = "sra_return_responses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    return_year = Column(Integer, nullable=False)
    section_key = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False)  # accepted | overridden | skipped
    value = Column(Text)                          # JSON-encoded for structured fields
    notes = Column(Text)                          # required for overridden / skipped
    completed_by = Column(String(36), ForeignKey("user_accounts.id"))
    completed_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())


class SRAReturnFinalisation(Base):
    """One row per (firm_id, return_year) once the COLP marks the return final."""
    __tablename__ = "sra_return_finalisations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    return_year = Column(Integer, nullable=False)
    finalised_by = Column(String(36), ForeignKey("user_accounts.id"))
    finalised_at = Column(DateTime, server_default=func.now())
    summary_json = Column(Text)
