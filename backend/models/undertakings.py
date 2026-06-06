"""Undertaking model."""
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class Undertaking(Base):
    __tablename__ = "undertakings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    description = Column(Text, nullable=False)
    matter_ref = Column(String(100))
    given_to = Column(String(255))
    given_by = Column(String(255))
    given_date = Column(DateTime)
    due_date = Column(DateTime)
    status = Column(String(50), default="pending")  # pending, fulfilled, breached
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
