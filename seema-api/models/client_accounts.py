"""ClientAccount, Transaction, and Reconciliation models."""
import uuid
from sqlalchemy import Column, String, DateTime, Numeric, Integer, Text
from sqlalchemy.sql import func
from database import Base


class ClientAccount(Base):
    __tablename__ = "client_accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    account_name = Column(String(255), nullable=False)
    account_type = Column(String(50))  # client, office, controlled, segregated
    balance = Column(Numeric(15, 2), default=0)
    status = Column(String(50), default="active")  # active, inactive, closed
    bank_name = Column(String(255))
    account_number = Column(String(50))
    sort_code = Column(String(10))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    account_id = Column(String(36), nullable=False)
    date = Column(DateTime, nullable=False)
    description = Column(String(255))
    amount = Column(Numeric(15, 2), nullable=False)
    type = Column(String(50))  # debit, credit, transfer
    matter_ref = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())


class Reconciliation(Base):
    __tablename__ = "reconciliations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    period = Column(String(50))  # monthly, quarterly, annual
    status = Column(String(50), default="pending")  # pending, in_progress, complete, failed
    reconciled_by = Column(String(36))
    discrepancies = Column(Text)  # JSON
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
