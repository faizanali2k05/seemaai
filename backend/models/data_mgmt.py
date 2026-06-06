"""ImportHistory model."""
import uuid
from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.sql import func
from database import Base


class ImportHistory(Base):
    __tablename__ = "import_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), nullable=False, index=True)
    import_type = Column(String(100), nullable=False)
    filename = Column(String(255))
    status = Column(String(50), default="pending")  # pending, in_progress, completed, failed
    records_processed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    imported_by = Column(String(36))
    created_at = Column(DateTime, server_default=func.now())
