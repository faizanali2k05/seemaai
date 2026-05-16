"""PolicyDocument model."""
import uuid
from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from database import Base


class PolicyDocument(Base):
    __tablename__ = "policy_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100))
    status = Column(String(50), default="draft")  # draft, active, archived
    version = Column(String(20), default="1.0")
    content = Column(Text)
    last_reviewed = Column(DateTime)
    next_review = Column(DateTime)
    owner = Column(String(36))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
