"""RemediationPlan model."""
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class RemediationPlan(Base):
    __tablename__ = "remediation_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    source = Column(String(100))  # compliance alert, breach report, etc.
    priority = Column(String(50), default="medium")  # low, medium, high, critical
    status = Column(String(50), default="pending")  # pending, in_progress, completed
    assigned_to = Column(String(36))
    due_date = Column(DateTime)
    steps = Column(Text)  # JSON array of steps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
