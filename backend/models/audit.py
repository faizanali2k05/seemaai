"""AuditLog model for audit trails."""
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(36))
    user_id = Column(String(36))
    details = Column(Text)  # JSON
    ip_address = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())
