"""ChaserLog model."""
import uuid
from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.sql import func
from database import Base


class ChaserLog(Base):
    __tablename__ = "chaser_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    matter_ref = Column(String(100))
    chaser_type = Column(String(100))  # email, sms, letter
    recipient = Column(String(255))
    subject = Column(String(255))
    status = Column(String(50), default="pending")  # pending, sent, failed, bounced
    sent_at = Column(DateTime)
    response_at = Column(DateTime)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
