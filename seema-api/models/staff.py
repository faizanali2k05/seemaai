"""Staff models — members and training records."""
import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class StaffMember(Base):
    __tablename__ = "staff_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    name = Column(String(255))
    email = Column(String(255))
    role = Column(String(100))
    department = Column(String(100))
    status = Column(String(20), default="active")
    pqe = Column(Integer)
    sra_id = Column(String(50))
    start_date = Column(String(20))
    last_training = Column(String(20))
    phone = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Clio / PMS integration fields
    external_ref = Column(String(100), index=True)  # Clio user ID
    source = Column(String(50))  # "clio", "manual", etc.


class StaffTraining(Base):
    __tablename__ = "staff_training"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firm_id = Column(String(36), ForeignKey("firms.id"), nullable=False, index=True)
    staff_id = Column(String(36), ForeignKey("staff_members.id"))
    course_name = Column(String(255))
    provider = Column(String(255))
    status = Column(String(20), default="pending")
    due_date = Column(String(20))
    completed_date = Column(String(20))
    certificate_ref = Column(String(100))
    cpd_hours = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
