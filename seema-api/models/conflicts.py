"""ConflictCheck and ConflictParty models."""
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class ConflictCheck(Base):
    __tablename__ = "conflict_checks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    client_name = Column(String(255), nullable=False)
    matter_type = Column(String(100))
    parties = Column(Text)  # JSON list
    status = Column(String(50), default="pending")  # pending, clear, conflicted
    conflict_type = Column(String(100))
    checked_by = Column(String(36))
    resolution = Column(Text)
    resolved_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ConflictParty(Base):
    __tablename__ = "conflict_parties"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    party_name = Column(String(255), nullable=False)
    party_type = Column(String(50))  # individual, company, entity
    date_added = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
