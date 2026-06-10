"""Evidence document management router."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.evidence import EvidenceDocument

router = APIRouter()

class EvidenceDocumentCreate(BaseModel):
    title: str
    description: str = None
    category: str = None
    file_name: str
    file_size: int

@router.get("/compliance/evidence")
async def list_evidence(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List evidence documents."""
    stmt = select(EvidenceDocument).where(
        EvidenceDocument.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    documents = result.scalars().all()
    return [
        {
            "id": doc.id,
            "firm_id": doc.firm_id,
            "title": doc.title,
            "description": doc.description,
            "category": doc.category,
            "file_path": doc.file_path,
            "file_size": doc.file_size,
            "uploaded_by": doc.uploaded_by,
            "status": doc.status,
            "review_date": doc.review_date,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
        }
        for doc in documents
    ]

@router.post("/compliance/evidence")
async def upload_evidence(
    payload: EvidenceDocumentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Upload evidence document."""
    doc = EvidenceDocument(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        file_path=f"evidence/{payload.file_name}",
        file_size=payload.file_size,
        uploaded_by=current_user.user_id,
        status="pending",
    )
    db.add(doc)
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="evidence_document",
        entity_id=doc.id,
        user_id=current_user.user_id,
        details=f"Uploaded evidence: {doc.title}",
    )
    return {
        "id": doc.id,
        "firm_id": doc.firm_id,
        "title": doc.title,
        "description": doc.description,
        "category": doc.category,
        "file_path": doc.file_path,
        "file_size": doc.file_size,
        "uploaded_by": doc.uploaded_by,
        "status": doc.status,
        "review_date": doc.review_date,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }

@router.post("/compliance/evidence/{id}/verify")
async def verify_evidence(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Verify evidence document."""
    stmt = select(EvidenceDocument).where(
        EvidenceDocument.id == id,
        EvidenceDocument.firm_id == current_user.firm_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.status = "reviewed"
    doc.review_date = datetime.utcnow()
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="verified",
        entity_type="evidence_document",
        entity_id=doc.id,
        user_id=current_user.user_id,
        details=f"Verified evidence: {doc.title}",
    )
    return {
        "id": doc.id,
        "firm_id": doc.firm_id,
        "title": doc.title,
        "description": doc.description,
        "category": doc.category,
        "file_path": doc.file_path,
        "file_size": doc.file_size,
        "uploaded_by": doc.uploaded_by,
        "status": doc.status,
        "review_date": doc.review_date,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }

@router.get("/compliance/evidence/{id}/download")
async def download_evidence(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Download evidence."""
    stmt = select(EvidenceDocument).where(
        EvidenceDocument.id == id,
        EvidenceDocument.firm_id == current_user.firm_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="downloaded",
        entity_type="evidence_document",
        entity_id=doc.id,
        user_id=current_user.user_id,
        details=f"Downloaded evidence: {doc.title}",
    )
    return {
        "id": doc.id,
        "title": doc.title,
        "file_path": doc.file_path,
        "file_size": doc.file_size,
        "file_name": doc.file_path.split("/")[-1] if doc.file_path else "unknown",
    }
