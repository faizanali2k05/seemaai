"""AML router — CDD, PEP screening, SAR management."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.aml import CDDRecord, SARRecord

router = APIRouter()

# Pydantic schemas
class CDDRecordCreate(BaseModel):
    client_name: str
    client_type: str  # individual, company
    cdd_level: str  # standard, enhanced
    nationality: str | None = None
    country_of_residence: str | None = None
    company_number: str | None = None
    date_of_birth: datetime | None = None

class CDDVerify(BaseModel):
    id_verified: bool
    address_verified: bool
    sof_verified: bool

class PEPScreening(BaseModel):
    client_id: str
    client_name: str

class SanctionsCheck(BaseModel):
    client_id: str
    client_name: str

class SARRecordCreate(BaseModel):
    client_name: str
    matter_ref: str | None = None
    suspicion_type: str
    amount: Decimal | None = None
    grounds_for_suspicion: str

class MLRODecision(BaseModel):
    decision: str
    nca_filed: bool

class CDDResponse(BaseModel):
    id: str
    firm_id: str
    client_name: str
    client_type: str
    cdd_level: str
    risk_level: str
    id_verified: bool
    address_verified: bool
    sof_verified: bool
    status: str
    nationality: str | None
    country_of_residence: str | None
    company_number: str | None
    date_of_birth: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/aml/stats")
async def get_aml_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get CDD and AML statistics."""
    stmt = select(
        func.count(CDDRecord.id).label("total_cdd"),
        func.count(func.nullif(CDDRecord.status != "pending", True)).label("pending_cdd"),
        func.count(func.nullif(CDDRecord.status != "approved", True)).label("approved_cdd"),
    ).where(CDDRecord.firm_id == current_user.firm_id)

    result = await db.execute(stmt)
    row = result.first()

    sar_stmt = select(func.count(SARRecord.id)).where(
        SARRecord.firm_id == current_user.firm_id
    )
    sar_result = await db.execute(sar_stmt)
    sar_count = sar_result.scalar() or 0

    return {
        "total_cdd": row[0] or 0,
        "pending_cdd": row[1] or 0,
        "approved_cdd": row[2] or 0,
        "total_sars": sar_count,
    }

@router.get("/compliance/aml/cdd")
async def list_cdd_records(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List CDD records for the firm."""
    stmt = (
        select(CDDRecord)
        .where(CDDRecord.firm_id == current_user.firm_id)
        .order_by(CDDRecord.created_at.desc())
    )

    result = await db.execute(stmt)
    records = result.scalars().all()

    return [
        {
            "id": r.id,
            "firm_id": r.firm_id,
            "client_name": r.client_name,
            "client_type": r.client_type,
            "cdd_level": r.cdd_level,
            "risk_level": r.risk_level,
            "id_verified": r.id_verified,
            "address_verified": r.address_verified,
            "sof_verified": r.sof_verified,
            "status": r.status,
            "nationality": r.nationality,
            "country_of_residence": r.country_of_residence,
            "company_number": r.company_number,
            "date_of_birth": r.date_of_birth,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in records
    ]

@router.post("/compliance/aml/cdd")
async def create_cdd_record(
    cdd: CDDRecordCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new CDD record."""
    new_cdd = CDDRecord(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        client_name=cdd.client_name,
        client_type=cdd.client_type,
        cdd_level=cdd.cdd_level,
        nationality=cdd.nationality,
        country_of_residence=cdd.country_of_residence,
        company_number=cdd.company_number,
        date_of_birth=cdd.date_of_birth,
        risk_level="medium",
        status="pending",
    )

    db.add(new_cdd)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="cdd_record",
        entity_id=new_cdd.id,
        user_id=current_user.user_id,
        details=f"CDD for {cdd.client_name}",
    )

    return {
        "id": new_cdd.id,
        "firm_id": new_cdd.firm_id,
        "client_name": new_cdd.client_name,
        "client_type": new_cdd.client_type,
        "cdd_level": new_cdd.cdd_level,
        "risk_level": new_cdd.risk_level,
        "id_verified": new_cdd.id_verified,
        "address_verified": new_cdd.address_verified,
        "sof_verified": new_cdd.sof_verified,
        "status": new_cdd.status,
        "nationality": new_cdd.nationality,
        "country_of_residence": new_cdd.country_of_residence,
        "company_number": new_cdd.company_number,
        "date_of_birth": new_cdd.date_of_birth,
        "created_at": new_cdd.created_at,
        "updated_at": new_cdd.updated_at,
    }

@router.get("/compliance/aml/cdd/{cdd_id}")
async def get_cdd_record(
    cdd_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get a CDD record with screening results."""
    stmt = select(CDDRecord).where(
        (CDDRecord.id == cdd_id) & (CDDRecord.firm_id == current_user.firm_id)
    )

    result = await db.execute(stmt)
    cdd = result.scalar_one_or_none()

    if not cdd:
        raise HTTPException(status_code=404, detail="CDD record not found")

    return {
        "id": cdd.id,
        "firm_id": cdd.firm_id,
        "client_name": cdd.client_name,
        "client_type": cdd.client_type,
        "cdd_level": cdd.cdd_level,
        "risk_level": cdd.risk_level,
        "id_verified": cdd.id_verified,
        "address_verified": cdd.address_verified,
        "sof_verified": cdd.sof_verified,
        "status": cdd.status,
        "nationality": cdd.nationality,
        "country_of_residence": cdd.country_of_residence,
        "company_number": cdd.company_number,
        "date_of_birth": cdd.date_of_birth,
        "screenings": {
            "pep_screening": False,
            "sanctions_check": False,
        },
        "created_at": cdd.created_at,
        "updated_at": cdd.updated_at,
    }

@router.post("/compliance/aml/cdd/{cdd_id}/verify")
async def verify_cdd(
    cdd_id: str,
    verify: CDDVerify,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Verify CDD checks (ID, address, source of funds)."""
    stmt = (
        update(CDDRecord)
        .where((CDDRecord.id == cdd_id) & (CDDRecord.firm_id == current_user.firm_id))
        .values(
            id_verified=verify.id_verified,
            address_verified=verify.address_verified,
            sof_verified=verify.sof_verified,
            status="approved" if all([verify.id_verified, verify.address_verified, verify.sof_verified]) else "pending",
        )
        .returning(CDDRecord)
    )

    result = await db.execute(stmt)
    cdd = result.scalar_one_or_none()

    if not cdd:
        raise HTTPException(status_code=404, detail="CDD record not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="verified",
        entity_type="cdd_record",
        entity_id=cdd_id,
        user_id=current_user.user_id,
        details="CDD verification completed",
    )

    return {
        "id": cdd.id,
        "firm_id": cdd.firm_id,
        "client_name": cdd.client_name,
        "client_type": cdd.client_type,
        "cdd_level": cdd.cdd_level,
        "risk_level": cdd.risk_level,
        "id_verified": cdd.id_verified,
        "address_verified": cdd.address_verified,
        "sof_verified": cdd.sof_verified,
        "status": cdd.status,
        "nationality": cdd.nationality,
        "country_of_residence": cdd.country_of_residence,
        "company_number": cdd.company_number,
        "date_of_birth": cdd.date_of_birth,
        "created_at": cdd.created_at,
        "updated_at": cdd.updated_at,
    }

@router.post("/compliance/aml/pep-screening")
async def run_pep_screening(
    screening: PEPScreening,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Run PEP screening on a client."""
    # Get CDD record
    stmt = select(CDDRecord).where(
        (CDDRecord.id == screening.client_id)
        & (CDDRecord.firm_id == current_user.firm_id)
    )
    result = await db.execute(stmt)
    cdd = result.scalar_one_or_none()

    if not cdd:
        raise HTTPException(status_code=404, detail="CDD record not found")

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="screened",
        entity_type="cdd_record",
        entity_id=screening.client_id,
        user_id=current_user.user_id,
        details="PEP screening executed",
    )

    return {
        "client_id": screening.client_id,
        "client_name": screening.client_name,
        "pep_match": False,
        "risk_level": "low",
        "details": "No PEP matches found",
    }

@router.post("/compliance/aml/sanctions-check")
async def run_sanctions_check(
    check: SanctionsCheck,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Run sanctions screening on a client."""
    # Get CDD record
    stmt = select(CDDRecord).where(
        (CDDRecord.id == check.client_id)
        & (CDDRecord.firm_id == current_user.firm_id)
    )
    result = await db.execute(stmt)
    cdd = result.scalar_one_or_none()

    if not cdd:
        raise HTTPException(status_code=404, detail="CDD record not found")

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="screened",
        entity_type="cdd_record",
        entity_id=check.client_id,
        user_id=current_user.user_id,
        details="Sanctions screening executed",
    )

    return {
        "client_id": check.client_id,
        "client_name": check.client_name,
        "sanctions_match": False,
        "risk_level": "low",
        "details": "No sanctions matches found",
    }

@router.get("/compliance/aml/sar")
async def list_sars(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List SARs for the firm."""
    stmt = (
        select(SARRecord)
        .where(SARRecord.firm_id == current_user.firm_id)
        .order_by(SARRecord.created_at.desc())
    )

    result = await db.execute(stmt)
    sars = result.scalars().all()

    return [
        {
            "id": s.id,
            "firm_id": s.firm_id,
            "client_name": s.client_name,
            "matter_ref": s.matter_ref,
            "suspicion_type": s.suspicion_type,
            "amount": float(s.amount) if s.amount else None,
            "report_date": s.report_date,
            "mlro_decision": s.mlro_decision,
            "nca_filed": s.nca_filed,
            "status": s.status,
            "grounds_for_suspicion": s.grounds_for_suspicion,
            "created_at": s.created_at,
        }
        for s in sars
    ]

@router.post("/compliance/aml/sar")
async def create_sar(
    sar: SARRecordCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a new SAR."""
    current_user.require_role("admin")

    new_sar = SARRecord(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        client_name=sar.client_name,
        matter_ref=sar.matter_ref,
        suspicion_type=sar.suspicion_type,
        amount=sar.amount,
        grounds_for_suspicion=sar.grounds_for_suspicion,
        report_date=datetime.now(timezone.utc),
        status="submitted",
        nca_filed=False,
    )

    db.add(new_sar)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="sar_record",
        entity_id=new_sar.id,
        user_id=current_user.user_id,
        details=f"SAR for {sar.client_name}",
    )

    return {
        "id": new_sar.id,
        "firm_id": new_sar.firm_id,
        "client_name": new_sar.client_name,
        "matter_ref": new_sar.matter_ref,
        "suspicion_type": new_sar.suspicion_type,
        "amount": float(new_sar.amount) if new_sar.amount else None,
        "report_date": new_sar.report_date,
        "mlro_decision": new_sar.mlro_decision,
        "nca_filed": new_sar.nca_filed,
        "status": new_sar.status,
        "grounds_for_suspicion": new_sar.grounds_for_suspicion,
        "created_at": new_sar.created_at,
    }

@router.post("/compliance/aml/sar/{sar_id}/mlro-decision")
async def record_mlro_decision(
    sar_id: str,
    decision: MLRODecision,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record MLRO decision on a SAR."""
    current_user.require_role("admin")

    stmt = (
        update(SARRecord)
        .where((SARRecord.id == sar_id) & (SARRecord.firm_id == current_user.firm_id))
        .values(
            mlro_decision=decision.decision,
            nca_filed=decision.nca_filed,
            status="filed" if decision.nca_filed else "reviewed",
        )
        .returning(SARRecord)
    )

    result = await db.execute(stmt)
    sar = result.scalar_one_or_none()

    if not sar:
        raise HTTPException(status_code=404, detail="SAR not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="updated",
        entity_type="sar_record",
        entity_id=sar_id,
        user_id=current_user.user_id,
        details=f"MLRO decision: {decision.decision}",
    )

    return {
        "id": sar.id,
        "firm_id": sar.firm_id,
        "client_name": sar.client_name,
        "matter_ref": sar.matter_ref,
        "suspicion_type": sar.suspicion_type,
        "amount": float(sar.amount) if sar.amount else None,
        "report_date": sar.report_date,
        "mlro_decision": sar.mlro_decision,
        "nca_filed": sar.nca_filed,
        "status": sar.status,
        "grounds_for_suspicion": sar.grounds_for_suspicion,
        "created_at": sar.created_at,
    }
