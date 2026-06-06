"""Complaint model."""
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    complainant_name = Column(String(255), nullable=False)
    complainant_type = Column(String(100))  # client, third_party, staff
    category = Column(String(100))
    description = Column(Text)
    priority = Column(String(50), default="medium")  # low, medium, high, urgent
    status = Column(String(50), default="open")  # open, investigating, resolved, closed
    assigned_to = Column(String(36))
    opened_date = Column(DateTime, server_default=func.now())
    closed_date = Column(DateTime)
    resolution = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
