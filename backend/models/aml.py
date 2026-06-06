"""CDDRecord and SARRecord models for AML compliance."""
import uuid
from sqlalchemy import Column, String, DateTime, Text, Boolean, Numeric
from sqlalchemy.sql import func
from database import Base


class CDDRecord(Base):
    __tablename__ = "cdd_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    client_name = Column(String(255), nullable=False)
    client_type = Column(String(100))  # individual, company
    cdd_level = Column(String(50))  # standard, enhanced
    risk_level = Column(String(50), default="medium")  # low, medium, high
    id_verified = Column(Boolean, default=False)
    address_verified = Column(Boolean, default=False)
    sof_verified = Column(Boolean, default=False)
    status = Column(String(50), default="pending")  # pending, approved, rejected
    nationality = Column(String(100))
    country_of_residence = Column(String(100))
    company_number = Column(String(50))
    date_of_birth = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SARRecord(Base):
    __tablename__ = "sar_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    client_name = Column(String(255), nullable=False)
    matter_ref = Column(String(100))
    suspicion_type = Column(String(100))
    amount = Column(Numeric(15, 2))
    report_date = Column(DateTime)
    mlro_decision = Column(String(100))
    nca_filed = Column(Boolean, default=False)
    status = Column(String(50), default="submitted")  # submitted, reviewed, filed
    grounds_for_suspicion = Column(Text)
    transaction_details = Column(Text)  # JSON
    created_at = Column(DateTime, server_default=func.now())
