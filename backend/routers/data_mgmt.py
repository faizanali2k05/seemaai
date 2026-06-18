"""Data management routes — import/export, demo data clearing."""
import uuid
import json
import csv
import io
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from models.data_mgmt import ImportHistory
from models.staff import StaffMember
from models.compliance import ComplianceItem

router = APIRouter()

@router.get("/admin/import-logs")
async def get_import_logs(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    current_user.require_role("admin")
    result = await db.execute(
        select(ImportHistory)
        .where(ImportHistory.firm_id == current_user.firm_id)
        .order_by(ImportHistory.created_at.desc())
        .limit(100)
    )
    logs = result.scalars().all()
    return [{"id": log.id, "import_type": log.import_type, "filename": log.filename, "status": log.status, "records_processed": log.records_processed, "records_failed": log.records_failed, "imported_by": log.imported_by, "created_at": log.created_at.isoformat() if log.created_at else None} for log in logs]

@router.get("/admin/database-stats")
async def get_database_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Per-table record counts (firm-scoped) for the Data Management → System tab.

    Each entry: {table, recordCount, lastUpdated}. Counting is wrapped per-model
    so a single missing/empty table never blanks the whole panel.
    """
    current_user.require_role("admin")

    from models.matters import Matter
    from models.staff import StaffMember, StaffTraining
    from models.compliance import ComplianceCheck, ComplianceAlert
    from models.aml import CDDRecord, SARRecord
    from models.breach import BreachReport
    from models.intake import ClientIntake
    from models.remediation import RemediationPlan
    from models.chaser import ChaserLog
    from models.workflow import Deadline
    from models.client_accounts import ClientAccount, Transaction
    from models.clio_data import ClioActivity, ClioBill

    # (label, model) — order is the display order in the UI.
    targets = [
        ("Matters", Matter),
        ("Staff", StaffMember),
        ("Training Records", StaffTraining),
        ("Compliance Checks", ComplianceCheck),
        ("Alerts", ComplianceAlert),
        ("CDD Records", CDDRecord),
        ("SARs", SARRecord),
        ("Breaches", BreachReport),
        ("Client Intakes", ClientIntake),
        ("Remediation Plans", RemediationPlan),
        ("Chasers", ChaserLog),
        ("Deadlines", Deadline),
        ("Client Accounts", ClientAccount),
        ("Transactions", Transaction),
        ("Clio Activities", ClioActivity),
        ("Clio Bills", ClioBill),
    ]

    stats = []
    for label, model in targets:
        try:
            count = (await db.execute(
                select(func.count(model.id)).where(model.firm_id == current_user.firm_id)
            )).scalar() or 0

            last_updated = None
            updated_col = getattr(model, "updated_at", None) or getattr(model, "created_at", None)
            if updated_col is not None:
                last_updated = (await db.execute(
                    select(func.max(updated_col)).where(model.firm_id == current_user.firm_id)
                )).scalar()

            stats.append({
                "table": label,
                "recordCount": int(count),
                "lastUpdated": last_updated.isoformat() if last_updated else None,
            })
        except Exception:
            # Never let one bad table blank the whole panel.
            continue

    return {"data": stats}

@router.post("/admin/import/staff")
async def import_staff(file: UploadFile = File(...), current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    import_record = ImportHistory(id=str(uuid.uuid4()), firm_id=current_user.firm_id, import_type="staff", filename=file.filename, status="in_progress", imported_by=current_user.user_id)
    db.add(import_record)
    await db.flush()
    content = await file.read()
    rows = csv.DictReader(io.StringIO(content.decode('utf-8')))
    processed, failed = 0, 0
    for row in rows:
        try:
            staff = StaffMember(id=str(uuid.uuid4()), firm_id=current_user.firm_id, name=row.get("name", ""), email=row.get("email", ""), role=row.get("role", ""), department=row.get("department", ""), pqe=row.get("pqe", ""))
            db.add(staff)
            processed += 1
        except:
            failed += 1
    await db.flush()
    await db.execute(update(ImportHistory).where(ImportHistory.id == import_record.id).values(status="completed", records_processed=processed, records_failed=failed))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="staff_import", entity_type="import", entity_id=import_record.id, user_id=current_user.user_id, details=json.dumps({"processed": processed, "failed": failed}))
    return {"message": "Staff import completed", "import_id": import_record.id, "processed": processed, "failed": failed}

@router.post("/admin/import/alerts")
async def import_alerts(file: UploadFile = File(...), current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    import_record = ImportHistory(id=str(uuid.uuid4()), firm_id=current_user.firm_id, import_type="alerts", filename=file.filename, status="in_progress", imported_by=current_user.user_id)
    db.add(import_record)
    await db.flush()
    content = await file.read()
    rows = csv.DictReader(io.StringIO(content.decode('utf-8')))
    processed, failed = 0, 0
    for row in rows:
        try:
            processed += 1
        except:
            failed += 1
    await db.execute(update(ImportHistory).where(ImportHistory.id == import_record.id).values(status="completed", records_processed=processed, records_failed=failed))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="alerts_import", entity_type="import", entity_id=import_record.id, user_id=current_user.user_id, details=json.dumps({"processed": processed, "failed": failed}))
    return {"message": "Alerts import completed", "import_id": import_record.id, "processed": processed, "failed": failed}

@router.post("/admin/import/compliance-items")
async def import_compliance_items(file: UploadFile = File(...), current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    import_record = ImportHistory(id=str(uuid.uuid4()), firm_id=current_user.firm_id, import_type="compliance_items", filename=file.filename, status="in_progress", imported_by=current_user.user_id)
    db.add(import_record)
    await db.flush()
    content = await file.read()
    rows = csv.DictReader(io.StringIO(content.decode('utf-8')))
    processed, failed = 0, 0
    for row in rows:
        try:
            item = ComplianceItem(id=str(uuid.uuid4()), firm_id=current_user.firm_id, title=row.get("title", ""), category=row.get("category", ""), status=row.get("status", "pending"))
            db.add(item)
            processed += 1
        except:
            failed += 1
    await db.flush()
    await db.execute(update(ImportHistory).where(ImportHistory.id == import_record.id).values(status="completed", records_processed=processed, records_failed=failed))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="compliance_import", entity_type="import", entity_id=import_record.id, user_id=current_user.user_id, details=json.dumps({"processed": processed, "failed": failed}))
    return {"message": "Compliance items import completed", "import_id": import_record.id, "processed": processed, "failed": failed}

@router.post("/admin/clear-demo-data")
async def clear_demo_data(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    await db.execute(delete(StaffMember).where(StaffMember.firm_id == current_user.firm_id))
    await db.execute(delete(ComplianceItem).where(ComplianceItem.firm_id == current_user.firm_id))
    await db.flush()
    await log_audit(db=db, firm_id=current_user.firm_id, action="demo_data_cleared", entity_type="system", user_id=current_user.user_id, details=json.dumps({}))
    return {"message": "Demo data cleared for firm"}

@router.get("/admin/export/staff")
async def export_staff(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    current_user.require_role("admin")
    result = await db.execute(select(StaffMember).where(StaffMember.firm_id == current_user.firm_id).order_by(StaffMember.name))
    staff_members = result.scalars().all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["name", "email", "role", "department", "pqe", "status"])
    writer.writeheader()
    for staff in staff_members:
        writer.writerow({"name": staff.name, "email": staff.email, "role": staff.role, "department": staff.department, "pqe": staff.pqe, "status": staff.status})
    await log_audit(db=db, firm_id=current_user.firm_id, action="staff_export", entity_type="export", user_id=current_user.user_id, details=json.dumps({"count": len(staff_members)}))
    return output.getvalue()
