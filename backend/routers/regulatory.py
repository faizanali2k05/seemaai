"""Regulatory updates endpoints — feed, interpretation, history, acknowledgement, override."""
import json
import uuid
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit

logger = logging.getLogger(__name__)
# NOTE: no prefix here — every route in this file already starts with
# `/compliance/...`. The router is included in main.py with prefix="/api",
# so `/compliance/regulatory-updates` becomes `/api/compliance/regulatory-updates`.
# Adding `prefix="/compliance"` here double-prefixed every route.
router = APIRouter(tags=["regulatory"])


@router.get("/compliance/regulatory-updates/{update_id}/acknowledgements")
async def get_update_acknowledgements(
    update_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Staff read-tracking for a regulatory update (was 404)."""
    from models.staff import StaffMember
    from models.regulatory import RegulatoryAcknowledgement

    acks = (await db.execute(
        select(RegulatoryAcknowledgement).where(
            RegulatoryAcknowledgement.firm_id == current_user.firm_id,
            RegulatoryAcknowledgement.update_id == update_id,
        )
    )).scalars().all()
    staff = (await db.execute(
        select(StaffMember).where(
            StaffMember.firm_id == current_user.firm_id,
            StaffMember.status == "active",
        )
    )).scalars().all()
    ack_names = {a.staff_name for a in acks if a.staff_name}
    acknowledged = [
        {"id": a.user_id or a.id, "name": a.staff_name or "Staff",
         "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None}
        for a in acks
    ]
    pending = [
        {"id": s.id, "name": s.name, "acknowledged_at": None}
        for s in staff if (s.name or "") not in ack_names
    ]
    return {
        "total_staff": max(len(staff), len(acknowledged)),
        "acknowledged_count": len(acknowledged),
        "acknowledged": acknowledged,
        "pending": pending,
    }


@router.post("/compliance/regulatory-updates/{update_id}/acknowledge-staff")
async def acknowledge_update_staff(
    update_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Current user marks a regulatory update as read (was 404)."""
    from models.regulatory import RegulatoryAcknowledgement
    from models.auth import UserAccount

    existing = (await db.execute(
        select(RegulatoryAcknowledgement).where(
            RegulatoryAcknowledgement.firm_id == current_user.firm_id,
            RegulatoryAcknowledgement.update_id == update_id,
            RegulatoryAcknowledgement.user_id == current_user.user_id,
        )
    )).scalar_one_or_none()
    if not existing:
        ua = (await db.execute(
            select(UserAccount).where(UserAccount.id == current_user.user_id)
        )).scalar_one_or_none()
        name = (getattr(ua, "full_name", None) or getattr(ua, "name", None)
                or (ua.email if ua else None) or "Staff")
        db.add(RegulatoryAcknowledgement(
            id=str(uuid.uuid4()), firm_id=current_user.firm_id, update_id=update_id,
            user_id=current_user.user_id, staff_name=name,
        ))
        await db.flush()
        await log_audit(
            db=db, firm_id=current_user.firm_id, action="acknowledged",
            entity_type="regulatory_update", entity_id=update_id,
            user_id=current_user.user_id, details="Marked regulatory update as read",
        )
    return {"acknowledged": True}


# ── Request schemas ─────────────────────────────────────────────────────

class OverrideRequest(BaseModel):
    """COLP/COFA override of an AI-generated regulatory interpretation."""
    applicability: str  # "yes", "no", "maybe"
    notes: Optional[str] = None
    action_items: Optional[List[str]] = None

    @field_validator("applicability")
    @classmethod
    def validate_applicability(cls, v):
        if v not in ("yes", "no", "maybe"):
            raise ValueError("applicability must be 'yes', 'no', or 'maybe'")
        return v

# ── Helpers ──────────────────────────────────────────────────────────────

def _serialize_interp(interp, include_audit=False):
    """Serialize a RegulatoryInterpretation to dict."""
    action_items = []
    if interp.action_items:
        try:
            action_items = json.loads(interp.action_items)
        except (json.JSONDecodeError, TypeError):
            action_items = [interp.action_items] if interp.action_items else []

    # Parse override action items if present
    override_action_items = None
    if interp.override_action_items:
        try:
            override_action_items = json.loads(interp.override_action_items)
        except (json.JSONDecodeError, TypeError):
            override_action_items = [interp.override_action_items]

    # Effective values — override wins if present
    effective_applicability = interp.override_applicability or interp.applicability
    effective_action_items = override_action_items if override_action_items is not None else action_items

    data = {
        "id": interp.id,
        "update_id": interp.update_id,
        "firm_id": interp.firm_id,
        "summary": interp.summary,
        "applicability": interp.applicability,
        "applicability_reasoning": interp.applicability_reasoning,
        "action_items": action_items,
        "source_citation": interp.source_citation,
        "confidence_score": interp.confidence_score,
        "confidence_label": interp.confidence_label,
        "status": interp.status,
        "model_used": interp.model_used,
        "created_at": interp.created_at.isoformat() if interp.created_at else None,

        # Human override fields
        "override_applicability": interp.override_applicability,
        "override_notes": interp.override_notes,
        "override_action_items": override_action_items,
        "overridden_by": interp.overridden_by,
        "overridden_at": interp.overridden_at.isoformat() if interp.overridden_at else None,
        "has_override": interp.override_applicability is not None,

        # Effective values — what the firm should act on
        "effective_applicability": effective_applicability,
        "effective_action_items": effective_action_items,
    }

    if include_audit:
        data.update({
            "processing_time_ms": interp.processing_time_ms,
            "error_message": interp.error_message,
            "delivered_at": interp.delivered_at.isoformat() if interp.delivered_at else None,
            "acknowledged_at": interp.acknowledged_at.isoformat() if interp.acknowledged_at else None,
            "acknowledged_by": interp.acknowledged_by,
            "updated_at": interp.updated_at.isoformat() if interp.updated_at else None,
        })

    return data

async def _mark_delivered(db: AsyncSession, interp):
    """Set delivered_at on first view if not already set."""
    if interp.status == "completed" and not interp.delivered_at:
        interp.delivered_at = datetime.utcnow()
        db.add(interp)
        await db.flush()
        # Reload server-computed columns (updated_at uses onupdate=func.now()).
        # Without this they stay expired after the flush and accessing them during
        # serialization triggers a lazy reload that crashes the async session
        # (sqlalchemy MissingGreenlet).
        await db.refresh(interp)

# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/compliance/regulatory-updates")
async def list_regulatory_updates(
    source: str = Query(None, description="Filter by source: sra, ico, hmrc, govuk, lawsociety"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List regulatory updates with optional source filter.

    Returns updates plus any existing interpretations for this firm.
    Automatically marks completed interpretations as "delivered" on first view.
    """
    from models.regulatory import RegulatoryUpdate, RegulatoryInterpretation

    query = select(RegulatoryUpdate).order_by(desc(RegulatoryUpdate.created_at))

    if source:
        query = query.where(RegulatoryUpdate.source == source)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    updates = result.scalars().all()

    # Serialize the update rows IMMEDIATELY — capture column values while the
    # attributes are still fresh. Doing this before the interpretation query /
    # _mark_delivered flush avoids async-SQLAlchemy MissingGreenlet errors from
    # expired-attribute lazy loads on the async session.
    data = [{
        "id": u.id,
        "source": u.source,
        "source_url": u.source_url,
        "title": u.title,
        "summary": u.summary,
        "category": u.category,
        "published_date": u.published_date,
        "impact_level": u.impact_level,
        "tags": u.tags,
        "scraped_at": u.scraped_at.isoformat() if u.scraped_at else None,
        "interpretation": None,
    } for u in updates]
    by_id = {d["id"]: d for d in data}

    # Batch-fetch interpretations for this firm and attach them
    if by_id:
        interp_result = await db.execute(
            select(RegulatoryInterpretation).where(
                RegulatoryInterpretation.update_id.in_(list(by_id.keys())),
                RegulatoryInterpretation.firm_id == user.firm_id,
            )
        )
        for interp in interp_result.scalars().all():
            await _mark_delivered(db, interp)
            if interp.update_id in by_id:
                by_id[interp.update_id]["interpretation"] = _serialize_interp(interp, include_audit=True)

    return {"data": data}

@router.get("/compliance/regulatory-updates/{update_id}")
async def get_regulatory_update(
    update_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get a single regulatory update with its full body and firm-specific interpretation."""
    from models.regulatory import RegulatoryUpdate, RegulatoryInterpretation

    result = await db.execute(
        select(RegulatoryUpdate).where(RegulatoryUpdate.id == update_id)
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(404, "Regulatory update not found")

    # Get interpretation for this firm
    interp_result = await db.execute(
        select(RegulatoryInterpretation).where(
            RegulatoryInterpretation.update_id == update_id,
            RegulatoryInterpretation.firm_id == user.firm_id,
        )
    )
    interp = interp_result.scalar_one_or_none()

    interpretation = None
    if interp:
        await _mark_delivered(db, interp)
        interpretation = _serialize_interp(interp, include_audit=True)

    return {
        "data": {
            "id": update.id,
            "source": update.source,
            "source_url": update.source_url,
            "title": update.title,
            "summary": update.summary,
            "body": update.body,
            "category": update.category,
            "published_date": update.published_date,
            "effective_date": update.effective_date,
            "impact_level": update.impact_level,
            "tags": update.tags,
            "scraped_at": update.scraped_at.isoformat() if update.scraped_at else None,
            "interpretation": interpretation,
        }
    }

@router.post("/compliance/regulatory-updates/{update_id}/interpret")
async def interpret_update(
    update_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Trigger AI interpretation of a regulatory update for the current firm."""
    from models.regulatory import RegulatoryUpdate

    result = await db.execute(
        select(RegulatoryUpdate).where(RegulatoryUpdate.id == update_id)
    )
    update = result.scalar_one_or_none()
    if not update:
        raise HTTPException(404, "Regulatory update not found")

    from tasks.regulatory_tasks import interpret_regulatory_update
    interpret_regulatory_update.delay(update_id, user.firm_id)

    return {
        "data": {
            "status": "queued",
            "update_id": update_id,
            "firm_id": user.firm_id,
            "message": "Interpretation has been queued. Refresh in a few seconds to see the result.",
        }
    }

@router.get("/compliance/regulatory-updates/{update_id}/interpretation")
async def get_interpretation(
    update_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get the firm-specific interpretation of a regulatory update."""
    from models.regulatory import RegulatoryInterpretation

    result = await db.execute(
        select(RegulatoryInterpretation).where(
            RegulatoryInterpretation.update_id == update_id,
            RegulatoryInterpretation.firm_id == user.firm_id,
        )
    )
    interp = result.scalar_one_or_none()

    if not interp:
        raise HTTPException(404, "No interpretation found for this update. Use POST to trigger analysis.")

    await _mark_delivered(db, interp)

    return {"data": _serialize_interp(interp, include_audit=True)}

@router.post("/compliance/regulatory-updates/{update_id}/acknowledge")
async def acknowledge_interpretation(
    update_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Acknowledge that the firm has reviewed a regulatory interpretation.

    This creates a timestamped audit trail entry proving "we told you about X
    on date Y, and you acknowledged it on date Z".
    """
    from models.regulatory import RegulatoryInterpretation

    result = await db.execute(
        select(RegulatoryInterpretation).where(
            RegulatoryInterpretation.update_id == update_id,
            RegulatoryInterpretation.firm_id == user.firm_id,
        )
    )
    interp = result.scalar_one_or_none()

    if not interp:
        raise HTTPException(404, "No interpretation found to acknowledge.")

    if interp.status != "completed":
        raise HTTPException(400, "Cannot acknowledge an interpretation that is not completed.")

    # Set delivered if not already
    if not interp.delivered_at:
        interp.delivered_at = datetime.utcnow()

    interp.acknowledged_at = datetime.utcnow()
    interp.acknowledged_by = user.id
    db.add(interp)
    await db.flush()

    return {
        "data": {
            "id": interp.id,
            "update_id": interp.update_id,
            "acknowledged_at": interp.acknowledged_at.isoformat(),
            "acknowledged_by": interp.acknowledged_by,
            "message": "Interpretation acknowledged. This has been recorded in your compliance audit trail.",
        }
    }

@router.post("/compliance/regulatory-updates/{update_id}/override")
async def override_interpretation(
    update_id: str,
    body: OverrideRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """COLP/COFA override of an AI-generated regulatory interpretation.

    This does NOT delete the AI's original assessment — it records a human
    correction alongside it.  The `effective_applicability` and
    `effective_action_items` fields in the response will reflect the override,
    while the original AI values are preserved for the audit trail.
    """
    from models.regulatory import RegulatoryInterpretation

    result = await db.execute(
        select(RegulatoryInterpretation).where(
            RegulatoryInterpretation.update_id == update_id,
            RegulatoryInterpretation.firm_id == user.firm_id,
        )
    )
    interp = result.scalar_one_or_none()

    if not interp:
        raise HTTPException(404, "No interpretation found to override. Run the AI analysis first.")

    if interp.status != "completed":
        raise HTTPException(400, "Cannot override an interpretation that is not completed.")

    # Apply the override
    interp.override_applicability = body.applicability
    interp.override_notes = body.notes
    interp.override_action_items = json.dumps(body.action_items) if body.action_items else None
    interp.overridden_by = user.id
    interp.overridden_at = datetime.utcnow()
    db.add(interp)
    await db.flush()

    logger.info(
        "Override applied: update=%s firm=%s by=%s applicability=%s→%s",
        update_id, user.firm_id, user.id, interp.applicability, body.applicability,
    )

    return {
        "data": {
            **_serialize_interp(interp, include_audit=True),
            "message": "Human override recorded. The AI's original assessment is preserved in the audit trail.",
        }
    }

@router.delete("/compliance/regulatory-updates/{update_id}/override")
async def remove_override(
    update_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Remove a human override, reverting to the AI's original assessment."""
    from models.regulatory import RegulatoryInterpretation

    result = await db.execute(
        select(RegulatoryInterpretation).where(
            RegulatoryInterpretation.update_id == update_id,
            RegulatoryInterpretation.firm_id == user.firm_id,
        )
    )
    interp = result.scalar_one_or_none()

    if not interp:
        raise HTTPException(404, "No interpretation found.")

    if not interp.override_applicability:
        raise HTTPException(400, "No override exists to remove.")

    # Clear override fields
    interp.override_applicability = None
    interp.override_notes = None
    interp.override_action_items = None
    interp.overridden_by = None
    interp.overridden_at = None
    db.add(interp)
    await db.flush()

    logger.info("Override removed: update=%s firm=%s by=%s", update_id, user.firm_id, user.id)

    return {
        "data": {
            **_serialize_interp(interp, include_audit=True),
            "message": "Override removed. Reverted to AI's original assessment.",
        }
    }

@router.get("/compliance/interpretation-history")
async def interpretation_history(
    applicability: str = Query(None, description="Filter: yes, no, maybe"),
    acknowledged: str = Query(None, description="Filter: true, false"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Chronological history of all firm-specific regulatory interpretations.

    This is the audit trail proving "we told you about X on date Y".
    Each entry shows:
      - What notice was interpreted
      - When the interpretation was generated (created_at)
      - When it was first delivered/shown to the firm (delivered_at)
      - When someone acknowledged it (acknowledged_at + who)
      - The full interpretation content
    """
    from models.regulatory import RegulatoryUpdate, RegulatoryInterpretation

    query = (
        select(RegulatoryInterpretation)
        .where(
            RegulatoryInterpretation.firm_id == user.firm_id,
            RegulatoryInterpretation.status == "completed",
        )
        .order_by(desc(RegulatoryInterpretation.created_at))
    )

    if applicability:
        query = query.where(RegulatoryInterpretation.applicability == applicability)

    if acknowledged == "true":
        query = query.where(RegulatoryInterpretation.acknowledged_at.isnot(None))
    elif acknowledged == "false":
        query = query.where(RegulatoryInterpretation.acknowledged_at.is_(None))

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    interps = result.scalars().all()

    # Batch-fetch the related regulatory updates for context
    update_ids = list({i.update_id for i in interps})
    update_map = {}
    if update_ids:
        updates_result = await db.execute(
            select(RegulatoryUpdate).where(RegulatoryUpdate.id.in_(update_ids))
        )
        for u in updates_result.scalars().all():
            update_map[u.id] = {
                "id": u.id,
                "source": u.source,
                "source_url": u.source_url,
                "title": u.title,
                "published_date": u.published_date,
                "impact_level": u.impact_level,
                "category": u.category,
            }

    data = []
    for interp in interps:
        entry = _serialize_interp(interp, include_audit=True)
        entry["regulatory_update"] = update_map.get(interp.update_id, {"id": interp.update_id})
        data.append(entry)

    # Summary counts
    total = len(data)
    ack_count = sum(1 for d in data if d.get("acknowledged_at"))
    pending_ack = total - ack_count
    applicable_count = sum(1 for d in data if d.get("applicability") == "yes")

    return {
        "data": data,
        "summary": {
            "total_interpretations": total,
            "acknowledged": ack_count,
            "pending_acknowledgement": pending_ack,
            "applicable_to_firm": applicable_count,
        },
    }

@router.post("/compliance/regulatory-updates/scrape")
async def trigger_scrape(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Manually trigger a regulatory feed scrape (admin/COLP only)."""
    from tasks.regulatory_tasks import poll_all_feeds
    poll_all_feeds.delay()

    return {
        "data": {
            "status": "queued",
            "message": "Regulatory feed scrape has been queued. New updates will appear shortly.",
        }
    }
