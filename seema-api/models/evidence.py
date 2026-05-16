"""EvidenceDocument model."""
import uuid
from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from database import Base


class EvidenceDocument(Base):
    __tablename__ = "evidence_documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(100))
    file_path = Column(String(500))
    file_size = Column(Integer, default=0)
    uploaded_by = Column(String(36))
    status = Column(String(50), default="pending")  # pending, reviewed, approved, rejected
    review_date = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
