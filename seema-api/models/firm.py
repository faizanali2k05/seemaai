"""Firm model — the root of multi-tenancy. Every other table references firm_id."""
import uuid
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime
from sqlalchemy.sql import func
from database import Base


class Firm(Base):
    __tablename__ = "firms"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    sra_number = Column(String(20), unique=True, nullable=False)
    email = Column(String(255))
    phone = Column(String(50))
    address = Column(Text)
    postcode = Column(String(10))
    website = Column(String(255))

    # Subscription
    subscription_tier = Column(String(20), default="essentials")  # essentials, professional
    subscription_plan = Column(String(20), default="free")  # free, starter, professional, enterprise
    subscription_status = Column(String(20), default="trial")  # trial, active, cancelled, past_due
    billing_email = Column(String(255))
    next_billing_date = Column(String(30))
    annual_cost = Column(Integer, default=0)
    stripe_customer_id = Column(String(100))
    stripe_subscription_id = Column(String(100))
    trial_ends_at = Column(DateTime)

    # Firm profile
    practice_areas = Column(Text)  # JSON list
    firm_size = Column(Integer, default=1)
    colp_name = Column(String(255))
    cofa_name = Column(String(255))
    mlro_name = Column(String(255))

    # Settings — stored as JSON text
    notification_preferences = Column(Text)  # JSON: email alert toggles, frequency, quiet hours
    firm_preferences = Column(Text)  # JSON: timezone, working hours, auto-chase, retention, display

    # SRA Return
    sra_return_edits = Column(Text)  # JSON editable fields for SRA annual return

    # Onboarding
    onboarding_status = Column(String(20), default="pending")  # pending, in_progress, completed
    onboarding_completed_at = Column(DateTime)

    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
