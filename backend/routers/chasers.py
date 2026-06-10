"""Chasers router — chase communications management."""
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from services.email_service import EmailService
from models.chaser import ChaserLog

logger = logging.getLogger("seema.chasers")

router = APIRouter()

# Pydantic schemas
class ChaserCreate(BaseModel):
    matter_ref: str = ""
    chaser_type: str  # training, review, cdd, supervision
    recipient: str = ""
    recipient_email: str = ""
    subject: str
    body: str = ""

class ChaserEscalate(BaseModel):
    priority: str

class ChaserResend(BaseModel):
    pass

class ChaserAcknowledge(BaseModel):
    response_at: datetime

class BulkChaserRequest(BaseModel):
    chaser_type: str
    recipients: list[dict]  # [{matter_ref, recipient, subject}, ...]

class ChaserResponse(BaseModel):
    id: str
    firm_id: str
    matter_ref: str
    chaser_type: str
    recipient: str
    subject: str
    status: str
    sent_at: datetime | None
    response_at: datetime | None
    attempts: int
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/compliance/chasers")
async def list_chasers(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List all chasers for the firm."""
    stmt = (
        select(ChaserLog)
        .where(ChaserLog.firm_id == current_user.firm_id)
        .order_by(ChaserLog.created_at.desc())
    )

    result = await db.execute(stmt)
    chasers = result.scalars().all()

    return [
        {
            "id": c.id,
            "firm_id": c.firm_id,
            "matter_ref": c.matter_ref,
            "chaser_type": c.chaser_type,
            "recipient": c.recipient,
            "subject": c.subject,
            "status": c.status,
            "sent_at": c.sent_at,
            "response_at": c.response_at,
            "attempts": c.attempts,
            "created_at": c.created_at,
        }
        for c in chasers
    ]

@router.post("/compliance/chasers/send")
async def send_chaser(
    chaser: ChaserCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Send a chase communication."""
    # Use recipient_email if provided, fall back to recipient
    to_email = chaser.recipient_email or chaser.recipient

    # Actually send the email via SendGrid
    email_status = "sent"
    try:
        email_svc = EmailService()
        body_html = chaser.body if chaser.body else f"""
            <h2 style="color:#1a1a2e;">Compliance Reminder</h2>
            <p>This is a reminder regarding: <strong>{chaser.subject}</strong></p>
            <p>Please action this at your earliest convenience. If you have already
            completed this, please update your status in Seema.</p>
            """
        email_svc.send(
            to_email=to_email,
            to_name=to_email.split("@")[0],
            subject=chaser.subject,
            body=body_html,
        )
    except Exception as e:
        logger.error(f"Failed to send chaser email to {to_email}: {e}")
        email_status = "failed"

    new_chaser = ChaserLog(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        matter_ref=chaser.matter_ref,
        chaser_type=chaser.chaser_type,
        recipient=to_email,
        subject=chaser.subject,
        status=email_status,
        sent_at=datetime.utcnow(),
        attempts=1,
    )

    db.add(new_chaser)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="sent",
        entity_type="chaser",
        entity_id=new_chaser.id,
        user_id=current_user.user_id,
        details=f"{chaser.chaser_type} to {chaser.recipient} — {email_status}",
    )

    return {
        "id": new_chaser.id,
        "firm_id": new_chaser.firm_id,
        "matter_ref": new_chaser.matter_ref,
        "chaser_type": new_chaser.chaser_type,
        "recipient": new_chaser.recipient,
        "subject": new_chaser.subject,
        "status": new_chaser.status,
        "sent_at": new_chaser.sent_at,
        "response_at": new_chaser.response_at,
        "attempts": new_chaser.attempts,
        "created_at": new_chaser.created_at,
    }

@router.post("/compliance/chasers/{chaser_id}/escalate")
async def escalate_chaser(
    chaser_id: str,
    data: ChaserEscalate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Escalate a chaser."""
    stmt = (
        update(ChaserLog)
        .where(
            (ChaserLog.id == chaser_id) & (ChaserLog.firm_id == current_user.firm_id)
        )
        .values(status="escalated")
        .returning(ChaserLog)
    )

    result = await db.execute(stmt)
    chaser = result.scalar_one_or_none()

    if not chaser:
        raise HTTPException(status_code=404, detail="Chaser not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="escalated",
        entity_type="chaser",
        entity_id=chaser_id,
        user_id=current_user.user_id,
        details=f"Escalated to {data.priority}",
    )

    return {
        "id": chaser.id,
        "firm_id": chaser.firm_id,
        "matter_ref": chaser.matter_ref,
        "chaser_type": chaser.chaser_type,
        "recipient": chaser.recipient,
        "subject": chaser.subject,
        "status": chaser.status,
        "sent_at": chaser.sent_at,
        "response_at": chaser.response_at,
        "attempts": chaser.attempts,
        "created_at": chaser.created_at,
    }

@router.post("/compliance/chasers/{chaser_id}/resend")
async def resend_chaser(
    chaser_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Resend a chaser."""
    stmt = (
        select(ChaserLog)
        .where(
            (ChaserLog.id == chaser_id) & (ChaserLog.firm_id == current_user.firm_id)
        )
    )

    result = await db.execute(stmt)
    chaser = result.scalar_one_or_none()

    if not chaser:
        raise HTTPException(status_code=404, detail="Chaser not found")

    # Actually resend the email via SendGrid
    resend_status = "sent"
    try:
        email_svc = EmailService()
        email_svc.send(
            to_email=chaser.recipient,
            to_name=chaser.recipient.split("@")[0],
            subject=f"Reminder: {chaser.subject}",
            body=f"""
            <h2 style="color:#1a1a2e;">Follow-Up Reminder</h2>
            <p>This is a follow-up reminder regarding: <strong>{chaser.subject}</strong></p>
            <p><strong>Reference:</strong> {chaser.matter_ref}</p>
            <p>This item still requires your attention. Please action it as soon as possible
            or contact your COLP if you need assistance.</p>
            """,
        )
    except Exception as e:
        logger.error(f"Failed to resend chaser email to {chaser.recipient}: {e}")
        resend_status = "failed"

    # Update chaser
    stmt_update = (
        update(ChaserLog)
        .where(ChaserLog.id == chaser_id)
        .values(
            attempts=chaser.attempts + 1,
            sent_at=datetime.utcnow(),
            status=resend_status,
        )
        .returning(ChaserLog)
    )

    result_update = await db.execute(stmt_update)
    updated_chaser = result_update.scalar_one_or_none()

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="resent",
        entity_type="chaser",
        entity_id=chaser_id,
        user_id=current_user.user_id,
        details=f"Resent (attempt {updated_chaser.attempts}) — {resend_status}",
    )

    return {
        "id": updated_chaser.id,
        "firm_id": updated_chaser.firm_id,
        "matter_ref": updated_chaser.matter_ref,
        "chaser_type": updated_chaser.chaser_type,
        "recipient": updated_chaser.recipient,
        "subject": updated_chaser.subject,
        "status": updated_chaser.status,
        "sent_at": updated_chaser.sent_at,
        "response_at": updated_chaser.response_at,
        "attempts": updated_chaser.attempts,
        "created_at": updated_chaser.created_at,
    }

@router.post("/compliance/chasers/{chaser_id}/acknowledge")
async def acknowledge_chaser(
    chaser_id: str,
    data: ChaserAcknowledge,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Acknowledge a chaser response."""
    stmt = (
        update(ChaserLog)
        .where(
            (ChaserLog.id == chaser_id) & (ChaserLog.firm_id == current_user.firm_id)
        )
        .values(response_at=data.response_at, status="responded")
        .returning(ChaserLog)
    )

    result = await db.execute(stmt)
    chaser = result.scalar_one_or_none()

    if not chaser:
        raise HTTPException(status_code=404, detail="Chaser not found")

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="acknowledged",
        entity_type="chaser",
        entity_id=chaser_id,
        user_id=current_user.user_id,
        details="Response acknowledged",
    )

    return {
        "id": chaser.id,
        "firm_id": chaser.firm_id,
        "matter_ref": chaser.matter_ref,
        "chaser_type": chaser.chaser_type,
        "recipient": chaser.recipient,
        "subject": chaser.subject,
        "status": chaser.status,
        "sent_at": chaser.sent_at,
        "response_at": chaser.response_at,
        "attempts": chaser.attempts,
        "created_at": chaser.created_at,
    }

@router.post("/compliance/briefing/chase-training")
async def bulk_chase_training(
    request: BulkChaserRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Bulk send chasers for training completion."""
    email_svc = EmailService()
    created_chasers = []

    for recipient_info in request.recipients:
        recipient_email = recipient_info.get("recipient", "")
        subject = recipient_info.get("subject", "Training Reminder")
        status = "sent"

        # Send actual email
        if recipient_email:
            try:
                email_svc.send(
                    to_email=recipient_email,
                    to_name=recipient_email.split("@")[0],
                    subject=subject,
                    body=f"""
                    <h2 style="color:#1a1a2e;">Training Reminder</h2>
                    <p>You have overdue training that requires your attention: <strong>{subject}</strong></p>
                    <p>Please complete this as soon as possible. Non-completion may be escalated.</p>
                    """,
                )
            except Exception as e:
                logger.error(f"Bulk chase failed for {recipient_email}: {e}")
                status = "failed"

        new_chaser = ChaserLog(
            id=str(uuid.uuid4()),
            firm_id=current_user.firm_id,
            matter_ref=recipient_info.get("matter_ref", ""),
            chaser_type=request.chaser_type,
            recipient=recipient_email,
            subject=subject,
            status=status,
            sent_at=datetime.utcnow(),
            attempts=1,
        )
        db.add(new_chaser)
        created_chasers.append(new_chaser)

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="sent",
        entity_type="chaser_bulk",
        entity_id="training",
        user_id=current_user.user_id,
        details=f"Bulk training chasers: {len(created_chasers)} sent",
    )

    return {
        "sent": len(created_chasers),
        "chasers": [
            {
                "id": c.id,
                "recipient": c.recipient,
                "status": c.status,
            }
            for c in created_chasers
        ],
    }

@router.post("/compliance/briefing/chase-review")
async def bulk_chase_reviews(
    request: BulkChaserRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Bulk send chasers for file reviews."""
    email_svc = EmailService()
    created_chasers = []

    for recipient_info in request.recipients:
        recipient_email = recipient_info.get("recipient", "")
        subject = recipient_info.get("subject", "File Review Reminder")
        status = "sent"

        # Send actual email
        if recipient_email:
            try:
                email_svc.send(
                    to_email=recipient_email,
                    to_name=recipient_email.split("@")[0],
                    subject=subject,
                    body=f"""
                    <h2 style="color:#1a1a2e;">File Review Reminder</h2>
                    <p>You have an overdue file review: <strong>{subject}</strong></p>
                    <p>Please complete the review at your earliest convenience.</p>
                    """,
                )
            except Exception as e:
                logger.error(f"Bulk chase failed for {recipient_email}: {e}")
                status = "failed"

        new_chaser = ChaserLog(
            id=str(uuid.uuid4()),
            firm_id=current_user.firm_id,
            matter_ref=recipient_info.get("matter_ref", ""),
            chaser_type=request.chaser_type,
            recipient=recipient_email,
            subject=subject,
            status=status,
            sent_at=datetime.utcnow(),
            attempts=1,
        )
        db.add(new_chaser)
        created_chasers.append(new_chaser)

    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="sent",
        entity_type="chaser_bulk",
        entity_id="reviews",
        user_id=current_user.user_id,
        details=f"Bulk review chasers: {len(created_chasers)} sent",
    )

    return {
        "sent": len(created_chasers),
        "chasers": [
            {
                "id": c.id,
                "recipient": c.recipient,
                "status": c.status,
            }
            for c in created_chasers
        ],
    }
