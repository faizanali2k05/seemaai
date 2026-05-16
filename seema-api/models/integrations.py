"""Integration models — Clio PMS connection, OAuth tokens, sync history."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from database import Base


class Integration(Base):
    """Stores OAuth credentials and connection state for a firm's PMS integration."""
    __tablename__ = "integrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    provider = Column(String(50), nullable=False, default="clio")  # clio, leap, pms360, etc.
    status = Column(String(20), default="disconnected")  # disconnected, connected, error

    # OAuth2 credentials
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expires_at = Column(DateTime)
    token_scope = Column(String(500))

    # Provider account info (populated after OAuth)
    provider_firm_name = Column(String(255))
    provider_user_name = Column(String(255))
    provider_user_id = Column(String(100))
    provider_account_id = Column(String(100))

    # Connection metadata
    connected_at = Column(DateTime)
    disconnected_at = Column(DateTime)
    last_error = Column(Text)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class IntegrationSyncLog(Base):
    """Tracks each sync operation between Seema and the external PMS."""
    __tablename__ = "integration_sync_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    integration_id = Column(String(36), ForeignKey("integrations.id"), nullable=False, index=True)

    sync_type = Column(String(50), nullable=False)  # full, matters, contacts, staff, activities, billing
    status = Column(String(20), default="running")   # running, completed, failed
    direction = Column(String(10), default="pull")    # pull (from Clio) or push (to Clio)

    # Counters
    records_synced = Column(Integer, default=0)
    records_created = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)
    records_errored = Column(Integer, default=0)

    # Timing
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
    duration_seconds = Column(Integer)

    # Error details
    error_message = Column(Text)
    error_details = Column(Text)

    created_at = Column(DateTime, server_default=func.now())
