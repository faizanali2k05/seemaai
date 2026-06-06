"""Email admin routes — settings, templates, queue management."""
import uuid
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.email import EmailTemplate, EmailQueueItem
from models.firm import Firm

router = APIRouter()

class EmailSettings(BaseModel):
    sender_email: str
    sender_name: str
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    enable_auto_chase: bool = False
    chase_frequency_days: int = 7
    max_retries: int = 3

class TestEmailRequest(BaseModel):
    recipient: str
    subject: Optional[str] = "Test Email from Seema"

@router.get("/admin/email-settings")
async def get_email_settings(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(Firm).where(Firm.id == current_user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    prefs = {}
    if firm.firm_preferences:
        try:
            prefs = json.loads(firm.firm_preferences)
        except:
            prefs = {}
    email_settings = prefs.get("email_settings", {"sender_email": "", "sender_name": "", "smtp_server": None, "smtp_port": None, "enable_auto_chase": False, "chase_frequency_days": 7, "max_retries": 3})
    return email_settings

@router.post("/admin/email-settings")
async def save_email_settings(settings: EmailSettings, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(Firm).where(Firm.id == current_user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    prefs = {}
    if firm.firm_preferences:
        try:
            prefs = json.loads(firm.firm_preferences)
        except:
            prefs = {}
    prefs["email_settings"] = settings.dict()
    await db.execute(update(Firm).where(Firm.id == current_user.firm_id).values(firm_preferences=json.dumps(prefs), updated_at=datetime.now(timezone.utc)))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="email_settings_updated", entity_type="firm", entity_id=current_user.firm_id, user_id=current_user.user_id, details=json.dumps(settings.dict()))
    return {"message": "Email settings saved", "settings": settings.dict()}

@router.get("/admin/email-templates")
async def list_email_templates(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.firm_id == current_user.firm_id).order_by(EmailTemplate.created_at.desc()))
    templates = result.scalars().all()
    return [{"id": t.id, "name": t.name, "subject": t.subject, "body": t.body, "category": t.category, "is_active": t.is_active, "created_at": t.created_at.isoformat() if t.created_at else None} for t in templates]

@router.get("/admin/email-queue")
async def list_email_queue(status: Optional[str] = None, limit: int = 100, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    query = select(EmailQueueItem).where(EmailQueueItem.firm_id == current_user.firm_id)
    if status:
        query = query.where(EmailQueueItem.status == status)
    query = query.order_by(EmailQueueItem.created_at.desc()).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    return [{"id": item.id, "firm_id": item.firm_id, "recipient": item.recipient, "subject": item.subject, "status": item.status, "sent_at": item.sent_at.isoformat() if item.sent_at else None, "created_at": item.created_at.isoformat() if item.created_at else None} for item in items]

@router.get("/admin/email-queue/stats")
async def email_queue_stats(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    total_result = await db.execute(select(func.count(EmailQueueItem.id)).where(EmailQueueItem.firm_id == current_user.firm_id))
    total = total_result.scalar() or 0
    pending_result = await db.execute(select(func.count(EmailQueueItem.id)).where((EmailQueueItem.firm_id == current_user.firm_id) & (EmailQueueItem.status == "pending")))
    pending = pending_result.scalar() or 0
    sent_result = await db.execute(select(func.count(EmailQueueItem.id)).where((EmailQueueItem.firm_id == current_user.firm_id) & (EmailQueueItem.status == "sent")))
    sent = sent_result.scalar() or 0
    failed_result = await db.execute(select(func.count(EmailQueueItem.id)).where((EmailQueueItem.firm_id == current_user.firm_id) & (EmailQueueItem.status == "failed")))
    failed = failed_result.scalar() or 0
    bounced_result = await db.execute(select(func.count(EmailQueueItem.id)).where((EmailQueueItem.firm_id == current_user.firm_id) & (EmailQueueItem.status == "bounced")))
    bounced = bounced_result.scalar() or 0
    return {"total": total, "pending": pending, "sent": sent, "failed": failed, "bounced": bounced}

@router.post("/admin/email-queue/send-all")
async def send_all_pending(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(EmailQueueItem).where((EmailQueueItem.firm_id == current_user.firm_id) & (EmailQueueItem.status == "pending")))
    pending_items = result.scalars().all()
    sent_count = 0
    for item in pending_items:
        await db.execute(update(EmailQueueItem).where(EmailQueueItem.id == item.id).values(status="sent", sent_at=datetime.now(timezone.utc)))
        sent_count += 1
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="email_batch_send", entity_type="email_queue", user_id=current_user.user_id, details=json.dumps({"count": sent_count}))
    return {"message": f"{sent_count} emails marked as sent"}

@router.post("/admin/email-queue/{item_id}/send")
async def send_single_email(item_id: str, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(EmailQueueItem).where((EmailQueueItem.id == item_id) & (EmailQueueItem.firm_id == current_user.firm_id)))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Email queue item not found")
    await db.execute(update(EmailQueueItem).where(EmailQueueItem.id == item_id).values(status="sent", sent_at=datetime.now(timezone.utc)))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="email_send", entity_type="email_queue", entity_id=item_id, user_id=current_user.user_id, details=json.dumps({"recipient": item.recipient}))
    return {"message": "Email marked as sent", "item_id": item_id}

@router.post("/admin/email/test")
async def send_test_email(request: TestEmailRequest, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    test_email = EmailQueueItem(id=str(uuid.uuid4()), firm_id=current_user.firm_id, recipient=request.recipient, subject=request.subject or "Test Email from Seema", status="pending")
    db.add(test_email)
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="test_email_created", entity_type="email_queue", entity_id=test_email.id, user_id=current_user.user_id, details=json.dumps({"recipient": request.recipient}))
    return {"message": "Test email queued", "item_id": test_email.id, "recipient": request.recipient}

@router.post("/admin/email/auto-chase")
async def trigger_auto_chase(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    sent_count = 0
    await log_audit(db=db, firm_id=current_user.firm_id, action="auto_chase_triggered", entity_type="system", user_id=current_user.user_id, details=json.dumps({"sent_count": sent_count}))
    return {"message": "Auto-chase triggered", "emails_sent": sent_count}
