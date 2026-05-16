"""SRA annual return router."""
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.firm import Firm

router = APIRouter()

def _safe_json(val, default=None):
    """Safely parse JSON, returning default on failure."""
    if default is None:
        default = []
    if not val:
        return default
    try:
        return json.loads(val)
    except (json.JSONDecodeError, ValueError, TypeError):
        return default

class SRAReturnUpdate(BaseModel):
    firm_size: int = None
    colp_name: str = None
    cofa_name: str = None
    mlro_name: str = None
    practice_areas: list = None

@router.get("/compliance/sra-return")
async def get_sra_return(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get SRA return data."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    
    return {
        "firm_id": firm.id,
        "sra_number": firm.sra_number,
        "firm_size": firm.firm_size,
        "colp_name": firm.colp_name,
        "cofa_name": firm.cofa_name,
        "mlro_name": firm.mlro_name,
        "practice_areas": _safe_json(firm.practice_areas, []),
        "sra_return_edits": _safe_json(firm.sra_return_edits, {}),
    }

@router.put("/compliance/sra-return")
async def update_sra_return(
    payload: SRAReturnUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update SRA return fields."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    
    if payload.firm_size is not None:
        firm.firm_size = payload.firm_size
    if payload.colp_name:
        firm.colp_name = payload.colp_name
    if payload.cofa_name:
        firm.cofa_name = payload.cofa_name
    if payload.mlro_name:
        firm.mlro_name = payload.mlro_name
    if payload.practice_areas:
        firm.practice_areas = json.dumps(payload.practice_areas)
    
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="updated",
        entity_type="sra_return",
        entity_id=firm.id,
        user_id=current_user.user_id,
        details="Updated SRA return fields",
    )
    
    return {
        "firm_id": firm.id,
        "sra_number": firm.sra_number,
        "firm_size": firm.firm_size,
        "colp_name": firm.colp_name,
        "cofa_name": firm.cofa_name,
        "mlro_name": firm.mlro_name,
        "practice_areas": _safe_json(firm.practice_areas, []),
    }

@router.post("/compliance/sra-return/export")
async def export_sra_return(
    format: str = "xml",
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Export SRA return."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="exported",
        entity_type="sra_return",
        entity_id=firm.id,
        user_id=current_user.user_id,
        details=f"Exported SRA return as {format}",
    )
    
    return {
        "status": "success",
        "format": format,
        "filename": f"sra_return_{firm.sra_number}_{datetime.now(timezone.utc).isoformat()}.{format}",
    }

@router.post("/compliance/sra-return/export-pdf")
async def export_sra_pdf(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Export SRA return as PDF."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="exported",
        entity_type="sra_return",
        entity_id=firm.id,
        user_id=current_user.user_id,
        details="Exported SRA return as PDF",
    )
    
    return {
        "status": "success",
        "format": "pdf",
        "filename": f"sra_return_{firm.sra_number}.pdf",
    }

@router.post("/compliance/sra-return/submit")
async def submit_sra_return(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Submit SRA return."""
    stmt = select(Firm).where(Firm.id == current_user.firm_id)
    result = await db.execute(stmt)
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="submitted",
        entity_type="sra_return",
        entity_id=firm.id,
        user_id=current_user.user_id,
        details="Submitted SRA return",
    )
    
    return {
        "status": "submitted",
        "submitted_at": datetime.now(timezone.utc),
        "firm_id": firm.id,
    }
