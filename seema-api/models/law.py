"""KeyDate and SupervisionRecord models."""
import uuid
from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from database import Base


class KeyDate(Base):
    __tablename__ = "key_dates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    date = Column(DateTime, nullable=False)
    category = Column(String(100))  # deadline, anniversary, renewal, etc.
    status = Column(String(50), default="pending")  # pending, due, overdue, completed
    assigned_to = Column(String(36))
    created_at = Column(DateTime, server_default=func.now())


class SupervisionRecord(Base):
    __tablename__ = "supervision_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    staff_id = Column(String(36), nullable=False)
    staff_name = Column(String(255))
    supervisor = Column(String(255))
    frequency = Column(String(50))  # monthly, quarterly, annual
    last_session = Column(DateTime)
    next_due = Column(DateTime)
    status = Column(String(50), default="pending")  # pending, completed, overdue
    notes_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
