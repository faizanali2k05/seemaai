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
    """A monthly client-account reconciliation run (SRA Accounts Rule 8.3).

    The original model only tracked period/status/discrepancies. The columns
    below were added to support the full COFA-owned reconciliation workflow:
    the 8-phase process, three-way balance figures, the per-account lines, an
    AI-drafted SRA reconciliation report, and the electronic COFA sign-off.
    New columns are added by migration 0002 (idempotent).
    """
    __tablename__ = "reconciliations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    period = Column(String(50))  # monthly, quarterly, annual
    status = Column(String(50), default="in_progress")  # in_progress, reconciled, signed_off, filed
    reconciled_by = Column(String(36))
    discrepancies = Column(Text)  # JSON
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    # ── Workflow / reporting columns (added in 0002) ──
    period_label = Column(String(100))          # human label, e.g. "May 2026"
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    phase = Column(Integer, default=1)          # current wizard phase, 1..8
    client_money_held = Column(Numeric(15, 2), default=0)
    variance_total = Column(Numeric(15, 2), default=0)
    open_exceptions = Column(Integer, default=0)
    aged_residuals = Column(Numeric(15, 2), default=0)
    accounts = Column(Text)                     # JSON array of per-account lines
    notes = Column(Text)
    ai_report = Column(Text)                    # AI-drafted SRA reconciliation report (markdown)
    ai_report_generated_at = Column(DateTime)
    signed_off_by = Column(String(255))         # COFA name captured at sign-off
    signed_off_at = Column(DateTime)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
