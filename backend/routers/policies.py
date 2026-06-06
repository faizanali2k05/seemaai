"""Policy document management router — now with AI-powered generation."""
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
from models.policies import PolicyDocument
from models.firm import Firm

router = APIRouter()

class PolicyDocumentCreate(BaseModel):
    title: str
    category: str = None
    content: str = None

class GeneratePolicyRequest(BaseModel):
    policy_type: str
    additional_context: str = ""

@router.get("/compliance/policies")
async def list_policies(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List policies."""
    stmt = select(PolicyDocument).where(
        PolicyDocument.firm_id == current_user.firm_id
    )
    result = await db.execute(stmt)
    policies = result.scalars().all()
    return [
        {
            "id": p.id,
            "firm_id": p.firm_id,
            "title": p.title,
            "category": p.category,
            "status": p.status,
            "version": p.version,
            "content": p.content,
            "last_reviewed": p.last_reviewed,
            "next_review": p.next_review,
            "owner": p.owner,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        for p in policies
    ]

@router.post("/compliance/policies")
async def create_policy(
    payload: PolicyDocumentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create policy."""
    policy = PolicyDocument(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=payload.title,
        category=payload.category,
        content=payload.content,
        status="draft",
        version="1.0",
        owner=current_user.user_id,
    )
    db.add(policy)
    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="policy",
        entity_id=policy.id,
        user_id=current_user.user_id,
        details=f"Created policy: {policy.title}",
    )
    return {
        "id": policy.id,
        "firm_id": policy.firm_id,
        "title": policy.title,
        "category": policy.category,
        "status": policy.status,
        "version": policy.version,
        "content": policy.content,
        "last_reviewed": policy.last_reviewed,
        "next_review": policy.next_review,
        "owner": policy.owner,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
    }

@router.post("/compliance/generate-policy")
async def generate_policy(
    req: GeneratePolicyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate a firm-specific policy using AI (falls back to templates)."""
    from services.ai_analysis import generate_policy as ai_generate

    # Get firm for AI context
    firm_result = await db.execute(select(Firm).where(Firm.id == current_user.firm_id))
    firm = firm_result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    policy_type = req.policy_type

    # Call AI service (gracefully degrades to templates)
    ai_result = await ai_generate(policy_type, firm, req.additional_context)

    # Save as draft policy
    policy = PolicyDocument(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        title=ai_result.get("title", f"{policy_type.replace('-', ' ').title()} Policy"),
        category=policy_type,
        content=ai_result.get("content", ""),
        status="draft",
        version="1.0",
        owner=current_user.user_id,
    )
    db.add(policy)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="generated",
        entity_type="policy",
        entity_id=policy.id,
        user_id=current_user.user_id,
        details=json.dumps({
            "policy_type": policy_type,
            "ai_generated": ai_result.get("ai_generated", False),
        }),
    )

    return {
        "id": policy.id,
        "firm_id": policy.firm_id,
        "title": policy.title,
        "category": policy.category,
        "status": policy.status,
        "version": policy.version,
        "content": policy.content,
        "last_reviewed": policy.last_reviewed,
        "next_review": policy.next_review,
        "owner": policy.owner,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
        "ai_generated": ai_result.get("ai_generated", False),
        "regulatory_references": ai_result.get("regulatory_references", []),
    }

@router.get("/compliance/policies/{id}/versions")
async def list_policy_versions(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List policy versions."""
    stmt = select(PolicyDocument).where(
        PolicyDocument.id == id,
        PolicyDocument.firm_id == current_user.firm_id,
    )
    result = await db.execute(stmt)
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Not found")
    return [
        {
            "version": policy.version,
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
            "is_current": True,
        }
    ]
