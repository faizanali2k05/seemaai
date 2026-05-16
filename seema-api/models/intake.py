"""Client intake model."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from database import Base


class ClientIntake(Base):
    __tablename__ = "client_intakes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    client_name = Column(String(255))
    client_email = Column(String(255))
    practice_area = Column(String(100))
    status = Column(String(20), default="pending")
    conflict_check_status = Column(String(20))
    conflict_check_details = Column(Text)
    client_care_letter_sent = Column(Boolean, default=False)
    risk_level = Column(String(20))
    risk_score = Column(Integer)
    assigned_to = Column(String(36))
    source_of_funds = Column(String(100))
    pep_screening = Column(String(20))
    sanctions_check = Column(String(20))
    cdd_status = Column(String(20))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Clio / PMS integration fields
    external_ref = Column(String(100), index=True)  # Clio contact ID
    source = Column(String(50))  # "clio", "manual", etc.
    client_phone = Column(String(50))
    client_type = Column(String(50))  # person, company
    company_name = Column(String(255))
