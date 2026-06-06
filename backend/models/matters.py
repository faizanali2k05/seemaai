"""Matter (case) model."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class Matter(Base):
    __tablename__ = "matters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    client_name = Column(String(255))
    matter_type = Column(String(100))
    reference = Column(String(100))
    status = Column(String(20), default="open")
    assigned_to = Column(String(36))
    risk_level = Column(String(20))
    fee_estimate = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Clio / PMS integration fields
    external_ref = Column(String(100), index=True)  # Clio matter ID
    source = Column(String(50))  # "clio", "manual", etc.
    title = Column(String(255))
    description = Column(Text)
    practice_area = Column(String(100))
    client_id = Column(String(36))
    open_date = Column(String(20))
    close_date = Column(String(20))


# Alias used by routers/matters.py
MatterItem = Matter
