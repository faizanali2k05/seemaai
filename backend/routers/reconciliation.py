"""Reconciliation router — COFA-owned monthly client-account reconciliation.

Backs the /reconciliation page: persists reconciliation runs, the per-account
three-way figures, the 8-phase progress, the COFA electronic sign-off, and an
AI-drafted SRA Accounts Rules report. Every mutating action is written to the
audit trail. Tenant isolation is enforced by RLS (the table has a firm_id
column, so scripts/apply_rls.py applies the tenant_isolation policy).
"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt
from middleware.auth import get_current_user, CurrentUser
from services.audit_logger import log_audit
from services.ai_analysis import draft_reconciliation_sra_report
from models.client_accounts import Reconciliation
from models.firm import Firm

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────
class AccountLine(BaseModel):
    name: str
    number: str | None = None
    bank: str | None = None
    cashbook: str | None = None
    ledger: str | None = None
    variance: str | None = None
    status: str | None = None
    statusKind: str | None = None


class ReconciliationCreate(BaseModel):
    period_label: str
    period: str | None = "monthly"
    period_start: datetime | None = None
    period_end: datetime | None = None
    accounts: list[AccountLine] | None = None
    client_money_held: float | None = 0
    variance_total: float | None = 0
    open_exceptions: int | None = 0
    aged_residuals: float | None = 0
    notes: str | None = None


class ReconciliationUpdate(BaseModel):
    period_label: str | None = None
    status: str | None = None
    phase: int | None = None
    accounts: list[AccountLine] | None = None
    client_money_held: float | None = None
    variance_total: float | None = None
    open_exceptions: int | None = None
    aged_residuals: float | None = None
    notes: str | None = None


class SignOffRequest(BaseModel):
    signed_off_by: str
    confirm: bool = True


# ── Helpers ────────────────────────────────────────────────────────
def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _serialize(r: Reconciliation) -> dict:
    accounts: list = []
    if r.accounts:
        try:
            accounts = json.loads(r.accounts)
        except (json.JSONDecodeError, TypeError):
            accounts = []
    return {
        "id": r.id,
        "firm_id": r.firm_id,
        "period": r.period,
        "period_label": r.period_label,
        "period_start": r.period_start,
        "period_end": r.period_end,
        "status": r.status,
        "phase": r.phase or 1,
        "client_money_held": _num(r.client_money_held),
        "variance_total": _num(r.variance_total),
        "open_exceptions": r.open_exceptions or 0,
        "aged_residuals": _num(r.aged_residuals),
        "accounts": accounts,
        "notes": r.notes,
        "ai_report": r.ai_report,
        "ai_report_generated_at": r.ai_report_generated_at,
        "reconciled_by": r.reconciled_by,
        "signed_off_by": r.signed_off_by,
        "signed_off_at": r.signed_off_at,
        "completed_at": r.completed_at,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


async def _get_owned(
    db: AsyncSession, reconciliation_id: str, firm_id: str
) -> Reconciliation:
    res = await db.execute(
        select(Reconciliation).where(
            Reconciliation.id == reconciliation_id,
            Reconciliation.firm_id == firm_id,
        )
    )
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return r


# ── Endpoints ──────────────────────────────────────────────────────
@router.get("/compliance/reconciliations")
async def list_reconciliations(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List the firm's reconciliation runs, most recent first."""
    res = await db.execute(
        select(Reconciliation)
        .where(Reconciliation.firm_id == current_user.firm_id)
        .order_by(Reconciliation.created_at.desc())
    )
    return [_serialize(r) for r in res.scalars().all()]


@router.post("/compliance/reconciliations")
async def create_reconciliation(
    payload: ReconciliationCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Start a new reconciliation run for a period."""
    accounts_json = (
        json.dumps([a.model_dump() for a in payload.accounts])
        if payload.accounts is not None
        else None
    )
    r = Reconciliation(
        id=str(uuid.uuid4()),
        firm_id=current_user.firm_id,
        period=payload.period or "monthly",
        period_label=payload.period_label,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status="in_progress",
        phase=1,
        client_money_held=payload.client_money_held or 0,
        variance_total=payload.variance_total or 0,
        open_exceptions=payload.open_exceptions or 0,
        aged_residuals=payload.aged_residuals or 0,
        accounts=accounts_json,
        notes=payload.notes,
    )
    db.add(r)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="created",
        entity_type="reconciliation",
        entity_id=r.id,
        user_id=current_user.user_id,
        details=f"Reconciliation started for {payload.period_label}",
    )
    return _serialize(r)


@router.get("/compliance/reconciliations/{reconciliation_id}")
async def get_reconciliation(
    reconciliation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Fetch a single reconciliation run."""
    r = await _get_owned(db, reconciliation_id, current_user.firm_id)
    return _serialize(r)


@router.patch("/compliance/reconciliations/{reconciliation_id}")
async def update_reconciliation(
    reconciliation_id: str,
    payload: ReconciliationUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update a reconciliation run (advance phase, edit figures/accounts/notes)."""
    r = await _get_owned(db, reconciliation_id, current_user.firm_id)

    if payload.period_label is not None:
        r.period_label = payload.period_label
    if payload.status is not None:
        r.status = payload.status
    if payload.phase is not None:
        r.phase = max(1, min(8, payload.phase))
    if payload.accounts is not None:
        r.accounts = json.dumps([a.model_dump() for a in payload.accounts])
    if payload.client_money_held is not None:
        r.client_money_held = payload.client_money_held
    if payload.variance_total is not None:
        r.variance_total = payload.variance_total
    if payload.open_exceptions is not None:
        r.open_exceptions = payload.open_exceptions
    if payload.aged_residuals is not None:
        r.aged_residuals = payload.aged_residuals
    if payload.notes is not None:
        r.notes = payload.notes

    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="updated",
        entity_type="reconciliation",
        entity_id=r.id,
        user_id=current_user.user_id,
        details=f"Reconciliation updated (phase {r.phase}, status {r.status})",
    )
    # Reload server-side columns (updated_at onupdate) before serializing —
    # plain attribute access on expired columns would trigger lazy IO and a
    # MissingGreenlet error in the async session.
    await db.refresh(r)
    return _serialize(r)


@router.post("/compliance/reconciliations/{reconciliation_id}/sign-off")
async def sign_off_reconciliation(
    reconciliation_id: str,
    payload: SignOffRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Record the COFA electronic sign-off for a reconciliation."""
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Sign-off must be confirmed")

    r = await _get_owned(db, reconciliation_id, current_user.firm_id)
    if _num(r.variance_total) != 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot sign off while a non-zero variance remains (SRA Accounts Rule 8.3).",
        )

    now = datetime.utcnow()
    r.status = "signed_off"
    r.signed_off_by = payload.signed_off_by
    r.signed_off_at = now
    r.completed_at = now
    r.reconciled_by = current_user.user_id
    r.phase = max(r.phase or 1, 7)

    await db.flush()
    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="signed_off",
        entity_type="reconciliation",
        entity_id=r.id,
        user_id=current_user.user_id,
        details=f"COFA sign-off by {payload.signed_off_by} for {r.period_label}",
    )
    await db.refresh(r)
    return _serialize(r)


@router.post("/compliance/reconciliations/{reconciliation_id}/ai-report")
async def generate_reconciliation_report(
    reconciliation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Generate (and persist) an AI-drafted SRA Accounts Rules report for the run."""
    r = await _get_owned(db, reconciliation_id, current_user.firm_id)

    firm_res = await db.execute(select(Firm).where(Firm.id == current_user.firm_id))
    firm = firm_res.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    result = await draft_reconciliation_sra_report(_serialize(r), firm)

    r.ai_report = result.get("content")
    r.ai_report_generated_at = datetime.utcnow()
    await db.flush()

    await log_audit(
        db=db,
        firm_id=current_user.firm_id,
        action="ai_report_generated",
        entity_type="reconciliation",
        entity_id=r.id,
        user_id=current_user.user_id,
        details=(
            f"SRA reconciliation report drafted "
            f"({'AI' if result.get('ai_generated') else 'fallback'}) for {r.period_label}"
        ),
    )
    await db.refresh(r)
    return {"reconciliation": _serialize(r), "report": result}
