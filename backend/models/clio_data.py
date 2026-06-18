"""Clio financial/activity models — synced read-only from Clio PMS.

These tables hold data Seema pulls from Clio that does not map onto an existing
compliance table: time/expense activities and bills/invoices. Both carry
firm_id (so apply_rls.py enforces tenant isolation automatically) and
external_ref (the Clio record ID) for idempotent upsert on re-sync.
"""
import uuid
from sqlalchemy import Column, String, DateTime, Numeric, Text
from sqlalchemy.sql import func
from database import Base


class ClioActivity(Base):
    """A Clio time-entry or expense-entry (read-only mirror)."""
    __tablename__ = "clio_activities"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    external_ref = Column(String(100), index=True)  # Clio activity ID
    source = Column(String(50), default="clio")
    activity_type = Column(String(50))  # TimeEntry, ExpenseEntry
    date = Column(DateTime)
    quantity = Column(Numeric(12, 2))   # hours (time) or units (expense)
    total = Column(Numeric(15, 2))
    note = Column(Text)
    matter_ref = Column(String(100))
    matter_external_ref = Column(String(100), index=True)
    user_name = Column(String(255))
    billed = Column(String(20))         # billed / unbilled / non_billable
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ClioBill(Base):
    """A Clio bill/invoice (read-only mirror)."""
    __tablename__ = "clio_bills"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    external_ref = Column(String(100), index=True)  # Clio bill ID
    source = Column(String(50), default="clio")
    number = Column(String(100))
    state = Column(String(50))          # draft, awaiting_payment, paid, void
    total = Column(Numeric(15, 2))
    balance = Column(Numeric(15, 2))
    issued_at = Column(DateTime)
    due_at = Column(DateTime)
    client_name = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
