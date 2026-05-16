"""Deadline model."""
import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from database import Base


class Deadline(Base):
    __tablename__ = "deadlines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    due_date = Column(DateTime, nullable=False)
    priority = Column(String(50), default="medium")  # low, medium, high, urgent
    status = Column(String(50), default="pending")  # pending, in_progress, completed, overdue
    assigned_to = Column(String(36))
    category = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
